/**
 * Texture procedurali (canvas 2D) per bancarella/chiosco/negozio e decorazioni.
 * Tutte in scala di grigi "di dettaglio": il colore arriva dai vertex color delle mesh,
 * così un solo atlante serve decine di materiali diversi con un unico draw call.
 * Generate una volta per `textureScale` e tenute in cache a livello di modulo.
 */
import * as THREE from 'three';
import { RNG } from '../../core/rng';

/** Tessere dell'atlante 4×4 (venatura/fibre sempre lungo U). */
export const TILE = {
  plain: 0,
  wood: 1,
  woodFine: 2,
  bamboo: 3,
  thatch: 4,
  rattan: 5,
  fabric: 6,
  plaster: 7,
  rope: 8,
  leaf: 9,
  paper: 10,
  brushed: 11,
  stone: 12,
  terracotta: 13,
  mat: 14,
  coir: 15,
} as const;
export type Tile = (typeof TILE)[keyof typeof TILE];

export interface PropTextures {
  /** atlante 4×4 per piccoli oggetti (UV dentro la tessera, nessun repeat) */
  atlas: THREE.CanvasTexture;
  /** legno grezzo ripetibile (≈1 m per ripetizione) */
  wood: THREE.CanvasTexture;
  /** paglia ripetibile (fibre lungo V) */
  thatch: THREE.CanvasTexture;
  /** intonaco ripetibile */
  plaster: THREE.CanvasTexture;
  /** tela ripetibile */
  fabric: THREE.CanvasTexture;
}

type Ctx = CanvasRenderingContext2D;

function mk(size: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d') as Ctx;
  return [cv, c];
}

