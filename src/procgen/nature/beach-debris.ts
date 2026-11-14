import * as THREE from 'three';
import { RNG } from '../../core/rng';
import { fbm3 } from '../../render/util/noise';
import type { FrameBudget } from '../../render/util/async';
import { GeoBuilder, addBlob, addTube, mixRGB, rgb, shade } from './geo';
import type { RGB } from './geo';

/** Shells, pebbles, starfish, driftwood, fallen coconuts and limestone boulders: one merged static mesh. */

const SHELL_COLORS: readonly RGB[] = [rgb(0xfff4e6), rgb(0xf7d9c4), rgb(0xf2b8a0), rgb(0xe9c9a0), rgb(0xfde9d0), rgb(0xd9a38a), rgb(0xf6e3f0)];
const PEBBLE_COLORS: readonly RGB[] = [rgb(0xa39d92), rgb(0xc2baab), rgb(0x8a847c), rgb(0xd6cebd), rgb(0xb3a892), rgb(0x7d7772)];
const ROCK_COLORS: readonly RGB[] = [rgb(0xa8a294), rgb(0x8e897e), rgb(0xbdb5a2), rgb(0x99907f)];

function place(b: GeoBuilder, x: number, y: number, z: number, yaw: number, tiltX: number, tiltZ: number, scale: number): void {
  const e = new THREE.Euler(tiltX, yaw, tiltZ, 'YXZ');
  b.matrix.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(scale, scale, scale));
}

/** ribbed scallop: unit ≈ 1 wide, hinge at the origin */
function addScallop(b: GeoBuilder, color: RGB, rng: RNG): void {
  const ribs = 6;
  const hinge = b.vertex(0, 0.02, 0, 0, 0, color[0] * 0.8, color[1] * 0.78, color[2] * 0.75);
  const mid: number[] = [];
  const rim: number[] = [];
  for (let i = 0; i <= ribs * 2; i++) {
    const a = -1.15 + (2.3 * i) / (ribs * 2);
    const ridge = i % 2 === 0 ? 1 : 0.78;
    const c = shade(color, 0.82 + 0.18 * ridge + rng.range(-0.03, 0.03));
    mid.push(b.vertex(Math.sin(a) * 0.3, 0.1 * ridge + 0.03, Math.cos(a) * 0.3, 0, 0, c[0], c[1], c[2]));
    const band = shade(color, 0.7 + 0.3 * ridge);
    rim.push(b.vertex(Math.sin(a) * 0.55, 0.035 * ridge, Math.cos(a) * 0.55 + 0.02, 0, 0, band[0], band[1], band[2]));
  }
  for (let i = 0; i < ribs * 2; i++) {
    b.tri(hinge, mid[i] as number, mid[i + 1] as number);
    b.quad(mid[i] as number, rim[i] as number, rim[i + 1] as number, mid[i + 1] as number);
  }
}

/** little spiral cone shell lying on its side */
function addConeShell(b: GeoBuilder, color: RGB): void {
  const segs = 6;
  const rings = 4;
  const base = b.vertexCount;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = 0.26 * (1 - t) * (1 + 0.22 * Math.sin(t * 18)) + 0.01;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = shade(color, 0.75 + 0.25 * Math.abs(Math.sin(t * 9 + a)));
      b.vertex(t * 0.9 - 0.3, 0.2 + Math.sin(a) * r, Math.cos(a) * r, 0, 0, c[0], c[1], c[2]);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const i1 = (i + 1) % segs;
      const a = base + j * segs + i;
      const a1 = base + j * segs + i1;
      b.quad(a, a + segs, a1 + segs, a1);
    }
  }
}

function addStarfish(b: GeoBuilder, color: RGB): void {
  const c = b.vertex(0, 0.14, 0, 0, 0, color[0], color[1], color[2]);
  const ring: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const tip = i % 2 === 0;
    const r = tip ? 1 : 0.34;
    const col = tip ? shade(color, 0.75) : shade(color, 1.05);
    ring.push(b.vertex(Math.cos(a) * r, tip ? 0.02 : 0.08, Math.sin(a) * r, 0, 0, col[0], col[1], col[2]));
  }
  for (let i = 0; i < 10; i++) b.tri(c, ring[(i + 1) % 10] as number, ring[i] as number);
}

export interface DebrisOptions {
  density: number;
  seaLevel: number;
  heightAt: (x: number, z: number) => number;
  shoreZ: (x: number) => number;
  isFree: (x: number, z: number, margin: number) => boolean;
  /** palm feet, to drop a few coconuts nearby */
  palmFeet: readonly { x: number; z: number }[];
}

