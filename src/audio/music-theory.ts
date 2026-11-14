/**
 * Logica musicale pura (nessuna dipendenza da Web Audio): scale, accordi, progressioni, generatore di
 * sezioni con seed, mix dei layer in base all'ora. Testabile in Node.
 *
 * Idea compositiva: ogni sezione dura 8 battute ed è costruita su una progressione predefinita.
 * La melodia nasce da un motivo di due battute (ritmo da un banco di figure + contorno a gradi sulla
 * scala pentatonica) sviluppato come domanda/risposta: A · A' · B · A'' con cadenza e respiro finale.
 * Le sezioni seguono una forma a rondò (il tema torna, variato), così la musica è infinita ma coerente.
 */
import { RNG } from '../core/rng';

export type StyleId = 'island_lofi' | 'thai_khim' | 'sunset_ambient' | 'beach_groove';
export const STYLE_IDS: StyleId[] = ['island_lofi', 'thai_khim', 'sunset_ambient', 'beach_groove'];

export type Layer = 'melody' | 'counter' | 'keys' | 'pad' | 'bass' | 'drums' | 'perc';
export const LAYERS: Layer[] = ['melody', 'counter', 'keys', 'pad', 'bass', 'drums', 'perc'];

export type DrumKind =
  | 'kick'
  | 'snare'
  | 'rim'
  | 'hat'
  | 'shaker'
  | 'ching'
  | 'chap'
  | 'conga_lo'
  | 'conga_hi'
  | 'klong';

export const DRUM_LAYER: Record<DrumKind, Layer> = {
  kick: 'drums',
  snare: 'drums',
  rim: 'drums',
  klong: 'drums',
  hat: 'perc',
  shaker: 'perc',
  ching: 'perc',
  chap: 'perc',
  conga_lo: 'perc',
  conga_hi: 'perc',
};

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export interface NoteEvent {
  layer: Layer;
  /** battiti dall'inizio della sezione */
  beat: number;
  /** durata in battiti */
  dur: number;
  midi: number;
  vel: number;
  /** importanza 0..1: le note deboli spariscono per prime quando la densità cala */
  weight: number;
}

export interface DrumEvent {
  beat: number;
  kind: DrumKind;
  vel: number;
  weight: number;
}

export interface Chord {
  symbol: string;
  /** classe di altezza della fondamentale, relativa alla tonica */
  root: number;
  /** intervalli dalla fondamentale */
  tones: number[];
}

export interface Section {
  style: StyleId;
  material: number;
  variation: number;
  bars: number;
  beatsPerBar: number;
  /** un accordo per battuta */
  chords: Chord[];
  notes: NoteEvent[];
  drums: DrumEvent[];
  barNotes: NoteEvent[][];
  barDrums: DrumEvent[][];
}

export const PENT_MAJOR = [0, 2, 4, 7, 9];
export const PENT_MINOR = [0, 3, 5, 7, 10];
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const MINOR = [0, 2, 3, 5, 7, 8, 10];

const CHORDS: Record<string, [number, number[]]> = {
  // tonalità maggiore
  I: [0, [0, 4, 7]],
  Imaj7: [0, [0, 4, 7, 11]],
  Iadd9: [0, [0, 4, 7, 14]],
  I6: [0, [0, 4, 7, 9]],
  ii7: [2, [0, 3, 7, 10]],
  iii7: [4, [0, 3, 7, 10]],
  IV: [5, [0, 4, 7]],
  IVmaj7: [5, [0, 4, 7, 11]],
  IV6: [5, [0, 4, 7, 9]],
  V: [7, [0, 4, 7]],
  Vsus: [7, [0, 5, 7, 10]],
  vi: [9, [0, 3, 7]],
  vi7: [9, [0, 3, 7, 10]],
  // tonalità minore (naturale)
  i9: [0, [0, 3, 7, 10, 14]],
  i7: [0, [0, 3, 7, 10]],
  iv7: [5, [0, 3, 7, 10]],
  v7: [7, [0, 3, 7, 10]],
  bIIImaj7: [3, [0, 4, 7, 11]],
  bVImaj7: [8, [0, 4, 7, 11]],
  bVII: [10, [0, 4, 7]],
  bVIIadd9: [10, [0, 4, 7, 14]],
};

