/** Acquario con pesci e pappagallo su trespolo. */
import * as THREE from 'three';
import { type ColorLike, type Surf, TILE, lathe, leaf, rbox, sphere, torus, tr, v3 } from '../kit';
import { PAL } from '../parts';
import type { DecorModel } from '../shop-types';
import { AX, AY, AZ, Decor, type DecorOpts } from './decor-kit';

export function aquarium(o: DecorOpts): DecorModel {
  const d = new Decor('aquarium', o);
  const p = d.p;
  const wood: Surf = { tile: TILE.woodFine, color: 0x6e4a2e, rough: 0.55, jitter: 0.04 };
  // mobiletto
  p.add(rbox(0.92, 0.56, 0.42, 0.012), wood, tr(0, 0.34, 0));
  p.add(rbox(0.96, 0.03, 0.46, 0.008), wood, tr(0, 0.635, 0));
  for (const sx of [-1, 1]) {
    p.add(rbox(0.4, 0.46, 0.012, 0.006), { ...wood, color: 0x7d5636 }, tr(sx * 0.215, 0.34, 0.212));
    p.add(sphere(0.012, 8, 6), { color: PAL.brass, metal: 1, rough: 0.35 }, tr(sx * 0.05, 0.36, 0.225));
    for (const sz of [-1, 1]) p.box(0.05, 0.06, 0.05, sx * 0.41, 0.03, sz * 0.16, wood, 0.008);
  }
  // vasca
  const y0 = 0.65;
  const W = 0.86;
  const H = 0.42;
  const D2 = 0.36;
  const rim: Surf = { color: 0x1d1e21, rough: 0.4 };
  p.add(rbox(W + 0.02, 0.03, D2 + 0.02, 0.006), rim, tr(0, y0 + 0.015, 0));
  p.add(rbox(W + 0.02, 0.05, D2 + 0.02, 0.008), rim, tr(0, y0 + H + 0.045, 0));
  p.add(rbox(W - 0.06, 0.004, D2 - 0.06, 0), { color: 0xeaf8ff, rough: 0.3, glow: 2.2 }, tr(0, y0 + H + 0.018, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.012, H, 0.012, sx * (W / 2), y0 + 0.03 + H / 2, sz * (D2 / 2), rim, 0);
  p.add(rbox(W - 0.02, 0.045, D2 - 0.02, 0.01), { tile: TILE.stone, color: 0xe6d3a3, rough: 1, uv: [0.8, 0.4], glow: 0.2 }, tr(0, y0 + 0.05, 0));
  p.add(rbox(W - 0.02, H - 0.02, 0.004, 0), { color: 0x2f9ad0, rough: 0.6, glow: 0.45 }, tr(0, y0 + 0.03 + H / 2, -D2 / 2 + 0.006));
  const wy = y0 + 0.07;
  // roccia ad arco, anfora, piante
  for (const [x, z, s, c] of [
    [-0.26, -0.06, 0.07, 0x8a8f96],
    [-0.17, -0.08, 0.05, 0x9aa0a8],
    [0.3, 0.05, 0.045, 0x8a8f96],
  ] as const) {
    const g = sphere(s, 8, 6);
    g.scale(1.2, 0.9, 1);
    p.add(g, { tile: TILE.stone, color: c, rough: 1, uv: [0.3, 0.3] }, tr(x, wy + s * 0.5, z));
  }
  p.add(torus(0.07, 0.025, 6, 10, Math.PI), { tile: TILE.stone, color: 0x7d838a, rough: 1, uv: [0.4, 0.2] }, tr(-0.22, wy, -0.06, 0, 0.3, 0));
  p.add(lathe([[0.012, 0], [0.035, 0.03], [0.03, 0.07], [0.014, 0.09], [0.02, 0.105]], 10), { tile: TILE.terracotta, color: 0xc56a42, rough: 0.9, uv: [0.3, 0.3] }, tr(0.18, wy + 0.025, -0.07, 0, 0, 1.2));
  for (let i = 0; i < 9; i++) {
    const x = i < 5 ? 0.3 + (i % 3) * 0.035 : -0.36 + (i % 3) * 0.04;
    const z = -0.1 + (i % 2) * 0.05;
    const h = 0.14 + ((i * 7) % 5) * 0.035;
    p.at(x, wy, z, 0, i * 1.3, 0).add(leaf(h, 0.03, { bend: 0.35, segs: 4 }), { tile: TILE.leaf, color: i % 2 ? 0x3fae5a : 0x2f8f6a, rough: 0.5, uv: [0.5, 0.3], swayFn: (_x, y) => Math.max(0, y - wy) * 0.08 });
  }
  // bolle
  const bub = d.b.bone(v3(0.1, wy, 0.06));
  for (let i = 0; i < 6; i++) p.add(sphere(0.006 + (i % 3) * 0.002, 6, 4), { color: 0xeafcff, rough: 0.05, glow: 0.6, bone: bub }, tr(0.1 + Math.sin(i * 2.1) * 0.012, wy + 0.02 + i * 0.05, 0.06 + Math.cos(i * 1.7) * 0.012));
  // pesci
  interface Fish {
    bone: number;
    c: THREE.Vector3;
    rx: number;
    rz: number;
    w: number;
    ph: number;
  }
  const fishes: Fish[] = [];
  const mk = (c: THREE.Vector3, len: number, body: ColorLike, fin: ColorLike, stripes: ColorLike | null, rx: number, rz: number, w: number, ph: number): void => {
    const bone = d.b.bone(c);
    const s: Surf = { bone, rough: 0.35, glow: 0.3 };
    const q = p.at(c.x, c.y, c.z).surf(s);
    const hh = len * 0.3;
    q.add(lathe([[0, -len / 2], [hh * 0.55, -len * 0.33], [hh, -len * 0.05], [hh * 0.8, len * 0.22], [hh * 0.25, len * 0.45], [hh * 0.12, len / 2]], 8), { color: body }, tr(0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 0.42));
    if (stripes) for (const k of [-0.18, 0.12]) q.add(torus(hh * (k < 0 ? 0.86 : 0.9), len * 0.03, 4, 10), { color: stripes }, tr(-k * len, 0, 0, 0, Math.PI / 2, 0, 1, 1, 1).multiply(tr(0, 0, 0, 0, 0, 0, 0.44, 1, 1)));
    q.at(-len * 0.45, 0, 0, 0, 0, Math.PI / 2).add(leaf(len * 0.34, len * 0.5, { bend: 0, segs: 1, fold: 0, width: (t) => 0.25 + 0.75 * t }), { color: fin }, tr(0, 0, 0, 0, Math.PI / 2, 0));
    q.at(-len * 0.05, hh * 0.8, 0, 0, 0, 0.5).add(leaf(len * 0.25, len * 0.3, { bend: 0, segs: 1, fold: 0 }), { color: fin }, tr(0, 0, 0, 0, Math.PI / 2, 0));
    for (const sz of [-1, 1]) q.add(sphere(len * 0.035, 5, 4), { color: 0x101010 }, tr(len * 0.3, hh * 0.25, sz * hh * 0.3));
    fishes.push({ bone, c, rx, rz, w, ph });
  };
  mk(v3(0, y0 + 0.22, 0.02), 0.13, 0xff7a1a, 0xf58a2a, 0xffffff, 0.27, 0.09, 0.6, 0);
  mk(v3(0.05, y0 + 0.3, -0.02), 0.105, 0xff7a1a, 0xf58a2a, 0xffffff, 0.22, 0.08, -0.5, 2);
  mk(v3(-0.05, y0 + 0.16, 0), 0.14, 0x2f6fe0, 0xf6d23a, null, 0.28, 0.1, 0.42, 4);
  mk(v3(0.02, y0 + 0.36, 0.03), 0.1, 0xffd21a, 0xf6d23a, null, 0.3, 0.07, -0.75, 1);
  mk(v3(-0.1, y0 + 0.27, -0.03), 0.09, 0xe8455a, 0xf7f1e3, null, 0.2, 0.09, 0.9, 3);
  mk(v3(0.12, y0 + 0.13, 0.04), 0.08, 0x9be8e0, 0x4fc3d9, null, 0.18, 0.07, -1.05, 5);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(W, H, D2),
    new THREE.MeshPhysicalMaterial({ color: 0x8fdcec, transparent: true, opacity: 0.13, roughness: 0.03, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5 }),
  );
  glass.position.set(0, y0 + 0.03 + H / 2, 0);
  glass.renderOrder = 2;
  d.extra(glass);
  return d.finish('none', ({ t, bones, rest }) => {
    for (const f of fishes) {
      const th = t * f.w + f.ph;
      const b = bones[f.bone];
      b.position.set(rest[f.bone].x + Math.cos(th) * f.rx, rest[f.bone].y + Math.sin(th * 2.3 + f.ph) * 0.018, rest[f.bone].z + Math.sin(th) * f.rz);
      const tx = -Math.sin(th) * f.rx * Math.sign(f.w);
      const tz = Math.cos(th) * f.rz * Math.sign(f.w);
      b.quaternion.setFromAxisAngle(AY, Math.atan2(-tz, tx) + Math.sin(t * 9 + f.ph) * 0.12);
    }
    bones[bub].position.y = rest[bub].y + ((t * 0.09) % 0.05);
    bones[bub].position.x = rest[bub].x + Math.sin(t * 5) * 0.004;
  });
}

