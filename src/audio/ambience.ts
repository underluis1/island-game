/**
 * Ambiente sonoro di Koh Phi Phi: risacca, vento tra le palme, gabbiani e uccelli (di giorno), grilli,
 * insetti e geco tokay (di notte), long-tail a motore con doppler, chiacchiericcio lontano, pioggia
 * con tuoni rari. Pochi nodi persistenti pilotati da automazioni; gli strati rari nascono al primo uso.
 */
import {
  type Kit,
  type Rnd,
  clamp,
  clamp01,
  envelope,
  finish,
  makeKit,
  mulberry,
  noiseSource,
  smoothstep,
  tone,
} from './common';
import { EventTimer } from './scheduler';
import { playSfx } from './sfx';
import type { AudioEnv } from './types';

/** Applica un valore a un AudioParam solo quando cambia davvero (niente raffiche di automazioni). */
class Smooth {
  private last = Number.NaN;

  constructor(
    private readonly p: AudioParam,
    private readonly tau = 0.3,
    private readonly eps = 0.004,
  ) {}

  set(v: number, now: number): void {
    if (Number.isNaN(this.last) || Math.abs(v - this.last) > this.eps * Math.max(1, Math.abs(v))) {
      this.last = v;
      this.p.setTargetAtTime(v, now, this.tau);
    }
  }
}

export function dayFactor(t: number): number {
  return smoothstep(5.8, 7, t) * (1 - smoothstep(17.8, 19, t));
}

export function nightFactor(t: number): number {
  return clamp01(1 - smoothstep(5, 6.2, t) + smoothstep(18.4, 19.8, t));
}

// ---------------------------------------------------------------------------------------------
// Buffer procedurali (funzioni pure)
// ---------------------------------------------------------------------------------------------

/** Inviluppo di un frinire: treni di impulsi brevi separati da pause, in loop. */
export function renderChirpEnvelope(sr: number, seconds: number, pulses: number, pulseHz: number, groups: number): Float32Array {
  const n = Math.floor(sr * seconds);
  const data = new Float32Array(n);
  const width = Math.floor(sr * 0.011);
  const groupGap = seconds / groups;
  for (let g = 0; g < groups; g++) {
    for (let p = 0; p < pulses; p++) {
      const start = Math.floor(sr * (g * groupGap + p / pulseHz));
      for (let i = 0; i < width && start + i < n; i++) {
        data[start + i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / width);
      }
    }
  }
  return data;
}

const VOWELS: [number, number][] = [
  [780, 1250],
  [520, 1850],
  [320, 2250],
  [500, 920],
  [360, 800],
];

/**
 * Chiacchiericcio: più "parlatori" sintetici (treno glottale con intonazione che vaga, due formanti
 * per sillaba, pause tra le frasi) sommati in un loop. Non si capisce nulla, ma suona come gente.
 */