export function chord(symbol: string): Chord {
  const c = CHORDS[symbol];
  if (!c) throw new Error(`accordo sconosciuto: ${symbol}`);
  return { symbol, root: c[0], tones: c[1] };
}

type Rhythm = [number, number][];

export interface StyleDef {
  id: StyleId;
  bpm: number;
  /** 0..0.33: quanto vengono ritardati i levare */
  swing: number;
  /** nota MIDI della tonica */
  tonic: number;
  mode: 'major' | 'minor';
  /** battute per accordo */
  chordBars: 1 | 2;
  progressions: string[][];
  leadRange: [number, number];
  /** figure ritmiche di due battute: [battito, durata] */
  rhythms: Rhythm[];
  /** presenza di base di ogni layer */
  levels: Record<Layer, number>;
}

export const STYLES: Record<StyleId, StyleDef> = {
  island_lofi: {
    id: 'island_lofi',
    bpm: 74,
    swing: 0.16,
    tonic: 62,
    mode: 'major',
    chordBars: 1,
    progressions: [
      ['IVmaj7', 'iii7', 'ii7', 'Imaj7'],
      ['Imaj7', 'vi7', 'IVmaj7', 'Vsus'],
      ['ii7', 'Vsus', 'Imaj7', 'vi7'],
      ['IVmaj7', 'Vsus', 'iii7', 'vi7'],
    ],
    leadRange: [64, 86],
    rhythms: [
      [[0, 1], [1.5, 0.5], [2, 1.5], [4, 1], [5.5, 1.5]],
      [[0.5, 0.5], [1, 1], [2.5, 1], [4, 0.5], [4.5, 1.5]],
      [[0, 1.5], [1.5, 0.5], [2, 2], [4.5, 0.5], [5, 2]],
      [[0, 0.5], [0.5, 0.5], [1, 2], [3.5, 0.5], [4, 2.5]],
    ],
    levels: { melody: 1, counter: 0.7, keys: 1, pad: 0.8, bass: 1, drums: 1, perc: 0.9 },
  },
  thai_khim: {
    id: 'thai_khim',
    bpm: 88,
    swing: 0,
    tonic: 60,
    mode: 'major',
    chordBars: 1,
    progressions: [
      ['I', 'I', 'IV', 'I'],
      ['I', 'vi', 'IV', 'V'],
      ['I', 'IV', 'I6', 'V'],
      ['vi', 'IV', 'I', 'I'],
    ],
    leadRange: [67, 91],
    rhythms: [
      [[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1], [4, 0.5], [4.5, 0.5], [5, 0.5], [5.5, 0.5], [6, 1.5]],
      [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1], [4, 0.5], [4.5, 0.5], [5, 1], [6, 2]],
      [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 2], [4, 0.5], [4.5, 0.5], [5, 0.5], [5.5, 0.5], [6, 1.5]],
      [[0, 1.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 1], [4, 1], [5, 0.5], [5.5, 0.5], [6, 1.5]],
    ],
    levels: { melody: 1, counter: 0.8, keys: 0, pad: 0.55, bass: 0.6, drums: 0.8, perc: 1 },
  },
  sunset_ambient: {
    id: 'sunset_ambient',
    bpm: 58,
    swing: 0,
    tonic: 57,
    mode: 'minor',
    chordBars: 2,
    progressions: [
      ['i9', 'bVImaj7', 'bIIImaj7', 'bVIIadd9'],
      ['i9', 'iv7', 'bVImaj7', 'v7'],
      ['bVImaj7', 'bVIIadd9', 'i9', 'i9'],
    ],
    leadRange: [64, 84],
    rhythms: [
      [[0, 3], [4, 2], [6, 1.5]],
      [[0, 2], [2, 4]],
      [[1, 3], [5, 2.5]],
      [[0, 1.5], [1.5, 2.5], [5, 2]],
    ],
    levels: { melody: 0.9, counter: 0.6, keys: 0.7, pad: 1, bass: 0.7, drums: 0, perc: 0.5 },
  },
  beach_groove: {
    id: 'beach_groove',
    bpm: 102,
    swing: 0.08,
    tonic: 67,
    mode: 'major',
    chordBars: 1,
    progressions: [
      ['I6', 'IV6', 'I6', 'Vsus'],
      ['Imaj7', 'vi7', 'IVmaj7', 'Vsus'],
      ['IVmaj7', 'Imaj7', 'Vsus', 'Imaj7'],
      ['vi7', 'IVmaj7', 'Imaj7', 'Vsus'],
    ],
    leadRange: [67, 91],
    rhythms: [
      [[0, 0.5], [0.75, 0.5], [1.5, 0.5], [2, 1], [3.5, 0.5], [4, 0.5], [4.75, 0.5], [5.5, 1.5]],
      [[0, 0.75], [0.75, 0.75], [1.5, 1], [3, 0.5], [3.5, 0.5], [4, 0.75], [4.75, 0.75], [5.5, 1]],
      [[0.5, 0.5], [1, 0.5], [1.5, 1], [2.5, 0.5], [3, 1], [4.5, 0.5], [5, 0.5], [5.5, 1.5]],
      [[0, 1], [1, 0.5], [1.75, 0.75], [2.5, 1], [4, 0.5], [4.5, 0.5], [5, 2]],
    ],
    levels: { melody: 1, counter: 0.6, keys: 0.9, pad: 0.45, bass: 1, drums: 1, perc: 1 },
  },
};

