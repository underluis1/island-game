/**
 * Negozio in tre fasi (bancarella → chiosco → negozio), interamente procedurale.
 * Convenzioni: metri, Y su, origine = centro del tappetino (piano banco a y=0.90), mare verso -Z.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getPropTextures } from '../textures/props-textures';
import { Disposer, type Pen, type UberMaterial, makeUber } from './kit';
import { createCtx } from './shop-ctx';
import type { ShopBuild, ShopEnv, ShopOptions } from './shop-types';
import { paintSign } from './signs';
import { buildStage1 } from './stage1';
import { buildStage2 } from './stage2';
import { buildStage3 } from './stage3';

export type { ConstructionSite, DecorModel, Rect, ShopAnchors, ShopBuild, ShopEnv, ShopInteractables, ShopOptions, ShopUpgrades } from './shop-types';
export { buildConstructionSite } from './site';

const DRIPS = 56;

export function buildShop(opts: ShopOptions): ShopBuild {
  const c = createCtx(opts);
  if (opts.stage === 1) buildStage1(c);
  else if (opts.stage === 2) buildStage2(c);
  else buildStage3(c);

  const tex = getPropTextures(opts.textureScale);
  const D = new Disposer();
  const root = new THREE.Group();
  root.name = `shop-stage${opts.stage}`;
  const mats = {
    atlas: makeUber({ map: tex.atlas, bump: 0.2, side: THREE.DoubleSide }),
    wood: makeUber({ map: tex.wood, bump: 0.25 }),
    thatch: makeUber({ map: tex.thatch, bump: 0.5, side: THREE.DoubleSide }),
    plaster: makeUber({ map: tex.plaster, bump: 0.15 }),
    cloth: makeUber({ map: tex.fabric, bump: 0.1, side: THREE.DoubleSide }),
    glow: makeUber({ map: tex.atlas, bump: 0 }),
    lamp: makeUber({ map: tex.atlas, bump: 0, side: THREE.DoubleSide }),
  };
  const ubers: UberMaterial[] = Object.values(mats);
  ubers.forEach((m) => D.track(m));
  mats.glow.userData.u.uGlow.value = 0;
  const glass = D.track(
    new THREE.MeshPhysicalMaterial({ color: 0xd4f2f2, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 }),
  );

  const make = (pen: Pen, mat: THREE.Material, name: string, cast = true, receive = true): THREE.Mesh | null => {
    if (pen.b.empty) return null;
    const built = pen.b.build(mat, { cast, receive, name });
    D.mesh(built.mesh);
    built.mesh.userData.bones = built.bones;
    return built.mesh;
  };
  const addStatic = (pen: Pen, mat: THREE.Material, name: string, cast = true, receive = true): void => {
    const m = make(pen, mat, name, cast, receive);
    if (m) root.add(m);
  };
  addStatic(c.wood, mats.wood, 'shop-wood');
  addStatic(c.atlas, mats.atlas, 'shop-props');
  addStatic(c.thatch, mats.thatch, 'shop-roof');
  addStatic(c.plaster, mats.plaster, 'shop-walls');
  addStatic(c.cloth, mats.cloth, 'shop-awning');
  addStatic(c.glow, mats.glow, 'shop-lights', false, false);
  const glassMesh = make(c.glass, glass, 'shop-glass', false, false);
  if (glassMesh) {
    glassMesh.renderOrder = 2;
    root.add(glassMesh);
  }

  const inter = (pen: Pen, mat: THREE.Material, name: string): THREE.Object3D => {
    const m = make(pen, mat, name) ?? new THREE.Group();
    m.name = name;
    root.add(m);
    return m;
  };
  const radio = inter(c.radio, mats.atlas, 'radio');
  const fan = inter(c.fan, mats.atlas, 'fan');
  const lamp = inter(c.lamp, mats.lamp, 'lamp');
  const rack = inter(c.rack, mats.atlas, 'rack');
  const tablet = inter(c.tablet, mats.atlas, 'tablet');

  // insegna: cornice + facce con testo su canvas
  const sign = new THREE.Group();
  sign.name = 'sign';
  const frame = make(c.signFrame, mats.atlas, 'sign-frame');
  if (frame) sign.add(frame);
  const signTex = D.track(paintSign(c.signStyle, opts.shopName, c.signStyle === 'lightbox' ? opts.accentColor : opts.awningColor));
  const lightbox = c.signStyle === 'lightbox';
  const signMat = D.track(
    new THREE.MeshStandardMaterial({ map: signTex, roughness: lightbox ? 0.35 : 0.85, metalness: 0, emissive: lightbox ? 0xffffff : 0x000000, emissiveMap: lightbox ? signTex : null, emissiveIntensity: 0.3 }),
  );
  if (c.signFaces.length > 0) {
    const faces = c.signFaces.map((f) => {
      const g = new THREE.PlaneGeometry(f.w, f.h);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, f.uv[0] + uv.getX(i) * (f.uv[2] - f.uv[0]), f.uv[1] + uv.getY(i) * (f.uv[3] - f.uv[1]));
      g.applyMatrix4(f.m);
      return g;
    });
    const merged = mergeGeometries(faces);
    faces.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, signMat);
    mesh.name = 'sign-face';
    mesh.receiveShadow = true;
    D.mesh(mesh);
    sign.add(mesh);
  }
  root.add(sign);

  // luci
  const lampLight = new THREE.PointLight(0xffe2b4, 1.4, 3.5, 2);
  lampLight.position.copy(c.lampPos);
  lampLight.name = 'lamp-light';
  root.add(lampLight);
  const locals: Array<{ light: THREE.Light; full: number }> = [];
  for (const l of c.lights.slice(0, 2)) {
    let light: THREE.PointLight | THREE.SpotLight;
    if (l.kind === 'spot') {
      const s = new THREE.SpotLight(l.color, 0, l.distance, l.angle ?? 0.7, 0.6, 2);
      s.target.position.copy(l.target ?? new THREE.Vector3());
      root.add(s.target);
      light = s;
    } else {
      light = new THREE.PointLight(l.color, 0, l.distance, 2);
    }
    light.position.copy(l.pos);
    light.visible = false;
    root.add(light);
    locals.push({ light, full: l.intensity });
  }

  // gocce di pioggia dal bordo del tendone/tetto
  let drips: THREE.Points | null = null;
  const dripSeed: number[] = [];
  if (c.dripEdges.length > 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(DRIPS * 3), 3));
    for (let i = 0; i < DRIPS; i++) dripSeed.push(c.rng.next(), c.rng.next(), c.rng.next());
    const pm = D.track(new THREE.PointsMaterial({ color: 0xd8eeff, size: 0.035, transparent: true, opacity: 0.75, depthWrite: false, sizeAttenuation: true }));
    drips = new THREE.Points(g, pm);
    drips.frustumCulled = false;
    drips.visible = false;
    drips.name = 'shop-drips';
    D.track(g);
    root.add(drips);
  }

  const fanBones = (fan.userData.bones ?? []) as THREE.Bone[];
  const yAxis = new THREE.Vector3(0, 1, 0);
  let time = 0;
  let spin = 0;
  let glowLevel = 0;

  const update = (dt: number, env: ShopEnv): void => {
    time += dt;
    const wind = 0.12 + Math.max(0, env.wind) * 1.1;
    for (const m of ubers) {
      m.userData.u.uTime.value = time;
      m.userData.u.uWind.value = wind;
    }
    glowLevel += ((env.lampsOn ? 1 : 0) - glowLevel) * Math.min(1, dt * 4);
    mats.glow.userData.u.uGlow.value = glowLevel * (0.96 + 0.04 * Math.sin(time * 9.0));
    mats.lamp.userData.u.uGlow.value = lampLight.visible && lampLight.intensity > 0.01 ? 1 : 0.03;
    for (const l of locals) {
      l.light.intensity = l.full * glowLevel;
      l.light.visible = glowLevel > 0.01;
    }
    if (lightbox) signMat.emissiveIntensity = 0.3 + glowLevel * 1.5;
    if (c.fanRig && fanBones.length > 0) {
      spin += dt * 24;
      fanBones[c.fanRig.spin].quaternion.setFromAxisAngle(c.fanRig.axis, spin);
      fanBones[c.fanRig.osc].quaternion.setFromAxisAngle(yAxis, Math.sin(time * 0.55) * 0.45);
    }
    if (c.acRig && fanBones.length > 0) fanBones[c.acRig.flap].quaternion.setFromAxisAngle(c.acRig.axis, 0.2 + Math.sin(time * 0.5) * 0.25);
    if (drips) {
      drips.visible = env.rain > 0.02;
      if (drips.visible) {
        const pos = drips.geometry.attributes.position as THREE.BufferAttribute;
        const active = Math.ceil(DRIPS * Math.min(1, env.rain * 1.5));
        for (let i = 0; i < DRIPS; i++) {
          const edge = c.dripEdges[i % c.dripEdges.length];
          const u = dripSeed[i * 3];
          const ph = (time * (0.8 + dripSeed[i * 3 + 1] * 0.5) + dripSeed[i * 3 + 2]) % 1;
          const y0 = edge[0].y + (edge[1].y - edge[0].y) * u;
          const y = i < active ? Math.max(0.02, y0 - ph * ph * (y0 + 0.4)) : -5;
          pos.setXYZ(i, edge[0].x + (edge[1].x - edge[0].x) * u, y, edge[0].z + (edge[1].z - edge[0].z) * u);
        }
        pos.needsUpdate = true;
      }
    }
  };

  return {
    root,
    update,
    decorArea: c.decorArea,
    blocked: c.blocked,
    wallSlots: c.wallSlots,
    hangSlots: c.hangSlots,
    shelfSlots: c.shelfSlots,
    deviceSlots: c.deviceSlots,
    rackSlots: c.rackSlots,
    anchors: c.anchors,
    interactables: { radio, fan, lamp, sign, rack, tablet },
    lampLight,
    floorHeightAt: (x: number, z: number): number => {
      const f = c.floor;
      return f && x >= f.area.minX && x <= f.area.maxX && z >= f.area.minZ && z <= f.area.maxZ ? f.y : 0;
    },
    dispose: (): void => {
      root.removeFromParent();
      D.dispose();
    },
  };
}
