import * as THREE from 'three';
import { RNG } from '../../core/rng';
import { GeoBuilder, addBox, addTube, rgb, shade } from './geo';
import type { RGB } from './geo';

/**
 * Thai long-tail boat (ruea hang yao). Local space: +X = bow, +Y = up, origin on the water line amidships.
 * Slender wooden hull with a tall upswept prow wrapped in coloured sashes, thwarts, optional canopy and the
 * characteristic car engine on a pivot with a very long propeller shaft.
 */

export interface LongtailOptions {
  seed: number;
  canopy: boolean;
  /** index in the colour scheme table */
  scheme: number;
  length?: number;
}

interface Scheme {
  hull: RGB;
  band: RGB;
  trim: RGB;
  canopy: RGB;
}

const SCHEMES: readonly Scheme[] = [
  { hull: rgb(0x8c5a32), band: rgb(0xf3ecdc), trim: rgb(0xc8302a), canopy: rgb(0x2a6fb6) },
  { hull: rgb(0x7a4a2a), band: rgb(0xf0c62e), trim: rgb(0x1d8f5e), canopy: rgb(0xeee6d2) },
  { hull: rgb(0x94643a), band: rgb(0xf3ecdc), trim: rgb(0x1f66b8), canopy: rgb(0xd8452e) },
  { hull: rgb(0x80502e), band: rgb(0x26b3a8), trim: rgb(0xf08a24), canopy: rgb(0x2f8f6a) },
  { hull: rgb(0x8a5630), band: rgb(0xe9507a), trim: rgb(0xf3ecdc), canopy: rgb(0x3b7fc4) },
];

const SASHES: readonly RGB[] = [rgb(0xe53935), rgb(0xfdd835), rgb(0x43a047), rgb(0xf06292), rgb(0x1e88e5), rgb(0xfafafa), rgb(0xff9800), rgb(0x8e44ad)];

const WOOD_DECK = rgb(0xa9794a);
const WOOD_DARK = rgb(0x5d3b22);
const METAL = rgb(0x4a4f55);
const METAL_LIGHT = rgb(0x9aa0a6);

export const LONGTAIL_LENGTH = 9.6;

