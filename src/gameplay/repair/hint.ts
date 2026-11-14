/**
 * Guide planner: given the phone state and the job goal, computes the next recommended step.
 * It powers the in-game "Guida" highlights, the tutorial, the assistant and automated playthroughs.
 */
import { MAT_CELL_CAPACITY, adhesiveSoftTemp } from './model';
import type { RepairSession } from './session';
import type {
  Action,
  ActionResult,
  AdhesiveDef,
  ComponentDef,
  ConnectorDef,
  FastenerDef,
  Hint,
  HintTargetKind,
  PartQuality,
  RepairGoal,
  ScrewDef,
} from './types';

const nameOf = (c: ComponentDef): string => `@${c.nameKey}`;

function hint(
  action: Action | null,
  tool: string | null,
  kind: HintTargetKind,
  id: string,
  textKey: string,
  params?: Record<string, string | number>,
): Hint {
  return { action, tool, target: { kind, id }, textKey: `repair.hint.${textKey}`, params };
}

/** Preferred magnetic-mat cell for a screw: one cell per bracket/part, so lengths never mix up. */
export function matCellFor(s: RepairSession, screwId: string): number | null {
  const cells = s.ctx.matCells;
  if (cells <= 0) return null;
  const ref = s.model.fasteners.get(screwId);
  const ownerIdx = ref ? Math.max(0, s.model.screwOwners.indexOf(ref.owner.id)) : 0;
  for (let i = 0; i < cells; i++) {
    const cell = (ownerIdx + i) % cells;
    if (s.matCellCount(cell) < MAT_CELL_CAPACITY) return cell;
  }
  return null;
}

export function needsReplace(s: RepairSession, compId: string): boolean {
  const cs = s.phone.comps[compId];
  if (!cs) return false;
  return cs.quality === 'factory' || cs.condition === 'damaged' || s.phone.flags[`doa_${compId}`] === true;
}

export function needsClean(s: RepairSession, compId: string): boolean {
  const cs = s.phone.comps[compId];
  return !!cs && (cs.dirt > 0.05 || cs.corrosion > 0.05);
}

export function goalComplete(s: RepairSession, goal: RepairGoal): boolean {
  const ph = s.phone;
  if (goal.reseat.some((c) => !ph.connectors[c]?.connected)) return false;
  if (goal.clean.some((c) => needsClean(s, c))) return false;
  if (goal.replace.some((c) => needsReplace(s, c))) return false;
  if (goal.solder.some((f) => ph.boardFaults.some((b) => b.id === f))) return false;
  if (goal.teardown && !ph.flags.teardownDone) return false;
  return true;
}

class Planner {
  constructor(
    private s: RepairSession,
    private goal: RepairGoal,
  ) {}

  private get ph() {
    return this.s.phone;
  }
  private get m() {
    return this.s.model;
  }

  private working = true;

  next(): Hint {
    // "working" = some objective can still make progress; otherwise everything left is reassembly
    const w = goalComplete(this.s, this.goal) ? null : this.work();
    const working = w !== null;
    this.working = working;
    const held = this.s.heldScrew();
    if (held) {
      if (!working) {
        const hole = this.holeForScrew(held.id);
        if (hole) return this.screwInHint(hole, held.id);
      }
      const cell = matCellFor(this.s, held.id);
      if (cell != null) {
        return hint({ t: 'placeScrew', screw: held.id, to: { k: 'mat', cell } }, 'driver', 'screw', held.id, 'place_screw', {
          cell: cell + 1,
        });
      }
      return hint({ t: 'placeScrew', screw: held.id, to: { k: 'bench', x: 0.16, z: 0.12 } }, 'driver', 'screw', held.id, 'place_screw_bench');
    }
    return this.validate(w ?? this.reassemble());
  }

  /** Converts hints the player cannot execute (missing tool…) into explanatory, action-less hints. */
  private validate(h: Hint): Hint {
    if (!h.action) return h;
    const check = this.s.can(h.action);
    if (check.ok) return h;
    if (check.reason === 'repair.err.need_tool') {
      return { ...h, action: null, textKey: 'repair.hint.need_tool', params: check.params };
    }
    return { ...h, action: null, textKey: check.reason, params: check.params };
  }

