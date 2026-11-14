/**
 * Analisi oggettiva di segnali audio (pura, usata dai test automatici e dalla pagina demo):
 * livelli, durata attiva, coda, centroide spettrale, energia per bande, onset, altezza.
 */

export interface Metrics {
  /** campioni non finiti (NaN/Infinity) */
  bad: number;
  peak: number;
  /** RMS sull'intero segnale */
  rms: number;
  /** RMS nella sola regione attiva (sopra −60 dB dal picco) */
  activeRms: number;
  /** inizio e fine della regione attiva (s) */
  start: number;
  end: number;
  duration: number;
  /** massimo assoluto negli ultimi 20 ms */
  tail: number;
  /** valore assoluto dell'ultimo campione */
  last: number;
  /** centroide spettrale (Hz), pesato sull'ampiezza */
  centroid: number;
  /** componente continua */
  dc: number;
}

/** FFT radix-2 in place (re, im di lunghezza potenza di 2). */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Spettro di potenza medio (metodo di Welch, finestra di Hann). Ritorna `size/2` bande. */
export function powerSpectrum(x: Float32Array, size = 2048, from = 0, to = x.length): Float32Array {
  const out = new Float32Array(size / 2);
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const hop = size / 2;
  let frames = 0;
  const lo = Math.max(0, from);
  const hi = Math.min(x.length, to);
  for (let s = lo; s < hi; s += hop) {
    for (let i = 0; i < size; i++) {
      const v = s + i < hi ? x[s + i] : 0;
      re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) out[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
    if (s + size >= hi) break;
  }
  if (frames > 0) for (let k = 0; k < out.length; k++) out[k] /= frames;
  return out;
}

export function centroidOf(spec: Float32Array, sr: number): number {
  let num = 0;
  let den = 0;
  const binHz = sr / (spec.length * 2);
  for (let k = 1; k < spec.length; k++) {
    const mag = Math.sqrt(spec[k]);
    num += mag * k * binHz;
    den += mag;
  }
  return den > 0 ? num / den : 0;
}

/** Frazione dell'energia spettrale compresa in [f0, f1) Hz. */
export function bandFraction(spec: Float32Array, sr: number, f0: number, f1: number): number {
  const binHz = sr / (spec.length * 2);
  let band = 0;
  let total = 0;
  for (let k = 1; k < spec.length; k++) {
    const f = k * binHz;
    total += spec[k];
    if (f >= f0 && f < f1) band += spec[k];
  }
  return total > 0 ? band / total : 0;
}

export function mixdown(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

export function rmsOf(x: Float32Array, from = 0, to = x.length): number {
  let sum = 0;
  const lo = Math.max(0, Math.floor(from));
  const hi = Math.min(x.length, Math.floor(to));
  for (let i = lo; i < hi; i++) sum += x[i] * x[i];
  return hi > lo ? Math.sqrt(sum / (hi - lo)) : 0;
}

export function analyze(channels: Float32Array[], sr: number): Metrics {
  let bad = 0;
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      if (!Number.isFinite(v)) bad++;
      else if (Math.abs(v) > peak) peak = Math.abs(v);
    }
  }
  const x = mixdown(channels);
  const n = x.length;
  const thr = peak * 0.001;
  let first = -1;
  let lastIdx = -1;
  let dc = 0;
  for (let i = 0; i < n; i++) {
    dc += x[i];
    if (Math.abs(x[i]) > thr) {
      if (first < 0) first = i;
      lastIdx = i;
    }
  }
  if (first < 0) {
    first = 0;
    lastIdx = 0;
  }
  let tail = 0;
  const tailN = Math.floor(sr * 0.02);
  for (const ch of channels) for (let i = Math.max(0, n - tailN); i < n; i++) tail = Math.max(tail, Math.abs(ch[i]));
  const size = lastIdx - first < 4096 ? 1024 : 4096;
  return {
    bad,
    peak,
    rms: rmsOf(x),
    activeRms: rmsOf(x, first, lastIdx + 1),
    start: first / sr,
    end: lastIdx / sr,
    duration: (lastIdx - first) / sr,
    tail,
    last: Math.max(...channels.map((ch) => Math.abs(ch[n - 1] ?? 0))),
    centroid: centroidOf(powerSpectrum(x, size, first, lastIdx + 1), sr),
    dc: n > 0 ? dc / n : 0,
  };
}

