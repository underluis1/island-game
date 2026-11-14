/** Order lifecycle: acceptance, deadlines, pickups, delivery and failures. */
import { absTime, now, type Customer, type GameState, type Order, type Persona } from '../../core/state';
import { customerLine } from '../customers/generate';
import { earn } from '../economy/ledger';
import { modelOf } from '../economy/parts';
import { diagnosisId, fairPrice } from '../economy/pricing';
import { addReview } from '../economy/reputation';
import { assessOrder, failedReview, tipFor, writeReview } from '../economy/review';
import { brokenFunctions, evaluatePhone } from '../repair/evaluate';
import { idealReport } from './autorepair';
import { rackCapacity } from '../shop/tools';
import { BALANCE } from './balance';
import type { DeliverOutcome, SimCtx, SimEvent } from './types';

const ACTIVE = new Set(['queued', 'in_progress', 'ready']);

export function activeOrders(s: GameState): Order[] {
  return s.orders.filter((o) => ACTIVE.has(o.status));
}

/** Rack slots in use: customer orders plus owned phones that are not in the shop window. */
export function rackUsed(s: GameState): number {
  return s.orders.filter((o) => o.kind === 'customer' && ACTIVE.has(o.status)).length + s.owned.filter((o) => o.status !== 'listed').length;
}

export function rackFree(s: GameState): number {
  return rackCapacity(s) - rackUsed(s);
}

export function personaOf(c: Customer): Persona {
  return { name: c.name, kind: c.kind, character: c.character, look: c.look, voice: c.voice, budget: c.budget, tipMult: c.tipMult };
}

export function createOrder(ctx: SimCtx, c: Customer, diagnosed: string[], price: number): Order {
  const s = ctx.s;
  const t = now(s);
  const waiting = c.urgency === 'wait';
  const dueAt = waiting ? t + c.waitHours : c.dueAt;
  const baseline = evaluatePhone(modelOf(c.modelId), c.phone);
  const broken = brokenFunctions(baseline);
  const ideal = idealReport(c.modelId, c.phone, c.goal);
  const fixable = ideal ? broken.filter((fn) => ideal.functions[fn] === 'pass') : broken;
  const order: Order = {
    id: ctx.id('ord'),
    kind: 'customer',
    persona: personaOf(c),
    modelId: c.modelId,
    phone: c.phone,
    goal: c.goal,
    baseline,
    targets: fixable.length > 0 ? fixable : broken,
    faults: [...c.faults],
    diagnosed: [...diagnosed],
    misdiagnosed: diagnosisId(diagnosed) !== diagnosisId(c.faults),
    price,
    fair: fairPrice(c.modelId, c.faults),
    urgency: c.urgency,
    acceptedAt: t,
    dueAt,
    pickupAt: waiting ? null : dueAt,
    status: 'queued',
    customerPresent: waiting,
    overdueSince: null,
    presentSince: waiting ? t : null,
    lateDays: 0,
    readyAt: null,
    guideUsed: true,
    byAssistant: false,
    assistantTried: false,
    workHours: 0,
  };
  s.orders.push(order);
  s.stats.customersServed++;
  return order;
}

function tomorrowMorning(ctx: SimCtx): number {
  const c = BALANCE.customers;
  return absTime(ctx.s.day + 1, ctx.rng.range(c.normalPickup[0]!, c.normalPickup[1]!));
}

/** The phone is done: the owner is called and usually shows up well before the deadline. */
export function setReady(ctx: SimCtx, order: Order, guideUsed: boolean): void {
  const s = ctx.s;
  const c = BALANCE.customers;
  order.status = 'ready';
  order.readyAt = now(s);
  order.guideUsed = guideUsed;
  if (!order.customerPresent && order.pickupAt !== null) {
    const callback = now(s) + ctx.rng.range(c.readyCallback[0]!, c.readyCallback[1]!);
    const sameDay = s.time + (callback - now(s)) <= BALANCE.time.customersUntil + 0.5;
    if (callback < order.pickupAt && sameDay) order.pickupAt = callback;
  }
}

function removeOrder(s: GameState, order: Order): void {
  const i = s.orders.indexOf(order);
  if (i >= 0) s.orders.splice(i, 1);
  if (s.assistant.orderId === order.id) {
    s.assistant.orderId = null;
    s.assistant.remaining = 0;
  }
}

export function failOrder(ctx: SimCtx, order: Order, events: SimEvent[]): void {
  const s = ctx.s;
  order.status = 'failed';
  const review = failedReview(ctx, order);
  const reputationDelta = addReview(s, review);
  s.stats.failedOrders++;
  s.ledger.jobsFailed++;
  removeOrder(s, order);
  events.push({ type: 'order_failed', orderId: order.id, review, reputationDelta, line: customerLine(ctx, order.persona, 'angry') });
}

