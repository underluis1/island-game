/**
 * Apparecchi da banco: centro della base all'origine, fronte verso +Z, ingombro ≤ 0.30 × 0.30 m.
 * Modellati in millimetri (scala 0.001).
 */
import type * as THREE from 'three';
import { atlasPixels, atlasRect, type UVRect } from '../textures/tools-atlas';
import { Asm, approach, mat, ringE, ringR, roundRect, spline, type Builder, type GlowRange, type Mat, type P2, type P3, type ToolModel } from './kit';
import { C, OFF, alligator, cable, foot, glowTint, knob, roundPoly, screwHead } from './palette';

const MM = 0.001;
const HALF_PI = Math.PI / 2;
const DISPLAY = glowTint(0x1a1a1a);

/** Converte coordinate pixel di una regione pannello in coordinate locali del pannello (centrato). */
function px(region: string, w: number, h: number, x: number, y: number): P2 {
  const [rw, rh] = atlasPixels(region);
  return [(x / rw - 0.5) * w, (0.5 - y / rh) * h];
}

function feet(b: Builder, w: number, d: number, r = 7, h = 8): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.at({ p: [(sx * w) / 2, 0, (sz * d) / 2] }, () => foot(b, r, h));
}

/** Interruttore a bilanciere sporgente lungo +Z (centrato). */
function rocker(b: Builder, w: number, h: number, body: Mat): void {
  b.box(w + 3, h + 3, 2.4, C.blackMatte, 0.8);
  b.at({ p: [0, 0, 1.6], r: [0.16, 0, 0] }, () => b.box(w, h, 3, body, 1));
}

/** Spezzone di cavo di alimentazione che esce dal retro e si adagia sul banco. */
function powerCord(b: Builder, x: number, y: number, z: number, len = 34): void {
  b.at({ p: [x, y, z], r: [-HALF_PI, 0, 0] }, () =>
    b.lathe(
      [
        [5.5, 0],
        [5.5, 3],
        [4, 5],
        [3.2, 14],
        [0, 14],
      ],
      C.blackMatte,
      { segs: 8 },
    ),
  );
  cable(
    b,
    spline(
      [
        [x, y, z - 12],
        [x, y - 2, z - 12 - len * 0.4],
        [x + 4, 3.2, z - 12 - len * 0.8],
        [x + 14, 2.6, z - 12 - len],
      ],
      8,
    ),
    2.4,
    C.blackMatte,
    6,
  );
}

// ------------------------------------------------------------------ piastra riscaldante separatrice (heat t3)
export function buildHeatPlate(): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let disp: GlowRange = { start: 0, end: 0 };
  let led: GlowRange = { start: 0, end: 0 };
  let sw: GlowRange = { start: 0, end: 0 };
  const panel = 'platePanel';
  const PW = 150;
  const PH = 46.4;
  b.at({ s: MM }, () => {
    const paint = mat(0x2a2e35, 0.5, 0.35);
    feet(b, 164, 204);
    b.loft([ringR(7, 196, 236, 10), ringR(9, 200, 240, 12), ringR(50, 200, 240, 12), ringR(52.5, 195, 235, 10)], paint, { capStart: true, capEnd: true });
    b.loft([ringR(48, 201, 241, 12), ringR(50.5, 201, 241, 12)], mat(0xff6b4a, 0.45, 0.2));
    // pannello frontale
    b.at({ p: [0, 29, 120.15] }, () => {
      b.plate(PW, PH, C.print, atlasRect(panel));
      for (const bx of [196, 250, 304]) {
        const p = px(panel, PW, PH, bx, 60);
        b.at({ p: [p[0], p[1], 0], r: [HALF_PI, 0, 0] }, () => b.cyl(5.4, 0, 2.6, bx === 196 ? C.coral : C.greyLight, 12, 0.8));
      }
    });
    // piastra in alluminio su distanziali + righello + battute
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.at({ p: [sx * 78, 52, sz * 92 - 8] }, () => b.cyl(5, 0, 4, C.steelDark, 8));
    b.at({ p: [0, 60, -8] }, () => b.box(178, 8, 208, C.alu, 1.2));
    b.at({ p: [0, 64.06, 88], r: [-HALF_PI, 0, 0] }, () => b.plate(150, 7, C.alu, atlasRect('ruler')));
    b.at({ p: [0, 66.5, -106] }, () => b.box(170, 5, 6, C.steelSatin, 0.8));
    for (const sx of [-1, 1]) {
      b.at({ p: [sx * 84, 66, 20] }, () => {
        b.box(8, 4.5, 40, C.steelSatin, 0.8);
        b.at({ p: [0, 2, 0] }, () => knob(b, 4.5, 7, C.brass, { flutes: 10 }));
      });
    }
    // viti agli angoli della piastra
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.at({ p: [sx * 78, 64, sz * 92 - 8] }, () => screwHead(b, 2.6));
    // feritoie e interruttore
    b.at({ p: [-100.1, 30, -20], r: [0, -HALF_PI, 0] }, () => b.plate(64, 26, paint, atlasRect('vents')));
    b.at({ p: [100.2, 30, 60], r: [0, HALF_PI, 0] }, () => rocker(b, 11, 17, C.blackGloss));
    powerCord(b, 60, 26, -120);
  });
  g.at({ s: MM }, () => {
    g.at({ p: [0, 29, 120.3] }, () => {
      const c = px(panel, PW, PH, 87, 48);
      disp = A.glowPart(() => g.at({ p: [c[0], c[1], 0] }, () => g.plate(64.5, 29.4, DISPLAY, atlasRect('dPlate'))));
      const l = px(panel, PW, PH, 196, 76);
      led = A.glowPart(() => g.withPlainUv('led', () => g.at({ p: [l[0], l[1] + 9.5, 0.3] }, () => g.disc(1.6, OFF, undefined, 8))));
    });
    sw = A.glowPart(() => g.withPlainUv('led', () => g.at({ p: [103.6, 34, 60], r: [0, HALF_PI, 0] }, () => g.plate(7, 5, OFF, plain()))));
  });
  let on = 0;
  let t = 0;
  let warm = 0;
  return A.finish('heat-t3', (dt, active) => {
    t += dt;
    on = approach(on, active ? 1 : 0, dt, 0.1);
    warm = approach(warm, active ? 1 : 0, dt, active ? 2.5 : 5);
    const d = 0.1 + on * 1.3;
    A.setGlow(disp, d, d, d);
    const blink = warm < 0.85 ? (Math.sin(t * 9) > 0 ? 1 : 0.15) : 1;
    A.setGlow(led, on * 3 * blink, on * 0.6 * blink, 0);
    A.setGlow(sw, on * 2.5, on * 0.2, on * 0.1);
  });
}

