/**
 * Second-hand market: every morning a few broken phones are offered at 12-35% of their market value.
 * Bought phones take a rack slot, get repaired like any order and are then listed for sale:
 *
 *   sale = marketValue × saleBase × score^scorePower × parts factor × cleanliness factor × seal factor
 */
import { RNG } from '../../core/rng';
import { phoneDef } from '../../data/phones';
import { now, type GameState, type OwnedPhone, type UsedListing } from '../../core/state';
import { evaluatePhone } from '../repair/evaluate';
import { FAULTS, FAULT_BY_ID, generateFaultyPhone } from '../repair/faults';
import { unlockedModels } from '../customers/generate';
import { BALANCE, CUSTOMER_DATA, at, clamp, roundPrice } from '../sim/balance';
import { err, type Result, type SimCtx, type SimEvent } from '../sim/types';
import { canAfford, earn, spend } from './ledger';
import { modelOf } from './parts';
import { laborPrice, partsCost } from './pricing';

export function refreshMarket(ctx: SimCtx): void {
  const s = ctx.s;
  const u = BALANCE.used;
  const rng = ctx.rng;
  const listings: UsedListing[] = [];
  const models = unlockedModels(s.reputation.value);
  const n = rng.int(u.listings[0]!, u.listings[1]!);
  for (let i = 0; i < n; i++) {
    const modelId = rng.pick(models);
    const model = modelOf(modelId);
    const pool = FAULTS.filter((f) => f.applicable(model) && f.minReputation <= s.reputation.value + 0.5);
    const first = rng.weighted(pool, (f) => f.weight);
    const faults = [first.id];
    if (rng.chance(u.faultsTwoChance)) {
      const second = rng.weighted(pool, (f) => f.weight);
      const clash =
        second.id === first.id ||
        second.parts.some((p) => first.parts.includes(p)) ||
        first.id === 'loose_connector' ||
        second.id === 'loose_connector';
      if (!clash) faults.push(second.id);
    }
    const mv = model.def.marketValue;
    const repair = partsCost(modelId, faults) + laborPrice(modelId, faults) * 0.5;
    const frac = clamp(u.priceRange[1]! - (repair / mv) * 0.45 + rng.range(-0.04, 0.04), u.priceRange[0]!, u.priceRange[1]!);
    const shown = rng.pick(faults);
    listings.push({
      id: ctx.id('used'),
      modelId,
      faults,
      description: { key: `faults.${shown}.complaint${rng.int(1, FAULT_BY_ID[shown]!.complaints)}` },
      seller: rng.pick(CUSTOMER_DATA.names[rng.pick(['thai', 'intl'])] ?? ['Somsak']),
      price: roundPrice(mv * frac),
      color: rng.int(0, model.def.colors.length - 1),
      seed: rng.int(1, 2147483646),
    });
  }
  s.market = { day: s.day, listings };
}

export function buyUsed(ctx: SimCtx, listingId: string, rackFree: number): Result & { owned?: OwnedPhone } {
  const s = ctx.s;
  const idx = s.market.listings.findIndex((l) => l.id === listingId);
  if (idx < 0) return err('unknown_item');
  const l = s.market.listings[idx]!;
  if (rackFree <= 0) return err('rack_full');
  if (!canAfford(s, l.price)) return err('no_money', { price: l.price });
  spend(s, 'used', l.price);
  s.market.listings.splice(idx, 1);
  const id = ctx.id('own');
  const def = phoneDef(l.modelId);
  const { phone, goal } = generateFaultyPhone(def, l.faults, new RNG(l.seed), `ph-${id}`);
  phone.color = l.color;
  const owned: OwnedPhone = {
    id,
    modelId: l.modelId,
    phone,
    goal,
    baseline: evaluatePhone(modelOf(l.modelId), phone),
    faults: [...phone.faults],
    buyPrice: l.price,
    status: 'broken',
    askPrice: 0,
    sellAt: null,
    boughtDay: s.day,
  };
  s.owned.push(owned);
  s.stats.usedBought++;
  return { ok: true, owned };
}

/** What a buyer pays for the phone in its current condition. */
export function salePrice(owned: OwnedPhone): number {
  const u = BALANCE.used;
  const model = modelOf(owned.modelId);
  const mv = model.def.marketValue;
  const report = evaluatePhone(model, owned.phone);
  if (report.functions.power !== 'pass' || !report.closed) return roundPrice(mv * u.deadPhone);
  let cheap = 0;
  let refurb = 0;
  for (const cs of Object.values(owned.phone.comps)) {
    if (cs.quality === 'cheap') cheap++;
    else if (cs.quality === 'refurb') refurb++;
  }
  let mult = u.saleBase * Math.pow(report.score, u.scorePower);
  mult *= clamp(1 - cheap * u.cheapPartPenalty + refurb * u.refurbPartBonus, 0.6, 1.1);
  mult *= 1 - u.cleanWeight * (1 - report.cleanliness);
  if (!report.waterSeal) mult *= 1 - u.noSealPenalty;
  return roundPrice(mv * Math.max(u.deadPhone, mult));
}

/** Puts an owned phone on sale; a buyer turns up after a random time (faster with a shop window and atmosphere). */
export function listForSale(ctx: SimCtx, ownedId: string, atmosphere: number): Result & { askPrice?: number } {
  const s = ctx.s;
  const o = s.owned.find((x) => x.id === ownedId);
  if (!o) return err('unknown_item');
  if (o.status === 'in_progress') return err('on_bench');
  if (o.status === 'listed') return err('already_listed');
  const u = BALANCE.used;
  o.askPrice = salePrice(o);
  const speed = at(u.stageSpeed, s.stage - 1) * (1 + (u.atmoSpeedPer100 * atmosphere) / 100);
  o.sellAt = now(s) + (ctx.rng.range(u.sellDays[0]!, u.sellDays[1]!) * 24) / speed;
  o.status = 'listed';
  return { ok: true, askPrice: o.askPrice };
}

export function processUsedSales(s: GameState, events: SimEvent[]): void {
  const t = now(s);
  for (let i = s.owned.length - 1; i >= 0; i--) {
    const o = s.owned[i]!;
    if (o.status !== 'listed' || o.sellAt === null || o.sellAt > t) continue;
    s.owned.splice(i, 1);
    earn(s, 'used', o.askPrice);
    s.stats.usedSold++;
    events.push({ type: 'used_sold', ownedId: o.id, modelId: o.modelId, price: o.askPrice });
  }
}
