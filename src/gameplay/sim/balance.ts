/** Typed access to the data files the simulation is tuned with. Every tunable lives in src/data/balance.json. */
import balanceJson from '../../data/balance.json';
import customersJson from '../../data/customers.json';
import toolsJson from '../../data/tools.json';
import type { CustomerKind, Urgency } from '../../core/state';

export const BALANCE = balanceJson;
export type Balance = typeof balanceJson;

export type ToolCategory = 'hand' | 'bench' | 'comfort';

export interface ToolTierDef {
  tier: number;
  price: number;
  minStage: number;
  minReputation: number;
}

export interface ToolDef {
  id: string;
  category: ToolCategory;
  /** tier owned at the start of a new game (0 = must be bought) */
  start: number;
  tiers: ToolTierDef[];
}

export const TOOLS: ToolDef[] = toolsJson as ToolDef[];
export const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

export interface KindDef {
  weight: number;
  minReputation: number;
  budget: number[];
  patience: number[];
  tip: number;
  tipChance: number;
  /** added to the satisfaction score: lenient (>0) or picky (<0) reviewers */
  leniency: number;
  urgency: Record<Urgency, number>;
  modelBias: Record<string, number>;
  faultBias: Record<string, number>;
  names: string[];
}

export interface CharacterDef {
  name: string;
  kind: CustomerKind;
  voice: string;
  look: number;
  minReputation: number;
  interval: number[];
  budget: number;
  patience: number;
  tipMult: number;
  faults: string[];
}

export interface CustomerData {
  kinds: Record<CustomerKind, KindDef>;
  voices: string[];
  names: Record<string, string[]>;
  characters: Record<string, CharacterDef>;
  confusions: Record<string, string[]>;
  kindLines: Record<string, number>;
  anyLines: Record<string, number>;
  characterLines: Record<string, number>;
}

export const CUSTOMER_DATA = customersJson as unknown as CustomerData;
export const CUSTOMER_KINDS = Object.keys(CUSTOMER_DATA.kinds) as CustomerKind[];

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function roundPrice(v: number): number {
  const r = BALANCE.pricing.round;
  return Math.max(r, Math.round(v / r) * r);
}

/** value of a per-stage / per-tier table, clamped to its last entry */
export function at(table: readonly number[], index: number): number {
  return table[clamp(Math.floor(index), 0, table.length - 1)] as number;
}
