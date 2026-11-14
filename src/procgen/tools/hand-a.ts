/**
 * Strumenti a mano (1/2): cacciavite, spudger, plettro, ventosa, pinzette, pennello, stuzzicadenti,
 * estrattore, tessera. Punta di lavoro all'origine, corpo lungo +Y. Modellati in millimetri (scala 0.001).
 */
import { atlasRect } from '../textures/tools-atlas';
import { Asm, mat, ringE, roundRect, type Builder, type Mat, type P2, type P3, type ToolModel } from './kit';
import { C, roundPoly } from './palette';

const MM = 0.001;

/** Anello a stella (punta di cacciavite a più alette). */
function starRing(y: number, R: number, r: number, points: number, rot = 0): P3[] {
  const out: P3[] = [];
  for (let j = 0; j < points * 2; j++) {
    const a = rot + (j / (points * 2)) * Math.PI * 2;
    const rr = j % 2 === 0 ? R : r;
    out.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
  }
  return out;
}

function driverTip(b: Builder, points: number, m: Mat, shaftR: number, len: number): void {
  b.loft([starRing(0, 0.22, 0.14, points), starRing(len * 0.45, shaftR * 0.72, shaftR * 0.3, points), starRing(len * 0.8, shaftR * 0.95, shaftR * 0.62, points), starRing(len, shaftR, shaftR, points)], m, { flat: true, capStart: true });
}

