/**
 * Guide-driven automatic repair that draws spare parts from the stock room. Used by the assistant,
 * by the balance simulation and by automated playthroughs (the player's hands, minus the player).
 */
import { RNG } from '../../core/rng';
import type { GameState, ReplacementQuality } from '../../core/state';
import { consumePart, modelOf, stockOf } from '../economy/parts';
import { needsReplace, nextHint } from '../repair/hint';
import { clonePhone } from '../repair/model';
import { RepairSession } from '../repair/session';
import { evaluatePhone } from '../repair/evaluate';
import type { PartCategory, PhoneInstance, RepairContext, RepairGoal, TestReport } from '../repair/types';
import { TOOLS } from './balance';

export interface AutoRepairResult {
  done: boolean;
  steps: number;
  replaced: Array<{ comp: string; category: PartCategory; quality: ReplacementQuality }>;
  /** a spare of this category ran out mid-job (the phone is left as it is, open on the bench) */
  missingPart: PartCategory | null;
  /** i18n key of the hint the guide stopped at when it could not go on */
  stuck: string | null;
  /** tool id the shop must own to continue (e.g. "extractor" after stripping a screw) */
  needTool: string | null;
}

export type QualityPreference = ReplacementQuality[];

export const DEFAULT_PREFERENCE: QualityPreference = ['good', 'refurb', 'cheap'];

function pickQuality(s: GameState, modelId: string, category: PartCategory, pref: QualityPreference): ReplacementQuality | null {
  for (const q of pref) if (stockOf(s, modelId, category, q) > 0) return q;
  return null;
}

/** Spare categories (with multiplicity) the job still needs. */
export function partsStillNeeded(session: RepairSession, goal: RepairGoal): PartCategory[] {
  return goal.replace.filter((id) => needsReplace(session, id)).map((id) => session.model.comp(id).partCategory);
}

/** True when the stock room holds every spare the job still needs. */
export function partsAvailable(s: GameState, modelId: string, phone: PhoneInstance, goal: RepairGoal, ctx: RepairContext): boolean {
  const session = new RepairSession(modelOf(modelId), phone, ctx, new RNG(1));
  const need: Record<string, number> = {};
  for (const cat of partsStillNeeded(session, goal)) need[cat] = (need[cat] ?? 0) + 1;
  for (const [cat, n] of Object.entries(need)) {
    const c = cat as PartCategory;
    const have = stockOf(s, modelId, c, 'cheap') + stockOf(s, modelId, c, 'good') + stockOf(s, modelId, c, 'refurb');
    if (have < n) return false;
  }
  return true;
}

/**
 * The guide of the repair engine oscillates (connect ↔ disconnect) when a goal asks to reseat a
 * connector AND to do other work behind it. Reassembly plugs every connector back anyway, so the
 * other work is done first with the reseat left out, then the full goal is checked.
 */
export function goalPhases(goal: RepairGoal): RepairGoal[] {
  const other = goal.replace.length + goal.clean.length + goal.solder.length > 0 || !!goal.teardown;
  return goal.reseat.length > 0 && other ? [{ ...goal, reseat: [] }, goal] : [goal];
}

/**
 * Follows the guide to the end. Replacements consume stock; a part that turns out dead on arrival
 * is spotted by the final test and swapped again when another spare is available.
 */
