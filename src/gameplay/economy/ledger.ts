/** Money movements: every baht goes through here so the daily report always adds up. */
import type { ExpenseKind, GameState, IncomeKind } from '../../core/state';

export function earn(s: GameState, kind: IncomeKind, amount: number): void {
  if (amount <= 0) return;
  s.money += amount;
  s.ledger.income[kind] += amount;
  if (kind !== 'loan') s.stats.totalEarned += amount;
}

export function spend(s: GameState, kind: ExpenseKind, amount: number): void {
  if (amount <= 0) return;
  s.money -= amount;
  s.ledger.expenses[kind] += amount;
}

export function canAfford(s: GameState, amount: number): boolean {
  return s.money >= amount;
}

export function sum(rec: Record<string, number>): number {
  let t = 0;
  for (const v of Object.values(rec)) t += v;
  return t;
}
