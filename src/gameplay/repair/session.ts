import { RNG } from '../../core/rng';
import {
  AMBIENT_TEMP,
  MAT_CELL_CAPACITY,
  PhoneModel,
  adhesiveSoftTemp,
  freshAdhesiveState,
} from './model';
import type {
  Action,
  ActionResult,
  AdhesiveDef,
  ComponentDef,
  ConnectorDef,
  FastenerDef,
  Mistake,
  PartQuality,
  PhoneDef,
  PhoneInstance,
  RepairContext,
  RepairEvent,
  ScrewDef,
  ScrewItem,
} from './types';

export type Check = { ok: true } | { ok: false; reason: string; params?: Record<string, string | number> };

const OK: Check = { ok: true };
const fail = (reason: string, params?: Record<string, string | number>): Check => ({
  ok: false,
  reason: `repair.err.${reason}`,
  params,
});

/** Parameter values starting with "@" are i18n keys the UI translates before interpolation. */
const nameOf = (c: ComponentDef): string => `@${c.nameKey}`;

export const DEFAULT_CONTEXT: RepairContext = {
  tools: {
    driver: 1,
    spudger: 1,
    pick: 1,
    suction: 1,
    tweezers: 1,
    heat: 1,
    brush: 1,
    toothpick: 1,
  },
  errorMult: 1,
  strict: false,
  matCells: 8,
};

/** probability that a replacement part of a given grade is dead on arrival */
export const DEFECT_RATE: Record<Exclude<PartQuality, 'factory'>, number> = {
  cheap: 0.18,
  good: 0.03,
  refurb: 0.004,
};

const HEAT_RATE = [0, 9, 16, 24];
const HEAT_PLATE_CAP = 84;
export const OVERHEAT_TEMP = 108;
const SCREW_LEN_TOLERANCE = 0.25;
export const TORQUE_LOOSE = 0.6;
export const TORQUE_OVER = 1.2;

export class RepairSession {
  readonly model: PhoneModel;
  /** consecutive cold suction attempts, per component */
  private coldPulls: Record<string, number> = {};

  constructor(
    def: PhoneDef | PhoneModel,
    readonly phone: PhoneInstance,
    public ctx: RepairContext = DEFAULT_CONTEXT,
    readonly rng: RNG = new RNG(1),
  ) {
    this.model = def instanceof PhoneModel ? def : new PhoneModel(def);
  }

  /* ------------------------------------------------------------------ queries */

  tool(id: string): number {
    return this.ctx.tools[id] ?? 0;
  }

  private esdFactor(): number {
    const t = this.tool('esd');
    return t >= 2 ? 0.35 : t === 1 ? 0.6 : 1;
  }

  private risk(p: number, electric = false): boolean {
    if (this.ctx.strict) return false;
    const q = p * this.ctx.errorMult * (electric ? this.esdFactor() : 1);
    return this.rng.chance(Math.min(0.95, q));
  }

  blockerOk(entry: string): boolean {
    const [id, mode] = entry.split('@') as [string, string | undefined];
    const st = this.phone.comps[id]?.state;
    if (mode === 'open') return st !== 'installed';
    return st === 'removed';
  }

  private blockerDef(entry: string): ComponentDef {
    return this.model.comp(entry.split('@')[0] as string);
  }

  /** Is the place where the component sits reachable right now? */
  exposed(c: ComponentDef): Check {
    if (c.parent) {
      const p = this.model.comp(c.parent);
      const ps = this.phone.comps[p.id]!.state;
      if (ps === 'installed') return fail('open_first', { name: nameOf(p) });
      if (ps === 'open' && this.phone.orientation !== this.model.sideOf(p)) return fail('flip_first');
    } else if (this.phone.orientation !== this.model.sideOf(c)) {
      return fail('flip_first');
    }
    for (const b of c.blockedBy) {
      if (!this.blockerOk(b)) {
        const bd = this.blockerDef(b);
        return fail(b.endsWith('@open') ? 'open_first' : 'blocked_by', { name: nameOf(bd), part: nameOf(c) });
      }
    }
    return OK;
  }

  fastenerAccess(fid: string): Check {
    const { owner, f } = this.model.fastener(fid);
    const os = this.phone.comps[owner.id]!.state;
    if (os === 'removed') return fail('part_not_in_phone', { name: nameOf(owner) });
    const access = f.type === 'screw' || f.type === 'connector' ? f.access : undefined;
    const parentRemoved = owner.parent ? this.phone.comps[owner.parent]!.state === 'removed' : false;
    const requires = this.model.accessRequires(owner, f);
    if (requires) {
      for (const r of requires) {
        if (!this.blockerOk(r)) {
          return fail(r.endsWith('@open') ? 'open_first' : 'blocked_by', {
            name: nameOf(this.blockerDef(r)),
            part: nameOf(owner),
          });
        }
      }
      const side = access?.side ?? this.model.sideOf(owner);
      if (!parentRemoved && side !== 'any' && side !== this.phone.orientation) return fail('flip_first');
    } else {
      const side = access?.side ?? this.model.sideOf(owner);
      if (owner.parent) {
        const p = this.model.comp(owner.parent);
        if (this.phone.comps[p.id]!.state === 'installed') return fail('open_first', { name: nameOf(p) });
      }
      if (!parentRemoved && side !== 'any' && side !== this.phone.orientation) return fail('flip_first');
      for (const b of owner.blockedBy) {
        if (!this.blockerOk(b)) {
          return fail(b.endsWith('@open') ? 'open_first' : 'blocked_by', {
            name: nameOf(this.blockerDef(b)),
            part: nameOf(owner),
          });
        }
      }
    }
    const stage = this.model.stageOf(owner, f);
    if (owner.hinge) {
      if (stage === 'remove' && os !== 'open') return fail('open_first', { name: nameOf(owner) });
      if (stage === 'open' && os !== 'installed') return fail('close_first', { name: nameOf(owner) });
    }
    if (f.type === 'connector' && f.under && this.phone.comps[f.under]!.state !== 'removed') {
      return fail('bracket_first', { name: nameOf(this.model.comp(f.under)) });
    }
    return OK;
  }

