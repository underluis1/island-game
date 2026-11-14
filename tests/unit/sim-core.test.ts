import { describe, expect, it } from 'vitest';
import type { Customer, GameState, Review } from '../../src/core/state';
import { PHONE_DEFS } from '../../src/data/phones';
import { computeReputation } from '../../src/gameplay/economy/reputation';
import { diagnosisId, fairPrice } from '../../src/gameplay/economy/pricing';
import { evaluatePhone } from '../../src/gameplay/repair/evaluate';
import { BALANCE, GameSim, type DecorDef, type SimEvent } from '../../src/gameplay/sim';
import { autoRepair } from '../../src/gameplay/sim/autorepair';

const DECOR: DecorDef[] = [
  { id: 'palm', nameKey: 'decor.palm.name', descKey: 'decor.palm.desc', category: 'plant', placement: 'ground', footprint: [1, 1], price: 400, atmosphere: 10, stageMin: 1 },
  { id: 'lantern', nameKey: 'decor.lantern.name', descKey: 'decor.lantern.desc', category: 'light', placement: 'hang', footprint: [1, 1], price: 200, atmosphere: 6, stageMin: 1 },
  { id: 'aquarium', nameKey: 'decor.aquarium.name', descKey: 'decor.aquarium.desc', category: 'deluxe', placement: 'ground', footprint: [2, 1], price: 5000, atmosphere: 30, stageMin: 2 },
];

function newSim(seed = 42, skipTutorial = true): GameSim {
  return GameSim.newGame({ seed, shopName: 'Fix & Chill', skipTutorial }, { decor: DECOR });
}

/** Runs the clock in small real-time steps until `until` says stop. */
function run(sim: GameSim, until: (events: SimEvent[]) => boolean, maxSeconds = 4000): SimEvent[] {
  const all: SimEvent[] = [];
  for (let t = 0; t < maxSeconds; t += 2) {
    const ev = sim.advance(2, { inRepair: false });
    all.push(...ev);
    if (until(ev)) break;
  }
  return all;
}

function waitCustomer(sim: GameSim, filter: (c: Customer) => boolean = () => true): Customer {
  for (let i = 0; i < 400; i++) {
    run(sim, () => sim.customerAtCounter() !== null, 3000);
    const c = sim.customerAtCounter();
    if (c && filter(c)) return c;
    if (c) sim.dismissCustomer(c.id);
    if (sim.timeInfo().phase === 'summary') sim.startNextDay();
  }
  throw new Error('no matching customer');
}

function setReputation(s: GameState, stars: number): void {
  const reviews: Review[] = [];
  for (let i = 0; i < 40; i++) {
    reviews.push({ id: `fake${i}`, day: 1, stars, name: 'X', kind: 'tourist', character: null, modelId: 'fone8', text: [] });
  }
  s.reputation.reviews = reviews;
  s.reputation.total = 400;
  s.reputation.value = computeReputation(s);
}

function repair(sim: GameSim, id: string): boolean {
  expect(sim.startRepair(id).ok).toBe(true);
  const job = sim.job(id)!;
  for (const cat of sim.partsNeeded(id)) {
    if (!sim.hasPart(job.job.modelId, cat, 'refurb')) sim.state.parts[`${job.job.modelId}|${cat}|refurb`] = 3;
  }
  const res = autoRepair(sim.state, sim.createSession(id)!, job.job.goal, { preference: ['refurb', 'good', 'cheap'] });
  if (res.done) expect(sim.markReady(id, { guideUsed: false }).ok).toBe(true);
  return res.done;
}

