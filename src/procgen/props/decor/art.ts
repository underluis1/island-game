/** Poster con arte procedurale. */
import * as THREE from 'three';
import { type PosterKind, paintPoster } from '../../textures/props-art';
import { TILE, canvasTexture, cyl, rbox, tr, v3 } from '../kit';
import { PAL } from '../parts';
import type { DecorModel } from '../shop-types';
import { Decor, type DecorOpts } from './decor-kit';

const W = 0.5;
const H = 0.7;

function poster(id: string, kind: PosterKind, mount: 'frame' | 'scroll' | 'tape', o: DecorOpts): DecorModel {
  const d = new Decor(id, o);
  const p = d.p;
  const tex = d.D.track(canvasTexture(512, 720, (c, w, h) => paintPoster(kind, c, w, h)));
  let z: number;
  if (mount === 'frame') {
    z = 0.022;
    const fr = { tile: TILE.woodFine, color: 0x6e4a2e, rough: 0.55 } as const;
    p.add(rbox(W + 0.06, H + 0.06, 0.016, 0.004), { tile: TILE.paper, color: 0xf2e9d6, rough: 0.9, uv: [0.5, 0.5] }, tr(0, 0, 0.01));
    for (const sy of [-1, 1]) p.add(rbox(W + 0.11, 0.035, 0.035, 0.008), fr, tr(0, sy * (H / 2 + 0.035), 0.0175));
    for (const sx of [-1, 1]) p.add(rbox(H + 0.04, 0.035, 0.035, 0.008), fr, tr(sx * (W / 2 + 0.035), 0, 0.0175, 0, 0, Math.PI / 2));
    p.add(cyl(0.006, 0.006, 0.02, 6), { color: PAL.iron, metal: 0.9, rough: 0.5 }, tr(0, H / 2 + 0.09, 0, Math.PI / 2));
    p.cord(v3(-0.15, H / 2 + 0.05, 0.01), v3(0, H / 2 + 0.09, 0.012), 0, 0.002);
    p.cord(v3(0.15, H / 2 + 0.05, 0.01), v3(0, H / 2 + 0.09, 0.012), 0, 0.002);
  } else if (mount === 'scroll') {
    z = 0.012;
    for (const sy of [-1, 1]) {
      p.cane(v3(-W / 2 - 0.05, sy * (H / 2 + 0.012), 0.014), v3(W / 2 + 0.05, sy * (H / 2 + 0.012), 0.014), 0.014, { color: PAL.bamboo, rough: 0.5 });
    }
    p.add(rbox(W, H, 0.002, 0), { tile: TILE.paper, color: 0xf2e9d6, rough: 0.9, uv: [0.5, 0.5] }, tr(0, 0, 0.01));
    p.cord(v3(-W / 2 - 0.02, H / 2 + 0.02, 0.014), v3(0, H / 2 + 0.16, 0.006), 0, 0.004);
    p.cord(v3(W / 2 + 0.02, H / 2 + 0.02, 0.014), v3(0, H / 2 + 0.16, 0.006), 0, 0.004);
    p.add(cyl(0.007, 0.007, 0.02, 6), { color: PAL.iron, metal: 0.9, rough: 0.5 }, tr(0, H / 2 + 0.16, 0, Math.PI / 2));
    for (const sx of [-1, 1]) p.add(rbox(0.012, 0.07, 0.012, 0.004), { tile: TILE.rope, color: 0xd9392c, rough: 1 }, tr(sx * (W / 2 + 0.04), -H / 2 - 0.05, 0.014));
  } else {
    z = 0.004;
    p.add(rbox(W + 0.012, H + 0.012, 0.002, 0), { tile: TILE.paper, color: 0xf7f1e3, rough: 0.9, uv: [0.5, 0.5] }, tr(0, 0, 0.002));
    const tapes = [0xf6c94a, 0x40c9c1, 0xf08fa8, 0xf6c94a];
    let k = 0;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) p.add(rbox(0.11, 0.032, 0.001, 0), { tile: TILE.paper, color: tapes[k++], rough: 0.7, uv: [0.2, 0.1] }, tr(sx * (W / 2 - 0.01), sy * (H / 2 - 0.01), 0.0052, 0, 0, -sx * sy * 0.78));
  }
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
  face.position.set(0, 0, z);
  d.extra(face);
  return d.finish();
}

export const posterSunset = (o: DecorOpts): DecorModel => poster('poster_sunset', 'sunset', 'frame', o);
export const posterLongtail = (o: DecorOpts): DecorModel => poster('poster_longtail', 'longtail', 'scroll', o);
export const posterRepair = (o: DecorOpts): DecorModel => poster('poster_repair', 'repair', 'tape', o);
