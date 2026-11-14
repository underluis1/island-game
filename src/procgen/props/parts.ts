/**
 * Arredi e oggetti condivisi fra le tre fasi del negozio (sedie, ventilatori, lampade, radio,
 * tablet, cassa, portatelefoni, casse, prodotti da vetrina, lucine, bandierine…).
 * Ogni funzione disegna con una `Pen` posizionata alla base dell'oggetto.
 */
import * as THREE from 'three';
import {
  type Batch,
  type ColorLike,
  Pen,
  type Surf,
  TILE,
  type V3,
  cyl,
  extrude,
  lathe,
  leaf,
  rbox,
  roundRectShape,
  sagPoints,
  sphere,
  torus,
  tr,
  tube,
  v3,
} from './kit';

export const PAL = {
  woodRaw: 0xc99c66,
  woodPale: 0xe0bf92,
  woodHoney: 0xc98f4e,
  woodDark: 0x7b5334,
  woodRed: 0x9c5a38,
  drift: 0xb3a391,
  bamboo: 0xdcc072,
  bambooDark: 0xb39248,
  bambooGreen: 0xa3ad5c,
  rope: 0xc6aa79,
  thatch: 0xd2b16b,
  steel: 0xc3c7cc,
  iron: 0x4b4e53,
  brass: 0xd4a84a,
  gold: 0xedbb3e,
  chrome: 0xe8eaec,
  black: 0x1d1e21,
  rubber: 0x2a2b2e,
  white: 0xf4f0e7,
  cream: 0xf2e4c5,
  red: 0xd9392c,
  coral: 0xf2705a,
  orange: 0xf39a3a,
  yellow: 0xf6c94a,
  teal: 0x1fa7a0,
  turquoise: 0x40c9c1,
  blue: 0x2b78c9,
  navy: 0x24406e,
  green: 0x4d9a52,
  leaf: 0x3f8f45,
  pink: 0xf08fa8,
  purple: 0x8a63b8,
  cardboard: 0xcba571,
  screen: 0x0e1519,
  warm: 0xffd9a0,
} as const;

const FINE: Surf = { tile: TILE.woodFine, color: PAL.woodHoney, rough: 0.6, jitter: 0.05 };
const CHROME: Surf = { color: PAL.chrome, metal: 1, rough: 0.25 };
const IRON: Surf = { color: PAL.iron, metal: 0.9, rough: 0.5 };
const RUBBER: Surf = { color: PAL.rubber, rough: 0.9 };

// ───────────────────────────── sedute ─────────────────────────────

/** Sgabello di plastica impilabile (seduta a y≈0.47). */
export function stoolPlastic(p: Pen, color: ColorLike = PAL.red): void {
  const s: Surf = { color, rough: 0.42 };
  p.add(rbox(0.31, 0.03, 0.31, 0.04, 3), s, tr(0, 0.455, 0));
  p.add(rbox(0.275, 0.065, 0.275, 0.03, 2), s, tr(0, 0.41, 0));
  p.cy(0.032, 0.032, 0.003, 0, 0.4695, 0, { color: 0x5a1410, rough: 0.7 }, 14);
  p.add(torus(0.036, 0.005, 5, 14), s, tr(0, 0.47, 0, Math.PI / 2));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const top = v3(sx * 0.115, 0.4, sz * 0.115);
      const bot = v3(sx * 0.165, 0.012, sz * 0.165);
      p.add(rbox(top.distanceTo(bot), 0.05, 0.05, 0.016, 1), s, new THREE.Matrix4().multiplyMatrices(tr((top.x + bot.x) / 2, (top.y + bot.y) / 2, (top.z + bot.z) / 2), new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(1, 0, 0), top.clone().sub(bot).normalize()))));
      p.cy(0.03, 0.032, 0.012, bot.x, 0, bot.z, s, 8);
    }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    // traversa fra due gambe adiacenti
    const a1 = v3(c * 0.145 - sn * 0.145, 0.19, sn * 0.145 + c * 0.145);
    const b1 = v3(c * 0.145 + sn * 0.145, 0.19, sn * 0.145 - c * 0.145);
    p.beam(a1, b1, 0.04, 0.014, { ...s, uv: [0.2, 0.1] }, 0.005);
  }
}

/** Sedia di legno con cuscino (seduta a y≈0.47, schienale verso +Z). */
export function chairWood(p: Pen, cushion: ColorLike = PAL.teal): void {
  const w: Surf = { ...FINE, color: PAL.woodHoney };
  for (const sx of [-1, 1]) {
    p.py(0.44, 0.04, 0.04, sx * 0.19, 0.22, -0.18, w, 0.008);
    p.add(rbox(0.96, 0.04, 0.04, 0.008), { ...w, uv: [0.8, 0.05] }, tr(sx * 0.19, 0.48, 0.2, 0.07, 0, Math.PI / 2));
    p.pz(0.36, 0.03, 0.025, sx * 0.19, 0.2, 0.01, w);
    p.pz(0.38, 0.05, 0.022, sx * 0.19, 0.415, 0.01, w);
  }
  p.px(0.36, 0.05, 0.022, 0, 0.415, -0.18, w);
  p.px(0.36, 0.05, 0.022, 0, 0.415, 0.19, w);
  p.px(0.36, 0.03, 0.025, 0, 0.14, 0.01, w);
  p.add(rbox(0.44, 0.025, 0.42, 0.01), w, tr(0, 0.45, 0));
  p.add(rbox(0.4, 0.05, 0.38, 0.025, 2), { tile: TILE.fabric, color: cushion, rough: 0.95, uv: [0.4, 0.4] }, tr(0, 0.485, 0));
  // schienale: due traverse curve + listelli
  for (const [y, h] of [
    [0.9, 0.07],
    [0.66, 0.045],
  ] as const)
    p.add(rbox(0.42, h, 0.022, 0.008), w, tr(0, y, 0.2 + (y - 0.48) * 0.07 + 0.012, 0.07));
  for (const x of [-0.11, 0, 0.11]) p.add(rbox(0.2, 0.045, 0.012, 0.004), { ...w, uv: [0.2, 0.05] }, tr(x, 0.78, 0.232, 0.07, 0, Math.PI / 2));
}