// ------------------------------------------------------------------ cacciavite
export function buildDriver(tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    if (tier <= 1) {
      // economico: manico in plastica gialla esagonale, tappo nero, stelo tondo
      const plastic = mat(0xffbe1a, 0.34, 0);
      const plasticDark = mat(0xe09a00, 0.4, 0);
      driverTip(b, 4, C.steelSatin, 1.15, 3.4);
      b.lathe(
        [
          [1.15, 3.4],
          [1.15, 36],
        ],
        C.steelSatin,
        { segs: 8 },
      );
      b.lathe(
        [
          [1.15, 35],
          [2.4, 35.5],
          [2.9, 39],
          [3.3, 42],
          [4.9, 45.5],
        ],
        plastic,
        { segs: 12 },
      );
      b.fluted(
        [
          [4.9, 45.5],
          [5.3, 60],
          [5.3, 80],
          [4.6, 92],
        ],
        plastic,
        6,
        0.16,
      );
      b.lathe(
        [
          [4.4, 92],
          [3.4, 94],
          [3.4, 96.5],
          [3.9, 97, plasticDark],
          [3.9, 98.2],
          [0, 98.2],
        ],
        plastic,
        { segs: 12 },
      );
      b.lathe(
        [
          [0, 98.4],
          [4.6, 98.4],
          [4.8, 99.4],
          [4.8, 104],
          [4.0, 106.6],
          [2.2, 107.6],
          [0, 107.8],
        ],
        C.black,
        { segs: 14 },
      );
      // bava di stampaggio / anello economico
      b.at({ p: [0, 45.2, 0] }, () => b.torus(4.4, 0.35, plasticDark, 12, 5));
    } else if (tier === 2) {
      // professionale: alluminio zigrinato, cappuccio girevole, punta esagonale 4 mm
      const body = C.alu;
      driverTip(b, 5, C.steelDark, 0.95, 3.2);
      b.lathe(
        [
          [0.95, 3.2],
          [0.95, 12],
          [1.5, 14.5],
          [2.25, 16],
        ],
        C.steelDark,
        { segs: 10 },
      );
      b.lathe(
        [
          [2.25, 16],
          [2.25, 31],
        ],
        C.steel,
        { segs: 6, crease: 20 },
      );
      b.lathe(
        [
          [2.25, 30],
          [3.0, 30],
          [3.3, 31],
          [3.3, 36.5],
          [2.9, 37.3, C.steel],
          [2.9, 38],
          [4.1, 38.4, body],
          [4.6, 39.4],
          [4.6, 41],
        ],
        C.steelDark,
        { segs: 16 },
      );
      b.fluted(
        [
          [4.75, 41],
          [4.75, 60],
        ],
        body,
        22,
        0.075,
      );
      const grooves: [number, number][] = [];
      let y = 60;
      grooves.push([4.6, y]);
      for (let i = 0; i < 4; i++) {
        grooves.push([4.6, y + 2.2], [4.1, y + 2.7], [4.1, y + 3.5], [4.6, y + 4]);
        y += 4;
      }
      grooves.push([4.6, 78.5]);
      b.lathe(grooves, body, { segs: 16, crease: 30 });
      b.fluted(
        [
          [4.75, 78.5],
          [4.75, 93],
        ],
        body,
        22,
        0.075,
      );
      b.lathe(
        [
          [4.6, 93],
          [4.6, 94],
          [4.1, 94.8],
          [2.9, 95.2, C.steel],
          [2.9, 96.6],
          [0, 96.6],
        ],
        body,
        { segs: 16 },
      );
      // cappuccio girevole con cuscinetto e incavo per il dito
      b.lathe(
        [
          [0, 96.8],
          [4.5, 96.8],
          [4.9, 97.6],
          [4.9, 99.2],
          [4.6, 99.6, C.steelDark],
          [4.6, 100.1],
          [4.9, 100.5, body],
          [4.9, 104.8],
          [4.3, 105.8],
          [3.2, 105.6],
          [1.6, 104.9],
          [0, 104.7],
        ],
        body,
        { segs: 18 },
      );
    } else {
      // elite: canna di fucile, anelli color corallo, punta dorata intercambiabile con anello turchese
      const body = C.gunmetal;
      const ring = C.anodCoral;
      driverTip(b, 3, C.gold, 0.9, 3.2);
      b.lathe(
        [
          [0.9, 3.2],
          [0.9, 11],
          [1.3, 13, C.blackOxide],
          [2.3, 15],
        ],
        C.gold,
        { segs: 10 },
      );
      b.lathe(
        [
          [2.3, 15],
          [2.3, 20],
        ],
        C.blackOxide,
        { segs: 6, crease: 20 },
      );
      b.lathe(
        [
          [2.35, 20],
          [2.5, 20.3],
          [2.5, 22.2],
          [2.35, 22.5],
        ],
        C.anodTeal,
        { segs: 12 },
      );
      b.lathe(
        [
          [2.3, 22.5],
          [2.3, 31],
        ],
        C.blackOxide,
        { segs: 6, crease: 20 },
      );
      // mandrino magnetico
      b.lathe(
        [
          [2.3, 30.5],
          [3.1, 30.5],
          [3.5, 31.2],
          [3.5, 34],
          [3.2, 34.4, ring],
          [3.2, 35.6],
          [3.5, 36, C.steel],
          [3.5, 38.2],
          [4.4, 39.6, body],
          [4.9, 41],
        ],
        C.steel,
        { segs: 18 },
      );
      b.fluted(
        [
          [5.0, 41],
          [5.25, 56],
          [5.25, 64],
        ],
        body,
        30,
        0.06,
      );
      b.lathe(
        [
          [5.1, 64],
          [5.1, 65],
          [4.5, 65.6, ring],
          [4.5, 68.4],
          [5.1, 69, body],
          [5.1, 70],
        ],
        body,
        { segs: 20, crease: 30 },
      );
      b.fluted(
        [
          [5.25, 70],
          [5.25, 82],
          [4.9, 96],
        ],
        body,
        30,
        0.06,
      );
      // collare esagonale antirotolamento
      b.lathe(
        [
          [4.7, 96],
          [5.6, 96.4],
          [5.6, 100],
          [4.7, 100.4],
        ],
        C.steelDark,
        { segs: 6, crease: 25 },
      );
      b.lathe(
        [
          [4.4, 100.4],
          [3.0, 100.8, C.brass],
          [3.0, 102.4],
          [0, 102.4],
        ],
        body,
        { segs: 16 },
      );
      // cappuccio su cuscinetto ceramico con intarsio turchese
      b.lathe(
        [
          [0, 102.6],
          [4.8, 102.6],
          [5.2, 103.4],
          [5.2, 105],
          [4.9, 105.3, ring],
          [4.9, 106.3],
          [5.2, 106.6, body],
          [5.2, 111.4],
          [4.6, 112.6],
          [3.6, 112.5, C.anodTeal],
          [1.5, 111.7],
          [0, 111.5],
        ],
        body,
        { segs: 20 },
      );
    }
  });
  return A.finish(`driver-t${tier}`);
}

