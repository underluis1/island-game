/**
 * Save slots: three manual slots plus the autosave, stored as JSON strings in a `StorageLike`
 * (localStorage in the browser, an in-memory map in tests). Every file carries a schema version;
 * older files go through the migration chain, corrupt ones produce a handled error, never a crash.
 */
import { SCHEMA_VERSION, type GameState } from './state';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOT_IDS: SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];
export const MANUAL_SLOTS: SlotId[] = ['slot1', 'slot2', 'slot3'];

export interface SlotMeta {
  shopName: string;
  day: number;
  money: number;
  reputation: number;
  stage: number;
  /** real seconds played */
  playTime: number;
  /** real-world timestamp (ms since epoch) of the save */
  savedAt: number;
}

export interface SaveFile {
  app: 'island-fix';
  schemaVersion: number;
  meta: SlotMeta;
  state: unknown;
}

export interface SlotInfo {
  slot: SlotId;
  /** null when the slot is empty or unreadable */
  meta: SlotMeta | null;
  /** the slot holds data that cannot be read */
  corrupt: boolean;
}

/** `error` is an i18n key suffix: economy.save.<error> */
export type SaveError = 'empty' | 'corrupt' | 'newer_version' | 'storage_failed';
export type LoadResult = { ok: true; state: GameState; migratedFrom: number | null } | { ok: false; error: SaveError };
export type SaveResult = { ok: true; meta: SlotMeta } | { ok: false; error: SaveError };

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/* ---------------------------------------------------------------- migrations */

/**
 * migrations[n] upgrades a state of schema n to schema n + 1.
 *
 * v1 → v2: the shop accent used to be `customization.wallColor`; Somchai's loan was a bare
 * `debt` number; play time, the supplier-boat marker, the display scrap box and the tutorial
 * gift flag did not exist; orders had no `assistantTried` flag and no `targets` list (rebuilt
 * from the baseline report: every function that was failing or degraded at acceptance).
 */
export const MIGRATIONS: Record<number, (state: Json) => Json> = {
  1: (old) => {
    const s: Json = { ...old };
    const cust = isObj(s.customization) ? { ...s.customization } : {};
    if (!isStr(cust.accentColor)) cust.accentColor = isStr(cust.wallColor) ? cust.wallColor : '#2bb5a8';
    delete cust.wallColor;
    if (!isStr(cust.awningColor)) cust.awningColor = '#e8553d';
    s.customization = cust;
    if (!isObj(s.loan)) s.loan = { debt: isNum(s.debt) ? Math.max(0, s.debt) : 0 };
    delete s.debt;
    if (!isNum(s.playTime)) s.playTime = 0;
    if (!isNum(s.boatDay)) s.boatDay = isNum(s.day) ? s.day : 0;
    if (!isObj(s.scrap)) s.scrap = {};
    const tut: Json = isObj(s.tutorial) ? { ...s.tutorial } : { phase: 'done', skipped: true };
    if (typeof tut.giftGiven !== 'boolean') tut.giftGiven = tut.phase === 'done' || tut.phase === 'first_purchase';
    s.tutorial = tut;
    if (Array.isArray(s.orders)) {
      s.orders = s.orders.map((o: unknown) => {
        if (!isObj(o)) return o;
        const order: Json = { ...o };
        if (typeof order.assistantTried !== 'boolean') order.assistantTried = false;
        if (!Array.isArray(order.targets)) {
          const fns = isObj(order.baseline) && isObj(order.baseline.functions) ? order.baseline.functions : {};
          order.targets = Object.keys(fns).filter((fn) => fns[fn] === 'fail' || fns[fn] === 'degraded');
        }
        return order;
      });
    }
    s.schemaVersion = 2;
    return s;
  },
};

export function migrateState(raw: unknown): { ok: true; state: Json; from: number } | { ok: false; error: SaveError } {
  if (!isObj(raw) || !isNum(raw.schemaVersion)) return { ok: false, error: 'corrupt' };
  const from = raw.schemaVersion;
  if (from > SCHEMA_VERSION) return { ok: false, error: 'newer_version' };
  if (from < 1) return { ok: false, error: 'corrupt' };
  let state: Json = raw;
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, error: 'corrupt' };
    try {
      state = step(state);
    } catch {
      return { ok: false, error: 'corrupt' };
    }
  }
  return { ok: true, state, from };
}

/* ---------------------------------------------------------------- validation */

