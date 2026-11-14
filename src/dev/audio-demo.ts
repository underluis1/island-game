/**
 * Banco di prova dell'audio (solo sviluppo): pulsanti per ogni SFX/loop/voce, radio, mixer, slider
 * dell'ambiente. Espone anche `window.__audioTest`, usato da `scripts/audio-check.mjs` per rendere
 * tutto con OfflineAudioContext e misurare i segnali in modo oggettivo.
 */
import {
  type Metrics,
  analyze,
  bandFraction,
  centroidOf,
  countOnsets,
  estimatePitch,
  mixdown,
  powerSpectrum,
  countStrongAttacks,
  rmsOf,
} from '../audio/analysis';
import { renderBabble } from '../audio/ambience';
import { mulberry } from '../audio/common';
import { renderString } from '../audio/instruments';
import { generateSection } from '../audio/music-theory';
import {
  type AudioDebugStats,
  AudioEngine,
  type AudioEnv,
  type AudioVolumes,
  LOOP_NAMES,
  type LoopName,
  RADIO_STATIONS,
  type RadioStation,
  SFX_NAMES,
  type SfxName,
  type VoiceId,
} from '../audio/engine';
import { SFX, triggerSfx } from '../audio/sfx';
import { VOICE_IDS } from '../audio/voice-text';

const SR = 44100;

// ---------------------------------------------------------------------------------------------
// Rendering offline e misure
// ---------------------------------------------------------------------------------------------

function channelsOf(buf: AudioBuffer): Float32Array[] {
  const out: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) out.push(buf.getChannelData(c));
  return out;
}

interface SfxReport extends Metrics {
  name: string;
  /** impronta del segnale: semi diversi devono dare impronte diverse */
  print: number;
}

/** Un SFX reso da solo (senza master), con il suo guadagno di missaggio. */
async function renderSfx(name: SfxName, seed = 1, seconds = 6): Promise<SfxReport> {
  const ctx = new OfflineAudioContext(2, SR * seconds, SR);
  triggerSfx(ctx, ctx.destination, name, 0.02, mulberry(seed));
  const buf = await ctx.startRendering();
  const ch = channelsOf(buf);
  const m = analyze(ch, SR);
  let print = 0;
  const x = ch[0];
  for (let i = 0; i < x.length; i += 7) print = (print * 31 + Math.round(x[i] * 1e5)) | 0;
  return { name, print, ...m };
}

interface SceneStep {
  at: number;
  env?: Partial<AudioEnv>;
  focus?: number;
  paused?: boolean;
  station?: RadioStation;
  sfx?: SfxName;
  loop?: [LoopName, boolean, number?];
  speak?: [string, VoiceId];
  volumes?: Partial<AudioVolumes>;
}

interface SceneOptions {
  seconds: number;
  seed?: number;
  station?: RadioStation;
  volumes?: Partial<AudioVolumes>;
  env?: Partial<AudioEnv>;
  focus?: number;
  steps?: SceneStep[];
  /** finestre [da, a] in secondi da misurare a parte */
  windows?: [number, number][];
  /** intervallo [min, max] Hz per la stima dell'altezza nelle finestre */
  pitchRange?: [number, number];
}

interface WindowReport {
  from: number;
  to: number;
  rms: number;
  centroid: number;
  onsets: number;
  /** attacchi forti al secondo (sensibile al livello: misura quanto è "ritmata" la musica) */
  attacks: number;
  /** frazione d'energia: <150 Hz, 150-1k, 1k-3.5k, 3.5k-5.5k, >5.5k */
  bands: number[];
  pitch: number;
}

interface SceneReport extends Metrics {
  onsets: number;
  windows: WindowReport[];
  stats: AudioDebugStats;
  /** correlazione sinistra/destra (1 = mono) */
  stereo: number;
  /** eventi "ended"/onDone ricevuti dalle voci */
  spoken: number;
}