// ------------------------------------------------------------------ spudger
export function buildSpudger(tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    if (tier <= 1) {
      const m = mat(0x1a1b1e, 0.58, 0);
      b.loft(
        [
          ringE(0, 2.6, 0.22, 10, 3),
          ringE(4, 2.9, 0.7, 10, 3),
          ringE(13, 3.0, 1.5, 10, 2.6),
          ringE(24, 2.7, 2.5, 10, 2),
          ringE(32, 2.6, 2.6, 10),
          ringE(112, 2.6, 2.6, 10),
          ringE(122, 2.2, 2.2, 10),
          ringE(134, 0.9, 0.9, 10),
          ringE(138, 0.25, 0.25, 10),
        ],
        m,
        { capStart: true, capEnd: true },
      );
      // tacche antiscivolo
      for (let i = 0; i < 4; i++) b.at({ p: [0, 62 + i * 5, 0] }, () => b.torus(2.65, 0.32, m, 10, 4));
    } else if (tier === 2) {
      const m = mat(0x1d62c8, 0.52, 0);
      const dark = mat(0x164a98, 0.55, 0);
      b.loft(
        [
          ringE(0, 4.2, 0.2, 12, 3.5),
          ringE(5, 4.4, 0.75, 12, 3.5),
          ringE(16, 4.0, 1.5, 12, 3.5),
          ringE(26, 3.6, 2.0, 12, 4),
          ringE(34, 3.6, 2.1, 12, 5),
          ringE(108, 3.6, 2.1, 12, 5),
          ringE(118, 3.2, 1.9, 12, 3),
          ringE(132, 2.2, 1.0, 12, 2.5),
        ],
        m,
        { capStart: true },
      );
      // estremità a uncino
      b.sweep(
        [
          [0, 131, 0],
          [0, 136, 0],
          [0.6, 140, 0],
          [2.2, 143, 0],
          [4.2, 144, 0],
        ],
        [
          [1, 2.1],
          [-1, 2.1],
          [-1, -2.1],
          [1, -2.1],
        ],
        m,
        { scale: (t) => 1 - t * 0.7, caps: true, up: [0, 0, 1] },
      );
      for (let i = 0; i < 6; i++) b.at({ p: [0, 44 + i * 4.2, 0] }, () => b.box(7.5, 1.3, 4.5, dark, 0.35));
      b.at({ p: [0, 88, 2.14] }, () => b.plate(5.2, 5.2, C.print, atlasRect('esdSymbol')));
    } else {
      // lama in acciaio sottile + manico in fibra di carbonio con ghiere
      b.loft(
        [
          ringE(0, 2.4, 0.07, 8, 4),
          ringE(3, 3.0, 0.14, 8, 4),
          ringE(26, 3.0, 0.2, 8, 4),
          ringE(31, 2.2, 0.7, 8, 3),
          ringE(35, 1.5, 1.5, 8),
        ],
        C.steel,
        { capStart: true },
      );
      b.lathe(
        [
          [1.5, 34],
          [2.9, 35],
          [3.3, 36],
          [3.3, 41],
          [3.0, 41.5, C.anodCoral],
          [3.0, 43],
          [3.3, 43.5, C.steelDark],
          [3.3, 44],
        ],
        C.steelDark,
        { segs: 14 },
      );
      b.lathe(
        [
          [3.2, 44],
          [3.2, 112],
        ],
        mat(0x202226, 0.3, 0.3),
        { segs: 14 },
      );
      for (let i = 0; i < 4; i++) b.band(3.23, 44.5 + i * 16.75, 61.25 + i * 16.75, 0, Math.PI * 2, mat(0x3a3d44, 0.28, 0.35), tileRect('carbon', 1), 14);
      b.lathe(
        [
          [3.3, 112],
          [3.3, 112.5],
          [3.0, 113, C.anodCoral],
          [3.0, 114.5],
          [3.3, 115, C.steelDark],
          [3.3, 120],
          [2.2, 122],
          [1.1, 124, C.steel],
          [0.9, 138],
          [0.25, 146],
          [0, 146.4],
        ],
        C.steelDark,
        { segs: 14 },
      );
    }
  });
  return A.finish(`spudger-t${tier}`);
}

