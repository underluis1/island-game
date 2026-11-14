/** Oggetti da spiaggia: tavole da surf, conchiglie, rete, ombrellone, sdraio, amaca, cocchi, bidone-tavolino. */
import * as THREE from 'three';
import { type ColorLike, type Pen, type Surf, TILE, cyl, extrude, lathe, leaf, rbox, sphere, torus, tr, tube, v3 } from '../kit';
import { PAL, crate } from '../parts';
import type { DecorModel } from '../shop-types';
import { Decor, type DecorOpts, boardShape, flower, param } from './decor-kit';

function surfboard(p: Pen, L: number, W: number, base: ColorLike, stripe: ColorLike, accent: ColorLike): void {
  const g = extrude(boardShape(L, W), 0.04, 0.014, 12);
  g.translate(0, 0, -0.02);
  p.add(g, { color: base, rough: 0.22 });
  const hw = (t: number): number => (W / 2) * Math.pow(Math.sin(Math.PI * Math.pow(0.04 + t * 0.96, 0.82)), 0.6);
  const band = (t0: number, t1: number, col: ColorLike, k = 1): void => {
    const s = new THREE.Shape();
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      if (i === 0) s.moveTo(hw(t) * k, L * t);
      else s.lineTo(hw(t) * k, L * t);
    }
    for (let i = n; i >= 0; i--) {
      const t = t0 + ((t1 - t0) * i) / n;
      s.lineTo(-hw(t) * k, L * t);
    }
    for (const z of [0.0348, -0.0348]) p.add(new THREE.ShapeGeometry(s, 2), { color: col, rough: 0.22 }, tr(0, 0, z));
  };
  band(0.7, 0.995, stripe);
  band(0.6, 0.66, accent);
  band(0.08, 0.16, stripe);
  band(0.02, 0.985, 0xf7f1e3, 0.07);
  // pinne
  for (const [x, y, s] of [
    [0, 0.09, 1],
    [-W * 0.3, 0.2, 0.75],
    [W * 0.3, 0.2, 0.75],
  ] as const) {
    const f = new THREE.Shape();
    f.moveTo(0, 0);
    f.quadraticCurveTo(0.02, 0.1, -0.07, 0.13);
    f.quadraticCurveTo(0.05, 0.11, 0.1, 0);
    const fg = extrude(f, 0.008, 0.002, 6);
    p.add(fg, { color: 0x24303a, rough: 0.3 }, tr(x - 0.004, L * y, -0.034, -Math.PI / 2, 0, Math.PI / 2, s));
  }
}

export function surfboardStand(o: DecorOpts): DecorModel {
  const d = new Decor('surfboard_stand', o);
  const p = d.p;
  p.add(lathe([[0, 0], [0.22, 0], [0.16, 0.05], [0.06, 0.09], [0, 0.09]], 14), { tile: TILE.stone, color: 0xe2d2a8, rough: 1, uv: [0.4, 0.4] });
  surfboard(p.at(0, -0.12, 0.02, -0.1, 0.25, 0.04), 1.95, 0.5, 0xf7f1e3, 0x1fa7a0, 0xf2705a);
  // laccio arrotolato
  p.add(tube([v3(0.02, 0.2, 0.06), v3(0.15, 0.1, 0.12), v3(0.2, 0.03, 0.2), v3(0.1, 0.02, 0.28), v3(0.0, 0.02, 0.22), v3(0.08, 0.02, 0.15)], 0.007, 5, 4), { color: 0x24303a, rough: 0.6 });
  return d.finish();
}

export function surfboardWall(o: DecorOpts): DecorModel {
  const d = new Decor('surfboard_wall', o);
  const p = d.p;
  surfboard(p.at(-0.85, 0, 0.075, 0, 0, -Math.PI / 2).at(0, 0, 0, 0, 0.12, 0), 1.7, 0.46, 0xf6c94a, 0xf2705a, 0xf7f1e3);
  for (const x of [-0.45, 0.45]) {
    p.add(rbox(0.05, 0.1, 0.03, 0.008), { tile: TILE.woodFine, color: 0x6e4a2e, rough: 0.6 }, tr(x, -0.27, 0.015));
    p.add(rbox(0.045, 0.03, 0.14, 0.008), { tile: TILE.woodFine, color: 0x6e4a2e, rough: 0.6 }, tr(x, -0.26, 0.07));
    p.add(rbox(0.045, 0.06, 0.02, 0.008), { tile: TILE.woodFine, color: 0x6e4a2e, rough: 0.6 }, tr(x, -0.23, 0.135));
    p.add(torus(0.13, 0.006, 5, 14), { tile: TILE.rope, color: PAL.rope, rough: 1 }, tr(x, -0.02, 0.075, 0, Math.PI / 2, 0, 1, 1.9, 0.5));
  }
  flower(p.at(0.25, 0.02, 0.105, Math.PI / 2, 0, 0), 0.09, 0xf2705a, 0xf7f1e3);
  return d.finish();
}

