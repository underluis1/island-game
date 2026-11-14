/**
 * Orologio musicale puro (nessuna dipendenza da Web Audio). Lo scheduler "lookahead" chiede a ogni
 * `update` se la prossima battuta è abbastanza vicina e, in caso, la programma per intero sui tempi
 * assoluti del contesto audio: il timing non dipende dal frame rate.
 */

export interface BarSlot {
  /** indice progressivo della battuta */
  bar: number;
  /** istante di inizio (secondi del contesto) */
  time: number;
  /** durata della battuta in secondi */
  duration: number;
  /** secondi per battito */
  spb: number;
}

export class BarClock {
  bar = 0;
  nextTime: number;

  constructor(
    public bpm: number,
    public beatsPerBar = 4,
    start = 0,
  ) {
    this.nextTime = start;
  }

  get spb(): number {
    return 60 / this.bpm;
  }

  get barDuration(): number {
    return this.spb * this.beatsPerBar;
  }

  /** true se la prossima battuta inizia entro `lookahead` secondi */
  due(now: number, lookahead: number): boolean {
    return this.nextTime - now <= lookahead;
  }

  /** Se siamo rimasti indietro (scheda in background), riparte poco dopo `now` senza recuperare. */
  resync(now: number, margin = 0.06): boolean {
    if (this.nextTime < now) {
      this.nextTime = now + margin;
      return true;
    }
    return false;
  }

  /** Consuma la prossima battuta. Un cambio di tempo vale dalla battuta successiva. */
  advance(): BarSlot {
    const slot: BarSlot = { bar: this.bar, time: this.nextTime, duration: this.barDuration, spb: this.spb };
    this.bar++;
    this.nextTime += slot.duration;
    return slot;
  }
}

/**
 * Swing: deforma la posizione dentro al battito in modo che il levare (0.5) arrivi in ritardo.
 * Funzione monotona e continua; `amount` 0 = dritto, 0.33 ≈ terzinato.
 */
export function swingBeat(beat: number, amount: number): number {
  const whole = Math.floor(beat);
  const pos = beat - whole;
  const s = Math.min(0.45, Math.max(0, amount));
  const warped = pos < 0.5 ? pos * (1 + s) : 0.5 * (1 + s) + (pos - 0.5) * (1 - s);
  return whole + warped;
}

/** Timer per eventi irregolari (onde, gabbiani, tuoni): scatta quando `now + lookahead` supera `next`. */
export class EventTimer {
  next: number;

  constructor(first = 0) {
    this.next = first;
  }

  due(now: number, lookahead: number): boolean {
    return now + lookahead >= this.next;
  }

  /** Programma la prossima occorrenza `delay` secondi dopo quella corrente (mai nel passato). */
  schedule(now: number, delay: number): void {
    this.next = Math.max(this.next, now) + delay;
  }
}
