/** Tool catalogue, purchases and the RepairContext the repair engine reads tool tiers from. */
import type { GameState } from '../../core/state';
import type { RepairContext } from '../repair/types';
import { canAfford, spend } from '../economy/ledger';
import { BALANCE, TOOLS, TOOL_BY_ID, at, clamp, type ToolDef, type ToolTierDef } from '../sim/balance';
import { OK, err, type Result, type ToolOffer } from '../sim/types';

export function startingTools(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TOOLS) out[t.id] = t.start;
  return out;
}

export function toolTier(s: GameState, id: string): number {
  return s.tools[id] ?? 0;
}

function nextTierDef(def: ToolDef, owned: number): ToolTierDef | null {
  return def.tiers.find((t) => t.tier === owned + 1) ?? null;
}

function lockReason(s: GameState, tier: ToolTierDef): string | null {
  if (s.stage < tier.minStage) return 'economy.err.need_stage';
  if (s.reputation.value < tier.minReputation) return 'economy.err.need_reputation';
  if (!canAfford(s, tier.price)) return 'economy.err.no_money';
  return null;
}

export function toolOffers(s: GameState): ToolOffer[] {
  return TOOLS.map((def) => {
    const owned = toolTier(s, def.id);
    const next = nextTierDef(def, owned);
    const maxTier = def.tiers[def.tiers.length - 1]!.tier;
    const locked = next ? lockReason(s, next) : 'economy.err.max_tier';
    return {
      id: def.id,
      category: def.category,
      owned,
      maxTier,
      nextTier: next ? next.tier : null,
      price: next ? next.price : 0,
      minStage: next ? next.minStage : 1,
      minReputation: next ? next.minReputation : 0,
      available: !!next && locked === null,
      locked,
      nameKey: `tools.${def.id}.name`,
      descKey: `tools.${def.id}.desc`,
      effectKey: `tools.${def.id}.effect`,
      tierKey: `tools.${def.id}.t${next ? next.tier : Math.max(1, owned)}`,
    };
  });
}

/** Buys the next tier of a tool. Tools are handed over on the spot. */
export function buyTool(s: GameState, toolId: string): Result {
  const def = TOOL_BY_ID[toolId];
  if (!def) return err('unknown_item');
  const next = nextTierDef(def, toolTier(s, toolId));
  if (!next) return err('max_tier');
  if (s.stage < next.minStage) return err('need_stage', { stage: next.minStage });
  if (s.reputation.value < next.minReputation) return err('need_reputation', { stars: next.minReputation });
  if (!canAfford(s, next.price)) return err('no_money', { price: next.price });
  spend(s, 'tools', next.price);
  s.tools[toolId] = next.tier;
  return OK;
}

/**
 * Slip-up multiplier of the moment:
 *   1 + midday heat (11-15h; halved by the fan, cancelled by the air conditioner)
 *     + evening darkness (after 18:30; -50% with the magnifier lamp, -25% per tier of string lights)
 *     + fatigue (per bench hour beyond the first three; a better chair helps)
 */
export function errorMultiplier(s: GameState): number {
  const c = BALANCE.context;
  let m = 1;
  if (s.time >= c.heatFrom && s.time < c.heatTo) m += c.heatError * at(c.fanFactor, toolTier(s, 'fan'));
  if (s.time >= c.darkFrom) {
    const cut = (toolTier(s, 'lamp') >= 2 ? c.lampReduction : 0) + c.lightsReduction * toolTier(s, 'lights');
    m += c.darkError * clamp(1 - cut, 0, 1);
  }
  const tired = Math.max(0, s.ledger.repairHours - c.fatigueFreeHours) * c.fatiguePerHour;
  m += Math.min(c.fatigueMax, tired) * at(c.chairFactor, toolTier(s, 'chair'));
  return m;
}

export function repairContext(s: GameState, opts: { tutorial?: boolean } = {}): RepairContext {
  const tutorial = opts.tutorial ?? s.tutorial.phase !== 'done';
  return {
    tools: { ...s.tools },
    matCells: at(BALANCE.context.matCells, toolTier(s, 'mat')),
    strict: tutorial,
    errorMult: tutorial ? 1 : errorMultiplier(s),
  };
}

export function rackCapacity(s: GameState): number {
  return at(BALANCE.rack.capacity, toolTier(s, 'rack')) + at(BALANCE.rack.stageBonus, s.stage - 1);
}

export function benchCount(s: GameState): number {
  return at(BALANCE.rack.benches, s.stage - 1);
}
