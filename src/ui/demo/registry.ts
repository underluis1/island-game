/**
 * Demo gallery registry (dev only — never imported by the game).
 * Each `*.demo.ts` file in this folder registers one or more screens with realistic fake data.
 */
import type { UIRoot } from '../root';

export type DemoBg = 'beach' | 'sunset' | 'night' | 'bench' | 'dark';

export interface DemoCtx {
  root: UIRoot;
  variant: string;
  params: URLSearchParams;
  /** record a callback invocation (shown in the on-screen log with ?log=1, always in __ui.calls) */
  log(name: string, ...args: unknown[]): void;
  /** callbacks object whose every member logs its call: `ctx.spy<HudCallbacks>()` */
  spy<C extends object>(overrides?: Partial<C>): C;
  setBg(bg: DemoBg): void;
  /** register a requestAnimationFrame loop that is stopped when the demo is torn down */
  loop(fn: (time: number, dt: number) => void): void;
  /** register a cleanup */
  onCleanup(fn: () => void): void;
}

export type DemoFn = (ctx: DemoCtx) => void;

export interface DemoDef {
  title?: string;
  bg?: DemoBg;
  /** first key = default variant */
  variants: Record<string, DemoFn>;
}

export const demos = new Map<string, DemoDef>();

export function registerDemo(name: string, def: DemoDef): void {
  demos.set(name, def);
}