  released(f: FastenerDef): boolean {
    switch (f.type) {
      case 'screw':
        return this.phone.holes[f.id] == null;
      case 'adhesive':
        return !this.phone.adhesives[f.id]!.bonded;
      case 'connector':
        return !this.phone.connectors[f.id]!.connected;
      case 'clip':
        return true;
      case 'bracket':
        return this.phone.comps[f.bracketId]!.state === 'removed';
    }
  }

  heldScrew(): ScrewItem | null {
    for (const s of Object.values(this.phone.screws)) if (s.loc.k === 'held') return s;
    return null;
  }

  matCellCount(cell: number): number {
    let n = 0;
    for (const s of Object.values(this.phone.screws)) if (s.loc.k === 'mat' && s.loc.cell === cell) n++;
    return n;
  }

  batteryLive(): boolean {
    const bc = this.model.batteryConn;
    if (!bc) return false;
    const owner = this.model.fastener(bc).owner;
    return this.phone.comps[owner.id]!.state !== 'removed' && this.phone.connectors[bc]!.connected;
  }

  /** First fastener still holding the component, limited to a stage for hinged parts. */
  private firstUnreleased(c: ComponentDef, stage: 'open' | 'remove' | 'all'): FastenerDef | null {
    for (const f of c.attachedBy) {
      if (stage !== 'all' && this.model.stageOf(c, f) !== stage) continue;
      if (!this.released(f)) return f;
    }
    return null;
  }

  private unreleasedReason(c: ComponentDef, f: FastenerDef): Check {
    switch (f.type) {
      case 'screw': {
        const n = this.model.screwsOf(c).filter((s) => this.phone.holes[s.id] != null).length;
        return fail('screws_left', { n, name: nameOf(c) });
      }
      case 'adhesive':
        return fail(f.kind === 'pulltab' ? 'tabs_left' : 'adhesive_left', { name: nameOf(c) });
      case 'connector':
        return fail('connector_left', { name: nameOf(c) });
      case 'bracket':
        return fail('bracket_first', { name: nameOf(this.model.comp(f.bracketId)) });
      case 'clip':
        return OK;
    }
  }

  /* ------------------------------------------------------------------ can() */

