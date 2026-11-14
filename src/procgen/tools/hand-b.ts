/**
 * Strumenti a mano (2/2): phon / heat gun, alcol isopropilico, aria, tester USB, torcia, biadesivo,
 * bracciale ESD, saldatore a stilo. Punta di lavoro all'origine, corpo lungo +Y. Millimetri × 0.001.
 */
import { atlasRect, type UVRect } from '../textures/tools-atlas';
import { Asm, Builder, approach, mat, ringE, roundRect, spline, type LPt, type Mat, type P3, type ToolModel } from './kit';
import { C, OFF, alligator, cable, glowTint, helix } from './palette';

const MM = 0.001;
const flipUv = (r: UVRect): UVRect => [r[2], r[3], r[0], r[1]];


// ------------------------------------------------------------------ calore
export function buildHeatHand(tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let coil = { start: 0, end: 0 };
  let disp = { start: 0, end: 0 };
  let led = { start: 0, end: 0 };
  b.at({ s: MM }, () => {
    if (tier <= 1) {
      // mini phon da viaggio pieghevole, color corallo
      const body = mat(0xff7a5c, 0.36, 0);
      const accent = mat(0xfff1e0, 0.4, 0);
      b.lathe(
        [
          [0, 9],
          [14.5, 9, C.blackMatte],
          [16.2, 5],
          [17, 0],
          [18.6, 0, accent],
          [19, 1],
          [19, 9],
          [20.5, 10, body],
          [22.5, 16],
          [23, 30],
          [23, 68],
          [21.6, 76],
          [17.5, 82],
          [0, 82],
        ],
        C.blackMatte,
        { segs: 22, crease: 48 },
      );
      // griglia frontale e presa d'aria posteriore
      b.at({ p: [0, 3.2, 0], r: [Math.PI / 2, 0, 0] }, () => b.torus(16.3, 0.5, C.steelDark, 20, 4));
      b.at({ p: [0, 82.05, 0], r: [-Math.PI / 2, 0, 0] }, () => b.disc(17.2, body, atlasRect('grille'), 20));
      // anello decorativo
      b.lathe(
        [
          [23.05, 60],
          [23.4, 60.5],
          [23.4, 63.5],
          [23.05, 64],
        ],
        accent,
        { segs: 22 },
      );
      // cerniera + manico pieghevole verso +Z
      b.at({ p: [0, 50, 22], r: [0, 0, Math.PI / 2] }, () => b.cyl(8, -11.5, 11.5, accent, 14, 1.2));
      const hp: P3[] = [
        [0, 50, 24],
        [0, 53, 44],
        [0, 58, 74],
        [0, 62, 104],
      ];
      b.sweep(hp, roundRect(22, 27, 9, 3), body, { caps: true, up: [1, 0, 0], scale: (t) => 1 - t * 0.12 });
      // interruttore a slitta
      b.at({ p: [0, 43.2, 58], r: [0.16, 0, 0] }, () => {
        b.box(9, 2, 20, C.blackMatte, 0.8);
        b.at({ p: [0, -1.2, -3] }, () => b.box(7, 2.4, 8, C.turquoise, 0.8));
      });
      // pressacavo e spezzone di cavo
      b.at({ p: [0, 62, 104], r: [1.44, 0, 0] }, () =>
        b.lathe(
          [
            [5.5, -1],
            [5.5, 3],
            [4.2, 5],
            [3.2, 16],
            [0, 16],
          ],
          C.blackMatte,
          { segs: 10 },
        ),
      );
      cable(
        b,
        spline(
          [
            [0, 64, 118],
            [0, 67, 134],
            [6, 74, 148],
            [18, 80, 152],
          ],
          10,
        ),
        2.1,
        C.blackMatte,
        6,
      );
    } else {
      // heat gun professionale: bocchetta in acciaio brunito, corpo blu notte con dettagli arancio, display posteriore
      const body = mat(0x1d2c4a, 0.45, 0);
      const accent = mat(0xff7a1f, 0.45, 0);
      b.lathe(
        [
          [0, 14],
          [11.5, 14, C.blackMatte],
          [12.6, 6],
          [13, 0],
          [14.2, 0, mat(0xb08a5a, 0.32, 1)],
          [14.6, 1],
          [14.8, 12, mat(0x8f7aa8, 0.3, 1)],
          [15, 24, C.steel],
          [15, 40],
          [18, 42],
          [18, 46],
          [23, 48, accent],
          [26, 52],
          [27, 56, body],
          [31, 64],
          [32, 80],
          [32, 150],
          [30.5, 160],
          [27, 165],
          [0, 165],
        ],
        C.blackMatte,
        { segs: 24, crease: 48 },
      );
      for (const sx of [-1, 1]) {
        b.at({ p: [sx * 32.1, 104, 0], r: [0, (sx * Math.PI) / 2, Math.PI / 2] }, () => b.plate(44, 20, body, atlasRect('vents')));
      }
      // retro: presa d'aria + cornice del display
      b.at({ p: [0, 165.05, 0], r: [-Math.PI / 2, 0, 0] }, () => {
        b.disc(25, body, atlasRect('grille'), 22);
        b.at({ p: [0, 2, 0.6] }, () => b.box(33, 19, 1.6, C.blackGloss, 0.6));
      });
      // impugnatura a pistola verso +Z
      const hp: P3[] = [
        [0, 112, 26],
        [0, 116, 60],
        [0, 124, 100],
        [0, 130, 136],
      ];
      b.sweep(hp, roundRect(31, 40, 12, 3), body, { caps: true, up: [1, 0, 0], scale: (t) => 1 - 0.1 * Math.sin(t * Math.PI) });
      b.sweep(
        [
          [0, 134.5, 58],
          [0, 141, 100],
          [0, 146, 130],
        ],
        roundRect(25, 11, 5, 2),
        accent,
        { caps: true, up: [1, 0, 0] },
      );
      // grilletto e guardia
      b.at({ p: [0, 96, 50], r: [0.14, 0, 0] }, () => b.box(11, 9, 26, C.blackMatte, 3));
      // base d'appoggio / pressacavo
      b.at({ p: [0, 131, 138], r: [1.42, 0, 0] }, () => {
        b.loft([ringE(-2, 20, 24, 14, 3), ringE(4, 21, 25, 14, 3), ringE(8, 20, 24, 14, 3)], C.blackMatte, { capStart: true, capEnd: true });
        b.lathe(
          [
            [6, 8],
            [5, 12],
            [3.6, 24],
            [0, 24],
          ],
          C.blackMatte,
          { segs: 10 },
        );
      });
      // display sul retro (verso l'utente)
      disp = A.glowPart(() => g.at({ s: MM }, () => g.at({ p: [0, 166.5, -2], r: [-Math.PI / 2, 0, 0] }, () => g.plate(29, 14.5, glowTint(0x202020), atlasRect('dHeat')))));
      led = A.glowPart(() => g.at({ s: MM }, () => g.withPlainUv('led', () => g.at({ p: [0, 166.2, 15], r: [-Math.PI / 2, 0, 0] }, () => g.disc(1.6, OFF, undefined, 8)))));
    }
  });
  // resistenza incandescente dentro la bocchetta
  coil = A.glowPart(() =>
    g.at({ s: MM }, () =>
      g.at({ p: [0, tier <= 1 ? 8.6 : 13.5, 0], r: [Math.PI / 2, 0, 0] }, () => {
        g.disc(tier <= 1 ? 14.4 : 11.4, OFF, atlasRect('coil'), 20);
      }),
    ),
  );
  let heat = 0;
  let on = 0;
  return A.finish(`heat-t${tier}`, (dt, active) => {
    heat = approach(heat, active ? 1 : 0, dt, active ? 1.4 : 3.5);
    on = approach(on, active ? 1 : 0, dt, 0.08);
    const h = heat * heat;
    const k = tier <= 1 ? 2.6 : 4.2;
    A.setGlow(coil, h * k, h * k * (0.1 + 0.16 * heat), h * k * 0.012 * heat);
    if (tier >= 2) {
      const d = 0.12 + on * 1.25;
      A.setGlow(disp, d, d, d);
      A.setGlow(led, on * 2.5, on * 0.25, on * 0.1);
    }
  });
}

