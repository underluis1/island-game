import { describe, expect, it } from 'vitest';
import { hasKey } from '../../src/core/i18n';
import { TUTORIAL_AFTER_TEST, TUTORIAL_BYE, TUTORIAL_INTRO, TUTORIAL_PURCHASE, TutorialTeacher } from '../../src/gameplay/tutorial/script';

describe('tutorial script', () => {
  it('teaches each lesson once and only in its phase', () => {
    const t = new TutorialTeacher([]);
    expect(t.lessonFor('teardown', 'repair.hint.unscrew')?.key).toBe('tutorial.lesson.unscrew');
    expect(t.lessonFor('teardown', 'repair.hint.unscrew')).toBeNull();
    expect(t.lessonFor('teardown', 'repair.hint.screw_in')).toBeNull();
    expect(t.lessonFor('reassembly', 'repair.hint.screw_in')?.key).toBe('tutorial.lesson.screw_in');
    expect(t.lessonFor('done', 'repair.hint.heat')).toBeNull();
  });

  it('every line exists in both languages', () => {
    const t = new TutorialTeacher([]);
    const keys = [...TUTORIAL_INTRO, ...TUTORIAL_AFTER_TEST, ...TUTORIAL_PURCHASE, ...TUTORIAL_BYE].map((l) => l.key);
    for (const id of ['power_off', 'unscrew', 'place_screw', 'heat', 'suction', 'cut', 'open', 'disconnect_battery', 'disconnect', 'remove', 'pull_tab', 'pry_pad']) {
      keys.push(t.lessonFor('teardown', `repair.hint.${id}`)!.key);
    }
    for (const id of ['install', 'pick_screw', 'screw_in', 'connect', 'connect_battery', 'close', 'done']) {
      keys.push(t.lessonFor('reassembly', `repair.hint.${id}`)!.key);
    }
    for (const k of keys) {
      expect(hasKey(k, 'it'), k).toBe(true);
      expect(hasKey(k, 'en'), k).toBe(true);
    }
  });
});
