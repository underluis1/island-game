import * as THREE from 'three';
import { HEIGHT_RECT, SEA_LEVEL, shorelineZ, terrainHeight } from './layout';
import { applyShadowFade, gridAxis } from './shared';
import type { SharedUniforms } from './shared';
import { fbm2, smoothstep } from './util/noise';
import type { FrameBudget } from './util/async';
import { makeSandTextures } from '../procgen/textures/env/data-textures';
import type { SandTextures } from '../procgen/textures/env/data-textures';

const NX = 200;
const NZ = 176;

const VERT_PARS = /* glsl */ `
varying vec3 vWPos;
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vWPos;
uniform float uSeaLevel;
uniform float uTide;
uniform float uWet;
uniform float uTime;
uniform sampler2D uNoise;
uniform vec3 uLightColor;
float gSandWet;
float gSandUnder;
float gSandDepth;
`;

const FRAG_COLOR = /* glsl */ `
{
  float hNow = vWPos.y - (uSeaLevel + uTide);
  float hMax = vWPos.y - (uSeaLevel + 0.046);
  float brk = texture2D(uNoise, vWPos.xz * 0.06).r;
  float damp = smoothstep(0.2 + brk * 0.12, 0.02, hMax);
  gSandUnder = smoothstep(0.0, -0.04, hNow);
  gSandDepth = max(-hNow, 0.0);
  gSandWet = max(damp, uWet * (0.55 + 0.3 * brk));
  // large scale tone variation hides texture tiling
  float macro = texture2D(uNoise, vWPos.xz * 0.011).g;
  diffuseColor.rgb *= 0.9 + 0.2 * macro;
  // damp sand is darker and more saturated
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.52, 0.475, 0.41), gSandWet);
  // under water: red is absorbed first → the sea bed turns aqua, then blue
  vec3 absorb = exp(-gSandDepth * vec3(0.62, 0.17, 0.13));
  diffuseColor.rgb *= mix(vec3(1.0), absorb * vec3(0.92, 1.0, 0.98), gSandUnder);
}
`;

const FRAG_ROUGH = /* glsl */ `
{
  float sheen = smoothstep(0.03, -0.01, vWPos.y - (uSeaLevel + 0.046));
  float wetRough = mix(0.42, 0.14, sheen);
  roughnessFactor = mix(roughnessFactor, wetRough, gSandWet * (1.0 - gSandUnder));
}
`;

const FRAG_CAUSTICS = /* glsl */ `
#ifdef USE_CAUSTICS
if (gSandUnder > 0.0) {
  vec2 cuv = vWPos.xz * 0.19;
  float c1 = texture2D(uNoise, cuv + vec2(uTime * 0.017, uTime * 0.011)).a;
  float c2 = texture2D(uNoise, cuv * 1.31 + vec2(-uTime * 0.013, uTime * 0.016) + 0.37).a;
  float ca = min(c1, c2) * 2.6 + c1 * c2 * 1.2;
  float fadeD = smoothstep(0.02, 0.35, gSandDepth) * exp(-gSandDepth * 0.4);
  reflectedLight.directDiffuse += diffuseColor.rgb * uLightColor * ca * fadeD * 0.42 * gSandUnder;
}
#endif
`;

