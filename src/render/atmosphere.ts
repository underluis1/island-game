import * as THREE from 'three';
import { clamp01, lerp, smoothstep } from './util/noise';

/**
 * Day/night model shared by sky shader, lights, fog and sea.
 *
 * World orientation: the sea is towards -Z. Azimuth is measured from -Z, positive towards -X (left of the
 * default stall camera). The sun rises on the right (+X, slightly behind the camera), culminates high in
 * front-right and sets over the sea at azimuth +18° — inside the default framing.
 */

const DEG = Math.PI / 180;

export const SUNRISE_H = 6.0;
export const SUNSET_H = 18.6;
const SUN_MAX_ELEV = 68 * DEG;
const SUN_MIN_ELEV = -55 * DEG;
const AZ_RISE = -105 * DEG;
const AZ_SET = 18 * DEG;

// Preetham-style coefficients (same constants as the classic analytic daylight model)
const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5] as const;
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14] as const;
const CUTOFF_ANGLE = 1.6110731556870734;
const STEEPNESS = 1.5;
const SUN_EE = 1000;
const RAYLEIGH_ZENITH = 8.4e3;
const MIE_ZENITH = 1.25e3;

export const SKY_PARAMS = {
  turbidity: 3.2,
  rayleigh: 2.7,
  mieCoefficient: 0.0036,
  mieG: 0.82,
  /** overall radiance gain of the analytic day sky (scene-referred, before ACES) */
  gain: 0.2,
  /** contrast curve applied to the analytic sky: deepens the zenith blue and the sunset reds */
  curve: 1.5,
  /** the visible band of sky is only ~11° tall: sample the model higher up so the blue reaches the horizon */
  elevationRemap: 0.62,
  /** key light intensity at noon */
  sunIntensity: 3.0,
};

export interface AtmosphereState {
  time: number;
  rain: number;
  /** true sun direction (may be below the horizon) */
  sunDir: THREE.Vector3;
  /** true moon direction (low over the sea so its glitter path stays in frame) */
  moonDir: THREE.Vector3;
  sunElevation: number;
  /** 0 day … 1 full night */
  night: number;
  /** 0..1 strength of the dusk/dawn blue hour tint */
  twilight: number;
  /** 0..1 strength of the warm horizon band (golden hour → afterglow) */
  glow: number;
  /** 0..1 golden hour warmth of the sky around the sun */
  warm: number;
  lampsOn: boolean;

  /** direction towards the active key light (sun, or a raised moon at night) */
  lightDir: THREE.Vector3;
  lightColor: THREE.Color;
  lightIntensity: number;
  /** direction + radiance used for glitter on the sea (true sun or true moon) */
  glintDir: THREE.Vector3;
  glintColor: THREE.Color;

  /** sky shader inputs */
  betaR: THREE.Vector3;
  betaM: THREE.Vector3;
  sunE: number;
  /** extra saturation of the analytic sky when the sun is low (golden hour / sunset) */
  skySaturation: number;
  sunDiscColor: THREE.Color;
  overcast: THREE.Color;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
  cloudCover: number;
  stars: number;

  /** derived colours (scene-referred linear) */
  zenith: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  ground: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  envIntensity: number;
}

export function createAtmosphereState(): AtmosphereState {
  return {
    time: 12,
    rain: 0,
    sunDir: new THREE.Vector3(0, 1, 0),
    moonDir: new THREE.Vector3(0, 0.2, -1).normalize(),
    sunElevation: 1,
    night: 0,
    twilight: 0,
    glow: 0,
    warm: 0,
    lampsOn: false,
    lightDir: new THREE.Vector3(0, 1, 0),
    lightColor: new THREE.Color(1, 1, 1),
    lightIntensity: 3,
    glintDir: new THREE.Vector3(0, 1, 0),
    glintColor: new THREE.Color(1, 1, 1),
    betaR: new THREE.Vector3(),
    betaM: new THREE.Vector3(),
    sunE: 1000,
    skySaturation: 1,
    sunDiscColor: new THREE.Color(1, 1, 1),
    overcast: new THREE.Color(0.4, 0.44, 0.48),
    cloudLit: new THREE.Color(1, 1, 1),
    cloudShade: new THREE.Color(0.5, 0.55, 0.6),
    cloudCover: 0.4,
    stars: 0,
    zenith: new THREE.Color(0.1, 0.3, 0.7),
    horizon: new THREE.Color(0.6, 0.75, 0.9),
    fog: new THREE.Color(0.6, 0.75, 0.9),
    fogDensity: 0.002,
    ground: new THREE.Color(0.3, 0.3, 0.25),
    hemiSky: new THREE.Color(0.3, 0.5, 0.8),
    hemiGround: new THREE.Color(0.4, 0.35, 0.25),
    hemiIntensity: 0.9,
    envIntensity: 0.75,
  };
}

