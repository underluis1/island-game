// Captures the final screenshot set from a running build.
// usage: npm run build && npx vite preview --port 4173 &  then  node scripts/final-shots.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? 'docs/screenshots/final';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name, wait = 1500) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 82 });
};
const start = async (seed, skip = true) => {
  await page.goto(`${base}/?debug`);
  await page.waitForFunction(() => window.__game?.ready(), null, { timeout: 90000 });
  await page.mouse.click(800, 620);
  await page.waitForFunction(() => window.__game.mode() === 'menu');
  await page.waitForTimeout(600);
  if (seed == null) return;
  await ev(([s, k]) => window.__game.newGame('Phi Phi Fix', k, s), [seed, skip]);
  await page.waitForFunction(() => window.__game.mode() === 'stall');
};
const talk = async () => {
  for (let i = 0; i < 60; i++) {
    if (!(await page.$('[data-view="dialogue"]'))) return;
    await page.keyboard.press((await page.$('[data-view="dialogue"].has-choices')) ? 'Digit1' : 'Space');
    await page.waitForTimeout(130);
  }
};

// menu
await start(null);
await shot('01-menu', 1200);

// tutorial with Somchai
await start(11, false);
await shot('02-tutorial-somchai', 1500);
await talk();
await ev(() => window.__game.enterRepair());
await shot('03-repair-closed', 1800);
await ev(() => window.__game.autoRepair(60));
await shot('04-repair-open-lesson', 1500);
await talk();
await ev(() => window.__game.autoRepair(200));
await talk();
await shot('05-repair-teardown', 1500);

// the stall through the day
await start(77);
await ev(() => window.__game.giveMoney(250000));
for (const id of ['plant_monstera', 'plant_palm', 'lantern_paper', 'surfboard_stand', 'neon_open']) await ev((i) => window.__game.placeAnyDecor(i), id);
await ev(() => window.__game.setTime(10.5));
await shot('06-stall-day', 2500);
await ev(() => window.__game.setTime(17.9));
await shot('07-stall-golden-hour', 2800);
await ev(() => window.__game.setTime(19.7));
await shot('08-stall-night', 3200);
await ev(() => {
  window.__game.setTime(13);
  window.__game.setRain(1);
});
await shot('09-stall-rain', 3200);
await ev(() => {
  window.__game.setRain(0);
  window.__game.setTime(9.2);
});

// customer, quote, repair, test, delivery
await page.waitForFunction(() => window.__game.state().counter, null, { timeout: 120000 });
await page.waitForTimeout(6500);
const c = await ev(() => {
  const g = window.__game.game;
  const p = g.stall.visitor(g.state.counter.id).root.position.clone();
  p.y += 1.2;
  p.project(g.engine.camera);
  return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
});
await page.mouse.click(c.x, c.y);
await shot('10-customer-quote', 1200);
await ev(() => window.__game.acceptFairQuote());
await page.waitForTimeout(500);
await ev(() => {
  window.__game.stockPartsForJob();
  window.__game.state().tools.ipa = 1;
  window.__game.enterRepair();
});
await ev(() => window.__game.autoRepair(45));
await shot('11-repair-guide', 1800);
await ev(() => window.__game.autoRepair(6000));
await ev(() => window.__game.finalTest());
await page.locator('[data-view="final-test"] .ft-foot button').last().waitFor({ state: 'visible', timeout: 40000 });
await shot('12-final-test', 800);
await page.locator('[data-view="final-test"] .ft-foot button').last().click({ timeout: 40000 });
if (await page.$('[data-view="delivery-result"]')) await shot('13-delivery-review', 2500);
await page.locator('[data-view="delivery-result"] button').last().click({ timeout: 5000 }).catch(() => undefined);

// tablet, decoration mode
await page.waitForTimeout(800);
for (const tab of ['orders', 'catalog', 'market', 'encyclopedia', 'reviews']) {
  await ev((t) => window.__game.openTablet(t), tab);
  await shot(`14-tablet-${tab}`, 900);
  await ev(() => window.__game.closeTablet());
  await page.waitForTimeout(300);
}
await ev(() => window.__game.enterDecor());
await shot('15-decor-mode', 2000);
await ev(() => window.__game.exitDecor());

// the three stages
for (const st of [2, 3]) {
  await ev((s) => {
    const g = window.__game.game;
    g.sim.state.stage = s;
    g.stall.syncShop(g.sim.state);
    g.stall.syncDecor(g.sim.state);
  }, st);
  await ev(() => window.__game.setTime(10.5));
  await shot(`16-stage${st}-day`, 2500);
  await ev(() => window.__game.setTime(19.7));
  await shot(`16-stage${st}-night`, 3200);
}

// micro-soldering
await ev(() => {
  const s = window.__game.state();
  s.tools.solder = 2;
  s.tools.microscope = 1;
  window.__game.setTime(11);
});
const id = await ev(() => window.__game.addOwnedPhone('fonex', ['charge_ic']));
await ev((i) => window.__game.enterRepair(i), id);
for (let i = 0; i < 3000; i++) {
  const h = await ev(() => window.__game.hint()?.textKey);
  if (h === 'repair.hint.solder' || h === 'repair.hint.done') break;
  await ev(() => window.__game.autoRepair(1));
}
await shot('17-fonex-teardown', 1500);
await ev(() => {
  const g = window.__game.game;
  g.solder(g.repair.session.phone.boardFaults[0].id);
});
await shot('18-microsoldering', 1500);

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
