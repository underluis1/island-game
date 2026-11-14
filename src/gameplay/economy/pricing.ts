/**
 * Quotes. Fair price of a job:
 *
 *   F = Σ labor(fault) × laborMult × model difficulty  (the cheaper fault of a double job counts 80%)
 *     + Σ price of the "good" spares the job consumes × partsMarkup
 *
 * A customer with budget B (0.8..1.6) accepts up to F×B, haggles up to F×B×counterBand and walks away
 * above that; beyond F×B×ripoffBand they may leave a 1-star "rip-off" review.
 */
import { phoneDef } from '../../data/phones';
import type { GameState } from '../../core/state';
import { FAULT_BY_ID } from '../repair/faults';
import type { PartCategory } from '../repair/types';
import { BALANCE, roundPrice } from '../sim/balance';
import type { PartNeed } from '../sim/types';
import { partBaseValue, partPrice, partsFor } from './parts';

export function parseDiagnosis(id: string): string[] {
  return id.split('+').filter((f) => !!FAULT_BY_ID[f]);
}

export function diagnosisId(faults: string[]): string {
  return [...faults].sort().join('+');
}

export function partCategoriesFor(modelId: string, faults: string[]): PartCategory[] {
  const out: PartCategory[] = [];
  for (const id of faults) {
    for (const cat of FAULT_BY_ID[id]?.parts ?? []) {
      if (partBaseValue(modelId, cat) > 0 && !out.includes(cat)) out.push(cat);
    }
  }
  return out;
}

export function partNeeds(s: GameState, modelId: string, faults: string[]): PartNeed[] {
  return partCategoriesFor(modelId, faults).map((category) => {
    const stock = partsFor(s, modelId, category);
    return {
      category,
      price: partPrice(modelId, category, 'good'),
      inStock: stock.cheap + stock.good + stock.refurb,
      nameKey: `parts.category.${category}`,
    };
  });
}

export function laborPrice(modelId: string, faults: string[]): number {
  const def = phoneDef(modelId);
  const labors = faults.map((f) => FAULT_BY_ID[f]?.labor ?? 0).sort((a, b) => b - a);
  let total = 0;
  labors.forEach((l, i) => {
    total += i === 0 ? l : l * 0.8;
  });
  return total * BALANCE.pricing.laborMult * def.difficulty;
}

export function partsCost(modelId: string, faults: string[]): number {
  let total = 0;
  for (const cat of partCategoriesFor(modelId, faults)) total += partPrice(modelId, cat, 'good');
  return total;
}

export function fairPrice(modelId: string, faults: string[]): number {
  return roundPrice(laborPrice(modelId, faults) + partsCost(modelId, faults) * BALANCE.pricing.partsMarkup);
}

export type QuoteVerdict = 'accept' | 'counter' | 'refuse' | 'ripoff';

export function judgeQuote(fair: number, budget: number, price: number): QuoteVerdict {
  const p = BALANCE.pricing;
  const limit = fair * budget;
  if (price <= limit) return 'accept';
  if (price <= limit * p.counterBand) return 'counter';
  if (price <= limit * p.ripoffBand) return 'refuse';
  return 'ripoff';
}
