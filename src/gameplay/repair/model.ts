import type {
  AdhesiveDef,
  AdhesiveState,
  CompState,
  ComponentDef,
  ConnectorDef,
  FastenerDef,
  FastenerStage,
  PhoneDef,
  PhoneInstance,
  ScrewDef,
  Side,
} from './types';

export const PERIMETER_SEGS = 24;
export const PAD_SEGS = 4;
export const AMBIENT_TEMP = 31;
export const MAT_CELL_CAPACITY = 4;

export interface FastenerRef {
  owner: ComponentDef;
  f: FastenerDef;
}

/** Indexed, read-only view over a PhoneDef. */
export class PhoneModel {
  readonly comps = new Map<string, ComponentDef>();
  readonly fasteners = new Map<string, FastenerRef>();
  readonly children = new Map<string, string[]>();
  readonly batteryConn: string | null;
  readonly boardId: string | null;
  readonly batteryId: string | null;
  /** component ids that own at least one screw, in definition order (used for mat grouping) */
  readonly screwOwners: string[] = [];

  constructor(readonly def: PhoneDef) {
    let batteryConn: string | null = null;
    let boardId: string | null = null;
    let batteryId: string | null = null;
    for (const c of def.components) {
      if (this.comps.has(c.id)) throw new Error(`duplicate component ${c.id} in ${def.id}`);
      this.comps.set(c.id, c);
      if (c.parent) {
        const list = this.children.get(c.parent) ?? [];
        list.push(c.id);
        this.children.set(c.parent, list);
      }
      if (c.isBoard) boardId = c.id;
      if (c.partCategory === 'battery') batteryId = c.id;
      let hasScrew = false;
      for (const f of c.attachedBy) {
        if (this.fasteners.has(f.id)) throw new Error(`duplicate fastener ${f.id} in ${def.id}`);
        this.fasteners.set(f.id, { owner: c, f });
        if (f.type === 'connector' && f.isBattery) batteryConn = f.id;
        if (f.type === 'screw') hasScrew = true;
      }
      if (hasScrew) this.screwOwners.push(c.id);
    }
    this.batteryConn = batteryConn;
    this.boardId = boardId;
    this.batteryId = batteryId;
    this.validate();
  }

  private validate(): void {
    for (const c of this.def.components) {
      if (c.parent && !this.comps.has(c.parent)) throw new Error(`${c.id}: unknown parent ${c.parent}`);
      for (const b of c.blockedBy) {
        const id = b.split('@')[0] as string;
        if (!this.comps.has(id)) throw new Error(`${c.id}: unknown blocker ${b}`);
      }
      for (const f of c.attachedBy) {
        if (f.type === 'bracket' && !this.comps.has(f.bracketId)) {
          throw new Error(`${c.id}: unknown bracket ${f.bracketId}`);
        }
        if (f.type === 'connector' && f.under && !this.comps.has(f.under)) {
          throw new Error(`${c.id}: connector ${f.id} under unknown ${f.under}`);
        }
        for (const r of (f.type === 'screw' || f.type === 'connector' ? f.access?.requires : undefined) ?? []) {
          if (!this.comps.has(r.split('@')[0] as string)) throw new Error(`${f.id}: unknown requirement ${r}`);
        }
      }
    }
  }

  comp(id: string): ComponentDef {
    const c = this.comps.get(id);
    if (!c) throw new Error(`unknown component ${id}`);
    return c;
  }

  fastener(id: string): FastenerRef {
    const f = this.fasteners.get(id);
    if (!f) throw new Error(`unknown fastener ${id}`);
    return f;
  }

  sideOf(c: ComponentDef): Side {
    if (c.parent) return this.sideOf(this.comp(c.parent));
    return c.side ?? 'front';
  }

  stageOf(owner: ComponentDef, f: FastenerDef): FastenerStage {
    if (f.stage) return f.stage;
    if (owner.hinge && (f.type === 'connector' || f.type === 'bracket')) return 'remove';
    return 'open';
  }

