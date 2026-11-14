/** Drives the PearOS screen texture of the phone on the bench: boot, home, faults and the final test. */
import { evaluatePhone } from '../gameplay/repair/evaluate';
import type { FunctionId, PhoneDef, PhoneInstance, TestReport, TestStatus } from '../gameplay/repair/types';
import type { PhoneVisual } from '../procgen/phones/phone';
import { drawPhoneScreen, type PhoneScreenKind, type PhoneScreenState } from '../ui/phone-screens';

const TEST_SCREEN: Partial<Record<FunctionId, PhoneScreenKind>> = {
  touch: 'test_touch',
  trueTone: 'test_true_tone',
  biometric: 'test_biometric',
  frontCamera: 'test_camera',
  rearCamera: 'test_camera',
  speaker: 'test_speaker',
  earpiece: 'test_speaker',
  microphone: 'test_microphone',
  charging: 'charging',
  wireless: 'charging',
  vibration: 'vibration',
};

export const TEST_ORDER: FunctionId[] = [
  'power',
  'display',
  'touch',
  'trueTone',
  'biometric',
  'frontCamera',
  'rearCamera',
  'speaker',
  'earpiece',
  'microphone',
  'charging',
  'wireless',
  'vibration',
  'sim',
  'battery',
];

export class PhoneScreenDriver {
  private time = 0;
  private bootT = -1;
  private override: PhoneScreenState | null = null;
  private lastKey = '';
  private acc = 0;

  constructor(
    private visual: PhoneVisual,
    private def: PhoneDef,
    private phone: PhoneInstance,
    private clock: () => string,
  ) {}

  private get notch(): boolean {
    return this.def.style.front !== 'home';
  }

  boot(): void {
    this.bootT = 0;
  }

  /** Screen implied by the current state of the phone. */
  private baseState(): PhoneScreenState {
    const report = evaluatePhone(this.def, this.phone);
    const base = { notch: this.notch, clock: this.clock(), battery: 0.74 };
    if (!this.phone.poweredOn || report.functions.power !== 'pass') return { kind: 'off', ...base };
    const d = report.functions.display;
    if (d === 'fail') {
      const disp = this.def.components.find((c) => c.partCategory === 'display');
      const cs = disp ? this.phone.comps[disp.id] : undefined;
      // unplugged or dead panel: black, maybe with the backlight on; corroded connector: garbage on screen
      if (cs && cs.corrosion > 0.35) return { kind: 'glitch', severity: Math.min(1, cs.corrosion * 1.5), ...base };
      return { kind: cs && cs.state !== 'removed' && cs.condition !== 'damaged' ? 'backlight' : 'off', ...base };
    }
    if (d === 'degraded') return { kind: 'glitch', severity: 0.35, ...base };
    if (this.bootT >= 0 && this.bootT < 2.2) return { kind: 'boot', progress: this.bootT / 2.2, ...base };
    return { kind: 'home', ...base };
  }

  setOverride(s: PhoneScreenState | null): void {
    this.override = s;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.bootT >= 0) this.bootT += dt;
    this.acc += dt;
    const s = this.override ?? this.baseState();
    const animated = s.kind !== 'off' && s.kind !== 'backlight';
    const key = `${s.kind}:${s.result ?? ''}:${s.camera ?? ''}`;
    // static screens repaint only on change; animated ones at ~15 fps
    if (key === this.lastKey && (!animated || this.acc < 1 / 15)) return;
    this.acc = 0;
    this.lastKey = key;
    const cv = this.visual.screenCanvas;
    drawPhoneScreen(this.visual.screenCtx, cv.width, cv.height, s, this.time);
    this.visual.setScreenOn(s.kind !== 'off');
    this.visual.refreshScreen();
  }

  /**
   * Plays the final test: one screen per function, revealing results one at a time.
   * `onStep` fires when each result is known.
   */
  async runTest(onStep: (fn: FunctionId, status: TestStatus, index: number) => void, wait: (s: number) => Promise<void>): Promise<TestReport> {
    const report = evaluatePhone(this.def, this.phone);
    const base = { notch: this.notch, clock: this.clock(), battery: 0.74 };
    let i = 0;
    for (const fn of TEST_ORDER) {
      const status = report.functions[fn];
      if (status === 'na') continue;
      const kind = TEST_SCREEN[fn];
      const canShow = report.functions.power === 'pass' && report.functions.display !== 'fail';
      if (kind && canShow) {
        this.setOverride({
          kind,
          ...base,
          result: 'running',
          camera: fn === 'frontCamera' ? 'front' : 'rear',
          charging: status !== 'fail',
          deadCells: fn === 'touch' && status !== 'pass' ? [7, 12, 17, 22, 27] : [],
        });
        await wait(0.55);
        this.setOverride({
          kind,
          ...base,
          result: status === 'fail' ? 'fail' : 'pass',
          progress: 1,
          camera: fn === 'frontCamera' ? 'front' : 'rear',
          charging: status !== 'fail',
          deadCells: fn === 'touch' && status !== 'pass' ? [7, 12, 17, 22, 27] : [],
        });
        this.lastKey = '';
      }
      onStep(fn, status, i++);
      await wait(kind && canShow ? 0.35 : 0.22);
    }
    this.setOverride(null);
    return report;
  }
}
