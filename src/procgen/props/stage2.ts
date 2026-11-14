/** Fase 2 — Chiosco in legno e bambù con tetto di paglia, pedana, secondo piano di lavoro e vetrina accessori. */
import * as THREE from 'three';
import { type Surf, TILE, cyl, lathe, plane, sphere, tr, v3 } from './kit';
import { PAL, cableCoil, cardboardBox, crate, fan, partsBin, phoneCase, powerBank, stringLights, toolbox } from './parts';
import { BULBS_WARM, deskItems, nails, signFace, thatchSlope } from './shop-common';
import { type StageCtx, rect } from './shop-ctx';
import { SIGN_UV } from './signs';

const DY = 0.1;

export function showcase(c: StageCtx, x: number, z: number, y = DY, plaque = true, ry = 0): void {
  const W = c.wood.at(x, y, z, 0, ry, 0);
  const A = c.atlas.at(x, y, z, 0, ry, 0);
  const G = c.glass.at(x, y, z, 0, ry, 0);
  const fine: Surf = { color: PAL.woodHoney, rough: 0.6, jitter: 0.06 };
  const w = 1.1;
  const d = 0.46;
  // base
  W.box(w, 0.06, d, 0, 0.03, 0, { ...fine, color: PAL.woodDark }, 0.006);
  A.add(new THREE.BoxGeometry(w - 0.06, 0.44, d - 0.04), { tile: TILE.rattan, color: PAL.bamboo, rough: 0.8, uv: [1, 0.45] }, tr(0, 0.28, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) W.py(1.0, 0.045, 0.045, sx * (w / 2 - 0.022), 0.5, sz * (d / 2 - 0.022), fine, 0.006);
  W.box(w, 0.035, d, 0, 0.52, 0, fine, 0.006);
  W.box(w + 0.04, 0.035, d + 0.04, 0, 1.0, 0, fine, 0.008);
  // vetri
  for (const sz of [-1, 1]) G.add(plane(w - 0.09, 0.45), {}, tr(0, 0.76, sz * (d / 2 - 0.022), 0, sz > 0 ? 0 : Math.PI, 0));
  for (const sx of [-1, 1]) G.add(plane(d - 0.09, 0.45), {}, tr(sx * (w / 2 - 0.022), 0.76, 0, 0, (sx * Math.PI) / 2, 0));
  G.add(plane(w - 0.1, d - 0.1), {}, tr(0, 0.78, 0, -Math.PI / 2, 0, 0));
  // prodotti: cover in basso, power bank e cavi sul ripiano di vetro
  const cols = [PAL.coral, PAL.turquoise, PAL.yellow, PAL.pink, PAL.navy, PAL.green, PAL.orange, PAL.purple];
  for (let i = 0; i < 8; i++) phoneCase(A.at(-0.42 + i * 0.12, 0.62, -0.08 + (i % 2) * 0.03, -0.35, Math.PI, 0), cols[i]);
  for (let i = 0; i < 4; i++) powerBank(A.at(-0.38 + i * 0.11, 0.8 + 0.012, 0.1, -Math.PI / 2, 0, 0.1 * (i - 1.5)), [PAL.white, PAL.black, PAL.turquoise, PAL.coral][i]);
  for (let i = 0; i < 3; i++) cableCoil(A.at(0.14 + i * 0.11, 0.8 + 0.01, 0.08, -Math.PI / 2, 0, i), [PAL.white, PAL.coral, PAL.black][i]);
  for (let i = 0; i < 4; i++) {
    A.box(0.05, 0.03, 0.001, -0.4 + i * 0.25, 0.555, -0.19, { color: PAL.white, rough: 0.8 }, 0);
    A.box(0.03, 0.008, 0.001, -0.4 + i * 0.25, 0.556, -0.1906, { color: PAL.coral, rough: 0.8 }, 0);
  }
  // cartellino "ACCESSORIES" sul bordo superiore, verso i clienti e verso l'interno
  if (!plaque) return;
  const m = W.m.clone().multiply(tr(0, 1.1, 0));
  c.signFrame.at(x, y, z, 0, ry, 0).box(0.74, 0.19, 0.02, 0, 1.105, 0, { tile: TILE.woodFine, color: PAL.woodDark }, 0.005);
  signFace(c, 0.7, 0.175, m, SIGN_UV.smallB, true, 0.02);
}

export function buildStage2(c: StageCtx): void {
  const W = c.wood;
  const A = c.atlas;
  const T = c.thatch;
  const rng = c.rng;
  const up = c.opts.upgrades;
  const deckS: Surf = { color: 0xcfa878, rough: 0.8, jitter: 0.12 };
  const fine: Surf = { color: PAL.woodHoney, rough: 0.55, jitter: 0.06 };
  const dark: Surf = { color: PAL.woodDark, rough: 0.7, jitter: 0.06 };
  const bam: Surf = { color: PAL.bamboo, rough: 0.55, jitter: 0.08 };
  const accent: Surf = { color: c.opts.accentColor, rough: 0.75, jitter: 0.1 };
  const weave: Surf = { tile: TILE.rattan, color: PAL.bamboo, rough: 0.8 };

  // ── pedana ──
  const x0 = -2.75;
  const n = 30;
  const pw = 5.5 / n;
  for (let i = 0; i < n; i++) W.pz(2.86 + rng.range(-0.01, 0.01), 0.03, pw - 0.006, x0 + (i + 0.5) * pw, DY - 0.015, 0.675, deckS, 0.004);
  for (const z of [-0.765, 2.115]) W.px(5.54, 0.085, 0.03, 0, 0.042, z, dark, 0.004);
  for (const x of [-2.765, 2.765]) W.pz(2.9, 0.085, 0.03, x, 0.042, 0.675, dark, 0.004);
  W.box(1.3, 0.05, 0.32, 0.4, 0.025, 2.3, deckS, 0.006);
  c.floor = { y: DY, area: rect(-2.75, 2.75, -0.75, 2.1) };

  // ── bancone principale ──
  for (const z of [-0.28, 0, 0.28]) W.px(1.9, 0.045, 0.276, 0, 0.8775, z, fine, 0.008);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) W.py(0.755, 0.08, 0.08, sx * 0.87, DY + 0.3775, sz * 0.34, dark, 0.008);
  for (const y of [0.82, 0.2]) W.px(1.66, 0.07, 0.03, 0, y, -0.37, dark);
  W.px(1.66, 0.07, 0.03, 0, 0.82, 0.37, dark);
  A.add(new THREE.BoxGeometry(1.66, 0.56, 0.016), { ...weave, uv: [1, 0.36] }, tr(0, 0.51, -0.37));
  for (const sx of [-1, 1]) {
    W.pz(0.6, 0.07, 0.03, sx * 0.885, 0.82, 0, dark);
    A.add(new THREE.BoxGeometry(0.016, 0.56, 0.6), { ...weave, uv: [0.36, 0.36] }, tr(sx * 0.885, 0.51, 0));
  }
  for (let i = 0; i < 3; i++) W.px(1.66, 0.022, 0.2, 0, 0.36, -0.2 + i * 0.205, fine, 0.004);
  toolbox(A.at(-0.4, 0.371, 0.04, 0, 0.06, 0), PAL.red);
  cardboardBox(A.at(0.34, 0.371, 0.02, 0, -0.08, 0), 0.34, 0.22, 0.28);
  crate(A.at(0.0, DY, 0.05), 0.4, 0.2, 0.3, PAL.woodPale);

  // ── angolo e secondo piano di lavoro (a L sulla sinistra) ──
  for (const z of [-0.29, -0.03]) W.px(0.82, 0.045, 0.256, -1.36, 0.8775, z, fine, 0.008);
  A.add(new THREE.BoxGeometry(0.8, 0.56, 0.016), { ...weave, uv: [0.5, 0.36] }, tr(-1.36, 0.51, -0.37));
  for (const y of [0.82, 0.2]) W.px(0.8, 0.07, 0.03, -1.36, y, -0.37, dark);
  for (const x of [-2.2, -1.9]) W.pz(2.17, 0.045, 0.296, x, 0.8775, 0.665, fine, 0.008);
  for (const z of [-0.36, 0.66, 1.69]) {
    W.py(0.755, 0.07, 0.07, -1.8, DY + 0.3775, z, dark, 0.008);
    W.py(0.755, 0.07, 0.07, -2.3, DY + 0.3775, z, dark, 0.008);
  }
  W.pz(2.1, 0.07, 0.03, -1.785, 0.82, 0.665, dark);
  W.px(0.5, 0.07, 0.03, -2.05, 0.82, 1.72, dark);
  A.add(new THREE.BoxGeometry(0.5, 0.56, 0.016), { ...weave, uv: [0.3, 0.36] }, tr(-2.05, 0.51, 1.72));
  for (const x of [-2.18, -1.93]) W.pz(2.05, 0.022, 0.24, x, 0.42, 0.665, fine, 0.004);
  cardboardBox(A.at(-2.05, 0.431, 1.3, 0, 0.1, 0), 0.36, 0.26, 0.4, PAL.coral);
  cardboardBox(A.at(-2.05, 0.431, 0.82, 0, -0.05, 0), 0.3, 0.2, 0.34);
  crate(A.at(-2.05, DY, 0.25, 0, Math.PI / 2, 0), 0.46, 0.28, 0.42);
  crate(A.at(-2.05, DY, 1.2, 0, Math.PI / 2, 0), 0.46, 0.28, 0.42, PAL.woodRaw);
  partsBin(A.at(-2.05, 0.431, 0.2, 0, Math.PI / 2, 0), 0.3, 0.14, 0.3, PAL.blue);
  for (let i = 0; i < 6; i++) c.deviceSlots.push(v3(-2.05, 0.9, -0.2 + i * 0.36));

  // ── ala destra ──
  for (const x of [1.075, 1.325]) W.pz(0.84, 0.04, 0.246, x, 0.84, 0, fine, 0.008);
  for (const sz of [-1, 1]) {
    W.py(0.72, 0.06, 0.06, 1.4, DY + 0.36, sz * 0.34, dark);
    W.px(0.46, 0.06, 0.025, 1.17, 0.79, sz * 0.34, dark);
  }
  A.add(new THREE.BoxGeometry(0.016, 0.5, 0.62), { ...weave, uv: [0.36, 0.3] }, tr(1.4, 0.5, 0));
  deskItems(c, { wingX: 0.95, wingY: 0.86, floorY: DY, deskFan: up.fan === 1, register: false });
  if (up.fan === 2) c.fanRig = fan(c.fan.at(-1.2, DY, 1.6, 0, 2.14, 0), true, PAL.turquoise);

  showcase(c, 2.0, -0.42);
  c.anchors.showcase = v3(2.0, DY, -0.42);

  // ── struttura: pilastri, dormienti, capriate ──
  const PXs = 2.55;
  const ZF = -0.65;
  const ZR = 1.35;
  const posts: Array<[number, number]> = [
    [-PXs, ZF],
    [PXs, ZF],
    [-PXs, ZR],
    [PXs, ZR],
  ];
  for (const [x, z] of posts) {
    W.py(2.33, 0.13, 0.13, x, DY + 1.165, z, dark, 0.012);
    W.box(0.2, 0.08, 0.2, x, DY + 0.04, z, dark, 0.01);
    W.box(0.18, 0.05, 0.18, x, 2.36, z, dark, 0.01);
    const sx = Math.sign(x);
    const sz = z < 0 ? 1 : -1;
    W.beam(v3(x - sx * 0.05, 1.95, z), v3(x - sx * 0.5, 2.4, z), 0.07, 0.06, dark);
    W.beam(v3(x, 1.95, z + sz * 0.05), v3(x, 2.4, z + sz * 0.5), 0.07, 0.06, dark);
    A.lash(v3(x, 1.2, z), 0.1, 'y', { color: PAL.rope });
  }
  for (const z of [ZF, ZR]) W.px(5.5, 0.12, 0.1, 0, 2.45, z, dark, 0.01);
  for (const x of [-PXs, PXs]) W.pz(2.2, 0.12, 0.1, x, 2.45, 0.35, dark, 0.01);
  const RY = 3.5;
  const RZ = 0.3;
  const RX = 1.55;
  for (const x of [-RX, RX]) {
    W.pz(2.0, 0.1, 0.09, x, 2.45, 0.35, dark, 0.01);
    W.py(RY - 2.56, 0.08, 0.08, x, (RY + 2.5) / 2 - 0.03, RZ, dark);
  }
  A.cane(v3(-RX - 0.1, RY - 0.06, RZ), v3(RX + 0.1, RY - 0.06, RZ), 0.04, bam);

  // ── tetto di paglia a padiglione ──
  const EY = 2.5;
  const EX = 3.1;
  const ZN = 1.85;
  const ZS = -1.25;
  const yOn = (t: number): number => EY + (RY - EY) * t;
  // travetti di bambù (visibili dal basso)
  const raf: Surf = { ...bam, color: PAL.bambooDark };
  for (let x = -1.5; x <= 1.501; x += 0.5) {
    A.cane(v3(x, EY + 0.02, ZN - 0.05), v3(x, RY - 0.03, RZ), 0.022, raf, 6);
    A.cane(v3(x, EY + 0.02, ZS + 0.05), v3(x, RY - 0.03, RZ), 0.022, raf, 6);
  }
  for (const sx of [-1, 1]) {
    A.cane(v3(sx * (EX - 0.05), EY + 0.02, ZN - 0.05), v3(sx * RX, RY - 0.03, RZ), 0.028, raf, 6);
    A.cane(v3(sx * (EX - 0.05), EY + 0.02, ZS + 0.05), v3(sx * RX, RY - 0.03, RZ), 0.028, raf, 6);
    for (const z of [-0.45, 0.3, 1.05]) A.cane(v3(sx * (EX - 0.05), EY + 0.02, z), v3(sx * RX, RY - 0.03, RZ), 0.02, raf, 6);
    for (const t of [0.33, 0.66]) {
      const xx = sx * (EX + (RX - EX) * t);
      A.cane(v3(xx, yOn(t) + 0.03, ZN + (RZ - ZN) * t), v3(xx, yOn(t) + 0.03, ZS + (RZ - ZS) * t), 0.016, raf, 5);
    }
  }
  for (const t of [0.33, 0.66]) {
    const hx = EX + (RX - EX) * t;
    A.cane(v3(-hx, yOn(t) + 0.03, ZN + (RZ - ZN) * t), v3(hx, yOn(t) + 0.03, ZN + (RZ - ZN) * t), 0.016, raf, 5);
    A.cane(v3(-hx, yOn(t) + 0.03, ZS + (RZ - ZS) * t), v3(hx, yOn(t) + 0.03, ZS + (RZ - ZS) * t), 0.016, raf, 5);
  }
  const eNL = v3(-EX, EY, ZN);
  const eNR = v3(EX, EY, ZN);
  const eSL = v3(-EX, EY, ZS);
  const eSR = v3(EX, EY, ZS);
  const rL = v3(-RX, RY, RZ);
  const rR = v3(RX, RY, RZ);
  thatchSlope(T, eNL, eNR, rL, rR, 6);
  thatchSlope(T, eSR, eSL, rR, rL, 6);
  thatchSlope(T, eSL, eNL, rL, rL, 6);
  thatchSlope(T, eNR, eSR, rR, rR, 6);
  // colmo: rotolo di paglia con stecche incrociate
  const roll = cyl(0.13, 0.13, RX * 2 + 0.5, 10);
  T.add(roll, { color: 0xbf9d58, rough: 1, uv: [3, 0.6], rot: false }, tr(-RX - 0.25, RY + 0.08, RZ, 0, 0, -Math.PI / 2));
  for (let x = -RX; x <= RX + 0.01; x += RX / 3) {
    for (const s of [-1, 1]) A.cane(v3(x, RY + 0.36, RZ + s * 0.2), v3(x + 0.02, RY - 0.1, RZ - s * 0.26), 0.016, bam, 5);
    A.lash(v3(x, RY + 0.2, RZ), 0.03, 'y');
  }
  c.dripEdges.push([v3(-EX, EY, ZN), v3(EX, EY, ZN)], [v3(-EX, EY, ZS), v3(-EX, EY, ZN)]);

  // ── parete sinistra: intreccio sotto, assi dipinte e graticcio sopra ──
  const WX = -2.63;
  A.add(new THREE.BoxGeometry(0.02, 1.0, 1.88), { ...weave, uv: [1, 0.55] }, tr(WX, DY + 0.52, 0.35));
  for (const y of [DY + 0.02, DY + 1.04]) A.cane(v3(WX + 0.02, y, ZF + 0.06), v3(WX + 0.02, y, ZR - 0.06), 0.025, bam);
  for (let i = 0; i < 6; i++) W.pz(1.0 - 0.07, 0.2, 0.025, WX, 1.27 + i * 0.205, 0.87, { ...accent, uv: [0.9, 0.2] }, 0.004);
  nails(A.at(WX + 0.0135, 0, 0, 0, 0, -Math.PI / 2), [0, 1, 2, 3, 4, 5].flatMap((i) => [v3(-(1.27 + i * 0.205), 0, 0.45), v3(-(1.27 + i * 0.205), 0, 1.28)]), 0.006);
  for (let i = 0; i < 8; i++) A.cane(v3(WX, DY + 1.05, ZF + 0.12 + i * 0.125), v3(WX, 2.39, ZF + 0.12 + i * 0.125), 0.015, { ...bam, color: i % 3 === 0 ? PAL.bambooDark : PAL.bamboo }, 5);
  for (const y of [1.55, 2.0]) A.cane(v3(WX + 0.02, y, ZF + 0.06), v3(WX + 0.02, y, 0.38), 0.014, bam, 5);
  if (up.shelf === 1) {
    const cols = [PAL.coral, PAL.yellow, PAL.turquoise, PAL.blue, PAL.green, PAL.orange];
    for (const [y, k] of [
      [1.42, 0],
      [1.88, 1],
    ] as const) {
      W.pz(0.95, 0.025, 0.24, WX + 0.15, y, -0.12, fine, 0.005);
      for (const z of [-0.5, 0.26]) W.beam(v3(WX + 0.03, y - 0.2, z), v3(WX + 0.24, y - 0.02, z), 0.03, 0.02, dark, 0.003);
      if (k === 0) for (let i = 0; i < 4; i++) partsBin(A.at(WX + 0.15, y + 0.0125, -0.47 + i * 0.235, 0, Math.PI / 2, 0), 0.2, 0.12, 0.2, cols[i]);
      else {
        cardboardBox(A.at(WX + 0.15, y + 0.0125, -0.4, 0, 0.1, 0), 0.2, 0.16, 0.26, PAL.turquoise);
        for (let i = 0; i < 2; i++) partsBin(A.at(WX + 0.15, y + 0.0125, -0.1 + i * 0.235, 0, Math.PI / 2, 0), 0.2, 0.12, 0.2, cols[i + 4]);
      }
    }
  }

  // ── insegna intagliata su portale con tettuccio di paglia ──
  c.signStyle = 'carved';
  const S = c.signFrame.at(-1.75, 0, -2.6, 0, 0.56, 0);
  const sw: Surf = { tile: TILE.woodFine, color: PAL.woodDark, rough: 0.7, jitter: 0.06 };
  for (const sx of [-1, 1]) {
    S.py(2.5, 0.1, 0.1, sx * 0.86, 1.1, 0, sw, 0.012);
    S.box(0.16, 0.06, 0.16, sx * 0.86, 0.03, 0, sw, 0.01);
    S.beam(v3(sx * 0.82, 2.0, 0), v3(sx * 0.5, 2.3, 0), 0.05, 0.05, sw);
  }
  S.px(2.1, 0.09, 0.1, 0, 2.3, 0, sw, 0.012);
  S.box(1.58, 0.64, 0.035, 0, 1.72, 0, sw, 0.012);
  signFace(c, 1.5, 0.5625, S.m.clone().multiply(tr(0, 1.72, 0)), SIGN_UV.main, true, 0.035);
  for (const sx of [-1, 1]) S.cord(v3(sx * 0.6, 2.26, 0), v3(sx * 0.6, 2.03, 0), 0, 0.007);
  S.box(0.74, 0.2, 0.02, 0, 1.2, 0, sw, 0.006);
  signFace(c, 0.7, 0.175, S.m.clone().multiply(tr(0, 1.2, 0)), SIGN_UV.smallA, true, 0.02);
  for (const sx of [-1, 1]) S.cord(v3(sx * 0.3, 1.41, 0), v3(sx * 0.3, 1.29, 0), 0, 0.005);
  const cap = c.thatch.at(-1.75, 0, -2.6, 0, 0.56, 0);
  thatchSlope(cap, v3(-1.2, 2.34, 0.34), v3(1.2, 2.34, 0.34), v3(-1.1, 2.62, 0), v3(1.1, 2.62, 0), 2);
  thatchSlope(cap, v3(1.2, 2.34, -0.34), v3(-1.2, 2.34, -0.34), v3(1.1, 2.62, 0), v3(-1.1, 2.62, 0), 2);
  c.blocked.push(rect(-2.8, -0.7, -3.2, -2.0));

  // ── luci ──
  if (up.lights >= 1) {
    stringLights(A, c.glow.b, [v3(-PXs, 2.36, ZR + 0.08), v3(0, 2.36, ZR + 0.08), v3(PXs, 2.36, ZR + 0.08)], 0.16, 0.2, BULBS_WARM);
    stringLights(A, c.glow.b, [v3(-PXs, 2.36, ZF - 0.08), v3(0, 2.36, ZF - 0.08), v3(PXs, 2.36, ZF - 0.08)], 0.16, 0.22, BULBS_WARM);
    stringLights(A, c.glow.b, [v3(-PXs + 0.08, 2.36, ZF), v3(-PXs + 0.08, 2.36, ZR)], 0.14, 0.22, BULBS_WARM);
    stringLights(S, c.glow.b, [v3(-0.9, 2.2, 0.07), v3(0.9, 2.2, 0.07)], 0.08, 0.16, BULBS_WARM);
    c.lights.push({ kind: 'point', pos: v3(0, 2.3, 0.4), color: 0xffc98a, intensity: 6, distance: 8 });
  }
  if (up.lights >= 2) {
    for (const x of [-RX, RX]) {
      A.cord(v3(x, 2.4, 0.1), v3(x, 2.1, 0.1), 0, 0.005, { color: PAL.black });
      A.add(lathe([[0.03, 0.26], [0.07, 0.24], [0.16, 0.12], [0.2, 0.0], [0.195, -0.01]], 16), { tile: TILE.rattan, color: PAL.bamboo, rough: 0.8, uv: [0.5, 1] }, tr(x, 1.84, 0.1));
      c.glow.add(sphere(0.05, 10, 8), { color: 0xffe2b0, glow: 6 }, tr(x, 1.92, 0.1));
    }
    c.lights.push({ kind: 'spot', pos: v3(0, 2.4, 1.0), target: v3(0, 0.9, -0.1), color: 0xffe2b8, intensity: 16, distance: 6, angle: 0.8 });
  }

  // ── slot e aree ──
  c.shelfSlots.push(v3(-1.55, 0.9, -0.2), v3(-1.18, 0.9, -0.28), v3(1.06, 0.86, -0.28), v3(1.06, 0.86, -0.06), v3(1.72, DY + 1.0175, -0.42), v3(2.4, DY + 1.0175, -0.42), v3(-2.05, 0.9, -0.34));
  c.wallSlots.push(
    { position: v3(WX + 0.014, 1.85, 0.62), normal: v3(1, 0, 0) },
    { position: v3(WX + 0.014, 1.85, 1.12), normal: v3(1, 0, 0) },
    { position: v3(-PXs, 1.75, ZF + 0.066), normal: v3(0, 0, 1) },
    { position: v3(PXs, 1.75, ZF + 0.066), normal: v3(0, 0, 1) },
    { position: v3(PXs - 0.066, 1.75, ZR), normal: v3(-1, 0, 0) },
    { position: v3(0, 0.52, -0.38), normal: v3(0, 0, -1) },
    { position: v3(-1.36, 0.52, -0.38), normal: v3(0, 0, -1) },
  );
  c.hangSlots.push(v3(-1.2, 2.39, ZF), v3(1.2, 2.39, ZF), v3(-RX, 2.4, 0.8), v3(RX, 2.4, 0.8), v3(-2.0, 2.39, ZR), v3(2.0, 2.39, ZR), v3(0, RY - 0.1, RZ));
  c.anchors.assistantSpot.set(-1.35, DY, 0.75);
  c.decorArea = rect(-5, 5, -3.6, 4.2);
  c.blocked.push(rect(-2.45, 1.55, -0.75, 1.85), rect(-0.7, 0.7, -3.6, -0.75), rect(1.4, 2.65, -0.75, -0.1));
  for (const [x, z] of posts) c.blocked.push(rect(x - 0.25, x + 0.25, z - 0.25, z + 0.25));
  
}
