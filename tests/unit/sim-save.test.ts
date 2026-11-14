import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  MemoryStorage,
  SLOT_IDS,
  SaveManager,
  exportSave,
  importSave,
  migrateState,
  validateState,
  type StorageLike,
} from '../../src/core/save';
import { SCHEMA_VERSION, type GameState } from '../../src/core/state';
import { GameSim } from '../../src/gameplay/sim';
import { AutoPlayer } from '../../src/gameplay/sim/autoplay';
import { nextHint } from '../../src/gameplay/repair/hint';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function midGame(): GameSim {
  const sim = GameSim.newGame({ seed: 99, shopName: 'Save Me', skipTutorial: true });
  const bot = new AutoPlayer(sim, { seed: 5 });
  for (let d = 0; d < 3; d++) bot.playDay();
  return sim;
}

/** Turns a current state into what a schema-1 save looked like. */
function downgradeToV1(state: GameState): Record<string, unknown> {
  const v1 = clone(state) as unknown as Record<string, unknown>;
  v1.schemaVersion = 1;
  v1.customization = { awningColor: state.customization.awningColor, wallColor: '#abcdef' };
  v1.debt = 700;
  delete v1.loan;
  delete v1.playTime;
  delete v1.boatDay;
  delete v1.scrap;
  v1.tutorial = { phase: state.tutorial.phase, skipped: state.tutorial.skipped };
  v1.orders = (v1.orders as Array<Record<string, unknown>>).map((o) => {
    const copy = { ...o };
    delete copy.assistantTried;
    delete copy.targets;
    return copy;
  });
  return v1;
}

describe('save slots', () => {
  it('save → load gives back an identical state, also in the middle of a repair', () => {
    const sim = midGame();
    // accept a job and leave the phone half-disassembled on the bench
    let order = sim.orders().find((o) => o.kind === 'customer' && o.status === 'queued');
    for (let i = 0; i < 2000 && !order; i++) {
      sim.advance(2, { inRepair: false });
      if (sim.timeInfo().phase === 'summary') sim.startNextDay();
      const c = sim.customerAtCounter();
      if (c) {
        const out = sim.proposeQuote(c.id, c.options[0]!, 10);
        if (out.type === 'accepted') order = out.order;
      }
    }
    expect(order).toBeTruthy();
    sim.startRepair(order!.id);
    const session = sim.createSession(order!.id)!;
    const goal = { replace: [], clean: [], reseat: [], solder: [], teardown: true };
    for (let i = 0; i < 40; i++) {
      const h = nextHint(session, goal);
      if (!h.action || !session.perform(h.action).ok) break;
    }
    expect(Object.values(order!.phone.screws).some((s) => s.loc.k !== 'hole')).toBe(true);
    expect(order!.phone.poweredOn).toBe(false);

    const store = new SaveManager(new MemoryStorage(), 'test.', () => 1234567);
    const saved = store.save('slot2', sim.state);
    expect(saved).toEqual({
      ok: true,
      meta: {
        shopName: 'Save Me',
        day: sim.state.day,
        money: Math.round(sim.state.money),
        reputation: Math.round(sim.state.reputation.value * 100) / 100,
        stage: 1,
        playTime: Math.round(sim.state.playTime),
        savedAt: 1234567,
      },
    });
    const loaded = store.load('slot2');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.state).toEqual(sim.state);
    expect(loaded.state).not.toBe(sim.state);

    // the loaded game continues exactly like the original one
    const a = sim;
    const b = GameSim.fromState(loaded.state);
    for (let i = 0; i < 400; i++) {
      const ea = a.advance(3, { inRepair: i % 3 === 0 });
      const eb = b.advance(3, { inRepair: i % 3 === 0 });
      expect(eb).toEqual(ea);
    }
    expect(b.state).toEqual(a.state);
  });

  it('keeps three manual slots and the autosave apart', () => {
    const storage = new MemoryStorage();
    let now = 1000;
    const store = new SaveManager(storage, 'k.', () => now++);
    expect(store.list().map((i) => i.slot)).toEqual(SLOT_IDS);
    expect(store.list().every((i) => i.meta === null && !i.corrupt)).toBe(true);
    expect(store.load('slot1')).toEqual({ ok: false, error: 'empty' });
    expect(store.latest()).toBeNull();
    const a = GameSim.newGame({ seed: 1, shopName: 'A', skipTutorial: true });
    const b = GameSim.newGame({ seed: 2, shopName: 'B', skipTutorial: false });
    store.save('slot1', a.state);
    store.autosave(b.state);
    expect(store.info('slot1').meta!.shopName).toBe('A');
    expect(store.info('auto').meta!.shopName).toBe('B');
    expect(store.info('slot3').meta).toBeNull();
    expect(store.latest()).toBe('auto');
    const lb = store.load('auto');
    expect(lb.ok && lb.state.tutorial.phase).toBe('intro');
    store.delete('auto');
    expect(store.load('auto')).toEqual({ ok: false, error: 'empty' });
    expect(store.latest()).toBe('slot1');
  });

  it('exports and imports JSON text', () => {
    const sim = midGame();
    const text = exportSave(sim.state, 42);
    const res = importSave(text);
    expect(res.ok && res.state).toEqual(sim.state);
    const store = new SaveManager(new MemoryStorage());
    expect(store.importToSlot('slot3', text).ok).toBe(true);
    expect(store.exportSlot('slot3')).toBeTruthy();
    const again = importSave(store.exportSlot('slot3')!);
    expect(again.ok && again.state).toEqual(sim.state);
    expect(store.exportSlot('slot1')).toBeNull();
  });

  it('handles corrupt, foreign and future saves without throwing', () => {
    const storage = new MemoryStorage();
    const store = new SaveManager(storage, 'c.');
    const good = exportSave(GameSim.newGame({ seed: 3, shopName: 'C', skipTutorial: true }).state);
    const cases: Array<[string, string]> = [
      ['{not json', 'corrupt'],
      ['null', 'corrupt'],
      ['[]', 'corrupt'],
      ['{"app":"other","state":{}}', 'corrupt'],
      [good.slice(0, good.length / 2), 'corrupt'],
      [good.replace('"money":1500,"stage"', '"money":"lots","stage"'), 'corrupt'],
      [good.replace('"orders":[]', '"orders":[{"id":"x"}]'), 'corrupt'],
      [good.replace('"stage":1,"construction"', '"stage":7,"construction"'), 'corrupt'],
      [good.replace(`"schemaVersion":${SCHEMA_VERSION},"seed"`, '"schemaVersion":999,"seed"'), 'newer_version'],
      [good.replace(`"schemaVersion":${SCHEMA_VERSION},"seed"`, '"schemaVersion":0,"seed"'), 'corrupt'],
    ];
    for (const [text, error] of cases) {
      expect(text).not.toBe(good);
      storage.setItem('c.slot1', text);
      expect(store.load('slot1'), text.slice(0, 40)).toEqual({ ok: false, error });
      expect(() => store.list()).not.toThrow();
      expect(store.importToSlot('slot2', text).ok).toBe(false);
    }
    storage.setItem('c.slot1', '{broken');
    expect(store.info('slot1')).toEqual({ slot: 'slot1', meta: null, corrupt: true });
    expect(store.info('slot2').meta).toBeNull();
  });

  it('survives a storage that throws', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const store = new SaveManager(broken);
    const sim = GameSim.newGame({ seed: 3, shopName: 'C', skipTutorial: true });
    expect(store.save('slot1', sim.state)).toEqual({ ok: false, error: 'storage_failed' });
    expect(store.load('slot1')).toEqual({ ok: false, error: 'empty' });
    expect(store.list()).toHaveLength(4);
    expect(() => store.delete('slot1')).not.toThrow();
  });
});