function tileRect(name: string, inset: number): readonly [number, number, number, number] {
  const r = atlasRect(name);
  const e = inset / 1024;
  return [r[0] + e / 2, r[1] + e, r[2] - e / 2, r[3] - e];
}

// ------------------------------------------------------------------ plettro
export function buildPick(_tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    const outline = roundPoly(
      [
        [0, -1.2],
        [15.5, 26],
        [-15.5, 26],
      ],
      [3.2, 6.5, 6.5],
      7,
    );
    b.extrude(outline, 0.7, mat(0x1cb4d4, 0.32, 0), { bevel: 0.28, uvFront: atlasRect('pickPrint'), crease: 60 });
  });
  return A.finish('pick-t1');
}

// ------------------------------------------------------------------ ventosa
/** Coppa di gomma: labbro a y = 0, collo verso +Y. Ritorna la quota del collo. */
function suctionCup(b: Builder, R: number, m: Mat): number {
  const k = R / 20;
  b.lathe(
    [
      [0, 5.2 * k],
      [8 * k, 4.4 * k],
      [16 * k, 1.6 * k],
      [19.4 * k, 0.1 * k],
      [20 * k, 0],
      [20.6 * k, 0.5 * k],
      [18 * k, 3.0 * k],
      [10 * k, 6.8 * k],
      [5.6 * k, 9.2 * k],
      [4.8 * k, 12 * k],
      [0, 12 * k],
    ],
    m,
    { segs: 22, crease: 62 },
  );
  return 12 * k;
}

