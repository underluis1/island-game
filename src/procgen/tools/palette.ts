/** Materiali (colore, roughness, metalness) e piccoli componenti riutilizzati dagli strumenti. */
import { Builder, mat, type Mat, type P2, type P3 } from './kit';

export const C = {
  steel: mat(0xc9cdd3, 0.27, 1),
  steelSatin: mat(0xb4b8be, 0.42, 1),
  steelDark: mat(0x5d6168, 0.38, 1),
  blackOxide: mat(0x2a2c30, 0.45, 0.85),
  chrome: mat(0xe9ebee, 0.08, 1),
  alu: mat(0xd6d9de, 0.36, 1),
  aluDark: mat(0x7d838c, 0.4, 1),
  gunmetal: mat(0x3b4048, 0.36, 1),
  brass: mat(0xd9aa4c, 0.3, 1),
  copper: mat(0xc9774a, 0.32, 1),
  gold: mat(0xe0a92a, 0.28, 1),
  titanium: mat(0x8f95a3, 0.34, 1),
  anodBlue: mat(0x2467d6, 0.36, 1),
  anodTeal: mat(0x12a5a8, 0.36, 1),
  anodCoral: mat(0xff5a3c, 0.36, 1),
  anodRed: mat(0xc8322b, 0.38, 1),
  black: mat(0x17181a, 0.48, 0),
  blackGloss: mat(0x0c0d0e, 0.18, 0),
  blackMatte: mat(0x111214, 0.82, 0),
  rubber: mat(0x151516, 0.92, 0),
  greyDark: mat(0x2b2f36, 0.55, 0),
  grey: mat(0x6b7078, 0.55, 0),
  greyLight: mat(0xb9bdc2, 0.5, 0),
  white: mat(0xf1f0ea, 0.42, 0),
  cream: mat(0xe9e5d8, 0.5, 0),
  hdpe: mat(0xf3f5f4, 0.55, 0),
  print: mat(0xffffff, 0.45, 0),
  yellow: mat(0xffc21f, 0.38, 0),
  orange: mat(0xff8a2b, 0.42, 0),
  coral: mat(0xff6b4a, 0.42, 0),
  red: mat(0xd6332a, 0.4, 0),
  turquoise: mat(0x19b5b0, 0.4, 0),
  teal: mat(0x0f7f86, 0.45, 0),
  blue: mat(0x1f63c9, 0.5, 0),
  navy: mat(0x1b3266, 0.45, 0),
  green: mat(0x2aa15a, 0.45, 0),
  wood: mat(0xdcbf8a, 0.78, 0),
  woodDark: mat(0xa87b47, 0.7, 0),
  flex: mat(0xe08a2a, 0.35, 0.2),
  pcb: mat(0xffffff, 0.5, 0.1),
  glassDark: mat(0x08090b, 0.06, 0),
  bristle: mat(0x1c1c1f, 0.7, 0),
  sponge: mat(0xf3c63a, 0.95, 0),
} as const;

/** tinta emissiva (il canale colore del builder "glow" è la tinta dell'emissione) */
export const glowTint = (hex: number): Mat => mat(hex, 0.2, 0);
export const OFF = glowTint(0x000000);

/** Poligono convesso con angoli arrotondati (antiorario). */
export function roundPoly(corners: readonly P2[], radius: number | readonly number[], segs = 5): P2[] {
  const n = corners.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p = corners[i] as P2;
    const a = corners[(i - 1 + n) % n] as P2;
    const b = corners[(i + 1) % n] as P2;
    const r = typeof radius === 'number' ? radius : (radius[i] as number);
    const ax = a[0] - p[0];
    const ay = a[1] - p[1];
    const bx = b[0] - p[0];
    const by = b[1] - p[1];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    const ux = ax / la;
    const uy = ay / la;
    const vx = bx / lb;
    const vy = by / lb;
    const half = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) / 2;
    const d = Math.min(r / Math.tan(half), la * 0.45, lb * 0.45);
    const rr = d * Math.tan(half);
    const bis = Math.hypot(ux + vx, uy + vy) || 1;
    const cx = p[0] + ((ux + vx) / bis) * (rr / Math.sin(half));
    const cy = p[1] + ((uy + vy) / bis) * (rr / Math.sin(half));
    const a0 = Math.atan2(p[1] + uy * d - cy, p[0] + ux * d - cx);
    let a1 = Math.atan2(p[1] + vy * d - cy, p[0] + vx * d - cx);
    while (a1 < a0) a1 += Math.PI * 2;
    if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    for (let k = 0; k <= segs; k++) {
      const t = a0 + ((a1 - a0) * k) / segs;
      out.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]);
    }
  }
  return out;
}