export const SECTION_BARS = 8;
export const BEATS_PER_BAR = 4;

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function pentatonicOf(def: StyleDef): number[] {
  return def.mode === 'major' ? PENT_MAJOR : PENT_MINOR;
}

export function diatonicOf(def: StyleDef): number[] {
  return def.mode === 'major' ? MAJOR : MINOR;
}

/** Tutte le note MIDI della scala comprese in [lo, hi], in ordine crescente. */
export function ladder(tonic: number, scale: readonly number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (scale.includes(mod12(m - tonic))) out.push(m);
  return out;
}

/** Classi di altezza dell'accordo, relative alla tonica. */
export function chordPcs(c: Chord): number[] {
  return c.tones.map((iv) => mod12(c.root + iv));
}

/** Voicing stretto: le note dell'accordo ripiegate nella finestra [lo, lo+12). */
export function voicing(c: Chord, tonic: number, lo: number, maxNotes = 4): number[] {
  const set = new Set<number>();
  for (const iv of c.tones) {
    let m = tonic + c.root + iv;
    while (m < lo) m += 12;
    while (m >= lo + 12) m -= 12;
    set.add(m);
  }
  return [...set].sort((a, b) => a - b).slice(0, maxNotes);
}

export function bassRoot(c: Chord, tonic: number, lo = 33): number {
  let m = tonic + c.root;
  while (m >= lo + 12) m -= 12;
  while (m < lo) m += 12;
  return m;
}