export function shellGiant(o: DecorOpts): DecorModel {
  const d = new Decor('shell_giant', o);
  const p = d.p;
  const turns = 3.6 * Math.PI * 2;
  const k = 0.118;
  const aEnd = 0.105;
  const a0 = aEnd / Math.exp(k * turns);
  const rad = (th: number): number => a0 * Math.exp(k * th);
  const pos = (u: number, v: number): THREE.Vector3 => {
    const th = u * turns;
    const a = rad(th);
    const ph = v * Math.PI * 2;
    const rr = a * 0.8 + a * Math.cos(ph);
    return v3(rr * Math.cos(th), (aEnd - a) * 3.1 + a * Math.sin(ph) * 1.35, rr * Math.sin(th));
  };
  p.add(lathe([[0, 0], [0.24, 0], [0.18, 0.03], [0, 0.045]], 14), { tile: TILE.stone, color: 0xe2d2a8, rough: 1, uv: [0.4, 0.4] });
  const q = p.at(-0.03, 0.15, 0.02, 0, -0.5, 0).at(0, 0, 0, 0.35, 0, -1.72);
  q.add(param(pos, 96, 12), { tile: TILE.paper, color: 0xf3b98a, rough: 0.35, uv: [1, 1], rot: true });
  // corona di punte sull'ultimo giro
  for (let i = 0; i < 9; i++) {
    const u = 1 - (i * 0.62) / turns;
    const c = pos(u, 0.2);
    const a = rad(u * turns);
    const th = u * turns;
    const dir = v3(Math.cos(th) * 0.55, 0.85, Math.sin(th) * 0.55).normalize();
    const g = lathe([[a * 0.2, 0], [a * 0.12, a * 0.22], [0, a * 0.42]], 6);
    q.add(g, { color: 0xf7dcc0, rough: 0.35 }, new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir), v3(1, 1, 1)));
  }
  // labbro rosa svasato
  const lipFn = (u: number, v: number): THREE.Vector3 => {
    const base = pos(1, -0.12 + v * 0.74);
    const out = v3(-Math.sin(turns), 0, Math.cos(turns)).multiplyScalar(u * aEnd * 1.0);
    const flare = v3(Math.cos(turns), 0.25, Math.sin(turns)).multiplyScalar(u * u * aEnd * 0.8 * Math.sin(Math.PI * v));
    return base.add(out).add(flare);
  };
  q.add(param(lipFn, 5, 12), { color: 0xf47f8e, rough: 0.18 });
  for (const [x, z, s, c] of [
    [0.2, 0.2, 1, 0xf3e3d0],
    [-0.2, 0.2, 0.75, 0xf2b49a],
  ] as const) {
    const sh = p.at(x, 0.02, z, -0.2, x * 6, 0);
    sh.add(leaf(0.09 * s, 0.11 * s, { bend: 0.9, segs: 3, fold: -0.012 * s, width: (t) => Math.pow(Math.sin(Math.PI * (0.08 + t * 0.5)), 0.6) }), { tile: TILE.paper, color: c, rough: 0.4, uv: [0.5, 0.9], rot: true });
  }
  return d.finish();
}

