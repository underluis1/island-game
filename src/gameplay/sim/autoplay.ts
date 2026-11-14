/**
 * AutoPlayer — a simple, honest policy that plays the game through the public GameSim API:
 * diagnoses with the instruments it owns, quotes the fair price, orders the spares it needs, repairs
 * with the guide (taking real time per step), delivers, and buys upgrades when it can afford them.
 * Used by the balance simulation test and available to automated playthroughs.
 */
import { RNG } from '../../core/rng';
import type { DaySummary, Order, OwnedPhone } from '../../core/state';
import { missingToolsFor } from '../customers/generate';
import { partPrice } from '../economy/parts';
import type { PartCategory } from '../repair/types';
import { autoRepair, estimateSteps } from './autorepair';
import { BALANCE, at } from './balance';
import type { GameSim } from './index';
import type { SimEvent } from './types';

/** Shopping lists per stage, in priority order (tool id → tier). */
const WISHLIST: Array<Array<[string, number]>> = [
  [['ipa', 1], ['extractor', 1], ['multimeter', 1], ['driver', 2], ['card', 1], ['adhesive', 1], ['battester', 1], ['tweezers', 2], ['rack', 2], ['spudger', 2], ['esd', 1]],
  [['programmer', 1], ['heat', 2], ['mat', 2], ['driver', 3], ['suction', 2], ['rack', 3], ['multimeter', 2], ['ultrasonic', 1], ['shelf', 1], ['tweezers', 3], ['spudger', 3], ['esd', 2], ['lamp', 2], ['chair', 2]],
  [['solder', 1], ['microscope', 1], ['heat', 3], ['fan', 2], ['separator', 1], ['solder', 2], ['adhesive', 2], ['mat', 3], ['chair', 3], ['lights', 2], ['air', 2]],
];

export interface Milestones {
  /**
   * when each milestone was reached, in equivalent real hours of play (a game day = 12 real minutes;
   * time spent in the repair view runs slower, so the wall clock of a real session is a bit longer);
   * null = not yet
   */
  firstUpgrade: number | null;
  stage2: number | null;
  stage3: number | null;
  assistant: number | null;
  /** stage 3 with the micro-soldering bench (iron + microscope) and the assistant at work */
  fullShop: number | null;
}

export interface AutoPlayOptions {
  /** multiplier on the fair price the bot asks (1 = fair) */
  priceFactor?: number;
  /** real seconds per simulation tick */
  tick?: number;
  seed?: number;
  buyUsed?: boolean;
}

export class AutoPlayer {
  readonly milestones: Milestones = { firstUpgrade: null, stage2: null, stage3: null, assistant: null, fullShop: null };
  readonly events: Record<string, number> = {};
  private readonly rng: RNG;
  private readonly priceFactor: number;
  private readonly tick: number;
  private readonly useMarket: boolean;
  /** job on the bench and the real seconds of work left on it */
  private jobId: string | null = null;
  private busy = 0;
  /** jobs the bot cannot finish until it owns a tool: job id → tool id */
  private blocked: Record<string, string> = {};
  private estimates = new Map<string, number>();

  constructor(
    readonly sim: GameSim,
    opts: AutoPlayOptions = {},
  ) {
    this.rng = new RNG(opts.seed ?? 12345);
    this.priceFactor = opts.priceFactor ?? 1;
    this.tick = opts.tick ?? 4;
    this.useMarket = opts.buyUsed ?? true;
    if (sim.tutorial.active()) sim.tutorial.skip();
  }

  private get playTime(): number {
    const s = this.sim.state;
    const t = BALANCE.time;
    const days = s.day - 1 + (s.time - t.dayStart) / (t.dayEnd - t.dayStart);
    return (days * (t.dayEnd - t.dayStart) * t.realSecondsPerHour) / 3600;
  }

  private count(events: SimEvent[]): void {
    for (const e of events) this.events[e.type] = (this.events[e.type] ?? 0) + 1;
  }