export function hashInts(...vals: number[]): number {
  let h = 2166136261 >>> 0;
  for (const v of vals) {
    let x = v | 0;
    for (let i = 0; i < 4; i++) {
      h ^= x & 0xff;
      h = Math.imul(h, 16777619);
      x >>>= 8;
    }
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0 || 1;
}

// ---------------------------------------------------------------------------------------------
// Forma: quale materiale suona alla sezione n
// ---------------------------------------------------------------------------------------------

const FORM = [0, 0, 1, 0, 2, 0, 1, 3];

/**
 * Forma a rondò: il tema (slot 0) torna a ogni giro e cambia solo ogni due giri; gli episodi
 * (slot 1..3) si rinnovano a ogni giro. `variation` conta le ripetizioni già sentite dello stesso
 * materiale: 0 = esposizione letterale, >0 = ripresa variata.
 */
export function planSection(index: number): { material: number; variation: number } {
  const materialAt = (i: number): number => {
    const cycle = Math.floor(i / FORM.length);
    const slot = FORM[i % FORM.length];
    return slot === 0 ? Math.floor(cycle / 2) * 100 : 1000 + cycle * 10 + slot;
  };
  const material = materialAt(index);
  const windowStart = Math.floor(index / (FORM.length * 2)) * FORM.length * 2;
  let variation = 0;
  for (let i = windowStart; i < index; i++) if (materialAt(i) === material) variation++;
  return { material, variation };
}

// ---------------------------------------------------------------------------------------------
// Generatore di sezioni
// ---------------------------------------------------------------------------------------------

interface Motif {
  rhythm: Rhythm;
  /** passi sulla scala (in gradini della pentatonica) rispetto alla nota precedente */
  steps: number[];
}

function makeMotif(rng: RNG, rhythms: Rhythm[], avoid?: Rhythm): Motif {
  let rhythm = rng.pick(rhythms);
  if (avoid && rhythm === avoid && rhythms.length > 1) {
    rhythm = rhythms[(rhythms.indexOf(rhythm) + 1) % rhythms.length];
  }
  const n = rhythm.length;
  const steps = [0];
  for (let i = 1; i < n; i++) {
    // contorno ad arco: si sale nella prima parte, si scende nella seconda
    const rising = i < n * 0.55;
    const dir = rng.chance(0.72) ? (rising ? 1 : -1) : rising ? -1 : 1;
    const r = rng.next();
    const mag = r < 0.58 ? 1 : r < 0.84 ? 2 : r < 0.94 ? 0 : 3;
    steps.push(dir * mag);
  }
  return { rhythm, steps };
}

function reflect(i: number, n: number): number {
  if (n <= 1) return 0;
  let x = i;
  while (x < 0 || x > n - 1) {
    if (x < 0) x = -x;
    if (x > n - 1) x = 2 * (n - 1) - x;
  }
  return x;
}

/** Indice della scala più vicino a `idx` la cui classe di altezza appartiene all'accordo. */
function snapToChord(idx: number, lad: number[], pcs: number[], tonic: number, reach = 2): number {
  for (let d = 0; d <= reach; d++) {
    for (const s of d === 0 ? [0] : [-d, d]) {
      const j = idx + s;
      if (j >= 0 && j < lad.length && pcs.includes(mod12(lad[j] - tonic))) return j;
    }
  }
  return idx;
}

function melodyWeight(beat: number, dur: number): number {
  const frac = beat % 1;
  if (beat % 4 === 0) return 1;
  if (dur >= 1.5) return 0.9;
  if (frac === 0) return 0.7;
  if (frac === 0.5) return 0.45;
  return 0.3;
}

function buildMelody(def: StyleDef, chords: Chord[], rng: RNG, vrng: RNG | null): NoteEvent[] {
  const lad = ladder(def.tonic, pentatonicOf(def), def.leadRange[0], def.leadRange[1]);
  const mid = Math.floor(lad.length * 0.45);
  const base = snapToChord(mid + rng.int(-1, 1), lad, chordPcs(chords[0]), def.tonic);
  const m1 = makeMotif(rng, def.rhythms);
  const m2 = makeMotif(rng, def.rhythms, m1.rhythm);
  // risposta: stesso ritmo, coda diversa
  const answer: Motif = { rhythm: m1.rhythm, steps: m1.steps.slice() };
  for (let i = Math.max(1, answer.steps.length - 2); i < answer.steps.length; i++) {
    answer.steps[i] = rng.pick([-2, -1, -1, 1, 1, 2]);
  }
  const lift = vrng && vrng.chance(0.3) ? 3 : 2;
  const units: { motif: Motif; base: number; cadence: boolean }[] = [
    { motif: m1, base, cadence: false },
    { motif: answer, base, cadence: false },
    { motif: m2, base: base + lift, cadence: false },
    { motif: m1, base, cadence: true },
  ];
  const out: NoteEvent[] = [];
  units.forEach((u, ui) => {
    const { rhythm, steps } = u.motif;
    const count = u.cadence ? Math.max(2, Math.ceil(rhythm.length * 0.6)) : rhythm.length;
    let idx = u.base;
    for (let i = 0; i < count; i++) {
      idx = reflect(idx + steps[i], lad.length);
      const beat = rhythm[i][0];
      let dur = rhythm[i][1];
      const last = i === count - 1;
      const abs = ui * 8 + beat;
      const bar = Math.min(chords.length - 1, Math.floor(abs / BEATS_PER_BAR));
      let j = idx;
      if (u.cadence && last) {
        // cadenza: nota lunga su un suono dell'accordo finale, poi silenzio (il "respiro")
        j = snapToChord(idx, lad, [chordPcs(chords[bar])[0], 0], def.tonic, 3);
        dur = Math.max(dur, Math.min(3, 7 - beat));
      } else if (beat % 4 === 0 || dur >= 1.5) {
        j = snapToChord(idx, lad, chordPcs(chords[bar]), def.tonic, 1);
      }
      idx = j;
      const accent = beat % 4 === 0 ? 0.14 : beat % 1 === 0 ? 0.05 : 0;
      out.push({
        layer: 'melody',
        beat: abs,
        dur,
        midi: lad[j],
        vel: Math.min(1, 0.66 + accent + rng.range(-0.06, 0.06)),
        weight: i === 0 || (u.cadence && last) ? 1 : melodyWeight(beat, dur),
      });
    }
  });
  if (!vrng) return out;
  // ripresa variata: qualche nota debole cade, qualche nota lunga riceve un'acciaccatura
  const varied: NoteEvent[] = [];
  for (const n of out) {
    if (n.weight < 0.6 && vrng.chance(0.14)) continue;
    if (n.dur >= 1 && n.beat >= 0.25 && n.weight < 1 && vrng.chance(0.18)) {
      const i = lad.indexOf(n.midi);
      const g = reflect(i + (vrng.chance(0.5) ? 1 : -1), lad.length);
      varied.push({ layer: 'melody', beat: n.beat - 0.25, dur: 0.25, midi: lad[g], vel: n.vel * 0.6, weight: 0.25 });
    }
    varied.push(n);
  }
  return varied;
}

function buildCounter(def: StyleDef, chords: Chord[], rng: RNG): NoteEvent[] {
  const out: NoteEvent[] = [];
  const pent = pentatonicOf(def);
  const hi = ladder(def.tonic, pent, def.leadRange[0] + 7, def.leadRange[1] + 5);
  const midLad = ladder(def.tonic, pent, def.leadRange[0] - 7, def.leadRange[1] - 7);
  const chordIdx = (lad: number[], c: Chord): number[] => {
    const pcs = chordPcs(c);
    const idx: number[] = [];
    lad.forEach((m, i) => {
      if (pcs.includes(mod12(m - def.tonic))) idx.push(i);
    });
    return idx.length ? idx : lad.map((_, i) => i);
  };
  for (let bar = 0; bar < SECTION_BARS; bar++) {
    const c = chords[bar];
    const b0 = bar * BEATS_PER_BAR;
    if (def.id === 'thai_khim') {
      // accompagnamento a crome spezzate, alla maniera del ranat
      const ci = chordIdx(midLad, c);
      const anchor = ci[Math.min(ci.length - 1, Math.floor(ci.length / 2))];
      const shape = bar % 2 === 0 ? [0, 2, 1, 2, 0, 2, 1, 3] : [0, 1, 2, 1, 3, 2, 1, 0];
      shape.forEach((s, i) => {
        out.push({
          layer: 'counter',
          beat: b0 + i * 0.5,
          dur: 0.5,
          midi: midLad[reflect(anchor + s, midLad.length)],
          vel: i % 2 === 0 ? 0.42 : 0.3,
          weight: i % 4 === 0 ? 0.7 : i % 2 === 0 ? 0.5 : 0.32,
        });
      });
    } else if (bar % 2 === 1) {
      // risposta negli spazi lasciati dalla melodia
      const ci = chordIdx(hi, c);
      const start = rng.int(0, Math.max(0, ci.length - 3));
      const beats =
        def.id === 'sunset_ambient' ? [1, 3] : def.id === 'beach_groove' && bar === 7 ? [2, 2.5, 3, 3.5] : [2.5, 3, 3.5];
      const down = rng.chance(0.35);
      beats.forEach((b, i) => {
        const pos = down ? beats.length - 1 - i : i;
        out.push({
          layer: 'counter',
          beat: b0 + b,
          dur: def.id === 'sunset_ambient' ? 2 : 0.5,
          midi: hi[ci[Math.min(ci.length - 1, start + pos)]],
          vel: 0.4 + i * 0.04,
          weight: i === beats.length - 1 ? 0.65 : 0.45,
        });
      });
    }
  }
  return out;
}

function buildHarmony(def: StyleDef, chords: Chord[], rng: RNG): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (let bar = 0; bar < SECTION_BARS; bar++) {
    const c = chords[bar];
    const next = chords[(bar + 1) % SECTION_BARS];
    const b0 = bar * BEATS_PER_BAR;
    const root = bassRoot(c, def.tonic);
    const fifth = root + 7;
    const firstOfChord = def.chordBars === 1 || bar % 2 === 0;

    // --- pad ---
    if (firstOfChord) {
      const dur = def.chordBars * BEATS_PER_BAR;
      const notes = [root + 12, ...voicing(c, def.tonic, 55, 3)];
      for (const m of notes) out.push({ layer: 'pad', beat: b0, dur, midi: m, vel: 0.6, weight: 1 });
    }

    // --- basso ---
    const bass = (beat: number, dur: number, midi: number, vel: number, weight: number): void => {
      out.push({ layer: 'bass', beat: b0 + beat, dur, midi, vel, weight });
    };
    switch (def.id) {
      case 'island_lofi':
        bass(0, 1.5, root, 0.9, 1);
        bass(2.5, 0.5, rng.chance(0.5) ? fifth : root + 12, 0.6, 0.5);
        bass(3, 0.75, root, 0.7, 0.7);
        if (bar % 2 === 1) bass(3.75, 0.25, bassRoot(next, def.tonic) + 7 - 12, 0.5, 0.35);
        break;
      case 'thai_khim':
        bass(0, 2, root, 0.8, 1);
        bass(2, 2, fifth, 0.6, 0.6);
        break;
      case 'sunset_ambient':
        bass(0, 4, root, 0.75, 1);
        break;
      case 'beach_groove':
        bass(0, 1, root, 0.95, 1);
        bass(1.5, 0.5, root, 0.7, 0.6);
        bass(2.5, 0.5, fifth, 0.75, 0.7);
        bass(3, 0.5, root + 12, 0.7, 0.55);
        if (bar % 2 === 1) bass(3.5, 0.5, fifth, 0.6, 0.4);
        break;
    }

    // --- tastiere ---
    const v = voicing(c, def.tonic, 57, 4);
    const stab = (beat: number, dur: number, vel: number, weight: number): void => {
      for (const m of v) out.push({ layer: 'keys', beat: b0 + beat, dur, midi: m, vel, weight });
    };
    switch (def.id) {
      case 'island_lofi':
        stab(0, 1.75, 0.62, 0.9);
        stab(2.5, 1.25, 0.46, 0.6);
        if (rng.chance(0.3)) stab(1.5, 0.5, 0.3, 0.3);
        break;
      case 'beach_groove':
        // levare in stile "skank"
        stab(0.5, 0.3, 0.5, 0.7);
        stab(1.5, 0.3, 0.55, 0.8);
        stab(2.5, 0.3, 0.5, 0.7);
        stab(3.5, 0.3, 0.55, 0.8);
        break;
      case 'sunset_ambient':
        // arpeggio lento, tipo arpa, sulla prima battuta di ogni accordo
        if (bar % 2 === 0) {
          v.forEach((m, i) => {
            out.push({ layer: 'keys', beat: b0 + i * 0.5, dur: 3, midi: m + 12, vel: 0.5 - i * 0.03, weight: i === 0 ? 0.8 : 0.5 });
          });
        }
        break;
      case 'thai_khim':
        break;
    }
  }
  return out;
}

