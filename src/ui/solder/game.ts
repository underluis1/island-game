/**
 * Micro-soldering minigame — pure simulation (no DOM). Board space: origin at the centre of the
 * microscope view, visible radius 500 units, +y down.
 */
export type SolderFault = 'charge_ic' | 'connector' | 'long_screw' | 'short';

export type SolderSfx =
  | 'flux'
  | 'heat_on'
  | 'heat_off'
  | 'sizzle'
  | 'overheat'
  | 'lift'
  | 'place'
  | 'place_fail'
  | 'joint_good'
  | 'joint_cold'
  | 'joint_bridge'
  | 'phase'
  | 'done';

export interface SolderProps {
  faultKind: SolderFault;
  /** 1 = fine soldering iron, 2 = hot-air rework station (wider tolerances, steadier) */
  toolTier: 1 | 2;
  /** 0 = very shaky hand … 1 = rock steady */
  steadiness: number;
}

export interface PadDef {
  x: number;
  y: number;
  w: number;
  h: number;
  /** direction the trace leaves the pad */
  dir: [number, number];
}

export type PartStyle = 'chip' | 'connector' | 'sot' | 'jumper';

export interface Layout {
  kind: SolderFault;
  style: PartStyle;
  designator: string;
  label: string;
  body: { w: number; h: number; y: number };
  pads: PadDef[];
}

function row(n: number, x0: number, step: number, y: number, w: number, h: number, dir: [number, number]): PadDef[] {
  const out: PadDef[] = [];
  for (let i = 0; i < n; i++) out.push({ x: x0 + step * i, y, w, h, dir });
  return out;
}
function column(n: number, x: number, y0: number, step: number, w: number, h: number, dir: [number, number]): PadDef[] {
  const out: PadDef[] = [];
  for (let i = 0; i < n; i++) out.push({ x, y: y0 + step * i, w, h, dir });
  return out;
}

export const LAYOUTS: Record<SolderFault, Layout> = {
  charge_ic: {
    kind: 'charge_ic',
    style: 'chip',
    designator: 'U2',
    label: 'PX1610A3',
    body: { w: 270, h: 330, y: 0 },
    pads: [...column(5, -178, -132, 66, 92, 36, [-1, 0]), ...column(5, 178, -132, 66, 92, 36, [1, 0])],
  },
  connector: {
    kind: 'connector',
    style: 'connector',
    designator: 'J4',
    label: 'FPC-08',
    body: { w: 520, h: 110, y: -40 },
    pads: [
      { x: -300, y: -40, w: 64, h: 84, dir: [-1, 0] },
      ...row(8, -203, 58, 62, 30, 92, [0, 1]),
      { x: 300, y: -40, w: 64, h: 84, dir: [1, 0] },
    ],
  },
  short: {
    kind: 'short',
    style: 'sot',
    designator: 'Q7',
    label: 'K4N',
    body: { w: 250, h: 150, y: 0 },
    pads: [...row(3, -78, 78, -112, 44, 78, [0, -1]), ...row(3, -78, 78, 112, 44, 78, [0, 1])],
  },
  long_screw: {
    kind: 'long_screw',
    style: 'jumper',
    designator: 'TP',
    label: 'JUMPER',
    body: { w: 360, h: 230, y: 0 },
    pads: [...column(3, -138, -62, 62, 58, 34, [-1, 0]), ...column(3, 138, -62, 62, 58, 34, [1, 0])],
  },
};

export type JointKind = 'good' | 'cold' | 'bridge';

export interface PadState {
  flux: number;
  joint: { kind: JointKind; fill: number; score: number; seed: number } | null;
}

export interface Popup {
  x: number;
  y: number;
  /** i18n key suffix under ui.solder.fb */
  key: string;
  tone: 'good' | 'warn' | 'bad';
  t: number;
}

export interface Smoke {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
}