export function parrotPerch(o: DecorOpts): DecorModel {
  const d = new Decor('parrot_perch', o);
  const p = d.p;
  const wood: Surf = { tile: TILE.woodFine, color: 0x9c6a40, rough: 0.6 };
  p.add(lathe([[0, 0], [0.2, 0], [0.21, 0.015], [0.19, 0.035], [0.05, 0.05], [0.03, 0.08], [0, 0.08]], 18), wood);
  p.cy(0.018, 0.022, 1.12, 0, 0.05, 0, wood, 10);
  p.cane(v3(-0.3, 1.17, 0), v3(0.3, 1.17, 0), 0.018, { color: PAL.bamboo, rough: 0.5 });
  p.add(sphere(0.03, 8, 6), wood, tr(0, 1.17, 0));
  for (const sx of [-1, 1]) {
    p.add(lathe([[0, 0], [0.035, 0], [0.045, 0.035], [0.047, 0.04], [0.04, 0.04], [0.035, 0.012]], 10), { color: PAL.steel, metal: 1, rough: 0.3 }, tr(sx * 0.27, 1.19, 0));
    p.cy(0.036, 0.036, 0.004, sx * 0.27, 1.215, 0, { tile: TILE.stone, color: sx > 0 ? 0xe2c46a : 0x6fb7d9, rough: 0.9, uv: [0.1, 0.1] }, 8);
  }
  p.rod(v3(0.17, 1.16, 0), v3(0.17, 1.03, 0), 0.003, { color: PAL.steel, metal: 1, rough: 0.3, sway: 0.01 }, 4);
  p.add(torus(0.035, 0.007, 5, 12), { color: 0xf6c94a, rough: 0.5, sway: 0.01 }, tr(0.17, 0.995, 0));
  p.add(sphere(0.014, 6, 5), { color: 0xd9392c, rough: 0.5, sway: 0.01 }, tr(0.17, 0.95, 0));
  // pappagallo (ara rossa), guarda verso +Z
  const body = d.b.bone(v3(0, 1.19, 0));
  const head = d.b.bone(v3(0, 1.4, 0.035), body);
  const wl = d.b.bone(v3(-0.06, 1.37, 0.0), body);
  const wr = d.b.bone(v3(0.06, 1.37, 0.0), body);
  const tail = d.b.bone(v3(0, 1.24, -0.05), body);
  const red: Surf = { color: 0xd9281e, rough: 0.6 };
  const B = p.at(0, 1.19, 0).surf({ bone: body });
  B.add(lathe([[0, -0.03], [0.04, -0.02], [0.066, 0.05], [0.07, 0.11], [0.055, 0.17], [0.035, 0.21], [0, 0.22]], 12), red, tr(0, 0.02, 0.005, 0.22, 0, 0, 1, 1, 1.05));
  for (const sx of [-1, 1]) {
    B.add(torus(0.02, 0.007, 4, 8), { color: 0x4a4d52, rough: 0.8 }, tr(sx * 0.025, -0.02, 0.0, 0, Math.PI / 2, 0));
    B.add(lathe([[0.012, 0], [0.014, 0.04]], 5), { color: 0x4a4d52, rough: 0.8 }, tr(sx * 0.025, -0.01, 0.005));
  }
  const Hd = p.at(0, 1.42, 0.045).surf({ bone: head });
  const hg = sphere(0.052, 12, 9);
  hg.scale(0.95, 1, 1.08);
  Hd.add(hg, red);
  for (const sx of [-1, 1]) {
    const fg = sphere(0.023, 8, 6);
    fg.scale(0.35, 1, 1);
    Hd.add(fg, { color: 0xf7f1e3, rough: 0.7 }, tr(sx * 0.04, 0.002, 0.022));
    Hd.add(sphere(0.008, 6, 5), { color: 0x101010, rough: 0.2 }, tr(sx * 0.047, 0.01, 0.026));
    Hd.add(sphere(0.004, 4, 3), { color: 0xf6e9a0, rough: 0.2 }, tr(sx * 0.053, 0.011, 0.027));
  }
  Hd.add(lathe([[0.027, 0], [0.024, 0.02], [0.014, 0.045], [0.004, 0.06], [0, 0.062]], 8), { color: 0xf3e3b0, rough: 0.35 }, tr(0, 0.008, 0.042, 2.0, 0, 0, 0.95, 1.25, 1.3));
  Hd.add(lathe([[0.02, 0], [0.012, 0.022], [0, 0.03]], 6), { color: 0x1d1e21, rough: 0.35 }, tr(0, -0.022, 0.038, 2.5, 0, 0, 0.8, 1, 1));
  const wing = (sx: number, bone: number): void => {
    const q = p.at(sx * 0.066, 1.37, 0.0).surf({ bone });
    const layers: Array<[number, number, ColorLike, number]> = [
      [0.26, 0.085, 0x2456c8, 0],
      [0.19, 0.09, 0xf6c94a, 0.004],
      [0.12, 0.09, 0xd9281e, 0.008],
    ];
    for (const [len, w, c, off] of layers) q.at(sx * off, 0, 0, 0, sx * Math.PI / 2, 0).at(0, 0, 0, 0, 0, 0).add(leaf(len, w, { bend: 0.25, segs: 3, fold: 0.008 }), { color: c, rough: 0.6 }, tr(0, 0, 0, Math.PI - 0.32, 0, 0));
  };
  wing(-1, wl);
  wing(1, wr);
  const T = p.at(0, 1.24, -0.05).surf({ bone: tail });
  [0x2456c8, 0xd9281e, 0x2456c8].forEach((c, i) => T.at(0, 0, 0, 0, 0, (i - 1) * 0.12).add(leaf(0.36 - Math.abs(i - 1) * 0.05, 0.045, { bend: 0.15, segs: 3, fold: 0.006, width: (t) => 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t + 0.2)) }), { color: c, rough: 0.6 }, tr(0, 0, (i - 1) * 0.004, Math.PI + 0.42, 0, 0)));
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  return d.finish('none', ({ t, bones, env }) => {
    bones[body].quaternion.setFromAxisAngle(AX, 0.04 * Math.sin(t * 1.7) + 0.02 * env.wind);
    q1.setFromAxisAngle(AY, 0.55 * Math.sin(t * 0.8) + 0.25 * Math.sin(t * 2.3));
    q2.setFromAxisAngle(AZ, 0.22 * Math.sin(t * 0.37 + 1));
    bones[head].quaternion.copy(q1).multiply(q2);
    const cyc = t % 7;
    const flap = cyc < 1.1 ? Math.sin((cyc / 1.1) * Math.PI) * (0.55 + 0.45 * Math.sin(t * 22)) : 0;
    bones[wl].quaternion.setFromAxisAngle(AZ, -flap * 0.9);
    bones[wr].quaternion.setFromAxisAngle(AZ, flap * 0.9);
    bones[tail].quaternion.setFromAxisAngle(AX, 0.07 * Math.sin(t * 1.7 + 0.5) - flap * 0.15);
  });
}