function buildDrums(def: StyleDef, rng: RNG): DrumEvent[] {
  const out: DrumEvent[] = [];
  const ghostBar = rng.int(0, 3);
  for (let bar = 0; bar < SECTION_BARS; bar++) {
    const b0 = bar * BEATS_PER_BAR;
    const hit = (beat: number, kind: DrumKind, vel: number, weight = 1): void => {
      out.push({ beat: b0 + beat, kind, vel, weight });
    };
    const lastBar = bar === SECTION_BARS - 1;
    switch (def.id) {
      case 'island_lofi':
        hit(0, 'kick', 0.95);
        hit(2.5, 'kick', 0.75, 0.8);
        if (bar % 2 === 1) hit(3.5, 'kick', 0.5, 0.45);
        hit(1, 'snare', 0.8);
        hit(3, 'snare', 0.85);
        for (let i = 0; i < 8; i++) hit(i * 0.5, 'hat', i % 2 === 0 ? 0.5 : 0.3 + rng.range(0, 0.1), i % 2 === 0 ? 0.65 : 0.4);
        if (bar % 4 === ghostBar) hit(1.75, 'rim', 0.3, 0.3);
        if (lastBar) {
          hit(3.5, 'snare', 0.4, 0.5);
          hit(3.75, 'snare', 0.55, 0.5);
        }
        break;
      case 'beach_groove':
        hit(0, 'kick', 0.95);
        hit(1.5, 'kick', 0.6, 0.6);
        hit(2, 'kick', 0.85);
        if (bar % 2 === 1) hit(3.5, 'kick', 0.55, 0.5);
        hit(1, 'rim', 0.75);
        hit(3, 'rim', 0.8);
        for (let i = 0; i < 16; i++) {
          const vel = [0.5, 0.2, 0.36, 0.22][i % 4];
          hit(i * 0.25, 'shaker', vel, i % 4 === 0 ? 0.7 : i % 2 === 0 ? 0.5 : 0.3);
        }
        hit(0.5, 'conga_hi', 0.55, 0.6);
        hit(1.75, 'conga_hi', 0.4, 0.4);
        hit(2.5, 'conga_hi', 0.5, 0.55);
        hit(3, 'conga_lo', 0.6, 0.6);
        hit(3.5, 'conga_lo', 0.5, 0.5);
        if (lastBar) {
          hit(3.25, 'conga_hi', 0.5, 0.5);
          hit(3.75, 'conga_hi', 0.6, 0.5);
        }
        break;
      case 'thai_khim':
        // "ching" (aperto, debole) sul 2 e "chap" (chiuso, accentato) sul 4, come nei piatti thai
        hit(1, 'ching', 0.55, 0.8);
        hit(3, 'chap', 0.75, 0.9);
        hit(0, 'klong', 0.8);
        hit(2.5, 'klong', 0.5, 0.6);
        if (bar % 2 === 1) hit(3.5, 'klong', 0.45, 0.45);
        for (let i = 0; i < 8; i++) hit(i * 0.5, 'shaker', i % 2 === 0 ? 0.3 : 0.18, i % 2 === 0 ? 0.45 : 0.3);
        break;
      case 'sunset_ambient':
        if (bar % 4 === 0) hit(0, 'ching', 0.4, 0.6);
        hit(2, 'shaker', 0.22, 0.35);
        if (bar % 2 === 1) hit(3.5, 'shaker', 0.16, 0.25);
        break;
    }
  }
  return out;
}

