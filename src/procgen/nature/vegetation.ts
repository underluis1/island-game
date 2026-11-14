import * as THREE from 'three';
import { RNG } from '../../core/rng';
import { ATLAS } from '../textures/env/palm-atlas';
import { GeoBuilder, addBlob, addTube } from './geo';
import type { FrameBudget } from '../../render/util/async';
import { applyShadowFade } from '../../render/shared';
import type { SharedUniforms } from '../../render/shared';

/**
 * Coconut palms (curved segmented trunk + ribbon fronds with an alpha-cut leaflet texture) and tropical
 * bushes, merged in a single geometry. The extra attribute `aWind` drives the vertex-shader wind:
 *   x = trunk sway weight (m), y = leaf flutter weight, z = phase, w = 1 on leaves (translucency)
 */

export interface PalmSpec {
  x: number;
  z: number;
  height: number;
  /** horizontal offset of the crown relative to the foot (m) */
  leanX: number;
  leanZ: number;
  fronds: number;
  frondLen: number;
  seed: number;
  /** hero palms are kept at every quality level */
  hero: boolean;
}

export interface BushSpec {
  x: number;
  z: number;
  size: number;
  seed: number;
}

const DEG = Math.PI / 180;

function hero(x: number, z: number, height: number, leanX: number, leanZ: number, seed: number, fronds = 19, frondLen = 3.3): PalmSpec {
  return { x, z, height, leanX, leanZ, fronds, frondLen, seed, hero: true };
}

/** Hand-placed palms that compose the default stall view + procedurally scattered ones along the beach. */
export function palmLayout(isFree: (x: number, z: number, margin: number) => boolean, shoreZ: (x: number) => number): PalmSpec[] {
  const list: PalmSpec[] = [
    // left group, leaning out over the beach towards the sea
    hero(-12.2, -6.6, 7.6, -2.6, -5.2, 101, 20, 3.4),
    hero(-15.6, -4.2, 9.4, -1.4, -5.6, 102, 21, 3.6),
    hero(-19.5, -7.8, 6.6, -3.4, -3.6, 103, 18, 3.1),
    hero(-23.5, -3.6, 10.6, 0.8, -4.2, 104, 21, 3.7),
    hero(-10.2, -1.2, 10.2, -1.6, -2.4, 105, 20, 3.5),
    hero(-28.5, -8.5, 8.2, -2.2, -4.6, 106, 19, 3.3),
    // right: one palm leaning hard across the view, two more behind it
    hero(8.4, -10.2, 6.2, -4.2, -5.2, 111, 20, 3.2),
    hero(11.4, -7.6, 8.8, 1.2, -3.8, 112, 20, 3.5),
    hero(9.2, -2.4, 9.8, 0.6, -2.2, 113, 21, 3.6),
    hero(15.5, -10.2, 7.2, 2.6, -4.4, 114, 18, 3.2),
    // behind the pad
    hero(-8.6, 8.4, 10.4, 0.8, 1.0, 121, 20, 3.6),
    hero(7.8, 9.2, 11.2, -0.6, 0.8, 122, 21, 3.7),
    hero(-2.2, 12.5, 12.0, 0.5, -0.8, 123, 21, 3.8),
  ];
  // scattered palms: back of the beach and along both sides
  const rng = new RNG(777);
  let tries = 0;
  while (list.length < 46 && tries < 900) {
    tries++;
    const x = rng.range(-125, 125);
    const sz = shoreZ(x);
    const z = sz + rng.range(11, 46);
    if (!isFree(x, z, 3.5)) continue;
    if (Math.abs(x) < 34 && z < 6.5 && z > sz + 4) {
      // keep the open beach in front of the stall clear, apart from the hero palms
      if (z < 2 || Math.abs(x) < 12) continue;
    }
    let ok = true;
    for (const p of list) {
      if (Math.hypot(p.x - x, p.z - z) < 3.6) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const h = rng.range(7, 13);
    const towardSea = z - sz < 20 ? rng.range(-3.5, -0.8) : rng.range(-1.2, 1.2);
    list.push({
      x,
      z,
      height: h,
      leanX: rng.range(-1.8, 1.8),
      leanZ: towardSea,
      fronds: rng.int(16, 21),
      frondLen: rng.range(3.0, 3.9),
      seed: 1000 + tries,
      hero: false,
    });
  }
  return list;
}

export function bushLayout(palms: readonly PalmSpec[], isFree: (x: number, z: number, margin: number) => boolean, shoreZ: (x: number) => number): BushSpec[] {
  const rng = new RNG(4242);
  const list: BushSpec[] = [];
  // tufts at the foot of some palms
  for (const p of palms) {
    if (rng.chance(0.55)) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.5, 1.4);
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (isFree(x, z, 1.8) && z - shoreZ(x) > 7.5) list.push({ x, z, size: rng.range(0.7, 1.25), seed: rng.int(1, 99999) });
    }
  }
  // undergrowth at the back of the beach
  let tries = 0;
  while (list.length < 80 && tries < 1500) {
    tries++;
    const x = rng.range(-120, 120);
    const sz = shoreZ(x);
    const z = sz + rng.range(22, 52);
    if (!isFree(x, z, 2.5)) continue;
    list.push({ x, z, size: rng.range(0.9, 2.1), seed: rng.int(1, 99999) });
  }
  return list;
}

