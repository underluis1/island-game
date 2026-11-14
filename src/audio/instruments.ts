/**
 * Strumenti della musica procedurale: corde pizzicate/percosse Karplus-Strong (khim, nylon), ranat,
 * piano elettrico FM, pad, basso, flauto khlui, campane, percussioni; più i buffer generati
 * proceduralmente (risposta all'impulso del riverbero, crackle lo-fi).
 *
 * Il Karplus-Strong è pre-renderizzato in AudioBuffer (uno per nota, in cache): un anello di ritardo
 * dentro al grafo Web Audio non scende sotto i 128 campioni, quindi non potrebbe intonare le note acute.
 */
import {
  type Kit,
  type Rnd,
  click,
  envelope,
  finish,
  fm,
  modal,
  mtof,
  mulberry,
  noise,
  tone,
} from './common';
import type { DrumKind } from './music-theory';

// ---------------------------------------------------------------------------------------------
// Karplus-Strong
// ---------------------------------------------------------------------------------------------

const KS_RATE = 32000;

/** Aggiunge a `out` una corda pizzicata intonata con precisione (ritardo frazionario all-pass). */
export function ksString(
  out: Float32Array,
  sr: number,
  freq: number,
  t60: number,
  bright: number,
  gain: number,
  rnd: Rnd,
): void {
  const period = sr / freq;
  const w = (2 * Math.PI * freq) / sr;
  // filtro di perdita: media pesata di due campioni; il suo ritardo di fase alla fondamentale
  // va tolto dalla lunghezza dell'anello, altrimenti la nota cala
  const b = 0.5 - 0.36 * bright;
  const lpDelay = Math.atan2(b * Math.sin(w), 1 - b + b * Math.cos(w)) / w;
  let n = Math.floor(period - lpDelay - 0.1);
  if (n < 2) n = 2;
  // la parte frazionaria del ritardo la fa un all-pass del primo ordine, accordato sulla fondamentale
  const frac = period - lpDelay - n;
  const c = Math.sin(((1 - frac) * w) / 2) / Math.sin(((1 + frac) * w) / 2);
  const ring = new Float32Array(n);
  // eccitazione: rumore ammorbidito (plettro/martelletto) senza componente continua
  let lp = 0;
  let mean = 0;
  const soft = 0.25 + 0.7 * bright;
  for (let i = 0; i < n; i++) {
    lp += soft * (rnd() * 2 - 1 - lp);
    ring[i] = lp;
    mean += lp;
  }
  mean /= n;
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    ring[i] -= mean;
    peak = Math.max(peak, Math.abs(ring[i]));
  }
  for (let i = 0; i < n; i++) ring[i] /= peak;
  const loopGain = Math.pow(0.001, 1 / (freq * t60));
  let p = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < out.length; i++) {
    const x = ring[p];
    const l = (1 - b) * x + b * prev;
    prev = x;
    const ap = c * l + apX - c * apY;
    apX = l;
    apY = ap;
    ring[p] = ap * loopGain;
    out[i] += x * gain;
    p++;
    if (p >= n) p = 0;
  }
}

export type StringKind = 'khim' | 'nylon';

/** Rende i campioni di una nota pizzicata (funzione pura, testabile in Node). */
export function renderString(kind: StringKind, midi: number, sr = KS_RATE): Float32Array {
  const f = mtof(midi);
  const rnd = mulberry(0x5eed + midi * 131 + (kind === 'khim' ? 7 : 0));
  const t60 = Math.min(2.8, Math.max(0.9, 2.7 - (midi - 60) * 0.035)) * (kind === 'khim' ? 1 : 0.75);
  const len = Math.floor(sr * Math.min(1.9, t60 * 0.8));
  const data = new Float32Array(len);
  if (kind === 'khim') {
    // coro di tre corde d'ottone quasi all'unisono, percosse: brillante, con battimenti lenti
    ksString(data, sr, f, t60, 0.85, 0.5, rnd);
    ksString(data, sr, f * 1.0019, t60 * 0.9, 0.8, 0.36, rnd);
    ksString(data, sr, f * 0.9985, t60 * 0.85, 0.75, 0.3, rnd);
  } else {
    ksString(data, sr, f, t60, 0.55, 0.9, rnd);
  }
  let peak = 1e-6;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
  const fade = Math.floor(sr * 0.04);
  const attack = Math.floor(sr * 0.0012);
  for (let i = 0; i < len; i++) {
    let g = 0.9 / peak;
    if (i < attack) g *= i / attack;
    if (i > len - fade) g *= (len - i) / fade;
    data[i] *= g;
  }
  return data;
}

const stringCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

function stringBuffer(ctx: BaseAudioContext, kind: StringKind, midi: number): AudioBuffer {
  let map = stringCache.get(ctx);
  if (!map) {
    map = new Map();
    stringCache.set(ctx, map);
  }
  const key = `${kind}:${midi}`;
  let buf = map.get(key);
  if (!buf) {
    const data = renderString(kind, midi);
    buf = ctx.createBuffer(1, data.length, KS_RATE);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    map.set(key, buf);
  }
  return buf;
}

/** Corda pizzicata/percossa. `dur` (s) smorza la nota al rilascio; senza, risuona libera. */
export function pluckString(k: Kit, t: number, kind: StringKind, midi: number, g: number, dur?: number): void {
  const { ctx } = k;
  const buf = stringBuffer(ctx, kind, Math.round(midi));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gn = ctx.createGain();
  g = Math.max(1e-4, g);
  gn.gain.setValueAtTime(g, t);
  let end = t + buf.duration;
  if (dur !== undefined && dur + 0.25 < buf.duration) {
    end = t + dur + 0.25;
    gn.gain.setValueAtTime(g, t + dur);
    gn.gain.exponentialRampToValueAtTime(g * 0.001, end - 0.005);
    gn.gain.linearRampToValueAtTime(0, end);
  }
  src.connect(gn);
  gn.connect(k.out);
  src.start(t);
  src.stop(end + 0.01);
  finish(k, src, end, [gn]);
}

// ---------------------------------------------------------------------------------------------
// Strumenti a oscillatori
// ---------------------------------------------------------------------------------------------

/** ranat / marimba: legno percosso */
export function marimba(k: Kit, t: number, midi: number, g: number): void {
  const f = mtof(midi);
  const d = Math.max(0.18, 0.5 - (midi - 60) * 0.008);
  tone(k, t, { f, a: 0.002, d, g });
  tone(k, t, { f: f * 3.97, a: 0.001, d: d * 0.22, g: g * 0.4 });
  tone(k, t, { f: f * 9.2, a: 0.001, d: 0.03, g: g * 0.12 });
  noise(k, t, { type: 'bandpass', f: 2800, q: 0.8, a: 0.001, d: 0.014, g: g * 0.5 });
}

/** piano elettrico morbido (FM 1:1 + "tine") */
export function rhodes(k: Kit, t: number, midi: number, g: number, dur: number): void {
  const f = mtof(midi);
  const d = Math.max(0.5, dur * 1.3);
  fm(k, t, { f, ratio: 1, idx: 0.8 + g * 3, idxD: 0.35, idxEnd: 0.15, a: 0.005, h: dur * 0.3, d, g });
  tone(k, t, { f: f * 4, a: 0.002, d: 0.12, g: g * 0.2 });
}

/** accordo in levare, corto e smorzato */
export function skank(k: Kit, t: number, midi: number, g: number): void {
  fm(k, t, { type: 'triangle', f: mtof(midi), ratio: 2, idx: 0.6, idxD: 0.06, idxEnd: 0.2, a: 0.003, d: 0.16, g: g * 1.4 });
}

/** campana morbida FM */
export function bell(k: Kit, t: number, midi: number, g: number, d = 2.2): void {
  const f = mtof(midi);
  fm(k, t, { f, ratio: 3.5, idx: 1.0, idxD: 0.35, idxEnd: 0.04, a: 0.004, d, g });
  tone(k, t, { f: f * 2.0, a: 0.004, d: d * 0.4, g: g * 0.18 });
}