// ------------------------------------------------------------------ alcol isopropilico
export function buildIpa(_tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    const cap = mat(0x1479b8, 0.4, 0);
    // ago dosatore in acciaio
    b.lathe(
      [
        [0, 0],
        [0.55, 0],
        [0.55, 21],
        [1.0, 21.5],
      ],
      C.steel,
      { segs: 8 },
    );
    b.lathe(
      [
        [1.0, 21],
        [2.4, 21.5],
        [2.4, 24],
        [1.8, 25],
        [2.6, 30],
      ],
      cap,
      { segs: 12 },
    );
    b.lathe(
      [
        [2.6, 30],
        [3.4, 30.6],
        [9.2, 41],
        [11.2, 43.6],
      ],
      cap,
      { segs: 16, crease: 35 },
    );
    b.fluted(
      [
        [11.6, 43.6],
        [11.6, 50],
      ],
      cap,
      20,
      0.05,
    );
    // flacone HDPE
    b.lathe(
      [
        [11.6, 50],
        [10, 50.5, C.hdpe],
        [10, 52],
        [13, 54],
        [18.2, 60],
        [19.5, 66],
        [19.5, 126],
        [18.6, 130],
        [15.5, 132],
        [0, 131],
      ],
      cap,
      { segs: 22, crease: 50 },
    );
    b.band(19.58, 72, 122, (-Math.PI * 4) / 11, (Math.PI * 15) / 11, C.print, flipUv(atlasRect('ipaLabel')), 19);
  });
  return A.finish('ipa-t1');
}

