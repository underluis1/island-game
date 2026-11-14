/**
 * Motore audio di Island Fix: mixer a bus (musica, ambiente, SFX, voci → master con compressore
 * morbido e soft-clip), SFX one-shot, loop degli strumenti, musica procedurale adattiva con radio,
 * ambiente, voci a sillabe. Tutto sintetizzato con Web Audio API, nessun file audio.
 *
 * L'AudioContext nasce solo in `unlock()` (policy autoplay di Chrome). Per test e rendering offline
 * si può passare un `BaseAudioContext` esistente (anche `OfflineAudioContext`) al costruttore.
 */
import { Ambience, type AmbienceStats } from './ambience';
import { type Rnd, clamp01, liveCounter, mulberry, softClipCurve } from './common';
import { LOOP_NAMES, LoopBank } from './loops';
import { MusicPlayer, type MusicStats } from './music';
import { type StyleId, autoStyle } from './music-theory';
import { SFX, SFX_NAMES, triggerSfx } from './sfx';
import type { AudioEnv, AudioVolumes, LoopName, RadioStation, SfxName, SfxOptions, VoiceId } from './types';
import { VOICES, planSpeech } from './voice-text';
import { type Utterance, speakPlan } from './voices';

export type { AudioEnv, AudioVolumes, LoopName, RadioStation, SfxName, SfxOptions, VoiceId } from './types';
export { SFX_NAMES, LOOP_NAMES };

export const RADIO_STATIONS: RadioStation[] = ['auto', 'island_lofi', 'thai_khim', 'sunset_ambient', 'beach_groove', 'off'];

export interface AudioEngineOptions {
  /** contesto esistente (es. OfflineAudioContext per test/rendering): il motore è subito "sbloccato" */
  context?: BaseAudioContext;
  /** seme della musica e delle variazioni: stesso seme ⇒ stessa musica */
  seed?: number;
  /** stazione radio iniziale (default 'auto') */
  station?: RadioStation;
}

export interface AudioDebugStats {
  /** sorgenti one-shot ancora vive */
  liveVoices: number;
  activeLoops: number;
  music: MusicStats | null;
  ambience: AmbienceStats | null;
}

interface Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  clip: WaveShaperNode;
  music: GainNode;
  ambience: GainNode;
  ambDuck: GainNode;
  sfx: GainNode;
  loopDuck: GainNode;
  voice: GainNode;
  player: MusicPlayer;
  amb: Ambience;
  loops: LoopBank;
}

const MAX_UTTERANCES = 3;

function isRealtime(ctx: BaseAudioContext): ctx is AudioContext {
  return typeof AudioContext !== 'undefined' && ctx instanceof AudioContext;
}

export class AudioEngine {
  private g: Graph | null = null;
  private readonly external: BaseAudioContext | null;
  private readonly seed: number;
  private readonly rnd: Rnd;
  private unlocking: Promise<void> | null = null;
  private disposed = false;

  private volumes: AudioVolumes = { master: 0.8, music: 0.6, ambience: 0.7, sfx: 0.9, voice: 0.8 };
  private env: AudioEnv = { timeOfDay: 9, rain: 0, wind: 0.25, boat: 0, crowd: 0, indoors: 0 };
  private _station: RadioStation = 'auto';
  private focus = 0;
  private paused = false;

  private readonly sfxEnds = new Map<SfxName, number[]>();
  private readonly sfxLast = new Map<SfxName, number>();
  private readonly utterances: { voice: VoiceId; utt: Utterance }[] = [];

  constructor(opts?: AudioEngineOptions) {
    this.seed = (opts?.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.rnd = mulberry(this.seed ^ 0x5f3759df);
    this.external = opts?.context ?? null;
    if (opts?.station && RADIO_STATIONS.includes(opts.station)) this._station = opts.station;
    if (this.external) this.build(this.external);
  }

  get unlocked(): boolean {
    return this.g !== null;
  }

  /** Contesto audio in uso (null prima di `unlock`). */
  get context(): BaseAudioContext | null {
    return this.g?.ctx ?? null;
  }

  get station(): RadioStation {
    return this._station;
  }

  /** Da chiamare al primo gesto dell'utente. Idempotente. */
  unlock(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.g) {
      const ctx = this.g.ctx;
      if (isRealtime(ctx) && ctx.state === 'suspended') return ctx.resume().catch(() => undefined);
      return Promise.resolve();
    }
    if (this.unlocking) return this.unlocking;
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return Promise.resolve();
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.build(ctx);
    this.unlocking = ctx
      .resume()
      .catch(() => undefined)
      .then(() => {
        this.unlocking = null;
      });
    return this.unlocking;
  }