  can(a: Action): Check {
    const ph = this.phone;
    switch (a.t) {
      case 'power': {
        if (a.on === ph.poweredOn) return fail('noop');
        if (a.on && !this.canBoot()) return fail('no_power');
        return OK;
      }
      case 'flip': {
        for (const c of this.model.def.components) {
          if (c.hinge && ph.comps[c.id]!.state === 'open') return fail('close_first', { name: nameOf(c) });
        }
        return OK;
      }
      case 'unscrew': {
        const ref = this.model.fasteners.get(a.hole);
        if (!ref || ref.f.type !== 'screw') return fail('noop');
        const sid = ph.holes[a.hole];
        if (sid == null) return fail('noop');
        if (this.tool('driver') < 1) return fail('need_tool', { tool: '@tools.driver.name' });
        const acc = this.fastenerAccess(a.hole);
        if (!acc.ok) return acc;
        if (this.heldScrew()) return fail('screw_in_hand');
        if (ref.f.screwType !== a.bit) return fail('wrong_bit', { bit: ref.f.screwType });
        if (this.ctx.strict && ph.poweredOn) return fail('power_off_first');
        return OK;
      }
      case 'placeScrew': {
        const s = ph.screws[a.screw];
        if (!s || s.loc.k !== 'held') return fail('noop');
        if (a.to.k === 'mat') {
          if (a.to.cell < 0 || a.to.cell >= this.ctx.matCells) return fail('noop');
          if (this.matCellCount(a.to.cell) >= MAT_CELL_CAPACITY) return fail('cell_full');
        }
        return OK;
      }
      case 'pickScrew': {
        const s = ph.screws[a.screw];
        if (!s) return fail('noop');
        if (s.loc.k === 'lost') return fail('screw_lost');
        if (s.loc.k !== 'mat' && s.loc.k !== 'bench') return fail('noop');
        if (this.heldScrew()) return fail('screw_in_hand');
        return OK;
      }
      case 'screwIn': {
        const ref = this.model.fasteners.get(a.hole);
        if (!ref || ref.f.type !== 'screw') return fail('noop');
        if (ph.holes[a.hole] != null) return fail('noop');
        const s = ph.screws[a.screw];
        if (!s || s.loc.k !== 'held') return fail('no_screw_in_hand');
        if (this.tool('driver') < 1) return fail('need_tool', { tool: '@tools.driver.name' });
        const acc = this.fastenerAccess(a.hole);
        if (!acc.ok) return acc;
        if (s.type !== ref.f.screwType) return fail('screw_wrong_type', { type: ref.f.screwType });
        if (a.bit !== s.type) return fail('wrong_bit', { bit: s.type });
        if (
          this.ctx.strict &&
          ref.f.overBoard &&
          s.length > ref.f.length + SCREW_LEN_TOLERANCE
        ) {
          return fail('long_screw_warning', { len: s.length, hole: ref.f.length });
        }
        return OK;
      }
      case 'extract': {
        const sid = ph.holes[a.hole];
        if (sid == null || !ph.screws[sid]!.stripped) return fail('noop');
        if (this.tool('extractor') < 1) return fail('need_tool', { tool: '@tools.extractor.name' });
        if (this.heldScrew()) return fail('screw_in_hand');
        return this.fastenerAccess(a.hole);
      }
      case 'findScrew': {
        const s = ph.screws[a.screw];
        if (!s || s.loc.k !== 'lost') return fail('noop');
        if (this.tool('flashlight') < 1) return fail('need_tool', { tool: '@tools.flashlight.name' });
        return OK;
      }
      case 'heat': {
        const ref = this.model.fasteners.get(a.adhesive);
        if (!ref || ref.f.type !== 'adhesive') return fail('noop');
        if (this.tool('heat') < 1) return fail('need_tool', { tool: '@tools.heat.name' });
        if (ph.comps[ref.owner.id]!.state === 'removed') return fail('noop');
        if (!ph.adhesives[a.adhesive]!.bonded) return fail('noop');
        if (ref.f.kind === 'perimeter' && ph.orientation !== this.model.sideOf(ref.owner)) return fail('flip_first');
        return OK;
      }
      case 'suction': {
        const c = this.model.comps.get(a.comp);
        if (!c || !c.hinge) return fail('noop');
        if (ph.comps[c.id]!.state !== 'installed') return fail('noop');
        if (this.tool('suction') < 1) return fail('need_tool', { tool: '@tools.suction.name' });
        if (ph.orientation !== this.model.sideOf(c)) return fail('flip_first');
        for (const s of this.model.screwsOf(c)) {
          if (this.model.stageOf(c, s) === 'open' && ph.holes[s.id] != null) {
            return fail('screws_first', { name: nameOf(c) });
          }
        }
        return OK;
      }
      case 'cut': {
        const ref = this.model.fasteners.get(a.adhesive);
        if (!ref || ref.f.type !== 'adhesive' || ref.f.kind === 'pulltab') return fail('noop');
        const st = ph.adhesives[a.adhesive]!;
        if (!st.bonded) return fail('noop');
        if (a.seg < 0 || a.seg >= st.segs.length) return fail('noop');
        if (this.tool('pick') < 1 && this.tool('spudger') < 1) return fail('need_tool', { tool: '@tools.pick.name' });
        if (ref.f.kind === 'perimeter') {
          if (ph.orientation !== this.model.sideOf(ref.owner)) return fail('flip_first');
          if (!st.gap) return fail('suction_first');
          if (this.ctx.strict && a.depth > 0.6 && this.inDanger(ref.f, a.seg, st.segs.length)) {
            return fail('too_deep');
          }
        } else {
          const ex = this.exposed(ref.owner);
          if (!ex.ok) return ex;
        }
        return OK;
      }
      case 'open': {
        const c = this.model.comps.get(a.comp);
        if (!c || !c.hinge || ph.comps[c.id]!.state !== 'installed') return fail('noop');
        if (ph.orientation !== this.model.sideOf(c)) return fail('flip_first');
        const f = this.firstUnreleased(c, 'open');
        if (f) return this.unreleasedReason(c, f);
        return OK;
      }
      case 'close': {
        const c = this.model.comps.get(a.comp);
        if (!c || !c.hinge || ph.comps[c.id]!.state !== 'open') return fail('noop');
        return OK;
      }
      case 'disconnect': {
        const ref = this.model.fasteners.get(a.conn);
        if (!ref || ref.f.type !== 'connector') return fail('noop');
        if (!ph.connectors[a.conn]!.connected) return fail('noop');
        if (this.tool('spudger') < 1) return fail('need_tool', { tool: '@tools.spudger.name' });
        const acc = this.fastenerAccess(a.conn);
        if (!acc.ok) return acc;
        if (this.ctx.strict) {
          if (ph.poweredOn) return fail('power_off_first');
          if (!ref.f.isBattery && !ref.f.local && this.batteryLive()) return fail('battery_first');
        }
        return OK;
      }
      case 'connect': {
        const ref = this.model.fasteners.get(a.conn);
        if (!ref || ref.f.type !== 'connector') return fail('noop');
        if (ph.connectors[a.conn]!.connected) return fail('noop');
        const acc = this.fastenerAccess(a.conn);
        if (!acc.ok) return acc;
        if (!ref.f.local && this.model.boardId && ph.comps[this.model.boardId]!.state !== 'installed') {
          return fail('board_missing');
        }
        if (ref.f.local && ref.owner.parent && ph.comps[ref.owner.id]!.state === 'removed') {
          return fail('part_not_in_phone', { name: nameOf(ref.owner) });
        }
        if (this.ctx.strict && !ref.f.isBattery && !ref.f.local && this.batteryLive()) {
          return fail('battery_last');
        }
        if (this.ctx.strict && ref.f.isBattery) {
          for (const { owner, f } of this.model.allConnectors()) {
            if (f.isBattery || f.local) continue;
            if (ph.comps[owner.id]!.state !== 'removed' && !ph.connectors[f.id]!.connected) {
              return fail('battery_last');
            }
          }
        }
        return OK;
      }
      case 'remove': {
        const c = this.model.comps.get(a.comp);
        if (!c || c.removable === false) return fail('not_removable');
        const st = ph.comps[c.id]!;
        if (st.state === 'removed') return fail('noop');
        const ex = this.exposed(c);
        if (!ex.ok) return ex;
        if (c.hinge && st.state === 'installed') return fail('open_first', { name: nameOf(c) });
        const f = this.firstUnreleased(c, c.hinge ? 'remove' : 'all');
        if (f) return this.unreleasedReason(c, f);
        if (c.isBoard) {
          for (const { owner, f: cf } of this.model.allConnectors()) {
            if (cf.local) continue;
            if (ph.comps[owner.id]!.state !== 'removed' && ph.connectors[cf.id]!.connected) {
              return fail('connectors_on_board', { name: nameOf(owner) });
            }
          }
        }
        return OK;
      }
      case 'install': {
        const c = this.model.comps.get(a.comp);
        if (!c) return fail('noop');
        if (ph.comps[c.id]!.state !== 'removed') return fail('noop');
        if (c.parent) {
          const p = this.model.comp(c.parent);
          if (ph.comps[p.id]!.state === 'installed') return fail('open_first', { name: nameOf(p) });
          for (const b of c.blockedBy) {
            if (!this.blockerOk(b)) return fail('blocked_by', { name: nameOf(this.blockerDef(b)), part: nameOf(c) });
          }
          return OK;
        }
        return this.exposed(c);
      }
      case 'pullTab': {
        const ref = this.model.fasteners.get(a.adhesive);
        if (!ref || ref.f.type !== 'adhesive' || ref.f.kind !== 'pulltab') return fail('noop');
        const st = ph.adhesives[a.adhesive]!;
        if (!st.bonded || a.tab < 0 || a.tab >= st.segs.length) return fail('noop');
        if (st.segs[a.tab]! >= 1) return fail('noop');
        if (st.broken[a.tab]) return fail('tab_broken');
        return this.exposed(ref.owner);
      }
      case 'ipa': {
        const ref = this.model.fasteners.get(a.adhesive);
        if (!ref || ref.f.type !== 'adhesive') return fail('noop');
        if (this.tool('ipa') < 1) return fail('need_tool', { tool: '@tools.ipa.name' });
        if (!ph.adhesives[a.adhesive]!.bonded) return fail('noop');
        return this.exposed(ref.owner);
      }
      case 'pry': {
        const ref = this.model.fasteners.get(a.adhesive);
        if (!ref || ref.f.type !== 'adhesive' || ref.f.kind !== 'pulltab') return fail('noop');
        const st = ph.adhesives[a.adhesive]!;
        if (!st.bonded) return fail('noop');
        if (!st.broken.some((b, i) => b && st.segs[i]! < 1)) return fail('noop');
        if (this.tool('card') < 1 && this.tool('spudger') < 1) return fail('need_tool', { tool: '@tools.card.name' });
        const ex = this.exposed(ref.owner);
        if (!ex.ok) return ex;
        if (this.ctx.strict && st.softened < 0.5) return fail('ipa_first');
        return OK;
      }
      case 'clean': {
        const c = this.model.comps.get(a.comp);
        if (!c) return fail('noop');
        const st = ph.comps[c.id]!;
        if (st.dirt <= 0 && st.corrosion <= 0) return fail('already_clean');
        const toolId = a.tool === 'ultrasonic' ? 'ultrasonic' : a.tool;
        if (this.tool(toolId) < 1) return fail('need_tool', { tool: `@tools.${toolId}.name` });
        if (a.tool === 'ultrasonic') {
          if (st.state !== 'removed') return fail('remove_for_bath', { name: nameOf(c) });
          if (c.partCategory === 'battery' || c.partCategory === 'display') return fail('no_bath', { name: nameOf(c) });
          return OK;
        }
        if (a.tool === 'toothpick' && !c.externalClean) return fail('toothpick_port_only');
        if (st.state === 'removed') return OK;
        if (c.externalClean && (a.tool === 'toothpick' || a.tool === 'air' || a.tool === 'brush')) return OK;
        const ex = this.exposed(c);
        if (!ex.ok) return ex;
        if (this.ctx.strict && a.tool === 'ipa' && this.batteryLive()) return fail('battery_first');
        return OK;
      }
      case 'replace': {
        const c = this.model.comps.get(a.comp);
        if (!c || c.removable === false) return fail('noop');
        if (ph.comps[c.id]!.state !== 'removed') return fail('remove_before_replace', { name: nameOf(c) });
        for (const childId of this.model.children.get(c.id) ?? []) {
          if (ph.comps[childId]!.state !== 'removed') {
            return fail('transfer_first', { name: nameOf(this.model.comp(childId)) });
          }
        }
        return OK;
      }
      case 'applyAdhesive': {
        const ref = this.model.fasteners.get(a.adhesive);
        if (!ref || ref.f.type !== 'adhesive') return fail('noop');
        if (this.tool('adhesive') < 1) return fail('need_tool', { tool: '@tools.adhesive.name' });
        const st = ph.adhesives[a.adhesive]!;
        if (st.fresh || st.bonded) return fail('noop');
        const os = ph.comps[ref.owner.id]!.state;
        if (ref.f.kind === 'perimeter') {
          if (os === 'installed') return fail('open_first', { name: nameOf(ref.owner) });
        } else if (os !== 'removed') {
          return fail('remove_before_adhesive', { name: nameOf(ref.owner) });
        }
        return OK;
      }
      case 'readChip': {
        const c = this.model.comps.get(a.comp);
        if (!c || !c.pairing) return fail('noop');
        if (this.tool('programmer') < 1) return fail('need_tool', { tool: '@tools.programmer.name' });
        const st = ph.comps[c.id]!;
        if (!st.paired) return fail('no_pairing_data');
        if (ph.savedData.includes(c.partCategory)) return fail('noop');
        if (st.state === 'installed') return fail('open_first', { name: nameOf(c) });
        return OK;
      }
      case 'program': {
        const c = this.model.comps.get(a.comp);
        if (!c || !c.pairing) return fail('noop');
        if (this.tool('programmer') < 1) return fail('need_tool', { tool: '@tools.programmer.name' });
        const st = ph.comps[c.id]!;
        if (st.paired) return fail('noop');
        if (c.partCategory === 'home_button' || c.partCategory === 'front_sensor') return fail('cannot_pair');
        if (c.partCategory === 'display' && !ph.savedData.includes('display')) return fail('read_chip_first');
        return OK;
      }
      case 'solder': {
        if (!ph.boardFaults.some((f) => f.id === a.fault)) return fail('noop');
        if (this.tool('solder') < 1) return fail('need_tool', { tool: '@tools.solder.name' });
        if (this.tool('microscope') < 1) return fail('need_tool', { tool: '@tools.microscope.name' });
        if (this.model.boardId && ph.comps[this.model.boardId]!.state !== 'removed') {
          return fail('remove_board_first');
        }
        return OK;
      }
    }
  }

