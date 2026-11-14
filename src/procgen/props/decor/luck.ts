/** Portafortuna: casetta degli spiriti, gatto, ghirlanda, campane a vento. */
import * as THREE from 'three';
import { type Surf, TILE, cyl, extrude, lathe, leaf, rbox, sphere, torus, tr, tube, v3 } from '../kit';
import { PAL } from '../parts';
import type { DecorModel } from '../shop-types';
import { AX, Decor, type DecorOpts } from './decor-kit';

export function spiritHouse(o: DecorOpts): DecorModel {
  const d = new Decor('spirit_house', o);
  const p = d.p;
  const white: Surf = { tile: TILE.plaster, color: 0xf7f2e6, rough: 0.7, uv: [0.5, 0.5] };
  const gold: Surf = { color: PAL.gold, metal: 1, rough: 0.3 };
  const redS: Surf = { color: 0xb8261e, rough: 0.5 };
  p.add(rbox(0.36, 0.06, 0.36, 0.012), white, tr(0, 0.03, 0));
  p.add(rbox(0.26, 0.05, 0.26, 0.012), white, tr(0, 0.085, 0));
  p.add(lathe([[0.1, 0.11], [0.075, 0.16], [0.06, 0.24], [0.055, 0.7], [0.07, 0.8], [0.12, 0.88], [0.16, 0.92]], 12), white);
  for (const y of [0.2, 0.74, 0.86]) p.add(torus(y === 0.86 ? 0.105 : y === 0.2 ? 0.07 : 0.062, 0.008, 5, 14), gold, tr(0, y, 0, Math.PI / 2));
  p.add(rbox(0.46, 0.035, 0.46, 0.01), white, tr(0, 0.935, 0));
  p.add(rbox(0.48, 0.012, 0.48, 0.004), gold, tr(0, 0.957, 0));
  const top = 0.963;
  // ringhiera
  for (let s = 0; s < 4; s++) {
    const q = p.at(0, top, 0, 0, (s * Math.PI) / 2, 0);
    for (let i = -2; i <= 2; i++) if (!(s === 0 && Math.abs(i) < 2)) q.cy(0.006, 0.006, 0.05, i * 0.1, 0, 0.215, gold, 5);
    if (s !== 0) q.box(0.44, 0.008, 0.012, 0, 0.052, 0.215, gold, 0.002);
    q.add(sphere(0.012, 6, 5), gold, tr(0.215, 0.06, 0.215));
    q.cy(0.008, 0.008, 0.055, 0.215, 0, 0.215, gold, 5);
  }
  // casetta
  p.add(rbox(0.26, 0.03, 0.22, 0.006), redS, tr(0, top + 0.015, -0.03));
  p.add(rbox(0.21, 0.16, 0.17, 0.006), white, tr(0, top + 0.11, -0.03));
  p.box(0.07, 0.11, 0.004, 0, top + 0.085, 0.056, { color: 0x3a1410, rough: 0.8 }, 0);
  p.box(0.012, 0.12, 0.008, -0.041, top + 0.09, 0.057, gold, 0.002);
  p.box(0.012, 0.12, 0.008, 0.041, top + 0.09, 0.057, gold, 0.002);
  p.box(0.1, 0.012, 0.008, 0, top + 0.148, 0.057, gold, 0.002);
  for (const sx of [-1, 1]) p.cy(0.01, 0.012, 0.16, sx * 0.115, top + 0.03, 0.07, gold, 6);
  const roof = (w: number, h: number, depth: number, y: number): void => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.quadraticCurveTo(-w * 0.16, h * 0.25, 0, h);
    s.quadraticCurveTo(w * 0.16, h * 0.25, w / 2, 0);
    s.closePath();
    const g = extrude(s, depth, 0.004, 6);
    g.translate(0, 0, -depth / 2);
    p.add(g, { color: 0xc2301f, rough: 0.5 }, tr(0, y, -0.03));
    for (const sz of [-1, 1]) {
      const z = -0.03 + sz * (depth / 2 + 0.006);
      for (const sx of [-1, 1]) {
        p.add(tube([v3(sx * (w / 2 + 0.01), y - 0.004, z), v3(sx * w * 0.2, y + h * 0.28, z), v3(0, y + h + 0.004, z)], 0.007, 5, 5), gold);
        p.add(tube([v3(sx * (w / 2 + 0.01), y - 0.004, z), v3(sx * (w / 2 + 0.04), y + 0.01, z), v3(sx * (w / 2 + 0.05), y + 0.045, z)], 0.005, 4, 3), gold);
      }
      p.add(tube([v3(0, y + h, z), v3(0, y + h + 0.04, z + sz * 0.008), v3(0, y + h + 0.075, z + sz * 0.03)], 0.006, 4, 3), gold);
    }
    p.box(0.012, 0.008, depth, 0, y + h * 0.985, -0.03, { color: 0x2f8f5a, rough: 0.5 }, 0);
  };
  roof(0.34, 0.14, 0.26, top + 0.19);
  roof(0.22, 0.13, 0.2, top + 0.27);
  // offerte
  p.add(torus(0.03, 0.007, 5, 14), { color: 0xf5a623, rough: 0.9 }, tr(0, top + 0.15, 0.062, 0.1));
  p.add(lathe([[0, 0], [0.014, 0], [0.018, 0.014], [0, 0.018]], 8), { color: PAL.brass, metal: 1, rough: 0.4 }, tr(-0.13, top, 0.14));
  for (let i = 0; i < 3; i++) {
    const b = v3(-0.13 + (i - 1) * 0.01, top + 0.09, 0.14 + (i - 1) * 0.004);
    p.rod(v3(-0.13 + (i - 1) * 0.003, top + 0.015, 0.14), b, 0.0012, { color: 0x8a3a2a }, 4);
    p.add(sphere(0.0025, 4, 3), { color: 0xff7a3a, glow: 3 }, tr(b.x, b.y, b.z));
  }
  p.cy(0.009, 0.012, 0.05, 0.13, top, 0.15, { color: 0xd3202a, rough: 0.15 }, 8);
  p.rod(v3(0.13, top + 0.045, 0.15), v3(0.137, top + 0.085, 0.154), 0.0015, { color: 0xf7f1e3 }, 4);
  p.cy(0.03, 0.022, 0.006, 0.02, top, 0.16, { color: 0xf7f1e3, rough: 0.3 }, 10);
  for (let i = 0; i < 3; i++) p.add(sphere(0.011, 6, 5), { color: 0xf39a3a, rough: 0.6 }, tr(0.02 + Math.sin(i * 2.1) * 0.012, top + 0.016, 0.16 + Math.cos(i * 2.1) * 0.012));
  return d.finish();
}

