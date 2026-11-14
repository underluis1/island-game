/**
 * Tablet view-model. Everything here is plain data: the glue maps the simulation state onto these
 * props and wires the callbacks. Game texts (names, descriptions, reviews, effects) arrive already
 * translated; static labels come from the `ui.tablet.*` i18n keys.
 */
import type { PartQuality } from '../../gameplay/repair/types';
import type { IconName } from '../icons';

export type TabletTab = 'orders' | 'catalog' | 'inventory' | 'market' | 'stats' | 'reviews' | 'encyclopedia' | 'assistant';
export type CatalogTab = 'tools' | 'parts' | 'decor' | 'expansion' | 'customize';
export type InventoryTab = 'parts' | 'decor' | 'phones';
export type ShopPhase = 'stall' | 'kiosk' | 'shop';
/** Replacement grades that can be bought (the factory grade never is). */
export type BuyQuality = Exclude<PartQuality, 'factory'>;

/** Icon id: one of the built-in icons, or any string (unknown ids fall back to a neutral icon). */
export type IconId = IconName | string;

/* ------------------------------------------------------------------ status bar */

export interface TabletStatus {
  shopName: string;
  day: number;
  /** game time in hours [0, 24) */
  time: number;
  money: number;
  /** 0..5 stars */
  reputation: number;
}

/* ------------------------------------------------------------------ orders */

export type OrderStatus =
  /** accepted, waiting on the rack */
  | 'queued'
  /** a needed spare part is not in stock yet */
  | 'waiting_parts'
  /** currently on the work mat */
  | 'in_progress'
  /** the assistant is working on it */
  | 'assistant'
  /** repaired and tested: can be handed back */
  | 'ready';

export interface OrderVM {
  id: string;
  /** "Pear Fone X" */
  model: string;
  /** CSS colour of the phone body (thumbnail) */
  phoneColor?: string;
  customer: string;
  customerColor?: string;
  /** short job description: "Sostituzione batteria" */
  job: string;
  /** optional customer note ("Ho il traghetto alle 18!") */
  note?: string;
  status: OrderStatus;
  /** agreed price */
  price: number;
  /** "entro le 18:00", "domani 12:00" */
  deadlineText: string;
  /** game minutes left before the deadline (≤ 0 = late); drives the urgency colour */
  minutesLeft: number;
  /** names of the parts still missing (status waiting_parts) */
  missingParts?: string[];
  /** assistant progress 0..1 (status assistant) */
  progress?: number;
  /** reason why "Ripara" is disabled (undefined = enabled) */
  repairDisabled?: string;
  /** reason why "Consegna" is disabled (e.g. customer not at the counter) */
  deliverDisabled?: string;
  /** show the "Affida all'assistente" action; string = shown but disabled with this reason */
  assignable?: boolean | string;
}

export interface OrdersVM {
  orders: OrderVM[];
  /** phone rack occupancy */
  rack: { used: number; capacity: number };
}

/* ------------------------------------------------------------------ catalog */

export interface ToolVM {
  id: string;
  name: string;
  icon: IconId;
  /** tier this entry sells (1 = Base, 2 = Pro, 3 = Elite) */
  tier: number;
  maxTier: number;
  price: number;
  /** practical effect on the mechanics: "Svita il 30% più veloce, −50% rischio di spanare" */
  effect: string;
  /** owned = this tier already bought; locked = requirement not met */
  state: 'available' | 'owned' | 'locked';
  /** requirement text shown on locked tools: "Reputazione 3★", "Chiosco" */
  requires?: string;
  /** extra reason that disables the buy button (money is checked automatically) */
  disabled?: string;
  isNew?: boolean;
}

export interface PartOfferVM {
  price: number;
  /** unit price with express delivery */
  expressPrice: number;
  stock: number;
  /** units already ordered and on their way */
  incoming: number;
  /** grade not sold (yet): reason */
  unavailable?: string;
  /** short note: "Rischio difetti 15%", "Il cliente se ne accorge" */
  note?: string;
}

export interface PartRowVM {
  modelId: string;
  categoryId: string;
  /** "Batteria Fone X" */
  name: string;
  icon?: IconId;
  offers: Record<BuyQuality, PartOfferVM>;
}

export interface PartsCatalogVM {
  models: Array<{ id: string; name: string; locked?: string }>;
  categories: Array<{ id: string; name: string; icon?: IconId }>;
  /** one row per model × category that exists */
  rows: PartRowVM[];
  /** "Domani mattina con la barca di Mr. Chai" */
  normalEta: string;
  /** "Entro 2 ore" */
  expressEta: string;
}

