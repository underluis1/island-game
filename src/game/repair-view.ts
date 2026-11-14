/**
 * Repair view: turns mouse input into repair actions on the 3D phone.
 * It owns no game rules (those live in gameplay/repair): it asks the session, plays the result back
 * through the PhoneVisual and reports feedback to its host (UI, audio, outlines).
 */
import * as THREE from 'three';
import type { RNG } from '../core/rng';
import { ease, type Tweens } from '../core/tween';
import { ammeterReading, type AmmeterReading } from '../gameplay/repair/diagnostics';
import { goalComplete, needsClean, needsReplace, nextHint } from '../gameplay/repair/hint';
import { OVERHEAT_TEMP, RepairSession, TORQUE_LOOSE, TORQUE_OVER } from '../gameplay/repair/session';
import { adhesiveSoftTemp } from '../gameplay/repair/model';
import type {
  Action,
  ActionResult,
  AdhesiveDef,
  CleanTool,
  ComponentDef,
  Hint,
  PartQuality,
  PhoneDef,
  PhoneInstance,
  RepairContext,
  RepairEvent,
  RepairGoal,
  ScrewType,
} from '../gameplay/repair/types';
import { PhoneVisual, type PickInfo, type PickKind } from '../procgen/phones/phone';
import type { Bench } from './bench';
import { Particles } from './particles';

export type ToolId =
  | 'driver'
  | 'spudger'
  | 'pick'
  | 'suction'
  | 'tweezers'
  | 'heat'
  | 'brush'
  | 'ipa'
  | 'air'
  | 'toothpick'
  | 'card'
  | 'adhesive'
  | 'extractor'
  | 'flashlight'
  | 'multimeter'
  | 'programmer';

export const HAND_TOOLS: ToolId[] = [
  'driver',
  'spudger',
  'pick',
  'suction',
  'tweezers',
  'heat',
  'brush',
  'ipa',
  'air',
  'toothpick',
  'card',
  'adhesive',
  'extractor',
  'flashlight',
  'multimeter',
  'programmer',
];

export const BITS: ScrewType[] = ['P2', 'Y000', 'PH000', 'SO'];

export type GaugeData =
  | { kind: 'unscrew'; progress: number }
  | { kind: 'torque'; value: number; loose: number; over: number; max: number }
  | { kind: 'temp'; temp: number; soft: number; danger: number; max: number }
  | { kind: 'tab'; speed: number; safe: number; progress: number }
  | { kind: 'clean'; pct: number }
  | { kind: 'depth'; depth: number; danger: boolean }
  | { kind: 'ammeter'; reading: AmmeterReading }
  | { kind: 'progress'; value: number; labelKey: string };

export interface TooltipData {
  x: number;
  y: number;
  info: PickInfo;
  /** i18n key of the name (component nameKey, or screw/connector label key) */
  nameKey: string;
  lines: Array<{ key: string; params?: Record<string, string | number> }>;
}

export interface ToolHandle {
  root: THREE.Object3D;
  update?(dt: number, active: boolean): void;
}

export interface RepairHost {
  sfx(name: string, opts?: { pitch?: number; volume?: number }): void;
  loop(name: string, on: boolean, intensity?: number): void;
  message(kind: 'error' | 'warn' | 'info' | 'success', key: string, params?: Record<string, string | number>): void;
  outline(channel: 'hover' | 'guide', objects: THREE.Object3D[]): void;
  tooltip(data: TooltipData | null): void;
  gauge(data: GaugeData | null): void;
  hint(h: Hint | null): void;
  /** opens the part chooser; resolves with the grade taken from stock, or null when cancelled */
  choosePart(comp: ComponentDef): Promise<Exclude<PartQuality, 'factory'> | null>;
  /** tool model for the 3D cursor */
  tool(id: ToolId, tier: number): ToolHandle | null;
  onRepairEvent(ev: RepairEvent): void;
  onStateChanged(): void;
  /** the player clicked the bare logic board while a board fault is waiting: open the microscope */
  solder(faultId: string): void;
  /** focus level for adaptive music: 0 relaxed … 1 delicate work */
  setFocus(amount: number): void;
  breeze(): number;
  reduceMotion(): boolean;
}

export interface RepairJob {
  def: PhoneDef;
  phone: PhoneInstance;
  goal: RepairGoal;
  ctx: RepairContext;
  rng: RNG;
}

type Drag =
  | { type: 'orbit' | 'pan'; x: number; y: number; moved: number }
  | { type: 'unscrew'; hole: string; t: number; dur: number }
  | { type: 'torque'; hole: string; screw: string; t: number }
  | { type: 'extract'; hole: string; t: number }
  | { type: 'heat'; adhesive: string }
  | { type: 'suction'; comp: string; y0: number; done: boolean }
  | { type: 'cut'; adhesive: string }
  | { type: 'pad'; adhesive: string; t: number }
  | { type: 'pry'; adhesive: string }
  | { type: 'tab'; adhesive: string; comp: string; tab: number; lastX: number; lastY: number; speed: number }
  | { type: 'clean'; tool: CleanTool; lastX: number; lastY: number }
  | { type: 'part'; comp: string; x0: number; y0: number; moved: boolean; offX: number; offY: number }
  | { type: 'idle' };

const TOOL_TILT: Partial<Record<ToolId, [number, number]>> = {
  driver: [0.42, -0.3],
  spudger: [0.95, -0.45],
  pick: [1.15, -0.5],
  suction: [0.12, 0],
  tweezers: [0.9, -0.5],
  heat: [0.85, -0.4],
  brush: [0.8, -0.4],
  ipa: [0.9, -0.5],
  air: [0.9, -0.5],
  toothpick: [1.05, -0.4],
  card: [1.2, -0.5],
  adhesive: [0.9, -0.4],
  extractor: [0.42, -0.3],
  flashlight: [0.7, -0.5],
  multimeter: [1.3, -0.2],
  programmer: [1.2, -0.3],
};

const DRIVER_SPEED = [1, 1, 1.5, 2.3];
const UP = new THREE.Vector3(0, 1, 0);

export class RepairView {
  session: RepairSession | null = null;
  visual: PhoneVisual | null = null;
  job: RepairJob | null = null;
  tool: ToolId | null = null;
  bit: ScrewType = 'P2';
  guide = true;
  active = false;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pointer = { x: 0, y: 0, inside: false };
  private drag: Drag = { type: 'idle' };
  private hover: PickInfo | null = null;
  private hoverCell: number | null = null;
  private cursor = new THREE.Vector3(0, 0.9, 0);
  private toolHandle: ToolHandle | null = null;
  private toolKey = '';
  private toolSpin = 0;
  private particles: Particles;
  private currentHint: Hint | null = null;
  private gaugeTimer = 0;
  private heatGlow = new Map<string, THREE.Mesh>();
  private rim = new Map<string, { segs: THREE.Mesh[]; group: THREE.Group }>();
  private lostMarkers = new Map<string, THREE.Mesh>();
  private flashlight: THREE.SpotLight;
  private ownGeos: THREE.BufferGeometry[] = [];
  private ownMats: THREE.Material[] = [];
  private suctionLift = 0;
  private lastCutKey = '';
  private heatSoft = new Set<string>();
  private hintTimer = 0;
  private benchMarkers = new Map<string, THREE.Mesh>();
  private seams = new Map<string, THREE.Mesh[]>();
  private pulse = 0;