const DEFAULT_ENV: AudioEnv = { timeOfDay: 12, rain: 0, wind: 0.25, boat: 0, crowd: 0, indoors: 0 };
const DEFAULT_VOL: AudioVolumes = { master: 0.8, music: 0.6, ambience: 0.7, sfx: 0.9, voice: 0.8 };
const BANDS: [number, number][] = [
  [20, 150],
  [150, 1000],
  [1000, 3500],
  [3500, 5500],
  [5500, 20000],
];

function windowReport(x: Float32Array, from: number, to: number, pr: [number, number]): WindowReport {
  const a = Math.floor(from * SR);
  const b = Math.min(x.length, Math.floor(to * SR));
  const spec = powerSpectrum(x, 4096, a, b);
  return {
    from,
    to,
    rms: rmsOf(x, a, b),
    centroid: centroidOf(spec, SR),
    onsets: countOnsets(x.subarray(a, b), SR),
    attacks: countStrongAttacks(x, SR, 0.02, a, b) / Math.max(0.001, to - from),
    bands: BANDS.map(([f0, f1]) => bandFraction(spec, SR, f0, f1)),
    pitch: estimatePitch(x, SR, pr[0], pr[1], a, Math.min(b, a + SR * 0.6)),
  };
}

/**
 * Rende una scena con il motore completo su OfflineAudioContext. Il rendering viene sospeso ogni
 * 100 ms per chiamare `engine.update()`: è lo stesso scheduler lookahead usato in tempo reale.
 */
