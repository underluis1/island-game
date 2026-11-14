// Screenshot helper (GPU-accelerated headless Chromium).
// usage: node scripts/shot.mjs <url> <out.png> [--wait ms] [--eval "js"] [--size 1600x900] [--stats]
// --eval runs JS in the page before the screenshot (after the first wait), then waits again.
// Prints console errors and (with --stats) window.__stats if the page exposes it.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const wait = Number(opt('wait', 2500));
const evalJs = opt('eval', '');
const [w, h] = String(opt('size', '1600x900')).split('x').map(Number);

const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e}`));
await page.goto(url);
await page.waitForTimeout(wait);
if (evalJs) {
  const r = await page.evaluate(evalJs);
  if (r !== undefined) console.log('eval result:', JSON.stringify(r));
  await page.waitForTimeout(wait);
}
await page.screenshot({ path: out });
if (args.includes('--stats')) {
  console.log('stats:', JSON.stringify(await page.evaluate(() => window.__stats ?? null)));
}
console.log(errors.length ? errors.join('\n') : 'no console errors/warnings');
await browser.close();