  private inDanger(f: AdhesiveDef, seg: number, n: number): boolean {
    if (!f.dangerZones) return false;
    const mid = (seg + 0.5) / n;
    return f.dangerZones.some(([a, b]) => mid >= a && mid <= b);
  }

  /** Battery, board and their link are good enough for the phone to boot. */
  canBoot(): boolean {
    const ph = this.phone;
    const { boardId, batteryId, batteryConn } = this.model;
    if (!boardId || !batteryId || !batteryConn) return false;
    const board = ph.comps[boardId]!;
    const bat = ph.comps[batteryId]!;
    if (board.state !== 'installed' || board.condition === 'damaged' || board.condition === 'missing') return false;
    if (board.corrosion > 0.6) return false;
    if (bat.state !== 'installed' || bat.condition === 'damaged' || bat.doa) return false;
    if ((bat.health ?? 1) < 0.08) return false;
    if (!ph.connectors[batteryConn]!.connected || ph.connectors[batteryConn]!.damaged) return false;
    if (ph.boardFaults.some((f) => f.affects.includes('power'))) return false;
    return true;
  }

  /* ------------------------------------------------------------------ perform */

  private mistake(events: RepairEvent[], key: string, severity: 1 | 2 | 3, params?: Mistake['params']): void {
    this.phone.mistakes.push({ key, severity, params });
    events.push({ type: 'mistake', key: `repair.mistake.${key}`, params, value: severity });
  }