  /**
   * Explicit access requirements of a fastener, or null when the owner's own blockers apply.
   * Connectors sit on the logic board: they only need the covers above them opened, not removed.
   */
  accessRequires(owner: ComponentDef, f: FastenerDef): string[] | null {
    const access = f.type === 'screw' || f.type === 'connector' ? f.access : undefined;
    if (access?.requires) return access.requires;
    if (f.type !== 'connector' || f.local) return null;
    const out: string[] = [];
    for (const b of owner.blockedBy) {
      const id = b.split('@')[0] as string;
      if (this.comp(id).hinge) out.push(`${id}@open`);
    }
    return out;
  }

  screwsOf(c: ComponentDef): ScrewDef[] {
    return c.attachedBy.filter((f): f is ScrewDef => f.type === 'screw');
  }

  connectorsOf(c: ComponentDef): ConnectorDef[] {
    return c.attachedBy.filter((f): f is ConnectorDef => f.type === 'connector');
  }

  adhesivesOf(c: ComponentDef): AdhesiveDef[] {
    return c.attachedBy.filter((f): f is AdhesiveDef => f.type === 'adhesive');
  }

  allConnectors(): Array<{ owner: ComponentDef; f: ConnectorDef }> {
    const out: Array<{ owner: ComponentDef; f: ConnectorDef }> = [];
    for (const { owner, f } of this.fasteners.values()) {
      if (f.type === 'connector') out.push({ owner, f });
    }
    return out;
  }

  allScrews(): Array<{ owner: ComponentDef; f: ScrewDef }> {
    const out: Array<{ owner: ComponentDef; f: ScrewDef }> = [];
    for (const { owner, f } of this.fasteners.values()) {
      if (f.type === 'screw') out.push({ owner, f });
    }
    return out;
  }

  removable(): ComponentDef[] {
    return this.def.components.filter((c) => c.removable !== false);
  }
}

export function adhesiveSegCount(f: AdhesiveDef): number {
  if (f.kind === 'perimeter') return PERIMETER_SEGS;
  if (f.kind === 'pulltab') return f.tabs ?? 2;
  return PAD_SEGS;
}

/** Temperature (°C) at which an adhesive gives way. */
export function adhesiveSoftTemp(f: AdhesiveDef): number {
  return 50 + 30 * f.strength;
}

export function freshAdhesiveState(f: AdhesiveDef, bonded: boolean): AdhesiveState {
  const n = adhesiveSegCount(f);
  return {
    segs: new Array<number>(n).fill(0),
    broken: new Array<boolean>(n).fill(false),
    temp: AMBIENT_TEMP,
    gap: false,
    softened: 0,
    fresh: false,
    bonded,
  };
}

export function freshCompState(c: ComponentDef): CompState {
  const s: CompState = {
    state: 'installed',
    condition: 'ok',
    dirt: 0,
    corrosion: 0,
    quality: 'factory',
    paired: true,
  };
  if (c.partCategory === 'battery') s.health = 0.92;
  return s;
}

/** A pristine, fully assembled and working phone. */
export function createPhone(def: PhoneDef, uid: string, color = 0): PhoneInstance {
  const phone: PhoneInstance = {
    uid,
    modelId: def.id,
    color,
    poweredOn: true,
    orientation: 'front',
    comps: {},
    screws: {},
    holes: {},
    adhesives: {},
    connectors: {},
    boardFaults: [],
    mistakes: [],
    faults: [],
    savedData: [],
    flags: {},
  };
  for (const c of def.components) {
    phone.comps[c.id] = freshCompState(c);
    for (const f of c.attachedBy) {
      if (f.type === 'screw') {
        phone.screws[f.id] = {
          id: f.id,
          type: f.screwType,
          length: f.length,
          loc: { k: 'hole', hole: f.id },
          stripped: false,
          torque: 1,
        };
        phone.holes[f.id] = f.id;
      } else if (f.type === 'adhesive') {
        phone.adhesives[f.id] = freshAdhesiveState(f, true);
      } else if (f.type === 'connector') {
        phone.connectors[f.id] = { connected: true, damaged: false };
      }
    }
  }
  return phone;
}

export function clonePhone(p: PhoneInstance): PhoneInstance {
  return JSON.parse(JSON.stringify(p)) as PhoneInstance;
}