/** Nuvole di rumore a bassa frequenza moltiplicate sopra il contenuto (ripetibili). */
function cloud(c: Ctx, S: number, rng: RNG, res: number, alpha: number, lo = 150): void {
  const [n, nc] = mk(res);
  const img = nc.createImageData(res, res);
  for (let i = 0; i < res * res; i++) {
    const v = lo + Math.floor(rng.next() * (255 - lo));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  nc.putImageData(img, 0, 0);
  const pat = c.createPattern(n, 'repeat');
  if (!pat) return;
  pat.setTransform(new DOMMatrix().scale(S / res));
  c.save();
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.globalAlpha = alpha;
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = pat;
  c.fillRect(0, 0, S, S);
  c.restore();
}

/** Esegue `fn` con le traslazioni necessarie a rendere ripetibile un tratto vicino ai bordi. */
function wrap(c: Ctx, S: number, x: number, y: number, pad: number, fn: () => void): void {
  const xs = x < pad ? [0, S] : x > S - pad ? [0, -S] : [0];
  const ys = y < pad ? [0, S] : y > S - pad ? [0, -S] : [0];
  for (const dx of xs)
    for (const dy of ys) {
      c.save();
      c.translate(dx, dy);
      fn();
      c.restore();
    }
}

function gray(v: number, a = 1): string {
  const g = Math.round(v * 255);
  return `rgba(${g},${g},${g},${a})`;
}

function paintWood(c: Ctx, S: number, rng: RNG, fine: boolean): void {
  const k = S / 512;
  c.fillStyle = fine ? gray(0.87) : gray(0.83);
  c.fillRect(0, 0, S, S);
  const bands = fine ? 10 : 18;
  for (let i = 0; i < bands; i++) {
    const y = rng.next() * S;
    const h = S * rng.range(0.02, 0.1);
    c.fillStyle = rng.chance(0.6) ? `rgba(60,40,25,${rng.range(0.04, fine ? 0.08 : 0.2)})` : `rgba(255,250,240,${rng.range(0.03, 0.1)})`;
    c.fillRect(0, y, S, h);
    c.fillRect(0, y - S, S, h);
  }
  const lines = Math.round((fine ? 110 : 170) * Math.sqrt(k) * (S > 600 ? 1.5 : 1));
  for (let i = 0; i < lines; i++) {
    const y0 = rng.next() * S;
    const a1 = S * rng.range(0.003, fine ? 0.01 : 0.02);
    const a2 = S * rng.range(0.001, 0.008);
    const p1 = rng.next() * 6.283;
    const p2 = rng.next() * 6.283;
    const f1 = rng.int(1, 2);
    const f2 = rng.int(3, 6);
    const dark = rng.chance(0.8);
    c.strokeStyle = dark ? `rgba(45,30,18,${rng.range(0.08, fine ? 0.2 : 0.46)})` : `rgba(255,248,235,${rng.range(0.06, 0.26)})`;
    c.lineWidth = k * rng.range(0.6, fine ? 1.4 : 2.4);
    for (const oy of [-S, 0, S]) {
      const yy = y0 + oy;
      if (yy < -S * 0.04 || yy > S * 1.04) continue;
      c.beginPath();
      for (let s = 0; s <= 32; s++) {
        const x = (s / 32) * S;
        const t = (s / 32) * 6.283;
        const y = yy + Math.sin(t * f1 + p1) * a1 + Math.sin(t * f2 + p2) * a2;
        if (s === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  }
  if (!fine) {
    const knots = rng.int(2, 4);
    for (let i = 0; i < knots; i++) {
      const x = rng.range(0.1, 0.9) * S;
      const y = rng.range(0.1, 0.9) * S;
      const rx = S * rng.range(0.012, 0.03);
      for (let r = 5; r >= 1; r--) {
        c.strokeStyle = `rgba(40,25,15,${0.12 + 0.06 * (5 - r)})`;
        c.lineWidth = k * 1.5;
        c.beginPath();
        c.ellipse(x, y, rx * r * 0.5, rx * r * 0.28, 0, 0, 6.283);
        c.stroke();
      }
      c.fillStyle = 'rgba(35,22,12,0.55)';
      c.beginPath();
      c.ellipse(x, y, rx * 0.4, rx * 0.25, 0, 0, 6.283);
      c.fill();
    }
    for (let i = 0; i < 26; i++) {
      const x = rng.next() * S;
      const y = rng.next() * S;
      const len = S * rng.range(0.03, 0.14);
      c.strokeStyle = `rgba(25,15,8,${rng.range(0.2, 0.5)})`;
      c.lineWidth = k * rng.range(0.6, 1.3);
      wrap(c, S, x, y, len, () => {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + len, y + rng.range(-2, 2) * k);
        c.stroke();
      });
    }
  }
  cloud(c, S, rng, 8, 0.5, 195);
  cloud(c, S, rng, 64, 0.35, 190);
}

function paintBamboo(c: Ctx, S: number, rng: RNG): void {
  const k = S / 512;
  c.fillStyle = gray(0.9);
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 12; i++) {
    c.fillStyle = rng.chance(0.5) ? `rgba(80,60,20,${rng.range(0.03, 0.09)})` : `rgba(255,255,240,${rng.range(0.04, 0.1)})`;
    c.fillRect(rng.next() * S, 0, S * rng.range(0.04, 0.2), S);
  }
  for (let i = 0; i < 260; i++) {
    const y = rng.next() * S;
    const x = rng.next() * S;
    const len = S * rng.range(0.08, 0.5);
    c.strokeStyle = rng.chance(0.7) ? `rgba(70,50,20,${rng.range(0.05, 0.22)})` : `rgba(255,255,245,${rng.range(0.05, 0.18)})`;
    c.lineWidth = k * rng.range(0.5, 1.6);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len, y + rng.range(-1, 1) * k);
    c.stroke();
  }
  for (let i = 0; i < 90; i++) {
    c.fillStyle = `rgba(50,35,15,${rng.range(0.1, 0.35)})`;
    c.beginPath();
    c.ellipse(rng.next() * S, rng.next() * S, k * rng.range(1, 4), k * rng.range(0.6, 1.5), 0, 0, 6.283);
    c.fill();
  }
  cloud(c, S, rng, 16, 0.4, 200);
}

function paintThatch(c: Ctx, S: number, rng: RNG): void {
  const k = S / 512;
  c.fillStyle = gray(0.5);
  c.fillRect(0, 0, S, S);
  const rows = 4;
  const rowH = S / rows;
  for (let pass = 0; pass < 2; pass++) {
    for (let r = rows; r >= 0; r--) {
      const base = r * rowH - (pass === 0 ? rowH * 0.5 : 0);
      const n = Math.round(520 * (S > 600 ? 1.8 : 1));
      for (let i = 0; i < n; i++) {
        const x = rng.next() * S;
        const y = base + rng.range(-0.15, 0.25) * rowH;
        const len = rowH * rng.range(0.5, 1.05);
        const dx = rng.range(-0.1, 0.1) * len;
        const v = rng.range(0.52, 1);
        c.strokeStyle = `rgba(${Math.round(255 * v)},${Math.round(250 * v)},${Math.round(235 * v)},${rng.range(0.5, 0.95)})`;
        c.lineWidth = k * rng.range(0.8, 2.4);
        wrap(c, S, x, y + len * 0.5, len * 0.6, () => {
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + dx, y + len);
          c.stroke();
        });
      }
      // ombra sotto il bordo dello strato superiore
      const sy = base + rowH * 1.02;
      const g = c.createLinearGradient(0, sy - rowH * 0.02, 0, sy + rowH * 0.3);
      g.addColorStop(0, 'rgba(20,12,5,0.55)');
      g.addColorStop(1, 'rgba(20,12,5,0)');
      c.fillStyle = g;
      c.fillRect(0, sy - rowH * 0.02, S, rowH * 0.32);
    }
  }
  cloud(c, S, rng, 8, 0.5, 170);
}