  perform(a: Action): ActionResult {
    const check = this.can(a);
    if (!check.ok) return { ok: false, reason: check.reason, reasonParams: check.params, events: [] };
    const ev: RepairEvent[] = [];
    const ph = this.phone;
    switch (a.t) {
      case 'power':
        ph.poweredOn = a.on;
        ev.push({ type: a.on ? 'power_on' : 'power_off' });
        break;
      case 'flip':
        ph.orientation = ph.orientation === 'front' ? 'back' : 'front';
        ev.push({ type: 'flip' });
        break;
      case 'unscrew':
        this.doUnscrew(a.hole, ev);
        break;
      case 'placeScrew': {
        const s = ph.screws[a.screw]!;
        s.loc = a.to.k === 'mat' ? { k: 'mat', cell: a.to.cell } : { k: 'bench', x: a.to.x, z: a.to.z };
        ev.push({ type: a.to.k === 'mat' ? 'screw_placed' : 'screw_dropped', id: s.id });
        break;
      }
      case 'pickScrew':
        ph.screws[a.screw]!.loc = { k: 'held' };
        ev.push({ type: 'screw_picked', id: a.screw });
        break;
      case 'screwIn':
        this.doScrewIn(a.hole, a.screw, a.torque, ev);
        break;
      case 'extract': {
        const sid = ph.holes[a.hole]!;
        const s = ph.screws[sid]!;
        ph.holes[a.hole] = null;
        s.loc = { k: 'held' };
        s.stripped = false; // swapped for a spare from the extractor kit
        s.torque = 0;
        ev.push({ type: 'screw_extracted', id: sid });
        break;
      }
      case 'findScrew': {
        const s = ph.screws[a.screw]!;
        s.loc = { k: 'bench', x: this.rng.range(-0.2, 0.2), z: this.rng.range(0.1, 0.22) };
        ev.push({ type: 'screw_found', id: s.id });
        break;
      }
      case 'heat':
        this.doHeat(a.adhesive, a.dt, ev);
        break;
      case 'suction':
        this.doSuction(a.comp, ev);
        break;
      case 'cut':
        this.doCut(a.adhesive, a.seg, a.depth, ev);
        break;
      case 'open':
        ph.comps[a.comp]!.state = 'open';
        ev.push({ type: 'opened', id: a.comp });
        break;
      case 'close':
        this.doClose(a.comp, ev);
        break;
      case 'disconnect':
        this.doDisconnect(a.conn, ev);
        break;
      case 'connect':
        this.doConnect(a.conn, ev);
        break;
      case 'remove':
        this.doRemove(a.comp, ev);
        break;
      case 'install':
        this.doInstall(a.comp, ev);
        break;
      case 'pullTab':
        this.doPullTab(a.adhesive, a.tab, a.speed, a.dt, ev);
        break;
      case 'ipa':
        ph.adhesives[a.adhesive]!.softened = 1;
        ev.push({ type: 'ipa', id: a.adhesive });
        break;
      case 'pry':
        this.doPry(a.adhesive, a.dt, ev);
        break;
      case 'clean':
        this.doClean(a.comp, a.tool, a.amount, ev);
        break;
      case 'replace':
        this.doReplace(a.comp, a.quality, ev);
        break;
      case 'applyAdhesive':
        ph.adhesives[a.adhesive]!.fresh = true;
        ev.push({ type: 'adhesive_applied', id: a.adhesive });
        break;
      case 'readChip': {
        const c = this.model.comp(a.comp);
        ph.savedData.push(c.partCategory);
        ev.push({ type: 'chip_read', id: a.comp });
        break;
      }
      case 'program':
        ph.comps[a.comp]!.paired = true;
        ev.push({ type: 'programmed', id: a.comp });
        break;
      case 'solder': {
        if (a.quality >= 0.5) {
          const fault = ph.boardFaults.find((f) => f.id === a.fault)!;
          ph.boardFaults = ph.boardFaults.filter((f) => f.id !== a.fault);
          if (fault.ref && ph.connectors[fault.ref]) ph.connectors[fault.ref]!.damaged = false;
          ev.push({ type: 'soldered', id: a.fault, value: a.quality });
        } else {
          ev.push({ type: 'solder_fail', id: a.fault, value: a.quality });
          if (a.quality < 0.2) this.mistake(ev, 'bad_solder', 1);
        }
        break;
      }
    }
    return { ok: true, events: ev };
  }

