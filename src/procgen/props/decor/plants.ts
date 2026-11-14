/** Piante tropicali. */
import { type Surf, TILE, lathe, leaf, sphere, torus, tr, tube, v3 } from '../kit';
import type { DecorModel } from '../shop-types';
import { Decor, type DecorOpts, flatLeaf, flower, frond, outline, pot } from './decor-kit';

const GREEN = 0x3f9a4a;
const DEEP = 0x2f7d3e;

export function plantMonstera(o: DecorOpts): DecorModel {
  const d = new Decor('plant_monstera', o);
  const p = d.p;
  // cesto intrecciato
  p.add(lathe([[0, 0], [0.13, 0], [0.17, 0.05], [0.19, 0.2], [0.175, 0.3], [0.185, 0.31], [0.165, 0.31], [0.16, 0.27]], 18), { tile: TILE.rattan, color: 0xd6b47a, rough: 0.9, uv: [0.6, 1] });
  p.cy(0.16, 0.16, 0.006, 0, 0.27, 0, { tile: TILE.coir, color: 0x4a3423, rough: 1, uv: [0.3, 0.3] }, 16);
  p.add(torus(0.18, 0.012, 5, 18), { tile: TILE.rope, color: 0xc6aa79, rough: 1, uv: [1, 0.2] }, tr(0, 0.31, 0, Math.PI / 2));
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + d.rng.range(-0.25, 0.25);
    const h = 0.55 + d.rng.next() * 0.55;
    const reach = 0.12 + (1 - (h - 0.55) / 0.55) * 0.2;
    const top = v3(Math.sin(a) * reach, h, Math.cos(a) * reach);
    const sway: Surf = { swayFn: (_x, y) => Math.max(0, y - 0.3) * 0.035 };
    p.add(tube([v3(Math.sin(a) * 0.03, 0.27, Math.cos(a) * 0.03), v3(Math.sin(a) * reach * 0.35, h * 0.6, Math.cos(a) * reach * 0.35), top], 0.008, 5, 4), { color: 0x4f8f3c, rough: 0.6, ...sway });
    const L = 0.26 + d.rng.next() * 0.14;
    const W = L * 0.95;
    const sh = outline(
      L,
      (t) => {
        const base = (W / 2) * Math.pow(Math.sin(Math.PI * Math.pow(0.03 + t * 0.97, 0.62)), 0.75);
        const slit = t > 0.18 && t < 0.86 ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 9)), 6) * 0.55 : 0;
        return base * (1 - slit);
      },
      44,
    );
    const q = p.at(top.x, top.y, top.z, 0, a, 0).at(0, 0, 0, 1.0 + d.rng.range(-0.25, 0.35), 0, d.rng.range(-0.2, 0.2));
    q.add(flatLeaf(sh, L, W, L * 0.25, -L * 0.1), { tile: TILE.leaf, color: i % 3 === 0 ? GREEN : DEEP, rough: 0.45, jitter: 0.1, uv: [0.9, 0.9], ...sway }, tr(0, -L * 0.06, 0));
  }
  return d.finish();
}

export function plantBanana(o: DecorOpts): DecorModel {
  const d = new Decor('plant_banana', o);
  const p = d.p;
  pot(p, 0.24, 0.32, 0x2f6fb0, TILE.plain, 0.25);
  p.add(torus(0.2, 0.012, 5, 18), { color: 0xf3efe6, rough: 0.3 }, tr(0, 0.18, 0, Math.PI / 2));
  p.add(lathe([[0.085, 0.28], [0.075, 0.6], [0.06, 1.0], [0.045, 1.25]], 10), { tile: TILE.coir, color: 0x8a9a4a, rough: 0.8, uv: [1, 0.5] });
  const sway: Surf = { swayFn: (_x, y) => Math.max(0, y - 0.9) * 0.05 };
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4;
    const len = 0.75 + d.rng.next() * 0.45;
    const q = p.at(0, 1.15 + i * 0.012, 0, 0, a, 0);
    q.add(leaf(len, 0.34, { bend: 1.15 + d.rng.next() * 0.5, startAngle: 0.25 + i * 0.05, segs: 9, fold: 0.03, width: (t) => 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * Math.pow(0.05 + t * 0.95, 0.8)), 0.55) }), { tile: TILE.leaf, color: i % 2 ? 0x4aa84e : 0x3b9446, rough: 0.5, jitter: 0.1, uv: [1, 1], ...sway });
  }
  // nuova foglia arrotolata e casco di banane
  p.add(lathe([[0.02, 1.2], [0.028, 1.45], [0.012, 1.75], [0, 1.8]], 6), { tile: TILE.leaf, color: 0x7cc45a, rough: 0.5, uv: [1, 0.3], ...sway });
  p.add(tube([v3(0.04, 1.15, 0.02), v3(0.16, 1.12, 0.08), v3(0.2, 0.95, 0.1)], 0.012, 5, 4), { color: 0x6a7a3a, rough: 0.7 });
  for (let r = 0; r < 2; r++)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r * 0.5;
      const cx = 0.2 + Math.cos(a) * 0.035;
      const cz = 0.1 + Math.sin(a) * 0.035;
      const y = 0.99 - r * 0.07;
      p.add(tube([v3(cx - Math.cos(a) * 0.02, y, cz - Math.sin(a) * 0.02), v3(cx + Math.cos(a) * 0.03, y - 0.02, cz + Math.sin(a) * 0.03), v3(cx + Math.cos(a) * 0.035, y + 0.05, cz + Math.sin(a) * 0.035)], 0.014, 5, 3), { color: r ? 0xb9c744 : 0xf2cf3e, rough: 0.5 });
    }
  p.add(lathe([[0, 0], [0.03, 0.02], [0.035, 0.06], [0, 0.1]], 8), { color: 0x8a2f4a, rough: 0.6 }, tr(0.2, 0.86, 0.1, Math.PI));
  return d.finish();
}

