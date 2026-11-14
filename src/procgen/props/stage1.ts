/** Fase 1 — Bancarella: banchetto di legno grezzo sotto un tendone a strisce su pali di bambù. */
import { type Surf, TILE, cyl, lathe, rbox, tr, v3 } from './kit';
import { PAL, bunting, cardboardBox, cableCoil, cooler, crate, fan, flipFlops, jerrycan, partsBin, powerStrip, strawMat, stringLights, toolbox } from './parts';
import { BULBS_FESTIVE, awning, deskItems, nails, poleShelf, signFace } from './shop-common';
import { type StageCtx, rect } from './shop-ctx';
import { SIGN_UV } from './signs';

/** semi-distanza dei pali in X */
const PX = 2.15;

export function buildStage1(c: StageCtx): void {
  const W = c.wood;
  const A = c.atlas;
  const rng = c.rng;
  const up = c.opts.upgrades;
  const raw: Surf = { color: PAL.woodRaw, rough: 0.88, jitter: 0.1 };
  const bam: Surf = { color: PAL.bamboo, rough: 0.55, jitter: 0.08 };

  // ── banco di assi grezze ──
  for (let i = 0; i < 5; i++) {
    const z = -0.42 + (i + 0.5) * 0.168;
    W.px(1.9 + rng.range(-0.012, 0.012), 0.04, 0.164, rng.range(-0.006, 0.006), 0.88, z, { ...raw, color: 0xe4b676 }, 0.005);
    nails(A, [v3(-0.86, 0.9, z - 0.03), v3(-0.86, 0.9, z + 0.04), v3(0.86, 0.9, z - 0.04), v3(0.86, 0.9, z + 0.03)]);
  }
  for (const x of [-0.7, 0, 0.7]) W.pz(0.8, 0.03, 0.06, x, 0.845, 0, raw, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) W.py(0.86, 0.075, 0.075, sx * 0.86, 0.43, sz * 0.33, { ...raw, color: PAL.woodDark }, 0.008);
    W.pz(0.6, 0.1, 0.028, sx * 0.875, 0.79, 0, raw);
    W.pz(0.6, 0.05, 0.03, sx * 0.86, 0.25, 0, raw);
  }
  for (const sz of [-1, 1]) W.px(1.66, 0.1, 0.028, 0, 0.79, sz * 0.345, raw);
  for (let i = 0; i < 3; i++) W.px(1.72, 0.022, 0.2, 0, 0.285, -0.21 + i * 0.21, raw, 0.004);
  W.beam(v3(-0.82, 0.32, -0.36), v3(-0.3, 0.76, -0.36), 0.06, 0.02, raw);
  W.beam(v3(0.82, 0.32, -0.36), v3(0.3, 0.76, -0.36), 0.06, 0.02, raw);
  toolbox(A.at(-0.42, 0.296, 0.02, 0, 0.08, 0), PAL.red);
  cardboardBox(A.at(0.32, 0.296, 0.0, 0, -0.1, 0), 0.34, 0.22, 0.28);
  cableCoil(A.at(0.0, 0.31, 0.12, -Math.PI / 2, 0, 0.3), PAL.black);

  // ── ala destra: portatelefoni e cassetta ──
  for (const x of [1.07, 1.31]) W.pz(0.84, 0.03, 0.235, x, 0.845, 0, { ...raw, color: PAL.woodPale }, 0.005);
  for (const sz of [-1, 1]) {
    W.py(0.83, 0.05, 0.05, 1.38, 0.415, sz * 0.34, { ...raw, color: PAL.woodDark });
    W.px(0.46, 0.06, 0.025, 1.17, 0.8, sz * 0.34, raw);
    W.beam(v3(0.9, 0.5, sz * 0.34), v3(1.36, 0.78, sz * 0.34), 0.04, 0.02, raw);
  }

  // ── mobiletto di casse a sinistra (apparecchi da banco) ──
  for (const z of [-0.245, 0.245])
    for (let k = 0; k < 2; k++) {
      const q = A.at(-1.29 + rng.range(-0.012, 0.012), k * 0.365, z, 0, rng.range(-0.03, 0.03), 0);
      crate(q, 0.5, 0.36, 0.47, k ? PAL.woodPale : PAL.woodRaw);
      if (k === 0) cardboardBox(q.at(0, 0.02, 0), 0.34, 0.24, 0.3);
      else partsBin(q.at(0.05, 0.02, 0.02, 0, Math.PI / 2, 0), 0.3, 0.14, 0.3, z < 0 ? PAL.blue : PAL.yellow);
    }
  for (const x of [-1.425, -1.155]) W.pz(1.02, 0.03, 0.265, x, 0.745, 0, { ...raw, color: PAL.woodPale }, 0.005);
  for (const z of [-0.33, 0, 0.33]) c.deviceSlots.push(v3(-1.29, 0.76, z));

  deskItems(c, { wingX: 0.95, wingY: 0.86, floorY: 0.012, deskFan: up.fan === 1, register: false });
  if (up.fan === 2) c.fanRig = fan(c.fan.at(1.8, 0, -0.85, 0, -0.85, 0), true, PAL.turquoise);

  // ── struttura di bambù ──
  const yRaf = (z: number): number => 2.6 + (1.0 - z) * (0.62 / 2.35);
  const poles: Array<[number, number]> = [
    [-PX, 1.0],
    [PX, 1.0],
    [-PX, -1.35],
    [PX, -1.35],
  ];
  for (const [x, z] of poles) {
    A.cane(v3(x, -0.25, z), v3(x + rng.range(-0.015, 0.015), yRaf(z) - 0.03, z), 0.042, bam, 8);
    A.lash(v3(x, yRaf(z) - 0.1, z), 0.05, 'y');
  }
  for (const z of [1.0, -1.35]) A.cane(v3(-PX - 0.23, yRaf(z) - 0.075, z), v3(PX + 0.23, yRaf(z) - 0.075, z), 0.034, bam);
  for (const x of [-PX, -0.72, 0.72, PX]) {
    A.cane(v3(x, yRaf(1.22), 1.22), v3(x, yRaf(-1.57), -1.57), 0.028, { ...bam, color: PAL.bambooDark });
    if (Math.abs(x) < 1) for (const z of [1.0, -1.35]) A.lash(v3(x, yRaf(z) - 0.04, z), 0.04, 'x');
  }
  // controventi diagonali sui pali anteriori
  for (const sx of [-1, 1]) A.cane(v3(sx * PX, 2.75, -1.35), v3(sx * (PX - 0.5), 3.13, -1.35), 0.02, bam);
  awning(c.cloth, {
    x0: -PX - 0.25,
    x1: PX + 0.25,
    z0: 1.22,
    z1: -1.57,
    yAt: (z) => yRaf(z) + 0.036,
    stripes: 18,
    color: c.opts.awningColor,
    sagPeriod: 1.43,
    valance: { front: true, left: true, right: true },
    drop: 0.2,
  });
  c.dripEdges.push([v3(-PX - 0.25, yRaf(1.22), 1.24), v3(PX + 0.25, yRaf(1.22), 1.24)]);
  // tiranti con picchetti
  const guys: Array<[number, number, number, number]> = [
    [-PX, 1.0, -2.95, 1.8],
    [PX, 1.0, 2.95, 1.8],
    [-PX, -1.35, -3.05, -2.2],
    [PX, -1.35, 3.05, -2.2],
  ];
  for (const [x, z, gx, gz] of guys) {
    A.cord(v3(x, yRaf(z) - 0.12, z), v3(gx, 0.08, gz), 0.03, 0.006);
    W.beam(v3(gx + (gx - x) * 0.08, -0.12, gz + (gz - z) * 0.08), v3(gx - (gx - x) * 0.06, 0.2, gz - (gz - z) * 0.06), 0.035, 0.03, raw, 0.004);
  }

  // ── cartello dipinto a mano su palo di legno ──
  const S = c.signFrame.at(-1.55, 0, -2.45, 0, 0.56, 0);
  const drift: Surf = { tile: TILE.wood, color: PAL.drift, rough: 0.95, jitter: 0.08 };
  S.add(rbox(2.3, 0.09, 0.07, 0.012), { ...drift, uv: [1, 0.1] }, tr(0.02, 1.0, -0.055, 0, 0, Math.PI / 2 + 0.025));
  S.px(0.5, 0.05, 0.03, 0, 1.62, -0.03, drift);
  for (let i = 0; i < 3; i++) S.px(1.27 + rng.range(-0.03, 0.05), 0.152, 0.028, rng.range(-0.02, 0.02), 1.62 + (i - 1) * 0.156, 0, { tile: TILE.wood, color: PAL.woodPale, rough: 0.9, jitter: 0.08 }, 0.005);
  signFace(c, 1.22, 0.4575, S.m.clone().multiply(tr(0, 1.62, 0)), SIGN_UV.main, true, 0.028);
  nails(S.at(0, 0, 0.0145, Math.PI / 2), [v3(-0.56, 0, -1.78), v3(0.56, 0, -1.78), v3(-0.56, 0, -1.46), v3(0.56, 0, -1.46)], 0.008);
  S.px(0.64, 0.17, 0.02, 0.06, 1.17, 0, { tile: TILE.wood, color: PAL.woodPale, rough: 0.9 }, 0.005);
  signFace(c, 0.6, 0.15, S.m.clone().multiply(tr(0.06, 1.17, 0)), SIGN_UV.smallA, true, 0.02);
  for (const sx of [-1, 1]) S.cord(v3(0.06 + sx * 0.26, 1.4, 0), v3(0.06 + sx * 0.26, 1.25, 0), 0, 0.005);
  c.blocked.push(rect(-2.3, -0.8, -2.9, -2.0));

  // ── bandierine ──
  const flags = [c.opts.awningColor, PAL.yellow, PAL.turquoise, PAL.white, PAL.coral];
  bunting(A, c.cloth.b, v3(-PX, 2.98, -1.38), v3(PX, 2.98, -1.38), 0.36, flags);
  bunting(A, c.cloth.b, S.pt(0.02, 2.12, -0.05), v3(-PX, 3.05, -1.35), 0.12, flags, 0.15);

  // ── lucine e faretti ──
  if (up.lights >= 1) {
    stringLights(A, c.glow.b, [v3(-PX, 2.5, 1.04), v3(PX, 2.5, 1.04)], 0.14, 0.2, BULBS_FESTIVE);
    for (const sx of [-1, 1]) {
      stringLights(A, c.glow.b, [v3(sx * (PX + 0.05), 2.5, 1.0), v3(sx * (PX + 0.05), 3.1, -1.35)], 0.16, 0.2, BULBS_FESTIVE);
      const helix = [];
      for (let k = 0; k <= 8; k++) {
        const a = k * 1.9 + sx;
        helix.push(v3(sx * PX + Math.cos(a) * 0.065, 3.05 - k * 0.19, -1.35 + Math.sin(a) * 0.065));
      }
      stringLights(A, c.glow.b, helix, 0, 0.2, BULBS_FESTIVE);
    }
    c.lights.push({ kind: 'point', pos: v3(0, 2.35, 0.3), color: 0xffc98a, intensity: 5, distance: 7 });
  }
  if (up.lights >= 2) {
    for (const sx of [-1, 1]) {
      const q = A.at(sx * 0.85, 2.47, 1.0, -0.6, sx * 0.3, 0);
      q.box(0.05, 0.06, 0.04, 0, 0.03, 0, { color: PAL.iron, metal: 0.8, rough: 0.5 }, 0.006);
      q.add(lathe([[0.02, 0], [0.03, 0.02], [0.055, 0.1], [0.058, 0.105]], 14), { color: PAL.black, rough: 0.45, metal: 0.4 }, tr(0, -0.01, 0, Math.PI, 0, 0));
      c.glow.add(cyl(0.05, 0.05, 0.004, 14), { color: 0xfff0cf, glow: 6 }, q.m.clone().multiply(tr(0, -0.115, 0)));
    }
    c.lights.push({ kind: 'spot', pos: v3(0, 2.45, 1.0), target: v3(0, 0.9, -0.1), color: 0xffe2b8, intensity: 14, distance: 6, angle: 0.75 });
  }

  // ── mensole porta-ricambi fra i pali di sinistra ──
  if (up.shelf === 1) {
    const cols = [PAL.coral, PAL.yellow, PAL.turquoise, PAL.blue, PAL.green, PAL.orange, PAL.pink];
    for (const [y, k] of [
      [1.3, 0],
      [1.78, 1],
    ] as const) {
      W.pz(2.25, 0.025, 0.25, -PX + 0.15, y, -0.175, { ...raw, color: PAL.woodPale }, 0.005);
      for (const z of [0.96, -1.31]) {
        A.cane(v3(-PX - 0.05, y - 0.03, z), v3(-PX + 0.3, y - 0.03, z), 0.016, bam);
        A.lash(v3(-PX, y - 0.03, z), 0.045, 'y');
        A.cord(v3(-PX + 0.25, y, z), v3(-PX, y + 0.36, z), 0, 0.005);
      }
      if (k === 0) for (let i = 0; i < 7; i++) partsBin(A.at(-PX + 0.15, y + 0.0125, 0.72 - i * 0.29, 0, Math.PI / 2, 0), 0.25, 0.13, 0.2, cols[i]);
      else {
        cardboardBox(A.at(-PX + 0.15, y + 0.0125, 0.6, 0, 0.1, 0), 0.22, 0.2, 0.3, PAL.coral);
        cardboardBox(A.at(-PX + 0.15, y + 0.0125, 0.2, 0, -0.06, 0), 0.2, 0.14, 0.26);
        cardboardBox(A.at(-PX + 0.15, y + 0.1525, 0.21, 0, 0.2, 0), 0.16, 0.1, 0.2, PAL.turquoise);
        for (let i = 0; i < 3; i++) partsBin(A.at(-PX + 0.15, y + 0.0125, -0.2 - i * 0.24, 0, Math.PI / 2, 0), 0.2, 0.11, 0.2, cols[i + 3]);
        c.shelfSlots.push(v3(-PX + 0.15, y + 0.0125, -1.05));
      }
    }
  }

  // ── a terra ──
  strawMat(A.at(0.05, 0, 0.92, 0, 0.03, 0), 1.9, 1.15, c.opts.awningColor);
  cooler(A.at(-2.05, 0, 0.35, 0, 1.35, 0), PAL.blue);
  jerrycan(A.at(-1.25, 0, 0.82, 0, 0.5, 0), PAL.yellow);
  flipFlops(A.at(0.55, 0.012, 1.2, 0, -0.4, 0), PAL.turquoise);
  powerStrip(A.at(-0.55, 0, 0.15, 0, 0.3, 0), v3(-1.1, 0, 0.9));

  // ── slot e aree ──
  c.shelfSlots.push(v3(1.06, 0.86, -0.28), v3(1.06, 0.86, -0.06), poleShelf(c, -PX, 1.4, -1.35, 0.7, 0.7), poleShelf(c, PX, 1.4, -1.35, -0.7, 0.7));
  c.wallSlots.push(
    { position: v3(-PX, 2.0, -1.3), normal: v3(0, 0, 1) },
    { position: v3(PX, 2.0, -1.3), normal: v3(0, 0, 1) },
    { position: v3(-PX + 0.05, 1.9, 1.0), normal: v3(1, 0, 0) },
    { position: v3(PX, 1.8, 1.05), normal: v3(0, 0, 1) },
  );
  c.hangSlots.push(v3(-0.72, yRaf(-0.6) - 0.03, -0.6), v3(0.72, yRaf(-0.6) - 0.03, -0.6), v3(-PX, yRaf(-0.2) - 0.03, -0.2), v3(PX, yRaf(-0.2) - 0.03, -0.2), v3(-1.2, yRaf(-1.35) - 0.11, -1.35), v3(1.2, yRaf(-1.35) - 0.11, -1.35));
  c.decorArea = rect(-4.5, 4.5, -3.2, 3.6);
  c.blocked.push(rect(-2.4, 1.6, -0.6, 1.5), rect(-0.7, 0.7, -3.2, -0.6));
  for (const [x, z] of poles) c.blocked.push(rect(x - 0.25, x + 0.25, z - 0.25, z + 0.25));
  if (up.fan === 2) c.blocked.push(rect(1.5, 2.1, -1.2, -0.5));
}
