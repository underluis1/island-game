/**
 * The assistant (stage 3): takes simple queued orders, works on them for a while and finishes them
 * with the guide, using spares from the stock room. Never micro-solders, a bit clumsier than the guide.
 */
import { now, type GameState, type Order } from '../../core/state';
import { missingToolsFor } from '../customers/generate';
import { modelOf } from '../economy/parts';
import { FAULT_BY_ID } from '../repair/faults';
import { RepairSession } from '../repair/session';
import { repairContext } from '../shop/tools';
import { autoRepair, estimateSteps, partsAvailable } from './autorepair';
import { BALANCE } from './balance';
import { setReady } from './orders';
import type { SimCtx, SimEvent } from './types';

function eligible(s: GameState, o: Order): boolean {
  if (o.kind !== 'customer' || o.status !== 'queued' || o.assistantTried) return false;
  if (o.goal.solder.length > 0 || o.goal.teardown) return false;
  if (o.faults.some((f) => (FAULT_BY_ID[f]?.labor ?? 0) > BALANCE.assistant.maxLabor)) return false;
  if (missingToolsFor(s, o.faults).length > 0) return false;
  return partsAvailable(s, o.modelId, o.phone, o.goal, repairContext(s, { tutorial: false }));
}

export function tickAssistant(ctx: SimCtx, dtHours: number, events: SimEvent[]): void {
  const s = ctx.s;
  const a = s.assistant;
  if (!a.hired || s.stage < 3) return;
  if (a.orderId === null) {
    const next = s.orders.filter((o) => eligible(s, o)).sort((x, y) => x.dueAt - y.dueAt)[0];
    if (!next) return;
    const steps = estimateSteps(next.modelId, next.phone, next.goal, repairContext(s, { tutorial: false }));
    a.orderId = next.id;
    a.remaining = BALANCE.assistant.baseHours + steps * BALANCE.assistant.hoursPerStep;
    next.status = 'in_progress';
    next.byAssistant = true;
    events.push({ type: 'assistant_started', orderId: next.id, hours: a.remaining });
    return;
  }
  const order = s.orders.find((o) => o.id === a.orderId);
  if (!order || order.status !== 'in_progress') {
    a.orderId = null;
    a.remaining = 0;
    return;
  }
  a.remaining -= dtHours;
  order.workHours += dtHours;
  if (a.remaining > 0) return;
  const rc = repairContext(s, { tutorial: false });
  rc.errorMult *= BALANCE.assistant.errorMult;
  const session = new RepairSession(modelOf(order.modelId), order.phone, rc, ctx.rng.fork());
  const res = autoRepair(s, session, order.goal);
  a.orderId = null;
  a.remaining = 0;
  if (res.done) {
    setReady(ctx, order, true);
    order.readyAt = now(s);
  } else {
    order.status = 'queued';
    order.byAssistant = false;
    order.assistantTried = true;
  }
  events.push({ type: 'assistant_done', orderId: order.id, success: res.done });
}
