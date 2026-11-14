import * as THREE from 'three';
import type { SharedUniforms } from './shared';

const VERT = /* glsl */ `
attribute vec3 aSeed;
attribute vec2 aCorner;
uniform float uTime;
uniform vec3 uBox;
uniform vec2 uWindDir;
uniform float uWindStrength;
varying float vAlpha;
varying float vU;

void main() {
  float speed = 13.0 + 5.0 * fract(aSeed.x * 17.3);
  vec3 vel = vec3(uWindDir.x * (1.5 + 4.0 * uWindStrength), -speed, uWindDir.y * (1.5 + 4.0 * uWindStrength));
  vec3 p0 = aSeed * uBox + vel * uTime;
  // wrap the drops in a box that travels with the camera
  vec3 rel = mod(p0 - cameraPosition, uBox) - 0.5 * uBox;
  rel.y += uBox.y * 0.22;
  vec3 wp = cameraPosition + rel;
  vec3 dir = normalize(vel);
  vec3 toCam = normalize(cameraPosition - wp);
  vec3 side = normalize(cross(dir, toCam));
  float len = 0.55 + 0.5 * fract(aSeed.y * 31.7);
  float d = length(rel);
  wp += dir * (-aCorner.y * len) + side * (aCorner.x * (0.0035 + 0.0006 * d));
  vAlpha = (1.0 - smoothstep(0.34, 0.5, length(rel.xz) / uBox.x)) * smoothstep(1.2, 5.0, d) * (0.5 + 0.5 * fract(aSeed.z * 7.1));
  vU = aCorner.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vU;
void main() {
  float a = vAlpha * uOpacity * (1.0 - vU * vU);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

/** Tropical downpour: camera-following streaks, all in one draw call (hidden when it is dry). */
export class Rain {
  readonly mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private count: number;
  private readonly uColor: THREE.IUniform<THREE.Color> = { value: new THREE.Color(0.8, 0.86, 0.95) };
  private readonly uOpacity: THREE.IUniform<number> = { value: 0.3 };

  constructor(shared: SharedUniforms, count: number) {
    this.count = count;
    this.geometry = Rain.build(count);
    this.material = new THREE.ShaderMaterial({
      name: 'Rain',
      uniforms: {
        uTime: shared.uTime,
        uWindDir: shared.uWindDir,
        uWindStrength: shared.uWindStrength,
        uBox: { value: new THREE.Vector3(30, 18, 30) },
        uColor: this.uColor,
        uOpacity: this.uOpacity,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'rain';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 60;
    this.mesh.visible = false;
  }

  private static build(count: number): THREE.BufferGeometry {
    const seed = new Float32Array(count * 4 * 3);
    const corner = new Float32Array(count * 4 * 2);
    const pos = new Float32Array(count * 4 * 3);
    const index = new Uint32Array(count * 6);
    // tiny deterministic LCG: the pattern only needs to look random
    let s = 12345;
    const rnd = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const corners: readonly [number, number][] = [
      [-1, 0],
      [1, 0],
      [1, 1],
      [-1, 1],
    ];
    for (let i = 0; i < count; i++) {
      const a = rnd();
      const b = rnd();
      const c = rnd();
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        seed[v * 3] = a;
        seed[v * 3 + 1] = b;
        seed[v * 3 + 2] = c;
        corner[v * 2] = (corners[k] as [number, number])[0];
        corner[v * 2 + 1] = (corners[k] as [number, number])[1];
      }
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    return g;
  }

  setCount(count: number): void {
    if (count === this.count) return;
    this.count = count;
    const old = this.geometry;
    this.geometry = Rain.build(count);
    this.mesh.geometry = this.geometry;
    old.dispose();
  }

  /** `light`: ambient colour the streaks pick up */
  update(rain: number, light: THREE.Color): void {
    const on = rain > 0.015;
    this.mesh.visible = on;
    if (!on) return;
    const drops = Math.max(1, Math.round(this.count * Math.min(1, rain * 1.15)));
    this.geometry.setDrawRange(0, drops * 6);
    this.uOpacity.value = 0.1 + 0.2 * rain;
    this.uColor.value.setRGB(0.25 + light.r * 1.5, 0.27 + light.g * 1.5, 0.3 + light.b * 1.5);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
