import { expect, test } from '@playwright/test';
import { boot, collectErrors } from './helpers';

test('boots offline from the production build without console errors', async ({ page }) => {
  const errors = collectErrors(page);
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== 'localhost' && u.protocol !== 'data:' && u.protocol !== 'blob:') external.push(r.url());
  });
  await boot(page);
  await expect(page.locator('[data-view="main-menu"], [data-view="mainMenu"], [data-view="menu"]').first()).toBeVisible();
  expect(external, 'no runtime request may leave the machine').toEqual([]);
  expect(errors).toEqual([]);
});

test('main scene stays within the frame and draw budgets (medium preset)', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.__game.newGame('Perf Fix', true, 1234));
  await page.waitForFunction(() => window.__game.mode() === 'stall');
  await page.evaluate(() => window.__game.setTime(10));
  // 20 seconds of plain play in the main scene
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    samples.push(await page.evaluate(() => window.__game.stats().fps));
  }
  const stats = await page.evaluate(() => window.__game.stats());
  const avg = samples.slice(2).reduce((a, b) => a + b, 0) / (samples.length - 2);
  console.warn(`avg fps ${avg.toFixed(1)} · draw calls ${stats.drawCalls} · triangles ${stats.triangles}`);
  expect(avg).toBeGreaterThan(50);
  expect(stats.drawCalls).toBeLessThan(200);
  expect(stats.triangles).toBeLessThan(600_000);
  expect(errors).toEqual([]);
});
