/**
 * GameSim — the whole "pure" game simulation behind one facade: clock, weather, customers, quotes,
 * orders, spare parts, shop, decorations, expansion, used market, assistant, daily report, tutorial hooks.
 *
 * No three.js / DOM here. The state is a plain JSON object (`sim.state`) that core/save.ts persists.
 * Player-facing texts are always i18n keys (+ params), never literal strings.
 *
 * Typical frame:   const events = sim.advance(dt, { inRepair, paused });   // react to events
 * End of the day:  'day_end' event (or closeShop()) → show summary → save → sim.startNextDay()
 */
import { RNG } from '../../core/rng';
import {
  TUTORIAL_PHASES,
  absTime,
  createInitialState,
  emptyLedger,
  now,
  type Customer,
  type DayRecord,
  type DaySummary,
  type DecorPlacement,
  type DiagnosisTool,
  type GameState,
  type NewGameOptions,
  type Order,
  type OwnedPhone,
  type ReplacementQuality,
  type Stats,
  type TutorialPhase,
  type UsedListing,
} from '../../core/state';
import { phoneDef } from '../../data/phones';
import {
  atmosphere,
  buyDecor,
  canPlaceDecor,
  decorOffers,
  loadDecorCatalog,
  placeDecor,
  sellDecor,
  storeDecor,
  type PlacementValidator,
} from '../building/decor';
import { buyStage, finishConstruction, hireAssistant, upgradeOffers } from '../building/stages';
import { diagnosisOptions, inspect } from '../customers/diagnosis';
import { arrivalRate, customerLine, generateCustomer, scheduleCharacters } from '../customers/generate';
import { earn, spend, sum } from '../economy/ledger';
import { buyUsed, listForSale, processUsedSales, refreshMarket, salePrice } from '../economy/market';
import {
  addPart,
  buyPart,
  consumePart,
  hasPart,
  modelOf,
  partOffers,
  partsFor,
  processDeliveries,
  refurbishDisplay,
  storageCapacity,
  storageUsed,
} from '../economy/parts';
import { fairPrice, judgeQuote, laborPrice, parseDiagnosis, partNeeds, partsCost } from '../economy/pricing';
import { addPenalty, addReview, computeReputation, healPenalty } from '../economy/reputation';
import { ripoffReview } from '../economy/review';
import { evaluatePhone } from '../repair/evaluate';
import { createPhone } from '../repair/model';
import { RepairSession } from '../repair/session';
import type { Action, ActionResult, PartCategory, RepairContext } from '../repair/types';
import { benchCount, buyTool, rackCapacity, repairContext, startingTools, toolOffers } from '../shop/tools';
import { tickAssistant } from './assistant';
import { flagDeadParts, partsStillNeeded } from './autorepair';
import { BALANCE, at, clamp, roundPrice } from './balance';
import { activeOrders, closeOrders, createOrder, deliverOrder, failOrder, processOrders, rackFree, rackUsed, setReady } from './orders';
import {
  OK,
  err,
  type Catalog,
  type DecorDef,
  type DeliverOutcome,
  type DiagnosisClue,
  type DiagnosisOption,
  type QuoteInfo,
  type QuoteOutcome,
  type Result,
  type SimCtx,
  type SimEvent,
} from './types';

export * from './types';
export { BALANCE, TOOLS, TOOL_BY_ID, CUSTOMER_DATA } from './balance';
export type { PlacementValidator } from '../building/decor';

export interface SimDeps {
  /** decoration catalogue; defaults to src/data/decor.json */
  decor?: DecorDef[];
}

export interface AdvanceOptions {
  /** the player is in the repair view: game time runs at `repairTimeScale` and fatigue builds up */
  inRepair: boolean;
  paused?: boolean;
  /** a quote dialog is open: the customer at the counter does not lose patience */
  talking?: boolean;
}

export interface TimeInfo {
  day: number;
  /** hour of the day, 7..22 */
  time: number;
  /** 0..1 progress through the playable day */
  dayProgress: number;
  /** 0..1 rain intensity */
  rain: number;
  phase: 'open' | 'summary';
  /** false while the tutorial keeps the clock frozen */
  running: boolean;
}

export type JobRef = { type: 'order'; job: Order } | { type: 'owned'; job: OwnedPhone };

export class GameSim {
  private readonly s: GameState;
  private readonly rng: RNG;
  private readonly ctx: SimCtx;
  private pending: SimEvent[] = [];
  private validator: PlacementValidator | null = null;

  private constructor(state: GameState, deps: SimDeps) {
    this.s = state;
    this.rng = new RNG(1);
    this.rng.state = state.rng >>> 0;
    this.ctx = {
      s: state,
      rng: this.rng,
      decor: deps.decor ?? loadDecorCatalog(),
      id: (prefix) => `${prefix}${state.nextId++}`,
    };
  }

