/** Contesto condiviso dai costruttori delle tre fasi del negozio. */
import * as THREE from 'three';
import { RNG } from '../../core/rng';
import { Batch, Pen, type V3 } from './kit';
import type { AcRig, FanRig } from './parts';
import type { Rect, ShopAnchors, ShopOptions } from './shop-types';

export interface SignFace {
  w: number;
  h: number;
  m: THREE.Matrix4;
  /** rettangolo UV [u0, v0, u1, v1] nel canvas dell'insegna */
  uv: [number, number, number, number];
}

export interface LocalLight {
  kind: 'point' | 'spot';
  pos: V3;
  target?: V3;
  color: number;
  intensity: number;
  distance: number;
  angle?: number;
}

export interface StageCtx {
  opts: ShopOptions;
  rng: RNG;
  /** legno ripetibile (banco, pedana, struttura) */
  wood: Pen;
  /** atlante: oggetti vari */
  atlas: Pen;
  thatch: Pen;
  plaster: Pen;
  /** tessuto bifacciale che ondeggia */
  cloth: Pen;
  glass: Pen;
  /** emissivi accesi solo con lampsOn (lucine, faretti) */
  glow: Pen;
  /** tetto/tendone in atlante o legno nascosto in modalità arredamento */
  radio: Pen;
  fan: Pen;
  lamp: Pen;
  rack: Pen;
  tablet: Pen;
  signFrame: Pen;
  signFaces: SignFace[];
  signStyle: 'painted' | 'carved' | 'lightbox';
  fanRig: FanRig | null;
  acRig: AcRig | null;
  lampPos: V3;
  lights: LocalLight[];
  /** bordi da cui gocciola la pioggia */
  dripEdges: Array<[V3, V3]>;
  /** pavimento rialzato (pedana/pavimento): quota e impronta */
  floor: { y: number; area: Rect } | null;
  decorArea: Rect;
  blocked: Rect[];
  wallSlots: Array<{ position: V3; normal: V3 }>;
  hangSlots: V3[];
  shelfSlots: V3[];
  deviceSlots: V3[];
  rackSlots: V3[];
  anchors: ShopAnchors;
}

export function createCtx(opts: ShopOptions): StageCtx {
  const rng = new RNG(1337 + opts.stage * 101);
  const pen = (mode: 'atlas' | 'repeat'): Pen => new Pen(new Batch(mode, rng));
  return {
    opts,
    rng,
    wood: pen('repeat'),
    atlas: pen('atlas'),
    thatch: pen('repeat'),
    plaster: pen('repeat'),
    cloth: pen('repeat'),
    glass: pen('atlas'),
    glow: pen('atlas'),
    radio: pen('atlas'),
    fan: pen('atlas'),
    lamp: pen('atlas'),
    rack: pen('atlas'),
    tablet: pen('atlas'),
    signFrame: pen('atlas'),
    signFaces: [],
    signStyle: 'painted',
    fanRig: null,
    acRig: null,
    lampPos: new THREE.Vector3(-0.6, 1.3, -0.15),
    lights: [],
    dripEdges: [],
    floor: null,
    decorArea: { minX: -4, maxX: 4, minZ: -3, maxZ: 3.5 },
    blocked: [],
    wallSlots: [],
    hangSlots: [],
    shelfSlots: [],
    deviceSlots: [],
    rackSlots: [],
    anchors: {
      customerSpot: new THREE.Vector3(0, 0, -1.15),
      seat: new THREE.Vector3(0, 0, 0.75),
      tablet: new THREE.Vector3(0.8, 0.9, 0.16),
      cashBox: new THREE.Vector3(1.07, 0.86, 0.26),
      assistantSpot: new THREE.Vector3(1.9, 0, 1.3),
      showcase: null,
    },
  };
}

export const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });
