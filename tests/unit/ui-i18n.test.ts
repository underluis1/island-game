import { describe, expect, it } from 'vitest';
import en from '../../src/data/i18n/en/ui.json';
import it_ from '../../src/data/i18n/it/ui.json';

function flatten(prefix: string, node: unknown, out: Map<string, string>): void {
  if (typeof node === 'string') out.set(prefix, node);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) flatten(prefix ? `${prefix}.${k}` : k, v, out);
  }
}
const placeholders = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();

describe('ui i18n namespace', () => {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  flatten('ui', it_, a);
  flatten('ui', en, b);
  it('has the same keys in Italian and English', () => {
    expect([...a.keys()].filter((k) => !b.has(k))).toEqual([]);
    expect([...b.keys()].filter((k) => !a.has(k))).toEqual([]);
  });
  it('has no empty strings and matching placeholders', () => {
    for (const [k, v] of a) {
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect((b.get(k) ?? '').trim().length, k).toBeGreaterThan(0);
      expect(placeholders(b.get(k) ?? ''), k).toEqual(placeholders(v));
    }
  });
});