interface LeafOpts {
  kind: 'frond' | 'leaf';
  length: number;
  azimuth: number;
  /** initial elevation of the rachis (radians) */
  elevation: number;
  /** total downward bend along the length (radians) */
  droop: number;
  tint: readonly [number, number, number];
  sway: number;
  flutter: number;
  phase: number;
  segments: number;
}

/** one ribbon leaf: three vertices per ring (edge, rachis, edge) folded in a shallow V */
function addLeaf(b: GeoBuilder, ox: number, oy: number, oz: number, o: LeafOpts): void {
  const atlas = o.kind === 'frond' ? ATLAS.frond : ATLAS.leaf;
  const aspect = o.kind === 'frond' ? ATLAS.frondAspect : ATLAS.leafAspect;
  const halfW = o.length * aspect;
  const ca = Math.cos(o.azimuth);
  const sa = Math.sin(o.azimuth);
  const sx = -sa;
  const sz = ca;
  let px = ox;
  let py = oy;
  let pz = oz;
  const step = o.length / o.segments;
  let prevRow = -1;
  for (let i = 0; i <= o.segments; i++) {
    const s = i / o.segments;
    const pitch = o.elevation - o.droop * Math.pow(s, 1.55);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    // frond "up" vector (perpendicular to rachis and to the side vector)
    const nx = -ca * sp;
    const ny = cp;
    const nz = -sa * sp;
    const fold = (o.kind === 'frond' ? 20 + 22 * s : 8 + 10 * s) * DEG;
    const cf = Math.cos(fold) * halfW;
    const sf = Math.sin(fold) * halfW;
    const v = 1 - s;
    const e1 = o.flutter * s * s;
    const row = b.vertexCount;
    for (let k = -1; k <= 1; k++) {
      const ak = Math.abs(k);
      const x = px + sx * cf * k - nx * sf * ak;
      const y = py - ny * sf * ak;
      const z = pz + sz * cf * k - nz * sf * ak;
      const u = k < 0 ? atlas.u0 : k > 0 ? atlas.u1 : atlas.uc;
      const id = b.vertex(x, y, z, u, v, o.tint[0], o.tint[1], o.tint[2], o.sway, e1 * (ak > 0 ? 1.25 : 1), o.phase, 1);
      // soft, mostly upward normals: foliage reads as a lit volume instead of flickering cards
      const bx = nx * 0.55 + sx * 0.45 * k;
      const by = ny * 0.55 + 0.6;
      const bz = nz * 0.55 + sz * 0.45 * k;
      const bl = Math.hypot(bx, by, bz) || 1;
      b.normal(id, bx / bl, by / bl, bz / bl);
    }
    if (prevRow >= 0) {
      b.quad(prevRow, prevRow + 1, row + 1, row);
      b.quad(prevRow + 1, prevRow + 2, row + 2, row + 1);
    }
    prevRow = row;
    px += ca * cp * step;
    py += sp * step;
    pz += sa * cp * step;
  }
}