describe('new game and clock', () => {
  it('starts with the agreed kit, money and reputation', () => {
    const sim = newSim();
    const s = sim.state;
    expect(s.money).toBe(1500);
    expect(s.reputation.value).toBeCloseTo(1, 5);
    expect(s.stage).toBe(1);
    for (const id of ['driver', 'spudger', 'pick', 'suction', 'tweezers', 'heat', 'brush', 'toothpick', 'mat']) expect(s.tools[id]).toBe(1);
    for (const id of ['ipa', 'multimeter', 'adhesive', 'extractor', 'solder', 'lights', 'shelf']) expect(s.tools[id]).toBe(0);
    expect(sim.rackCapacity()).toBe(3);
    expect(sim.repairContext().matCells).toBe(8);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('a day lasts 12 real minutes, slower in the repair view, frozen when paused', () => {
    const sim = newSim();
    const first = sim.advance(48, { inRepair: false });
    expect(first.some((e) => e.type === 'supplier_boat')).toBe(true);
    expect(sim.state.time).toBeCloseTo(8, 5);
    sim.advance(48, { inRepair: true });
    expect(sim.state.time).toBeCloseTo(8 + BALANCE.time.repairTimeScale, 5);
    sim.advance(500, { inRepair: false, paused: true });
    expect(sim.state.time).toBeCloseTo(8 + BALANCE.time.repairTimeScale, 5);
    const events = run(sim, (ev) => ev.some((e) => e.type === 'day_end'), 800);
    expect(events.some((e) => e.type === 'day_ending')).toBe(true);
    expect(sim.timeInfo().phase).toBe('summary');
    expect(sim.state.playTime).toBeLessThan(13 * 60 + 600);
    const start = sim.startNextDay();
    expect(start.some((e) => e.type === 'day_start')).toBe(true);
    expect(sim.state.day).toBe(2);
    expect(sim.state.time).toBe(7);
  });

  it('the shop can be closed from the tablet only after 18:00', () => {
    const sim = newSim();
    expect(sim.canCloseShop()).toBe(false);
    expect(sim.closeShop()).toBeNull();
    run(sim, () => sim.state.time >= 18.1, 800);
    expect(sim.canCloseShop()).toBe(true);
    const summary = sim.closeShop()!;
    expect(summary.day).toBe(1);
    expect(summary.expenses.rent).toBe(BALANCE.stages.rent[0]);
    expect(summary.net).toBe(summary.totalIncome - summary.totalExpenses);
    expect(summary.series).toHaveLength(1);
  });
});

describe('tutorial hooks', () => {
  it('freezes time, provides the wreck and the scripted first customer', () => {
    const sim = newSim(3, false);
    expect(sim.tutorial.phase()).toBe('intro');
    sim.advance(200, { inRepair: false });
    expect(sim.state.time).toBe(7);
    expect(sim.repairContext().strict).toBe(true);

    expect(sim.tutorial.advance()).toBe('teardown');
    const wreck = sim.tutorial.createWreck();
    expect(wreck.modelId).toBe('fone8');
    expect(wreck.goal.teardown).toBe(true);
    expect(sim.rackUsed()).toBe(0);
    const session = sim.createSession(wreck.id)!;
    expect(session.ctx.strict).toBe(true);
    expect(autoRepair(sim.state, session, wreck.goal).done).toBe(true);
    expect(wreck.phone.flags.teardownDone).toBe(true);
    sim.tutorial.advance();
    sim.tutorial.finishWreck();
    expect(sim.orders()).toHaveLength(0);

    expect(sim.tutorial.advance()).toBe('first_customer');
    const c = sim.tutorial.createFirstCustomer();
    expect(c.modelId).toBe('fone8');
    expect(c.faults).toEqual(['worn_battery']);
    expect(sim.hasPart('fone8', 'battery', 'good')).toBe(true);
    expect(sim.tutorial.createFirstCustomer().id).toBe(c.id);
    const info = sim.quoteInfo(c.id, 'worn_battery')!;
    expect(info.fair).toBe(fairPrice('fone8', ['worn_battery']));
    expect(info.parts[0]).toMatchObject({ category: 'battery', inStock: 1 });
    const out = sim.proposeQuote(c.id, 'worn_battery', info.fair);
    expect(out.type).toBe('accepted');
    if (out.type !== 'accepted') return;
    const order = out.order;
    expect(order.baseline.functions.battery).not.toBe('pass');
    sim.startRepair(order.id);
    const res = autoRepair(sim.state, sim.createSession(order.id)!, order.goal);
    expect(res.done).toBe(true);
    expect(res.replaced).toEqual([{ comp: 'battery', category: 'battery', quality: 'good' }]);
    expect(sim.hasPart('fone8', 'battery', 'good')).toBe(false);
    order.phone.comps.battery!.doa = false;
    sim.markReady(order.id, { guideUsed: true });
    const d = sim.deliver(order.id);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.paid).toBe(info.fair);
    expect(d.stars).toBeGreaterThanOrEqual(4);
    expect(d.review.text.length).toBeGreaterThanOrEqual(2);
    expect(d.reputationDelta).toBeGreaterThan(0);
    expect(sim.state.money).toBe(1500 + d.paid + d.tip);

    sim.tutorial.advance();
    expect(sim.buyTool('ipa').ok).toBe(true);
    expect(sim.tutorial.advance()).toBe('done');
    sim.advance(48, { inRepair: false });
    expect(sim.state.time).toBeCloseTo(8, 5);
  });

  it('can be skipped at any time', () => {
    const sim = newSim(4, false);
    sim.tutorial.advance();
    sim.tutorial.createWreck();
    sim.tutorial.skip();
    expect(sim.tutorial.phase()).toBe('done');
    expect(sim.state.tutorial.skipped).toBe(true);
    expect(sim.orders()).toHaveLength(0);
    expect(sim.timeInfo().running).toBe(true);
  });
});

describe('customers, diagnosis and quotes', () => {
  it('generates coherent customers and never excludes the true diagnosis', () => {
    const sim = newSim(11);
    sim.state.tools.multimeter = 2;
    sim.state.tools.battester = 1;
    sim.state.tools.ipa = 1;
    setReputation(sim.state, 4.6);
    const kinds = new Set<string>();
    const models = new Set<string>();
    let excluded = 0;
    let confirmed = 0;
    for (let i = 0; i < 60; i++) {
      const c = waitCustomer(sim);
      kinds.add(c.kind);
      models.add(c.modelId);
      const truth = diagnosisId(c.faults);
      expect(c.options).toContain(truth);
      expect(c.options.length).toBeGreaterThanOrEqual(3);
      expect(c.options.length).toBeLessThanOrEqual(4);
      expect(new Set(c.options).size).toBe(c.options.length);
      expect(c.budget).toBeGreaterThanOrEqual(0.8);
      expect(c.budget).toBeLessThanOrEqual(1.6);
      expect(c.complaints).toHaveLength(c.faults.length);
      expect(PHONE_DEFS[c.modelId]!.minReputation).toBeLessThanOrEqual(sim.reputation());
      const before = evaluatePhone(PHONE_DEFS[c.modelId]!, c.phone);
      expect(before.score).toBeLessThan(1);
      for (const tool of ['visual', 'multimeter', 'battester', 'psu'] as const) {
        const clue = sim.inspect(c.id, tool);
        expect(clue.available).toBe(true);
        expect(clue.lines.length).toBeGreaterThan(0);
        expect(clue.excluded).not.toContain(truth);
        excluded += clue.excluded.length;
      }
      const opts = sim.diagnosisOptions(c.id);
      expect(opts.find((o) => o.id === truth)!.mark).not.toBe('excluded');
      if (opts.some((o) => o.mark === 'confirmed')) {
        confirmed++;
        expect(opts.find((o) => o.mark === 'confirmed')!.id).toBe(truth);
      }
      sim.dismissCustomer(c.id);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    expect(models.size).toBe(4);
    expect(excluded).toBeGreaterThan(60);
    expect(confirmed).toBeGreaterThan(15);
  });

  it('instruments the shop does not own are unavailable', () => {
    const sim = newSim(12);
    const c = waitCustomer(sim);
    expect(sim.inspect(c.id, 'visual').available).toBe(true);
    expect(sim.inspect(c.id, 'multimeter').available).toBe(false);
    expect(sim.inspect(c.id, 'psu').available).toBe(false);
  });

  it('accepts fair prices, haggles a little above, walks away when it is too much', () => {
    const sim = newSim(13);
    let c = waitCustomer(sim, (x) => x.missingTools.length === 0);
    let truth = diagnosisId(c.faults);
    let info = sim.quoteInfo(c.id, truth)!;
    expect(info.min).toBeLessThan(info.fair);
    expect(info.max).toBeGreaterThan(info.fair);
    const high = Math.round(info.fair * c.budget * 1.12);
    const counter = sim.proposeQuote(c.id, truth, high);
    expect(counter.type).toBe('counter');
    if (counter.type !== 'counter') return;
    expect(counter.price).toBeLessThanOrEqual(info.fair * c.budget);
    expect(counter.price).toBeLessThan(high);
    const order = sim.acceptCounter(c.id)!;
    expect(order.price).toBe(counter.price);
    expect(order.status).toBe('queued');
    expect(sim.customerAtCounter()?.id).not.toBe(c.id);
    expect(sim.rackUsed()).toBe(1);

    c = waitCustomer(sim);
    truth = diagnosisId(c.faults);
    info = sim.quoteInfo(c.id, truth)!;
    const before = sim.state.reputation.total;
    const refused = sim.proposeQuote(c.id, truth, info.fair * 1.7);
    expect(refused.type).toBe('refused');
    expect(sim.customerAtCounter()?.id).not.toBe(c.id);
    expect(sim.state.reputation.total).toBe(before);

    let ripoffReviews = 0;
    for (let i = 0; i < 12; i++) {
      c = waitCustomer(sim);
      truth = diagnosisId(c.faults);
      const out = sim.proposeQuote(c.id, truth, sim.quoteInfo(c.id, truth)!.fair * 4);
      expect(out.type).toBe('refused');
      if (out.type === 'refused' && out.review) {
        ripoffReviews++;
        expect(out.review.stars).toBe(1);
        expect(out.reputationDelta).toBeLessThanOrEqual(0);
      }
    }
    expect(ripoffReviews).toBeGreaterThan(1);
  });

  it('blocks new orders when the rack is full', () => {
    const sim = newSim(14);
    for (let i = 0; i < 3; i++) {
      const c = waitCustomer(sim, (x) => x.urgency === 'normal' && x.budget >= 1);
      const truth = diagnosisId(c.faults);
      expect(sim.proposeQuote(c.id, truth, sim.quoteInfo(c.id, truth)!.fair).type).toBe('accepted');
    }
    const c = waitCustomer(sim);
    const out = sim.proposeQuote(c.id, diagnosisId(c.faults), 100);
    expect(out).toEqual({ type: 'blocked', reason: 'economy.err.rack_full' });
    expect(sim.buyUsed(sim.market()[0]!.id)).toMatchObject({ ok: false, reason: 'economy.err.rack_full' });
  });
});

describe('orders and delivery', () => {
  function acceptOne(sim: GameSim, filter: (c: Customer) => boolean, priceFactor = 1, diagnosis?: (c: Customer) => string) {
    const c = waitCustomer(sim, (x) => x.missingTools.length === 0 && x.budget >= 1 && filter(x));
    const diag = diagnosis ? diagnosis(c) : diagnosisId(c.faults);
    const info = sim.quoteInfo(c.id, diag)!;
    const out = sim.proposeQuote(c.id, diag, Math.round(info.fair * priceFactor));
    if (out.type !== 'accepted') throw new Error(`quote ${out.type}`);
    return out.order;
  }

  it('a good repair for a waiting customer is paid, reviewed and may be tipped', () => {
    const sim = newSim(21);
    sim.state.tools.extractor = 1;
    const order = acceptOne(sim, (c) => c.urgency === 'wait');
    expect(order.customerPresent).toBe(true);
    expect(sim.deliver(order.id)).toEqual({ ok: false, reason: 'economy.err.not_ready' });
    expect(repair(sim, order.id)).toBe(true);
    const money = sim.state.money;
    const d = sim.deliver(order.id);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.paid).toBe(order.price);
    expect(d.stars).toBeGreaterThanOrEqual(4);
    expect(d.factors.map((f) => f.factor)).toEqual(expect.arrayContaining(['fixed', 'expert', 'fast']));
    expect(sim.state.money).toBe(money + d.paid + d.tip);
    expect(sim.orders()).toHaveLength(0);
    expect(sim.state.reputation.reviews.at(-1)).toEqual(d.review);
    expect(sim.stats().repairs).toBe(1);
  });

  it('customers come back for their phone and wait a bit if it is not ready', () => {
    const sim = newSim(22);
    sim.state.tools.extractor = 1;
    const order = acceptOne(sim, (c) => c.urgency === 'today' && c.goal.replace.length === 0);
    expect(order.customerPresent).toBe(false);
    expect(sim.deliver(order.id)).toMatchObject({ ok: false });
    expect(repair(sim, order.id)).toBe(true);
    expect(sim.deliver(order.id)).toEqual({ ok: false, reason: 'economy.err.customer_away' });
    const events = run(sim, (ev) => ev.some((e) => e.type === 'pickup_arrived'));
    const pickup = events.find((e) => e.type === 'pickup_arrived');
    expect(pickup).toMatchObject({ orderId: order.id, ready: true });
    const d = sim.deliver(order.id);
    expect(d.ok && d.paid).toBe(order.price);
  });

  it('an order that is never done ends with an angry one-star review', () => {
    const sim = newSim(23);
    const order = acceptOne(sim, (c) => c.urgency === 'wait');
    const rep = sim.reputation();
    const events = run(sim, (ev) => ev.some((e) => e.type === 'order_failed'), 1200);
    expect(events.some((e) => e.type === 'order_overdue' && e.orderId === order.id)).toBe(true);
    const failed = events.find((e) => e.type === 'order_failed');
    expect(failed && failed.type === 'order_failed' && failed.review.stars).toBe(1);
    expect(sim.orders()).toHaveLength(0);
    expect(sim.reputation()).toBeLessThanOrEqual(rep);
    expect(sim.stats().failedOrders).toBe(1);
  });

  it('a wrong diagnosis and a botched job cost stars and money', () => {
    const sim = newSim(24);
    const order = acceptOne(sim, (c) => c.urgency === 'wait' && c.options.length > 1, 1, (c) => c.options.find((o) => o !== diagnosisId(c.faults))!);
    expect(order.misdiagnosed).toBe(true);
    sim.startRepair(order.id);
    sim.markReady(order.id, { guideUsed: true });
    const d = sim.deliver(order.id);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.paid).toBe(0);
    expect(d.stars).toBeLessThanOrEqual(2);
    expect(d.tip).toBe(0);
    expect(d.factors.map((f) => f.factor)).toEqual(expect.arrayContaining(['not_fixed', 'misdiagnosis']));
  });

  it('only one phone fits on the bench of the stall', () => {
    const sim = newSim(25);
    const a = acceptOne(sim, (c) => c.urgency === 'normal');
    const b = acceptOne(sim, (c) => c.urgency === 'normal');
    expect(sim.startRepair(a.id).ok).toBe(true);
    expect(sim.startRepair(b.id)).toMatchObject({ ok: false, reason: 'economy.err.bench_busy' });
    expect(sim.pauseRepair(a.id).ok).toBe(true);
    expect(sim.startRepair(b.id).ok).toBe(true);
    expect(sim.abandonOrder(a.id).ok).toBe(true);
    expect(sim.orders().map((o) => o.id)).toEqual([b.id]);
  });
});