// ------------------------------------------------------------------ aria
export function buildAir(tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    if (tier <= 1) {
      // pompetta a soffietto in gomma
      const rubber = mat(0x1b1c1f, 0.78, 0);
      const red = mat(0xe0402f, 0.45, 0);
      b.lathe(
        [
          [0.9, 0],
          [1.6, 0],
          [2.1, 2],
          [3.6, 40],
          [5.2, 46],
          [6.4, 47],
          [6.4, 51],
        ],
        red,
        { segs: 12, crease: 40 },
      );
      b.lathe(
        [
          [1.0, 3],
          [0.9, 0],
        ],
        C.blackMatte,
        { segs: 8 },
      );
      b.lathe(
        [
          [6.6, 50],
          [9, 52],
          [16, 60],
          [23.5, 72],
          [27, 86],
          [26.2, 100],
          [21.5, 112],
          [14, 119],
          [9.5, 121],
          [9.5, 122],
        ],
        rubber,
        { segs: 22, crease: 60 },
      );
      for (const y of [70, 80, 90, 100]) {
        const r = y < 86 ? 23.5 + ((y - 72) / 14) * 3.5 : 27 - ((y - 86) / 14) * 0.8;
        b.at({ p: [0, y, 0] }, () => b.torus(r - 0.2, 0.9, rubber, 22, 5));
      }
      b.lathe(
        [
          [9.6, 121.5],
          [10.4, 122],
          [10.4, 125],
          [8, 126.5],
          [3, 126.5],
          [3, 125.5],
          [0, 125.5],
        ],
        red,
        { segs: 14 },
      );
    } else {
      // bomboletta con cannuccia: la cannuccia è lungo Y, la bomboletta è inclinata verso +Z
      const straw = mat(0xe33b2e, 0.3, 0);
      b.lathe(
        [
          [0.7, 0],
          [1.15, 0],
          [1.15, 96],
        ],
        straw,
        { segs: 6 },
      );
      b.at({ p: [0, 99, 5], r: [1.12, 0, 0] }, () => {
        // erogatore
        const capM = mat(0xf2f2ee, 0.4, 0);
        b.at({ p: [0, 8, 0] }, () => b.box(13, 14, 15, capM, 3));
        b.at({ p: [0, 3.5, -9], r: [-0.25, 0, 0] }, () => b.box(11, 4, 15, C.blackMatte, 1.5));
        b.at({ p: [0, 5.5, 8], r: [0.25, 0, 0] }, () => b.box(10, 3, 12, capM, 1.2));
        b.lathe(
          [
            [0, 14],
            [16, 14, C.steel],
            [17.5, 15],
            [17.5, 17.5],
            [16, 18.5],
            [18, 22, mat(0xf4f6f7, 0.35, 0)],
            [24, 31],
            [26, 37],
            [26.6, 38, C.steel],
            [26.6, 39.5],
            [26, 40, mat(0x0f5f8f, 0.35, 0.3)],
            [26, 44],
          ],
          capM,
          { segs: 24, crease: 45 },
        );
        b.lathe(
          [
            [26, 44],
            [26, 164],
            [26.6, 164.5, C.steel],
            [26.6, 167],
            [24.5, 168],
            [0, 164],
          ],
          mat(0xbfeff0, 0.35, 0.3),
          { segs: 24, crease: 45 },
        );
        b.band(26.08, 46, 162, -Math.PI / 3, (Math.PI * 4) / 3, C.print, flipUv(atlasRect('airLabel')), 20);
      });
    }
  });
  return A.finish(`air-t${tier}`);
}