export interface DecorVM {
  id: string;
  name: string;
  /** category id (see DecorCatalogVM.categories) */
  category: string;
  icon?: IconId;
  /** CSS colour used for the thumbnail */
  color?: string;
  atmosphere: number;
  price: number;
  /** how many the player already owns (placed + in stock) */
  owned: number;
  /** requirement not met: "Richiede il chiosco" */
  locked?: string;
  disabled?: string;
  isNew?: boolean;
}

export interface DecorCatalogVM {
  categories: Array<{ id: string; name: string }>;
  items: DecorVM[];
  /** current total atmosphere of the shop */
  atmosphere: number;
}

export interface ExpansionVM {
  current: ShopPhase;
  /** undefined = fully expanded */
  next?: {
    phase: ShopPhase;
    price: number;
    /** textual preview of what the player gets */
    description: string;
    features: string[];
    requirements: Array<{ label: string; met: boolean; progress?: string }>;
    /** extra reason that disables the button (money and requirements are checked automatically) */
    disabled?: string;
  };
  /** construction already paid: happens tonight */
  building?: boolean;
}

export interface ColorOptionVM {
  id: string;
  name: string;
  /** main CSS colour */
  color: string;
  /** second colour for striped awnings */
  color2?: string;
  price?: number;
  locked?: string;
}

export interface CustomizeVM {
  shopName: string;
  maxNameLength?: number;
  awningColors: ColorOptionVM[];
  awningColor: string;
  wallColors: ColorOptionVM[];
  wallColor: string;
  /** walls exist only from the kiosk on: reason shown instead of the palette */
  wallsLocked?: string;
}

export interface CatalogVM {
  tools: ToolVM[];
  parts: PartsCatalogVM;
  decor: DecorCatalogVM;
  expansion: ExpansionVM;
  customize: CustomizeVM;
}

/* ------------------------------------------------------------------ inventory */

export interface StockPartVM {
  id: string;
  name: string;
  /** model name: "Fone X" */
  model: string;
  quality: BuyQuality;
  qty: number;
  icon?: IconId;
  /** units reserved by accepted orders */
  reserved?: number;
}

export interface IncomingVM {
  id: string;
  name: string;
  qty: number;
  /** "Domani 07:00" */
  eta: string;
  express?: boolean;
}

export interface StockDecorVM {
  id: string;
  name: string;
  qty: number;
  atmosphere: number;
  icon?: IconId;
  color?: string;
}

export interface UsedPhoneVM {
  id: string;
  model: string;
  phoneColor?: string;
  /** broken = still needs work; repaired = can be listed; listed = on sale in the showcase */
  state: 'broken' | 'repaired' | 'listed';
  /** "Schermo crepato, batteria al 61%" / "Come nuovo" */
  conditionText: string;
  issues?: string[];
  /** what the player paid for it */
  paid: number;
  /** price range for the "Metti in vendita" slider */
  minPrice: number;
  maxPrice: number;
  suggestedPrice: number;
  /** current asking price (state listed) */
  listedPrice?: number;
  /** reason why it cannot be listed / repaired right now */
  disabled?: string;
}

export interface InventoryVM {
  parts: StockPartVM[];
  incoming: IncomingVM[];
  decor: StockDecorVM[];
  phones: UsedPhoneVM[];
  /** the showcase exists only from the kiosk on */
  showcaseLocked?: string;
}

/* ------------------------------------------------------------------ market */

export interface MarketListingVM {
  id: string;
  model: string;
  phoneColor?: string;
  seller: string;
  sellerColor?: string;
  /** seller's own words: "Caduto dal longtail, non si accende più" */
  pitch: string;
  /** visible / declared faults */
  issues: string[];
  /** true when there may be hidden faults */
  risky?: boolean;
  price: number;
  /** resale value once fully working */
  marketValue: number;
  sold?: boolean;
  disabled?: string;
}

export interface MarketVM {
  listings: MarketListingVM[];
  /** market not unlocked yet: reason */
  locked?: string;
}

/* ------------------------------------------------------------------ stats */

export interface StatsDayVM {
  day: number;
  income: number;
  expenses: number;
  /** reputation at the end of that day, 0..5 */
  reputation: number;
}

export interface StatsVM {
  days: StatsDayVM[];
  totals: {
    earned: number;
    spent: number;
    tips: number;
    repairs: number;
    perfectRepairs: number;
    customersServed: number;
    customersLost: number;
    phonesFlipped: number;
    /** best single-day profit */
    bestDay: number;
  };
}

/* ------------------------------------------------------------------ reviews */

export interface ReviewVM {
  id: string;
  customer: string;
  customerColor?: string;
  /** "Turista", "Sub"… */
  customerType?: string;
  /** 1..5, halves allowed */
  stars: number;
  text: string;
  day: number;
  model?: string;
  /** what drove the rating */
  factors?: Array<{ label: string; positive: boolean }>;
}