describe('spare parts', () => {
  it('standard orders come with the morning boat, express ones in about two hours', () => {
    const sim = newSim(31);
    sim.advance(48 * 2, { inRepair: false });
    const offers = sim.catalog().parts('fone8');
    const bat = offers.find((o) => o.category === 'battery' && o.quality === 'good')!;
    const cheap = offers.find((o) => o.category === 'battery' && o.quality === 'cheap')!;
    const refurb = offers.find((o) => o.category === 'battery' && o.quality === 'refurb')!;
    expect(cheap.price).toBeLessThan(bat.price);
    expect(refurb.price).toBeGreaterThan(bat.price);
    expect(bat.expressPrice).toBeGreaterThan(bat.price);
    expect(cheap.defectRate).toBeGreaterThan(refurb.defectRate);
    expect(offers.some((o) => o.category === 'bracket' || o.category === 'housing')).toBe(false);

    expect(sim.buyPart('fone8', 'battery', 'good', { express: true }).ok).toBe(true);
    expect(sim.buyPart('fone8', 'display', 'cheap', { express: false }).ok).toBe(true);
    expect(sim.state.money).toBe(1500 - bat.expressPrice - offers.find((o) => o.category === 'display' && o.quality === 'cheap')!.price);
    expect(sim.hasPart('fone8', 'battery', 'good')).toBe(false);
    const t0 = sim.state.time;
    const ev = run(sim, (e) => e.some((x) => x.type === 'delivery_arrived'));
    expect(ev.find((e) => e.type === 'delivery_arrived')).toMatchObject({ express: true });
    expect(sim.state.time - t0).toBeGreaterThan(1.9);
    expect(sim.state.time - t0).toBeLessThan(2.2);
    expect(sim.partsFor('fone8', 'battery')).toEqual({ cheap: 0, good: 1, refurb: 0 });
    expect(sim.consumePart('fone8', 'battery', 'good')).toBe(true);
    expect(sim.consumePart('fone8', 'battery', 'good')).toBe(false);

    run(sim, (e) => e.some((x) => x.type === 'day_end'), 900);
    expect(sim.hasPart('fone8', 'display', 'cheap')).toBe(false);
    sim.startNextDay();
    const morning = run(sim, (e) => e.some((x) => x.type === 'delivery_arrived'), 100);
    expect(morning.find((e) => e.type === 'supplier_boat')).toMatchObject({ parcels: 1 });
    expect(sim.state.time).toBeLessThan(7.6);
    expect(sim.hasPart('fone8', 'display', 'cheap')).toBe(true);
  });

  it('respects money and storage limits', () => {
    const sim = newSim(32);
    expect(sim.buyPart('fone8', 'logic_board', 'refurb', { express: false })).toMatchObject({ ok: false, reason: 'economy.err.no_money' });
    expect(sim.buyPart('fone8', 'back_glass', 'good', { express: false })).toMatchObject({ ok: false, reason: 'economy.err.unknown_item' });
    sim.state.money = 1e6;
    expect(sim.storage().capacity).toBe(14);
    expect(sim.buyPart('fone8', 'sim_tray', 'good', { express: false, qty: 14 }).ok).toBe(true);
    expect(sim.buyPart('fone8', 'sim_tray', 'good', { express: false })).toMatchObject({ ok: false, reason: 'economy.err.storage_full' });
    sim.state.reputation.value = 2;
    expect(sim.buyTool('shelf').ok).toBe(true);
    expect(sim.storage().capacity).toBe(40);
  });

  it('the glass separator recycles scrapped displays a few times a day', () => {
    const sim = newSim(33);
    sim.state.parts['fone8|display|good'] = 3;
    for (let i = 0; i < 3; i++) sim.consumePart('fone8', 'display', 'good');
    expect(sim.scrapDisplays('fone8')).toBe(3);
    expect(sim.refurbishDisplay('fone8')).toMatchObject({ ok: false, reason: 'economy.err.need_tool' });
    sim.state.tools.separator = 1;
    expect(sim.refurbishDisplay('fone8').ok).toBe(true);
    expect(sim.refurbishDisplay('fone8').ok).toBe(true);
    expect(sim.refurbishDisplay('fone8')).toMatchObject({ ok: false, reason: 'economy.err.separator_limit' });
    expect(sim.partsFor('fone8', 'display').good).toBe(2);
    expect(sim.refurbishDisplay('fonex')).toMatchObject({ ok: false, reason: 'economy.err.no_scrap' });
  });
});

