/** Aspetto dei personaggi: descrizione parametrica (Look) derivata da tipo + seed. */
import { RNG } from '../../core/rng';
import type { Hex } from './geo';

export type CharacterKind =
  | 'tourist'
  | 'local'
  | 'diver'
  | 'backpacker'
  | 'business'
  | 'somchai'
  | 'noi'
  | 'dive_instructor'
  | 'italian_backpacker'
  | 'chai'
  | 'assistant'
  | 'player';

export interface CharacterSpec {
  kind: CharacterKind;
  seed: number;
}

export type HairStyle = 'bald' | 'buzz' | 'short' | 'fringe' | 'long' | 'bob' | 'ponytail' | 'bun' | 'balding' | 'curly';
export type TopStyle = 'tee' | 'tank' | 'shirt' | 'hawaiian' | 'polo' | 'bare' | 'rash';
export type BottomStyle = 'shorts' | 'pants' | 'skirt' | 'wetsuit' | 'shorty';
export type ShoeStyle = 'barefoot' | 'flipflops' | 'sandals' | 'sneakers' | 'shoes';
export type HatStyle = 'none' | 'straw' | 'cap' | 'bucket' | 'bandana' | 'conical';

export interface Look {
  /** altezza in metri */
  height: number;
  /** corporatura: 0.88 esile … 1.2 robusta */
  build: number;
  belly: number;
  female: boolean;
  shoulders: number;
  /** postura curva (anziani) in radianti */
  stoop: number;
  skin: Hex;
  hair: Hex;
  hairStyle: HairStyle;
  facial: 'none' | 'moustache' | 'beard' | 'goatee';
  facialColor: Hex;
  top: TopStyle;
  topColor: Hex;
  topAccent: Hex;
  /** 0 = senza maniche, 1 = corte, 2 = lunghe */
  sleeve: 0 | 1 | 2;
  bottom: BottomStyle;
  bottomColor: Hex;
  bottomAccent: Hex;
  shoes: ShoeStyle;
  shoeColor: Hex;
  hat: HatStyle;
  hatColor: Hex;
  hatAccent: Hex;
  glasses: 'none' | 'clear' | 'sun' | 'forehead';
  mask: boolean;
  pack: 'none' | 'small' | 'big';
  packColor: Hex;
  packAccent: Hex;
  apron: Hex | null;
  tie: Hex | null;
  camera: boolean;
  crate: boolean;
  flower: Hex | null;
  logo: Hex | null;
  backPrint: Hex | null;
  scarf: Hex | null;
  necklace: boolean;
  wetsuitDown: boolean;
  blush: boolean;
}

const SKIN = { fair: 0xf6d3b8, light: 0xeec1a0, sunburn: 0xf2a98e, tan: 0xd9a47c, golden: 0xc98d5e, bronze: 0xb5733f, brown: 0x94603a, deep: 0x6f452b } as const;
const HAIR = { black: 0x1e1714, dark: 0x3b271a, brown: 0x6e4728, blond: 0xdcb96e, sun: 0xe8cf8c, red: 0xa94d2b, grey: 0x9d9c98, white: 0xe9e6df } as const;
export const TROPIC = {
  turquoise: 0x1fb5ad,
  coral: 0xff6f59,
  sun: 0xffc93c,
  palm: 0x3d9a5f,
  hibiscus: 0xf0508a,
  sea: 0x2a7fc9,
  white: 0xf4f1e8,
  sand: 0xe2cfa5,
  navy: 0x24385b,
  orange: 0xf58a3c,
  purple: 0x8a5fc0,
  khaki: 0xb5a67a,
  denim: 0x4f6d94,
  charcoal: 0x3a3f47,
  straw: 0xe3c98a,
  lime: 0xa6cf4a,
  sky: 0x8fd0ea,
  maroon: 0x8c2f39,
} as const;

function base(): Look {
  return {
    height: 1.7,
    build: 1,
    belly: 0,
    female: false,
    shoulders: 1,
    stoop: 0,
    skin: SKIN.light,
    hair: HAIR.dark,
    hairStyle: 'short',
    facial: 'none',
    facialColor: HAIR.dark,
    top: 'tee',
    topColor: TROPIC.white,
    topAccent: TROPIC.coral,
    sleeve: 1,
    bottom: 'shorts',
    bottomColor: TROPIC.khaki,
    bottomAccent: TROPIC.white,
    shoes: 'flipflops',
    shoeColor: TROPIC.charcoal,
    hat: 'none',
    hatColor: TROPIC.straw,
    hatAccent: TROPIC.coral,
    glasses: 'none',
    mask: false,
    pack: 'none',
    packColor: TROPIC.palm,
    packAccent: TROPIC.orange,
    apron: null,
    tie: null,
    camera: false,
    crate: false,
    flower: null,
    logo: null,
    backPrint: null,
    scarf: null,
    necklace: false,
    wetsuitDown: false,
    blush: false,
  };
}