/** Sedia ergonomica da ufficio (seduta a y≈0.5, schienale verso +Z). */
export function chairErgo(p: Pen, accent: ColorLike = PAL.teal): void {
  const dark: Surf = { color: 0x2b2d31, rough: 0.6 };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const q = p.at(0, 0, 0, 0, a, 0);
    q.add(rbox(0.3, 0.03, 0.05, 0.012, 1), dark, tr(0.16, 0.075, 0, 0, 0, -0.1));
    q.add(sphere(0.03, 8, 6), RUBBER, tr(0.3, 0.03, 0));
    q.cy(0.012, 0.012, 0.03, 0.3, 0.035, 0, CHROME, 6);
  }
  p.cy(0.045, 0.055, 0.05, 0, 0.06, 0, dark, 12);
  p.cy(0.022, 0.022, 0.3, 0, 0.1, 0, CHROME, 10);
  p.cy(0.032, 0.032, 0.14, 0, 0.1, 0, dark, 10);
  p.box(0.2, 0.05, 0.22, 0, 0.415, 0, dark, 0.015);
  p.rod(v3(0.1, 0.41, 0.03), v3(0.27, 0.4, 0.03), 0.008, dark);
  p.add(rbox(0.48, 0.09, 0.46, 0.045, 3), { tile: TILE.fabric, color: 0x35383d, rough: 0.95, uv: [0.5, 0.5] }, tr(0, 0.485, -0.01));
  // schienale
  p.add(rbox(0.05, 0.3, 0.03, 0.012), dark, tr(0, 0.56, 0.25, 0.25));
  p.add(rbox(0.44, 0.5, 0.05, 0.025, 3), { tile: TILE.fabric, color: accent, rough: 0.9, uv: [0.5, 0.5] }, tr(0, 0.89, 0.27, 0.12));
  p.add(rbox(0.46, 0.52, 0.03, 0.02, 2), dark, tr(0, 0.89, 0.295, 0.12));
  p.add(rbox(0.26, 0.12, 0.05, 0.025, 2), { tile: TILE.fabric, color: 0x35383d, rough: 0.95, uv: [0.3, 0.2] }, tr(0, 1.24, 0.33, 0.1));
  p.add(rbox(0.03, 0.14, 0.02, 0.008), dark, tr(0, 1.15, 0.325, 0.12));
  for (const sx of [-1, 1]) {
    p.add(rbox(0.03, 0.2, 0.04, 0.01), dark, tr(sx * 0.26, 0.58, 0.03));
    p.add(rbox(0.07, 0.03, 0.26, 0.014, 2), { color: 0x3a3d42, rough: 0.8 }, tr(sx * 0.26, 0.69, 0));
    p.rod(v3(sx * 0.2, 0.44, 0.03), v3(sx * 0.26, 0.5, 0.03), 0.012, dark);
  }
}

// ───────────────────────────── ventilatori e clima ─────────────────────────────

export interface FanRig {
  spin: number;
  osc: number;
  /** asse di rotazione delle pale nello spazio del batch */
  axis: V3;
}

/**
 * Ventilatore (da tavolo o a piantana) che soffia verso +Z locale.
 * Va disegnato in un batch dedicato: crea due ossi (oscillazione testa, rotazione pale).
 */
export function fan(p: Pen, standing: boolean, color: ColorLike = PAL.turquoise): FanRig {
  const body: Surf = { color, rough: 0.4 };
  const R = standing ? 0.215 : 0.135;
  const hub = standing ? 1.28 : 0.235;
  if (standing) {
    p.add(lathe([[0, 0], [0.22, 0], [0.225, 0.012], [0.2, 0.03], [0.06, 0.05], [0.03, 0.07], [0, 0.07]], 20), body);
    p.cy(0.017, 0.02, 0.62, 0, 0.06, 0, CHROME, 10);
    p.cy(0.014, 0.014, 0.45, 0, 0.66, 0, CHROME, 10);
    p.cy(0.028, 0.028, 0.06, 0, 0.64, 0, { color: PAL.black, rough: 0.5 }, 10);
    p.add(rbox(0.09, 0.1, 0.08, 0.02, 2), body, tr(0, 1.13, -0.01));
    for (let i = 0; i < 3; i++) p.box(0.016, 0.01, 0.012, -0.022 + i * 0.022, 1.12, 0.031, { color: i === 0 ? PAL.red : PAL.white, rough: 0.5 }, 0.003);
  } else {
    p.add(rbox(0.21, 0.04, 0.18, 0.025, 3), body, tr(0, 0.02, -0.01));
    for (let i = 0; i < 4; i++) p.box(0.022, 0.012, 0.018, -0.045 + i * 0.03, 0.042, 0.05, { color: i === 0 ? PAL.red : PAL.white, rough: 0.5 }, 0.004);
    p.add(lathe([[0.03, 0.035], [0.022, 0.07], [0.02, 0.14], [0.024, 0.19]], 10), body, tr(0, 0, -0.03));
    for (const sx of [-1, 1]) p.cy(0.012, 0.014, 0.006, sx * 0.08, -0.004, 0.05, RUBBER, 8);
  }
  const b = p.b;
  const osc = b.bone(p.pt(0, hub - 0.06, -0.04));
  const spin = b.bone(p.pt(0, hub, 0), osc);
  const head = p.at(0, hub, 0).surf({ bone: osc });
  // motore (asse lungo Z)
  head.add(lathe([[0, -0.03], [R * 0.3, -0.028], [R * 0.4, 0.0], [R * 0.42, 0.05], [R * 0.34, 0.1], [R * 0.2, 0.125], [0, 0.13]], 14), body, tr(0, 0, -0.015, -Math.PI / 2));
  head.add(rbox(0.035, 0.07, 0.04, 0.012), body, tr(0, -0.045, -0.06));
  // gabbia
  const wire: Surf = { color: PAL.chrome, metal: 1, rough: 0.3, bone: osc };
  head.add(torus(R, 0.005, 5, 28), wire, tr(0, 0, 0.012));
  head.add(torus(R * 0.985, 0.004, 5, 28), wire, tr(0, 0, 0.04));
  head.add(torus(R * 0.985, 0.004, 5, 28), wire, tr(0, 0, -0.012));
  head.add(cyl(R * 1.01, R * 1.01, 0.02, 28, true), { color, rough: 0.4, bone: osc }, tr(0, 0, 0.002, Math.PI / 2));
  const spokes = standing ? 28 : 22;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    head.rod(v3(c * 0.04, s * 0.04, 0.066), v3(c * R * 0.985, s * R * 0.985, 0.04), 0.0022, wire, 4);
    if (i % 2 === 0) head.rod(v3(c * R * 0.42, s * R * 0.42, -0.03), v3(c * R * 0.985, s * R * 0.985, -0.012), 0.0022, wire, 4);
  }
  head.add(cyl(0.045, 0.045, 0.012, 16), { color: PAL.white, rough: 0.4, bone: osc }, tr(0, 0, 0.058, Math.PI / 2));
  head.add(cyl(0.022, 0.022, 0.004, 12), { color, rough: 0.4, bone: osc }, tr(0, 0, 0.07, Math.PI / 2));
  // pale
  const blade: Surf = { color: 0xdff3f1, rough: 0.35, bone: spin };
  head.add(cyl(R * 0.2, R * 0.22, 0.045, 12), blade, tr(0, 0, -0.008, Math.PI / 2));
  for (let i = 0; i < 3; i++) {
    const g = leaf(R * 0.86, R * 0.62, { bend: 0.12, fold: -0.004, segs: 5, width: (t) => 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.12)) });
    g.applyMatrix4(tr(0, R * 0.08, 0, 0, 0.42, 0));
    head.add(g, blade, tr(0, 0, 0.014, 0, 0, (i / 3) * Math.PI * 2));
  }
  const axis = v3(0, 0, 1).transformDirection(p.m);
  return { spin, osc, axis };
}

