/**
 * Spare parts: catalogue per (model, category, quality), supplier orders and the stock room.
 * price = ComponentDef.value × quality multiplier (the dearest component when a model has two parts
 * of the same category, e.g. the Fone X earpiece assembly and TrueDepth module).
 */
import { PHONE_DEFS, phoneDef } from '../../data/phones';
import { now, partKey, type GameState, type PartDelivery, type ReplacementQuality } from '../../core/state';
import { PhoneModel } from '../repair/model';
import { DEFECT_RATE } from '../repair/session';
import type { PartCategory } from '../repair/types';
import { BALANCE, at, roundPrice } from '../sim/balance';
import { OK, err, type PartOffer, type Result, type SimCtx, type SimEvent } from '../sim/types';
import { canAfford, spend } from './ledger';
import { toolTier } from '../shop/tools';

export const QUALITIES: ReplacementQuality[] = ['cheap', 'good', 'refurb'];

const models = new Map<string, PhoneModel>();

export function modelOf(modelId: string): PhoneModel {
  let m = models.get(modelId);
  if (!m) {
    m = new PhoneModel(phoneDef(modelId));
    models.set(modelId, m);
  }
  return m;
}

/** Base ("good") price of a spare, 0 when the model has no such purchasable part. */
export function partBaseValue(modelId: string, category: PartCategory): number {
  const def = PHONE_DEFS[modelId];
  if (!def) return 0;
  let v = 0;
  for (const c of def.components) {
    if (c.partCategory === category && c.removable !== false) v = Math.max(v, c.value);
  }
  return v;
}

export function purchasableCategories(modelId: string): PartCategory[] {
  const def = PHONE_DEFS[modelId];
  if (!def) return [];
  const out: PartCategory[] = [];
  for (const c of def.components) {
    if (c.value > 0 && c.removable !== false && !out.includes(c.partCategory)) out.push(c.partCategory);
  }
  return out;
}

export function partPrice(modelId: string, category: PartCategory, quality: ReplacementQuality): number {
  return roundPrice(partBaseValue(modelId, category) * BALANCE.parts.qualityMult[quality]);
}

export function expressPrice(modelId: string, category: PartCategory, quality: ReplacementQuality): number {
  return roundPrice(partPrice(modelId, category, quality) * BALANCE.parts.expressMult + BALANCE.parts.expressFee);
}

export function stockOf(s: GameState, modelId: string, category: PartCategory, quality: ReplacementQuality): number {
  return s.parts[partKey(modelId, category, quality)] ?? 0;
}

export function partsFor(s: GameState, modelId: string, category: PartCategory): Record<ReplacementQuality, number> {
  return {
    cheap: stockOf(s, modelId, category, 'cheap'),
    good: stockOf(s, modelId, category, 'good'),
    refurb: stockOf(s, modelId, category, 'refurb'),
  };
}

export function hasPart(s: GameState, modelId: string, category: PartCategory, quality: ReplacementQuality): boolean {
  return stockOf(s, modelId, category, quality) > 0;
}

export function addPart(s: GameState, modelId: string, category: PartCategory, quality: ReplacementQuality, qty = 1): void {
  const k = partKey(modelId, category, quality);
  s.parts[k] = (s.parts[k] ?? 0) + qty;
}

/** Takes one spare out of the stock room (call it right before the `replace` repair action). */
export function consumePart(s: GameState, modelId: string, category: PartCategory, quality: ReplacementQuality): boolean {
  const k = partKey(modelId, category, quality);
  const n = s.parts[k] ?? 0;
  if (n <= 0) return false;
  if (n === 1) delete s.parts[k];
  else s.parts[k] = n - 1;
  // the old display is kept: the glass separator can turn it into a good spare
  if (category === 'display') s.scrap[modelId] = Math.min(9, (s.scrap[modelId] ?? 0) + 1);
  return true;
}

export function storageCapacity(s: GameState): number {
  return at(BALANCE.parts.storage, toolTier(s, 'shelf')) + at(BALANCE.parts.storageStageBonus, s.stage - 1);
}

export function storageUsed(s: GameState): number {
  let n = 0;
  for (const v of Object.values(s.parts)) n += v;
  for (const d of s.deliveries) n += d.qty;
  return n;
}

