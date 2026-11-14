/** Procedural customers: who they are, which phone they carry and what is wrong with it. */
import { PHONE_DEFS, PHONE_IDS } from '../../data/phones';
import { absTime, now, type Customer, type CustomerKind, type GameState, type Line, type Urgency } from '../../core/state';
import { FAULTS, FAULT_BY_ID, generateFaultyPhone, type FaultDef } from '../repair/faults';
import type { PhoneModel } from '../repair/model';
import { modelOf } from '../economy/parts';
import { toolTier } from '../shop/tools';
import { BALANCE, CUSTOMER_DATA, CUSTOMER_KINDS, clamp, type CharacterDef, type KindDef } from '../sim/balance';
import type { SimCtx } from '../sim/types';
import { buildOptions } from './diagnosis';

/** Faults of the same family never come together on one phone. */
const FAMILY: Record<string, string> = {
  cracked_screen: 'display',
  display_lines: 'display',
  loose_connector: 'display',
  burnt_connector: 'display',
  worn_battery: 'battery',
  dead_battery: 'battery',
  swollen_battery: 'battery',
  port_lint: 'port',
  port_broken: 'port',
  charge_ic: 'port',
  sea_water: 'dirt',
  sand_everywhere: 'dirt',
  sand_speaker: 'dirt',
  speaker_blown: 'speaker',
  earpiece_muffled: 'earpiece',
};
/** Small extra problems a customer may mention on top of the main one. */
const SECOND_FAULTS = ['port_lint', 'worn_battery', 'earpiece_muffled', 'cracked_screen', 'sand_speaker'];

const family = (id: string): string => FAMILY[id] ?? id;

export function missingToolsFor(s: GameState, faults: string[]): string[] {
  const out: string[] = [];
  for (const id of faults) {
    for (const tool of FAULT_BY_ID[id]?.needsTools ?? []) {
      if (toolTier(s, tool) < 1 && !out.includes(tool)) out.push(tool);
    }
  }
  return out;
}

function pickKind(ctx: SimCtx): CustomerKind {
  const rep = ctx.s.reputation.value;
  const kinds = CUSTOMER_KINDS.filter((k) => CUSTOMER_DATA.kinds[k].minReputation <= rep);
  return ctx.rng.weighted(kinds, (k) => CUSTOMER_DATA.kinds[k].weight);
}

export function unlockedModels(reputation: number): string[] {
  return PHONE_IDS.filter((id) => PHONE_DEFS[id]!.minReputation <= reputation);
}

function pickModel(ctx: SimCtx, kind: KindDef): string {
  const a = BALANCE.arrivals;
  const rep = ctx.s.reputation.value;
  const weights = a.modelWeights as Record<string, number>;
  return ctx.rng.weighted(unlockedModels(rep), (id) => {
    const def = PHONE_DEFS[id]!;
    const ramp = clamp(a.justUnlockedModelWeight + (1 - a.justUnlockedModelWeight) * ((rep - def.minReputation) / a.modelRampStars), 0, 1);
    return (weights[id] ?? 5) * (kind.modelBias[id] ?? 1) * ramp;
  });
}

function faultWeight(s: GameState, f: FaultDef, kind: KindDef): number {
  const feasible = f.needsTools.every((t) => toolTier(s, t) >= 1);
  return f.weight * (kind.faultBias[f.id] ?? 1) * (feasible ? 1 : BALANCE.arrivals.missingToolWeight);
}