// ------------------------------------------------------------------ tester USB
export function buildUsbTester(): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let disp = { start: 0, end: 0 };
  b.at({ s: MM }, () => {
    const body = mat(0x1a3f96, 0.3, 0);
    // spina USB-A
    b.at({ p: [0, 6.5, 0] }, () => b.box(12, 13, 4.5, C.steel, 0.5));
    b.at({ p: [0, 0.4, 0.6] }, () => b.box(10.6, 1.0, 1.9, C.blackMatte, 0.2));
    b.at({ p: [0, 0.5, -1.0] }, () => b.box(10.6, 1.0, 1.3, mat(0xf2f2f2, 0.4, 0), 0.2));
    for (const sx of [-1, 1]) b.at({ p: [sx * 2.9, 5.2, 2.28] }, () => b.box(2.2, 2.2, 0.1, C.blackMatte, 0.02));
    // corpo
    b.at({ p: [0, 38, 0] }, () => b.loft([xz(-25, 22, 9.5, 2.2), xz(-24, 24.5, 11.5, 3), xz(24, 24.5, 11.5, 3), xz(25, 22, 9.5, 2.2)], body, { capStart: true, capEnd: true }));
    b.at({ p: [0, 37.5, 5.8] }, () => b.box(21.5, 17.5, 0.6, C.blackGloss, 0.25));
    b.at({ p: [0, 54.6, 5.78] }, () => b.plate(9.4, 9.4, mat(0xbfd4ff, 0.35, 0), atlasRect('usbPrint')));
    b.at({ p: [-7, 21, 5.9], r: [Math.PI / 2, 0, 0] }, () => b.cyl(2.2, 0, 0.9, C.greyLight, 10, 0.3));
    // presa USB-A femmina in testa
    b.at({ p: [0, 63.6, 0] }, () => b.box(14, 1.4, 6.6, C.steel, 0.4));
    b.at({ p: [0, 64.35, 0] }, () => b.box(12.2, 0.2, 4.8, C.blackMatte, 0.05));
    disp = A.glowPart(() => g.at({ s: MM }, () => g.at({ p: [0, 37.5, 6.12] }, () => g.plate(19.5, 14.6, glowTint(0x1c1c1c), atlasRect('dUsb')))));
  });
  let on = 0;
  return A.finish('multimeter-t1', (dt, active) => {
    on = approach(on, active ? 1 : 0, dt, 0.12);
    const d = 0.1 + on * 1.3;
    A.setGlow(disp, d, d, d);
  });
}

/** anello rettangolare arrotondato (w lungo X, d lungo Z) a quota y, convenzione loft */
function xz(y: number, w: number, d: number, r: number): P3[] {
  return roundRect(w, d, r, 3).map((p) => [p[0], y, p[1]] as P3);
}