function incoming(s: GameState, modelId: string, category: PartCategory, quality: ReplacementQuality): number {
  let n = 0;
  for (const d of s.deliveries) {
    if (d.modelId === modelId && d.category === category && d.quality === quality) n += d.qty;
  }
  return n;
}

export function partOffers(s: GameState, modelId: string): PartOffer[] {
  const out: PartOffer[] = [];
  for (const category of purchasableCategories(modelId)) {
    for (const quality of QUALITIES) {
      out.push({
        modelId,
        category,
        quality,
        price: partPrice(modelId, category, quality),
        expressPrice: expressPrice(modelId, category, quality),
        inStock: stockOf(s, modelId, category, quality),
        incoming: incoming(s, modelId, category, quality),
        defectRate: DEFECT_RATE[quality],
        nameKey: `parts.category.${category}`,
      });
    }
  }
  return out;
}

/**
 * Orders spares from Mr. Chai. Standard orders land with tomorrow morning's boat; express ones cost
 * more and arrive by courier about two game hours later (the next morning if ordered late).
 */
export function buyPart(
  ctx: SimCtx,
  modelId: string,
  category: PartCategory,
  quality: ReplacementQuality,
  opts: { express: boolean; qty?: number },
): Result {
  const s = ctx.s;
  const qty = Math.max(1, Math.floor(opts.qty ?? 1));
  if (partBaseValue(modelId, category) <= 0 || !QUALITIES.includes(quality)) return err('unknown_item');
  if (storageUsed(s) + qty > storageCapacity(s)) return err('storage_full', { cap: storageCapacity(s) });
  const unit = opts.express ? expressPrice(modelId, category, quality) : partPrice(modelId, category, quality);
  const total = unit * qty;
  if (!canAfford(s, total)) return err('no_money', { price: total });
  spend(s, 'parts', total);
  const t = BALANCE.time;
  let arriveAt: number;
  if (opts.express && s.dayPhase === 'open' && s.time + BALANCE.parts.expressHours <= t.dayEnd) {
    arriveAt = now(s) + BALANCE.parts.expressHours;
  } else {
    arriveAt = s.day * 24 + BALANCE.parts.boatTime;
  }
  const same = s.deliveries.find(
    (d) => d.modelId === modelId && d.category === category && d.quality === quality && d.arriveAt === arriveAt && d.express === opts.express,
  );
  if (same) same.qty += qty;
  else s.deliveries.push({ id: ctx.id('dlv'), modelId, category, quality, qty, arriveAt, express: opts.express });
  return OK;
}

/** Moves due deliveries into the stock room. */
export function processDeliveries(s: GameState, events: SimEvent[]): void {
  const t = now(s);
  const due: PartDelivery[] = [];
  const rest: PartDelivery[] = [];
  for (const d of s.deliveries) (d.arriveAt <= t ? due : rest).push(d);
  if (due.length === 0) return;
  s.deliveries = rest;
  for (const express of [false, true]) {
    const batch = due.filter((d) => d.express === express);
    if (batch.length === 0) continue;
    for (const d of batch) addPart(s, d.modelId, d.category, d.quality, d.qty);
    events.push({
      type: 'delivery_arrived',
      express,
      items: batch.map((d) => ({ modelId: d.modelId, category: d.category, quality: d.quality, qty: d.qty })),
    });
  }
}

/** Glass separator: turns a scrapped display into a "good" spare, a few times per day. */
export function refurbishDisplay(s: GameState, modelId: string): Result {
  if (toolTier(s, 'separator') < 1) return err('need_tool', { tool: '@tools.separator.name' });
  if ((s.scrap[modelId] ?? 0) <= 0) return err('no_scrap');
  if (s.ledger.separatorUses >= BALANCE.parts.separatorPerDay) return err('separator_limit', { n: BALANCE.parts.separatorPerDay });
  if (storageUsed(s) + 1 > storageCapacity(s)) return err('storage_full', { cap: storageCapacity(s) });
  s.scrap[modelId] = (s.scrap[modelId] ?? 1) - 1;
  if (s.scrap[modelId] === 0) delete s.scrap[modelId];
  s.ledger.separatorUses++;
  addPart(s, modelId, 'display', 'good', 1);
  return OK;
}
