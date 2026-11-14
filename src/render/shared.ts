import * as THREE from 'three';
import { HEIGHT_RECT, SEA_LEVEL } from './layout';

/**
 * Uniform objects shared (by reference) between every environment shader: updating a value here once per
 * frame updates sea, sand, palms, karsts, rain… without touching each material.
 */
export interface SharedUniforms {
  uTime: THREE.IUniform<number>;
  uSeaLevel: THREE.IUniform<number>;
  /** slow swash oscillation of the water line (metres) */
  uTide: THREE.IUniform<number>;
  /** 0..1 how soaked the world is (rises with rain, dries slowly) */
  uWet: THREE.IUniform<number>;
  uRain: THREE.IUniform<number>;
  uNight: THREE.IUniform<number>;
  uWindDir: THREE.IUniform<THREE.Vector2>;
  uWindStrength: THREE.IUniform<number>;
  uLightDir: THREE.IUniform<THREE.Vector3>;
  /** key light colour × intensity */
  uLightColor: THREE.IUniform<THREE.Color>;
  uGlintDir: THREE.IUniform<THREE.Vector3>;
  uGlintColor: THREE.IUniform<THREE.Color>;
  uSkyZenith: THREE.IUniform<THREE.Color>;
  uSkyHorizon: THREE.IUniform<THREE.Color>;
  /** ambient + sun light reaching the water volume / foam */
  uWaterLight: THREE.IUniform<THREE.Color>;
  uNoise: THREE.IUniform<THREE.Texture | null>;
  uHeightMap: THREE.IUniform<THREE.Texture | null>;
  /** minX, minZ, 1/sizeX, 1/sizeZ of the sea-bed height texture */
  uHeightRect: THREE.IUniform<THREE.Vector4>;
  /** xyz = centre, w = radius of the sphere covered by the sun shadow map */
  uShadowFocus: THREE.IUniform<THREE.Vector4>;
}

export function createSharedUniforms(): SharedUniforms {
  return {
    uTime: { value: 0 },
    uSeaLevel: { value: SEA_LEVEL },
    uTide: { value: 0 },
    uWet: { value: 0 },
    uRain: { value: 0 },
    uNight: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.62, 0.78) },
    uWindStrength: { value: 0.4 },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightColor: { value: new THREE.Color(3, 3, 3) },
    uGlintDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlintColor: { value: new THREE.Color(3, 3, 3) },
    uSkyZenith: { value: new THREE.Color(0.1, 0.3, 0.7) },
    uSkyHorizon: { value: new THREE.Color(0.6, 0.75, 0.9) },
    uWaterLight: { value: new THREE.Color(1, 1, 1) },
    uNoise: { value: null },
    uHeightMap: { value: null },
    uShadowFocus: { value: new THREE.Vector4(0, 0.9, 0, 18) },
    uHeightRect: {
      value: new THREE.Vector4(
        HEIGHT_RECT.minX,
        HEIGHT_RECT.minZ,
        1 / (HEIGHT_RECT.maxX - HEIGHT_RECT.minX),
        1 / (HEIGHT_RECT.maxZ - HEIGHT_RECT.minZ),
      ),
    },
  };
}

/** non-uniform grid axis: dense around `center` (spacing ≈ 2·fine/n), stretching out to the given extents */
export function gridAxis(n: number, center: number, extNeg: number, extPos: number, fine: number): Float32Array {
  const out = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * 2 - 1;
    const a = Math.abs(u);
    const ext = u < 0 ? extNeg : extPos;
    const c = ext <= fine * 1.5 ? ext * a : fine * a + (ext - fine) * a * a * a;
    out[i] = center + Math.sign(u) * c;
  }
  return out;
}

interface PatchableShader {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
}

const SHADOW_CALL = /getShadow\( directionalShadowMap\[ i \][^;]*?vDirectionalShadowCoord\[ i \] \)/;

/**
 * Makes a lit built-in material fade the sun shadow out towards the edge of the shadow-map coverage, so
 * shadows of palms never end in a hard clipped line where the shadow camera stops. Call from onBeforeCompile
 * (after any other vertex patch: it relies on the final `transformed`).
 */
export function applyShadowFade(shader: PatchableShader, shared: SharedUniforms): void {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (!SHADOW_CALL.test(chunk)) return; // three changed its chunk: keep stock behaviour
  shader.uniforms.uShadowFocus = shared.uShadowFocus;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vShadowFadePos;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvShadowFadePos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vShadowFadePos;\nuniform vec4 uShadowFocus;')
    .replace(
      '#include <lights_fragment_begin>',
      chunk.replace(SHADOW_CALL, (m) => `mix( 1.0, ${m}, 1.0 - smoothstep( 0.74, 0.97, distance( vShadowFadePos, uShadowFocus.xyz ) / uShadowFocus.w ) )`),
    );
}