/** Manopola zigrinata con indice (asse +Y, base a y = 0). */
export function knob(b: Builder, r: number, h: number, body: Mat, o: { flutes?: number; skirt?: Mat; pointer?: Mat; capMat?: Mat } = {}): void {
  const fl = o.flutes ?? 18;
  if (o.skirt) b.cyl(r * 1.18, 0, h * 0.18, o.skirt, 20, h * 0.05);
  b.fluted(
    [
      [r, h * 0.12],
      [r * 0.94, h * 0.9],
    ],
    body,
    fl,
    0.07,
  );
  b.lathe(
    [
      [r * 0.94, h * 0.9],
      [r * 0.86, h],
      [0, h],
    ],
    o.capMat ?? body,
    { segs: fl * 2 },
  );
  if (o.pointer) b.at({ p: [0, h + 0.01 * r, r * 0.5] }, () => b.box(r * 0.16, r * 0.06, r * 0.7, o.pointer as Mat, r * 0.02));
}

/** Piedino in gomma (base a y = 0). */
export function foot(b: Builder, r: number, h: number): void {
  b.lathe(
    [
      [0, 0],
      [r * 0.85, 0],
      [r, h * 0.4],
      [r, h],
    ],
    C.rubber,
    { segs: 10 },
  );
}

/** Testa di vite a croce (asse +Y, appoggiata a y = 0). */
export function screwHead(b: Builder, r: number, m: Mat = C.steelDark): void {
  b.lathe(
    [
      [r, 0],
      [r, r * 0.25],
      [r * 0.6, r * 0.5],
      [0, r * 0.5],
    ],
    m,
    { segs: 8 },
  );
}

/** Cavo: tubo lungo una polilinea già campionata. */
export function cable(b: Builder, path: readonly P3[], r: number, m: Mat, sides = 6): void {
  b.sweep(path, r, m, { sides, caps: true });
}

/** Elica attorno all'asse Y locale: da y0 a y1, raggio r (opz. r1 finale), `turns` giri. */
export function helix(y0: number, y1: number, r: number, turns: number, perTurn = 10, r1 = r): P3[] {
  const n = Math.round(turns * perTurn);
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    const rr = r + (r1 - r) * t;
    out.push([Math.cos(a) * rr, y0 + (y1 - y0) * t, Math.sin(a) * rr]);
  }
  return out;
}

/** Pinza a coccodrillo: punta a y = 0, corpo lungo +Y (≈ 34 unità), guaina colorata. */
export function alligator(b: Builder, boot: Mat, s = 1): void {
  b.at({ s }, () => {
    for (const sg of [1, -1]) {
      b.at({ s: [1, 1, sg], r: [0.07, 0, 0] }, () => {
        const ring = (y: number, w: number, z0: number, z1: number): P3[] => [
          [w / 2, y, z1],
          [-w / 2, y, z1],
          [-w / 2, y, z0],
          [w / 2, y, z0],
        ];
        b.loft([ring(0, 2.6, 0.05, 0.9), ring(5, 4.2, 0.05, 1.8), ring(13, 5.6, 0.2, 3.2), ring(17, 5.6, 0.6, 3.4)], C.steel, { flat: true, capStart: true, capEnd: true });
        // dentini
        for (let i = 0; i < 2; i++) b.at({ p: [0, 2 + i * 3.4, 0.25] }, () => b.box(2.8 + i * 0.7, 1.2, 0.7, C.steelSatin, 0.1));
      });
    }
    b.at({ p: [0, 15.5, 0] }, () => b.at({ r: [0, 0, Math.PI / 2] }, () => b.cyl(1.1, -3.4, 3.4, C.steelDark, 8)));
    b.lathe(
      [
        [0, 16],
        [4.4, 16],
        [4.8, 18],
        [4.2, 30],
        [2.4, 34],
        [0, 34],
      ],
      boot,
      { segs: 10 },
    );
  });
}
