import * as THREE from 'three';
import { SKY_PARAMS } from './atmosphere';
import type { AtmosphereState } from './atmosphere';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww; // always on the far plane, whatever near/far the game uses
}
`;

// NOTE: skyBase() is mirrored on the CPU in atmosphere.ts (sampleSkyRGB) — keep them in sync.
const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;

uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uSunE;
uniform float uMieG;
uniform float uGain;
uniform float uCurve;
uniform float uSkySat;
uniform float uElevRemap;
uniform float uNight;
uniform float uTwilight;
uniform float uGlow;
uniform float uWarm;
uniform float uRain;
uniform vec3 uOvercast;
uniform vec3 uSunDiscColor;
uniform vec3 uFogColor;
uniform vec3 uGround;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uCloudCover;
uniform vec2 uCloudOffset;
uniform float uStars;
uniform float uTime;
uniform sampler2D uNoise;

const float PI = 3.141592653589793;

float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  return 0.07957747154594767 * (1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
}

vec3 skyBase(vec3 dir, out vec3 fex) {
  float up = max(dir.y, 0.0);
  float zenithAngle = acos(pow(up, uElevRemap));
  float inv = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - zenithAngle * 180.0 / PI, -1.253));
  float sR = 8.4e3 * inv;
  float sM = 1.25e3 * inv;
  fex = exp(-(uBetaR * sR + uBetaM * sM));
  float cosTheta = dot(dir, uSunDir);
  float rPhase = 0.05968310365946075 * (1.0 + pow(cosTheta * 0.5 + 0.5, 2.0));
  float mPhase = hgPhase(cosTheta, uMieG);
  vec3 scatter = (uBetaR * rPhase + uBetaM * mPhase) / (uBetaR + uBetaM);
  float sunfade = clamp(exp(uSunDir.y), 0.0, 1.0);
  vec3 lin = pow(max(uSunE * scatter * (1.0 - fex), vec3(0.0)), vec3(1.5));
  lin *= mix(vec3(1.0), pow(max(uSunE * scatter * fex, vec3(0.0)), vec3(0.5)), clamp(pow(1.0 - uSunDir.y, 5.0), 0.0, 1.0));
  vec3 l0 = 0.1 * fex;
  vec3 c = pow(max((lin + l0) * 0.04 + vec3(0.0, 0.0003, 0.00075), vec3(0.0)), vec3(uCurve / (1.2 + 1.2 * sunfade))) * uGain;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(vec3(luma) + (c - vec3(luma)) * uSkySat, vec3(0.0));

  vec2 flatDir = normalize(dir.xz + vec2(1e-5));
  vec2 flatSun = normalize(uSunDir.xz + vec2(1e-5));
  float azRaw = dot(flatDir, flatSun);
  float az = max(azRaw, 0.0);
  float antiAz = max(-azRaw, 0.0);
  float lowBand = exp(-up * 7.0);
  float midBand = exp(-up * 2.6);
  // golden hour: the sky around a low sun turns warm
  c *= mix(vec3(1.0), vec3(1.12, 0.84, 0.56), uWarm * (0.35 + 0.65 * az * az) * midBand);
  c *= 1.0 - uNight;
  // belt of Venus: rosy band opposite a low sun
  float venus = (up - 0.11) * 9.0;
  c += uGlow * vec3(0.5, 0.24, 0.3) * antiAz * antiAz * exp(-venus * venus) * 0.5;

  // dusk / dawn afterglow
  vec3 glow = mix(vec3(0.5, 0.2, 0.34), vec3(1.0, 0.4, 0.13), lowBand) * (0.25 + 0.75 * az * az) * midBand * 0.55;
  c += uGlow * glow + uTwilight * vec3(0.035, 0.07, 0.2) * (0.6 + 0.4 * up);

  // night gradient + moon halo
  c += uNight * mix(vec3(0.021, 0.036, 0.074), vec3(0.0075, 0.013, 0.034), pow(up, 0.45));
  float cosMoon = max(dot(dir, uMoonDir), 0.0);
  c += uNight * vec3(0.5, 0.62, 0.9) * (pow(cosMoon, 40.0) * 0.05 + pow(cosMoon, 6.0) * 0.012);

  // overcast
  c = mix(c, uOvercast * (0.8 + 0.35 * up), uRain * 0.88);
  return c;
}

float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

#ifdef USE_CLOUDS
float cloudDensity(vec2 uv) {
  float n = texture2D(uNoise, uv).r * 0.56;
  n += texture2D(uNoise, uv * 2.7 + vec2(0.31, 0.17) + uCloudOffset * 0.6).g * 0.3;
  n += texture2D(uNoise, uv * 6.1 - uCloudOffset * 0.4).b * 0.14;
  return n;
}
#endif

void main() {
  vec3 dir = normalize(vDir);
  vec3 fex;
  vec3 col = skyBase(dir, fex);
  float up = max(dir.y, 0.0);
  float cosTheta = dot(dir, uSunDir);
  float clear = 1.0 - uRain * 0.92;
  float cloudA = 0.0;

  #ifndef ENV_CAPTURE
  // stars + faint galactic band
  if (uStars > 0.01) {
    vec3 sd = dir * 150.0;
    vec3 cell = floor(sd);
    vec3 f = fract(sd) - 0.5;
    float h = hash31(cell);
    float tw = 0.7 + 0.3 * sin(uTime * (1.5 + h * 4.0) + h * 80.0);
    float star = step(0.9865, h) * smoothstep(0.34, 0.02, length(f)) * tw;
    vec3 starCol = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.88, 0.7), fract(h * 37.0));
    float band = exp(-pow(dot(dir, normalize(vec3(0.55, 0.35, -0.76))) * 4.2, 2.0));
    float dust = texture2D(uNoise, dir.xz * 1.4 + dir.y).g;
    col += uStars * smoothstep(0.02, 0.2, dir.y) * (starCol * star * (0.9 + 2.2 * fract(h * 91.0)) + vec3(0.018, 0.022, 0.04) * band * dust);
  }
  #endif

  #ifdef USE_CLOUDS
  if (dir.y > 0.0) {
    vec2 p = dir.xz / (dir.y + 0.13);
    vec2 uv = p * 0.085 + uCloudOffset;
    float n = cloudDensity(uv);
    float lo = 1.0 - uCloudCover * 0.98;
    float d = smoothstep(lo, lo + 0.22, n);
    // cheap self-shadowing: compare with the density a little towards the light
    vec2 ld = normalize(uSunDir.xz - dir.xz * 0.5 + vec2(1e-4)) * 0.022;
    float n2 = cloudDensity(uv + ld);
    float lightAmt = clamp(0.55 + (n - n2) * 5.0, 0.0, 1.0) * (1.0 - d * 0.35);
    vec3 cc = mix(uCloudShade, uCloudLit, lightAmt);
    // silver lining + warm forward scattering near the sun
    float fwd = pow(max(cosTheta, 0.0), 10.0);
    cc += uSunDiscColor * fex * fwd * (1.0 - d) * 1.4 * clear * (1.0 - uNight);
    float fade = smoothstep(0.0, 0.065, dir.y);
    cloudA = d * fade * 0.94;
    col = mix(col, cc, cloudA);
  }
  #endif

  #ifndef ENV_CAPTURE
  // sun disc (stylised: larger than life, limb darkened, reddened by extinction)
  float sunVis = clear * (1.0 - cloudA * 0.85) * (1.0 - uNight);
  float disc = smoothstep(0.99978, 0.99988, cosTheta);
  float discGain = mix(5.0, 26.0, smoothstep(0.02, 0.32, uSunDir.y)); // a low sun stays orange instead of clipping to white
  vec3 discCol = uSunDiscColor * mix(vec3(1.0, 0.72, 0.42), vec3(1.0), smoothstep(0.0, 0.3, uSunDir.y));
  col += discCol * (disc * discGain + pow(max(cosTheta, 0.0), 1600.0) * 1.6 + pow(max(cosTheta, 0.0), 90.0) * 0.16) * sunVis;

  // moon
  float cosMoon = dot(dir, uMoonDir);
  float moonDisc = smoothstep(0.99958, 0.99970, cosMoon);
  if (moonDisc > 0.0 && uNight > 0.01) {
    vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 upv = cross(right, uMoonDir);
    vec2 muv = vec2(dot(dir, right), dot(dir, upv)) / 0.029;
    float maria = texture2D(uNoise, muv * 0.21 + 0.37).r;
    float craters = texture2D(uNoise, muv * 0.6 + 0.11).g;
    float limb = sqrt(max(1.0 - dot(muv, muv), 0.0));
    vec3 moonCol = vec3(1.0, 0.97, 0.88) * (0.62 + 0.38 * smoothstep(0.35, 0.65, maria)) * (0.9 + 0.2 * craters) * (0.55 + 0.45 * limb);
    col = mix(col, moonCol * 2.6, moonDisc * uNight * (1.0 - cloudA * 0.8) * (1.0 - uRain * 0.9));
  }
  #endif

  // horizon haze: melt into the fog colour so the fogged sea and the karsts meet the sky seamlessly;
  // keep the glow around a low sun
  float haze = exp(-up * mix(24.0, 5.0, uRain)) * mix(0.82, 0.96, uRain);
  vec2 fd = normalize(dir.xz + vec2(1e-5));
  vec2 fs = normalize(uSunDir.xz + vec2(1e-5));
  float nearSun = pow(max(dot(fd, fs), 0.0), 10.0) * (1.0 - uNight) * clear * smoothstep(-0.12, 0.02, uSunDir.y);
  haze *= 1.0 - 0.75 * nearSun;
  col = mix(col, uFogColor, haze);

  // below the horizon: ground / sea bounce (matters for the environment map)
  col = mix(col, uGround, smoothstep(0.0, -0.22, dir.y));

  #ifndef ENV_CAPTURE
  col *= 1.0 + (hash21(gl_FragCoord.xy) - 0.5) * 0.014; // dither against banding
  #endif
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

type SkyUniforms = Record<string, THREE.IUniform>;

/** Sky dome (drawn on the far plane) + a tiny scene with the same shader used to bake the environment map. */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly envScene: THREE.Scene;
  readonly uniforms: SkyUniforms;
  private readonly material: THREE.ShaderMaterial;
  private readonly envMaterial: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly envMesh: THREE.Mesh;
  private cloudX = 0;
  private cloudZ = 0;

  constructor(noise: THREE.Texture, clouds: boolean) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 0.2, -1) },
      uBetaR: { value: new THREE.Vector3() },
      uBetaM: { value: new THREE.Vector3() },
      uSunE: { value: 1000 },
      uMieG: { value: SKY_PARAMS.mieG },
      uGain: { value: SKY_PARAMS.gain },
      uCurve: { value: SKY_PARAMS.curve },
      uSkySat: { value: 1 },
      uElevRemap: { value: SKY_PARAMS.elevationRemap },
      uNight: { value: 0 },
      uTwilight: { value: 0 },
      uGlow: { value: 0 },
      uWarm: { value: 0 },
      uRain: { value: 0 },
      uOvercast: { value: new THREE.Color() },
      uSunDiscColor: { value: new THREE.Color() },
      uFogColor: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uCloudCover: { value: 0.4 },
      uCloudOffset: { value: new THREE.Vector2() },
      uStars: { value: 0 },
      uTime: { value: 0 },
      uNoise: { value: noise },
    };
    const make = (env: boolean): THREE.ShaderMaterial => {
      const defines: Record<string, string> = {};
      if (clouds || env) defines.USE_CLOUDS = '1';
      if (env) defines.ENV_CAPTURE = '1';
      return new THREE.ShaderMaterial({
        name: env ? 'SkyEnv' : 'Sky',
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        defines,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        fog: false,
        toneMapped: false,
      });
    };
    this.material = make(false);
    this.envMaterial = make(true);
    this.geometry = new THREE.IcosahedronGeometry(1, 3);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 900; // after the opaque world: most of it is depth-rejected
    this.mesh.matrixAutoUpdate = false;

    this.envScene = new THREE.Scene();
    this.envMesh = new THREE.Mesh(this.geometry, this.envMaterial);
    this.envMesh.frustumCulled = false;
    this.envMesh.scale.setScalar(10);
    this.envScene.add(this.envMesh);
  }

  setClouds(enabled: boolean): void {
    const has = this.material.defines.USE_CLOUDS !== undefined;
    if (has === enabled) return;
    if (enabled) this.material.defines.USE_CLOUDS = '1';
    else delete this.material.defines.USE_CLOUDS;
    this.material.needsUpdate = true;
  }

  update(st: AtmosphereState, camera: THREE.PerspectiveCamera, dt: number, time: number, wind: number): void {
    const u = this.uniforms;
    (u.uSunDir.value as THREE.Vector3).copy(st.sunDir);
    (u.uMoonDir.value as THREE.Vector3).copy(st.moonDir);
    (u.uBetaR.value as THREE.Vector3).copy(st.betaR);
    (u.uBetaM.value as THREE.Vector3).copy(st.betaM);
    u.uSunE.value = st.sunE;
    u.uSkySat.value = st.skySaturation;
    u.uNight.value = st.night;
    u.uTwilight.value = st.twilight;
    u.uGlow.value = st.glow;
    u.uWarm.value = st.warm;
    u.uRain.value = st.rain;
    (u.uOvercast.value as THREE.Color).copy(st.overcast);
    (u.uSunDiscColor.value as THREE.Color).copy(st.sunDiscColor);
    (u.uFogColor.value as THREE.Color).copy(st.fog);
    (u.uGround.value as THREE.Color).copy(st.ground);
    (u.uCloudLit.value as THREE.Color).copy(st.cloudLit);
    (u.uCloudShade.value as THREE.Color).copy(st.cloudShade);
    u.uCloudCover.value = st.cloudCover;
    u.uStars.value = st.stars;
    u.uTime.value = time;
    const speed = (0.0016 + 0.0034 * wind + 0.004 * st.rain) * dt;
    this.cloudX = (this.cloudX + speed) % 64;
    this.cloudZ = (this.cloudZ + speed * 0.35) % 64;
    (u.uCloudOffset.value as THREE.Vector2).set(this.cloudX, this.cloudZ);

    // keep the dome around the camera and inside the frustum for passes that use override materials
    const s = camera.far * 0.9;
    const m = this.mesh.matrix;
    m.makeScale(s, s, s);
    m.setPosition(camera.position);
    this.mesh.matrixWorldNeedsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.envMaterial.dispose();
  }
}
