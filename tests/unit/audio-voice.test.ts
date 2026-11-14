import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, LOOP_NAMES, RADIO_STATIONS, SFX_NAMES } from '../../src/audio/engine';
import { SFX } from '../../src/audio/sfx';
import { FORMANTS, VOICES, VOICE_IDS, planSpeech } from '../../src/audio/voice-text';

describe('dal testo alle sillabe', () => {
  const noi = VOICES.noi;

  it('una sillaba per gruppo vocalico', () => {
    expect(planSpeech('banana', noi).syllables).toHaveLength(3);
    expect(planSpeech('Sawasdee krap', noi).syllables).toHaveLength(4);
    expect(planSpeech('ciao', noi).syllables).toHaveLength(1);
    expect(planSpeech('Mr', noi).syllables).toHaveLength(1);
    expect(planSpeech('Fone 12', noi).syllables).toHaveLength(4);
    expect(planSpeech('', noi)).toEqual({ syllables: [], duration: 0 });
    expect(planSpeech('…?!', noi).syllables).toHaveLength(0);
  });

  it('la durata è proporzionale al testo', () => {
    const short = planSpeech('Ciao.', noi).duration;
    const mid = planSpeech('Ciao, il mio telefono non si accende.', noi).duration;
    const long = planSpeech('Ciao, il mio telefono non si accende. È caduto in mare ieri sera, si può riparare?', noi).duration;
    expect(short).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(short * 3);
    expect(long).toBeGreaterThan(mid * 1.7);
    // circa una sillaba ogni 1/rate secondi
    const plan = planSpeech('la la la la la la la la la la', noi);
    expect(plan.duration / plan.syllables.length).toBeGreaterThan(0.8 / noi.rate);
    expect(plan.duration / plan.syllables.length).toBeLessThan(1.6 / noi.rate);
  });

  it('le sillabe sono ordinate e non si sovrappongono', () => {
    const plan = planSpeech('Hai scollegato la batteria, vero? Bene… ora le viti! Piano piano.', VOICES.somchai);
    for (let i = 1; i < plan.syllables.length; i++) {
      const prev = plan.syllables[i - 1];
      expect(plan.syllables[i].t).toBeGreaterThanOrEqual(prev.t + prev.dur - 1e-9);
    }
    const last = plan.syllables[plan.syllables.length - 1];
    expect(plan.duration).toBeGreaterThanOrEqual(last.t + last.dur);
    for (const s of plan.syllables) {
      expect(s.vowel).toBeGreaterThanOrEqual(0);
      expect(s.vowel).toBeLessThan(FORMANTS.length);
      expect([0, 1, 2, 3]).toContain(s.cons);
      expect(Number.isFinite(s.semis)).toBe(true);
    }
  });

  it('la punteggiatura decide l’intonazione: ? sale, . scende, ! accenta', () => {
    const q = planSpeech('la la la la?', noi).syllables;
    const s = planSpeech('la la la la.', noi).syllables;
    const e = planSpeech('la la la la!', noi).syllables;
    expect(q[3].semis).toBeGreaterThan(s[3].semis + 6);
    expect(q[3].semis).toBeGreaterThan(q[1].semis);
    expect(s[3].semis).toBeLessThan(s[0].semis);
    expect(Math.max(...e.map((x) => x.gain))).toBeGreaterThan(1.2);
    expect(e[0].semis).toBeGreaterThan(s[0].semis);
  });

  it('virgole, punti e puntini introducono pause crescenti', () => {
    const gap = (text: string): number => {
      const p = planSpeech(text, noi).syllables;
      return p[1].t - (p[0].t + p[0].dur);
    };
    expect(gap('la, la')).toBeGreaterThan(gap('la la') + 0.1);
    expect(gap('la. la')).toBeGreaterThan(gap('la, la'));
    expect(gap('la… la')).toBeGreaterThan(gap('la. la'));
  });

  it('gestisce accenti, maiuscole e alfabeti non latini', () => {
    expect(planSpeech('perché è così', noi).syllables).toHaveLength(5);
    const thai = planSpeech('สวัสดีครับ', noi);
    expect(thai.syllables.length).toBeGreaterThanOrEqual(2);
    expect(thai.duration).toBeGreaterThan(0);
    const loud = planSpeech('NO', noi).syllables[0];
    const soft = planSpeech('no', noi).syllables[0];
    expect(loud.gain).toBeGreaterThan(soft.gain);
  });

  it('è deterministico e ogni voce ha un profilo sensato', () => {
    const text = 'Khob khun krap, torna presto!';
    for (const id of VOICE_IDS) {
      const v = VOICES[id];
      expect(planSpeech(text, v)).toEqual(planSpeech(text, v));
      expect(v.pitch).toBeGreaterThan(70);
      expect(v.pitch).toBeLessThan(400);
      expect(v.rate).toBeGreaterThan(6);
      expect(v.rate).toBeLessThan(18);
    }
    expect(VOICE_IDS).toHaveLength(12);
    // Somchai: anziano, grave e lento
    expect(VOICES.somchai.pitch).toBe(Math.min(...VOICE_IDS.map((id) => VOICES[id].pitch)));
    expect(planSpeech(text, VOICES.somchai).duration).toBeGreaterThan(planSpeech(text, VOICES.noi).duration);
  });
});

