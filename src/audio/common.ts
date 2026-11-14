/**
 * Primitive di sintesi condivise. Tutto funziona su un `BaseAudioContext` qualsiasi
 * (AudioContext o OfflineAudioContext) e viene schedulato su tempi assoluti del contesto.
 * Ogni primitiva crea nodi one-shot che si scollegano da soli a fine suono.
 */

export type Rnd = () => number;

/** PRNG deterministico leggero (mulberry32) per variazioni timbriche riproducibili. */
export function mulberry(seed: number): Rnd {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mtof = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const clamp01 = (x: number): number => clamp(x, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Contatore diagnostico, per contesto, delle sorgenti one-shot ancora vive (test anti-leak). */
const liveCounts = new WeakMap<BaseAudioContext, { count: number }>();

export function liveCounter(ctx: BaseAudioContext): { count: number } {
  let c = liveCounts.get(ctx);
  if (!c) {
    c = { count: 0 };
    liveCounts.set(ctx, c);
  }
  return c;
}

/** Contesto di rendering di un suono one-shot. */
export interface Kit {
  ctx: BaseAudioContext;
  out: AudioNode;
  rnd: Rnd;
  /** moltiplicatore di pitch applicato a tutte le frequenze */
  pitch: number;
  /** istante in cui termina l'ultima sorgente schedulata */
  end: number;
  last: AudioScheduledSourceNode | null;
}

export function makeKit(ctx: BaseAudioContext, out: AudioNode, rnd: Rnd, pitch = 1): Kit {
  return { ctx, out, rnd, pitch, end: 0, last: null };
}

/** valore casuale uniforme in [a, b] */
export const vr = (k: Kit, a: number, b: number): number => a + (b - a) * k.rnd();

/** Registra una sorgente: a fine riproduzione scollega tutta la sua catena. */
export function finish(k: Kit, src: AudioScheduledSourceNode, stopAt: number, nodes: AudioNode[]): void {
  const live = liveCounter(k.ctx);
  live.count++;
  src.onended = () => {
    live.count--;
    src.disconnect();
    for (const n of nodes) n.disconnect();
  };
  if (stopAt > k.end) {
    k.end = stopAt;
    k.last = src;
  }
}

/**
 * Inviluppo attacco / tenuta / decadimento esponenziale (−60 dB in `d` secondi) che parte da 0 e
 * torna esattamente a 0: nessuna discontinuità. Ritorna l'istante di fine.
 */
export function envelope(p: AudioParam, t: number, a: number, h: number, d: number, peak: number): number {
  const pk = Math.max(1e-5, peak);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(pk, t + a);
  if (h > 0) p.setValueAtTime(pk, t + a + h);
  p.exponentialRampToValueAtTime(pk * 0.001, t + a + h + d);
  p.linearRampToValueAtTime(0, t + a + h + d + 0.004);
  return t + a + h + d + 0.005;
}

// ---------------------------------------------------------------------------------------------
// Buffer di rumore condivisi (uno per colore e per contesto), loop senza giunture
// ---------------------------------------------------------------------------------------------

export type NoiseColor = 'white' | 'pink' | 'brown';

const NOISE_SECONDS = 3;
const noiseCache = new WeakMap<BaseAudioContext, Partial<Record<NoiseColor, AudioBuffer>>>();

export function fillNoise(color: NoiseColor, n: number, rnd: Rnd): Float32Array {
  const fade = Math.min(2048, n >> 2);
  const raw = new Float32Array(n + fade);
  if (color === 'white') {
    for (let i = 0; i < raw.length; i++) raw[i] = rnd() * 2 - 1;
  } else if (color === 'pink') {
    // filtro di Paul Kellet
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = rnd() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.16;
      b6 = w * 0.115926;
    }
  } else {
    let y = 0;
    for (let i = 0; i < raw.length; i++) {
      y = (y + 0.02 * (rnd() * 2 - 1)) / 1.02;
      raw[i] = y * 3.5;
    }
  }
  // dissolvenza incrociata testa/coda per un loop continuo
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < fade) {
      const w = i / fade;
      out[i] = raw[i] * Math.sqrt(w) + raw[n + i] * Math.sqrt(1 - w);
    } else {
      out[i] = raw[i];
    }
  }
  return out;
}