  /* ------------------------------------------------------------ work phase */

  private work(): Hint | null {
    const { goal } = this;
    for (const c of goal.clean) {
      if (needsClean(this.s, c)) return this.toClean(this.m.comp(c));
    }
    for (const c of goal.replace) {
      if (needsReplace(this.s, c)) return this.toReplace(this.m.comp(c));
    }
    for (const f of goal.solder) {
      if (this.ph.boardFaults.some((b) => b.id === f)) {
        const board = this.m.boardId ? this.m.comp(this.m.boardId) : null;
        if (board) {
          const r = this.ensureRemoved(board);
          if (r) return r;
        }
        return hint({ t: 'solder', fault: f, quality: 1 }, 'solder', 'comp', this.m.boardId ?? '', 'solder');
      }
    }
    if (goal.teardown && !this.ph.flags.teardownDone) {
      for (const c of this.m.removable()) {
        if (this.ph.comps[c.id]!.state !== 'removed') {
          const r = this.ensureRemoved(c);
          if (r) return r;
        }
      }
    }
    // loose plugs go last: other work may need the same cable unplugged, and reassembly reseats it anyway
    for (const conn of goal.reseat) {
      if (!this.ph.connectors[conn]?.connected) {
        const h = this.toConnect(conn);
        if (h) return h;
      }
    }
    return null;
  }

  private toConnect(conn: string): Hint | null {
    const ref = this.m.fastener(conn);
    const f = ref.f as ConnectorDef;
    if (this.ph.comps[ref.owner.id]!.state === 'removed') return null;
    if (this.ph.poweredOn) return this.powerHint(false);
    if (!f.isBattery && !f.local && this.s.batteryLive() && this.m.batteryConn) {
      const d = this.ensureDisconnected(this.m.batteryConn);
      if (d) return d;
    }
    const acc = this.ensureFastenerAccess(conn);
    if (acc) return acc;
    return hint({ t: 'connect', conn }, 'spudger', 'connector', conn, 'connect', { name: nameOf(ref.owner) });
  }

  private toClean(c: ComponentDef): Hint {
    const cs = this.ph.comps[c.id]!;
    const external = c.externalClean && cs.corrosion <= 0.05 && cs.state !== 'removed';
    if (external) {
      const tool = this.s.tool('toothpick') > 0 ? 'toothpick' : 'brush';
      return hint({ t: 'clean', comp: c.id, tool, amount: 0.25 }, tool, 'comp', c.id, 'clean_port', { name: nameOf(c) });
    }
    if (cs.state !== 'removed') {
      const e = this.ensureExposed(c);
      if (e) return e;
      if (cs.corrosion > 0.05) {
        if (this.ph.poweredOn) return this.powerHint(false);
        if (this.s.batteryLive() && this.m.batteryConn) {
          const d = this.ensureDisconnected(this.m.batteryConn);
          if (d) return d;
        }
      }
    }
    if (cs.corrosion > 0.05) {
      return hint({ t: 'clean', comp: c.id, tool: 'ipa', amount: 0.25 }, 'ipa', 'comp', c.id, 'clean_ipa', { name: nameOf(c) });
    }
    return hint({ t: 'clean', comp: c.id, tool: 'brush', amount: 0.25 }, 'brush', 'comp', c.id, 'clean_brush', { name: nameOf(c) });
  }

  private toReplace(c: ComponentDef): Hint {
    const r = this.ensureRemoved(c);
    if (r) return r;
    for (const childId of this.m.children.get(c.id) ?? []) {
      const child = this.m.comp(childId);
      const cr = this.ensureRemoved(child);
      if (cr) return cr;
    }
    const cs = this.ph.comps[c.id]!;
    if (
      c.pairing &&
      c.partCategory === 'display' &&
      cs.paired &&
      this.s.tool('programmer') > 0 &&
      !this.ph.savedData.includes('display')
    ) {
      return hint({ t: 'readChip', comp: c.id }, 'programmer', 'comp', c.id, 'read_chip', { name: nameOf(c) });
    }
    return hint({ t: 'replace', comp: c.id, quality: 'good' }, null, 'comp', c.id, 'replace', { name: nameOf(c) });
  }

