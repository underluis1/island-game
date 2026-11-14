/**
 * Effetti sonori one-shot, tutti sintetizzati. Ogni definizione riceve un `Kit` (contesto, uscita,
 * sorgente casuale, pitch) e l'istante di partenza; a ogni chiamata timbro e tempi variano leggermente.
 *
 * Ricetta ricorrente per i suoni "tattili": transiente di rumore filtrato (il contatto) + corpo
 * tonale con sweep discendente (la massa) + risonanze modali inarmoniche (il metallo).
 */
import {
  type Kit,
  type Partial3,
  type Rnd,
  click,
  fm,
  makeKit,
  modal,
  mtof,
  noise,
  tone,
  vr,
} from './common';
import type { SfxName, SfxOptions } from './types';

export interface SfxDef {
  play: (k: Kit, t: number) => void;
  /** guadagno di missaggio */
  gain: number;
  /** ampiezza della micro-variazione casuale di pitch (±) */
  vary: number;
  /** voci contemporanee massime */
  max: number;
  /** intervallo minimo tra due partenze (s) */
  gap: number;
}

const def = (play: SfxDef['play'], gain = 1, vary = 0.04, max = 4, gap = 0.015): SfxDef => ({
  play,
  gain,
  vary,
  max,
  gap,
});

// --- timbri riutilizzati -------------------------------------------------------------------

/** parziali di una barretta d'acciaio libera (viti, staffe) */
const STEEL: Partial3[] = [
  [1, 1, 0.05],
  [2.76, 0.55, 0.035],
  [5.4, 0.3, 0.022],
  [8.93, 0.12, 0.012],
];
/** campanello da banco / cassa */
const BELL: Partial3[] = [
  [1, 1, 1],
  [2.0, 0.42, 0.7],
  [3.01, 0.3, 0.45],
  [4.17, 0.2, 0.3],
  [5.43, 0.12, 0.2],
  [6.8, 0.07, 0.12],
];
/** moneta: due modi vicini che battono + sovratoni */
const COIN: Partial3[] = [
  [1, 1, 0.16],
  [1.07, 0.7, 0.14],
  [2.41, 0.4, 0.08],
  [3.86, 0.2, 0.05],
];

const scaleParts = (parts: Partial3[], decayMul: number): Partial3[] =>
  parts.map(([r, g, d]) => [r, g, d * decayMul]);

/** campanella morbida FM (jingle, notifiche) */
function chime(k: Kit, t: number, midi: number, g: number, d = 0.5): void {
  const f = mtof(midi);
  fm(k, t, { f, ratio: 3.01, idx: 1.1, idxD: 0.09, a: 0.003, d, g });
  tone(k, t, { f: f * 2, a: 0.003, d: d * 0.45, g: g * 0.22 });
}

/** legno percosso tipo marimba/ranat */
function mallet(k: Kit, t: number, midi: number, g: number, d = 0.32): void {
  const f = mtof(midi);
  tone(k, t, { f, a: 0.002, d, g });
  tone(k, t, { f: f * 3.97, a: 0.001, d: d * 0.16, g: g * 0.28 });
  noise(k, t, { type: 'lowpass', f: 2600, a: 0.001, d: 0.012, g: g * 0.35 });
}

/** corda pizzicata FM (khim stilizzato) */
function pluck(k: Kit, t: number, midi: number, g: number, d = 0.7): void {
  const f = mtof(midi);
  fm(k, t, { f, ratio: 2, idx: 1.8, idxD: 0.12, idxEnd: 0.08, a: 0.002, d, g });
  fm(k, t, { f: f * 1.003, ratio: 1, idx: 0.9, idxD: 0.2, a: 0.002, d: d * 0.8, g: g * 0.5 });
  click(k, t, g * 0.25, 2500, 0.004);
}

/** moneta singola */
function coin(k: Kit, t: number, g: number): void {
  modal(k, t, { f: vr(k, 3900, 6400), parts: COIN, g });
  click(k, t, g * 0.5, 5000, 0.004);
}

/** tonfo morbido (oggetto posato, banco) */
function thud(k: Kit, t: number, f: number, g: number, d = 0.05): void {
  tone(k, t, { f, f1: f * 0.55, a: 0.0015, d, g });
  noise(k, t, { type: 'lowpass', f: f * 5, a: 0.001, d: d * 0.4, g: g * 0.5 });
}

/** scatto di una clip di plastica */
function clip(k: Kit, t: number, g: number): void {
  click(k, t, g, 2200, 0.005);
  tone(k, t, { f: vr(k, 1500, 2100), f1: 800, a: 0.0008, d: 0.014, g: g * 0.5 });
  tone(k, t, { f: 320, f1: 170, a: 0.001, d: 0.03, g: g * 0.45 });
}

// --- definizioni ---------------------------------------------------------------------------

