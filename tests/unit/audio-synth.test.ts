import { describe, expect, it } from 'vitest';
import { dayFactor, nightFactor, renderBabble, renderChirpEnvelope, renderPatter } from '../../src/audio/ambience';
import {
  analyze,
  bandFraction,
  centroidOf,
  countOnsets,
  countStrongAttacks,
  estimatePitch,
  powerSpectrum,
  rmsOf,
} from '../../src/audio/analysis';
import { fillNoise, mtof, mulberry, softClipCurve } from '../../src/audio/common';
import { renderImpulse, renderString } from '../../src/audio/instruments';
import { renderCrackleEnvelope } from '../../src/audio/loops';

const SR = 32000;

function finiteAndBounded(x: Float32Array, limit: number): void {
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    expect(Number.isFinite(x[i])).toBe(true);
    peak = Math.max(peak, Math.abs(x[i]));
  }
  expect(peak).toBeLessThanOrEqual(limit);
  expect(peak).toBeGreaterThan(0);
}

function sine(freq: number, seconds: number, sr: number, amp = 0.5): Float32Array {
  const x = new Float32Array(Math.floor(seconds * sr));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return x;
}

describe('analisi', () => {
  it('centroide e altezza di una sinusoide', () => {
    const x = sine(1000, 0.5, 44100);
    const spec = powerSpectrum(x, 4096);
    expect(centroidOf(spec, 44100)).toBeGreaterThan(950);
    expect(centroidOf(spec, 44100)).toBeLessThan(1050);
    expect(bandFraction(spec, 44100, 900, 1100)).toBeGreaterThan(0.98);
    expect(estimatePitch(sine(220, 0.3, 44100), 44100, 60, 500)).toBeCloseTo(220, -1);
    expect(rmsOf(x)).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });

  it('misura durata attiva, coda e campioni non finiti', () => {
    const x = new Float32Array(44100);
    x.set(sine(500, 0.2, 44100), 4410);
    const m = analyze([x], 44100);
    expect(m.bad).toBe(0);
    expect(m.start).toBeCloseTo(0.1, 2);
    expect(m.duration).toBeCloseTo(0.2, 2);
    expect(m.tail).toBe(0);
    expect(m.peak).toBeCloseTo(0.5, 2);
    x[100] = Number.NaN;
    expect(analyze([x], 44100).bad).toBe(1);
  });

  it('conta gli attacchi di un treno di colpi', () => {
    const sr = 44100;
    const x = new Float32Array(sr * 4);
    const rnd = mulberry(5);
    for (let hit = 0; hit < 8; hit++) {
      const at = Math.floor((0.2 + hit * 0.45) * sr);
      for (let i = 0; i < 3000; i++) x[at + i] += (rnd() * 2 - 1) * 0.5 * Math.exp(-i / 500);
    }
    expect(countOnsets(x, sr)).toBe(8);
    expect(countStrongAttacks(x, sr, 0.02)).toBe(8);
    expect(countStrongAttacks(x.map((v) => v * 0.05), sr, 0.02)).toBe(0);
  });
});

describe('corde Karplus-Strong', () => {
  it('sono intonate, limitate e decadono fino al silenzio', () => {
    for (const kind of ['khim', 'nylon'] as const) {
      for (const midi of [50, 62, 69, 76, 88]) {
        const x = renderString(kind, midi, SR);
        finiteAndBounded(x, 0.9001);
        const f = estimatePitch(x, SR, mtof(midi) * 0.7, mtof(midi) * 1.4, SR * 0.05, SR * 0.25);
        // entro 6 cent dalla nota (il ritardo frazionario all-pass corregge l'intonazione)
        expect(Math.abs(1200 * Math.log2(f / mtof(midi)))).toBeLessThan(6);
        expect(rmsOf(x, x.length - SR * 0.2)).toBeLessThan(rmsOf(x, 0, SR * 0.2) * 0.5);
        expect(Math.abs(x[x.length - 1])).toBeLessThan(1e-3);
        expect(Math.abs(x[0])).toBeLessThan(1e-3);
      }
    }
  });

  it('il khim è più brillante del nylon', () => {
    const c = (kind: 'khim' | 'nylon'): number => centroidOf(powerSpectrum(renderString(kind, 69, SR), 4096, 0, SR * 0.4), SR);
    expect(c('khim')).toBeGreaterThan(c('nylon') * 1.15);
  });
});

