/**
 * Diagnosis: the customer only gives a vague symptom. The player picks one of 3-4 plausible diagnoses;
 * instruments rule options out. An option is excluded by an instrument when no phone with that
 * diagnosis could produce the reading the instrument shows on the real phone.
 */
import { RNG, hashString } from '../../core/rng';
import type { Customer, DiagnosisTool, GameState, Line } from '../../core/state';
import { ammeterReading, batteryInfo, visualInspection } from '../repair/diagnostics';
import { FAULTS, FAULT_BY_ID, generateFaultyPhone } from '../repair/faults';
import type { PhoneModel } from '../repair/model';
import type { PhoneInstance } from '../repair/types';
import { diagnosisId, parseDiagnosis } from '../economy/pricing';
import { modelOf } from '../economy/parts';
import { toolTier } from '../shop/tools';
import { CUSTOMER_DATA } from '../sim/balance';
import type { DiagnosisClue, DiagnosisOption } from '../sim/types';

const HYPOTHESES = 6;

export function toolAvailable(s: GameState, tool: DiagnosisTool): boolean {
  switch (tool) {
    case 'visual':
      return true;
    case 'multimeter':
      return toolTier(s, 'multimeter') >= 1;
    case 'battester':
      return toolTier(s, 'battester') >= 1;
    case 'psu':
      return toolTier(s, 'multimeter') >= 2;
  }
}

function batteryBucket(model: PhoneModel, phone: PhoneInstance): string {
  const info = batteryInfo(model, phone);
  if (!info.present) return 'missing';
  if (info.swollen) return 'swollen';
  if (info.healthPct < 8) return 'dead';
  if (info.healthPct < 73) return 'worn';
  return 'ok';
}

function psuFindings(model: PhoneModel, phone: PhoneInstance): string[] {
  const out = [...new Set(phone.boardFaults.map((f) => f.kind))].sort() as string[];
  if (model.boardId && phone.comps[model.boardId]!.corrosion > 0.3) out.push('corrosion');
  return out;
}

function signature(tool: DiagnosisTool, model: PhoneModel, phone: PhoneInstance): string {
  switch (tool) {
    case 'visual':
      return visualInspection(model, phone).sort().join(',');
    case 'multimeter':
      return ammeterReading(model, phone).pattern;
    case 'battester':
      return batteryBucket(model, phone);
    case 'psu':
      return psuFindings(model, phone).join(',');
  }
}

/** Could a phone with exactly these faults show this signature? */
function compatible(tool: DiagnosisTool, model: PhoneModel, faults: string[], actual: string): boolean {
  const base = hashString(`${model.def.id}:${faults.join('+')}`);
  for (let k = 0; k < HYPOTHESES; k++) {
    const { phone } = generateFaultyPhone(model.def, faults, new RNG(base + k * 7919), 'hypothesis');
    if (signature(tool, model, phone) === actual) return true;
  }
  return false;
}

/** Builds the shuffled option list: the true diagnosis plus decoys that fit the same symptom. */
export function buildOptions(model: PhoneModel, faults: string[], rng: RNG): string[] {
  const truth = diagnosisId(faults);
  const options = [truth];
  const usable = (id: string): boolean => !!FAULT_BY_ID[id] && FAULT_BY_ID[id]!.applicable(model);
  const add = (fs: string[]): void => {
    const id = diagnosisId(fs);
    if (options.length < 4 && !options.includes(id) && fs.every(usable)) options.push(id);
  };
  if (faults.length >= 2) {
    const [a, b] = faults as [string, string];
    add([a]);
    add([b]);
    for (const alt of rng.shuffle([...(CUSTOMER_DATA.confusions[b] ?? [])])) {
      if (alt !== a) add([a, alt]);
    }
  } else {
    const main = faults[0] as string;
    for (const alt of rng.shuffle([...(CUSTOMER_DATA.confusions[main] ?? [])])) add([alt]);
    for (const f of rng.shuffle(FAULTS.map((x) => x.id))) add([f]);
  }
  return rng.shuffle(options);
}

export function diagnosisOptions(c: Customer): DiagnosisOption[] {
  const open = c.options.filter((o) => !c.excluded.includes(o));
  return c.options.map((id) => {
    const faults = parseDiagnosis(id);
    return {
      id,
      faults,
      nameKeys: faults.map((f) => `faults.${f}.name`),
      descKeys: faults.map((f) => `faults.${f}.diagnosis`),
      mark: c.excluded.includes(id) ? 'excluded' : open.length === 1 && c.toolsUsed.length > 0 ? 'confirmed' : 'unknown',
    };
  });
}

function readingLines(tool: DiagnosisTool, model: PhoneModel, phone: PhoneInstance, clue: DiagnosisClue): Line[] {
  switch (tool) {
    case 'visual':
      return visualInspection(model, phone).map((n) => ({ key: `faults.reading.visual.${n}` }));
    case 'multimeter': {
      const r = ammeterReading(model, phone);
      clue.ammeter = r;
      return [{ key: `faults.reading.ammeter.${r.pattern}`, params: { amps: r.amps.toFixed(2) } }];
    }
    case 'battester': {
      const b = batteryInfo(model, phone);
      clue.battery = b;
      if (!b.present) return [{ key: 'faults.reading.battery.missing' }];
      const lines: Line[] = [{ key: 'faults.reading.battery.health', params: { health: b.healthPct, cycles: b.cycles } }];
      if (b.swollen) lines.push({ key: 'faults.reading.battery.swollen' });
      else if (b.healthPct < 8) lines.push({ key: 'faults.reading.battery.dead' });
      else if (b.healthPct < 73) lines.push({ key: 'faults.reading.battery.worn' });
      else lines.push({ key: 'faults.reading.battery.ok' });
      return lines;
    }
    case 'psu': {
      const found = psuFindings(model, phone);
      if (found.length === 0) return [{ key: 'faults.reading.psu.ok' }];
      return found.map((k) => ({ key: `faults.reading.psu.${k}` }));
    }
  }
}

/** Uses an instrument on the customer's phone and records which options it rules out. */
export function inspect(s: GameState, c: Customer, tool: DiagnosisTool): DiagnosisClue {
  const clue: DiagnosisClue = { tool, available: toolAvailable(s, tool), lines: [], excluded: [], confirmed: null };
  if (!clue.available) return clue;
  const model = modelOf(c.modelId);
  clue.lines = readingLines(tool, model, c.phone, clue);
  const actual = signature(tool, model, c.phone);
  const truth = diagnosisId(c.faults);
  for (const opt of c.options) {
    if (opt === truth || c.excluded.includes(opt)) continue;
    if (!compatible(tool, model, parseDiagnosis(opt), actual)) {
      c.excluded.push(opt);
      clue.excluded.push(opt);
    }
  }
  if (!c.toolsUsed.includes(tool)) c.toolsUsed.push(tool);
  const open = c.options.filter((o) => !c.excluded.includes(o));
  clue.confirmed = open.length === 1 ? (open[0] as string) : null;
  return clue;
}