function dirFromAzEl(az: number, el: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(el);
  return out.set(-Math.sin(az) * c, Math.sin(el), -Math.cos(az) * c);
}

function wrapHours(h: number): number {
  const m = h % 24;
  return m < 0 ? m + 24 : m;
}

export function sunDirectionAt(time: number, out: THREE.Vector3): THREE.Vector3 {
  const t = wrapHours(time);
  const dayLen = SUNSET_H - SUNRISE_H;
  if (t >= SUNRISE_H && t <= SUNSET_H) {
    const s = (t - SUNRISE_H) / dayLen;
    return dirFromAzEl(lerp(AZ_RISE, AZ_SET, s), SUN_MAX_ELEV * Math.sin(Math.PI * s), out);
  }
  const s = wrapHours(t - SUNSET_H) / (24 - dayLen);
  return dirFromAzEl(lerp(AZ_SET, AZ_RISE + Math.PI * 2, s), SUN_MIN_ELEV * Math.sin(Math.PI * s), out);
}

export function moonDirectionAt(time: number, out: THREE.Vector3): THREE.Vector3 {
  const s = clamp01(wrapHours(time - 18) / 12.5);
  return dirFromAzEl(lerp(44 * DEG, -10 * DEG, s), (5 + 3.6 * Math.sin(Math.PI * s)) * DEG, out);
}

// ----------------------------------------------------------------------------------------------
// Analytic sky (CPU port of the GLSL in sky.ts — keep the two in sync)
// ----------------------------------------------------------------------------------------------

function sunIntensity(cosZenith: number): number {
  const c = Math.min(1, Math.max(-1, cosZenith));
  return SUN_EE * Math.max(0, 1 - Math.exp(-((CUTOFF_ANGLE - Math.acos(c)) / STEEPNESS)));
}

function hgPhase(cosTheta: number, g: number): number {
  const g2 = g * g;
  return (0.07957747154594767 * (1 - g2)) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5);
}

const NIGHT_ZENITH = [0.0075, 0.013, 0.034] as const;
const NIGHT_HORIZON = [0.021, 0.036, 0.074] as const;
const TW_ORANGE = [1.0, 0.4, 0.13] as const;
const TW_PINK = [0.5, 0.2, 0.34] as const;
const TW_BLUE = [0.035, 0.07, 0.2] as const;
const MOON_GLOW = [0.5, 0.62, 0.9] as const;
const WARM_TINT = [1.12, 0.84, 0.56] as const;
const VENUS = [0.5, 0.24, 0.3] as const;

const _rgb: [number, number, number] = [0, 0, 0];