export const SFX: Record<SfxName, SfxDef> = {
  // ----- viti -----
  screw_turn: def(
    (k, t) => {
      // dente di cricchetto: tick brillante brevissimo
      click(k, t, 0.32, 3200, 0.005);
      modal(k, t, { f: vr(k, 2500, 3100), parts: [[1, 1, 0.018], [2.76, 0.4, 0.01]], g: 0.16 });
      tone(k, t, { f: 420, f1: 260, a: 0.0008, d: 0.012, g: 0.12 });
    },
    0.8,
    0.08,
    6,
    0.008,
  ),
  screw_out: def((k, t) => {
    // ultimo filetto che molla + la vite che "salta" libera con un piccolo squillo
    click(k, t, 0.3, 2800, 0.005);
    tone(k, t, { f: 300, f1: 170, a: 0.001, d: 0.03, g: 0.28 });
    const t2 = t + vr(k, 0.028, 0.04);
    click(k, t2, 0.2, 3600, 0.004);
    modal(k, t2, { f: vr(k, 3000, 3600), parts: scaleParts(STEEL, 1.6), g: 0.26 });
    tone(k, t2, { f: 700, f1: 1250, a: 0.002, d: 0.05, g: 0.07 });
  }, 0.9, 0.07),
  screw_seat: def((k, t) => {
    // serraggio: click secco e pieno, con un piccolo "tok" di corpo
    noise(k, t, { type: 'bandpass', f: 2300, q: 0.8, a: 0.0005, d: 0.009, g: 0.5 });
    tone(k, t, { f: 210, f1: 115, a: 0.001, d: 0.035, g: 0.42 });
    modal(k, t, { f: vr(k, 3400, 3900), parts: scaleParts(STEEL, 0.6), g: 0.14 });
    click(k, t + 0.012, 0.12, 4200, 0.003);
  }, 0.95, 0.06),
  screw_strip: def((k, t) => {
    // punta che scavalca la testa spanata: grattata metallica ruvida (sgradevole ma breve)
    const d = vr(k, 0.2, 0.26);
    noise(k, t, { type: 'bandpass', f: 2700, f1: 1700, q: 3, a: 0.004, h: d * 0.5, d: d * 0.5, g: 0.42, am: [vr(k, 62, 78), 0.95, 'square'] });
    tone(k, t, { type: 'sawtooth', f: 330, f1: 190, a: 0.004, h: d * 0.4, d: d * 0.6, g: 0.16, lp: 2400, am: [vr(k, 62, 78), 0.9, 'square'] });
    modal(k, t, { f: 2950, parts: [[1, 1, 0.09], [1.31, 0.7, 0.07], [2.2, 0.4, 0.05]], g: 0.1 });
    for (let i = 0; i < 4; i++) click(k, t + i * vr(k, 0.04, 0.055), 0.2, 3800, 0.004);
  }, 0.8, 0.05, 2, 0.08),
  screw_drop: def((k, t) => {
    // 3-5 rimbalzi sul banco, sempre più fitti e deboli, poi un breve rotolio
    const bounces = 3 + Math.floor(k.rnd() * 3);
    const f0 = vr(k, 3700, 4700);
    let dt = vr(k, 0.13, 0.18);
    let g = 0.55;
    let tt = t;
    for (let i = 0; i < bounces; i++) {
      modal(k, tt, { f: f0 * vr(k, 0.93, 1.07), parts: STEEL, g: g * 0.5 });
      click(k, tt, g * 0.45, 2600, 0.006);
      tone(k, tt, { f: 270, f1: 150, a: 0.001, d: 0.03, g: g * 0.4 });
      tt += dt;
      dt *= vr(k, 0.55, 0.68);
      g *= 0.62;
    }
    for (let i = 0; i < 4; i++) {
      modal(k, tt, { f: f0 * vr(k, 0.95, 1.1), parts: scaleParts(STEEL, 0.5), g: g * 0.4 });
      click(k, tt, g * 0.3, 3200, 0.004);
      tt += dt;
      dt *= 0.72;
      g *= 0.7;
    }
  }, 0.9, 0.05, 3, 0.05),
  screw_mat: def((k, t) => {
    // la calamita "tira" la vite: tonfo smorzato del silicone + clink corto
    tone(k, t, { f: 250, f1: 140, a: 0.001, d: 0.028, g: 0.3 });
    noise(k, t, { type: 'lowpass', f: 1400, a: 0.001, d: 0.012, g: 0.2 });
    modal(k, t + 0.002, { f: vr(k, 4800, 5600), parts: [[1, 1, 0.06], [1.52, 0.5, 0.04], [2.76, 0.3, 0.025]], g: 0.2 });
  }, 0.85, 0.07),

  // ----- apertura -----
  suction_attach: def((k, t) => {
    noise(k, t, { type: 'lowpass', f: 900, f1: 260, a: 0.008, d: 0.09, g: 0.4 });
    tone(k, t, { f: 170, f1: 95, a: 0.006, d: 0.08, g: 0.4 });
    tone(k, t + 0.05, { f: 420, f1: 300, a: 0.004, d: 0.03, g: 0.08 });
  }, 0.9),
  suction_pop: def((k, t) => {
    // "pop" rotondo: risonanza di cavità che sale di colpo + sbuffo d'aria
    tone(k, t, { f: vr(k, 360, 420), f1: vr(k, 1050, 1250), sweep: 0.022, a: 0.001, d: 0.075, g: 0.55 });
    tone(k, t, { f: 180, f1: 110, a: 0.001, d: 0.05, g: 0.3 });
    noise(k, t, { type: 'bandpass', f: 1600, q: 0.8, a: 0.0006, d: 0.02, g: 0.3 });
  }, 0.95, 0.07),
  adhesive_creak: def((k, t) => {
    // l'adesivo cede a scatti: micro-schiocchi irregolari che si infittiscono + gemito elastico
    const n = 9 + Math.floor(k.rnd() * 6);
    const len = vr(k, 0.38, 0.5);
    for (let i = 0; i < n; i++) {
      const x = Math.pow((i + k.rnd() * 0.7) / n, 0.75);
      const tt = t + x * len;
      noise(k, tt, { type: 'bandpass', f: vr(k, 1700, 3600), q: 7, a: 0.0006, d: vr(k, 0.008, 0.018), g: vr(k, 0.18, 0.4) });
    }
    tone(k, t, { type: 'sawtooth', f: vr(k, 520, 640), f1: vr(k, 700, 860), a: 0.05, h: len * 0.5, d: len * 0.5, g: 0.035, lp: 1800, am: [vr(k, 28, 40), 0.8, 'sawtooth'] });
    noise(k, t, { type: 'bandpass', f: 900, f1: 1500, q: 1.5, a: 0.06, h: len * 0.4, d: len * 0.6, g: 0.05 });
  }, 2.4, 0.06, 2, 0.1),
  adhesive_tear: def((k, t) => {
    const len = vr(k, 0.3, 0.38);
    noise(k, t, { type: 'bandpass', f: 2800, f1: 1300, q: 1.2, a: 0.01, h: len * 0.4, d: len * 0.6, g: 0.3, am: [vr(k, 45, 60), 0.7, 'sawtooth'] });
    for (let i = 0; i < 14; i++) {
      const tt = t + Math.pow(i / 14, 1.3) * len;
      click(k, tt, vr(k, 0.1, 0.25), vr(k, 1800, 3200), 0.006);
    }
    thud(k, t + len, 240, 0.12);
  }, 0.85, 0.06, 2, 0.1),
  pick_slide: def((k, t) => {
    noise(k, t, { type: 'bandpass', f: vr(k, 2900, 3400), f1: vr(k, 4000, 4600), q: 2.2, a: 0.03, h: 0.06, d: 0.1, g: 0.2 });
    for (let i = 0; i < 3; i++) clip(k, t + 0.03 + i * vr(k, 0.04, 0.06), vr(k, 0.08, 0.14));
  }, 1.3, 0.06, 3, 0.05),
  connector_snap: def((k, t) => {
    // flex che si stacca: schiocco secco e leggero
    click(k, t, 0.5, 2600, 0.004);
    tone(k, t, { f: vr(k, 1800, 2200), f1: 900, a: 0.0006, d: 0.014, g: 0.3 });
    modal(k, t, { f: vr(k, 3900, 4400), parts: [[1, 1, 0.02], [1.6, 0.5, 0.012]], g: 0.12 });
    tone(k, t, { f: 380, f1: 220, a: 0.001, d: 0.02, g: 0.2 });
  }, 0.9, 0.07),
  connector_press: def((k, t) => {
    // innesto a due stadi: appoggio morbido, poi il "tic" dell'aggancio
    tone(k, t, { f: 640, f1: 360, a: 0.0015, d: 0.022, g: 0.26 });
    noise(k, t, { type: 'lowpass', f: 1900, a: 0.001, d: 0.012, g: 0.2 });
    const t2 = t + vr(k, 0.03, 0.042);
    tone(k, t2, { f: vr(k, 900, 1050), f1: 520, a: 0.001, d: 0.02, g: 0.3 });
    click(k, t2, 0.16, 2400, 0.004);
  }, 0.9, 0.06),
  part_pickup: def((k, t) => {
    noise(k, t, { type: 'bandpass', f: 2100, q: 1, a: 0.002, d: 0.016, g: 0.16 });
    tone(k, t, { f: vr(k, 480, 540), f1: vr(k, 740, 800), a: 0.004, d: 0.05, g: 0.16 });
  }, 0.85, 0.06),
  part_place: def((k, t) => {
    thud(k, t, vr(k, 280, 330), 0.36);
    click(k, t, 0.1, 2000, 0.004);
  }, 0.9, 0.06),
  part_metal: def((k, t) => {
    const f = vr(k, 2700, 3200);
    modal(k, t, { f, parts: scaleParts(STEEL, 2.6), g: 0.26 });
    thud(k, t, 300, 0.25, 0.04);
    click(k, t, 0.2, 3000, 0.004);
    const t2 = t + vr(k, 0.055, 0.075);
    modal(k, t2, { f: f * 1.04, parts: scaleParts(STEEL, 1.4), g: 0.1 });
    click(k, t2, 0.07, 3000, 0.003);
  }, 0.9, 0.06),
  display_open: def((k, t) => {
    clip(k, t, 0.3);
    clip(k, t + vr(k, 0.05, 0.07), 0.22);
    noise(k, t + 0.06, { type: 'bandpass', f: 600, f1: 1500, q: 1.1, a: 0.08, h: 0.06, d: 0.2, g: 0.12 });
    tone(k, t + 0.08, { type: 'triangle', f: 240, f1: 330, a: 0.05, d: 0.18, g: 0.04 });
  }, 0.9, 0.04, 2, 0.1),
  display_close: def((k, t) => {
    noise(k, t, { type: 'bandpass', f: 1300, f1: 600, q: 1.1, a: 0.04, d: 0.1, g: 0.08 });
    clip(k, t + 0.08, 0.2);
    clip(k, t + 0.08 + vr(k, 0.055, 0.075), 0.26);
    clip(k, t + 0.2 + vr(k, 0, 0.02), 0.34);
    thud(k, t + 0.21, 190, 0.3, 0.06);
  }, 0.9, 0.04, 2, 0.1),
  pulltab_stretch: def((k, t) => {
    // gomma che si tende: tono che sale tremolando
    const len = vr(k, 0.45, 0.55);
    tone(k, t, { type: 'sawtooth', f: vr(k, 170, 200), f1: vr(k, 400, 460), sweep: len, a: 0.06, h: len * 0.6, d: len * 0.4, g: 0.1, lp: 1300, am: [vr(k, 22, 30), 0.6, 'triangle'] });
    noise(k, t, { type: 'bandpass', f: 1200, f1: 2600, sweep: len, q: 3, a: 0.08, h: len * 0.5, d: len * 0.5, g: 0.06 });
  }, 1.8, 0.05, 2, 0.15),
  pulltab_snap: def((k, t) => {
    click(k, t, 0.5, 2400, 0.005);
    tone(k, t, { f: vr(k, 850, 980), f1: 190, sweep: 0.04, a: 0.001, d: 0.06, g: 0.4 });
    tone(k, t + 0.02, { type: 'triangle', f: 150, f1: 110, a: 0.004, d: 0.1, g: 0.2, am: [vr(k, 38, 46), 0.8] });
  }, 0.9, 0.06),
  glass_crack: def((k, t) => {
    noise(k, t, { type: 'bandpass', f: 4500, q: 0.6, hp: 1800, a: 0.0005, d: 0.016, g: 0.7 });
    tone(k, t, { f: 1500, f1: 600, a: 0.0008, d: 0.02, g: 0.2 });
    const n = 6 + Math.floor(k.rnd() * 4);
    for (let i = 0; i < n; i++) {
      const tt = t + 0.012 + Math.pow(k.rnd(), 1.6) * 0.26;
      modal(k, tt, { f: vr(k, 4200, 9000), parts: [[1, 1, vr(k, 0.03, 0.09)], [1.47, 0.5, 0.03]], g: vr(k, 0.05, 0.16) });
    }
  }, 0.85, 0.05, 2, 0.08),
  spark: def((k, t) => {
    const d = vr(k, 0.14, 0.2);
    noise(k, t, { type: 'bandpass', f: 5200, q: 0.6, hp: 1800, a: 0.001, h: d * 0.3, d: d * 0.7, g: 0.5, am: [vr(k, 95, 125), 1, 'square'] });
    fm(k, t, { f: 3000, f1: 700, sweep: d, ratio: 0.37, idx: 6, idxD: d, a: 0.001, d, g: 0.16 });
    click(k, t, 0.5, 2000, 0.005);
    click(k, t + d * vr(k, 0.4, 0.7), 0.25, 3000, 0.004);
  }, 0.8, 0.06, 2, 0.08),
  damage: def((k, t) => {
    // errore grave: tonfo dissonante che scende, con uno scricchiolio — pesante ma non stridulo
    tone(k, t, { type: 'sawtooth', f: 116, f1: 82, a: 0.006, h: 0.08, d: 0.34, g: 0.26, lp: 800 });
    tone(k, t, { type: 'sawtooth', f: 123, f1: 87, a: 0.006, h: 0.08, d: 0.34, g: 0.22, lp: 800 });
    tone(k, t, { f: 58, f1: 41, a: 0.004, d: 0.4, g: 0.4 });
    noise(k, t, { type: 'lowpass', f: 1300, f1: 400, q: 0.7, a: 0.002, d: 0.09, g: 0.3 });
    for (let i = 0; i < 4; i++) click(k, t + 0.01 + k.rnd() * 0.09, 0.1, 800, 0.008);
  }, 0.85, 0.02, 2, 0.15),

  // ----- pulizia -----
  brush: def((k, t) => {
    const d = vr(k, 0.18, 0.24);
    noise(k, t, { type: 'bandpass', f: vr(k, 3600, 4400), f1: vr(k, 5600, 6600), sweep: d * 0.6, q: 1.3, a: d * 0.4, d: d * 0.6, g: 0.34 });
    noise(k, t, { type: 'bandpass', f: 8000, q: 1, a: d * 0.45, d: d * 0.5, g: 0.05 });
  }, 0.75, 0.08, 4, 0.04),
  air_blast: def((k, t) => {
    const h = vr(k, 0.2, 0.28);
    noise(k, t, { type: 'bandpass', f: 2500, f1: 3200, q: 0.9, hp: 700, a: 0.015, h, d: 0.2, g: 0.45 });
    noise(k, t, { color: 'pink', type: 'lowpass', f: 700, a: 0.02, h, d: 0.14, g: 0.18 });
    tone(k, t, { f: vr(k, 2900, 3300), a: 0.03, h, d: 0.1, g: 0.012 });
  }, 0.8, 0.05, 2, 0.1),
  ipa_drip: def((k, t) => {
    // goccia: sinusoide che sale di colpo e si spegne
    const f = vr(k, 820, 980);
    tone(k, t, { f, f1: f * 2.1, sweep: 0.035, a: 0.002, d: 0.07, g: 0.34 });
    tone(k, t + vr(k, 0.08, 0.11), { f: f * 1.5, f1: f * 2.9, sweep: 0.03, a: 0.002, d: 0.05, g: 0.16 });
    noise(k, t, { type: 'bandpass', f: 3000, q: 2, a: 0.001, d: 0.01, g: 0.05 });
  }, 0.85, 0.1),
  toothpick: def((k, t) => {
    noise(k, t, { type: 'bandpass', f: vr(k, 1500, 1900), q: 4, a: 0.001, d: 0.018, g: 0.34 });
    tone(k, t, { f: vr(k, 850, 1000), f1: 600, a: 0.001, d: 0.022, g: 0.2 });
    noise(k, t + 0.012, { type: 'bandpass', f: 2600, q: 2, a: 0.004, d: 0.03, g: 0.07 });
  }, 0.85, 0.09),

  // ----- diagnostica e telefono -----
  multimeter_beep: def((k, t) => {
    // cicalino piezo di continuità
    tone(k, t, { type: 'square', f: 2400, a: 0.004, h: 0.11, d: 0.03, g: 0.07, lp: 5200 });
    tone(k, t, { f: 2400, a: 0.004, h: 0.11, d: 0.03, g: 0.1 });
  }, 0.8, 0, 2, 0.05),
  phone_boot: def((k, t) => {
    // chime PearOS: arpeggio di La maggiore con nona, morbido e ascendente
    const notes = [69, 73, 76, 83];
    notes.forEach((m, i) => chime(k, t + i * 0.13, m, 0.2 - i * 0.02, 0.9 + i * 0.15));
    tone(k, t, { f: mtof(57), a: 0.08, h: 0.3, d: 0.9, g: 0.08 });
    tone(k, t + 0.39, { f: mtof(88), a: 0.02, d: 0.9, g: 0.04 });
  }, 0.9, 0, 2, 0.2),
  phone_off: def((k, t) => {
    chime(k, t, 76, 0.18, 0.45);
    chime(k, t + 0.14, 69, 0.18, 0.7);
    tone(k, t + 0.14, { f: mtof(57), a: 0.03, d: 0.6, g: 0.07 });
  }, 0.9, 0, 2, 0.2),
  phone_vibrate: def((k, t) => {
    // motorino a massa eccentrica: due impulsi con un leggero sferragliare sul banco
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.34;
      tone(k, tt, { type: 'sawtooth', f: 172, a: 0.02, h: 0.17, d: 0.05, g: 0.2, lp: 520, am: [172 / 4, 0.35] });
      tone(k, tt, { f: 86, a: 0.02, h: 0.17, d: 0.05, g: 0.2 });
      noise(k, tt, { type: 'bandpass', f: 1900, q: 2, a: 0.02, h: 0.17, d: 0.04, g: 0.05, am: [172, 1, 'square'] });
    }
  }, 0.85, 0.02, 2, 0.2),
  phone_speaker_test: def((k, t) => {
    // melodia di prova da un altoparlantino: timbro stretto e brillante
    const mel = [72, 76, 79, 76, 84];
    mel.forEach((m, i) => {
      const tt = t + i * 0.12;
      const last = i === mel.length - 1;
      tone(k, tt, { type: 'square', f: mtof(m), a: 0.004, h: last ? 0.14 : 0.06, d: last ? 0.2 : 0.05, g: 0.05, lp: 3600 });
      tone(k, tt, { type: 'triangle', f: mtof(m) * 2, a: 0.004, h: last ? 0.14 : 0.06, d: last ? 0.2 : 0.05, g: 0.07 });
    });
  }, 1.3, 0, 2, 0.3),
  camera_shutter: def((k, t) => {
    click(k, t, 0.4, 2600, 0.008);
    tone(k, t, { f: 900, f1: 500, a: 0.001, d: 0.016, g: 0.18 });
    const t2 = t + vr(k, 0.05, 0.06);
    noise(k, t2, { type: 'bandpass', f: 3200, q: 0.9, a: 0.0006, d: 0.02, g: 0.4 });
    thud(k, t2, 260, 0.2, 0.035);
    noise(k, t + 0.008, { type: 'bandpass', f: 5000, q: 2, a: 0.01, d: 0.04, g: 0.05 });
  }, 0.85, 0.04, 2, 0.1),
  test_pass: def((k, t) => {
    chime(k, t, 76, 0.2, 0.3);
    chime(k, t + 0.1, 83, 0.22, 0.6);
  }, 0.9, 0, 2, 0.1),
  test_fail: def((k, t) => {
    tone(k, t, { type: 'triangle', f: mtof(64), a: 0.006, h: 0.07, d: 0.1, g: 0.2 });
    tone(k, t + 0.14, { type: 'triangle', f: mtof(60), a: 0.006, h: 0.1, d: 0.22, g: 0.2 });
    tone(k, t + 0.14, { type: 'triangle', f: mtof(60) * 1.012, a: 0.006, h: 0.1, d: 0.22, g: 0.1 });
  }, 0.85, 0, 2, 0.1),
  solder_tick: def((k, t) => {
    noise(k, t, { type: 'bandpass', f: 6500, q: 0.8, hp: 3000, a: 0.002, d: vr(k, 0.03, 0.05), g: 0.34, am: [vr(k, 70, 110), 0.7, 'sawtooth'] });
    tone(k, t, { f: vr(k, 1900, 2300), f1: 1500, a: 0.001, d: 0.02, g: 0.06 });
    click(k, t, 0.14, 5000, 0.003);
  }, 0.8, 0.1, 5, 0.02),
  chip_place: def((k, t) => {
    modal(k, t, { f: vr(k, 5600, 6400), parts: [[1, 1, 0.022], [1.5, 0.5, 0.014]], g: 0.18 });
    tone(k, t, { f: 520, f1: 330, a: 0.001, d: 0.022, g: 0.22 });
    click(k, t, 0.16, 3500, 0.003);
  }, 0.85, 0.07),

  // ----- economia -----
  cash: def((k, t) => {
    // "cha": tasto e meccanismo; "ching": campanello; poi cassetto che scorre e monete che tintinnano
    thud(k, t, 230, 0.4, 0.05);
    click(k, t, 0.3, 2400, 0.006);
    for (let i = 0; i < 3; i++) clip(k, t + 0.018 + i * vr(k, 0.014, 0.022), 0.16);
    const tb = t + 0.075;
    modal(k, tb, { f: 2637, parts: scaleParts(BELL, 1.1), g: 0.3, a: 0.0008 });
    click(k, tb, 0.2, 5000, 0.004);
    modal(k, tb + 0.055, { f: 3520, parts: scaleParts(BELL, 0.8), g: 0.16, a: 0.0008 });
    // cassetto
    const td = t + 0.15;
    noise(k, td, { color: 'pink', type: 'bandpass', f: 320, f1: 520, q: 0.9, a: 0.03, h: 0.08, d: 0.1, g: 0.3, am: [48, 0.4, 'triangle'] });
    thud(k, td + 0.19, 150, 0.45, 0.07);
    // monete
    const n = 5 + Math.floor(k.rnd() * 3);
    for (let i = 0; i < n; i++) coin(k, td + 0.18 + k.rnd() * 0.22, vr(k, 0.06, 0.13));
  }, 0.95, 0.02, 2, 0.15),
  coins: def((k, t) => {
    const n = 4 + Math.floor(k.rnd() * 4);
    let tt = t;
    for (let i = 0; i < n; i++) {
      coin(k, tt, vr(k, 0.14, 0.26) * (1 - i / (n * 1.6)));
      tt += vr(k, 0.03, 0.075);
    }
  }, 0.85, 0.05, 3, 0.05),
  order_notify: def((k, t) => {
    // tre note di marimba in salita: amichevole, da "nuovo messaggio"
    mallet(k, t, 79, 0.26, 0.3);
    mallet(k, t + 0.1, 83, 0.26, 0.3);
    mallet(k, t + 0.2, 86, 0.3, 0.5);
    tone(k, t + 0.2, { f: mtof(98), a: 0.004, d: 0.3, g: 0.03 });
  }, 0.9, 0, 2, 0.2),
  customer_bell: def((k, t) => {
    // campanello della bancarella: due rintocchi
    const f = vr(k, 1540, 1600);
    modal(k, t, { f, parts: scaleParts(BELL, 1.2), g: 0.26, a: 0.0008 });
    click(k, t, 0.14, 4000, 0.004);
    modal(k, t + 0.2, { f: f * 1.003, parts: scaleParts(BELL, 1.3), g: 0.18, a: 0.0008 });
    click(k, t + 0.2, 0.08, 4000, 0.004);
  }, 0.9, 0.02, 2, 0.3),
  purchase: def((k, t) => {
    coin(k, t, 0.2);
    coin(k, t + 0.05, 0.14);
    chime(k, t + 0.06, 79, 0.16, 0.25);
    chime(k, t + 0.15, 86, 0.18, 0.5);
  }, 0.9, 0.01, 2, 0.15),
  delivery: def((k, t) => {
    // pacco appoggiato sul banco (due tonfi di cartone) + campanellino
    thud(k, t, 120, 0.5, 0.09);
    noise(k, t, { color: 'pink', type: 'bandpass', f: 700, q: 0.8, a: 0.002, d: 0.05, g: 0.2 });
    thud(k, t + 0.13, 105, 0.3, 0.07);
    chime(k, t + 0.3, 81, 0.16, 0.3);
    chime(k, t + 0.4, 85, 0.16, 0.3);
    chime(k, t + 0.5, 88, 0.18, 0.6);
  }, 0.9, 0.01, 2, 0.3),

  // ----- interfaccia -----
  ui_click: def((k, t) => {
    tone(k, t, { f: 1750, f1: 1150, a: 0.0008, d: 0.016, g: 0.2 });
    click(k, t, 0.08, 3000, 0.003);
    tone(k, t, { f: 420, f1: 300, a: 0.001, d: 0.02, g: 0.1 });
  }, 0.7, 0.03, 4, 0.02),
  ui_hover: def((k, t) => {
    tone(k, t, { f: 2500, f1: 2200, a: 0.002, d: 0.014, g: 0.07 });
  }, 0.6, 0.03, 2, 0.04),
  ui_open: def((k, t) => {
    tone(k, t, { f: 440, f1: 880, sweep: 0.07, a: 0.006, d: 0.11, g: 0.14 });
    noise(k, t, { type: 'bandpass', f: 1200, f1: 3200, q: 1.5, a: 0.02, d: 0.08, g: 0.05 });
    tone(k, t + 0.06, { f: 1320, a: 0.003, d: 0.08, g: 0.06 });
  }, 0.75, 0.01, 2, 0.05),
  ui_close: def((k, t) => {
    tone(k, t, { f: 880, f1: 440, sweep: 0.07, a: 0.006, d: 0.1, g: 0.14 });
    noise(k, t, { type: 'bandpass', f: 3000, f1: 1100, q: 1.5, a: 0.015, d: 0.07, g: 0.05 });
  }, 0.75, 0.01, 2, 0.05),
  ui_tab: def((k, t) => {
    noise(k, t, { type: 'bandpass', f: 2400, q: 2.2, a: 0.001, d: 0.022, g: 0.2 });
    tone(k, t, { f: 1250, f1: 1000, a: 0.001, d: 0.016, g: 0.12 });
  }, 0.7, 0.04, 3, 0.03),
  error: def((k, t) => {
    // azione proibita: due note basse e rotonde, quasi un "mh-mh"
    tone(k, t, { f: mtof(64), a: 0.008, h: 0.04, d: 0.07, g: 0.2 });
    tone(k, t, { type: 'triangle', f: mtof(52), a: 0.008, h: 0.04, d: 0.07, g: 0.1 });
    tone(k, t + 0.11, { f: mtof(60), a: 0.008, h: 0.05, d: 0.12, g: 0.2 });
    tone(k, t + 0.11, { type: 'triangle', f: mtof(48), a: 0.008, h: 0.05, d: 0.12, g: 0.1 });
  }, 0.75, 0, 2, 0.12),
  success: def((k, t) => {
    chime(k, t, 72, 0.18, 0.3);
    chime(k, t + 0.09, 76, 0.18, 0.3);
    chime(k, t + 0.18, 79, 0.18, 0.35);
    chime(k, t + 0.27, 84, 0.22, 0.9);
    tone(k, t + 0.27, { f: mtof(60), a: 0.02, d: 0.7, g: 0.06 });
  }, 0.9, 0, 2, 0.2),
  star: def((k, t) => {
    modal(k, t, { f: 2093, parts: scaleParts(BELL, 0.7), g: 0.2, a: 0.001 });
    const n = 5;
    for (let i = 0; i < n; i++) {
      tone(k, t + 0.04 + i * 0.045, { f: mtof(91 + [0, 4, 7, 12, 16][i]), a: 0.002, d: 0.12, g: 0.06 - i * 0.006 });
    }
  }, 0.85, 0.02, 5, 0.06),
  unlock: def((k, t) => {
    // serratura che scatta + arpeggio luminoso
    clip(k, t, 0.3);
    modal(k, t, { f: 2400, parts: scaleParts(STEEL, 1.5), g: 0.1 });
    [74, 78, 81, 86, 90].forEach((m, i) => chime(k, t + 0.09 + i * 0.065, m, 0.15, i === 4 ? 0.9 : 0.3));
  }, 0.9, 0, 2, 0.2),
  day_end: def((k, t) => {
    // jingle di chiusura: frase pentatonica che scende e si posa sulla tonica (Re maggiore)
    const seq: [number, number][] = [[81, 0], [78, 0.22], [76, 0.44], [74, 0.66], [69, 0.99], [74, 1.32]];
    seq.forEach(([m, dt], i) => pluck(k, t + dt, m, 0.24, i === seq.length - 1 ? 1.4 : 0.7));
    [50, 57, 62, 66].forEach((m, i) => tone(k, t + 1.32 + i * 0.03, { type: 'triangle', f: mtof(m), a: 0.03, h: 0.2, d: 1.2, g: 0.06 }));
    chime(k, t + 1.34, 86, 0.08, 1.2);
  }, 0.9, 0, 1, 0.5),
  day_start: def((k, t) => {
    // jingle del mattino: frase che sale, ariosa
    const seq: [number, number][] = [[62, 0], [66, 0.16], [69, 0.32], [74, 0.48], [71, 0.72], [78, 0.96]];
    seq.forEach(([m, dt], i) => pluck(k, t + dt, m, 0.24, i === seq.length - 1 ? 1.1 : 0.55));
    [50, 57, 66].forEach((m) => tone(k, t + 0.96, { type: 'triangle', f: mtof(m), a: 0.03, h: 0.1, d: 0.9, g: 0.06 }));
    chime(k, t + 0.98, 90, 0.07, 0.9);
  }, 0.7, 0, 1, 0.5),

  // ----- negozio e mondo -----
  tool_select: def((k, t) => {
    modal(k, t, { f: vr(k, 3100, 3500), parts: scaleParts(STEEL, 1.5), g: 0.16 });
    click(k, t, 0.18, 2800, 0.004);
    tone(k, t, { f: 360, f1: 240, a: 0.001, d: 0.025, g: 0.14 });
  }, 0.8, 0.05),
  place_decor: def((k, t) => {
    thud(k, t, 170, 0.42, 0.07);
    tone(k, t + 0.03, { f: 520, f1: 780, sweep: 0.05, a: 0.004, d: 0.09, g: 0.1 });
  }, 0.9, 0.05),
  rotate_decor: def((k, t) => {
    noise(k, t, { type: 'bandpass', f: 800, f1: 1700, q: 1.6, a: 0.015, d: 0.06, g: 0.16 });
    clip(k, t + 0.055, 0.14);
  }, 0.8, 0.05, 3, 0.04),
  sell: def((k, t) => {
    coin(k, t, 0.2);
    coin(k, t + 0.06, 0.16);
    coin(k, t + 0.13, 0.12);
    tone(k, t + 0.04, { f: 780, f1: 520, sweep: 0.08, a: 0.004, d: 0.12, g: 0.1 });
  }, 0.9, 0.03, 2, 0.1),
  build_hammer: def((k, t) => {
    let tt = t;
    for (let i = 0; i < 3; i++) {
      const g = 0.5 + i * 0.12;
      thud(k, tt, vr(k, 175, 200), g * 0.7, 0.07);
      noise(k, tt, { type: 'bandpass', f: 1100, q: 1.4, a: 0.0008, d: 0.03, g: g * 0.5 });
      modal(k, tt, { f: vr(k, 2100, 2400) * (1 + i * 0.04), parts: scaleParts(STEEL, 1.2), g: g * 0.12 });
      tt += vr(k, 0.2, 0.25);
    }
  }, 0.85, 0.04, 2, 0.2),
  build_saw: def((k, t) => {
    // due passate di sega: andata e ritorno
    noise(k, t, { type: 'bandpass', f: 1300, f1: 1700, q: 1.8, a: 0.03, h: 0.12, d: 0.08, g: 0.36, am: [vr(k, 42, 50), 0.85, 'sawtooth'] });
    noise(k, t + 0.27, { type: 'bandpass', f: 1500, f1: 1000, q: 1.8, a: 0.03, h: 0.1, d: 0.08, g: 0.26, am: [vr(k, 34, 40), 0.85, 'sawtooth'] });
  }, 1.9, 0.05, 2, 0.2),
  thunder: def((k, t) => {
    // schianto iniziale filtrato, poi rotolii lunghi che si sovrappongono
    noise(k, t, { color: 'pink', type: 'lowpass', f: 1500, f1: 300, sweep: 0.5, a: 0.012, d: 0.6, g: 0.55 });
    noise(k, t + 0.08, { color: 'brown', type: 'lowpass', f: 220, f1: 90, sweep: 2.5, a: 0.25, h: 0.3, d: 2.4, g: 0.8 });
    noise(k, t + vr(k, 0.7, 1.0), { color: 'brown', type: 'lowpass', f: 180, f1: 80, sweep: 2, a: 0.35, h: 0.2, d: 2.2, g: 0.55 });
    noise(k, t + vr(k, 1.5, 2.0), { color: 'brown', type: 'lowpass', f: 140, f1: 70, sweep: 2, a: 0.45, d: 2, g: 0.35 });
    tone(k, t, { f: 55, f1: 32, a: 0.02, d: 1.4, g: 0.3 });
  }, 0.9, 0.08, 2, 1),
  footstep_sand: def((k, t) => {
    noise(k, t, { type: 'lowpass', f: vr(k, 1300, 1700), hp: 260, q: 0.6, a: 0.012, d: 0.08, g: 0.3 });
    noise(k, t + 0.02, { type: 'bandpass', f: 4000, q: 1, a: 0.015, d: 0.06, g: 0.03 });
    tone(k, t, { f: 110, f1: 70, a: 0.006, d: 0.05, g: 0.16 });
  }, 0.7, 0.1, 4, 0.05),
  radio_tune: def((k, t) => {
    // manopola della radio: fruscio che scorre + fischio eterodina
    const d = vr(k, 0.3, 0.38);
    noise(k, t, { type: 'bandpass', f: vr(k, 900, 1400), f1: vr(k, 2800, 3600), sweep: d, q: 1.4, a: 0.01, h: d * 0.5, d: d * 0.5, g: 0.22, am: [vr(k, 17, 26), 0.6] });
    tone(k, t, { f: vr(k, 2600, 3200), f1: vr(k, 500, 700), sweep: d * 0.6, a: 0.01, h: d * 0.3, d: d * 0.5, g: 0.035 });
    tone(k, t + d * 0.5, { f: 600, f1: 1500, sweep: d * 0.4, a: 0.01, d: d * 0.5, g: 0.025 });
    click(k, t, 0.2, 1800, 0.005);
    click(k, t + d, 0.14, 1800, 0.005);
  }, 0.8, 0.03, 1, 0.2),
  flashlight: def((k, t) => {
    clip(k, t, 0.32);
    click(k, t + 0.022, 0.2, 3400, 0.003);
    tone(k, t + 0.022, { f: 2500, f1: 1800, a: 0.0008, d: 0.012, g: 0.1 });
  }, 0.85, 0.05),
  camera_whoosh: def((k, t) => {
    noise(k, t, { color: 'pink', type: 'lowpass', f: 500, f1: 1900, sweep: 0.18, hp: 180, q: 0.8, a: 0.14, d: 0.24, g: 0.8 });
    noise(k, t + 0.1, { type: 'lowpass', f: 1700, f1: 700, sweep: 0.25, hp: 300, q: 0.7, a: 0.1, d: 0.25, g: 0.1 });
  }, 0.7, 0.06, 2, 0.1),
  review_good: def((k, t) => {
    chime(k, t, 79, 0.18, 0.3);
    chime(k, t + 0.1, 84, 0.18, 0.35);
    chime(k, t + 0.2, 88, 0.2, 0.8);
    for (let i = 0; i < 4; i++) tone(k, t + 0.26 + i * 0.05, { f: mtof(96 + i * 2 + (i > 1 ? 1 : 0)), a: 0.002, d: 0.1, g: 0.035 });
  }, 0.9, 0, 2, 0.2),
  review_bad: def((k, t) => {
    tone(k, t, { type: 'triangle', f: mtof(67), f1: mtof(66), a: 0.01, h: 0.1, d: 0.14, g: 0.22, lp: 900 });
    tone(k, t + 0.2, { type: 'triangle', f: mtof(63), f1: mtof(61), sweep: 0.35, a: 0.01, h: 0.16, d: 0.35, g: 0.22, lp: 800 });
    tone(k, t + 0.2, { f: mtof(51), a: 0.01, h: 0.16, d: 0.3, g: 0.12 });
  }, 0.85, 0, 2, 0.2),
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];