/** Deadlines and people coming back for their phones. */
export function processOrders(ctx: SimCtx, events: SimEvent[]): void {
  const s = ctx.s;
  const c = BALANCE.customers;
  const t = now(s);
  for (const order of activeOrders(s)) {
    if (order.kind !== 'customer') continue;
    const ready = order.status === 'ready';
    if (!order.customerPresent && order.pickupAt !== null && t >= order.pickupAt) {
      order.customerPresent = true;
      order.presentSince = t;
      events.push({ type: 'pickup_arrived', orderId: order.id, ready, line: customerLine(ctx, order.persona, ready ? 'pickup' : 'pickup_late') });
      if (!ready) {
        order.overdueSince = t;
        events.push({ type: 'order_overdue', orderId: order.id, graceHours: c.graceHours[order.urgency] });
      }
      continue;
    }
    if (order.customerPresent && !ready && order.overdueSince === null && t >= order.dueAt) {
      order.overdueSince = t;
      events.push({ type: 'order_overdue', orderId: order.id, graceHours: c.graceHours[order.urgency] });
      continue;
    }
    if (order.customerPresent && !ready && order.overdueSince !== null && t >= order.overdueSince + c.graceHours[order.urgency]) {
      if (order.urgency === 'normal' && order.lateDays < c.maxLateDays) {
        order.lateDays++;
        order.dueAt = tomorrowMorning(ctx);
        order.pickupAt = order.dueAt;
        order.customerPresent = false;
        order.presentSince = null;
        order.overdueSince = null;
        events.push({ type: 'order_postponed', orderId: order.id, dueAt: order.dueAt, line: customerLine(ctx, order.persona, 'postpone') });
      } else {
        failOrder(ctx, order, events);
      }
      continue;
    }
    if (order.customerPresent && ready && order.urgency !== 'wait' && order.presentSince !== null && t >= order.presentSince + c.pickupPatience) {
      // ignored at the counter: goes for a coconut and tries again later
      order.customerPresent = false;
      order.presentSince = null;
      order.pickupAt = s.time + 2 <= BALANCE.time.customersUntil ? t + 2 : tomorrowMorning(ctx);
      events.push({ type: 'pickup_left', orderId: order.id });
    }
  }
}

/** Closing time: people in a hurry whose phone is not ready are lost; the others come back tomorrow. */
export function closeOrders(ctx: SimCtx, events: SimEvent[]): void {
  const s = ctx.s;
  for (const order of activeOrders(s)) {
    if (order.kind !== 'customer') continue;
    if (order.status === 'ready') {
      if (order.customerPresent || order.urgency !== 'normal' || (order.pickupAt !== null && order.pickupAt < absTime(s.day + 1, 0))) {
        order.customerPresent = false;
        order.presentSince = null;
        order.pickupAt = tomorrowMorning(ctx);
      }
      continue;
    }
    if (order.urgency !== 'normal') {
      failOrder(ctx, order, events);
    } else if (order.customerPresent) {
      // was kept waiting past the deadline until closing time
      if (order.lateDays < BALANCE.customers.maxLateDays) {
        order.lateDays++;
        order.dueAt = tomorrowMorning(ctx);
        order.pickupAt = order.dueAt;
        order.customerPresent = false;
        order.presentSince = null;
        order.overdueSince = null;
      } else {
        failOrder(ctx, order, events);
      }
    }
  }
}

/** Hands the phone over: the customer tests it, pays, maybe tips and writes a review. */
export function deliverOrder(ctx: SimCtx, orderId: string, atmosphere: number): DeliverOutcome {
  const s = ctx.s;
  const order = s.orders.find((o) => o.id === orderId);
  if (!order || order.kind !== 'customer') return { ok: false, reason: 'economy.err.unknown_order' };
  if (order.status !== 'ready') return { ok: false, reason: 'economy.err.not_ready' };
  if (!order.customerPresent) return { ok: false, reason: 'economy.err.customer_away' };
  const a = assessOrder(ctx, order, atmosphere);
  const paid = Math.round(order.price * a.payShare);
  const tip = tipFor(ctx, order, a, paid, atmosphere);
  earn(s, 'repairs', paid);
  earn(s, 'tips', tip);
  const review = writeReview(ctx, order, a);
  const reputationDelta = addReview(s, review);
  order.status = 'delivered';
  removeOrder(s, order);
  s.ledger.jobsDone++;
  s.stats.repairs++;
  s.stats.totalTips += tip;
  if (a.stars === 5) s.stats.perfectRepairs++;
  if (a.factors.some((f) => f.factor === 'expert')) s.stats.expertRepairs++;
  s.stats.byModel[order.modelId] = (s.stats.byModel[order.modelId] ?? 0) + 1;
  for (const f of order.faults) s.stats.byFault[f] = (s.stats.byFault[f] ?? 0) + 1;
  const lineType = a.stars >= 4 ? 'thanks' : a.stars <= 2 ? 'angry' : 'meh';
  return {
    ok: true,
    orderId,
    paid,
    tip,
    stars: a.stars,
    satisfaction: a.satisfaction,
    review,
    factors: a.factors,
    reputationDelta,
    line: customerLine(ctx, order.persona, lineType, { price: paid, tip }),
  };
}
