import * as THREE from 'three';
import { clamp01, fbm2, hash2, smoothstep, vnoise2, worley2 } from '../../../render/util/noise';
import type { FrameBudget } from '../../../render/util/async';

function finish(tex: THREE.DataTexture, srgb: boolean, anisotropy: number): THREE.DataTexture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * General purpose tileable noise:
 *  R: soft fbm (clouds, foam breakup)   G: second fbm   B: fine fbm   A: caustic-like cell edges
 */
export async function makeNoiseTexture(size: number, budget: FrameBudget): Promise<THREE.DataTexture> {
  const data = new Uint8Array(size * size * 4);
  const w: number[] = [0, 0];
  for (let y = 0; y < size; y++) {
    if ((y & 7) === 0) await budget.tick();
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      const r = fbm2(u * 4, v * 4, 5, 11, 4);
      const g = fbm2(u * 8, v * 8, 4, 53, 8);
      const b = fbm2(u * 24, v * 24, 3, 97, 24);
      // caustics: warped cell edges
      const wx = u * 6 + (vnoise2(u * 12, v * 12, 5, 12) - 0.5) * 0.55;
      const wy = v * 6 + (vnoise2(u * 12, v * 12, 9, 12) - 0.5) * 0.55;
      worley2(wx, wy, 31, 6, w);
      const edge = (w[1] as number) - (w[0] as number);
      const c = Math.pow(1 - smoothstep(0.0, 0.34, edge), 3.2);
      data[i] = Math.round(clamp01((r - 0.5) * 1.9 + 0.5) * 255);
      data[i + 1] = Math.round(clamp01((g - 0.5) * 1.9 + 0.5) * 255);
      data[i + 2] = Math.round(clamp01((b - 0.5) * 1.8 + 0.5) * 255);
      data[i + 3] = Math.round(clamp01(c) * 255);
    }
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), false, 1);
}

/** tileable ripple normal map for the sea surface: RG = normal.xz * 0.5 + 0.5, B = height, A = fine foam mask */
export async function makeWaterNormalTexture(size: number, budget: FrameBudget): Promise<THREE.DataTexture> {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    if ((y & 7) === 0) await budget.tick();
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // stretched wavelets: more variation across the swell direction than along it
      const n1 = fbm2(u * 6, v * 10, 4, 211, 6, 10);
      const n2 = fbm2(u * 14, v * 22, 3, 223, 14, 22);
      h[y * size + x] = n1 * 0.65 + n2 * 0.35;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const strength = size * 0.055;
  for (let y = 0; y < size; y++) {
    if ((y & 15) === 0) await budget.tick();
    const y0 = (y + size - 1) % size;
    const y1 = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const x0 = (x + size - 1) % size;
      const x1 = (x + 1) % size;
      const dx = ((h[y * size + x1] as number) - (h[y * size + x0] as number)) * strength;
      const dy = ((h[y1 * size + x] as number) - (h[y0 * size + x] as number)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(clamp01(h[y * size + x] as number) * 255);
      const foam = fbm2((x / size) * 18, (y / size) * 18, 3, 301, 18);
      data[i + 3] = Math.round(clamp01((foam - 0.5) * 2.4 + 0.5) * 255);
    }
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), false, 4);
}

export interface SandTextures {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
}

