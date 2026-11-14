import * as THREE from 'three';
import { SEA_LEVEL, terrainHeight } from './layout';
import { gridAxis } from './shared';
import type { SharedUniforms } from './shared';
import { smoothstep } from './util/noise';

/** Gerstner components: dirX, dirZ (towards the beach = +Z), wavelength (m), amplitude (m) */
const WAVES: readonly (readonly [number, number, number, number])[] = [
  [0.18, 1.0, 21.0, 0.085],
  [-0.42, 0.9, 12.5, 0.05],
  [0.55, 0.83, 6.8, 0.026],
  [-0.15, 1.0, 3.6, 0.012],
];
const WAVE_SPEED = 0.55;
const WAVE_CENTER_X = 0;
const WAVE_CENTER_Z = -20;

function waveGLSL(): string {
  let s = '';
  WAVES.forEach((w, i) => {
    const len = Math.hypot(w[0], w[1]);
    const k = (Math.PI * 2) / w[2];
    const c = Math.sqrt(9.81 / k) * WAVE_SPEED;
    s += `
  {
    vec2 d = vec2(${(w[0] / len).toFixed(5)}, ${(w[1] / len).toFixed(5)});
    float ph = ${k.toFixed(5)} * (dot(d, p) - ${c.toFixed(5)} * t) + ${(i * 1.7).toFixed(2)};
    float a = ${w[3].toFixed(5)};
    float cs = cos(ph);
    disp += vec3(d.x * a * 0.7 * cs, a * sin(ph), d.y * a * 0.7 * cs);
    slope += d * (${k.toFixed(5)} * a * cs);
  }`;
  });
  return s;
}

const COMMON = /* glsl */ `
uniform float uTime;
uniform sampler2D uHeightMap;
uniform vec4 uHeightRect;
uniform float uSeaLevel;
uniform float uTide;
uniform float uWaveAmp;

void waves(in vec2 p, in float t, out vec3 disp, out vec2 slope) {
  disp = vec3(0.0);
  slope = vec2(0.0);
  ${waveGLSL()}
}

float seaBed(vec2 xz) {
  return texture2D(uHeightMap, (xz - uHeightRect.xy) * uHeightRect.zw).r;
}

float waveAtten(vec2 xz, float depth0) {
  return smoothstep(0.04, 2.4, depth0) * (1.0 - smoothstep(140.0, 420.0, length(xz - vec2(${WAVE_CENTER_X.toFixed(1)}, ${WAVE_CENTER_Z.toFixed(1)}))));
}
`;

