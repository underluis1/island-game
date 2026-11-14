import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS } from '../../src/core/settings';

// Pure helpers only: these modules import CSS, which Vitest ignores in node.
import { parseDialogueText } from '../../src/ui/dialogue';
import { isReservedKey, rebindKey } from '../../src/ui/settings-panel';

describe('dialogue markup', () => {
  it('splits thai words and glosses', () => {
    expect(parseDialogueText('{{Sawasdee|ciao}}! Come va?')).toEqual([
      { text: 'Sawasdee', kind: 'thai' },
      { text: ' (ciao)', kind: 'gloss' },
      { text: '! Come va?', kind: 'plain' },
    ]);
    expect(parseDialogueText('niente markup')).toEqual([{ text: 'niente markup', kind: 'plain' }]);
    expect(parseDialogueText('a {{mai pen rai}} b').map((s) => s.kind)).toEqual(['plain', 'thai', 'plain']);
  });
});

describe('key rebinding', () => {
  it('swaps keys on conflict', () => {
    const next = rebindKey(DEFAULT_KEYS, 'focus', DEFAULT_KEYS.guide);
    expect(next.focus).toBe(DEFAULT_KEYS.guide);
    expect(next.guide).toBe(DEFAULT_KEYS.focus);
    expect(new Set(Object.values(next)).size).toBe(Object.values(next).length);
  });
  it('reserves the digit keys for tools', () => {
    expect(isReservedKey('Digit1')).toBe(true);
    expect(isReservedKey('KeyK')).toBe(false);
  });
});
