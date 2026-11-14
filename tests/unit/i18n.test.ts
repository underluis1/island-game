import { describe, expect, it } from 'vitest';
import { allKeys, hasKey } from '../../src/core/i18n';
import { PHONE_DEFS } from '../../src/data/phones';
import { FAULTS } from '../../src/gameplay/repair/faults';

describe('i18n', () => {
  it('Italian and English have exactly the same keys', () => {
    const it_ = new Set(allKeys('it'));
    const en = new Set(allKeys('en'));
    expect([...it_].filter((k) => !en.has(k))).toEqual([]);
    expect([...en].filter((k) => !it_.has(k))).toEqual([]);
    expect(it_.size).toBeGreaterThan(1200);
  });

  it('every key referenced by phone data and faults exists', () => {
    const missing: string[] = [];
    const need = (k: string): void => {
      if (!hasKey(k, 'it') || !hasKey(k, 'en')) missing.push(k);
    };
    for (const def of Object.values(PHONE_DEFS)) {
      need(def.nameKey);
      for (const c of def.components) {
        need(c.nameKey);
        need(c.descKey);
        need(`parts.category.${c.partCategory}`);
        for (const f of c.attachedBy) {
          if (f.type === 'connector') need(`parts.conn.${f.connectorId}`);
          if (f.type === 'screw') need(`parts.screw.${f.screwType}.name`);
        }
      }
    }
    for (const f of FAULTS) {
      need(`faults.${f.id}.name`);
      need(`faults.${f.id}.diagnosis`);
      for (let i = 1; i <= f.complaints; i++) need(`faults.${f.id}.complaint${i}`);
    }
    expect(missing).toEqual([]);
  });
});