  /* ------------------------------------------------------------ ensure helpers */

  private powerHint(on: boolean): Hint {
    return hint({ t: 'power', on }, null, 'power', 'power', on ? 'power_on' : 'power_off');
  }

  private flipHint(): Hint {
    for (const c of this.m.def.components) {
      if (c.hinge && this.ph.comps[c.id]!.state === 'open') return this.closeHint(c);
    }
    return hint({ t: 'flip' }, null, 'phone', 'phone', 'flip');
  }

  private closeHint(c: ComponentDef): Hint {
    if (!this.working && this.s.tool('adhesive') > 0) {
      for (const f of this.m.adhesivesOf(c)) {
        const st = this.ph.adhesives[f.id]!;
        if (f.kind === 'perimeter' && !st.bonded && !st.fresh) {
          return hint({ t: 'applyAdhesive', adhesive: f.id }, 'adhesive', 'comp', c.id, 'apply_adhesive', { name: nameOf(c) });
        }
      }
    }
    return hint({ t: 'close', comp: c.id }, null, 'comp', c.id, 'close', { name: nameOf(c) });
  }

  private ensureBlocker(entry: string): Hint | null {
    if (this.s.blockerOk(entry)) return null;
    const c = this.m.comp(entry.split('@')[0] as string);
    return entry.endsWith('@open') && c.hinge ? this.ensureOpen(c) : this.ensureRemoved(c);
  }

  private ensureBlockers(c: ComponentDef): Hint | null {
    if (c.parent) {
      const p = this.m.comp(c.parent);
      if (this.ph.comps[p.id]!.state === 'installed') return p.hinge ? this.ensureOpen(p) : this.ensureRemoved(p);
    }
    for (const b of c.blockedBy) {
      const h = this.ensureBlocker(b);
      if (h) return h;
    }
    return null;
  }

  private ensureOrientation(c: ComponentDef): Hint | null {
    if (c.parent) {
      const p = this.m.comp(c.parent);
      if (this.ph.comps[p.id]!.state === 'open' && this.ph.orientation !== this.m.sideOf(p)) return this.flipHint();
    } else if (this.ph.orientation !== this.m.sideOf(c)) {
      return this.flipHint();
    }
    return null;
  }

  private ensureExposed(c: ComponentDef): Hint | null {
    return this.ensureBlockers(c) ?? this.ensureOrientation(c);
  }

  private ensureFastenerAccess(fid: string): Hint | null {
    const { owner, f } = this.m.fastener(fid);
    const os = this.ph.comps[owner.id]!.state;
    if (os === 'removed') return null;
    const access = f.type === 'screw' || f.type === 'connector' ? f.access : undefined;
    const parentRemoved = owner.parent ? this.ph.comps[owner.parent]!.state === 'removed' : false;
    const requires = this.m.accessRequires(owner, f);
    if (requires) {
      const side = access?.side ?? this.m.sideOf(owner);
      if (!parentRemoved && side !== 'any' && side !== this.ph.orientation) return this.flipHint();
      for (const r of requires) {
        const h = this.ensureBlocker(r);
        if (h) return h;
      }
    } else {
      if (owner.parent) {
        const p = this.m.comp(owner.parent);
        if (this.ph.comps[p.id]!.state === 'installed') return p.hinge ? this.ensureOpen(p) : this.ensureRemoved(p);
      }
      const side = access?.side ?? this.m.sideOf(owner);
      if (!parentRemoved && side !== 'any' && side !== this.ph.orientation) return this.flipHint();
      for (const b of owner.blockedBy) {
        const h = this.ensureBlocker(b);
        if (h) return h;
      }
    }
    if (owner.hinge) {
      const stage = this.m.stageOf(owner, f);
      if (stage === 'remove' && os === 'installed') return this.ensureOpen(owner);
      if (stage === 'open' && os === 'open') return this.closeHint(owner);
    }
    if (f.type === 'connector' && f.under && this.ph.comps[f.under]!.state !== 'removed') {
      return this.ensureRemoved(this.m.comp(f.under));
    }
    return null;
  }