  static newGame(opts: NewGameOptions, deps: SimDeps = {}): GameSim {
    const state = createInitialState(opts, {
      money: BALANCE.start.money,
      reputation: BALANCE.start.reputation,
      dayStart: BALANCE.time.dayStart,
    });
    state.tools = startingTools();
    const sim = new GameSim(state, deps);
    sim.s.reputation.value = computeReputation(sim.s);
    sim.s.ledger = emptyLedger(sim.s.reputation.value);
    sim.beginDay();
    return sim;
  }

  /** Wraps a loaded state (already validated / migrated by core/save.ts). The object is used in place. */
  static fromState(state: GameState, deps: SimDeps = {}): GameSim {
    return new GameSim(state, deps);
  }

  /** The live state, JSON-serialisable at any time. Treat it as read-only outside the simulation. */
  get state(): GameState {
    this.s.rng = this.rng.state;
    return this.s;
  }

  /* ================================================================== clock */

  timeInfo(): TimeInfo {
    const t = BALANCE.time;
    return {
      day: this.s.day,
      time: this.s.time,
      dayProgress: clamp((this.s.time - t.dayStart) / (t.dayEnd - t.dayStart), 0, 1),
      rain: this.s.weather.rain,
      phase: this.s.dayPhase,
      running: this.s.dayPhase === 'open' && this.s.tutorial.phase === 'done',
    };
  }

  /**
   * Advances the simulation by `realDt` seconds of real time and returns what happened.
   * One game hour lasts `realSecondsPerHour` (48 s); in the repair view time runs at `repairTimeScale`.
   * The clock stands still while paused, during the tutorial and while the daily report is shown.
   * Events caused by direct method calls since the last frame (e.g. the queue stepping up) are returned too.
   */
  advance(realDt: number, opts: AdvanceOptions): SimEvent[] {
    const events = this.pending;
    this.pending = [];
    const s = this.s;
    if (opts.paused || !(realDt > 0)) return events;
    s.playTime += realDt;
    if (s.dayPhase !== 'open' || s.tutorial.phase !== 'done') return events;
    const t = BALANCE.time;
    let hours = (realDt / t.realSecondsPerHour) * (opts.inRepair ? t.repairTimeScale : 1);
    while (hours > 1e-9 && s.dayPhase === 'open') {
      const step = Math.min(hours, t.maxStepHours, Math.max(0, t.dayEnd - s.time));
      s.time += step;
      hours -= step;
      if (opts.inRepair) {
        s.ledger.repairHours += step;
        for (const o of s.orders) if (o.status === 'in_progress' && !o.byAssistant) o.workHours += step;
      }
      this.tick(step, events, !!opts.talking);
      if (s.time >= t.dayEnd - 1e-9) {
        s.time = t.dayEnd;
        events.push({ type: 'day_end', summary: this.finishDay(events) });
        break;
      }
    }
    this.s.rng = this.rng.state;
    return events;
  }

  private tick(step: number, events: SimEvent[], talking: boolean): void {
    const s = this.s;
    const t = BALANCE.time;
    this.updateWeather(events);
    if (s.boatDay < s.day && s.time >= BALANCE.parts.boatTime) {
      s.boatDay = s.day;
      const parcels = s.deliveries.filter((d) => !d.express && d.arriveAt <= now(s)).reduce((n, d) => n + d.qty, 0);
      events.push({ type: 'supplier_boat', parcels });
    }
    processDeliveries(s, events);
    this.tickArrivals(events);
    this.tickPatience(step, events, talking);
    processOrders(this.ctx, events);
    tickAssistant(this.ctx, step, events);
    processUsedSales(s, events);
    if (!s.warned && s.time >= t.dayEndingWarning) {
      s.warned = true;
      events.push({ type: 'day_ending', hoursLeft: t.dayEnd - s.time });
    }
  }

  private updateWeather(events: SimEvent[]): void {
    const w = this.s.weather;
    const ramp = BALANCE.weather.ramp;
    const time = this.s.time;
    let rain = 0;
    if (w.rainStart >= 0 && time >= w.rainStart && time <= w.rainEnd) {
      rain = clamp(Math.min((time - w.rainStart) / ramp, (w.rainEnd - time) / ramp), 0, 1);
      if (w.rain === 0) events.push({ type: 'rain_start', hours: w.rainEnd - w.rainStart });
      rain = Math.max(rain, 0.01);
    } else if (w.rain > 0) {
      events.push({ type: 'rain_stop' });
    }
    w.rain = rain;
  }

  private scheduleNextArrival(): void {
    const s = this.s;
    const rate = arrivalRate(s, this.atmosphere());
    if (rate <= 0) {
      const from = BALANCE.time.customersFrom;
      const delay = this.rng.range(BALANCE.arrivals.firstArrivalDelay[0]!, BALANCE.arrivals.firstArrivalDelay[1]!);
      s.nextArrivalAt = s.time < from ? absTime(s.day, from + delay) : absTime(s.day + 1, from + delay);
      return;
    }
    s.nextArrivalAt = now(s) + -Math.log(1 - this.rng.next()) / rate;
  }