// ------------------------------------------------------------------ torcia a penna
export function buildFlashlight(_tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let lens = { start: 0, end: 0 };
  b.at({ s: MM }, () => {
    const body = mat(0x117a80, 0.36, 1);
    b.lathe(
      [
        [0, 5.5],
        [2.2, 5.5, C.chrome],
        [5.6, 1.2],
        [5.6, 0],
        [6.6, 0, C.steelDark],
        [6.9, 0.6],
        [6.9, 3],
        [6.5, 3.6, body],
        [6.5, 6],
        [6.9, 6.5],
        [6.9, 9],
        [6.5, 9.5],
        [6.5, 11.5],
        [6.9, 12],
        [6.9, 14.5],
        [6.5, 15],
        [5.6, 19],
        [5.6, 28],
      ],
      C.chrome,
      { segs: 18, crease: 35 },
    );
    b.fluted(
      [
        [5.75, 28],
        [5.75, 74],
      ],
      body,
      22,
      0.07,
    );
    b.lathe(
      [
        [5.6, 74],
        [5.6, 100],
        [5.1, 100.5, C.steelDark],
        [5.1, 101.5],
        [5.9, 102, body],
        [5.9, 113],
        [5.3, 114.5],
        [3.6, 114.8, mat(0xff7a2b, 0.7, 0)],
        [3.4, 117],
        [2.2, 118.2],
        [0, 118.4],
      ],
      body,
      { segs: 18, crease: 40 },
    );
    // clip tascabile
    b.sweep(
      [
        [0, 108, 5.4],
        [0, 107, 7.2],
        [0, 96, 7.6],
        [0, 70, 7.4],
        [0, 60, 6.3],
        [0, 56, 6.9],
      ],
      [
        [0.35, 2.4],
        [-0.35, 2.4],
        [-0.35, -2.4],
        [0.35, -2.4],
      ],
      C.steel,
      { caps: true, up: [0, 0, 1], flat: true },
    );
    b.at({ p: [0, 107.5, 0] }, () => b.torus(5.95, 0.5, C.steel, 18, 4));
    lens = A.glowPart(() => g.at({ s: MM }, () => g.withPlainUv('lens', () => g.at({ p: [0, 2.2, 0], r: [Math.PI / 2, 0, 0] }, () => g.disc(4.6, OFF, undefined, 14)))));
  });
  let on = 0;
  return A.finish('flashlight-t1', (dt, active) => {
    on = approach(on, active ? 1 : 0, dt, 0.05);
    A.setGlow(lens, on * 6, on * 5.6, on * 4.6);
  });
}

// ------------------------------------------------------------------ biadesivo
export function buildAdhesive(tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    if (tier <= 1) {
      const liner = mat(0xd8382c, 0.4, 0);
      const side = mat(0xb82e24, 0.55, 0);
      const R = 17.5;
      // lembo libero che scende fino all'origine
      b.at({ p: [0, 13, 0] }, () => b.box(6, 26, 0.16, liner, 0.02));
      b.at({ p: [0, 13, -0.1] }, () => b.box(6, 26, 0.05, mat(0xf4efe2, 0.25, 0), 0.01));
      b.at({ p: [0, 12, 0.1], r: [0, 0, Math.PI / 2] }, () => b.plate(20, 2.6, mat(0xffd9d2, 0.4, 0), atlasRect('tapeCore')));
      // rotolo (asse X)
      b.at({ p: [0, 26, R], r: [0, 0, Math.PI / 2] }, () => {
        const prof: LPt[] = [[9.6, -3, side]];
        for (let i = 0; i < 5; i++) {
          const r0 = 9.6 + (i / 5) * (R - 9.6);
          const r1 = 9.6 + ((i + 1) / 5) * (R - 9.6);
          prof.push([r0 + 0.35, -3.05], [r1 - 0.35, -3.05], [r1, -2.9]);
        }
        prof.push([R, -3, liner], [R, 3, side]);
        for (let i = 4; i >= 0; i--) {
          const r0 = 9.6 + (i / 5) * (R - 9.6);
          const r1 = 9.6 + ((i + 1) / 5) * (R - 9.6);
          prof.push([r1 - 0.35, 3.05], [r0 + 0.35, 3.05], [r0, 2.9]);
        }
        b.lathe(prof, side, { segs: 26, crease: 30 });
        // anima in plastica bianca
        b.lathe(
          [
            [9.6, -3.6],
            [9.6, 3.6],
            [8.2, 3.6],
            [8.2, -3.6],
            [9.6, -3.6],
          ],
          C.white,
          { segs: 26 },
        );
      });
    } else {
      // tubetto di adesivo con ago + busta di guarnizioni pretagliate
      b.lathe(
        [
          [0, 0],
          [0.6, 0],
          [0.6, 11],
          [1.2, 11.5, C.blackMatte],
          [2.6, 22],
          [4.2, 24],
          [4.2, 28],
          [5, 28.5, C.steelDark],
          [5, 31],
        ],
        C.steel,
        { segs: 10, crease: 40 },
      );
      const tubeM = mat(0xf2f2ee, 0.32, 0.15);
      b.loft(
        [ringE(31, 5, 5, 14), ringE(32, 8.2, 8.2, 14), ringE(40, 8.6, 8.4, 14), ringE(70, 10.5, 5.6, 14), ringE(90, 12.2, 2.2, 14), ringE(96, 12.6, 0.5, 14), ringE(96, 12.6, 0.5, 14), ringE(101, 12.6, 0.45, 14)],
        [C.blackMatte, C.blackMatte, tubeM, tubeM, tubeM, tubeM, C.alu, C.alu],
        { capEnd: true },
      );
      b.loft([ringE(38, 8.75, 8.55, 14), ringE(41, 8.8, 8.5, 14)], mat(0xc33b2e, 0.35, 0));
      b.at({ p: [0, 60, 6.75], r: [0.085, 0, 0] }, () => b.at({ r: [0, 0, Math.PI / 2] }, () => b.plate(24, 10, C.print, atlasRect('tubeLabel'))));
      // busta
      b.at({ p: [26, 62, -7], r: [0, 0, -0.16] }, () => {
        b.extrude(roundRect(52, 84, 2.5, 3), 1.1, mat(0xf6f8f9, 0.22, 0.25), { bevel: 0.45, uvFront: atlasRect('bagPrint'), crease: 60 });
        b.at({ p: [0, 36.5, 0.4] }, () => b.box(52, 2.2, 1.6, mat(0xc33b2e, 0.4, 0), 0.5));
      });
    }
  });
  return A.finish(`adhesive-t${tier}`);
}