export interface ReviewsVM {
  reviews: ReviewVM[];
  average: number;
}

/* ------------------------------------------------------------------ encyclopedia */

export interface EncyclopediaEntryVM {
  id: string;
  name: string;
  icon?: IconId;
  unlocked: boolean;
  /** didactic description of what the part does (unlocked only) */
  description?: string;
  /** repair tip: "Scollegala sempre per prima" */
  tip?: string;
  facts?: Array<{ label: string; value: string }>;
  isNew?: boolean;
}

export interface EncyclopediaModelVM {
  id: string;
  name: string;
  year?: number;
  /** model not met yet */
  locked?: string;
  entries: EncyclopediaEntryVM[];
  /** reason why the exploded view is not available */
  explodedDisabled?: string;
}

export interface EncyclopediaVM {
  models: EncyclopediaModelVM[];
}

/* ------------------------------------------------------------------ assistant */

export interface AssistantVM {
  /** feature not available yet: reason ("Disponibile con il negozio") */
  locked?: string;
  hired: boolean;
  name: string;
  color?: string;
  /** short bio */
  bio: string;
  hireCost: number;
  wagePerDay: number;
  /** 1..3 */
  skill: number;
  /** what the assistant can do: "Batterie, porte di ricarica, pulizia" */
  abilities: string[];
  status?: 'idle' | 'working' | 'off';
  job?: { model: string; customer: string; job: string; progress: number; eta: string };
  doneToday?: number;
  doneTotal?: number;
  /** recent activity lines, newest first */
  log?: Array<{ time: string; text: string }>;
  hireDisabled?: string;
}

/* ------------------------------------------------------------------ root props */

export interface TabletProps {
  /** controlled active tab (omit to let the tablet keep its own state) */
  tab?: TabletTab;
  /** controlled catalog sub-tab */
  catalogTab?: CatalogTab;
  status: TabletStatus;
  /** badge counters on the rail (e.g. ready orders, new reviews) */
  badges?: Partial<Record<TabletTab, number>>;
  /** tabs not unlocked yet: reason shown as tooltip */
  lockedTabs?: Partial<Record<TabletTab, string>>;
  /** key cap shown on the close button (KeyboardEvent.code), default "Tab" */
  closeKey?: string;
  orders: OrdersVM;
  catalog: CatalogVM;
  inventory: InventoryVM;
  market: MarketVM;
  stats: StatsVM;
  reviews: ReviewsVM;
  encyclopedia: EncyclopediaVM;
  assistant: AssistantVM;
}

export interface TabletCallbacks {
  onClose(): void;
  onTabChange?(tab: TabletTab, catalogTab: CatalogTab): void;

  /* orders */
  onRepairOrder(orderId: string): void;
  onDeliverOrder(orderId: string): void;
  onAssignAssistant(orderId: string): void;

  /* catalog */
  onBuyTool(toolId: string): void;
  onOrderPart(modelId: string, categoryId: string, quality: BuyQuality, qty: number, express: boolean): void;
  onBuyDecor(decorId: string): void;
  onBuyExpansion(): void;
  onSetAwningColor(colorId: string): void;
  onSetWallColor(colorId: string): void;
  onRenameShop(name: string): void;

  /* inventory */
  /** jump to decoration mode with this item selected */
  onPlaceDecor(decorId: string): void;
  /** put an owned used phone on the work mat */
  onRepairUsedPhone(phoneId: string): void;
  onListUsedPhone(phoneId: string, price: number): void;
  onUnlistUsedPhone(phoneId: string): void;

  /* market */
  onBuyMarketPhone(listingId: string): void;

  /* encyclopedia */
  /** an unlocked entry was opened (lets the glue clear its "new" flag) */
  onOpenEncyclopediaEntry(modelId: string, entryId: string): void;
  onExplodedView(modelId: string): void;

  /* assistant */
  onHireAssistant(): void;
  onFireAssistant(): void;
}

/** Local UI state of the tablet (not part of the public API). */
export interface TabletState {
  tab: TabletTab;
  catalogTab: CatalogTab;
  partsModel: string;
  partsCategory: string;
  partsQty: number;
  partsExpress: boolean;
  decorCategory: string;
  inventoryTab: InventoryTab;
  /** asking price being edited, by phone id */
  listPrices: Record<string, number>;
  reviewFilter: 'all' | 'positive' | 'negative';
  encModel: string;
  encEntry: string | null;
  /** shop name being edited (null = show the saved one) */
  nameDraft: string | null;
  confirmFire: boolean;
  confirmExpansion: boolean;
}