export function renderBabble(sr: number, seconds: number, talkers: number, seed: number): Float32Array {
  const n = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.4);
  const total = n + fade;
  const mixBuf = new Float32Array(total);
  const rnd = mulberry(seed);
  for (let tk = 0; tk < talkers; tk++) {
    const f0Base = 105 + rnd() * 130;
    const gain = 0.5 + rnd() * 0.5;
    let i = Math.floor(rnd() * sr * 0.5);
    let phase = 0;
    let left = 3 + Math.floor(rnd() * 7);
    // stato dei due risonatori (biquad passa-banda)
    let x1 = 0, x2 = 0, y1a = 0, y2a = 0, y1b = 0, y2b = 0;
    while (i < total) {
      if (left <= 0) {
        i += Math.floor(sr * (0.25 + rnd() * 0.9));
        left = 3 + Math.floor(rnd() * 7);
        continue;
      }
      left--;
      const len = Math.floor(sr * (0.1 + rnd() * 0.13));
      const [vf1, vf2] = VOWELS[Math.floor(rnd() * VOWELS.length)];
      const f1 = vf1 * (0.9 + rnd() * 0.2);
      const f2 = vf2 * (0.9 + rnd() * 0.2);
      const f0 = f0Base * (0.85 + rnd() * 0.4);
      const amp = gain * (0.5 + rnd() * 0.5);
      // coefficienti RBJ passa-banda (guadagno di picco costante)
      const w1 = (2 * Math.PI * f1) / sr;
      const w2 = (2 * Math.PI * f2) / sr;
      const al1 = Math.sin(w1) / (2 * 5);
      const al2 = Math.sin(w2) / (2 * 7);
      const a0a = 1 + al1, a1a = -2 * Math.cos(w1), a2a = 1 - al1;
      const a0b = 1 + al2, a1b = -2 * Math.cos(w2), a2b = 1 - al2;
      for (let j = 0; j < len && i + j < total; j++) {
        phase += f0 / sr;
        if (phase >= 1) phase -= 1;
        const x = phase * 2 - 1;
        const ya = (al1 * x - al1 * x2 - a1a * y1a - a2a * y2a) / a0a;
        const yb = (al2 * x - al2 * x2 - a1b * y1b - a2b * y2b) / a0b;
        x2 = x1;
        x1 = x;
        y2a = y1a;
        y1a = ya;
        y2b = y1b;
        y1b = yb;
        const e = Math.sin((Math.PI * j) / len);
        mixBuf[i + j] += (ya + yb * 0.6) * e * e * amp;
      }
      i += len + Math.floor(sr * rnd() * 0.04);
    }
  }
  const out = new Float32Array(n);
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    if (i < fade) {
      const w = i / fade;
      out[i] = mixBuf[i] * Math.sqrt(w) + mixBuf[n + i] * Math.sqrt(1 - w);
    } else {
      out[i] = mixBuf[i];
    }
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < n; i++) out[i] *= 0.8 / peak;
  return out;
}

/** Gocce su tenda e tetto: tic smorzati e irregolari, in loop. */
export function renderPatter(sr: number, seconds: number, seed: number): Float32Array {
  const n = Math.floor(sr * seconds);
  const data = new Float32Array(n);
  const rnd = mulberry(seed);
  const drops = Math.floor(seconds * 38);
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(rnd() * n);
    const f = 900 + rnd() * 2400;
    const len = Math.floor(sr * (0.006 + rnd() * 0.014));
    const amp = Math.pow(rnd(), 2) * 0.8 + 0.08;
    for (let i = 0; i < len; i++) {
      const e = Math.exp((-5 * i) / len);
      const s = Math.sin((2 * Math.PI * f * i) / sr) * 0.6 + (rnd() * 2 - 1) * 0.4;
      // i tic a cavallo della fine rientrano dall'inizio: il loop non ha giunture
      data[(at + i) % n] += s * e * amp;
    }
  }
  return data;
}

function bufferFrom(ctx: BaseAudioContext, data: Float32Array, sr: number): AudioBuffer {
  const buf = ctx.createBuffer(1, data.length, sr);
  buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return buf;
}

// ---------------------------------------------------------------------------------------------

const SEA_BASE = 0.3;
const FOAM_BASE = 0.006;

interface NightLayer {
  gain: Smooth;
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
}

interface BoatLayer {
  freq1: Smooth;
  freq2: Smooth;
  gain: Smooth;
  lp: Smooth;
  pan: Smooth;
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
}

interface GainLayer {
  gains: Smooth[];
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
}

export interface AmbienceStats {
  waves: number;
  gulls: number;
  birds: number;
  geckos: number;
  thunders: number;
  layers: string[];
}

export class Ambience {
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rnd;
  /** bus dei suoni esterni: passa-basso + attenuazione quando si è al chiuso */
  private readonly outdoor: BiquadFilterNode;
  private readonly outdoorGain: GainNode;
  /** bus dei suoni che non vengono attutiti dall'interno (gocce sul tetto) */
  private readonly direct: GainNode;
  private readonly muffle: Smooth;
  private readonly outdoorLevel: Smooth;