  private doUnscrew(hole: string, ev: RepairEvent[]): void {
    const ph = this.phone;
    const { owner } = this.model.fastener(hole);
    const sid = ph.holes[hole]!;
    const s = ph.screws[sid]!;
    const tier = Math.max(1, this.tool('driver'));
    const corroded = ph.comps[owner.id]!.corrosion > 0.5;
    const base = [0.03, 0.008, 0.001][Math.min(3, tier) - 1]!;
    if (s.stripped) {
      // a chewed head can still be coaxed out with patience; the extractor does it first time
      if (!this.ctx.strict && !this.rng.chance(0.35)) {
        ev.push({ type: 'screw_stripped', id: sid, key: 'repair.event.stripped_slip' });
        return;
      }
    } else if (this.risk(corroded ? base * 5 : base * 0.12)) {
      s.stripped = true;
      ev.push({ type: 'screw_stripped', id: sid });
      this.mistake(ev, 'stripped_screw', 1);
      return;
    }
    ph.holes[hole] = null;
    s.loc = { k: 'held' };
    s.torque = 0;
    ev.push({ type: 'screw_out', id: sid });
  }

  private doScrewIn(hole: string, screwId: string, torque: number, ev: RepairEvent[]): void {
    const ph = this.phone;
    const def = this.model.fastener(hole).f as ScrewDef;
    const s = ph.screws[screwId]!;
    ph.holes[hole] = screwId;
    s.loc = { k: 'hole', hole };
    let tq = Math.max(0, torque);
    if (s.length > def.length + SCREW_LEN_TOLERANCE) {
      if (def.overBoard) {
        const id = `long_${hole}`;
        if (!ph.boardFaults.some((f) => f.id === id)) {
          ph.boardFaults.push({ id, kind: 'long_screw', affects: [def.damages ?? 'touch'], ref: hole });
        }
        ev.push({ type: 'long_screw', id: hole, key: 'repair.event.long_screw' });
        this.mistake(ev, 'long_screw', 3);
      } else {
        this.mistake(ev, 'wrong_screw', 1);
      }
    } else if (s.length < def.length - SCREW_LEN_TOLERANCE) {
      tq = Math.min(tq, 0.5);
      this.mistake(ev, 'wrong_screw', 1);
    }
    if (tq > TORQUE_OVER) {
      const tier = Math.max(1, this.tool('driver'));
      const k = [1, 0.5, 0.2][Math.min(3, tier) - 1]!;
      if (this.risk((tq - TORQUE_OVER) * 2.2 * k + 0.1 * k)) {
        s.stripped = true;
        ev.push({ type: 'screw_stripped', id: screwId });
        this.mistake(ev, 'stripped_screw', 1);
      }
      tq = 1;
    }
    s.torque = Math.min(1, tq);
    ev.push({ type: s.torque < TORQUE_LOOSE ? 'screw_loose' : 'screw_in', id: screwId });
  }

  private doHeat(adhesive: string, dt: number, ev: RepairEvent[]): void {
    const ph = this.phone;
    const { owner } = this.model.fastener(adhesive);
    const st = ph.adhesives[adhesive]!;
    const tier = Math.min(3, Math.max(1, this.tool('heat')));
    const before = st.temp;
    let next = st.temp + HEAT_RATE[tier]! * dt;
    if (tier >= 3) next = Math.min(next, HEAT_PLATE_CAP);
    if (this.ctx.strict) next = Math.min(next, OVERHEAT_TEMP - 10);
    st.temp = next;
    ev.push({ type: 'heat', id: adhesive, value: st.temp });
    if (before < OVERHEAT_TEMP && st.temp >= OVERHEAT_TEMP) {
      ev.push({ type: 'overheat', id: adhesive, key: 'repair.event.overheat' });
      this.mistake(ev, 'overheat', 2);
      const cs = ph.comps[owner.id]!;
      if (cs.condition !== 'damaged' && this.rng.chance(0.55)) {
        cs.condition = 'damaged';
        ev.push({ type: 'part_damaged', id: owner.id, key: 'repair.event.heat_damage', params: { name: nameOf(owner) } });
      }
    }
  }

  private doSuction(compId: string, ev: RepairEvent[]): void {
    const ph = this.phone;
    const c = this.model.comp(compId);
    const per = this.model.adhesivesOf(c).find((f) => f.kind === 'perimeter');
    if (!per || !ph.adhesives[per.id]!.bonded) {
      ev.push({ type: 'suction_pop', id: compId });
      return;
    }
    const st = ph.adhesives[per.id]!;
    if (st.gap) {
      ev.push({ type: 'suction_pop', id: compId });
      return;
    }
    const bonus = [0, 0, 6, 12][Math.min(3, this.tool('suction'))]!;
    if (st.temp >= adhesiveSoftTemp(per) - bonus) {
      st.gap = true;
      this.coldPulls[compId] = 0;
      ev.push({ type: 'suction_pop', id: compId });
      return;
    }
    const n = (this.coldPulls[compId] = (this.coldPulls[compId] ?? 0) + 1);
    ev.push({ type: 'suction_fail', id: compId, key: 'repair.err.adhesive_cold' });
    if (n >= 3 && this.risk(0.3 * c.fragility)) {
      const cs = ph.comps[compId]!;
      if (cs.condition !== 'damaged') {
        cs.condition = 'damaged';
        ev.push({ type: 'part_damaged', id: compId, key: 'repair.event.forced_crack', params: { name: nameOf(c) } });
        this.mistake(ev, 'forced_open', 2);
      }
    }
  }

  private doCut(adhesive: string, seg: number, depth: number, ev: RepairEvent[]): void {
    const ph = this.phone;
    const ref = this.model.fastener(adhesive);
    const f = ref.f as AdhesiveDef;
    const st = ph.adhesives[adhesive]!;
    if (f.kind === 'perimeter' && depth > 0.6 && this.inDanger(f, seg, st.segs.length)) {
      const cs = ph.comps[ref.owner.id]!;
      if (cs.condition !== 'damaged' && this.risk(0.8)) {
        cs.condition = 'damaged';
        ev.push({ type: 'flex_cut', id: ref.owner.id, key: 'repair.event.flex_cut', params: { name: nameOf(ref.owner) } });
        this.mistake(ev, 'flex_cut', 3);
      }
    }
    const warm = st.temp >= adhesiveSoftTemp(f) - 15 || st.softened > 0.5;
    const gain = warm ? 1 : 0.5;
    if (st.segs[seg]! < 1) {
      st.segs[seg] = Math.min(1, st.segs[seg]! + gain);
      ev.push({ type: st.segs[seg]! >= 1 ? 'cut' : 'cut_stuck', id: adhesive, value: seg });
    }
    if (st.segs.every((v) => v >= 1)) {
      st.bonded = false;
      st.gap = false;
      ev.push({ type: 'adhesive_released', id: adhesive });
    }
  }