  private build(ctx: BaseAudioContext): void {
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 14;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = '2x';
    master.connect(comp);
    comp.connect(clip);
    clip.connect(ctx.destination);

    const music = ctx.createGain();
    const ambience = ctx.createGain();
    const ambDuck = ctx.createGain();
    const sfx = ctx.createGain();
    const loopDuck = ctx.createGain();
    const voice = ctx.createGain();
    music.connect(master);
    ambDuck.connect(ambience);
    ambience.connect(master);
    sfx.connect(master);
    loopDuck.connect(sfx);
    voice.connect(master);

    const player = new MusicPlayer(ctx, music, this.seed);
    const amb = new Ambience(ctx, ambDuck, this.seed);
    const loops = new LoopBank(ctx, loopDuck, this.seed);
    this.g = { ctx, master, comp, clip, music, ambience, ambDuck, sfx, loopDuck, voice, player, amb, loops };

    this.applyVolumes(0);
    amb.setEnvironment(this.env);
    player.setTimeOfDay(this.env.timeOfDay);
    player.setFocus(this.focus);
    player.setPaused(this.paused);
    this.applyPause(0);
    player.setStyle(this.resolveStyle(), true);
  }

  private resolveStyle(): StyleId | null {
    if (this._station === 'off') return null;
    if (this._station === 'auto') return autoStyle(this.env.timeOfDay);
    return this._station;
  }

  // --- mixer ------------------------------------------------------------------------------

  setVolumes(v: AudioVolumes): void {
    this.volumes = {
      master: clamp01(v.master),
      music: clamp01(v.music),
      ambience: clamp01(v.ambience),
      sfx: clamp01(v.sfx),
      voice: clamp01(v.voice),
    };
    this.applyVolumes(0.03);
  }

  private applyVolumes(tau: number): void {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    const v = this.volumes;
    // curva quadratica: lo slider risponde in modo percettivamente uniforme
    const pairs: [GainNode, number][] = [
      [g.master, v.master * v.master * 1.25],
      [g.music, v.music * v.music * 1.6],
      [g.ambience, v.ambience * v.ambience * 1.3],
      [g.sfx, v.sfx * v.sfx * 1.1],
      [g.voice, v.voice * v.voice * 1.2],
    ];
    for (const [node, val] of pairs) {
      if (tau > 0) node.gain.setTargetAtTime(val, now, tau);
      else node.gain.setValueAtTime(val, now);
    }
  }

  private applyPause(tau: number): void {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    const amb = this.paused ? 0.35 : 1;
    const loop = this.paused ? 0 : 1;
    if (tau > 0) {
      g.ambDuck.gain.setTargetAtTime(amb, now, tau);
      g.loopDuck.gain.setTargetAtTime(loop, now, tau);
    } else {
      g.ambDuck.gain.setValueAtTime(amb, now);
      g.loopDuck.gain.setValueAtTime(loop, now);
    }
  }

  // --- SFX --------------------------------------------------------------------------------

  /** Sicuro prima di `unlock` (no-op) e a raffica (limite di voci e intervallo minimo per nome). */
  sfx(name: SfxName, opts?: SfxOptions): void {
    const g = this.g;
    if (!g) return;
    const def = SFX[name];
    if (!def) return;
    const { ctx } = g;
    if (isRealtime(ctx) && ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const last = this.sfxLast.get(name);
    if (last !== undefined && now - last < def.gap) return;
    let ends = this.sfxEnds.get(name);
    if (!ends) {
      ends = [];
      this.sfxEnds.set(name, ends);
    }
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= now) ends.splice(i, 1);
    if (ends.length >= def.max) return;
    this.sfxLast.set(name, now);
    ends.push(triggerSfx(ctx, g.sfx, name, now + 0.004, this.rnd, opts));
  }

  /** Suono continuo di uno strumento; richiamabile a ogni frame per aggiornare `intensity`. */
  loop(name: LoopName, on: boolean, intensity = 1): void {
    this.g?.loops.set(name, on, intensity);
  }

  // --- ambiente e musica ------------------------------------------------------------------

  /** Richiamabile a ogni frame: i parametri vengono lisciati e applicati in `update`. */
  setEnvironment(env: AudioEnv): void {
    const e = this.env;
    e.timeOfDay = env.timeOfDay;
    e.rain = env.rain;
    e.wind = env.wind;
    e.boat = env.boat;
    e.crowd = env.crowd;
    e.indoors = env.indoors;
    const g = this.g;
    if (!g) return;
    g.amb.setEnvironment(e);
    g.player.setTimeOfDay(e.timeOfDay);
    if (this._station === 'auto') g.player.setStyle(autoStyle(e.timeOfDay), false);
  }

