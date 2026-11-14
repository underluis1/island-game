import { PhoneModel } from './model';
import { TORQUE_LOOSE } from './session';
import {
  ALL_FUNCTIONS,
  type ComponentDef,
  type FunctionId,
  type Mistake,
  type PhoneDef,
  type PhoneInstance,
  type TestReport,
  type TestStatus,
} from './types';

const DIRT_SENSITIVE: FunctionId[] = ['speaker', 'earpiece', 'microphone', 'charging'];

function worse(a: TestStatus, b: TestStatus): TestStatus {
  const rank: Record<TestStatus, number> = { na: -1, pass: 0, degraded: 1, fail: 2 };
  return rank[b] > rank[a] ? b : a;
}

function placed(model: PhoneModel, phone: PhoneInstance, c: ComponentDef): boolean {
  if (phone.comps[c.id]!.state === 'removed') return false;
  return c.parent ? placed(model, phone, model.comp(c.parent)) : true;
}

function powerStatus(model: PhoneModel, phone: PhoneInstance): TestStatus {
  const { boardId, batteryId, batteryConn } = model;
  if (!boardId || !batteryId || !batteryConn) return 'fail';
  const board = phone.comps[boardId]!;
  const bat = phone.comps[batteryId]!;
  if (board.state !== 'installed' || board.condition === 'damaged' || board.condition === 'missing') return 'fail';
  if (board.corrosion > 0.6) return 'fail';
  if (bat.state !== 'installed' || bat.condition === 'damaged' || bat.doa) return 'fail';
  if ((bat.health ?? 1) < 0.08) return 'fail';
  const bc = phone.connectors[batteryConn]!;
  if (!bc.connected || bc.damaged) return 'fail';
  if (phone.boardFaults.some((f) => f.affects.includes('power'))) return 'fail';
  return 'pass';
}

function functionStatus(model: PhoneModel, phone: PhoneInstance, fn: FunctionId): TestStatus {
  const comps = model.def.components.filter((c) => c.functions.includes(fn));
  if (comps.length === 0) return 'na';
  let status: TestStatus = 'pass';
  if (phone.boardFaults.some((f) => f.affects.includes(fn))) return 'fail';
  for (const c of comps) {
    const cs = phone.comps[c.id]!;
    if (!placed(model, phone, c)) return 'fail';
    if (cs.condition === 'damaged' || cs.condition === 'missing' || cs.doa) return 'fail';
    for (const f of model.connectorsOf(c)) {
      const k = phone.connectors[f.id]!;
      if (!k.connected || k.damaged) return 'fail';
    }
    if (cs.corrosion > 0.35) return 'fail';
    if (cs.corrosion > 0.12) status = worse(status, 'degraded');
    if (DIRT_SENSITIVE.includes(fn)) {
      if (cs.dirt > 0.5) return fn === 'charging' ? 'fail' : 'degraded';
    }
    if (c.pairing && !cs.paired) {
      if (fn === 'biometric' || fn === 'trueTone') return 'fail';
      if (fn === 'rearCamera' || fn === 'battery') status = worse(status, 'degraded');
    }
    if (fn === 'battery') {
      const h = cs.health ?? 1;
      if (cs.swollen || h < 0.5) return 'fail';
      if (h < 0.8) status = worse(status, 'degraded');
    }
  }
  return status;
}

export function evaluatePhone(def: PhoneDef | PhoneModel, phone: PhoneInstance): TestReport {
  const model = def instanceof PhoneModel ? def : new PhoneModel(def);
  const functions = {} as Record<FunctionId, TestStatus>;
  const power = powerStatus(model, phone);
  for (const fn of ALL_FUNCTIONS) {
    if (fn === 'power') {
      functions[fn] = power;
      continue;
    }
    const s = functionStatus(model, phone, fn);
    functions[fn] = s === 'na' ? 'na' : power === 'pass' ? s : 'fail';
  }

  let missingScrews = 0;
  let looseScrews = 0;
  let strippedScrews = 0;
  for (const { owner, f } of model.allScrews()) {
    if (!placed(model, phone, owner)) continue;
    const sid = phone.holes[f.id];
    if (sid == null) {
      missingScrews++;
      continue;
    }
    const s = phone.screws[sid]!;
    if (s.torque < TORQUE_LOOSE) looseScrews++;
    if (s.stripped) strippedScrews++;
  }

  const leftoverParts = model
    .removable()
    .filter((c) => phone.comps[c.id]!.state === 'removed')
    .map((c) => c.id);
  const closed = model.def.components.every((c) => !c.hinge || phone.comps[c.id]!.state === 'installed');
  let waterSeal = closed;
  let unbonded = 0;
  for (const c of model.def.components) {
    for (const f of model.adhesivesOf(c)) {
      const st = phone.adhesives[f.id]!;
      if (f.kind === 'perimeter' && !st.bonded) waterSeal = false;
      if (f.kind !== 'perimeter' && !st.bonded && phone.comps[c.id]!.state !== 'removed') unbonded++;
    }
  }

  let dirtSum = 0;
  for (const c of model.def.components) {
    const cs = phone.comps[c.id]!;
    dirtSum += Math.max(cs.dirt, cs.corrosion);
  }
  const cleanliness = 1 - dirtSum / model.def.components.length;

  const issues: Mistake[] = [];
  if (missingScrews > 0) issues.push({ key: 'missing_screws', severity: missingScrews > 2 ? 2 : 1, params: { n: missingScrews } });
  if (looseScrews > 0) issues.push({ key: 'loose_screws', severity: 1, params: { n: looseScrews } });
  if (leftoverParts.length > 0) issues.push({ key: 'leftover_parts', severity: 3, params: { n: leftoverParts.length } });
  if (!closed) issues.push({ key: 'not_closed', severity: 3 });
  else if (!waterSeal) issues.push({ key: 'no_seal', severity: 1 });
  if (unbonded > 0) issues.push({ key: 'loose_battery', severity: 1 });

  let score = 1;
  for (const fn of ALL_FUNCTIONS) {
    if (functions[fn] === 'fail') score -= fn === 'power' ? 0.6 : 0.12;
    else if (functions[fn] === 'degraded') score -= 0.05;
  }
  score -= Math.min(0.2, missingScrews * 0.03) + Math.min(0.1, looseScrews * 0.015);
  score -= leftoverParts.length * 0.15;
  if (!closed) score -= 0.4;
  else if (!waterSeal) score -= 0.03;
  score = Math.max(0, Math.min(1, score));

  return {
    functions,
    issues,
    missingScrews,
    looseScrews,
    strippedScrews,
    leftoverParts,
    closed,
    waterSeal,
    cleanliness,
    score,
  };
}

/** Functions that are currently failing or degraded. */
export function brokenFunctions(report: TestReport): FunctionId[] {
  return ALL_FUNCTIONS.filter((f) => report.functions[f] === 'fail' || report.functions[f] === 'degraded');
}
