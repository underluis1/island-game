/**
 * Lettore della musica procedurale adattiva. Programma una battuta alla volta (scheduler lookahead
 * sui tempi del contesto), con un "deck" per stile: al cambio di stazione o di fascia oraria il deck
 * uscente sfuma e viene smontato, quello nuovo parte a confine di battuta.
 */
import { type Kit, type Rnd, clamp01, makeKit, mulberry } from './common';
import {
  bass,
  bell,
  crackleBuffer,
  drum,
  flute,
  impulseBuffer,
  marimba,
  pad,
  pluckString,
  rhodes,
  skank,
} from './instruments';
import {
  BEATS_PER_BAR,
  DRUM_LAYER,
  LAYERS,
  type Layer,
  type LayerMix,
  type NoteEvent,
  STYLES,
  type Section,
  type StyleId,
  generateSection,
  layerMix,
  passesDensity,
  planSection,
} from './music-theory';
import { BarClock, type BarSlot, swingBeat } from './scheduler';

/** guadagno di missaggio di ogni layer */
const LAYER_GAIN: Record<Layer, number> = {
  melody: 0.6,
  counter: 0.3,
  keys: 0.2,
  pad: 0.1,
  bass: 0.17,
  drums: 0.4,
  perc: 0.6,
};

/** mandata al riverbero di ogni layer */
const LAYER_SEND: Record<Layer, number> = {
  melody: 0.42,
  counter: 0.5,
  keys: 0.3,
  pad: 0.5,
  bass: 0,
  drums: 0.06,
  perc: 0.2,
};

/** quanto ogni layer si ritira in modalità focus */
const FOCUS_CUT: Record<Layer, number> = {
  melody: 0.35,
  counter: 0.9,
  keys: 0.7,
  pad: 0,
  bass: 0.4,
  drums: 1,
  perc: 0.85,
};

const STYLE_TRIM: Record<StyleId, number> = {
  island_lofi: 1,
  thai_khim: 1.5,
  sunset_ambient: 0.95,
  beach_groove: 1.15,
};

const LOOKAHEAD = 0.2;

interface Deck {
  style: StyleId;
  out: GainNode;
  send: GainNode;
  layers: Record<Layer, GainNode>;
  sends: GainNode[];
  kits: Record<Layer, Kit>;
  clock: BarClock;
  section: Section | null;
  barInSection: number;
  /** istante oltre il quale il deck ritirato può essere smontato */
  retireAt: number;
}

export interface MusicStats {
  style: StyleId | null;
  bars: number;
  sections: number;
  notes: Record<Layer, number>;
  decks: number;
}

export class MusicPlayer {
  private readonly ctx: BaseAudioContext;
  private readonly seed: number;
  private readonly rnd: Rnd;
  private readonly mixIn: GainNode;
  private readonly wow: DelayNode;
  private readonly wowLfo: OscillatorNode;
  private readonly wowDepth: GainNode;
  private readonly toneLp: BiquadFilterNode;
  private readonly duck: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly reverbOut: GainNode;
  private readonly crackle: AudioBufferSourceNode;
  private readonly crackleGain: GainNode;

  private deck: Deck | null = null;
  private readonly retired: Deck[] = [];
  private desired: StyleId | null = null;
  private readonly progress: Record<StyleId, number> = {
    island_lofi: 0,
    thai_khim: 0,
    sunset_ambient: 0,
    beach_groove: 0,
  };

  private timeOfDay = 12;
  private focus = 0;
  private paused = false;
  private readonly mix: LayerMix = layerMix(12);
  private readonly level: Record<Layer, number> = { melody: 0, counter: 0, keys: 0, pad: 0, bass: 0, drums: 0, perc: 0 };
  private crackleOn = false;
  private lastCutoff = -1;
  private lastDuck = -1;

  readonly stats: MusicStats = {
    style: null,
    bars: 0,
    sections: 0,
    notes: { melody: 0, counter: 0, keys: 0, pad: 0, bass: 0, drums: 0, perc: 0 },
    decks: 0,
  };