export function noiseBuffer(ctx: BaseAudioContext, color: NoiseColor): AudioBuffer {
  let set = noiseCache.get(ctx);
  if (!set) {
    set = {};
    noiseCache.set(ctx, set);
  }
  let buf = set[color];
  if (!buf) {
    const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const seed = color === 'white' ? 0x1234abcd : color === 'pink' ? 0x51f0c0de : 0x0b0a7b0b;
    buf.copyToChannel(fillNoise(color, n, mulberry(seed)) as Float32Array<ArrayBuffer>, 0);
    set[color] = buf;
  }
  return buf;
}

/** Sorgente di rumore in loop che parte da un offset casuale (non ancora avviata). */
export function noiseSource(ctx: BaseAudioContext, color: NoiseColor): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, color);
  src.loop = true;
  return src;
}

// ---------------------------------------------------------------------------------------------
// Primitive one-shot
// ---------------------------------------------------------------------------------------------

/** [frequenza Hz, profondità 0..1, forma] */
export type AmSpec = [number, number, OscillatorType?];

function applyAm(k: Kit, t: number, end: number, input: AudioNode, am: AmSpec, nodes: AudioNode[]): AudioNode {
  const { ctx } = k;
  const g = ctx.createGain();
  g.gain.value = 1 - am[1] / 2;
  const lfo = ctx.createOscillator();
  lfo.type = am[2] ?? 'sine';
  lfo.frequency.value = am[0];
  const depth = ctx.createGain();
  depth.gain.value = am[1] / 2;
  lfo.connect(depth);
  depth.connect(g.gain);
  input.connect(g);
  lfo.start(t);
  lfo.stop(end + 0.01);
  nodes.push(g, lfo, depth);
  return g;
}

export interface ToneOpts {
  f: number;
  /** frequenza finale dello sweep esponenziale */
  f1?: number;
  /** durata dello sweep (default: d) */
  sweep?: number;
  type?: OscillatorType;
  a?: number;
  h?: number;
  /** decadimento a −60 dB */
  d: number;
  g: number;
  /** passa-basso opzionale */
  lp?: number;
  am?: AmSpec;
  out?: AudioNode;
}

export function tone(k: Kit, t: number, o: ToneOpts): void {
  const { ctx } = k;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const nodes: AudioNode[] = [g];
  osc.type = o.type ?? 'sine';
  const f = clamp(o.f * k.pitch, 10, 20000);
  osc.frequency.setValueAtTime(f, t);
  if (o.f1 !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(clamp(o.f1 * k.pitch, 10, 20000), t + (o.sweep ?? o.d));
  }
  const end = envelope(g.gain, t, o.a ?? 0.002, o.h ?? 0, o.d, o.g);
  let node: AudioNode = osc;
  if (o.lp !== undefined) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = o.lp;
    node.connect(fl);
    node = fl;
    nodes.push(fl);
  }
  if (o.am) node = applyAm(k, t, end, node, o.am, nodes);
  node.connect(g);
  g.connect(o.out ?? k.out);
  osc.start(t);
  osc.stop(end + 0.005);
  finish(k, osc, end, nodes);
}

export interface NoiseOpts {
  color?: NoiseColor;
  type?: BiquadFilterType;
  f: number;
  f1?: number;
  sweep?: number;
  q?: number;
  /** passa-alto aggiuntivo */
  hp?: number;
  a?: number;
  h?: number;
  d: number;
  g: number;
  am?: AmSpec;
  out?: AudioNode;
}