function plain(): UVRect {
  const r = atlasRect('led');
  const u = (r[0] + r[2]) / 2;
  const v = (r[1] + r[3]) / 2;
  return [u, v, u, v];
}

// ------------------------------------------------------------------ alimentatore da banco (multimeter t2)
export function buildPowerSupply(): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let disp: GlowRange = { start: 0, end: 0 };
  let cv: GlowRange = { start: 0, end: 0 };
  let cc: GlowRange = { start: 0, end: 0 };
  let sw: GlowRange = { start: 0, end: 0 };
  const panel = 'psuPanel';
  const PW = 104;
  const PH = 149.5;
  const CY = 83;
  b.at({ s: MM }, () => {
    const cover = mat(0x168f96, 0.5, 0.35);
    feet(b, 84, 170, 6, 8);
    b.at({ p: [0, CY, -3] }, () => b.box(110, 150, 204, cover, 3));
    b.at({ p: [0, CY, 102] }, () => b.box(112, 152, 8, C.cream, 2.5));
    b.at({ p: [0, CY, 106.1] }, () => {
      b.plate(PW, PH, C.print, atlasRect(panel));
      // manopole
      for (const kx of [74, 182]) {
        const p = px(panel, PW, PH, kx, 214);
        b.at({ p: [p[0], p[1], 0], r: [HALF_PI, 0, 0] }, () => knob(b, 9, 13, C.black, { flutes: 16, pointer: C.white, skirt: C.steelDark }));
        b.at({ p: [p[0] + 17.2, p[1] - 1, 0], r: [HALF_PI, 0, 0] }, () => knob(b, 3.6, 8, C.grey, { flutes: 8, pointer: C.white }));
      }
      // interruttore di rete
      const s = px(panel, PW, PH, 46, 322);
      b.at({ p: [s[0], s[1], 0] }, () => rocker(b, 11, 17, C.blackGloss));
      // morsetti a boccola
      const posts: [number, Mat][] = [
        [118, C.black],
        [164, C.green],
        [210, C.red],
      ];
      for (const [bx, col] of posts) {
        const p = px(panel, PW, PH, bx, 312);
        b.at({ p: [p[0], p[1], 0], r: [HALF_PI, 0, 0] }, () => {
          b.cyl(4.6, 0, 2.5, C.steel, 6);
          b.fluted(
            [
              [5.4, 2.5],
              [5.4, 10],
            ],
            col,
            10,
            0.1,
          );
          b.lathe(
            [
              [5.2, 10],
              [3.4, 11],
              [0, 11],
            ],
            col,
            { segs: 10 },
          );
        });
      }
    });
    // spinotti a banana + cavi + coccodrilli
    const leads: [number, Mat, P3[], number][] = [
      [
        210,
        C.red,
        [
          [0, 0, 28],
          [0, -8, 38],
          [6, -24, 41],
          [18, -28.4, 38],
          [32, -28.6, 30],
        ],
        -1.1,
      ],
      [
        118,
        mat(0x1b1c1f, 0.55, 0),
        [
          [0, 0, 28],
          [0, -8, 39],
          [-8, -24, 43],
          [-24, -28.4, 40],
          [-42, -28.6, 33],
        ],
        1.15,
      ],
    ];
    for (const [bx, col, path, rot] of leads) {
      const p = px(panel, PW, PH, bx, 312);
      b.at({ p: [p[0], CY + p[1], 106.1] }, () => {
        b.at({ r: [HALF_PI, 0, 0] }, () =>
          b.lathe(
            [
              [2.2, 11],
              [3.6, 12],
              [3.6, 24],
              [2.6, 30],
              [0, 30],
            ],
            col,
            { segs: 10 },
          ),
        );
        const pts = spline(path, 14);
        cable(b, pts, 1.7, col, 6);
        const end = pts[pts.length - 1] as P3;
        b.at({ p: [end[0], end[1] + 0.6, end[2]], r: [HALF_PI, 0, rot] }, () => b.at({ p: [0, -36, 0] }, () => alligator(b, col, 1.05)));
      });
    }
    // maniglia superiore
    b.sweep(
      [
        [0, 157, -46],
        [0, 166, -40],
        [0, 170, -28],
        [0, 170, 28],
        [0, 166, 40],
        [0, 157, 46],
      ],
      roundRect(3.4, 20, 1.5, 1),
      C.blackMatte,
      { caps: true, up: [0, 1, 0] },
    );
    for (const sz of [-1, 1]) b.at({ p: [0, 158.4, sz * 46] }, () => b.box(26, 2.4, 10, C.steelDark, 0.8));
    // feritoie laterali e retro
    for (const sx of [-1, 1]) b.at({ p: [sx * 55.15, 112, -24], r: [0, sx * HALF_PI, 0] }, () => b.plate(84, 36, cover, atlasRect('vents')));
    b.at({ p: [0, 96, -105.1], r: [0, Math.PI, 0] }, () => b.disc(34, cover, atlasRect('grille'), 20));
    powerCord(b, -30, 30, -105);
  });
  g.at({ s: MM }, () => {
    g.at({ p: [0, CY, 106.3] }, () => {
      const c = px(panel, PW, PH, 128, 77);
      disp = A.glowPart(() => g.at({ p: [c[0], c[1], 0] }, () => g.plate(91, 49.4, DISPLAY, atlasRect('dPsu'))));
      const l1 = px(panel, PW, PH, 20, 172);
      const l2 = px(panel, PW, PH, 20, 186);
      g.withPlainUv('led', () => {
        cv = A.glowPart(() => g.at({ p: [l1[0], l1[1], 0.2] }, () => g.disc(1.5, OFF, undefined, 8)));
        cc = A.glowPart(() => g.at({ p: [l2[0], l2[1], 0.2] }, () => g.disc(1.5, OFF, undefined, 8)));
      });
      const s = px(panel, PW, PH, 46, 322);
      sw = A.glowPart(() => g.at({ p: [s[0], s[1] + 4.6, 3.95], r: [0.16, 0, 0] }, () => g.plate(7, 5, OFF, plain())));
    });
  });
  let on = 0;
  return A.finish('multimeter-t2', (dt, active) => {
    on = approach(on, active ? 1 : 0, dt, 0.1);
    const d = 0.1 + on * 1.3;
    A.setGlow(disp, d, d, d);
    A.setGlow(cv, on * 0.4, on * 3, on * 0.8);
    A.setGlow(cc, on * 0.25, 0, 0);
    A.setGlow(sw, on * 2.6, on * 0.2, on * 0.1);
  });
}

