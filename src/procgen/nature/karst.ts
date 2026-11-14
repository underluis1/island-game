import * as THREE from 'three';
import { fbm3, smoothstep } from '../../render/util/noise';
import type { FrameBudget } from '../../render/util/async';
import type { SharedUniforms } from '../../render/shared';

/**
 * Limestone karst towers (Phi Phi style): sheer striated walls, undercut notch at sea level, rounded tops
 * smothered in jungle. All towers are merged in one geometry / one draw call.
 */

export interface KarstTower {
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** rotation of the footprint ellipse (radians) */
  rot: number;
  h: number;
  seed: number;
  segs: number;
  rings: number;
}

const far = (x: number, z: number, rx: number, rz: number, h: number, seed: number, rot = 0): KarstTower => ({ x, z, rx, rz, rot, h, seed, segs: 44, rings: 24 });
const big = (x: number, z: number, rx: number, rz: number, h: number, seed: number, rot = 0): KarstTower => ({ x, z, rx, rz, rot, h, seed, segs: 60, rings: 30 });
const small = (x: number, z: number, rx: number, rz: number, h: number, seed: number, rot = 0): KarstTower => ({ x, z, rx, rz, rot, h, seed, segs: 34, rings: 18 });

export const KARST_TOWERS: readonly KarstTower[] = [
  // The default camera only sees ~11° of sky above the horizon, so everything that should read as an
  // island silhouette keeps height / distance below ~0.15; only the headlands tower out of frame.
  // far ridge, left of the sunset corridor
  far(-212, -416, 46, 27, 50, 11, 0.2),
  far(-266, -430, 60, 30, 63, 12, -0.15),
  far(-330, -422, 50, 28, 45, 13, 0.3),
  far(-388, -404, 40, 26, 33, 14, 0.6),
  // far ridge, right of the corridor
  far(-46, -434, 44, 26, 44, 21, 0.25),
  far(12, -440, 56, 27, 58, 22, -0.1),
  far(72, -428, 42, 26, 39, 23, 0.2),
  far(128, -412, 34, 24, 27, 24, -0.3),
  // mid-distance islands
  far(-150, -236, 30, 20, 30, 31, 0.3),
  far(-180, -244, 24, 17, 21, 32, -0.2),
  far(44, -252, 26, 18, 27, 33, 0.4),
  far(70, -260, 19, 15, 18, 34, 0.1),
  // sea stacks inside the bay
  small(-63, -120, 7.6, 6.2, 12.5, 41, 0.5),
  small(-73.5, -126, 3.8, 3.1, 6.2, 42, 0.1),
  small(31, -152, 7.2, 6, 10.5, 43, -0.6),
  // left headland (frames the default view)
  big(-124, -71, 25, 29, 56, 51, 0.2),
  big(-158, -44, 40, 31, 74, 52, -0.4),
  big(-186, -4, 46, 38, 62, 53, 0.3),
  // right headland
  big(128, -62, 30, 28, 56, 61, 0.4),
  big(166, -31, 42, 34, 76, 62, -0.2),
  big(194, 10, 46, 38, 60, 63, 0.1),
];

const NOTCH = 0.93;

/** horizontal radius of the footprint in direction `theta` (tower-local angle) */
function footprintRadius(t: KarstTower, theta: number): number {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const ellipse = (t.rx * t.rz) / Math.sqrt(t.rz * c * (t.rz * c) + t.rx * s * (t.rx * s));
  const n = fbm3(c * 1.1 + t.seed * 3.1, s * 1.1 - t.seed * 1.7, t.seed * 0.37, 3, t.seed);
  return ellipse * (0.78 + 0.5 * n);
}

/**
 * Sea-bed elevation of the rocky shelf around the towers (−Infinity away from them): gives the sea shader
 * a pale shallow ring and foam at the foot of the cliffs.
 */
export function karstShelf(x: number, z: number, seaLevel: number): number {
  let best = -Infinity;
  for (let i = 0; i < KARST_TOWERS.length; i++) {
    const t = KARST_TOWERS[i] as KarstTower;
    const dx = x - t.x;
    const dz = z - t.z;
    const reach = Math.max(t.rx, t.rz) * 1.35 + 14;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    const cr = Math.cos(t.rot);
    const sr = Math.sin(t.rot);
    const lx = dx * cr + dz * sr;
    const lz = -dx * sr + dz * cr;
    const d = Math.hypot(lx, lz);
    const edge = footprintRadius(t, Math.atan2(lz, lx)) * NOTCH;
    const out = d - edge;
    const h = seaLevel + 1.2 - Math.max(out + 1.5, 0) * 0.55;
    if (h > best) best = h;
  }
  return best;
}

