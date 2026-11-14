/** Tappeti e fontanella. */
import { type Surf, TILE, lathe, leaf, sphere, torus, tr, tube, v3 } from '../kit';
import type { DecorModel } from '../shop-types';
import { AY, Decor, type DecorOpts, flower } from './decor-kit';

export function rugWoven(o: DecorOpts): DecorModel {
  const d = new Decor('rug_woven', o);
  const p = d.p;
  const C = { cream: 0xeadfc4, coral: 0xe8654f, teal: 0x1f9a94, sun: 0xf0b93a, navy: 0x2a4a70 };
  const bands: Array<[number, number]> = [
    [0.1, C.coral],
    [0.03, C.cream],
    [0.05, C.teal],
    [0.14, C.cream],
    [0.04, C.sun],
    [0.08, C.navy],
    [0.04, C.sun],
    [0.1, C.cream],
    [0.28, C.coral],
    [0.1, C.cream],
    [0.04, C.sun],
    [0.08, C.navy],
    [0.04, C.sun],
    [0.14, C.cream],
    [0.05, C.teal],
    [0.03, C.cream],
    [0.1, C.coral],
  ];
  let x = -0.72;
  for (const [w, c] of bands) {
    p.box(w, 0.012, 1.0, x + w / 2, 0.006, 0, { tile: TILE.mat, color: c, rough: 1, uv: [Math.min(1, w * 2), 1], rot: true, jitter: 0.04 }, 0.003);
    x += w;
  }
  // rombi sulla fascia centrale e sulle fasce chiare
  for (let i = 0; i < 7; i++) {
    const z = -0.42 + i * 0.14;
    p.at(0, 0.0125, z, 0, Math.PI / 4, 0).box(0.085, 0.004, 0.085, 0, 0, 0, { tile: TILE.mat, color: C.cream, rough: 1, uv: [0.1, 0.1] }, 0);
    p.at(0, 0.014, z, 0, Math.PI / 4, 0).box(0.04, 0.004, 0.04, 0, 0, 0, { tile: TILE.mat, color: C.teal, rough: 1, uv: [0.1, 0.1] }, 0);
    for (const sx of [-1, 1]) p.at(sx * 0.4, 0.0125, z + 0.07 * (i % 2 ? 1 : -1) * 0, 0, Math.PI / 4, 0).box(0.05, 0.004, 0.05, 0, 0, 0, { tile: TILE.mat, color: i % 2 ? C.coral : C.teal, rough: 1, uv: [0.1, 0.1] }, 0);
  }
  for (const sx of [-1, 1])
    for (let i = 0; i < 34; i++) {
      const z = -0.49 + i * 0.03;
      p.box(0.07, 0.004, 0.012, sx * (0.75 + 0.03) + d.rng.range(-0.005, 0.005), 0.003, z, { tile: TILE.rope, color: C.cream, rough: 1, uv: [0.1, 0.05] }, 0);
    }
  return d.finish();
}

export function rugRound(o: DecorOpts): DecorModel {
  const d = new Decor('rug_round', o);
  const p = d.p;
  const cols = [0xf6e2b0, 0xf6e2b0, 0x2fc4bc, 0xf6e2b0, 0xf6e2b0, 0xff7a60, 0xf6e2b0, 0xf6e2b0, 0x2fc4bc, 0xf6e2b0, 0xffcf4a, 0xf6e2b0];
  p.cy(0.05, 0.05, 0.014, 0, 0, 0, { tile: TILE.rope, color: cols[0], rough: 1, uv: [0.2, 0.2] }, 10);
  for (let i = 1; i <= 12; i++) {
    const R = 0.04 + i * 0.056;
    p.add(torus(R, 0.03, 4, Math.max(14, Math.round(R * 44))), { tile: TILE.rope, color: cols[i % cols.length], rough: 1, uv: [1, 0.25], jitter: 0.05 }, tr(0, 0.006, 0, Math.PI / 2, 0, i * 0.4, 1, 1, 0.4));
  }
  // nappine
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    p.at(Math.sin(a) * 0.76, 0.004, Math.cos(a) * 0.76, 0, a, 0).box(0.02, 0.006, 0.07, 0, 0, 0, { tile: TILE.rope, color: 0xeadfc4, rough: 1, uv: [0.05, 0.1] }, 0);
  }
  return d.finish();
}

