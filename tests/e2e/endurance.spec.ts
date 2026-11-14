import { expect, test } from '@playwright/test';
import { boot, collectErrors } from './helpers';

test('ten simulated days leak neither GPU resources nor save-file size', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.__game.newGame('Leak Fix', true, 99));
  await page.waitForFunction(() => window.__game.mode() === 'stall');
  const samples: Array<{ day: number; geometries: number; textures: number; stateSize: number }> = [];
  for (let i = 0; i < 10; i++) {
    samples.push(await page.evaluate(() => window.__game.simulateDay()));
    await page.waitForTimeout(400);
  }
  console.warn(samples.map((s) => `d${s.day}: geo ${s.geometries} tex ${s.textures} save ${Math.round(s.stateSize / 1024)}kB`).join(' | '));
  const early = samples[2]!;
  const late = samples[9]!;
  expect(late.day).toBe(early.day + 7);
  // phone visuals, shop and people are rebuilt every day: resource counts must stay flat
  expect(late.geometries).toBeLessThanOrEqual(early.geometries + 12);
  expect(late.textures).toBeLessThanOrEqual(early.textures + 12);
  expect(late.stateSize).toBeLessThan(early.stateSize * 1.6 + 20_000);
  const stats = (await page.evaluate(() => window.__game.state().stats)) as { usedBought: number };
  expect(stats.usedBought, 'a phone was bought and repaired on most days').toBeGreaterThanOrEqual(6);
  expect(errors).toEqual([]);
});