// ------------------------------------------------------------------ stazione ad aria calda (solder t2)
export function buildHotAirStation(): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let disp: GlowRange = { start: 0, end: 0 };
  let sw: GlowRange = { start: 0, end: 0 };
  let heater: GlowRange = { start: 0, end: 0 };
  const panel = 'stationPanel';
  const PW = 126;
  const PH = 118;
  const CY = 67;
  const wandXf = { p: [92, 22, 6] as P3, r: [-0.2, 0, -0.06] as P3 };
  b.at({ s: MM }, () => {
    const body = mat(0x23272d, 0.5, 0.3);
    const accent = mat(0xff8a3c, 0.45, 0.2);
    feet(b, 110, 136, 6, 8);
    b.at({ p: [0, CY, -2] }, () => b.box(140, 120, 166, body, 4));
    b.at({ p: [0, CY, 82] }, () => b.box(134, 122, 6, C.blackMatte, 2));
    b.loft([ringR(120, 141, 167, 5, 3, 0, -2), ringR(123, 141, 167, 5, 3, 0, -2)], accent);
    b.at({ p: [0, CY, 85.1] }, () => {
      b.plate(PW, PH, C.print, atlasRect(panel));
      for (const kx of [70, 186]) {
        const p = px(panel, PW, PH, kx, 182);
        b.at({ p: [p[0], p[1], 0], r: [HALF_PI, 0, 0] }, () => knob(b, 10, 13, kx === 70 ? accent : mat(0x3aa8d8, 0.45, 0.2), { flutes: 16, pointer: C.white, skirt: C.blackMatte, capMat: C.black }));
      }
      const s = px(panel, PW, PH, 128, 186);
      b.at({ p: [s[0], s[1], 0] }, () => rocker(b, 10, 16, C.blackGloss));
    });
    for (const sx of [-1, 1]) b.at({ p: [sx * 70.15, 84, -20], r: [0, sx * HALF_PI, 0] }, () => b.plate(84, 34, body, atlasRect('vents')));
    // attacco del tubo (lato sinistro)
    b.at({ p: [-70, 30, 40], r: [0, 0, HALF_PI] }, () =>
      b.lathe(
        [
          [9, 0],
          [9, 5],
          [7, 7],
          [7, 12],
          [0, 12],
        ],
        C.steelDark,
        { segs: 12 },
      ),
    );
    // culla del manipolo (lato destro)
    b.at({ p: [72, 98, 4] }, () => b.box(6, 34, 36, C.steelSatin, 1.2));
    b.at({ p: [91.5, 110, -0.5], r: [-0.2, 0, -0.06] }, () => {
      b.at({ r: [0, 0, 0] }, () => b.torus(15.6, 2.6, C.steelSatin, 16, 5));
      b.at({ p: [-17, 0, 0] }, () => b.box(6, 5, 12, C.steelSatin, 1));
    });
    // manipolo
    b.at(wandXf, () => {
      b.lathe(
        [
          [0, -2],
          [8, -2],
          [10.5, 2],
          [12.5, 10],
          [13.5, 40],
          [13.5, 96],
          [12.5, 104, accent],
          [12.5, 108],
          [14.5, 110, C.blackMatte],
          [14.5, 116],
          [10.5, 119, C.steel],
          [8.6, 121],
          [8.6, 178],
          [7, 182],
          [5.2, 196],
          [4.6, 196],
          [4.6, 190, C.blackMatte],
          [0, 190],
        ],
        C.blackMatte,
        { segs: 16, crease: 42 },
      );
      for (let i = 0; i < 5; i++) b.at({ p: [0, 50 + i * 9, 0] }, () => b.torus(13.5, 0.7, C.black, 16, 4));
      for (let i = 0; i < 3; i++) b.at({ p: [0, 132 + i * 14, 0] }, () => b.torus(8.6, 0.35, C.steelDark, 14, 4));
    });
    // tubo dell'aria: dal manipolo gira davanti alla stazione fino all'attacco
    cable(
      b,
      spline(
        [
          [92.5, 20, 6.5],
          [95, 9, 16],
          [92, 5.4, 60],
          [62, 5.2, 112],
          [0, 5.2, 122],
          [-62, 5.4, 112],
          [-90, 8, 80],
          [-93, 24, 52],
          [-86, 30, 41],
          [-82, 30, 40],
        ],
        30,
      ),
      5,
      mat(0x1a1b1e, 0.7, 0),
      7,
    );
    powerCord(b, -36, 28, -85);
  });
  g.at({ s: MM }, () => {
    g.at({ p: [0, CY, 85.3] }, () => {
      const c = px(panel, PW, PH, 128, 68);
      disp = A.glowPart(() => g.at({ p: [c[0], c[1], 0] }, () => g.plate(110, 43.6, DISPLAY, atlasRect('dStation'))));
      const s = px(panel, PW, PH, 128, 186);
      sw = A.glowPart(() => g.at({ p: [s[0], s[1] + 4.4, 3.75], r: [0.16, 0, 0] }, () => g.plate(6.5, 4.6, OFF, plain())));
    });
    heater = A.glowPart(() => g.at(wandXf, () => g.at({ p: [0, 190.4, 0], r: [-HALF_PI, 0, 0] }, () => g.disc(4.5, OFF, atlasRect('coil'), 12))));
  });
  let on = 0;
  let heat = 0;
  return A.finish('solder-t2', (dt, active) => {
    on = approach(on, active ? 1 : 0, dt, 0.1);
    heat = approach(heat, active ? 1 : 0, dt, active ? 1.6 : 4);
    const d = 0.1 + on * 1.3;
    A.setGlow(disp, d, d, d);
    A.setGlow(sw, on * 2.6, on * 0.2, on * 0.1);
    const h = heat * heat * 4.2;
    A.setGlow(heater, h, h * (0.1 + 0.16 * heat), h * 0.012);
  });
}