  constructor(ctx: BaseAudioContext, out: AudioNode, seed: number) {
    this.ctx = ctx;
    this.seed = seed >>> 0;
    this.rnd = mulberry(this.seed ^ 0x9e3779b9);

    this.mixIn = ctx.createGain();
    // "wow" da nastro: un ritardo modulato lentissimo fa ondeggiare appena l'intonazione
    this.wow = ctx.createDelay(0.05);
    this.wow.delayTime.value = 0.012;
    this.wowLfo = ctx.createOscillator();
    this.wowLfo.frequency.value = 0.43;
    this.wowDepth = ctx.createGain();
    this.wowDepth.gain.value = 0.00015;
    this.wowLfo.connect(this.wowDepth);
    this.wowDepth.connect(this.wow.delayTime);
    this.wowLfo.start();

    this.toneLp = ctx.createBiquadFilter();
    this.toneLp.type = 'lowpass';
    this.toneLp.Q.value = 0.5;
    this.toneLp.frequency.value = 11000;
    this.duck = ctx.createGain();

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulseBuffer(ctx);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.9;
    this.reverb.connect(this.reverbOut);
    this.reverbOut.connect(this.mixIn);

    this.crackle = ctx.createBufferSource();
    this.crackle.buffer = crackleBuffer(ctx);
    this.crackle.loop = true;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    this.crackle.connect(this.crackleGain);
    this.crackleGain.connect(this.mixIn);
    this.crackle.start();

    this.mixIn.connect(this.wow);
    this.wow.connect(this.toneLp);
    this.toneLp.connect(this.duck);
    this.duck.connect(out);
    this.applyTone(0);
  }

  get style(): StyleId | null {
    return this.desired;
  }

  /**
   * Sceglie lo stile da suonare (null = silenzio). `quick` = cambio da manopola della radio (stacco
   * rapido); altrimenti il passaggio avviene al prossimo confine di battuta con dissolvenza.
   */
  setStyle(style: StyleId | null, quick: boolean): void {
    if (style === this.desired) return;
    this.desired = style;
    // senza deck attivo ci pensa il prossimo `update` ad avviare la musica
    if (quick && this.deck) this.switchDeck(this.ctx.currentTime, true);
  }

  setTimeOfDay(t: number): void {
    this.timeOfDay = t;
  }

  setFocus(amount: number): void {
    this.focus = clamp01(amount);
    this.applyTone(0.25);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyTone(0.12);
  }

  /** Filtro e attenuazione globali: luminosità dell'ora, focus e pausa. */
  private applyTone(tau: number): void {
    const now = this.ctx.currentTime;
    const bright = 1800 * Math.pow(12000 / 1800, this.mix.brightness);
    const focusCut = 12000 * Math.pow(1700 / 12000, this.focus);
    const cutoff = this.paused ? 750 : Math.min(bright, focusCut);
    const duck = (1 - 0.5 * this.focus) * (this.paused ? 0.4 : 1);
    if (Math.abs(cutoff - this.lastCutoff) > 20) {
      this.lastCutoff = cutoff;
      if (tau > 0) this.toneLp.frequency.setTargetAtTime(cutoff, now, tau);
      else this.toneLp.frequency.setValueAtTime(cutoff, now);
    }
    if (Math.abs(duck - this.lastDuck) > 0.005) {
      this.lastDuck = duck;
      if (tau > 0) this.duck.gain.setTargetAtTime(duck, now, tau);
      else this.duck.gain.setValueAtTime(duck, now);
    }
  }

  private makeDeck(style: StyleId, start: number): Deck {
    const { ctx } = this;
    const out = ctx.createGain();
    const send = ctx.createGain();
    out.connect(this.mixIn);
    send.connect(this.reverb);
    const layers = {} as Record<Layer, GainNode>;
    const kits = {} as Record<Layer, Kit>;
    const sends: GainNode[] = [];
    for (const layer of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      if (LAYER_SEND[layer] > 0) {
        const s = ctx.createGain();
        s.gain.value = LAYER_SEND[layer];
        g.connect(s);
        s.connect(send);
        sends.push(s);
      }
      layers[layer] = g;
      kits[layer] = makeKit(ctx, g, this.rnd);
    }
    this.stats.decks++;
    return {
      style,
      out,
      send,
      layers,
      sends,
      kits,
      clock: new BarClock(STYLES[style].bpm, BEATS_PER_BAR, start),
      section: null,
      barInSection: 0,
      retireAt: Infinity,
    };
  }