export function noise(k: Kit, t: number, o: NoiseOpts): void {
  const { ctx } = k;
  const src = noiseSource(ctx, o.color ?? 'white');
  const fl = ctx.createBiquadFilter();
  const g = ctx.createGain();
  const nodes: AudioNode[] = [fl, g];
  fl.type = o.type ?? 'bandpass';
  fl.Q.value = o.q ?? 1;
  const f = clamp(o.f * k.pitch, 20, 18000);
  fl.frequency.setValueAtTime(f, t);
  if (o.f1 !== undefined) {
    fl.frequency.exponentialRampToValueAtTime(clamp(o.f1 * k.pitch, 20, 18000), t + (o.sweep ?? o.d));
  }
  const end = envelope(g.gain, t, o.a ?? 0.001, o.h ?? 0, o.d, o.g);
  let node: AudioNode = fl;
  src.connect(fl);
  if (o.hp !== undefined) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = o.hp;
    node.connect(hp);
    node = hp;
    nodes.push(hp);
  }
  if (o.am) node = applyAm(k, t, end, node, o.am, nodes);
  node.connect(g);
  g.connect(o.out ?? k.out);
  src.start(t, k.rnd() * (NOISE_SECONDS - 0.5));
  src.stop(end + 0.005);
  finish(k, src, end, nodes);
}

/** [rapporto di frequenza, guadagno relativo, decadimento a −60 dB] */
export type Partial3 = [number, number, number];

export interface ModalOpts {
  f: number;
  parts: Partial3[];
  g: number;
  a?: number;
  out?: AudioNode;
}

/** Risonatore modale: somma di sinusoidi smorzate (metallo, vetro, campanelli). */
export function modal(k: Kit, t: number, o: ModalOpts): void {
  const { ctx } = k;
  for (const [ratio, gain, decay] of o.parts) {
    const f = o.f * ratio * k.pitch;
    if (f > 17500 || f < 20) continue;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = f;
    const end = envelope(g.gain, t, o.a ?? 0.001, 0, decay, o.g * gain);
    osc.connect(g);
    g.connect(o.out ?? k.out);
    osc.start(t);
    osc.stop(end + 0.005);
    finish(k, osc, end, [g]);
  }
}

export interface FmOpts {
  f: number;
  ratio: number;
  /** indice di modulazione iniziale */
  idx: number;
  /** tempo di decadimento dell'indice */
  idxD: number;
  /** indice residuo (frazione di idx) */
  idxEnd?: number;
  type?: OscillatorType;
  a?: number;
  h?: number;
  d: number;
  g: number;
  f1?: number;
  sweep?: number;
  out?: AudioNode;
}

/** FM a due operatori con indice che decade (campane morbide, piano elettrico, zap). */
export function fm(k: Kit, t: number, o: FmOpts): void {
  const { ctx } = k;
  const f = clamp(o.f * k.pitch, 10, 16000);
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const mg = ctx.createGain();
  const g = ctx.createGain();
  car.type = o.type ?? 'sine';
  car.frequency.setValueAtTime(f, t);
  mod.frequency.setValueAtTime(f * o.ratio, t);
  if (o.f1 !== undefined) {
    const f1 = clamp(o.f1 * k.pitch, 10, 16000);
    car.frequency.exponentialRampToValueAtTime(f1, t + (o.sweep ?? o.d));
    mod.frequency.exponentialRampToValueAtTime(f1 * o.ratio, t + (o.sweep ?? o.d));
  }
  const dev = Math.max(0.01, o.idx * f * o.ratio);
  mg.gain.setValueAtTime(dev, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(0.001, dev * (o.idxEnd ?? 0.05)), t + o.idxD);
  const end = envelope(g.gain, t, o.a ?? 0.002, o.h ?? 0, o.d, o.g);
  mod.connect(mg);
  mg.connect(car.frequency);
  car.connect(g);
  g.connect(o.out ?? k.out);
  car.start(t);
  mod.start(t);
  car.stop(end + 0.005);
  mod.stop(end + 0.005);
  finish(k, car, end, [mod, mg, g]);
}

/**
 * Transiente secco (pochi millisecondi) centrato poco sopra `f`. È un passa-banda largo e non un
 * passa-alto: l'energia sopra i 10 kHz renderebbe i click "sputati" invece che croccanti.
 */
export function click(k: Kit, t: number, g: number, f = 3000, d = 0.006): void {
  noise(k, t, { type: 'bandpass', f: f * 1.5, q: 0.6, hp: f * 0.6, a: 0.0005, d, g: g * 1.5 });
}

/** Curva di saturazione morbida, lineare fino a `knee` poi asintotica a `ceil`. */
export function softClipCurve(knee = 0.6, ceil = 0.96, n = 2049): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + (ceil - knee) * Math.tanh((ax - knee) / (ceil - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
