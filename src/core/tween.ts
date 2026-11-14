/** Tiny tween manager driven by the game loop. */
export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1;
  },
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
} satisfies Record<string, Ease>;

interface Tween {
  elapsed: number;
  duration: number;
  delay: number;
  ease: Ease;
  update: (k: number) => void;
  done?: () => void;
  cancelled: boolean;
}

export interface TweenHandle {
  cancel(): void;
  finished: Promise<void>;
}

export class Tweens {
  private list: Tween[] = [];

  add(
    duration: number,
    update: (k: number) => void,
    opts: { ease?: Ease; delay?: number; done?: () => void } = {},
  ): TweenHandle {
    let resolve!: () => void;
    const finished = new Promise<void>((r) => (resolve = r));
    const tw: Tween = {
      elapsed: 0,
      duration: Math.max(0.0001, duration),
      delay: opts.delay ?? 0,
      ease: opts.ease ?? ease.inOutCubic,
      update,
      done: () => {
        opts.done?.();
        resolve();
      },
      cancelled: false,
    };
    this.list.push(tw);
    return {
      cancel: () => {
        tw.cancelled = true;
        resolve();
      },
      finished,
    };
  }

  update(dt: number): void {
    if (this.list.length === 0) return;
    const list = this.list;
    this.list = [];
    for (const tw of list) {
      if (tw.cancelled) continue;
      if (tw.delay > 0) {
        tw.delay -= dt;
        this.list.push(tw);
        continue;
      }
      tw.elapsed += dt;
      const k = Math.min(1, tw.elapsed / tw.duration);
      tw.update(tw.ease(k));
      if (k >= 1) tw.done?.();
      else this.list.push(tw);
    }
  }

  /** Instantly complete every running tween (used by tests / reduced motion). */
  flush(): void {
    let guard = 0;
    while (this.list.length > 0 && guard++ < 50) this.update(1000);
  }

  get active(): number {
    return this.list.length;
  }
}