  private disposeDeck(d: Deck): void {
    d.out.disconnect();
    d.send.disconnect();
    for (const layer of LAYERS) d.layers[layer].disconnect();
    for (const s of d.sends) s.disconnect();
    this.stats.decks--;
  }

  /** Ritira il deck corrente (dissolvenza da `at`) e avvia quello dello stile desiderato. */
  private switchDeck(at: number, quick: boolean): void {
    const now = this.ctx.currentTime;
    const t = Math.max(at, now);
    const old = this.deck;
    if (old) {
      const fade = quick ? 0.22 : 2.4;
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setValueAtTime(1, t);
      old.out.gain.linearRampToValueAtTime(0, t + fade);
      old.send.gain.setTargetAtTime(0, t, fade / 3);
      old.retireAt = t + fade + 0.1;
      this.retired.push(old);
    }
    this.deck = null;
    const style = this.desired;
    this.stats.style = style;
    if (!style) {
      this.crackleOn = false;
      this.crackleGain.gain.setTargetAtTime(0, t, 0.2);
      return;
    }
    const start = quick ? t + (old ? 0.34 : 0.08) : t;
    const d = this.makeDeck(style, start);
    d.out.gain.setValueAtTime(quick ? 0.0001 : 0.25, start);
    d.out.gain.linearRampToValueAtTime(1, start + (quick ? 0.25 : 2));
    this.deck = d;
    this.wowDepth.gain.setTargetAtTime(style === 'island_lofi' ? 0.001 : 0.00015, start, 0.5);
    this.crackleOn = style === 'island_lofi';
  }

  /** Scheduler lookahead: da chiamare spesso (ogni frame). */
  update(now: number): void {
    for (let i = this.retired.length - 1; i >= 0; i--) {
      if (now >= this.retired[i].retireAt) {
        this.disposeDeck(this.retired[i]);
        this.retired.splice(i, 1);
      }
    }
    const d = this.deck;
    if (!d) {
      if (this.desired) this.switchDeck(now, true);
      return;
    }
    d.clock.resync(now);
    let guard = 0;
    while (this.deck === d && d.clock.due(now, LOOKAHEAD) && guard++ < 4) {
      if (this.desired !== d.style) {
        // cambio di fascia oraria in "auto": dissolvenza incrociata a confine di battuta
        this.switchDeck(d.clock.nextTime, false);
        break;
      }
      this.scheduleBar(d, d.clock.advance());
    }
    if (this.deck && this.deck !== d) this.update(now);
  }