export function starfish(o: DecorOpts): DecorModel {
  const d = new Decor('starfish', o);
  const p = d.p;
  p.add(rbox(0.24, 0.035, 0.09, 0.012), { tile: TILE.wood, color: PAL.drift, rough: 0.95, uv: [0.3, 0.1] }, tr(0, 0.0175, 0));
  const s = p.at(0, 0.145, -0.005, -1.32, 0, 0);
  const col: Surf = { tile: TILE.stone, color: 0xf07a3c, rough: 0.8, uv: [0.3, 0.3] };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const q = s.at(0, 0, 0, 0, a, 0);
    q.add(lathe([[0.04, 0], [0.034, 0.03], [0.02, 0.085], [0.009, 0.118], [0, 0.126]], 8), col, tr(0, 0, 0.012, Math.PI / 2, 0, 0, 1, 1, 0.5));
    for (let j = 0; j < 4; j++) q.add(sphere(0.006 - j * 0.0008, 5, 4), { color: 0xffd9a8, rough: 0.7 }, tr(0, 0.016 - j * 0.0025, 0.03 + j * 0.026));
  }
  s.add(sphere(0.045, 10, 6), col, tr(0, 0, 0, 0, 0, 0, 1, 0.5, 1));
  s.add(sphere(0.008, 5, 4), { color: 0xffd9a8, rough: 0.7 }, tr(0, 0.022, 0));
  return d.finish();
}

export function fishingNet(o: DecorOpts): DecorModel {
  const d = new Decor('fishing_net', o);
  const p = d.p;
  const top = (u: number): number => 0.38 - 0.16 * 4 * u * (1 - u);
  const P = (u: number, v: number): THREE.Vector3 => {
    const hgt = 0.62 + 0.2 * Math.sin(Math.PI * u) + 0.08 * Math.sin(u * 9);
    return v3(-0.72 + 1.44 * u + 0.03 * Math.sin(v * 5 + u * 3), top(u) - v * hgt, 0.035 + 0.035 * Math.sin(u * 7 + v * 4) * v + 0.02 * v);
  };
  const net: Surf = { tile: TILE.rope, color: 0x2f8f8a, rough: 1, uv: [1, 0.2] };
  for (const dir of [-1, 1])
    for (let c = -0.4; c <= 1.4; c += 0.075) {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 7; j++) {
        const v = j / 7;
        const u = c + dir * 0.38 * v;
        if (u >= 0 && u <= 1) pts.push(P(u, v));
      }
      if (pts.length >= 3) p.add(tube(pts, 0.003, 3, 1), net);
    }
  const topPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) topPts.push(P(i / 10, 0));
  p.add(tube(topPts, 0.008, 5, 2), { tile: TILE.rope, color: PAL.rope, rough: 1, uv: [1, 0.2] });
  for (const sx of [-1, 1]) {
    p.add(cyl(0.016, 0.02, 0.09, 8), { tile: TILE.woodFine, color: 0x6e4a2e, rough: 0.7 }, tr(sx * 0.72, 0.385, 0, Math.PI / 2));
    p.add(tube([v3(sx * 0.72, 0.38, 0.05), v3(sx * 0.76, 0.3, 0.05), v3(sx * 0.74, 0.16, 0.04)], 0.007, 5, 3), { tile: TILE.rope, color: PAL.rope, rough: 1 });
  }
  for (let i = 1; i < 10; i += 1) {
    if (i === 5) continue;
    const c = P(i / 10, 0);
    p.add(lathe([[0, -0.035], [0.022, -0.02], [0.026, 0], [0.022, 0.02], [0, 0.035]], 8), { color: i % 2 ? 0xd9392c : 0xf4f0e7, rough: 0.6 }, tr(c.x, c.y, c.z, 0, 0, Math.PI / 2 - (0.5 - i / 10) * 1.2));
  }
  // boe di vetro, stella marina e conchiglia impigliate
  for (const [u, v, r, c] of [
    [0.25, 0.5, 0.075, 0x3fae9a],
    [0.68, 0.62, 0.06, 0x3a8fc4],
  ] as const) {
    const q = P(u, v);
    p.add(sphere(r, 12, 9), { color: c, rough: 0.08, metal: 0.3 }, tr(q.x, q.y, q.z + r * 0.8));
    p.add(torus(r * 1.02, 0.004, 4, 14), { tile: TILE.rope, color: PAL.rope, rough: 1 }, tr(q.x, q.y, q.z + r * 0.8));
    p.add(torus(r * 1.02, 0.004, 4, 14), { tile: TILE.rope, color: PAL.rope, rough: 1 }, tr(q.x, q.y, q.z + r * 0.8, 0, Math.PI / 2, 0));
  }
  const sf = P(0.47, 0.42);
  const s = p.at(sf.x, sf.y, sf.z + 0.03, Math.PI / 2, 0, 0.3);
  for (let i = 0; i < 5; i++) s.at(0, 0, 0, 0, (i / 5) * Math.PI * 2, 0).add(lathe([[0.03, 0], [0.02, 0.04], [0.007, 0.085], [0, 0.09]], 6), { tile: TILE.stone, color: 0xf07a3c, rough: 0.8, uv: [0.3, 0.3] }, tr(0, 0, 0.008, Math.PI / 2, 0, 0, 1, 1, 0.5));
  s.add(sphere(0.032, 8, 5), { tile: TILE.stone, color: 0xf07a3c, rough: 0.8, uv: [0.3, 0.3] }, tr(0, 0, 0, 0, 0, 0, 1, 0.5, 1));
  return d.finish();
}