/** fine white coral sand: albedo with grains/specks + normal map with soft wind ripples and churned lumps */
export async function makeSandTextures(size: number, anisotropy: number, budget: FrameBudget): Promise<SandTextures> {
  const albedo = new Uint8Array(size * size * 4);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    if ((y & 7) === 0) await budget.tick();
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      const low = fbm2(u * 5, v * 5, 4, 401, 5);
      const mid = fbm2(u * 22, v * 22, 3, 409, 22);
      const grain = hash2(x, y, 419);
      const grain2 = hash2(x >> 1, y >> 1, 421);
      let tone = 0.9 + (low - 0.5) * 0.14 + (mid - 0.5) * 0.08 + (grain - 0.5) * 0.085 + (grain2 - 0.5) * 0.05;
      let warm = 0;
      const speck = hash2(x, y, 431);
      if (speck > 0.9925) tone *= 0.66; // dark mineral grains
      else if (speck < 0.005) {
        tone *= 1.12; // shell fragments
        warm = 0.03;
      } else if (speck > 0.985) warm = -0.035; // coral-pink grains
      tone = clamp01(tone);
      albedo[i] = Math.round(clamp01(tone * 1.0 - warm * 0.2) * 255);
      albedo[i + 1] = Math.round(clamp01(tone * 0.965 + warm) * 255);
      albedo[i + 2] = Math.round(clamp01(tone * 0.9 + warm * 1.6) * 255);
      albedo[i + 3] = 255;

      // height: wind ripples (integer frequencies → tileable) warped by noise, plus lumps and grain
      const warp = (fbm2(u * 4, v * 4, 3, 443, 4) - 0.5) * 5.5;
      const ripple = Math.sin((u * 3 + v * 17) * Math.PI * 2 + warp);
      const rippleMask = smoothstep(0.48, 0.78, fbm2(u * 3, v * 3, 2, 449, 3));
      h[y * size + x] = ripple * 0.5 * rippleMask * 0.2 + (low - 0.5) * 2.6 + (mid - 0.5) * 0.6 + (grain - 0.5) * 0.1;
    }
  }
  const normal = new Uint8Array(size * size * 4);
  const strength = size * 0.0055;
  for (let y = 0; y < size; y++) {
    if ((y & 15) === 0) await budget.tick();
    const y0 = (y + size - 1) % size;
    const y1 = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const x0 = (x + size - 1) % size;
      const x1 = (x + 1) % size;
      const dx = ((h[y * size + x1] as number) - (h[y * size + x0] as number)) * strength;
      const dy = ((h[y1 * size + x] as number) - (h[y0 * size + x] as number)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      normal[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;
    }
  }
  return {
    map: finish(new THREE.DataTexture(albedo, size, size, THREE.RGBAFormat), true, anisotropy),
    normalMap: finish(new THREE.DataTexture(normal, size, size, THREE.RGBAFormat), false, anisotropy),
  };
}

/**
 * Limestone cliff texture (u = around the tower, v = up): pale grey/cream rock with dark vertical water
 * stains, rust streaks, faint strata and small pockets. Alpha = fine noise used to break up the vegetation edge.
 */
export async function makeKarstTexture(size: number, anisotropy: number, budget: FrameBudget): Promise<THREE.DataTexture> {
  const data = new Uint8Array(size * size * 4);
  const w: number[] = [0, 0];
  for (let y = 0; y < size; y++) {
    if ((y & 7) === 0) await budget.tick();
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      const base = fbm2(u * 6, v * 6, 5, 501, 6);
      const streakA = fbm2(u * 40, v * 3, 3, 509, 40, 3); // tall narrow stains
      const streakB = fbm2(u * 22, v * 2, 3, 521, 22, 2);
      const rustN = fbm2(u * 14, v * 2, 3, 523, 14, 2);
      const strata = fbm2(u * 3, v * 46, 2, 541, 3, 46);
      worley2(u * 18, v * 18, 547, 18, w);
      const pocket = smoothstep(0.14, 0.02, w[0] as number) * smoothstep(0.66, 0.82, fbm2(u * 5, v * 5, 2, 557, 5));
      const fine = fbm2(u * 48, v * 48, 3, 563, 48);

      let r = 0.8;
      let g = 0.775;
      let b = 0.72;
      const tone = 0.78 + (base - 0.5) * 0.5 + (fine - 0.5) * 0.2 + (strata - 0.5) * 0.14;
      r *= tone;
      g *= tone;
      b *= tone;
      // warm ochre patches
      const ochre = smoothstep(0.52, 0.78, base * 0.6 + rustN * 0.4);
      r = r * (1 - ochre * 0.3) + 0.78 * ochre * 0.3;
      g = g * (1 - ochre * 0.3) + 0.6 * ochre * 0.3;
      b = b * (1 - ochre * 0.3) + 0.4 * ochre * 0.3;
      // rust streaks
      const rust = smoothstep(0.6, 0.82, rustN) * 0.55;
      r = r * (1 - rust) + 0.62 * rust;
      g = g * (1 - rust) + 0.36 * rust;
      b = b * (1 - rust) + 0.2 * rust;
      // dark water stains
      const stain = Math.max(smoothstep(0.55, 0.8, streakA) * 0.62, smoothstep(0.6, 0.85, streakB) * 0.5);
      r *= 1 - stain * 0.72;
      g *= 1 - stain * 0.7;
      b *= 1 - stain * 0.66;
      const pk = 1 - pocket * 0.4;
      data[i] = Math.round(clamp01(r * pk) * 255);
      data[i + 1] = Math.round(clamp01(g * pk) * 255);
      data[i + 2] = Math.round(clamp01(b * pk) * 255);
      data[i + 3] = Math.round(clamp01((fbm2(u * 16, v * 16, 4, 577, 16) - 0.5) * 2.2 + 0.5) * 255);
    }
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), true, anisotropy);
}