const NAMED: Partial<Record<CharacterKind, () => Look>> = {
  somchai: () => ({
    ...base(),
    height: 1.6,
    build: 1.06,
    belly: 0.55,
    stoop: 0.13,
    skin: SKIN.golden,
    hair: HAIR.grey,
    hairStyle: 'balding',
    facial: 'moustache',
    facialColor: HAIR.grey,
    top: 'hawaiian',
    topColor: TROPIC.turquoise,
    topAccent: TROPIC.sun,
    bottom: 'shorts',
    bottomColor: 0x7a6248,
    shoes: 'flipflops',
    shoeColor: 0x2f4f8a,
    glasses: 'forehead',
  }),
  noi: () => ({
    ...base(),
    height: 1.58,
    build: 0.96,
    female: true,
    skin: SKIN.tan,
    hair: HAIR.black,
    hairStyle: 'bun',
    top: 'tee',
    topColor: TROPIC.hibiscus,
    topAccent: TROPIC.white,
    bottom: 'skirt',
    bottomColor: TROPIC.purple,
    bottomAccent: TROPIC.sun,
    shoes: 'sandals',
    shoeColor: 0x8a5a3a,
    apron: 0xf3e6c8,
    flower: 0xfff6f0,
    blush: true,
  }),
  dive_instructor: () => ({
    ...base(),
    height: 1.83,
    build: 1.08,
    shoulders: 1.12,
    skin: SKIN.bronze,
    hair: HAIR.sun,
    hairStyle: 'fringe',
    facial: 'goatee',
    facialColor: 0xc9a868,
    top: 'bare',
    sleeve: 0,
    bottom: 'wetsuit',
    bottomColor: 0x22272f,
    bottomAccent: TROPIC.orange,
    shoes: 'barefoot',
    mask: true,
    necklace: true,
    wetsuitDown: true,
  }),
  italian_backpacker: () => ({
    ...base(),
    height: 1.78,
    build: 0.93,
    skin: 0xe6b48c,
    hair: HAIR.dark,
    hairStyle: 'curly',
    facial: 'beard',
    facialColor: HAIR.dark,
    top: 'tank',
    topColor: 0x3f8fd8,
    topAccent: TROPIC.white,
    sleeve: 0,
    bottom: 'shorts',
    bottomColor: TROPIC.khaki,
    shoes: 'sandals',
    shoeColor: 0x5a4632,
    hat: 'bandana',
    hatColor: 0xd8342f,
    hatAccent: TROPIC.white,
    pack: 'big',
    packColor: 0x3f7d4e,
    packAccent: TROPIC.orange,
  }),
  chai: () => ({
    ...base(),
    height: 1.66,
    build: 1.14,
    belly: 0.3,
    skin: SKIN.bronze,
    hair: HAIR.black,
    hairStyle: 'short',
    facial: 'goatee',
    facialColor: HAIR.black,
    top: 'shirt',
    topColor: 0xdfe9ee,
    topAccent: TROPIC.sea,
    sleeve: 1,
    bottom: 'pants',
    bottomColor: TROPIC.navy,
    shoes: 'flipflops',
    shoeColor: 0x3d2d22,
    hat: 'straw',
    hatColor: TROPIC.straw,
    hatAccent: TROPIC.maroon,
    crate: true,
    scarf: 0xc9382f,
  }),
  assistant: () => ({
    ...base(),
    height: 1.65,
    build: 0.94,
    female: true,
    skin: SKIN.tan,
    hair: HAIR.dark,
    hairStyle: 'ponytail',
    top: 'polo',
    topColor: TROPIC.turquoise,
    topAccent: TROPIC.white,
    bottom: 'shorts',
    bottomColor: TROPIC.navy,
    shoes: 'sneakers',
    shoeColor: TROPIC.white,
    logo: TROPIC.coral,
    blush: true,
  }),
  player: () => ({
    ...base(),
    height: 1.74,
    build: 0.98,
    skin: SKIN.light,
    hair: HAIR.brown,
    hairStyle: 'short',
    top: 'tee',
    topColor: TROPIC.sun,
    topAccent: TROPIC.white,
    bottom: 'shorts',
    bottomColor: TROPIC.denim,
    shoes: 'sneakers',
    shoeColor: 0xe8e4da,
    hat: 'cap',
    hatColor: TROPIC.turquoise,
    hatAccent: TROPIC.coral,
    backPrint: TROPIC.coral,
  }),
};