describe('motore senza Web Audio (Node)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prima di unlock ogni chiamata è un no-op sicuro', async () => {
    const engine = new AudioEngine({ seed: 1 });
    expect(engine.unlocked).toBe(false);
    expect(engine.context).toBeNull();
    expect(() => {
      engine.setVolumes({ master: 1, music: 0.5, ambience: 0.5, sfx: 1, voice: 1 });
      engine.sfx('screw_turn');
      engine.sfx('cash', { pitch: 1.2, volume: 0.5, pan: -1 });
      engine.loop('heatgun', true, 0.5);
      engine.setEnvironment({ timeOfDay: 9, rain: 0, wind: 0.2, boat: 0, crowd: 0, indoors: 0 });
      engine.setFocus(0.7);
      engine.setPaused(true);
      engine.update(0.016);
    }).not.toThrow();
    // senza AudioContext (Node) unlock si risolve senza sbloccare
    await engine.unlock();
    expect(engine.unlocked).toBe(false);
    expect(engine.debugStats()).toEqual({ liveVoices: 0, activeLoops: 0, music: null, ambience: null });
    engine.dispose();
    engine.dispose();
  });

  it('la radio scorre tutte le stazioni in ordine', () => {
    const engine = new AudioEngine();
    expect(engine.station).toBe('auto');
    const seen = [engine.station];
    for (let i = 0; i < RADIO_STATIONS.length - 1; i++) seen.push(engine.nextStation());
    expect(seen).toEqual(RADIO_STATIONS);
    expect(engine.nextStation()).toBe('auto');
    engine.setStation('beach_groove');
    expect(engine.station).toBe('beach_groove');
    expect(new AudioEngine({ station: 'off' }).station).toBe('off');
  });

  it('speak restituisce subito la durata e chiama onDone anche senza audio', () => {
    vi.useFakeTimers();
    const engine = new AudioEngine();
    const done = vi.fn();
    const h = engine.speak('Sawasdee krap!', 'somchai', { onDone: done });
    expect(h.duration).toBeGreaterThan(0.2);
    vi.advanceTimersByTime(h.duration * 1000 - 20);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(done).toHaveBeenCalledTimes(1);

    const stopped = vi.fn();
    const h2 = engine.speak('Mai pen rai.', 'noi', { onDone: stopped });
    h2.stop();
    vi.advanceTimersByTime(10000);
    expect(stopped).not.toHaveBeenCalled();
  });

  it('espone tutti i nomi del contratto', () => {
    const contract = [
      'screw_turn', 'screw_out', 'screw_seat', 'screw_strip', 'screw_drop', 'screw_mat', 'suction_attach', 'suction_pop',
      'adhesive_creak', 'adhesive_tear', 'pick_slide', 'connector_snap', 'connector_press', 'part_pickup', 'part_place',
      'part_metal', 'display_open', 'display_close', 'pulltab_stretch', 'pulltab_snap', 'glass_crack', 'spark', 'damage',
      'brush', 'air_blast', 'ipa_drip', 'toothpick', 'multimeter_beep', 'phone_boot', 'phone_off', 'phone_vibrate',
      'phone_speaker_test', 'camera_shutter', 'test_pass', 'test_fail', 'solder_tick', 'chip_place', 'cash', 'coins',
      'order_notify', 'customer_bell', 'purchase', 'delivery', 'ui_click', 'ui_hover', 'ui_open', 'ui_close', 'ui_tab',
      'error', 'success', 'star', 'unlock', 'day_end', 'day_start', 'tool_select', 'place_decor', 'rotate_decor', 'sell',
      'build_hammer', 'build_saw', 'thunder', 'footstep_sand', 'radio_tune', 'flashlight', 'camera_whoosh', 'review_good',
      'review_bad',
    ];
    expect([...SFX_NAMES].sort()).toEqual([...contract].sort());
    expect([...LOOP_NAMES].sort()).toEqual(
      ['brush_scrub', 'fan', 'heatgun', 'hot_air', 'microscope_hum', 'screw_spin', 'solder_sizzle', 'ultrasonic'].sort(),
    );
    for (const name of SFX_NAMES) {
      const def = SFX[name];
      expect(def.gain).toBeGreaterThan(0);
      expect(def.max).toBeGreaterThanOrEqual(1);
      expect(def.gap).toBeGreaterThan(0);
      expect(def.vary).toBeLessThanOrEqual(0.12);
    }
    // i click delle viti devono variare a ogni chiamata e reggere le raffiche
    expect(SFX.screw_turn.vary).toBeGreaterThan(0.05);
    expect(SFX.screw_turn.max).toBeGreaterThanOrEqual(4);
  });
});