  private unscrewHint(owner: ComponentDef, f: ScrewDef): Hint {
    const acc = this.ensureFastenerAccess(f.id);
    if (acc) return acc;
    const sid = this.ph.holes[f.id]!;
    if (this.ph.screws[sid]!.stripped && this.s.tool('extractor') > 0) {
      return hint({ t: 'extract', hole: f.id }, 'extractor', 'hole', f.id, 'extract');
    }
    const h = hint({ t: 'unscrew', hole: f.id, bit: f.screwType }, 'driver', 'hole', f.id, 'unscrew', {
      bit: f.screwType,
      name: nameOf(owner),
    });
    h.bit = f.screwType;
    return h;
  }

  private ensureOpen(c: ComponentDef): Hint | null {
    const st = this.ph.comps[c.id]!.state;
    if (st !== 'installed') return null;
    // when the battery plug is only reachable from the other side, unplug it before opening this one
    if (this.s.batteryLive() && this.m.batteryConn) {
      const bref = this.m.fastener(this.m.batteryConn);
      const bf = bref.f as ConnectorDef;
      const side = bf.access?.side ?? this.m.sideOf(bref.owner);
      if (side !== 'any' && side !== this.m.sideOf(c)) {
        const d = this.ensureDisconnected(this.m.batteryConn);
        if (d) return d;
      }
    }
    if (this.ph.orientation !== this.m.sideOf(c)) return this.flipHint();
    if (this.ph.poweredOn) return this.powerHint(false);
    for (const f of c.attachedBy) {
      if (this.m.stageOf(c, f) !== 'open') continue;
      if (f.type === 'screw' && this.ph.holes[f.id] != null) return this.unscrewHint(c, f);
    }
    for (const f of c.attachedBy) {
      if (this.m.stageOf(c, f) !== 'open' || f.type !== 'adhesive') continue;
      const h = this.adhesiveHint(c, f);
      if (h) return h;
    }
    return hint({ t: 'open', comp: c.id }, null, 'comp', c.id, 'open', { name: nameOf(c) });
  }

  private adhesiveHint(c: ComponentDef, f: AdhesiveDef): Hint | null {
    const st = this.ph.adhesives[f.id]!;
    if (!st.bonded) return null;
    const soft = adhesiveSoftTemp(f);
    if (f.kind === 'perimeter') {
      if (!st.gap) {
        const bonus = [0, 0, 6, 12][Math.min(3, this.s.tool('suction'))]!;
        if (st.temp < soft - bonus + 2) {
          return hint({ t: 'heat', adhesive: f.id, dt: 0.5 }, 'heat', 'adhesive', f.id, 'heat', {
            name: nameOf(c),
            temp: Math.round(soft),
          });
        }
        return hint({ t: 'suction', comp: c.id }, 'suction', 'comp', c.id, 'suction', { name: nameOf(c) });
      }
      const seg = st.segs.findIndex((v) => v < 1);
      return hint({ t: 'cut', adhesive: f.id, seg, depth: 0.3 }, 'pick', 'adhesive', f.id, 'cut', { name: nameOf(c) });
    }
    if (f.kind === 'pulltab') {
      for (let i = 0; i < st.segs.length; i++) {
        if (st.segs[i]! >= 1) continue;
        if (st.broken[i]) {
          if (st.softened < 0.5 && this.s.tool('ipa') > 0) {
            return hint({ t: 'ipa', adhesive: f.id }, 'ipa', 'adhesive', f.id, 'ipa_tab', { name: nameOf(c) });
          }
          const tool = this.s.tool('card') > 0 ? 'card' : 'spudger';
          return hint({ t: 'pry', adhesive: f.id, dt: 0.25 }, tool, 'adhesive', f.id, 'pry', { name: nameOf(c) });
        }
        return hint({ t: 'pullTab', adhesive: f.id, tab: i, speed: 0.4, dt: 0.25 }, 'tweezers', 'adhesive', f.id, 'pull_tab', {
          name: nameOf(c),
          n: i + 1,
        });
      }
      return null;
    }
    // pad
    if (st.temp < soft - 15 && st.softened < 0.5 && this.s.tool('heat') > 0) {
      return hint({ t: 'heat', adhesive: f.id, dt: 0.5 }, 'heat', 'adhesive', f.id, 'heat', {
        name: nameOf(c),
        temp: Math.round(soft - 10),
      });
    }
    const seg = st.segs.findIndex((v) => v < 1);
    return hint({ t: 'cut', adhesive: f.id, seg, depth: 0.3 }, 'spudger', 'adhesive', f.id, 'pry_pad', { name: nameOf(c) });
  }