function isPhone(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.uid) &&
    isStr(v.modelId) &&
    isObj(v.comps) &&
    isObj(v.screws) &&
    isObj(v.holes) &&
    isObj(v.adhesives) &&
    isObj(v.connectors) &&
    Array.isArray(v.boardFaults) &&
    Array.isArray(v.mistakes) &&
    isObj(v.flags)
  );
}

function isGoal(v: unknown): boolean {
  return isObj(v) && Array.isArray(v.replace) && Array.isArray(v.clean) && Array.isArray(v.reseat) && Array.isArray(v.solder);
}

function isCustomer(v: unknown): boolean {
  return isObj(v) && isStr(v.id) && isStr(v.name) && isStr(v.modelId) && isPhone(v.phone) && isGoal(v.goal) && Array.isArray(v.options) && isNum(v.patience);
}

function isOrder(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.status) &&
    isStr(v.modelId) &&
    isPhone(v.phone) &&
    isGoal(v.goal) &&
    isObj(v.baseline) &&
    isObj(v.persona) &&
    Array.isArray(v.targets) &&
    isNum(v.price) &&
    isNum(v.dueAt)
  );
}

function isOwned(v: unknown): boolean {
  return isObj(v) && isStr(v.id) && isStr(v.status) && isPhone(v.phone) && isGoal(v.goal) && isNum(v.buyPrice);
}

function numberRecord(v: unknown): boolean {
  return isObj(v) && Object.values(v).every(isNum);
}

/** Structural check of a current-schema state. Returns the first problem found, or null when sound. */
export function validateState(v: unknown): string | null {
  if (!isObj(v)) return 'not an object';
  if (v.schemaVersion !== SCHEMA_VERSION) return 'schemaVersion';
  for (const k of ['seed', 'rng', 'nextId', 'playTime', 'day', 'time', 'money', 'stage', 'construction', 'nextArrivalAt', 'boatDay']) {
    if (!isNum(v[k])) return k;
  }
  if (!isStr(v.shopName)) return 'shopName';
  if (v.dayPhase !== 'open' && v.dayPhase !== 'summary') return 'dayPhase';
  if (![1, 2, 3].includes(v.stage as number)) return 'stage';
  if ((v.day as number) < 1 || (v.time as number) < 0 || (v.time as number) > 24) return 'clock';
  if (!isObj(v.customization) || !isStr(v.customization.awningColor) || !isStr(v.customization.accentColor)) return 'customization';
  if (!numberRecord(v.tools)) return 'tools';
  if (!numberRecord(v.parts)) return 'parts';
  if (!numberRecord(v.scrap)) return 'scrap';
  if (!numberRecord(v.recurring)) return 'recurring';
  for (const k of ['deliveries', 'queue', 'scheduled', 'orders', 'owned', 'decor', 'history', 'encyclopedia']) {
    if (!Array.isArray(v[k])) return k;
  }
  if (v.counter !== null && !isCustomer(v.counter)) return 'counter';
  if (!(v.queue as unknown[]).every(isCustomer)) return 'queue';
  if (!(v.orders as unknown[]).every(isOrder)) return 'orders';
  if (!(v.owned as unknown[]).every(isOwned)) return 'owned';
  if (!(v.decor as unknown[]).every((d) => isObj(d) && isStr(d.uid) && isStr(d.itemId))) return 'decor';
  if (!(v.deliveries as unknown[]).every((d) => isObj(d) && isStr(d.modelId) && isNum(d.qty) && isNum(d.arriveAt))) return 'deliveries';
  if (!isObj(v.market) || !Array.isArray(v.market.listings)) return 'market';
  const rep = v.reputation;
  if (!isObj(rep) || !isNum(rep.value) || !isNum(rep.total) || !isNum(rep.penalty) || !Array.isArray(rep.reviews)) return 'reputation';
  if (!rep.reviews.every((r: unknown) => isObj(r) && isNum(r.stars) && Array.isArray(r.text))) return 'reviews';
  if (!isObj(v.loan) || !isNum(v.loan.debt)) return 'loan';
  const led = v.ledger;
  if (!isObj(led) || !numberRecord(led.income) || !numberRecord(led.expenses) || !Array.isArray(led.reviews)) return 'ledger';
  if (!isObj(v.weather) || !isNum(v.weather.rain)) return 'weather';
  if (!isObj(v.assistant) || typeof v.assistant.hired !== 'boolean') return 'assistant';
  if (!isObj(v.tutorial) || !isStr(v.tutorial.phase)) return 'tutorial';
  if (!isObj(v.stats) || !isNum(v.stats.repairs)) return 'stats';
  if (v.lastSummary !== null && !isObj(v.lastSummary)) return 'lastSummary';
  return null;
}