export function buildSuction(tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    if (tier <= 1) {
      const top = suctionCup(b, 20, mat(0x1a6fd0, 0.5, 0));
      b.lathe(
        [
          [3.8, top - 0.5],
          [3.8, top + 2],
          [3.0, top + 3],
          [3.0, top + 8],
          [3.8, top + 9],
          [3.8, top + 10.5],
          [2.4, top + 11.5],
          [0, top + 11.5],
        ],
        C.black,
        { segs: 12 },
      );
      // anello portachiavi in acciaio (doppia spira)
      for (const dz of [-0.55, 0.55]) b.at({ p: [0, top + 16.5, dz], r: [Math.PI / 2, 0, 0.25] }, () => b.torus(10.5, 0.62, C.steel, 26, 6));
    } else if (tier === 2) {
      const cupM = mat(0x151516, 0.7, 0);
      const bodyM = mat(0xffb81f, 0.4, 0);
      for (const sx of [-1, 1]) {
        b.at({ p: [sx * 31, 0, 0] }, () => {
          const top = suctionCup(b, 26, cupM);
          b.lathe(
            [
              [0, top - 6],
              [17, top - 6],
              [19, top - 4],
              [19, top + 3],
              [15, top + 6],
              [0, top + 6],
            ],
            bodyM,
            { segs: 18 },
          );
          // leva di bloccaggio
          b.at({ p: [0, top + 8, 0], r: [0, sx > 0 ? 0 : Math.PI, 0] }, () => {
            b.at({ r: [Math.PI / 2, 0, 0] }, () => b.cyl(3.2, -8, 8, C.steelDark, 10));
            b.at({ p: [13, 2.5, 0], r: [0, 0, 0.22] }, () => b.box(28, 4.5, 13, C.black, 1.4));
          });
        });
      }
      // maniglia ad arco
      const path: P3[] = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const x = -31 + 62 * t;
        const yy = 20 + Math.sin(t * Math.PI) * 30 + (t === 0 || t === 1 ? -4 : 0);
        path.push([x, yy, 0]);
      }
      b.sweep(path, roundRect(11, 16, 4.5, 2), bodyM, { caps: true, up: [0, 0, 1] });
      // impugnatura in gomma
      b.sweep(
        path.slice(4, 11),
        roundRect(13, 18, 5.5, 2),
        C.rubber,
        { caps: true, up: [0, 0, 1] },
      );
    } else {
      // pinza apri-schermo: due ventose contrapposte (lungo Z), bracci incrociati, manici lungo +Y
      const cupM = mat(0x16171a, 0.7, 0);
      for (const side of [0, 1]) {
        b.at({ r: [0, side * Math.PI, 0] }, () => {
          const xo = -3.2;
          // ventosa rivolta verso +Z (labbro a z = -5)
          b.at({ p: [0, 0, -7], r: [-Math.PI / 2, 0, 0] }, () => {
            const top = suctionCup(b, 17.5, cupM);
            b.cyl(6.5, top - 1, top + 5, C.steelDark, 12, 0.8);
          });
          // braccio in acciaio: dalla ventosa, incrocia al perno (y = 62) e diventa manico sul lato opposto
          const arm: P3[] = [
            [xo, 2, -20],
            [xo, 14, -21],
            [xo, 34, -16],
            [xo, 62, 0],
            [xo, 84, 13],
            [xo, 110, 19],
            [xo, 150, 21],
          ];
          b.sweep(arm, roundRect(3.2, 9, 1.2, 1), C.steelSatin, { caps: true, up: [1, 0, 0] });
          b.at({ p: [xo, 2, -17.5] }, () => b.box(3.2, 16, 9, C.steelSatin, 1));
          // impugnatura corallo
          b.sweep(
            [
              [xo, 96, 16.4],
              [xo, 110, 19],
              [xo, 150, 21],
              [xo, 158, 21],
            ],
            roundRect(7.5, 13, 3.4, 2),
            C.coral,
            { caps: true, up: [1, 0, 0] },
          );
          for (let i = 0; i < 4; i++) b.at({ p: [xo, 116 + i * 9, 19.6 + i * 0.45] }, () => b.box(8.1, 2.2, 13.6, mat(0xd94c30, 0.5, 0), 0.6));
        });
      }
      // perno e molla di ritorno
      b.at({ p: [0, 62, 0], r: [0, 0, Math.PI / 2] }, () => {
        b.cyl(3.4, -5.6, 5.6, C.steelDark, 12, 0.6);
        b.cyl(1.6, -6.4, 6.4, C.steel, 8);
      });
      const spring: P3[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const a = t * Math.PI * 2 * 5;
        spring.push([Math.cos(a) * 2.6, 80 + Math.sin(a) * 2.6, -10.5 + t * 21]);
      }
      b.sweep(spring, 0.55, C.steel, { sides: 4 });
    }
  });
  return A.finish(`suction-t${tier}`);
}

// ------------------------------------------------------------------ pinzette
interface Station {
  s: number;
  w: number;
  t: number;
  z: number;
  m: Mat;
}

/** Linea centrale delle pinzette nel piano XY: curva di `bend` radianti nei primi `bendLen` mm dalla punta. */
function tweezerCenter(s: number, bend: number, bendLen: number): { x: number; y: number; ang: number } {
  let x = 0;
  let y = 0;
  const n = Math.max(1, Math.ceil(s / 0.5));
  const ds = s / n;
  for (let i = 0; i < n; i++) {
    const a = bend * Math.max(0, 1 - ((i + 0.5) * ds) / bendLen);
    x += Math.sin(a) * ds;
    y += Math.cos(a) * ds;
  }
  return { x, y, ang: bend * Math.max(0, 1 - s / bendLen) };
}