  private seat(c: Customer, events: SimEvent[]): boolean {
    const s = this.s;
    if (!s.counter) {
      s.counter = c;
      events.push({ type: 'customer_arrived', customer: c, position: 'counter' });
    } else if (s.queue.length < BALANCE.arrivals.maxQueue) {
      s.queue.push(c);
      events.push({ type: 'customer_arrived', customer: c, position: 'queue' });
    } else {
      return false;
    }
    s.ledger.customers++;
    return true;
  }

  private hasRoom(): boolean {
    return !this.s.counter || this.s.queue.length < BALANCE.arrivals.maxQueue;
  }

  private tickArrivals(events: SimEvent[]): void {
    const s = this.s;
    const t = BALANCE.time;
    const open = s.time >= t.customersFrom && s.time <= t.customersUntil;
    while (s.scheduled.length > 0 && s.scheduled[0]!.at <= s.time) {
      const visit = s.scheduled[0]!;
      if (!open || !this.hasRoom()) {
        if (!open) s.scheduled.shift();
        break;
      }
      s.scheduled.shift();
      const c = generateCustomer(this.ctx, { character: visit.character });
      this.seat(c, events);
      events.push({ type: 'character_visit', character: visit.character, customerId: c.id });
    }
    if (now(s) >= s.nextArrivalAt) {
      if (open && this.hasRoom()) this.seat(generateCustomer(this.ctx), events);
      this.scheduleNextArrival();
    }
  }

  private stepUp(events: SimEvent[]): void {
    const s = this.s;
    if (s.counter || s.queue.length === 0) return;
    s.counter = s.queue.shift() as Customer;
    events.push({ type: 'customer_stepped_up', customer: s.counter });
  }

  private tickPatience(step: number, events: SimEvent[], talking: boolean): void {
    const s = this.s;
    const c = s.counter;
    if (c && !c.tutorial && !talking) {
      c.patience -= step;
      if (c.patience <= 0) {
        s.counter = null;
        s.stats.customersLost++;
        events.push({ type: 'customer_left', customerId: c.id, reason: 'impatient', line: customerLine(this.ctx, c, 'impatient') });
      }
    }
    for (let i = s.queue.length - 1; i >= 0; i--) {
      const q = s.queue[i]!;
      q.patience -= step * BALANCE.customers.queuePatienceRate;
      if (q.patience <= 0) {
        s.queue.splice(i, 1);
        s.stats.customersLost++;
        events.push({ type: 'customer_left', customerId: q.id, reason: 'impatient', line: customerLine(this.ctx, q, 'impatient') });
      }
    }
    this.stepUp(events);
  }

  /* ================================================================== customers & quotes */

  customerAtCounter(): Customer | null {
    return this.s.counter;
  }

  queue(): Customer[] {
    return this.s.queue;
  }

  private findCustomer(id: string): Customer | null {
    if (this.s.counter?.id === id) return this.s.counter;
    return this.s.queue.find((q) => q.id === id) ?? null;
  }

  /** Uses a diagnostic instrument on the phone of the customer at the counter. */
  inspect(customerId: string, tool: DiagnosisTool): DiagnosisClue {
    const c = this.findCustomer(customerId);
    if (!c) return { tool, available: false, lines: [], excluded: [], confirmed: null };
    return inspect(this.s, c, tool);
  }

  /** The 3-4 plausible diagnoses, with the marks left by the instruments used so far. */
  diagnosisOptions(customerId: string): DiagnosisOption[] {
    const c = this.findCustomer(customerId);
    return c ? diagnosisOptions(c) : [];
  }

  /** Price breakdown for a diagnosis ("fault" or "faultA+faultB"). */
  quoteInfo(customerId: string, diagnosis: string): QuoteInfo | null {
    const c = this.findCustomer(customerId);
    const faults = parseDiagnosis(diagnosis);
    if (!c || faults.length === 0) return null;
    const p = BALANCE.pricing;
    const fair = fairPrice(c.modelId, faults);
    return {
      fair,
      min: roundPrice(fair * p.sliderMin),
      max: roundPrice(fair * p.sliderMax),
      labor: Math.round(laborPrice(c.modelId, faults)),
      partsCost: partsCost(c.modelId, faults),
      parts: partNeeds(this.s, c.modelId, faults),
      urgency: c.urgency,
      dueAt: c.urgency === 'wait' ? now(this.s) + c.waitHours : c.dueAt,
    };
  }

  private accept(c: Customer, faults: string[], price: number): Order {
    const order = createOrder(this.ctx, c, faults, price);
    this.s.counter = null;
    this.stepUp(this.pending);
    return order;
  }