function addPalm(b: GeoBuilder, spec: PalmSpec, groundY: number, detail: boolean): void {
  const rng = new RNG(spec.seed);
  const phase = rng.range(0, 6.28);
  const H = spec.height;
  const pts: THREE.Vector3[] = [];
  const RINGS = detail ? 13 : 9;
  const wob = rng.range(-0.25, 0.25);
  // buried root so a leaning foot never shows its open end
  pts.push(new THREE.Vector3(spec.x - spec.leanX * 0.05, groundY - 0.9, spec.z - spec.leanZ * 0.05));
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    // leans from the foot, then straightens towards the light
    const f = 0.5 * (1 - Math.pow(1 - t, 1.6)) + 0.5 * Math.pow(t, 1.5);
    const side = Math.sin(t * Math.PI) * wob;
    pts.push(new THREE.Vector3(spec.x + spec.leanX * f + side * 0.6, groundY - 0.2 + H * t, spec.z + spec.leanZ * f - side * 0.4));
  }
  const rootT = 1 / (RINGS + 1);
  const r0 = 0.15 + 0.011 * H;
  const swayAmp = 0.05 * H;
  const tone = rng.range(0.82, 1.08);
  addTube(
    b,
    pts,
    (t) => r0 * (1 - 0.42 * t) + 0.17 * Math.exp(-Math.max(0, t - rootT) * 13) + 0.035 * Math.max(0, (t - 0.9) / 0.1),
    detail ? 7 : 5,
    [tone, tone * 0.98, tone * 0.94],
    { u0: ATLAS.bark.u0, u1: ATLAS.bark.u1, vScale: 0.5, ext: (t) => {
        const k = Math.max(0, (t - rootT) / (1 - rootT));
        return [swayAmp * k * k, 0, phase, 0];
      },
    },
  );
  const top = pts[pts.length - 1] as THREE.Vector3;
  const crownY = top.y + 0.1;

  // coconuts
  b.defaultExt = [swayAmp, 0, phase, 0];
  const nuts = detail ? rng.int(2, 6) : rng.int(1, 3);
  for (let i = 0; i < nuts; i++) {
    const a = rng.range(0, Math.PI * 2);
    const green = rng.chance(0.5);
    addBlob(
      b,
      top.x + Math.cos(a) * 0.3,
      crownY - 0.32 - rng.range(0, 0.12),
      top.z + Math.sin(a) * 0.3,
      0.135,
      0.16,
      0.135,
      green ? [0.5, 0.78, 0.3] : [0.62, 0.5, 0.3],
      6,
      4,
      undefined,
      0.875,
      0.01,
    );
  }
  b.defaultExt = [0, 0, 0, 0];

  // fronds: young upright ones first, old drooping ones last
  const N = spec.fronds;
  const az0 = rng.range(0, 6.28);
  for (let k = 0; k < N; k++) {
    const q = k / (N - 1);
    const az = az0 + k * 2.39996 + rng.range(-0.15, 0.15);
    const elevation = (72 - 104 * Math.pow(q, 0.85) + rng.range(-7, 7)) * DEG;
    const droop = (58 + 44 * q + rng.range(-10, 10)) * DEG * (q > 0.8 ? 0.7 : 1);
    const length = spec.frondLen * (1.02 - 0.14 * q) * rng.range(0.9, 1.08);
    const dry = q > 0.86 && rng.chance(0.5);
    const tint: readonly [number, number, number] = dry
      ? [1.25, 0.95, 0.55]
      : [0.86 + 0.2 * (1 - q) + rng.range(-0.05, 0.05), 0.92 + 0.14 * (1 - q), 0.74 + 0.1 * rng.next()];
    addLeaf(b, top.x + Math.cos(az) * 0.09, crownY, top.z + Math.sin(az) * 0.09, {
      kind: 'frond',
      length,
      azimuth: az,
      elevation,
      droop,
      tint,
      sway: swayAmp,
      flutter: 0.2 + 0.1 * length,
      phase: phase + k * 0.9,
      segments: detail ? 9 : 6,
    });
  }
}

function addBush(b: GeoBuilder, spec: BushSpec, groundY: number): void {
  const rng = new RNG(spec.seed);
  const phase = rng.range(0, 6.28);
  const broad = rng.chance(0.45);
  const N = rng.int(7, 10);
  for (let k = 0; k < N; k++) {
    const q = k / (N - 1);
    const az = k * 2.39996 + rng.range(-0.3, 0.3);
    const useLeaf = broad ? rng.chance(0.8) : rng.chance(0.12);
    const length = spec.size * (useLeaf ? rng.range(1.0, 1.7) : rng.range(1.3, 2.3));
    addLeaf(b, spec.x + Math.cos(az) * 0.08, groundY - 0.05, spec.z + Math.sin(az) * 0.08, {
      kind: useLeaf ? 'leaf' : 'frond',
      length,
      azimuth: az,
      elevation: (80 - 62 * q + rng.range(-8, 8)) * DEG,
      droop: (useLeaf ? 55 : 70) * DEG * rng.range(0.7, 1.2),
      tint: [0.8 + rng.range(-0.08, 0.1), 0.92 + rng.range(-0.06, 0.1), 0.72 + rng.range(-0.05, 0.1)],
      sway: 0.02,
      flutter: 0.12 + 0.05 * length,
      phase: phase + k,
      segments: useLeaf ? 4 : 5,
    });
  }
}

export interface VegetationResult {
  /** palms and bushes close to the stall: detailed, cast shadows */
  near: THREE.BufferGeometry;
  /** everything else: lighter geometry, no shadow pass */
  far: THREE.BufferGeometry;
  palms: PalmSpec[];
  bushes: BushSpec[];
}

