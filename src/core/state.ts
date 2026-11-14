/**
 * Game state: one plain-JSON object (no classes, no Maps, no undefined-vs-missing tricks) that the
 * simulation (`src/gameplay/sim`) mutates and `src/core/save.ts` persists.
 *
 * Time convention: `day` starts at 1, `time` is the hour of the day (7..22 while playing).
 * "Absolute" timestamps used for deadlines are hours since midnight of day 1: `(day - 1) * 24 + time`.
 */
import type {
  FunctionId,
  PartCategory,
  PartQuality,
  PhoneInstance,
  RepairGoal,
  TestReport,
} from '../gameplay/repair/types';

/** Bump when the shape of GameState changes and add a migration in save.ts. */
export const SCHEMA_VERSION = 2;

export type Stage = 1 | 2 | 3;
export type ReplacementQuality = Exclude<PartQuality, 'factory'>;
export type CustomerKind = 'tourist' | 'local' | 'diver' | 'backpacker' | 'business';
export type Urgency = 'normal' | 'today' | 'wait';
export type DiagnosisTool = 'visual' | 'multimeter' | 'battester' | 'psu';
export type TutorialPhase = 'intro' | 'teardown' | 'reassembly' | 'first_customer' | 'first_purchase' | 'done';
export type OrderStatus = 'queued' | 'in_progress' | 'ready' | 'delivered' | 'failed' | 'abandoned';

/** An i18n key plus interpolation params. Param values starting with "@" are keys to translate first. */
export interface Line {
  key: string;
  params?: Record<string, string | number>;
}

/** Who a customer is; copied onto the order so the 3D layer can show the same person at pickup. */
export interface Persona {
  name: string;
  kind: CustomerKind;
  /** recurring character id ("noi" | "kai" | "matteo"), null for procedural customers */
  character: string | null;
  /** seed for the procedural appearance */
  look: number;
  /** VoiceId of the audio module */
  voice: string;
  /** willingness to pay: multiplier on the fair price (0.8..1.6) */
  budget: number;
  /** tip propensity multiplier */
  tipMult: number;
}

export interface Customer extends Persona {
  id: string;
  modelId: string;
  /** hidden truth: fault ids applied to the phone */
  faults: string[];
  phone: PhoneInstance;
  goal: RepairGoal;
  greeting: Line;
  /** vague description of the problem (one line per fault) */
  complaints: Line[];
  urgencyLine: Line;
  urgency: Urgency;
  /** game hours the customer still waits at the counter */
  patience: number;
  patienceMax: number;
  arrivedAt: number;
  /** tools from FaultDef.needsTools the shop does not own: the job cannot be done properly */
  missingTools: string[];
  /** diagnosis option ids ("fault" or "faultA+faultB"), shuffled; exactly one is correct */
  options: string[];
  toolsUsed: DiagnosisTool[];
  /** option ids ruled out by the diagnostic tools used so far */
  excluded: string[];
  /** pending counter-offer made by the customer */
  counter: { diagnosis: string; price: number } | null;
  /** number of rejected proposals so far */
  haggles: number;
  /** 'wait' urgency: game hours the customer is willing to sit there once the job is accepted */
  waitHours: number;
  /** 'today' / 'normal' urgency: absolute time they come back for the phone */
  dueAt: number;
  /** scripted first customer of the tutorial: never leaves, no deadline */
  tutorial: boolean;
}

export interface Order {
  id: string;
  kind: 'customer' | 'tutorial';
  persona: Persona;
  modelId: string;
  phone: PhoneInstance;
  /** what really has to be done (may differ from what was quoted) */
  goal: RepairGoal;
  /** final-test report taken when the phone was accepted */
  baseline: TestReport;
  /** broken functions a flawless repair brings back: what the customer expects to work again */
  targets: FunctionId[];
  faults: string[];
  /** fault ids the player diagnosed */
  diagnosed: string[];
  misdiagnosed: boolean;
  /** agreed price, baht */
  price: number;
  /** fair price of the real job, baht */
  fair: number;
  urgency: Urgency;
  acceptedAt: number;
  /** absolute deadline */
  dueAt: number;
  /** absolute time at which the customer shows up to collect (null = is waiting right here) */
  pickupAt: number | null;
  status: OrderStatus;
  /** the customer is standing at the counter waiting for the phone */
  customerPresent: boolean;
  /** absolute time when the customer started waiting past the deadline, null if not overdue */
  overdueSince: number | null;
  /** absolute time the customer arrived for pickup (patience countdown), null if not here */
  presentSince: number | null;
  lateDays: number;
  readyAt: number | null;
  guideUsed: boolean;
  byAssistant: boolean;
  /** the assistant already tried and got stuck: leave it to the player */
  assistantTried: boolean;
  /** game hours spent on the bench */
  workHours: number;
}

