/**
 * Dal testo alle sillabe (logica pura, testabile in Node). Stile "Animal Crossing": ogni gruppo
 * consonanti+vocali diventa una sillaba sintetica; la punteggiatura decide pause e intonazione
 * (? sale, ! accenta, . scende), la durata è proporzionale al testo.
 */
import type { VoiceId } from './types';

export interface VoiceProfile {
  /** frequenza fondamentale media (Hz) */
  pitch: number;
  /** escursione melodica casuale (semitoni) */
  range: number;
  /** sillabe al secondo */
  rate: number;
  /** scala delle formanti (>1 = tratto vocale più corto, voce più chiara) */
  formant: number;
  wave: OscillatorType;
  /** taglio del passa-basso finale (Hz) */
  tilt: number;
  gain: number;
}

export const VOICES: Record<VoiceId, VoiceProfile> = {
  somchai: { pitch: 98, range: 2.2, rate: 9.5, formant: 0.92, wave: 'sawtooth', tilt: 2300, gain: 1 },
  noi: { pitch: 215, range: 3.5, rate: 12, formant: 1.12, wave: 'sawtooth', tilt: 4200, gain: 0.85 },
  dive_instructor: { pitch: 128, range: 4, rate: 12.5, formant: 0.98, wave: 'sawtooth', tilt: 3400, gain: 0.95 },
  italian_backpacker: { pitch: 152, range: 5, rate: 13.5, formant: 1.03, wave: 'sawtooth', tilt: 3800, gain: 0.9 },
  chai: { pitch: 112, range: 2.5, rate: 10.5, formant: 0.95, wave: 'square', tilt: 2600, gain: 0.8 },
  assistant: { pitch: 290, range: 2, rate: 14, formant: 1.2, wave: 'triangle', tilt: 6000, gain: 0.6 },
  customer_a: { pitch: 182, range: 3, rate: 12, formant: 1.08, wave: 'sawtooth', tilt: 3800, gain: 0.85 },
  customer_b: { pitch: 121, range: 3, rate: 11, formant: 0.97, wave: 'sawtooth', tilt: 3000, gain: 0.95 },
  customer_c: { pitch: 242, range: 4, rate: 13, formant: 1.15, wave: 'sawtooth', tilt: 4400, gain: 0.8 },
  customer_d: { pitch: 140, range: 2.5, rate: 10.5, formant: 1, wave: 'square', tilt: 2900, gain: 0.8 },
  customer_e: { pitch: 201, range: 4.5, rate: 12.5, formant: 1.1, wave: 'sawtooth', tilt: 4000, gain: 0.85 },
  customer_f: { pitch: 106, range: 3, rate: 11.5, formant: 0.94, wave: 'sawtooth', tilt: 2700, gain: 1 },
};

export const VOICE_IDS = Object.keys(VOICES) as VoiceId[];

/** 0 nessuna, 1 occlusiva (p t k b d g c q), 2 fricativa (s f z v h x j), 3 nasale/liquida (m n l r w) */
export type Consonant = 0 | 1 | 2 | 3;

export interface Syllable {
  /** inizio in secondi dall'attacco della frase */
  t: number;
  dur: number;
  /** scostamento in semitoni dal pitch della voce */
  semis: number;
  /** indice della vocale: a e i o u */
  vowel: number;
  cons: Consonant;
  gain: number;
}

export interface SpeechPlan {
  syllables: Syllable[];
  duration: number;
}

const VOWEL_INDEX: Record<string, number> = { a: 0, e: 1, i: 2, o: 3, u: 4, y: 2 };
const PLOSIVE = 'ptkbdgcq';
const FRICATIVE = 'sfzvhxj';
const MAX_SYLLABLES = 400;

function consonantOf(ch: string): Consonant {
  if (!ch) return 0;
  if (PLOSIVE.includes(ch)) return 1;
  if (FRICATIVE.includes(ch)) return 2;
  return 3;
}

function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Formanti F1/F2 (Hz) delle cinque vocali. */
export const FORMANTS: [number, number][] = [
  [800, 1250],
  [480, 1900],
  [300, 2300],
  [500, 900],
  [340, 780],
];