export function beachUmbrella(o: DecorOpts): DecorModel {
  const d = new Decor('beach_umbrella', o);
  const p = d.p;
  p.add(lathe([[0, 0], [0.2, 0], [0.14, 0.05], [0.05, 0.1], [0.03, 0.2], [0, 0.2]], 14), { tile: TILE.stone, color: 0xe2d2a8, rough: 1, uv: [0.4, 0.4] });
  p.cy(0.022, 0.024, 1.25, 0, 0, 0, { tile: TILE.woodFine, color: 0xc98f4e, rough: 0.5, uv: [1, 0.1] }, 10);
  p.add(sphere(0.035, 10, 8), { color: PAL.brass, metal: 1, rough: 0.35 }, tr(0, 1.25, 0));
  const top = p.at(0, 1.25, 0, 0.16, 0, 0.08);
  top.cy(0.02, 0.022, 0.95, 0, 0, 0, { tile: TILE.woodFine, color: 0xc98f4e, rough: 0.5, uv: [1, 0.1] }, 10);
  const R = 1.08;
  const H = 0.92;
  const N = 8;
  const cols = [0xf6c94a, 0xf7f1e3];
  const rimY = (u: number): number => H - 0.3 - 0.05 * Math.sin(Math.PI * u);
  const sway: Surf = { swayFn: (x, y, z) => Math.min(1, Math.hypot(x, z) / R) * 0.012 + (y < 2.02 ? 0.006 : 0) };
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const da = (Math.PI * 2) / N;
    const fn = (u: number, v: number): THREE.Vector3 => {
      const a = a0 + u * da;
      const r = R * v * (1 - 0.035 * Math.sin(Math.PI * u));
      const y = H - (H - rimY(u)) * Math.pow(v, 1.35);
      return v3(Math.sin(a) * r, y, Math.cos(a) * r);
    };
    top.add(param(fn, 4, 4), { tile: TILE.fabric, color: cols[i % 2], rough: 0.85, uv: [0.5, 0.5], ...sway });
    const val = (u: number, v: number): THREE.Vector3 => {
      const a = a0 + u * da;
      const r = R * (1 - 0.035 * Math.sin(Math.PI * u)) + v * 0.01;
      return v3(Math.sin(a) * r, rimY(u) - v * 0.1 * (0.45 + 0.55 * Math.sin(Math.PI * u)), Math.cos(a) * r);
    };
    top.add(param(val, 6, 1), { tile: TILE.fabric, color: cols[(i + 1) % 2], rough: 0.85, uv: [0.3, 0.2], ...sway });
    top.rod(v3(0, H - 0.2, 0), v3(Math.sin(a0) * R, H - 0.31, Math.cos(a0) * R), 0.006, { tile: TILE.woodFine, color: 0xc98f4e, rough: 0.5 }, 5);
    top.rod(v3(0, H - 0.5, 0), v3(Math.sin(a0) * R * 0.5, H - 0.23, Math.cos(a0) * R * 0.5), 0.005, { tile: TILE.woodFine, color: 0xc98f4e, rough: 0.5 }, 4);
  }
  top.cy(0.04, 0.045, 0.05, 0, H - 0.52, 0, { tile: TILE.woodFine, color: 0x9a6a3a, rough: 0.5 }, 10);
  top.add(lathe([[0.045, H - 0.02], [0.02, H + 0.02], [0.022, H + 0.05], [0, H + 0.08]], 10), { tile: TILE.woodFine, color: 0x9a6a3a, rough: 0.5 });
  return d.finish();
}

