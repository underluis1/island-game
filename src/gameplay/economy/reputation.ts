/**
 * Reputation = weighted mean of the recent reviews blended with a "nobody knows you" prior.
 *
 *   rep = (prior * wPrior + Σ stars_i * w_i) / (wPrior + Σ w_i) - penalty
 *
 * - only the last `window` reviews count; the newest weighs 1, the oldest `recencyMin`
 * - wPrior starts at `priorWeight` and fades to 0 between `fadeFrom` and `fadeTo` lifetime reviews,
 *   so a veteran shop is judged on its recent work only
 * - `penalty` comes from uncle Somchai's loans and heals a little every day
 */
import type { GameState, Review } from '../../core/state';
import { BALANCE, clamp } from '../sim/balance';

export function computeReputation(s: GameState): number {
  const b = BALANCE.reputation;
  const reviews = s.reputation.reviews.slice(-b.window);
  const fade = clamp((s.reputation.total - b.fadeFrom) / (b.fadeTo - b.fadeFrom), 0, 1);
  const wPrior = b.priorWeight * (1 - fade);
  let num = b.prior * wPrior;
  let den = wPrior;
  const n = reviews.length;
  for (let i = 0; i < n; i++) {
    const w = n <= 1 ? 1 : b.recencyMin + (1 - b.recencyMin) * (i / (n - 1));
    num += (reviews[i] as Review).stars * w;
    den += w;
  }
  const raw = den > 0 ? num / den : b.prior;
  return clamp(raw - s.reputation.penalty, 0, 5);
}

/** Stores a review, refreshes the cached value and returns the reputation change. */
export function addReview(s: GameState, review: Review): number {
  const before = s.reputation.value;
  s.reputation.reviews.push(review);
  const max = BALANCE.reputation.window;
  if (s.reputation.reviews.length > max) s.reputation.reviews.splice(0, s.reputation.reviews.length - max);
  s.reputation.total++;
  s.ledger.reviews.push(review.id);
  s.reputation.value = computeReputation(s);
  return s.reputation.value - before;
}

export function addPenalty(s: GameState, amount: number): number {
  const before = s.reputation.value;
  s.reputation.penalty = clamp(s.reputation.penalty + amount, 0, BALANCE.reputation.maxPenalty);
  s.reputation.value = computeReputation(s);
  return s.reputation.value - before;
}

export function healPenalty(s: GameState): void {
  s.reputation.penalty = Math.max(0, s.reputation.penalty - BALANCE.reputation.penaltyRecoveryPerDay);
  s.reputation.value = computeReputation(s);
}