async function renderScene(o: SceneOptions): Promise<SceneReport> {
  const ctx = new OfflineAudioContext(2, Math.floor(SR * o.seconds), SR);
  const engine = new AudioEngine({ context: ctx, seed: o.seed ?? 1234, station: o.station ?? 'auto' });
  const env: AudioEnv = { ...DEFAULT_ENV, ...o.env };
  const vol: AudioVolumes = { ...DEFAULT_VOL, ...o.volumes };
  engine.setVolumes(vol);
  engine.setEnvironment(env);
  if (o.focus !== undefined) engine.setFocus(o.focus);
  const steps = (o.steps ?? []).slice().sort((p, q) => p.at - q.at);
  let spoken = 0;
  let next = 0;
  const apply = (t: number): void => {
    while (next < steps.length && steps[next].at <= t + 1e-6) {
      const s = steps[next++];
      if (s.env) {
        Object.assign(env, s.env);
        engine.setEnvironment(env);
      }
      if (s.volumes) {
        Object.assign(vol, s.volumes);
        engine.setVolumes(vol);
      }
      if (s.focus !== undefined) engine.setFocus(s.focus);
      if (s.paused !== undefined) engine.setPaused(s.paused);
      if (s.station) engine.setStation(s.station);
      if (s.sfx) engine.sfx(s.sfx);
      if (s.loop) engine.loop(s.loop[0], s.loop[1], s.loop[2]);
      if (s.speak) engine.speak(s.speak[0], s.speak[1], { onDone: () => spoken++ });
    }
  };
  const dt = 0.1;
  apply(0);
  engine.update(0);
  for (let t = dt; t < o.seconds - 0.01; t += dt) {
    const at = t;
    void ctx.suspend(at).then(() => {
      apply(at);
      // l'ambiente interpola da sé: ripetiamo l'ultimo stato come farebbe il gioco a ogni frame
      engine.setEnvironment(env);
      engine.update(dt);
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const ch = channelsOf(buf);
  const x = mixdown(ch);
  let lr = 0;
  let ll = 0;
  let rr = 0;
  for (let i = 0; i < ch[0].length; i++) {
    lr += ch[0][i] * ch[1][i];
    ll += ch[0][i] * ch[0][i];
    rr += ch[1][i] * ch[1][i];
  }
  // gli eventi 'ended' delle sorgenti arrivano dopo il rendering: lasciamo svuotare la coda
  await new Promise((r) => setTimeout(r, 120));
  const stats = JSON.parse(JSON.stringify(engine.debugStats())) as AudioDebugStats;
  return {
    ...analyze(ch, SR),
    onsets: countOnsets(x, SR),
    windows: (o.windows ?? []).map(([a, b]) => windowReport(x, a, b, o.pitchRange ?? [70, 450])),
    stats,
    stereo: lr / Math.sqrt(ll * rr + 1e-12),
    spoken,
  };
}

const testApi = {
  sfxNames: SFX_NAMES,
  sfxInfo: Object.fromEntries(SFX_NAMES.map((n) => [n, { vary: SFX[n].vary, max: SFX[n].max, gap: SFX[n].gap }])),
  loopNames: LOOP_NAMES,
  voiceIds: VOICE_IDS,
  stations: RADIO_STATIONS,
  renderSfx,
  renderScene,
  /** costo sul main thread (ms) delle generazioni procedurali più pesanti */
  timings: (): { build: number; babble: number; section: number; strings: number } => {
    const ctx = new OfflineAudioContext(2, SR, SR);
    let t = performance.now();
    const eng = new AudioEngine({ context: ctx, seed: 5 });
    const build = performance.now() - t;
    eng.dispose();
    t = performance.now();
    renderBabble(16000, 7, 6, 0xc0ffee);
    const babble = performance.now() - t;
    t = performance.now();
    for (let i = 0; i < 20; i++) generateSection('beach_groove', 5, i, 1);
    const section = (performance.now() - t) / 20;
    t = performance.now();
    for (let m = 60; m < 80; m++) renderString('khim', m);
    const strings = (performance.now() - t) / 20;
    return { build, babble, section, strings };
  },
  /** durata pianificata di una frase, senza suonarla */
  speakDuration: (text: string, voice: VoiceId): number => new AudioEngine().speak(text, voice).duration,
};

// ---------------------------------------------------------------------------------------------
// Pannello interattivo
// ---------------------------------------------------------------------------------------------

const engine = new AudioEngine();
const env: AudioEnv = { ...DEFAULT_ENV, timeOfDay: 9 };
const volumes: AudioVolumes = { ...DEFAULT_VOL };
const loopsOn = new Set<LoopName>();
let intensity = 0.6;
let paused = false;

declare global {
  interface Window {
    __audioTest: typeof testApi;
    __audio: AudioEngine;
  }
}
window.__audioTest = testApi;
window.__audio = engine;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function button(parent: HTMLElement, label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => {
    void engine.unlock();
    onClick(b);
  });
  parent.appendChild(b);
  return b;
}

function slider(parent: HTMLElement, label: string, min: number, max: number, value: number, onInput: (v: number) => void): void {
  const row = document.createElement('label');
  row.className = 'row';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String((max - min) / 200);
  input.value = String(value);
  const out = document.createElement('output');
  out.textContent = value.toFixed(2);
  input.addEventListener('input', () => {
    out.textContent = Number(input.value).toFixed(2);
    onInput(Number(input.value));
  });
  row.append(label, input, out);
  parent.appendChild(row);
}

const SFX_GROUPS: [string, RegExp][] = [
  ['Viti', /^screw_/],
  ['Apertura e parti', /^(suction|adhesive|pick|connector|part|display|pulltab)_/],
  ['Danni', /^(glass_crack|spark|damage)$/],
  ['Pulizia e saldatura', /^(brush|air_blast|ipa_drip|toothpick|solder_tick|chip_place)$/],
  ['Diagnostica e telefono', /^(multimeter|phone|camera_shutter|test)_?/],
  ['Economia', /^(cash|coins|order_notify|customer_bell|purchase|delivery|sell|review_)/],
  ['Interfaccia', /^(ui_|error$|success$|star$|unlock$|day_|tool_select$|flashlight$|camera_whoosh$|radio_tune$)/],
  ['Negozio e mondo', /./],
];

function buildPanel(): void {
  const sfxRoot = $('sfx');
  const remaining = new Set(SFX_NAMES);
  for (const [title, re] of SFX_GROUPS) {
    const names = [...remaining].filter((n) => re.test(n));
    if (!names.length) continue;
    const h = document.createElement('h3');
    h.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const n of names) {
      remaining.delete(n);
      button(grid, n, () => engine.sfx(n));
    }
    sfxRoot.append(h, grid);
  }

  const stationButtons: HTMLButtonElement[] = [];
  for (const s of RADIO_STATIONS) {
    stationButtons.push(
      button($('stations'), s, () => {
        engine.setStation(s);
        refreshStations();
      }),
    );
  }
  const refreshStations = (): void => {
    stationButtons.forEach((b, i) => b.classList.toggle('on', RADIO_STATIONS[i] === engine.station));
  };
  button($('stations'), 'successiva ›', () => {
    engine.nextStation();
    refreshStations();
  });
  refreshStations();

  for (const key of ['master', 'music', 'ambience', 'sfx', 'voice'] as (keyof AudioVolumes)[]) {
    slider($('volumes'), key, 0, 1, volumes[key], (v) => {
      volumes[key] = v;
      engine.setVolumes(volumes);
    });
  }
  const focus = $<HTMLInputElement>('focus');
  focus.addEventListener('input', () => engine.setFocus(Number(focus.value)));

  slider($('env'), 'ora del giorno', 0, 24, env.timeOfDay, (v) => (env.timeOfDay = v % 24));
  for (const key of ['rain', 'wind', 'boat', 'crowd', 'indoors'] as (keyof AudioEnv)[]) {
    slider($('env'), key, 0, 1, env[key], (v) => (env[key] = v));
  }

  for (const name of LOOP_NAMES) {
    button($('loops'), name, (b) => {
      if (loopsOn.has(name)) loopsOn.delete(name);
      else loopsOn.add(name);
      b.classList.toggle('on', loopsOn.has(name));
      if (!loopsOn.has(name)) engine.loop(name, false);
    });
  }
  const inten = $<HTMLInputElement>('intensity');
  inten.addEventListener('input', () => (intensity = Number(inten.value)));

  for (const v of VOICE_IDS) {
    button($('voices'), v, () => engine.speak($<HTMLInputElement>('line').value, v));
  }

  $('unlock').addEventListener('click', () => {
    void engine.unlock().then(() => engine.setVolumes(volumes));
  });
  $('pause').addEventListener('click', () => {
    paused = !paused;
    engine.setPaused(paused);
    $('pause').classList.toggle('on', paused);
  });
}

let analyser: AnalyserNode | null = null;
let scope: Float32Array<ArrayBuffer> | null = null;
let peakHold = 0;

function drawMeter(): void {
  const canvas = $<HTMLCanvasElement>('meter');
  const g = canvas.getContext('2d');
  if (!g) return;
  if (!analyser && engine.unlocked) {
    analyser = engine.createAnalyser(1024);
    if (analyser) scope = new Float32Array(analyser.fftSize);
  }
  g.fillStyle = '#20302f';
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (!analyser || !scope) return;
  analyser.getFloatTimeDomainData(scope);
  let sum = 0;
  let peak = 0;
  g.strokeStyle = '#5fe0d2';
  g.beginPath();
  for (let i = 0; i < scope.length; i++) {
    const v = scope[i];
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
    const x = (i / scope.length) * canvas.width;
    const y = canvas.height / 2 - v * canvas.height * 0.48;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  peakHold = Math.max(peak, peakHold * 0.97);
  const rms = Math.sqrt(sum / scope.length);
  g.fillStyle = peakHold > 0.9 ? '#ff8a6a' : '#ffd66b';
  g.fillRect(0, canvas.height - 5, Math.min(1, peakHold) * canvas.width, 5);
  const st = engine.debugStats();
  $('status').textContent =
    `rms ${rms.toFixed(3)} · picco ${peakHold.toFixed(2)} · voci ${st.liveVoices} · loop ${st.activeLoops}` +
    ` · ${st.music?.style ?? 'radio spenta'} · battute ${st.music?.bars ?? 0}`;
}

let lastFrame = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  engine.setEnvironment(env);
  for (const name of loopsOn) engine.loop(name, true, intensity);
  engine.update(dt);
  drawMeter();
  requestAnimationFrame(frame);
}

buildPanel();
requestAnimationFrame(frame);