function paintRattan(c: Ctx, S: number, rng: RNG): void {
  c.fillStyle = gray(0.45);
  c.fillRect(0, 0, S, S);
  const n = 28;
  const cell = S / n;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const horiz = (i + j) % 2 === 0;
      const x = i * cell;
      const y = j * cell;
      const g = horiz ? c.createLinearGradient(0, y, 0, y + cell) : c.createLinearGradient(x, 0, x + cell, 0);
      const v = rng.range(0.82, 1);
      g.addColorStop(0, gray(0.55 * v));
      g.addColorStop(0.3, gray(0.97 * v));
      g.addColorStop(0.7, gray(0.9 * v));
      g.addColorStop(1, gray(0.5 * v));
      c.fillStyle = g;
      if (horiz) c.fillRect(x - cell * 0.5, y + cell * 0.08, cell * 2, cell * 0.84);
      else c.fillRect(x + cell * 0.08, y - cell * 0.5, cell * 0.84, cell * 2);
    }
  cloud(c, S, rng, 16, 0.3, 200);
}

function paintFabric(c: Ctx, S: number, rng: RNG): void {
  const k = S / 512;
  c.fillStyle = gray(0.93);
  c.fillRect(0, 0, S, S);
  const step = Math.max(2, Math.round(3 * k));
  c.lineWidth = Math.max(1, k);
  for (let i = 0; i < S; i += step) {
    c.strokeStyle = `rgba(0,0,0,${rng.range(0.03, 0.1)})`;
    c.beginPath();
    c.moveTo(i + 0.5, 0);
    c.lineTo(i + 0.5, S);
    c.stroke();
    c.strokeStyle = `rgba(0,0,0,${rng.range(0.03, 0.1)})`;
    c.beginPath();
    c.moveTo(0, i + 0.5);
    c.lineTo(S, i + 0.5);
    c.stroke();
  }
  cloud(c, S, rng, 8, 0.45, 205);
  cloud(c, S, rng, 32, 0.3, 215);
}

function paintPlaster(c: Ctx, S: number, rng: RNG): void {
  const k = S / 512;
  c.fillStyle = gray(0.94);
  c.fillRect(0, 0, S, S);
  cloud(c, S, rng, 4, 0.5, 205);
  cloud(c, S, rng, 16, 0.4, 205);
  cloud(c, S, rng, 128, 0.35, 195);
  for (let i = 0; i < 160; i++) {
    const x = rng.next() * S;
    const y = rng.next() * S;
    c.fillStyle = rng.chance(0.5) ? `rgba(0,0,0,${rng.range(0.04, 0.12)})` : `rgba(255,255,255,${rng.range(0.1, 0.3)})`;
    c.beginPath();
    c.ellipse(x, y, k * rng.range(1, 5), k * rng.range(1, 3), rng.next() * 3, 0, 6.283);
    c.fill();
  }
}

function paintRope(c: Ctx, S: number, rng: RNG): void {
  c.fillStyle = gray(0.6);
  c.fillRect(0, 0, S, S);
  const n = 24;
  const w = S / n;
  for (let i = -n; i < n * 2; i++) {
    const x = i * w;
    const g = c.createLinearGradient(x, 0, x + w, 0);
    const v = rng.range(0.85, 1);
    g.addColorStop(0, gray(0.5 * v));
    g.addColorStop(0.5, gray(1 * v));
    g.addColorStop(1, gray(0.5 * v));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + w, 0);
    c.lineTo(x + w + S * 0.5, S);
    c.lineTo(x + S * 0.5, S);
    c.closePath();
    c.fill();
  }
  cloud(c, S, rng, 64, 0.3, 190);
}