export async function buildBeachDebris(o: DebrisOptions, budget: FrameBudget): Promise<THREE.BufferGeometry> {
  const b = new GeoBuilder();
  const rng = new RNG(5150);
  const d = o.density;

  // shells along the wrack line and scattered up the beach
  const shells = Math.round(240 * d);
  for (let i = 0; i < shells; i++) {
    const near = rng.chance(0.6);
    const x = near ? rng.range(-34, 30) : rng.range(-95, 95);
    const band = rng.chance(0.65) ? rng.range(1.2, 3.4) + rng.gauss() * 0.3 : rng.range(0.6, 12);
    const z = o.shoreZ(x) + band;
    if (!o.isFree(x, z, 0.4)) continue;
    const y = o.heightAt(x, z);
    if (y < o.seaLevel + 0.06) continue;
    const s = rng.range(0.07, 0.15);
    const col = rng.pick(SHELL_COLORS);
    place(b, x, y + 0.004, z, rng.range(0, 6.28), rng.range(-0.15, 0.15), rng.range(-0.15, 0.15), s);
    if (rng.chance(0.7)) addScallop(b, col, rng);
    else addConeShell(b, col);
    if ((i & 15) === 0) await budget.tick();
  }

  // pebbles
  const pebbles = Math.round(120 * d);
  for (let i = 0; i < pebbles; i++) {
    const x = rng.chance(0.55) ? rng.range(-36, 32) : rng.range(-100, 100);
    const z = o.shoreZ(x) + (rng.chance(0.75) ? rng.range(-1.5, 4.5) : rng.range(4.5, 13));
    if (!o.isFree(x, z, 0.4)) continue;
    const y = o.heightAt(x, z);
    const s = rng.range(0.025, 0.075);
    const col = rng.pick(PEBBLE_COLORS);
    const seed = rng.int(0, 9999);
    place(b, x, y + s * 0.25, z, rng.range(0, 6.28), 0, 0, 1);
    addBlob(b, 0, 0, 0, s * rng.range(1, 1.6), s * 0.55, s, col, 6, 3, (nx, ny, nz) => 0.82 + 0.36 * fbm3(nx * 1.6 + seed, ny * 1.6, nz * 1.6, 2, seed));
    if ((i & 15) === 0) await budget.tick();
  }

  // starfish near the water line
  const stars = Math.round(9 * d);
  for (let i = 0; i < stars; i++) {
    const x = rng.range(-30, 28);
    const z = o.shoreZ(x) + rng.range(0.5, 2.6);
    if (!o.isFree(x, z, 0.5)) continue;
    place(b, x, o.heightAt(x, z) + 0.004, z, rng.range(0, 6.28), 0, 0, rng.range(0.07, 0.11));
    addStarfish(b, rng.chance(0.6) ? rgb(0xd9774a) : rgb(0xb8573f));
  }

  // limestone boulders, mostly away from the stall
  const rocks = Math.round(18 * d);
  for (let i = 0; i < rocks; i++) {
    const sideSign = rng.chance(0.5) ? -1 : 1;
    const x = sideSign * rng.range(15, 78) + (sideSign < 0 ? -4 : 6);
    const z = o.shoreZ(x) + rng.range(-3.5, 9);
    if (!o.isFree(x, z, 2.5)) continue;
    const s = rng.range(0.35, 1.25);
    const col = rng.pick(ROCK_COLORS);
    const seed = rng.int(0, 9999);
    place(b, x, o.heightAt(x, z) + s * 0.12, z, rng.range(0, 6.28), rng.range(-0.2, 0.2), rng.range(-0.2, 0.2), 1);
    const base = b.vertexCount;
    addBlob(b, 0, 0, 0, s * rng.range(1.0, 1.5), s * rng.range(0.55, 0.85), s * rng.range(0.8, 1.2), col, 10, 7, (nx, ny, nz) => 0.7 + 0.6 * fbm3(nx * 1.4 + seed, ny * 1.4, nz * 1.4, 3, seed));
    // darker, greener towards the ground (algae / damp)
    for (let v = base; v < b.vertexCount; v++) {
      const local = (b.pos[v * 3 + 1] as number) - (o.heightAt(x, z) + s * 0.12);
      const k = Math.min(1, Math.max(0, 0.55 + local / (s * 0.9)));
      const c = mixRGB([col[0] * 0.42, col[1] * 0.5, col[2] * 0.4], col, k);
      b.col[v * 3] = c[0];
      b.col[v * 3 + 1] = c[1];
      b.col[v * 3 + 2] = c[2];
    }
    await budget.tick();
  }

  // driftwood
  const logs = Math.round(6 * d);
  for (let i = 0; i < logs; i++) {
    const x = rng.chance(0.5) ? rng.range(-34, -9) : rng.range(9, 30);
    const z = o.shoreZ(x) + rng.range(2.5, 6.5);
    if (!o.isFree(x, z, 1.5)) continue;
    const len = rng.range(0.9, 2.2);
    const yaw = rng.range(0, 6.28);
    b.matrix.identity();
    const pts: THREE.Vector3[] = [];
    const bend = rng.range(-0.25, 0.25);
    for (let k = 0; k <= 6; k++) {
      const t = k / 6 - 0.5;
      const lx = t * len;
      const lz = bend * (1 - 4 * t * t);
      const px = x + Math.cos(yaw) * lx - Math.sin(yaw) * lz;
      const pz = z + Math.sin(yaw) * lx + Math.cos(yaw) * lz;
      pts.push(new THREE.Vector3(px, o.heightAt(px, pz) + 0.025 + 0.012 * Math.sin(k * 2.1), pz));
    }
    const r = rng.range(0.045, 0.085);
    addTube(b, pts, (t) => r * (1 - 0.45 * t) * (1 + 0.15 * Math.sin(t * 17)), 6, rgb(0xb9ab98), { capStart: true, capEnd: true });
  }

  // fallen coconuts
  for (const p of o.palmFeet) {
    if (!rng.chance(0.45 * d)) continue;
    const a = rng.range(0, 6.28);
    const r = rng.range(0.8, 2.6);
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    if (!o.isFree(x, z, 0.5)) continue;
    const y = o.heightAt(x, z);
    if (y < o.seaLevel + 0.1) continue;
    place(b, x, y + 0.1, z, rng.range(0, 6.28), rng.range(-0.6, 0.6), 0, 1);
    addBlob(b, 0, 0, 0, 0.16, 0.13, 0.13, rng.chance(0.5) ? rgb(0x6b4a2c) : rgb(0x8a7a3c), 7, 5);
  }

  b.matrix.identity();
  await budget.yield();
  return b.build();
}