/**
 * Genera una sezione di 8 battute. Stesso (style, seed, material, variation) ⇒ stesso risultato.
 * `variation = 0` è l'esposizione letterale del materiale; valori > 0 ne sono riprese ornate.
 */
export function generateSection(style: StyleId, seed: number, material: number, variation = 0): Section {
  const def = STYLES[style];
  const rng = new RNG(hashInts(seed, STYLE_IDS.indexOf(style), material));
  const vrng = variation > 0 ? new RNG(hashInts(seed, STYLE_IDS.indexOf(style), material, variation)) : null;

  const prog = rng.pick(def.progressions);
  const chords: Chord[] = [];
  for (let bar = 0; bar < SECTION_BARS; bar++) {
    const i = def.chordBars === 1 ? bar % prog.length : Math.floor(bar / 2) % prog.length;
    chords.push(chord(prog[i]));
  }

  const notes: NoteEvent[] = [
    ...buildMelody(def, chords, rng.fork(), vrng),
    ...buildCounter(def, chords, rng.fork()),
    ...buildHarmony(def, chords, rng.fork()),
  ];
  const drums = buildDrums(def, rng.fork());
  notes.sort((a, b) => a.beat - b.beat);
  drums.sort((a, b) => a.beat - b.beat);

  const barNotes: NoteEvent[][] = [];
  const barDrums: DrumEvent[][] = [];
  for (let bar = 0; bar < SECTION_BARS; bar++) {
    barNotes.push([]);
    barDrums.push([]);
  }
  for (const n of notes) barNotes[Math.min(SECTION_BARS - 1, Math.floor(n.beat / BEATS_PER_BAR))].push(n);
  for (const d of drums) barDrums[Math.min(SECTION_BARS - 1, Math.floor(d.beat / BEATS_PER_BAR))].push(d);

  return {
    style,
    material,
    variation,
    bars: SECTION_BARS,
    beatsPerBar: BEATS_PER_BAR,
    chords,
    notes,
    drums,
    barNotes,
    barDrums,
  };
}