  /** Plays until the end of the current day and returns its report. */
  playDay(): DaySummary {
    const sim = this.sim;
    let summary: DaySummary | null = null;
    for (let guard = 0; guard < 100000 && !summary; guard++) {
      this.act();
      const events = sim.advance(this.tick, { inRepair: this.jobId !== null });
      this.count(events);
      if (this.jobId !== null) {
        this.busy -= this.tick;
        if (this.busy <= 0) this.finishJob();
      }
      for (const e of events) {
        if (e.type === 'day_end') summary = e.summary;
        if (e.type === 'order_failed' && e.orderId === this.jobId) this.jobId = null;
      }
    }
    if (!summary) throw new Error('the day did not end');
    this.jobId = null;
    this.busy = 0;
    this.shop();
    this.count(sim.startNextDay());
    return summary;
  }

  private act(): void {
    this.serveCounter();
    this.deliverReady();
    if (this.jobId === null) this.pickJob();
    this.shop();
  }

  /* ------------------------------------------------------------ counter */

  private serveCounter(): void {
    const sim = this.sim;
    const c = sim.customerAtCounter();
    if (!c) return;
    if (c.missingTools.length > 0 || sim.rackUsed() >= sim.rackCapacity()) {
      sim.dismissCustomer(c.id);
      return;
    }
    for (const tool of ['visual', 'multimeter', 'battester', 'psu'] as const) sim.inspect(c.id, tool);
    const options = sim.diagnosisOptions(c.id).filter((o) => o.mark !== 'excluded');
    const feasible = options.filter((o) => missingToolsFor(sim.state, o.faults).length === 0);
    const choice = options.find((o) => o.mark === 'confirmed') ?? (feasible.length > 0 ? this.rng.pick(feasible) : undefined);
    if (!choice || missingToolsFor(sim.state, choice.faults).length > 0) {
      sim.dismissCustomer(c.id);
      return;
    }
    const info = sim.quoteInfo(c.id, choice.id);
    if (!info) return;
    // only take what fits before the deadline, given the jobs already promised
    const needsOrder = info.parts.some((p) => p.inStock === 0);
    const est = this.gameHours(estimateSteps(c.modelId, c.phone, c.goal, sim.repairContext()));
    // rush jobs also compete with whatever is due by tomorrow morning: the bench is not pre-emptive
    const horizon = c.urgency === 'normal' ? info.dueAt : info.dueAt + 14;
    if (this.backlog(horizon) + est > this.workHoursUntil(info.dueAt, needsOrder, c.urgency !== 'normal') * 0.7) {
      sim.dismissCustomer(c.id);
      return;
    }
    const price = Math.round((info.fair * this.priceFactor) / 10) * 10;
    let outcome = sim.proposeQuote(c.id, choice.id, price);
    let order: Order | null = outcome.type === 'accepted' ? outcome.order : null;
    if (outcome.type === 'counter') {
      if (outcome.price >= info.fair * 0.85) order = sim.acceptCounter(c.id);
      else {
        outcome = sim.proposeQuote(c.id, choice.id, info.fair);
        order = outcome.type === 'accepted' ? outcome.order : outcome.type === 'counter' ? sim.acceptCounter(c.id) : null;
      }
    }
    // talking takes time too
    if (this.jobId !== null) this.busy += BALANCE.autoplay.quoteMinutes * 60;
    if (order) this.orderPartsFor(order, order.urgency !== 'normal');
  }

  /** Game hours of bench time for a number of guide steps. */
  private gameHours(steps: number): number {
    const a = BALANCE.autoplay;
    const t = BALANCE.time;
    const real = Math.max(20, steps * a.secondsPerStep * at(a.driverSpeed, this.sim.state.tools.driver ?? 1));
    return (real / t.realSecondsPerHour) * t.repairTimeScale;
  }

  private estimate(job: Order | OwnedPhone): number {
    let h = this.estimates.get(job.id);
    if (h === undefined) {
      h = this.gameHours(estimateSteps(job.modelId, job.phone, job.goal, this.sim.repairContext()));
      this.estimates.set(job.id, h);
    }
    return h;
  }