  private doClose(compId: string, ev: RepairEvent[]): void {
    const ph = this.phone;
    const c = this.model.comp(compId);
    ph.comps[compId]!.state = 'installed';
    for (const f of this.model.adhesivesOf(c)) {
      if (f.kind !== 'perimeter') continue;
      const st = ph.adhesives[f.id]!;
      if (st.fresh && !st.bonded) {
        ph.adhesives[f.id] = freshAdhesiveState(f, true);
      }
    }
    ev.push({ type: 'closed', id: compId });
  }

  private doDisconnect(conn: string, ev: RepairEvent[]): void {
    const ph = this.phone;
    const ref = this.model.fastener(conn);
    const f = ref.f as ConnectorDef;
    const cs = ph.connectors[conn]!;
    if (f.isBattery) {
      if (ph.poweredOn) {
        ev.push({ type: 'short', id: conn, key: 'repair.event.short_powered' });
        this.mistake(ev, 'hot_disconnect', 2);
        if (this.risk(0.35, true)) {
          ph.boardFaults.push({ id: `short_${conn}_${ph.boardFaults.length}`, kind: 'short', affects: ['charging'] });
          ev.push({ type: 'part_damaged', id: this.model.boardId ?? conn, key: 'repair.event.board_short' });
        }
      }
      ph.poweredOn = false;
    } else if (!f.local && this.batteryLive()) {
      this.liveConnectorRisk(ref.owner, ev);
    }
    const tier = Math.min(3, Math.max(1, this.tool('spudger')));
    if (!cs.damaged && this.risk([0.02, 0.007, 0.001][tier - 1]!)) {
      cs.damaged = true;
      if (!f.local) {
        ph.boardFaults.push({
          id: `conn_${conn}`,
          kind: 'connector',
          affects: [...ref.owner.functions],
          ref: conn,
        });
      }
      ev.push({ type: 'connector_damaged', id: conn, key: 'repair.event.connector_damaged' });
      this.mistake(ev, 'connector_damaged', 2);
    }
    cs.connected = false;
    ev.push({ type: 'connector_off', id: conn });
  }

  private liveConnectorRisk(owner: ComponentDef, ev: RepairEvent[]): void {
    this.mistake(ev, 'battery_connected', 1);
    if (this.risk(0.3, true)) {
      const cs = this.phone.comps[owner.id]!;
      if (cs.condition !== 'damaged') {
        cs.condition = 'damaged';
        ev.push({ type: 'short', id: owner.id, key: 'repair.event.short_live', params: { name: nameOf(owner) } });
        ev.push({ type: 'part_damaged', id: owner.id });
        this.mistake(ev, 'short_circuit', 3);
      }
    }
  }

  private doConnect(conn: string, ev: RepairEvent[]): void {
    const ref = this.model.fastener(conn);
    const f = ref.f as ConnectorDef;
    if (!f.isBattery && !f.local && this.batteryLive()) this.liveConnectorRisk(ref.owner, ev);
    this.phone.connectors[conn]!.connected = true;
    ev.push({ type: 'connector_on', id: conn });
  }

  private doRemove(compId: string, ev: RepairEvent[]): void {
    const ph = this.phone;
    const c = this.model.comp(compId);
    const cs = ph.comps[compId]!;
    const tier = Math.min(3, Math.max(1, this.tool('tweezers')));
    if (cs.condition !== 'damaged' && c.fragility >= 0.5) {
      if (this.risk(c.fragility * [0.035, 0.012, 0.003][tier - 1]!, true)) {
        cs.condition = 'damaged';
        ev.push({ type: 'part_damaged', id: compId, key: 'repair.event.fragile_damaged', params: { name: nameOf(c) } });
        this.mistake(ev, 'fragile_damaged', 2);
      }
    }
    cs.state = 'removed';
    ev.push({ type: 'removed', id: compId });
    ev.push({ type: 'encyclopedia', id: `${this.model.def.id}:${compId}` });
    if (this.model.removable().every((r) => ph.comps[r.id]!.state === 'removed')) {
      ph.flags.teardownDone = true;
    }
  }

  private doInstall(compId: string, ev: RepairEvent[]): void {
    const ph = this.phone;
    const c = this.model.comp(compId);
    const cs = ph.comps[compId]!;
    cs.state = c.hinge ? 'open' : 'installed';
    delete cs.tray;
    for (const f of this.model.adhesivesOf(c)) {
      const st = ph.adhesives[f.id]!;
      if (f.kind === 'perimeter') continue; // handled when the part is closed
      ph.adhesives[f.id] = freshAdhesiveState(f, st.fresh);
      if (!st.fresh) ph.adhesives[f.id]!.bonded = false;
    }
    ev.push({ type: 'installed', id: compId });
  }

  private doPullTab(adhesive: string, tab: number, speed: number, dt: number, ev: RepairEvent[]): void {
    const st = this.phone.adhesives[adhesive]!;
    const tier = Math.min(3, this.tool('tweezers'));
    const safe = 0.45 + 0.12 * tier;
    const sp = Math.max(0, Math.min(1.5, speed));
    if (sp > safe && this.risk((sp - safe) * 2.5 * dt + (sp > safe + 0.4 ? 0.5 * dt : 0))) {
      st.broken[tab] = true;
      ev.push({ type: 'tab_snap', id: adhesive, value: tab });
      this.mistake(ev, 'tab_snapped', 1);
      return;
    }
    st.segs[tab] = Math.min(1, st.segs[tab]! + sp * dt * 0.55);
    ev.push({ type: st.segs[tab]! >= 1 ? 'tab_done' : 'tab_progress', id: adhesive, value: tab });
    this.checkTabsReleased(adhesive, ev);
  }