function pickFaults(ctx: SimCtx, model: PhoneModel, kind: KindDef, preferred: string[] | null): string[] {
  const s = ctx.s;
  const rep = s.reputation.value;
  const pool = FAULTS.filter((f) => f.applicable(model) && f.minReputation <= rep);
  let main: FaultDef | undefined;
  if (preferred) {
    const mine = pool.filter((f) => preferred.includes(f.id));
    const feasible = mine.filter((f) => f.needsTools.every((t) => toolTier(s, t) >= 1));
    const from = feasible.length > 0 ? feasible : mine;
    if (from.length > 0) main = ctx.rng.pick(from);
  }
  if (!main) main = ctx.rng.weighted(pool, (f) => faultWeight(s, f, kind));
  const out = [main.id];
  const a = BALANCE.arrivals;
  // a reseat job never gets a companion: the engine's guide cannot plan "reseat + other work" (see docs/notes/sim.md)
  if (main.id !== 'loose_connector' && rep >= a.secondFaultMinRep && ctx.rng.chance(a.secondFaultChance)) {
    const extra = pool.filter(
      (f) => SECOND_FAULTS.includes(f.id) && family(f.id) !== family(main.id) && f.needsTools.every((t) => toolTier(s, t) >= 1),
    );
    if (extra.length > 0) out.push(ctx.rng.pick(extra).id);
  }
  return out;
}

function pickUrgency(ctx: SimCtx, kind: KindDef, faults: string[]): Urgency {
  const c = BALANCE.customers;
  const maxLabor = Math.max(...faults.map((f) => FAULT_BY_ID[f]?.labor ?? 0));
  const options: Urgency[] = ['normal'];
  if (ctx.s.time <= c.todayLatestAccept) options.push('today');
  if (faults.length === 1 && maxLabor <= c.waitFaultMaxLabor && ctx.s.time <= BALANCE.time.customersUntil - 1) options.push('wait');
  return ctx.rng.weighted(options, (u) => kind.urgency[u]);
}

function numbered(ctx: SimCtx, prefix: string, count: number): string {
  return `${prefix}${ctx.rng.int(1, Math.max(1, count))}`;
}

/** A line said by a customer: character-specific when available, else per kind, else generic. */
export function customerLine(
  ctx: SimCtx,
  who: { kind: CustomerKind; character: string | null },
  type: string,
  params?: Line['params'],
): Line {
  const d = CUSTOMER_DATA;
  let key: string;
  if (who.character && d.characterLines[type]) key = numbered(ctx, `customers.char.${who.character}.${type}`, d.characterLines[type]);
  else if (d.kindLines[type]) key = numbered(ctx, `customers.${who.kind}.${type}`, d.kindLines[type]);
  else key = numbered(ctx, `customers.any.${type}`, d.anyLines[type] ?? 1);
  return params ? { key, params } : { key };
}

function pickName(ctx: SimCtx, kind: KindDef): string {
  const pool = CUSTOMER_DATA.names[ctx.rng.pick(kind.names)] ?? CUSTOMER_DATA.names.intl!;
  const taken = new Set<string>([ctx.s.counter?.name ?? '', ...ctx.s.queue.map((q) => q.name)]);
  for (let i = 0; i < 6; i++) {
    const n = ctx.rng.pick(pool);
    if (!taken.has(n)) return n;
  }
  return ctx.rng.pick(pool);
}

export interface CustomerSpec {
  character?: string;
  /** scripted customers (tutorial) */
  kind?: CustomerKind;
  modelId?: string;
  faults?: string[];
  urgency?: Urgency;
  tutorial?: boolean;
}