describe('tools and working conditions', () => {
  it('sells tiers in order with stage and reputation gates', () => {
    const sim = newSim(41);
    const tools = sim.catalog().tools;
    expect(tools.length).toBeGreaterThanOrEqual(26);
    const driver = tools.find((t) => t.id === 'driver')!;
    expect(driver).toMatchObject({ owned: 1, nextTier: 2, available: true, tierKey: 'tools.driver.t2' });
    expect(sim.buyTool('driver').ok).toBe(true);
    expect(sim.state.tools.driver).toBe(2);
    expect(sim.state.money).toBe(1500 - driver.price);
    expect(sim.buyTool('driver')).toMatchObject({ ok: false, reason: 'economy.err.need_stage' });
    expect(sim.buyTool('pick')).toMatchObject({ ok: false, reason: 'economy.err.max_tier' });
    expect(sim.buyTool('battester')).toMatchObject({ ok: false, reason: 'economy.err.need_reputation' });
    expect(sim.buyTool('heat')).toMatchObject({ ok: false });
    expect(sim.buyTool('nonsense')).toMatchObject({ ok: false, reason: 'economy.err.unknown_item' });
    sim.state.money = 100;
    expect(sim.buyTool('mat')).toMatchObject({ ok: false, reason: 'economy.err.no_money' });
    sim.state.money = 1e6;
    sim.buyTool('mat');
    expect(sim.repairContext().matCells).toBe(15);
    sim.state.reputation.value = 3;
    sim.buyTool('rack');
    expect(sim.rackCapacity()).toBe(5);
    expect(sim.repairContext().tools.rack).toBe(2);
  });

  it('heat, darkness and fatigue raise the error multiplier; comfort upgrades fight them', () => {
    const sim = newSim(42);
    const s = sim.state;
    s.time = 9;
    expect(sim.repairContext().errorMult).toBe(1);
    s.time = 13;
    const hot = sim.repairContext().errorMult;
    expect(hot).toBeGreaterThan(1.1);
    s.tools.fan = 2;
    expect(sim.repairContext().errorMult).toBe(1);
    s.tools.fan = 0;
    expect(sim.repairContext().errorMult).toBeGreaterThan(hot);
    s.time = 20;
    const dark = sim.repairContext().errorMult;
    expect(dark).toBeGreaterThan(1.3);
    s.tools.lamp = 2;
    const lamp = sim.repairContext().errorMult;
    expect(lamp).toBeLessThan(dark);
    s.tools.lights = 2;
    expect(sim.repairContext().errorMult).toBe(1);
    s.time = 9;
    s.ledger.repairHours = 8;
    const tired = sim.repairContext().errorMult;
    expect(tired).toBeGreaterThan(1.2);
    s.tools.chair = 3;
    expect(sim.repairContext().errorMult).toBeLessThan(tired);
    expect(sim.repairContext({ tutorial: true })).toMatchObject({ strict: true, errorMult: 1 });
  });
});