// ------------------------------------------------------------------ bracciale antistatico
function glove(b: Builder, base: Mat, tips: Mat, cuff: Mat): void {
  // palmo nel piano XY (dita verso +Y), spessore lungo Z
  b.loft([ringE(-24, 17, 5.5, 12, 3), ringE(-12, 17.5, 6, 12, 3), ringE(-11.9, 17.5, 6, 12, 3), ringE(-4, 19, 6.5, 12, 3)], [cuff, cuff, base, base], { capStart: true });
  for (let i = 0; i < 3; i++) b.at({ p: [0, -21 + i * 3.6, 0] }, () => b.loft([ringE(-0.7, 17.4, 5.9, 12, 3), ringE(0.7, 17.4, 5.9, 12, 3)], mat(0xe2b100, 0.9, 0)));
  b.loft([ringE(-4, 19, 6.5, 12, 3), ringE(20, 21, 7, 12, 3.2), ringE(44, 21.5, 6.2, 12, 3.4), ringE(50, 20.5, 5.4, 12, 3.4)], base, { capEnd: true });
  const fingers: [number, number, number][] = [
    [-15.5, 34, 0.1],
    [-5.2, 41, 0.03],
    [5.2, 38, -0.04],
    [15.2, 29, -0.12],
  ];
  for (const [x, len, tilt] of fingers) {
    b.at({ p: [x, 47, 0], r: [0, 0, tilt] }, () => {
      b.loft([ringE(0, 5.1, 4.9, 6), ringE(len * 0.62, 4.8, 4.5, 6), ringE(len * 0.62, 4.8, 4.5, 6), ringE(len * 0.9, 4.4, 4.0, 6), ringE(len, 2.6, 2.4, 6)], [base, base, tips, tips, tips], { capEnd: true });
    });
  }
  b.at({ p: [21, 12, 1], r: [0, 0, -0.75] }, () => {
    b.loft([ringE(0, 6.4, 5.6, 7), ringE(20, 5.4, 4.8, 7), ringE(20, 5.4, 4.8, 7), ringE(31, 4.6, 4.1, 7), ringE(34, 2.6, 2.4, 7)], [base, base, tips, tips, tips], { capEnd: true });
  });
}

