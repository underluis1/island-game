import type { Page } from '@playwright/test';

export interface DebugApi {
  ready(): boolean;
  mode(): string;
  state(): Record<string, unknown> & {
    money: number;
    day: number;
    time: number;
    tutorial: { phase: string };
    counter: { name: string } | null;
    orders: Array<{ id: string; status: string }>;
    tools: Record<string, number>;
    decor: Array<{ itemId: string; placed: unknown }>;
    encyclopedia: string[];
    reputation: { value: number; reviews: unknown[] };
  };
  snapshot(): string;
  stats(): { fps: number; drawCalls: number; triangles: number };
  newGame(name?: string, skipTutorial?: boolean, seed?: number): void;
  enterRepair(id?: string): void;
  exitRepair(): void;
  autoRepair(n?: number): string;
  finalTest(): Promise<void>;
  acceptFairQuote(): boolean;
  stockPartsForJob(): number;
  placeAnyDecor(itemId: string): boolean;
  buyTool(id: string): boolean;
  openTablet(tab?: string): void;
  closeTablet(): void;
  enterDecor(): void;
  exitDecor(): void;
  save(slot?: string): boolean;
  load(slot?: string): boolean;
  setTime(h: number): void;
  setRain(r: number): void;
  giveMoney(n: number): void;
  skipTutorial(): void;
  simulateDay(): { day: number; geometries: number; textures: number; stateSize: number };
}

declare global {
  interface Window {
    __game: DebugApi;
  }
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** Loads the build, waits for the world and clicks through the splash screen. */
export async function boot(page: Page): Promise<void> {
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__game?.ready() === true, null, { timeout: 90_000 });
  await page.mouse.click(800, 620);
  await page.waitForFunction(() => window.__game.mode() === 'menu', null, { timeout: 15_000 });
}

/** Clicks through any open dialogue. */
export async function talk(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (!(await page.$('[data-view="dialogue"]'))) {
      await page.waitForTimeout(250);
      if (!(await page.$('[data-view="dialogue"]'))) return;
    }
    // a line with choices takes the first one (key 1), plain lines advance with Space
    if (await page.$('[data-view="dialogue"].has-choices')) await page.keyboard.press('Digit1');
    else await page.keyboard.press('Space');
    await page.waitForTimeout(120);
  }
}

/** Runs the final test and confirms the result card. */
export async function finishJob(page: Page): Promise<void> {
  await page.evaluate(() => window.__game.finalTest());
  const deliver = page.locator('[data-view="final-test"] .ft-foot button').last();
  await deliver.waitFor({ state: 'visible', timeout: 40_000 });
  await deliver.click({ timeout: 40_000 });
}