describe('decorations and atmosphere', () => {
  it('buy, place, move, store and sell at half price', () => {
    const sim = newSim(51);
    sim.state.money = 2000;
    expect(sim.atmosphere()).toBe(0);
    const a = sim.buyDecor('palm');
    const b = sim.buyDecor('palm');
    const c = sim.buyDecor('lantern');
    expect(a.ok && b.ok && c.ok).toBe(true);
    expect(sim.state.money).toBe(1000);
    expect(sim.buyDecor('aquarium')).toMatchObject({ ok: false, reason: 'economy.err.need_stage' });
    expect(sim.atmosphere()).toBe(0);
    expect(sim.placeDecor(a.uid!, { x: 2, z: 1, rot: 0 }).ok).toBe(true);
    expect(sim.atmosphere()).toBe(10);
    expect(sim.canPlaceDecor(b.uid!, { x: 2.5, z: 1, rot: 0 })).toMatchObject({ ok: false, reason: 'economy.err.spot_taken' });
    expect(sim.placeDecor(b.uid!, { x: 3, z: 1, rot: 1 }).ok).toBe(true);
    expect(sim.atmosphere()).toBe(16);
    expect(sim.placeDecor(c.uid!, { x: 2, z: 1, rot: 0 }).ok).toBe(true);
    expect(sim.atmosphere()).toBe(22);
    expect(sim.moveDecor(a.uid!, { x: 0, z: 3, rot: 2 }).ok).toBe(true);
    expect(sim.state.decor.find((d) => d.uid === a.uid)!.placed).toEqual({ x: 0, z: 3, rot: 2 });
    sim.setPlacementValidator((_item, at) => at.x >= 0);
    expect(sim.moveDecor(a.uid!, { x: -1, z: 3, rot: 0 })).toMatchObject({ ok: false, reason: 'economy.err.bad_position' });
    sim.storeDecor(b.uid!);
    expect(sim.atmosphere()).toBe(16);
    expect(sim.sellDecor(a.uid!)).toMatchObject({ ok: true, refund: 200 });
    expect(sim.state.money).toBe(1200);
    expect(sim.catalog().decor.find((d) => d.id === 'palm')!.owned).toBe(1);
    sim.state.tools.lights = 1;
    expect(sim.atmosphere()).toBe(6 + 6);
  });

  it('customises the shop', () => {
    const sim = newSim(52);
    sim.setCustomization({ awningColor: '#112233', accentColor: 'pink', shopName: '  Kai Phone  ' });
    expect(sim.state.customization.awningColor).toBe('#112233');
    expect(sim.state.customization.accentColor).not.toBe('pink');
    expect(sim.state.shopName).toBe('Kai Phone');
  });
});