  private checkTabsReleased(adhesive: string, ev: RepairEvent[]): void {
    const st = this.phone.adhesives[adhesive]!;
    if (st.bonded && st.segs.every((v) => v >= 1)) {
      st.bonded = false;
      ev.push({ type: 'adhesive_released', id: adhesive });
    }
  }

  private doPry(adhesive: string, dt: number, ev: RepairEvent[]): void {
    const ph = this.phone;
    const { owner } = this.model.fastener(adhesive);
    const st = ph.adhesives[adhesive]!;
    const soft = st.softened >= 0.5;
    if (!soft && this.risk(0.12 * dt)) {
      const cs = ph.comps[owner.id]!;
      cs.condition = 'damaged';
      cs.swollen = true;
      ev.push({ type: 'battery_punctured', id: owner.id, key: 'repair.event.battery_punctured' });
      this.mistake(ev, 'battery_punctured', 3);
    }
    const rate = soft ? 0.4 : 0.1;
    for (let i = 0; i < st.segs.length; i++) {
      if (st.broken[i] && st.segs[i]! < 1) st.segs[i] = Math.min(1, st.segs[i]! + rate * dt);
    }
    ev.push({ type: 'pry', id: adhesive });
    this.checkTabsReleased(adhesive, ev);
  }

  private doClean(compId: string, tool: string, amount: number, ev: RepairEvent[]): void {
    const ph = this.phone;
    const c = this.model.comp(compId);
    const cs = ph.comps[compId]!;
    const wasDirty = cs.dirt > 0.05 || cs.corrosion > 0.05;
    const amt = Math.max(0, amount);
    switch (tool) {
      case 'brush':
        cs.dirt = Math.max(0, cs.dirt - amt * (this.tool('brush') >= 2 ? 1.4 : 1));
        // a dry brush only removes the loose surface layer of corrosion
        if (cs.corrosion > 0.6) cs.corrosion = Math.max(0.6, cs.corrosion - amt * 0.3);
        break;
      case 'air':
        cs.dirt = Math.max(0, cs.dirt - amt * (this.tool('air') >= 2 ? 2 : 1.3));
        break;
      case 'toothpick':
        cs.dirt = Math.max(0, cs.dirt - amt * 2);
        break;
      case 'ipa':
        if (cs.state !== 'removed' && this.batteryLive() && !c.externalClean) {
          this.liveConnectorRisk(c, ev);
        }
        cs.corrosion = Math.max(0, cs.corrosion - amt * 0.7);
        cs.dirt = Math.max(0, cs.dirt - amt * 0.5);
        break;
      case 'ultrasonic':
        cs.corrosion = 0;
        cs.dirt = 0;
        break;
    }
    if (cs.dirt < 0.03) cs.dirt = 0;
    if (cs.corrosion < 0.03) cs.corrosion = 0;
    refreshCondition(cs);
    ev.push({ type: 'clean', id: compId, value: 1 - Math.max(cs.dirt, cs.corrosion) });
    if (wasDirty && cs.dirt === 0 && cs.corrosion === 0) ev.push({ type: 'cleaned', id: compId });
  }

  private doReplace(compId: string, quality: Exclude<PartQuality, 'factory'>, ev: RepairEvent[]): void {
    const ph = this.phone;
    const c = this.model.comp(compId);
    const old = ph.comps[compId]!;
    ph.comps[compId] = {
      state: 'removed',
      condition: 'ok',
      dirt: 0,
      corrosion: 0,
      quality,
      paired: !c.pairing,
      doa: this.rng.chance(DEFECT_RATE[quality]),
      tray: old.tray,
    };
    if (c.partCategory === 'battery') {
      ph.comps[compId]!.health = quality === 'cheap' ? 0.9 : 1;
      ph.comps[compId]!.swollen = false;
    }
    for (const f of this.model.adhesivesOf(c)) {
      ph.adhesives[f.id] = freshAdhesiveState(f, false);
    }
    for (const f of this.model.connectorsOf(c)) {
      if (f.local) ph.connectors[f.id] = { connected: false, damaged: false };
    }
    ev.push({ type: 'replaced', id: compId, value: DEFECT_RATE[quality] });
  }

  /* ------------------------------------------------------------------ time */

  /** Passive simulation: adhesives cool down, loose screws on the bench may roll away. */
  tick(dt: number, opts: { breeze?: number } = {}): RepairEvent[] {
    const ev: RepairEvent[] = [];
    const ph = this.phone;
    for (const st of Object.values(ph.adhesives)) {
      if (st.temp > AMBIENT_TEMP) st.temp = Math.max(AMBIENT_TEMP, st.temp - (0.6 + (st.temp - AMBIENT_TEMP) * 0.02) * dt);
    }
    const breeze = opts.breeze ?? 1;
    if (!this.ctx.strict && breeze > 0) {
      for (const s of Object.values(ph.screws)) {
        if (s.loc.k === 'bench' && this.rng.chance(0.0035 * breeze * dt)) {
          s.loc = { k: 'lost' };
          ev.push({ type: 'screw_lost', id: s.id, key: 'repair.event.screw_lost' });
        }
      }
    }
    return ev;
  }
}

export function refreshCondition(cs: { condition: string; dirt: number; corrosion: number }): void {
  if (cs.condition === 'damaged' || cs.condition === 'missing') return;
  if (cs.corrosion > 0.3) cs.condition = 'corroded';
  else if (cs.dirt > 0.3) cs.condition = 'dirty';
  else cs.condition = 'ok';
}