export interface AcRig {
  flap: number;
  axis: V3;
}

/** Split a parete (schiena su z=0, sporge verso +Z, centro in origine). Batch dedicato (osso aletta). */
export function acSplit(p: Pen): AcRig {
  const w: Surf = { color: 0xf3f4f2, rough: 0.35 };
  p.add(rbox(0.9, 0.29, 0.2, 0.05, 3), w, tr(0, 0, 0.1));
  p.add(rbox(0.86, 0.012, 0.19, 0.004), { color: 0xd9dcda, rough: 0.5 }, tr(0, 0.04, 0.105));
  p.add(rbox(0.8, 0.05, 0.06, 0.01), { color: 0x23262a, rough: 0.6 }, tr(0, -0.115, 0.15, 0.5));
  p.box(0.05, 0.02, 0.004, 0.33, -0.03, 0.2, { color: 0x101316, rough: 0.2 }, 0.002);
  p.box(0.01, 0.01, 0.004, 0.345, -0.03, 0.2015, { color: 0x58ff9a, glow: 4 }, 0.002);
  p.box(0.012, 0.01, 0.004, 0.318, -0.03, 0.2015, { color: 0x9fe8ff, glow: 2 }, 0.002);
  // tubazione e canalina
  p.box(0.07, 0.6, 0.05, 0.52, 0.2, 0.03, { color: 0xeeeeea, rough: 0.6 }, 0.012);
  p.add(tube([v3(0.45, -0.05, 0.03), v3(0.5, -0.08, 0.03), v3(0.52, -0.02, 0.03), v3(0.52, 0.1, 0.03)], 0.018, 6), { color: 0xeeeeea, rough: 0.6 });
  const flap = p.b.bone(p.pt(0, -0.125, 0.14));
  p.add(rbox(0.8, 0.008, 0.075, 0.003), { ...w, bone: flap }, tr(0, -0.14, 0.175, 0.5));
  return { flap, axis: v3(1, 0, 0).transformDirection(p.m) };
}

// ───────────────────────────── lampade ─────────────────────────────

/**
 * Lampada da banco. La base sta nell'origine della penna; il braccio si protende verso +X locale.
 * Restituisce la posizione (spazio batch) della sorgente luminosa.
 */