  // mare
  private readonly seaGain: GainNode;
  private readonly seaLp: BiquadFilterNode;
  private readonly seaPan: StereoPannerNode;
  private readonly foamGain: GainNode;
  private readonly foamBp: BiquadFilterNode;
  private readonly seaLevel: Smooth;
  private waveT: number;
  private wavePan = 0;

  // vento
  private readonly windGust: GainNode;
  private readonly windBp: BiquadFilterNode;
  private readonly rustleGust: GainNode;
  private readonly windLevel: Smooth;
  private readonly gustTimer: EventTimer;

  private readonly persistent: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];

  private night: NightLayer | null = null;
  private boat: BoatLayer | null = null;
  private crowd: GainLayer | null = null;
  private rain: GainLayer | null = null;

  private readonly gullTimer: EventTimer;
  private readonly birdTimer: EventTimer;
  private readonly geckoTimer: EventTimer;
  private readonly thunderTimer: EventTimer;

  private env: AudioEnv = { timeOfDay: 12, rain: 0, wind: 0.25, boat: 0, crowd: 0, indoors: 0 };
  private prevBoat = 0;
  private boatVel = 0;
  private boatSide = -1;

  readonly stats: AmbienceStats = { waves: 0, gulls: 0, birds: 0, geckos: 0, thunders: 0, layers: ['sea', 'wind'] };

  constructor(ctx: BaseAudioContext, out: AudioNode, seed: number) {
    this.ctx = ctx;
    this.rnd = mulberry(seed ^ 0x51ed270b);
    const now = ctx.currentTime;

    this.outdoor = ctx.createBiquadFilter();
    this.outdoor.type = 'lowpass';
    this.outdoor.frequency.value = 18000;
    this.outdoor.Q.value = 0.5;
    this.outdoorGain = ctx.createGain();
    this.outdoor.connect(this.outdoorGain);
    this.outdoorGain.connect(out);
    this.direct = ctx.createGain();
    this.direct.connect(out);
    this.muffle = new Smooth(this.outdoor.frequency, 0.35, 0.01);
    this.outdoorLevel = new Smooth(this.outdoorGain.gain, 0.35);
    this.persistent.push(this.outdoor, this.outdoorGain, this.direct);

    // --- mare: corpo dell'onda (rumore bruno) + schiuma sulla battigia (banda alta) ---
    const sea = noiseSource(ctx, 'pink');
    const seaHp = ctx.createBiquadFilter();
    seaHp.type = 'highpass';
    seaHp.frequency.value = 110;
    seaHp.Q.value = 0.5;
    this.seaLp = ctx.createBiquadFilter();
    this.seaLp.type = 'lowpass';
    this.seaLp.Q.value = 0.6;
    this.seaLp.frequency.value = 380;
    this.seaGain = ctx.createGain();
    this.seaGain.gain.value = SEA_BASE;
    this.seaPan = ctx.createStereoPanner();
    const seaOut = ctx.createGain();
    seaOut.gain.value = 0;
    this.seaLevel = new Smooth(seaOut.gain, 0.5);
    sea.connect(seaHp);
    seaHp.connect(this.seaLp);
    this.seaLp.connect(this.seaGain);
    this.seaGain.connect(this.seaPan);
    this.seaPan.connect(seaOut);
    const foam = noiseSource(ctx, 'white');
    this.foamBp = ctx.createBiquadFilter();
    this.foamBp.type = 'bandpass';
    this.foamBp.Q.value = 0.5;
    this.foamBp.frequency.value = 2400;
    this.foamGain = ctx.createGain();
    this.foamGain.gain.value = FOAM_BASE;
    foam.connect(this.foamBp);
    this.foamBp.connect(this.foamGain);
    this.foamGain.connect(this.seaPan);
    seaOut.connect(this.outdoor);
    sea.start(now, this.rnd() * 2);
    foam.start(now, this.rnd() * 2);
    this.sources.push(sea, foam);
    this.persistent.push(seaHp, this.seaLp, this.seaGain, this.seaPan, seaOut, this.foamBp, this.foamGain);
    this.waveT = now + 0.3;

    // --- vento: soffio a banda media + fruscio delle fronde ---
    const wind = noiseSource(ctx, 'pink');
    this.windBp = ctx.createBiquadFilter();
    this.windBp.type = 'bandpass';
    this.windBp.Q.value = 0.7;
    this.windBp.frequency.value = 480;
    this.windGust = ctx.createGain();
    this.windGust.gain.value = 0.5;
    const rustle = noiseSource(ctx, 'white');
    const rustleBp = ctx.createBiquadFilter();
    rustleBp.type = 'bandpass';
    rustleBp.Q.value = 0.9;
    rustleBp.frequency.value = 5200;
    this.rustleGust = ctx.createGain();
    this.rustleGust.gain.value = 0.1;
    const windOut = ctx.createGain();
    windOut.gain.value = 0;
    this.windLevel = new Smooth(windOut.gain, 0.6);
    wind.connect(this.windBp);
    this.windBp.connect(this.windGust);
    this.windGust.connect(windOut);
    rustle.connect(rustleBp);
    rustleBp.connect(this.rustleGust);
    this.rustleGust.connect(windOut);
    windOut.connect(this.outdoor);
    wind.start(now, this.rnd() * 2);
    rustle.start(now, this.rnd() * 2);
    this.sources.push(wind, rustle);
    this.persistent.push(this.windBp, this.windGust, rustleBp, this.rustleGust, windOut);

    this.gustTimer = new EventTimer(now + 0.5);
    this.gullTimer = new EventTimer(now + 3 + this.rnd() * 6);
    this.birdTimer = new EventTimer(now + 2 + this.rnd() * 5);
    this.geckoTimer = new EventTimer(now + 8 + this.rnd() * 20);
    this.thunderTimer = new EventTimer(now + 4 + this.rnd() * 8);
  }

  setEnvironment(env: AudioEnv): void {
    const e = this.env;
    e.timeOfDay = ((env.timeOfDay % 24) + 24) % 24;
    e.rain = clamp01(env.rain);
    e.wind = clamp01(env.wind);
    e.boat = clamp01(env.boat);
    e.crowd = clamp01(env.crowd);
    e.indoors = clamp01(env.indoors);
  }

  update(now: number, dt: number): void {
    const e = this.env;
    const day = dayFactor(e.timeOfDay);
    const night = nightFactor(e.timeOfDay);

    this.muffle.set(18000 * Math.pow(1900 / 18000, e.indoors), now);
    this.outdoorLevel.set(1 - 0.5 * e.indoors, now);
    this.seaLevel.set(0.55 + 0.25 * e.wind + 0.1 * night, now);
    this.windLevel.set(0.04 + 0.5 * e.wind, now);

    while (now + 1 >= this.waveT) this.scheduleWave(this.waveT);

    if (this.gustTimer.due(now, 0.1)) {
      const t = Math.max(now, this.gustTimer.next);
      const gust = 0.25 + 0.75 * this.rnd();
      const tau = 0.7 + this.rnd() * 1.2;
      this.windGust.gain.setTargetAtTime(gust, t, tau);
      this.windBp.frequency.setTargetAtTime(320 + 520 * gust * (0.6 + 0.4 * this.rnd()), t, tau);
      this.rustleGust.gain.setTargetAtTime(0.05 + 0.5 * gust * gust, t, tau * 0.7);
      this.gustTimer.schedule(now, 2.5 + this.rnd() * 4.5);
    }

    // --- fauna ---
    const calm = (1 - e.rain) * (1 - 0.6 * e.indoors);
    if (this.gullTimer.due(now, 0.1)) {
      if (day > 0.3 && e.rain < 0.5) this.gull(Math.max(now, this.gullTimer.next) + 0.05, calm);
      this.gullTimer.schedule(now, 14 + this.rnd() * 28);
    }
    if (this.birdTimer.due(now, 0.1)) {
      const morning = smoothstep(5.5, 6.5, e.timeOfDay) * (1 - smoothstep(9.5, 11.5, e.timeOfDay));
      if (morning > 0.3 && e.rain < 0.4) this.songbird(Math.max(now, this.birdTimer.next) + 0.05, calm);
      this.birdTimer.schedule(now, 6 + this.rnd() * 14);
    }
    if (this.geckoTimer.due(now, 0.1)) {
      if (night > 0.8) this.gecko(Math.max(now, this.geckoTimer.next) + 0.05, calm);
      this.geckoTimer.schedule(now, 35 + this.rnd() * 60);
    }

    // --- notte ---
    if (night > 0.02 && !this.night) this.night = this.buildNight(now);
    this.night?.gain.set(night * (1 - 0.6 * e.rain), now);

    // --- long-tail ---
    if (dt > 0) {
      const v = clamp((e.boat - this.prevBoat) / dt, -1, 1);
      this.boatVel += (v - this.boatVel) * Math.min(1, dt * 2.5);
    }
    this.prevBoat = e.boat;
    if (e.boat > 0.01 && !this.boat) {
      this.boat = this.buildBoat(now);
      this.boatSide = this.rnd() < 0.5 ? -1 : 1;
    }
    if (this.boat) {
      // doppler: in avvicinamento il motore sale di tono, in allontanamento scende
      const doppler = 1 + clamp(this.boatVel * 0.55, -0.08, 0.08);
      const f = 44 * doppler * (1 + 0.12 * e.boat);
      this.boat.freq1.set(f, now);
      this.boat.freq2.set(f * 1.006, now);
      this.boat.gain.set(Math.pow(e.boat, 1.6) * 0.42, now);
      this.boat.lp.set(350 + 2600 * e.boat * e.boat, now);
      const side = this.boatVel >= 0 ? this.boatSide : -this.boatSide;
      this.boat.pan.set(side * (1 - e.boat) * 0.75, now);
      if (e.boat <= 0.001 && Math.abs(this.boatVel) < 0.002) this.boatSide = this.rnd() < 0.5 ? -1 : 1;
    }

    // --- folla ---
    if (e.crowd > 0.01 && !this.crowd) this.crowd = this.buildCrowd(now);
    this.crowd?.gains[0].set(e.crowd * 0.42, now);

    // --- pioggia ---
    if (e.rain > 0.01 && !this.rain) this.rain = this.buildRain(now);
    if (this.rain) {
      this.rain.gains[0].set(Math.pow(e.rain, 1.3) * 0.16, now);
      this.rain.gains[1].set(e.rain * 0.3, now);
      this.rain.gains[2].set(e.rain * (0.25 + 0.75 * e.indoors) * 0.4, now);
    }
    if (this.thunderTimer.due(now, 0.1)) {
      if (e.rain > 0.55) {
        const t = Math.max(now, this.thunderTimer.next) + 0.05;
        const ev = this.eventKit((this.rnd() * 2 - 1) * 0.5, 0.35 + this.rnd() * 0.5);
        ev.done(playSfx(this.ctx, ev.k.out, 'thunder', t, this.rnd, { pitch: 0.8 + this.rnd() * 0.3 }));
        this.stats.thunders++;
      }
      this.thunderTimer.schedule(now, (28 + this.rnd() * 50) / Math.max(0.55, e.rain));
    }
  }

  // --- mare -------------------------------------------------------------------------------

  /** Un'onda: il corpo cresce e si apre, frange, poi la schiuma risale la sabbia e si ritira. */
  private scheduleWave(t: number): void {
    const r = this.rnd;
    const power = 0.5 + 0.5 * r();
    const rise = 2 + 1.8 * r();
    const fall = 3 + 2.4 * r();
    const gap = r() * 1.6;
    const crash = t + rise;
    const g = this.seaGain.gain;
    g.setValueAtTime(SEA_BASE, t);
    g.exponentialRampToValueAtTime(SEA_BASE + 1.3 * power, crash);
    g.exponentialRampToValueAtTime(SEA_BASE, crash + fall);
    const f = this.seaLp.frequency;
    f.setValueAtTime(380, t);
    f.exponentialRampToValueAtTime(700 + 1500 * power, crash);
    f.exponentialRampToValueAtTime(380, crash + fall * 0.8);
    const fg = this.foamGain.gain;
    fg.setValueAtTime(FOAM_BASE, t);
    fg.setValueAtTime(FOAM_BASE, crash - 0.5);
    fg.exponentialRampToValueAtTime(0.16 * power, crash + 0.35);
    fg.exponentialRampToValueAtTime(FOAM_BASE, crash + fall);
    const ff = this.foamBp.frequency;
    ff.setValueAtTime(2400, crash - 0.5);
    ff.exponentialRampToValueAtTime(5200, crash + fall);
    this.seaPan.pan.setValueAtTime(this.wavePan, t);
    this.wavePan = (r() * 2 - 1) * 0.35;
    this.seaPan.pan.linearRampToValueAtTime(this.wavePan, crash);
    this.waveT = crash + fall + gap;
    this.stats.waves++;
  }

  // --- eventi one-shot --------------------------------------------------------------------

  private eventKit(pan: number, gain: number): { k: Kit; done: (played?: Kit) => void } {
    const { ctx } = this;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.outdoor);
    const k = makeKit(ctx, g, this.rnd);
    const cleanup = (): void => {
      g.disconnect();
      p.disconnect();
    };
    return {
      k,
      // i nodi dell'evento si scollegano quando termina la sua ultima sorgente
      done: (played: Kit = k) => {
        if (played.last) played.last.addEventListener('ended', cleanup);
        else cleanup();
      },
    };
  }

  /** Serie di 2-5 richiami di gabbiano, lontani e filtrati. */
  private gull(t: number, calm: number): void {
    const { ctx } = this;
    const r = this.rnd;
    const ev = this.eventKit((r() * 2 - 1) * 0.8, (0.04 + 0.05 * r()) * calm);
    const base = 1250 * (0.85 + r() * 0.4);
    const n = 2 + Math.floor(r() * 4);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const len = 0.2 + r() * 0.2 + i * 0.02;
      const f = base * (1 - i * 0.035);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 0.8, tt);
      osc.frequency.exponentialRampToValueAtTime(f * 1.4, tt + 0.05);
      osc.frequency.exponentialRampToValueAtTime(f * 0.78, tt + len);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2300;
      bp.Q.value = 2.2;
      const gn = ctx.createGain();
      const end = envelope(gn.gain, tt, 0.03, len * 0.35, len * 0.65, 1 - i * 0.12);
      osc.connect(bp);
      bp.connect(gn);
      gn.connect(ev.k.out);
      osc.start(tt);
      osc.stop(end + 0.01);
      finish(ev.k, osc, end, [bp, gn]);
      tt += len + 0.1 + i * 0.03 + r() * 0.05;
    }
    ev.done();
    this.stats.gulls++;
  }

  /** Uccellino tropicale del mattino: breve frase di fischi con glissati. */
  private songbird(t: number, calm: number): void {
    const r = this.rnd;
    const ev = this.eventKit((r() * 2 - 1) * 0.9, (0.025 + 0.03 * r()) * calm);
    const n = 3 + Math.floor(r() * 4);
    let tt = t;
    let f = 2600 + r() * 1200;
    for (let i = 0; i < n; i++) {
      const len = 0.05 + r() * 0.08;
      const f1 = f * (r() < 0.5 ? 1.25 : 0.8);
      tone(ev.k, tt, { f, f1, sweep: len, a: 0.008, h: len * 0.5, d: len * 0.6, g: 0.8 });
      tt += len + 0.05 + r() * 0.07;
      f = clamp(f * (0.85 + r() * 0.35), 2200, 4600);
    }
    ev.done();
    this.stats.birds++;
  }

  /** Geco tokay: "tok-kè… tok-kè…" che rallenta e si spegne. */
  private gecko(t: number, calm: number): void {
    const r = this.rnd;
    const ev = this.eventKit((r() * 2 - 1) * 0.7, 0.05 * calm);
    const n = 4 + Math.floor(r() * 3);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const g = 1 - i * 0.12;
      tone(ev.k, tt, { type: 'sawtooth', f: 640, f1: 560, a: 0.006, d: 0.09, g, lp: 1500 });
      tone(ev.k, tt + 0.16, { type: 'sawtooth', f: 470, f1: 390, a: 0.02, h: 0.07, d: 0.14, g: g * 0.8, lp: 1200 });
      tt += 0.75 + i * 0.07;
    }
    ev.done();
    this.stats.geckos++;
  }

  // --- strati costruiti al primo uso ------------------------------------------------------

  private buildNight(now: number): NightLayer {
    const { ctx } = this;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.outdoor);
    nodes.push(out);
    const cricket = (hz: number, loop: number, pulses: number, pulseHz: number, groups: number, pan: number, gain: number): void => {
      const env = ctx.createBufferSource();
      env.buffer = bufferFrom(ctx, renderChirpEnvelope(8000, loop, pulses, pulseHz, groups), 8000);
      env.loop = true;
      const osc = ctx.createOscillator();
      osc.frequency.value = hz;
      const am = ctx.createGain();
      am.gain.value = 0;
      env.connect(am.gain);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(am);
      am.connect(g);
      g.connect(p);
      p.connect(out);
      env.start(now, this.rnd() * loop);
      osc.start(now);
      nodes.push(am, p, g);
      sources.push(env, osc);
    };
    cricket(4350, 1.9, 3, 58, 2, -0.6, 0.17);
    cricket(3920, 2.7, 4, 47, 3, 0.55, 0.13);
    cricket(5100, 3.3, 2, 64, 5, 0.15, 0.07);
    // insetti tropicali: banda stretta e acuta, con tremolo veloce e respiro lento
    const src = noiseSource(ctx, 'white');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 6900;
    bp.Q.value = 9;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const tremLfo = ctx.createOscillator();
    tremLfo.frequency.value = 86;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.5;
    tremLfo.connect(tremDepth);
    tremDepth.connect(trem.gain);
    const swell = ctx.createGain();
    swell.gain.value = 0.09;
    const swellLfo = ctx.createOscillator();
    swellLfo.frequency.value = 0.11;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.06;
    swellLfo.connect(swellDepth);
    swellDepth.connect(swell.gain);
    src.connect(bp);
    bp.connect(trem);
    trem.connect(swell);
    swell.connect(out);
    src.start(now, this.rnd() * 2);
    tremLfo.start(now);
    swellLfo.start(now);
    nodes.push(bp, trem, tremDepth, swell, swellDepth);
    sources.push(src, tremLfo, swellLfo);
    this.stats.layers.push('night');
    return { gain: new Smooth(out.gain, 1.2), nodes, sources };
  }

  private buildBoat(now: number): BoatLayer {
    const { ctx } = this;
    // monocilindrico della long-tail: dente di sega alla frequenza di scoppio + sub-armonica,
    // e rumore di scarico "tagliato" dagli scoppi stessi
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 44;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 44.3;
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    // niente infrasuoni: sotto gli 80 Hz il motore toglierebbe solo margine al mix
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 85;
    hp.Q.value = 0.6;
    const wob = ctx.createOscillator();
    wob.frequency.value = 0.7;
    const wobDepth = ctx.createGain();
    wobDepth.gain.value = 1.1;
    wob.connect(wobDepth);
    wobDepth.connect(o1.frequency);
    const exhaust = noiseSource(ctx, 'pink');
    const exBp = ctx.createBiquadFilter();
    exBp.type = 'bandpass';
    exBp.frequency.value = 1100;
    exBp.Q.value = 1.1;
    const chop = ctx.createGain();
    chop.gain.value = 1.1;
    const chopDepth = ctx.createGain();
    chopDepth.gain.value = 1.1;
    o1.connect(chopDepth);
    chopDepth.connect(chop.gain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    lp.Q.value = 0.7;
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = ctx.createStereoPanner();
    o1.connect(hp);
    o2.connect(g2);
    g2.connect(hp);
    hp.connect(lp);
    exhaust.connect(exBp);
    exBp.connect(chop);
    chop.connect(lp);
    lp.connect(out);
    out.connect(pan);
    pan.connect(this.outdoor);
    o1.start(now);
    o2.start(now);
    wob.start(now);
    exhaust.start(now, this.rnd() * 2);
    this.stats.layers.push('boat');
    return {
      freq1: new Smooth(o1.frequency, 0.15, 0.001),
      freq2: new Smooth(o2.frequency, 0.15, 0.001),
      gain: new Smooth(out.gain, 0.25, 0.002),
      lp: new Smooth(lp.frequency, 0.3, 0.01),
      pan: new Smooth(pan.pan, 0.4, 0.01),
      nodes: [g2, hp, wobDepth, exBp, chop, chopDepth, lp, out, pan],
      sources: [o1, o2, wob, exhaust],
    };
  }

  private buildCrowd(now: number): GainLayer {
    const { ctx } = this;
    const buf = bufferFrom(ctx, renderBabble(16000, 7, 6, 0xc0ffee), 16000);
    const out = ctx.createGain();
    out.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 240;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    hp.connect(lp);
    lp.connect(out);
    out.connect(this.outdoor);
    const nodes: AudioNode[] = [out, hp, lp];
    const sources: AudioScheduledSourceNode[] = [];
    // due letture dello stesso loop, sfasate e a velocità diverse: la folla sembra più numerosa
    for (const [rate, pan, offset] of [[1, -0.45, 0], [0.91, 0.5, 3.1]] as [number, number, number][]) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rate;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      src.connect(p);
      p.connect(hp);
      src.start(now, offset);
      nodes.push(p);
      sources.push(src);
    }
    this.stats.layers.push('crowd');
    return { gains: [new Smooth(out.gain, 0.6, 0.003)], nodes, sources };
  }

  private buildRain(now: number): GainLayer {
    const { ctx } = this;
    // scroscio: due letture decorrelate dello stesso rumore, una per lato, in una banda non troppo acuta
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0;
    hissGain.connect(this.outdoor);
    const hissNodes: AudioNode[] = [];
    const hissSources: AudioScheduledSourceNode[] = [];
    for (const side of [-1, 1]) {
      const src = noiseSource(ctx, 'white');
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 4200 + side * 300;
      bp.Q.value = 0.45;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 8500;
      const p = ctx.createStereoPanner();
      p.pan.value = side * 0.8;
      src.connect(bp);
      bp.connect(lp);
      lp.connect(p);
      p.connect(hissGain);
      src.start(now, this.rnd() * 2);
      hissNodes.push(bp, lp, p);
      hissSources.push(src);
    }
    const body = noiseSource(ctx, 'pink');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 0.4;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0;
    body.connect(bp);
    bp.connect(bodyGain);
    bodyGain.connect(this.outdoor);
    const patter = ctx.createBufferSource();
    patter.buffer = bufferFrom(ctx, renderPatter(22050, 4, 0xd40b5), 22050);
    patter.loop = true;
    const patterGain = ctx.createGain();
    patterGain.gain.value = 0;
    patter.connect(patterGain);
    patterGain.connect(this.direct);
    body.start(now, this.rnd() * 2);
    patter.start(now, this.rnd() * 3);
    this.stats.layers.push('rain');
    return {
      gains: [new Smooth(hissGain.gain, 0.5, 0.003), new Smooth(bodyGain.gain, 0.5, 0.003), new Smooth(patterGain.gain, 0.5, 0.003)],
      nodes: [...hissNodes, hissGain, bp, bodyGain, patterGain],
      sources: [...hissSources, body, patter],
    };
  }

  dispose(): void {
    const layers = [this.night, this.boat, this.crowd, this.rain];
    for (const l of layers) {
      if (!l) continue;
      for (const s of l.sources) {
        s.stop();
        s.disconnect();
      }
      for (const n of l.nodes) n.disconnect();
    }
    for (const s of this.sources) {
      s.stop();
      s.disconnect();
    }
    for (const n of this.persistent) n.disconnect();
    this.night = this.boat = this.crowd = this.rain = null;
  }
}