export function autoRepair(
  s: GameState,
  session: RepairSession,
  goal: RepairGoal,
  opts: { preference?: QualityPreference; maxSteps?: number } = {},
): AutoRepairResult {
  const pref = opts.preference ?? DEFAULT_PREFERENCE;
  const max = opts.maxSteps ?? 4000;
  const phone = session.phone;
  const out: AutoRepairResult = { done: false, steps: 0, replaced: [], missingPart: null, stuck: null, needTool: null };
  const phases = goalPhases(goal);
  let phase = 0;
  for (let i = 0; i < max; i++) {
    const hint = nextHint(session, phases[phase] as RepairGoal);
    if (hint.done) {
      let dead = false;
      for (const id of goal.replace) {
        if (phone.comps[id]?.doa && !phone.flags[`doa_${id}`]) {
          phone.flags[`doa_${id}`] = true;
          dead = true;
        }
      }
      if (dead) continue;
      if (phase < phases.length - 1) {
        phase++;
        continue;
      }
      out.done = true;
      return out;
    }
    if (!hint.action) {
      out.stuck = hint.textKey;
      const tool = /^@tools\.(\w+)\.name$/.exec(String(hint.params?.tool ?? ''));
      if (hint.textKey === 'repair.hint.need_tool' && tool) out.needTool = tool[1] as string;
      return out;
    }
    let action = hint.action;
    if (action.t === 'replace') {
      const category = session.model.comp(action.comp).partCategory;
      const quality = pickQuality(s, phone.modelId, category, pref);
      if (!quality) {
        out.missingPart = category;
        return out;
      }
      action = { ...action, quality };
      if (!session.can(action).ok) {
        out.stuck = hint.textKey;
        return out;
      }
      consumePart(s, phone.modelId, category, quality);
      out.replaced.push({ comp: action.comp, category, quality });
    }
    const res = session.perform(action);
    if (!res.ok) {
      out.stuck = res.reason ?? hint.textKey;
      return out;
    }
    if (action.t === 'replace') phone.flags[`doa_${action.comp}`] = false;
    out.steps++;
  }
  out.stuck = 'repair.hint.too_long';
  return out;
}

/**
 * After a final test: flags replaced parts that turned out dead on arrival, so that the guide
 * (`needsReplace`) asks for them to be swapped again. Returns the component ids newly flagged.
 */
export function flagDeadParts(phone: PhoneInstance): string[] {
  const out: string[] = [];
  for (const [id, cs] of Object.entries(phone.comps)) {
    if (cs.doa && cs.quality !== 'factory' && !phone.flags[`doa_${id}`]) {
      phone.flags[`doa_${id}`] = true;
      out.push(id);
    }
  }
  return out;
}

/** Number of guide steps the job takes with ideal hands (dry run on a copy; no stock is touched). */
export function estimateSteps(modelId: string, phone: PhoneInstance, goal: RepairGoal, ctx: RepairContext): number {
  const session = new RepairSession(modelOf(modelId), clonePhone(phone), { ...ctx, strict: true }, new RNG(7));
  const phases = goalPhases(goal);
  let phase = 0;
  let steps = 0;
  for (; steps < 4000; steps++) {
    const hint = nextHint(session, phases[phase] as RepairGoal);
    if (hint.done && phase < phases.length - 1) {
      phase++;
      continue;
    }
    if (hint.done || !hint.action) break;
    const action = hint.action.t === 'replace' ? { ...hint.action, quality: 'refurb' as const } : hint.action;
    if (!session.perform(action).ok) break;
    if (action.t === 'replace') {
      session.phone.comps[action.comp]!.doa = false;
      session.phone.flags[`doa_${action.comp}`] = false;
    }
  }
  return steps;
}

/**
 * Final-test report of a flawless repair done with every tool in the catalogue and perfect spares.
 * It tells which of the broken functions the job can actually bring back. Null if the guide gets stuck.
 */
export function idealReport(modelId: string, phone: PhoneInstance, goal: RepairGoal): TestReport | null {
  const tools: Record<string, number> = {};
  for (const t of TOOLS) tools[t.id] = t.tiers[t.tiers.length - 1]!.tier;
  const session = new RepairSession(modelOf(modelId), clonePhone(phone), { tools, matCells: 24, strict: true, errorMult: 1 }, new RNG(11));
  const phases = goalPhases(goal);
  let phase = 0;
  for (let i = 0; i < 4000; i++) {
    const hint = nextHint(session, phases[phase] as RepairGoal);
    if (hint.done) {
      if (phase < phases.length - 1) {
        phase++;
        continue;
      }
      return evaluatePhone(session.model, session.phone);
    }
    if (!hint.action) return null;
    const action = hint.action.t === 'replace' ? { ...hint.action, quality: 'refurb' as const } : hint.action;
    if (!session.perform(action).ok) return null;
    if (action.t === 'replace') session.phone.comps[action.comp]!.doa = false;
  }
  return null;
}