export function lamp(p: Pen, tier: 1 | 2, color: ColorLike = PAL.coral): V3 {
  const enamel: Surf = { color, rough: 0.35, metal: 0.2 };
  if (tier === 1) {
    p.add(lathe([[0, 0], [0.078, 0], [0.08, 0.008], [0.07, 0.02], [0.02, 0.028], [0.014, 0.05], [0, 0.05]], 20), enamel);
    const j0 = v3(0, 0.045, 0);
    const j1 = v3(-0.07, 0.3, 0);
    const j2 = v3(0.2, 0.47, 0);
    p.rod(j0, j1, 0.007, CHROME, 8);
    p.rod(j1, j2, 0.007, CHROME, 8);
    p.rod(v3(0.012, 0.05, 0.014), v3(-0.058, 0.3, 0.014), 0.003, IRON, 5);
    for (const j of [j0, j1, j2]) {
      p.add(cyl(0.016, 0.016, 0.03, 10), enamel, tr(j.x, j.y, j.z - 0.015, Math.PI / 2));
      p.add(cyl(0.008, 0.008, 0.036, 6), IRON, tr(j.x, j.y, j.z - 0.018, Math.PI / 2));
    }
    // paralume: asse inclinato verso il basso e in avanti
    const head = p.at(j2.x, j2.y, j2.z, 0, 0, -2.6);
    head.add(lathe([[0.0, -0.02], [0.03, -0.018], [0.034, 0.02], [0.05, 0.05], [0.095, 0.15], [0.099, 0.152]], 20), enamel);
    head.add(lathe([[0.03, 0.022], [0.046, 0.05], [0.091, 0.149]], 20), { color: 0xfff1d0, rough: 0.6, glow: 0.9 });
    head.add(sphere(0.03, 12, 8), { color: 0xfff0c8, rough: 0.3, glow: 6 }, tr(0, 0.075, 0));
    head.cy(0.016, 0.02, 0.05, 0, 0.01, 0, { color: PAL.white, rough: 0.5 }, 10);
    p.add(tube([v3(-0.06, 0.02, 0), v3(-0.1, 0.006, 0.02), v3(-0.16, 0.004, 0.0)], 0.004, 5), RUBBER);
    return p.pt(j2.x + 0.07, j2.y - 0.12, 0);
  }
  // lampada con lente: morsetto + doppio braccio a pantografo + testa ad anello
  const clamp: Surf = { color: 0x35383d, rough: 0.5, metal: 0.6 };
  p.add(rbox(0.03, 0.12, 0.06, 0.006), clamp, tr(-0.02, -0.025, 0));
  p.add(rbox(0.09, 0.014, 0.06, 0.005), clamp, tr(0.02, 0.007, 0));
  p.add(rbox(0.09, 0.014, 0.06, 0.005), clamp, tr(0.02, -0.075, 0));
  p.cy(0.006, 0.006, 0.07, 0.04, -0.12, 0, CHROME, 8);
  p.cy(0.018, 0.018, 0.008, 0.04, -0.125, 0, IRON, 10);
  p.cy(0.014, 0.014, 0.08, 0, 0.012, 0, CHROME, 10);
  const j0 = v3(0, 0.09, 0);
  const j1 = v3(-0.09, 0.42, 0);
  const j2 = v3(0.25, 0.56, 0);
  const white: Surf = { color: 0xf1f2f0, rough: 0.35 };
  for (const dz of [-0.014, 0.014]) {
    p.rod(v3(j0.x, j0.y, dz), v3(j1.x, j1.y, dz), 0.006, white, 6);
    p.rod(v3(j1.x, j1.y, dz), v3(j2.x, j2.y, dz), 0.006, white, 6);
  }
  p.rod(v3(-0.02, 0.16, 0), v3(-0.07, 0.36, 0), 0.004, CHROME, 5);
  p.rod(v3(-0.02, 0.44, 0), v3(0.16, 0.515, 0), 0.004, CHROME, 5);
  for (const j of [j0, j1, j2]) {
    p.add(cyl(0.02, 0.02, 0.05, 12), { color: 0x35383d, rough: 0.5 }, tr(j.x, j.y, j.z - 0.025, Math.PI / 2));
    p.add(cyl(0.012, 0.012, 0.056, 6), { color, rough: 0.4 }, tr(j.x, j.y, j.z - 0.028, Math.PI / 2));
  }
  const head = p.at(j2.x + 0.11, j2.y - 0.045, 0, 0, 0, -0.35);
  head.rod(v3(-0.11, 0.045, 0), v3(-0.085, 0.01, 0), 0.01, white, 6);
  head.add(torus(0.088, 0.024, 8, 28), white, tr(0, 0, 0, Math.PI / 2));
  head.add(torus(0.088, 0.008, 6, 28), { color: 0xf4fbff, rough: 0.3, glow: 5 }, tr(0, -0.02, 0, Math.PI / 2));
  head.add(lathe([[0, 0.012], [0.04, 0.009], [0.068, 0]], 20), { color: 0xbfe6f2, rough: 0.05, metal: 0.4 });
  head.add(lathe([[0.068, 0], [0.04, -0.006], [0, -0.008]], 20), { color: 0xbfe6f2, rough: 0.05, metal: 0.4 });
  head.rod(v3(0.1, 0, 0), v3(0.15, 0.005, 0), 0.007, { color: 0x35383d, rough: 0.5 }, 6);
  return head.pt(0, -0.06, 0);
}

// ───────────────────────────── elettronica da banco ─────────────────────────────

/** Radio portatile rétro (fronte verso +Z, base in origine). */
export function radio(p: Pen, color: ColorLike = PAL.teal): void {
  const w = 0.27;
  const h = 0.15;
  const d = 0.08;
  p.add(rbox(w, h, d, 0.022, 3), { color, rough: 0.4 }, tr(0, h / 2 + 0.006, 0));
  p.add(rbox(w - 0.03, h - 0.03, 0.01, 0.012, 2), { color: PAL.cream, rough: 0.5 }, tr(0, h / 2 + 0.006, d / 2));
  // altoparlante
  const sx = -0.055;
  const sy = h / 2 + 0.006;
  p.add(cyl(0.05, 0.05, 0.004, 20), { color: 0x2a2520, rough: 0.9 }, tr(sx, sy, d / 2 + 0.004, Math.PI / 2));
  p.add(torus(0.051, 0.005, 6, 22), CHROME, tr(sx, sy, d / 2 + 0.008));
  for (let i = -3; i <= 3; i++) {
    const y = i * 0.0135;
    const half = Math.sqrt(Math.max(0, 0.048 * 0.048 - y * y));
    p.box(half * 2, 0.005, 0.004, sx, sy + y, d / 2 + 0.009, { color: PAL.brass, metal: 0.9, rough: 0.4 }, 0.002);
  }
  // scala di sintonia
  p.box(0.09, 0.034, 0.004, 0.065, sy + 0.035, d / 2 + 0.006, { color: 0xffd98a, rough: 0.3, glow: 1.2 }, 0.004);
  p.box(0.003, 0.03, 0.002, 0.05, sy + 0.035, d / 2 + 0.009, { color: PAL.red, rough: 0.4, glow: 0.6 }, 0);
  for (let i = 0; i < 7; i++) p.box(0.002, 0.008, 0.002, 0.028 + i * 0.0125, sy + 0.045, d / 2 + 0.0085, { color: 0x4a3a20 }, 0);
  for (const kx of [0.04, 0.09]) {
    p.add(cyl(0.016, 0.018, 0.016, 14), { color: 0x2a2520, rough: 0.5 }, tr(kx, sy - 0.025, d / 2 + 0.004, Math.PI / 2));
    p.add(cyl(0.009, 0.009, 0.004, 10), CHROME, tr(kx, sy - 0.025, d / 2 + 0.02, Math.PI / 2));
  }
  // maniglia, antenna, piedini
  p.add(tube([v3(-0.1, h, 0), v3(-0.09, h + 0.04, 0), v3(0, h + 0.055, 0), v3(0.09, h + 0.04, 0), v3(0.1, h, 0)], 0.007, 6, 4), { color: 0x2a2520, rough: 0.5 });
  p.rod(v3(0.115, h, -0.02), v3(0.2, h + 0.27, -0.05), 0.003, CHROME, 5);
  p.cy(0.006, 0.006, 0.02, 0.115, h, -0.02, CHROME, 6);
  p.add(sphere(0.006, 6, 5), CHROME, tr(0.2, h + 0.27, -0.05));
  for (const fx of [-0.1, 0.1]) p.box(0.03, 0.008, 0.06, fx, 0.004, 0, RUBBER, 0.003);
}

