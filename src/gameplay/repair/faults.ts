import type { RNG } from '../../core/rng';
import { PhoneModel, createPhone } from './model';
import { refreshCondition } from './session';
import { emptyGoal, type ComponentDef, type FunctionId, type PartCategory, type PhoneDef, type PhoneInstance, type RepairGoal } from './types';

export interface FaultDef {
  id: string;
  /** relative frequency among customers */
  weight: number;
  /** minimum reputation before customers bring it */
  minReputation: number;
  /** base labour price in baht (multiplied by the model difficulty) */
  labor: number;
  /** tools the player must own for the job to be feasible (customers are told to come back otherwise) */
  needsTools: string[];
  /** part categories whose replacement the job consumes */
  parts: PartCategory[];
  /** number of vague complaint lines available in i18n: faults.<id>.complaint1..n */
  complaints: number;
  applicable(model: PhoneModel): boolean;
  apply(model: PhoneModel, phone: PhoneInstance, rng: RNG): void;
  goal(model: PhoneModel, phone: PhoneInstance): RepairGoal;
}

const byCat = (m: PhoneModel, cat: PartCategory): ComponentDef | undefined =>
  m.def.components.find((c) => c.partCategory === cat);
const byFn = (m: PhoneModel, fn: FunctionId): ComponentDef | undefined =>
  m.def.components.find((c) => c.functions.includes(fn) && c.partCategory !== 'logic_board');
const has = (cat: PartCategory) => (m: PhoneModel) => !!byCat(m, cat);

function dirty(phone: PhoneInstance, id: string, dirt: number, corrosion = 0): void {
  const cs = phone.comps[id]!;
  cs.dirt = Math.max(cs.dirt, dirt);
  cs.corrosion = Math.max(cs.corrosion, corrosion);
  refreshCondition(cs);
}

function replaceGoal(ids: Array<string | undefined>): RepairGoal {
  return { ...emptyGoal(), replace: ids.filter((x): x is string => !!x) };
}

function cleanGoal(model: PhoneModel, phone: PhoneInstance): RepairGoal {
  return {
    ...emptyGoal(),
    clean: model.def.components.filter((c) => phone.comps[c.id]!.dirt > 0.05 || phone.comps[c.id]!.corrosion > 0.05).map((c) => c.id),
  };
}

function damageCat(cat: PartCategory): FaultDef['apply'] {
  return (m, phone) => {
    const c = byCat(m, cat);
    if (c) phone.comps[c.id]!.condition = 'damaged';
  };
}