function tweezerArm(b: Builder, st: readonly Station[], bend: number, bendLen: number): void {
  const rings: P3[][] = [];
  const mats: Mat[] = [];
  for (const q of st) {
    const c = tweezerCenter(q.s, bend, bendLen);
    const nx = Math.cos(c.ang);
    const ny = -Math.sin(c.ang);
    const hw = q.w / 2;
    rings.push([
      [c.x + nx * hw, c.y + ny * hw, q.z + q.t],
      [c.x - nx * hw, c.y - ny * hw, q.z + q.t],
      [c.x - nx * hw, c.y - ny * hw, q.z],
      [c.x + nx * hw, c.y + ny * hw, q.z],
    ]);
    mats.push(q.m);
  }
  b.loft(rings, mats, { flat: true, capStart: true, capEnd: true });
}

export function buildTweezers(tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    let st: Station[];
    let bend = 0;
    let grip: Mat = C.steelSatin;
    if (tier <= 1) {
      const m = mat(0xd4d7dc, 0.2, 1);
      st = [
        { s: 0, w: 0.7, t: 0.45, z: 0.03, m },
        { s: 10, w: 2.2, t: 0.8, z: 0.7, m },
        { s: 38, w: 8.5, t: 1.0, z: 3.3, m },
        { s: 80, w: 9.5, t: 1.0, z: 4.0, m },
        { s: 100, w: 9.0, t: 1.0, z: 1.6, m },
        { s: 108, w: 8.6, t: 1.0, z: 0.0, m },
        { s: 119, w: 7.0, t: 1.0, z: 0.0, m },
        { s: 121, w: 4.5, t: 1.0, z: 0.0, m },
      ];
    } else if (tier === 2) {
      const m = mat(0x18191b, 0.62, 0.25);
      const tip = C.steel;
      grip = mat(0x242528, 0.7, 0.2);
      st = [
        { s: 0, w: 0.28, t: 0.3, z: 0.02, m: tip },
        { s: 9, w: 1.1, t: 0.55, z: 0.5, m: tip },
        { s: 9.01, w: 1.1, t: 0.6, z: 0.5, m },
        { s: 36, w: 6.6, t: 0.95, z: 3.0, m },
        { s: 80, w: 8.2, t: 0.95, z: 3.8, m },
        { s: 100, w: 8.0, t: 0.95, z: 1.5, m },
        { s: 108, w: 7.6, t: 0.95, z: 0.0, m },
        { s: 119, w: 6.2, t: 0.95, z: 0.0, m },
        { s: 121, w: 4.0, t: 0.95, z: 0.0, m },
      ];
    } else {
      // titanio anodizzato con sfumatura blu → viola → oro, punta curva
      bend = 0.72;
      const g = (hex: number): Mat => mat(hex, 0.3, 1);
      grip = g(0x6a48c8);
      st = [
        { s: 0, w: 0.26, t: 0.3, z: 0.02, m: g(0xd9a23a) },
        { s: 7, w: 0.9, t: 0.5, z: 0.4, m: g(0xd9843a) },
        { s: 16, w: 1.9, t: 0.7, z: 1.0, m: g(0xc04a9a) },
        { s: 38, w: 6.4, t: 0.9, z: 3.0, m: g(0x6a48c8) },
        { s: 80, w: 8.4, t: 0.9, z: 3.8, m: g(0x2a6fe0) },
        { s: 100, w: 8.2, t: 0.9, z: 1.5, m: g(0x1aa0d8) },
        { s: 108, w: 7.8, t: 0.9, z: 0.0, m: g(0x19b5b0) },
        { s: 119, w: 6.4, t: 0.9, z: 0.0, m: g(0x19b5b0) },
        { s: 121, w: 4.2, t: 0.9, z: 0.0, m: g(0x19b5b0) },
      ];
    }
    for (const sg of [1, -1]) {
      b.at({ s: [1, 1, sg] }, () => {
        tweezerArm(b, st, bend, 20);
        // zigrinatura di presa sul lato esterno
        for (let i = 0; i < 7; i++) {
          const sv = 52 + i * 3.4;
          const c = tweezerCenter(sv, bend, 20);
          const z = 3.45 + (sv - 38) * 0.0167 + 0.95;
          b.at({ p: [c.x, c.y, z] }, () => b.box(7.2, 1.3, 0.5, grip, 0.2));
        }
      });
    }
    if (tier === 1) b.at({ p: [0, 114, 1.02] }, () => b.at({ r: [-Math.PI / 2, 0, 0] }, () => b.cyl(1.3, 0, 0.25, C.steelDark, 8)));
  });
  return A.finish(`tweezers-t${tier}`);
}

