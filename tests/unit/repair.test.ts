import { describe, expect, it } from 'vitest';
import { RNG } from '../../src/core/rng';
import { PHONE_DEFS, PHONE_IDS } from '../../src/data/phones';
import { evaluatePhone } from '../../src/gameplay/repair/evaluate';
import { FAULTS, generateFaultyPhone } from '../../src/gameplay/repair/faults';
import { autoRun, nextHint } from '../../src/gameplay/repair/hint';
import { PhoneModel, createPhone } from '../../src/gameplay/repair/model';
import { DEFAULT_CONTEXT, RepairSession } from '../../src/gameplay/repair/session';
import { ammeterReading } from '../../src/gameplay/repair/diagnostics';
import { ALL_FUNCTIONS, emptyGoal, type RepairContext } from '../../src/gameplay/repair/types';

const FULL_TOOLS: RepairContext = {
  tools: { driver: 3, spudger: 3, pick: 1, suction: 3, tweezers: 3, heat: 3, brush: 2, toothpick: 1, ipa: 1, air: 2, card: 1, adhesive: 2, extractor: 1, flashlight: 1, esd: 2, programmer: 1, solder: 2, microscope: 1, ultrasonic: 1 },
  errorMult: 1,
  strict: true,
  matCells: 24,
};

function session(modelId: string, ctx: RepairContext = FULL_TOOLS, seed = 5) {
  const def = PHONE_DEFS[modelId]!;
  const phone = createPhone(def, `t-${modelId}`);
  return new RepairSession(def, phone, ctx, new RNG(seed));
}

describe('phone data', () => {
  it.each(PHONE_IDS)('%s is a valid, fully working model', (id) => {
    const def = PHONE_DEFS[id]!;
    const model = new PhoneModel(def);
    expect(model.boardId).toBeTruthy();
    expect(model.batteryConn).toBeTruthy();
    const report = evaluatePhone(def, createPhone(def, 'x'));
    for (const fn of ALL_FUNCTIONS) expect(['pass', 'na']).toContain(report.functions[fn]);
    expect(report.score).toBe(1);
    expect(def.components.length).toBeGreaterThanOrEqual(12);
  });
});

describe('teardown and reassembly', () => {
  it.each(PHONE_IDS)('%s can be stripped to the last part and rebuilt perfectly', (id) => {
    const s = session(id);
    const res = autoRun(s, { ...emptyGoal(), teardown: true }, { maxSteps: 3000 });
    expect(res.stuck?.textKey).toBeUndefined();
    expect(res.done).toBe(true);
    expect(s.phone.flags.teardownDone).toBe(true);
    const report = evaluatePhone(s.model, s.phone);
    expect(report.leftoverParts).toEqual([]);
    expect(report.missingScrews).toBe(0);
    expect(report.looseScrews).toBe(0);
    expect(report.closed).toBe(true);
    expect(report.waterSeal).toBe(true);
    for (const fn of ALL_FUNCTIONS) expect(['pass', 'na'], fn).toContain(report.functions[fn]);
    expect(s.phone.mistakes).toEqual([]);
    expect(s.phone.poweredOn).toBe(true);
  });

  it('works with the starter toolkit too (no adhesive, small mat)', () => {
    const s = session('fone8', { ...DEFAULT_CONTEXT, strict: true });
    const res = autoRun(s, { ...emptyGoal(), teardown: true });
    expect(res.done).toBe(true);
    const report = evaluatePhone(s.model, s.phone);
    expect(report.functions.power).toBe('pass');
    expect(report.missingScrews).toBe(0);
    expect(report.waterSeal).toBe(false);
  });
});