export function deckChair(o: DecorOpts): DecorModel {
  const d = new Decor('deck_chair', o);
  const p = d.p;
  const w: Surf = { tile: TILE.woodFine, color: 0xc98f4e, rough: 0.6, jitter: 0.06 };
  const T = [0.99, -0.56];
  const G1 = [0.02, 0.42];
  const G2 = [0.02, -0.52];
  const F = [0.46, 0.62];
  const S1 = [0.8, -0.365];
  const S2 = [0.1, -0.4];
  for (const sx of [-1, 1]) {
    p.beam(v3(sx * 0.3, G1[0], G1[1]), v3(sx * 0.3, T[0], T[1]), 0.045, 0.024, w);
    p.beam(v3(sx * 0.27, G2[0], G2[1]), v3(sx * 0.27, F[0], F[1]), 0.045, 0.024, w);
    p.beam(v3(sx * 0.33, S1[0], S1[1]), v3(sx * 0.33, S2[0], S2[1]), 0.035, 0.022, w);
    p.add(cyl(0.008, 0.008, 0.1, 6), { color: PAL.brass, metal: 1, rough: 0.4 }, tr(sx * 0.335, 0.215, 0.105, 0, 0, sx * Math.PI / 2));
  }
  for (const [y, z, half] of [
    [T[0] - 0.01, T[1] + 0.01, 0.3],
    [F[0] - 0.01, F[1] - 0.02, 0.27],
    [G1[0] + 0.01, G1[1] - 0.01, 0.3],
    [G2[0] + 0.01, G2[1] + 0.01, 0.27],
    [S2[0], S2[1], 0.33],
  ] as const)
    p.add(cyl(0.016, 0.016, half * 2 + 0.03, 8), w, tr(-half - 0.015, y, z, 0, 0, -Math.PI / 2));
  // tela a strisce
  const cols = [0x1fa7a0, 0xf7f1e3];
  const N = 7;
  const fn = (u: number, v: number): THREE.Vector3 => {
    const y = T[0] + (F[0] - T[0]) * u - 0.2 * Math.sin(Math.PI * Math.pow(u, 1.25)) - 0.02 * Math.cos((v - 0.5) * Math.PI) * Math.sin(Math.PI * u);
    return v3((v - 0.5) * 0.5, y + 0.016, T[1] + (F[1] - T[1]) * u);
  };
  for (let i = 0; i < N; i++) p.add(param(fn, 10, 1, 0, 1, i / N, (i + 1) / N), { tile: TILE.fabric, color: cols[i % 2], rough: 0.9, uv: [1, 0.2], sway: 0.003 });
  // cuscino poggiatesta
  p.add(rbox(0.36, 0.1, 0.06, 0.03, 2), { tile: TILE.fabric, color: 0xf2705a, rough: 0.95, uv: [0.3, 0.2] }, tr(0, 0.86, -0.42, 0.75));
  return d.finish();
}