/** Beach + sea bed mesh, sand material and the sea-bed height texture sampled by the sea shader. */
export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  readonly heightTexture: THREE.DataTexture;
  private readonly geometry: THREE.BufferGeometry;
  private textures: SandTextures | null = null;

  private constructor(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, heightTexture: THREE.DataTexture) {
    this.geometry = geometry;
    this.material = material;
    this.heightTexture = heightTexture;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'terrain';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
  }

  static async create(
    shared: SharedUniforms,
    opts: { textureSize: number; anisotropy: number; caustics: boolean; shelf: (x: number, z: number) => number },
    budget: FrameBudget,
    onStep: () => void,
  ): Promise<Terrain> {
    // ---- geometry
    const xs = gridAxis(NX, 0, 300, 300, 36);
    const zs = gridAxis(NZ, -7, 175, 100, 32);
    const cols = NX + 1;
    const rows = NZ + 1;
    const count = cols * rows;
    const heights = new Float32Array(count);
    for (let j = 0; j < rows; j++) {
      if ((j & 3) === 0) await budget.tick();
      const z = zs[j] as number;
      for (let i = 0; i < cols; i++) heights[j * cols + i] = terrainHeight(xs[i] as number, z);
    }
    onStep();
    const pos = new Float32Array(count * 3);
    const nrm = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const col = new Float32Array(count * 3);
    for (let j = 0; j < rows; j++) {
      if ((j & 7) === 0) await budget.tick();
      const z = zs[j] as number;
      const j0 = Math.max(j - 1, 0);
      const j1 = Math.min(j + 1, rows - 1);
      for (let i = 0; i < cols; i++) {
        const x = xs[i] as number;
        const k = j * cols + i;
        const i0 = Math.max(i - 1, 0);
        const i1 = Math.min(i + 1, cols - 1);
        const h = heights[k] as number;
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const dhdx = ((heights[j * cols + i1] as number) - (heights[j * cols + i0] as number)) / ((xs[i1] as number) - (xs[i0] as number));
        const dhdz = ((heights[j1 * cols + i] as number) - (heights[j0 * cols + i] as number)) / ((zs[j1] as number) - (zs[j0] as number));
        const inv = 1 / Math.sqrt(dhdx * dhdx + dhdz * dhdz + 1);
        nrm[k * 3] = -dhdx * inv;
        nrm[k * 3 + 1] = inv;
        nrm[k * 3 + 2] = -dhdz * inv;
        uv[k * 2] = x * 0.42;
        uv[k * 2 + 1] = z * 0.42;
        // sand → leaf litter → jungle floor at the back of the beach
        const d = z - shorelineZ(x);
        const n = fbm2(x * 0.11, z * 0.11, 3, 131);
        const g = smoothstep(19 + n * 9, 34 + n * 9, d);
        const litter = smoothstep(12 + n * 10, 22 + n * 8, d) * (1 - g) * 0.35;
        col[k * 3] = (1 - litter * 0.3) * (1 - g) + 0.2 * g;
        col[k * 3 + 1] = (1 - litter * 0.33) * (1 - g) + 0.27 * g;
        col[k * 3 + 2] = (1 - litter * 0.45) * (1 - g) + 0.11 * g;
      }
    }
    const index = new Uint32Array(NX * NZ * 6);
    let q = 0;
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * cols + i;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        index[q++] = a;
        index[q++] = c;
        index[q++] = b;
        index[q++] = b;
        index[q++] = c;
        index[q++] = d;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    onStep();
    await budget.yield();

    // ---- sea-bed height texture (half float, bilinear) for the sea shader
    const W = 1024;
    const H = 512;
    const hdata = new Uint16Array(W * H);
    const sx = (HEIGHT_RECT.maxX - HEIGHT_RECT.minX) / W;
    const sz = (HEIGHT_RECT.maxZ - HEIGHT_RECT.minZ) / H;
    for (let j = 0; j < H; j++) {
      if ((j & 1) === 0) await budget.tick();
      const z = HEIGHT_RECT.minZ + (j + 0.5) * sz;
      for (let i = 0; i < W; i++) {
        const x = HEIGHT_RECT.minX + (i + 0.5) * sx;
        let h = terrainHeight(x, z);
        if (h < SEA_LEVEL + 3) h = Math.max(h, opts.shelf(x, z));
        hdata[j * W + i] = THREE.DataUtils.toHalfFloat(h);
      }
    }
    const heightTexture = new THREE.DataTexture(hdata, W, H, THREE.RedFormat, THREE.HalfFloatType);
    heightTexture.magFilter = THREE.LinearFilter;
    heightTexture.minFilter = THREE.LinearFilter;
    heightTexture.wrapS = THREE.ClampToEdgeWrapping;
    heightTexture.wrapT = THREE.ClampToEdgeWrapping;
    heightTexture.generateMipmaps = false;
    heightTexture.needsUpdate = true;
    shared.uHeightMap.value = heightTexture;
    onStep();
    await budget.yield();

    // ---- material
    const material = new THREE.MeshStandardMaterial({
      name: 'Sand',
      color: new THREE.Color(0.86, 0.79, 0.66),
      roughness: 0.93,
      metalness: 0,
      vertexColors: true,
    });
    material.normalScale.set(0.7, 0.7);
    material.defines = material.defines ?? {};
    if (opts.caustics) material.defines.USE_CAUSTICS = '1';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSeaLevel = shared.uSeaLevel;
      shader.uniforms.uTide = shared.uTide;
      shader.uniforms.uWet = shared.uWet;
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uNoise = shared.uNoise;
      shader.uniforms.uLightColor = shared.uLightColor;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_COLOR}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG_CAUSTICS}`);
      applyShadowFade(shader, shared);
    };
    material.customProgramCacheKey = () => `sand-${opts.caustics ? 1 : 0}`;

    const terrain = new Terrain(geometry, material, heightTexture);
    await terrain.setTextureSize(opts.textureSize, opts.anisotropy, budget);
    return terrain;
  }

  async setTextureSize(size: number, anisotropy: number, budget: FrameBudget): Promise<void> {
    const next = await makeSandTextures(size, anisotropy, budget);
    const prev = this.textures;
    this.textures = next;
    this.material.map = next.map;
    this.material.normalMap = next.normalMap;
    this.material.needsUpdate = true;
    if (prev) {
      prev.map.dispose();
      prev.normalMap.dispose();
    }
  }

  setCaustics(enabled: boolean): void {
    const defs = this.material.defines as Record<string, string>;
    const has = defs.USE_CAUSTICS !== undefined;
    if (has === enabled) return;
    if (enabled) defs.USE_CAUSTICS = '1';
    else delete defs.USE_CAUSTICS;
    this.material.customProgramCacheKey = () => `sand-${enabled ? 1 : 0}`;
    this.material.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.heightTexture.dispose();
    if (this.textures) {
      this.textures.map.dispose();
      this.textures.normalMap.dispose();
    }
  }
}
