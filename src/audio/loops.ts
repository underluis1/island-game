/**
 * Suoni continui degli strumenti (heat gun, saldatore, avvitatore…). Ogni loop è una piccola catena di
 * nodi costruita all'accensione, pilotata da `intensity`, e smontata poco dopo lo spegnimento.
 */
import { type NoiseColor, type Rnd, clamp01, mulberry, noiseSource } from './common';
import type { LoopName } from './types';

const FADE_IN = 0.05;
const FADE_OUT = 0.07;
const TEARDOWN = 0.6;

/** Piccolo costruttore di catene: tiene traccia di nodi e sorgenti per lo smontaggio. */
class Rig {
  readonly nodes: AudioNode[] = [];
  readonly sources: AudioScheduledSourceNode[] = [];
  readonly out: GainNode;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly now: number,
    readonly rnd: Rnd,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
  }

  osc(type: OscillatorType, f: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(this.now);
    this.sources.push(o);
    return o;
  }

  noise(color: NoiseColor): AudioBufferSourceNode {
    const s = noiseSource(this.ctx, color);
    s.start(this.now, this.rnd() * 2);
    this.sources.push(s);
    return s;
  }

  buffer(data: Float32Array, sr: number): AudioBufferSourceNode {
    const buf = this.ctx.createBuffer(1, data.length, sr);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(this.now);
    this.sources.push(s);
    return s;
  }

  filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const fl = this.ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    this.nodes.push(fl);
    return fl;
  }

  gain(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    return g;
  }

  /** collega in serie e ritorna l'ultimo nodo */
  chain<T extends AudioNode>(...nodes: [...AudioNode[], T]): T {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1] as T;
  }

  /** modulazione d'ampiezza: `lfo` fa oscillare il guadagno di `target` attorno al suo valore */
  am(target: GainNode, lfo: AudioNode, depth: number): void {
    const d = this.gain(depth);
    lfo.connect(d);
    d.connect(target.gain);
  }
}

type Apply = (intensity: number, set: (p: AudioParam, v: number) => void) => void;

interface LoopDef {
  /** livello del loop a regime */
  level: number;
  build: (r: Rig) => Apply;
}

/** Inviluppo irregolare a picchi (sfrigolio): valori 0..1. */
export function renderCrackleEnvelope(sr: number, seconds: number, seed: number): Float32Array {
  const n = Math.floor(sr * seconds);
  const data = new Float32Array(n);
  const rnd = mulberry(seed);
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (rnd() < 26 / sr) v = Math.max(v, 0.35 + rnd() * 0.65);
    v *= 1 - 60 / sr;
    data[i] = 0.1 + 0.9 * v;
  }
  return data;
}

