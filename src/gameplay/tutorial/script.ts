/**
 * Tutorial script (pure data + tiny state machine). Lung Somchai teaches by reacting to what the
 * guide suggests next: each lesson is shown once, the first time its step comes up.
 */
export type TutorialPhase = 'intro' | 'teardown' | 'reassembly' | 'first_customer' | 'first_purchase' | 'done';

export interface DialogLine {
  speaker: 'somchai' | 'noi' | 'chai';
  /** i18n key */
  key: string;
}

const s = (key: string): DialogLine => ({ speaker: 'somchai', key: `tutorial.${key}` });

export const TUTORIAL_INTRO: DialogLine[] = [s('intro.1'), s('intro.2'), s('intro.3'), s('intro.4'), s('intro.5')];
export const TUTORIAL_AFTER_TEST: DialogLine[] = [s('after_test.1'), s('after_test.2'), s('after_test.3')];
export const TUTORIAL_PURCHASE: DialogLine[] = [s('first_purchase.1')];
export const TUTORIAL_BYE: DialogLine[] = [s('first_purchase.done'), s('first_purchase.bye')];

/** guide hint (suffix of repair.hint.*) → lesson, per phase */
const LESSONS: Record<'teardown' | 'reassembly', string[]> = {
  teardown: ['power_off', 'unscrew', 'place_screw', 'heat', 'suction', 'cut', 'open', 'disconnect_battery', 'disconnect', 'remove', 'pull_tab', 'pry_pad'],
  reassembly: ['install', 'pick_screw', 'screw_in', 'connect', 'connect_battery', 'close', 'done'],
};

export class TutorialTeacher {
  constructor(private seen: string[]) {}

  /** Lesson to speak for a guide hint, or null when already taught / not relevant. */
  lessonFor(phase: TutorialPhase, hintTextKey: string): DialogLine | null {
    if (phase !== 'teardown' && phase !== 'reassembly') return null;
    const id = hintTextKey.replace('repair.hint.', '');
    if (!LESSONS[phase].includes(id)) return null;
    const tag = `${phase}:${id}`;
    if (this.seen.includes(tag)) return null;
    this.seen.push(tag);
    return s(`lesson.${id}`);
  }

  once(tag: string): boolean {
    if (this.seen.includes(tag)) return false;
    this.seen.push(tag);
    return true;
  }
}