  private walkOut(c: Customer, reason: 'dismissed' | 'refused', lineType: string | null): void {
    const s = this.s;
    if (s.counter?.id === c.id) s.counter = null;
    else s.queue = s.queue.filter((q) => q.id !== c.id);
    this.pending.push({
      type: 'customer_left',
      customerId: c.id,
      reason,
      line: lineType ? customerLine(this.ctx, c, lineType) : null,
    });
    this.stepUp(this.pending);
  }

  /**
   * Proposes a price for a diagnosis to the customer at the counter.
   * accepted → the order exists and the phone is in the rack; counter → the customer names a price
   * (acceptCounter or propose again); refused → the customer left (possibly with a 1-star review);
   * blocked → nothing happened (`reason` = economy.err.*, e.g. the rack is full).
   */
  proposeQuote(customerId: string, diagnosis: string, price: number): QuoteOutcome {
    const s = this.s;
    const c = s.counter;
    if (!c || c.id !== customerId) return { type: 'blocked', reason: 'economy.err.no_customer' };
    const faults = parseDiagnosis(diagnosis);
    if (faults.length === 0 || !(price > 0)) return { type: 'blocked', reason: 'economy.err.unknown_item' };
    if (rackFree(s) <= 0) return { type: 'blocked', reason: 'economy.err.rack_full' };
    const p = BALANCE.pricing;
    const fair = fairPrice(c.modelId, faults);
    const verdict = judgeQuote(fair, c.budget, price);
    if (verdict === 'accept') {
      const order = this.accept(c, faults, Math.round(price));
      return { type: 'accepted', order, line: customerLine(this.ctx, c, 'accept', { price: order.price }) };
    }
    if (verdict === 'counter' && c.haggles < BALANCE.customers.haggleLimit) {
      c.haggles++;
      if (!c.tutorial) c.patience -= BALANCE.customers.hagglePatienceCost;
      const offer = Math.min(roundPrice(fair * c.budget * this.rng.range(p.counterAt[0]!, p.counterAt[1]!)), Math.floor(fair * c.budget));
      c.counter = { diagnosis, price: Math.max(p.round, offer) };
      return { type: 'counter', price: c.counter.price, line: customerLine(this.ctx, c, 'counter', { price: c.counter.price }) };
    }
    s.stats.customersLost++;
    if (verdict === 'ripoff' && !c.tutorial && this.rng.chance(p.ripoffReviewChance)) {
      const review = ripoffReview(this.ctx, c, c.modelId);
      const reputationDelta = addReview(s, review);
      this.walkOut(c, 'refused', null);
      return { type: 'refused', line: customerLine(this.ctx, c, 'ripoff'), review, reputationDelta };
    }
    this.walkOut(c, 'refused', null);
    return { type: 'refused', line: customerLine(this.ctx, c, 'refuse'), review: null, reputationDelta: 0 };
  }

  /** Accepts the price the customer counter-offered. Null when there is no pending counter-offer or no rack slot. */
  acceptCounter(customerId: string): Order | null {
    const c = this.s.counter;
    if (!c || c.id !== customerId || !c.counter || rackFree(this.s) <= 0) return null;
    return this.accept(c, parseDiagnosis(c.counter.diagnosis), c.counter.price);
  }

  /** Sends a customer away politely (job not feasible, rack full…). No penalty. */
  dismissCustomer(customerId: string): void {
    const c = this.findCustomer(customerId);
    if (!c) return;
    this.walkOut(c, 'dismissed', c.missingTools.length > 0 ? 'no_tools' : null);
  }

  /* ================================================================== orders & repair */

  /** Orders in the shop (queued, on the bench or ready), tutorial wreck included. */
  orders(): Order[] {
    return activeOrders(this.s);
  }

  order(orderId: string): Order | null {
    return this.s.orders.find((o) => o.id === orderId) ?? null;
  }

  rackCapacity(): number {
    return rackCapacity(this.s);
  }

  rackUsed(): number {
    return rackUsed(this.s);
  }

  benchCount(): number {
    return benchCount(this.s);
  }

  /** Finds a repairable job by id: a customer order or an owned (used-market) phone. */
  job(id: string): JobRef | null {
    const order = this.s.orders.find((o) => o.id === id);
    if (order) return { type: 'order', job: order };
    const owned = this.s.owned.find((o) => o.id === id);
    return owned ? { type: 'owned', job: owned } : null;
  }

  private benchesBusy(): number {
    const s = this.s;
    return (
      s.orders.filter((o) => o.kind === 'customer' && o.status === 'in_progress' && !o.byAssistant).length +
      s.owned.filter((o) => o.status === 'in_progress').length
    );
  }