// ------------------------------------------------------------------ vasca a ultrasuoni
export function buildUltrasonic(): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let disp: GlowRange = { start: 0, end: 0 };
  const leds: GlowRange[] = [];
  const panel = 'ultraPanel';
  const PW = 200;
  const PH = 62;
  b.at({ s: MM }, () => {
    const inox = mat(0xcfd2d6, 0.3, 1);
    feet(b, 200, 112, 7, 9);
    b.loft([ringR(8, 234, 144, 12), ringR(11, 240, 150, 14), ringR(124, 240, 150, 14), ringR(124, 240, 150, 14), ringR(126, 243, 153, 15), ringR(131, 243, 153, 15), ringR(132, 240, 150, 14), ringR(132, 208, 118, 10)], [inox, inox, inox, C.blackMatte, C.blackMatte, C.blackMatte, C.blackMatte, C.blackMatte], {
      capStart: true,
    });
    // vasca interna e acqua
    b.loft([ringR(132, 208, 118, 10), ringR(128, 204, 114, 12), ringR(62, 198, 108, 12)], mat(0xe1e4e7, 0.22, 1), {});
    b.cap(ringR(108, 202, 112, 12), mat(0x3a9fb0, 0.04, 0.2), false);
    // pannello comandi
    b.at({ p: [0, 62, 75.2] }, () => b.box(208, 70, 4, C.blackMatte, 1.6));
    b.at({ p: [0, 62, 77.3] }, () => {
      b.plate(PW, PH, C.print, atlasRect(panel));
      [196, 250, 304].forEach((bx, i) => {
        const p = px(panel, PW, PH, bx, 64);
        b.at({ p: [p[0], p[1], 0], r: [HALF_PI, 0, 0] }, () => {
          b.torus(7.2, 1.0, C.steelDark, 14, 4);
          b.cyl(6.6, 0, 1.6, i === 0 ? C.turquoise : C.greyDark, 14, 0.6);
        });
      });
    });
    // maniglie laterali
    for (const sx of [-1, 1]) b.at({ p: [sx * 121.5, 104, 0] }, () => b.box(5, 12, 62, C.blackMatte, 2));
    // pomello del coperchio
    b.at({ p: [0, 152, 0] }, () => {
      b.box(72, 4, 20, C.blackMatte, 1.6);
      b.at({ p: [0, 5, 0] }, () => b.box(60, 8, 12, C.blackMatte, 3));
    });
    powerCord(b, 70, 34, -75);
  });
  A.glass.at({ s: MM }, () => {
    A.glass.loft([ringR(132.2, 238, 148, 14), ringR(146, 232, 142, 18), ringR(151, 220, 130, 20)], C.white, { capEnd: true });
  });
  g.at({ s: MM }, () => {
    g.at({ p: [0, 62, 77.5] }, () => {
      const c = px(panel, PW, PH, 87, 52);
      disp = A.glowPart(() => g.at({ p: [c[0], c[1], 0] }, () => g.plate(86, 40.7, DISPLAY, atlasRect('dUltra'))));
      for (const bx of [196, 250, 304]) {
        const p = px(panel, PW, PH, bx, 64);
        leds.push(A.glowPart(() => g.withPlainUv('led', () => g.at({ p: [p[0], p[1], 1.75] }, () => g.disc(1.7, OFF, undefined, 8)))));
      }
    });
  });
  let on = 0;
  let t = 0;
  const model = A.finish('ultrasonic-t1', (dt, active) => {
    t += dt;
    on = approach(on, active ? 1 : 0, dt, 0.12);
    const d = 0.1 + on * 1.3;
    A.setGlow(disp, d, d, d);
    A.setGlow(leds[0] as GlowRange, on * 0.3, on * 3, on * 1.2);
    A.setGlow(leds[1] as GlowRange, on * 0.6, on * 1.6, on * 3);
    A.setGlow(leds[2] as GlowRange, on * 3, on * 1.1, 0);
    // vibrazione appena percettibile
    const amp = on * 0.00022;
    const jx = Math.sin(t * 311) * amp;
    const jz = Math.cos(t * 277) * amp;
    const kids = model.root.children;
    for (let i = 0; i < kids.length; i++) (kids[i] as THREE.Object3D).position.set(jx, Math.abs(jx) * 0.3, jz);
  });
  return model;
}