const BRIGHTS: Hex[] = [TROPIC.turquoise, TROPIC.coral, TROPIC.sun, TROPIC.palm, TROPIC.hibiscus, TROPIC.sea, TROPIC.orange, TROPIC.purple, TROPIC.lime, TROPIC.sky, TROPIC.white];
const NEUTRALS: Hex[] = [TROPIC.khaki, TROPIC.denim, TROPIC.navy, TROPIC.sand, TROPIC.charcoal, 0x7a6248, TROPIC.white];

function generic(kind: CharacterKind, seed: number): Look {
  const r = new RNG((seed * 2654435761) ^ 0x51ed27);
  r.next();
  const l = base();
  l.female = r.chance(0.5);
  l.height = (l.female ? 1.62 : 1.74) + r.range(-0.07, 0.09);
  l.build = r.range(0.9, 1.14);
  l.belly = r.chance(0.3) ? r.range(0.2, 0.7) : 0;
  l.shoulders = l.female ? 0.94 : r.range(0.98, 1.08);
  l.blush = l.female || r.chance(0.3);
  l.topColor = r.pick(BRIGHTS);
  do l.topAccent = r.pick(BRIGHTS);
  while (l.topAccent === l.topColor);
  l.bottomColor = r.pick(NEUTRALS);
  l.hairStyle = l.female ? r.pick<HairStyle>(['long', 'bob', 'ponytail', 'bun', 'long', 'fringe']) : r.pick<HairStyle>(['short', 'short', 'fringe', 'buzz', 'curly', 'bald']);
  const anyHair = (): Hex => r.pick<Hex>([HAIR.black, HAIR.dark, HAIR.brown, HAIR.blond, HAIR.red, HAIR.sun, HAIR.grey]);
  switch (kind) {
    case 'tourist': {
      l.skin = r.pick<Hex>([SKIN.fair, SKIN.light, SKIN.sunburn, SKIN.sunburn, SKIN.tan, SKIN.brown]);
      l.hair = anyHair();
      l.top = r.pick<TopStyle>(['hawaiian', 'hawaiian', 'tee', 'tank', 'polo']);
      l.bottom = l.female && r.chance(0.45) ? 'skirt' : 'shorts';
      l.shoes = r.pick<ShoeStyle>(['sandals', 'flipflops', 'sneakers']);
      l.shoeColor = r.pick<Hex>([0x8a5a3a, TROPIC.white, TROPIC.coral, TROPIC.charcoal]);
      l.hat = r.pick<HatStyle>(['straw', 'bucket', 'cap', 'none', 'straw']);
      l.hatColor = l.hat === 'straw' ? TROPIC.straw : r.pick<Hex>([TROPIC.white, TROPIC.sand, TROPIC.coral, TROPIC.sea]);
      l.hatAccent = r.pick(BRIGHTS);
      l.glasses = r.chance(0.5) ? 'sun' : 'none';
      l.camera = r.chance(0.45);
      if (!l.camera && r.chance(0.25)) l.pack = 'small';
      break;
    }
    case 'local': {
      l.skin = r.pick<Hex>([SKIN.tan, SKIN.golden, SKIN.golden, SKIN.bronze]);
      l.hair = r.chance(0.2) ? HAIR.grey : HAIR.black;
      l.top = r.pick<TopStyle>(['tee', 'tank', 'shirt', 'polo']);
      l.topColor = r.pick<Hex>([TROPIC.white, TROPIC.sand, TROPIC.sky, TROPIC.coral, TROPIC.palm, TROPIC.sun, 0xdf6a4a]);
      l.bottom = l.female ? r.pick<BottomStyle>(['skirt', 'skirt', 'pants']) : r.pick<BottomStyle>(['pants', 'shorts', 'pants']);
      l.bottomColor = r.pick<Hex>([TROPIC.navy, 0x5b3f6b, 0x2f6b5f, TROPIC.maroon, TROPIC.charcoal, TROPIC.denim]);
      l.shoes = r.pick<ShoeStyle>(['flipflops', 'flipflops', 'barefoot', 'sandals']);
      l.hat = r.pick<HatStyle>(['conical', 'none', 'none', 'cap', 'straw']);
      l.hatColor = l.hat === 'cap' ? r.pick<Hex>([TROPIC.navy, TROPIC.maroon, TROPIC.palm]) : TROPIC.straw;
      l.hatAccent = TROPIC.sand;
      l.height -= 0.05;
      if (!l.female && r.chance(0.3)) l.facial = 'moustache';
      if (l.female && r.chance(0.35)) l.flower = r.pick<Hex>([0xfff6f0, TROPIC.hibiscus, TROPIC.sun]);
      break;
    }
    case 'diver': {
      l.skin = r.pick<Hex>([SKIN.light, SKIN.tan, SKIN.golden, SKIN.bronze, SKIN.brown]);
      l.hair = r.pick<Hex>([HAIR.sun, HAIR.blond, HAIR.dark, HAIR.black, HAIR.brown]);
      l.build = r.range(0.96, 1.1);
      l.belly = 0;
      l.shoulders *= 1.05;
      const full = r.chance(0.5);
      l.top = 'rash';
      l.sleeve = full ? 2 : 1;
      l.topColor = full ? 0x22272f : r.pick<Hex>([TROPIC.sea, TROPIC.turquoise, 0x22272f, TROPIC.coral]);
      l.topAccent = r.pick<Hex>([TROPIC.orange, TROPIC.lime, TROPIC.turquoise, TROPIC.hibiscus, TROPIC.sun]);
      l.bottom = full ? 'wetsuit' : 'shorty';
      l.bottomColor = 0x22272f;
      l.bottomAccent = l.topAccent;
      l.shoes = r.pick<ShoeStyle>(['barefoot', 'flipflops']);
      l.mask = r.chance(0.6);
      if (!l.mask && r.chance(0.5)) l.glasses = 'sun';
      break;
    }
    case 'backpacker': {
      l.skin = r.pick<Hex>([SKIN.fair, SKIN.light, SKIN.sunburn, SKIN.tan, SKIN.brown, SKIN.deep]);
      l.hair = anyHair();
      l.build = r.range(0.88, 1.02);
      l.belly = 0;
      l.top = r.pick<TopStyle>(['tank', 'tank', 'tee']);
      l.bottom = r.pick<BottomStyle>(['shorts', 'pants']);
      if (l.bottom === 'pants') l.bottomColor = r.pick<Hex>([0x5b3f6b, 0x2f6b5f, TROPIC.maroon, 0xc46a2e]);
      l.shoes = r.pick<ShoeStyle>(['sandals', 'barefoot', 'flipflops']);
      l.shoeColor = 0x5a4632;
      l.pack = r.chance(0.75) ? 'big' : 'small';
      l.packColor = r.pick<Hex>([0x3f7d4e, 0x2f5f8f, 0xa33b3b, 0x5a5f6a, 0xc7862f]);
      l.packAccent = r.pick<Hex>([TROPIC.orange, TROPIC.sun, TROPIC.sand, TROPIC.sky]);
      l.hat = r.pick<HatStyle>(['bandana', 'none', 'none', 'bucket', 'cap']);
      l.hatColor = r.pick<Hex>([0xd8342f, TROPIC.sea, TROPIC.palm, TROPIC.sand]);
      l.hatAccent = TROPIC.white;
      if (!l.female) l.facial = r.pick(['beard', 'none', 'goatee', 'none'] as const);
      if (!l.female && r.chance(0.3)) l.hairStyle = 'long';
      l.glasses = r.chance(0.25) ? 'sun' : 'none';
      break;
    }
    default: {
      // business
      l.skin = r.pick<Hex>([SKIN.fair, SKIN.light, SKIN.tan, SKIN.golden, SKIN.brown, SKIN.deep]);
      l.hair = r.pick<Hex>([HAIR.black, HAIR.dark, HAIR.brown, HAIR.grey, HAIR.blond]);
      l.hairStyle = l.female ? r.pick<HairStyle>(['bob', 'bun', 'ponytail']) : r.pick<HairStyle>(['short', 'fringe', 'buzz', 'balding']);
      l.top = 'shirt';
      l.sleeve = r.chance(0.7) ? 2 : 1;
      l.topColor = r.pick<Hex>([0xf4f4f1, 0xcfe0f2, 0xf3dfe3, 0xe3ecd7]);
      l.topAccent = 0xffffff;
      l.bottom = l.female && r.chance(0.5) ? 'skirt' : 'pants';
      l.bottomColor = r.pick<Hex>([TROPIC.navy, TROPIC.charcoal, 0x6a6f78, 0x4a3f38]);
      l.shoes = 'shoes';
      l.shoeColor = r.pick<Hex>([0x2a221e, 0x4a2f20, 0x1d1d22]);
      l.tie = !l.female && r.chance(0.7) ? r.pick<Hex>([TROPIC.maroon, TROPIC.sea, TROPIC.coral, TROPIC.palm]) : null;
      l.glasses = r.chance(0.5) ? 'clear' : r.chance(0.3) ? 'sun' : 'none';
      l.belly = r.chance(0.4) ? r.range(0.3, 0.8) : 0;
      l.blush = false;
      break;
    }
  }
  if (l.top === 'tank' || l.top === 'bare') l.sleeve = 0;
  l.facialColor = l.hair;
  if (l.hat === 'bandana' && l.hairStyle === 'bald') l.hairStyle = 'short';
  return l;
}

export function makeLook(spec: CharacterSpec): Look {
  const named = NAMED[spec.kind];
  return named ? named() : generic(spec.kind, spec.seed);
}
