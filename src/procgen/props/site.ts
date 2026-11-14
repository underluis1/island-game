/** Cantiere notturno animato per la transizione fra le fasi del negozio. */
import * as THREE from 'three';
import { RNG } from '../../core/rng';
import { getPropTextures } from '../textures/props-textures';
import { Batch, Disposer, Pen, type Surf, TILE, type UberMaterial, lathe, makeUber, plane, rbox, sphere, tr, v3 } from './kit';
import { PAL, cardboardBox, toolbox } from './parts';
import type { ConstructionSite } from './shop-types';

const SPARKS = 40;

export function buildConstructionSite(toStage: 2 | 3): ConstructionSite {
  const rng = new RNG(4242 + toStage);
  const tex = getPropTextures(1);
  const D = new Disposer();
  const root = new THREE.Group();
  root.name = `construction-site-${toStage}`;
  const b = new Batch('atlas', rng);
  const cb = new Batch('repeat', rng);
  const A = new Pen(b);
  const hx = toStage === 2 ? 2.7 : 3.4;
  const z0 = toStage === 2 ? -0.75 : -2.4;
  const z1 = toStage === 2 ? 2.0 : 3.1;
  const top = toStage === 2 ? 2.7 : 2.9;
  const bam: Surf = { color: PAL.bamboo, rough: 0.55, jitter: 0.1 };
  const wood: Surf = { tile: TILE.wood, color: PAL.woodPale, rough: 0.9, jitter: 0.12 };

  // impalcatura di bambù: montanti, correnti a due quote, diagonali, legature
  const xs = [-hx, -hx / 3, hx / 3, hx];
  for (const z of [z0, z1])
    for (const x of z === z1 ? [-hx, hx] : xs) {
      A.cane(v3(x, -0.15, z), v3(x + rng.range(-0.03, 0.03), top + rng.range(0, 0.25), z), 0.04, bam, 7);
      for (const y of [1.25, 2.3]) A.lash(v3(x, y, z), 0.05, 'y');
    }
  for (const y of [1.25, 2.3]) {
    A.cane(v3(-hx - 0.3, y, z0 + 0.05), v3(hx + 0.3, y + rng.range(-0.03, 0.03), z0 + 0.05), 0.03, bam);
    for (const x of [-hx, hx]) A.cane(v3(x + 0.05, y + 0.06, z0 - 0.3), v3(x + 0.05, y + 0.06, z1 + 0.3), 0.03, bam);
  }
  A.cane(v3(-hx, 0.1, z0 + 0.06), v3(-hx / 3, 2.3, z0 + 0.06), 0.024, { ...bam, color: PAL.bambooDark });
  A.cane(v3(hx, 0.1, z0 + 0.06), v3(hx / 3, 2.3, z0 + 0.06), 0.024, { ...bam, color: PAL.bambooDark });
  A.cane(v3(-hx + 0.06, 0.1, z1), v3(-hx + 0.06, 2.3, z0), 0.024, { ...bam, color: PAL.bambooDark });
  // tavolato di lavoro in quota
  for (let i = 0; i < 3; i++) A.px(hx * 2 - 0.2, 0.03, 0.2, 0, 1.3, z0 + 0.2 + i * 0.22, wood, 0.004);
  // scala a pioli
  for (const s of [-0.2, 0.2]) A.cane(v3(-hx + 1.0 + s, 0, z0 + 1.0), v3(-hx + 1.0 + s, 2.5, z0 + 0.12), 0.022, bam, 6);
  for (let i = 1; i < 8; i++) A.cane(v3(-hx + 0.78, i * 0.3, z0 + 1.0 - i * 0.1056), v3(-hx + 1.22, i * 0.3, z0 + 1.0 - i * 0.1056), 0.014, bam, 5);

  // teli che ondeggiano
  const tarp = (x: number, y: number, z: number, w: number, h: number, ry: number, color: number): void => {
    const g = plane(w, h, 6, 5);
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 4 + pa.getY(i) * 2) * 0.04);
    g.computeVertexNormals();
    cb.add(g, { color, rough: 0.8, uv: [2, 2], swayFn: (_x, yy) => Math.max(0, (y + h / 2 - yy) / h) * 0.06 }, tr(x, y, z, 0, ry, 0));
  };
  tarp(-hx - 0.06, 1.45, (z0 + z1) / 2, z1 - z0 - 0.3, 1.9, Math.PI / 2, 0x2f73c9);
  tarp(-hx / 3 - hx / 3, 1.85, z0 - 0.02, hx * 0.62, 1.1, 0, 0xf1ede2);
  tarp(hx * 0.67, 1.75, z0 - 0.02, hx * 0.6, 1.3, 0, toStage === 2 ? 0xe8503a : 0x1fa7a0);

  // cataste di assi, sacchi, cassette
  for (let k = 0; k < 4; k++) for (let i = 0; i < 4 - (k > 2 ? 1 : 0); i++) A.px(2.4 + rng.range(-0.1, 0.1), 0.04, 0.17, -1.3 + rng.range(-0.05, 0.05), 0.06 + k * 0.045, z1 + 0.7 + i * 0.18, wood, 0.004);
  for (const z of [z1 + 0.65, z1 + 1.25]) A.px(0.1, 0.04, 0.9, -1.3 + (z > z1 + 1 ? 0.9 : -0.9), 0.02, z1 + 0.95, { ...wood, color: PAL.woodDark }, 0);
  if (toStage === 3) {
    for (let i = 0; i < 5; i++) A.add(rbox(0.6, 0.16, 0.38, 0.06, 2), { tile: TILE.paper, color: 0xcfc8b8, rough: 0.95, uv: [0.5, 0.4] }, tr(-2.6 + (i % 2) * 0.1, 0.08 + Math.floor(i / 2) * 0.16, 1.0 + (i % 2) * 0.42, 0, rng.range(-0.1, 0.1), 0));
    for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) A.add(rbox(0.22, 0.07, 0.105, 0.004), { tile: TILE.terracotta, color: 0xc9694a, rough: 0.95, uv: [0.2, 0.1], jitter: 0.12 }, tr(2.2 + (i % 3) * 0.235, 0.035 + k * 0.072, 1.3 + Math.floor(i / 3) * 0.12 + (k % 2) * 0.02, 0, 0, 0));
  }
  toolbox(A.at(0.9, 0, z1 + 0.5, 0, 0.5, 0), PAL.red);
  cardboardBox(A.at(2.0, 0, 0.2, 0, 0.3, 0), 0.5, 0.36, 0.4);
  // secchio e cono
  A.add(lathe([[0.11, 0], [0.15, 0.26], [0.155, 0.27]], 14), { color: 0x7d858c, metal: 0.8, rough: 0.5 }, tr(1.55, 0, 0.9));
  A.add(lathe([[0.17, 0], [0.17, 0.02], [0.12, 0.03], [0.03, 0.5], [0, 0.5]], 12), { color: 0xf2702a, rough: 0.6 }, tr(-2.2, 0, z1 + 1.9));
  A.add(lathe([[0.085, 0.2], [0.065, 0.3]], 12), { color: PAL.white, rough: 0.6 }, tr(-2.2, 0, z1 + 1.9));

  // cavalletti con asse da segare + sega animata
  const sx0 = 0.6;
  const sz0 = 0.75;
  for (const dx of [-0.55, 0.55]) {
    A.px(0.08, 0.06, 0.7, sx0 + dx, 0.72, sz0, wood, 0.004);
    for (const s of [-1, 1]) for (const t of [-1, 1]) A.beam(v3(sx0 + dx + t * 0.03, 0.7, sz0 + s * 0.3), v3(sx0 + dx + t * 0.22, 0, sz0 + s * 0.34), 0.05, 0.035, wood, 0.004);
  }
  A.px(1.9, 0.045, 0.2, sx0 + 0.2, 0.775, sz0, { ...wood, color: PAL.woodRaw }, 0.004);
  const saw = b.bone(v3(sx0 + 1.0, 0.9, sz0));
  const sawS: Surf = { bone: saw };
  A.add(rbox(0.5, 0.11, 0.004, 0), { ...sawS, color: PAL.steel, metal: 1, rough: 0.35 }, tr(sx0 + 0.9, 0.86, sz0, 0, Math.PI / 2, -0.5));
  A.add(rbox(0.13, 0.12, 0.025, 0.02, 2), { ...sawS, tile: TILE.woodFine, color: PAL.woodHoney }, tr(sx0 + 0.9, 1.02, sz0 + 0.27, 0, Math.PI / 2, -0.5));
  // martello che batte su un picchetto
  const hp = v3(-0.9, 0.62, 0.9);
  A.py(0.62, 0.07, 0.07, hp.x, 0.31, hp.z, wood, 0.006);
  const ham = b.bone(v3(hp.x - 0.42, hp.y + 0.1, hp.z));
  A.add(rbox(0.42, 0.03, 0.03, 0.008), { bone: ham, tile: TILE.woodFine, color: PAL.woodHoney }, tr(hp.x - 0.2, hp.y + 0.1, hp.z));
  A.add(rbox(0.05, 0.12, 0.05, 0.01), { bone: ham, color: PAL.iron, metal: 0.9, rough: 0.45 }, tr(hp.x, hp.y + 0.08, hp.z));

  // lanterna da cantiere appesa che dondola
  const lp = v3(0.2, 2.3, z0 + 0.6);
  A.cane(v3(-hx / 3, 2.36, z0 + 0.6), v3(hx / 3, 2.36, z0 + 0.6), 0.022, bam, 6);
  const lan = b.bone(lp.clone());
  const L: Surf = { bone: lan };
  A.rod(lp.clone(), v3(lp.x, lp.y - 0.5, lp.z), 0.004, { ...L, color: PAL.black });
  A.add(lathe([[0.02, 0], [0.09, -0.03], [0.1, -0.05]], 12), { ...L, color: 0x2f6b4a, rough: 0.5, metal: 0.4 }, tr(lp.x, lp.y - 0.5, lp.z));
  A.add(sphere(0.07, 12, 8), { ...L, color: 0xffc070, glow: 8, rough: 0.3 }, tr(lp.x, lp.y - 0.62, lp.z, 0, 0, 0, 1, 1.15, 1));
  A.add(lathe([[0.1, 0], [0.06, 0.03], [0.02, 0.035]], 12), { ...L, color: 0x2f6b4a, rough: 0.5, metal: 0.4 }, tr(lp.x, lp.y - 0.74, lp.z));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    A.rod(v3(lp.x + Math.cos(a) * 0.09, lp.y - 0.54, lp.z + Math.sin(a) * 0.09), v3(lp.x + Math.cos(a) * 0.09, lp.y - 0.71, lp.z + Math.sin(a) * 0.09), 0.004, { ...L, color: 0x2f6b4a, metal: 0.5 }, 4);
  }

  const mat = D.track(makeUberLocal(tex.atlas));
  const built = b.build(mat, { name: 'site-props' });
  D.mesh(built.mesh);
  root.add(built.mesh);
  const cmat = D.track(makeUberLocal(tex.fabric));
  const cloth = cb.build(cmat, { name: 'site-tarps' });
  D.mesh(cloth.mesh);
  root.add(cloth.mesh);
  const light = new THREE.PointLight(0xffc98a, 12, 10, 2);
  light.position.set(lp.x, lp.y - 0.62, lp.z);
  root.add(light);

  // scintille/segatura
  const pg = D.track(new THREE.BufferGeometry());
  pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
  const pm = D.track(new THREE.PointsMaterial({ color: 0xffd08a, size: 0.035, transparent: true, opacity: 0.85, depthWrite: false }));
  const pts = new THREE.Points(pg, pm);
  pts.frustumCulled = false;
  root.add(pts);
  const seeds = Array.from({ length: SPARKS * 4 }, () => rng.next());
  const zAxis = new THREE.Vector3(0, 0, 1);
  const sawDir = new THREE.Vector3(0, Math.sin(-0.5) * -1, 1).normalize();
  let t = 0;

  const update = (dt: number): void => {
    t += dt;
    for (const m of [mat, cmat]) {
      m.userData.u.uTime.value = t;
      m.userData.u.uWind.value = 0.5;
    }
    mat.userData.u.uGlow.value = 0.92 + 0.08 * Math.sin(t * 13) * Math.sin(t * 7.3);
    const swing = Math.sin(t * 1.7) * 0.22;
    built.bones[lan].quaternion.setFromAxisAngle(zAxis, swing);
    light.position.set(lp.x + Math.sin(swing) * 0.62, lp.y - Math.cos(swing) * 0.62, lp.z);
    built.bones[saw].position.copy(v3(sx0 + 1.0, 0.9, sz0)).addScaledVector(sawDir, Math.sin(t * 7) * 0.12);
    const hit = (t * 1.6) % 1;
    const ang = hit < 0.75 ? (hit / 0.75) * 0.9 : (1 - (hit - 0.75) / 0.25) * 0.9;
    built.bones[ham].quaternion.setFromAxisAngle(zAxis, ang);
    const pa = pg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < SPARKS; i++) {
      const fromSaw = i % 2 === 0;
      const ph = fromSaw ? (t * 1.4 + seeds[i * 4]) % 1 : (hit + 0.25 + seeds[i * 4] * 0.2) % 1;
      const ox = fromSaw ? sx0 + 0.92 : hp.x;
      const oy = fromSaw ? 0.78 : hp.y + 0.02;
      const oz = fromSaw ? sz0 : hp.z;
      const vx = (seeds[i * 4 + 1] - 0.5) * 0.9;
      const vz = (seeds[i * 4 + 2] - 0.5) * 0.9;
      const vy = fromSaw ? 0.3 : 1.2 * seeds[i * 4 + 3];
      pa.setXYZ(i, ox + vx * ph, Math.max(0.01, oy + vy * ph - 2.2 * ph * ph), oz + vz * ph);
    }
    pa.needsUpdate = true;
  };
  update(0);

  return {
    root,
    update,
    dispose: (): void => {
      root.removeFromParent();
      D.dispose();
    },
  };
}

function makeUberLocal(map: THREE.Texture): UberMaterial {
  return makeUber({ map, bump: 0.2, side: THREE.DoubleSide });
}
