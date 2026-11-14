import { describe, expect, it } from 'vitest';
import { RNG } from '../../src/core/rng';

describe('RNG', () => {
  it('is deterministic for a given seed', () => {
    const a = new RNG(42);
    const b = new RNG(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('resumes from serialized state', () => {
    const a = new RNG(7);
    a.next();
    const b = new RNG(1);
    b.state = a.state;
    expect(a.next()).toBe(b.next());
  });
  it('int stays in range', () => {
    const r = new RNG(3);
    for (let i = 0; i < 500; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});
