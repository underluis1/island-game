/**
 * Balance simulation: an automatic player (accepts jobs at the fair price, repairs with the guide,
 * buys upgrades when it can) plays N days; the pacing targets of the design are checked with wide
 * tolerances. Times are "equivalent real hours": game days × 12 minutes.
 *
 * The money / reputation / stage curve is printed with console.warn (run vitest with --silent=false).
 */
import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/gameplay/sim';
import { AutoPlayer, type Milestones } from '../../src/gameplay/sim/autoplay';

const DAY_HOURS = 12 / 60;
const SEEDS = [7, 21, 99];
const MAX_DAYS = 50;

interface Run {
  seed: number;
  milestones: Milestones;
  lines: string[];
  days: number;
  reputation: number;
  loans: number;
  repairs: number;
  failed: number;
  perfect: number;
}

function play(seed: number): Run {
  const sim = GameSim.newGame({ seed, shopName: 'Balance Fix', skipTutorial: true });
  const bot = new AutoPlayer(sim, { seed: seed + 1 });
  const lines: string[] = [];
  let days = 0;
  for (let d = 1; d <= MAX_DAYS; d++) {
    const sum = bot.playDay();
    days = d;
    lines.push(
      `day ${String(d).padStart(2)} | ${(d * DAY_HOURS).toFixed(1).padStart(4)} h | ฿${String(Math.round(sum.moneyEnd)).padStart(6)} | net ${String(Math.round(sum.net)).padStart(6)} | rep ${sum.repEnd.toFixed(2)} | stage ${sim.state.stage} | jobs ${String(sum.jobsDone).padStart(2)} failed ${sum.jobsFailed}${sum.loan ? ` | loan ${sum.loan}` : ''}`,
    );
    if (bot.milestones.fullShop !== null && d >= 40) break;
  }
  const st = sim.stats();
  return { seed, milestones: bot.milestones, lines, days, reputation: st.reputation, loans: st.loans, repairs: st.repairs, failed: st.failedOrders, perfect: st.perfectRepairs };
}

const fmt = (h: number | null): string => (h === null ? '   — ' : `${h.toFixed(2)} h`);

describe('balance simulation', () => {
  const runs = SEEDS.map(play);

  it('prints the money / reputation / stage curve', () => {
    const out: string[] = [`seed ${runs[0]!.seed}`, ...runs[0]!.lines, '', 'seed | first upgrade | kiosk  | shop   | full shop | rep  | repairs (5★) | failed | loans'];
    for (const r of runs) {
      const m = r.milestones;
      out.push(
        `${String(r.seed).padStart(4)} | ${fmt(m.firstUpgrade).padStart(13)} | ${fmt(m.stage2)} | ${fmt(m.stage3)} | ${fmt(m.fullShop).padStart(9)} | ${r.reputation.toFixed(2)} | ${r.repairs} (${r.perfect}) | ${r.failed} | ${r.loans}`,
      );
    }
    console.warn(out.join('\n'));
    expect(runs).toHaveLength(SEEDS.length);
  });

  it.each(runs)('seed $seed: first meaningful upgrade within ~15 minutes', (r) => {
    expect(r.milestones.firstUpgrade).not.toBeNull();
    expect(r.milestones.firstUpgrade!).toBeLessThanOrEqual(0.5);
  });

  it.each(runs)('seed $seed: kiosk within ~1.5-2 hours', (r) => {
    expect(r.milestones.stage2).not.toBeNull();
    expect(r.milestones.stage2!).toBeGreaterThanOrEqual(1.0);
    expect(r.milestones.stage2!).toBeLessThanOrEqual(3.0);
  });

  it.each(runs)('seed $seed: complete shop within ~6-8 hours', (r) => {
    expect(r.milestones.stage3).not.toBeNull();
    expect(r.milestones.stage3!).toBeGreaterThanOrEqual(4.0);
    expect(r.milestones.fullShop).not.toBeNull();
    expect(r.milestones.fullShop!).toBeLessThanOrEqual(9.5);
  });

  it.each(runs)('seed $seed: a decent player keeps a good reputation and rarely needs a loan', (r) => {
    expect(r.reputation).toBeGreaterThanOrEqual(3.3);
    expect(r.loans).toBeLessThanOrEqual(4);
    expect(r.repairs).toBeGreaterThan(r.days * 4);
    expect(r.failed).toBeLessThan(r.repairs * 0.2);
  });

  it('the average of the runs sits inside the design targets', () => {
    const avg = (f: (m: Milestones) => number | null): number => runs.reduce((t, r) => t + (f(r.milestones) ?? 99), 0) / runs.length;
    expect(avg((m) => m.firstUpgrade)).toBeLessThanOrEqual(0.3);
    expect(avg((m) => m.stage2)).toBeGreaterThanOrEqual(1.3);
    expect(avg((m) => m.stage2)).toBeLessThanOrEqual(2.3);
    expect(avg((m) => m.fullShop)).toBeGreaterThanOrEqual(5.0);
    expect(avg((m) => m.fullShop)).toBeLessThanOrEqual(8.0);
  });
});