// ---------------------------------------------------------------------------------------------
// Ora del giorno → mix dei layer
// ---------------------------------------------------------------------------------------------

export interface LayerMix extends Record<Layer, number> {
  /** 0..1: quante note deboli sopravvivono */
  density: number;
  /** 0..1: apertura del filtro */
  brightness: number;
  /** 0..1: quantità di riverbero */
  reverb: number;
}

const MIX: Record<DayPart, LayerMix> = {
  // mattina: acustica e ariosa — pizzicati in primo piano, niente cassa
  morning: { melody: 1, counter: 0.85, keys: 0.35, pad: 0.5, bass: 0.5, drums: 0, perc: 0.7, density: 0.8, brightness: 1, reverb: 0.5 },
  // pomeriggio: più ritmata — batteria, basso e tastiere pieni
  afternoon: { melody: 0.9, counter: 0.6, keys: 1, pad: 0.4, bass: 1, drums: 1, perc: 1, density: 1, brightness: 0.9, reverb: 0.4 },
  // golden hour / sera: ambient — pad e riverbero, ritmo appena accennato
  evening: { melody: 0.75, counter: 0.45, keys: 0.45, pad: 1, bass: 0.7, drums: 0.15, perc: 0.35, density: 0.55, brightness: 0.6, reverb: 0.8 },
  // notte: minimale — poche note su un tappeto scuro
  night: { melody: 0.55, counter: 0.15, keys: 0.25, pad: 0.8, bass: 0.35, drums: 0, perc: 0.1, density: 0.32, brightness: 0.35, reverb: 0.9 },
};