/** Tablet ordini su leggio di legno (schermo verso +Z, inclinato all'indietro). Restituisce il centro schermo. */
export function tablet(p: Pen): V3 {
  p.add(rbox(0.2, 0.022, 0.11, 0.006), FINE, tr(0, 0.011, 0));
  p.add(rbox(0.16, 0.03, 0.02, 0.005), FINE, tr(0, 0.035, 0.035));
  p.add(rbox(0.1, 0.13, 0.016, 0.004), { ...FINE, uv: [0.2, 0.1] }, tr(0, 0.07, -0.045, 0.45));
  const t = p.at(0, 0.125, 0.012, -0.36);
  t.add(rbox(0.26, 0.18, 0.011, 0.014, 3), { color: 0x1a1c20, rough: 0.35 });
  const z = 0.0058;
  t.add(rbox(0.236, 0.156, 0.001, 0), { color: 0xeaf6f2, rough: 0.2, glow: 0.75 }, tr(0, 0, z));
  t.add(rbox(0.236, 0.03, 0.001, 0), { color: PAL.teal, rough: 0.2, glow: 0.9 }, tr(0, 0.063, z + 0.0006));
  for (let i = 0; i < 3; i++) {
    const y = 0.025 - i * 0.04;
    t.add(rbox(0.21, 0.032, 0.001, 0), { color: 0xffffff, rough: 0.2, glow: 0.9 }, tr(0, y, z + 0.0006));
    t.add(rbox(0.024, 0.024, 0.001, 0), { color: [PAL.coral, PAL.yellow, PAL.turquoise][i], rough: 0.2, glow: 1 }, tr(-0.086, y, z + 0.0012));
    t.add(rbox(0.09, 0.006, 0.001, 0), { color: 0x56626a, rough: 0.2, glow: 0.5 }, tr(-0.02, y + 0.006, z + 0.0012));
    t.add(rbox(0.06, 0.005, 0.001, 0), { color: 0xa8b4ba, rough: 0.2, glow: 0.5 }, tr(-0.035, y - 0.006, z + 0.0012));
    t.add(rbox(0.03, 0.012, 0.001, 0), { color: i === 0 ? PAL.coral : 0x9ed9b0, rough: 0.2, glow: 0.9 }, tr(0.082, y, z + 0.0012));
  }
  return t.pt(0, 0, 0);
}

/** Cassetta dei soldi smaltata con banconote e monete accanto (fronte verso +Z). */
export function cashBox(p: Pen, color: ColorLike = PAL.red): void {
  const en: Surf = { color, rough: 0.35, metal: 0.4 };
  p.add(rbox(0.24, 0.06, 0.17, 0.012, 2), en, tr(0, 0.03, 0));
  p.add(rbox(0.245, 0.035, 0.175, 0.012, 2), en, tr(0, 0.0785, 0));
  p.box(0.246, 0.004, 0.176, 0, 0.06, 0, { color: 0x1c1010, rough: 0.6 }, 0);
  p.add(tube([v3(-0.045, 0.096, 0), v3(-0.04, 0.115, 0), v3(0.04, 0.115, 0), v3(0.045, 0.096, 0)], 0.005, 6, 4), CHROME);
  p.box(0.035, 0.03, 0.006, 0, 0.05, 0.086, { color: PAL.brass, metal: 1, rough: 0.35 }, 0.004);
  p.add(cyl(0.005, 0.005, 0.004, 8), { color: PAL.black }, tr(0, 0.05, 0.088, Math.PI / 2));
  // banconote (20, 100, 500 baht) e monete
  const notes = [0x6aa56b, 0xc5564d, 0x8a6bb0];
  notes.forEach((c, i) => p.add(rbox(0.13, 0.006, 0.065, 0.001), { color: c, tile: TILE.paper, rough: 0.9, uv: [0.3, 0.2] }, tr(0.2 + i * 0.006, 0.004 + i * 0.006, 0.02 - i * 0.012, 0, 0.2 - i * 0.22, 0)));
  p.box(0.012, 0.004, 0.07, 0.205, 0.0185, 0.0, { color: PAL.cardboard, rough: 0.9 }, 0);
  for (let i = 0; i < 5; i++) p.cy(0.012, 0.012, 0.0035, 0.19 + (i % 2) * 0.004, i * 0.0036, -0.07, { color: i % 2 ? PAL.gold : PAL.steel, metal: 1, rough: 0.35 }, 12);
  p.cy(0.012, 0.012, 0.0035, 0.225, 0, -0.06, { color: PAL.gold, metal: 1, rough: 0.35 }, 12);
}

/** Registratore di cassa (fase 3), fronte verso +Z. */
export function cashRegister(p: Pen, accent: ColorLike = PAL.teal): void {
  const body: Surf = { color: 0x2f3237, rough: 0.5 };
  p.add(rbox(0.36, 0.1, 0.38, 0.012, 2), body, tr(0, 0.05, 0));
  p.box(0.3, 0.06, 0.006, 0, 0.05, 0.19, { color: 0x3d4147, rough: 0.5 }, 0.004);
  p.box(0.08, 0.012, 0.012, 0, 0.05, 0.196, CHROME, 0.004);
  p.add(rbox(0.34, 0.08, 0.3, 0.016, 2), { color: 0xe9e6de, rough: 0.5 }, tr(0, 0.15, -0.02, 0.22));
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 5; c++) {
      const col = c === 4 ? (r === 3 ? PAL.green : accent) : 0xfafafa;
      p.add(rbox(0.036, 0.012, 0.032, 0.005), { color: col, rough: 0.45 }, tr(-0.11 + c * 0.048, 0.2 - r * 0.0095, -0.095 + r * 0.045, 0.22));
    }
  p.add(rbox(0.2, 0.09, 0.05, 0.012, 2), body, tr(0.04, 0.26, -0.16, -0.25));
  p.add(rbox(0.17, 0.06, 0.002, 0), { color: 0x7dffb0, rough: 0.2, glow: 1.6 }, tr(0.04, 0.262, -0.1335, -0.25));
  p.add(cyl(0.028, 0.028, 0.07, 12), { color: 0xfafafa, tile: TILE.paper, rough: 0.9 }, tr(-0.155, 0.235, -0.15, 0, 0, Math.PI / 2));
  p.add(rbox(0.06, 0.001, 0.08, 0), { color: 0xfafafa, rough: 0.9 }, tr(-0.12, 0.24, -0.1, 0.5));
}