// ------------------------------------------------------------------ microscopio stereo
export function buildMicroscope(): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let ring: GlowRange = { start: 0, end: 0 };
  let pilot: GlowRange = { start: 0, end: 0 };
  b.at({ s: MM }, () => {
    const enamel = mat(0xece8dc, 0.3, 0);
    const OZ = 22; // asse ottico
    feet(b, 220, 180, 9, 5);
    b.loft([ringR(4, 252, 212, 22), ringR(6.5, 258, 218, 25), ringR(15, 258, 218, 25), ringR(18, 252, 212, 22)], enamel, { capStart: true, capEnd: true });
    // tappetino di lavoro e piattello
    b.at({ p: [0, 18.6, OZ + 8] }, () => b.box(176, 1.6, 132, C.rubber, 0.6));
    b.at({ p: [0, 19.4, OZ] }, () =>
      b.lathe(
        [
          [47, 0],
          [47, 1.4],
          [45.5, 2.2],
          [0, 2.2],
        ],
        mat(0xf4f4f0, 0.2, 0),
        { segs: 28 },
      ),
    );
    for (const sx of [-1, 1]) {
      b.sweep(
        [
          [sx * 62, 20.4, OZ - 8],
          [sx * 58, 24, OZ - 6],
          [sx * 44, 23, OZ],
          [sx * 30, 22, OZ + 3],
        ],
        [
          [0.4, 3],
          [-0.4, 3],
          [-0.4, -3],
          [0.4, -3],
        ],
        C.steel,
        { caps: true, up: [0, 1, 0], flat: true },
      );
      b.at({ p: [sx * 62, 19.4, OZ - 8] }, () => b.cyl(3.4, 0, 3, C.steelDark, 8, 0.6));
    }
    // colonna cromata
    b.at({ p: [0, 0, -84] }, () => {
      b.lathe(
        [
          [24, 18],
          [24, 22],
          [20, 34],
          [16, 38],
          [13, 38, C.chrome],
          [13, 336],
          [14.5, 336, C.blackMatte],
          [14.5, 342],
          [12, 345],
          [0, 345],
        ],
        C.blackMatte,
        { segs: 18, crease: 40 },
      );
      // collare di sicurezza
      b.lathe(
        [
          [13.2, 196],
          [19, 196],
          [19, 208],
          [13.2, 208],
        ],
        C.blackMatte,
        { segs: 16 },
      );
      b.at({ p: [19, 202, 0], r: [0, 0, -HALF_PI] }, () => knob(b, 4.5, 9, C.steelDark, { flutes: 8 }));
    });
    // carrello di messa a fuoco + braccio
    b.at({ p: [0, 248, -80] }, () => b.loft([ringE(-36, 30, 32, 14, 3.4), ringE(-32, 33, 35, 14, 3.4), ringE(32, 33, 35, 14, 3.4), ringE(36, 30, 32, 14, 3.4)], enamel, { capStart: true, capEnd: true }));
    b.at({ p: [0, 244, -32] }, () => b.box(46, 44, 76, enamel, 8));
    for (const sx of [-1, 1]) {
      b.at({ p: [sx * 33, 250, -80], r: [0, 0, -sx * HALF_PI] }, () => {
        b.cyl(8, 0, 6, C.steelDark, 12);
        b.at({ p: [0, 5, 0] }, () => knob(b, 18, 16, C.black, { flutes: 20 }));
        b.at({ p: [0, 21, 0] }, () => knob(b, 9, 9, C.greyDark, { flutes: 12 }));
      });
    }
    // testa ottica
    b.at({ p: [0, 0, OZ] }, () => {
      // anello di supporto
      b.lathe(
        [
          [31, 222],
          [37, 223],
          [37, 247],
          [31, 248],
        ],
        C.blackMatte,
        { segs: 22 },
      );
      // corpo zoom
      b.lathe(
        [
          [22, 178, C.blackMatte],
          [26, 181],
          [26, 204],
          [30.5, 207, enamel],
          [30.5, 252],
        ],
        enamel,
        { segs: 22, crease: 40 },
      );
      b.fluted(
        [
          [33, 252],
          [33, 268],
        ],
        C.black,
        24,
        0.06,
      );
      b.lathe(
        [
          [33, 252],
          [30.5, 252],
        ],
        C.black,
        { segs: 22 },
      );
      b.lathe(
        [
          [33, 268],
          [30.5, 268, enamel],
          [30.5, 280],
        ],
        C.black,
        { segs: 22 },
      );
      // lente obiettivo
      b.lathe(
        [
          [0, 181],
          [18, 180, C.glassDark],
          [21.5, 178.4, C.blackMatte],
          [22, 178],
        ],
        C.glassDark,
        { segs: 22, crease: 60 },
      );
      // anello LED
      b.lathe(
        [
          [28, 162],
          [28, 160.5],
          [45, 160.5],
          [46.5, 162],
          [46.5, 176],
          [44, 179],
          [28, 179],
          [28, 162],
        ],
        C.blackMatte,
        { segs: 26, crease: 40 },
      );
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        b.at({ p: [Math.cos(a) * 46, 171, Math.sin(a) * 46], r: [0, -a, -HALF_PI] }, () => knob(b, 2.6, 7, C.steelDark, { flutes: 8 }));
      }
      // corpo prismi
      b.loft([ringE(280, 30.5, 30.5, 16), ringE(286, 38, 31, 16, 2.6, 0, 2), ringE(306, 43, 31, 16, 3, 0, 4), ringE(318, 40, 27, 16, 3, 0, 5), ringE(322, 34, 22, 16, 3, 0, 5)], enamel, { capEnd: true });
      // oculari inclinati verso l'operatore
      for (const sx of [-1, 1]) {
        b.at({ p: [sx * 17, 308, 22], r: [0.82, 0, sx * -0.07] }, () => {
          b.lathe(
            [
              [13.5, -4, enamel],
              [13.5, 12],
              [11.5, 14, C.blackMatte],
              [11.5, 30],
            ],
            enamel,
            { segs: 16, crease: 40 },
          );
          b.fluted(
            [
              [12.6, 30],
              [12.6, 39],
            ],
            C.black,
            16,
            0.07,
          );
          b.lathe(
            [
              [12.4, 39],
              [11.5, 40],
              [12.5, 48, C.rubber],
              [15.5, 56],
              [16.2, 58],
              [15, 58],
              [11.5, 50],
              [10.5, 47, C.glassDark],
              [0, 46],
            ],
            C.rubber,
            { segs: 16, crease: 50 },
          );
        });
      }
    });
    // alimentatore dell'anello LED + cavo
    b.at({ p: [-92, 26, -74] }, () => {
      b.box(36, 16, 26, C.blackMatte, 3);
      b.at({ p: [-6, 8, 0] }, () => knob(b, 6, 7, C.greyDark, { flutes: 12, pointer: C.white }));
    });
    cable(
      b,
      spline(
        [
          [-33, 170, OZ - 33],
          [-56, 150, -20],
          [-78, 90, -52],
          [-88, 46, -70],
          [-90, 34, -72],
        ],
        14,
      ),
      1.6,
      C.blackMatte,
      5,
    );
  });
  g.at({ s: MM }, () => {
    ring = A.glowPart(() =>
      g.withPlainUv('lens', () =>
        g.at({ p: [0, 160.3, 22] }, () =>
          g.lathe(
            [
              [30.5, 0],
              [43, 0],
            ],
            OFF,
            { segs: 26 },
          ),
        ),
      ),
    );
    pilot = A.glowPart(() => g.withPlainUv('led', () => g.at({ p: [-84, 34.2, -68], r: [-HALF_PI, 0, 0] }, () => g.disc(1.6, OFF, undefined, 8))));
  });
  let on = 0;
  return A.finish('microscope-t1', (dt, active) => {
    on = approach(on, active ? 1 : 0, dt, 0.08);
    A.setGlow(ring, on * 5.2, on * 5.4, on * 5.8);
    A.setGlow(pilot, on * 0.4, on * 3, on * 0.9);
  });
}