/* ---------------------------------------------------------------- (de)serialisation */

export function metaOf(state: GameState, savedAt: number): SlotMeta {
  return {
    shopName: state.shopName,
    day: state.day,
    money: Math.round(state.money),
    reputation: Math.round(state.reputation.value * 100) / 100,
    stage: state.stage,
    playTime: Math.round(state.playTime),
    savedAt,
  };
}

function isMeta(v: unknown): v is SlotMeta {
  return isObj(v) && isStr(v.shopName) && isNum(v.day) && isNum(v.money) && isNum(v.reputation) && isNum(v.stage) && isNum(v.playTime) && isNum(v.savedAt);
}

/** Serialises a state into the text of a save file (also used for "export"). */
export function exportSave(state: GameState, savedAt: number = Date.now()): string {
  const file: SaveFile = { app: 'island-fix', schemaVersion: state.schemaVersion, meta: metaOf(state, savedAt), state };
  return JSON.stringify(file);
}

/** Parses the text of a save file (also used for "import"): parse → migrate → validate. */
export function importSave(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'corrupt' };
  }
  if (!isObj(parsed) || parsed.app !== 'island-fix' || !isObj(parsed.state)) return { ok: false, error: 'corrupt' };
  const migrated = migrateState(parsed.state);
  if (!migrated.ok) return migrated;
  if (validateState(migrated.state) !== null) return { ok: false, error: 'corrupt' };
  return {
    ok: true,
    state: migrated.state as unknown as GameState,
    migratedFrom: migrated.from === SCHEMA_VERSION ? null : migrated.from,
  };
}

/* ---------------------------------------------------------------- slots */

export class SaveManager {
  constructor(
    private readonly storage: StorageLike,
    private readonly prefix = 'islandfix.save.',
    private readonly clock: () => number = Date.now,
  ) {}

  private key(slot: SlotId): string {
    return this.prefix + slot;
  }

  save(slot: SlotId, state: GameState): SaveResult {
    const savedAt = this.clock();
    try {
      this.storage.setItem(this.key(slot), exportSave(state, savedAt));
    } catch {
      return { ok: false, error: 'storage_failed' };
    }
    return { ok: true, meta: metaOf(state, savedAt) };
  }

  autosave(state: GameState): SaveResult {
    return this.save('auto', state);
  }

  private read(slot: SlotId): string | null {
    try {
      return this.storage.getItem(this.key(slot));
    } catch {
      return null;
    }
  }

  load(slot: SlotId): LoadResult {
    const text = this.read(slot);
    if (text === null || text === '') return { ok: false, error: 'empty' };
    return importSave(text);
  }

  /** Slot overview for the load/save menu. Never throws. */
  info(slot: SlotId): SlotInfo {
    const text = this.read(slot);
    if (text === null || text === '') return { slot, meta: null, corrupt: false };
    try {
      const parsed: unknown = JSON.parse(text);
      if (isObj(parsed) && parsed.app === 'island-fix' && isMeta(parsed.meta)) return { slot, meta: parsed.meta, corrupt: false };
    } catch {
      /* fall through: reported as corrupt */
    }
    return { slot, meta: null, corrupt: true };
  }

  list(): SlotInfo[] {
    return SLOT_IDS.map((slot) => this.info(slot));
  }

  /** Most recently written readable slot, for "Continue". */
  latest(): SlotId | null {
    let best: SlotInfo | null = null;
    for (const i of this.list()) {
      if (i.meta && (!best || i.meta.savedAt > (best.meta as SlotMeta).savedAt)) best = i;
    }
    return best ? best.slot : null;
  }

  delete(slot: SlotId): void {
    try {
      this.storage.removeItem(this.key(slot));
    } catch {
      /* nothing to delete */
    }
  }

  /** Text of a slot for the "export" button, null when empty. */
  exportSlot(slot: SlotId): string | null {
    return this.read(slot);
  }

  /** Validates imported text and stores it in a slot. */
  importToSlot(slot: SlotId, text: string): LoadResult {
    const res = importSave(text);
    if (!res.ok) return res;
    const saved = this.save(slot, res.state);
    return saved.ok ? res : { ok: false, error: saved.error };
  }
}

/** In-memory storage for tests and for browsers where localStorage is unavailable. */
export class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** localStorage when usable, otherwise a volatile in-memory store. */
export function defaultStorage(): StorageLike {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (ls) {
      ls.setItem('islandfix.probe', '1');
      ls.removeItem('islandfix.probe');
      return ls;
    }
  } catch {
    /* private mode or disabled storage */
  }
  return new MemoryStorage();
}
