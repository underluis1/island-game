/** Costruzione della geometria unica (skinned, vertex color) di un personaggio a partire dal suo Look. */
import * as THREE from 'three';
import { GeoBuilder, mix, shade, type Hex, type Ring } from './geo';
import type { Look } from './look';
import { B, D, type Dims } from './rig';

export interface Body {
  geometry: THREE.BufferGeometry;
  dims: Dims;
  /** intervallo di vertici [from, to) della scocca del telefono in mano (ricolorabile) */
  phoneFrom: number;
  phoneTo: number;
  triangles: number;
}

type Skin3 = [number, number, number];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const sm = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
const hash = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function interp(pts: readonly (readonly number[])[], y: number, col: number): number {
  const first = pts[0] as readonly number[];
  const last = pts[pts.length - 1] as readonly number[];
  const asc = (last[0] as number) > (first[0] as number);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i] as readonly number[];
    const b = pts[i + 1] as readonly number[];
    const lo = asc ? (a[0] as number) : (b[0] as number);
    const hi = asc ? (b[0] as number) : (a[0] as number);
    if (y >= lo && y <= hi) {
      const t = ((y - (a[0] as number)) / ((b[0] as number) - (a[0] as number))) as number;
      return lerp(a[col] as number, b[col] as number, t);
    }
  }
  const useFirst = asc ? y < (first[0] as number) : y > (first[0] as number);
  return (useFirst ? first[col] : last[col]) as number;
}