  /** Puts a phone on the bench (orders: queued/ready → in_progress; owned: broken/repaired → in_progress). */
  startRepair(id: string): Result {
    const ref = this.job(id);
    if (!ref) return err('unknown_order');
    if (ref.job.status === 'in_progress') {
      return ref.type === 'order' && ref.job.byAssistant ? err('assistant_busy') : OK;
    }
    if (ref.type === 'order') {
      if (ref.job.status !== 'queued' && ref.job.status !== 'ready') return err('unknown_order');
      if (ref.job.kind === 'customer' && this.benchesBusy() >= benchCount(this.s)) return err('bench_busy');
      ref.job.status = 'in_progress';
      ref.job.byAssistant = false;
      return OK;
    }
    if (ref.job.status === 'listed') return err('already_listed');
    if (this.benchesBusy() >= benchCount(this.s)) return err('bench_busy');
    ref.job.status = 'in_progress';
    return OK;
  }

  /** Takes the phone off the bench as it is (it can stay half-disassembled in the rack). */
  pauseRepair(id: string): Result {
    const ref = this.job(id);
    if (!ref || ref.job.status !== 'in_progress') return err('unknown_order');
    if (ref.type === 'order') {
      if (ref.job.byAssistant) return err('assistant_busy');
      ref.job.status = 'queued';
    } else {
      ref.job.status = 'broken';
    }
    return OK;
  }

  /**
   * Declares the job finished. The phone is judged at delivery, not here: mark it ready only after
   * the final test. `guideUsed: false` earns the "Expert" bonus in the review.
   */
  markReady(id: string, opts: { guideUsed: boolean }): Result {
    const ref = this.job(id);
    if (!ref) return err('unknown_order');
    if (ref.type === 'order') {
      if (ref.job.byAssistant && ref.job.status === 'in_progress') return err('assistant_busy');
      if (ref.job.status !== 'in_progress' && ref.job.status !== 'queued') return err('unknown_order');
      setReady(this.ctx, ref.job, opts.guideUsed);
    } else {
      if (ref.job.status === 'listed') return err('already_listed');
      ref.job.status = 'repaired';
    }
    return OK;
  }

  /** Hands a ready phone to its owner (who must be at the counter): payment, tip, review. */
  deliver(orderId: string): DeliverOutcome {
    return deliverOrder(this.ctx, orderId, this.atmosphere());
  }

  /** Gives the phone back unrepaired ("sorry, I can't fix it"): no payment and a one-star review. */
  abandonOrder(orderId: string): Result {
    const order = this.s.orders.find((o) => o.id === orderId);
    if (!order || order.kind !== 'customer') return err('unknown_order');
    if (order.byAssistant && order.status === 'in_progress') return err('assistant_busy');
    failOrder(this.ctx, order, this.pending);
    return OK;
  }

  /** Tool tiers, mat size and the current slip-up multiplier for the repair engine. */
  repairContext(opts: { tutorial?: boolean } = {}): RepairContext {
    return repairContext(this.s, opts);
  }

  /** Convenience: a repair session on the phone of an order / owned phone, with the current context. */
  createSession(id: string): RepairSession | null {
    const ref = this.job(id);
    if (!ref) return null;
    const tutorial = ref.type === 'order' && ref.job.kind === 'tutorial' ? true : undefined;
    return new RepairSession(modelOf(ref.job.modelId), ref.job.phone, this.repairContext({ tutorial }), this.rng.fork());
  }

  /** Spare categories a job still needs, one entry per part to replace. */
  partsNeeded(id: string): PartCategory[] {
    const ref = this.job(id);
    if (!ref) return [];
    const session = new RepairSession(modelOf(ref.job.modelId), ref.job.phone, this.repairContext(), new RNG(1));
    return partsStillNeeded(session, ref.job.goal);
  }

  /**
   * Swaps a removed component for a spare from the stock room: checks the engine allows it, takes the
   * part from stock, performs the `replace` action and clears the "dead on arrival" marker of the slot.
   */
  replacePart(session: RepairSession, compId: string, quality: ReplacementQuality): ActionResult {
    const action: Action = { t: 'replace', comp: compId, quality };
    const check = session.can(action);
    if (!check.ok) return { ok: false, reason: check.reason, reasonParams: check.params, events: [] };
    const category = session.model.comp(compId).partCategory;
    if (!consumePart(this.s, session.phone.modelId, category, quality)) {
      return { ok: false, reason: 'economy.err.no_part', reasonParams: { part: `@parts.category.${category}` }, events: [] };
    }
    const res = session.perform(action);
    session.phone.flags[`doa_${compId}`] = false;
    return res;
  }

  /**
   * Call after the final test of a job: replaced parts that are dead on arrival get flagged so the
   * guide asks to replace them again. Returns the affected component ids.
   */
  flagDeadParts(id: string): string[] {
    const ref = this.job(id);
    return ref ? flagDeadParts(ref.job.phone) : [];
  }