// ------------------------------------------------------------------ programmatore di chip
/** Cavo flat arancione lungo un percorso, con piccolo connettore/PCB all'estremità. */
function flexCable(b: Builder, pts: readonly P3[], width: number, up: P3, tabRotY: number): void {
  const path = spline(pts, 14);
  b.sweep(
    path,
    [
      [0.18, width / 2],
      [-0.18, width / 2],
      [-0.18, -width / 2],
      [0.18, -width / 2],
    ],
    C.flex,
    { caps: true, up, flat: true },
  );
  const end = path[path.length - 1] as P3;
  b.at({ p: [end[0], end[1] + 0.5, end[2]], r: [0, tabRotY, 0] }, () => {
    b.box(width + 3, 1.0, 9, mat(0x0f6b46, 0.5, 0.1), 0.2);
    b.at({ p: [0, 0.56, 0], r: [-HALF_PI, 0, 0] }, () => b.plate(width + 2.6, 8.6, C.pcb, atlasRect('pcb')));
    b.at({ p: [0, 1.5, -1] }, () => b.box(width, 1.6, 3, C.cream, 0.3));
    b.at({ p: [0, 1.3, 1.2] }, () => b.box(width - 1, 0.5, 1, C.gold, 0.1));
  });
}

function fpcSocket(b: Builder, w: number): void {
  b.box(w, 3.2, 5.2, C.cream, 0.5);
  b.at({ p: [0, 1.2, 1.4] }, () => b.box(w - 2, 1.2, 2.6, C.blackMatte, 0.2));
  b.at({ p: [0, -1.2, -2.9] }, () => b.box(w - 1.5, 0.8, 1.2, C.gold, 0.1));
}

export function buildProgrammer(): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let lcd: GlowRange = { start: 0, end: 0 };
  let led1: GlowRange = { start: 0, end: 0 };
  let led2: GlowRange = { start: 0, end: 0 };
  b.at({ s: MM }, () => {
    const body = mat(0x2b2f36, 0.42, 0);
    feet(b, 74, 44, 3.5, 2.4);
    b.loft([ringR(2, 90, 60, 6), ringR(4, 94, 64, 8), ringR(19, 94, 64, 8), ringR(22, 90, 60, 6)], body, { capStart: true, capEnd: true });
    b.loft([ringR(10, 94.6, 64.6, 8), ringR(12.4, 94.6, 64.6, 8)], C.yellow);
    // display e tastiera a membrana
    b.at({ p: [-15, 22.5, -11] }, () => b.box(54, 1.4, 32, C.blackGloss, 0.5));
    b.at({ p: [-15, 22.06, 18], r: [-HALF_PI, 0, 0] }, () => b.plate(54, 18.7, C.print, atlasRect('progPanel')));
    // zoccoli / connettori FPC
    [-19, -6, 7].forEach((z, i) => b.at({ p: [30, 23.6, z] }, () => fpcSocket(b, 20 - i * 3)));
    b.at({ p: [30, 22.1, 21], r: [-HALF_PI, 0, 0] }, () => b.plate(22, 10, C.pcb, atlasRect('pcb')));
    b.at({ p: [24, 23.2, 21] }, () => b.box(7, 2.2, 7, C.blackMatte, 0.4));
    // cavetti flat
    flexCable(
      b,
      [
        [38, 24.2, -19],
        [50, 27, -21],
        [66, 16, -26],
        [82, 2.2, -32],
        [100, 1.0, -36],
      ],
      9,
      [0, 1, 0],
      HALF_PI + 0.2,
    );
    flexCable(
      b,
      [
        [37, 24.2, 7],
        [50, 26, 12],
        [62, 14, 26],
        [70, 2.2, 44],
        [76, 1.0, 62],
      ],
      6.5,
      [0, 1, 0],
      0.4,
    );
    // presa e cavo USB sul retro
    b.at({ p: [-22, 12, -32.6] }, () => b.box(11, 5, 2, C.steel, 1));
    b.at({ p: [-22, 12, -37] }, () => b.box(13, 7, 9, C.blackMatte, 2));
    cable(
      b,
      spline(
        [
          [-22, 12, -41],
          [-23, 10, -52],
          [-30, 3, -64],
          [-46, 2.2, -72],
        ],
        8,
      ),
      1.8,
      C.blackMatte,
      6,
    );
  });
  g.at({ s: MM }, () => {
    lcd = A.glowPart(() => g.at({ p: [-15, 23.3, -11], r: [-HALF_PI, 0, 0] }, () => g.plate(49, 28, DISPLAY, atlasRect('dProg'))));
    g.withPlainUv('led', () => {
      led1 = A.glowPart(() => g.at({ p: [34, 22.2, 27], r: [-HALF_PI, 0, 0] }, () => g.disc(1.3, OFF, undefined, 8)));
      led2 = A.glowPart(() => g.at({ p: [39, 22.2, 27], r: [-HALF_PI, 0, 0] }, () => g.disc(1.3, OFF, undefined, 8)));
    });
  });
  let on = 0;
  let t = 0;
  return A.finish('programmer-t1', (dt, active) => {
    t += dt;
    on = approach(on, active ? 1 : 0, dt, 0.1);
    const d = 0.12 + on * 1.25;
    A.setGlow(lcd, d, d, d);
    A.setGlow(led1, on * 0.3, on * 3, on * 0.8);
    const blink = Math.sin(t * 14) > 0 ? 1 : 0.1;
    A.setGlow(led2, on * 3 * blink, on * 1.6 * blink, 0);
  });
}

