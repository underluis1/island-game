/**
 * Delivery assessment: compares the phone with the report taken at acceptance and turns the result
 * into a satisfaction score (0..1), stars, a written review, the payment and a tip.
 */
import type { Line, Order, Persona, Review } from '../../core/state';
import { evaluatePhone } from '../repair/evaluate';
import type { FunctionId, TestReport } from '../repair/types';
import { BALANCE, CUSTOMER_DATA, clamp, roundPrice } from '../sim/balance';
import type { FactorScore, ReviewFactor, SimCtx } from '../sim/types';
import { modelOf } from './parts';
import { toolTier } from '../shop/tools';

const PAIRING_FUNCTIONS: FunctionId[] = ['trueTone', 'biometric'];
/** how many text variants exist per fragment family (kept in sync with reviews.json by a unit test) */
export const REVIEW_VARIANTS = { open: 3, fact: 2, close: 2, quote: 2, fail: 2 } as const;

export interface Assessment {
  satisfaction: number;
  stars: number;
  factors: FactorScore[];
  /** share of the agreed price the customer pays: 1, 0.5 or 0 */
  payShare: number;
  after: TestReport;
}

export function starsFor(satisfaction: number): number {
  let stars = 1;
  for (const t of BALANCE.review.starThresholds) if (satisfaction >= t) stars++;
  return stars;
}

export function assessOrder(ctx: SimCtx, order: Order, atmosphere: number): Assessment {
  const r = BALANCE.review;
  const model = modelOf(order.modelId);
  const phone = order.phone;
  const before = order.baseline;
  const after = evaluatePhone(model, phone);
  const factors: FactorScore[] = [];
  const add = (factor: ReviewFactor, delta: number): void => {
    factors.push({ factor, delta });
  };

  // pairing losses (True Tone, Touch ID / Face ID) are judged on their own
  const pairingLost = PAIRING_FUNCTIONS.filter(
    (fn) =>
      after.functions[fn] === 'fail' &&
      model.def.components.some((c) => c.functions.includes(fn) && c.pairing && !phone.comps[c.id]!.paired),
  );
  const targets = order.targets.filter((fn) => !pairingLost.includes(fn));
  let fixedPoints = 0;
  for (const fn of targets) {
    if (after.functions[fn] === 'pass') fixedPoints += 1;
    else if (after.functions[fn] === 'degraded' && before.functions[fn] === 'fail') fixedPoints += 0.5;
  }
  const fixedFrac = targets.length === 0 ? 1 : fixedPoints / targets.length;
  const newBroken = (Object.keys(after.functions) as FunctionId[]).filter(
    (fn) => before.functions[fn] === 'pass' && (after.functions[fn] === 'fail' || after.functions[fn] === 'degraded') && !pairingLost.includes(fn),
  );
  const dead = after.functions.power === 'fail';

  if (fixedFrac >= 1) add('fixed', r.baseFixed);
  else if (fixedFrac > 0) add('partial', r.basePartialMin + r.basePartialSpan * fixedFrac);
  else add('not_fixed', 0.2);

  if (newBroken.length > 0) add('new_broken', -r.newBroken * newBroken.length);
  if (pairingLost.length > 0) {
    let d = 0;
    for (const fn of pairingLost) d += fn === 'biometric' ? r.pairingLost.biometric : r.pairingLost.trueTone;
    add('pairing', -d);
  }
  const missing = Math.max(0, after.missingScrews - before.missingScrews);
  const loose = Math.max(0, after.looseScrews - before.looseScrews);
  if (missing + loose > 0) {
    add('screws', -(Math.min(r.missingScrewMax, missing * r.missingScrew) + Math.min(r.looseScrewMax, loose * r.looseScrew)));
  }
  if (after.leftoverParts.length > 0) add('leftover', -r.leftoverPart * after.leftoverParts.length);
  if (!after.closed) add('not_closed', -r.notClosed);
  else if (before.waterSeal && !after.waterSeal) add('seal_lost', -r.sealLost);
  else if (
    after.waterSeal &&
    toolTier(ctx.s, 'adhesive') >= 1 &&
    order.goal.replace.length + order.goal.reseat.length + order.goal.solder.length > 0
  ) {
    add('seal_kept', r.sealKept * (toolTier(ctx.s, 'adhesive') >= 2 ? 2 : 1));
  }
  if (after.cleanliness >= 0.995 && before.cleanliness < 0.99) add('clean', r.cleanBonus);

  let cheap = 0;
  let refurb = 0;
  for (const cs of Object.values(phone.comps)) {
    if (cs.quality === 'cheap') cheap++;
    else if (cs.quality === 'refurb') refurb++;
  }
  if (cheap > 0 && ctx.rng.chance(1 - Math.pow(1 - r.cheapNoticeChance, cheap))) add('cheap_part', -r.cheapNoticed);
  else if (refurb > 0 && cheap === 0) add('premium_part', r.refurbBonus);

  if (order.lateDays > 0) add('late', -r.lateDay * order.lateDays);
  else if (order.overdueSince !== null) add('late', -r.late);
  else if (order.readyAt !== null && order.dueAt > order.acceptedAt) {
    const used = (order.readyAt - order.acceptedAt) / (order.dueAt - order.acceptedAt);
    if (used < 0.4) add('fast', r.veryEarly);
    else if (used < 0.75) add('fast', r.early);
  }

  const ratio = order.fair > 0 ? order.price / order.fair : 1;
  if (ratio <= BALANCE.pricing.lowPrice) add('price_low', r.priceLow);
  else if (ratio <= 1.05) add('price_fair', r.priceFair);
  else if (ratio > Math.max(r.priceHighBand, order.persona.budget)) add('price_high', -r.priceRipoff);
  else if (ratio > r.priceHighBand) add('price_high', -r.priceHigh);

  let sev = 0;
  for (const m of phone.mistakes) sev += m.severity;
  if (sev > 0) add('mistakes', -Math.min(r.mistakeMax, sev * r.mistakeUnit));
  if (!order.guideUsed && !order.byAssistant && fixedFrac >= 1) add('expert', r.expert);
  if (order.misdiagnosed) add('misdiagnosis', -r.misdiagnosis);
  if (atmosphere >= 40) add('atmosphere', 0.02);

  let satisfaction = CUSTOMER_DATA.kinds[order.persona.kind].leniency;
  for (const f of factors) satisfaction += f.delta;
  if (dead) satisfaction = Math.min(satisfaction, 0.1);
  satisfaction = clamp(satisfaction, 0, 1);

  const payShare = dead || fixedFrac <= 0 ? 0 : fixedFrac >= 1 ? 1 : 0.5;
  return { satisfaction, stars: starsFor(satisfaction), factors, payShare, after };
}

