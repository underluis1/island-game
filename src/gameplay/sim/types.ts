/** Public types of the simulation facade (events, results, shop offers). */
import type { RNG } from '../../core/rng';
import type {
  Customer,
  DaySummary,
  DiagnosisTool,
  GameState,
  Line,
  Order,
  ReplacementQuality,
  Review,
  Stage,
  Urgency,
} from '../../core/state';
import type { AmmeterReading, BatteryInfo } from '../repair/diagnostics';
import type { PartCategory } from '../repair/types';
import type { ToolCategory } from './balance';

/** `reason` is an i18n key in the namespace `economy.err.*`. */
export type Result = { ok: true } | { ok: false; reason: string; params?: Record<string, string | number> };

export const OK: Result = { ok: true };
export const err = (reason: string, params?: Record<string, string | number>): Result => ({
  ok: false,
  reason: `economy.err.${reason}`,
  params,
});

/** Shared handle the gameplay modules work on. */
export interface SimCtx {
  s: GameState;
  rng: RNG;
  decor: DecorDef[];
  /** new unique id with the given prefix */
  id(prefix: string): string;
}

/* ---------------------------------------------------------------- catalog */

export interface ToolOffer {
  id: string;
  category: ToolCategory;
  /** owned tier, 0 = not owned */
  owned: number;
  maxTier: number;
  /** tier that would be bought next, null when maxed out */
  nextTier: number | null;
  price: number;
  minStage: number;
  minReputation: number;
  /** can be bought right now */
  available: boolean;
  /** why not (economy.err.*), null when available */
  locked: string | null;
  nameKey: string;
  descKey: string;
  effectKey: string;
  /** i18n key of the next tier's name (or of the owned one when maxed out) */
  tierKey: string;
}

export interface PartOffer {
  modelId: string;
  category: PartCategory;
  quality: ReplacementQuality;
  price: number;
  expressPrice: number;
  inStock: number;
  /** already ordered, not yet delivered */
  incoming: number;
  /** probability of a dead-on-arrival part */
  defectRate: number;
  nameKey: string;
}

export interface DecorDef {
  id: string;
  nameKey: string;
  descKey: string;
  category: string;
  placement: 'ground' | 'wall' | 'hang' | 'shelf';
  footprint: [number, number];
  price: number;
  atmosphere: number;
  stageMin: number;
}

export interface DecorOffer extends DecorDef {
  /** owned instances (placed + in stock) */
  owned: number;
  available: boolean;
  locked: string | null;
}

export interface UpgradeOffer {
  id: 'stage2' | 'stage3' | 'assistant';
  nameKey: string;
  descKey: string;
  price: number;
  minReputation: number;
  owned: boolean;
  available: boolean;
  locked: string | null;
}

export interface Catalog {
  tools: ToolOffer[];
  parts(modelId: string): PartOffer[];
  decor: DecorOffer[];
  upgrades: UpgradeOffer[];
}

/* ---------------------------------------------------------------- customers */

export interface PartNeed {
  category: PartCategory;
  /** price of a "good" spare */
  price: number;
  /** total in stock, any quality */
  inStock: number;
  nameKey: string;
}

export type OptionMark = 'unknown' | 'excluded' | 'confirmed';

export interface DiagnosisOption {
  /** "fault" or "faultA+faultB": pass it to quoteInfo / proposeQuote */
  id: string;
  faults: string[];
  /** faults.<id>.name for each fault */
  nameKeys: string[];
  /** faults.<id>.diagnosis for each fault */
  descKeys: string[];
  mark: OptionMark;
}

export interface DiagnosisClue {
  tool: DiagnosisTool;
  /** false when the shop does not own the instrument: nothing else is filled in */
  available: boolean;
  /** what the instrument shows, ready to print */
  lines: Line[];
  ammeter?: AmmeterReading;
  battery?: BatteryInfo;
  /** option ids newly ruled out by this reading */
  excluded: string[];
  /** set when a single option is left standing */
  confirmed: string | null;
}