/** Conta gli attacchi (onset) con il flusso d'energia a bande larghe: indica quante note/colpi ci sono. */
export function countOnsets(x: Float32Array, sr: number, sensitivity = 1.6): number {
  const size = 1024;
  const hop = 512;
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  let prev: Float32Array | null = null;
  const flux: number[] = [];
  for (let s = 0; s + size <= x.length; s += hop) {
    for (let i = 0; i < size; i++) {
      re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float32Array(size / 2);
    let f = 0;
    for (let k = 0; k < size / 2; k++) {
      mag[k] = Math.log1p(40 * Math.hypot(re[k], im[k]));
      if (prev) f += Math.max(0, mag[k] - prev[k]);
    }
    flux.push(f);
    prev = mag;
  }
  // picchi locali sopra la media mobile
  let count = 0;
  const w = 20;
  let lastPeak = -100;
  const minGap = Math.max(1, Math.round((0.05 * sr) / hop));
  for (let i = 1; i < flux.length - 1; i++) {
    let mean = 0;
    let c = 0;
    for (let j = Math.max(0, i - w); j < Math.min(flux.length, i + w); j++) {
      mean += flux[j];
      c++;
    }
    mean /= c;
    if (flux[i] > mean * sensitivity + 0.5 && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] && i - lastPeak >= minGap) {
      count++;
      lastPeak = i;
    }
  }
  return count;
}

/** Stima dell'altezza per autocorrelazione normalizzata, in [fmin, fmax]. 0 se non intonato. */
export function estimatePitch(x: Float32Array, sr: number, fmin: number, fmax: number, from = 0, to = x.length): number {
  const lo = Math.max(0, Math.floor(from));
  const hi = Math.min(x.length, Math.floor(to));
  const minLag = Math.floor(sr / fmax);
  const maxLag = Math.min(Math.floor(sr / fmin), Math.floor((hi - lo) / 2));
  let best = 0;
  let bestLag = 0;
  let e0 = 0;
  for (let i = lo; i < hi - maxLag; i++) e0 += x[i] * x[i];
  if (e0 <= 0) return 0;
  const corr = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    let e1 = 0;
    for (let i = lo; i < hi - maxLag; i++) {
      c += x[i] * x[i + lag];
      e1 += x[i + lag] * x[i + lag];
    }
    corr[lag] = c / Math.sqrt(e0 * e1 + 1e-12);
    if (corr[lag] > best) {
      best = corr[lag];
      bestLag = lag;
    }
  }
  if (best < 0.3) return 0;
  // preferisci il primo picco quasi massimo (evita gli errori d'ottava verso il basso)
  for (let lag = minLag + 1; lag < bestLag; lag++) {
    if (corr[lag] > best * 0.9 && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
      bestLag = lag;
      break;
    }
  }
  // interpolazione parabolica attorno al picco: risoluzione migliore di un campione
  let lag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = corr[bestLag - 1];
    const y1 = corr[bestLag];
    const y2 = corr[bestLag + 1];
    const den = y0 - 2 * y1 + y2;
    if (den < 0) lag += (0.5 * (y0 - y2)) / den;
  }
  return sr / lag;
}

/**
 * Attacchi forti: quante volte il livello sale di almeno `rise` (ampiezza assoluta) in ~12 ms.
 * A differenza di `countOnsets` dipende dal volume: distingue una batteria piena da una appena accennata.
 */
export function countStrongAttacks(x: Float32Array, sr: number, rise = 0.02, from = 0, to = x.length): number {
  // finestre da ~46 ms (più lunghe del periodo delle note basse) confrontate con quella precedente
  const size = 2048;
  const hop = 512;
  const back = size / hop;
  const minGap = Math.max(1, Math.round((0.09 * sr) / hop));
  const lo = Math.max(0, Math.floor(from));
  const hi = Math.min(x.length, Math.floor(to));
  const hist: number[] = [];
  let last = -minGap;
  let count = 0;
  for (let s = lo, i = 0; s + size <= hi; s += hop, i++) {
    const r = rmsOf(x, s, s + size);
    if (i >= back && r - hist[i - back] > rise && i - last >= minGap) {
      count++;
      last = i;
    }
    hist.push(r);
  }
  return count;
}