function variant(ctx: SimCtx, n: number): number {
  return ctx.rng.int(1, n);
}

function reviewParams(ctx: SimCtx, persona: Persona, modelId: string): NonNullable<Line['params']> {
  return { name: persona.name, model: `@phones.${modelId}.name`, shop: ctx.s.shopName };
}

function baseReview(ctx: SimCtx, persona: Persona, modelId: string, stars: number, text: Line[]): Review {
  return {
    id: ctx.id('rev'),
    day: ctx.s.day,
    stars,
    name: persona.name,
    kind: persona.kind,
    character: persona.character,
    modelId,
    text,
  };
}

/** Opening by stars + the one or two things that mattered most + a closing when there is little to say. */
export function writeReview(ctx: SimCtx, order: Order, a: Assessment): Review {
  const params = reviewParams(ctx, order.persona, order.modelId);
  const text: Line[] = [{ key: `reviews.open.s${a.stars}.${variant(ctx, REVIEW_VARIANTS.open)}`, params }];
  const pool = a.factors.filter((f) => f.factor !== 'fixed');
  const relevant = a.stars >= 4 ? pool : pool.filter((f) => f.delta < 0 || f.factor === 'partial' || f.factor === 'not_fixed');
  const notable = relevant.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 2);
  for (const f of notable) text.push({ key: `reviews.fact.${f.factor}.${variant(ctx, REVIEW_VARIANTS.fact)}`, params });
  if (notable.length < 2) text.push({ key: `reviews.close.s${a.stars}.${variant(ctx, REVIEW_VARIANTS.close)}`, params });
  return baseReview(ctx, order.persona, order.modelId, a.stars, text);
}

/** One-star review of a customer who was quoted an outrageous price. */
export function ripoffReview(ctx: SimCtx, persona: Persona, modelId: string): Review {
  const params = reviewParams(ctx, persona, modelId);
  return baseReview(ctx, persona, modelId, 1, [{ key: `reviews.quote.ripoff.${variant(ctx, REVIEW_VARIANTS.quote)}`, params }]);
}

/** One-star review of a customer whose phone was not ready in time. */
export function failedReview(ctx: SimCtx, order: Order): Review {
  const params = reviewParams(ctx, order.persona, order.modelId);
  return baseReview(ctx, order.persona, order.modelId, 1, [
    { key: `reviews.fail.never_ready.${variant(ctx, REVIEW_VARIANTS.fail)}`, params },
    { key: `reviews.close.s1.${variant(ctx, REVIEW_VARIANTS.close)}`, params },
  ]);
}

export function tipFor(ctx: SimCtx, order: Order, a: Assessment, paid: number, atmosphere: number): number {
  const r = BALANCE.review;
  if (a.stars < 4 || paid <= 0) return 0;
  const kind = CUSTOMER_DATA.kinds[order.persona.kind];
  const atmo = 1 + (r.tipAtmoPer100 * atmosphere) / 100;
  if (!ctx.rng.chance(clamp(kind.tipChance * atmo * (order.persona.tipMult >= 1 ? 1 : 0.7), 0, 0.95))) return 0;
  const share = kind.tip * order.persona.tipMult * (a.stars >= 5 ? r.tipStars5 : r.tipStars4) * atmo;
  return roundPrice(paid * share * ctx.rng.range(r.tipSpread[0]!, r.tipSpread[1]!));
}