  hasPart(modelId: string, category: PartCategory, quality: ReplacementQuality): boolean {
    return hasPart(this.s, modelId, category, quality);
  }

  /** Call right before performing a `replace` action; false when the spare is not in stock. */
  consumePart(modelId: string, category: PartCategory, quality: ReplacementQuality): boolean {
    return consumePart(this.s, modelId, category, quality);
  }

  partsFor(modelId: string, category: PartCategory): Record<ReplacementQuality, number> {
    return partsFor(this.s, modelId, category);
  }

  storage(): { used: number; capacity: number } {
    return { used: storageUsed(this.s), capacity: storageCapacity(this.s) };
  }

  /* ================================================================== shop */

  catalog(): Catalog {
    return {
      tools: toolOffers(this.s),
      parts: (modelId: string) => partOffers(this.s, modelId),
      decor: decorOffers(this.ctx),
      upgrades: upgradeOffers(this.s),
    };
  }

  buyTool(toolId: string): Result {
    return buyTool(this.s, toolId);
  }

  buyPart(modelId: string, category: PartCategory, quality: ReplacementQuality, opts: { express: boolean; qty?: number }): Result {
    return buyPart(this.ctx, modelId, category, quality, opts);
  }

  /** Glass separator: recycles a scrapped display of that model into a "good" spare. */
  refurbishDisplay(modelId: string): Result {
    return refurbishDisplay(this.s, modelId);
  }

  scrapDisplays(modelId: string): number {
    return this.s.scrap[modelId] ?? 0;
  }

  /** Buys a decoration into the stock; `uid` identifies the new instance. */
  buyDecor(itemId: string): Result & { uid?: string } {
    return buyDecor(this.ctx, itemId);
  }

  /** Extra placement rules from the 3D layer (walls, bench…), applied by place/move/canPlace. */
  setPlacementValidator(fn: PlacementValidator | null): void {
    this.validator = fn;
  }

  canPlaceDecor(uid: string, place: DecorPlacement): Result {
    return canPlaceDecor(this.ctx, uid, place, this.validator);
  }

  placeDecor(uid: string, place: DecorPlacement): Result {
    return placeDecor(this.ctx, uid, place, this.validator);
  }

  /** Moves or rotates an already placed decoration (same rules as placeDecor). */
  moveDecor(uid: string, place: DecorPlacement): Result {
    return placeDecor(this.ctx, uid, place, this.validator);
  }

  storeDecor(uid: string): Result {
    return storeDecor(this.ctx, uid);
  }

  /** Sells a decoration (placed or stocked) for 50% of its price. */
  sellDecor(uid: string): Result & { refund?: number } {
    return sellDecor(this.ctx, uid);
  }

  atmosphere(): number {
    return atmosphere(this.ctx);
  }

  setCustomization(c: Partial<{ awningColor: string; accentColor: string; shopName: string }>): void {
    const s = this.s;
    const color = /^#[0-9a-fA-F]{6}$/;
    if (c.awningColor && color.test(c.awningColor)) s.customization.awningColor = c.awningColor;
    if (c.accentColor && color.test(c.accentColor)) s.customization.accentColor = c.accentColor;
    if (typeof c.shopName === 'string' && c.shopName.trim().length > 0) s.shopName = c.shopName.trim().slice(0, 24);
  }

  /** Buys the next stage; the building site works overnight (`stage_built` comes from startNextDay). */
  buyStage(): Result {
    return buyStage(this.s);
  }

  hireAssistant(on: boolean): Result {
    return hireAssistant(this.s, on);
  }

  /* ================================================================== used market */

  market(): UsedListing[] {
    return this.s.market.listings;
  }

  buyUsed(listingId: string): Result & { owned?: OwnedPhone } {
    return buyUsed(this.ctx, listingId, rackFree(this.s));
  }

  ownedPhones(): OwnedPhone[] {
    return this.s.owned;
  }

  /** What the phone would be listed for in its current condition. */
  usedSalePrice(ownedId: string): number {
    const o = this.s.owned.find((x) => x.id === ownedId);
    return o ? salePrice(o) : 0;
  }

  listForSale(ownedId: string): Result & { askPrice?: number } {
    return listForSale(this.ctx, ownedId, this.atmosphere());
  }

  /* ================================================================== day */

  canCloseShop(): boolean {
    const s = this.s;
    return s.dayPhase === 'open' && s.tutorial.phase === 'done' && s.time >= BALANCE.time.closeAllowedFrom;
  }

  /** Closes early (allowed after 18:00). Returns null when closing is not possible right now. */
  closeShop(): DaySummary | null {
    if (!this.canCloseShop()) return null;
    return this.finishDay(this.pending);
  }