export type OwnedStatus = 'broken' | 'in_progress' | 'repaired' | 'listed';

/** A phone bought on the used market. Shares the repair API with orders (same id space). */
export interface OwnedPhone {
  id: string;
  modelId: string;
  phone: PhoneInstance;
  goal: RepairGoal;
  baseline: TestReport;
  faults: string[];
  buyPrice: number;
  status: OwnedStatus;
  /** asking price once listed */
  askPrice: number;
  /** absolute time of the sale once listed */
  sellAt: number | null;
  boughtDay: number;
}

export interface UsedListing {
  id: string;
  modelId: string;
  /** hidden truth */
  faults: string[];
  /** i18n line with the seller's vague description */
  description: Line;
  seller: string;
  price: number;
  color: number;
  seed: number;
}

export interface PartDelivery {
  id: string;
  modelId: string;
  category: PartCategory;
  quality: ReplacementQuality;
  qty: number;
  /** absolute arrival time */
  arriveAt: number;
  express: boolean;
}

export interface DecorPlacement {
  x: number;
  z: number;
  /** quarter turns, 0..3 */
  rot: number;
}

export interface DecorInstance {
  uid: string;
  itemId: string;
  /** null = in stock */
  placed: DecorPlacement | null;
}

export interface Review {
  id: string;
  day: number;
  stars: number;
  name: string;
  kind: CustomerKind;
  character: string | null;
  modelId: string;
  /** 2-3 i18n fragments to join with a space */
  text: Line[];
}

export type IncomeKind = 'repairs' | 'tips' | 'used' | 'showcase' | 'decor' | 'loan';
export type ExpenseKind =
  | 'parts'
  | 'tools'
  | 'decor'
  | 'used'
  | 'rent'
  | 'electricity'
  | 'wages'
  | 'stage'
  | 'loan';

export interface Ledger {
  income: Record<IncomeKind, number>;
  expenses: Record<ExpenseKind, number>;
  jobsDone: number;
  jobsFailed: number;
  customers: number;
  /** review ids received today */
  reviews: string[];
  repStart: number;
  /** game hours spent in the repair view today (drives fatigue) */
  repairHours: number;
  separatorUses: number;
}

export interface DayRecord {
  day: number;
  income: number;
  expenses: number;
  net: number;
  money: number;
  reputation: number;
  jobs: number;
}

export interface DaySummary {
  day: number;
  income: Record<IncomeKind, number>;
  expenses: Record<ExpenseKind, number>;
  totalIncome: number;
  totalExpenses: number;
  net: number;
  moneyEnd: number;
  jobsDone: number;
  jobsFailed: number;
  customers: number;
  reviews: Review[];
  repStart: number;
  repEnd: number;
  /** amount lent by uncle Somchai tonight, 0 if none */
  loan: number;
  loanLine: Line | null;
  /** last days, oldest first, for the chart */
  series: DayRecord[];
}

export interface Stats {
  repairs: number;
  perfectRepairs: number;
  failedOrders: number;
  customersServed: number;
  customersLost: number;
  totalEarned: number;
  totalTips: number;
  usedBought: number;
  usedSold: number;
  loans: number;
  bestDay: number;
  expertRepairs: number;
  byModel: Record<string, number>;
  byFault: Record<string, number>;
}