// ------------------------------------------------------------------ pennello
export function buildBrush(tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    if (tier <= 1) {
      const tipM = mat(0x4a4038, 0.75, 0);
      b.fluted(
        [
          [0.5, 0],
          [1.7, 3.5],
          [2.5, 9],
          [2.5, 16],
        ],
        C.bristle,
        9,
        0.2,
      );
      b.lathe(
        [
          [0, 0],
          [0.45, 0],
        ],
        tipM,
        { segs: 8 },
      );
      b.lathe(
        [
          [2.7, 15],
          [2.9, 15.4],
          [2.9, 18],
          [2.7, 18.4],
          [2.7, 19.4],
          [2.9, 19.8],
          [2.9, 26],
          [3.3, 27],
        ],
        C.alu,
        { segs: 12, crease: 35 },
      );
      b.lathe(
        [
          [3.2, 27],
          [3.7, 34],
          [3.9, 52],
          [3.3, 80],
          [2.4, 112],
          [1.8, 128],
          [1.2, 131],
          [0, 131.6],
        ],
        mat(0x17181a, 0.4, 0),
        { segs: 12, crease: 60 },
      );
      b.lathe(
        [
          [3.75, 36],
          [3.95, 36.4],
          [3.97, 39.6],
          [3.85, 40],
        ],
        C.yellow,
        { segs: 12 },
      );
    } else {
      // spazzolino ESD piatto: setole corte e rigide a ciuffi, ghiera in acciaio, manico blu
      const handle = mat(0x1d5fc4, 0.5, 0);
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < 6; i++) {
          const x = (i - 2.5) * 2.25;
          const z = (r - 0.5) * 2.3;
          b.loft([ringE(0, 0.75, 0.75, 5, 2, x * 1.08, z * 1.15), ringE(4, 1.05, 1.05, 5, 2, x, z), ringE(13, 0.95, 0.95, 5, 2, x * 0.96, z * 0.9)], (i + r) % 2 ? C.bristle : mat(0x26262a, 0.7, 0), { capStart: true, flat: true });
        }
      }
      b.loft([ringE(12, 7.4, 2.9, 14, 5), ringE(13, 7.8, 3.2, 14, 5), ringE(22, 7.8, 3.2, 14, 5), ringE(23, 7.4, 2.9, 14, 5)], C.steelSatin, { capStart: true });
      b.at({ p: [0, 17.5, 0] }, () => b.loft([ringE(-1, 7.95, 3.35, 14, 5), ringE(1, 7.95, 3.35, 14, 5)], C.steelDark));
      b.loft(
        [ringE(23, 7.0, 2.7, 14, 4), ringE(34, 7.6, 3.2, 14, 3.5), ringE(60, 8.2, 3.4, 14, 3), ringE(100, 7.0, 3.0, 14, 3), ringE(132, 6.2, 2.6, 14, 2.6), ringE(138, 4.6, 2.0, 14, 2.2), ringE(140, 2.2, 1.0, 14, 2)],
        handle,
        { capEnd: true },
      );
      b.at({ p: [0, 52, 3.42] }, () => b.plate(7.5, 7.5, C.print, atlasRect('esdSymbol')));
      // foro per appenderlo
      b.at({ p: [0, 131, 0], r: [Math.PI / 2, 0, 0] }, () => b.torus(2.2, 0.75, mat(0x164a98, 0.5, 0), 10, 5));
    }
  });
  return A.finish(`brush-t${tier}`);
}