  private finishDay(events: SimEvent[]): DaySummary {
    const s = this.s;
    const st = BALANCE.stages;
    for (const c of [s.counter, ...s.queue]) {
      if (c) events.push({ type: 'customer_left', customerId: c.id, reason: 'closing', line: null });
    }
    s.counter = null;
    s.queue = [];
    closeOrders(this.ctx, events);
    for (const o of s.orders) if (o.status === 'in_progress' && !o.byAssistant && o.kind === 'customer') o.status = 'queued';
    for (const o of s.owned) if (o.status === 'in_progress') o.status = 'broken';

    const atmo = this.atmosphere();
    const sc = BALANCE.showcase;
    const showcase = at(st.showcase, s.stage - 1);
    if (showcase > 0) {
      const k = (1 + (sc.atmoPer100 * atmo) / 100) * (sc.repBase + sc.repPerStar * s.reputation.value);
      earn(s, 'showcase', roundPrice(showcase * k * this.rng.range(sc.spread[0]!, sc.spread[1]!)));
    }
    spend(s, 'rent', at(st.rent, s.stage - 1));
    spend(s, 'electricity', at(st.electricity, s.stage - 1));
    if (s.assistant.hired) spend(s, 'wages', BALANCE.assistant.wage);

    const income = sum(s.ledger.income) - s.ledger.income.loan;
    const netBeforeLoan = income - sum(s.ledger.expenses);
    if (s.loan.debt > 0 && netBeforeLoan > 0 && s.money > 0) {
      const pay = Math.min(s.loan.debt, Math.round(netBeforeLoan * BALANCE.loan.repayShare), s.money);
      spend(s, 'loan', pay);
      s.loan.debt -= pay;
    }
    let loan = 0;
    let loanLine: DaySummary['loanLine'] = null;
    if (s.money < 0) {
      loan = Math.ceil((-s.money + BALANCE.loan.cushion) / 100) * 100;
      earn(s, 'loan', loan);
      s.loan.debt += loan;
      s.stats.loans++;
      addPenalty(s, BALANCE.reputation.loanPenalty);
      loanLine = { key: `economy.loan.line${this.rng.int(1, 3)}`, params: { amount: loan } };
      events.push({ type: 'loan', amount: loan, line: loanLine });
    }

    const totalExpenses = sum(s.ledger.expenses);
    const net = income - totalExpenses;
    const record: DayRecord = {
      day: s.day,
      income,
      expenses: totalExpenses,
      net,
      money: s.money,
      reputation: Math.round(s.reputation.value * 100) / 100,
      jobs: s.ledger.jobsDone,
    };
    s.history.push(record);
    if (s.history.length > BALANCE.history.maxDays) s.history.splice(0, s.history.length - BALANCE.history.maxDays);
    s.stats.bestDay = Math.max(s.stats.bestDay, net);
    const todays = new Set(s.ledger.reviews);
    const summary: DaySummary = {
      day: s.day,
      income: { ...s.ledger.income },
      expenses: { ...s.ledger.expenses },
      totalIncome: income,
      totalExpenses,
      net,
      moneyEnd: s.money,
      jobsDone: s.ledger.jobsDone,
      jobsFailed: s.ledger.jobsFailed,
      customers: s.ledger.customers,
      reviews: s.reputation.reviews.filter((r) => todays.has(r.id)),
      repStart: s.ledger.repStart,
      repEnd: s.reputation.value,
      loan,
      loanLine,
      series: s.history.slice(-BALANCE.history.seriesDays),
    };
    s.lastSummary = summary;
    s.dayPhase = 'summary';
    s.rng = this.rng.state;
    return summary;
  }

  private beginDay(): void {
    const s = this.s;
    const w = BALANCE.weather;
    if (this.rng.chance(w.rainChance)) {
      const start = this.rng.range(w.rainStart[0]!, w.rainStart[1]!);
      s.weather = { rainStart: start, rainEnd: start + this.rng.range(w.rainHours[0]!, w.rainHours[1]!), rain: 0 };
    } else {
      s.weather = { rainStart: -1, rainEnd: -1, rain: 0 };
    }
    refreshMarket(this.ctx);
    scheduleCharacters(this.ctx);
    this.scheduleNextArrival();
    s.rng = this.rng.state;
  }

  /** After the daily report: night passes, a building site may finish, a new day starts at 07:00. */
  startNextDay(): SimEvent[] {
    const s = this.s;
    const events = this.pending;
    this.pending = [];
    if (s.dayPhase !== 'summary') return events;
    s.day++;
    s.time = BALANCE.time.dayStart;
    s.dayPhase = 'open';
    s.warned = false;
    healPenalty(s);
    finishConstruction(s, events);
    s.ledger = emptyLedger(s.reputation.value);
    this.beginDay();
    events.push({ type: 'day_start', day: s.day });
    return events;
  }

  /* ================================================================== tutorial, encyclopedia, stats */

