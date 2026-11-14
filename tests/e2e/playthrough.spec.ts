import { expect, test } from '@playwright/test';
import { boot, collectErrors, finishJob, talk } from './helpers';

test('automatic playthrough: tutorial, first order, shop, decoration, save and reload', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.__game.newGame('Phi Phi Fix', false, 20261111));
  await page.waitForFunction(() => window.__game.mode() === 'stall');

  // --- tutorial: Somchai's introduction, then the guided teardown of the wreck
  await talk(page);
  expect(await page.evaluate(() => window.__game.state().tutorial.phase)).toBe('teardown');
  await page.evaluate(() => window.__game.enterRepair());
  await page.waitForFunction(() => window.__game.mode() === 'repair');
  const end = await page.evaluate(() => window.__game.autoRepair(6000));
  expect(end).toBe('repair.hint.done');
  expect(await page.evaluate(() => window.__game.state().tutorial.phase)).toBe('reassembly');
  expect(await page.evaluate(() => window.__game.state().encyclopedia.length)).toBeGreaterThan(10);
  await talk(page);
  await finishJob(page);
  await talk(page);

  // --- first customer: quote, battery swap with Somchai's gift, final test, payment
  await page.waitForFunction(() => window.__game.state().counter !== null);
  expect(await page.evaluate(() => window.__game.state().tutorial.phase)).toBe('first_customer');
  const moneyBefore = await page.evaluate(() => window.__game.state().money);
  expect(await page.evaluate(() => window.__game.acceptFairQuote())).toBe(true);
  await page.evaluate(() => window.__game.enterRepair());
  await page.waitForFunction(() => window.__game.mode() === 'repair');
  expect(await page.evaluate(() => window.__game.autoRepair(6000))).toBe('repair.hint.done');
  await finishJob(page);
  await page.locator('[data-view="delivery-result"] button').last().click({ timeout: 30_000 });
  const moneyAfter = await page.evaluate(() => window.__game.state().money);
  expect(moneyAfter).toBeGreaterThan(moneyBefore);
  expect(await page.evaluate(() => window.__game.state().reputation.reviews.length)).toBe(1);
  await talk(page);

  // --- first purchase ends the tutorial
  expect(await page.evaluate(() => window.__game.state().tutorial.phase)).toBe('first_purchase');
  await page.evaluate(() => window.__game.openTablet('catalog'));
  await page.waitForSelector('[data-view="tablet"]');
  const buy = page.locator('[data-view="tablet"] button:not([disabled])', { hasText: /Compra|Buy/ }).first();
  await buy.click();
  await talk(page);
  await page.waitForFunction(() => window.__game.state().tutorial.phase === 'done');
  const tools = await page.evaluate(() => window.__game.state().tools);
  expect(Object.values(tools).reduce((a, b) => a + b, 0)).toBeGreaterThan(9);

  // --- place a decoration
  await page.evaluate(() => window.__game.giveMoney(2000));
  expect(await page.evaluate(() => window.__game.placeAnyDecor('plant_monstera'))).toBe(true);
  expect(await page.evaluate(() => window.__game.state().decor.filter((d) => d.placed).length)).toBe(1);

  // --- save, reload the page, load: the state must be identical
  const saved = await page.evaluate(() => {
    window.__game.save('slot2');
    return window.__game.snapshot();
  });
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready() === true, null, { timeout: 90_000 });
  await page.mouse.click(800, 620);
  await page.waitForFunction(() => window.__game.mode() === 'menu');
  const loaded = await page.evaluate(() => {
    window.__game.load('slot2');
    return window.__game.snapshot();
  });
  expect(JSON.parse(loaded)).toEqual(JSON.parse(saved));
  await page.waitForFunction(() => window.__game.mode() === 'stall');
  expect(errors).toEqual([]);
});