  /** Bench hours already promised to jobs due no later than `dueAt`. */
  private backlog(dueAt: number): number {
    const t = BALANCE.time;
    let h = this.jobId !== null ? (this.busy / t.realSecondsPerHour) * t.repairTimeScale : 0;
    for (const o of this.sim.orders()) {
      if (o.kind !== 'customer' || o.status === 'ready' || o.byAssistant || o.id === this.jobId) continue;
      if (o.dueAt <= dueAt) h += this.estimate(o);
    }
    return h;
  }

  /** Opening hours left before a deadline, minus the wait for spares that must be ordered. */
  private workHoursUntil(dueAt: number, needsOrder: boolean, express: boolean): number {
    const s = this.sim.state;
    const t = BALANCE.time;
    const nowAbs = (s.day - 1) * 24 + s.time;
    const dueDay = Math.floor(dueAt / 24) + 1;
    const dueHour = dueAt - (dueDay - 1) * 24;
    if (dueDay === s.day) return dueAt - nowAbs - (needsOrder ? BALANCE.parts.expressHours : 0);
    if (needsOrder && !express) return dueHour - BALANCE.parts.boatTime + (dueDay - s.day - 1) * (t.dayEnd - t.dayStart);
    return t.dayEnd - s.time + (dueHour - t.dayStart) + (dueDay - s.day - 1) * (t.dayEnd - t.dayStart);
  }

  private incoming(modelId: string, category: PartCategory): number {
    let n = 0;
    for (const d of this.sim.state.deliveries) if (d.modelId === modelId && d.category === category) n += d.qty;
    return n;
  }

  private stock(modelId: string, category: PartCategory): number {
    const p = this.sim.partsFor(modelId, category);
    return p.cheap + p.good + p.refurb;
  }

  /** Spares needed by all open jobs of this model/category, including the given one. */
  private demand(modelId: string, category: PartCategory): number {
    const sim = this.sim;
    let n = 0;
    const jobs: Array<Order | OwnedPhone> = [...sim.orders().filter((o) => o.kind === 'customer' && o.status !== 'ready'), ...sim.ownedPhones().filter((o) => o.status === 'broken' || o.status === 'in_progress')];
    for (const j of jobs) {
      if (j.modelId === modelId) n += sim.partsNeeded(j.id).filter((c) => c === category).length;
    }
    return n;
  }

  private orderPartsFor(job: Order | OwnedPhone, urgent: boolean): void {
    const sim = this.sim;
    for (const category of new Set(sim.partsNeeded(job.id))) {
      const short = this.demand(job.modelId, category) - this.stock(job.modelId, category) - this.incoming(job.modelId, category);
      for (let i = 0; i < short; i++) {
        const res = sim.buyPart(job.modelId, category, 'good', { express: urgent });
        if (!res.ok) sim.buyPart(job.modelId, category, 'cheap', { express: urgent });
      }
    }
  }

  /* ------------------------------------------------------------ bench */

  private deliverReady(): void {
    const sim = this.sim;
    for (const o of sim.orders()) {
      if (o.status === 'ready' && o.customerPresent) sim.deliver(o.id);
    }
  }

  private workable(job: Order | OwnedPhone): boolean {
    const sim = this.sim;
    if (missingToolsFor(sim.state, job.faults).length > 0) return false;
    const lacking = this.blocked[job.id];
    if (lacking && (sim.state.tools[lacking] ?? 0) < 1) return false;
    const need: Record<string, number> = {};
    for (const c of sim.partsNeeded(job.id)) need[c] = (need[c] ?? 0) + 1;
    return Object.entries(need).every(([c, n]) => this.stock(job.modelId, c as PartCategory) >= n);
  }

  private pickJob(): void {
    const sim = this.sim;
    if (sim.timeInfo().phase !== 'open') return;
    const orders = sim
      .orders()
      .filter((o) => o.kind === 'customer' && o.status === 'queued' && !o.byAssistant)
      .sort((a, b) => a.dueAt - b.dueAt);
    let job: Order | OwnedPhone | undefined = orders.find((o) => this.workable(o));
    if (!job) job = sim.ownedPhones().find((o) => o.status === 'broken' && this.workable(o));
    if (!job) {
      // nothing workable: make sure the spares are on their way
      for (const o of orders) this.orderPartsFor(o, o.urgency !== 'normal');
      for (const o of sim.ownedPhones()) if (o.status === 'broken') this.orderPartsFor(o, false);
      return;
    }
    if (!sim.startRepair(job.id).ok) return;
    const t = BALANCE.time;
    this.estimates.delete(job.id);
    this.jobId = job.id;
    this.busy = (this.estimate(job) * t.realSecondsPerHour) / t.repairTimeScale;
    this.estimates.delete(job.id);
  }