const VERT = /* glsl */ `
${COMMON}
varying vec3 vWorld;
varying float vAtt;
#include <fog_pars_vertex>

void main() {
  vec3 p = position;
  float depth0 = uSeaLevel - seaBed(p.xz);
  float att = waveAtten(p.xz, depth0);
  vec3 disp;
  vec2 slope;
  waves(p.xz, uTime, disp, slope);
  p += disp * (att * uWaveAmp);
  p.y += uSeaLevel + uTide;
  vWorld = p;
  vAtt = att;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON}
varying vec3 vWorld;
varying float vAtt;
uniform sampler2D uNormalMap;
uniform sampler2D uNoise;
uniform vec3 uGlintDir;
uniform vec3 uGlintColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uWaterLight;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform float uRain;
uniform float uWind;
#include <fog_pars_fragment>

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

#ifdef WATER_DETAIL
// expanding rain rings: returns a slope perturbation
vec2 rainRings(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = hash12(cell);
  float age = fract(t * 1.1 + h);
  vec2 c = (vec2(hash12(cell + 7.3), hash12(cell + 13.1)) - 0.5) * 0.45;
  vec2 dv = f - c;
  float d = length(dv);
  float r = age * 0.42;
  float ring = sin((d - r) * 46.0) * smoothstep(0.075, 0.0, abs(d - r)) * (1.0 - age) * step(h, 0.75);
  return (dv / max(d, 1e-3)) * ring;
}
#endif

void main() {
  float bed = seaBed(vWorld.xz);
  float depth = vWorld.y - bed;
  if (depth < -0.03) discard;
  float d0 = max(depth, 0.0);

  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  // ---- surface normal: analytic swell + scrolling detail ripples (+ rain rings)
  vec3 disp;
  vec2 slope;
  waves(vWorld.xz, uTime, disp, slope);
  slope *= vAtt * uWaveAmp;
  float calm = smoothstep(0.0, 0.9, d0); // ripples die out on the wet sand
  float foamNoise = 0.5;
  #ifdef WATER_DETAIL
    vec4 n1 = texture2D(uNormalMap, vWorld.xz * 0.075 + uTime * vec2(0.011, 0.024));
    vec4 n2 = texture2D(uNormalMap, vWorld.xz * 0.19 + uTime * vec2(-0.019, 0.031));
    vec4 n3 = texture2D(uNormalMap, vWorld.xz * 0.017 + uTime * vec2(0.004, 0.006));
    vec2 dn = (n1.rg - 0.5) * 1.1 + (n2.rg - 0.5) * 0.8 + (n3.rg - 0.5) * 0.9;
    float rippleAmt = (0.16 + 0.3 * uWind + 0.25 * uRain) * (0.3 + 0.7 * calm);
    slope += dn * rippleAmt;
    foamNoise = n2.a;
    if (uRain > 0.01 && dist < 60.0) {
      vec2 rr = rainRings(vWorld.xz * 2.3, uTime) + rainRings(vWorld.xz * 1.37 + 5.1, uTime * 0.87 + 0.4);
      slope += rr * uRain * 0.55 * (1.0 - smoothstep(30.0, 60.0, dist));
    }
  #endif
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  // ---- fresnel + sky reflection
  float NdV = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  fres *= 0.6;
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(clamp(R.y, 0.0, 1.0), 0.55));

  // ---- sun / moon glitter
  float rdl = max(dot(R, uGlintDir), 0.0);
  vec3 spec = uGlintColor * (pow(rdl, 620.0) * 1.5 + pow(rdl, 70.0) * 0.07 + pow(rdl, 9.0) * 0.006);

  // ---- water body: turquoise shallows → deep blue, light scattered back out of the volume
  float absorb = 1.0 - exp(-d0 * 0.27);
  vec3 body = mix(uShallow, uDeep, absorb);
  body += uShallow * 0.25 * max(dot(N.xz, -uGlintDir.xz), 0.0) * (1.0 - absorb); // wave faces glow a little
  // under a rain sky the sea loses its colour
  body = mix(body, vec3(dot(body, vec3(0.3, 0.5, 0.2))) * vec3(0.8, 1.0, 1.0), uRain * 0.6);
  body *= uWaterLight;

  // optical thickness along the view ray → how much of the sea bed shows through
  float path = d0 / max(NdV, 0.22);
  float opacity = 1.0 - exp(-path * 0.62);
  float nearBeach = 1.0 - smoothstep(-70.0, -105.0, vWorld.z);
  opacity = mix(1.0, opacity, nearBeach);

  vec3 col = mix(body, sky, fres) + spec;
  float alpha = mix(opacity, 1.0, fres);
  alpha *= smoothstep(-0.02, 0.025, depth);

  // ---- foam: thin swash line + lacy wavelets running up the beach + streaks further out
  float lace = texture2D(uNoise, vWorld.xz * 0.043 + uTime * vec2(0.003, 0.006)).r;
  float lace2 = texture2D(uNoise, vWorld.xz * 0.37 + uTime * vec2(-0.012, 0.019)).g;
  float lace3 = texture2D(uNoise, vWorld.xz * 0.9 + uTime * vec2(0.02, -0.013)).b;
  float edge = smoothstep(0.05, 0.0, depth);
  float ph = d0 * 5.2 + uTime * 0.5 + lace * 3.0;
  float band = pow(0.5 + 0.5 * sin(ph * 2.4), 12.0) * smoothstep(0.6, 0.04, d0);
  float band2 = pow(0.5 + 0.5 * sin(ph * 0.9 + 1.7), 16.0) * smoothstep(2.2, 0.35, d0) * 0.5;
  float foam = edge + band * 0.55 + band2;
  // bubbly break-up: solid only at the very crest, lace everywhere else
  float bubbles = smoothstep(0.5, 0.82, foamNoise * 0.42 + lace2 * 0.4 + lace3 * 0.3 + foam * 0.34);
  foam = clamp(foam * bubbles * 1.3, 0.0, 1.0);
  #ifdef WATER_DETAIL
    // sparse whitecaps when it blows / rains
    float cap = smoothstep(0.78, 0.95, n3.b * 0.6 + n1.b * 0.5) * (uWind * 0.5 + uRain * 0.5) * smoothstep(1.5, 4.0, d0);
    foam = clamp(foam + cap * bubbles * 0.6, 0.0, 1.0);
  #endif
  vec3 foamCol = vec3(0.97, 0.99, 1.0) * (uWaterLight * 1.25 + uGlintColor * 0.012);
  col = mix(col, foamCol, foam * 0.9);
  alpha = max(alpha, foam * 0.88 * smoothstep(-0.02, 0.01, depth));

  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

/** The sea: one non-uniform grid (dense in front of the beach, stretching to the horizon) and a custom shader. */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private geometry: THREE.BufferGeometry;
  private readonly uWaveAmp: THREE.IUniform<number> = { value: 1 };
  private readonly uWind: THREE.IUniform<number> = { value: 0.4 };

  constructor(shared: SharedUniforms, normalMap: THREE.Texture, segments: number, detail: number) {
    this.geometry = Water.buildGeometry(segments);
    const defines: Record<string, string> = {};
    if (detail >= 1) defines.WATER_DETAIL = '1';
    this.material = new THREE.ShaderMaterial({
      name: 'Sea',
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: shared.uTime,
        uHeightMap: shared.uHeightMap,
        uHeightRect: shared.uHeightRect,
        uSeaLevel: shared.uSeaLevel,
        uTide: shared.uTide,
        uWaveAmp: this.uWaveAmp,
        uNormalMap: { value: normalMap },
        uNoise: shared.uNoise,
        uGlintDir: shared.uGlintDir,
        uGlintColor: shared.uGlintColor,
        uSkyZenith: shared.uSkyZenith,
        uSkyHorizon: shared.uSkyHorizon,
        uWaterLight: shared.uWaterLight,
        uShallow: { value: new THREE.Color(0.03, 0.52, 0.47) },
        uDeep: { value: new THREE.Color(0.0, 0.085, 0.22) },
        uRain: shared.uRain,
        uWind: this.uWind,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines,
      transparent: true,
      depthWrite: true,
      fog: true,
      side: THREE.FrontSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'sea';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = -10; // first among the transparent objects
  }

  private static buildGeometry(n: number): THREE.BufferGeometry {
    const xs = gridAxis(n, 0, 4200, 4200, 44);
    const zs = gridAxis(n, -24, 4200, 17, 42);
    const cols = n + 1;
    const pos = new Float32Array(cols * cols * 3);
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const k = (j * cols + i) * 3;
        pos[k] = xs[i] as number;
        pos[k + 1] = 0;
        pos[k + 2] = zs[j] as number;
      }
    }
    const index = new Uint32Array(n * n * 6);
    let q = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
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
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    return g;
  }

  setQuality(segments: number, detail: number): void {
    const old = this.geometry;
    this.geometry = Water.buildGeometry(segments);
    this.mesh.geometry = this.geometry;
    old.dispose();
    const has = this.material.defines.WATER_DETAIL !== undefined;
    if (has !== detail >= 1) {
      if (detail >= 1) this.material.defines.WATER_DETAIL = '1';
      else delete this.material.defines.WATER_DETAIL;
      this.material.needsUpdate = true;
    }
  }

  update(wind: number, rain: number): void {
    this.uWaveAmp.value = 0.65 + 0.9 * wind + 0.7 * rain;
    this.uWind.value = wind;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** swash oscillation of the water line (shared by sea, sand and boats) */
export function tideAt(time: number): number {
  return 0.028 * Math.sin(time * 0.42) + 0.016 * Math.sin(time * 0.93 + 1.3);
}

export interface WaveSample {
  y: number;
  slopeX: number;
  slopeZ: number;
}

/** CPU mirror of the vertex shader swell, used to float boats. Writes into `out`, no allocations. */
export function sampleWaves(x: number, z: number, time: number, waveAmp: number, out: WaveSample): WaveSample {
  const depth0 = SEA_LEVEL - terrainHeight(x, z);
  const att =
    smoothstep(0.04, 2.4, depth0) * (1 - smoothstep(140, 420, Math.hypot(x - WAVE_CENTER_X, z - WAVE_CENTER_Z))) * waveAmp;
  let y = 0;
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i] as readonly [number, number, number, number];
    const len = Math.hypot(w[0], w[1]);
    const dx = w[0] / len;
    const dz = w[1] / len;
    const k = (Math.PI * 2) / w[2];
    const c = Math.sqrt(9.81 / k) * WAVE_SPEED;
    const ph = k * (dx * x + dz * z - c * time) + i * 1.7;
    y += w[3] * Math.sin(ph);
    const s = k * w[3] * Math.cos(ph);
    sx += dx * s;
    sz += dz * s;
  }
  out.y = SEA_LEVEL + tideAt(time) + y * att;
  out.slopeX = sx * att;
  out.slopeZ = sz * att;
  return out;
}