export function plantPalm(o: DecorOpts): DecorModel {
  const d = new Decor('plant_palm', o);
  const p = d.p;
  pot(p, 0.2, 0.3);
  p.add(torus(0.185, 0.01, 5, 18), { tile: TILE.terracotta, color: 0xb05a36, rough: 0.9 }, tr(0, 0.12, 0, Math.PI / 2));
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) {
    const y = 0.27 + i * 0.065;
    prof.push([0.055 - i * 0.002, y], [0.045 - i * 0.002, y + 0.055]);
  }
  p.add(lathe(prof, 9), { tile: TILE.coir, color: 0x8a6a45, rough: 1, uv: [1, 0.6] });
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4 + d.rng.range(-0.2, 0.2);
    const up = i < 4 ? 0.9 : 0.35;
    const q = p.at(0, 0.82, 0, 0, a, 0).at(0, 0, 0, -up, 0, 0);
    frond(q, 0.75 + d.rng.next() * 0.25, 0.12, i < 4 ? 0.25 : 0.5, 9, 0.2, i % 2 ? 0x3f9a4a : 0x4fae52, 0.05);
  }
  return d.finish();
}

export function plantOrchid(o: DecorOpts): DecorModel {
  const d = new Decor('plant_orchid', o);
  const p = d.p;
  p.add(lathe([[0, 0], [0.05, 0], [0.058, 0.01], [0.07, 0.1], [0.074, 0.105], [0.064, 0.105], [0.06, 0.09]], 16), { color: 0xf4f0e7, rough: 0.2 });
  p.add(torus(0.064, 0.004, 4, 16), { color: 0x1fa7a0, rough: 0.3 }, tr(0, 0.06, 0, Math.PI / 2));
  p.cy(0.06, 0.06, 0.004, 0, 0.09, 0, { tile: TILE.coir, color: 0x6a4a30, rough: 1, uv: [0.2, 0.2] }, 12);
  for (let i = 0; i < 5; i++) {
    const q = p.at(0, 0.09, 0, 0, i * 1.9 + 0.4, 0);
    q.add(leaf(0.17 + (i % 2) * 0.04, 0.055, { bend: 1.3, startAngle: 0.5, segs: 5, fold: 0.008, width: (t) => 0.5 + 0.5 * Math.sin(Math.PI * Math.pow(t, 0.6)) }), { tile: TILE.leaf, color: 0x2f7d3e, rough: 0.35, uv: [0.5, 0.5] });
  }
  const cols = [0xd94f9a, 0xf4f0e7];
  for (let s = 0; s < 2; s++) {
    const sx = s ? -1 : 1;
    const pts = [v3(sx * 0.01, 0.09, 0), v3(sx * 0.02, 0.26, 0.01), v3(sx * 0.06, 0.4, 0.02), v3(sx * 0.15, 0.44 - s * 0.04, 0.03), v3(sx * 0.22, 0.38 - s * 0.04, 0.035)];
    p.add(tube(pts, 0.0035, 4, 4), { color: 0x5f8f3c, rough: 0.6 });
    p.rod(v3(sx * 0.015, 0.09, -0.01), v3(sx * 0.025, 0.36, 0.0), 0.003, { tile: TILE.bamboo, color: 0xdcc072, rough: 0.6 }, 4);
    for (let i = 0; i < 5; i++) {
      const t = 0.42 + i * 0.14;
      const k = Math.min(3.999, t * 4);
      const a = pts[Math.floor(k)];
      const b = pts[Math.floor(k) + 1];
      const c = a.clone().lerp(b, k - Math.floor(k));
      const q = p.at(c.x, c.y - 0.012, c.z + 0.012, 0, sx * 0.3 + (i % 2 ? 0.5 : -0.4), 0).at(0, 0, 0, Math.PI / 2 - 0.2, 0, 0);
      flower(q, 0.034, cols[s], 0xf5c84a, { glow: 0 });
      q.add(leaf(0.018, 0.02, { bend: 0.4, segs: 1 }), { color: s ? 0xd94f9a : 0xf5c84a, rough: 0.6 }, tr(0, 0.006, 0.004, 0.9));
    }
  }
  return d.finish();
}