  private ensureDisconnected(conn: string): Hint | null {
    const k = this.ph.connectors[conn]!;
    if (!k.connected) return null;
    const ref = this.m.fastener(conn);
    const f = ref.f as ConnectorDef;
    if (this.ph.comps[ref.owner.id]!.state === 'removed') return null;
    if (this.ph.poweredOn) return this.powerHint(false);
    if (!f.isBattery && !f.local && this.s.batteryLive() && this.m.batteryConn) {
      const d = this.ensureDisconnected(this.m.batteryConn);
      if (d) return d;
    }
    const acc = this.ensureFastenerAccess(conn);
    if (acc) return acc;
    return hint({ t: 'disconnect', conn }, 'spudger', 'connector', conn, f.isBattery ? 'disconnect_battery' : 'disconnect', {
      name: nameOf(ref.owner),
    });
  }

  private ensureRemoved(c: ComponentDef): Hint | null {
    const st = this.ph.comps[c.id]!.state;
    if (st === 'removed' || c.removable === false) return null;
    if (c.hinge && st === 'installed') return this.ensureOpen(c);
    const blockers = this.ensureBlockers(c);
    if (blockers) return blockers;
    if (this.ph.poweredOn) return this.powerHint(false);
    const relevant = (f: FastenerDef): boolean => !c.hinge || this.m.stageOf(c, f) === 'remove';
    // connectors first: some are only reachable from the other side of the phone
    if (c.isBoard) {
      for (const { owner, f } of this.m.allConnectors()) {
        if (f.local || this.ph.comps[owner.id]!.state === 'removed') continue;
        const h = this.ensureDisconnected(f.id);
        if (h) return h;
      }
    }
    for (const f of c.attachedBy) {
      if (f.type === 'connector' && relevant(f)) {
        const h = this.ensureDisconnected(f.id);
        if (h) return h;
      }
    }
    const side = this.ensureOrientation(c);
    if (side) return side;
    for (const f of c.attachedBy) {
      if (f.type === 'bracket' && relevant(f)) {
        const h = this.ensureRemoved(this.m.comp(f.bracketId));
        if (h) return h;
      }
    }
    for (const f of c.attachedBy) {
      if (f.type === 'screw' && relevant(f) && this.ph.holes[f.id] != null) return this.unscrewHint(c, f);
    }
    for (const f of c.attachedBy) {
      if (f.type === 'adhesive' && relevant(f)) {
        const h = this.adhesiveHint(c, f);
        if (h) return h;
      }
    }
    return hint({ t: 'remove', comp: c.id }, 'tweezers', 'comp', c.id, 'remove', { name: nameOf(c) });
  }

  /* ------------------------------------------------------------ reassembly */

  private holeForScrew(screwId: string): string | null {
    const s = this.ph.screws[screwId]!;
    const candidates: Array<{ hole: string; exact: boolean; diff: number }> = [];
    for (const { owner, f } of this.m.allScrews()) {
      if (this.ph.holes[f.id] != null) continue;
      if (this.ph.comps[owner.id]!.state === 'removed') continue;
      if (f.screwType !== s.type) continue;
      if (!this.s.fastenerAccess(f.id).ok) continue;
      candidates.push({ hole: f.id, exact: f.id === screwId, diff: Math.abs(f.length - s.length) });
    }
    candidates.sort((a, b) => Number(b.exact) - Number(a.exact) || a.diff - b.diff);
    const best = candidates[0];
    if (!best) return null;
    return best.exact || best.diff <= 0.25 ? best.hole : null;
  }

