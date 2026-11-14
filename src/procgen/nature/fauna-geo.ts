import * as THREE from 'three';
import { GeoBuilder, addBlob, addBox, rgb } from './geo';

/**
 * Seagull: +X = flight direction. uv.x = wing weight (0 on the body … 1 at the wing tip) used by the
 * vertex shader to flap, uv.y = side (−1 / +1).
 */
export function buildGullGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const white = rgb(0xf7f7f2);
  const grey = rgb(0xaab2bb);
  const dark = rgb(0x2b2d33);
  addBlob(b, 0, 0, 0, 0.21, 0.065, 0.06, white, 8, 6);
  addBlob(b, 0.2, 0.035, 0, 0.06, 0.05, 0.048, white, 7, 5);
  addBox(b, 0.275, 0.028, 0, 0.06, 0.016, 0.016, rgb(0xf0b020));
  // tail
  {
    const a = b.vertex(-0.17, 0.01, -0.03, 0, 0, white[0], white[1], white[2]);
    const c = b.vertex(-0.17, 0.01, 0.03, 0, 0, white[0], white[1], white[2]);
    const d = b.vertex(-0.33, 0.015, 0.055, 0, 0, grey[0], grey[1], grey[2]);
    const e = b.vertex(-0.33, 0.015, -0.055, 0, 0, grey[0], grey[1], grey[2]);
    b.quad(a, c, d, e);
  }
  // wings: root → elbow → tip, swept back
  for (let side = -1; side <= 1; side += 2) {
    const rows: readonly { z: number; x0: number; x1: number; w: number; col: readonly [number, number, number] }[] = [
      { z: 0.04, x0: 0.1, x1: -0.1, w: 0, col: grey },
      { z: 0.3, x0: 0.09, x1: -0.1, w: 0.45, col: grey },
      { z: 0.52, x0: 0.0, x1: -0.14, w: 0.8, col: grey },
      { z: 0.68, x0: -0.11, x1: -0.19, w: 1, col: dark },
    ];
    const ids: number[] = [];
    for (const r of rows) {
      ids.push(b.vertex(r.x0, 0.03, r.z * side, r.w, side, r.col[0], r.col[1], r.col[2]));
      ids.push(b.vertex(r.x1, 0.03, r.z * side, r.w, side, r.col[0], r.col[1], r.col[2]));
    }
    for (let i = 0; i < rows.length - 1; i++) {
      const a = ids[i * 2] as number;
      const c = ids[i * 2 + 1] as number;
      const d = ids[i * 2 + 3] as number;
      const e = ids[i * 2 + 2] as number;
      b.quad(a, c, d, e);
    }
  }
  return b.build();
}

/** Little beach crab, +X = "forward" (it scuttles along ±Z). Unit ≈ 12 cm wide. */
export function buildCrabGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const shell = rgb(0xd9562a);
  const shellDark = rgb(0x9e3418);
  const pale = rgb(0xf2c9a0);
  addBlob(b, 0, 0.028, 0, 0.034, 0.016, 0.045, shell, 8, 4);
  // legs: four per side, two segments each
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const x = -0.024 + i * 0.014;
      const splay = (i - 1.5) * 0.3;
      const m = new THREE.Matrix4().makeRotationY(-splay * side);
      m.setPosition(x, 0, 0);
      b.matrix.copy(m);
      const kneeZ = side * 0.062;
      const footZ = side * 0.082;
      const upper = new THREE.Matrix4().makeRotationX(side * -0.5);
      upper.setPosition(0, 0.03, (side * 0.04 + kneeZ) / 2);
      b.matrix.copy(m).multiply(upper);
      addBox(b, 0, 0, 0, 0.006, 0.006, 0.036, shellDark);
      const lower = new THREE.Matrix4().makeRotationX(side * 1.0);
      lower.setPosition(0, 0.016, (kneeZ + footZ) / 2);
      b.matrix.copy(m).multiply(lower);
      addBox(b, 0, 0, 0, 0.005, 0.005, 0.036, pale);
    }
  }
  b.matrix.identity();
  // claws
  for (let side = -1; side <= 1; side += 2) {
    addBox(b, 0.03, 0.024, side * 0.034, 0.03, 0.008, 0.008, shellDark);
    addBlob(b, 0.052, 0.026, side * 0.03, 0.016, 0.01, 0.011, shell, 6, 3);
    addBox(b, 0.068, 0.031, side * 0.028, 0.018, 0.004, 0.006, pale);
    addBox(b, 0.068, 0.022, side * 0.028, 0.018, 0.004, 0.006, pale);
    // eye stalks
    addBox(b, 0.03, 0.046, side * 0.012, 0.004, 0.016, 0.004, shellDark);
    addBox(b, 0.03, 0.056, side * 0.012, 0.007, 0.007, 0.007, rgb(0x16120f));
  }
  return b.build();
}