// ------------------------------------------------------------------ separatrice vetri
export function buildSeparator(): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let disp: GlowRange = { start: 0, end: 0 };
  const lights: GlowRange[] = [];
  const panel = 'sepPanel';
  const PW = 190;
  const PH = 58.8;
  b.at({ s: MM }, () => {
    const paint = mat(0xe6e3d8, 0.45, 0.25);
    const accent = mat(0x19a7a2, 0.45, 0.25);
    feet(b, 168, 236, 7, 8);
    b.at({ p: [0, 39, 0] }, () => b.box(200, 62, 270, paint, 5));
    b.loft([ringR(62, 201, 271, 5), ringR(66, 201, 271, 5)], accent);
    b.at({ p: [0, 39, 135.1] }, () => {
      b.plate(PW, PH, C.print, atlasRect(panel));
      [186, 246, 306].forEach((bx) => {
        const p = px(panel, PW, PH, bx, 66);
        b.at({ p: [p[0], p[1], 0] }, () => rocker(b, 10, 15, C.blackGloss));
      });
    });
    // piano riscaldato forato con cornice in silicone
    b.at({ p: [0, 71.5, 16] }, () => b.box(182, 4, 226, accent, 1.4));
    b.at({ p: [0, 76, 16] }, () => b.box(170, 6, 214, C.alu, 1));
    b.at({ p: [0, 79.06, 16], r: [-HALF_PI, 0, 0] }, () => b.plate(160, 200, C.alu, atlasRect('perforated')));
    // vano pompa a vuoto con vacuometro
    b.at({ p: [0, 86, -116] }, () => b.box(200, 34, 38, paint, 5));
    b.at({ p: [-58, 88, -97], r: [HALF_PI, 0, 0] }, () => {
      b.lathe(
        [
          [15, 0],
          [15, 4],
          [13.4, 5.4],
          [13.4, 4.4, mat(0xf6f6f2, 0.3, 0)],
          [0, 4.4],
        ],
        C.chrome,
        { segs: 20, crease: 40 },
      );
      b.at({ p: [0, 4.9, 0] }, () => {
        b.cyl(2, 0, 0.9, C.blackMatte, 8);
        b.at({ p: [3.2, 0.3, 3.2], r: [0, -0.8, 0] }, () => b.box(11, 0.5, 1.1, C.red, 0.1));
      });
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
        b.at({ p: [Math.cos(a) * 10.8, 4.46, Math.sin(a) * 10.8], r: [0, -a, 0] }, () => b.box(2.4, 0.12, 0.7, C.blackMatte, 0.02));
      }
    });
    b.at({ p: [58, 86, -97.5], r: [0, 0, 0] }, () => b.plate(64, 24, paint, atlasRect('vents')));
    // tubo del vuoto
    b.at({ p: [20, 96, -97], r: [HALF_PI, 0, 0] }, () => b.cyl(4.2, 0, 6, C.brass, 8, 0.6));
    b.at({ p: [20, 79, -70] }, () => b.cyl(4.2, 0, 6, C.brass, 8, 0.6));
    cable(
      b,
      spline(
        [
          [20, 96, -91],
          [20, 99, -80],
          [20, 96, -72],
          [20, 85, -70],
        ],
        8,
      ),
      2.6,
      mat(0x9fe0dc, 0.25, 0),
      6,
    );
    // rocchetto del filo da taglio su staffa laterale
    b.at({ p: [-104, 44, 70] }, () => b.box(10, 6, 22, C.steelSatin, 1));
    b.at({ p: [-112, 30, 70] }, () => {
      b.cyl(2.2, 12, 62, C.steelDark, 8);
      b.lathe(
        [
          [0, 34],
          [13, 34],
          [13, 36],
          [5, 37, C.brass],
          [8.5, 38],
          [8.5, 52],
          [5, 53, mat(0x2b2f36, 0.5, 0)],
          [13, 54],
          [13, 56],
          [0, 56],
        ],
        mat(0x2b2f36, 0.5, 0),
        { segs: 16, crease: 30 },
      );
      b.at({ p: [0, 62, 0] }, () => knob(b, 4, 5, C.steelDark, { flutes: 8 }));
    });
    // filo teso sul piano fino all'impugnatura
    cable(
      b,
      [
        [-104, 75, 72],
        [-92, 80.4, 68],
        [-40, 79.9, 40],
        [40, 79.9, -4],
        [62, 83, -16],
      ],
      0.32,
      C.brass,
      3,
    );
    b.at({ p: [68, 84.6, -19], r: [HALF_PI, 0, 1.05] }, () => {
      b.lathe(
        [
          [0, -24],
          [4.4, -23],
          [5.6, -14],
          [5.2, 0],
          [5.6, 14],
          [4.4, 23],
          [0, 24],
        ],
        C.woodDark,
        { segs: 10, crease: 60 },
      );
    });
    powerCord(b, 60, 30, -135);
  });
  g.at({ s: MM }, () => {
    g.at({ p: [0, 39, 135.3] }, () => {
      const c = px(panel, PW, PH, 82, 53);
      disp = A.glowPart(() => g.at({ p: [c[0], c[1], 0] }, () => g.plate(77, 36.4, DISPLAY, atlasRect('dSep'))));
      for (const bx of [186, 246, 306]) {
        const p = px(panel, PW, PH, bx, 66);
        lights.push(A.glowPart(() => g.at({ p: [p[0], p[1] + 4.2, 3.75], r: [0.16, 0, 0] }, () => g.plate(6.4, 4.4, OFF, plain()))));
      }
    });
  });
  let on = 0;
  let t = 0;
  const model = A.finish('separator-t1', (dt, active) => {
    t += dt;
    on = approach(on, active ? 1 : 0, dt, 0.1);
    const d = 0.1 + on * 1.3;
    A.setGlow(disp, d, d, d);
    A.setGlow(lights[0] as GlowRange, on * 0.3, on * 2.8, on * 0.8);
    A.setGlow(lights[1] as GlowRange, on * 2.8, on * 0.9, 0);
    A.setGlow(lights[2] as GlowRange, on * 2.8, on * 0.2, on * 0.1);
    const amp = on * 0.00008;
    const j = Math.sin(t * 188) * amp;
    const kids = model.root.children;
    for (let i = 0; i < kids.length; i++) (kids[i] as THREE.Object3D).position.set(j, 0, 0);
  });
  return model;
}

