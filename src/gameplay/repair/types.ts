/**
 * Repair engine data model. Pure data + logic: no three.js / DOM imports allowed in this folder.
 *
 * Phone space (millimetres): origin at the phone centre, +x to the right and +y towards the top
 * when looking at the screen, +z from the back cover towards the screen.
 */

export type ScrewType = 'P2' | 'Y000' | 'PH000' | 'SO';
export type Condition = 'ok' | 'damaged' | 'dirty' | 'corroded' | 'missing';
/** factory = the part the phone arrived with; the others are replacement grades. */
export type PartQuality = 'factory' | 'cheap' | 'good' | 'refurb';
export type Side = 'front' | 'back';

export type FunctionId =
  | 'power'
  | 'display'
  | 'touch'
  | 'trueTone'
  | 'biometric'
  | 'frontCamera'
  | 'rearCamera'
  | 'speaker'
  | 'earpiece'
  | 'microphone'
  | 'charging'
  | 'vibration'
  | 'wireless'
  | 'battery'
  | 'sim';

export const ALL_FUNCTIONS: FunctionId[] = [
  'power',
  'display',
  'touch',
  'trueTone',
  'biometric',
  'frontCamera',
  'rearCamera',
  'speaker',
  'earpiece',
  'microphone',
  'charging',
  'vibration',
  'wireless',
  'battery',
  'sim',
];

export type PartCategory =
  | 'housing'
  | 'display'
  | 'back_glass'
  | 'battery'
  | 'logic_board'
  | 'charge_port'
  | 'speaker'
  | 'taptic'
  | 'rear_camera'
  | 'front_sensor'
  | 'earpiece'
  | 'home_button'
  | 'bracket'
  | 'sim_tray';

export type FastenerStage = 'open' | 'remove';

export interface FastenerAccess {
  /** phone side that must face up; default = owner's side. 'any' = reachable either way. */
  side?: Side | 'any';
  /** replaces the owner's blockedBy check, same syntax ("id" or "id@open") */
  requires?: string[];
}

export interface ScrewDef {
  type: 'screw';
  id: string;
  screwType: ScrewType;
  /** millimetres */
  length: number;
  position: [number, number];
  /** a longer screw driven here pierces the logic board */
  overBoard?: boolean;
  /** function lost when the board is pierced through this hole */
  damages?: FunctionId;
  stage?: FastenerStage;
  access?: FastenerAccess;
}

export interface AdhesiveDef {
  type: 'adhesive';
  id: string;
  kind: 'perimeter' | 'pulltab' | 'pad';
  /** 0..1 — how much heat / effort it needs */
  strength: number;
  /** perimeter only: ranges (0..1 around the edge, clockwise from the top-left corner) hiding flex cables */
  dangerZones?: Array<[number, number]>;
  /** pulltab only: number of stretch-release strips */
  tabs?: number;
  stage?: FastenerStage;
}

export interface ConnectorDef {
  type: 'connector';
  id: string;
  /** i18n label key suffix */
  connectorId: string;
  position: [number, number];
  /** bracket component that covers the connector */
  under?: string;
  isBattery?: boolean;
  /** plugs into its parent assembly instead of the logic board (e.g. home button → display) */
  local?: boolean;
  stage?: FastenerStage;
  access?: FastenerAccess;
}

export interface ClipDef {
  type: 'clip';
  id: string;
  stage?: FastenerStage;
}

export interface BracketRefDef {
  type: 'bracket';
  id: string;
  bracketId: string;
  stage?: FastenerStage;
}

export type FastenerDef = ScrewDef | AdhesiveDef | ConnectorDef | ClipDef | BracketRefDef;

export type MeshParam = number | string | boolean | number[];

export interface ComponentDef {
  id: string;
  nameKey: string;
  descKey: string;
  mesh: { gen: string; params?: Record<string, MeshParam> };
  /** footprint centre x, y and size w, h in mm (phone space) */
  rect: [number, number, number, number];
  /** bottom of the part above the inner back surface, mm */
  z: number;
  /** thickness, mm */
  t: number;
  side?: Side;
  /** sub-assembly: travels with its parent (e.g. home button on the display) */
  parent?: string;
  attachedBy: FastenerDef[];
  /** components that must be removed first ("id") or at least opened ("id@open") */
  blockedBy: string[];
  /** opens like a book before it can be fully removed */
  hinge?: 'left' | 'right';
  fragility: number;
  pairing?: boolean;
  /** base price of a "good" replacement part, in baht */
  value: number;
  partCategory: PartCategory;
  functions: FunctionId[];
  removable?: boolean;
  /** logic board: every connector must be unplugged before removal */
  isBoard?: boolean;
  /** can be cleaned from outside without opening the phone (charge port) */
  externalClean?: boolean;
}