export const FAULTS: FaultDef[] = [
  {
    id: 'cracked_screen', weight: 16, minReputation: 0, labor: 350, needsTools: [], parts: ['display'], complaints: 3,
    applicable: has('display'), apply: damageCat('display'),
    goal: (m) => replaceGoal([byCat(m, 'display')?.id]),
  },
  {
    id: 'worn_battery', weight: 15, minReputation: 0, labor: 260, needsTools: [], parts: ['battery'], complaints: 3,
    applicable: has('battery'),
    apply: (m, phone, rng) => {
      phone.comps[byCat(m, 'battery')!.id]!.health = rng.range(0.42, 0.68);
    },
    goal: (m) => replaceGoal([byCat(m, 'battery')?.id]),
  },
  {
    id: 'dead_battery', weight: 7, minReputation: 0, labor: 280, needsTools: [], parts: ['battery'], complaints: 2,
    applicable: has('battery'),
    apply: (m, phone) => {
      phone.comps[byCat(m, 'battery')!.id]!.health = 0.03;
      phone.poweredOn = false;
    },
    goal: (m) => replaceGoal([byCat(m, 'battery')?.id]),
  },
  {
    id: 'swollen_battery', weight: 6, minReputation: 0.8, labor: 320, needsTools: [], parts: ['battery'], complaints: 2,
    applicable: has('battery'),
    apply: (m, phone) => {
      const cs = phone.comps[byCat(m, 'battery')!.id]!;
      cs.health = 0.3;
      cs.swollen = true;
      cs.condition = 'damaged';
      phone.poweredOn = false;
    },
    goal: (m) => replaceGoal([byCat(m, 'battery')?.id]),
  },
  {
    id: 'port_lint', weight: 12, minReputation: 0, labor: 120, needsTools: [], parts: [], complaints: 3,
    applicable: has('charge_port'),
    apply: (m, phone, rng) => dirty(phone, byCat(m, 'charge_port')!.id, rng.range(0.8, 1)),
    goal: (m) => ({ ...emptyGoal(), clean: [byCat(m, 'charge_port')!.id] }),
  },
  {
    id: 'port_broken', weight: 8, minReputation: 0.5, labor: 380, needsTools: [], parts: ['charge_port'], complaints: 2,
    applicable: has('charge_port'), apply: damageCat('charge_port'),
    goal: (m) => replaceGoal([byCat(m, 'charge_port')?.id]),
  },
  {
    id: 'sea_water', weight: 9, minReputation: 1, labor: 520, needsTools: ['ipa'], parts: [], complaints: 3,
    applicable: () => true,
    apply: (m, phone, rng) => {
      if (m.boardId) dirty(phone, m.boardId, 0.2, rng.range(0.4, 0.75));
      const port = byCat(m, 'charge_port');
      if (port) dirty(phone, port.id, 0.3, rng.range(0.45, 0.7));
      const spk = byCat(m, 'speaker');
      if (spk) dirty(phone, spk.id, 0.4, rng.range(0.3, 0.6));
      const disp = byCat(m, 'display');
      if (disp && rng.chance(0.6)) dirty(phone, disp.id, 0, rng.range(0.2, 0.45));
      const tap = byCat(m, 'taptic');
      if (tap && rng.chance(0.5)) dirty(phone, tap.id, 0.2, rng.range(0.2, 0.5));
      phone.flags.water = true;
      if (m.boardId && phone.comps[m.boardId]!.corrosion > 0.6) phone.poweredOn = false;
    },
    goal: cleanGoal,
  },
  {
    id: 'speaker_blown', weight: 7, minReputation: 0.3, labor: 300, needsTools: [], parts: ['speaker'], complaints: 2,
    applicable: has('speaker'), apply: damageCat('speaker'),
    goal: (m) => replaceGoal([byCat(m, 'speaker')?.id]),
  },
  {
    id: 'sand_speaker', weight: 9, minReputation: 0, labor: 240, needsTools: [], parts: [], complaints: 3,
    applicable: has('speaker'),
    apply: (m, phone, rng) => {
      dirty(phone, byCat(m, 'speaker')!.id, rng.range(0.7, 0.95));
      const port = byCat(m, 'charge_port');
      if (port) dirty(phone, port.id, rng.range(0.55, 0.8));
    },
    goal: cleanGoal,
  },
  {
    id: 'earpiece_muffled', weight: 7, minReputation: 0.3, labor: 200, needsTools: [], parts: [], complaints: 2,
    applicable: (m) => !!byFn(m, 'earpiece'),
    apply: (m, phone, rng) => dirty(phone, byFn(m, 'earpiece')!.id, rng.range(0.75, 1)),
    goal: (m) => ({ ...emptyGoal(), clean: [byFn(m, 'earpiece')!.id] }),
  },
  {
    id: 'rear_camera_broken', weight: 7, minReputation: 0.8, labor: 330, needsTools: [], parts: ['rear_camera'], complaints: 2,
    applicable: has('rear_camera'), apply: damageCat('rear_camera'),
    goal: (m) => replaceGoal([byCat(m, 'rear_camera')?.id]),
  },
  {
    id: 'front_camera_broken', weight: 4, minReputation: 1.5, labor: 380, needsTools: [], parts: ['front_sensor'], complaints: 2,
    applicable: (m) => !!byFn(m, 'frontCamera'),
    apply: (m, phone) => {
      phone.comps[byFn(m, 'frontCamera')!.id]!.condition = 'damaged';
    },
    goal: (m) => replaceGoal([byFn(m, 'frontCamera')?.id]),
  },
  {
    id: 'taptic_dead', weight: 5, minReputation: 0.5, labor: 260, needsTools: [], parts: ['taptic'], complaints: 2,
    applicable: has('taptic'), apply: damageCat('taptic'),
    goal: (m) => replaceGoal([byCat(m, 'taptic')?.id]),
  },
  {
    id: 'display_lines', weight: 6, minReputation: 1.2, labor: 300, needsTools: ['ipa'], parts: [], complaints: 2,
    applicable: has('display'),
    apply: (m, phone, rng) => dirty(phone, byCat(m, 'display')!.id, 0, rng.range(0.4, 0.6)),
    goal: (m) => ({ ...emptyGoal(), clean: [byCat(m, 'display')!.id] }),
  },
  {
    id: 'loose_connector', weight: 5, minReputation: 0.6, labor: 220, needsTools: [], parts: [], complaints: 2,
    applicable: has('display'),
    apply: (m, phone) => {
      const disp = byCat(m, 'display')!;
      const conn = m.connectorsOf(disp).find((f) => !f.local);
      if (conn) phone.connectors[conn.id]!.connected = false;
      phone.flags.prevRepair = true;
    },
    goal: (m) => {
      const disp = byCat(m, 'display')!;
      const conn = m.connectorsOf(disp).find((f) => !f.local);
      return { ...emptyGoal(), reseat: conn ? [conn.id] : [] };
    },
  },
  {
    id: 'sand_everywhere', weight: 6, minReputation: 0.8, labor: 420, needsTools: [], parts: [], complaints: 2,
    applicable: () => true,
    apply: (m, phone, rng) => {
      for (const c of m.def.components) {
        if (c.partCategory === 'bracket' || c.partCategory === 'housing' || c.partCategory === 'sim_tray') continue;
        if (c.partCategory === 'display' || c.partCategory === 'back_glass') continue;
        if (rng.chance(0.6)) dirty(phone, c.id, rng.range(0.45, 0.9));
      }
      const port = byCat(m, 'charge_port');
      if (port) dirty(phone, port.id, rng.range(0.6, 0.9));
    },
    goal: cleanGoal,
  },
  {
    id: 'back_glass_cracked', weight: 6, minReputation: 3, labor: 480, needsTools: [], parts: ['back_glass'], complaints: 2,
    applicable: has('back_glass'), apply: damageCat('back_glass'),
    goal: (m) => replaceGoal([byCat(m, 'back_glass')?.id]),
  },
  {
    id: 'charge_ic', weight: 5, minReputation: 3.2, labor: 1400, needsTools: ['solder', 'microscope'], parts: [], complaints: 2,
    applicable: () => true,
    apply: (_m, phone) => {
      phone.boardFaults.push({ id: 'charge_ic', kind: 'charge_ic', affects: ['charging'] });
    },
    goal: () => ({ ...emptyGoal(), solder: ['charge_ic'] }),
  },
  {
    id: 'burnt_connector', weight: 4, minReputation: 3.5, labor: 1600, needsTools: ['solder', 'microscope'], parts: [], complaints: 2,
    applicable: has('display'),
    apply: (m, phone) => {
      const disp = byCat(m, 'display')!;
      const conn = m.connectorsOf(disp).find((f) => !f.local);
      if (!conn) return;
      phone.connectors[conn.id]!.damaged = true;
      phone.boardFaults.push({ id: `conn_${conn.id}`, kind: 'connector', affects: ['display'], ref: conn.id });
    },
    goal: (_m, phone) => ({ ...emptyGoal(), solder: phone.boardFaults.filter((f) => f.kind === 'connector').map((f) => f.id) }),
  },
];

