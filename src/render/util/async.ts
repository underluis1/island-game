/**
 * Cooperative scheduling for world generation: heavy loops call `await budget.tick()` and the helper
 * yields to the browser whenever the current slice has used its time budget, so the main thread is never
 * blocked for more than a few milliseconds at a time.
 */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (): void => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });
}

export class FrameBudget {
  private sliceStart = performance.now();
  /** longest uninterrupted slice seen so far (ms) and the label that was active: profiling aid */
  longestSlice = 0;
  longestLabel = '';
  label = '';

  constructor(private readonly sliceMs = 10) {}

  private close(): void {
    const d = performance.now() - this.sliceStart;
    if (d > this.longestSlice) {
      this.longestSlice = d;
      this.longestLabel = this.label;
    }
  }

  async tick(): Promise<void> {
    if (performance.now() - this.sliceStart < this.sliceMs) return;
    this.close();
    await yieldToBrowser();
    this.sliceStart = performance.now();
  }

  /** unconditional yield (between big steps) */
  async yield(): Promise<void> {
    this.close();
    await yieldToBrowser();
    this.sliceStart = performance.now();
  }
}