export function generateCustomer(ctx: SimCtx, spec: CustomerSpec = {}): Customer {
  const s = ctx.s;
  const rng = ctx.rng;
  const ch: CharacterDef | undefined = spec.character ? CUSTOMER_DATA.characters[spec.character] : undefined;
  const kindId = spec.kind ?? ch?.kind ?? pickKind(ctx);
  const kind = CUSTOMER_DATA.kinds[kindId];
  const modelId = spec.modelId ?? pickModel(ctx, kind);
  const model = modelOf(modelId);
  const faults = spec.faults ?? pickFaults(ctx, model, kind, ch ? ch.faults : null);
  const id = ctx.id('cus');
  const { phone, goal } = generateFaultyPhone(model.def, faults, rng, `ph-${id}`);
  const urgency = spec.urgency ?? pickUrgency(ctx, kind, phone.faults);
  const patience = ch ? ch.patience : rng.range(kind.patience[0]!, kind.patience[1]!);
  const who = { kind: kindId, character: spec.character ?? null };
  const c = BALANCE.customers;
  const dueAt =
    urgency === 'today'
      ? absTime(s.day, Math.max(s.time + 2, rng.range(c.todayDue[0]!, c.todayDue[1]!)))
      : absTime(s.day + 1, rng.range(c.normalPickup[0]!, c.normalPickup[1]!));
  return {
    id,
    name: ch ? ch.name : pickName(ctx, kind),
    kind: kindId,
    character: who.character,
    look: ch ? ch.look : rng.int(1, 999999),
    voice: ch ? ch.voice : rng.pick(CUSTOMER_DATA.voices),
    budget: ch ? ch.budget : Math.round(rng.range(kind.budget[0]!, kind.budget[1]!) * 100) / 100,
    tipMult: ch ? ch.tipMult : 1,
    modelId,
    faults: [...phone.faults],
    phone,
    goal,
    greeting: customerLine(ctx, who, 'greet'),
    complaints: phone.faults.map((f) => ({ key: numbered(ctx, `faults.${f}.complaint`, FAULT_BY_ID[f]!.complaints) })),
    urgencyLine: customerLine(ctx, who, `urgent_${urgency}`),
    urgency,
    patience,
    patienceMax: patience,
    arrivedAt: now(s),
    missingTools: missingToolsFor(s, phone.faults),
    options: buildOptions(model, phone.faults, rng),
    toolsUsed: [],
    excluded: [],
    counter: null,
    haggles: 0,
    waitHours: spec.tutorial ? 999 : rng.range(c.waitHours[0]!, c.waitHours[1]!),
    dueAt,
    tutorial: !!spec.tutorial,
  };
}

/** Customers per game hour right now. */
export function arrivalRate(s: GameState, atmosphere: number): number {
  const a = BALANCE.arrivals;
  const t = BALANCE.time;
  if (s.time < t.customersFrom || s.time > t.customersUntil) return 0;
  const curve = a.hourCurve as number[][];
  let k = curve[0]![1]!;
  for (let i = 0; i < curve.length - 1; i++) {
    const [h0, v0] = curve[i] as [number, number];
    const [h1, v1] = curve[i + 1] as [number, number];
    if (s.time >= h0 && s.time <= h1) {
      k = v0 + ((v1 - v0) * (s.time - h0)) / (h1 - h0);
      break;
    }
  }
  const rep = 1 + a.repBonusPerStar * s.reputation.value;
  const atmo = 1 + Math.min(a.maxAtmoBonus, (a.atmoBonusPer100 * atmosphere) / 100);
  const rain = 1 - a.rainPenalty * s.weather.rain;
  return a.basePerHour * k * rep * atmo * rain * (a.stageMult[s.stage - 1] ?? 1);
}

/** Decides which recurring characters drop by today. */
export function scheduleCharacters(ctx: SimCtx): void {
  const s = ctx.s;
  const t = BALANCE.time;
  s.scheduled = [];
  for (const [id, def] of Object.entries(CUSTOMER_DATA.characters)) {
    if (s.recurring[id] === undefined) {
      s.recurring[id] = BALANCE.customers.recurringFirstDay + ctx.rng.int(0, def.interval[1]! - 1);
    }
    if (s.day < s.recurring[id]! || s.reputation.value < def.minReputation) continue;
    s.scheduled.push({ character: id, at: ctx.rng.range(t.customersFrom + 0.5, t.customersUntil - 2.5) });
    s.recurring[id] = s.day + ctx.rng.int(def.interval[0]!, def.interval[1]!);
  }
  s.scheduled.sort((a, b) => a.at - b.at);
}