export const FAULT_BY_ID: Record<string, FaultDef> = Object.fromEntries(FAULTS.map((f) => [f.id, f]));

export function mergeGoals(goals: RepairGoal[]): RepairGoal {
  const out = emptyGoal();
  for (const g of goals) {
    for (const k of ['replace', 'clean', 'reseat', 'solder'] as const) {
      for (const v of g[k]) if (!out[k].includes(v)) out[k].push(v);
    }
    if (g.teardown) out.teardown = true;
  }
  return out;
}

/** Builds a customer's phone: a healthy unit with wear, beach grime and the given faults applied. */
export function generateFaultyPhone(def: PhoneDef, faultIds: string[], rng: RNG, uid: string): { phone: PhoneInstance; goal: RepairGoal } {
  const model = new PhoneModel(def);
  const phone = createPhone(def, uid, rng.int(0, def.colors.length - 1));
  if (model.batteryId) phone.comps[model.batteryId]!.health = rng.range(0.83, 0.97);
  // a little beach life on every phone: not part of the job, but cleaning it earns goodwill
  for (const c of def.components) {
    if (c.partCategory === 'speaker' || c.partCategory === 'charge_port') {
      if (rng.chance(0.5)) phone.comps[c.id]!.dirt = rng.range(0.05, 0.28);
    }
  }
  const goals: RepairGoal[] = [];
  for (const id of faultIds) {
    const f = FAULT_BY_ID[id];
    if (!f || !f.applicable(model)) continue;
    f.apply(model, phone, rng);
    phone.faults.push(id);
  }
  for (const id of phone.faults) goals.push(FAULT_BY_ID[id]!.goal(model, phone));
  return { phone, goal: mergeGoals(goals) };
}