const NEAR_RADIUS = 34;

export async function buildVegetation(
  opts: {
    density: number;
    heightAt: (x: number, z: number) => number;
    isFree: (x: number, z: number, margin: number) => boolean;
    shoreZ: (x: number) => number;
  },
  budget: FrameBudget,
): Promise<VegetationResult> {
  const near = new GeoBuilder('aWind');
  const far = new GeoBuilder('aWind');
  const allPalms = palmLayout(opts.isFree, opts.shoreZ);
  const allBushes = bushLayout(allPalms, opts.isFree, opts.shoreZ);
  const rng = new RNG(31337);
  const palms = allPalms.filter((p) => p.hero || rng.next() < opts.density);
  const bushes = allBushes.filter(() => rng.next() < opts.density);
  for (const p of palms) {
    const isNear = p.hero || Math.hypot(p.x, p.z) < NEAR_RADIUS;
    addPalm(isNear ? near : far, p, opts.heightAt(p.x, p.z), isNear);
    await budget.tick();
  }
  let n = 0;
  for (const s of bushes) {
    addBush(Math.hypot(s.x, s.z) < NEAR_RADIUS ? near : far, s, opts.heightAt(s.x, s.z));
    if ((n++ & 3) === 0) await budget.tick();
  }
  await budget.yield();
  const nearGeo = near.build();
  await budget.yield();
  const farGeo = far.build();
  return { near: nearGeo, far: farGeo, palms, bushes };
}

const WIND_VERT_PARS = /* glsl */ `
attribute vec4 aWind;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
varying float vLeaf;
varying vec3 vFolWorld;
`;

const WIND_VERT = /* glsl */ `
{
  float ph = aWind.z;
  float gust = sin(uTime * 0.83 + ph) * 0.6 + sin(uTime * 1.71 + ph * 1.7 + transformed.x * 0.07) * 0.4;
  float lean = 0.45 + 0.55 * gust;
  transformed.xz += uWindDir * (aWind.x * lean * uWindStrength);
  float fl = aWind.y * uWindStrength;
  float f1 = sin(uTime * 2.6 + ph * 3.1 + transformed.y * 0.9);
  float f2 = sin(uTime * 4.3 + ph * 5.3 + transformed.x * 1.3 + transformed.z * 1.1);
  transformed.y += fl * (f1 * 0.7 + f2 * 0.3) * (0.6 + 0.4 * gust);
  transformed.xz += uWindDir * fl * (0.55 + 0.45 * f2);
  vLeaf = aWind.w;
  vFolWorld = transformed;
}
`;

export interface FoliageMaterials {
  material: THREE.MeshStandardMaterial;
  depthMaterial: THREE.MeshDepthMaterial;
}

export function createFoliageMaterials(atlas: THREE.Texture, shared: SharedUniforms): FoliageMaterials {
  const material = new THREE.MeshStandardMaterial({
    name: 'Foliage',
    map: atlas,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
  });
  const bind = (shader: { uniforms: Record<string, THREE.IUniform> }): void => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWindDir = shared.uWindDir;
    shader.uniforms.uWindStrength = shared.uWindStrength;
  };
  material.onBeforeCompile = (shader) => {
    bind(shader);
    shader.uniforms.uLightDir = shared.uLightDir;
    shader.uniforms.uLightColor = shared.uLightColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLeaf;\nvarying vec3 vFolWorld;\nuniform vec3 uLightDir;\nuniform vec3 uLightColor;')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        float folDist = distance(cameraPosition, vFolWorld);
        // thin leaflets would dissolve in the mip chain: thicken the cut-out with distance
        diffuseColor.a *= 1.0 + smoothstep(10.0, 70.0, folDist) * 1.1;`,
      )
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `#include <lights_fragment_end>
        {
          // light shining through the leaves when looking towards the sun
          vec3 viewDir = normalize(vFolWorld - cameraPosition);
          float through = pow(max(dot(viewDir, uLightDir), 0.0), 3.0);
          reflectedLight.directDiffuse += diffuseColor.rgb * uLightColor * vec3(0.75, 1.0, 0.35) * through * 0.16 * vLeaf;
        }`,
      );
    applyShadowFade(shader, shared);
  };
  material.customProgramCacheKey = () => 'foliage';

  const depthMaterial = new THREE.MeshDepthMaterial({ map: atlas, alphaTest: 0.4 });
  depthMaterial.onBeforeCompile = (shader) => {
    bind(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_VERT}`);
  };
  depthMaterial.customProgramCacheKey = () => 'foliage-depth';
  return { material, depthMaterial };
}
