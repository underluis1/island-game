import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyLedger } from '../../src/core/state';
import { PHONE_DEFS } from '../../src/data/phones';
import { REVIEW_VARIANTS } from '../../src/gameplay/economy/review';
import { FAULTS } from '../../src/gameplay/repair/faults';
import { CUSTOMER_DATA, GameSim, TOOLS, TOOL_BY_ID, type ReviewFactor } from '../../src/gameplay/sim';
import { AutoPlayer } from '../../src/gameplay/sim/autoplay';

const NAMESPACES = ['faults', 'customers', 'reviews', 'tools', 'economy', 'phones', 'parts'] as const;
const ROOT = join(__dirname, '../../src');

function flatten(prefix: string, node: unknown, out: Record<string, string>): void {
  if (typeof node === 'string') out[prefix] = node;
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) flatten(`${prefix}.${k}`, v, out);
  }
}

function load(lang: 'it' | 'en'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ns of NAMESPACES) {
    flatten(ns, JSON.parse(readFileSync(join(ROOT, 'data/i18n', lang, `${ns}.json`), 'utf8')), out);
  }
  return out;
}

const it_ = load('it');
const en = load('en');
const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

function expectKey(key: string): void {
  expect(it_[key], `missing IT key ${key}`).toBeTypeOf('string');
  expect(en[key], `missing EN key ${key}`).toBeTypeOf('string');
}

const FACTORS: ReviewFactor[] = [
  'partial', 'not_fixed', 'new_broken', 'pairing', 'screws', 'leftover', 'not_closed', 'seal_lost', 'seal_kept', 'clean', 'cheap_part',
  'premium_part', 'fast', 'late', 'price_low', 'price_fair', 'price_high', 'mistakes', 'expert', 'misdiagnosis', 'atmosphere',
];