  private scheduleBar(d: Deck, slot: BarSlot): void {
    const def = STYLES[d.style];
    if (d.barInSection === 0 || !d.section) {
      const plan = planSection(this.progress[d.style]);
      d.section = generateSection(d.style, this.seed, plan.material, plan.variation);
      this.progress[d.style]++;
      this.stats.sections++;
    }
    const section = d.section;
    const bar = d.barInSection;
    d.barInSection = (bar + 1) % section.bars;
    this.stats.bars++;

    const mix = layerMix(this.timeOfDay, this.mix);
    const density = mix.density * (1 - 0.6 * this.focus);
    const trim = STYLE_TRIM[d.style];
    for (const layer of LAYERS) {
      const lv = def.levels[layer] * mix[layer] * (1 - FOCUS_CUT[layer] * this.focus);
      this.level[layer] = lv;
      d.layers[layer].gain.setTargetAtTime(lv * LAYER_GAIN[layer] * trim, slot.time, slot.duration * 0.2);
    }
    d.send.gain.setTargetAtTime(0.35 + 0.65 * mix.reverb, slot.time, slot.duration * 0.25);
    // il crackle segue la presenza della musica: di notte e in focus quasi sparisce
    const crackle = this.crackleOn ? 0.11 * (0.25 + 0.75 * mix.density) * (1 - 0.7 * this.focus) : 0;
    this.crackleGain.gain.setTargetAtTime(crackle, slot.time, 0.6);
    this.applyTone(slot.duration * 0.3);

    const padCutoff = 520 + 1100 * mix.brightness;
    const b0 = bar * BEATS_PER_BAR;
    for (const n of section.barNotes[bar]) {
      if (this.level[n.layer] < 0.02 || !passesDensity(n.weight, density)) continue;
      const jitter = (this.rnd() - 0.5) * 0.012;
      const t = Math.max(slot.time, slot.time + swingBeat(n.beat - b0, def.swing) * slot.spb + jitter);
      const vel = n.vel * (0.93 + this.rnd() * 0.14);
      this.playNote(d, n, t, vel, n.dur * slot.spb, slot.spb, padCutoff);
      this.stats.notes[n.layer]++;
    }
    for (const e of section.barDrums[bar]) {
      const layer = DRUM_LAYER[e.kind];
      if (this.level[layer] < 0.02 || !passesDensity(e.weight, density)) continue;
      const jitter = (this.rnd() - 0.5) * 0.006;
      const t = Math.max(slot.time, slot.time + swingBeat(e.beat - b0, def.swing) * slot.spb + jitter);
      drum(d.kits[layer], t, e.kind, e.vel * (0.9 + this.rnd() * 0.2));
      this.stats.notes[layer]++;
    }
  }

  private playNote(d: Deck, n: NoteEvent, t: number, vel: number, dur: number, spb: number, padCutoff: number): void {
    const k = d.kits[n.layer];
    switch (n.layer) {
      case 'melody':
        switch (d.style) {
          case 'island_lofi':
            pluckString(k, t, 'nylon', n.midi, vel);
            break;
          case 'thai_khim':
            pluckString(k, t, 'khim', n.midi, vel * 0.85);
            if (n.dur >= 1.5) {
              // tremolo del khim sulle note lunghe: ribattuti rapidi che si spengono
              const step = spb / 6;
              const count = Math.floor((dur * 0.6) / step);
              for (let i = 1; i <= count; i++) {
                pluckString(k, t + i * step, 'khim', n.midi, vel * (0.4 - 0.2 * (i / count)));
              }
            }
            break;
          case 'sunset_ambient':
            if ((d.section?.material ?? 0) % 2 === 0) flute(k, t, n.midi, vel * 0.5, dur);
            else bell(k, t, n.midi, vel * 0.6, 2.6);
            break;
          case 'beach_groove':
            marimba(k, t, n.midi, vel * 0.9);
            break;
        }
        break;
      case 'counter':
        if (d.style === 'thai_khim') marimba(k, t, n.midi, vel);
        else if (d.style === 'sunset_ambient') bell(k, t, n.midi, vel * 0.7, 2.4);
        else pluckString(k, t, 'khim', n.midi, vel);
        break;
      case 'keys':
        if (d.style === 'beach_groove') skank(k, t, n.midi, vel);
        else if (d.style === 'sunset_ambient') pluckString(k, t, 'nylon', n.midi, vel * 1.6);
        else rhodes(k, t, n.midi, vel, dur);
        break;
      case 'pad':
        pad(k, t, n.midi, vel, dur, padCutoff);
        break;
      case 'bass':
        bass(k, t, n.midi, vel, dur, d.style === 'beach_groove' ? 1 : d.style === 'island_lofi' ? 0.4 : 0);
        break;
      case 'drums':
      case 'perc':
        break;
    }
  }

  dispose(): void {
    if (this.deck) this.disposeDeck(this.deck);
    for (const d of this.retired) this.disposeDeck(d);
    this.retired.length = 0;
    this.deck = null;
    this.wowLfo.stop();
    this.crackle.stop();
    for (const n of [this.mixIn, this.wow, this.wowLfo, this.wowDepth, this.toneLp, this.duck, this.reverb, this.reverbOut, this.crackle, this.crackleGain]) {
      n.disconnect();
    }
  }
}