export function fountain(o: DecorOpts): DecorModel {
  const d = new Decor('fountain', o);
  const p = d.p;
  const stone: Surf = { tile: TILE.stone, color: 0xbdb5a6, rough: 0.9, uv: [1, 0.6] };
  p.add(lathe([[0, 0], [0.44, 0], [0.46, 0.03], [0.4, 0.07], [0.43, 0.16], [0.47, 0.25], [0.48, 0.3], [0.43, 0.3], [0.4, 0.2], [0, 0.18]], 24), stone);
  p.add(lathe([[0.1, 0.18], [0.07, 0.24], [0.055, 0.4], [0.07, 0.52], [0.05, 0.56], [0.2, 0.66], [0.25, 0.72], [0.26, 0.76], [0.22, 0.76], [0.19, 0.7], [0, 0.68]], 18), stone);
  p.add(lathe([[0.035, 0.68], [0.03, 0.8], [0.05, 0.84], [0.035, 0.9], [0, 0.92]], 10), stone);
  const water: Surf = { color: 0x4fc3d9, rough: 0.05, metal: 0.25, glow: 0.12 };
  p.cy(0.415, 0.415, 0.004, 0, 0.262, 0, water, 24);
  p.cy(0.215, 0.215, 0.004, 0, 0.74, 0, water, 18);
  // zampilli su osso rotante e bolla in cima
  const spin = d.b.bone(v3(0, 0.74, 0));
  const jet: Surf = { color: 0xbfeaf5, rough: 0.05, glow: 0.35, bone: spin, sway: 0.004 };
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    p.add(tube([v3(dx * 0.24, 0.755, dz * 0.24), v3(dx * 0.3, 0.74, dz * 0.3), v3(dx * 0.34, 0.55, dz * 0.34), v3(dx * 0.355, 0.27, dz * 0.355)], 0.007, 4, 4), jet);
    p.add(torus(0.03, 0.004, 3, 8), { ...jet, glow: 0.2 }, tr(dx * 0.355, 0.266, dz * 0.355, Math.PI / 2));
  }
  const bob = d.b.bone(v3(0, 0.92, 0));
  p.add(lathe([[0, 0.9], [0.03, 0.92], [0.02, 0.97], [0, 1.0]], 8), { color: 0xd9f4fa, rough: 0.05, glow: 0.4, bone: bob });
  // ninfee galleggianti
  const lily = d.b.bone(v3(0, 0.265, 0));
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.5;
    const q = p.at(Math.sin(a) * 0.28, 0.268, Math.cos(a) * 0.28, 0, a, 0).surf({ bone: lily });
    q.cy(0.07, 0.07, 0.003, 0, 0, 0, { tile: TILE.leaf, color: 0x3f9a4a, rough: 0.5, uv: [0.4, 0.4] }, 10);
    if (i < 2) {
      flower(q.at(0.01, 0.004, 0), 0.05, i ? 0xf7f1e3 : 0xf08fa8, 0xf6c94a, { bone: lily }, 7);
      flower(q.at(0.01, 0.012, 0, 0, 0.4, 0), 0.032, i ? 0xf7f1e3 : 0xf8b6c8, 0xf6c94a, { bone: lily }, 6);
    }
  }
  // muschio e sassi alla base
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    const g = sphere(0.05 + (i % 3) * 0.015, 7, 5);
    g.scale(1, 0.6, 1);
    p.add(g, { tile: TILE.stone, color: i % 2 ? 0x9a9488 : 0xcfc8ba, rough: 1, uv: [0.3, 0.3] }, tr(Math.sin(a) * 0.5, 0.02, Math.cos(a) * 0.5));
  }
  p.at(0.44, 0.02, 0.22, 0, 1.1, 0).add(leaf(0.22, 0.05, { bend: 0.9, segs: 4 }), { tile: TILE.leaf, color: 0x3f9a4a, rough: 0.5, uv: [0.5, 0.5], sway: 0.01 });
  p.at(0.46, 0.02, 0.2, 0, 0.3, 0).add(leaf(0.18, 0.045, { bend: 0.7, segs: 4 }), { tile: TILE.leaf, color: 0x4fae52, rough: 0.5, uv: [0.5, 0.5], sway: 0.01 });
  return d.finish('none', ({ t, bones, rest }) => {
    bones[spin].quaternion.setFromAxisAngle(AY, t * 0.25);
    bones[bob].position.y = rest[bob].y + 0.012 * Math.sin(t * 6);
    bones[bob].scale.set(1 + 0.15 * Math.sin(t * 7.3), 1 + 0.2 * Math.sin(t * 5.1 + 1), 1 + 0.15 * Math.cos(t * 6.7));
    bones[lily].quaternion.setFromAxisAngle(AY, -t * 0.08);
    bones[lily].position.y = rest[lily].y + 0.003 * Math.sin(t * 2);
  });
}
