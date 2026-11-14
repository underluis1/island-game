/** Fase 3 — Negozio in muratura affacciato sul mare: vetrata, split, banco microsaldatura, retrobottega, insegna luminosa. */
import * as THREE from 'three';
import { type Pen, type Surf, TILE, cyl, lathe, plane, rbox, tr, v3 } from './kit';
import { PAL, acSplit, cardboardBox, displayPhone, partsBin, stoolPlastic, strawMat, stringLights, toolbox } from './parts';
import { BULBS_WARM, deskItems, pegboard, signFace } from './shop-common';
import { type StageCtx, rect } from './shop-ctx';
import { SIGN_UV } from './signs';
import { showcase } from './stage2';

const FY = 0.03;
const XL = -3.4;
const XR = 3.4;
const ZF = -2.4;
const ZB = 3.2;
const H = 2.6;

export function buildStage3(c: StageCtx): void {
  const W = c.wood;
  const A = c.atlas;
  const P = c.plaster;
  const G = c.glass;
  const up = c.opts.upgrades;
  const wallC: Surf = { color: 0xf4ebda, rough: 0.9 };
  const accent: Surf = { color: c.opts.accentColor, rough: 0.7 };
  const cut: Surf = { color: 0x9a8f80, rough: 0.95 };
  const fine: Surf = { color: PAL.woodHoney, rough: 0.5, jitter: 0.05 };
  const dark: Surf = { color: PAL.woodDark, rough: 0.65, jitter: 0.05 };
  const steel: Surf = { color: 0x9aa0a6, metal: 0.9, rough: 0.4 };
  const white: Surf = { color: 0xf6f4ee, rough: 0.5 };
  /** muro lungo X o Z con zoccolo colorato */
  const wall = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, s: Surf = wallC): void => {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    P.add(new THREE.BoxGeometry(w, y1 - y0, d), { ...s, uv: [Math.max(w, d) / 1.5, (y1 - y0) / 1.5] }, tr((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  };

  // ── pavimento a piastrelle ──
  const ts = 0.68;
  for (let i = 0; i < 10; i++)
    for (let j = 0; j < 8; j++) {
      const x = XL + (i + 0.5) * ts;
      const z = ZF + 0.1 + (j + 0.5) * ((ZB - ZF - 0.1) / 8);
      P.add(new THREE.BoxGeometry(ts - 0.012, FY, (ZB - ZF - 0.1) / 8 - 0.012), { color: (i + j) % 2 ? 0xe2dccf : 0xd3ccbd, rough: 0.55, uv: [0.5, 0.5] }, tr(x, FY / 2, z));
    }
  wall(XL, XR, ZF - 0.05, ZB + 0.05, -0.05, FY - 0.006, { color: 0x8f877a, rough: 0.9 });
  wall(-1.3, 1.3, ZF - 0.7, ZF - 0.05, -0.05, FY - 0.01, { color: 0xcfc7b8, rough: 0.9 });
  c.floor = { y: FY, area: rect(XL, XR, ZF, ZB) };

  // ── muri: sinistra piena, retro e destra tagliati "a diorama" ──
  const T = 0.14;
  wall(XL - T, XL, ZF - T, ZB + T, 0, H);
  wall(XL - T - 0.004, XL + 0.004, ZF - T, ZB + T, 0, 0.12, accent);
  wall(XL - T - 0.01, XL + 0.01, ZF - T - 0.01, ZB + T + 0.01, H, H + 0.07, cut);
  // retro: tratto pieno a sinistra che scende a gradoni
  const steps: Array<[number, number, number]> = [
    [XL, -2.3, H],
    [-2.3, -1.8, 2.1],
    [-1.8, -1.3, 1.35],
    [-1.3, XR + T, 0.5],
  ];
  for (const [a, b, h] of steps) {
    wall(a, b, ZB, ZB + T, 0, h);
    wall(a, b + 0.005, ZB - 0.005, ZB + T + 0.005, h, h + 0.05, cut);
  }
  // destra: alto verso la facciata, poi basso
  const rs: Array<[number, number, number]> = [
    [ZF - T, -1.9, H],
    [-1.9, -1.45, 2.0],
    [-1.45, -1.0, 1.25],
    [-1.0, ZB, 0.5],
  ];
  for (const [a, b, h] of rs) {
    wall(XR, XR + T, a, b, 0, h);
    wall(XR - 0.005, XR + T + 0.005, a, b + 0.005, h, h + 0.05, cut);
  }
  wall(XR - 0.004, XR + T + 0.004, ZF - T, ZB + T, 0, 0.12, accent);

  // ── facciata vetrata sul mare, porta centrale aperta ──
  const DW = 0.95;
  wall(XL, -DW, ZF - T, ZF, 0, 0.45);
  wall(DW, XR, ZF - T, ZF, 0, 0.45);
  wall(XL - T, XR + T, ZF - T - 0.03, ZF + 0.02, 2.4, H, accent);
  wall(XL - T - 0.01, XR + T + 0.01, ZF - T - 0.04, ZF + 0.03, H, H + 0.07, cut);
  const frame: Surf = { color: c.opts.accentColor, rough: 0.5 };
  for (const [a, b] of [
    [XL, -DW],
    [DW, XR],
  ] as const) {
    const bays = 3;
    const bw = (b - a) / bays;
    A.box(b - a, 0.07, 0.2, (a + b) / 2, 0.485, ZF - T / 2, { tile: TILE.woodFine, color: PAL.woodHoney, rough: 0.5 }, 0.01);
    for (let i = 0; i <= bays; i++) A.box(0.07, 1.9, 0.09, a + i * bw, 1.45, ZF - T / 2, frame, 0.008);
    A.box(b - a, 0.06, 0.09, (a + b) / 2, 2.37, ZF - T / 2, frame, 0.008);
    for (let i = 0; i < bays; i++) G.add(plane(bw - 0.07, 1.83), {}, tr(a + (i + 0.5) * bw, 1.435, ZF - T / 2));
  }
  // ante scorrevoli aperte
  for (const sx of [-1, 1]) {
    const x = sx * (DW + 0.42);
    G.add(plane(0.84, 2.2), {}, tr(x, 1.2, ZF + 0.05));
    A.box(0.9, 0.05, 0.03, x, 2.32, ZF + 0.05, steel, 0.004);
    A.box(0.9, 0.05, 0.03, x, 0.08, ZF + 0.05, steel, 0.004);
    for (const e of [-0.45, 0.45]) A.box(0.035, 2.24, 0.03, x + e, 1.2, ZF + 0.05, steel, 0.004);
    A.box(0.02, 0.3, 0.05, x - sx * 0.38, 1.1, ZF + 0.07, { color: PAL.chrome, metal: 1, rough: 0.25 }, 0.006);
  }
  A.box(XR - XL, 0.04, 0.05, 0, 2.38, ZF + 0.05, steel, 0.004);

  // ── insegna luminosa sul tetto ──
  c.signStyle = 'lightbox';
  const S = c.signFrame.at(0, 0, ZF - T / 2);
  S.add(rbox(1.7, 0.69, 0.16, 0.02, 2), { color: 0x2b2e33, rough: 0.5, metal: 0.4 }, tr(0, 2.98, 0));
  for (const sx of [-1, 1]) S.box(0.06, 0.12, 0.08, sx * 0.7, 2.63, 0, { color: 0x2b2e33, rough: 0.5, metal: 0.5 }, 0.006);
  signFace(c, 1.6, 0.6, S.m.clone().multiply(tr(0, 2.98, 0)), SIGN_UV.main, true, 0.16);
  // "OPEN" luminoso accanto alla porta
  S.add(rbox(0.66, 0.2, 0.05, 0.012, 1), { color: 0x2b2e33, rough: 0.5 }, tr(1.62, 2.0, T / 2 + 0.07));
  signFace(c, 0.6, 0.15, S.m.clone().multiply(tr(1.62, 2.0, T / 2 + 0.07)), SIGN_UV.smallA, true, 0.05);
  for (const sx of [-1, 1]) S.cord(v3(1.62 + sx * 0.25, 2.36, T / 2 + 0.07), v3(1.62 + sx * 0.25, 2.1, T / 2 + 0.07), 0, 0.003, { color: PAL.black });

  // ── travi a vista (appendere lanterne e faretti) ──
  W.pz(ZB - ZF, 0.16, 0.12, -1.9, 2.52, (ZF + ZB) / 2, dark, 0.01);
  W.pz(2.5, 0.16, 0.12, 1.9, 2.52, ZF + 1.25, dark, 0.01);
  P.add(new THREE.BoxGeometry(0.125, 0.165, 0.01), cut, tr(1.9, 2.52, ZF + 2.505));

  // ── bancone principale ──
  W.add(rbox(1.9, 0.05, 0.84, 0.012, 2), { ...fine, uv: [1.7, 0.8] }, tr(0, 0.875, 0));
  A.add(rbox(1.84, 0.82, 0.04, 0.008), white, tr(0, FY + 0.41, -0.385));
  for (const sx of [-1, 1]) A.add(rbox(0.04, 0.82, 0.76, 0.008), white, tr(sx * 0.9, FY + 0.41, 0));
  A.box(1.845, 0.12, 0.042, 0, 0.62, -0.386, accent, 0.004);
  for (let i = 0; i < 9; i++) W.py(0.42, 0.05, 0.02, -0.72 + i * 0.18, 0.3, -0.41, fine, 0.004);
  c.glow.add(new THREE.BoxGeometry(1.8, 0.012, 0.012), { color: 0xfff0d0, glow: 4 }, tr(0, 0.84, -0.412));
  A.box(1.76, 0.03, 0.7, 0, 0.45, 0.0, white, 0.004);
  A.box(1.76, 0.06, 0.7, 0, FY + 0.03, 0.0, { color: 0x2b2e33, rough: 0.6 }, 0.004);
  toolbox(A.at(-0.45, 0.465, 0.05, 0, 0.06, 0), PAL.red);
  cardboardBox(A.at(0.3, 0.465, 0.02, 0, -0.08, 0), 0.34, 0.22, 0.28);
  for (let i = 0; i < 3; i++) partsBin(A.at(-0.5 + i * 0.3, FY + 0.06, 0.12), 0.26, 0.16, 0.3, [PAL.blue, PAL.yellow, PAL.coral][i]);
  // ala destra: cassa e portatelefoni
  W.add(rbox(0.82, 0.045, 0.84, 0.012, 2), { ...fine, uv: [0.8, 0.8] }, tr(1.36, 0.8375, 0));
  A.add(rbox(0.78, 0.78, 0.04, 0.008), white, tr(1.36, FY + 0.39, -0.385));
  A.add(rbox(0.04, 0.78, 0.76, 0.008), white, tr(1.74, FY + 0.39, 0));
  A.box(0.785, 0.12, 0.042, 1.36, 0.62, -0.386, accent, 0.004);
  deskItems(c, { wingX: 0.95, wingY: 0.86, floorY: FY, deskFan: up.fan === 1, register: true, rackDX: 0.67, cashDX: 0.3 });
  if (up.fan === 2) c.acRig = acSplit(c.fan.at(XL, 2.2, 0.75, 0, Math.PI / 2, 0));
  strawMat(A.at(0, FY, -1.85), 1.5, 0.7, c.opts.awningColor);

  // ── banco microsaldatura lungo la parete sinistra ──
  const bench = (pen: Pen, wP: Pen, len: number, mat: number): void => {
    wP.add(rbox(len, 0.04, 0.7, 0.01, 1), { ...fine, color: PAL.woodPale, uv: [len / 1.1, 0.6] }, tr(0, 0.88, 0));
    pen.add(rbox(len - 0.3, 0.004, 0.5, 0.002), { color: mat, rough: 0.85 }, tr(0, 0.902, 0.03));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) pen.box(0.045, 0.83, 0.045, sx * (len / 2 - 0.05), FY + 0.415, sz * 0.3, steel, 0.006);
      pen.box(0.03, 0.03, 0.6, sx * (len / 2 - 0.05), 0.3, 0, steel, 0.004);
    }
    pen.box(len - 0.1, 0.03, 0.03, 0, 0.3, -0.3, steel, 0.004);
    pen.box(len - 0.14, 0.02, 0.56, 0, 0.32, 0, { color: 0xd9dbd8, rough: 0.5, metal: 0.3 }, 0.004);
  };
  const mA = A.at(-2.98, 0, -0.3, 0, Math.PI / 2, 0);
  bench(mA, W.at(-2.98, 0, -0.3, 0, Math.PI / 2, 0), 2.3, 0x2f6fb0);
  // alzata con vaschette, cappa aspirafumi e pannello attrezzi
  mA.box(2.2, 0.025, 0.2, 0, 1.2, -0.24, { tile: TILE.woodFine, color: PAL.woodPale }, 0.005);
  for (const sx of [-1.05, 0, 1.05]) mA.box(0.025, 0.3, 0.2, sx, 1.05, -0.24, { tile: TILE.woodFine, color: PAL.woodPale }, 0.004);
  const cols = [PAL.coral, PAL.yellow, PAL.turquoise, PAL.blue, PAL.green, PAL.orange, PAL.pink, PAL.purple];
  for (let i = 0; i < 8; i++) partsBin(mA.at(-0.9 + i * 0.257, 1.2125, -0.24), 0.2, 0.1, 0.17, cols[i]);
  mA.add(lathe([[0.03, 0], [0.05, 0.02], [0.1, 0.1], [0.105, 0.11]], 14), { color: 0x2b2e33, rough: 0.5 }, tr(0.75, 1.0, -0.12, Math.PI + 0.5));
  mA.rod(v3(0.75, 0.9, -0.3), v3(0.75, 1.0, -0.14), 0.012, steel);
  pegboard(A.at(XL + 0.002, 1.82, -0.3, 0, Math.PI / 2, 0), 1.5, 0.7);
  for (let i = 0; i < 5; i++) c.deviceSlots.push(v3(-2.95, 0.9, -1.2 + i * 0.45));
  stoolPlastic(A.at(-2.25, FY, -0.9, 0, 0.4, 0), PAL.blue);
  cardboardBox(mA.at(-0.6, 0.33, 0), 0.4, 0.26, 0.4);
  toolbox(mA.at(0.4, 0.33, 0), PAL.blue);

  // ── banco dell'assistente lungo la parete destra ──
  const aA = A.at(2.98, 0, -0.75, 0, -Math.PI / 2, 0);
  bench(aA, W.at(2.98, 0, -0.75, 0, -Math.PI / 2, 0), 1.9, 0x3d8f6a);
  for (let i = 0; i < 5; i++) c.deviceSlots.push(v3(2.95, 0.9, -1.45 + i * 0.35));
  cardboardBox(aA.at(0.3, 0.33, 0), 0.4, 0.24, 0.4, PAL.turquoise);
  c.anchors.assistantSpot.set(2.3, FY, -0.75);

  // ── vetrina telefoni ricondizionati (lungo la vetrata, a sinistra) ──
  const R = { x: -2.2, z: -2.02, w: 2.0, d: 0.5 };
  const rW = W.at(R.x, FY, R.z);
  const rA = A.at(R.x, FY, R.z);
  rA.add(rbox(R.w, 0.55, R.d, 0.01), white, tr(0, 0.275, 0));
  rA.box(R.w + 0.004, 0.1, R.d + 0.004, 0, 0.4, 0, accent, 0.004);
  rW.box(R.w + 0.03, 0.035, R.d + 0.03, 0, 0.565, 0, fine, 0.008);
  rW.box(R.w + 0.03, 0.035, R.d + 0.03, 0, 1.08, 0, fine, 0.008);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rA.box(0.03, 0.5, 0.03, sx * (R.w / 2 - 0.01), 0.82, sz * (R.d / 2 - 0.01), steel, 0.004);
  const rG = G.at(R.x, FY, R.z);
  for (const sz of [-1, 1]) rG.add(plane(R.w - 0.04, 0.48), {}, tr(0, 0.82, sz * (R.d / 2 - 0.01)));
  for (const sx of [-1, 1]) rG.add(plane(R.d - 0.04, 0.48), {}, tr(sx * (R.w / 2 - 0.01), 0.82, 0, 0, Math.PI / 2, 0));
  rG.add(plane(R.w - 0.06, R.d - 0.06), {}, tr(0, 0.84, 0, -Math.PI / 2, 0, 0));
  const bodies = [0x23262b, 0xe9e4da, 0xc94a45, 0x2f6fb0, 0xe6c15a, 0x7b5ea8, 0x2f8f7a, 0xf0a0b0];
  const walls = [0x4fd0c8, 0xff9a6a, 0x8fb4ff, 0xffd36a, 0xff8fb0, 0x9affc0, 0xb09aff, 0xffb37a];
  for (let i = 0; i < 8; i++) displayPhone(rA.at(-0.84 + i * 0.24, 0.5825, 0.02 + (i % 2) * 0.1), bodies[i], walls[i]);
  for (let i = 0; i < 6; i++) displayPhone(rA.at(-0.75 + i * 0.3, 0.845, -0.08), bodies[(i + 3) % 8], walls[(i + 5) % 8]);
  c.glow.add(new THREE.BoxGeometry(R.w - 0.1, 0.01, 0.02), { color: 0xffffff, glow: 4 }, rA.m.clone().multiply(tr(0, 1.058, 0.2)));
  c.signFrame.at(R.x, FY, R.z).box(0.84, 0.21, 0.03, 0, 1.2, 0, { color: 0x2b2e33, rough: 0.5 }, 0.006);
  signFace(c, 0.8, 0.2, rW.m.clone().multiply(tr(0, 1.2, 0)), SIGN_UV.smallB, true, 0.03);

  // ── vetrina accessori (a destra della porta) ──
  showcase(c, 2.2, -2.05, FY, false);
  c.anchors.showcase = v3(2.2, FY, -2.05);

  // ── retrobottega: scaffale metallico, scatole, tramezzo basso ──
  wall(XL, -2.0, 1.5, 1.6, 0, 1.05, accent);
  wall(XL, -1.995, 1.495, 1.605, 1.05, 1.09, { color: PAL.woodHoney, rough: 0.6 });
  const sh = A.at(-3.12, FY, 2.38, 0, Math.PI / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sh.box(0.035, 2.05, 0.035, sx * 0.68, 1.025, sz * 0.2, steel, 0.004);
  for (let k = 0; k < 4; k++) {
    const y = 0.15 + k * 0.6;
    sh.box(1.4, 0.025, 0.44, 0, y, 0, { color: 0xb9bdc2, metal: 0.8, rough: 0.45 }, 0.004);
    for (let i = 0; i < 3; i++) {
      const q = sh.at(-0.45 + i * 0.45, y + 0.0125, 0, 0, ((i + k) % 3) * 0.08 - 0.08, 0);
      if ((i + k) % 3 === 0) partsBin(q, 0.34, 0.2, 0.36, cols[(i + k * 2) % 8]);
      else cardboardBox(q, 0.36, 0.22 + ((i * 7 + k * 3) % 3) * 0.07, 0.36, (i + k) % 2 ? PAL.white : PAL.coral);
    }
  }
  cardboardBox(A.at(-2.3, FY, 2.75, 0, 0.3, 0), 0.5, 0.4, 0.45);
  cardboardBox(A.at(-2.25, FY + 0.4, 2.78, 0, -0.1, 0), 0.4, 0.3, 0.36, PAL.turquoise);
  cardboardBox(A.at(-2.35, FY, 2.1, 0, -0.2, 0), 0.45, 0.32, 0.4, PAL.coral);

  // ── mensole porta-ricambi a parete ──
  if (up.shelf === 1) {
    for (const [y, k] of [
      [1.35, 0],
      [1.8, 1],
    ] as const) {
      W.pz(0.95, 0.03, 0.24, XL + 0.125, y, 1.0, fine, 0.006);
      for (const z of [0.6, 1.4]) A.box(0.2, 0.02, 0.02, XL + 0.1, y - 0.025, z, steel, 0.003);
      for (let i = 0; i < 4; i++) {
        if (k === 1 && i > 1) cardboardBox(A.at(XL + 0.13, y + 0.015, 0.66 + i * 0.23, 0, 0.1, 0), 0.2, 0.15, 0.2, PAL.coral);
        else partsBin(A.at(XL + 0.13, y + 0.015, 0.66 + i * 0.23, 0, Math.PI / 2, 0), 0.2, 0.12, 0.2, cols[i + k * 4]);
      }
    }
  }

  // ── luci ──
  if (up.lights >= 1) {
    stringLights(A, c.glow.b, [v3(-1.82, 2.44, ZF + 0.1), v3(-1.82, 2.44, 0.4), v3(-1.82, 2.44, ZB - 0.1)], 0.12, 0.24, BULBS_WARM);
    stringLights(A, c.glow.b, [v3(XL + 0.1, 2.34, ZF + 0.12), v3(-DW, 2.34, ZF + 0.12)], 0.1, 0.22, BULBS_WARM);
    stringLights(A, c.glow.b, [v3(DW, 2.34, ZF + 0.12), v3(XR - 0.1, 2.34, ZF + 0.12)], 0.1, 0.22, BULBS_WARM);
    c.lights.push({ kind: 'point', pos: v3(0, 2.4, 0.2), color: 0xffd9a8, intensity: 8, distance: 9 });
  }
  if (up.lights >= 2) {
    const spots: Array<[number, number, number, number]> = [
      [-1.84, -0.6, 0.5, 0],
      [-1.84, 0.5, 0.5, 0],
      [1.84, -1.6, -0.5, 0],
      [1.84, -0.4, -0.5, 0],
    ];
    for (const [x, z, tilt] of spots) {
      const q = A.at(x, 2.43, z, 0, 0, tilt);
      q.box(0.04, 0.06, 0.04, 0, 0, 0, { color: 0x2b2e33, rough: 0.5 }, 0.004);
      q.add(cyl(0.045, 0.04, 0.12, 12), { color: 0xf6f4ee, rough: 0.4 }, tr(0, -0.15, 0));
      c.glow.add(cyl(0.038, 0.038, 0.004, 12), { color: 0xfff2d8, glow: 7 }, q.m.clone().multiply(tr(0, -0.154, 0)));
    }
    c.lights.push({ kind: 'spot', pos: v3(-1.84, 2.3, 0), target: v3(0, 0.9, 0), color: 0xfff0d8, intensity: 22, distance: 7, angle: 0.8 });
  }

  // ── slot e aree ──
  c.shelfSlots.push(
    v3(-3.0, FY + 1.0975, -2.02),
    v3(-1.4, FY + 1.0975, -2.02),
    v3(1.9, FY + 1.0175, -2.05),
    v3(2.5, FY + 1.0175, -2.05),
    v3(-3.2, 1.2125, 0.72),
    v3(-2.95, 0.9, 0.7),
    v3(2.95, 0.9, 0.08),
    v3(-3.1, 1.09, 1.55),
    v3(-2.4, 1.09, 1.55),
    v3(1.25, 0.86, -0.3),
    v3(-2.2, 0.535, ZF - 0.07),
    v3(2.2, 0.535, ZF - 0.07),
  );
  const wl = (x: number, y: number, z: number, nx: number, nz: number): void => {
    c.wallSlots.push({ position: v3(x, y, z), normal: v3(nx, 0, nz) });
  };
  wl(XL, 1.7, -1.75, 1, 0);
  wl(XL, 2.3, -1.3, 1, 0);
  wl(XL, 1.2, -1.75, 1, 0);
  wl(XL, 1.7, up.shelf === 1 ? 1.75 : 1.0, 1, 0);
  wl(XL, 2.25, 2.4, 1, 0);
  wl(-2.9, 1.9, ZB, 0, -1);
  wl(-2.6, 0.6, 1.5, 0, -1);
  wl(-2.3, 2.5, ZF + 0.02, 0, 1);
  wl(2.3, 2.5, ZF + 0.02, 0, 1);
  wl(0, 2.5, ZF + 0.02, 0, 1);
  wl(0, 0.3, -0.405, 0, -1);
  wl(XR, 1.4, -2.15, -1, 0);
  for (const z of [-1.8, -0.9, 0, 0.9, 1.8, 2.6]) c.hangSlots.push(v3(-1.9, 2.44, z));
  for (const z of [-1.9, -1.1, -0.3]) c.hangSlots.push(v3(1.9, 2.44, z));
  c.decorArea = rect(-5.5, 5.5, -4.2, 5);
  c.blocked.push(
    rect(-1.1, 1.9, -0.6, 1.5),
    rect(-0.8, 0.8, -4.2, -0.6),
    rect(XL - 0.2, -2.5, -1.6, 1.0),
    rect(2.0, XR + 0.2, -1.8, 0.3),
    rect(XL - 0.2, -1.1, -2.6, -1.7),
    rect(1.5, XR + 0.2, -2.6, -1.7),
    rect(XL - 0.2, -2.0, 1.4, ZB + 0.2),
    rect(XL - 0.3, XL + 0.05, ZF, ZB),
    rect(XL, XR, ZB - 0.05, ZB + 0.3),
    rect(XR - 0.05, XR + 0.3, ZF, ZB),
    rect(XL, -0.95, ZF - 0.3, ZF + 0.1),
    rect(0.95, XR, ZF - 0.3, ZF + 0.1),
  );
}