export interface PhoneDef {
  id: string;
  nameKey: string;
  year: number;
  /** minimum reputation (stars) before customers bring this model */
  minReputation: number;
  dims: { w: number; h: number; d: number; r: number; flat: boolean };
  style: Record<string, MeshParam>;
  colors: Array<{ id: string; body: string; back: string }>;
  /** used-market value of a fully working unit, baht */
  marketValue: number;
  /** labour multiplier for quotes */
  difficulty: number;
  components: ComponentDef[];
}

/* ---------- runtime state (plain JSON, serialisable) ---------- */

export type CompPlacement = 'installed' | 'open' | 'removed';

export interface CompState {
  state: CompPlacement;
  condition: Condition;
  dirt: number;
  corrosion: number;
  quality: PartQuality;
  /** still carries valid pairing data (factory part, or reprogrammed) */
  paired: boolean;
  /** battery only: 0..1 */
  health?: number;
  swollen?: boolean;
  /** defective replacement part (dead on arrival), discovered by the final test */
  doa?: boolean;
  /** where the removed part lies on the work mat (metres, bench space) */
  tray?: { x: number; z: number; r: number };
}

export type ScrewLoc =
  | { k: 'hole'; hole: string }
  | { k: 'held' }
  | { k: 'mat'; cell: number }
  | { k: 'bench'; x: number; z: number }
  | { k: 'lost' };

export interface ScrewItem {
  id: string;
  type: ScrewType;
  length: number;
  loc: ScrewLoc;
  stripped: boolean;
  /** 0 = not tightened, 1 = perfect; <0.6 loose */
  torque: number;
}

export interface AdhesiveState {
  /** perimeter/pad: cut progress per segment; pulltab: release progress per tab */
  segs: number[];
  /** pulltab: tab snapped */
  broken: boolean[];
  /** °C */
  temp: number;
  /** lifted with the suction cup: a pick can enter */
  gap: boolean;
  /** isopropyl applied (0..1) */
  softened: number;
  /** new adhesive applied for reassembly */
  fresh: boolean;
  /** currently holding (false once fully cut and the part moved) */
  bonded: boolean;
}

export interface ConnectorState {
  connected: boolean;
  damaged: boolean;
}

export interface BoardFault {
  id: string;
  /** i18n key suffix describing the fault */
  kind: 'charge_ic' | 'connector' | 'long_screw' | 'short';
  affects: FunctionId[];
  /** connector fastener id for kind=connector */
  ref?: string;
}

export interface Mistake {
  key: string;
  severity: 1 | 2 | 3;
  params?: Record<string, string | number>;
}

export interface PhoneInstance {
  uid: string;
  modelId: string;
  color: number;
  poweredOn: boolean;
  orientation: Side;
  comps: Record<string, CompState>;
  screws: Record<string, ScrewItem>;
  /** hole id → screw item id */
  holes: Record<string, string | null>;
  adhesives: Record<string, AdhesiveState>;
  connectors: Record<string, ConnectorState>;
  boardFaults: BoardFault[];
  mistakes: Mistake[];
  /** fault ids applied when the phone was generated (hidden truth) */
  faults: string[];
  /** True Tone / pairing data saved with the programmer, by part category */
  savedData: string[];
  flags: Record<string, boolean>;
}

/** What a job requires; used by the guide, the assistant and the order evaluation. */
export interface RepairGoal {
  replace: string[];
  clean: string[];
  /** connector fastener ids to reseat */
  reseat: string[];
  /** board fault ids to micro-solder */
  solder: string[];
  /** tutorial: strip the phone completely before rebuilding */
  teardown?: boolean;
}

export const emptyGoal = (): RepairGoal => ({ replace: [], clean: [], reseat: [], solder: [] });

/* ---------- actions ---------- */

export type CleanTool = 'brush' | 'ipa' | 'air' | 'toothpick' | 'ultrasonic';