describe('dependencies and ordering', () => {
  it('refuses to remove a blocked component and explains why', () => {
    const s = session('fone8');
    const r = s.perform({ t: 'remove', comp: 'battery' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('repair.err.blocked_by');
  });

  it('requires the right bit', () => {
    const s = session('fone8');
    s.perform({ t: 'power', on: false });
    expect(s.perform({ t: 'unscrew', hole: 'p2_l', bit: 'PH000' }).reason).toBe('repair.err.wrong_bit');
    expect(s.perform({ t: 'unscrew', hole: 'p2_l', bit: 'P2' }).ok).toBe(true);
  });

  it('needs heat before the suction cup can lift the display', () => {
    const s = session('fonex');
    s.perform({ t: 'power', on: false });
    for (const h of ['p2_l', 'p2_r']) {
      expect(s.perform({ t: 'unscrew', hole: h, bit: 'P2' }).ok).toBe(true);
      s.perform({ t: 'placeScrew', screw: h, to: { k: 'mat', cell: 0 } });
    }
    const cold = s.perform({ t: 'suction', comp: 'display' });
    expect(cold.events.some((e) => e.type === 'suction_fail')).toBe(true);
    expect(s.perform({ t: 'cut', adhesive: 'disp_adh', seg: 0, depth: 0.3 }).reason).toBe('repair.err.suction_first');
    for (let i = 0; i < 12; i++) s.perform({ t: 'heat', adhesive: 'disp_adh', dt: 0.5 });
    const warm = s.perform({ t: 'suction', comp: 'display' });
    expect(warm.events.some((e) => e.type === 'suction_pop')).toBe(true);
  });

  it('strict mode refuses to unplug the display before the battery', () => {
    const s = session('fone8');
    const goal = { ...emptyGoal(), replace: ['display'] };
    // follow the guide until the lower bracket is off
    for (let i = 0; i < 400 && s.phone.comps.lower_bracket!.state !== 'removed'; i++) {
      const h = nextHint(s, goal);
      expect(h.action).toBeTruthy();
      expect(s.perform(h.action!).ok).toBe(true);
    }
    const held = s.heldScrew();
    if (held) s.perform({ t: 'placeScrew', screw: held.id, to: { k: 'mat', cell: 1 } });
    expect(s.perform({ t: 'disconnect', conn: 'conn_lcd' }).reason).toBe('repair.err.battery_first');
    expect(s.perform({ t: 'disconnect', conn: 'conn_battery' }).ok).toBe(true);
    expect(s.perform({ t: 'disconnect', conn: 'conn_lcd' }).ok).toBe(true);
  });

  it('non-strict: unplugging with the battery connected eventually shorts something', () => {
    let damaged = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = session('fone8', { ...FULL_TOOLS, strict: false, tools: { ...FULL_TOOLS.tools, esd: 0 } }, seed);
      const goal = { ...emptyGoal(), replace: ['display'] };
      for (let i = 0; i < 400 && s.phone.comps.lower_bracket!.state !== 'removed'; i++) {
        s.perform(nextHint(s, goal).action!);
      }
      const held = s.heldScrew();
      if (held) s.perform({ t: 'placeScrew', screw: held.id, to: { k: 'mat', cell: 1 } });
      s.perform({ t: 'disconnect', conn: 'conn_lcd' });
      if (s.phone.mistakes.some((m) => m.key === 'short_circuit')) damaged++;
      expect(s.phone.mistakes.some((m) => m.key === 'battery_connected')).toBe(true);
    }
    expect(damaged).toBeGreaterThan(3);
    expect(damaged).toBeLessThan(30);
  });
});

describe('screws', () => {
  function openToLowerBracket(strict: boolean) {
    const s = session('fone8', { ...FULL_TOOLS, strict });
    const goal = { ...emptyGoal(), replace: ['battery'] };
    for (let i = 0; i < 600 && s.phone.comps.lower_bracket!.state !== 'removed'; i++) {
      const h = nextHint(s, goal);
      s.perform(h.action!);
    }
    const held = s.heldScrew();
    if (held) s.perform({ t: 'placeScrew', screw: held.id, to: { k: 'mat', cell: 2 } });
    s.perform({ t: 'install', comp: 'lower_bracket' });
    return s;
  }

  it('long screw in a short hole over the board damages it', () => {
    const s = openToLowerBracket(false);
    // lb3 is the 2.6 mm screw; lb1 is a 1.2 mm hole above the board
    expect(s.perform({ t: 'pickScrew', screw: 'lb3' }).ok).toBe(true);
    const r = s.perform({ t: 'screwIn', hole: 'lb1', screw: 'lb3', bit: 'Y000', torque: 1 });
    expect(r.ok).toBe(true);
    expect(r.events.some((e) => e.type === 'long_screw')).toBe(true);
    expect(s.phone.boardFaults.some((f) => f.kind === 'long_screw')).toBe(true);
    expect(s.phone.mistakes.some((m) => m.key === 'long_screw' && m.severity === 3)).toBe(true);
  });

  it('strict mode warns instead of damaging', () => {
    const s = openToLowerBracket(true);
    s.perform({ t: 'pickScrew', screw: 'lb3' });
    const r = s.perform({ t: 'screwIn', hole: 'lb1', screw: 'lb3', bit: 'Y000', torque: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('repair.err.long_screw_warning');
    expect(s.phone.boardFaults).toEqual([]);
  });

  it('short screw in a long hole stays loose; wrong type is refused', () => {
    const s = openToLowerBracket(false);
    s.perform({ t: 'pickScrew', screw: 'lb1' });
    const r = s.perform({ t: 'screwIn', hole: 'lb3', screw: 'lb1', bit: 'Y000', torque: 1 });
    expect(r.events.some((e) => e.type === 'screw_loose')).toBe(true);
    s.perform({ t: 'pickScrew', screw: 'p2_l' });
    expect(s.perform({ t: 'screwIn', hole: 'lb1', screw: 'p2_l', bit: 'P2', torque: 1 }).reason).toBe('repair.err.screw_wrong_type');
  });

  it('under-torque is detected by the final test; over-torque can strip', () => {
    const s = openToLowerBracket(false);
    s.perform({ t: 'pickScrew', screw: 'lb1' });
    s.perform({ t: 'screwIn', hole: 'lb1', screw: 'lb1', bit: 'Y000', torque: 0.3 });
    expect(evaluatePhone(s.model, s.phone).looseScrews).toBe(1);
    let stripped = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const t = session('fone8', { ...FULL_TOOLS, strict: false, tools: { ...FULL_TOOLS.tools, driver: 1 } }, seed);
      t.perform({ t: 'power', on: false });
      t.perform({ t: 'unscrew', hole: 'p2_l', bit: 'P2' });
      if (t.heldScrew()) {
        const r = t.perform({ t: 'screwIn', hole: 'p2_l', screw: 'p2_l', bit: 'P2', torque: 1.5 });
        if (r.events.some((e) => e.type === 'screw_stripped')) stripped++;
      }
    }
    expect(stripped).toBeGreaterThan(5);
  });

  it('mat cells have limited capacity and bench screws can roll away', () => {
    const s = session('fone8', { ...FULL_TOOLS, strict: false });
    s.perform({ t: 'power', on: false });
    s.perform({ t: 'unscrew', hole: 'p2_l', bit: 'P2' });
    expect(s.perform({ t: 'unscrew', hole: 'p2_r', bit: 'P2' }).reason).toBe('repair.err.screw_in_hand');
    s.perform({ t: 'placeScrew', screw: 'p2_l', to: { k: 'bench', x: 0.1, z: 0.1 } });
    let lost = false;
    for (let i = 0; i < 4000 && !lost; i++) lost = s.tick(0.5).some((e) => e.type === 'screw_lost');
    expect(lost).toBe(true);
    expect(s.perform({ t: 'pickScrew', screw: 'p2_l' }).reason).toBe('repair.err.screw_lost');
    expect(s.perform({ t: 'findScrew', screw: 'p2_l' }).ok).toBe(true);
    expect(s.perform({ t: 'pickScrew', screw: 'p2_l' }).ok).toBe(true);
  });
});

describe('adhesive and heat', () => {
  it('overheating damages the display (non strict)', () => {
    let damaged = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = session('fone12', { ...FULL_TOOLS, strict: false, tools: { ...FULL_TOOLS.tools, heat: 2 } }, seed);
      for (let i = 0; i < 30; i++) s.perform({ t: 'heat', adhesive: 'disp_adh', dt: 0.5 });
      expect(s.phone.mistakes.some((m) => m.key === 'overheat')).toBe(true);
      if (s.phone.comps.display!.condition === 'damaged') damaged++;
    }
    expect(damaged).toBeGreaterThan(4);
  });

  it('the heating plate never overheats and adhesives cool down over time', () => {
    const s = session('fone12', { ...FULL_TOOLS, strict: false });
    for (let i = 0; i < 60; i++) s.perform({ t: 'heat', adhesive: 'disp_adh', dt: 0.5 });
    expect(s.phone.adhesives.disp_adh!.temp).toBeLessThan(90);
    for (let i = 0; i < 200; i++) s.tick(0.5);
    expect(s.phone.adhesives.disp_adh!.temp).toBeLessThan(35);
  });

  it('a pick pushed deep into a danger zone cuts the flex', () => {
    const s = session('fone8', { ...FULL_TOOLS, strict: false }, 3);
    s.perform({ t: 'power', on: false });
    for (const h of ['p2_l', 'p2_r']) {
      s.perform({ t: 'unscrew', hole: h, bit: 'P2' });
      s.perform({ t: 'placeScrew', screw: h, to: { k: 'mat', cell: 0 } });
    }
    for (let i = 0; i < 10; i++) s.perform({ t: 'heat', adhesive: 'disp_adh', dt: 0.5 });
    s.perform({ t: 'suction', comp: 'display' });
    const seg = Math.floor(0.35 * 24);
    const r = s.perform({ t: 'cut', adhesive: 'disp_adh', seg, depth: 0.9 });
    expect(r.ok).toBe(true);
    expect(s.phone.comps.display!.condition).toBe('damaged');
    expect(s.phone.mistakes.some((m) => m.key === 'flex_cut')).toBe(true);
  });

  it('pulling battery tabs too fast snaps them; isopropyl + pry recovers', () => {
    const s = session('fone8', { ...FULL_TOOLS, strict: false }, 11);
    const goal = { ...emptyGoal(), replace: ['battery'] };
    for (let i = 0; i < 900; i++) {
      const h = nextHint(s, goal);
      if (h.action?.t === 'pullTab') break;
      s.perform(h.action!);
    }
    let snapped = false;
    for (let i = 0; i < 200 && !snapped; i++) {
      const r = s.perform({ t: 'pullTab', adhesive: 'bat_adh', tab: 0, speed: 1.4, dt: 0.25 });
      snapped = r.events.some((e) => e.type === 'tab_snap');
      if (s.phone.adhesives.bat_adh!.segs[0]! >= 1) break;
    }
    expect(snapped).toBe(true);
    expect(s.perform({ t: 'pullTab', adhesive: 'bat_adh', tab: 0, speed: 0.3, dt: 0.25 }).reason).toBe('repair.err.tab_broken');
    const res = autoRun(s, goal);
    expect(res.done).toBe(true);
    expect(s.phone.comps.battery!.quality).toBe('good');
  });
});

describe('faults, diagnosis and repair jobs', () => {
  it('has at least 12 distinct fault types', () => {
    expect(FAULTS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(FAULTS.map((f) => f.id)).size).toBe(FAULTS.length);
  });

  for (const modelId of PHONE_IDS) {
    for (const fault of FAULTS) {
      const def = PHONE_DEFS[modelId]!;
      if (!fault.applicable(new PhoneModel(def))) continue;
      it(`${modelId}: "${fault.id}" breaks something and the guide fixes it`, () => {
        const rng = new RNG(99);
        const { phone, goal } = generateFaultyPhone(def, [fault.id], rng, `c-${modelId}-${fault.id}`);
        const before = evaluatePhone(def, phone);
        const brokenBefore = ALL_FUNCTIONS.filter((f) => before.functions[f] === 'fail' || before.functions[f] === 'degraded');
        expect(brokenBefore.length, 'fault must have a visible symptom').toBeGreaterThan(0);
        const s = new RepairSession(def, phone, FULL_TOOLS, new RNG(4));
        // make replacement parts deterministic: no dead-on-arrival spares in this test
        const res = autoRun(s, goal, { quality: 'refurb' });
        expect(res.stuck?.textKey).toBeUndefined();
        expect(res.done).toBe(true);
        for (const id of Object.keys(phone.comps)) phone.comps[id]!.doa = false;
        const after = evaluatePhone(def, phone);
        for (const fn of brokenBefore) {
          if (fn === 'biometric' || fn === 'trueTone') continue; // pairing losses are expected on some replacements
          expect(after.functions[fn], `${fn} should work again`).toBe('pass');
        }
        expect(after.closed).toBe(true);
        expect(after.leftoverParts).toEqual([]);
        expect(after.missingScrews).toBe(0);
      });
    }
  }

  it.each(PHONE_IDS)('%s: a loose connector combined with other work does not confuse the guide', (id) => {
    const def = PHONE_DEFS[id]!;
    const { phone, goal } = generateFaultyPhone(def, ['worn_battery', 'loose_connector', 'port_lint'], new RNG(5), `combo-${id}`);
    const s = new RepairSession(def, phone, FULL_TOOLS, new RNG(4));
    const res = autoRun(s, goal, { quality: 'refurb', maxSteps: 3000 });
    expect(res.stuck?.textKey).toBeUndefined();
    expect(res.done).toBe(true);
    for (const cid of Object.keys(phone.comps)) phone.comps[cid]!.doa = false;
    const after = evaluatePhone(def, phone);
    expect(after.functions.display).toBe('pass');
    expect(after.functions.battery).toBe('pass');
    expect(after.missingScrews).toBe(0);
  });

  it('the ammeter tells a blocked port from a healthy phone', () => {
    const def = PHONE_DEFS.fone8!;
    const ok = createPhone(def, 'ok');
    expect(ammeterReading(def, ok).pattern).toBe('charging_ok');
    const { phone } = generateFaultyPhone(def, ['port_lint'], new RNG(2), 'lint');
    expect(ammeterReading(def, phone).amps).toBe(0);
  });
});

describe('pairing', () => {
  it('a new display loses True Tone unless the chip data is transferred', () => {
    const def = PHONE_DEFS.fone8!;
    const noProg = { ...FULL_TOOLS, tools: { ...FULL_TOOLS.tools, programmer: 0 } };
    const a = new RepairSession(def, createPhone(def, 'a'), noProg, new RNG(1));
    a.phone.comps.display!.condition = 'damaged';
    expect(autoRun(a, { ...emptyGoal(), replace: ['display'] }, { quality: 'refurb' }).done).toBe(true);
    a.phone.comps.display!.doa = false;
    const ra = evaluatePhone(def, a.phone);
    expect(ra.functions.display).toBe('pass');
    expect(ra.functions.trueTone).toBe('fail');
    expect(ra.functions.biometric).toBe('pass'); // home button was transferred to the new display

    const b = new RepairSession(def, createPhone(def, 'b'), FULL_TOOLS, new RNG(1));
    b.phone.comps.display!.condition = 'damaged';
    const goal = { ...emptyGoal(), replace: ['display'] };
    expect(autoRun(b, goal, { quality: 'refurb' }).done).toBe(true);
    expect(b.phone.savedData).toContain('display');
    expect(b.phone.comps.display!.paired).toBe(true);
    b.phone.comps.display!.doa = false;
    expect(evaluatePhone(def, b.phone).functions.trueTone).toBe('pass');
  });

  it('replacing the home button loses Touch ID for good', () => {
    const def = PHONE_DEFS.fone8!;
    const s = new RepairSession(def, createPhone(def, 'h'), FULL_TOOLS, new RNG(1));
    expect(autoRun(s, { ...emptyGoal(), replace: ['home_button'] }, { quality: 'refurb' }).done).toBe(true);
    s.phone.comps.home_button!.doa = false;
    expect(evaluatePhone(def, s.phone).functions.biometric).toBe('fail');
    expect(s.perform({ t: 'program', comp: 'home_button' }).ok).toBe(false);
  });
});