  private finishJob(): void {
    const sim = this.sim;
    const id = this.jobId;
    this.jobId = null;
    this.busy = 0;
    if (!id) return;
    const ref = sim.job(id);
    const session = sim.createSession(id);
    if (!ref || !session || ref.job.status !== 'in_progress') return;
    const res = autoRepair(sim.state, session, ref.job.goal);
    if (!res.done) {
      sim.pauseRepair(id);
      if (res.needTool) this.blocked[id] = res.needTool;
      this.orderPartsFor(ref.job, true);
      return;
    }
    sim.markReady(id, { guideUsed: true });
    if (ref.type === 'owned') sim.listForSale(id);
  }

  /* ------------------------------------------------------------ shopping */

  private shop(): void {
    const sim = this.sim;
    const s = sim.state;
    const reserve = BALANCE.autoplay.reserve * s.stage;
    const offers = sim.catalog();
    const wishes = WISHLIST[s.stage - 1] ?? [];
    for (const tool of new Set(Object.values(this.blocked))) {
      if ((s.tools[tool] ?? 0) < 1) sim.buyTool(tool);
    }
    let essentialsDone = true;
    for (const [id, tier] of wishes) {
      if ((s.tools[id] ?? 0) >= tier) continue;
      const offer = offers.tools.find((t) => t.id === id);
      if (!offer || offer.nextTier === null) continue;
      if (s.stage < offer.minStage) continue;
      essentialsDone = false;
      if (s.reputation.value < offer.minReputation) continue;
      if (s.money - offer.price < reserve) break;
      if (sim.buyTool(id).ok) {
        if (offer.price >= BALANCE.autoplay.significantUpgrade) this.milestones.firstUpgrade ??= this.playTime;
        return;
      }
    }
    const stage = offers.upgrades.find((u) => (u.id === 'stage2' || u.id === 'stage3') && !u.owned);
    if (stage && (essentialsDone || s.money > stage.price * 1.25) && s.reputation.value >= stage.minReputation && s.money - stage.price >= reserve) {
      if (sim.buyStage().ok) {
        if (stage.id === 'stage2') this.milestones.stage2 = this.playTime;
        else this.milestones.stage3 = this.playTime;
      }
    }
    if (s.stage >= 3 && !s.assistant.hired && s.money > 8000 && sim.hireAssistant(true).ok) this.milestones.assistant = this.playTime;
    if (this.milestones.fullShop === null && s.assistant.hired && (s.tools.solder ?? 0) >= 1 && (s.tools.microscope ?? 0) >= 1) {
      this.milestones.fullShop = this.playTime;
    }
    if (this.useMarket && s.dayPhase === 'open' && sim.rackCapacity() - sim.rackUsed() >= 2 && sim.ownedPhones().filter((o) => o.status !== 'listed').length < 1) {
      const pick = sim.market().find((l) => missingToolsFor(s, l.faults).length === 0 && s.money - l.price >= reserve * 3);
      if (pick) {
        const res = sim.buyUsed(pick.id);
        if (res.ok && res.owned) this.orderPartsFor(res.owned, false);
      }
    }
    this.restock(reserve);
  }

  /** Keeps one battery and one display of the common models on the shelf when cash allows. */
  private restock(reserve: number): void {
    const sim = this.sim;
    const s = sim.state;
    if (s.dayPhase !== 'summary') return;
    for (const modelId of Object.keys(s.stats.byModel)) {
      for (const category of ['battery', 'display', 'charge_port'] as const) {
        if (this.stock(modelId, category) + this.incoming(modelId, category) > 0) continue;
        if (s.money - partPrice(modelId, category, 'good') * 3 < reserve) continue;
        sim.buyPart(modelId, category, 'good', { express: false });
      }
    }
  }
}