  private screwForHole(def: ScrewDef): string | null {
    const free = (id: string): boolean => {
      const loc = this.ph.screws[id]?.loc.k;
      return loc === 'mat' || loc === 'bench' || loc === 'held';
    };
    if (free(def.id)) return def.id;
    let best: string | null = null;
    let bestDiff = 0.26;
    for (const s of Object.values(this.ph.screws)) {
      if (!free(s.id) || s.type !== def.screwType) continue;
      // do not steal a screw whose own hole is still waiting for it
      const home = this.m.fasteners.get(s.id);
      if (home && this.ph.holes[s.id] == null && this.ph.comps[home.owner.id]!.state !== 'removed' && s.id !== def.id) {
        continue;
      }
      const d = Math.abs(s.length - def.length);
      if (d < bestDiff) {
        best = s.id;
        bestDiff = d;
      }
    }
    return best;
  }

  private screwInHint(hole: string, screw: string): Hint {
    const def = this.m.fastener(hole).f as ScrewDef;
    const h = hint({ t: 'screwIn', hole, screw, bit: def.screwType, torque: 1 }, 'driver', 'hole', hole, 'screw_in', {
      bit: def.screwType,
      len: def.length,
    });
    h.bit = def.screwType;
    return h;
  }

  private reassemble(): Hint {
    const ph = this.ph;
    const m = this.m;
    const comps = m.def.components;

    const removedNow = comps.filter((c) => c.removable !== false && ph.comps[c.id]!.state === 'removed');
    const boardIn = !m.boardId || ph.comps[m.boardId]!.state === 'installed';
    const pendingConn = m
      .allConnectors()
      .filter(({ owner, f }) => !ph.connectors[f.id]!.connected && ph.comps[owner.id]!.state !== 'removed' && (f.local || boardIn));

    // 0. restore pairing data on new parts while they are still on the mat
    if (this.s.tool('programmer') > 0) {
      for (const c of comps) {
        if (!c.pairing || ph.comps[c.id]!.paired) continue;
        const act: Action = { t: 'program', comp: c.id };
        if (this.s.can(act).ok) return hint(act, 'programmer', 'comp', c.id, 'program', { name: nameOf(c) });
      }
    }

    // 1. plug every reachable connector except the battery
    for (const { owner, f } of m.allConnectors()) {
      if (f.isBattery || ph.connectors[f.id]!.connected) continue;
      if (ph.comps[owner.id]!.state === 'removed') continue;
      const act: Action = { t: 'connect', conn: f.id };
      if (this.s.can(act).ok) {
        return hint(act, 'spudger', 'connector', f.id, 'connect', { name: nameOf(owner) });
      }
    }

    // 2. drive screws into every reachable empty hole
    for (const { owner, f } of m.allScrews()) {
      if (ph.holes[f.id] != null || ph.comps[owner.id]!.state === 'removed') continue;
      // the outer cover screws go in last, once nothing inside is left to do
      if (owner.hinge && m.stageOf(owner, f) === 'open' && (removedNow.length > 0 || pendingConn.length > 0)) continue;
      if (!this.s.fastenerAccess(f.id).ok) continue;
      const screw = this.screwForHole(f);
      if (!screw) {
        const own = ph.screws[f.id];
        if (own?.loc.k === 'lost' && this.s.tool('flashlight') > 0) {
          return hint({ t: 'findScrew', screw: f.id }, 'flashlight', 'screw', f.id, 'find_screw');
        }
        continue;
      }
      if (ph.screws[screw]!.loc.k === 'held') return this.screwInHint(f.id, screw);
      return hint({ t: 'pickScrew', screw }, 'driver', 'screw', screw, 'pick_screw', { len: ph.screws[screw]!.length });
    }

    // 3. put removed parts back, bottom-most first
    const removed = comps.filter((c) => c.removable !== false && ph.comps[c.id]!.state === 'removed');
    const waits = (x: ComponentDef): boolean => {
      for (const y of removed) {
        if (y.id === x.id) continue;
        if (y.blockedBy.includes(x.id)) return true;
        if (y.parent === x.id) return true;
      }
      for (const { owner, f } of m.allConnectors()) {
        const covers = f.under === x.id || (f.access?.requires ?? []).includes(x.id);
        if (!covers || ph.connectors[f.id]!.connected) continue;
        // a connector that can never be plugged again (missing part) must not block the bracket forever
        if (removed.some((r) => r.id === owner.id) || ph.comps[owner.id]!.state !== 'removed') return true;
      }
      return false;
    };
    let flipCandidate = false;
    for (const x of removed) {
      if (waits(x)) continue;
      if (x.parent) {
        if (ph.comps[x.parent]!.state === 'installed') continue;
      } else if (m.sideOf(x) !== ph.orientation) {
        flipCandidate = true;
        continue;
      }
      const act: Action = { t: 'install', comp: x.id };
      if (!this.s.can(act).ok) continue;
      if (this.s.tool('adhesive') > 0) {
        for (const f of m.adhesivesOf(x)) {
          if (f.kind === 'perimeter') continue;
          const st = ph.adhesives[f.id]!;
          if (!st.fresh && !st.bonded) {
            return hint({ t: 'applyAdhesive', adhesive: f.id }, 'adhesive', 'comp', x.id, 'apply_adhesive', { name: nameOf(x) });
          }
        }
      }
      return hint(act, 'tweezers', 'comp', x.id, 'install', { name: nameOf(x) });
    }

    // 4. battery connector goes last
    if (m.batteryConn && !ph.connectors[m.batteryConn]!.connected) {
      const act: Action = { t: 'connect', conn: m.batteryConn };
      if (this.s.can(act).ok) {
        return hint(act, 'spudger', 'connector', m.batteryConn, 'connect_battery');
      }
    }

    // 4b. connectors that need the phone reopened or turned over
    const others = pendingConn.filter(({ f }) => !f.isBattery);
    for (const { f } of others) {
      const h = this.ensureFastenerAccess(f.id);
      if (h) return h;
    }
    if (others.length === 0 && m.batteryConn && !ph.connectors[m.batteryConn]!.connected) {
      const owner = m.fastener(m.batteryConn).owner;
      const waitingParts = removedNow.some((c) => m.connectorsOf(c).some((f) => !f.local));
      if (ph.comps[owner.id]!.state !== 'removed' && boardIn && !waitingParts) {
        const h = this.ensureFastenerAccess(m.batteryConn);
        if (h) return h;
      }
    }

    // 5. parts waiting on the other side of the phone
    if (flipCandidate) return this.flipHint();

    // 6. close what is open
    for (const c of comps) {
      if (!c.hinge || ph.comps[c.id]!.state !== 'open') continue;
      return this.closeHint(c);
    }

    // 7. screen up, power on
    if (ph.orientation !== 'front') return this.flipHint();
    if (!ph.poweredOn && this.s.canBoot()) return this.powerHint(true);
    const done = hint(null, null, 'none', '', 'done');
    done.done = true;
    return done;
  }
}