export function hammock(o: DecorOpts): DecorModel {
  const d = new Decor('hammock', o);
  const p = d.p;
  const w: Surf = { tile: TILE.wood, color: 0x9c6a40, rough: 0.8, jitter: 0.06 };
  for (const s of [-1, 1]) {
    const top = v3(0, 1.32, s * 1.42);
    p.beam(v3(0, 0, s * 1.18), top, 0.09, 0.09, w, 0.015);
    p.beam(v3(-0.42, 0.04, s * 1.2), v3(0.42, 0.04, s * 1.2), 0.08, 0.08, w, 0.012);
    p.beam(v3(0, 0.06, s * 1.2), v3(0, 0.06, s * 0.2), 0.07, 0.07, w, 0.012);
    for (const sx of [-1, 1]) p.beam(v3(sx * 0.36, 0.08, s * 1.2), v3(0, 0.62, s * 1.29), 0.05, 0.04, w);
    p.beam(v3(0, 0.1, s * 0.75), v3(0, 0.55, s * 1.27), 0.05, 0.05, w);
    p.add(torus(0.03, 0.007, 5, 10), { color: PAL.iron, metal: 0.9, rough: 0.5 }, tr(0, 1.22, s * 1.36, 0, Math.PI / 2, 0));
    // barra distanziatrice e ventaglio di corde
    const ring = v3(0, 1.2, s * 1.33);
    p.add(cyl(0.016, 0.016, 0.78, 8), { tile: TILE.woodFine, color: 0xc98f4e, rough: 0.6 }, tr(-0.39, 1.02, s * 0.98, 0, 0, -Math.PI / 2));
    for (let i = 0; i < 7; i++) p.cord(ring, v3(-0.36 + i * 0.12, 1.02, s * 0.98), 0.01, 0.004);
  }
  const cols = [0xf2705a, 0xf7f1e3, 0xf6c94a, 0xf7f1e3, 0x1fa7a0, 0xf7f1e3];
  const N = 9;
  const fn = (u: number, v: number): THREE.Vector3 => {
    const z = -0.98 + 1.96 * u;
    const sag = Math.sin(Math.PI * u);
    const x = (v - 0.5) * 0.76 * (1 + 0.12 * sag);
    const y = 1.02 - 0.5 * Math.pow(sag, 0.8) + 0.26 * Math.pow(Math.abs(v - 0.5) * 2, 2) * sag;
    return v3(x, y, z);
  };
  for (let i = 0; i < N; i++) p.add(param(fn, 14, 2, 0, 1, i / N, (i + 1) / N), { tile: TILE.fabric, color: cols[i % cols.length], rough: 0.9, uv: [1, 0.2], swayFn: (_x, y) => Math.max(0, 1.02 - y) * 0.03 });
  // frangia e cuscino
  for (const sx of [-1, 1])
    for (let i = 0; i < 12; i++) {
      const u = 0.12 + (i / 11) * 0.76;
      const e = fn(u, sx > 0 ? 1 : 0);
      p.rod(e, v3(e.x + sx * 0.02, e.y - 0.09, e.z), 0.004, { tile: TILE.rope, color: 0xf7f1e3, rough: 1, sway: 0.01 }, 4);
    }
  const c = fn(0.2, 0.5);
  p.add(rbox(0.4, 0.1, 0.26, 0.045, 2), { tile: TILE.fabric, color: 0x1fa7a0, rough: 0.95, uv: [0.4, 0.3], sway: 0.012 }, tr(c.x, c.y + 0.07, c.z, -0.45));
  return d.finish();
}

function coconutBrown(p: Pen, r: number): void {
  const g = sphere(r, 10, 8);
  g.scale(1, 1.12, 1);
  p.add(g, { tile: TILE.coir, color: 0x7a5636, rough: 1, uv: [0.5, 0.5] });
  for (let i = 0; i < 3; i++) p.add(sphere(r * 0.12, 5, 4), { color: 0x2e1c10, rough: 0.9 }, tr(Math.sin(i * 2.09) * r * 0.25, r * 1.05, Math.cos(i * 2.09) * r * 0.25));
}

function coconutGreen(p: Pen, r: number, straw: boolean): void {
  p.add(lathe([[0, -r * 1.05], [r * 0.6, -r * 0.85], [r, -r * 0.1], [r * 0.92, r * 0.55], [r * 0.5, r * 0.95], [r * (straw ? 0.42 : 0.1), r * 1.02], [0, r * 1.02]], 10), { color: 0x7fb24a, rough: 0.5 });
  if (straw) {
    p.cy(r * 0.4, r * 0.4, 0.003, 0, r * 1.02, 0, { color: 0xfaf6ea, rough: 0.5 }, 10);
    p.rod(v3(0.01, r * 0.9, 0), v3(0.05, r * 1.75, 0.02), 0.005, { color: 0xf2705a, rough: 0.5 }, 5);
    flower(p.at(-r * 0.3, r * 1.03, r * 0.1, 0, 0, 0.3), r * 0.4, 0xf08fa8, 0xf6c94a);
  }
}

