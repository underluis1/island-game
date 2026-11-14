/** Shop expansion: stall (1) → kiosk (2) → shop (3). Buying starts a night-time building site. */
import type { GameState, Stage } from '../../core/state';
import { canAfford, spend } from '../economy/ledger';
import { BALANCE, at } from '../sim/balance';
import { OK, err, type Result, type SimEvent, type UpgradeOffer } from '../sim/types';

export function nextStage(s: GameState): Stage | null {
  if (s.construction !== 0 || s.stage >= 3) return null;
  return (s.stage + 1) as Stage;
}

export function stagePrice(stage: number): number {
  return at(BALANCE.stages.price, stage - 1);
}

export function stageMinReputation(stage: number): number {
  return at(BALANCE.stages.minReputation, stage - 1);
}

function stageLock(s: GameState, target: number): string | null {
  if (s.construction !== 0) return 'economy.err.under_construction';
  if (s.stage + 1 !== target) return s.stage >= target ? 'economy.err.already_owned' : 'economy.err.need_stage';
  if (s.reputation.value < stageMinReputation(target)) return 'economy.err.need_reputation';
  if (!canAfford(s, stagePrice(target))) return 'economy.err.no_money';
  return null;
}

export function upgradeOffers(s: GameState): UpgradeOffer[] {
  const out: UpgradeOffer[] = [];
  for (const target of [2, 3] as const) {
    const locked = stageLock(s, target);
    out.push({
      id: target === 2 ? 'stage2' : 'stage3',
      nameKey: `economy.upgrade.stage${target}.name`,
      descKey: `economy.upgrade.stage${target}.desc`,
      price: stagePrice(target),
      minReputation: stageMinReputation(target),
      owned: s.stage >= target || s.construction === target,
      available: locked === null,
      locked,
    });
  }
  out.push({
    id: 'assistant',
    nameKey: 'economy.upgrade.assistant.name',
    descKey: 'economy.upgrade.assistant.desc',
    price: BALANCE.assistant.wage,
    minReputation: stageMinReputation(3),
    owned: s.assistant.hired,
    available: s.stage >= 3,
    locked: s.stage >= 3 ? null : 'economy.err.need_stage',
  });
  return out;
}

/** Pays for the next stage; the builders work overnight and it opens tomorrow morning. */
export function buyStage(s: GameState): Result {
  const target = s.stage + 1;
  if (s.stage >= 3) return err('already_owned');
  if (s.construction !== 0) return err('under_construction');
  if (s.reputation.value < stageMinReputation(target)) return err('need_reputation', { stars: stageMinReputation(target) });
  if (!canAfford(s, stagePrice(target))) return err('no_money', { price: stagePrice(target) });
  spend(s, 'stage', stagePrice(target));
  s.construction = target as 2 | 3;
  return OK;
}

/** Morning after: the new building is ready. Decorations go back to stock because the floor plan changed. */
export function finishConstruction(s: GameState, events: SimEvent[]): void {
  if (s.construction === 0) return;
  s.stage = s.construction;
  s.construction = 0;
  for (const d of s.decor) d.placed = null;
  events.push({ type: 'stage_built', stage: s.stage });
}

export function hireAssistant(s: GameState, on: boolean): Result {
  if (s.stage < 3) return err('need_stage', { stage: 3 });
  s.assistant.hired = on;
  if (!on && s.assistant.orderId) {
    const order = s.orders.find((o) => o.id === s.assistant.orderId);
    if (order && order.status === 'in_progress') {
      order.status = 'queued';
      order.byAssistant = false;
    }
    s.assistant.orderId = null;
    s.assistant.remaining = 0;
  }
  return OK;
}