export function nextHint(s: RepairSession, goal: RepairGoal): Hint {
  return new Planner(s, goal).next();
}

export interface AutoStep {
  hint: Hint;
  result: ActionResult | null;
}

/** Executes the recommended step with ideal inputs. */
export function autoStep(
  s: RepairSession,
  goal: RepairGoal,
  opts: { quality?: Exclude<PartQuality, 'factory'> } = {},
): AutoStep {
  const h = nextHint(s, goal);
  if (!h.action) return { hint: h, result: null };
  const action: Action = h.action.t === 'replace' ? { ...h.action, quality: opts.quality ?? 'good' } : h.action;
  return { hint: h, result: s.perform(action) };
}

/** Runs the guide to completion. Returns true when the job is done and the phone reassembled. */
export function autoRun(
  s: RepairSession,
  goal: RepairGoal,
  opts: { quality?: Exclude<PartQuality, 'factory'>; maxSteps?: number; onStep?: (st: AutoStep) => void } = {},
): { done: boolean; steps: number; stuck?: Hint } {
  const max = opts.maxSteps ?? 4000;
  for (let i = 0; i < max; i++) {
    const st = autoStep(s, goal, opts);
    opts.onStep?.(st);
    if (st.hint.done) return { done: true, steps: i };
    if (!st.result || !st.result.ok) return { done: false, steps: i, stuck: st.hint };
  }
  return { done: false, steps: max };
}