export interface QuoteInfo {
  /** fair price of the diagnosed job */
  fair: number;
  /** slider range */
  min: number;
  max: number;
  labor: number;
  partsCost: number;
  parts: PartNeed[];
  urgency: Urgency;
  /** absolute deadline the order would get */
  dueAt: number;
}

export type QuoteOutcome =
  | { type: 'accepted'; order: Order; line: Line }
  | { type: 'counter'; price: number; line: Line }
  | { type: 'refused'; line: Line; review: Review | null; reputationDelta: number }
  | { type: 'blocked'; reason: string };

/* ---------------------------------------------------------------- delivery */

export type ReviewFactor =
  | 'fixed'
  | 'partial'
  | 'not_fixed'
  | 'new_broken'
  | 'pairing'
  | 'screws'
  | 'leftover'
  | 'not_closed'
  | 'seal_lost'
  | 'seal_kept'
  | 'clean'
  | 'cheap_part'
  | 'premium_part'
  | 'fast'
  | 'late'
  | 'price_low'
  | 'price_fair'
  | 'price_high'
  | 'mistakes'
  | 'expert'
  | 'misdiagnosis'
  | 'atmosphere';

export interface FactorScore {
  factor: ReviewFactor;
  /** contribution to the 0..1 satisfaction score (base factors carry the base value) */
  delta: number;
}

export interface DeliveryResult {
  ok: true;
  orderId: string;
  /** amount actually paid for the job */
  paid: number;
  tip: number;
  stars: number;
  satisfaction: number;
  review: Review;
  factors: FactorScore[];
  reputationDelta: number;
  /** what the customer says while paying */
  line: Line;
}

export type DeliverOutcome = DeliveryResult | { ok: false; reason: string };

/* ---------------------------------------------------------------- events */

/**
 * Everything the simulation reports back to the glue layer. Returned by `advance()`,
 * `closeShop()` (through the summary) and `startNextDay()`.
 */
export type SimEvent =
  /** somebody walked up: `position` is 'counter' or 'queue' */
  | { type: 'customer_arrived'; customer: Customer; position: 'counter' | 'queue' }
  /** the next person in the queue stepped up to the counter */
  | { type: 'customer_stepped_up'; customer: Customer }
  /** a walk-in left: ran out of patience, the shop closed, was dismissed or refused the quote */
  | { type: 'customer_left'; customerId: string; reason: 'impatient' | 'closing' | 'dismissed' | 'refused'; line: Line | null }
  /** the owner of an order is back to collect it (`ready` tells whether the phone is done) */
  | { type: 'pickup_arrived'; orderId: string; ready: boolean; line: Line }
  /** an order passed its deadline with the customer waiting; `graceHours` until they storm off */
  | { type: 'order_overdue'; orderId: string; graceHours: number }
  /** the customer gave up waiting: the order failed (1-star review) or was postponed to tomorrow */
  | { type: 'order_failed'; orderId: string; review: Review; reputationDelta: number; line: Line }
  | { type: 'order_postponed'; orderId: string; dueAt: number; line: Line }
  /** a customer at pickup got tired of being ignored and will come back later */
  | { type: 'pickup_left'; orderId: string }
  /** spare parts reached the shop (boat in the morning or express courier) */
  | { type: 'delivery_arrived'; express: boolean; items: Array<{ modelId: string; category: PartCategory; quality: ReplacementQuality; qty: number }> }
  /** Mr. Chai's long-tail boat lands (every morning, with or without parcels) */
  | { type: 'supplier_boat'; parcels: number }
  | { type: 'used_sold'; ownedId: string; modelId: string; price: number }
  | { type: 'assistant_started'; orderId: string; hours: number }
  | { type: 'assistant_done'; orderId: string; success: boolean }
  | { type: 'rain_start'; hours: number }
  | { type: 'rain_stop' }
  /** 30 game minutes before the forced closing time */
  | { type: 'day_ending'; hoursLeft: number }
  /** the day is over: show the report, then autosave and call startNextDay() */
  | { type: 'day_end'; summary: DaySummary }
  | { type: 'loan'; amount: number; line: Line }
  | { type: 'stage_built'; stage: Stage }
  | { type: 'day_start'; day: number }
  | { type: 'character_visit'; character: string; customerId: string };
