import { describe, expect, it } from 'vitest';
import {
  BEATS_PER_BAR,
  LAYERS,
  SECTION_BARS,
  STYLES,
  STYLE_IDS,
  autoStyle,
  bassRoot,
  chord,
  chordPcs,
  dayPart,
  diatonicOf,
  generateSection,
  ladder,
  layerMix,
  passesDensity,
  pentatonicOf,
  planSection,
  voicing,
} from '../../src/audio/music-theory';
import { BarClock, EventTimer, swingBeat } from '../../src/audio/scheduler';

const pc = (midi: number, tonic: number): number => (((midi - tonic) % 12) + 12) % 12;
const SEEDS = [1, 7, 42, 1234, 99999];
const TOTAL_BEATS = SECTION_BARS * BEATS_PER_BAR;

describe('generatore di sezioni', () => {
  it('è deterministico: stessi argomenti ⇒ stessa sezione', () => {
    for (const style of STYLE_IDS) {
      const a = generateSection(style, 42, 3, 1);
      const b = generateSection(style, 42, 3, 1);
      expect(a.notes).toEqual(b.notes);
      expect(a.drums).toEqual(b.drums);
      expect(a.chords).toEqual(b.chords);
    }
  });

  it('semi o materiali diversi danno melodie diverse', () => {
    for (const style of STYLE_IDS) {
      const melody = (seed: number, material: number): string =>
        JSON.stringify(generateSection(style, seed, material).notes.filter((n) => n.layer === 'melody'));
      const variants = new Set([melody(1, 0), melody(2, 0), melody(3, 0), melody(1, 1), melody(1, 2)]);
      expect(variants.size).toBeGreaterThanOrEqual(4);
    }
  });

  it('le note sono sempre in scala: pentatonica per le voci melodiche, diatonica per armonia e basso', () => {
    for (const style of STYLE_IDS) {
      const def = STYLES[style];
      const pent = pentatonicOf(def);
      const dia = diatonicOf(def);
      for (const seed of SEEDS) {
        for (let material = 0; material < 6; material++) {
          for (const variation of [0, 1, 2]) {
            const s = generateSection(style, seed, material, variation);
            for (const n of s.notes) {
              const p = pc(n.midi, def.tonic);
              if (n.layer === 'melody' || n.layer === 'counter') expect(pent).toContain(p);
              else expect(dia).toContain(p);
            }
          }
        }
      }
    }
  });

  it('tutti gli accordi delle progressioni sono diatonici', () => {
    for (const style of STYLE_IDS) {
      const def = STYLES[style];
      const dia = diatonicOf(def);
      for (const prog of def.progressions) {
        for (const sym of prog) for (const p of chordPcs(chord(sym))) expect(dia).toContain(p);
      }
    }
  });

  it('le battute sono coerenti: 8 battute da 4, eventi dentro la sezione e nel secchio giusto', () => {
    for (const style of STYLE_IDS) {
      for (const seed of SEEDS) {
        const s = generateSection(style, seed, 1, 1);
        expect(s.bars).toBe(SECTION_BARS);
        expect(s.beatsPerBar).toBe(BEATS_PER_BAR);
        expect(s.chords).toHaveLength(SECTION_BARS);
        expect(s.barNotes).toHaveLength(SECTION_BARS);
        expect(s.barNotes.reduce((n, b) => n + b.length, 0)).toBe(s.notes.length);
        expect(s.barDrums.reduce((n, b) => n + b.length, 0)).toBe(s.drums.length);
        s.barNotes.forEach((list, bar) => {
          for (const n of list) expect(Math.floor(n.beat / BEATS_PER_BAR)).toBe(bar);
        });
        for (const n of s.notes) {
          expect(n.beat).toBeGreaterThanOrEqual(0);
          expect(n.beat).toBeLessThan(TOTAL_BEATS);
          expect(n.dur).toBeGreaterThan(0);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          expect(n.weight).toBeGreaterThan(0);
          expect(n.weight).toBeLessThanOrEqual(1);
          expect(Number.isInteger(n.midi)).toBe(true);
        }
        for (const d of s.drums) {
          expect(d.beat).toBeGreaterThanOrEqual(0);
          expect(d.beat).toBeLessThan(TOTAL_BEATS);
        }
        for (let i = 1; i < s.notes.length; i++) expect(s.notes[i].beat).toBeGreaterThanOrEqual(s.notes[i - 1].beat);
      }
    }
  });

  it('la melodia sta nel registro dello stile e le frasi respirano', () => {
    for (const style of STYLE_IDS) {
      const def = STYLES[style];
      for (const seed of SEEDS) {
        const mel = generateSection(style, seed, 0).notes.filter((n) => n.layer === 'melody');
        expect(mel.length).toBeGreaterThanOrEqual(8);
        for (const n of mel) {
          expect(n.midi).toBeGreaterThanOrEqual(def.leadRange[0]);
          expect(n.midi).toBeLessThanOrEqual(def.leadRange[1]);
        }
        // ogni unità di due battute lascia almeno mezzo battito di silenzio prima della successiva
        for (let unit = 0; unit < 4; unit++) {
          const inUnit = mel.filter((n) => n.beat >= unit * 8 && n.beat < unit * 8 + 8);
          expect(inUnit.length).toBeGreaterThanOrEqual(2);
          const lastOnset = Math.max(...inUnit.map((n) => n.beat));
          expect(lastOnset).toBeLessThanOrEqual(unit * 8 + 7);
        }
        // la cadenza finale è una nota lunga che non sfora la sezione
        const last = mel[mel.length - 1];
        expect(last.dur).toBeGreaterThanOrEqual(1.5);
        expect(last.beat + last.dur).toBeLessThanOrEqual(TOTAL_BEATS);
      }
    }
  });

  it('il motivo si ripete: la risposta (A′) riusa il ritmo della domanda (A) e ne varia la coda', () => {
    for (const style of STYLE_IDS) {
      for (const seed of SEEDS) {
        const mel = generateSection(style, seed, 0).notes.filter((n) => n.layer === 'melody');
        const a = mel.filter((n) => n.beat < 8);
        const a2 = mel.filter((n) => n.beat >= 8 && n.beat < 16);
        expect(a2.map((n) => n.beat - 8)).toEqual(a.map((n) => n.beat));
        // la testa del motivo resta riconoscibile (almeno le prime note coincidono, salvo aggancio all'accordo)
        const head = Math.max(1, a.length - 2);
        let same = 0;
        for (let i = 0; i < head; i++) if (Math.abs(a[i].midi - a2[i].midi) <= 3) same++;
        expect(same / head).toBeGreaterThanOrEqual(0.6);
      }
    }
  });

  it('la ripresa variata conserva armonia e gran parte della melodia', () => {
    for (const style of STYLE_IDS) {
      const theme = generateSection(style, 5, 0, 0);
      const reprise = generateSection(style, 5, 0, 2);
      expect(reprise.chords).toEqual(theme.chords);
      const key = (n: { beat: number; midi: number }): string => `${n.beat}:${n.midi}`;
      const themeMel = theme.notes.filter((n) => n.layer === 'melody');
      const repSet = new Set(reprise.notes.filter((n) => n.layer === 'melody').map(key));
      const shared = themeMel.filter((n) => repSet.has(key(n))).length;
      expect(shared / themeMel.length).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('ogni layer previsto dallo stile produce eventi', () => {
    for (const style of STYLE_IDS) {
      const s = generateSection(style, 11, 0);
      for (const layer of ['melody', 'counter', 'pad', 'bass'] as const) {
        expect(s.notes.some((n) => n.layer === layer)).toBe(true);
      }
      expect(s.drums.length).toBeGreaterThan(0);
    }
    expect(generateSection('thai_khim', 1, 0).drums.some((d) => d.kind === 'ching')).toBe(true);
    expect(generateSection('sunset_ambient', 1, 0).drums.some((d) => d.kind === 'kick')).toBe(false);
  });
});

describe('forma', () => {
  it('il tema torna e conta le riprese; gli episodi si rinnovano', () => {
    const p = Array.from({ length: 32 }, (_, i) => planSection(i));
    expect(p[0]).toEqual({ material: 0, variation: 0 });
    expect(p[1].material).toBe(p[0].material);
    expect(p[1].variation).toBe(1);
    expect(p[3].material).toBe(p[0].material);
    expect(p[3].variation).toBe(2);
    expect(p[2].material).not.toBe(p[0].material);
    expect(p[2].variation).toBe(0);
    // l'episodio B torna nello stesso giro, variato
    expect(p[6].material).toBe(p[2].material);
    expect(p[6].variation).toBe(1);
    // il tema dura due giri, poi cambia; gli episodi cambiano a ogni giro
    expect(p[8].material).toBe(p[0].material);
    expect(p[16].material).not.toBe(p[0].material);
    expect(p[16].variation).toBe(0);
    expect(p[10].material).not.toBe(p[2].material);
  });
});

describe('scale e accordi', () => {
  it('ladder elenca solo note della scala, in ordine', () => {
    const l = ladder(62, [0, 2, 4, 7, 9], 60, 86);
    expect(l[0]).toBeGreaterThanOrEqual(60);
    expect(l[l.length - 1]).toBeLessThanOrEqual(86);
    for (let i = 1; i < l.length; i++) expect(l[i]).toBeGreaterThan(l[i - 1]);
    for (const m of l) expect([0, 2, 4, 7, 9]).toContain(pc(m, 62));
  });

  it('voicing e basso restano nelle loro finestre', () => {
    for (const style of STYLE_IDS) {
      const def = STYLES[style];
      for (const prog of def.progressions) {
        for (const sym of prog) {
          const c = chord(sym);
          const v = voicing(c, def.tonic, 57, 4);
          expect(v.length).toBeGreaterThanOrEqual(3);
          for (const m of v) {
            expect(m).toBeGreaterThanOrEqual(57);
            expect(m).toBeLessThan(69);
          }
          const b = bassRoot(c, def.tonic);
          expect(b).toBeGreaterThanOrEqual(33);
          expect(b).toBeLessThan(45);
          expect(pc(b, def.tonic)).toBe(c.root);
        }
      }
    }
    expect(() => chord('X13')).toThrow();
  });
});

describe('mix per ora del giorno', () => {
  it('ogni valore resta in [0, 1] e varia con continuità', () => {
    let prev = layerMix(0);
    for (let t = 0.05; t <= 24; t += 0.05) {
      const m = layerMix(t);
      for (const key of [...LAYERS, 'density', 'brightness', 'reverb'] as const) {
        expect(m[key]).toBeGreaterThanOrEqual(0);
        expect(m[key]).toBeLessThanOrEqual(1);
        expect(Math.abs(m[key] - prev[key])).toBeLessThan(0.08);
      }
      prev = { ...m };
    }
    expect(layerMix(24)).toEqual(layerMix(0));
    expect(layerMix(-1)).toEqual(layerMix(23));
  });

  it('mattina acustica, pomeriggio ritmato, sera ambient, notte minimale', () => {
    const morning = layerMix(8.5);
    const afternoon = layerMix(14);
    const evening = layerMix(19);
    const night = layerMix(23.5);
    expect(morning.drums).toBe(0);
    expect(morning.melody).toBe(1);
    expect(afternoon.drums).toBe(1);
    expect(afternoon.bass).toBeGreaterThan(morning.bass);
    expect(evening.pad).toBeGreaterThan(afternoon.pad);
    expect(evening.drums).toBeLessThan(afternoon.drums);
    expect(evening.reverb).toBeGreaterThan(afternoon.reverb);
    expect(night.drums).toBe(0);
    expect(night.density).toBeLessThan(evening.density);
    expect(night.brightness).toBeLessThan(evening.brightness);
  });

  it('fasce orarie e stazione automatica', () => {
    expect(dayPart(8)).toBe('morning');
    expect(dayPart(14)).toBe('afternoon');
    expect(dayPart(19)).toBe('evening');
    expect(dayPart(23)).toBe('night');
    expect(dayPart(2)).toBe('night');
    expect(autoStyle(8)).toBe('thai_khim');
    expect(autoStyle(14)).toBe('beach_groove');
    expect(autoStyle(19)).toBe('sunset_ambient');
    expect(autoStyle(1)).toBe('island_lofi');
  });

  it('la densità toglie prima le note deboli', () => {
    expect(passesDensity(1, 0)).toBe(true);
    expect(passesDensity(0.3, 1)).toBe(true);
    expect(passesDensity(0.3, 0.5)).toBe(false);
    expect(passesDensity(0.7, 0.3)).toBe(true);
    const s = generateSection('island_lofi', 3, 0);
    const count = (d: number): number => s.notes.filter((n) => n.layer === 'melody' && passesDensity(n.weight, d)).length;
    expect(count(1)).toBeGreaterThan(count(0.4));
    expect(count(0.4)).toBeGreaterThanOrEqual(count(0.1));
    expect(count(0.1)).toBeGreaterThan(0);
  });
});

describe('orologio e scheduler', () => {
  it('la durata delle battute segue il tempo', () => {
    for (const style of STYLE_IDS) {
      const bpm = STYLES[style].bpm;
      const clock = new BarClock(bpm, 4, 1.5);
      expect(clock.barDuration).toBeCloseTo((60 / bpm) * 4, 10);
      let t = 1.5;
      for (let i = 0; i < 50; i++) {
        const slot = clock.advance();
        expect(slot.bar).toBe(i);
        expect(slot.time).toBeCloseTo(t, 9);
        expect(slot.duration).toBeCloseTo(slot.spb * 4, 10);
        t += slot.duration;
      }
    }
  });

  it('un cambio di tempo vale dalla battuta successiva', () => {
    const clock = new BarClock(60, 4, 0);
    expect(clock.advance().duration).toBe(4);
    clock.bpm = 120;
    const slot = clock.advance();
    expect(slot.time).toBe(4);
    expect(slot.duration).toBe(2);
  });

  it('lookahead: ogni battuta è programmata una volta sola e sempre in anticipo', () => {
    const clock = new BarClock(102, 4, 0.08);
    const lookahead = 0.2;
    const scheduled: { bar: number; time: number; at: number }[] = [];
    for (let now = 0; now < 60; now += 1 / 60) {
      clock.resync(now);
      while (clock.due(now, lookahead)) {
        const slot = clock.advance();
        scheduled.push({ bar: slot.bar, time: slot.time, at: now });
      }
    }
    expect(scheduled.length).toBe(Math.floor((60 + lookahead - 0.08) / clock.barDuration) + 1);
    scheduled.forEach((s, i) => {
      expect(s.bar).toBe(i);
      expect(s.time).toBeGreaterThanOrEqual(s.at);
      expect(s.time - s.at).toBeLessThanOrEqual(lookahead + 1e-9);
    });
  });

  it('dopo una pausa lunga (scheda in background) riparte senza recuperare le battute perse', () => {
    const clock = new BarClock(60, 4, 0);
    clock.advance();
    expect(clock.resync(100)).toBe(true);
    expect(clock.nextTime).toBeGreaterThan(100);
    expect(clock.nextTime).toBeLessThan(100.2);
    expect(clock.resync(100)).toBe(false);
  });

  it('lo swing è monotono, lascia fermi i battiti e ritarda i levare', () => {
    for (const amount of [0, 0.08, 0.16, 0.33]) {
      let prev = -1;
      for (let b = 0; b <= 8; b += 0.125) {
        const w = swingBeat(b, amount);
        expect(w).toBeGreaterThan(prev);
        prev = w;
        if (Number.isInteger(b)) expect(w).toBeCloseTo(b, 12);
      }
    }
    expect(swingBeat(2.5, 0)).toBe(2.5);
    expect(swingBeat(2.5, 0.16)).toBeCloseTo(2.58, 10);
  });

  it('EventTimer non programma mai nel passato', () => {
    const timer = new EventTimer(1);
    expect(timer.due(0.5, 0.1)).toBe(false);
    expect(timer.due(0.95, 0.1)).toBe(true);
    timer.schedule(0.95, 5);
    expect(timer.next).toBe(6);
    timer.schedule(50, 2);
    expect(timer.next).toBe(52);
  });
});