export function coconutCrate(o: DecorOpts): DecorModel {
  const d = new Decor('coconut_crate', o);
  const p = d.p;
  crate(p.at(0, 0, 0, 0, 0.12, 0), 0.5, 0.26, 0.4, PAL.woodPale);
  const spots: Array<[number, number, number, boolean]> = [
    [-0.13, 0.2, -0.08, false],
    [0.12, 0.21, -0.09, true],
    [-0.02, 0.2, 0.1, true],
    [0.15, 0.2, 0.1, false],
    [-0.16, 0.2, 0.1, true],
    [0.0, 0.34, -0.02, false],
    [-0.12, 0.33, 0.03, true],
  ];
  spots.forEach(([x, y, z, green], i) => {
    const q = p.at(x, y, z, d.rng.range(-0.5, 0.5), i, d.rng.range(-0.5, 0.5));
    if (green) coconutGreen(q, 0.085, false);
    else coconutBrown(q, 0.08);
  });
  coconutGreen(p.at(0.36, 0.09, 0.2), 0.085, true);
  coconutBrown(p.at(-0.34, 0.075, 0.22, 0.4, 0, 1.2), 0.075);
  return d.finish();
}

export function barrelTable(o: DecorOpts): DecorModel {
  const d = new Decor('barrel_table', o);
  const p = d.p;
  const r = 0.29;
  const prof: Array<[number, number]> = [[0, 0], [r, 0], [r * 1.02, 0.02], [r, 0.04]];
  for (const y of [0.3, 0.58]) prof.push([r, y - 0.02], [r * 1.035, y], [r, y + 0.02]);
  prof.push([r, 0.82], [r * 1.02, 0.84], [r, 0.86], [0, 0.86]);
  p.add(lathe(prof, 22), { color: 0x1fa7a0, rough: 0.5, metal: 0.35 });
  p.add(cyl(r * 1.005, r * 1.005, 0.1, 22, true), { color: 0xf7f1e3, rough: 0.5, metal: 0.2 }, tr(0, 0.39, 0));
  p.add(cyl(r * 1.007, r * 1.007, 0.025, 22, true), { color: 0xf2705a, rough: 0.5, metal: 0.2 }, tr(0, 0.428, 0));
  // piano rotondo di assi
  p.cy(0.46, 0.46, 0.035, 0, 0.865, 0, { tile: TILE.wood, color: PAL.woodRaw, rough: 0.85, uv: [1, 1] }, 28);
  for (const x of [-0.28, -0.09, 0.1, 0.29]) p.box(0.006, 0.002, Math.sqrt(0.46 * 0.46 - x * x) * 2 - 0.01, x, 0.9005, 0, { color: 0x3a2616, rough: 1 }, 0);
  p.add(torus(0.46, 0.008, 4, 28), { color: PAL.iron, metal: 0.9, rough: 0.5 }, tr(0, 0.882, 0, Math.PI / 2));
  coconutGreen(p.at(0.12, 0.99, 0.08), 0.085, true);
  p.add(lathe([[0, 0], [0.035, 0], [0.04, 0.05], [0.03, 0.07], [0.034, 0.075]], 10), { color: 0xbfe6f2, rough: 0.08, metal: 0.3 }, tr(-0.16, 0.9, -0.05));
  p.cy(0.03, 0.03, 0.03, -0.16, 0.905, -0.05, { color: 0xffd98a, rough: 0.4, glow: 1.2 }, 8);
  // sgabelli
  for (const sx of [-1, 1]) {
    const q = p.at(sx * 0.6, 0, 0.05, 0, sx * 0.4, 0);
    q.cy(0.16, 0.15, 0.04, 0, 0.42, 0, { tile: TILE.wood, color: PAL.woodHoney, rough: 0.8, uv: [0.4, 0.4] }, 16);
    q.add(rbox(0.3, 0.02, 0.3, 0.008), { tile: TILE.fabric, color: sx > 0 ? 0xf6c94a : 0xf2705a, rough: 0.95, uv: [0.3, 0.3] }, tr(0, 0.468, 0, 0, Math.PI / 4, 0, 0.72));
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094;
      q.beam(v3(Math.sin(a) * 0.08, 0.42, Math.cos(a) * 0.08), v3(Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15), 0.035, 0.035, { tile: TILE.wood, color: PAL.woodDark, rough: 0.8 }, 0.008);
    }
    q.add(torus(0.1, 0.008, 4, 14), { color: PAL.iron, metal: 0.9, rough: 0.5 }, tr(0, 0.16, 0, Math.PI / 2));
  }
  return d.finish('lamps');
}