describe('expansion, costs and loans', () => {
  it('builds the kiosk overnight and the shop later', () => {
    const sim = newSim(61);
    const s = sim.state;
    s.money = 30000;
    expect(sim.buyStage()).toMatchObject({ ok: false, reason: 'economy.err.need_reputation' });
    setReputation(s, 3);
    const uid = sim.buyDecor('palm').uid!;
    sim.placeDecor(uid, { x: 1, z: 1, rot: 0 });
    expect(sim.catalog().upgrades.find((u) => u.id === 'stage2')).toMatchObject({ available: true, price: 18000 });
    expect(sim.buyStage().ok).toBe(true);
    expect(s.stage).toBe(1);
    expect(sim.buyStage()).toMatchObject({ ok: false, reason: 'economy.err.under_construction' });
    expect(sim.hireAssistant(true)).toMatchObject({ ok: false });
    run(sim, (e) => e.some((x) => x.type === 'day_end'), 900);
    expect(s.lastSummary!.expenses.stage).toBe(18000);
    const ev = sim.startNextDay();
    expect(ev).toContainEqual({ type: 'stage_built', stage: 2 });
    expect(s.stage).toBe(2);
    expect(s.decor[0]!.placed).toBeNull();
    expect(sim.rackCapacity()).toBe(4);
    expect(sim.benchCount()).toBe(2);
    expect(sim.atmosphere()).toBe(BALANCE.stages.atmosphere[1]);
    run(sim, (e) => e.some((x) => x.type === 'day_end'), 900);
    const sum = s.lastSummary!;
    expect(sum.income.showcase).toBeGreaterThan(0);
    expect(sum.expenses.rent).toBe(BALANCE.stages.rent[1]);
    expect(sum.expenses.electricity).toBe(BALANCE.stages.electricity[1]);
    sim.startNextDay();
    s.money = 100000;
    expect(sim.buyStage()).toMatchObject({ ok: false, reason: 'economy.err.need_reputation' });
    setReputation(s, 4.5);
    expect(sim.buyStage().ok).toBe(true);
    run(sim, (e) => e.some((x) => x.type === 'day_end'), 900);
    sim.startNextDay();
    expect(s.stage).toBe(3);
    expect(sim.buyStage()).toMatchObject({ ok: false, reason: 'economy.err.already_owned' });
    expect(sim.hireAssistant(true).ok).toBe(true);
  });

  it('uncle Somchai covers a negative balance, at a small cost in reputation', () => {
    const sim = newSim(62);
    const s = sim.state;
    setReputation(s, 3);
    const rep = s.reputation.value;
    s.money = 20;
    const ev = run(sim, (e) => e.some((x) => x.type === 'day_end'), 900);
    const loan = ev.find((e) => e.type === 'loan');
    expect(loan && loan.type === 'loan' && loan.amount).toBeGreaterThanOrEqual(600);
    expect(s.money).toBeGreaterThanOrEqual(BALANCE.loan.cushion);
    expect(s.loan.debt).toBeGreaterThan(0);
    expect(s.lastSummary!.loan).toBe(s.loan.debt);
    expect(s.lastSummary!.loanLine!.key).toMatch(/^economy\.loan\.line[123]$/);
    expect(s.reputation.value).toBeCloseTo(rep - BALANCE.reputation.loanPenalty, 5);
    sim.startNextDay();
    expect(s.reputation.value).toBeGreaterThan(rep - BALANCE.reputation.loanPenalty);
    const debt = s.loan.debt;
    s.ledger.income.repairs = 4000;
    s.money += 4000;
    run(sim, (e) => e.some((x) => x.type === 'day_end'), 900);
    expect(s.loan.debt).toBeLessThan(debt);
    expect(s.lastSummary!.expenses.loan).toBe(debt - s.loan.debt);
  });
});