/**
 * Portatelefoni a slot, lungo X, centrato sull'origine (base a y=0).
 * Restituisce le posizioni (spazio batch) del fondo di ogni slot.
 */
export function rack(p: Pen, slots: number): V3[] {
  const pitch = 0.086;
  const len = slots * pitch + 0.03;
  p.add(rbox(len, 0.028, 0.12, 0.006), FINE, tr(0, 0.014, 0));
  p.add(rbox(len, 0.06, 0.014, 0.005), FINE, tr(0, 0.058, -0.053));
  p.add(rbox(len, 0.014, 0.012, 0.004), { ...FINE, color: PAL.woodDark }, tr(0, 0.035, 0.054));
  const out: V3[] = [];
  const tags = [PAL.coral, PAL.yellow, PAL.turquoise, PAL.green, PAL.pink, PAL.orange, PAL.blue, PAL.purple];
  for (let i = 0; i <= slots; i++) {
    const x = -len / 2 + 0.015 + i * pitch;
    p.add(rbox(0.009, 0.085, 0.1, 0.004), { ...FINE, color: PAL.woodPale, uv: [0.1, 0.1] }, tr(x, 0.068, 0.0));
    if (i < slots) {
      out.push(p.pt(x + pitch / 2, 0.028, 0));
      p.add(cyl(0.011, 0.011, 0.003, 10), { color: tags[i % tags.length], rough: 0.5 }, tr(x + pitch / 2, 0.035, 0.06, Math.PI / 2));
      p.box(pitch - 0.016, 0.003, 0.085, x + pitch / 2, 0.0295, 0, { color: 0x2a2b2e, rough: 0.95 }, 0);
    }
  }
  return out;
}

/** Portafortuna: statuetta dorata su vassoio con ghirlanda di tagete, incenso e offerta. */
export function charm(p: Pen): void {
  p.add(rbox(0.15, 0.012, 0.11, 0.005), { color: 0xb3261e, rough: 0.35 }, tr(0, 0.006, 0));
  p.add(rbox(0.13, 0.004, 0.09, 0), { color: PAL.gold, metal: 1, rough: 0.35 }, tr(0, 0.013, 0));
  const gold: Surf = { color: PAL.gold, metal: 1, rough: 0.28 };
  const g = lathe(
    [[0, 0], [0.034, 0], [0.038, 0.008], [0.031, 0.016], [0.027, 0.02], [0.031, 0.024], [0.035, 0.036], [0.026, 0.05], [0.021, 0.064], [0.023, 0.076], [0.01, 0.084], [0.0135, 0.092], [0.015, 0.101], [0.012, 0.11], [0.0065, 0.115], [0.0045, 0.122], [0, 0.127]],
    16,
  );
  p.add(g, gold, tr(-0.02, 0.014, -0.01, 0, 0, 0, 1, 1, 0.82));
  p.add(torus(0.037, 0.008, 6, 18), { color: 0xf5a623, rough: 0.9 }, tr(-0.02, 0.027, -0.01, Math.PI / 2 + 0.12));
  p.add(lathe([[0, 0], [0.012, 0], [0.016, 0.012], [0.014, 0.02], [0, 0.019]], 10), { color: PAL.brass, metal: 1, rough: 0.4 }, tr(0.045, 0.014, 0.02));
  for (let i = 0; i < 3; i++) {
    const a = v3(0.045 + (i - 1) * 0.004, 0.03, 0.02);
    const b = v3(0.045 + (i - 1) * 0.012, 0.1, 0.02 + (i - 1) * 0.006);
    p.rod(a, b, 0.0012, { color: 0x8a3a2a, rough: 0.9 }, 4);
    p.add(sphere(0.0022, 5, 4), { color: 0xff7a3a, glow: 3 }, tr(b.x, b.y, b.z));
  }
  p.cy(0.008, 0.011, 0.045, 0.05, 0.014, -0.03, { color: 0xd3202a, rough: 0.15 }, 10);
  p.cy(0.004, 0.006, 0.014, 0.05, 0.059, -0.03, { color: 0xd3202a, rough: 0.15 }, 8);
  p.rod(v3(0.05, 0.06, -0.03), v3(0.058, 0.1, -0.026), 0.0015, { color: PAL.white }, 4);
}

// ───────────────────────────── contenitori ─────────────────────────────

/** Cassa di legno a listelli (base centrata sull'origine). */
export function crate(p: Pen, w: number, h: number, d: number, color: ColorLike = PAL.woodPale): void {
  const s: Surf = { tile: TILE.wood, color, rough: 0.9, jitter: 0.1 };
  const t = 0.014;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.py(h, 0.035, 0.035, sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02), s, 0);
  const rows = Math.max(2, Math.round(h / 0.12));
  const sh = h / rows - 0.018;
  for (let i = 0; i < rows; i++) {
    const y = (i + 0.5) * (h / rows);
    for (const sz of [-1, 1]) p.px(w, sh, t, 0, y, sz * (d / 2 - t / 2), s, 0.003);
    for (const sx of [-1, 1]) p.pz(d - 0.004, sh, t, sx * (w / 2 - t / 2), y, 0, s, 0.003);
  }
  p.px(w - 0.02, t, d - 0.02, 0, t / 2 + 0.005, 0, s, 0);
}