  // orbit camera
  private cam = { target: new THREE.Vector3(-0.07, 0.9, 0.005), azimuth: 0, polar: 0.5, dist: 0.38 };
  private camGoal = { target: new THREE.Vector3(-0.07, 0.9, 0.005), azimuth: 0, polar: 0.5, dist: 0.38 };
  private keys = new Set<string>();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    private tweens: Tweens,
    readonly bench: Bench,
    private host: RepairHost,
  ) {
    this.particles = new Particles(scene);
    this.flashlight = new THREE.SpotLight('#fff6d8', 0, 1.2, 0.5, 0.6, 1.5);
    this.flashlight.visible = false;
    scene.add(this.flashlight, this.flashlight.target);
  }

  /* ------------------------------------------------------------------ lifecycle */

  /** Starts (or resumes) work on a phone. The visual may be reused when the phone is already on the bench. */
  open(job: RepairJob, visual?: PhoneVisual): void {
    this.job = job;
    this.session = new RepairSession(job.def, job.phone, job.ctx, job.rng);
    this.bench.setMatCells(job.ctx.matCells);
    if (visual) this.visual = visual;
    else {
      this.visual = new PhoneVisual(job.def, job.phone, { tweens: this.tweens });
      this.bench.root.add(this.visual.root);
    }
    this.visual.matLayout = { cellCenter: (c) => this.bench.cellCenter(c) };
    this.visual.setDetail(true, job.phone);
    this.visual.sync(job.phone, true);
    this.buildRims();
    this.active = true;
    this.drag = { type: 'idle' };
    this.refreshHint();
    this.syncRims();
    this.syncBenchMarkers();
  }

  /** Leaves the view; the phone stays on the bench exactly as it is. */
  close(): PhoneVisual | null {
    this.active = false;
    this.endLoops();
    this.host.outline('hover', []);
    this.host.outline('guide', []);
    this.host.tooltip(null);
    this.host.gauge(null);
    this.host.hint(null);
    this.bench.highlightCell(null);
    this.setToolVisible(false);
    this.flashlight.visible = false;
    this.clearRims();
    const v = this.visual;
    if (v && this.job) v.setDetail(false, this.job.phone);
    this.session = null;
    this.job = null;
    this.visual = null;
    this.drag = { type: 'idle' };
    return v;
  }

  cameraPose(out: { position: THREE.Vector3; target: THREE.Vector3 }): void {
    const c = this.cam;
    const sp = Math.sin(c.polar);
    out.target.copy(c.target);
    out.position.set(
      c.target.x + c.dist * sp * Math.sin(c.azimuth),
      c.target.y + c.dist * Math.cos(c.polar),
      c.target.z + c.dist * sp * Math.cos(c.azimuth),
    );
  }

  resetCamera(): void {
    this.camGoal.target.set(-0.07, 0.9, 0.005);
    this.camGoal.azimuth = 0;
    this.camGoal.polar = 0.5;
    this.camGoal.dist = 0.38;
  }

  /* ------------------------------------------------------------------ tools */

  selectTool(id: ToolId | null): void {
    if (id && (this.session?.tool(id) ?? 0) < 1) {
      this.host.message('error', 'repair.err.need_tool', { tool: `@tools.${id}.name` });
      this.host.sfx('error');
      return;
    }
    if (this.tool === id) return;
    this.endLoops();
    this.drag = { type: 'idle' };
    this.tool = id;
    this.host.sfx('tool_select');
    this.host.gauge(null);
    this.flashlight.visible = id === 'flashlight';
    this.flashlight.intensity = id === 'flashlight' ? 6 : 0;
    this.syncLostMarkers();
    this.updateHover();
    this.refreshGuideOutline();
  }

  setBit(bit: ScrewType): void {
    if (this.bit === bit) return;
    this.bit = bit;
    this.host.sfx('ui_tab');
    this.host.onStateChanged();
  }

  cycleBit(dir: 1 | -1): void {
    const i = BITS.indexOf(this.bit);
    this.setBit(BITS[(i + dir + BITS.length) % BITS.length] as ScrewType);
  }

  setGuide(on: boolean): void {
    this.guide = on;
    this.refreshHint();
  }

  private setToolVisible(v: boolean): void {
    if (this.toolHandle) this.toolHandle.root.visible = v;
  }

  private ensureToolModel(): void {
    const tier = this.tool ? (this.session?.tool(this.tool) ?? 1) : 0;
    const key = this.tool ? `${this.tool}:${tier}` : '';
    if (key === this.toolKey) return;
    if (this.toolHandle) this.scene.remove(this.toolHandle.root);
    this.toolHandle = null;
    this.toolKey = key;
    if (!this.tool) return;
    const h = this.host.tool(this.tool, tier);
    if (h) {
      this.toolHandle = h;
      h.root.traverse((o) => {
        o.raycast = () => undefined;
      });
      this.scene.add(h.root);
    }
  }

  /* ------------------------------------------------------------------ actions */

  /** Runs an action through the session and plays every consequence back. */
  perform(a: Action, opts: { silentFail?: boolean } = {}): ActionResult {
    const s = this.session;
    const v = this.visual;
    if (!s || !v || !this.job) return { ok: false, events: [] };
    const res = s.perform(a);
    if (!res.ok) {
      if (!opts.silentFail && res.reason && res.reason !== 'repair.err.noop') {
        this.host.message('error', res.reason, res.reasonParams);
        this.host.sfx('error');
      }
      return res;
    }
    for (const ev of res.events) this.playEvent(ev);
    // parts that left the phone need a resting place on the mat
    for (const ev of res.events) {
      if (ev.type === 'removed' && ev.id) this.bench.assignTray(s.model, this.job.phone, ev.id, v.phoneOffset.x);
    }
    v.sync(this.job.phone, this.host.reduceMotion());
    this.syncRims();
    this.syncLostMarkers();
    this.syncBenchMarkers();
    this.refreshHint();
    this.host.onStateChanged();
    return res;
  }

  private playEvent(ev: RepairEvent): void {
    const v = this.visual!;
    const at = (kind: PickKind): THREE.Vector3 => (ev.id ? v.targetWorld({ kind, id: ev.id }) : this.cursor.clone());
    switch (ev.type) {
      case 'power_on':
        this.host.sfx('phone_boot');
        break;
      case 'power_off':
        this.host.sfx('phone_off');
        break;
      case 'flip':
        this.host.sfx('part_pickup');
        break;
      case 'screw_out':
        this.host.sfx('screw_out');
        break;
      case 'screw_in':
        this.host.sfx('screw_seat');
        this.particles.burst(at('screw'), 'spark', 3);
        break;
      case 'screw_loose':
        this.host.sfx('screw_seat', { pitch: 0.7, volume: 0.5 });
        this.host.message('warn', 'repair.event.screw_loose');
        break;
      case 'screw_stripped':
        this.host.sfx('screw_strip');
        this.host.message('error', ev.key ?? 'repair.event.screw_stripped');
        this.particles.burst(at('screw'), 'spark', 8);
        break;
      case 'screw_extracted':
        this.host.sfx('screw_out', { pitch: 0.8 });
        break;
      case 'screw_placed':
        this.host.sfx('screw_mat');
        break;
      case 'screw_dropped':
        this.host.sfx('screw_drop');
        this.host.message('warn', 'repair.event.screw_on_bench');
        break;
      case 'screw_lost':
        this.host.sfx('screw_drop', { pitch: 1.3, volume: 0.6 });
        this.host.message('warn', 'repair.event.screw_lost');
        break;
      case 'screw_found':
        this.host.sfx('success');
        break;
      case 'screw_picked':
        this.host.sfx('screw_mat', { pitch: 1.2, volume: 0.6 });
        break;
      case 'long_screw':
        this.host.sfx('damage');
        this.host.message('error', 'repair.event.long_screw');
        this.particles.burst(at('hole'), 'spark', 14);
        break;
      case 'overheat':
        this.host.sfx('damage');
        this.host.message('error', 'repair.event.overheat');
        break;
      case 'suction_pop':
        this.host.sfx('suction_pop');
        break;
      case 'suction_fail':
        this.host.sfx('adhesive_creak');
        this.host.message('warn', 'repair.err.adhesive_cold');
        break;
      case 'cut':
        this.host.sfx('pick_slide', { pitch: 0.9 + Math.random() * 0.3 });
        break;
      case 'cut_stuck':
        this.host.sfx('adhesive_creak', { volume: 0.6 });
        break;
      case 'flex_cut':
        this.host.sfx('damage');
        this.host.message('error', 'repair.event.flex_cut', ev.params);
        break;
      case 'adhesive_released':
        this.host.sfx('adhesive_tear');
        break;
      case 'opened':
        this.host.sfx('display_open');
        break;
      case 'closed':
        this.host.sfx('display_close');
        break;
      case 'connector_off':
        this.host.sfx('connector_snap');
        this.particles.burst(at('connector'), 'dust', 4);
        break;
      case 'connector_on':
        this.host.sfx('connector_press');
        break;
      case 'connector_damaged':
        this.host.sfx('damage');
        this.host.message('error', 'repair.event.connector_damaged');
        break;
      case 'short':
        this.host.sfx('spark');
        this.particles.burst(ev.id && v.parts.has(ev.id) ? at('comp') : this.cursor.clone(), 'spark', 26);
        if (ev.key) this.host.message('error', ev.key, ev.params);
        break;
      case 'removed':
        this.host.sfx(this.session!.model.comp(ev.id!).partCategory === 'bracket' ? 'part_metal' : 'part_pickup');
        break;
      case 'installed':
        this.host.sfx('part_place');
        break;
      case 'part_damaged':
        if (ev.key) this.host.message('error', ev.key, ev.params);
        if (ev.id && this.session!.model.comps.get(ev.id)?.partCategory === 'display') this.host.sfx('glass_crack');
        break;
      case 'tab_done':
        this.host.sfx('adhesive_tear', { pitch: 1.2 });
        break;
      case 'tab_snap':
        this.host.sfx('pulltab_snap');
        this.host.message('warn', 'repair.event.tab_snap');
        break;
      case 'ipa':
        this.host.sfx('ipa_drip');
        break;
      case 'battery_punctured':
        this.host.sfx('damage');
        this.host.message('error', 'repair.event.battery_punctured');
        this.particles.burst(at('comp'), 'smoke', 30);
        break;
      case 'cleaned':
        this.host.sfx('success', { volume: 0.5 });
        this.particles.burst(at('comp'), 'sparkle', 12);
        break;
      case 'replaced':
        this.host.sfx('purchase', { volume: 0.5 });
        this.particles.burst(at('comp'), 'sparkle', 10);
        break;
      case 'adhesive_applied':
        this.host.sfx('part_place', { pitch: 1.4 });
        break;
      case 'chip_read':
      case 'programmed':
        this.host.sfx('multimeter_beep');
        this.host.message('success', ev.type === 'chip_read' ? 'repair.event.chip_read' : 'repair.event.programmed');
        break;
      case 'soldered':
        this.host.sfx('success');
        break;
      case 'solder_fail':
        this.host.sfx('test_fail');
        break;
      default:
        break;
    }
    this.host.onRepairEvent(ev);
  }

  /** Replace a removed part with a spare chosen by the player. */
  async replacePart(compId: string): Promise<boolean> {
    const s = this.session;
    if (!s) return false;
    const check = s.can({ t: 'replace', comp: compId, quality: 'good' });
    if (!check.ok) {
      this.host.message('error', check.reason, check.params);
      this.host.sfx('error');
      return false;
    }
    const q = await this.host.choosePart(s.model.comp(compId));
    if (!q || !this.session) return false;
    const res = this.perform({ t: 'replace', comp: compId, quality: q });
    if (res.ok) {
      // a brand new part has no grime layers and no damage marks
      const v = this.visual!;
      const pv = v.parts.get(compId);
      if (pv?.build.swell) pv.build.swell(0);
    }
    return res.ok;
  }

  togglePower(): void {
    if (!this.session || !this.job) return;
    this.perform({ t: 'power', on: !this.job.phone.poweredOn });
  }

  flip(): void {
    this.perform({ t: 'flip' });
  }

  /* ------------------------------------------------------------------ guide */

  refreshHint(): void {
    const s = this.session;
    if (!s || !this.job) return;
    this.currentHint = nextHint(s, this.job.goal);
    this.host.hint(this.guide ? this.currentHint : null);
    this.refreshGuideOutline();
  }

  get hint(): Hint | null {
    return this.currentHint;
  }

  get goalDone(): boolean {
    return !!this.session && !!this.job && goalComplete(this.session, this.job.goal);
  }

  private refreshGuideOutline(): void {
    const v = this.visual;
    const h = this.currentHint;
    this.bench.highlightCell(null);
    if (!v || !h || !this.guide || !this.active) {
      this.host.outline('guide', []);
      return;
    }
    const objs: THREE.Object3D[] = [];
    const a = h.action;
    if (a?.t === 'placeScrew' && a.to.k === 'mat') {
      this.bench.highlightCell(a.to.cell);
    } else if (h.target.kind === 'hole' || h.target.kind === 'screw') {
      if (a?.t === 'screwIn') objs.push(...v.highlightObjects({ kind: 'hole', id: a.hole }));
      else if (a?.t === 'unscrew' || a?.t === 'extract') objs.push(...v.highlightObjects({ kind: 'screw', id: this.job!.phone.holes[a.hole] ?? '' }));
      else objs.push(...v.highlightObjects({ kind: 'screw', id: h.target.id }));
    } else if (h.target.kind === 'connector') {
      objs.push(...v.highlightObjects({ kind: 'connector', id: h.target.id }));
    } else if (h.target.kind === 'comp') {
      objs.push(...v.highlightObjects({ kind: 'comp', id: h.target.id }));
    } else if (h.target.kind === 'adhesive') {
      const ref = this.session!.model.fasteners.get(h.target.id);
      if (ref) {
        if (a?.t === 'pullTab') objs.push(...v.highlightObjects({ kind: 'tab', id: ref.owner.id, index: a.tab }));
        else objs.push(...v.highlightObjects({ kind: 'comp', id: ref.owner.id }));
      }
    }
    this.host.outline('guide', objs);
  }

  /* ------------------------------------------------------------------ adhesive rim + heat glow */

  private perimeterPoint(w: number, h: number, u: number): [number, number, number] {
    const P = 2 * (w + h);
    let d = (((u % 1) + 1) % 1) * P;
    if (d < w) return [-w / 2 + d, h / 2, 0];
    d -= w;
    if (d < h) return [w / 2, h / 2 - d, -Math.PI / 2];
    d -= h;
    if (d < w) return [w / 2 - d, -h / 2, Math.PI];
    d -= w;
    return [-w / 2, -h / 2 + d, Math.PI / 2];
  }

  private perimeterParam(w: number, h: number, x: number, y: number): { u: number; inward: number } {
    const P = 2 * (w + h);
    const dTop = h / 2 - y;
    const dBottom = y + h / 2;
    const dRight = w / 2 - x;
    const dLeft = x + w / 2;
    const m = Math.min(dTop, dBottom, dRight, dLeft);
    let d: number;
    if (m === dTop) d = x + w / 2;
    else if (m === dRight) d = w + (h / 2 - y);
    else if (m === dBottom) d = w + h + (w / 2 - x);
    else d = 2 * w + h + (y + h / 2);
    d = Math.max(0, Math.min(P - 0.001, d));
    return { u: d / P, inward: m };
  }

  private buildRims(): void {
    this.clearRims();
    const v = this.visual;
    const s = this.session;
    if (!v || !s) return;
    for (const c of s.model.def.components) {
      const per = s.model.adhesivesOf(c).find((f) => f.kind === 'perimeter');
      const pv = v.parts.get(c.id);
      if (!per || !pv) continue;
      const [cx, cy, w, h] = c.rect;
      const n = s.phone.adhesives[per.id]!.segs.length;
      const group = new THREE.Group();
      group.position.set(cx, cy, pv.facing === 1 ? c.z - 0.05 : c.z + c.t + 0.05);
      v.phoneGroup.add(group);
      const segs: THREE.Mesh[] = [];
      const P = 2 * (w + h);
      const geo = new THREE.BoxGeometry(P / n - 1.6, 1.1, 0.35);
      this.ownGeos.push(geo);
      for (let i = 0; i < n; i++) {
        const [x, y, rot] = this.perimeterPoint(w - 3.4, h - 3.4, (i + 0.5) / n);
        const danger = (per.dangerZones ?? []).some(([a, b]) => (i + 0.5) / n >= a && (i + 0.5) / n <= b);
        const m = new THREE.MeshStandardMaterial({
          color: '#101012',
          roughness: 0.25,
          metalness: 0,
          emissive: danger ? '#ff3b2f' : '#000000',
          emissiveIntensity: 0,
        });
        this.ownMats.push(m);
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.set(x, y, 0);
        mesh.rotation.z = rot;
        mesh.userData.danger = danger;
        mesh.raycast = () => undefined;
        group.add(mesh);
        segs.push(mesh);
      }
      this.rim.set(per.id, { segs, group });

      // bright seam strip on the outer face: shows at a glance what is still glued and what is cut
      const seamGeo = new THREE.PlaneGeometry(P / n - 1.2, 2.6);
      this.ownGeos.push(seamGeo);
      const strips: THREE.Mesh[] = [];
      for (let i = 0; i < n; i++) {
        const [x, y, rot] = this.perimeterPoint(w - 3, h - 3, (i + 0.5) / n);
        const sm = new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.9, depthWrite: false });
        this.ownMats.push(sm);
        const strip = new THREE.Mesh(seamGeo, sm);
        strip.position.set(pv.facing === 1 ? x : -x, y, c.t + 0.09);
        strip.rotation.z = pv.facing === 1 ? rot : -rot;
        strip.userData.danger = (per.dangerZones ?? []).some(([a, b]) => (i + 0.5) / n >= a && (i + 0.5) / n <= b);
        strip.raycast = () => undefined;
        strip.renderOrder = 6;
        strip.visible = false;
        pv.group.add(strip);
        strips.push(strip);
      }
      this.seams.set(per.id, strips);

      // heat glow frame on the outer face of the cover
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, -h / 2);
      shape.lineTo(w / 2, -h / 2);
      shape.lineTo(w / 2, h / 2);
      shape.lineTo(-w / 2, h / 2);
      shape.closePath();
      const hole = new THREE.Path();
      hole.moveTo(-w / 2 + 5, -h / 2 + 5);
      hole.lineTo(-w / 2 + 5, h / 2 - 5);
      hole.lineTo(w / 2 - 5, h / 2 - 5);
      hole.lineTo(w / 2 - 5, -h / 2 + 5);
      hole.closePath();
      shape.holes.push(hole);
      const glowGeo = new THREE.ShapeGeometry(shape);
      const glowMat = new THREE.MeshBasicMaterial({
        color: '#ff7a1a',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.ownGeos.push(glowGeo);
      this.ownMats.push(glowMat);
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.z = c.t + 0.06;
      glow.raycast = () => undefined;
      glow.renderOrder = 5;
      pv.group.add(glow);
      this.heatGlow.set(per.id, glow);
    }
  }

  private clearRims(): void {
    for (const r of this.rim.values()) r.group.removeFromParent();
    for (const g of this.heatGlow.values()) g.removeFromParent();
    for (const list of this.seams.values()) for (const m of list) m.removeFromParent();
    this.seams.clear();
    for (const g of this.ownGeos) g.dispose();
    for (const m of this.ownMats) m.dispose();
    this.ownGeos = [];
    this.ownMats = [];
    this.rim.clear();
    this.heatGlow.clear();
    for (const m of this.lostMarkers.values()) m.removeFromParent();
    this.lostMarkers.clear();
    for (const m of this.benchMarkers.values()) m.removeFromParent();
    this.benchMarkers.clear();
  }

  private syncRims(): void {
    const s = this.session;
    if (!s) return;
    for (const [id, r] of this.rim) {
      const st = s.phone.adhesives[id]!;
      const owner = s.model.fastener(id).owner;
      const ownerState = s.phone.comps[owner.id]!.state;
      r.group.visible = ownerState === 'installed' && st.bonded && st.gap;
      r.segs.forEach((m, i) => {
        m.visible = (st.segs[i] ?? 0) < 1;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = this.guide && m.userData.danger && st.gap ? 1.4 : 0;
      });
      const strips = this.seams.get(id) ?? [];
      const show = ownerState === 'installed' && st.bonded && st.gap;
      strips.forEach((m, i) => {
        m.visible = show;
        const sm = m.material as THREE.MeshBasicMaterial;
        const v = st.segs[i] ?? 0;
        if (v >= 1) {
          sm.color.set('#35d07f');
          sm.opacity = 0.55;
        } else if (m.userData.danger && this.guide) {
          sm.color.set('#ff3b2f');
          sm.opacity = 0.95;
        } else {
          sm.color.set(v > 0 ? '#ffe08a' : '#ffb020');
          sm.opacity = 0.9;
        }
        m.userData.cut = v >= 1;
      });
    }
  }

  /** Screws left loose on the bench get a pulsing ring so they cannot be overlooked. */
  private syncBenchMarkers(): void {
    const s = this.session;
    if (!s) return;
    const loose = Object.values(s.phone.screws).filter((x) => x.loc.k === 'bench');
    for (const [id, m] of this.benchMarkers) {
      if (!loose.some((l) => l.id === id)) {
        m.removeFromParent();
        this.benchMarkers.delete(id);
      }
    }
    for (const item of loose) {
      if (item.loc.k !== 'bench') continue;
      let m = this.benchMarkers.get(item.id);
      if (!m) {
        const geo = new THREE.RingGeometry(3.2, 4.4, 24);
        const mat = new THREE.MeshBasicMaterial({ color: '#ffc145', transparent: true, opacity: 0.9, depthWrite: false });
        this.ownGeos.push(geo);
        this.ownMats.push(mat);
        m = new THREE.Mesh(geo, mat);
        m.raycast = () => undefined;
        m.renderOrder = 6;
        this.bench.root.add(m);
        this.benchMarkers.set(item.id, m);
      }
      m.position.set(item.loc.x * 1000, -item.loc.z * 1000, 0.25);
    }
  }

  private syncLostMarkers(): void {
    const s = this.session;
    const v = this.visual;
    if (!s || !v) return;
    const lost = Object.values(s.phone.screws).filter((x) => x.loc.k === 'lost');
    for (const [id, m] of this.lostMarkers) {
      if (!lost.some((l) => l.id === id)) {
        m.removeFromParent();
        this.lostMarkers.delete(id);
      }
    }
    for (const item of lost) {
      if (this.lostMarkers.has(item.id)) continue;
      // a lost screw hides somewhere around the edge of the mat; only a torch reveals its glint
      const seed = item.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const geo = new THREE.SphereGeometry(1.4, 8, 6);
      const mat = new THREE.MeshStandardMaterial({ color: '#dfe3e8', metalness: 1, roughness: 0.2, emissive: '#fff2b0', emissiveIntensity: 0 });
      this.ownGeos.push(geo);
      this.ownMats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      const side = seed % 2 === 0 ? -1 : 1;
      m.position.set(side * (150 + (seed % 120)), -150 + ((seed * 7) % 60), 1.2);
      m.userData.pick = { kind: 'screw', id: item.id } satisfies PickInfo;
      m.userData.lost = true;
      this.bench.root.add(m);
      this.lostMarkers.set(item.id, m);
    }
    for (const m of this.lostMarkers.values()) m.visible = this.tool === 'flashlight';
  }

  /* ------------------------------------------------------------------ picking */

  private setRay(x: number, y: number): void {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  private static visible(o: THREE.Object3D): boolean {
    let p: THREE.Object3D | null = o;
    while (p) {
      if (!p.visible) return false;
      p = p.parent;
    }
    return true;
  }

  private kindsForTool(): PickKind[] {
    switch (this.tool) {
      case null:
        return ['comp', 'connector'];
      case 'driver':
      case 'extractor':
        return ['hole', 'screw'];
      case 'spudger':
        return ['connector', 'comp'];
      case 'tweezers':
        return ['tab', 'comp', 'connector'];
      case 'flashlight':
        return ['screw'];
      default:
        return ['comp'];
    }
  }

  private pick(kinds: PickKind[]): { info: PickInfo; hit: THREE.Intersection } | null {
    const v = this.visual;
    if (!v) return null;
    const targets = v.pickTargets(kinds);
    if (this.tool === 'flashlight') targets.push(...this.lostMarkers.values());
    const hits = this.raycaster.intersectObjects(targets, true);
    // small targets win over the big parts behind them when they are almost as close
    let best: { info: PickInfo; hit: THREE.Intersection; score: number } | null = null;
    for (const hit of hits) {
      if (!RepairView.visible(hit.object)) continue;
      const info = PhoneVisual.pickInfo(hit.object);
      if (!info || !kinds.includes(info.kind)) continue;
      // bare hands and tweezers can only press a loose plug back in: plugged cables do not steal the click
      if (info.kind === 'connector' && (this.tool === null || this.tool === 'tweezers') && this.session?.phone.connectors[info.id]?.connected) {
        continue;
      }
      const bias = info.kind === 'comp' ? 0 : info.kind === 'tab' ? 0.002 : 0.004;
      const score = hit.distance - bias;
      if (!best || score < best.score) best = { info, hit, score };
      if (hit.distance > (best.hit.distance ?? 0) + 0.01) break;
    }
    return best ? { info: best.info, hit: best.hit } : null;
  }

  private pickCell(): number | null {
    const hits = this.raycaster.intersectObjects(this.bench.cellTargets, false);
    const c = hits[0]?.object.userData.cell;
    return typeof c === 'number' ? c : null;
  }

  /** Mouse position on the mat plane, in mat millimetres. */
  private matPoint(): THREE.Vector3 | null {
    const plane = new THREE.Plane(UP, -(this.bench.root.position.y));
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, p)) return null;
    return this.bench.root.worldToLocal(p);
  }

  private updateCursor(): void {
    const v = this.visual;
    if (!v) return;
    if (this.tool === 'pick') {
      const seam = this.activeSeam();
      const probe = seam ? this.seamProbe(seam.id) : null;
      if (probe && probe.inward < 40 && probe.inward > -30) {
        this.cursor.copy(probe.world);
        if (this.drag.type === 'idle') this.host.gauge({ kind: 'depth', depth: probe.depth, danger: probe.danger });
        return;
      }
    }
    const hits = this.raycaster.intersectObjects([...v.pickTargets(['comp']), this.bench.surface], true);
    for (const h of hits) {
      if (!RepairView.visible(h.object)) continue;
      this.cursor.copy(h.point);
      return;
    }
    const plane = new THREE.Plane(UP, -0.902);
    this.raycaster.ray.intersectPlane(plane, this.cursor);
  }

  private updateHover(): void {
    if (!this.active || !this.visual || !this.session) return;
    if (this.drag.type !== 'idle') return;
    const held = this.session.heldScrew();
    const found = this.pick(this.kindsForTool());
    this.hover = found?.info ?? null;
    this.hoverCell = held && (this.tool === 'driver' || this.tool === 'extractor') ? this.pickCell() : null;
    if (held && this.hoverCell != null) {
      const full = this.session.matCellCount(this.hoverCell) >= 4;
      this.bench.highlightCell(this.hoverCell, full ? '#ff5a4d' : '#18e0c8');
    } else if (!(this.guide && this.currentHint?.action?.t === 'placeScrew')) {
      this.bench.highlightCell(null);
    } else {
      this.refreshGuideOutline();
    }
    const v = this.visual;
    this.host.outline('hover', this.hover ? v.highlightObjects(this.hover) : []);
    this.host.tooltip(this.hover ? this.tooltipFor(this.hover) : null);
  }

  private tooltipFor(info: PickInfo): TooltipData {
    const s = this.session!;
    const ph = s.phone;
    const lines: TooltipData['lines'] = [];
    let nameKey = '';
    if (info.kind === 'comp' || info.kind === 'tab') {
      const c = s.model.comp(info.id);
      const cs = ph.comps[c.id]!;
      nameKey = c.nameKey;
      if (info.kind === 'tab') lines.push({ key: 'repair.tip.pull_tab' });
      if (cs.condition === 'damaged') lines.push({ key: 'repair.tip.damaged' });
      if (cs.swollen) lines.push({ key: 'repair.tip.swollen' });
      if (cs.dirt > 0.05) lines.push({ key: 'repair.tip.dirt', params: { pct: Math.round(cs.dirt * 100) } });
      if (cs.corrosion > 0.05) lines.push({ key: 'repair.tip.corrosion', params: { pct: Math.round(cs.corrosion * 100) } });
      if (cs.quality !== 'factory') lines.push({ key: `parts.quality.${cs.quality}` });
      if (c.pairing) lines.push({ key: cs.paired ? 'repair.tip.paired' : 'repair.tip.unpaired' });
      if (c.partCategory === 'battery' && this.session!.tool('battester') > 0 && cs.health != null) {
        lines.push({ key: 'repair.tip.health', params: { pct: Math.round(cs.health * 100) } });
      }
      if (cs.state === 'removed') {
        if (this.job && this.job.goal.replace.includes(c.id) && needsReplace(s, c.id)) lines.push({ key: 'repair.tip.replace_me' });
        else lines.push({ key: 'repair.tip.click_install' });
      } else if (this.job && this.job.goal.clean.includes(c.id) && needsClean(s, c.id)) {
        lines.push({ key: 'repair.tip.clean_me' });
      }
    } else if (info.kind === 'screw' || info.kind === 'hole') {
      const sid = info.kind === 'hole' ? ph.holes[info.id] : info.id;
      const def = info.kind === 'hole' ? s.model.fastener(info.id).f : null;
      const item = sid ? ph.screws[sid] : undefined;
      const type = item?.type ?? (def && def.type === 'screw' ? def.screwType : 'P2');
      nameKey = `parts.screw.${type}.name`;
      if (item) {
        lines.push({ key: 'repair.tip.screw_len', params: { len: item.length.toFixed(1) } });
        if (item.stripped) lines.push({ key: 'repair.tip.stripped' });
        if (item.loc.k === 'hole' && item.torque < TORQUE_LOOSE) lines.push({ key: 'repair.tip.loose' });
      } else if (def && def.type === 'screw') {
        lines.push({ key: 'repair.tip.empty_hole' });
        // the hole depth is only shown with the guide on: experts remember it
        if (this.guide) lines.push({ key: 'repair.tip.hole_len', params: { len: def.length.toFixed(1) } });
      }
    } else if (info.kind === 'connector') {
      const ref = s.model.fastener(info.id);
      const f = ref.f;
      nameKey = f.type === 'connector' ? `parts.conn.${f.connectorId}` : ref.owner.nameKey;
      const ks = ph.connectors[info.id]!;
      lines.push({ key: ks.connected ? 'repair.tip.connected' : 'repair.tip.disconnected' });
      if (ks.damaged) lines.push({ key: 'repair.tip.damaged' });
    }
    return { x: this.pointer.x, y: this.pointer.y, info, nameKey, lines };
  }

  /* ------------------------------------------------------------------ pointer input */

  onPointerMove(e: PointerEvent): void {
    if (!this.active) return;
    const dx = e.clientX - this.pointer.x;
    const dy = e.clientY - this.pointer.y;
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.pointer.inside = true;
    this.setRay(e.clientX, e.clientY);
    const d = this.drag;
    if (d.type === 'orbit') {
      d.moved += Math.abs(dx) + Math.abs(dy);
      this.camGoal.azimuth = THREE.MathUtils.clamp(this.camGoal.azimuth - dx * 0.006, -1.15, 1.15);
      this.camGoal.polar = THREE.MathUtils.clamp(this.camGoal.polar - dy * 0.005, 0.06, 1.2);
      return;
    }
    if (d.type === 'pan') {
      d.moved += Math.abs(dx) + Math.abs(dy);
      const k = this.camGoal.dist * 0.0016;
      const cos = Math.cos(this.camGoal.azimuth);
      const sin = Math.sin(this.camGoal.azimuth);
      this.camGoal.target.x = THREE.MathUtils.clamp(this.camGoal.target.x - (dx * cos + dy * sin) * k, -0.3, 0.3);
      this.camGoal.target.z = THREE.MathUtils.clamp(this.camGoal.target.z - (dy * cos - dx * sin) * k, -0.2, 0.2);
      return;
    }
    this.updateCursor();
    if (d.type === 'part') this.dragPart(d);
    else if (d.type === 'cut') this.cutAtCursor(d);
    else if (d.type === 'clean') this.cleanAtCursor(d);
    else if (d.type === 'tab') {
      const dist = Math.hypot(e.clientX - d.lastX, e.clientY - d.lastY);
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      // pixels per event → smoothed pull speed, normalised so that a calm drag ≈ 0.4
      d.speed = d.speed * 0.6 + Math.min(1.5, dist / 9) * 0.4;
    } else if (d.type === 'suction') {
      this.suctionLift = Math.max(0, Math.min(1, (d.y0 - e.clientY) / 70));
      if (!d.done && this.suctionLift >= 1) {
        d.done = true;
        this.perform({ t: 'suction', comp: d.comp });
      }
    } else if (d.type === 'idle') this.updateHover();
  }

  onPointerDown(e: PointerEvent): void {
    if (!this.active || !this.session || !this.visual) return;
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.setRay(e.clientX, e.clientY);
    if (e.button === 2) {
      this.drag = { type: 'orbit', x: e.clientX, y: e.clientY, moved: 0 };
      return;
    }
    if (e.button === 1) {
      this.drag = { type: 'pan', x: e.clientX, y: e.clientY, moved: 0 };
      return;
    }
    if (e.button !== 0) return;
    if (e.shiftKey) {
      this.drag = { type: 'pan', x: e.clientX, y: e.clientY, moved: 0 };
      return;
    }
    this.updateCursor();
    this.drag = { type: 'idle' };
    this.updateHover();
    this.primaryDown(e);
  }

  onPointerUp(e: PointerEvent): void {
    if (!this.active) return;
    const d = this.drag;
    this.drag = { type: 'idle' };
    this.endLoops();
    if (d.type === 'orbit') {
      if (d.moved < 5 && e.button === 2) this.secondaryClick();
      return;
    }
    if (d.type === 'torque') this.finishTorque(d);
    else if (d.type === 'part') this.dropPart(d);
    else if (d.type === 'suction') {
      this.suctionLift = 0;
    } else if (d.type === 'tab') {
      const tab = this.visual?.parts.get(d.comp)?.build.tabs[d.tab];
      if (tab) tab.userData.dragging = false;
      if (this.job) this.visual?.sync(this.job.phone, true);
    }
    if (d.type !== 'pan') this.host.gauge(null);
    this.setRay(e.clientX, e.clientY);
    this.updateHover();
  }

  onWheel(e: WheelEvent): void {
    if (!this.active) return;
    if (this.tool === 'driver' && e.shiftKey) {
      this.cycleBit(e.deltaY > 0 ? 1 : -1);
      return;
    }
    const before = this.camGoal.dist;
    this.camGoal.dist = THREE.MathUtils.clamp(before * (1 + e.deltaY * 0.0012), 0.1, 0.85);
    // zooming in homes on whatever is under the cursor
    if (this.camGoal.dist < before && this.pointer.inside) {
      const k = Math.min(0.5, (before - this.camGoal.dist) / before * 2.2);
      this.camGoal.target.x = THREE.MathUtils.clamp(this.camGoal.target.x + (this.cursor.x - this.camGoal.target.x) * k, -0.3, 0.3);
      this.camGoal.target.z = THREE.MathUtils.clamp(this.camGoal.target.z + (this.cursor.z - this.camGoal.target.z) * k, -0.2, 0.2);
    }
  }

  onKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** F: bring the camera over whatever is under the cursor (or the guide target). */
  focus(): void {
    const v = this.visual;
    if (!v) return;
    const info = this.hover ?? this.hintPick();
    if (!info) {
      this.resetCamera();
      return;
    }
    const p = v.targetWorld(info);
    this.camGoal.target.set(THREE.MathUtils.clamp(p.x, -0.3, 0.3), 0.9, THREE.MathUtils.clamp(p.z, -0.2, 0.2));
    this.camGoal.dist = info.kind === 'comp' ? 0.3 : 0.18;
    this.camGoal.polar = 0.45;
  }

  private hintPick(): PickInfo | null {
    const h = this.currentHint;
    if (!h) return null;
    if (h.target.kind === 'comp' || h.target.kind === 'connector' || h.target.kind === 'hole' || h.target.kind === 'screw') {
      return { kind: h.target.kind, id: h.target.id };
    }
    if (h.target.kind === 'adhesive') {
      const ref = this.session?.model.fasteners.get(h.target.id);
      if (ref) return { kind: 'comp', id: ref.owner.id };
    }
    return null;
  }

  private fail(reason: string, params?: Record<string, string | number>): void {
    if (reason === 'repair.err.noop') return;
    this.host.message('error', reason, params);
    this.host.sfx('error');
  }

  private primaryDown(e: PointerEvent): void {
    const s = this.session!;
    const ph = s.phone;
    const hover = this.hover;
    const held = s.heldScrew();
    const tool = this.tool;

    // a screw on the driver tip: mat cell, bench, or a hole
    if (held && (tool === 'driver' || tool === 'extractor')) {
      if (hover?.kind === 'hole' && ph.holes[hover.id] == null) {
        const check = s.can({ t: 'screwIn', hole: hover.id, screw: held.id, bit: this.bit, torque: 1 });
        if (!check.ok) return this.fail(check.reason, check.params);
        this.drag = { type: 'torque', hole: hover.id, screw: held.id, t: 0 };
        this.host.loop('screw_spin', true, 0.2);
        return;
      }
      const cell = this.pickCell();
      if (cell != null) {
        this.perform({ t: 'placeScrew', screw: held.id, to: { k: 'mat', cell } });
        return;
      }
      const p = this.matPoint();
      if (p && Math.abs(p.x) < 300 && Math.abs(p.y) < 190 && !hover) {
        this.perform({ t: 'placeScrew', screw: held.id, to: { k: 'bench', x: p.x / 1000, z: -p.y / 1000 } });
      } else if (hover?.kind === 'hole') {
        this.fail('repair.err.screw_in_hand');
      }
      return;
    }

    if (tool === 'pick') {
      // slide along the seam of whichever cover has been lifted
      let per: AdhesiveDef | undefined = this.activeSeam() ?? undefined;
      if (!per && hover?.kind === 'comp') {
        const c = s.model.comp(hover.id);
        const f = c.hinge && ph.comps[c.id]!.state === 'installed' ? s.model.adhesivesOf(c).find((x) => x.kind === 'perimeter') : undefined;
        if (f && ph.adhesives[f.id]!.bonded) per = f;
      }
      if (!per) {
        if (hover?.kind === 'comp') this.partClick(hover.id, e);
        return;
      }
      const check = s.can({ t: 'cut', adhesive: per.id, seg: 0, depth: 0 });
      if (!check.ok && check.reason !== 'repair.err.noop') return this.fail(check.reason, check.params);
      const d: Drag = { type: 'cut', adhesive: per.id };
      this.drag = d;
      this.cutAtCursor(d);
      return;
    }
    if (tool === 'multimeter') {
      const reading = ammeterReading(s.model, ph);
      this.host.sfx('multimeter_beep');
      this.host.gauge({ kind: 'ammeter', reading });
      this.gaugeTimer = 4;
      return;
    }
    if (!hover) return;

    switch (tool) {
      case 'driver': {
        if (hover.kind === 'screw') {
          const item = ph.screws[hover.id];
          if (item && (item.loc.k === 'mat' || item.loc.k === 'bench')) this.perform({ t: 'pickScrew', screw: hover.id });
          else if (item?.loc.k === 'hole') this.startUnscrew(item.loc.hole);
          return;
        }
        if (hover.kind === 'hole') {
          if (ph.holes[hover.id] != null) this.startUnscrew(hover.id);
          else this.fail('repair.err.no_screw_in_hand');
        }
        return;
      }
      case 'extractor': {
        const hole = hover.kind === 'hole' ? hover.id : hover.kind === 'screw' && ph.screws[hover.id]?.loc.k === 'hole' ? (ph.screws[hover.id]!.loc as { hole: string }).hole : null;
        if (!hole) return;
        const check = s.can({ t: 'extract', hole });
        if (!check.ok) return this.fail(check.reason === 'repair.err.noop' ? 'repair.err.not_stripped' : check.reason, check.params);
        this.drag = { type: 'extract', hole, t: 0 };
        this.host.loop('screw_spin', true, 0.5);
        return;
      }
      case 'flashlight': {
        if (hover.kind === 'screw') this.perform({ t: 'findScrew', screw: hover.id });
        return;
      }
      case 'spudger': {
        if (hover.kind === 'connector') {
          const connected = ph.connectors[hover.id]!.connected;
          this.perform(connected ? { t: 'disconnect', conn: hover.id } : { t: 'connect', conn: hover.id });
          return;
        }
        if (hover.kind === 'comp') this.startPry(hover.id, 'spudger');
        return;
      }
      case 'card': {
        if (hover.kind === 'comp') this.startPry(hover.id, 'card');
        return;
      }
      case 'suction': {
        if (hover.kind !== 'comp') return;
        const hc = s.model.comp(hover.id);
        const hper = s.model.adhesivesOf(hc).find((f) => f.kind === 'perimeter');
        if (hc.hinge && (ph.comps[hc.id]!.state !== 'installed' || (hper && !ph.adhesives[hper.id]!.bonded))) return this.partClick(hover.id, e);
        const check = s.can({ t: 'suction', comp: hover.id });
        if (!check.ok) return this.fail(check.reason === 'repair.err.noop' ? 'repair.err.suction_cover_only' : check.reason, check.params);
        this.drag = { type: 'suction', comp: hover.id, y0: e.clientY, done: false };
        this.host.sfx('suction_attach');
        return;
      }
      case 'heat': {
        if (hover.kind !== 'comp') return;
        const c = s.model.comp(hover.id);
        const adh = s.model.adhesivesOf(c).find((f) => f.kind !== 'pulltab' && ph.adhesives[f.id]!.bonded);
        if (!adh) return this.fail('repair.err.nothing_to_heat');
        const check = s.can({ t: 'heat', adhesive: adh.id, dt: 0.1 });
        if (!check.ok) return this.fail(check.reason, check.params);
        this.drag = { type: 'heat', adhesive: adh.id };
        return;
      }
      case 'tweezers': {
        if (hover.kind === 'tab') {
          const c = s.model.comp(hover.id);
          const adh = s.model.adhesivesOf(c).find((f) => f.kind === 'pulltab');
          if (!adh) return;
          const tabIdx = hover.index ?? 0;
          const check = s.can({ t: 'pullTab', adhesive: adh.id, tab: tabIdx, speed: 0.1, dt: 0.01 });
          if (!check.ok) return this.fail(check.reason, check.params);
          const tab = this.visual!.parts.get(c.id)?.build.tabs[tabIdx];
          if (tab) tab.userData.dragging = true;
          this.drag = { type: 'tab', adhesive: adh.id, comp: c.id, tab: tabIdx, lastX: e.clientX, lastY: e.clientY, speed: 0 };
          this.host.sfx('pulltab_stretch');
          return;
        }
        if (hover.kind === 'connector') {
          if (!ph.connectors[hover.id]!.connected) this.perform({ t: 'connect', conn: hover.id });
          else this.fail('repair.err.need_tool', { tool: '@tools.spudger.name' });
          return;
        }
        this.partClick(hover.id, e);
        return;
      }
      case 'brush':
      case 'air':
      case 'toothpick':
      case 'ipa': {
        if (hover.kind !== 'comp') return;
        if (tool === 'ipa') {
          // isopropyl on a battery with snapped tabs soaks the adhesive
          const c = s.model.comp(hover.id);
          const adh = s.model.adhesivesOf(c).find((f) => f.kind === 'pulltab');
          const st = adh ? ph.adhesives[adh.id] : undefined;
          if (adh && st && st.bonded && st.broken.some((b, i) => b && st.segs[i]! < 1) && st.softened < 0.5) {
            this.perform({ t: 'ipa', adhesive: adh.id });
            this.particles.burst(this.cursor.clone(), 'drop', 8);
            return;
          }
        }
        const check = s.can({ t: 'clean', comp: hover.id, tool, amount: 0.01 });
        if (!check.ok) return this.fail(check.reason, check.params);
        const d: Drag = { type: 'clean', tool, lastX: e.clientX, lastY: e.clientY };
        this.drag = d;
        if (tool === 'air') {
          this.host.sfx('air_blast');
          this.perform({ t: 'clean', comp: hover.id, tool, amount: 0.3 }, { silentFail: true });
          this.particles.burst(this.cursor.clone(), 'dust', 22);
          this.eraseAround(hover.id, 0.5, 0.5, 0.6, 0.5);
          this.drag = { type: 'idle' };
        } else {
          this.host.loop('brush_scrub', true, 0.6);
          this.cleanAtCursor(d);
        }
        return;
      }
      case 'adhesive': {
        if (hover.kind !== 'comp') return;
        const c = s.model.comp(hover.id);
        const cands = s.model.adhesivesOf(c).filter((f) => s.can({ t: 'applyAdhesive', adhesive: f.id }).ok);
        const first = cands[0] ?? s.model.adhesivesOf(c)[0];
        if (!first) return this.fail('repair.err.no_adhesive_here');
        this.perform({ t: 'applyAdhesive', adhesive: first.id });
        return;
      }
      case 'programmer': {
        if (hover.kind !== 'comp') return;
        const c = s.model.comp(hover.id);
        if (!c.pairing) return this.fail('repair.err.no_pairing_part');
        const act: Action = ph.comps[c.id]!.paired ? { t: 'readChip', comp: c.id } : { t: 'program', comp: c.id };
        this.perform(act);
        return;
      }
      case null: {
        if (hover.kind === 'connector') {
          if (!ph.connectors[hover.id]!.connected) this.perform({ t: 'connect', conn: hover.id });
          else this.fail('repair.err.need_tool', { tool: '@tools.spudger.name' });
          return;
        }
        if (hover.kind === 'comp') this.partClick(hover.id, e);
        return;
      }
      default:
        return;
    }
  }

  /** Right click without dragging: alternate action on the hovered thing. */
  private secondaryClick(): void {
    const s = this.session;
    if (!s) return;
    const found = this.pick(['comp']);
    if (!found) return;
    const c = s.model.comp(found.info.id);
    const st = s.phone.comps[c.id]!.state;
    if (c.hinge && st === 'open') this.perform({ t: 'close', comp: c.id });
    else if (st === 'removed' && c.removable !== false) void this.replacePart(c.id);
  }

  /** Hand / tweezers click on a component: open, close, remove, or start dragging a loose part. */
  private partClick(compId: string, e: PointerEvent): void {
    const s = this.session!;
    const ph = s.phone;
    const c = s.model.comp(compId);
    const st = ph.comps[c.id]!.state;
    if (st === 'removed') {
      const tray = ph.comps[c.id]!.tray ?? { x: 0, z: 0, r: 0 };
      const p = this.matPoint();
      this.drag = {
        type: 'part',
        comp: compId,
        x0: e.clientX,
        y0: e.clientY,
        moved: false,
        offX: p ? tray.x * 1000 - p.x : 0,
        offY: p ? -tray.z * 1000 - p.y : 0,
      };
      return;
    }
    if (c.removable === false) {
      // the bare housing: nothing to grab
      return;
    }
    if (c.hinge && st === 'installed') {
      this.perform({ t: 'open', comp: c.id });
      return;
    }
    if (c.hinge && st === 'open') {
      const allPlugged = s.model.connectorsOf(c).every((f) => ph.connectors[f.id]!.connected);
      const anyPlug = s.model.connectorsOf(c).length > 0;
      if (anyPlug && allPlugged) this.perform({ t: 'close', comp: c.id });
      else this.perform({ t: 'remove', comp: c.id });
      return;
    }
    this.perform({ t: 'remove', comp: c.id });
  }

  private dragPart(d: Extract<Drag, { type: 'part' }>): void {
    const s = this.session!;
    const v = this.visual!;
    if (!d.moved && Math.hypot(this.pointer.x - d.x0, this.pointer.y - d.y0) > 6) {
      d.moved = true;
      this.host.sfx('part_pickup', { volume: 0.5 });
    }
    if (!d.moved) return;
    const p = this.matPoint();
    if (!p) return;
    const c = s.model.comp(d.comp);
    const [x, y] = this.bench.clampToMat(p.x + d.offX, p.y + d.offY, c.rect[2], c.rect[3]);
    const cs = s.phone.comps[d.comp]!;
    cs.tray = { x: x / 1000, z: -y / 1000, r: cs.tray?.r ?? 0 };
    v.sync(s.phone, true);
  }

  private dropPart(d: Extract<Drag, { type: 'part' }>): void {
    const s = this.session;
    if (!s) return;
    if (d.moved) {
      // dropping a part back over its seat installs it
      const c = s.model.comp(d.comp);
      const p = this.matPoint();
      const v = this.visual!;
      if (p && !c.parent) {
        const seatX = v.phoneOffset.x + c.rect[0] * (s.phone.orientation === 'back' ? -1 : 1);
        const seatY = v.phoneOffset.y + c.rect[1];
        if (Math.hypot(p.x + d.offX - seatX, p.y + d.offY - seatY) < Math.max(14, Math.min(c.rect[2], c.rect[3]) * 0.6)) {
          if (this.perform({ t: 'install', comp: d.comp }, { silentFail: true }).ok) return;
        }
      }
      this.host.sfx('part_place', { volume: 0.5 });
      this.host.onStateChanged();
      return;
    }
    // plain click on a loose part: put it back, or explain what is missing
    const pendingFault = s.model.comp(d.comp).isBoard ? s.phone.boardFaults.find((f) => this.job?.goal.solder.includes(f.id)) : undefined;
    if (pendingFault) {
      this.host.solder(pendingFault.id);
      return;
    }
    if (this.job && this.job.goal.replace.includes(d.comp) && needsReplace(s, d.comp)) {
      void this.replacePart(d.comp);
      return;
    }
    this.perform({ t: 'install', comp: d.comp });
  }

  private startUnscrew(hole: string): void {
    const s = this.session!;
    const check = s.can({ t: 'unscrew', hole, bit: this.bit });
    if (!check.ok) return this.fail(check.reason, check.params);
    const tier = Math.min(3, Math.max(1, s.tool('driver')));
    this.drag = { type: 'unscrew', hole, t: 0, dur: 0.75 / DRIVER_SPEED[tier]! };
    this.host.loop('screw_spin', true, 0.6);
  }

  private finishTorque(d: Extract<Drag, { type: 'torque' }>): void {
    const torque = this.torqueValue(d.t);
    this.perform({ t: 'screwIn', hole: d.hole, screw: d.screw, bit: this.bit, torque });
  }

  /** Torque builds slowly at first, then quickly: the skill is letting go in time. */
  private torqueValue(t: number): number {
    const tier = Math.min(3, Math.max(1, this.session?.tool('driver') ?? 1));
    const speed = [1.0, 0.82, 0.7][tier - 1]!;
    const x = t * speed;
    const v = 0.55 * x + 0.5 * x * x;
    // elite drivers have a torque-limiting clutch
    return tier >= 3 ? Math.min(v, 1.02) : Math.min(1.6, v);
  }

  private startPry(compId: string, tool: 'spudger' | 'card'): void {
    const s = this.session!;
    const ph = s.phone;
    const c = s.model.comp(compId);
    const tabs = s.model.adhesivesOf(c).find((f) => f.kind === 'pulltab');
    if (tabs) {
      const st = ph.adhesives[tabs.id]!;
      if (st.bonded && st.broken.some((b, i) => b && st.segs[i]! < 1)) {
        const check = s.can({ t: 'pry', adhesive: tabs.id, dt: 0.01 });
        if (!check.ok) return this.fail(check.reason, check.params);
        this.drag = { type: 'pry', adhesive: tabs.id };
        this.host.loop('brush_scrub', true, 0.3);
        return;
      }
    }
    const pad = s.model.adhesivesOf(c).find((f) => f.kind === 'pad' && ph.adhesives[f.id]!.bonded);
    if (pad && tool === 'spudger') {
      const check = s.can({ t: 'cut', adhesive: pad.id, seg: 0, depth: 0.3 });
      if (!check.ok && check.reason !== 'repair.err.noop') return this.fail(check.reason, check.params);
      this.drag = { type: 'pad', adhesive: pad.id, t: 0 };
      return;
    }
    if (tool === 'spudger') this.partClick(compId, { clientX: this.pointer.x, clientY: this.pointer.y } as PointerEvent);
    else this.fail('repair.err.nothing_to_pry');
  }

  /** The lifted cover whose seam the pick can work on, if any. */
  private activeSeam(): AdhesiveDef | null {
    const s = this.session;
    if (!s) return null;
    for (const c of s.model.def.components) {
      if (!c.hinge || s.phone.comps[c.id]!.state !== 'installed') continue;
      const f = s.model.adhesivesOf(c).find((x) => x.kind === 'perimeter');
      if (f && s.phone.adhesives[f.id]!.bonded && s.phone.adhesives[f.id]!.gap) return f;
    }
    return null;
  }

  /** Where the mouse meets the seam of a cover: nearest edge point, segment, and how deep the pick would go. */
  private seamProbe(adhesive: string): { world: THREE.Vector3; seg: number; depth: number; inward: number; danger: boolean } | null {
    const s = this.session!;
    const v = this.visual!;
    const ref = s.model.fastener(adhesive);
    const pv = v.parts.get(ref.owner.id);
    if (!pv) return null;
    // intersect the mouse ray with the outer face of the cover (robust even over the frame edge)
    pv.group.updateWorldMatrix(true, false);
    const origin = new THREE.Vector3(0, 0, ref.owner.t).applyMatrix4(pv.group.matrixWorld);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(pv.group.matrixWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    const local = pv.group.worldToLocal(hit);
    const [, , w, h] = ref.owner.rect;
    // phone-space x of the hit (parts facing the back are mirrored)
    const px = pv.facing === 1 ? local.x : -local.x;
    const { u, inward } = this.perimeterParam(w, h, px, local.y);
    const st = s.phone.adhesives[adhesive]!;
    const n = st.segs.length;
    const seg = Math.min(n - 1, Math.floor(u * n));
    const depth = Math.max(0, Math.min(1, inward / 13));
    const f = ref.f as AdhesiveDef;
    const danger = (f.dangerZones ?? []).some(([a, b]) => (seg + 0.5) / n >= a && (seg + 0.5) / n <= b);
    // the pick itself always rides the seam: edge point, pushed in by the current depth
    const [ex, ey] = this.perimeterPoint(w, h, u);
    const cx = ex - Math.sign(ex) * (Math.abs(ex) >= w / 2 - 0.01 ? depth * 7 : 0);
    const cy = ey - Math.sign(ey) * (Math.abs(ey) >= h / 2 - 0.01 ? depth * 7 : 0);
    const world = pv.group.localToWorld(new THREE.Vector3(pv.facing === 1 ? cx : -cx, cy, ref.owner.t));
    return { world, seg, depth, inward, danger };
  }

  private cutAtCursor(d: Extract<Drag, { type: 'cut' }>): void {
    const s = this.session!;
    const probe = this.seamProbe(d.adhesive);
    if (!probe) return;
    const { seg, depth, inward, danger } = probe;
    this.cursor.copy(probe.world);
    this.host.gauge({ kind: 'depth', depth, danger });
    if (inward > 22 || inward < -14) return; // far from the edge: the pick is not in the seam
    const st = s.phone.adhesives[d.adhesive]!;
    const deep = danger && depth > 0.6;
    const done = (st.segs[seg] ?? 1) >= 1;
    if (done && !deep) return;
    const key = `${seg}:${deep}`;
    if (done && this.lastCutKey === key) return;
    this.lastCutKey = key;
    this.perform({ t: 'cut', adhesive: d.adhesive, seg, depth });
  }

  private cleanAtCursor(d: Extract<Drag, { type: 'clean' }>): void {
    const s = this.session!;
    const v = this.visual!;
    const found = this.pick(['comp']);
    if (!found) return;
    const compId = found.info.id;
    const cs = s.phone.comps[compId]!;
    const move = Math.hypot(this.pointer.x - d.lastX, this.pointer.y - d.lastY);
    d.lastX = this.pointer.x;
    d.lastY = this.pointer.y;
    if (cs.dirt <= 0 && cs.corrosion <= 0) return;
    const check = s.can({ t: 'clean', comp: compId, tool: d.tool, amount: 0.01 });
    if (!check.ok) return;
    const pv = v.parts.get(compId);
    if (!pv) return;
    const amount = Math.min(0.06, 0.012 + move * 0.0016);
    // rub the grime texture away under the bristles
    const local = pv.group.worldToLocal(found.hit.point.clone());
    const [, , w, h] = pv.def.rect;
    const u = pv.def.hinge ? 0.5 - local.x / (w * 0.86) : local.x / w + 0.5;
    const vv = pv.def.hinge ? local.y / (h * 0.9) + 0.5 : local.y / h + 0.5;
    const r = Math.max(0.12, 9 / Math.max(w, 1));
    if (d.tool !== 'ipa') v.eraseGrimeAt(compId, 'dirt', u, vv, r, 0.5);
    if (d.tool === 'ipa' || d.tool === 'brush') v.eraseGrimeAt(compId, 'corrosion', u, vv, r, d.tool === 'ipa' ? 0.5 : 0.12);
    const before = Math.max(cs.dirt, cs.corrosion);
    this.perform({ t: 'clean', comp: compId, tool: d.tool, amount }, { silentFail: true });
    const after = Math.max(cs.dirt, cs.corrosion);
    if (Math.random() < 0.35) this.particles.burst(found.hit.point.clone(), d.tool === 'ipa' ? 'drop' : 'dust', 2);
    if (d.tool === 'toothpick' && Math.random() < 0.15) this.host.sfx('toothpick');
    this.host.gauge({ kind: 'clean', pct: Math.round((1 - after) * 100) });
    if (before > 0 && after === 0) {
      this.eraseAround(compId, 0.5, 0.5, 2, 1);
    }
  }

  private eraseAround(compId: string, u: number, v: number, r: number, strength: number): void {
    this.visual?.eraseGrimeAt(compId, 'dirt', u, v, r, strength);
    if (strength >= 1) this.visual?.eraseGrimeAt(compId, 'corrosion', u, v, r, strength);
  }

  private endLoops(): void {
    this.host.loop('screw_spin', false);
    this.host.loop('heatgun', false);
    this.host.loop('brush_scrub', false);
  }

  /* ------------------------------------------------------------------ per-frame */

  update(dt: number): void {
    if (!this.active || !this.session || !this.visual || !this.job) return;
    const s = this.session;
    const ph = this.job.phone;
    const v = this.visual;

    // passive simulation
    const passive = s.tick(dt, { breeze: this.host.breeze() });
    if (passive.length) {
      for (const ev of passive) this.playEvent(ev);
      v.sync(ph);
      this.syncLostMarkers();
      this.syncBenchMarkers();
      this.refreshHint();
      this.host.onStateChanged();
    }

    // temperatures drift on their own: keep the guide honest about heat/suction
    this.hintTimer += dt;
    if (this.hintTimer > 0.6 && this.drag.type === 'idle') {
      this.hintTimer = 0;
      const a = this.currentHint?.action?.t;
      if (a === 'heat' || a === 'suction') this.refreshHint();
    }

    // camera
    const pan = 0.35 * dt * Math.max(0.4, this.camGoal.dist);
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) this.camGoal.target.x -= pan;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) this.camGoal.target.x += pan;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) this.camGoal.target.z -= pan;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) this.camGoal.target.z += pan;
    this.camGoal.target.x = THREE.MathUtils.clamp(this.camGoal.target.x, -0.3, 0.3);
    this.camGoal.target.z = THREE.MathUtils.clamp(this.camGoal.target.z, -0.2, 0.2);
    const k = 1 - Math.exp(-dt * 12);
    this.cam.target.lerp(this.camGoal.target, k);
    this.cam.azimuth += (this.camGoal.azimuth - this.cam.azimuth) * k;
    this.cam.polar += (this.camGoal.polar - this.cam.polar) * k;
    this.cam.dist += (this.camGoal.dist - this.cam.dist) * k;

    // held interactions
    const d = this.drag;
    let focus = 0;
    let toolActive = false;
    this.toolSpin = 0;
    switch (d.type) {
      case 'unscrew': {
        d.t += dt;
        toolActive = true;
        this.toolSpin = -22;
        const p = Math.min(1, d.t / d.dur);
        this.host.gauge({ kind: 'unscrew', progress: p });
        this.host.loop('screw_spin', true, 0.5 + p * 0.3);
        const sid = ph.holes[d.hole];
        const sv = sid ? v.screws.get(sid) : undefined;
        if (sv) {
          sv.group.rotateZ(-dt * 22);
          sv.group.translateZ(dt * 1.6);
        }
        if (Math.floor(d.t * 14) !== Math.floor((d.t - dt) * 14)) this.host.sfx('screw_turn', { pitch: 0.9 + p * 0.5 });
        if (p >= 1) {
          this.drag = { type: 'idle' };
          this.endLoops();
          this.host.gauge(null);
          if (sv) sv.lastLoc = '';
          this.perform({ t: 'unscrew', hole: d.hole, bit: this.bit });
        }
        focus = 0.4;
        break;
      }
      case 'torque': {
        d.t += dt;
        toolActive = true;
        this.toolSpin = 14;
        const tq = this.torqueValue(d.t);
        this.host.gauge({ kind: 'torque', value: tq, loose: TORQUE_LOOSE, over: TORQUE_OVER, max: 1.6 });
        this.host.loop('screw_spin', true, Math.min(1, 0.2 + tq * 0.5));
        if (Math.floor(d.t * 16) !== Math.floor((d.t - dt) * 16)) this.host.sfx('screw_turn', { pitch: 0.7 + tq * 0.6 });
        focus = 0.7;
        break;
      }
      case 'extract': {
        d.t += dt;
        toolActive = true;
        this.toolSpin = -8;
        this.host.gauge({ kind: 'progress', value: Math.min(1, d.t / 1.3), labelKey: 'repair.gauge.extract' });
        if (d.t >= 1.3) {
          this.drag = { type: 'idle' };
          this.endLoops();
          this.host.gauge(null);
          this.perform({ t: 'extract', hole: d.hole });
        }
        focus = 0.6;
        break;
      }
      case 'heat': {
        toolActive = true;
        const res = s.perform({ t: 'heat', adhesive: d.adhesive, dt });
        if (res.ok) {
          for (const ev of res.events) if (ev.type !== 'heat') this.playEvent(ev);
          if (res.events.some((ev) => ev.type === 'part_damaged' || ev.type === 'overheat')) {
            v.sync(ph);
            this.host.onStateChanged();
          }
        }
        const f = s.model.fastener(d.adhesive).f as AdhesiveDef;
        const st = ph.adhesives[d.adhesive]!;
        const tier = Math.min(3, Math.max(1, s.tool('heat')));
        // the moment the glue gives way: say so, and let the guide move on to the next step
        const softNow = st.temp >= adhesiveSoftTemp(f) + 2;
        if (softNow && !this.heatSoft.has(d.adhesive)) {
          this.heatSoft.add(d.adhesive);
          this.host.sfx('success', { volume: 0.6 });
          this.host.message('success', f.kind === 'perimeter' ? 'repair.event.heat_ready' : 'repair.event.heat_ready_pad');
          this.refreshHint();
        } else if (!softNow && st.temp < adhesiveSoftTemp(f) - 6) this.heatSoft.delete(d.adhesive);
        this.host.gauge({ kind: 'temp', temp: st.temp, soft: adhesiveSoftTemp(f), danger: OVERHEAT_TEMP, max: 130 });
        this.host.loop('heatgun', true, tier >= 3 ? 0.3 : 0.5 + Math.min(0.5, st.temp / 200));
        if (Math.random() < dt * 10) this.particles.burst(this.cursor.clone(), 'heat', 1);
        focus = 0.5;
        break;
      }
      case 'pad': {
        d.t += dt;
        toolActive = true;
        if (d.t >= 0.4) {
          d.t = 0;
          const st = ph.adhesives[d.adhesive]!;
          const seg = st.segs.findIndex((x) => x < 1);
          if (seg < 0 || !st.bonded) {
            this.drag = { type: 'idle' };
            this.host.gauge(null);
          } else {
            this.perform({ t: 'cut', adhesive: d.adhesive, seg, depth: 0.3 });
            const now = ph.adhesives[d.adhesive]!;
            this.host.gauge({ kind: 'progress', value: now.segs.reduce((a, x) => a + x, 0) / now.segs.length, labelKey: 'repair.gauge.pry' });
          }
        }
        focus = 0.4;
        break;
      }
      case 'pry': {
        toolActive = true;
        const res = s.perform({ t: 'pry', adhesive: d.adhesive, dt });
        if (res.ok) {
          const significant = res.events.filter((ev) => ev.type !== 'pry');
          for (const ev of significant) this.playEvent(ev);
          const st = ph.adhesives[d.adhesive]!;
          const broken = st.segs.filter((_, i) => st.broken[i]);
          const prog = broken.length ? broken.reduce((a, x) => a + x, 0) / broken.length : 1;
          this.host.gauge({ kind: 'progress', value: prog, labelKey: 'repair.gauge.pry' });
          if (significant.length || !st.bonded || prog >= 1) {
            v.sync(ph);
            this.refreshHint();
            this.host.onStateChanged();
          }
          if (!st.bonded || prog >= 1) {
            this.drag = { type: 'idle' };
            this.endLoops();
            this.host.gauge(null);
          }
        } else {
          this.drag = { type: 'idle' };
          this.endLoops();
        }
        focus = 0.8;
        break;
      }
      case 'tab': {
        toolActive = true;
        const tier = Math.min(3, s.tool('tweezers'));
        const safe = 0.45 + 0.12 * tier;
        const res = s.perform({ t: 'pullTab', adhesive: d.adhesive, tab: d.tab, speed: d.speed, dt });
        const st = ph.adhesives[d.adhesive]!;
        this.host.gauge({ kind: 'tab', speed: d.speed, safe, progress: st.segs[d.tab] ?? 1 });
        const tab = v.parts.get(d.comp)?.build.tabs[d.tab];
        if (tab) {
          const stretch = 1 + (st.segs[d.tab] ?? 0) * 2.2 + d.speed * 0.25;
          tab.scale.set(1 / Math.sqrt(stretch), stretch, 1);
        }
        if (res.ok) {
          const significant = res.events.filter((ev) => ev.type !== 'tab_progress');
          for (const ev of significant) this.playEvent(ev);
          if (significant.length) {
            if (tab) tab.userData.dragging = false;
            v.sync(ph);
            this.refreshHint();
            this.host.onStateChanged();
            this.drag = { type: 'idle' };
            this.host.gauge(null);
          }
        } else {
          this.drag = { type: 'idle' };
          this.host.gauge(null);
        }
        if (d.speed > 0.05 && Math.random() < dt * 6) this.host.sfx('pulltab_stretch', { pitch: 0.8 + d.speed * 0.6, volume: 0.5 });
        // without movement the pull relaxes
        d.speed *= Math.exp(-dt * 4);
        focus = 0.9;
        break;
      }
      case 'cut':
        toolActive = true;
        focus = 0.8;
        break;
      case 'clean':
        toolActive = true;
        focus = 0.2;
        break;
      case 'suction':
        toolActive = true;
        focus = 0.5;
        break;
      default:
        break;
    }
    this.host.setFocus(focus);

    if (this.gaugeTimer > 0) {
      this.gaugeTimer -= dt;
      if (this.gaugeTimer <= 0 && this.drag.type === 'idle') this.host.gauge(null);
    }

    // the uncut part of a seam breathes so it reads as "still to do"
    this.pulse += dt;
    for (const strips of this.seams.values()) {
      for (const m of strips) {
        if (!m.visible || m.userData.cut) continue;
        (m.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(this.pulse * 5) * 0.25;
      }
    }

    for (const m of this.benchMarkers.values()) {
      const k = 1 + Math.sin(this.pulse * 6) * 0.18;
      m.scale.set(k, k, 1);
    }

    // heat glow follows the adhesive temperature
    for (const [id, glow] of this.heatGlow) {
      const st = ph.adhesives[id];
      const t = st ? THREE.MathUtils.clamp((st.temp - 42) / 70, 0, 1) : 0;
      const m = glow.material as THREE.MeshBasicMaterial;
      m.opacity = t * 0.55;
      m.color.setHSL(0.07 - t * 0.05, 1, 0.5);
      glow.visible = t > 0.01 && ph.comps[s.model.fastener(id).owner.id]!.state !== 'removed';
    }

    // suction cup tugging on the cover
    if (d.type === 'suction') {
      const pv = v.parts.get(d.comp);
      if (pv?.pivot && !d.done) {
        const sign = pv.facing * (pv.def.hinge === 'right' ? 1 : -1);
        pv.pivot.rotation.y = sign * this.suctionLift * 0.012;
      }
    }

    // 3D tool cursor
    this.ensureToolModel();
    const th = this.toolHandle;
    if (th) {
      th.root.visible = this.pointer.inside && this.drag.type !== 'orbit' && this.drag.type !== 'pan';
      const tilt = (this.tool && TOOL_TILT[this.tool]) || [0.8, -0.4];
      const pos = th.root.position;
      const target = this.cursor;
      const hoverLift = toolActive ? 0.0005 : 0.006;
      pos.lerp(new THREE.Vector3(target.x, target.y + hoverLift, target.z), 1 - Math.exp(-dt * 30));
      if (d.type === 'suction') pos.y += this.suctionLift * 0.004;
      th.root.rotation.set(tilt[0] + this.cam.polar * 0.15, this.cam.azimuth, tilt[1], 'YXZ');
      if (this.toolSpin !== 0) {
        th.root.userData.spin = ((th.root.userData.spin as number | undefined) ?? 0) + this.toolSpin * dt;
        th.root.rotateY(th.root.userData.spin as number);
      }
      th.update?.(dt, toolActive);
    }

    // a screw riding on the driver tip
    const held = s.heldScrew();
    if (held) {
      const sv = v.screws.get(held.id);
      if (sv) {
        const p = this.bench.root.worldToLocal(this.cursor.clone());
        sv.group.position.lerp(new THREE.Vector3(p.x, p.y, p.z + held.length + 1.5), 1 - Math.exp(-dt * 30));
        sv.group.quaternion.identity();
      }
    }

    if (this.flashlight.visible) {
      this.flashlight.position.set(this.cursor.x + 0.05, this.cursor.y + 0.22, this.cursor.z + 0.12);
      this.flashlight.target.position.copy(this.cursor);
      for (const m of this.lostMarkers.values()) {
        const wp = m.getWorldPosition(new THREE.Vector3());
        const near = wp.distanceTo(this.cursor) < 0.07;
        (m.material as THREE.MeshStandardMaterial).emissiveIntensity = near ? 2.5 : 0.1;
        m.scale.setScalar(near ? 1.3 : 0.8);
      }
    }

    this.particles.update(dt);
  }

  /** Lifts every part along its layer so the whole structure can be admired. */
  explode(amount: number): void {
    const v = this.visual;
    const s = this.session;
    if (!v || !s) return;
    for (const pv of v.parts.values()) {
      if (pv.def.parent || pv.def.removable === false) continue;
      if (s.phone.comps[pv.def.id]!.state === 'removed') continue;
      const layer = pv.facing === 1 ? pv.def.z + pv.def.t : -(s.model.def.dims.d - pv.def.z);
      const offset = layer * amount * 9;
      const target = pv.pivot ?? pv.group;
      const base = (target.userData.baseZ as number | undefined) ?? target.position.z;
      target.userData.baseZ = base;
      const from = target.position.z;
      this.tweens.add(0.8, (k) => (target.position.z = from + (base + offset - from) * k), { ease: ease.inOutCubic });
    }
    for (const [id, sv] of v.screws) {
      const item = s.phone.screws[id];
      if (item?.loc.k === 'hole') sv.group.visible = amount === 0;
    }
  }

  dispose(): void {
    this.clearRims();
    this.particles.dispose();
    this.scene.remove(this.flashlight, this.flashlight.target);
    if (this.toolHandle) this.scene.remove(this.toolHandle.root);
  }
}

export type { RepairContext, RepairGoal, PhoneInstance };