export function luckyCat(o: DecorOpts): DecorModel {
  const d = new Decor('lucky_cat', o);
  const p = d.p;
  const white: Surf = { color: 0xfaf6ee, rough: 0.25 };
  const gold: Surf = { color: PAL.gold, metal: 1, rough: 0.3 };
  p.add(rbox(0.17, 0.03, 0.14, 0.014, 2), { tile: TILE.fabric, color: 0xc2271f, rough: 0.9, uv: [0.2, 0.2] }, tr(0, 0.015, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add(sphere(0.008, 5, 4), gold, tr(sx * 0.08, 0.015, sz * 0.065));
  p.add(lathe([[0, 0.03], [0.058, 0.03], [0.072, 0.06], [0.068, 0.11], [0.052, 0.15], [0.04, 0.165]], 14), white, tr(0, 0, 0, 0, 0, 0, 1, 1, 0.88));
  const hg = sphere(0.064, 14, 10);
  hg.scale(1.1, 0.9, 0.95);
  p.add(hg, white, tr(0, 0.205, 0.005));
  for (const sx of [-1, 1]) {
    p.add(lathe([[0.026, 0], [0.014, 0.025], [0, 0.04]], 4), white, tr(sx * 0.043, 0.245, 0, 0, Math.PI / 4, -sx * 0.25, 1, 1, 0.6));
    p.add(lathe([[0.016, 0], [0.008, 0.016], [0, 0.026]], 4), { color: 0xf2a0a8, rough: 0.5 }, tr(sx * 0.043, 0.249, 0.006, 0, Math.PI / 4, -sx * 0.25, 1, 1, 0.5));
    // occhi sorridenti, baffi, zampe
    p.add(torus(0.013, 0.003, 4, 8, Math.PI), { color: 0x1d1e21, rough: 0.4 }, tr(sx * 0.027, 0.208, 0.061, 0.1, sx * 0.3, 0));
    for (let i = -1; i <= 1; i++) p.rod(v3(sx * 0.03, 0.19, 0.058), v3(sx * 0.075, 0.19 + i * 0.012, 0.045), 0.0012, { color: 0x1d1e21 }, 3);
    p.add(sphere(0.022, 8, 6), white, tr(sx * 0.035, 0.045, 0.058, 0, 0, 0, 1, 0.75, 1.2));
  }
  p.add(sphere(0.006, 6, 4), { color: 0xf2a0a8, rough: 0.4 }, tr(0, 0.193, 0.066));
  p.add(torus(0.008, 0.0022, 4, 8, Math.PI), { color: 0xc2271f, rough: 0.4 }, tr(0, 0.184, 0.064, 0.1, 0, Math.PI));
  // macchie tricolore
  const sp1 = sphere(0.03, 8, 6);
  sp1.scale(1, 0.4, 1);
  p.add(sp1, { color: 0xe98a2b, rough: 0.3 }, tr(-0.03, 0.253, 0.0, 0, 0, 0.35));
  const sp2 = sphere(0.03, 8, 6);
  sp2.scale(1, 1, 0.4);
  p.add(sp2, { color: 0x2a2b2e, rough: 0.3 }, tr(0.02, 0.1, -0.055));
  p.add(sphere(0.022, 8, 6), white, tr(0.03, 0.05, -0.065));
  // collare, campanella e moneta
  p.add(torus(0.046, 0.008, 6, 16), { color: 0xc2271f, rough: 0.5 }, tr(0, 0.158, 0.002, Math.PI / 2));
  p.add(sphere(0.014, 8, 6), gold, tr(0, 0.146, 0.05));
  p.add(rbox(0.05, 0.08, 0.012, 0.02, 2), gold, tr(-0.03, 0.095, 0.066, 0.1, 0, 0.15));
  p.box(0.004, 0.045, 0.002, -0.03, 0.095, 0.0725, { color: 0x8a5a14, rough: 0.5 }, 0);
  const lg = sphere(0.02, 8, 6);
  lg.scale(1, 1.6, 1);
  p.add(lg, white, tr(-0.052, 0.12, 0.045, 0.2, 0, 0.3));
  // zampa che saluta
  const arm = d.b.bone(v3(0.056, 0.148, 0.015));
  const a = p.at(0.056, 0.148, 0.015).surf({ bone: arm });
  a.add(lathe([[0, -0.01], [0.02, 0], [0.021, 0.07], [0.026, 0.095], [0.022, 0.118], [0, 0.126]], 10), white, tr(0.012, 0, 0, 0, 0, -0.12));
  a.add(sphere(0.008, 6, 4), { color: 0xf2a0a8, rough: 0.5 }, tr(0.024, 0.1, 0.022));
  for (const dx of [-0.01, 0, 0.01]) a.add(sphere(0.0045, 5, 3), { color: 0xf2a0a8, rough: 0.5 }, tr(0.026 + dx, 0.113, 0.02));
  return d.finish('none', ({ t, bones }) => {
    bones[arm].quaternion.setFromAxisAngle(AX, 0.18 + 0.42 * Math.sin(t * 2.6));
  });
}

export function phuangMalai(o: DecorOpts): DecorModel {
  const d = new Decor('phuang_malai', o);
  const p = d.p;
  const sw: Surf = { swayFn: (_x, y) => Math.max(0, -y) * 0.045 };
  p.add(torus(0.014, 0.003, 4, 8), { color: PAL.brass, metal: 1, rough: 0.4 }, tr(0, -0.014, 0));
  // nastro giallo con fiocco
  for (const sx of [-1, 1]) {
    p.add(tube([v3(0, -0.028, 0), v3(sx * 0.02, -0.06, 0), v3(sx * 0.012, -0.1, 0)], 0.004, 4, 3), { color: 0xf6c94a, rough: 0.6, ...sw });
    p.at(0, -0.1, 0.006, 0, 0, sx * 1.9).add(leaf(0.06, 0.03, { bend: 0.6, segs: 2 }), { color: 0xf6c94a, rough: 0.6, ...sw });
  }
  const loop = (th: number): THREE.Vector3 => v3(Math.sin(th) * 0.115, -0.1 - 0.125 * (1 - Math.cos(th)), 0);
  const N = 36;
  for (let i = 0; i < N; i++) {
    const c = loop((i / N) * Math.PI * 2);
    if (i % 6 === 3) {
      p.add(lathe([[0, -0.02], [0.016, -0.012], [0.02, 0.004], [0.012, 0.018], [0, 0.02]], 7), { color: 0xd9283a, rough: 0.6, ...sw }, tr(c.x, c.y, c.z, 0, 0, -(i / N) * Math.PI * 2));
    } else {
      const g = sphere(0.014, 6, 4);
      g.scale(1, 1, 1.1);
      p.add(g, { color: 0xfffaf0, rough: 0.55, jitter: 0.03, ...sw }, tr(c.x, c.y, c.z));
    }
  }
  const b = loop(Math.PI);
  const mg = sphere(0.032, 10, 6);
  mg.scale(1, 0.75, 1);
  p.add(mg, { color: 0xf7a31c, rough: 0.9, ...sw }, tr(b.x, b.y - 0.03, b.z));
  for (const sx of [-1, 1]) {
    let y = b.y - 0.06;
    const x = sx * 0.022;
    for (let i = 0; i < 5; i++) {
      p.add(sphere(0.0115, 6, 4), { color: 0xfffaf0, rough: 0.55, ...sw }, tr(x + sx * i * 0.004, y, 0));
      y -= 0.022;
    }
    p.add(lathe([[0, 0.014], [0.013, 0.006], [0.01, -0.01], [0, -0.016]], 6), { color: 0x9a6bd0, rough: 0.6, ...sw }, tr(x + sx * 0.02, y - 0.004, 0));
    y -= 0.03;
    p.add(lathe([[0, 0.02], [0.02, 0.01], [0.022, -0.008], [0.012, -0.024], [0, -0.028]], 8), { color: 0xd9283a, rough: 0.6, ...sw }, tr(x + sx * 0.022, y - 0.01, 0));
    p.at(x + sx * 0.022, y - 0.035, 0, Math.PI, 0, sx * 0.4).add(leaf(0.05, 0.025, { bend: 0.3, segs: 2 }), { tile: TILE.leaf, color: 0x3f9a4a, rough: 0.5, uv: [0.3, 0.3], ...sw });
  }
  return d.finish();
}

export function windChimes(o: DecorOpts): DecorModel {
  const d = new Decor('wind_chimes', o);
  const p = d.p;
  p.add(torus(0.014, 0.003, 4, 8), { color: PAL.brass, metal: 1, rough: 0.4 }, tr(0, -0.014, 0));
  for (let i = 0; i < 3; i++) p.cord(v3(0, -0.028, 0), v3(Math.sin(i * 2.094) * 0.06, -0.13, Math.cos(i * 2.094) * 0.06), 0, 0.0025);
  p.add(cyl(0.08, 0.08, 0.018, 16), { tile: TILE.woodFine, color: 0x9c6a40, rough: 0.6, uv: [0.3, 0.3] }, tr(0, -0.148, 0));
  p.add(torus(0.08, 0.005, 4, 16), { tile: TILE.rope, color: PAL.rope, rough: 1 }, tr(0, -0.139, 0, Math.PI / 2));
  const tubes: number[] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.sin(a) * 0.06;
    const z = Math.cos(a) * 0.06;
    const len = 0.2 + ((i * 5) % n) * 0.035;
    const bone = d.b.bone(v3(x, -0.148, z));
    tubes.push(bone);
    p.rod(v3(x, -0.148, z), v3(x, -0.2, z), 0.0015, { color: 0xf7f1e3, bone }, 3);
    p.add(cyl(0.011, 0.011, len, 8, true), { color: 0xd9c9a0, metal: 1, rough: 0.28, bone }, tr(x, -0.2 - len, z));
    p.add(torus(0.011, 0.002, 3, 8), { color: 0xb89a5a, metal: 1, rough: 0.3, bone }, tr(x, -0.2, z, Math.PI / 2));
  }
  const clap = d.b.bone(v3(0, -0.148, 0));
  const cs: Surf = { bone: clap };
  p.rod(v3(0, -0.148, 0), v3(0, -0.62, 0), 0.0015, { color: 0xf7f1e3, ...cs }, 3);
  p.add(cyl(0.03, 0.03, 0.012, 12), { tile: TILE.woodFine, color: 0x6e4a2e, rough: 0.6, ...cs }, tr(0, -0.36, 0));
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.05, -0.05, 0.035, -0.11);
  s.quadraticCurveTo(0, -0.15, -0.035, -0.11);
  s.quadraticCurveTo(-0.05, -0.05, 0, 0);
  const sail = extrude(s, 0.006, 0.0015, 8);
  p.add(sail, { tile: TILE.woodFine, color: 0x1fa7a0, rough: 0.5, uv: [0.2, 0.2], ...cs }, tr(0, -0.62, -0.003));
  p.add(sphere(0.006, 5, 4), { color: 0xd9392c, rough: 0.5, ...cs }, tr(0, -0.615, 0));
  const e = new THREE.Euler();
  return d.finish('none', ({ t, bones, env }) => {
    const amp = 0.025 + Math.max(0, env.wind) * 0.2;
    tubes.forEach((b, i) => {
      e.set(Math.sin(t * 2.3 + i * 1.7) * amp, 0, Math.cos(t * 1.9 + i * 2.3) * amp);
      bones[b].quaternion.setFromEuler(e);
    });
    e.set(Math.sin(t * 1.4) * amp * 1.6, Math.sin(t * 0.6) * 0.6, Math.cos(t * 1.1 + 1) * amp * 1.6);
    bones[clap].quaternion.setFromEuler(e);
  });
}