/** sky radiance (no clouds, stars or discs) towards unit direction (dx,dy,dz) */
function sampleSkyRGB(st: AtmosphereState, dx: number, dy: number, dz: number, out: [number, number, number]): void {
  const sun = st.sunDir;
  const up = Math.max(0, dy);
  const zenithAngle = Math.acos(Math.pow(up, SKY_PARAMS.elevationRemap));
  const inv = 1 / (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  const sR = RAYLEIGH_ZENITH * inv;
  const sM = MIE_ZENITH * inv;
  const cosTheta = dx * sun.x + dy * sun.y + dz * sun.z;
  const rPhase = 0.05968310365946075 * (1 + Math.pow(cosTheta * 0.5 + 0.5, 2));
  const mPhase = hgPhase(cosTheta, SKY_PARAMS.mieG);
  const sunfade = clamp01(Math.exp(sun.y));
  const mixK = clamp01(Math.pow(1 - sun.y, 5));
  const gamma = 1 / (1.2 + 1.2 * sunfade);
  const bR = [st.betaR.x, st.betaR.y, st.betaR.z];
  const bM = [st.betaM.x, st.betaM.y, st.betaM.z];
  const flat = Math.hypot(dx, dz) || 1;
  const sunFlat = Math.hypot(sun.x, sun.z) || 1;
  const azAlign = Math.max(0, (dx * sun.x + dz * sun.z) / (flat * sunFlat));
  const moon = st.moonDir;
  const cosMoon = Math.max(0, dx * moon.x + dy * moon.y + dz * moon.z);
  const nightMix = Math.pow(up, 0.45);
  const lowBand = Math.exp(-up * 7);
  const midBand = Math.exp(-up * 2.6);
  const day: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const br = bR[i] as number;
    const bm = bM[i] as number;
    const fex = Math.exp(-(br * sR + bm * sM));
    const scatter = (br * rPhase + bm * mPhase) / (br + bm);
    let lin = Math.pow(Math.max(0, st.sunE * scatter * (1 - fex)), 1.5);
    lin *= lerp(1, Math.pow(Math.max(0, st.sunE * scatter * fex), 0.5), mixK);
    const l0 = 0.1 * fex;
    day[i] = Math.pow(Math.pow(Math.max(0, (lin + l0) * 0.04 + (i === 1 ? 0.0003 : i === 2 ? 0.00075 : 0)), gamma), SKY_PARAMS.curve) * SKY_PARAMS.gain;
  }
  const luma = day[0] * 0.2126 + day[1] * 0.7152 + day[2] * 0.0722;
  const antiAz = Math.max(0, -(dx * sun.x + dz * sun.z) / (flat * sunFlat));
  const warmK = st.warm * (0.35 + 0.65 * azAlign * azAlign) * midBand;
  for (let i = 0; i < 3; i++) {
    let c = Math.max(0, luma + ((day[i] as number) - luma) * st.skySaturation);
    c *= lerp(1, WARM_TINT[i] as number, warmK);
    c *= 1 - st.night;
    // belt of Venus: rosy band opposite a low sun
    c += st.glow * (VENUS[i] as number) * antiAz * antiAz * Math.exp(-Math.pow((up - 0.11) * 9, 2)) * 0.5;
    // dusk / dawn afterglow
    const glow = lerp(TW_PINK[i] as number, TW_ORANGE[i] as number, lowBand) * (0.25 + 0.75 * azAlign * azAlign) * midBand * 0.55;
    c += st.glow * glow + st.twilight * (TW_BLUE[i] as number) * (0.6 + 0.4 * up);
    // night
    c += st.night * lerp(NIGHT_HORIZON[i] as number, NIGHT_ZENITH[i] as number, nightMix);
    c += st.night * (MOON_GLOW[i] as number) * (Math.pow(cosMoon, 40) * 0.05 + Math.pow(cosMoon, 6) * 0.012);
    // overcast
    const oc = (i === 0 ? st.overcast.r : i === 1 ? st.overcast.g : st.overcast.b) * (0.8 + 0.35 * up);
    out[i] = lerp(c, oc, st.rain * 0.88);
  }
}

const SUN_RAMP: readonly (readonly [number, number, number, number])[] = [
  // elevation (deg), r, g, b
  [-4, 1.0, 0.26, 0.07],
  [0, 1.0, 0.33, 0.08],
  [4, 1.0, 0.45, 0.15],
  [10, 1.0, 0.6, 0.28],
  [18, 1.0, 0.76, 0.48],
  [30, 1.0, 0.9, 0.74],
  [50, 1.0, 0.96, 0.88],
  [90, 1.0, 0.97, 0.91],
];

function sunColorAt(elevDeg: number, out: THREE.Color): THREE.Color {
  const first = SUN_RAMP[0] as readonly [number, number, number, number];
  if (elevDeg <= first[0]) return out.setRGB(first[1], first[2], first[3]);
  for (let i = 1; i < SUN_RAMP.length; i++) {
    const b = SUN_RAMP[i] as readonly [number, number, number, number];
    if (elevDeg <= b[0]) {
      const a = SUN_RAMP[i - 1] as readonly [number, number, number, number];
      const t = (elevDeg - a[0]) / (b[0] - a[0]);
      return out.setRGB(lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t));
    }
  }
  const last = SUN_RAMP[SUN_RAMP.length - 1] as readonly [number, number, number, number];
  return out.setRGB(last[1], last[2], last[3]);
}