const LOOPS: Record<LoopName, LoopDef> = {
  heatgun: {
    level: 0.5,
    build: (r) => {
      // motore a spazzole (due denti di sega quasi all'ottava) + soffio d'aria calda
      const m1 = r.osc('sawtooth', 100);
      const m2 = r.osc('sawtooth', 200.7);
      const motorLp = r.filter('lowpass', 420);
      m1.connect(motorLp);
      r.chain(m2, r.gain(0.4), motorLp);
      r.chain(motorLp, r.gain(0.12)).connect(r.out);
      const airBp = r.filter('bandpass', 1500, 0.5);
      const air = r.chain(r.noise('pink'), airBp, r.gain(0.3));
      air.connect(r.out);
      const hiss = r.chain(r.noise('white'), r.filter('bandpass', 5000, 0.8), r.gain(0.04));
      hiss.connect(r.out);
      return (i, set) => {
        set(m1.frequency, 92 + 26 * i);
        set(m2.frequency, (92 + 26 * i) * 2.007);
        set(airBp.frequency, 1100 + 900 * i);
        set(air.gain, 0.14 + 0.26 * i);
        set(hiss.gain, 0.02 + 0.06 * i);
      };
    },
  },
  hot_air: {
    level: 0.4,
    build: (r) => {
      const bp = r.filter('bandpass', 3200, 0.7);
      const air = r.chain(r.noise('white'), bp, r.gain(0.2));
      air.connect(r.out);
      const whine = r.osc('sine', 2100);
      r.chain(whine, r.gain(0.008)).connect(r.out);
      r.chain(r.osc('triangle', 50), r.gain(0.05)).connect(r.out);
      return (i, set) => {
        set(bp.frequency, 2600 + 1600 * i);
        set(air.gain, 0.1 + 0.2 * i);
        set(whine.frequency, 1900 + 600 * i);
      };
    },
  },
  solder_sizzle: {
    level: 0.45,
    build: (r) => {
      // flussante che frigge: rumore acuto modulato da un inviluppo a picchi irregolari
      const env = r.buffer(renderCrackleEnvelope(8000, 2.3, 0x501de4), 8000);
      const am = r.gain(0);
      env.connect(am.gain);
      const body = r.chain(r.noise('white'), r.filter('bandpass', 5200, 0.7), r.filter('highpass', 2500), am, r.gain(0.4));
      body.connect(r.out);
      const hiss = r.chain(r.noise('white'), r.filter('bandpass', 6500, 1.2), r.gain(0.03));
      hiss.connect(r.out);
      return (i, set) => {
        set(env.playbackRate, 0.7 + 0.9 * i);
        set(body.gain, 0.15 + 0.3 * i);
      };
    },
  },
  ultrasonic: {
    level: 0.4,
    build: (r) => {
      // vasca a ultrasuoni: ronzio del trasduttore + cavitazione frizzante + fischio sottile
      const buzz = r.osc('sawtooth', 100);
      r.chain(buzz, r.filter('bandpass', 2800, 2), r.gain(0.1)).connect(r.out);
      const cav = r.gain(0.5);
      r.am(cav, buzz, 0.5);
      const cavOut = r.chain(r.noise('white'), r.filter('bandpass', 7000, 1.5), cav, r.gain(0.12));
      cavOut.connect(r.out);
      r.chain(r.osc('sine', 9400), r.gain(0.005)).connect(r.out);
      const slosh = r.gain(0.05);
      r.am(slosh, r.osc('sine', 0.6), 0.03);
      r.chain(r.noise('pink'), r.filter('lowpass', 320), slosh).connect(r.out);
      return (i, set) => {
        set(cavOut.gain, 0.06 + 0.12 * i);
      };
    },
  },
  fan: {
    level: 0.4,
    build: (r) => {
      const lp = r.filter('lowpass', 900, 0.5);
      r.chain(r.noise('pink'), lp, r.gain(0.5)).connect(r.out);
      const blade = r.osc('triangle', 110);
      r.chain(blade, r.gain(0.06)).connect(r.out);
      return (i, set) => {
        set(lp.frequency, 600 + 1100 * i);
        set(blade.frequency, 80 + 70 * i);
      };
    },
  },
  screw_spin: {
    level: 0.9,
    build: (r) => {
      // avvitatura continua: treno di tic del cricchetto (la discontinuità del dente di sega eccita
      // un risonatore) + ronzio del motorino; frequenza dei tic e tono salgono con l'intensità
      const ticks = r.osc('sawtooth', 20);
      const res = r.filter('bandpass', 2600, 3);
      r.chain(ticks, r.filter('highpass', 1200), res, r.gain(0.5)).connect(r.out);
      const whir = r.osc('triangle', 220);
      const whir2 = r.osc('sawtooth', 441);
      r.chain(whir, r.gain(0.05)).connect(r.out);
      r.chain(whir2, r.filter('lowpass', 1400), r.gain(0.02)).connect(r.out);
      return (i, set) => {
        set(ticks.frequency, 13 + 34 * i);
        set(res.frequency, 2300 + 900 * i);
        set(whir.frequency, 170 + 260 * i);
        set(whir2.frequency, (170 + 260 * i) * 2.004);
      };
    },
  },
  brush_scrub: {
    level: 0.4,
    build: (r) => {
      const bp = r.filter('bandpass', 4500, 1);
      const strokes = r.gain(0.55);
      const lfo = r.osc('sine', 6);
      r.am(strokes, lfo, 0.45);
      r.chain(r.noise('white'), bp, strokes, r.gain(0.3)).connect(r.out);
      return (i, set) => {
        set(lfo.frequency, 4.5 + 5 * i);
        set(bp.frequency, 3800 + 1800 * i);
      };
    },
  },
  microscope_hum: {
    level: 0.3,
    build: (r) => {
      // ronzio di rete dell'illuminatore: appena percettibile
      r.chain(r.osc('sine', 100), r.gain(0.05)).connect(r.out);
      r.chain(r.osc('sine', 200), r.gain(0.016)).connect(r.out);
      r.chain(r.osc('sine', 50), r.gain(0.03)).connect(r.out);
      const hiss = r.chain(r.noise('white'), r.filter('bandpass', 5000, 0.5), r.gain(0.006));
      hiss.connect(r.out);
      return (i, set) => {
        set(hiss.gain, 0.004 + 0.006 * i);
      };
    },
  },
};