describe('used market', () => {
  it('offers a few broken phones a day; bought phones can be fixed and sold', () => {
    const sim = newSim(71);
    const s = sim.state;
    const listings = sim.market();
    expect(listings.length).toBeGreaterThanOrEqual(2);
    expect(listings.length).toBeLessThanOrEqual(4);
    for (const l of listings) {
      const mv = PHONE_DEFS[l.modelId]!.marketValue;
      expect(l.price).toBeGreaterThanOrEqual(mv * 0.12 - 10);
      expect(l.price).toBeLessThanOrEqual(mv * 0.35 + 10);
      expect(l.description.key).toMatch(/^faults\.\w+\.complaint\d$/);
    }
    s.money = 50000;
    s.tools.extractor = 1;
    s.tools.ipa = 1;
    s.tools.solder = 1;
    s.tools.microscope = 1;
    const l = listings[0]!;
    const res = sim.buyUsed(l.id);
    expect(res.ok).toBe(true);
    const owned = res.owned!;
    expect(s.money).toBe(50000 - l.price);
    expect(sim.market()).toHaveLength(listings.length);
    expect(sim.rackUsed()).toBe(1);
    const asIs = sim.usedSalePrice(owned.id);
    expect(repair(sim, owned.id)).toBe(true);
    for (const cs of Object.values(owned.phone.comps)) cs.doa = false;
    expect(owned.status).toBe('repaired');
    const fixed = sim.usedSalePrice(owned.id);
    expect(fixed).toBeGreaterThanOrEqual(asIs);
    expect(fixed).toBeGreaterThan(l.price);
    expect(fixed).toBeLessThanOrEqual(PHONE_DEFS[l.modelId]!.marketValue);
    const listed = sim.listForSale(owned.id);
    expect(listed).toMatchObject({ ok: true, askPrice: fixed });
    expect(sim.rackUsed()).toBe(0);
    expect(sim.listForSale(owned.id)).toMatchObject({ ok: false, reason: 'economy.err.already_listed' });
    const money = s.money;
    let sold: SimEvent | undefined;
    for (let d = 0; d < 6 && !sold; d++) {
      sold = run(sim, (e) => e.some((x) => x.type === 'used_sold' || x.type === 'day_end'), 900).find((e) => e.type === 'used_sold');
      if (!sold) sim.startNextDay();
    }
    expect(sold).toMatchObject({ type: 'used_sold', ownedId: owned.id, price: fixed });
    expect(s.money).toBeGreaterThanOrEqual(money + fixed - 2000);
    expect(sim.ownedPhones()).toHaveLength(0);
    expect(sim.stats().usedSold).toBe(1);
  });
});