export interface Tuning {
  jitter: number;
  tempLo: number;
  tempHi: number;
  tempDanger: number;
  meltTime: number;
  placeTol: number;
  placeAngle: number;
  wobble: number;
  fillLo: number;
  fillHi: number;
  fillTime: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function tuningFor(p: SolderProps): Tuning {
  const pro = p.toolTier === 2;
  const steady = clamp01(p.steadiness);
  return {
    jitter: (5 + 30 * (1 - steady)) * (pro ? 0.6 : 1),
    tempLo: pro ? 290 : 300,
    tempHi: pro ? 385 : 370,
    tempDanger: pro ? 435 : 420,
    meltTime: pro ? 5.2 : 6.4,
    placeTol: pro ? 78 : 64,
    placeAngle: pro ? 7.5 : 6,
    wobble: pro ? 5 : 8,
    fillLo: pro ? 0.55 : 0.6,
    fillHi: pro ? 0.9 : 0.85,
    fillTime: 1.45,
  };
}

export class SolderSim {
  readonly layout: Layout;
  readonly tune: Tuning;
  /** 1 flux · 2 heat · 3 place · 4 solder · 5 result */
  phase = 1;
  /** >0 while the short pause between phases runs */
  pause = 0;
  elapsed = 0;
  time = 0;
  cursor = { x: 0, y: -260 };
  tip = { x: 0, y: -260 };
  down = false;
  pads: PadState[];
  scores: [number, number, number, number] = [0, 0, 0, 0];
  popups: Popup[] = [];
  smoke: Smoke[] = [];
  /** flux stamps not yet painted by the renderer */
  stamps: Array<{ x: number; y: number }> = [];

  // phase 1
  spill = 0;
  // phase 2
  temp = 25;
  melt = 0;
  heatClock = 0;
  inWindow = 0;
  overheat = 0;
  scorch = 0;
  /** 0..1 old part lifting away (≥1 = gone) */
  lift = 0;
  // phase 3
  angle = 0;
  attempts = 0;
  placed = false;
  snap = 0;
  partPos = { x: 0, y: 0 };
  placeShake = 0;
  // phase 4
  padIndex = 0;
  fill = 0;
  holding = false;
  onTime = 0;
  offTime = 0;
  padCooldown = 0;
  counts: Record<JointKind, number> = { good: 0, cold: 0, bridge: 0 };

  private sfx: (name: SolderSfx) => void;
  private sizzleClock = 0;
  private fluxClock = 0;
  private wasHot = false;

  constructor(props: SolderProps, sfx: (name: SolderSfx) => void) {
    this.layout = LAYOUTS[props.faultKind];
    this.tune = tuningFor(props);
    this.pads = this.layout.pads.map(() => ({ flux: 0, joint: null }));
    this.sfx = sfx;
  }

  get quality(): number {
    return clamp01((this.scores[0] + this.scores[1] + this.scores[2] + this.scores[3]) / 4);
  }

  /** 0..1 progress of the current phase (for the HUD bar). */
  get progress(): number {
    switch (this.phase) {
      case 1:
        return this.pads.reduce((s, p) => s + clamp01(p.flux), 0) / this.pads.length;
      case 2:
        return clamp01(this.melt);
      case 3:
        return this.placed ? 1 : 0;
      case 4:
        return this.padIndex / this.pads.length;
      default:
        return 1;
    }
  }

  pointer(x: number, y: number): void {
    this.cursor.x = x;
    this.cursor.y = y;
  }

  press(): void {
    if (this.down) return;
    this.down = true;
    if (this.pause > 0 || this.phase >= 5) return;
    if (this.phase === 2) this.sfx('heat_on');
    else if (this.phase === 3) this.tryPlace();
    else if (this.phase === 4 && this.padCooldown <= 0) {
      this.holding = true;
      this.fill = 0;
      this.onTime = 0;
      this.offTime = 0;
    }
  }

  release(): void {
    if (!this.down) return;
    this.down = false;
    if (this.phase === 2 && this.pause <= 0) this.sfx('heat_off');
    if (this.phase === 4 && this.holding) this.finishJoint();
  }