describe('schema migrations', () => {
  it('has a step for every old version', () => {
    for (let v = 1; v < SCHEMA_VERSION; v++) expect(typeof MIGRATIONS[v]).toBe('function');
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
  });

  it('migrates a v1 save to the current schema', () => {
    const sim = midGame();
    const c = sim.customerAtCounter();
    if (c) sim.proposeQuote(c.id, c.options[0]!, 10);
    const current = sim.state;
    const v1 = downgradeToV1(current);
    expect(validateState(v1)).not.toBeNull();
    const text = JSON.stringify({ app: 'island-fix', schemaVersion: 1, meta: {}, state: v1 });
    const res = importSave(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.migratedFrom).toBe(1);
    const s = res.state;
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(validateState(s)).toBeNull();
    expect(s.customization).toEqual({ awningColor: current.customization.awningColor, accentColor: '#abcdef' });
    expect(s.loan).toEqual({ debt: 700 });
    expect('debt' in s).toBe(false);
    expect(s.playTime).toBe(0);
    expect(s.scrap).toEqual({});
    expect(s.boatDay).toBe(current.day);
    expect(s.tutorial.giftGiven).toBe(true);
    expect(s.orders.length).toBe(current.orders.length);
    for (const o of s.orders) {
      expect(o.assistantTried).toBe(false);
      expect(o.targets.length).toBeGreaterThan(0);
    }
    expect(s.money).toBe(current.money);
    expect(s.reputation).toEqual(current.reputation);
    // and the migrated game is playable
    const resumed = GameSim.fromState(s);
    const bot = new AutoPlayer(resumed, { seed: 1 });
    expect(bot.playDay().day).toBe(current.day);
  });

  it('rejects states without a usable version', () => {
    expect(migrateState({})).toEqual({ ok: false, error: 'corrupt' });
    expect(migrateState({ schemaVersion: 'two' })).toEqual({ ok: false, error: 'corrupt' });
    expect(migrateState({ schemaVersion: SCHEMA_VERSION + 1 })).toEqual({ ok: false, error: 'newer_version' });
  });
});

describe('state growth', () => {
  it('stays bounded over many simulated days', () => {
    const sim = GameSim.newGame({ seed: 2024, shopName: 'Long Run', skipTutorial: true });
    const bot = new AutoPlayer(sim, { seed: 9 });
    const sizes: number[] = [];
    for (let d = 1; d <= 75; d++) {
      bot.playDay();
      if (d % 15 === 0) sizes.push(JSON.stringify(sim.state).length);
    }
    const s = sim.state;
    expect(s.day).toBe(76);
    expect(s.history.length).toBeLessThanOrEqual(60);
    expect(s.reputation.reviews.length).toBeLessThanOrEqual(40);
    expect(s.reputation.total).toBeGreaterThan(150);
    expect(s.orders.length).toBeLessThanOrEqual(sim.rackCapacity());
    expect(s.owned.length).toBeLessThanOrEqual(sim.rackCapacity() + 12);
    expect(s.queue.length).toBeLessThanOrEqual(2);
    expect(s.market.listings.length).toBeLessThanOrEqual(4);
    expect(s.deliveries.length).toBeLessThan(40);
    expect(s.lastSummary!.series.length).toBeLessThanOrEqual(14);
    expect(s.encyclopedia.length).toBeLessThan(100);
    expect(validateState(clone(s))).toBeNull();
    // no trend: the late-game snapshots are all of the same order of magnitude
    const last = sizes[sizes.length - 1]!;
    expect(last).toBeLessThan(600_000);
    expect(last).toBeLessThan(sizes[2]! * 2);
  });
});