function profile(yn: number): number {
  // yn: 0 at sea level … 1 at the summit
  if (yn < 0.012) return NOTCH;
  if (yn < 0.05) return NOTCH + (1.035 - NOTCH) * smoothstep(0.012, 0.05, yn);
  if (yn < 0.6) return 1.035 - 0.17 * ((yn - 0.05) / 0.55);
  const k = (yn - 0.6) / 0.4;
  return 0.865 * Math.pow(Math.max(0, 1 - k * k), 0.62);
}

export async function buildKarstGeometry(seaLevel: number, budget: FrameBudget): Promise<THREE.BufferGeometry> {
  let vTotal = 0;
  let iTotal = 0;
  for (const t of KARST_TOWERS) {
    vTotal += (t.segs + 1) * (t.rings + 1);
    iTotal += t.segs * t.rings * 6;
  }
  const pos = new Float32Array(vTotal * 3);
  const nrm = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const ext = new Float32Array(vTotal * 4);
  const index = new Uint32Array(iTotal);
  let vOff = 0;
  let iOff = 0;

  const computeNormals = (base: number, cols: number, rows: number, segs: number): void => {
    for (let j = 0; j < rows; j++) {
      const j0 = Math.max(j - 1, 0);
      const j1 = Math.min(j + 1, rows - 1);
      for (let i = 0; i < cols; i++) {
        const i0 = (i - 1 + segs) % segs;
        const i1 = (i + 1) % segs;
        const a = (base + j * cols + i0) * 3;
        const b = (base + j * cols + i1) * 3;
        const c = (base + j0 * cols + (i % segs)) * 3;
        const d = (base + j1 * cols + (i % segs)) * 3;
        const tx = (pos[b] as number) - (pos[a] as number);
        const ty = (pos[b + 1] as number) - (pos[a + 1] as number);
        const tz = (pos[b + 2] as number) - (pos[a + 2] as number);
        const ux = (pos[d] as number) - (pos[c] as number);
        const uy = (pos[d + 1] as number) - (pos[c + 1] as number);
        const uz = (pos[d + 2] as number) - (pos[c + 2] as number);
        // up × around = outward for a counter-clockwise ring
        let nx = uy * tz - uz * ty;
        let ny = uz * tx - ux * tz;
        let nz = ux * ty - uy * tx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-6) {
          nx = 0;
          ny = 1;
          nz = 0;
        } else {
          nx /= len;
          ny /= len;
          nz /= len;
        }
        const k = (base + j * cols + i) * 3;
        nrm[k] = nx;
        nrm[k + 1] = ny;
        nrm[k + 2] = nz;
      }
    }
  };

  for (const t of KARST_TOWERS) {
    await budget.tick();
    const cols = t.segs + 1;
    const rows = t.rings + 1;
    const base = vOff;
    const cr = Math.cos(t.rot);
    const sr = Math.sin(t.rot);
    const avgR = (t.rx + t.rz) / 2;
    const uRepeat = Math.max(1, Math.round((Math.PI * 2 * avgR) / 52));
    const yBottom = seaLevel - 5;
    const tint = fbm3(t.seed * 1.7, 0.3, 0.9, 2, 5);
    // ring heights: a few fixed rings around the tidal notch, then even spacing to the summit
    const ys: number[] = [yBottom, seaLevel + 0.15, seaLevel + t.h * 0.02, seaLevel + t.h * 0.055];
    const rest = rows - ys.length;
    for (let j = 1; j <= rest; j++) ys.push(seaLevel + t.h * (0.055 + (0.945 * j) / rest));

    for (let j = 0; j < rows; j++) {
      const y = ys[j] as number;
      const yn = Math.max(0, (y - seaLevel) / t.h);
      const p = profile(yn);
      for (let i = 0; i < cols; i++) {
        const theta = ((i % t.segs) / t.segs) * Math.PI * 2;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const foot = footprintRadius(t, theta);
        // wall relief: broad buttresses + vertical flutes that wander slowly with height
        const relief = fbm3(c * 2.2 + t.seed, s * 2.2 + t.seed * 0.5, yn * 2.6, 4, t.seed + 3) - 0.5;
        const flutes = fbm3(c * 9 + 1.3, s * 9 - 2.1, yn * 1.1 + t.seed, 2, t.seed + 9) - 0.5;
        const wall = 1 + relief * 0.34 * smoothstep(0.0, 0.08, yn) + flutes * 0.1 * (1 - smoothstep(0.55, 0.8, yn));
        const r = foot * p * wall;
        // lumpy summit ridge
        const lump = (fbm3(c * 1.7 - t.seed, s * 1.7 + t.seed, 4.2, 3, t.seed + 21) - 0.45) * t.h * 0.16 * smoothstep(0.55, 0.95, yn);
        const lx = c * r;
        const lz = s * r;
        const k = (base + j * cols + i) * 3;
        pos[k] = t.x + lx * cr - lz * sr;
        pos[k + 1] = y + lump;
        pos[k + 2] = t.z + lx * sr + lz * cr;
        const e = (base + j * cols + i) * 4;
        ext[e + 1] = 0.35 + 0.65 * (0.5 * tint + 0.5 * fbm3(c * 1.3, s * 1.3, yn * 3 + t.seed, 2, t.seed + 31)); // tone
        ext[e + 2] = 0.72 + 0.56 * Math.min(1, Math.max(0, relief + 0.5)); // crevices are darker
        ext[e + 3] = (y - seaLevel) / 3; // metres above the sea (scaled) for the tide stain
        uv[(base + j * cols + i) * 2] = (i / t.segs) * uRepeat;
        uv[(base + j * cols + i) * 2 + 1] = y / 52;
      }
    }
    computeNormals(base, cols, rows, t.segs);

    // vegetation: wherever the rock leans back enough, plus clinging patches; puff it outwards
    for (let j = 0; j < rows; j++) {
      const y = ys[j] as number;
      const yn = Math.max(0, (y - seaLevel) / t.h);
      for (let i = 0; i < cols; i++) {
        const theta = ((i % t.segs) / t.segs) * Math.PI * 2;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const k = (base + j * cols + i) * 3;
        const ny = nrm[k + 1] as number;
        const patch = fbm3(c * 3.1 + 5, s * 3.1 - 3, yn * 5.5 + t.seed, 3, t.seed + 41);
        let veg = smoothstep(0.16, 0.5, ny) * smoothstep(0.1, 0.22, yn);
        veg = Math.max(veg, smoothstep(0.56, 0.7, patch) * smoothstep(0.14, 0.3, yn) * 0.85);
        veg = Math.max(veg, smoothstep(0.66, 0.84, yn));
        const puff = fbm3(c * 7 + 2, s * 7 + 4, yn * 9, 2, t.seed + 51);
        const d = veg * (0.6 + puff * 1.5) * Math.min(4.2, avgR * 0.085);
        pos[k] = (pos[k] as number) + (nrm[k] as number) * d;
        pos[k + 1] = (pos[k + 1] as number) + (nrm[k + 1] as number) * d * 0.8;
        pos[k + 2] = (pos[k + 2] as number) + (nrm[k + 2] as number) * d;
        ext[(base + j * cols + i) * 4] = veg;
      }
    }
    computeNormals(base, cols, rows, t.segs);

    for (let j = 0; j < t.rings; j++) {
      for (let i = 0; i < t.segs; i++) {
        const a = base + j * cols + i;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        index[iOff++] = a;
        index[iOff++] = c;
        index[iOff++] = b;
        index[iOff++] = b;
        index[iOff++] = c;
        index[iOff++] = d;
      }
    }
    vOff += cols * rows;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aKarst', new THREE.BufferAttribute(ext, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}

export function createKarstMaterial(map: THREE.Texture, shared: SharedUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ name: 'Karst', map, roughness: 0.96, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = shared.uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aKarst;\nvarying vec4 vKarst;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKarst = aKarst;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vKarst;\nuniform float uWet;')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          float vegN = texture2D(map, vMapUv * 3.0).a;
          float vegN2 = texture2D(map, vMapUv * 11.0).a;
          float veg = smoothstep(0.36, 0.6, vKarst.x + (vegN - 0.5) * 0.6);
          vec3 vegCol = mix(vec3(0.03, 0.105, 0.022), vec3(0.15, 0.27, 0.055), vegN * 0.6 + vegN2 * 0.4);
          vegCol *= 0.75 + 0.5 * vKarst.y;
          vec3 rock = diffuseColor.rgb * mix(vec3(0.8, 0.84, 0.92), vec3(1.1, 1.0, 0.86), vKarst.y) * vKarst.z;
          float stain = smoothstep(1.0, 0.05, vKarst.w);
          rock *= mix(1.0, 0.42, stain);
          rock *= 1.0 - 0.25 * uWet;
          diffuseColor.rgb = mix(rock, vegCol, veg);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'karst';
  return m;
}