export interface GameState {
  schemaVersion: number;
  seed: number;
  /** serialised RNG state (see core/rng.ts) */
  rng: number;
  nextId: number;
  /** real seconds played */
  playTime: number;
  shopName: string;
  customization: { awningColor: string; accentColor: string };
  day: number;
  time: number;
  dayPhase: 'open' | 'summary';
  /** day_ending warning already sent today */
  warned: boolean;
  money: number;
  stage: Stage;
  /** stage under construction tonight, 0 = none */
  construction: 0 | 2 | 3;
  /** tool id → owned tier (0 = not owned) */
  tools: Record<string, number>;
  /** spare parts in stock: "model|category|quality" → quantity */
  parts: Record<string, number>;
  /** broken displays kept for the glass separator: model → quantity */
  scrap: Record<string, number>;
  deliveries: PartDelivery[];
  /** last day Mr. Chai's boat landed */
  boatDay: number;
  counter: Customer | null;
  queue: Customer[];
  /** absolute time of the next walk-in */
  nextArrivalAt: number;
  /** recurring characters: id → next day they visit; and today's scheduled visits */
  recurring: Record<string, number>;
  scheduled: Array<{ character: string; at: number }>;
  orders: Order[];
  owned: OwnedPhone[];
  market: { day: number; listings: UsedListing[] };
  decor: DecorInstance[];
  reputation: {
    /** cached current value 0..5 */
    value: number;
    /** most recent reviews, oldest first (bounded) */
    reviews: Review[];
    /** lifetime number of reviews */
    total: number;
    /** temporary malus (loans), decays daily */
    penalty: number;
  };
  loan: { debt: number };
  ledger: Ledger;
  history: DayRecord[];
  lastSummary: DaySummary | null;
  weather: { rainStart: number; rainEnd: number; rain: number };
  assistant: { hired: boolean; orderId: string | null; remaining: number };
  tutorial: { phase: TutorialPhase; skipped: boolean; giftGiven: boolean };
  encyclopedia: string[];
  stats: Stats;
}

export const TUTORIAL_PHASES: TutorialPhase[] = ['intro', 'teardown', 'reassembly', 'first_customer', 'first_purchase', 'done'];

export function absTime(day: number, time: number): number {
  return (day - 1) * 24 + time;
}

export function now(state: GameState): number {
  return absTime(state.day, state.time);
}

export function partKey(modelId: string, category: PartCategory, quality: ReplacementQuality): string {
  return `${modelId}|${category}|${quality}`;
}

export function emptyLedger(repStart: number): Ledger {
  return {
    income: { repairs: 0, tips: 0, used: 0, showcase: 0, decor: 0, loan: 0 },
    expenses: { parts: 0, tools: 0, decor: 0, used: 0, rent: 0, electricity: 0, wages: 0, stage: 0, loan: 0 },
    jobsDone: 0,
    jobsFailed: 0,
    customers: 0,
    reviews: [],
    repStart,
    repairHours: 0,
    separatorUses: 0,
  };
}

export function emptyStats(): Stats {
  return {
    repairs: 0,
    perfectRepairs: 0,
    failedOrders: 0,
    customersServed: 0,
    customersLost: 0,
    totalEarned: 0,
    totalTips: 0,
    usedBought: 0,
    usedSold: 0,
    loans: 0,
    bestDay: 0,
    expertRepairs: 0,
    byModel: {},
    byFault: {},
  };
}

export interface NewGameOptions {
  seed: number;
  shopName: string;
  skipTutorial?: boolean;
}

/** Pristine state of day 1, 07:00. Starting tools come from tools.json and are filled in by the sim. */
export function createInitialState(opts: NewGameOptions, start: { money: number; reputation: number; dayStart: number }): GameState {
  const seed = opts.seed >>> 0 || 1;
  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    rng: seed,
    nextId: 1,
    playTime: 0,
    shopName: opts.shopName,
    customization: { awningColor: '#e8553d', accentColor: '#2bb5a8' },
    day: 1,
    time: start.dayStart,
    dayPhase: 'open',
    warned: false,
    money: start.money,
    stage: 1,
    construction: 0,
    tools: {},
    parts: {},
    scrap: {},
    deliveries: [],
    boatDay: 0,
    counter: null,
    queue: [],
    nextArrivalAt: 0,
    recurring: {},
    scheduled: [],
    orders: [],
    owned: [],
    market: { day: 0, listings: [] },
    decor: [],
    reputation: { value: start.reputation, reviews: [], total: 0, penalty: 0 },
    loan: { debt: 0 },
    ledger: emptyLedger(start.reputation),
    history: [],
    lastSummary: null,
    weather: { rainStart: -1, rainEnd: -1, rain: 0 },
    assistant: { hired: false, orderId: null, remaining: 0 },
    tutorial: { phase: opts.skipTutorial ? 'done' : 'intro', skipped: !!opts.skipTutorial, giftGiven: false },
    encyclopedia: [],
    stats: emptyStats(),
  };
}
