/**
 * Automation API for end-to-end tests and screenshots (`window.__game`).
 * Installed only in development builds or with `?debug` in the URL.
 */
import { RNG } from '../core/rng';
import type { SlotId } from '../core/save';
import { phoneDef } from '../data/phones';
import { evaluatePhone } from '../gameplay/repair/evaluate';
import { generateFaultyPhone } from '../gameplay/repair/faults';
import { partKey, type ReplacementQuality } from '../core/state';
import type { Game } from './game';
import type { ToolId } from './repair-view';

export function installDebugApi(game: Game): void {
  const api = {
    game,
    ready: () => game.ready,
    mode: () => game.mode,
    state: () => game.state,
    snapshot: () => JSON.stringify(game.state),
    stats: () => game.stats(),
    newGame: (name = 'Test Fix', skipTutorial = false, seed?: number) => game.newGame(name, 'slot1', skipTutorial, seed),
    skipTutorial: () => game.skipTutorial(),
    enterRepair: (id?: string) => game.enterRepair(id),
    exitRepair: () => game.exitRepair(),
    hint: () => game.repair.hint,
    tool: (id: ToolId | null) => game.repair.selectTool(id),
    /** Performs up to n recommended steps; returns the last hint key. */
    autoRepair: (n = 5000): string => {
      const sim = game.sim;
      let last = '';
      for (let i = 0; i < n; i++) {
        const h = game.repair.hint;
        if (!h || !game.repair.session) return 'no-session';
        last = h.textKey;
        if (h.done || !h.action) break;
        let action = h.action;
        if (action.t === 'replace' && sim) {
          const def = game.repair.session.model.comp(action.comp);
          const modelId = game.repair.session.model.def.id;
          const q = (['good', 'refurb', 'cheap'] as ReplacementQuality[]).find((x) => (sim.state.parts[partKey(modelId, def.partCategory, x)] ?? 0) > 0);
          if (!q || !sim.consumePart(modelId, def.partCategory, q)) return 'no-part';
          action = { ...action, quality: q };
        }
        if (!game.repair.perform(action).ok) return `failed:${last}`;
      }
      return last;
    },
    finalTest: () => game.runFinalTest(),
    acceptFairQuote: () => game.acceptFairQuote(),
    deliver: (orderId: string) => game.deliver(orderId),
    openTablet: (tab?: 'orders' | 'catalog' | 'inventory' | 'market' | 'stats' | 'reviews' | 'encyclopedia' | 'assistant') => game.openTablet(tab),
    closeTablet: () => game.closeTablet(),
    enterDecor: () => game.enterDecor(),
    exitDecor: () => game.exitDecor(),
    /** Buys a decoration and drops it on the first valid spot. */
    placeAnyDecor: (itemId: string): boolean => {
      const sim = game.sim;
      if (!sim) return false;
      const res = sim.buyDecor(itemId);
      if (!res.ok || !res.uid) return false;
      const def = game.stall.decorDef(itemId);
      if (!def) return false;
      if (def.placement !== 'ground') {
        for (const slot of game.stall.slots(def.placement)) {
          if (sim.placeDecor(res.uid, { x: slot.position.x, z: slot.position.z, rot: 0 }).ok) {
            game.stall.syncDecor(sim.state);
            return true;
          }
        }
        return false;
      }
      for (let x = -5.25; x <= 5.25; x += 0.5) {
        for (let z = -4.25; z <= 5.25; z += 0.5) {
          if (sim.placeDecor(res.uid, { x, z, rot: 0 }).ok) {
            game.stall.syncDecor(sim.state);
            return true;
          }
        }
      }
      return false;
    },
    simulateDay: () => {
      game.simulateDay();
      const st = game.stats();
      return { day: game.state?.day ?? 0, geometries: st.geometries, textures: st.textures, stateSize: JSON.stringify(game.state).length };
    },
    /** Adds a broken phone of our own to the rack (used to try specific faults). */
    addOwnedPhone: (modelId: string, faults: string[]): string | null => {
      const sim = game.sim;
      if (!sim) return null;
      const { phone, goal } = generateFaultyPhone(phoneDef(modelId), faults, new RNG(sim.state.nextId + 17), `dbg${sim.state.nextId}`);
      const id = `own-dbg${sim.state.nextId++}`;
      sim.state.owned.push({ id, modelId, phone, goal, baseline: evaluatePhone(phoneDef(modelId), phone), faults, buyPrice: 0, status: 'broken', askPrice: 0, sellAt: null, boughtDay: sim.state.day });
      return id;
    },
    buyTool: (id: string) => game.sim?.buyTool(id).ok ?? false,
    save: (slot: SlotId = 'slot1') => (game.sim ? game.saves.save(slot, game.sim.state).ok : false),
    load: (slot: SlotId = 'slot1') => game.loadGame(slot),
    /** Jumps the clock (hours); used for screenshots of dawn/golden hour/night. */
    setTime: (h: number) => {
      if (game.sim) game.sim.state.time = h;
    },
    setRain: (r: number) => {
      if (game.sim) game.sim.state.weather.rain = r;
    },
    /** Puts every spare the active job needs in stock (good grade). */
    stockPartsForJob: () => {
      const sim = game.sim;
      const id = game.activeJobId;
      const ref = sim && id ? sim.job(id) : null;
      if (!sim || !ref) return 0;
      let n = 0;
      for (const cat of sim.partsNeeded(ref.job.id)) {
        const key = partKey(ref.job.modelId, cat, 'good');
        sim.state.parts[key] = (sim.state.parts[key] ?? 0) + 1;
        n++;
      }
      return n;
    },
    giveMoney: (n: number) => {
      if (game.sim) game.sim.state.money += n;
    },
  };
  (window as unknown as { __game: typeof api }).__game = api;
}
