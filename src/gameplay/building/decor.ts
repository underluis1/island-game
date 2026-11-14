/**
 * Decorations (logic only): buy → stock → place / move / rotate / store / sell at 50%.
 *
 * atmosphere = Σ over placed items of item.atmosphere × falloff^k (k = 0 for the first copy of an item,
 *              1 for the second…) + stage bonus + string lights; above `softCap` only a quarter counts.
 */
import decorJson from '../../data/decor.json';
import type { DecorInstance, DecorPlacement, GameState } from '../../core/state';
import { canAfford, earn, spend } from '../economy/ledger';
import { toolTier } from '../shop/tools';
import { BALANCE, at } from '../sim/balance';
import { OK, err, type DecorDef, type DecorOffer, type Result, type SimCtx } from '../sim/types';

/** Extra geometric constraints supplied by the 3D layer (walls, bench, building footprint). */
export type PlacementValidator = (item: DecorDef, at: DecorPlacement, state: GameState) => boolean;

function isDecorDef(v: unknown): v is DecorDef {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return typeof d.id === 'string' && typeof d.price === 'number' && typeof d.atmosphere === 'number';
}

/** Catalogue from src/data/decor.json; malformed or missing entries are skipped. */
export function loadDecorCatalog(raw: unknown = decorJson): DecorDef[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter(isDecorDef).map((d) => ({
    ...d,
    nameKey: d.nameKey ?? `decor.${d.id}.name`,
    descKey: d.descKey ?? `decor.${d.id}.desc`,
    category: d.category ?? 'misc',
    placement: d.placement ?? 'ground',
    footprint: Array.isArray(d.footprint) && d.footprint.length === 2 ? d.footprint : [1, 1],
    stageMin: d.stageMin ?? 1,
  }));
}

function defOf(ctx: SimCtx, itemId: string): DecorDef | undefined {
  return ctx.decor.find((d) => d.id === itemId);
}

export function atmosphere(ctx: SimCtx): number {
  const b = BALANCE.decor;
  const s = ctx.s;
  const copies: Record<string, number> = {};
  let total = 0;
  for (const inst of s.decor) {
    if (!inst.placed) continue;
    const def = defOf(ctx, inst.itemId);
    if (!def) continue;
    const k = copies[inst.itemId] ?? 0;
    copies[inst.itemId] = k + 1;
    total += def.atmosphere * Math.pow(b.duplicateFalloff, k);
  }
  total += at(BALANCE.stages.atmosphere, s.stage - 1) + at(b.lightsAtmosphere, toolTier(s, 'lights'));
  if (total > b.softCap) total = b.softCap + (total - b.softCap) * 0.25;
  return Math.round(total * 10) / 10;
}

export function decorOffers(ctx: SimCtx): DecorOffer[] {
  const s = ctx.s;
  return ctx.decor.map((d) => {
    const locked = s.stage < d.stageMin ? 'economy.err.need_stage' : !canAfford(s, d.price) ? 'economy.err.no_money' : null;
    return { ...d, owned: s.decor.filter((i) => i.itemId === d.id).length, available: locked === null, locked };
  });
}

export function buyDecor(ctx: SimCtx, itemId: string): Result & { uid?: string } {
  const s = ctx.s;
  const def = defOf(ctx, itemId);
  if (!def) return err('unknown_item');
  if (s.stage < def.stageMin) return err('need_stage', { stage: def.stageMin });
  if (!canAfford(s, def.price)) return err('no_money', { price: def.price });
  spend(s, 'decor', def.price);
  const uid = ctx.id('dec');
  s.decor.push({ uid, itemId, placed: null });
  return { ok: true, uid };
}

function extent(def: DecorDef, rot: number): [number, number] {
  return rot % 2 === 0 ? [def.footprint[0], def.footprint[1]] : [def.footprint[1], def.footprint[0]];
}

/** Can the item go there? Same-surface items must not overlap; the validator adds building constraints. */
export function canPlaceDecor(ctx: SimCtx, uid: string, place: DecorPlacement, validator: PlacementValidator | null): Result {
  const inst = ctx.s.decor.find((d) => d.uid === uid);
  if (!inst) return err('unknown_item');
  const def = defOf(ctx, inst.itemId);
  if (!def) return err('unknown_item');
  if (![place.x, place.z, place.rot].every((v) => Number.isFinite(v))) return err('bad_position');
  const [w, d] = extent(def, place.rot);
  for (const other of ctx.s.decor) {
    if (other.uid === uid || !other.placed) continue;
    const od = defOf(ctx, other.itemId);
    if (!od || od.placement !== def.placement) continue;
    const [ow, odp] = extent(od, other.placed.rot);
    const overlapX = Math.abs(place.x - other.placed.x) < (w + ow) / 2 - 1e-6;
    const overlapZ = Math.abs(place.z - other.placed.z) < (d + odp) / 2 - 1e-6;
    if (overlapX && overlapZ) return err('spot_taken');
  }
  if (validator && !validator(def, place, ctx.s)) return err('bad_position');
  return OK;
}

/** Places a stocked item or moves / rotates a placed one. */
export function placeDecor(ctx: SimCtx, uid: string, place: DecorPlacement, validator: PlacementValidator | null): Result {
  const check = canPlaceDecor(ctx, uid, place, validator);
  if (!check.ok) return check;
  const inst = ctx.s.decor.find((d) => d.uid === uid) as DecorInstance;
  inst.placed = { x: place.x, z: place.z, rot: ((Math.round(place.rot) % 4) + 4) % 4 };
  return OK;
}

export function storeDecor(ctx: SimCtx, uid: string): Result {
  const inst = ctx.s.decor.find((d) => d.uid === uid);
  if (!inst) return err('unknown_item');
  inst.placed = null;
  return OK;
}

export function sellDecor(ctx: SimCtx, uid: string): Result & { refund?: number } {
  const s = ctx.s;
  const idx = s.decor.findIndex((d) => d.uid === uid);
  if (idx < 0) return err('unknown_item');
  const def = defOf(ctx, s.decor[idx]!.itemId);
  const refund = def ? Math.floor(def.price * BALANCE.decor.sellback) : 0;
  s.decor.splice(idx, 1);
  earn(s, 'decor', refund);
  return { ok: true, refund };
}
