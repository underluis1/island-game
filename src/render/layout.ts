import { fbm2, smoothstep, vnoise2 } from './util/noise';

/**
 * Static layout of the bay. Everything that needs to agree on "where is the sand / where is the sea"
 * (terrain mesh, sea shader depth map, prop scattering, boats, crabs, paths) goes through this module.
 */

export const SEA_LEVEL = -0.42;

/** flat, empty building pad reserved for the stall / shop: y = 0 exactly */
export const PAD = { minX: -6, maxX: 6, minZ: -5, maxZ: 6 } as const;
const PAD_BLEND = 3.2;

/** region covered by the sea-bed depth texture */
export const HEIGHT_RECT = { minX: -420, maxX: 420, minZ: -470, maxZ: 54 } as const;

/** z of the water line for a given x: gentle meander, and the bay closes towards the headlands */
export function shorelineZ(x: number): number {
  const ax = Math.abs(x);
  const meander = 1.1 * Math.sin(x * 0.045 + 0.6) + 0.55 * Math.sin(x * 0.11 + 2.0);
  const cove = ax > 38 ? Math.pow((ax - 38) / 62, 2) * 26 : 0;
  // keep the stretch in front of the stall well behaved
  const calm = smoothstep(4, 24, ax);
  return -16 + meander * (0.35 + 0.65 * calm) - cove;
}

/** 0 outside the pad influence, 1 inside the pad */
export function padMask(x: number, z: number): number {
  const dx = Math.max(PAD.minX - x, 0, x - PAD.maxX);
  const dz = Math.max(PAD.minZ - z, 0, z - PAD.maxZ);
  const d = Math.hypot(dx, dz);
  return 1 - smoothstep(0, PAD_BLEND, d);
}

export function insidePad(x: number, z: number, margin = 0): boolean {
  return x > PAD.minX - margin && x < PAD.maxX + margin && z > PAD.minZ - margin && z < PAD.maxZ + margin;
}

/** height of the sand / sea bed */
export function terrainHeight(x: number, z: number): number {
  const d = z - shorelineZ(x); // > 0 inland
  let y: number;
  if (d >= 0) {
    // beach face rising from the water line to the berm
    const t = Math.min(d / 11, 1);
    const f = 1 - Math.pow(1 - t, 2.2);
    y = SEA_LEVEL * (1 - f);
    if (d > 6) {
      // soft dunes and churned sand
      const duneAmt = smoothstep(6, 16, d);
      const dunes = (fbm2(x * 0.085 + 3.7, z * 0.085 - 1.2, 3, 71) - 0.5) * 0.5 + (vnoise2(x * 0.33, z * 0.33, 73) - 0.5) * 0.09;
      y += dunes * duneAmt;
      // the back of the beach climbs into the jungle
      if (d > 24) {
        const k = smoothstep(24, 80, d);
        y += k * k * (9 + 7 * fbm2(x * 0.02, z * 0.02, 3, 79)) + smoothstep(24, 40, d) * 0.5;
      }
    }
    // tiny beach cusps near the swash zone
    y += Math.sin(x * 0.55 + Math.sin(x * 0.13) * 2) * 0.018 * smoothstep(0, 2, d) * smoothstep(7, 3, d);
  } else {
    const u = -d;
    const slope = 0.047 * u + 0.00085 * u * u;
    const bars = (fbm2(x * 0.06, z * 0.09, 3, 83) - 0.5) * 0.5 * smoothstep(3, 14, u);
    y = SEA_LEVEL - Math.min(slope, 15 + u * 0.004) + bars * Math.min(1, u / 30);
  }
  const m = padMask(x, z);
  return m >= 1 ? 0 : y * (1 - m);
}