/** pad caldo: due oscillatori scordati in un passa-basso, attacco e rilascio lenti */
export function pad(k: Kit, t: number, midi: number, g: number, dur: number, cutoff: number): void {
  const { ctx } = k;
  const f = mtof(midi);
  const a = Math.min(1.1, dur * 0.35);
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.Q.value = 0.4;
  fl.frequency.setValueAtTime(cutoff * 0.7, t);
  fl.frequency.linearRampToValueAtTime(cutoff, t + a);
  const gn = ctx.createGain();
  const end = envelope(gn.gain, t, a, Math.max(0, dur - a), 1.8, g);
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  o1.type = 'triangle';
  o2.type = 'sawtooth';
  o1.frequency.value = f;
  o2.frequency.value = f;
  o1.detune.value = -5;
  o2.detune.value = 6;
  g2.gain.value = 0.32;
  o1.connect(fl);
  o2.connect(g2);
  g2.connect(fl);
  fl.connect(gn);
  gn.connect(k.out);
  o1.start(t);
  o2.start(t);
  o1.stop(end + 0.01);
  o2.stop(end + 0.01);
  finish(k, o1, end, [o2, g2, fl, gn]);
}

/** basso morbido: fondamentale sinusoidale + un filo di triangolare */
export function bass(k: Kit, t: number, midi: number, g: number, dur: number, punch: number): void {
  const f = mtof(midi);
  tone(k, t, { f, a: 0.008, h: dur * 0.55, d: 0.28, g });
  tone(k, t, { type: 'triangle', f, a: 0.006, h: dur * 0.3, d: 0.2, g: g * (0.2 + punch * 0.25), lp: 520 });
  if (punch > 0) tone(k, t, { f: f * 2, f1: f, sweep: 0.03, a: 0.002, d: 0.05, g: g * punch * 0.3 });
}

/** flauto khlui: triangolare con vibrato ritardato e un velo di fiato */
export function flute(k: Kit, t: number, midi: number, g: number, dur: number): void {
  const { ctx } = k;
  const f = mtof(midi);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(f * 0.985, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.07);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.8;
  const lg = ctx.createGain();
  lg.gain.setValueAtTime(0, t + 0.12);
  lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.5);
  lfo.connect(lg);
  lg.connect(osc.frequency);
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.value = Math.min(6000, f * 3.2);
  const gn = ctx.createGain();
  const end = envelope(gn.gain, t, 0.07, Math.max(0.02, dur - 0.07), 0.35, g);
  osc.connect(fl);
  fl.connect(gn);
  gn.connect(k.out);
  osc.start(t);
  lfo.start(t);
  osc.stop(end + 0.01);
  lfo.stop(end + 0.01);
  finish(k, osc, end, [lfo, lg, fl, gn]);
  noise(k, t, { color: 'pink', type: 'bandpass', f: f * 2, q: 1.5, a: 0.05, h: Math.max(0.02, dur - 0.1), d: 0.2, g: g * 0.22 });
}

// ---------------------------------------------------------------------------------------------
// Percussioni
// ---------------------------------------------------------------------------------------------

