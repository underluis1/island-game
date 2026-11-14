/** Lanterne, lucine, torce. */
import * as THREE from 'three';
import { type Surf, TILE, cyl, lathe, rbox, sphere, torus, tr, v3 } from '../kit';
import { PAL } from '../parts';
import type { DecorModel } from '../shop-types';
import { AX, AZ, Decor, type DecorOpts, flame } from './decor-kit';

export function lanternPaper(o: DecorOpts): DecorModel {
  const d = new Decor('lantern_paper', o);
  const p = d.p;
  const sw: Surf = { swayFn: (_x, y) => Math.max(0, -y) * 0.035 };
  p.add(torus(0.014, 0.003, 4, 8), { color: PAL.brass, metal: 1, rough: 0.4 }, tr(0, -0.014, 0));
  p.cord(v3(0, -0.028, 0), v3(0, -0.2, 0), 0, 0.004, sw);
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    prof.push([0.05 + Math.sin(a) * 0.17, -0.22 - 0.36 * (i / 12) - (0.02 * Math.sin(a * 2)) / 2]);
  }
  p.add(lathe(prof, 20), { tile: TILE.paper, color: 0xff7a4a, rough: 0.9, glow: 2.6, uv: [1, 1], ...sw });
  for (const y of [-0.215, -0.585]) p.add(cyl(0.056, 0.056, 0.022, 14), { tile: TILE.woodFine, color: 0x5a3a24, rough: 0.6, ...sw }, tr(0, y - 0.011, 0));
  // motivo dorato e nappa
  p.add(torus(0.218, 0.004, 4, 24), { color: PAL.gold, metal: 0.8, rough: 0.4, ...sw }, tr(0, -0.4, 0, Math.PI / 2));
  p.cord(v3(0, -0.6, 0), v3(0, -0.68, 0), 0, 0.003, { color: PAL.gold, ...sw });
  p.add(sphere(0.016, 8, 6), { color: PAL.gold, metal: 0.8, rough: 0.4, ...sw }, tr(0, -0.69, 0));
  p.add(lathe([[0.012, -0.7], [0.02, -0.74], [0.024, -0.86], [0.002, -0.87]], 8), { tile: TILE.rope, color: 0xd9392c, rough: 1, uv: [0.5, 1], ...sw });
  return d.finish('lamps');
}

export function lanternBamboo(o: DecorOpts): DecorModel {
  const d = new Decor('lantern_bamboo', o);
  const p = d.p;
  p.add(rbox(0.3, 0.03, 0.3, 0.008), { tile: TILE.woodFine, color: 0x6e4a2e, rough: 0.6 }, tr(0, 0.015, 0));
  p.add(rbox(0.32, 0.025, 0.32, 0.008), { tile: TILE.woodFine, color: 0x6e4a2e, rough: 0.6 }, tr(0, 0.7, 0));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) p.cane(v3(sx * 0.125, 0.02, sz * 0.125), v3(sx * 0.125, 0.7, sz * 0.125), 0.016, { color: PAL.bamboo, rough: 0.5 });
  // gabbia di listelli e carta di riso luminosa
  for (let s = 0; s < 4; s++) {
    const q = p.at(0, 0, 0, 0, (s * Math.PI) / 2, 0);
    for (const y of [0.16, 0.36, 0.56]) q.cane(v3(-0.125, y, 0.125), v3(0.125, y, 0.125), 0.007, { color: PAL.bambooDark, rough: 0.5 }, 5);
    for (const x of [-0.045, 0.045]) q.cane(v3(x, 0.03, 0.127), v3(x, 0.69, 0.127), 0.006, { color: PAL.bambooDark, rough: 0.5 }, 5);
    q.add(new THREE.PlaneGeometry(0.235, 0.65), { tile: TILE.paper, color: 0xffe2a8, rough: 0.9, glow: 1.7, uv: [0.6, 1], rot: true }, tr(0, 0.36, 0.112));
    q.lash(v3(0.125, 0.66, 0.125), 0.02, 'y');
    q.lash(v3(0.125, 0.07, 0.125), 0.02, 'y');
  }
  p.add(lathe([[0.12, 0.712], [0.06, 0.76], [0.02, 0.78]], 4), { tile: TILE.thatch, color: 0xcfae68, rough: 1, uv: [0.3, 0.5] }, tr(0, 0, 0, 0, Math.PI / 4, 0));
  p.add(torus(0.05, 0.006, 5, 12, Math.PI), { tile: TILE.rope, color: PAL.rope, rough: 1 }, tr(0, 0.775, 0));
  return d.finish('lamps');
}