function paintLeaf(c: Ctx, S: number, rng: RNG): void {
  const k = S / 512;
  c.fillStyle = gray(0.84);
  c.fillRect(0, 0, S, S);
  cloud(c, S, rng, 8, 0.4, 200);
  // nervature secondarie: partono dalla costa centrale (v = 0.5) verso i bordi, inclinate in avanti
  for (let i = 0; i < 22; i++) {
    const x = (i / 22) * S + rng.range(-3, 3) * k;
    for (const dir of [-1, 1]) {
      c.strokeStyle = `rgba(255,255,235,${rng.range(0.25, 0.5)})`;
      c.lineWidth = k * rng.range(1, 2);
      c.beginPath();
      c.moveTo(x, S * 0.5);
      c.quadraticCurveTo(x + S * 0.05, S * 0.5 + dir * S * 0.2, x + S * 0.12, S * 0.5 + dir * S * 0.5);
      c.stroke();
      c.strokeStyle = 'rgba(0,20,0,0.16)';
      c.lineWidth = k * 3;
      c.beginPath();
      c.moveTo(x + 3 * k, S * 0.5);
      c.quadraticCurveTo(x + S * 0.05 + 3 * k, S * 0.5 + dir * S * 0.2, x + S * 0.12 + 3 * k, S * 0.5 + dir * S * 0.5);
      c.stroke();
    }
  }
  const g = c.createLinearGradient(0, S * 0.47, 0, S * 0.53);
  g.addColorStop(0, 'rgba(255,255,230,0)');
  g.addColorStop(0.5, 'rgba(255,255,230,0.8)');
  g.addColorStop(1, 'rgba(255,255,230,0)');
  c.fillStyle = g;
  c.fillRect(0, S * 0.47, S, S * 0.06);
}

function paintPaper(c: Ctx, S: number, rng: RNG): void {
  const k = S / 512;
  c.fillStyle = gray(0.95);
  c.fillRect(0, 0, S, S);
  cloud(c, S, rng, 16, 0.3, 215);
  // centine (lungo V, perpendicolari all'asse U)
  const ribs = 14;
  for (let i = 0; i < ribs; i++) {
    const x = ((i + 0.5) / ribs) * S;
    const g = c.createLinearGradient(x - 5 * k, 0, x + 5 * k, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - 5 * k, 0, 10 * k, S);
  }
  for (let i = 0; i < 300; i++) {
    c.strokeStyle = `rgba(90,70,40,${rng.range(0.04, 0.14)})`;
    c.lineWidth = k * 0.7;
    const x = rng.next() * S;
    const y = rng.next() * S;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + rng.range(-10, 10) * k, y + rng.range(-10, 10) * k);
    c.stroke();
  }
}

function paintBrushed(c: Ctx, S: number, rng: RNG): void {
  const k = S / 512;
  c.fillStyle = gray(0.86);
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) {
    const y = rng.next() * S;
    const x = rng.next() * S;
    c.strokeStyle = rng.chance(0.5) ? `rgba(0,0,0,${rng.range(0.03, 0.12)})` : `rgba(255,255,255,${rng.range(0.05, 0.25)})`;
    c.lineWidth = k * rng.range(0.5, 1.2);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + S * rng.range(0.1, 0.6), y);
    c.stroke();
  }
  cloud(c, S, rng, 8, 0.25, 215);
}

function paintStone(c: Ctx, S: number, rng: RNG): void {
  const k = S / 512;
  c.fillStyle = gray(0.86);
  c.fillRect(0, 0, S, S);
  cloud(c, S, rng, 6, 0.6, 175);
  cloud(c, S, rng, 32, 0.5, 180);
  cloud(c, S, rng, 256, 0.4, 170);
  for (let i = 0; i < 220; i++) {
    c.fillStyle = `rgba(0,0,0,${rng.range(0.08, 0.3)})`;
    c.beginPath();
    c.ellipse(rng.next() * S, rng.next() * S, k * rng.range(0.8, 3), k * rng.range(0.8, 2.4), rng.next() * 3, 0, 6.283);
    c.fill();
  }
}

function paintTerracotta(c: Ctx, S: number, rng: RNG): void {
  const k = S / 512;
  c.fillStyle = gray(0.88);
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = rng.next() * S;
    c.fillStyle = rng.chance(0.5) ? `rgba(0,0,0,${rng.range(0.02, 0.08)})` : `rgba(255,255,255,${rng.range(0.03, 0.1)})`;
    c.fillRect(x, 0, k * rng.range(1, 6), S);
  }
  cloud(c, S, rng, 8, 0.55, 185);
  cloud(c, S, rng, 64, 0.3, 190);
}