describe('assistant', () => {
  it('repairs simple queued orders with parts from stock, on its own time', () => {
    const sim = newSim(81);
    const s = sim.state;
    s.stage = 3;
    s.money = 1e5;
    for (const id of Object.keys(s.tools)) s.tools[id] = Math.max(s.tools[id]!, 1);
    expect(sim.hireAssistant(true).ok).toBe(true);
    const c = waitCustomer(sim, (x) => x.urgency === 'normal' && x.goal.solder.length === 0 && x.goal.replace.length === 0 && x.faults.length === 1 && x.budget >= 1);
    const truth = diagnosisId(c.faults);
    const out = sim.proposeQuote(c.id, truth, sim.quoteInfo(c.id, truth)!.fair);
    expect(out.type).toBe('accepted');
    if (out.type !== 'accepted') return;
    const ev = run(sim, (e) => e.some((x) => x.type === 'assistant_done'), 1500);
    expect(ev.some((e) => e.type === 'assistant_started' && e.orderId === out.order.id)).toBe(true);
    expect(ev.find((e) => e.type === 'assistant_done')).toMatchObject({ orderId: out.order.id, success: true });
    expect(out.order.status).toBe('ready');
    expect(out.order.byAssistant).toBe(true);
    run(sim, (e) => e.some((x) => x.type === 'day_end'), 900);
    expect(s.lastSummary!.expenses.wages).toBe(BALANCE.assistant.wage);
    expect(sim.hireAssistant(false).ok).toBe(true);
  });
});

describe('encyclopedia and stats', () => {
  it('unlocks entries once', () => {
    const sim = newSim(91);
    expect(sim.unlockEncyclopedia('fone8:battery')).toBe(true);
    expect(sim.unlockEncyclopedia('fone8:battery')).toBe(false);
    expect(sim.state.encyclopedia).toEqual(['fone8:battery']);
    expect(sim.stats()).toMatchObject({ day: 1, money: 1500, repairs: 0 });
  });
});