export function drum(k: Kit, t: number, kind: DrumKind, v: number): void {
  switch (kind) {
    case 'kick':
      tone(k, t, { f: 118, f1: 46, sweep: 0.07, a: 0.002, d: 0.3, g: 0.6 * v });
      noise(k, t, { type: 'lowpass', f: 1800, a: 0.001, d: 0.008, g: 0.2 * v });
      break;
    case 'snare':
      noise(k, t, { type: 'bandpass', f: 1900, q: 0.7, a: 0.001, d: 0.13, g: 0.5 * v });
      tone(k, t, { f: 205, f1: 165, a: 0.001, d: 0.08, g: 0.22 * v });
      break;
    case 'rim':
      tone(k, t, { f: 1750, a: 0.0008, d: 0.028, g: 0.3 * v });
      noise(k, t, { type: 'bandpass', f: 2600, q: 3, a: 0.0008, d: 0.02, g: 0.4 * v });
      tone(k, t, { f: 420, f1: 330, a: 0.001, d: 0.03, g: 0.15 * v });
      break;
    case 'hat':
      noise(k, t, { type: 'bandpass', f: 8500, q: 0.8, hp: 5000, a: 0.001, d: 0.045, g: 0.4 * v });
      break;
    case 'shaker':
      noise(k, t, { type: 'bandpass', f: 6200, q: 1.2, a: 0.012, d: 0.06, g: 0.34 * v });
      break;
    case 'ching':
      // piattini thai aperti: lasciati risuonare
      modal(k, t, { f: 2950, parts: [[1, 1, 0.6], [1.52, 0.6, 0.42], [2.14, 0.4, 0.3], [2.87, 0.25, 0.2]], g: 0.08 * v });
      break;
    case 'chap':
      // piattini chiusi: colpo smorzato
      modal(k, t, { f: 2950, parts: [[1, 1, 0.07], [1.52, 0.6, 0.05], [2.14, 0.4, 0.04]], g: 0.12 * v });
      click(k, t, 0.1 * v, 5000, 0.006);
      break;
    case 'conga_hi':
      tone(k, t, { f: 310, f1: 270, sweep: 0.05, a: 0.0015, d: 0.16, g: 0.34 * v });
      noise(k, t, { type: 'bandpass', f: 1400, q: 1, a: 0.001, d: 0.012, g: 0.14 * v });
      break;
    case 'conga_lo':
      tone(k, t, { f: 205, f1: 175, sweep: 0.06, a: 0.0015, d: 0.22, g: 0.4 * v });
      noise(k, t, { type: 'bandpass', f: 1000, q: 1, a: 0.001, d: 0.014, g: 0.14 * v });
      break;
    case 'klong':
      tone(k, t, { f: 150, f1: 95, sweep: 0.09, a: 0.002, d: 0.3, g: 0.45 * v });
      noise(k, t, { type: 'lowpass', f: 900, a: 0.001, d: 0.02, g: 0.12 * v });
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Buffer procedurali
// ---------------------------------------------------------------------------------------------

/**
 * Risposta all'impulso stereo per il riverbero a convoluzione: prime riflessioni sparse + coda di
 * rumore con decadimento esponenziale che si scurisce nel tempo (gli acuti muoiono prima).
 */
export function renderImpulse(sr: number, seconds: number, seed: number): [Float32Array, Float32Array] {
  const n = Math.floor(sr * seconds);
  const chans: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const pre = Math.floor(sr * 0.012);
  chans.forEach((data, ch) => {
    const rnd = mulberry(seed + ch * 7919);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.9 * t) / seconds);
      const coef = 0.55 - 0.47 * Math.min(1, (t / seconds) * 1.6);
      lp += coef * (rnd() * 2 - 1 - lp);
      const fadeIn = Math.min(1, t / 0.02);
      data[i] = lp * env * fadeIn;
    }
    for (let r = 0; r < 7; r++) {
      const at = pre + Math.floor(sr * (0.006 + rnd() * 0.07));
      if (at < n) data[at] += (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.3) * (1 - r * 0.08);
    }
    const fade = Math.floor(sr * 0.05);
    for (let i = n - fade; i < n; i++) data[i] *= (n - i) / fade;
  });
  return chans;
}

export function impulseBuffer(ctx: BaseAudioContext, seconds = 2.6, seed = 0xbeac4): AudioBuffer {
  const [l, r] = renderImpulse(ctx.sampleRate, seconds, seed);
  const buf = ctx.createBuffer(2, l.length, ctx.sampleRate);
  buf.copyToChannel(l as Float32Array<ArrayBuffer>, 0);
  buf.copyToChannel(r as Float32Array<ArrayBuffer>, 1);
  return buf;
}

/** Crackle da vinile: impulsi radi e smussati su un filo di fruscio. */
export function crackleBuffer(ctx: BaseAudioContext, seconds = 5): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const data = new Float32Array(n);
  const rnd = mulberry(0xc4ac41e);
  const p = 11 / sr;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    let x = (rnd() * 2 - 1) * 0.012;
    if (rnd() < p) x += (rnd() < 0.5 ? -1 : 1) * Math.pow(rnd(), 3) * 0.9;
    lp += 0.4 * (x - lp);
    data[i] = lp;
  }
  const buf = ctx.createBuffer(1, n, sr);
  buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return buf;
}