  setStation(s: RadioStation): void {
    if (!RADIO_STATIONS.includes(s) || s === this._station) return;
    this._station = s;
    const g = this.g;
    if (!g) return;
    this.sfx('radio_tune');
    g.player.setStyle(this.resolveStyle(), true);
  }

  nextStation(): RadioStation {
    const i = RADIO_STATIONS.indexOf(this._station);
    const next = RADIO_STATIONS[(i + 1) % RADIO_STATIONS.length];
    this.setStation(next);
    return next;
  }

  /** 0..1: durante le riparazioni delicate la musica si abbassa, si scurisce e perde layer. */
  setFocus(amount: number): void {
    const f = clamp01(amount);
    if (f === this.focus) return;
    this.focus = f;
    this.g?.player.setFocus(f);
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.g?.player.setPaused(paused);
    this.applyPause(0.12);
  }

  // --- voci -------------------------------------------------------------------------------

  /**
   * "Voce" a sillabe sintetizzate. `duration` è nota subito (utile per sincronizzare il testo);
   * `onDone` scatta alla fine naturale, non dopo `stop()`. Prima di `unlock` non suona nulla ma
   * `onDone` arriva comunque dopo `duration`.
   */
  speak(text: string, voice: VoiceId, opts?: { onDone?: () => void }): { stop(): void; duration: number } {
    const profile = VOICES[voice] ?? VOICES.customer_a;
    const plan = planSpeech(text, profile);
    const g = this.g;
    const silent = !g || plan.syllables.length === 0 || (isRealtime(g.ctx) && g.ctx.state !== 'running');
    if (silent) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      if (opts?.onDone) timer = setTimeout(opts.onDone, plan.duration * 1000);
      return {
        duration: plan.duration,
        stop: () => {
          if (timer !== null) clearTimeout(timer);
          timer = null;
        },
      };
    }
    // una voce non si sovrappone a se stessa; al massimo MAX_UTTERANCES frasi insieme
    for (let i = this.utterances.length - 1; i >= 0; i--) {
      const u = this.utterances[i];
      if (u.utt.done) this.utterances.splice(i, 1);
      else if (u.voice === voice) {
        u.utt.stop();
        this.utterances.splice(i, 1);
      }
    }
    while (this.utterances.length >= MAX_UTTERANCES) this.utterances.shift()?.utt.stop();
    const utt = speakPlan(g.ctx, g.voice, plan, profile, g.ctx.currentTime + 0.01);
    utt.onDone = opts?.onDone ?? null;
    this.utterances.push({ voice, utt });
    return { duration: plan.duration, stop: () => utt.stop() };
  }

  // --- ciclo ------------------------------------------------------------------------------

  /** Scheduler lookahead di musica e ambiente: da chiamare a ogni frame. */
  update(dt: number): void {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    g.player.update(now);
    g.amb.update(now, dt);
    g.loops.update(now);
  }

  /** Analizzatore sull'uscita finale (VU meter della radio, test). Va scollegato da chi lo crea. */
  createAnalyser(fftSize = 2048): AnalyserNode | null {
    const g = this.g;
    if (!g) return null;
    const an = g.ctx.createAnalyser();
    an.fftSize = fftSize;
    g.clip.connect(an);
    return an;
  }

  debugStats(): AudioDebugStats {
    const g = this.g;
    return {
      liveVoices: g ? liveCounter(g.ctx).count : 0,
      activeLoops: g?.loops.active ?? 0,
      // copie: chi le riceve può confrontare due istantanee nel tempo
      music: g ? { ...g.player.stats, notes: { ...g.player.stats.notes } } : null,
      ambience: g ? { ...g.amb.stats, layers: [...g.amb.stats.layers] } : null,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const u of this.utterances) u.utt.stop();
    this.utterances.length = 0;
    const g = this.g;
    if (!g) return;
    g.player.dispose();
    g.amb.dispose();
    g.loops.dispose();
    for (const n of [g.master, g.comp, g.clip, g.music, g.ambience, g.ambDuck, g.sfx, g.loopDuck, g.voice]) n.disconnect();
    if (!this.external && isRealtime(g.ctx)) void g.ctx.close().catch(() => undefined);
    this.g = null;
  }
}