function paintMat(c: Ctx, S: number, rng: RNG): void {
  c.fillStyle = gray(0.7);
  c.fillRect(0, 0, S, S);
  const rows = 64;
  const h = S / rows;
  for (let j = 0; j < rows; j++) {
    const v = rng.range(0.78, 1);
    const g = c.createLinearGradient(0, j * h, 0, (j + 1) * h);
    g.addColorStop(0, gray(0.6 * v));
    g.addColorStop(0.45, gray(1 * v));
    g.addColorStop(1, gray(0.55 * v));
    c.fillStyle = g;
    c.fillRect(0, j * h, S, h);
  }
  const cols = 8;
  for (let i = 0; i < cols; i++) {
    const x = ((i + 0.5) / cols) * S;
    for (let j = 0; j < rows; j += 2) {
      c.fillStyle = 'rgba(30,20,10,0.35)';
      c.fillRect(x - h * 0.4, j * h + (i % 2) * h, h * 0.8, h);
    }
  }
  cloud(c, S, rng, 8, 0.35, 200);
}

function paintCoir(c: Ctx, S: number, rng: RNG): void {
  const k = S / 512;
  c.fillStyle = gray(0.62);
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) {
    const x = rng.next() * S;
    const y = rng.next() * S;
    const a = rng.range(-0.5, 0.5) + (rng.chance(0.25) ? 1.2 : 0);
    const len = S * rng.range(0.04, 0.16);
    const v = rng.range(0.35, 1);
    c.strokeStyle = gray(v, rng.range(0.3, 0.8));
    c.lineWidth = k * rng.range(0.6, 1.8);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
  cloud(c, S, rng, 8, 0.4, 190);
}

function paintTile(tile: Tile, c: Ctx, S: number, rng: RNG): void {
  switch (tile) {
    case TILE.plain:
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, S, S);
      break;
    case TILE.wood:
      paintWood(c, S, rng, false);
      break;
    case TILE.woodFine:
      paintWood(c, S, rng, true);
      break;
    case TILE.bamboo:
      paintBamboo(c, S, rng);
      break;
    case TILE.thatch:
      paintThatch(c, S, rng);
      break;
    case TILE.rattan:
      paintRattan(c, S, rng);
      break;
    case TILE.fabric:
      paintFabric(c, S, rng);
      break;
    case TILE.plaster:
      paintPlaster(c, S, rng);
      break;
    case TILE.rope:
      paintRope(c, S, rng);
      break;
    case TILE.leaf:
      paintLeaf(c, S, rng);
      break;
    case TILE.paper:
      paintPaper(c, S, rng);
      break;
    case TILE.brushed:
      paintBrushed(c, S, rng);
      break;
    case TILE.stone:
      paintStone(c, S, rng);
      break;
    case TILE.terracotta:
      paintTerracotta(c, S, rng);
      break;
    case TILE.mat:
      paintMat(c, S, rng);
      break;
    default:
      paintCoir(c, S, rng);
  }
}

function finish(cv: HTMLCanvasElement, repeat: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

const cache = new Map<number, PropTextures>();

/** Texture condivise (in cache per scala). `scale`: 0.5 | 1 | 2. */
export function getPropTextures(scale = 1): PropTextures {
  const key = scale <= 0.5 ? 0.5 : scale >= 2 ? 2 : 1;
  const hit = cache.get(key);
  if (hit) return hit;
  const atlasSize = key === 0.5 ? 1024 : 2048;
  const rep = key === 0.5 ? 512 : key === 1 ? 1024 : 2048;
  const T = atlasSize / 4;
  const [acv, ac] = mk(atlasSize);
  for (let t = 0; t < 16; t++) {
    const [tcv, tc] = mk(T);
    paintTile(t as Tile, tc, T, new RNG(7001 + t * 131));
    ac.drawImage(tcv, (t % 4) * T, Math.floor(t / 4) * T);
  }
  const one = (tile: Tile, size: number, seed: number): THREE.CanvasTexture => {
    const [cv, c] = mk(size);
    paintTile(tile, c, size, new RNG(seed));
    return finish(cv, true);
  };
  const set: PropTextures = {
    atlas: finish(acv, false),
    wood: one(TILE.wood, rep, 9101),
    thatch: one(TILE.thatch, rep, 9102),
    plaster: one(TILE.plaster, Math.min(rep, 1024), 9103),
    fabric: one(TILE.fabric, Math.min(rep, 1024), 9104),
  };
  cache.set(key, set);
  return set;
}

/** Libera tutte le texture in cache (da chiamare solo alla chiusura del gioco). */
export function disposePropTextureCache(): void {
  for (const set of cache.values()) {
    set.atlas.dispose();
    set.wood.dispose();
    set.thatch.dispose();
    set.plaster.dispose();
    set.fabric.dispose();
  }
  cache.clear();
}