/** flat decals following a set of walking paths; uv covers one footprint, alternating left / right feet */
export function buildFootprints(
  paths: readonly (readonly THREE.Vector3[])[],
  heightAt: (x: number, z: number) => number,
  isFree: (x: number, z: number, margin: number) => boolean,
  seaLevel: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rng = new RNG(8128);
  const dir = new THREE.Vector3();
  const add = (x: number, z: number, yaw: number, left: boolean, size: number): void => {
    const hw = 0.055 * size;
    const hl = 0.13 * size;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const base = pos.length / 3;
    const corners: readonly [number, number, number, number][] = [
      [-hw, -hl, 0, 1],
      [hw, -hl, 1, 1],
      [hw, hl, 1, 0],
      [-hw, hl, 0, 0],
    ];
    for (const [lx, lf, u, v] of corners) {
      // local: +f = walking direction, +x = right
      const wx = x + c * lf - s * lx;
      const wz = z + s * lf + c * lx;
      pos.push(wx, heightAt(wx, wz) + 0.012, wz);
      uv.push(left ? 1 - u : u, v);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  for (const path of paths) {
    let trail = rng.chance(0.7);
    let trailLeft = rng.range(4, 16);
    let left = false;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i] as THREE.Vector3;
      const c = path[i + 1] as THREE.Vector3;
      const segLen = Math.hypot(c.x - a.x, c.z - a.z);
      dir.set(c.x - a.x, 0, c.z - a.z).normalize();
      const yaw = Math.atan2(dir.z, dir.x);
      const stride = 0.66;
      for (let dd = 0; dd < segLen; dd += stride) {
        trailLeft -= stride;
        if (trailLeft <= 0) {
          trail = !trail;
          trailLeft = trail ? rng.range(6, 22) : rng.range(2, 9);
        }
        if (!trail) continue;
        left = !left;
        const side = left ? -0.09 : 0.09;
        const x = a.x + dir.x * dd - dir.z * side + rng.range(-0.03, 0.03);
        const z = a.z + dir.z * dd + dir.x * side + rng.range(-0.03, 0.03);
        if (!isFree(x, z, 0.3)) continue;
        if (heightAt(x, z) < seaLevel + 0.14) continue;
        add(x, z, yaw + rng.range(-0.12, 0.12) + (left ? 0.1 : -0.1), left, rng.range(0.92, 1.1));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