describe('i18n of the simulation namespaces', () => {
  it('Italian and English have exactly the same keys and placeholders, and no empty text', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(it_).sort());
    for (const [k, v] of Object.entries(it_)) {
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect(en[k]!.trim().length, k).toBeGreaterThan(0);
      expect(placeholders(en[k]!), k).toEqual(placeholders(v));
    }
  });

  it('never mentions real trademarks', () => {
    for (const dict of [it_, en]) {
      for (const [k, v] of Object.entries(dict)) expect(v, k).not.toMatch(/\b(apple|iphone|ios|lightning|samsung|android)\b/i);
    }
  });

  it('covers every phone, part, connector, category, quality and screw used by the phone data', () => {
    const categories = new Set<string>();
    for (const def of Object.values(PHONE_DEFS)) {
      expectKey(def.nameKey);
      expectKey(`phones.${def.id}.desc`);
      for (const c of def.components) {
        expectKey(c.nameKey);
        expectKey(c.descKey);
        expect(it_[c.descKey]!.split(/[.!?]\s/).length, c.descKey).toBeGreaterThanOrEqual(2);
        categories.add(c.partCategory);
        for (const f of c.attachedBy) {
          if (f.type === 'connector') expectKey(`parts.conn.${f.connectorId}`);
          if (f.type === 'screw') {
            expectKey(`parts.screw.${f.screwType}.name`);
            expectKey(`parts.screw.${f.screwType}.use`);
          }
        }
      }
    }
    for (const c of categories) expectKey(`parts.category.${c}`);
    for (const q of ['cheap', 'good', 'refurb', 'factory']) expectKey(`parts.quality.${q}`);
    expectKey('phones.brand');
    expectKey('phones.os');
  });

  it('covers every fault: name, diagnosis, complaints and instrument clues', () => {
    for (const f of FAULTS) {
      expectKey(`faults.${f.id}.name`);
      expectKey(`faults.${f.id}.diagnosis`);
      for (let k = 1; k <= f.complaints; k++) expectKey(`faults.${f.id}.complaint${k}`);
      expect(it_[`faults.${f.id}.complaint${f.complaints + 1}`]).toBeUndefined();
      for (const tool of ['visual', 'multimeter', 'battester', 'psu']) expectKey(`faults.${f.id}.clue_${tool}`);
      expect(CUSTOMER_DATA.confusions[f.id], f.id).toBeTruthy();
      for (const alt of CUSTOMER_DATA.confusions[f.id]!) expect(FAULTS.some((x) => x.id === alt), alt).toBe(true);
      for (const t of f.needsTools) expect(TOOL_BY_ID[t], t).toBeTruthy();
    }
    for (const n of ['cracked_display', 'cracked_back', 'port_dirty', 'port_corroded', 'display_lifted', 'grille_sand', 'water_indicator', 'previous_repair', 'nothing_visible']) {
      expectKey(`faults.reading.visual.${n}`);
    }
    for (const p of ['no_current', 'trickle', 'unstable', 'boot_no_screen', 'charging_ok', 'charging_slow']) expectKey(`faults.reading.ammeter.${p}`);
    for (const b of ['missing', 'health', 'swollen', 'dead', 'worn', 'ok']) expectKey(`faults.reading.battery.${b}`);
    for (const p of ['ok', 'charge_ic', 'connector', 'long_screw', 'short', 'corrosion']) expectKey(`faults.reading.psu.${p}`);
    for (const t of ['visual', 'multimeter', 'battester', 'psu']) expectKey(`faults.tool.${t}`);
  });

  it('covers every tool and tier', () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(26);
    for (const t of TOOLS) {
      expectKey(`tools.${t.id}.name`);
      expectKey(`tools.${t.id}.desc`);
      expectKey(`tools.${t.id}.effect`);
      expectKey(`tools.category.${t.category}`);
      t.tiers.forEach((tier, i) => {
        expect(tier.tier).toBe(i + 1);
        expectKey(`tools.${t.id}.t${tier.tier}`);
      });
      expect(it_[`tools.${t.id}.t${t.tiers.length + 1}`]).toBeUndefined();
    }
  });

  it('covers customer lines, characters and review fragments', () => {
    for (const kind of Object.keys(CUSTOMER_DATA.kinds)) {
      expectKey(`customers.kind.${kind}`);
      for (const [type, n] of Object.entries(CUSTOMER_DATA.kindLines)) for (let i = 1; i <= n; i++) expectKey(`customers.${kind}.${type}${i}`);
    }
    for (const [type, n] of Object.entries(CUSTOMER_DATA.anyLines)) for (let i = 1; i <= n; i++) expectKey(`customers.any.${type}${i}`);
    for (const id of Object.keys(CUSTOMER_DATA.characters)) {
      expectKey(`customers.char.${id}.name`);
      expectKey(`customers.char.${id}.role`);
      for (const [type, n] of Object.entries(CUSTOMER_DATA.characterLines)) for (let i = 1; i <= n; i++) expectKey(`customers.char.${id}.${type}${i}`);
    }
    for (const u of ['normal', 'today', 'wait']) expectKey(`customers.urgency.${u}`);
    for (let s = 1; s <= 5; s++) {
      for (let v = 1; v <= REVIEW_VARIANTS.open; v++) expectKey(`reviews.open.s${s}.${v}`);
      for (let v = 1; v <= REVIEW_VARIANTS.close; v++) expectKey(`reviews.close.s${s}.${v}`);
    }
    for (const f of FACTORS) for (let v = 1; v <= REVIEW_VARIANTS.fact; v++) expectKey(`reviews.fact.${f}.${v}`);
    for (let v = 1; v <= REVIEW_VARIANTS.quote; v++) expectKey(`reviews.quote.ripoff.${v}`);
    for (let v = 1; v <= REVIEW_VARIANTS.fail; v++) expectKey(`reviews.fail.never_ready.${v}`);
    const fragments = Object.keys(it_).filter((k) => k.startsWith('reviews.'));
    expect(fragments.length).toBeGreaterThanOrEqual(40);
  });

  it('covers every error code the simulation can return and the report labels', () => {
    const codes = new Set<string>();
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts')) {
          const src = readFileSync(p, 'utf8');
          for (const m of src.matchAll(/\berr\('(\w+)'/g)) codes.add(m[1] as string);
          for (const m of src.matchAll(/'economy\.err\.(\w+)'/g)) codes.add(m[1] as string);
        }
      }
    };
    for (const d of ['sim', 'customers', 'economy', 'shop', 'building']) walk(join(ROOT, 'gameplay', d));
    expect(codes.size).toBeGreaterThan(15);
    for (const c of codes) expectKey(`economy.err.${c}`);
    const ledger = emptyLedger(1);
    for (const k of Object.keys(ledger.income)) expectKey(`economy.income.${k}`);
    for (const k of Object.keys(ledger.expenses)) expectKey(`economy.expense.${k}`);
    for (const u of ['stage2', 'stage3', 'assistant']) {
      expectKey(`economy.upgrade.${u}.name`);
      expectKey(`economy.upgrade.${u}.desc`);
    }
    for (const n of [1, 2, 3]) {
      expectKey(`economy.loan.line${n}`);
      expectKey(`economy.stage.${n}`);
    }
    for (const e of ['empty', 'corrupt', 'newer_version', 'storage_failed']) expectKey(`economy.save.${e}`);
  });

  it('every text key produced during real play exists', () => {
    const sim = GameSim.newGame({ seed: 77, shopName: 'Keys', skipTutorial: true });
    const bot = new AutoPlayer(sim, { seed: 3 });
    const seen = new Set<string>();
    const collect = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(collect);
      const o = node as Record<string, unknown>;
      if (typeof o.key === 'string' && o.key.includes('.')) {
        seen.add(o.key);
        if (o.params && typeof o.params === 'object') {
          for (const v of Object.values(o.params)) if (typeof v === 'string' && v.startsWith('@')) seen.add(v.slice(1));
        }
      }
      for (const k of ['nameKey', 'descKey', 'effectKey', 'tierKey']) if (typeof o[k] === 'string') seen.add(o[k] as string);
      for (const v of Object.values(o)) collect(v);
    };
    const advance = sim.advance.bind(sim);
    sim.advance = (dt, o) => {
      const ev = advance(dt, o);
      collect(ev);
      const c = sim.customerAtCounter();
      if (c) {
        collect(c);
        collect(sim.diagnosisOptions(c.id));
        collect(sim.inspect(c.id, 'visual'));
      }
      return ev;
    };
    const deliver = sim.deliver.bind(sim);
    sim.deliver = (id) => {
      const r = deliver(id);
      collect(r);
      return r;
    };
    for (let d = 0; d < 25; d++) {
      collect(bot.playDay());
      collect(sim.market());
      const cat = sim.catalog();
      collect(cat.tools);
      collect(cat.upgrades);
      collect(cat.parts('fone8'));
    }
    const mine = [...seen].filter((k) => NAMESPACES.some((ns) => k.startsWith(`${ns}.`)));
    expect(mine.length).toBeGreaterThan(150);
    for (const k of mine) expectKey(k);
    // nothing leaks into namespaces owned by other modules, except the decoration catalogue
    expect([...seen].filter((k) => !mine.includes(k) && !k.startsWith('decor.'))).toEqual([]);
  });
});