export function stringLightsDecor(o: DecorOpts): DecorModel {
  const d = new Decor('string_lights', o);
  const p = d.p;
  const sw = (k: number): Surf => ({ swayFn: (_x, y) => Math.max(0, -y - 0.15) * k });
  p.add(torus(0.014, 0.003, 4, 8), { color: PAL.brass, metal: 1, rough: 0.4 }, tr(0, -0.014, 0));
  for (const sx of [-1, 1]) p.cord(v3(0, -0.03, 0), v3(sx * 0.42, -0.16, 0), 0, 0.004);
  p.cane(v3(-0.5, -0.16, 0), v3(0.5, -0.16, 0), 0.014, { color: PAL.bamboo, rough: 0.5 });
  const cols = [0xffd9a0, 0xff8a70, 0xffd9a0, 0x7fe6dc, 0xffd45a];
  for (let s = 0; s < 7; s++) {
    const x = -0.45 + s * 0.15;
    const len = 0.45 + ((s * 37) % 5) * 0.09;
    p.rod(v3(x, -0.16, 0), v3(x, -0.16 - len, 0), 0.0025, { color: 0x23301f, rough: 0.8, ...sw(0.05) }, 4);
    const n = Math.round(len / 0.13);
    for (let i = 1; i <= n; i++) {
      const y = -0.16 - (i / n) * len;
      const g = sphere(0.019, 7, 5);
      g.scale(1, 1.25, 1);
      p.add(g, { color: cols[(s + i) % cols.length], rough: 0.25, glow: 5, ...sw(0.05) }, tr(x, y - 0.02, 0));
      p.cy(0.007, 0.009, 0.014, x, y - 0.006, 0, { color: 0x23301f, rough: 0.7, ...sw(0.05) }, 5);
    }
  }
  return d.finish('lamps');
}

export function tikiTorch(o: DecorOpts): DecorModel {
  const d = new Decor('tiki_torch', o);
  const p = d.p;
  p.add(lathe([[0, 0], [0.16, 0], [0.12, 0.035], [0.05, 0.06], [0, 0.06]], 12), { tile: TILE.stone, color: 0xe2d2a8, rough: 1, uv: [0.3, 0.3] });
  p.cane(v3(0, 0, 0), v3(0.02, 1.38, 0), 0.026, { color: PAL.bamboo, rough: 0.5 }, 8);
  p.lash(v3(0.012, 0.8, 0), 0.03, 'y', { color: 0xd9392c });
  const h = p.at(0.02, 1.36, 0);
  h.add(lathe([[0.03, 0], [0.05, 0.06], [0.085, 0.24], [0.09, 0.25], [0.075, 0.25], [0.07, 0.22]], 12), { tile: TILE.rattan, color: 0xc9a05a, rough: 0.9, uv: [0.5, 0.6] });
  h.lash(v3(0, 0.03, 0), 0.036, 'y');
  h.cy(0.055, 0.05, 0.1, 0, 0.17, 0, { color: 0x3a3d42, metal: 0.9, rough: 0.45 }, 12);
  h.cy(0.012, 0.012, 0.03, 0, 0.27, 0, { color: 0xe8e0c8, rough: 1 }, 6);
  const fl = d.b.bone(h.pt(0, 0.28, 0));
  flame(h.at(0, 0.28, 0), 0.2, { bone: fl });
  return d.finish('fire', ({ t, bones, env }) => {
    const b = bones[fl];
    b.scale.set(1 + 0.1 * Math.sin(t * 13), 1 + 0.18 * Math.sin(t * 9.1) + 0.1 * Math.sin(t * 17.3), 1 + 0.1 * Math.cos(t * 11));
    b.quaternion.setFromAxisAngle(AZ, 0.12 * Math.sin(t * 5.3) + env.wind * 0.35 + 0.06 * Math.sin(t * 14.7));
  });
}

export function candleCoconut(o: DecorOpts): DecorModel {
  const d = new Decor('candle_coconut', o);
  const p = d.p;
  p.add(torus(0.045, 0.008, 5, 12), { tile: TILE.rope, color: PAL.rope, rough: 1 }, tr(0, 0.008, 0, Math.PI / 2));
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    prof.push([Math.sin(a) * 0.085, 0.092 - Math.cos(a) * 0.085]);
  }
  p.add(lathe(prof, 14), { tile: TILE.coir, color: 0x6a4a30, rough: 1, uv: [0.5, 0.5] });
  p.add(lathe([[0.085, 0.092], [0.076, 0.092], [0.07, 0.075]], 14), { color: 0xf6efe0, rough: 0.7 });
  p.cy(0.072, 0.072, 0.004, 0, 0.074, 0, { color: 0xfff3d6, rough: 0.4, glow: 0.5 }, 14);
  p.cy(0.002, 0.002, 0.016, 0, 0.078, 0, { color: 0x222222 }, 4);
  const fl = d.b.bone(p.pt(0, 0.09, 0));
  flame(p.at(0, 0.088, 0), 0.05, { bone: fl });
  // conchiglie e fiore accanto
  p.add(lathe([[0, 0], [0.018, 0.004], [0.014, 0.014], [0.006, 0.022], [0, 0.03]], 8), { color: 0xf3d9c6, rough: 0.5 }, tr(0.12, 0, 0.04, 0.4, 0.5, 1.2));
  p.add(lathe([[0, 0], [0.014, 0.003], [0.01, 0.011], [0, 0.022]], 8), { color: 0xf6c9b0, rough: 0.5 }, tr(-0.11, 0.004, 0.06, 1.3, 0, 0.4));
  return d.finish('fire', ({ t, bones }) => {
    const b = bones[fl];
    b.scale.set(1, 1 + 0.2 * Math.sin(t * 10) + 0.1 * Math.sin(t * 23), 1);
    b.quaternion.setFromAxisAngle(AX, 0.15 * Math.sin(t * 6.1));
  });
}