  update(dt: number): void {
    this.time += dt;
    if (this.phase < 5) this.elapsed += dt;
    const amp = this.tune.jitter * (this.phase === 1 ? 0.35 : this.phase === 2 ? 0.5 : 1);
    const t = this.time;
    const nx = (Math.sin(t * 7.3) + Math.sin(t * 12.1 + 1.3) * 0.6 + Math.sin(t * 3.1 + 4) * 0.8) / 2.4;
    const ny = (Math.sin(t * 6.1 + 2) + Math.sin(t * 13.3 + 0.4) * 0.6 + Math.sin(t * 2.7 + 1) * 0.8) / 2.4;
    this.tip.x = this.cursor.x + nx * amp;
    this.tip.y = this.cursor.y + ny * amp;

    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1.4);
    for (const s of this.smoke) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx += Math.sin(this.time * 3 + s.r) * 20 * dt;
      s.r += 26 * dt;
    }
    this.smoke = this.smoke.filter((s) => s.life < s.max);
    if (this.placeShake > 0) this.placeShake = Math.max(0, this.placeShake - dt * 3);
    if (this.lift > 0 && this.lift < 1) this.lift = Math.min(1, this.lift + dt * 1.6);
    if (this.placed && this.snap < 1) this.snap = Math.min(1, this.snap + dt * 3.2);