  /** Hooks for the tutorial script (dialogues live elsewhere). The clock is frozen until phase 'done'. */
  readonly tutorial = {
    phase: (): TutorialPhase => this.s.tutorial.phase,
    active: (): boolean => this.s.tutorial.phase !== 'done',
    /** Moves to the next phase, or to `to`. Reaching 'done' starts the clock. */
    advance: (to?: TutorialPhase): TutorialPhase => {
      const t = this.s.tutorial;
      if (t.phase === 'done') return t.phase;
      const i = TUTORIAL_PHASES.indexOf(t.phase);
      t.phase = to ?? (TUTORIAL_PHASES[i + 1] as TutorialPhase);
      if (t.phase === 'done') this.endTutorial();
      return t.phase;
    },
    /** Skips everything that is left: phase 'done', the clock runs. */
    skip: (): void => {
      const t = this.s.tutorial;
      if (t.phase === 'done') return;
      t.phase = 'done';
      t.skipped = true;
      this.endTutorial();
    },
    /** The old Fone 8 Somchai lets you take apart: goal { teardown: true }, not a customer job. */
    createWreck: (): Order => {
      const s = this.s;
      const existing = s.orders.find((o) => o.kind === 'tutorial');
      if (existing) return existing;
      const def = phoneDef('fone8');
      const id = this.ctx.id('ord');
      const phone = createPhone(def, `ph-${id}`, 0);
      const model = modelOf('fone8');
      if (model.batteryId) phone.comps[model.batteryId]!.health = 0.55;
      for (const c of def.components) {
        if (c.partCategory === 'speaker' || c.partCategory === 'charge_port') phone.comps[c.id]!.dirt = 0.25;
      }
      phone.flags.prevRepair = true;
      const wreck: Order = {
        id,
        kind: 'tutorial',
        persona: { name: 'Somchai', kind: 'local', character: 'somchai', look: 1000, voice: 'somchai', budget: 1, tipMult: 0 },
        modelId: 'fone8',
        phone,
        goal: { replace: [], clean: [], reseat: [], solder: [], teardown: true },
        baseline: evaluatePhone(model, phone),
        targets: [],
        faults: [],
        diagnosed: [],
        misdiagnosed: false,
        price: 0,
        fair: 0,
        urgency: 'wait',
        acceptedAt: now(s),
        dueAt: now(s) + 999,
        pickupAt: null,
        status: 'in_progress',
        customerPresent: false,
        overdueSince: null,
        presentSince: null,
        lateDays: 0,
        readyAt: null,
        guideUsed: true,
        byAssistant: false,
        assistantTried: true,
        workHours: 0,
      };
      s.orders.push(wreck);
      return wreck;
    },
    /** Removes the wreck once the guided reassembly is over. */
    finishWreck: (): void => {
      this.s.orders = this.s.orders.filter((o) => o.kind !== 'tutorial');
    },
    /** The scripted first customer (Fone 8, worn battery) plus the battery Somchai gives you. */
    createFirstCustomer: (): Customer => {
      const s = this.s;
      if (s.counter?.tutorial) return s.counter;
      const c = generateCustomer(this.ctx, { kind: 'tourist', modelId: 'fone8', faults: ['worn_battery'], urgency: 'wait', tutorial: true });
      c.budget = 1.4;
      if (s.counter) s.queue.unshift(s.counter);
      s.counter = c;
      if (!s.tutorial.giftGiven) {
        s.tutorial.giftGiven = true;
        addPart(s, 'fone8', 'battery', 'good', 1);
      }
      return c;
    },
  };

  private endTutorial(): void {
    const s = this.s;
    s.orders = s.orders.filter((o) => o.kind !== 'tutorial');
    for (const o of s.orders) {
      // the scripted customer stops being special once the clock runs
      if (o.dueAt - o.acceptedAt > 100) o.dueAt = now(s) + BALANCE.customers.waitHours[1]!;
    }
    if (s.counter?.tutorial) {
      s.counter.tutorial = false;
      s.counter.waitHours = BALANCE.customers.waitHours[1]!;
    }
    this.scheduleNextArrival();
  }

  /** Records a discovered encyclopedia entry (e.g. "fone8:battery"). True when it is new. */
  unlockEncyclopedia(key: string): boolean {
    if (this.s.encyclopedia.includes(key)) return false;
    this.s.encyclopedia.push(key);
    return true;
  }

  reputation(): number {
    return this.s.reputation.value;
  }

  stats(): Stats & { day: number; playTime: number; reputation: number; reviews: number; atmosphere: number; money: number; debt: number } {
    const s = this.s;
    return {
      ...s.stats,
      day: s.day,
      playTime: s.playTime,
      reputation: s.reputation.value,
      reviews: s.reputation.total,
      atmosphere: this.atmosphere(),
      money: s.money,
      debt: s.loan.debt,
    };
  }
}