/** Scatola di cartone con nastro ed etichetta. */
export function cardboardBox(p: Pen, w: number, h: number, d: number, label: ColorLike = PAL.white): void {
  p.add(rbox(w, h, d, 0.006), { tile: TILE.paper, color: PAL.cardboard, rough: 0.95, uv: [0.5, 0.5], rot: true, jitter: 0.08 }, tr(0, h / 2, 0));
  p.box(w * 0.16, 0.002, d + 0.002, 0, h, 0, { color: 0xe3cfa0, rough: 0.5 }, 0);
  p.box(w * 0.16, h * 0.3, 0.002, 0, h * 0.85, d / 2, { color: 0xe3cfa0, rough: 0.5 }, 0);
  p.box(w * 0.4, h * 0.3, 0.002, -w * 0.2, h * 0.4, d / 2 + 0.0005, { color: label, rough: 0.8 }, 0);
}

/** Vaschetta porta-minuterie in plastica (apertura verso +Z). */
export function partsBin(p: Pen, w: number, h: number, d: number, color: ColorLike): void {
  p.add(rbox(w, h, d, 0.008, 1), { color, rough: 0.45 }, tr(0, h / 2, 0));
  p.box(w - 0.016, 0.004, d - 0.016, 0, h, 0, { color: 0x15171a, rough: 0.9 }, 0);
  p.box(w * 0.6, h * 0.42, 0.003, 0, h * 0.5, d / 2, { color: PAL.white, rough: 0.8 }, 0);
  p.box(w * 0.4, h * 0.08, 0.003, 0, h * 0.55, d / 2 + 0.001, { color: 0x3a3d42, rough: 0.8 }, 0);
}

/** Frigo portatile da spiaggia. */
export function cooler(p: Pen, color: ColorLike = PAL.blue): void {
  p.add(rbox(0.52, 0.3, 0.33, 0.035, 2), { color, rough: 0.45 }, tr(0, 0.15, 0));
  p.add(rbox(0.54, 0.07, 0.35, 0.03, 2), { color: PAL.white, rough: 0.45 }, tr(0, 0.335, 0));
  p.box(0.06, 0.05, 0.012, 0, 0.29, 0.172, { color: PAL.white, rough: 0.4 }, 0.005);
  for (const sx of [-1, 1]) p.add(tube([v3(sx * 0.262, 0.22, -0.08), v3(sx * 0.3, 0.2, -0.08), v3(sx * 0.3, 0.2, 0.08), v3(sx * 0.262, 0.22, 0.08)], 0.008, 6, 3), { color: PAL.white, rough: 0.5 });
}

/** Cassetta attrezzi metallica. */
export function toolbox(p: Pen, color: ColorLike = PAL.red): void {
  const en: Surf = { color, rough: 0.4, metal: 0.5 };
  p.add(rbox(0.42, 0.13, 0.2, 0.012, 1), en, tr(0, 0.065, 0));
  p.add(rbox(0.43, 0.06, 0.21, 0.02, 2), en, tr(0, 0.155, 0));
  p.box(0.432, 0.004, 0.212, 0, 0.128, 0, { color: 0x1d1212, rough: 0.6 }, 0);
  p.add(tube([v3(-0.09, 0.185, 0), v3(-0.085, 0.215, 0), v3(0.085, 0.215, 0), v3(0.09, 0.185, 0)], 0.008, 6, 3), { color: PAL.black, rough: 0.5 });
  for (const sx of [-1, 1]) p.box(0.03, 0.045, 0.008, sx * 0.13, 0.125, 0.104, CHROME, 0.003);
}

/** Tanica. */
export function jerrycan(p: Pen, color: ColorLike = PAL.yellow): void {
  p.add(rbox(0.26, 0.36, 0.15, 0.035, 2), { color, rough: 0.5 }, tr(0, 0.18, 0));
  p.add(tube([v3(-0.06, 0.35, 0), v3(-0.05, 0.4, 0), v3(0.04, 0.4, 0), v3(0.06, 0.36, 0)], 0.014, 6, 3), { color, rough: 0.5 });
  p.cy(0.022, 0.022, 0.035, 0.09, 0.355, 0, { color: PAL.black, rough: 0.6 }, 10);
  p.box(0.14, 0.14, 0.004, -0.02, 0.17, 0.076, { color: PAL.white, rough: 0.7 }, 0);
}

/** Ciabatte infradito appoggiate sulla sabbia. */
export function flipFlops(p: Pen, color: ColorLike = PAL.turquoise): void {
  for (const sx of [-1, 1]) {
    const q = p.at(sx * 0.07, 0.004, sx * 0.03, 0, sx * 0.25);
    const g = extrude(roundRectShape(0.095, 0.25, 0.045), 0.014, 0.002, 6);
    q.add(g, { color, rough: 0.8 }, tr(0, 0.016, 0, Math.PI / 2));
    q.add(tube([v3(-0.036, 0.016, 0.0), v3(-0.02, 0.045, -0.04), v3(0, 0.02, -0.08)], 0.005, 5, 3), { color: PAL.white, rough: 0.6 });
    q.add(tube([v3(0.036, 0.016, 0.0), v3(0.02, 0.045, -0.04), v3(0, 0.02, -0.08)], 0.005, 5, 3), { color: PAL.white, rough: 0.6 });
  }
}

/** Stuoia intrecciata con bordi colorati (w lungo X, d lungo Z). */
export function strawMat(p: Pen, w: number, d: number, border: ColorLike = PAL.coral): void {
  p.add(rbox(w, 0.012, d, 0.004), { tile: TILE.mat, color: 0xd9c08a, rough: 1, uv: [1, 1] }, tr(0, 0.006, 0));
  for (const sz of [-1, 1]) p.box(w, 0.013, 0.05, 0, 0.0065, sz * (d / 2 - 0.025), { tile: TILE.fabric, color: border, rough: 1, uv: [0.5, 0.1] }, 0.003);
}