export function buildEsd(tier: number): ToolModel {
  const A = new Asm();
  const b = A.main;
  b.at({ s: MM }, () => {
    const cord = mat(0x18191b, 0.55, 0);
    alligator(b, mat(0x1b1c1f, 0.6, 0));
    cable(
      b,
      [
        [0, 33, 0],
        [0, 40, 0],
        [1.5, 43, 0],
        [3.4, 45, 0],
      ],
      1.0,
      cord,
      5,
    );
    // cavo a spirale
    b.at({ p: [0, 45, 0] }, () => b.sweep(helix(0, 52, 3.4, 12, 8), 1.05, cord, { sides: 4 }));
    cable(
      b,
      [
        [3.4, 97, 0],
        [1.5, 99.5, 0],
        [0, 102, 0],
        [0, 108, 0],
      ],
      1.0,
      cord,
      5,
    );
    // bottone a pressione + piastrina
    b.lathe(
      [
        [0, 106],
        [3.6, 106],
        [4.6, 108],
        [4.6, 112],
        [0, 112],
      ],
      C.blackMatte,
      { segs: 10 },
    );
    b.at({ p: [0, 114.2, 0] }, () => b.box(22, 2.2, 15, C.steel, 0.9));
    b.at({ p: [0, 112.4, 0] }, () => b.cyl(4.2, 0, 1.2, C.chrome, 10, 0.3));
    // fascia elastica (anello chiuso nel piano XY)
    const loop: P3[] = [];
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      loop.push([Math.cos(a) * 31, 144 + Math.sin(a) * 28, 0]);
    }
    const band = mat(0x1f5fc0, 0.92, 0);
    b.sweep(loop, roundRect(2.0, 19, 0.9, 1), band, { loop: true, up: [0, -1, 0] });
    const stripe: P3[] = loop.map((p) => [(p[0] / 31) * 31.9, 144 + ((p[1] - 144) / 28) * 28.9, 0] as P3);
    b.sweep(
      stripe,
      [
        [0.3, 2.2],
        [-0.3, 2.2],
        [-0.3, -2.2],
        [0.3, -2.2],
      ],
      mat(0xffd21f, 0.9, 0),
      { loop: true, up: [0, -1, 0] },
    );
    // fibbia di regolazione
    b.at({ p: [0, 172.6, 0] }, () => b.box(13, 3.4, 22, C.black, 1.2));
    if (tier >= 2) {
      const base = mat(0xdfe2e4, 0.95, 0);
      const tips = mat(0x2c2e33, 0.85, 0);
      const cuff = mat(0xc7cbce, 0.95, 0);
      b.at({ p: [70, 62, -5], r: [0, 0, 0.42] }, () => b.at({ s: [-1, 1, 1] }, () => glove(b, base, tips, cuff)));
      b.at({ p: [104, 108, 4], r: [0, 0, -0.1] }, () => glove(b, base, tips, cuff));
    }
  });
  return A.finish(`esd-t${tier}`);
}

