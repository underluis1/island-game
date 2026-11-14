/**
 * Sintesi delle "voci" a sillabe. Una frase intera usa una sola catena di nodi (sorgente glottale →
 * due formanti in parallelo → inviluppo) pilotata da automazioni: una manciata di nodi per frase,
 * qualunque sia la lunghezza del testo.
 */
import { liveCounter, noiseSource } from './common';
import { FORMANTS, type SpeechPlan, type VoiceProfile } from './voice-text';

export interface Utterance {
  stop(): void;
  /** istante di fine sul clock del contesto */
  end: number;
  /** chiamata una sola volta alla fine naturale (non dopo stop) */
  onDone: (() => void) | null;
  done: boolean;
}

export function speakPlan(
  ctx: BaseAudioContext,
  out: AudioNode,
  plan: SpeechPlan,
  profile: VoiceProfile,
  t0: number,
): Utterance {
  const osc = ctx.createOscillator();
  osc.type = profile.wave;
  const f1 = ctx.createBiquadFilter();
  const f2 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f2.type = 'bandpass';
  f1.Q.value = 4.5;
  f2.Q.value = 7;
  const f2g = ctx.createGain();
  f2g.gain.value = 0.7;
  // un filo di fondamentale diretta dà corpo alla voce
  const chest = ctx.createBiquadFilter();
  chest.type = 'lowpass';
  chest.frequency.value = profile.pitch * 2.2;
  const chestG = ctx.createGain();
  chestG.gain.value = 0.16;
  const env = ctx.createGain();
  env.gain.value = 0;
  const hiss = noiseSource(ctx, 'white');
  const hissF = ctx.createBiquadFilter();
  hissF.type = 'bandpass';
  hissF.frequency.value = 3800 * profile.formant;
  hissF.Q.value = 0.8;
  const hissG = ctx.createGain();
  hissG.gain.value = 0;
  const tilt = ctx.createBiquadFilter();
  tilt.type = 'lowpass';
  tilt.frequency.value = profile.tilt;
  tilt.Q.value = 0.5;
  const master = ctx.createGain();
  master.gain.value = profile.gain * 1.3;

  osc.connect(f1);
  osc.connect(f2);
  osc.connect(chest);
  f1.connect(env);
  f2.connect(f2g);
  f2g.connect(env);
  chest.connect(chestG);
  chestG.connect(env);
  env.connect(tilt);
  hiss.connect(hissF);
  hissF.connect(hissG);
  hissG.connect(tilt);
  tilt.connect(master);
  master.connect(out);

  for (const s of plan.syllables) {
    const t = t0 + s.t;
    const f = profile.pitch * Math.pow(2, s.semis / 12);
    const [v1, v2] = FORMANTS[s.vowel];
    const F1 = v1 * profile.formant;
    const F2 = v2 * profile.formant;
    // la consonante occupa l'attacco: scoppio o soffio di rumore, poi parte la vocale
    const lead = s.cons === 1 ? 0.014 : s.cons === 2 ? 0.03 : 0;
    if (s.cons === 1) {
      hissG.gain.setValueAtTime(0, t);
      hissG.gain.linearRampToValueAtTime(0.45 * s.gain, t + 0.003);
      hissG.gain.linearRampToValueAtTime(0, t + 0.018);
    } else if (s.cons === 2) {
      hissG.gain.setValueAtTime(0, t);
      hissG.gain.linearRampToValueAtTime(0.22 * s.gain, t + 0.01);
      hissG.gain.linearRampToValueAtTime(0, t + 0.04);
    }
    osc.frequency.setValueAtTime(f * 0.965, t);
    osc.frequency.linearRampToValueAtTime(f, t + s.dur * 0.35);
    if (s.cons === 3) {
      // nasale/liquida: la bocca si apre gradualmente
      f1.frequency.setValueAtTime(260, t);
      f1.frequency.linearRampToValueAtTime(F1, t + 0.035);
    } else {
      f1.frequency.setValueAtTime(F1, t);
    }
    f2.frequency.setValueAtTime(F2, t);
    const a = t + lead;
    const peak = 0.9 * s.gain;
    const rel = t + s.dur * 0.94;
    env.gain.setValueAtTime(0, a);
    env.gain.linearRampToValueAtTime(peak, a + 0.012);
    env.gain.setValueAtTime(peak, Math.max(a + 0.013, t + s.dur * 0.55));
    env.gain.linearRampToValueAtTime(0, Math.max(a + 0.02, rel));
  }

  const end = t0 + plan.duration;
  const nodes: AudioNode[] = [f1, f2, f2g, chest, chestG, env, hiss, hissF, hissG, tilt, master];
  const utt: Utterance = {
    end,
    onDone: null,
    done: false,
    stop: () => {
      if (utt.done) return;
      utt.done = true;
      utt.onDone = null;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0, now, 0.012);
      try {
        osc.stop(now + 0.08);
        hiss.stop(now + 0.08);
      } catch {
        // già fermati
      }
    },
  };
  const live = liveCounter(ctx);
  live.count++;
  osc.onended = () => {
    live.count--;
    osc.disconnect();
    for (const n of nodes) n.disconnect();
    const cb = utt.onDone;
    utt.done = true;
    utt.onDone = null;
    cb?.();
  };
  osc.start(t0);
  hiss.start(t0);
  osc.stop(end + 0.02);
  hiss.stop(end + 0.02);
  return utt;
}