export type Action =
  | { t: 'power'; on: boolean }
  | { t: 'flip' }
  | { t: 'unscrew'; hole: string; bit: ScrewType }
  | { t: 'placeScrew'; screw: string; to: { k: 'mat'; cell: number } | { k: 'bench'; x: number; z: number } }
  | { t: 'pickScrew'; screw: string }
  | { t: 'screwIn'; hole: string; screw: string; bit: ScrewType; torque: number }
  | { t: 'extract'; hole: string }
  | { t: 'findScrew'; screw: string }
  | { t: 'heat'; adhesive: string; dt: number }
  | { t: 'suction'; comp: string }
  | { t: 'cut'; adhesive: string; seg: number; depth: number }
  | { t: 'open'; comp: string }
  | { t: 'close'; comp: string }
  | { t: 'disconnect'; conn: string }
  | { t: 'connect'; conn: string }
  | { t: 'remove'; comp: string }
  | { t: 'install'; comp: string }
  | { t: 'pullTab'; adhesive: string; tab: number; speed: number; dt: number }
  | { t: 'ipa'; adhesive: string }
  | { t: 'pry'; adhesive: string; dt: number }
  | { t: 'clean'; comp: string; tool: CleanTool; amount: number }
  | { t: 'replace'; comp: string; quality: Exclude<PartQuality, 'factory'> }
  | { t: 'applyAdhesive'; adhesive: string }
  | { t: 'readChip'; comp: string }
  | { t: 'program'; comp: string }
  | { t: 'solder'; fault: string; quality: number };

export type ActionType = Action['t'];

export interface RepairEvent {
  type:
    | 'power_on'
    | 'power_off'
    | 'flip'
    | 'screw_out'
    | 'screw_in'
    | 'screw_loose'
    | 'screw_stripped'
    | 'screw_extracted'
    | 'screw_placed'
    | 'screw_dropped'
    | 'screw_lost'
    | 'screw_found'
    | 'screw_picked'
    | 'long_screw'
    | 'heat'
    | 'overheat'
    | 'suction_pop'
    | 'suction_fail'
    | 'cut'
    | 'cut_stuck'
    | 'flex_cut'
    | 'adhesive_released'
    | 'opened'
    | 'closed'
    | 'connector_off'
    | 'connector_on'
    | 'connector_damaged'
    | 'short'
    | 'removed'
    | 'installed'
    | 'part_damaged'
    | 'tab_progress'
    | 'tab_done'
    | 'tab_snap'
    | 'ipa'
    | 'pry'
    | 'battery_punctured'
    | 'clean'
    | 'cleaned'
    | 'replaced'
    | 'adhesive_applied'
    | 'chip_read'
    | 'programmed'
    | 'soldered'
    | 'solder_fail'
    | 'encyclopedia'
    | 'mistake';
  /** id of the screw/component/connector/adhesive involved */
  id?: string;
  /** i18n key (namespace "repair") for player-facing feedback */
  key?: string;
  params?: Record<string, string | number>;
  value?: number;
}

export interface ActionResult {
  ok: boolean;
  /** i18n key explaining a refusal, e.g. "repair.err.battery_first" */
  reason?: string;
  reasonParams?: Record<string, string | number>;
  events: RepairEvent[];
}

/** Tool tiers and situational modifiers that influence risks. */
export interface RepairContext {
  /** tool id → tier (0 = not owned) */
  tools: Record<string, number>;
  /** ≥1: heat of the day, bad light, uncomfortable chair increase slip-ups */
  errorMult: number;
  /** tutorial: dangerous or out-of-order actions are refused instead of punished */
  strict: boolean;
  /** number of cells of the magnetic mat */
  matCells: number;
}

export type HintTargetKind = 'screw' | 'hole' | 'comp' | 'connector' | 'adhesive' | 'power' | 'phone' | 'none';

export interface Hint {
  action: Action | null;
  /** tool the player should hold (tools.json id), null = hand */
  tool: string | null;
  bit?: ScrewType;
  target: { kind: HintTargetKind; id: string };
  /** i18n key (namespace "repair.hint") */
  textKey: string;
  params?: Record<string, string | number>;
  /** true when the goal is complete and the phone is closed and powered */
  done?: boolean;
}

export type TestStatus = 'pass' | 'fail' | 'degraded' | 'na';

export interface TestReport {
  functions: Record<FunctionId, TestStatus>;
  issues: Mistake[];
  missingScrews: number;
  looseScrews: number;
  strippedScrews: number;
  /** removed components left out of the phone */
  leftoverParts: string[];
  closed: boolean;
  waterSeal: boolean;
  /** average 0..1 cleanliness of all components */
  cleanliness: number;
  /** 0..1 overall quality used for reviews */
  score: number;
}