/** Ciabatta elettrica con cavo che serpeggia fino a `to` (coordinate locali). */
export function powerStrip(p: Pen, to: V3): void {
  p.add(rbox(0.26, 0.035, 0.06, 0.01, 2), { color: PAL.white, rough: 0.45 }, tr(0, 0.02, 0));
  for (let i = 0; i < 4; i++) p.cy(0.016, 0.016, 0.003, -0.085 + i * 0.05, 0.037, 0, { color: 0x24262a, rough: 0.6 }, 10);
  p.box(0.018, 0.006, 0.012, 0.11, 0.038, 0, { color: 0xff5a3a, glow: 2 }, 0.002);
  const mid = to.clone().multiplyScalar(0.5);
  p.add(tube([v3(-0.13, 0.02, 0), v3(-0.25, 0.012, 0.06), v3(mid.x - 0.1, 0.012, mid.z + 0.12), v3(mid.x + 0.12, 0.012, mid.z - 0.1), v3(to.x, 0.012, to.z)], 0.007, 5, 5), { color: PAL.orange, rough: 0.6 });
}

// ───────────────────────────── prodotti da vetrina ─────────────────────────────

export function phoneCase(p: Pen, color: ColorLike): void {
  p.add(rbox(0.076, 0.156, 0.011, 0.014, 2), { color, rough: 0.5 });
  p.add(rbox(0.03, 0.03, 0.002, 0.008, 1), { color: 0x16181b, rough: 0.3 }, tr(-0.015, 0.05, 0.006));
}

export function powerBank(p: Pen, color: ColorLike): void {
  p.add(rbox(0.07, 0.14, 0.024, 0.01, 2), { color, rough: 0.35, metal: 0.3 });
  for (let i = 0; i < 4; i++) p.add(rbox(0.006, 0.006, 0.002, 0), { color: 0x8fe9ff, glow: i < 3 ? 2.5 : 0 }, tr(-0.015 + i * 0.01, 0.05, 0.0125));
}

export function cableCoil(p: Pen, color: ColorLike): void {
  p.add(torus(0.036, 0.007, 6, 18), { color, rough: 0.6 });
  p.add(torus(0.03, 0.006, 6, 18), { color, rough: 0.6 }, tr(0.003, 0.002, 0.008));
  p.add(rbox(0.012, 0.03, 0.007, 0.002), { color: PAL.white, rough: 0.4 }, tr(0.036, -0.03, 0.004));
  p.add(rbox(0.014, 0.008, 0.012, 0), { color: PAL.cardboard, rough: 0.9 }, tr(0, 0.036, 0.004));
}

/** Telefono in esposizione su supporto inclinato (base in origine, schermo verso +Z). */
export function displayPhone(p: Pen, color: ColorLike, wall: ColorLike): void {
  p.add(rbox(0.06, 0.006, 0.05, 0.002), { color: 0xdfe6ea, rough: 0.15 }, tr(0, 0.003, 0));
  p.add(rbox(0.05, 0.05, 0.004, 0.001), { color: 0xdfe6ea, rough: 0.15 }, tr(0, 0.03, -0.014, -0.3));
  const q = p.at(0, 0.085, 0.0, -0.3);
  q.add(rbox(0.073, 0.15, 0.009, 0.012, 2), { color, rough: 0.3, metal: 0.6 });
  q.add(rbox(0.066, 0.142, 0.001, 0), { color: 0x0c0f12, rough: 0.1 }, tr(0, 0, 0.0047));
  q.add(rbox(0.062, 0.09, 0.001, 0), { color: wall, rough: 0.1, glow: 0.5 }, tr(0, 0.02, 0.0052));
  p.add(rbox(0.05, 0.022, 0.001, 0), { color: PAL.white, rough: 0.8 }, tr(0, 0.014, 0.03, -0.5));
  p.add(rbox(0.03, 0.006, 0.001, 0), { color: PAL.coral, rough: 0.8 }, tr(0, 0.015, 0.0306, -0.5));
}

// ───────────────────────────── luci e bandierine ─────────────────────────────

/** Filo di lucine fra una sequenza di punti. Il filo va nel batch della penna, le lampadine in `glow`. */
export function stringLights(wire: Pen, glow: Batch, pts: V3[], sag: number, spacing = 0.22, colors: ColorLike[] = [PAL.warm]): void {
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const curve = sagPoints(a, b, sag, 10);
    wire.add(tube(curve, 0.004, 4, 2), { color: 0x23301f, rough: 0.8 });
    const n = Math.max(1, Math.round(a.distanceTo(b) / spacing));
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      const q = a.clone().lerp(b, t);
      q.y -= sag * 4 * t * (1 - t);
      wire.cy(0.008, 0.01, 0.02, q.x, q.y - 0.022, q.z, { color: 0x23301f, rough: 0.7 }, 6);
      const g = sphere(0.021, 7, 5);
      g.scale(1, 1.25, 1);
      glow.add(g, { color: colors[k++ % colors.length], rough: 0.25, glow: 5 }, wire.m.clone().multiply(tr(q.x, q.y - 0.044, q.z)));
    }
  }
}

/** Bandierine triangolari su una corda (tessuto nel batch `cloth`, corda nella penna). */
export function bunting(ropePen: Pen, cloth: Batch, a: V3, b: V3, sag: number, colors: ColorLike[], size = 0.17): void {
  ropePen.cord(a, b, sag, 0.004, { color: 0xe8dcc0 });
  const n = Math.max(3, Math.floor(a.distanceTo(b) / (size * 1.25)));
  const dir = b.clone().sub(a).setY(0).normalize();
  const yaw = Math.atan2(-dir.z, dir.x);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const q = a.clone().lerp(b, t);
    q.y -= sag * 4 * t * (1 - t);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-size / 2, 0, 0, size / 2, 0, 0, 0, -size * 1.25, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    g.setIndex([0, 2, 1]);
    g.computeVertexNormals();
    const top = q.y;
    cloth.add(g, { color: colors[i % colors.length], rough: 0.9, uv: [0.2, 0.2], swayFn: (_x, y) => Math.min(1, (top - y) / (size * 1.25)) * 0.035 }, ropePen.m.clone().multiply(tr(q.x, q.y, q.z, 0, yaw, 0)));
  }
}