const ANCHORS: [number, DayPart][] = [
  [0, 'night'],
  [5, 'night'],
  [7, 'morning'],
  [10.5, 'morning'],
  [12.5, 'afternoon'],
  [16, 'afternoon'],
  [18, 'evening'],
  [20, 'evening'],
  [22, 'night'],
  [24, 'night'],
];

const MIX_KEYS = [...LAYERS, 'density', 'brightness', 'reverb'] as (keyof LayerMix)[];

export function wrapHour(t: number): number {
  return ((t % 24) + 24) % 24;
}

/** Mix dei layer per un'ora in [0, 24): interpolazione continua tra le quattro fasce. */
export function layerMix(timeOfDay: number, out?: LayerMix): LayerMix {
  const t = wrapHour(timeOfDay);
  let i = 0;
  while (i < ANCHORS.length - 2 && t >= ANCHORS[i + 1][0]) i++;
  const [t0, p0] = ANCHORS[i];
  const [t1, p1] = ANCHORS[i + 1];
  const x = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  const s = x * x * (3 - 2 * x);
  const a = MIX[p0];
  const b = MIX[p1];
  const res = out ?? { ...a };
  for (const key of MIX_KEYS) res[key] = a[key] + (b[key] - a[key]) * s;
  return res;
}

export function dayPart(timeOfDay: number): DayPart {
  const t = wrapHour(timeOfDay);
  if (t >= 5.75 && t < 11.5) return 'morning';
  if (t >= 11.5 && t < 17) return 'afternoon';
  if (t >= 17 && t < 21) return 'evening';
  return 'night';
}

const AUTO_STYLE: Record<DayPart, StyleId> = {
  morning: 'thai_khim',
  afternoon: 'beach_groove',
  evening: 'sunset_ambient',
  night: 'island_lofi',
};

/** Stile scelto dalla stazione "auto" in base all'ora. */
export function autoStyle(timeOfDay: number): StyleId {
  return AUTO_STYLE[dayPart(timeOfDay)];
}

/** Un evento di peso `weight` suona se la densità corrente lo ammette. */
export function passesDensity(weight: number, density: number): boolean {
  return weight >= 1 - density - 1e-9;
}