// ------------------------------------------------------------------ stuzzicadenti
export function buildToothpick(_tier: number): ToolModel {
  const A = new Asm();
  A.main.at({ s: MM }, () => {
    A.main.lathe(
      [
        [0, 0],
        [0.2, 0.2],
        [1.05, 9],
        [1.1, 49],
        [0.75, 49.8],
        [0.75, 50.6],
        [1.1, 51.4],
        [1.1, 53],
        [0.75, 53.8],
        [0.75, 54.6],
        [1.1, 55.4],
        [1.1, 62],
        [0.8, 64.4],
        [0, 65],
      ],
      C.wood,
      { segs: 8, crease: 65 },
    );
  });
  return A.finish('toothpick-t1');
}

// ------------------------------------------------------------------ estrattore viti spanate
export function buildExtractor(_tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    // punta conica con spirale sinistrorsa
    const path: P3[] = [];
    for (let i = 0; i <= 14; i++) path.push([0, i, 0]);
    const sq: P2[] = [
      [1.25, 0],
      [0.45, 0.45],
      [0, 1.25],
      [-0.45, 0.45],
      [-1.25, 0],
      [-0.45, -0.45],
      [0, -1.25],
      [0.45, -0.45],
    ];
    b.sweep(path, sq, C.blackOxide, { scale: (t) => 0.3 + 0.7 * t, twist: -Math.PI * 2.6, caps: true, flat: true });
    b.lathe(
      [
        [1.3, 14],
        [1.9, 15],
        [1.9, 17],
      ],
      C.blackOxide,
      { segs: 10 },
    );
    b.lathe(
      [
        [2.1, 17],
        [2.1, 30],
      ],
      C.steelDark,
      { segs: 6, crease: 20 },
    );
    // mandrino a pinza zigrinato
    b.lathe(
      [
        [2.1, 29],
        [3.2, 29.5],
        [4.3, 33],
      ],
      C.steel,
      { segs: 16 },
    );
    b.fluted(
      [
        [4.5, 33],
        [4.5, 43],
      ],
      C.steel,
      18,
      0.09,
    );
    b.lathe(
      [
        [4.3, 43],
        [3.4, 44],
        [3.4, 46],
        [5.4, 48, C.anodRed],
      ],
      C.steel,
      { segs: 16 },
    );
    // impugnatura rossa a T
    b.fluted(
      [
        [5.6, 48],
        [6.9, 58],
        [7.2, 72],
        [6.4, 84],
      ],
      mat(0xc8322b, 0.42, 0.55),
      10,
      0.13,
    );
    b.lathe(
      [
        [6.2, 84],
        [6.6, 85, C.steelDark],
        [6.6, 97],
        [5.6, 99.5],
        [3, 100.6],
        [0, 100.8],
      ],
      C.anodRed,
      { segs: 16 },
    );
    b.at({ p: [0, 91, 0], r: [0, 0, Math.PI / 2] }, () => {
      b.cyl(2.3, -24, 24, C.steel, 10, 0.5);
      for (const s of [-1, 1]) b.at({ p: [0, s * 22, 0] }, () => b.ball(3.4, 3.4, C.steelDark, 10, 6));
    });
  });
  return A.finish('extractor-t1');
}

// ------------------------------------------------------------------ tessera di plastica
export function buildCard(_tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    b.at({ p: [0, 42.8, 0], r: [0, 0, Math.PI / 2] }, () => {
      b.extrude(roundRect(85.6, 54, 3.4, 5), 0.78, mat(0xf2ede2, 0.34, 0), { bevel: 0.22, uvFront: atlasRect('cardPrint'), crease: 60 });
    });
  });
  return A.finish('card-t1');
}