export function planSpeech(text: string, profile: VoiceProfile): SpeechPlan {
  const syllables: Syllable[] = [];
  const syl = 1 / profile.rate;
  let t = 0;
  let sentenceStart = 0;
  let lastWordStart = 0;

  const closeSentence = (mark: string): void => {
    const n = syllables.length - sentenceStart;
    if (n <= 0) return;
    for (let i = 0; i < n; i++) {
      const s = syllables[sentenceStart + i];
      // declinazione naturale: si parte un po' sopra e si scende
      s.semis += n > 1 ? 1.5 - (3 * i) / (n - 1) : 0;
    }
    const last = syllables[syllables.length - 1];
    if (mark === '?') {
      // domanda: le ultime sillabe salgono
      last.semis += 6;
      last.dur *= 1.25;
      if (n > 1) syllables[syllables.length - 2].semis += 3;
      if (n > 2) syllables[syllables.length - 3].semis += 1;
    } else if (mark === '!') {
      // esclamazione: tutto più su, accento sull'ultima parola
      for (let i = 0; i < n; i++) syllables[sentenceStart + i].semis += 1;
      const acc = syllables[Math.max(sentenceStart, Math.min(lastWordStart, syllables.length - 1))];
      acc.semis += 3.5;
      acc.gain *= 1.3;
      last.semis -= 1.5;
    } else {
      last.semis -= mark === '.' ? 3 : 1.5;
      last.dur *= 1.15;
    }
    sentenceStart = syllables.length;
  };

  const push = (cons: Consonant, vowel: number, code: number, loud: boolean, long: boolean): void => {
    if (syllables.length >= MAX_SYLLABLES) return;
    const idx = syllables.length;
    const dur = syl * (0.9 + 0.22 * hash01(code, idx * 7 + 1)) * (long ? 1.25 : 1);
    syllables.push({
      t,
      dur,
      semis: (hash01(code, idx) * 2 - 1) * profile.range + (loud ? 2 : 0),
      vowel,
      cons,
      gain: loud ? 1.2 : 1,
    });
    t += dur;
  };

  const src = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tokens = src.match(/[\p{L}\p{N}']+|\.{3}|[.!?…,;:—–-]/gu) ?? [];
  for (const tok of tokens) {
    if (tok === '...' || tok === '…') {
      closeSentence('…');
      t += 0.4;
      continue;
    }
    if (tok === '.' || tok === '!' || tok === '?') {
      closeSentence(tok);
      t += 0.26;
      continue;
    }
    if (tok === ',' || tok === ';' || tok === ':') {
      t += 0.14;
      continue;
    }
    if (tok === '—' || tok === '–' || tok === '-') {
      t += 0.1;
      continue;
    }
    // parola
    lastWordStart = syllables.length;
    const loud = tok.length >= 2 && tok === tok.toUpperCase() && tok !== tok.toLowerCase();
    const word = tok.toLowerCase();
    const before = syllables.length;
    let onset = '';
    let i = 0;
    let foreign = 0;
    while (i < word.length) {
      const ch = word[i];
      const code = word.charCodeAt(i);
      if (ch in VOWEL_INDEX) {
        // gruppo vocalico: una sillaba (un po' più lunga se è un dittongo)
        let j = i + 1;
        while (j < word.length && word[j] in VOWEL_INDEX) j++;
        push(consonantOf(onset), VOWEL_INDEX[ch], code + (onset ? onset.charCodeAt(0) : 0), loud, j - i > 1);
        onset = '';
        i = j;
      } else if (ch >= 'a' && ch <= 'z') {
        onset = ch;
        i++;
      } else if (ch >= '0' && ch <= '9') {
        push(1, code % 5, code, loud, false);
        i++;
      } else if (ch === "'") {
        i++;
      } else {
        // alfabeti non latini (es. thai): una sillaba ogni due caratteri
        if (foreign % 2 === 0) push((code % 4) as Consonant, code % 5, code, loud, false);
        foreign++;
        i++;
      }
    }
    // parola senza vocali ("mr", "hmm"): una sillaba comunque
    if (syllables.length === before && word.length > 0) {
      push(consonantOf(word[0]), word.charCodeAt(0) % 5, word.charCodeAt(0), loud, false);
    }
    t += syl * 0.35;
  }
  closeSentence('');
  const lastSyl = syllables[syllables.length - 1];
  const duration = lastSyl ? lastSyl.t + lastSyl.dur + 0.05 : 0;
  return { syllables, duration };
}