// ------------------------------------------------------------------ tester batterie
export function buildBatteryTester(): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let disp: GlowRange = { start: 0, end: 0 };
  const leds: GlowRange[] = [];
  const slope = { p: [0, 27.2, 9] as P3, r: [-1.296, 0, 0] as P3 };
  b.at({ s: MM }, () => {
    const body = mat(0xf0efe9, 0.42, 0);
    feet(b, 116, 74, 4, 2.2);
    const outline = roundPoly(
      [
        [48, 2],
        [48, 16],
        [-30, 38],
        [-48, 38],
        [-48, 2],
      ],
      [3, 4, 4, 3, 3],
      3,
    );
    b.at({ r: [0, -HALF_PI, 0] }, () => b.extrude(outline, 140, body, { bevel: 2.2, crease: 50 }));
    // fascia corallo alla base
    b.at({ p: [0, 5, 0] }, () => b.loft([ringR(-1.6, 141, 97, 3), ringR(1.6, 141, 97, 3)], C.coral));
    b.at(slope, () => {
      b.at({ p: [-27, 0, 0.5] }, () => b.box(78, 54, 1.4, C.blackGloss, 0.6));
      b.at({ p: [41, 20, 0.1] }, () => b.plate(52, 14.6, C.print, atlasRect('battPanel')));
      [0, 1, 2].forEach((i) => {
        b.at({ p: [25 + i * 16, -14, 0], r: [HALF_PI, 0, 0] }, () => {
          b.torus(5.6, 0.8, C.greyLight, 12, 4);
          b.cyl(5, 0, 1.8, i === 0 ? C.coral : C.grey, 12, 0.6);
        });
      });
    });
    // striscia PCB con i connettori batteria
    b.at({ p: [0, 38.08, -39], r: [-HALF_PI, 0, 0] }, () => b.plate(124, 14, C.pcb, atlasRect('pcb')));
    [-44, -15, 14, 43].forEach((x, i) => b.at({ p: [x, 39.7, -39] }, () => fpcSocket(b, 16 - (i % 2) * 3)));
    // adattatore flex verso il banco
    flexCable(
      b,
      [
        [51, 40.4, -39],
        [62, 44, -36],
        [79, 34, -22],
        [86, 6, 6],
        [86, 1.0, 36],
      ],
      7,
      [0, 1, 0],
      0,
    );
    // porta USB-C laterale
    b.at({ p: [-70.2, 12, -20] }, () => b.box(1.2, 4.4, 10, C.blackMatte, 0.5));
  });
  g.at({ s: MM }, () => {
    g.at(slope, () => {
      disp = A.glowPart(() => g.at({ p: [-27, 0, 1.3] }, () => g.plate(70, 46, DISPLAY, atlasRect('dBatt'))));
      g.withPlainUv('led', () => {
        [0, 1, 2].forEach((i) => leds.push(A.glowPart(() => g.at({ p: [25 + i * 16, -1, 0.15] }, () => g.disc(1.6, OFF, undefined, 8)))));
      });
    });
  });
  let on = 0;
  let t = 0;
  return A.finish('battester-t1', (dt, active) => {
    t += dt;
    on = approach(on, active ? 1 : 0, dt, 0.1);
    const d = 0.1 + on * 1.3;
    A.setGlow(disp, d, d, d);
    A.setGlow(leds[0] as GlowRange, on * 0.3, on * 3, on * 0.8);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    A.setGlow(leds[1] as GlowRange, on * 3 * pulse, on * 2 * pulse, 0);
    A.setGlow(leds[2] as GlowRange, on * 0.25, 0, 0);
  });
}