// ------------------------------------------------------------------ saldatore a stilo + supporto
export function buildSolderIron(): ToolModel {
  const A = new Asm();
  const b = A.main;
  const g = A.glow;
  let hot = { start: 0, end: 0 };
  let led = { start: 0, end: 0 };
  b.at({ s: MM }, () => {
    const grip = mat(0x14a3a6, 0.6, 0);
    // punta conica stagnata
    b.lathe(
      [
        [0, 0],
        [0.35, 0.2],
        [1.9, 13],
        [2.2, 16],
        [2.2, 19],
      ],
      mat(0xd7dade, 0.22, 1),
      { segs: 10, crease: 40 },
    );
    // canna in acciaio con dado di bloccaggio e fori
    b.lathe(
      [
        [2.9, 21.5],
        [3.4, 22],
        [3.4, 27],
        [2.9, 27.5],
      ],
      C.steelDark,
      { segs: 6, crease: 20 },
    );
    b.lathe(
      [
        [2.9, 27.5],
        [2.9, 62],
        [4.2, 63],
      ],
      mat(0xb9ab98, 0.3, 1),
      { segs: 12 },
    );
    for (let i = 0; i < 3; i++) b.at({ p: [0, 34 + i * 7, 0] }, () => b.torus(2.95, 0.22, C.steelDark, 10, 3));
    // paracalore + impugnatura
    b.lathe(
      [
        [4.2, 62],
        [9.4, 63],
        [9.8, 64],
        [9.8, 66],
        [7.6, 67.5],
        [7.2, 70, grip],
        [8.6, 78],
        [9.2, 92],
        [8.6, 110],
        [8.0, 114, C.black],
        [8.0, 150],
        [6.6, 160],
        [5.0, 164],
        [4.4, 166],
        [3.6, 184],
        [0, 184],
      ],
      C.black,
      { segs: 16, crease: 40 },
    );
    for (let i = 0; i < 5; i++) b.at({ p: [0, 80 + i * 6.5, 0] }, () => b.torus(8.75 + (i === 2 ? 0.25 : i === 1 || i === 3 ? 0.18 : 0), 0.55, mat(0x0f8f92, 0.6, 0), 14, 4));
    for (let i = 0; i < 4; i++) b.at({ p: [0, 167 + i * 4.2, 0] }, () => b.torus(4.3 - i * 0.2, 0.5, C.blackMatte, 8, 4));
    cable(
      b,
      spline(
        [
          [0, 183, 0],
          [0, 198, 1],
          [4, 212, 4],
          [14, 222, 6],
        ],
        10,
      ),
      2.0,
      C.blackMatte,
      6,
    );
    hot = A.glowPart(() =>
      g.at({ s: MM }, () =>
        g.withPlainUv('led', () =>
          g.lathe(
            [
              [2.25, 18.8],
              [2.5, 19.2],
              [2.5, 21.6],
            ],
            OFF,
            { segs: 10 },
          ),
        ),
      ),
    );
    led = A.glowPart(() => g.at({ s: MM }, () => g.withPlainUv('led', () => g.at({ p: [0, 122, 8.05] }, () => g.disc(1.3, OFF, undefined, 8)))));
  });

  // supporto separato (mesh "stand"): base in lamiera, portasaldatore a molla, spugnetta
  const sb = new Builder();
  sb.at({ s: MM }, () => {
    const paint = mat(0x23262b, 0.5, 0.4);
    sb.loft([xz(0, 74, 104, 8), xz(1.2, 76, 106, 9), xz(3.4, 76, 106, 9), xz(4.2, 74.5, 104.5, 8)], paint, { capStart: true, capEnd: true });
    // vaschetta + spugna
    sb.at({ p: [-15, 4.2, 26] }, () => {
      sb.loft([xz(0, 40, 44, 5), xz(6, 41, 45, 5)], paint, {});
      sb.loft([xz(1, 36.5, 40.5, 4), xz(7.6, 36.5, 40.5, 4.5), xz(8.6, 34.5, 38.5, 4)], C.sponge, {});
      sb.at({ p: [0, 8.62, 0], r: [-Math.PI / 2, 0, 0] }, () => sb.plate(34.5, 38.5, C.sponge, atlasRect('sponge')));
      
    });
    // montante + molla conica inclinata
    sb.at({ p: [16, 4, -30] }, () => {
      sb.cyl(3.2, 0, 26, C.steelDark, 10, 0.5);
      sb.at({ p: [0, 26, 0], r: [1.02, 0, 0] }, () => {
        sb.cyl(4.6, -4, 4, C.steelDark, 10, 0.8);
        sb.sweep(helix(2, 62, 8.5, 8, 12, 13.5), 1.15, C.steel, { sides: 3 });
        sb.torus(8.5, 1.1, C.steel, 12, 4);
      });
    });
    for (const [x, z] of [
      [-30, -44],
      [30, -44],
      [-30, 44],
      [30, 44],
    ] as const) {
      sb.at({ p: [x, -1.6, z] }, () => sb.cyl(4, 0, 1.8, C.rubber, 8));
    }
  });
  const stand = A.extra(sb, 'main', 'stand');
  // nel sistema dello strumento "sopra" per il supporto è +Z (lo strumento è mostrato sdraiato)
  stand.position.set(0.085, 0.07, 0);
  stand.rotation.x = Math.PI / 2;

  let heat = 0;
  return A.finish('solder-t1', (dt, active) => {
    heat = approach(heat, active ? 1 : 0, dt, active ? 1.8 : 4);
    const h = heat * heat;
    A.setGlow(hot, h * 3.4, h * (0.3 + heat * 0.35), h * 0.03);
    A.setGlow(led, active ? 2.4 : 0.0, active ? 0.5 : 0.0, 0.05 * heat);
  });
}