/**
 * Suona un SFX su un nodo d'uscita qualsiasi all'istante `t`. Ritorna il Kit (con `end` = istante di
 * fine e `last` = ultima sorgente), utile per pulire i nodi per-chiamata.
 */
export function playSfx(
  ctx: BaseAudioContext,
  out: AudioNode,
  name: SfxName,
  t: number,
  rnd: Rnd,
  opts?: SfxOptions,
): Kit {
  const d = SFX[name];
  const pitch = (opts?.pitch ?? 1) * (1 + (rnd() * 2 - 1) * d.vary);
  const k = makeKit(ctx, out, rnd, pitch);
  d.play(k, t);
  return k;
}

/**
 * Come `playSfx`, ma con guadagno di missaggio, volume e pan per-chiamata: i nodi creati si scollegano
 * quando termina l'ultima sorgente. Ritorna l'istante di fine.
 */
export function triggerSfx(
  ctx: BaseAudioContext,
  bus: AudioNode,
  name: SfxName,
  t: number,
  rnd: Rnd,
  opts?: SfxOptions,
): number {
  const g = ctx.createGain();
  g.gain.value = SFX[name].gain * Math.max(0, opts?.volume ?? 1);
  let panner: StereoPannerNode | null = null;
  if (opts?.pan) {
    panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
    g.connect(panner);
    panner.connect(bus);
  } else {
    g.connect(bus);
  }
  const k = playSfx(ctx, g, name, t, rnd, opts);
  const cleanup = (): void => {
    g.disconnect();
    panner?.disconnect();
  };
  if (k.last) k.last.addEventListener('ended', cleanup);
  else cleanup();
  return k.end;
}