export function plantFrangipani(o: DecorOpts): DecorModel {
  const d = new Decor('plant_frangipani', o);
  const p = d.p;
  pot(p, 0.27, 0.36, 0xd8d2c4, TILE.stone, 0.8);
  p.add(torus(0.265, 0.014, 5, 20), { tile: TILE.stone, color: 0xc4bdb0, rough: 0.9 }, tr(0, 0.22, 0, Math.PI / 2));
  const bark: Surf = { tile: TILE.stone, color: 0xa39a8c, rough: 0.9, uv: [1, 0.4] };
  const tips: Array<[number, number, number]> = [];
  p.add(tube([v3(0, 0.3, 0), v3(0.02, 0.6, 0.01), v3(0, 0.85, 0)], 0.045, 7, 4), bark);
  const fork = (x: number, y: number, z: number, a: number, len: number, r: number, depth: number): void => {
    const ex = x + Math.sin(a) * len * 0.6;
    const ez = z + Math.cos(a) * len * 0.6;
    const ey = y + len * 0.75;
    p.add(tube([v3(x, y, z), v3(x + Math.sin(a) * len * 0.45, y + len * 0.3, z + Math.cos(a) * len * 0.45), v3(ex, ey, ez)], r, 6, 4), bark);
    if (depth === 0) tips.push([ex, ey, ez]);
    else for (const da of [-1.0, 1.1]) fork(ex, ey, ez, a + da, len * 0.72, r * 0.72, depth - 1);
  };
  for (let i = 0; i < 3; i++) fork(0, 0.82, 0, i * 2.09 + 0.3, 0.42, 0.032, 1);
  const sway: Surf = { swayFn: (_x, y) => Math.max(0, y - 1.0) * 0.03 };
  tips.forEach(([x, y, z], k) => {
    for (let i = 0; i < 7; i++) {
      const q = p.at(x, y, z, 0, i * 0.9 + k, 0).at(0, 0, 0, 0.75 + (i % 3) * 0.25, 0, 0);
      q.add(leaf(0.26, 0.085, { bend: 0.5, segs: 4, fold: 0.012, width: (t) => 0.15 + 0.85 * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.3)), 0.8) }), { tile: TILE.leaf, color: 0x3d8f45, rough: 0.45, jitter: 0.12, uv: [0.6, 0.6], ...sway });
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + k;
      const q = p.at(x + Math.sin(a) * 0.035, y + 0.07, z + Math.cos(a) * 0.035, 0, a, 0).at(0, 0, 0, 0.5, 0, 0);
      flower(q, 0.045, 0xfffaf0, 0xf7c948, sway);
      q.add(sphere(0.014, 6, 4), { color: 0xf7c948, rough: 0.6, ...sway }, tr(0, 0.004, 0));
    }
  });
  // fiori caduti
  flower(p.at(0.12, 0.33, 0.1), 0.04, 0xfffaf0, 0xf7c948);
  flower(p.at(0.36, 0.006, 0.2, 0, 1, 0), 0.04, 0xfffaf0, 0xf7c948);
  return d.finish();
}

export function plantFern(o: DecorOpts): DecorModel {
  const d = new Decor('plant_fern', o);
  const p = d.p;
  const sw: Surf = { swayFn: (_x, y) => Math.max(0, -y) * 0.02 };
  p.add(torus(0.018, 0.004, 5, 10), { color: 0xc3c7cc, metal: 1, rough: 0.3 }, tr(0, -0.018, 0));
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094;
    const rim = v3(Math.sin(a) * 0.15, -0.5, Math.cos(a) * 0.15);
    p.cord(v3(0, -0.035, 0), rim, 0, 0.005, sw);
    p.add(sphere(0.012, 6, 4), { tile: TILE.rope, color: 0xc6aa79, rough: 1, ...sw }, tr(rim.x * 0.5, -0.27, rim.z * 0.5));
    p.cord(rim, v3(0, -0.72, 0), -0.05, 0.005, sw);
  }
  p.add(lathe([[0, -0.66], [0.07, -0.655], [0.13, -0.6], [0.155, -0.5], [0.15, -0.49], [0.135, -0.5]], 14), { tile: TILE.coir, color: 0x7a5a3a, rough: 1, uv: [0.5, 0.8], ...sw });
  p.add(lathe([[0.004, -0.72], [0.012, -0.76], [0.004, -0.9]], 5), { tile: TILE.rope, color: 0xc6aa79, rough: 1, ...sw });
  for (let i = 0; i < 13; i++) {
    const a = i * 2.4;
    const up = i < 4 ? 0.7 : -0.1 + (i % 3) * 0.15;
    const q = p.at(0, -0.5, 0, 0, a, 0).at(0, 0, 0, -up, 0, 0);
    frond(q, 0.4 + d.rng.next() * 0.2, 0.05, i < 4 ? 0.12 : 0.34, 8, 0.075, i % 2 ? 0x4fae52 : 0x3f9a4a, 0.04);
  }
  return d.finish();
}