describe('buffer procedurali', () => {
  it('rumore: limitato, deterministico, con loop senza giunture', () => {
    for (const color of ['white', 'pink', 'brown'] as const) {
      const a = fillNoise(color, 48000, mulberry(9));
      const b = fillNoise(color, 48000, mulberry(9));
      finiteAndBounded(a, 1.5);
      expect(a).toEqual(b);
      expect(rmsOf(a)).toBeGreaterThan(0.05);
    }
    // rumore bruno: il salto tra fine e inizio è dell'ordine del passo tra campioni adiacenti
    const brown = fillNoise('brown', 48000, mulberry(3));
    let step = 0;
    for (let i = 1; i < brown.length; i++) step = Math.max(step, Math.abs(brown[i] - brown[i - 1]));
    expect(Math.abs(brown[0] - brown[brown.length - 1])).toBeLessThan(step * 3);
    // il rosa pende verso i bassi, il bianco no
    const lowShare = (c: 'white' | 'pink'): number => bandFraction(powerSpectrum(fillNoise(c, 48000, mulberry(4)), 2048), 48000, 0, 2000);
    expect(lowShare('pink')).toBeGreaterThan(lowShare('white') * 3);
  });

  it('risposta all’impulso del riverbero: stereo, decade e si scurisce', () => {
    const [l, r] = renderImpulse(SR, 2.6, 7);
    finiteAndBounded(l, 1.5);
    finiteAndBounded(r, 1.5);
    expect(l).not.toEqual(r);
    expect(rmsOf(l, SR * 2.2, SR * 2.5)).toBeLessThan(rmsOf(l, SR * 0.05, SR * 0.35) * 0.02);
    const highShare = (from: number, to: number): number => bandFraction(powerSpectrum(l, 2048, SR * from, SR * to), SR, 4000, 16000);
    expect(highShare(1.2, 1.8)).toBeLessThan(highShare(0.03, 0.3) * 0.3);
    expect(Math.abs(l[l.length - 1])).toBeLessThan(1e-4);
  });

  it('chiacchiericcio, gocce e inviluppi sono limitati e non silenziosi', () => {
    const babble = renderBabble(16000, 7, 6, 1);
    finiteAndBounded(babble, 0.8001);
    // energia concentrata nella banda vocale
    expect(bandFraction(powerSpectrum(babble, 2048), 16000, 150, 3000)).toBeGreaterThan(0.85);
    finiteAndBounded(renderPatter(22050, 4, 2), 3);
    const chirp = renderChirpEnvelope(8000, 1.9, 3, 58, 2);
    finiteAndBounded(chirp, 1);
    expect(Math.min(...chirp)).toBe(0);
    const crackle = renderCrackleEnvelope(8000, 2.3, 3);
    finiteAndBounded(crackle, 1);
    expect(Math.min(...crackle)).toBeGreaterThanOrEqual(0.1);
  });

  it('soft-clip: monotono, simmetrico, mai oltre 0.96', () => {
    const curve = softClipCurve();
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    expect(Math.max(...curve)).toBeLessThanOrEqual(0.96);
    expect(curve[0]).toBeCloseTo(-curve[curve.length - 1], 6);
    const mid = (curve.length - 1) / 2;
    expect(curve[mid]).toBeCloseTo(0, 6);
    // lineare (trasparente) ai livelli normali
    expect(curve[mid + 512]).toBeCloseTo(0.5, 3);
  });
});

describe('giorno e notte', () => {
  it('gabbiani di giorno, grilli di notte, passaggi graduali', () => {
    expect(dayFactor(12)).toBe(1);
    expect(dayFactor(23)).toBe(0);
    expect(dayFactor(3)).toBe(0);
    expect(nightFactor(12)).toBe(0);
    expect(nightFactor(23)).toBe(1);
    expect(nightFactor(2)).toBe(1);
    for (let t = 0; t < 24; t += 0.1) {
      expect(Math.abs(dayFactor(t + 0.1) - dayFactor(t))).toBeLessThan(0.2);
      expect(Math.abs(nightFactor(t + 0.1) - nightFactor(t))).toBeLessThan(0.2);
      expect(dayFactor(t)).toBeGreaterThanOrEqual(0);
      expect(nightFactor(t)).toBeLessThanOrEqual(1);
    }
  });
});