export function buildLongtail(opts: LongtailOptions): THREE.BufferGeometry {
  const rng = new RNG(opts.seed);
  const scheme = SCHEMES[opts.scheme % SCHEMES.length] as Scheme;
  const L = opts.length ?? LONGTAIL_LENGTH;
  const B = 1.55;
  const b = new GeoBuilder();

  const beam = (s: number): number => {
    const front = s > 0.5 ? Math.max(0, 1 - Math.pow((s - 0.5) / 0.5, 2.1)) : 1;
    const back = Math.min(1, 0.5 + 2.4 * s);
    return Math.max(0.035, (B / 2) * front * back);
  };
  const sheer = (s: number): number => 0.5 + 0.12 * Math.pow(1 - s, 3) + (s > 0.55 ? 1.85 * Math.pow((s - 0.55) / 0.45, 2.4) : 0);
  const keel = (s: number): number => {
    const g = sheer(s);
    const rise = s > 0.6 ? (g - 0.2 + 0.22) * Math.pow((s - 0.6) / 0.4, 1.8) : 0;
    return -0.22 + rise + (s < 0.12 ? (0.12 - s) * 0.9 : 0);
  };
  const X = (s: number): number => (s - 0.5) * L;
  const point = (s: number, q: number, side: number, out: THREE.Vector3): THREE.Vector3 => {
    const k = keel(s);
    const g = sheer(s);
    return out.set(X(s), k + (g - k) * Math.pow(q, 1.7), side * beam(s) * Math.pow(q, 0.6));
  };

  // ---- hull shell: three colour bands per side
  const STATIONS = 22;
  const bands: readonly { q0: number; q1: number; rows: number; color: RGB }[] = [
    { q0: 0, q1: 0.64, rows: 4, color: scheme.hull },
    { q0: 0.64, q1: 0.83, rows: 1, color: scheme.band },
    { q0: 0.83, q1: 1, rows: 1, color: scheme.trim },
  ];
  const tmp = new THREE.Vector3();
  for (let side = -1; side <= 1; side += 2) {
    for (const band of bands) {
      const cols = band.rows + 1;
      const base = b.vertexCount;
      for (let i = 0; i <= STATIONS; i++) {
        const s = i / STATIONS;
        for (let j = 0; j < cols; j++) {
          const q = band.q0 + ((band.q1 - band.q0) * j) / band.rows;
          point(s, q, side, tmp);
          const c = band.color === scheme.hull ? shade(band.color, 0.92 + 0.16 * ((i * 7 + j * 3) % 5) / 5) : band.color;
          b.vertex(tmp.x, tmp.y, tmp.z, 0, 0, c[0], c[1], c[2]);
        }
      }
      for (let i = 0; i < STATIONS; i++) {
        for (let j = 0; j < band.rows; j++) {
          const a = base + i * cols + j;
          const d = a + cols;
          if (side > 0) b.quad(a, d, d + 1, a + 1);
          else b.quad(a, a + 1, d + 1, d);
        }
      }
    }
  }
  // transom
  {
    const c = b.vertex(X(0), sheer(0) * 0.6, 0, 0, 0, WOOD_DARK[0], WOOD_DARK[1], WOOD_DARK[2]);
    const N = 6;
    const ring: number[] = [];
    for (let side = -1; side <= 1; side += 2) {
      for (let j = 0; j <= N; j++) {
        const q = side < 0 ? 1 - j / N : j / N;
        if (side > 0 && j === 0) continue;
        point(0, q, side, tmp);
        ring.push(b.vertex(tmp.x, tmp.y, tmp.z, 0, 0, WOOD_DARK[0], WOOD_DARK[1], WOOD_DARK[2]));
      }
    }
    for (let i = 0; i < ring.length - 1; i++) b.tri(c, ring[i] as number, ring[i + 1] as number);
    b.tri(c, ring[ring.length - 1] as number, ring[0] as number);
  }

  // ---- deck boards (keeps the sea out of the hull visually) and thwarts
  const deckY = 0.13;
  const deckHalf = (s: number): number => {
    const k = keel(s);
    const g = sheer(s);
    if (k >= deckY) return 0;
    const q = Math.pow((deckY - k) / (g - k), 1 / 1.7);
    return beam(s) * Math.pow(q, 0.6);
  };
  {
    const base = b.vertexCount;
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const s = 0.012 + (0.85 * i) / N;
      const w = deckHalf(s);
      const c = shade(WOOD_DECK, i % 2 === 0 ? 1 : 0.86);
      b.vertex(X(s), deckY, -w, 0, 0, c[0], c[1], c[2]);
      b.vertex(X(s), deckY, w, 0, 0, c[0], c[1], c[2]);
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 2;
      b.quad(a, a + 1, a + 3, a + 2);
    }
  }
  for (const s of [0.2, 0.34, 0.48, 0.62]) {
    const w = beam(s) * 0.93;
    addBox(b, X(s), 0.37, 0, 0.24, 0.035, w * 2, shade(WOOD_DECK, 0.92));
  }
  // gunwale rails
  for (let side = -1; side <= 1; side += 2) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) pts.push(point((i / 14) * 0.93, 1, side, new THREE.Vector3()));
    addTube(b, pts, () => 0.028, 4, shade(scheme.trim, 0.85));
  }

  // ---- prow sashes and garland
  const sashCount = 5;
  for (let i = 0; i < sashCount; i++) {
    const s = 0.9 + (i / (sashCount - 1)) * 0.07;
    const col = SASHES[(opts.scheme * 3 + i * 2 + rng.int(0, 1)) % SASHES.length] as RGB;
    const k = keel(s);
    const g = sheer(s);
    const cy = (k + g) / 2;
    const ry = (g - k) / 2 + 0.035;
    const rz = beam(s) + 0.04;
    const ring: THREE.Vector3[] = [];
    for (let a = 0; a <= 10; a++) {
      const th = (a / 10) * Math.PI * 2;
      ring.push(new THREE.Vector3(X(s) + Math.sin(th * 2) * 0.012, cy + Math.cos(th) * ry, Math.sin(th) * rz));
    }
    addTube(b, ring, () => 0.034, 5, col);
    // hanging tails
    const tails = rng.int(1, 2);
    for (let t = 0; t < tails; t++) {
      const side = t === 0 ? 1 : -1;
      const len = rng.range(0.45, 0.85);
      const x = X(s) + rng.range(-0.03, 0.03);
      const z0 = side * rz;
      const w = 0.07;
      const base = b.vertexCount;
      for (let r = 0; r <= 3; r++) {
        const f = r / 3;
        const y = cy - 0.05 - len * f;
        const z = z0 + side * 0.08 * Math.sin(f * 2.2) + side * 0.02;
        const xo = -0.1 * f * f;
        b.vertex(x - w + xo, y, z, 0, 0, col[0], col[1], col[2]);
        b.vertex(x + w + xo, y, z, 0, 0, col[0], col[1], col[2]);
      }
      for (let r = 0; r < 3; r++) {
        const a = base + r * 2;
        b.quad(a, a + 1, a + 3, a + 2);
      }
    }
  }

  // ---- engine on its pivot + long tail shaft + tiller
  {
    const ex = X(0.05);
    const ey = 0.98;
    addBox(b, ex + 0.05, 0.62, 0, 0.12, 0.6, 0.12, WOOD_DARK); // pivot post
    addBox(b, ex + 0.12, ey, 0, 0.62, 0.36, 0.38, shade(scheme.trim, 0.55));
    addBox(b, ex + 0.16, ey + 0.24, 0, 0.36, 0.12, 0.3, METAL);
    addBox(b, ex + 0.42, ey + 0.04, 0.12, 0.16, 0.2, 0.1, METAL_LIGHT);
    addTube(b, [new THREE.Vector3(ex + 0.1, ey + 0.28, -0.12), new THREE.Vector3(ex + 0.1, ey + 0.62, -0.12)], () => 0.035, 5, METAL, { capEnd: true });
    // shaft
    const tail = new THREE.Vector3(ex - 3.9, -0.42, 0);
    addTube(b, [new THREE.Vector3(ex - 0.15, ey - 0.08, 0), tail], (t) => 0.034 - 0.01 * t, 5, METAL_LIGHT);
    // propeller guard fin + blades
    addBox(b, tail.x + 0.12, tail.y - 0.1, 0, 0.3, 0.16, 0.015, METAL);
    addBox(b, tail.x - 0.04, tail.y, 0, 0.02, 0.26, 0.07, rgb(0xb8923a));
    addBox(b, tail.x - 0.04, tail.y, 0, 0.02, 0.07, 0.26, rgb(0xb8923a));
    // tiller
    addTube(b, [new THREE.Vector3(ex + 0.4, ey + 0.1, 0), new THREE.Vector3(ex + 1.5, ey + 0.22, 0.05)], () => 0.022, 4, METAL, { capEnd: true });
  }

  // ---- canopy
  if (opts.canopy) {
    const s0 = 0.27;
    const s1 = 0.66;
    const roofY = 1.72;
    for (const s of [s0, s1]) {
      for (let side = -1; side <= 1; side += 2) {
        const w = beam(s) * 0.92;
        addTube(b, [new THREE.Vector3(X(s), sheer(s) - 0.05, side * w), new THREE.Vector3(X(s), roofY, side * w * 0.96)], () => 0.025, 4, shade(WOOD_DECK, 0.8));
      }
    }
    const base = b.vertexCount;
    const NX = 6;
    const NZ = 4;
    const over = 0.28;
    for (let i = 0; i <= NX; i++) {
      const x = X(s0) - over + ((X(s1) - X(s0) + over * 2) * i) / NX;
      for (let j = 0; j <= NZ; j++) {
        const f = j / NZ - 0.5;
        const z = f * (B + 0.25);
        const y = roofY + 0.14 * (1 - 4 * f * f) + 0.012 * Math.sin(i * 1.9);
        const stripe = i % 2 === 0 ? scheme.canopy : shade(scheme.canopy, 0.86);
        b.vertex(x, y, z, 0, 0, stripe[0], stripe[1], stripe[2]);
      }
    }
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NZ; j++) {
        const a = base + i * (NZ + 1) + j;
        const d = a + NZ + 1;
        b.quad(a, a + 1, d + 1, d);
      }
    }
  }

  return b.build();
}