export const LOOP_NAMES = Object.keys(LOOPS) as LoopName[];

interface LoopState {
  rig: Rig | null;
  apply: Apply | null;
  on: boolean;
  intensity: number;
  offAt: number;
}

export class LoopBank {
  private readonly states = new Map<LoopName, LoopState>();
  private readonly rnd: Rnd;
  private setAt = 0;
  private readonly setter = (p: AudioParam, v: number): void => {
    p.setTargetAtTime(v, this.setAt, 0.08);
  };

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bus: AudioNode,
    seed: number,
  ) {
    this.rnd = mulberry(seed ^ 0x1009);
  }

  /** Numero di loop con nodi vivi (diagnostica). */
  get active(): number {
    let n = 0;
    for (const s of this.states.values()) if (s.rig) n++;
    return n;
  }

  set(name: LoopName, on: boolean, intensity = 1): void {
    const now = this.ctx.currentTime;
    let s = this.states.get(name);
    if (!s) {
      if (!on) return;
      s = { rig: null, apply: null, on: false, intensity: -1, offAt: 0 };
      this.states.set(name, s);
    }
    const i = clamp01(intensity);
    if (on) {
      if (!s.rig) {
        const rig = new Rig(this.ctx, now, this.rnd);
        s.apply = LOOPS[name].build(rig);
        rig.out.connect(this.bus);
        s.rig = rig;
        s.intensity = -1;
        s.on = false;
      }
      if (!s.on) {
        s.on = true;
        s.rig.out.gain.cancelScheduledValues(now);
        s.rig.out.gain.setTargetAtTime(LOOPS[name].level, now, FADE_IN);
      }
      if (Math.abs(i - s.intensity) > 0.01) {
        // alla prima applicazione i parametri saltano subito al valore giusto
        const first = s.intensity < 0;
        s.intensity = i;
        this.setAt = now;
        if (first) s.apply?.(i, (p, v) => p.setValueAtTime(v, now));
        else s.apply?.(i, this.setter);
      }
    } else if (s.on && s.rig) {
      s.on = false;
      s.rig.out.gain.cancelScheduledValues(now);
      s.rig.out.gain.setTargetAtTime(0, now, FADE_OUT);
      s.offAt = now + TEARDOWN;
    }
  }

  /** Smonta i loop spenti la cui dissolvenza è terminata. */
  update(now: number): void {
    for (const s of this.states.values()) {
      if (!s.on && s.rig && now >= s.offAt) this.teardown(s);
    }
  }

  private teardown(s: LoopState): void {
    const rig = s.rig;
    if (!rig) return;
    for (const src of rig.sources) {
      src.stop();
      src.disconnect();
    }
    for (const n of rig.nodes) n.disconnect();
    rig.out.disconnect();
    s.rig = null;
    s.apply = null;
  }

  dispose(): void {
    for (const s of this.states.values()) this.teardown(s);
    this.states.clear();
  }
}
