import type { PhoneDef } from '../../gameplay/repair/types';
import fone8 from './fone8.json';
import fonex from './fonex.json';
import fone12 from './fone12.json';
import fone14 from './fone14.json';

/** Adding a model = adding a JSON file here (plus, optionally, new mesh generator params). */
export const PHONE_DEFS: Record<string, PhoneDef> = {
  fone8: fone8 as unknown as PhoneDef,
  fonex: fonex as unknown as PhoneDef,
  fone12: fone12 as unknown as PhoneDef,
  fone14: fone14 as unknown as PhoneDef,
};

export const PHONE_IDS = Object.keys(PHONE_DEFS);

export function phoneDef(id: string): PhoneDef {
  const d = PHONE_DEFS[id];
  if (!d) throw new Error(`unknown phone model ${id}`);
  return d;
}