export function buildBody(L: Look): Body {
  const g = new GeoBuilder();
  const bw = L.build;
  const fem = L.female;
  const shX = (fem ? 0.158 : 0.172) * L.shoulders + (bw - 1) * 0.05;
  const hipX = (fem ? 0.088 : 0.084) + (bw - 1) * 0.03;
  const dims: Dims = { shX, hipX };
  const skin = L.skin;
  const cy = D.headCY;
  const M = new THREE.Matrix4();
  const M2 = new THREE.Matrix4();

  // ------------------------------------------------------------------ busto
  const TP: number[][] = [
    [0.8, 0.07 * bw, 0.065 * bw, 0],
    [0.86, (fem ? 0.138 : 0.128) * bw, 0.098 * bw, 0],
    [0.93, (fem ? 0.142 : 0.134) * bw, 0.102 * bw, 0],
    [1.01, (fem ? 0.112 : 0.126) * bw, 0.094 * bw + L.belly * 0.03, L.belly * 0.022],
    [1.1, (fem ? 0.116 : 0.132) * bw, 0.098 * bw + L.belly * 0.035, L.belly * 0.026],
    [1.2, (fem ? 0.134 : 0.15) * bw, 0.106 * bw + (fem ? 0.012 : 0), fem ? 0.008 : 0.003],
    [1.3, shX + 0.004, 0.102 * bw, 0],
    [1.365, shX - 0.018, 0.084 * bw, 0],
    [1.405, 0.06, 0.056, 0],
  ];
  const tRX = (y: number): number => interp(TP, y, 1);
  const tRZ = (y: number): number => interp(TP, y, 2);
  const tCZ = (y: number): number => interp(TP, y, 3);
  const torsoSkin = (y: number): Skin3 => {
    if (y < 0.93) return [B.hips, B.hips, 0];
    if (y < 1.02) return [B.hips, B.spine, (y - 0.93) / 0.09];
    if (y < 1.1) return [B.spine, B.spine, 0];
    if (y < 1.2) return [B.spine, B.chest, (y - 1.1) / 0.1];
    return [B.chest, B.chest, 0];
  };
  const bareTop = L.top === 'bare';
  const tight = L.top === 'rash';
  const topT = bareTop ? 0 : tight ? 0.003 : 0.007;
  const tucked = bareTop || tight || L.apron !== null || L.bottom === 'skirt' || (L.top === 'shirt' && L.tie !== null);
  const hemTop = tucked ? 0.985 : 0.925;
  const topCol = bareTop ? skin : L.topColor;
  const neckline = L.top === 'tank' ? 1.31 : 1.388;
  /** z della superficie frontale del busto (vestito incluso) in (x, y) */
  const tFront = (x: number, y: number, off = 0): number => {
    const rx = tRX(y) + (y >= hemTop ? topT : 0.004);
    const rz = tRZ(y) + (y >= hemTop ? topT : 0.004);
    const u = Math.min(0.98, Math.abs(x) / rx);
    return tCZ(y) + rz * Math.sqrt(1 - u * u) + off;
  };
  const tBack = (x: number, y: number, off = 0): number => {
    const rx = tRX(y) + topT;
    const rz = tRZ(y) + topT;
    const u = Math.min(0.98, Math.abs(x) / rx);
    return tCZ(y) - rz * Math.sqrt(1 - u * u) - off;
  };
  {
    const rings: Ring[] = [];
    const kinds: number[] = []; // 0 bottom, 1 top, 2 skin
    const ring = (y: number, c: Hex, extra: number, kind: number): void => {
      const s = torsoSkin(y);
      rings.push({ x: 0, y, z: tCZ(y), rx: tRX(y) + extra, rz: tRZ(y) + extra, c, b0: s[0], b1: s[1], w1: s[2] });
      kinds.push(kind);
    };
    const ys = [0.8, 0.86, 0.93, 1.01, 1.1, 1.2, 1.3, 1.365];
    for (const y of ys) if (y < hemTop - 0.02) ring(y, L.bottomColor, y > 0.82 ? 0.004 : 0, 0);
    ring(hemTop, L.bottomColor, 0.004, 0);
    ring(hemTop, topCol, topT + (tucked ? 0 : 0.012), bareTop ? 2 : 1);
    for (const y of ys) if (y > hemTop + 0.02 && y < neckline - 0.01) ring(y, topCol, topT, bareTop ? 2 : 1);
    if (!bareTop) {
      ring(neckline, topCol, topT + 0.003, 1);
      ring(neckline, skin, 0, 2);
    }
    for (const y of ys) if (y > neckline + 0.01) ring(y, skin, 0, 2);
    ring(1.405, skin, 0, 2);
    const accentSides = tight;
    g.tube(rings, 12, {
      capA: true,
      colorAt: accentSides ? (i, _k, ang) => (kinds[i] === 1 && Math.abs(Math.cos(ang)) > 0.8 ? L.topAccent : undefined) : undefined,
    });
  }
  // collo
  g.tube(
    [
      { x: 0, y: 1.385, z: 0, rx: 0.05, rz: 0.048, c: skin, b0: B.chest },
      { x: 0, y: 1.43, z: 0.004, rx: 0.045, rz: 0.045, c: skin, b0: B.neck },
      { x: 0, y: 1.49, z: 0.008, rx: 0.046, rz: 0.046, c: skin, b0: B.neck, b1: B.head, w1: 0.6 },
    ],
    8,
  );
  // spalline della canotta
  if (L.top === 'tank') {
    for (const sx of [1, -1]) {
      const x0 = sx * 0.062;
      const w = 0.022;
      const yA = 1.305;
      const front: [number, number, number][] = [
        [x0 - w, yA, tFront(x0 - w, yA, 0.002)],
        [x0 + w, yA, tFront(x0 + w, yA, 0.002)],
        [x0 + w, 1.378, tFront(x0 + w, 1.365, 0.004)],
        [x0 - w, 1.378, tFront(x0 - w, 1.365, 0.004)],
      ];
      g.poly(front, L.topColor, B.chest);
      const top: [number, number, number][] = [
        [x0 - w, 1.378, tFront(x0 - w, 1.365, 0.004)],
        [x0 + w, 1.378, tFront(x0 + w, 1.365, 0.004)],
        [x0 + w, 1.378, tBack(x0 + w, 1.365, 0.004)],
        [x0 - w, 1.378, tBack(x0 - w, 1.365, 0.004)],
      ];
      g.poly(top, L.topColor, B.chest);
      const back: [number, number, number][] = [
        [x0 + w, yA, tBack(x0 + w, yA, 0.002)],
        [x0 - w, yA, tBack(x0 - w, yA, 0.002)],
        [x0 - w, 1.378, tBack(x0 - w, 1.365, 0.004)],
        [x0 + w, 1.378, tBack(x0 + w, 1.365, 0.004)],
      ];
      g.poly(back, L.topColor, B.chest);
    }
  }
  /** griglia di quad appoggiata sul davanti del busto */
  const frontGrid = (xs: number[][], ys: number[], c: Hex | ((r: number, col: number) => Hex), off: number, skinFn: (x: number, y: number) => Skin3, zFn?: (x: number, y: number) => number): void => {
    const grp = g.group();
    const cols = (xs[0] as number[]).length;
    const start = g.vertexCount;
    ys.forEach((y, r) => {
      (xs[r] as number[]).forEach((x, ci) => {
        const s = skinFn(x, y);
        const col = typeof c === 'function' ? c(r, ci) : c;
        g.vert(x, y, zFn ? zFn(x, y) : tFront(x, y, off), col, grp, s[0], s[1], s[2]);
      });
    });
    for (let r = 0; r < ys.length - 1; r++) {
      for (let ci = 0; ci < cols - 1; ci++) {
        const a = start + r * cols + ci;
        const b = a + 1;
        const d = start + (r + 1) * cols + ci;
        const e = d + 1;
        // righe dall'alto verso il basso, x crescente → normale +Z
        g.quad(a, d, e, b);
      }
    }
  };
  const tSkinXY = (_x: number, y: number): Skin3 => torsoSkin(y);

  // ------------------------------------------------------------------ braccia e mani
  const limb = (cx: number, pts: number[][], hemY: number | null, cloth: Hex, thick: number, flare: number, bare: Hex, skinFn: (y: number) => Skin3, sides: number, capA: boolean): void => {
    const rings: Ring[] = [];
    const ring = (y: number, r: number, c: Hex): void => {
      const s = skinFn(y);
      rings.push({ x: cx, y, z: 0, rx: r, rz: r, c, b0: s[0], b1: s[1], w1: s[2] });
    };
    let hemDone = hemY === null;
    for (const p of pts) {
      const y = p[0] as number;
      const r = p[1] as number;
      if (!hemDone && hemY !== null && y <= hemY + 0.012) {
        const rh = interp(pts, hemY, 1);
        ring(hemY, rh + thick + flare, cloth);
        ring(hemY, rh - 0.002, bare);
        hemDone = true;
        if (y < hemY - 0.012) ring(y, r, bare);
      } else if (!hemDone) ring(y, r + thick, cloth);
      else ring(y, r, bare);
    }
    g.tube(rings, sides, { capA });
  };
  const ar = (fem ? 0.88 : 1) * (0.8 + 0.2 * bw) * (L.shoulders > 1.08 ? 1.08 : 1);
  const ARM = [
    [1.396, 0.012],
    [1.378, 0.035],
    [1.335, 0.046],
    [1.21, 0.046],
    [1.09, 0.043],
    [0.95, 0.037],
    [0.885, 0.03],
  ].map((p) => [p[0] as number, (p[1] as number) * ar]);
  const sleeveHem = L.sleeve === 0 ? null : L.sleeve === 1 ? 1.2 : 0.9;
  const sleeveCol = L.top === 'rash' ? L.topAccent : L.topColor;
  for (const sx of [1, -1]) {
    const arm = sx > 0 ? B.armL : B.armR;
    const fore = sx > 0 ? B.foreL : B.foreR;
    const hand = sx > 0 ? B.handL : B.handR;
    const armSkin = (y: number): Skin3 => {
      if (y > 1.36) return [B.chest, arm, 0.55];
      if (y > 1.3) return [arm, B.chest, 0.12];
      if (y > 1.13) return [arm, arm, 0];
      if (y > 1.08) return [arm, fore, 0.5];
      return [fore, fore, 0];
    };
    limb(sx * shX, ARM, sleeveHem, sleeveCol, tight ? 0.003 : 0.005, L.sleeve === 2 ? 0.003 : 0.01, skin, armSkin, 8, true);
    const hx = sx * shX;
    g.tube(
      [
        { x: hx, y: 0.89, z: 0.002, rx: 0.022 * ar, rz: 0.027 * ar, c: skin, b0: hand, b1: fore, w1: 0.5 },
        { x: hx, y: 0.86, z: 0.005, rx: 0.02, rz: 0.038, c: skin, b0: hand },
        { x: hx, y: 0.822, z: 0.006, rx: 0.021, rz: 0.042, c: skin, b0: hand },
        { x: hx, y: 0.795, z: 0.005, rx: 0.018, rz: 0.035, c: skin, b0: hand },
        { x: hx, y: 0.778, z: 0.004, rx: 0.008, rz: 0.016, c: skin, b0: hand },
      ],
      6,
      { capB: true },
    );
    g.ellipsoid(hx - sx * 0.006, 0.84, 0.046, 0.011, 0.026, 0.013, 4, 2, skin, hand);
  }

  // ------------------------------------------------------------------ gambe e piedi
  const lr = 0.82 + 0.18 * bw;
  const LEG = [
    [0.9, 0.066],
    [0.85, fem ? 0.086 : 0.082],
    [0.7, 0.072],
    [0.52, 0.057],
    [0.46, 0.054],
    [0.29, 0.05],
    [0.14, 0.037],
    [0.085, 0.034],
  ].map((p) => [p[0] as number, (p[1] as number) * lr]);
  let legHem: number | null = null;
  let legThick = 0.006;
  let legFlare = 0.012;
  if (L.bottom === 'shorts') legHem = 0.53;
  else if (L.bottom === 'pants') {
    legHem = 0.115;
    legThick = 0.009;
    legFlare = 0.008;
  } else if (L.bottom === 'wetsuit') {
    legHem = 0.115;
    legThick = 0.003;
    legFlare = 0.001;
  } else if (L.bottom === 'shorty') {
    legHem = 0.6;
    legThick = 0.003;
    legFlare = 0.001;
  }
  const soleT = L.shoes === 'barefoot' ? 0 : L.shoes === 'sneakers' ? 0.022 : L.shoes === 'shoes' ? 0.018 : 0.013;
  const closedShoe = L.shoes === 'sneakers' || L.shoes === 'shoes';
  for (const sx of [1, -1]) {
    const thigh = sx > 0 ? B.thighL : B.thighR;
    const shin = sx > 0 ? B.shinL : B.shinR;
    const foot = sx > 0 ? B.footL : B.footR;
    const legSkin = (y: number): Skin3 => {
      if (y > 0.88) return [B.hips, thigh, 0.5];
      if (y > 0.8) return [thigh, B.hips, 0.15];
      if (y > 0.5) return [thigh, thigh, 0];
      if (y > 0.44) return [thigh, shin, 0.5];
      return [shin, shin, 0];
    };
    const wet = L.bottom === 'wetsuit' || L.bottom === 'shorty';
    const lx = sx * hipX;
    {
      // la gamba: come limb(), ma con banda laterale per le mute
      const rings: Ring[] = [];
      const isCloth: boolean[] = [];
      const ring = (y: number, r: number, c: Hex, cl: boolean): void => {
        const s = legSkin(y);
        rings.push({ x: lx, y, z: 0, rx: r, rz: r, c, b0: s[0], b1: s[1], w1: s[2] });
        isCloth.push(cl);
      };
      let hemDone = legHem === null;
      for (const p of LEG) {
        const y = p[0] as number;
        const r = p[1] as number;
        if (!hemDone && legHem !== null && y <= legHem + 0.012) {
          const rh = interp(LEG, legHem, 1);
          ring(legHem, rh + legThick + legFlare, L.bottomColor, true);
          ring(legHem, rh - 0.002, skin, false);
          hemDone = true;
          if (y < legHem - 0.012) ring(y, r, skin, false);
        } else if (!hemDone) ring(y, r + legThick, L.bottomColor, true);
        else ring(y, r, skin, false);
      }
      g.tube(rings, 8, {
        colorAt: wet ? (i, _k, ang) => (isCloth[i] && Math.cos(ang) * sx > 0.8 ? L.bottomAccent : undefined) : undefined,
      });
    }
    // piede (costruito lungo Z)
    const footCol = closedShoe ? L.shoeColor : skin;
    M.makeRotationX(Math.PI / 2);
    M.setPosition(lx, 0, 0);
    g.mat = M;
    const FP = [
      [-0.062, 0.016, 0.016, 0.03],
      [-0.046, 0.033, 0.034, 0.036],
      [0, 0.039, 0.043, 0.043],
      [0.06, 0.045, 0.03, 0.03],
      [0.12, 0.048, 0.022, 0.022],
      [0.165, 0.041, 0.016, 0.016],
      [0.186, 0.02, 0.008, 0.01],
    ];
    const toeCol = L.shoes === 'sneakers' ? mix(L.shoeColor, 0xffffff, 0.5) : footCol;
    g.tube(
      FP.map((p, i) => ({ x: 0, y: p[0] as number, z: -((p[3] as number) + soleT), rx: p[1] as number, rz: p[2] as number, c: i >= 5 ? toeCol : footCol, b0: foot, sq: 2.6 })),
      6,
      { capA: true, capB: true },
    );
    if (soleT > 0) {
      const soleCol = L.shoes === 'sneakers' ? 0xf2efe6 : L.shoes === 'shoes' ? shade(L.shoeColor, 0.6) : L.shoeColor;
      const SP = [
        [-0.07, 0.03],
        [-0.03, 0.044],
        [0.12, 0.054],
        [0.196, 0.03],
      ];
      g.tube(
        SP.map((p) => ({ x: 0, y: p[0] as number, z: -soleT / 2, rx: p[1] as number, rz: soleT / 2, c: soleCol, b0: foot, sq: 4 })),
        6,
        { capA: true, capB: true },
      );
    }
    g.mat = null;
    const footTop = (x: number, z: number): number => {
      const hw = interp(FP, z, 1);
      const hh = interp(FP, z, 2);
      const ch = interp(FP, z, 3);
      const u = Math.min(0.97, Math.abs(x) / hw);
      return soleT + ch + hh * Math.pow(1 - Math.pow(u, 2.6), 1 / 2.6) + 0.003;
    };
    const strap = (x1: number, z1: number, x2: number, z2: number, w: number, c: Hex): void => {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const l = Math.hypot(dx, dz) || 1;
      const px = (-dz / l) * w;
      const pz = (dx / l) * w;
      const P = (x: number, z: number): [number, number, number] => [lx + x, footTop(x, z), z];
      // senso antiorario visto dall'alto
      const pts: [number, number, number][] = [P(x1 - px, z1 - pz), P(x1 + px, z1 + pz), P(x2 + px, z2 + pz), P(x2 - px, z2 - pz)];
      const ax = (pts[1] as number[])[0] as number;
      const az = (pts[1] as number[])[2] as number;
      const cross = (ax - ((pts[0] as number[])[0] as number)) * (((pts[2] as number[])[2] as number) - az) - (az - ((pts[0] as number[])[2] as number)) * (((pts[2] as number[])[0] as number) - ax);
      g.poly(cross > 0 ? pts.reverse() : pts, c, foot);
    };
    if (L.shoes === 'flipflops') {
      const c = shade(L.shoeColor, 1.25);
      strap(0, 0.125, 0.04, 0.03, 0.007, c);
      strap(0, 0.125, -0.04, 0.03, 0.007, c);
    } else if (L.shoes === 'sandals') {
      strap(-0.045, 0.115, 0.045, 0.115, 0.011, L.shoeColor);
      strap(-0.04, 0.045, 0.04, 0.045, 0.011, L.shoeColor);
    } else if (L.shoes === 'sneakers') {
      strap(-0.02, 0.05, 0.02, 0.05, 0.006, 0xffffff);
      strap(-0.022, 0.075, 0.022, 0.075, 0.006, 0xffffff);
    }
  }

  // ------------------------------------------------------------------ gonna
  const skirtSkin = (x: number, y: number): Skin3 => {
    if (y >= 0.86) return torsoSkin(y);
    const w = Math.min(0.9, (0.86 - y) / 0.15);
    if (Math.abs(x) < 0.03) return [B.hips, B.hips, 0];
    return [B.hips, x > 0 ? B.thighL : B.thighR, w * Math.min(1, Math.abs(x) / 0.08)];
  };
  const SK = [
    [0.99, 0.008, 0.008],
    [0.92, 0.034, 0.02],
    [0.82, 0.05 + (bw - 1) * 0.06, 0.036],
    [0.66, 0.056 + (bw - 1) * 0.06, 0.056],
    [0.5, 0.064 + (bw - 1) * 0.06, 0.074],
  ];
  if (L.bottom === 'skirt') {
    const rings: Ring[] = SK.map((p, i) => ({
      x: 0,
      y: p[0] as number,
      z: 0,
      rx: tRX(Math.max(0.86, p[0] as number)) + (p[1] as number),
      rz: tRZ(Math.max(0.86, p[0] as number)) + (p[2] as number),
      c: i === SK.length - 1 ? L.bottomAccent : L.bottomColor,
      b0: B.hips,
    }));
    const lastR = rings[rings.length - 1] as Ring;
    rings.splice(rings.length - 1, 0, { ...lastR, y: lastR.y + 0.03, c: L.bottomColor });
    rings.push({ ...lastR, rx: lastR.rx - 0.03, rz: lastR.rz - 0.03, y: lastR.y + 0.02, c: shade(L.bottomColor, 0.6) });
    g.tube(rings, 12, { skinAt: (i, _k, x) => skirtSkin(x, (rings[i] as Ring).y) });
  }

  // ------------------------------------------------------------------ muta abbassata in vita
  if (L.wetsuitDown) {
    const c = L.bottomColor;
    const ac = L.bottomAccent;
    const y0 = 0.985;
    const rings: Ring[] = [
      [y0 + 0.045, 0.002, c],
      [y0 + 0.03, 0.026, c],
      [y0, 0.034, ac],
      [y0 - 0.03, 0.026, c],
      [y0 - 0.05, 0.004, c],
    ].map((p) => {
      const y = p[0] as number;
      const s = torsoSkin(y);
      return { x: 0, y, z: tCZ(y), rx: tRX(y) + (p[1] as number), rz: tRZ(y) + (p[1] as number), c: p[2] as number, b0: s[0], b1: s[1], w1: s[2] };
    });
    g.tube(rings, 12);
    // maniche che pendono sui fianchi
    for (const sx of [1, -1]) {
      const thigh = sx > 0 ? B.thighL : B.thighR;
      const x = sx * (tRX(0.93) + 0.02);
      g.tube(
        [
          { x: x - sx * 0.02, y: 0.99, z: 0.03, rx: 0.03, rz: 0.04, c, b0: B.hips },
          { x, y: 0.88, z: 0.035, rx: 0.026, rz: 0.04, c, b0: B.hips },
          { x: x + sx * 0.004, y: 0.74, z: 0.035, rx: 0.022, rz: 0.036, c, b0: B.hips, b1: thigh, w1: 0.6 },
          { x: x + sx * 0.004, y: 0.66, z: 0.035, rx: 0.02, rz: 0.032, c: ac, b0: B.hips, b1: thigh, w1: 0.7 },
          { x: x + sx * 0.004, y: 0.64, z: 0.035, rx: 0.008, rz: 0.014, c: shade(c, 0.6), b0: B.hips, b1: thigh, w1: 0.7 },
        ],
        6,
      );
    }
  }

  // ------------------------------------------------------------------ dettagli del busto
  const hasCollar = L.top === 'shirt' || L.top === 'polo' || L.top === 'hawaiian';
  if (hasCollar) {
    const cc = L.top === 'polo' ? L.topAccent : shade(L.topColor, 1.12);
    for (const sx of [1, -1]) {
      const pts: [number, number, number][] = [
        [sx * 0.004, 1.372, tFront(0, 1.36, 0.012)],
        [sx * 0.05, 1.335, tFront(0.05, 1.335, 0.012)],
        [sx * 0.072, 1.402, 0.035],
        [sx * 0.03, 1.412, 0.052],
      ];
      g.poly(sx > 0 ? pts : pts.reverse(), cc, B.chest);
    }
    // abbottonatura
    {
      const yb = L.top === 'polo' ? 1.26 : hemTop + 0.005;
      const ys = [1.36, 1.28, 1.2, 1.1, 1.01, 0.93].filter((y) => y > yb);
      ys.push(yb);
      const pc = L.top === 'polo' ? L.topAccent : shade(L.topColor, 0.86);
      frontGrid(
        ys.map(() => [-0.007, 0.007]),
        ys,
        pc,
        0.003 + (tucked ? 0 : 0.004),
        tSkinXY,
      );
    }
  }
  if (L.top === 'hawaiian') {
    const cols = [L.topAccent, 0xfdf8ee, mix(L.topAccent, 0xff5a5a, 0.5)];
    const n = 20;
    for (let i = 0; i < n; i++) {
      const ang = ((i + 0.5 * hash(i, 3)) / n) * Math.PI * 2 * 3 + 0.4;
      const y = 0.97 + ((i * 0.618 + hash(i, 7) * 0.15) % 1) * 0.34;
      const rx = tRX(y) + topT + 0.004 + (y < 1.0 ? 0.008 : 0);
      const rz = tRZ(y) + topT + 0.004 + (y < 1.0 ? 0.008 : 0);
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      const px = rx * cs;
      const pz = tCZ(y) + rz * sn;
      if (Math.abs(px) < 0.022 && sn > 0) continue;
      const s = 0.024 + hash(i, 11) * 0.01;
      const tx = -sn;
      const tz = cs;
      const sk = torsoSkin(y);
      const grp = g.group();
      const c = cols[i % cols.length] as Hex;
      const a = g.vert(px + tx * s, y, pz + tz * s, c, grp, sk[0], sk[1], sk[2]);
      const b = g.vert(px, y + s, pz, c, grp, sk[0], sk[1], sk[2]);
      const cc2 = g.vert(px - tx * s, y, pz - tz * s, c, grp, sk[0], sk[1], sk[2]);
      const d = g.vert(px, y - s, pz, c, grp, sk[0], sk[1], sk[2]);
      g.quad(a, d, cc2, b);
    }
  }
  if (L.tie !== null) {
    const ys = [1.368, 1.34, 1.1, 1.04];
    const hw = [0.014, 0.011, 0.024, 0.002];
    frontGrid(
      ys.map((_, i) => [-(hw[i] as number), hw[i] as number]),
      ys,
      (r) => (r === 0 ? shade(L.tie as Hex, 0.8) : (L.tie as Hex)),
      0.008,
      tSkinXY,
    );
  }
  if (tucked && L.top === 'shirt') {
    // cintura
    const y = 0.985;
    const s = torsoSkin(y);
    g.tube(
      [-0.016, 0.016].map((dy) => ({ x: 0, y: y + dy, z: tCZ(y), rx: tRX(y) + 0.009, rz: tRZ(y) + 0.009, c: 0x2c2420, b0: s[0], b1: s[1], w1: s[2] })),
      12,
    );
    g.poly(
      [
        [-0.016, y - 0.013, tFront(0, y, 0.008)],
        [0.016, y - 0.013, tFront(0, y, 0.008)],
        [0.016, y + 0.013, tFront(0, y, 0.008)],
        [-0.016, y + 0.013, tFront(0, y, 0.008)],
      ],
      0xd8c27a,
      B.hips,
      () => s,
    );
  }
  if (L.logo !== null) {
    const x = 0.075;
    const y = 1.262;
    const q = (hw: number, hh: number, c: Hex, off: number): void => {
      g.poly(
        [
          [x - hw, y - hh, tFront(x - hw, y, off)],
          [x + hw, y - hh, tFront(x + hw, y, off)],
          [x + hw, y + hh, tFront(x + hw, y, off)],
          [x - hw, y + hh, tFront(x - hw, y, off)],
        ],
        c,
        B.chest,
      );
    };
    q(0.02, 0.026, L.logo, 0.003);
    q(0.011, 0.018, 0xffffff, 0.005);
    q(0.0075, 0.011, 0x1f3d4d, 0.0065);
  }
  if (L.backPrint !== null) {
    const y = 1.24;
    const q = (hw: number, hh: number, c: Hex, off: number, dy: number): void => {
      g.poly(
        [
          [hw, y + dy - hh, tBack(hw, y, off)],
          [-hw, y + dy - hh, tBack(hw, y, off)],
          [-hw, y + dy + hh, tBack(hw, y, off)],
          [hw, y + dy + hh, tBack(hw, y, off)],
        ],
        c,
        B.chest,
      );
    };
    q(0.07, 0.05, L.backPrint, 0.003, 0);
    q(0.022, 0.036, 0xffffff, 0.005, 0);
    q(0.016, 0.026, 0x1f3d4d, 0.0065, 0.002);
  }
  if (L.necklace) {
    for (const sx of [1, -1]) {
      const pts: [number, number, number][] = [
        [sx * 0.05, 1.392, 0.04],
        [sx * 0.056, 1.386, 0.042],
        [sx * 0.004, 1.292, tFront(0, 1.292, 0.004)],
        [-sx * 0.004, 1.3, tFront(0, 1.3, 0.004)],
      ];
      g.poly(sx > 0 ? pts.reverse() : pts, 0x3a2a1e, B.chest);
    }
    g.poly(
      [
        [0, 1.262, tFront(0, 1.27, 0.006)],
        [0.009, 1.296, tFront(0, 1.296, 0.006)],
        [-0.009, 1.296, tFront(0, 1.296, 0.006)],
      ],
      0xf6f1e4,
      B.chest,
    );
  }
  if (L.camera) {
    const zc = tFront(0, 1.12, 0.022);
    g.box(0, 1.12, zc, 0.085, 0.052, 0.036, 0x2b2d33, B.chest, 0x3d4048);
    M.makeRotationX(Math.PI / 2);
    M.setPosition(0.008, 1.118, zc + 0.018);
    g.mat = M;
    g.tube(
      [
        { x: 0, y: 0, z: 0, rx: 0.021, rz: 0.021, c: 0x1c1d21, b0: B.chest },
        { x: 0, y: 0.022, z: 0, rx: 0.019, rz: 0.019, c: 0x55585f, b0: B.chest },
        { x: 0, y: 0.022, z: 0, rx: 0.013, rz: 0.013, c: 0x6fa8c9, b0: B.chest },
      ],
      8,
      { capB: true },
    );
    g.mat = null;
    for (const sx of [1, -1]) {
      const ys = [1.146, 1.25, 1.34, 1.392];
      const xc = [0.036, 0.05, 0.058, 0.056];
      const xs = ys.map((_, i) => (sx > 0 ? [sx * (xc[i] as number) - 0.007, sx * (xc[i] as number) + 0.007] : [sx * (xc[i] as number) - 0.007, sx * (xc[i] as number) + 0.007]));
      frontGrid(xs.reverse(), ys.slice().reverse(), 0x2b2d33, 0.004, () => [B.chest, B.chest, 0]);
    }
  }
  if (L.scarf !== null) {
    const c = L.scarf;
    const c2 = mix(c, 0xffffff, 0.75);
    g.tube(
      [
        { x: 0, y: 1.45, z: 0.004, rx: 0.05, rz: 0.05, c, b0: B.neck },
        { x: 0, y: 1.43, z: 0.004, rx: 0.074, rz: 0.07, c, b0: B.neck, b1: B.chest, w1: 0.5 },
        { x: 0, y: 1.395, z: 0.004, rx: 0.086, rz: 0.08, c, b0: B.chest },
        { x: 0, y: 1.372, z: 0.004, rx: 0.07, rz: 0.066, c, b0: B.chest },
      ],
      10,
      { colorAt: (i, k) => ((i + k) % 2 === 0 ? c2 : undefined) },
    );
    frontGrid(
      [
        [0.02, 0.052],
        [0.024, 0.062],
        [0.03, 0.066],
      ],
      [1.39, 1.3, 1.22],
      (r, ci) => ((r + ci) % 2 === 0 ? c : c2),
      0.012,
      () => [B.chest, B.chest, 0],
    );
  }
  if (L.apron !== null) {
    const c = L.apron;
    const ys = [1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.71];
    const half = (y: number): number => (y > 1.12 ? 0.07 : y > 1.02 ? 0.1 : 0.135);
    const xs = ys.map((y) => [-1, -0.5, 0, 0.5, 1].map((u) => u * half(y)));
    const zLow = tFront(0, 0.9, 0.016);
    const zApron = (x: number, y: number): number => {
      const base = y >= 0.9 ? tFront(x, y, 0.012) : zLow - (Math.abs(x) / 0.135) * 0.03;
      if (L.bottom !== 'skirt' || y > 0.99) return base;
      const rx = tRX(Math.max(0.86, y)) + interp(SK, y, 1);
      const rz = tRZ(Math.max(0.86, y)) + interp(SK, y, 2);
      const u = Math.min(0.97, Math.abs(x) / rx);
      return Math.max(base, rz * Math.sqrt(1 - u * u) + 0.013);
    };
    frontGrid(
      xs,
      ys,
      (r) => (r === ys.length - 1 ? shade(c, 0.9) : c),
      0.012,
      (x, y) => skirtSkin(x, y),
      (x, y) => zApron(x, y) + (y < 1.02 && y >= 0.9 && !tucked ? 0.008 : 0),
    );
    // tasca
    g.poly(
      [
        [-0.05, 0.77, zApron(0.05, 0.77) + 0.009],
        [0.05, 0.77, zApron(0.05, 0.77) + 0.009],
        [0.05, 0.85, zApron(0.05, 0.85) + 0.009],
        [-0.05, 0.85, zApron(0.05, 0.85) + 0.009],
      ],
      shade(c, 0.84),
      B.hips,
    );
    // lacci al collo
    for (const sx of [1, -1]) {
      const pts: [number, number, number][] = [
        [sx * 0.07 - 0.008, 1.3, tFront(0.066, 1.3, 0.012)],
        [sx * 0.07 + 0.008, 1.3, tFront(0.066, 1.3, 0.012)],
        [sx * 0.056 + 0.008, 1.404, 0.03],
        [sx * 0.056 - 0.008, 1.404, 0.03],
      ];
      g.poly(pts, shade(c, 0.9), B.chest);
    }
    // fascia in vita
    const y = 1.0;
    const s = torsoSkin(y);
    g.tube(
      [-0.014, 0.014].map((dy) => ({ x: 0, y: y + dy, z: tCZ(y), rx: tRX(y) + topT + 0.011, rz: tRZ(y) + topT + 0.011, c: shade(c, 0.9), b0: s[0], b1: s[1], w1: s[2] })),
      12,
    );
  }

  // ------------------------------------------------------------------ zaino
  if (L.pack !== 'none') {
    const big = L.pack === 'big';
    const pc = L.packColor;
    const zb = tBack(0, 1.2, 0) - (big ? 0.115 : 0.078);
    const PR = big
      ? [
          [0.94, 0.05, 0.03],
          [0.985, 0.14, 0.092],
          [1.2, 0.152, 0.104],
          [1.44, 0.142, 0.098],
          [1.55, 0.118, 0.08],
          [1.585, 0.05, 0.03],
        ]
      : [
          [1.05, 0.04, 0.025],
          [1.085, 0.115, 0.066],
          [1.24, 0.122, 0.074],
          [1.37, 0.108, 0.064],
          [1.41, 0.045, 0.026],
        ];
    g.tube(
      PR.map((p) => ({ x: 0, y: p[0] as number, z: zb, rx: p[1] as number, rz: p[2] as number, c: pc, b0: B.chest, sq: 3.2 })),
      8,
      { capA: true, capB: true },
    );
    // tasca posteriore
    const py = big ? 1.12 : 1.15;
    const pd = big ? 0.1 : 0.07;
    g.tube(
      [
        [py - 0.1, 0.03, 0.01],
        [py - 0.08, 0.095, 0.035],
        [py + 0.06, 0.095, 0.035],
        [py + 0.085, 0.03, 0.01],
      ].map((p) => ({ x: 0, y: p[0] as number, z: zb - pd, rx: (p[1] as number) * (big ? 1.15 : 0.9), rz: p[2] as number, c: L.packAccent, b0: B.chest, sq: 3 })),
      6,
      { capA: true, capB: true },
    );
    if (big) {
      // materassino arrotolato in cima
      M.makeRotationZ(Math.PI / 2);
      M.setPosition(0, 1.635, zb - 0.01);
      g.mat = M;
      const rc = L.packAccent;
      const dk = shade(pc, 0.55);
      g.tube(
        [
          [-0.188, 0.056, rc],
          [-0.1, 0.057, rc],
          [-0.1, 0.06, dk],
          [-0.075, 0.06, dk],
          [0.075, 0.057, rc],
          [0.1, 0.06, dk],
          [0.188, 0.056, rc],
        ].map((p) => ({ x: 0, y: p[0] as number, z: 0, rx: p[1] as number, rz: p[1] as number, c: p[2] as number, b0: B.chest })),
        6,
        { capA: true, capB: true },
      );
      g.mat = null;
      // tasche laterali
      for (const sx of [1, -1]) g.ellipsoid(sx * 0.15, 1.08, zb, 0.035, 0.085, 0.06, 5, 2, shade(pc, 0.8), B.chest);
      // cintura ventrale
      const y = 1.0;
      const s = torsoSkin(y);
      g.tube(
        [-0.016, 0.016].map((dy) => ({ x: 0, y: y + dy, z: tCZ(y), rx: tRX(y) + topT + 0.008, rz: tRZ(y) + topT + 0.008, c: shade(pc, 0.6), b0: s[0], b1: s[1], w1: s[2] })),
        12,
      );
    }
    // spallacci
    const sc = shade(pc, 0.7);
    for (const sx of [1, -1]) {
      const xc = sx * Math.min(0.095, shX - 0.07);
      const w = 0.017;
      const ys = [1.392, 1.33, 1.24, 1.13];
      frontGrid(
        ys.map((y) => [xc - w + (1.392 - y) * sx * 0.12, xc + w + (1.392 - y) * sx * 0.12]),
        ys,
        sc,
        0.013,
        () => [B.chest, B.chest, 0],
      );
      g.poly(
        [
          [xc - w, 1.392, tFront(xc, 1.392, 0.013)],
          [xc + w, 1.392, tFront(xc, 1.392, 0.013)],
          [xc + w, 1.4, zb + 0.06],
          [xc - w, 1.4, zb + 0.06],
        ],
        sc,
        B.chest,
      );
    }
  }

  // ------------------------------------------------------------------ cassa di ricambi (Mr. Chai)
  if (L.crate) {
    const cx = 0.02;
    const cyc = 1.085;
    const cz = tFront(0, 1.1, 0) + 0.115;
    const w = 0.31;
    const h = 0.17;
    const d = 0.21;
    const wood = 0xc9a26b;
    const wood2 = 0xb38a55;
    const bone = B.chest;
    g.box(cx, cyc - h / 2 + 0.008, cz, w - 0.02, 0.014, d - 0.02, 0x7a5a36, bone);
    g.box(cx, cyc - 0.01, cz, w - 0.03, h - 0.03, d - 0.03, 0x4a3520, bone, 0x3a2a1a);
    for (let i = 0; i < 3; i++) {
      const y = cyc - h / 2 + 0.028 + i * 0.057;
      const c = i % 2 === 0 ? wood : wood2;
      g.box(cx, y, cz + d / 2 - 0.006, w, 0.046, 0.012, c, bone, shade(c, 1.1));
      g.box(cx, y, cz - d / 2 + 0.006, w, 0.046, 0.012, c, bone, shade(c, 1.1));
    }
    for (const sx of [1, -1]) g.box(cx + sx * (w / 2 - 0.007), cyc, cz, 0.014, h, d + 0.004, 0x9a7444, bone, 0xb38a55);
    // ricambi che spuntano
    M.makeRotationZ(0.35);
    M.setPosition(cx - 0.07, cyc + h / 2 + 0.01, cz + 0.01);
    g.mat = M;
    g.box(0, 0, 0, 0.065, 0.12, 0.008, 0x1b2026, bone);
    g.box(0, 0, 0.0045, 0.056, 0.108, 0.002, 0x2f6fa8, bone);
    M.makeRotationZ(-0.3);
    M.setPosition(cx + 0.06, cyc + h / 2, cz - 0.03);
    g.box(0, 0, 0, 0.07, 0.11, 0.008, 0x2e7d4f, bone);
    M.makeRotationZ(0.1);
    M.setPosition(cx + 0.02, cyc + h / 2 - 0.005, cz + 0.05);
    g.box(0, 0, 0, 0.05, 0.085, 0.01, 0xe9e6dc, bone, 0x1b2026);
    g.mat = null;
    g.box(cx + 0.105, cyc + h / 2 - 0.02, cz + 0.02, 0.05, 0.05, 0.07, 0xf2c84b, bone, 0xd9a92e);
  }

  // ------------------------------------------------------------------ testa
  const hProf = (t: number): { rx: number; rz: number; cz: number } => {
    const r = Math.sqrt(Math.max(0, 1 - t * t));
    const lo = t < 0 ? Math.pow(-t, 1.6) : 0;
    return { rx: D.headRX * r * (1 - 0.24 * lo), rz: D.headRZ * r * (1 - 0.1 * lo), cz: 0.014 * lo };
  };
  {
    const ts = [-0.985, -0.88, -0.62, -0.3, 0, 0.35, 0.68, 0.9, 0.985];
    g.tube(
      ts.map((t) => {
        const p = hProf(t);
        return { x: 0, y: cy + D.headRY * t, z: p.cz, rx: Math.max(0.012, p.rx), rz: Math.max(0.012, p.rz), c: skin, b0: B.head };
      }),
      14,
      { capA: true, capB: true },
    );
  }
  /** z della superficie della testa nel punto (x, y) del viso */
  const hz = (x: number, y: number, off = 0.0025): number => {
    const t = Math.max(-0.97, Math.min(0.97, (y - cy) / D.headRY));
    const p = hProf(t);
    const u = Math.min(0.97, Math.abs(x) / p.rx);
    return p.cz + p.rz * Math.sqrt(1 - u * u) + off;
  };
  const decal = (pts: [number, number][], c: Hex, off: number, skinFn: number | ((i: number) => Skin3)): void => {
    g.poly(
      pts.map((p) => [p[0], p[1], hz(p[0], p[1], off)] as [number, number, number]),
      c,
      typeof skinFn === 'number' ? skinFn : B.head,
      typeof skinFn === 'number' ? undefined : skinFn,
    );
  };
  // orecchie
  for (const sx of [1, -1]) g.ellipsoid(sx * (D.headRX - 0.004), D.eyeY - 0.014, -0.006, 0.014, 0.028, 0.018, 5, 2, shade(skin, 0.96), B.head);
  // occhi
  for (const sx of [1, -1]) {
    const ex = sx * 0.044;
    const pts: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pts.push([ex + Math.cos(a) * 0.0125, D.eyeY + Math.sin(a) * 0.019]);
    }
    decal(pts, 0x1d1a1b, 0.0025, B.eyes);
    decal(
      [
        [ex + 0.001, D.eyeY + 0.005],
        [ex + 0.007, D.eyeY + 0.005],
        [ex + 0.007, D.eyeY + 0.012],
        [ex + 0.001, D.eyeY + 0.012],
      ],
      0xffffff,
      0.004,
      B.eyes,
    );
    // sopracciglia
    const bone = sx > 0 ? B.browL : B.browR;
    const bc = L.hairStyle === 'bald' && L.hair === 0x9d9c98 ? 0x8a8a88 : mix(L.hair, 0x241a14, L.hair === 0xdcb96e || L.hair === 0xe8cf8c ? 0.45 : 0.25);
    const inner = ex - sx * 0.017;
    const outer = ex + sx * 0.019;
    const q: [number, number][] = [
      [inner, D.browY - 0.0035],
      [outer, D.browY - 0.0075],
      [outer, D.browY - 0.002],
      [inner, D.browY + 0.004],
    ];
    decal(sx > 0 ? q : q.reverse(), bc, 0.0035, bone);
  }
  // naso
  {
    const nc = mix(skin, 0xc8644a, 0.16);
    const yb = D.eyeY - 0.046;
    const yt = D.eyeY - 0.012;
    const tip: [number, number, number] = [0, yb + 0.008, hz(0, yb + 0.008, 0.02)];
    const l: [number, number, number] = [-0.013, yb, hz(0.013, yb, 0)];
    const r: [number, number, number] = [0.013, yb, hz(0.013, yb, 0)];
    const top: [number, number, number] = [0, yt, hz(0, yt, 0)];
    g.poly([l, tip, top], nc, B.head);
    g.poly([tip, r, top], nc, B.head);
    g.poly([l, r, tip], shade(nc, 0.86), B.head);
  }
  // guance
  if (L.blush) {
    for (const sx of [1, -1]) {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        pts.push([sx * 0.066 + Math.cos(a) * 0.015, D.eyeY - 0.04 + Math.sin(a) * 0.011]);
      }
      decal(pts, mix(skin, 0xff6a6a, 0.3), 0.002, B.head);
    }
  }
  // bocca: bordo superiore fisso, inferiore sulla mandibola, angoli su mouthC
  {
    const grp = g.group();
    const start = g.vertexCount;
    const us = [-1, -0.5, 0, 0.5, 1];
    const hw = 0.027;
    const mc = 0x4b1d1f;
    for (const row of [0, 1]) {
      for (const u of us) {
        const x = u * hw;
        const y = D.mouthY + (row === 0 ? 0.0035 : -0.0035) * (1 - Math.abs(u) * 0.85);
        const wc = Math.abs(u) === 1 ? 1 : Math.abs(u) === 0.5 ? 0.45 : 0;
        g.vert(x, y, hz(x, y, 0.003), mc, grp, row === 0 ? B.head : B.jaw, B.mouthC, wc);
      }
    }
    for (let i = 0; i < us.length - 1; i++) g.quad(start + 5 + i, start + 5 + i + 1, start + i + 1, start + i);
  }
  // baffi / barba
  if (L.facial === 'moustache' || L.facial === 'beard') {
    const fc = L.facialColor;
    for (const sx of [1, -1]) {
      const y = D.mouthY + 0.013;
      const q: [number, number][] = [
        [sx * 0.001, y - 0.004],
        [sx * 0.03, y - 0.012],
        [sx * 0.033, y - 0.004],
        [sx * 0.002, y + 0.007],
      ];
      decal(sx > 0 ? q : q.reverse(), fc, 0.006, B.head);
    }
  }
  if (L.facial === 'beard' || L.facial === 'goatee') {
    const fc = L.facialColor;
    const wide = L.facial === 'beard';
    const us = wide ? [-1, -0.66, -0.33, 0, 0.33, 0.66, 1] : [-1, 0, 1];
    const hw = wide ? 0.07 : 0.02;
    const grp = g.group();
    const start = g.vertexCount;
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      for (const u of us) {
        const x = u * hw;
        const yTop = D.mouthY - 0.011 + (wide ? Math.abs(u) * 0.035 : 0);
        const yBot = cy - D.headRY * (wide ? 0.93 - Math.abs(u) * 0.2 : 0.9);
        const y = lerp(yTop, yBot, r / (rows - 1));
        g.vert(x, y, hz(x, y, 0.005) - (r === rows - 1 ? 0.004 : 0), fc, grp, B.head, B.jaw, r === 0 && Math.abs(u) < 0.4 ? 0.5 : 0);
      }
    }
    const n = us.length;
    for (let r = 0; r < rows - 1; r++) for (let i = 0; i < n - 1; i++) g.quad(start + r * n + i, start + (r + 1) * n + i, start + (r + 1) * n + i + 1, start + r * n + i + 1);
  }

  // ------------------------------------------------------------------ capelli
  const crownHat = L.hat === 'straw' || L.hat === 'cap' || L.hat === 'bucket' || L.hat === 'conical';
  interface HairP {
    scale: number;
    tFront: number;
    tSide: number;
    tBack: number;
    tTop: number;
    baldFront: boolean;
    down: number;
    jitter: number;
    fringe: number;
    lift: number;
  }
  const hairCap = (o0: HairP, c: Hex): void => {
    const o = crownHat ? { ...o0, scale: Math.min(o0.scale, 1.06), lift: 0, jitter: Math.min(o0.jitter, 0.006) } : o0;
    const sides = 12;
    const R = 5;
    const extra = o.down > 0 ? Math.ceil(o.down / 0.055) : 0;
    const rows = R + 1 + extra + 1;
    const grp = g.group();
    const start = g.vertexCount;
    const px: number[] = [];
    for (let j = 0; j < rows; j++) {
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        const f = (sn + 1) / 2;
        let tLow = f > 0.5 ? lerp(o.tSide, o.tFront, sm((f - 0.5) * 2)) : lerp(o.tBack, o.tSide, sm(f * 2));
        tLow += o.fringe * cs * Math.max(0, sn);
        const tTop = o.baldFront && f > 0.6 ? tLow : Math.max(o.tTop, tLow);
        const jj = Math.min(j, R);
        const t = lerp(tTop, tLow, Math.pow(jj / R, 0.85));
        let s = o.scale + (j > 0 ? o.jitter * (hash(j, k) - 0.5) * 2 : 0);
        const p = hProf(t);
        let y = cy + D.headRY * t * (1 + (s - 1) * 0.9) + o.lift * Math.max(0, t);
        let shrink = 1;
        if (j > R) {
          const e = Math.min(j - R, extra);
          const wext = sm((0.47 - f) / 0.18);
          y -= (o.down / Math.max(1, extra)) * e * wext;
          shrink = 1 - 0.035 * e * wext;
          if (j === rows - 1) {
            s -= 0.07;
            y += 0.004;
          }
        }
        const x = p.rx * s * cs * shrink;
        const z = p.cz * 0.5 + p.rz * s * sn * shrink - (j > R ? 0.012 * Math.min(j - R, extra) * sm((0.47 - f) / 0.18) : 0);
        px.push(x);
        const shadeF = j === rows - 1 ? 0.72 : 1 - 0.1 * (hash(k, 5) > 0.5 ? 1 : 0) * (j > 1 ? 1 : 0);
        g.vert(x, y, z, shade(c, shadeF), grp, B.head, B.chest, j > R + 2 ? 0.25 : 0);
      }
    }
    for (let j = 0; j < rows - 1; j++) {
      for (let k = 0; k < sides; k++) {
        const a = start + j * sides + k;
        const b = start + j * sides + ((k + 1) % sides);
        const cc = start + (j + 1) * sides + ((k + 1) % sides);
        const d = start + (j + 1) * sides + k;
        g.quad(a, b, cc, d);
      }
    }
  };
  {
    const hc = L.hair;
    const P: HairP = { scale: 1.075, tFront: 0.52, tSide: 0.1, tBack: -0.55, tTop: 0.985, baldFront: false, down: 0, jitter: 0, fringe: 0, lift: 0.012 };
    switch (L.hairStyle) {
      case 'bald':
        break;
      case 'buzz':
        hairCap({ ...P, scale: 1.028, tFront: 0.6, tSide: 0.22, tBack: -0.42, lift: 0 }, mix(hc, skin, 0.3));
        break;
      case 'short':
        hairCap(P, hc);
        break;
      case 'fringe':
        hairCap({ ...P, scale: 1.095, tFront: 0.4, fringe: 0.22, tSide: 0.02, lift: 0.016 }, hc);
        break;
      case 'long':
        hairCap({ ...P, scale: 1.09, tFront: 0.5, tSide: -0.15, tBack: -0.5, down: 0.2, fringe: 0.1 }, hc);
        break;
      case 'bob':
        hairCap({ ...P, scale: 1.12, tFront: 0.42, tSide: -0.3, tBack: -0.55, down: 0.075, fringe: -0.08 }, hc);
        break;
      case 'ponytail':
        hairCap({ ...P, scale: 1.07, tFront: 0.52, tSide: 0.08, tBack: -0.45 }, hc);
        g.ellipsoid(0, cy + 0.035, -0.128, 0.022, 0.022, 0.02, 6, 2, 0xff6f59, B.head);
        g.tube(
          [
            { x: 0, y: cy + 0.035, z: -0.135, rx: 0.02, rz: 0.02, c: hc, b0: B.head },
            { x: 0, y: cy + 0.01, z: -0.165, rx: 0.036, rz: 0.03, c: hc, b0: B.head },
            { x: 0, y: cy - 0.07, z: -0.172, rx: 0.034, rz: 0.028, c: shade(hc, 0.9), b0: B.head },
            { x: 0, y: cy - 0.15, z: -0.158, rx: 0.02, rz: 0.018, c: hc, b0: B.head },
            { x: 0, y: cy - 0.185, z: -0.15, rx: 0.005, rz: 0.005, c: hc, b0: B.head },
          ],
          6,
        );
        break;
      case 'bun':
        hairCap({ ...P, scale: 1.07, tFront: 0.5, tSide: 0.05, tBack: -0.48, fringe: 0.08 }, hc);
        g.ellipsoid(0, cy + 0.118, -0.062, 0.05, 0.044, 0.05, 8, 4, shade(hc, 1.08), B.head);
        break;
      case 'balding':
        hairCap({ ...P, scale: 1.05, tTop: 0.48, baldFront: true, tFront: 0.3, tSide: -0.02, tBack: -0.5, lift: 0 }, hc);
        break;
      case 'curly':
        hairCap({ ...P, scale: crownHat ? 1.09 : 1.15, jitter: crownHat ? 0.008 : 0.022, tFront: 0.5, tSide: -0.12, tBack: -0.58, lift: 0.02, down: crownHat ? 0 : 0.03 }, hc);
        break;
    }
  }
  if (L.flower !== null) {
    const fx = 0.094;
    const fy = cy + 0.062;
    const fz = 0.062;
    M.makeRotationFromEuler(new THREE.Euler(-0.3, 0.75, 0));
    M.setPosition(fx, fy, fz);
    g.mat = M;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const a1 = a - 0.5;
      const a2 = a + 0.5;
      const r = 0.036;
      g.poly(
        [
          [0, 0, 0.014],
          [Math.cos(a1) * r * 0.75, Math.sin(a1) * r * 0.75, 0.006],
          [Math.cos(a) * r, Math.sin(a) * r, 0.0],
          [Math.cos(a2) * r * 0.75, Math.sin(a2) * r * 0.75, 0.006],
        ],
        i % 2 === 0 ? L.flower : shade(L.flower, 0.93),
        B.head,
      );
    }
    g.poly(
      [
        [-0.008, -0.008, 0.016],
        [0.008, -0.008, 0.016],
        [0.008, 0.008, 0.016],
        [-0.008, 0.008, 0.016],
      ],
      0xffc93c,
      B.head,
    );
    g.mat = null;
  }

  // ------------------------------------------------------------------ cappelli
  const pivot = (rx: number, tyOff = 0, tzOff = 0): void => {
    M.makeTranslation(0, cy + tyOff, tzOff);
    M2.makeRotationX(rx);
    M.multiply(M2);
    M2.makeTranslation(0, -cy, 0);
    M.multiply(M2);
    g.mat = M;
  };
  const hatRing = (y: number, rx: number, c: Hex, rz = rx * 1.07): Ring => ({ x: 0, y: cy + y, z: 0.004, rx, rz, c, b0: B.head });
  if (L.hat === 'straw') {
    const c = L.hatColor;
    const c2 = shade(c, 0.88);
    pivot(-0.14);
    g.tube(
      [
        hatRing(0.174, 0.05, c),
        hatRing(0.15, 0.108, c2),
        hatRing(0.098, 0.124, c),
        hatRing(0.098, 0.128, L.hatAccent),
        hatRing(0.062, 0.131, L.hatAccent),
        hatRing(0.058, 0.132, c),
        hatRing(0.048, 0.185, c2),
        hatRing(0.034, 0.238, c),
        hatRing(0.046, 0.13, shade(c, 0.62)),
      ],
      12,
      { capA: true },
    );
    g.mat = null;
  } else if (L.hat === 'conical') {
    const c = L.hatColor;
    pivot(-0.1);
    g.tube([hatRing(0.215, 0.008, shade(c, 0.85)), hatRing(0.16, 0.1, c), hatRing(0.105, 0.19, shade(c, 0.94)), hatRing(0.062, 0.265, c), hatRing(0.056, 0.266, shade(c, 0.8)), hatRing(0.09, 0.17, shade(c, 0.62)), hatRing(0.1, 0.12, shade(c, 0.5))], 14, { capA: true });
    g.mat = null;
  } else if (L.hat === 'bucket') {
    const c = L.hatColor;
    pivot(-0.1);
    g.tube([hatRing(0.158, 0.03, c), hatRing(0.155, 0.098, c), hatRing(0.1, 0.122, c), hatRing(0.064, 0.13, c), hatRing(0.064, 0.133, L.hatAccent), hatRing(0.052, 0.135, L.hatAccent), hatRing(0.05, 0.133, c), hatRing(0.02, 0.178, shade(c, 0.94)), hatRing(0.014, 0.18, shade(c, 0.85)), hatRing(0.045, 0.13, shade(c, 0.6))], 14, { capA: true });
    g.mat = null;
  } else if (L.hat === 'cap') {
    const c = L.hatColor;
    pivot(-0.06);
    const ts = [0.985, 0.9, 0.7, 0.48, 0.27];
    const rings: Ring[] = ts.map((t) => {
      const p = hProf(t);
      return { x: 0, y: cy + D.headRY * t * 1.12 + 0.008, z: p.cz + 0.002, rx: Math.max(0.014, p.rx * 1.17), rz: Math.max(0.014, p.rz * 1.17), c, b0: B.head };
    });
    const lastR = rings[rings.length - 1] as Ring;
    rings.push({ ...lastR, rx: lastR.rx - 0.012, rz: lastR.rz - 0.012, c: shade(c, 0.6) });
    g.tube(rings, 14, { capA: true });
    g.ellipsoid(0, cy + D.headRY * 1.12 + 0.008, 0, 0.012, 0.006, 0.012, 6, 2, L.hatAccent, B.head);
    // visiera
    const yv = lastR.y + 0.004;
    const inner: [number, number, number][] = [];
    const outer: [number, number, number][] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (0.16 + (0.68 * i) / n);
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      inner.push([lastR.rx * cs, yv, lastR.z + lastR.rz * sn - 0.004]);
      const ext = 0.095 * Math.pow(Math.sin((i / n) * Math.PI), 0.55);
      outer.push([lastR.rx * 0.98 * cs, yv - 0.016 * Math.sin((i / n) * Math.PI), lastR.z + lastR.rz * sn + ext]);
    }
    const grp = g.group();
    const grp2 = g.group();
    const vc = L.hatAccent;
    const s0 = g.vertexCount;
    for (let i = 0; i <= n; i++) {
      const a = inner[i] as [number, number, number];
      const b = outer[i] as [number, number, number];
      g.vert(a[0], a[1], a[2], vc, grp, B.head);
      g.vert(b[0], b[1], b[2], vc, grp, B.head);
      g.vert(a[0], a[1] - 0.005, a[2], shade(vc, 0.6), grp2, B.head);
      g.vert(b[0], b[1] - 0.004, b[2], shade(vc, 0.6), grp2, B.head);
    }
    for (let i = 0; i < n; i++) {
      const a = s0 + i * 4;
      const b = s0 + (i + 1) * 4;
      // x decresce con i: sopra → normale +Y
      g.quad(a, b, b + 1, a + 1);
      g.quad(a + 2, a + 3, b + 3, b + 2);
    }
    g.mat = null;
  } else if (L.hat === 'bandana') {
    const c = L.hatColor;
    const hs = L.hairStyle === 'curly' ? 1.12 : 1.1;
    pivot(-0.16);
    const ts = [0.62, 0.5, 0.32, 0.2];
    const rings: Ring[] = ts.map((t, i) => {
      const p = hProf(t);
      const s = hs + (i === 1 || i === 2 ? 0.035 : 0.0);
      return { x: 0, y: cy + D.headRY * t, z: p.cz, rx: p.rx * s, rz: p.rz * s, c, b0: B.head };
    });
    g.tube(rings, 14, { colorAt: (i, k) => ((i === 1 || i === 2) && k % 3 === 0 ? L.hatAccent : undefined) });
    // nodo e code
    g.ellipsoid(0, cy + 0.05, -0.142, 0.022, 0.018, 0.016, 6, 2, shade(c, 0.9), B.head);
    for (const sx of [1, -1]) {
      g.poly(
        [
          [sx * 0.004, cy + 0.05, -0.15],
          [sx * 0.05, cy - 0.03, -0.165],
          [sx * 0.022, cy - 0.045, -0.16],
        ].map((p) => p as [number, number, number])[sx > 0 ? 'slice' : 'reverse'](),
        c,
        B.head,
      );
      g.poly(
        [
          [sx * 0.004, cy + 0.05, -0.151],
          [sx * 0.05, cy - 0.03, -0.166],
          [sx * 0.022, cy - 0.045, -0.161],
        ].map((p) => p as [number, number, number])[sx > 0 ? 'reverse' : 'slice'](),
        shade(c, 0.8),
        B.head,
      );
    }
    g.mat = null;
  }

  // ------------------------------------------------------------------ maschera da sub sulla fronte
  if (L.mask) {
    const hs = (L.hairStyle === 'curly' ? 1.16 : 1.11) + 0.02;
    pivot(-0.42);
    const ts = [0.14, 0.02];
    g.tube(
      ts.map((t) => {
        const p = hProf(t);
        return { x: 0, y: cy + D.headRY * t, z: p.cz, rx: p.rx * hs, rz: p.rz * hs, c: 0x1c1f24, b0: B.head };
      }),
      14,
    );
    g.mat = null;
    const frame = 0x1c1f24;
    const acc = L.bottomAccent;
    M.makeTranslation(0, cy, 0);
    M2.makeRotationX(-0.42);
    M.multiply(M2);
    M2.makeTranslation(0, 0.012, D.headRZ * hs - 0.006);
    M.multiply(M2);
    M2.makeRotationX(Math.PI / 2);
    M.multiply(M2);
    g.mat = M;
    g.tube(
      [
        { x: 0, y: -0.01, z: 0, rx: 0.062, rz: 0.03, c: frame, b0: B.head, sq: 3.4 },
        { x: 0, y: 0.008, z: 0, rx: 0.074, rz: 0.038, c: acc, b0: B.head, sq: 3.4 },
        { x: 0, y: 0.03, z: 0, rx: 0.074, rz: 0.038, c: acc, b0: B.head, sq: 3.4 },
        { x: 0, y: 0.034, z: 0, rx: 0.068, rz: 0.033, c: frame, b0: B.head, sq: 3.4 },
        { x: 0, y: 0.03, z: 0, rx: 0.062, rz: 0.028, c: 0x8fc7e0, b0: B.head, sq: 3.4 },
      ],
      10,
      { capB: true },
    );
    // tasca del naso
    g.box(0, 0.016, 0.036, 0.03, 0.03, 0.022, frame, B.head);
    g.mat = null;
  }

  // ------------------------------------------------------------------ occhiali
  if (L.glasses !== 'none') {
    const sun = L.glasses === 'sun';
    const fc = sun ? 0x1a1a1e : L.glasses === 'forehead' ? 0x2a2a30 : 0x2b2422;
    const zf = hz(0.044, D.eyeY, 0.012);
    if (L.glasses === 'forehead') pivot(-0.6, 0.004, -0.004);
    const rimX = 0.023;
    const rimY = 0.019;
    const th = 0.0045;
    for (const sx of [1, -1]) {
      const ex = sx * 0.045;
      const grp = g.group();
      const s0 = g.vertexCount;
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * Math.PI * 2;
        const cs = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.7);
        const sn = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.7);
        g.vert(ex + cs * rimX, D.eyeY + sn * rimY, zf, fc, grp, B.head);
        g.vert(ex + cs * (rimX - th), D.eyeY + sn * (rimY - th), zf, fc, grp, B.head);
      }
      for (let i = 0; i < n; i++) {
        const a = s0 + i * 2;
        const b = s0 + ((i + 1) % n) * 2;
        g.quad(a, b, b + 1, a + 1);
      }
      if (sun) {
        const pts: [number, number, number][] = [];
        for (let i = 0; i < n; i++) {
          const a = ((i + 0.5) / n) * Math.PI * 2;
          const cs = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.7);
          const sn = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.7);
          pts.push([ex + cs * (rimX - th), D.eyeY + sn * (rimY - th), zf - 0.0005]);
        }
        g.poly(pts, 0x2a3440, B.head);
        g.poly(
          [
            [ex - 0.012, D.eyeY + 0.004, zf + 0.0005],
            [ex - 0.004, D.eyeY + 0.004, zf + 0.0005],
            [ex + 0.002, D.eyeY + 0.011, zf + 0.0005],
            [ex - 0.008, D.eyeY + 0.011, zf + 0.0005],
          ],
          0x5d7186,
          B.head,
        );
      }
      // stanghetta
      const x0 = ex + sx * rimX;
      const side: [number, number, number][] = [
        [x0, D.eyeY + 0.002, zf],
        [sx * (D.headRX + 0.004), D.eyeY + 0.002, 0.0],
        [sx * (D.headRX + 0.004), D.eyeY + 0.008, 0.0],
        [x0, D.eyeY + 0.008, zf],
      ];
      g.poly(sx > 0 ? side : side.reverse(), fc, B.head);
    }
    g.poly(
      [
        [-0.022, D.eyeY + 0.002, zf],
        [0.022, D.eyeY + 0.002, zf],
        [0.022, D.eyeY + 0.007, zf],
        [-0.022, D.eyeY + 0.007, zf],
      ],
      fc,
      B.head,
    );
    g.mat = null;
  }

  // ------------------------------------------------------------------ telefono in mano (osso dedicato)
  const px = -shX + 0.03;
  const py = 0.79;
  const pzc = 0.008;
  const phoneFrom = g.vertexCount;
  g.tube(
    [
      { x: px, y: py - 0.04, z: pzc, rx: 0.003, rz: 0.016, c: 0x2a6fb0, b0: B.phone, sq: 4 },
      { x: px, y: py - 0.037, z: pzc, rx: 0.0045, rz: 0.02, c: 0x2a6fb0, b0: B.phone, sq: 5 },
      { x: px, y: py + 0.037, z: pzc, rx: 0.0045, rz: 0.02, c: 0x2a6fb0, b0: B.phone, sq: 5 },
      { x: px, y: py + 0.04, z: pzc, rx: 0.003, rz: 0.016, c: 0x2a6fb0, b0: B.phone, sq: 4 },
    ],
    8,
    { capA: true, capB: true },
  );
  const phoneTo = g.vertexCount;
  // schermo (verso +X = lato opposto al palmo)
  g.poly(
    [
      [px + 0.005, py - 0.034, pzc + 0.0165],
      [px + 0.005, py - 0.034, pzc - 0.0165],
      [px + 0.005, py + 0.034, pzc - 0.0165],
      [px + 0.005, py + 0.034, pzc + 0.0165],
    ],
    0x16212c,
    B.phone,
  );
  g.poly(
    [
      [px + 0.0055, py + 0.004, pzc + 0.012],
      [px + 0.0055, py + 0.004, pzc - 0.012],
      [px + 0.0055, py + 0.028, pzc - 0.012],
      [px + 0.0055, py + 0.028, pzc + 0.012],
    ],
    0x6fc3e8,
    B.phone,
  );

  const geometry = g.build();
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.25);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-0.8, -0.1, -0.8), new THREE.Vector3(0.8, 2.0, 0.8));
  return { geometry, dims, phoneFrom, phoneTo, triangles: g.triangleCount };
}