const _tmpColor = new THREE.Color();
const _moonLight = new THREE.Vector3();

/** Computes every time-of-day dependent quantity. No allocations. */
export function computeAtmosphere(time: number, rain: number, st: AtmosphereState): AtmosphereState {
  const t = wrapHours(time);
  const r = clamp01(rain);
  st.time = t;
  st.rain = r;
  sunDirectionAt(t, st.sunDir);
  moonDirectionAt(t, st.moonDir);
  const elev = Math.asin(Math.min(1, Math.max(-1, st.sunDir.y)));
  const elevDeg = elev / DEG;
  st.sunElevation = elev;
  st.night = smoothstep(-1.0, -11, elevDeg);
  st.twilight = smoothstep(-17, -3, elevDeg) * smoothstep(7, -1.5, elevDeg) * (1 - r * 0.8);
  st.warm = smoothstep(28, 5, elevDeg) * (1 - r);
  st.glow = smoothstep(-17, -4, elevDeg) * smoothstep(24, 1, elevDeg) * (1 - r * 0.8);
  st.lampsOn = elevDeg < 3.5;

  // --- scattering coefficients
  const sunfade = clamp01(Math.exp(st.sunDir.y));
  const rayleighCoefficient = SKY_PARAMS.rayleigh - (1 - sunfade);
  const mieScale = 0.434 * (0.2 * SKY_PARAMS.turbidity * 10e-18) * SKY_PARAMS.mieCoefficient;
  st.betaR.set(TOTAL_RAYLEIGH[0] * rayleighCoefficient, TOTAL_RAYLEIGH[1] * rayleighCoefficient, TOTAL_RAYLEIGH[2] * rayleighCoefficient);
  st.betaM.set(MIE_CONST[0] * mieScale, MIE_CONST[1] * mieScale, MIE_CONST[2] * mieScale);
  st.sunE = sunIntensity(st.sunDir.y);
  st.skySaturation = 1.25 + 0.7 * smoothstep(30, 3, elevDeg);

  // --- key light
  const dayLight = smoothstep(-1.5, 13, elevDeg);
  const sunI = SKY_PARAMS.sunIntensity * Math.pow(dayLight, 0.8) * (1 - 0.82 * r);
  const moonI = 1.15 * smoothstep(-3, -10, elevDeg) * (1 - 0.6 * r);
  sunColorAt(elevDeg, st.sunDiscColor);
  if (elevDeg > -2.2) {
    // keep the shadow direction sane while the sun grazes the horizon
    const el = Math.max(elev, 5.5 * DEG);
    const flat = Math.hypot(st.sunDir.x, st.sunDir.z) || 1;
    const c = Math.cos(el);
    st.lightDir.set((st.sunDir.x / flat) * c, Math.sin(el), (st.sunDir.z / flat) * c);
    st.lightColor.copy(st.sunDiscColor);
    st.lightIntensity = sunI;
    st.glintDir.copy(st.sunDir);
    if (st.glintDir.y < 0.012) {
      st.glintDir.y = 0.012;
      st.glintDir.normalize();
    }
    st.glintColor.copy(st.sunDiscColor).multiplyScalar(sunI * (1.3 + 1.5 * smoothstep(25, 3, elevDeg)));
  } else {
    // moonlight comes from the moon's azimuth but from higher up, so the beach is readable
    const flat = Math.hypot(st.moonDir.x, st.moonDir.z) || 1;
    const el = 27 * DEG;
    _moonLight.set((st.moonDir.x / flat) * Math.cos(el), Math.sin(el), (st.moonDir.z / flat) * Math.cos(el));
    st.lightDir.copy(_moonLight);
    st.lightColor.setRGB(0.56, 0.7, 1.0);
    st.lightIntensity = moonI;
    st.glintDir.copy(st.moonDir);
    st.glintColor.setRGB(0.62, 0.74, 1.0).multiplyScalar(moonI * 2.4);
  }

  // --- overcast & clouds
  const dayLevel = smoothstep(-8, 12, elevDeg);
  st.overcast.setRGB(0.33, 0.37, 0.41).multiplyScalar(0.05 + 0.95 * dayLevel);
  st.cloudCover = lerp(0.42, 0.97, Math.pow(r, 0.7));
  st.stars = st.night * (1 - r);

  // --- derived colours
  sampleSkyRGB(st, 0, 1, 0, _rgb);
  st.zenith.setRGB(_rgb[0], _rgb[1], _rgb[2]);
  // horizon: average of a few azimuths slightly above the horizon, biased to the sea side
  let hr = 0;
  let hg = 0;
  let hb = 0;
  const hy = 0.06;
  const hs = Math.sqrt(1 - hy * hy);
  const AZS = [-0.5, 0.1, 0.45, 0.9, 2.2, -2.2];
  const WTS = [1.2, 1.4, 1.4, 1.2, 0.6, 0.6];
  let wsum = 0;
  for (let i = 0; i < AZS.length; i++) {
    const az = AZS[i] as number;
    const w = WTS[i] as number;
    sampleSkyRGB(st, -Math.sin(az) * hs, hy, -Math.cos(az) * hs, _rgb);
    hr += _rgb[0] * w;
    hg += _rgb[1] * w;
    hb += _rgb[2] * w;
    wsum += w;
  }
  st.horizon.setRGB(hr / wsum, hg / wsum, hb / wsum);
  // fog: horizon colour, slightly desaturated towards the zenith tint
  st.fog.copy(st.horizon).lerp(st.zenith, 0.12);
  st.fogDensity = lerp(0.00125, 0.0048, r) * (1 + 0.25 * st.twilight);

  // clouds: lit by the key light + sky, shaded side takes the zenith tint
  const lit = st.cloudLit;
  lit.copy(st.sunDiscColor).multiplyScalar(0.34 * Math.pow(dayLight, 0.6) + 0.05 * st.twilight);
  lit.r += st.horizon.r * 0.55 + 0.03 * st.night;
  lit.g += st.horizon.g * 0.55 + 0.04 * st.night;
  lit.b += st.horizon.b * 0.55 + 0.065 * st.night;
  st.cloudShade.copy(st.zenith).lerp(st.horizon, 0.45).multiplyScalar(0.72);
  lit.lerp(_tmpColor.copy(st.overcast).multiplyScalar(1.05), r * 0.85);
  st.cloudShade.lerp(_tmpColor.copy(st.overcast).multiplyScalar(0.55), r * 0.9);

  // ground bounce seen by the environment map (sand + shallow sea)
  const bounce = st.lightIntensity * Math.max(0.15, st.lightDir.y) * 0.2;
  st.ground.setRGB(
    0.8 * (st.lightColor.r * bounce + st.zenith.r * 0.45 + st.horizon.r * 0.2),
    0.76 * (st.lightColor.g * bounce + st.zenith.g * 0.45 + st.horizon.g * 0.2),
    0.66 * (st.lightColor.b * bounce + st.zenith.b * 0.45 + st.horizon.b * 0.2),
  );

  // hemisphere fill (also the only ambient for non-PBR materials)
  st.hemiSky.copy(st.zenith).lerp(st.horizon, 0.5);
  st.hemiSky.r += 0.035 * st.night;
  st.hemiSky.g += 0.055 * st.night;
  st.hemiSky.b += 0.11 * st.night;
  st.hemiGround.copy(st.ground);
  // the displayed sky is brighter than a physically matched one (so it reads as a saturated tropical blue):
  // scale its contribution as a light source back down to keep sunlit / shadow contrast
  // (when the sun is low the sky is the main light source again)
  const lowSun = smoothstep(22, 2, elevDeg);
  st.hemiIntensity = lerp(lerp(0.42, 0.75, lowSun), 0.9, st.night);
  st.envIntensity = lerp(lerp(0.5, 1.15, lowSun), 1.6, st.night);
  return st;
}

/** radiance of the analytic sky towards `dir` (used by tests / debugging tools) */
export function sampleSky(st: AtmosphereState, dir: THREE.Vector3, out: THREE.Color): THREE.Color {
  sampleSkyRGB(st, dir.x, dir.y, dir.z, _rgb);
  return out.setRGB(_rgb[0], _rgb[1], _rgb[2]);
}