    if (this.pause > 0) {
      this.pause -= dt;
      if (this.phase === 2 || this.temp > 25) this.temp += (25 - this.temp) * Math.min(1, dt * 1.2);
      if (this.pause <= 0) this.enterNext();
      return;
    }
    if (this.phase === 1) this.updateFlux(dt);
    else if (this.phase === 2) this.updateHeat(dt);
    else if (this.phase === 3) this.angle = Math.sin(this.time * 1.9) * this.tune.wobble + Math.sin(this.time * 4.3) * this.tune.wobble * 0.25;
    else if (this.phase === 4) this.updateSolder(dt);
  }

  /* ---------------------------------------------------------------- phases */

  private finishPhase(score: number): void {
    this.scores[this.phase - 1] = clamp01(score);
    this.pause = 0.95;
    this.holding = false;
    this.sfx('phase');
  }

  private enterNext(): void {
    this.pause = 0;
    this.phase += 1;
    if (this.phase === 4) this.padCooldown = 0.2;
    if (this.phase === 5) this.sfx('done');
  }

  private updateFlux(dt: number): void {
    if (!this.down) return;
    let near = false;
    for (let i = 0; i < this.pads.length; i++) {
      const def = this.layout.pads[i] as PadDef;
      const d = Math.hypot(this.tip.x - def.x, this.tip.y - def.y);
      const reach = Math.max(def.w, def.h) / 2 + 34;
      if (d < reach + 60) near = true;
      const st = this.pads[i] as PadState;
      if (d < reach && st.flux < 1) st.flux = Math.min(1, st.flux + dt * 2.6);
    }
    if (!near) this.spill += dt;
    this.stamps.push({ x: this.tip.x, y: this.tip.y });
    this.fluxClock -= dt;
    if (this.fluxClock <= 0) {
      this.fluxClock = 0.16;
      this.sfx('flux');
    }
    if (this.pads.every((p) => p.flux >= 1)) this.finishPhase(1 - this.spill / 3.5);
  }

  private updateHeat(dt: number): void {
    const { tempLo, tempHi, tempDanger, meltTime } = this.tune;
    const d = Math.hypot(this.tip.x, this.tip.y - this.layout.body.y);
    const prox = clamp01(1 - d / 430);
    const target = this.down ? 25 + 480 * prox : 25;
    const k = target > this.temp ? 0.95 : 0.62;
    this.temp += (target - this.temp) * Math.min(1, k * dt);
    const hot = this.temp >= tempLo && this.temp <= tempHi;
    if (hot || this.heatClock > 0) this.heatClock += dt;
    if (hot) {
      this.inWindow += dt;
      this.melt += dt / meltTime;
    }
    if (this.temp > tempDanger) {
      this.overheat += dt;
      this.scorch = Math.min(1, this.scorch + dt * 0.4);
      if (!this.wasHot) {
        this.sfx('overheat');
        this.popups.push({ x: 0, y: -this.layout.body.h / 2 - 70, key: 'too_hot', tone: 'bad', t: 0 });
      }
      this.wasHot = true;
    } else if (this.temp < tempDanger - 15) this.wasHot = false;
    if (this.temp > 170) {
      this.sizzleClock -= dt;
      if (this.sizzleClock <= 0) {
        this.sizzleClock = hot ? 0.3 : 0.55;
        if (hot) this.sfx('sizzle');
        const pad = this.layout.pads[Math.floor(Math.random() * this.pads.length)] as PadDef;
        this.smoke.push({ x: pad.x, y: pad.y, vx: (Math.random() - 0.5) * 30, vy: -50 - Math.random() * 40, r: 14, life: 0, max: 1.6 + Math.random() });
      }
    }
    if (this.melt >= 1) {
      this.melt = 1;
      this.lift = 0.001;
      if (this.layout.style !== 'jumper') this.sfx('lift');
      const ratio = this.inWindow / Math.max(0.001, this.heatClock);
      this.finishPhase(0.25 + 0.75 * ratio - this.overheat * 0.22);
      this.pause = 1.3;
    }
  }

  private tryPlace(): void {
    if (this.placed) return;
    const dx = this.tip.x;
    const dy = this.tip.y - this.layout.body.y;
    const dist = Math.hypot(dx, dy);
    const ang = Math.abs(this.angle);
    if (dist > this.tune.placeTol || ang > this.tune.placeAngle) {
      this.attempts += 1;
      this.placeShake = 1;
      this.sfx('place_fail');
      this.popups.push({ x: this.tip.x, y: this.tip.y - this.layout.body.h / 2 - 50, key: dist > this.tune.placeTol ? 'off_target' : 'crooked', tone: 'warn', t: 0 });
      return;
    }
    this.placed = true;
    this.partPos = { x: dx, y: dy };
    this.snap = 0;
    this.sfx('place');
    const score = 1 - 0.55 * (dist / this.tune.placeTol) - 0.3 * (ang / this.tune.placeAngle) - 0.12 * this.attempts;
    this.popups.push({ x: 0, y: this.layout.body.y - this.layout.body.h / 2 - 60, key: score > 0.7 ? 'aligned' : 'ok', tone: 'good', t: 0 });
    this.finishPhase(Math.max(0.2, score));
  }

  private onPad(i: number): boolean {
    const def = this.layout.pads[i] as PadDef;
    return Math.abs(this.tip.x - def.x) < def.w / 2 + 16 && Math.abs(this.tip.y - def.y) < def.h / 2 + 16;
  }

  private updateSolder(dt: number): void {
    if (this.padCooldown > 0) this.padCooldown -= dt;
    if (!this.holding) return;
    if (this.onPad(this.padIndex)) {
      this.onTime += dt;
      this.fill += dt / this.tune.fillTime;
      this.sizzleClock -= dt;
      if (this.sizzleClock <= 0) {
        this.sizzleClock = 0.22;
        this.sfx('sizzle');
        const def = this.layout.pads[this.padIndex] as PadDef;
        this.smoke.push({ x: def.x, y: def.y, vx: (Math.random() - 0.5) * 24, vy: -60, r: 8, life: 0, max: 1.1 });
      }
      if (this.fill >= 1.22) this.finishJoint();
    } else {
      this.offTime += dt;
    }
  }

  private finishJoint(): void {
    this.holding = false;
    const def = this.layout.pads[this.padIndex] as PadDef;
    if (this.fill < 0.07) {
      this.fill = 0;
      return;
    }
    const { fillLo, fillHi } = this.tune;
    const f = this.fill;
    let kind: JointKind;
    let score: number;
    if (f < fillLo) {
      kind = 'cold';
      score = 0.2 + 0.45 * (f / fillLo);
    } else if (f <= fillHi) {
      kind = 'good';
      const mid = (fillLo + fillHi) / 2;
      score = 1 - 0.18 * (Math.abs(f - mid) / ((fillHi - fillLo) / 2));
    } else if (f < 1.04) {
      kind = 'good';
      score = 0.8 - 0.35 * ((f - fillHi) / (1.04 - fillHi));
    } else {
      kind = 'bridge';
      score = 0.15;
    }
    const aim = this.onTime / Math.max(0.001, this.onTime + this.offTime);
    score *= 0.6 + 0.4 * aim;
    (this.pads[this.padIndex] as PadState).joint = { kind, fill: f, score, seed: Math.random() * 1000 };
    this.counts[kind] += 1;
    this.sfx(kind === 'good' ? 'joint_good' : kind === 'cold' ? 'joint_cold' : 'joint_bridge');
    const key = kind === 'bridge' ? 'bridge' : kind === 'cold' ? 'cold' : score > 0.86 ? 'perfect' : 'good';
    this.popups.push({ x: def.x, y: def.y - def.h / 2 - 46, key, tone: kind === 'good' ? 'good' : kind === 'cold' ? 'warn' : 'bad', t: 0 });
    this.fill = 0;
    this.padIndex += 1;
    this.padCooldown = 0.22;
    if (this.padIndex >= this.pads.length) {
      const sum = this.pads.reduce((s, p) => s + (p.joint?.score ?? 0), 0);
      this.finishPhase(sum / this.pads.length);
      this.pause = 1.2;
    }
  }

  /* ---------------------------------------------------------------- debug / tests */

  /** Jump straight to a phase with the previous ones completed (gallery, automated tests). */
  skipTo(phase: number, sample = false): void {
    const target = Math.min(5, Math.max(1, Math.round(phase)));
    this.pause = 0;
    this.down = false;
    this.holding = false;
    if (target >= 2) {
      this.pads.forEach((p) => (p.flux = 1));
      for (const def of this.layout.pads) for (let k = 0; k < 6; k++) this.stamps.push({ x: def.x + (k % 3) * 14 - 14, y: def.y + (k > 2 ? 12 : -12) });
      this.scores[0] = 0.94;
    }
    if (target >= 3) {
      this.melt = 1;
      this.lift = 1;
      this.temp = 25;
      this.scores[1] = 0.86;
    } else if (target === 2 && sample) {
      this.temp = (this.tune.tempLo + this.tune.tempHi) / 2;
      this.melt = 0.55;
      this.heatClock = 4;
      this.inWindow = 3.4;
      this.down = true;
      this.cursor = { x: 96, y: this.layout.body.y - 120 };
      for (let i = 0; i < 5; i++) this.smoke.push({ x: -120 + i * 60, y: -40 - i * 22, vx: 6, vy: -50, r: 16 + i * 5, life: 0.3 + i * 0.2, max: 2.4 });
    }
    if (target >= 4) {
      this.placed = true;
      this.snap = 1;
      this.scores[2] = 0.9;
    } else if (target === 3 && sample) {
      this.cursor = { x: 46, y: this.layout.body.y - 38 };
    }
    if (target === 4 && sample) {
      const kinds: JointKind[] = ['good', 'good', 'cold', 'good', 'bridge', 'good'];
      const n = Math.min(this.pads.length - 2, 5);
      for (let i = 0; i < n; i++) {
        const kind = kinds[i % kinds.length] as JointKind;
        (this.pads[i] as PadState).joint = { kind, fill: kind === 'cold' ? 0.4 : kind === 'bridge' ? 1.2 : 0.74, score: kind === 'good' ? 0.92 : 0.3, seed: i * 37.1 };
        this.counts[kind] += 1;
      }
      this.padIndex = n;
      const def = this.layout.pads[n] as PadDef;
      this.cursor = { x: def.x + 4, y: def.y + 2 };
      this.down = true;
      this.holding = true;
      this.fill = 0.5;
      this.onTime = 0.7;
    }
    if (target >= 5) {
      this.pads.forEach((p, i) => {
        const kind: JointKind = sample && i === 2 ? 'cold' : 'good';
        p.joint = { kind, fill: kind === 'cold' ? 0.4 : 0.74, score: kind === 'good' ? 0.93 : 0.4, seed: i * 37.1 };
      });
      this.counts = { good: this.pads.length - (sample ? 1 : 0), cold: sample ? 1 : 0, bridge: 0 };
      this.padIndex = this.pads.length;
      this.scores[3] = sample ? 0.87 : 0.93;
      this.elapsed = Math.max(this.elapsed, 52);
    }
    this.phase = target;
  }
}
