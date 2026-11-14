/**
 * Atlante procedurale (canvas) condiviso da tutti gli strumenti: etichette stampate, pannelli frontali,
 * display a sette segmenti / LCD e piccoli pattern. Generato una sola volta e messo in cache.
 * Tutti i marchi e i testi sono fittizi.
 *
 * - `toolAtlasLit()`  → versione completa (usata come `map` del materiale principale e come `emissiveMap` dei display)
 * - `toolAtlasDim()`  → stessa immagine ma con i display quasi spenti (usata come `map` diffuso dei display)
 * - `toolOrm()`       → texture gradiente 16×16: G = roughness (asse U), B = metalness (asse V), letta tramite `uv1`
 */
import * as THREE from 'three';

export type UVRect = readonly [number, number, number, number];

const SIZE_W = 2048;
const SIZE_H = 1024;
const PAD = 4;

type Painter = (g: CanvasRenderingContext2D, w: number, h: number) => void;
interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  display: boolean;
  paint: Painter;
}

const regions = new Map<string, Region>();
let packed = false;

function alloc(name: string, w: number, h: number, paint: Painter, display = false): void {
  regions.set(name, { x: 0, y: 0, w, h, display, paint });
}

/** Impacchettamento a scaffali (regioni ordinate per altezza decrescente), deterministico. */
function pack(): void {
  if (packed) return;
  packed = true;
  const list = [...regions.entries()].sort((a, b) => b[1].h - a[1].h || a[0].localeCompare(b[0]));
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const [name, r] of list) {
    if (x + r.w + PAD > SIZE_W) {
      x = PAD;
      y += rowH + PAD * 2;
      rowH = 0;
    }
    if (y + r.h + PAD > SIZE_H) throw new Error(`tools-atlas: spazio esaurito per "${name}"`);
    r.x = x;
    r.y = y;
    x += r.w + PAD * 2;
    rowH = Math.max(rowH, r.h);
  }
}

// ------------------------------------------------------------------ helper di disegno
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abfgcd',
  '-': 'g',
  C: 'afed',
  ' ': '',
};

/** Disegna testo a sette segmenti. Ritorna la x finale. */
function seg7(g: CanvasRenderingContext2D, text: string, x: number, y: number, h: number, color: string, ghost = 'rgba(255,255,255,0.045)'): number {
  const w = h * 0.52;
  const t = h * 0.13;
  const gap = h * 0.2;
  const slant = -0.08;
  let cx = x;
  for (const ch of text) {
    if (ch === '.' || ch === ':') {
      g.fillStyle = color;
      if (ch === '.') {
        g.fillRect(cx - gap * 0.55, y + h - t, t, t);
      } else {
        g.fillRect(cx - gap * 0.2, y + h * 0.28, t, t);
        g.fillRect(cx - gap * 0.2 - h * 0.035, y + h * 0.68, t, t);
        cx += t + gap * 0.5;
      }
      continue;
    }
    if (ch === '°') {
      g.strokeStyle = color;
      g.lineWidth = t * 0.85;
      g.beginPath();
      g.arc(cx + h * 0.1, y + h * 0.16, h * 0.105, 0, Math.PI * 2);
      g.stroke();
      cx += h * 0.36;
      continue;
    }
    const on = SEGMENTS[ch] ?? '';
    g.save();
    g.transform(1, 0, slant, 1, cx - slant * (y + h), 0);
    const hh = h;
    const half = hh / 2;
    const seg = (id: string, sx: number, sy: number, horiz: boolean): void => {
      g.fillStyle = on.includes(id) ? color : ghost;
      const len = horiz ? w - t * 1.3 : half - t * 1.15;
      g.beginPath();
      if (horiz) {
        g.moveTo(sx, sy + t / 2);
        g.lineTo(sx + t / 2, sy);
        g.lineTo(sx + len - t / 2, sy);
        g.lineTo(sx + len, sy + t / 2);
        g.lineTo(sx + len - t / 2, sy + t);
        g.lineTo(sx + t / 2, sy + t);
      } else {
        g.moveTo(sx + t / 2, sy);
        g.lineTo(sx + t, sy + t / 2);
        g.lineTo(sx + t, sy + len - t / 2);
        g.lineTo(sx + t / 2, sy + len);
        g.lineTo(sx, sy + len - t / 2);
        g.lineTo(sx, sy + t / 2);
      }
      g.closePath();
      g.fill();
    };
    seg('a', t * 0.65, y, true);
    seg('g', t * 0.65, y + half - t / 2, true);
    seg('d', t * 0.65, y + hh - t, true);
    seg('f', 0, y + t * 0.58, false);
    seg('b', w - t, y + t * 0.58, false);
    seg('e', 0, y + half + t * 0.58, false);
    seg('c', w - t, y + half + t * 0.58, false);
    g.restore();
    cx += w + gap;
  }
  return cx;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, weight = '700', align: CanvasTextAlign = 'left'): void {
  g.font = `${weight} ${px}px "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}

function displayBg(g: CanvasRenderingContext2D, w: number, h: number, tint = '#05070a'): void {
  g.fillStyle = tint;
  g.fillRect(0, 0, w, h);
}

function palm(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  g.save();
  g.translate(x, y);
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineWidth = s * 0.09;
  g.beginPath();
  g.moveTo(0, s * 0.5);
  g.quadraticCurveTo(s * 0.12, 0, s * 0.02, -s * 0.2);
  g.stroke();
  g.lineWidth = s * 0.07;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.62;
    g.beginPath();
    g.moveTo(s * 0.02, -s * 0.2);
    g.quadraticCurveTo(Math.cos(a) * s * 0.35, -s * 0.2 + Math.sin(a) * s * 0.35, Math.cos(a) * s * 0.5, -s * 0.2 + Math.sin(a) * s * 0.2 + s * 0.12);
    g.stroke();
  }
  g.restore();
}

function flameDiamond(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(Math.PI / 4);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#d6332a';
  g.lineWidth = s * 0.12;
  g.fillRect(-s / 2, -s / 2, s, s);
  g.strokeRect(-s / 2, -s / 2, s, s);
  g.restore();
  g.fillStyle = '#16181b';
  g.beginPath();
  g.moveTo(x, y - s * 0.36);
  g.bezierCurveTo(x + s * 0.34, y - s * 0.05, x + s * 0.26, y + s * 0.3, x, y + s * 0.3);
  g.bezierCurveTo(x - s * 0.3, y + s * 0.3, x - s * 0.26, y, x - s * 0.08, y - s * 0.12);
  g.bezierCurveTo(x - s * 0.02, y - s * 0.02, x + s * 0.04, y - s * 0.16, x, y - s * 0.36);
  g.fill();
  g.fillRect(x - s * 0.26, y + s * 0.34, s * 0.52, s * 0.05);
}

function knobScale(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, n = 11): void {
  g.strokeStyle = color;
  g.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 0.75 + (i / (n - 1)) * Math.PI * 1.5;
    const r1 = r * (i % 5 === 0 ? 1.22 : 1.12);
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    g.stroke();
  }
}

// ------------------------------------------------------------------ regioni
alloc('white', 16, 16, (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
});
alloc('dark', 16, 16, (g, w, h) => {
  g.fillStyle = '#0b0c0e';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
});
alloc('lens', 16, 16, (g, w, h) => {
  g.fillStyle = '#d9d6c4';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
});

alloc(
  'led',
  16,
  16,
  (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
  },
  true,
);
alloc(
  'coil',
  128,
  128,
  (g, w, h) => {
    g.fillStyle = '#050505';
    g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 260; i++) {
      const a = (i / 260) * Math.PI * 2 * 4.2;
      const r = 8 + (i / 260) * 46;
      const x = w / 2 + Math.cos(a) * r;
      const y = h / 2 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(40,40,40,1)';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(w / 2, 4);
    g.lineTo(w / 2, h - 4);
    g.moveTo(4, h / 2);
    g.lineTo(w - 4, h / 2);
    g.stroke();
  },
  true,
);

// --- etichette stampate
alloc('ipaLabel', 400, 176, (g, w, h) => {
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1479b8';
  g.fillRect(0, 0, w, 40);
  g.fillStyle = '#19b5b0';
  g.fillRect(0, 40, w, 6);
  text(g, 'ISLA CHEM', 14, 21, 20, '#ffffff', '800');
  text(g, 'LAB GRADE', w - 14, 21, 12, '#d8f1ff', '600', 'right');
  text(g, 'IPA', 14, 88, 62, '#12395a', '900');
  text(g, '99%', 140, 82, 48, '#d6332a', '900');
  text(g, 'ISOPROPYL ALCOHOL', 16, 132, 15, '#12395a', '700');
  text(g, 'alcol isopropilico · 100 ml', 16, 154, 12, '#4d6577', '500');
  flameDiamond(g, 322, 100, 58);
  g.fillStyle = '#9aa8b2';
  for (let i = 0; i < 5; i++) g.fillRect(262, 142 + i * 6, 120 - (i % 2) * 26, 2);
});
alloc('airLabel', 400, 240, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0f5f8f');
  grad.addColorStop(0.55, '#19a7c2');
  grad.addColorStop(1, '#bfeff0');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(30, 150 + i * 16);
    g.bezierCurveTo(120, 130 + i * 16, 170, 178 + i * 16, 250 - i * 28, 150 + i * 16);
    g.stroke();
  }
  text(g, 'TYPHOON', 22, 48, 50, '#ffffff', '900');
  text(g, 'AIR DUSTER', 24, 92, 24, '#ffe27a', '800');
  text(g, 'aria compressa · 400 ml', 24, 120, 13, '#e8fbff', '500');
  flameDiamond(g, 336, 180, 60);
  g.fillStyle = '#ffffff';
  rr(g, 282, 24, 96, 40, 8);
  g.fill();
  text(g, 'ESD SAFE', 330, 45, 15, '#0f5f8f', '800', 'center');
});
alloc('cardPrint', 344, 216, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#ff8a5c');
  grad.addColorStop(0.5, '#ffb65e');
  grad.addColorStop(1, '#19b5b0');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.2)';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.ellipse(w * 0.5, h * 1.25 + i * 26, w * 0.9, 90, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#fff3c4';
  g.beginPath();
  g.arc(262, 92, 42, 0, Math.PI * 2);
  g.fill();
  palm(g, 262, 108, 92, '#0c4b57');
  text(g, 'ISLAND FIX', 20, 40, 32, '#ffffff', '900');
  text(g, 'PRY CARD', 22, 72, 15, '#0c4b57', '800');
  g.fillStyle = '#2b2118';
  g.fillRect(0, h - 52, w, 30);
  text(g, '0042  7718  PHI  PHI', 20, 122, 18, 'rgba(255,255,255,0.9)', '600');
});
alloc('pickPrint', 128, 128, (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,40,60,0.35)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(w / 2, h * 0.42, 20, 0, Math.PI * 2);
  g.stroke();
  palm(g, w / 2, h * 0.46, 34, 'rgba(0,40,60,0.5)');
  text(g, '0.6 mm', w / 2, h * 0.72, 13, 'rgba(0,40,60,0.55)', '700', 'center');
});
alloc('bagPrint', 208, 336, (g, w, h) => {
  g.fillStyle = '#dfe6ea';
  g.fillRect(0, 0, w, h);
  const sh = g.createLinearGradient(0, 0, w, 0);
  sh.addColorStop(0, 'rgba(255,255,255,0.0)');
  sh.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  sh.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#c33b2e';
  g.fillRect(0, 22, w, 7);
  g.fillStyle = '#ffffff';
  rr(g, 16, 44, w - 32, 62, 6);
  g.fill();
  text(g, 'SEAL KIT', w / 2, 64, 24, '#16181b', '900', 'center');
  text(g, 'guarnizioni display · F8/FX', w / 2, 90, 11, '#444c55', '600', 'center');
  g.strokeStyle = '#16181b';
  g.lineWidth = 5;
  rr(g, 46, 126, w - 92, 190, 26);
  g.stroke();
  g.strokeStyle = '#c33b2e';
  g.lineWidth = 2;
  rr(g, 58, 138, w - 116, 166, 18);
  g.stroke();
  g.fillStyle = '#16181b';
  rr(g, 84, 122, 40, 12, 5);
  g.fill();
});
alloc('tubeLabel', 176, 96, (g, w, h) => {
  g.fillStyle = '#f2f2ee';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#16181b';
  g.fillRect(0, 0, w, 26);
  text(g, 'T-9000', 10, 14, 17, '#ffd34d', '900');
  text(g, 'GEL BOND', 10, 48, 20, '#16181b', '900');
  text(g, 'adesivo display · 15 ml', 10, 70, 10, '#555', '600');
  g.fillStyle = '#c33b2e';
  g.fillRect(0, h - 12, w, 12);
});
alloc('tapeCore', 256, 32, (g, w, h) => {
  g.fillStyle = '#f1efe8';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2; i++) {
    text(g, 'TAKKI', 12 + i * 128, 17, 16, '#c33b2e', '900');
    text(g, '2 mm × 10 m', 66 + i * 128, 17, 9, '#444', '600');
  }
});
alloc('esdSymbol', 96, 96, (g, w, h) => {
  g.fillStyle = '#ffd21f';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#16181b';
  g.beginPath();
  g.moveTo(w / 2, 10);
  g.lineTo(w - 8, h - 12);
  g.lineTo(8, h - 12);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffd21f';
  g.beginPath();
  g.moveTo(w / 2, 26);
  g.lineTo(w - 22, h - 20);
  g.lineTo(22, h - 20);
  g.closePath();
  g.fill();
  g.strokeStyle = '#16181b';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(34, 72);
  g.lineTo(46, 52);
  g.lineTo(54, 60);
  g.lineTo(60, 46);
  g.stroke();
  g.beginPath();
  g.moveTo(30, 44);
  g.lineTo(68, 76);
  g.stroke();
});
alloc('perforated', 256, 320, (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 16; x++) {
      const cx = 16 + x * 15;
      const cy = 18 + y * 15;
      g.fillStyle = '#0a0b0c';
      g.beginPath();
      g.arc(cx, cy, 2.9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.22)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(cx, cy, 4, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.strokeRect(5, 6, w - 10, h - 12);
});
alloc('psuPanel', 256, 368, (g, w, h) => {
  g.fillStyle = '#e9e7df';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#20242a';
  rr(g, 14, 14, w - 28, 126, 8);
  g.fill();
  text(g, 'MAKO  PS-305', 22, 152, 13, '#30353c', '800');
  text(g, 'DC POWER SUPPLY 30V 5A', w - 20, 152, 8, '#6b7078', '600', 'right');
  const kn = ['VOLTAGE', 'CURRENT'];
  kn.forEach((s, i) => {
    const x = 74 + i * 108;
    knobScale(g, x, 214, 30, '#30353c');
    text(g, s, x, 262, 10, '#30353c', '800', 'center');
    text(g, 'FINE', x + 42, 196, 7, '#6b7078', '600', 'center');
  });
  text(g, 'C.V.', 30, 172, 9, '#1c8a4a', '800');
  text(g, 'C.C.', 30, 186, 9, '#c33b2e', '800');
  g.strokeStyle = '#30353c';
  g.lineWidth = 2;
  g.strokeRect(14, 280, w - 28, 74);
  text(g, 'POWER', 46, 292, 8, '#30353c', '800', 'center');
  text(g, '−', 118, 342, 20, '#16181b', '900', 'center');
  text(g, 'GND', 164, 344, 9, '#1c8a4a', '800', 'center');
  text(g, '+', 210, 342, 20, '#c33b2e', '900', 'center');
});
alloc('stationPanel', 256, 240, (g, w, h) => {
  g.fillStyle = '#23272d';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff8a3c';
  g.fillRect(0, 0, w, 8);
  g.fillStyle = '#0b0c0e';
  rr(g, 14, 22, w - 28, 92, 8);
  g.fill();
  text(g, 'KRAKATOA 858D', 18, 128, 12, '#f0f0ea', '800');
  text(g, 'HOT AIR REWORK', w - 18, 128, 8, '#9aa2ab', '600', 'right');
  knobScale(g, 70, 182, 28, '#f0f0ea');
  knobScale(g, 186, 182, 28, '#f0f0ea');
  text(g, 'TEMP °C', 70, 228, 10, '#ff8a3c', '800', 'center');
  text(g, 'AIR', 186, 228, 10, '#5fd0ff', '800', 'center');
});
alloc('ultraPanel', 336, 104, (g, w, h) => {
  g.fillStyle = '#1e2227';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#0b0c0e';
  rr(g, 12, 16, 150, 72, 8);
  g.fill();
  text(g, 'SONIC-3', 250, 24, 15, '#e8edf0', '900', 'center');
  text(g, 'ULTRASONIC CLEANER 40 kHz', 250, 42, 7, '#9aa2ab', '600', 'center');
  const labels = ['ON', 'TIME', 'HEAT'];
  labels.forEach((s, i) => text(g, s, 196 + i * 54, 92, 8, '#9aa2ab', '700', 'center'));
});
alloc('platePanel', 336, 104, (g, w, h) => {
  g.fillStyle = '#2a2e35';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff6b4a';
  g.fillRect(0, h - 7, w, 7);
  g.fillStyle = '#0b0c0e';
  rr(g, 12, 14, 150, 68, 8);
  g.fill();
  text(g, 'LAVA PAD 946', 250, 22, 14, '#f0f0ea', '900', 'center');
  text(g, 'SEPARATORE A PIASTRA CALDA', 250, 38, 6.5, '#9aa2ab', '600', 'center');
  text(g, 'SET', 196, 86, 8, '#9aa2ab', '700', 'center');
  text(g, '▲', 250, 86, 9, '#9aa2ab', '700', 'center');
  text(g, '▼', 304, 86, 9, '#9aa2ab', '700', 'center');
});
alloc('sepPanel', 336, 104, (g, w, h) => {
  g.fillStyle = '#e9e7df';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#19a7a2';
  g.fillRect(0, 0, w, 8);
  g.fillStyle = '#0b0c0e';
  rr(g, 12, 20, 140, 66, 8);
  g.fill();
  text(g, 'GLASSLIFT V2', 246, 22, 14, '#20242a', '900', 'center');
  text(g, 'LCD SEPARATOR · VACUUM', 246, 36, 7, '#5d646d', '600', 'center');
  text(g, 'VAC', 186, 96, 8, '#5d646d', '800', 'center');
  text(g, 'HEAT', 246, 96, 8, '#5d646d', '800', 'center');
  text(g, 'POWER', 306, 96, 8, '#5d646d', '800', 'center');
});
alloc('battPanel', 256, 72, (g, w, h) => {
  g.fillStyle = '#f0efe9';
  g.fillRect(0, 0, w, h);
  text(g, 'CELLCHECK B-7', 12, 20, 16, '#20242a', '900');
  text(g, 'BATTERY HEALTH TESTER', 12, 40, 8, '#5d646d', '700');
  const ports = ['F8', 'FX', 'F12', 'F14'];
  ports.forEach((s, i) => text(g, s, 150 + i * 28, 58, 9, '#c33b2e', '800', 'center'));
  text(g, 'CONNETTORI →', 12, 58, 8, '#5d646d', '700');
});
alloc('progPanel', 208, 72, (g, w, h) => {
  g.fillStyle = '#2b2f36';
  g.fillRect(0, 0, w, h);
  text(g, 'TRUECOLOR P2', 10, 18, 14, '#ffd34d', '900');
  text(g, 'CHIP PROGRAMMER', 10, 36, 8, '#b9c0c8', '700');
  const labels = ['READ', 'WRITE', 'BATT'];
  labels.forEach((s, i) => {
    g.strokeStyle = '#b9c0c8';
    g.lineWidth = 1.5;
    rr(g, 10 + i * 64, 48, 54, 16, 4);
    g.stroke();
    text(g, s, 37 + i * 64, 57, 8, '#b9c0c8', '800', 'center');
  });
});
alloc('usbPrint', 96, 96, (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  text(g, 'USB DOCTOR', w / 2, 16, 11, '#1a2330', '900', 'center');
  text(g, '3–20V  0–5A', w / 2, 34, 9, '#445060', '700', 'center');
  g.strokeStyle = '#1a2330';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(w / 2, 82);
  g.lineTo(w / 2, 50);
  g.moveTo(w / 2, 70);
  g.lineTo(w / 2 - 14, 60);
  g.moveTo(w / 2, 64);
  g.lineTo(w / 2 + 14, 54);
  g.stroke();
  g.fillStyle = '#1a2330';
  g.beginPath();
  g.arc(w / 2, 84, 5, 0, Math.PI * 2);
  g.arc(w / 2 - 14, 58, 3.5, 0, Math.PI * 2);
  g.fill();
  g.fillRect(w / 2 + 10, 48, 8, 8);
  g.beginPath();
  g.moveTo(w / 2 - 5, 52);
  g.lineTo(w / 2, 42);
  g.lineTo(w / 2 + 5, 52);
  g.fill();
});
alloc('pcb', 160, 96, (g, w, h) => {
  g.fillStyle = '#0f6b46';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3fae7b';
  g.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    const y = 8 + i * 6;
    g.beginPath();
    g.moveTo(4, y);
    g.lineTo(40 + ((i * 37) % 50), y);
    g.lineTo(52 + ((i * 37) % 50), y + (i % 2 ? 6 : -6));
    g.lineTo(w - 6, y + (i % 2 ? 6 : -6));
    g.stroke();
  }
  g.fillStyle = '#e2c15a';
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.arc(12 + ((i * 53) % 140), 10 + ((i * 29) % 78), 2.2, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#16181b';
  g.fillRect(96, 30, 30, 22);
  text(g, 'U7', 111, 22, 8, '#e8f5ee', '700', 'center');
});
alloc('sponge', 64, 64, (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 150; i++) {
    const x = (i * 37.7) % w;
    const y = (i * 91.3) % h;
    g.fillStyle = `rgba(90,60,0,${0.12 + ((i * 7) % 10) * 0.025})`;
    g.beginPath();
    g.arc(x, y, 1 + ((i * 13) % 3), 0, Math.PI * 2);
    g.fill();
  }
});
alloc('grille', 128, 128, (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#08090a';
  g.lineWidth = 6;
  for (let r = 14; r < 60; r += 13) {
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.beginPath();
    g.moveTo(w / 2, h / 2);
    g.lineTo(w / 2 + Math.cos(a) * 64, h / 2 + Math.sin(a) * 64);
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(w / 2, h / 2, 9, 0, Math.PI * 2);
  g.fill();
});
alloc('vents', 128, 64, (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#08090a';
  for (let i = 0; i < 9; i++) {
    rr(g, 8 + i * 13, 8, 6, h - 16, 3);
    g.fill();
  }
});
alloc('carbon', 96, 96, (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  const s = 12;
  for (let y = 0; y < h / s; y++) {
    for (let x = 0; x < w / s; x++) {
      const v = (x + y) % 2 === 0;
      const gr = v ? g.createLinearGradient(x * s, 0, x * s + s, 0) : g.createLinearGradient(0, y * s, 0, y * s + s);
      gr.addColorStop(0, '#5a5a5a');
      gr.addColorStop(0.5, '#f4f4f4');
      gr.addColorStop(1, '#5a5a5a');
      g.fillStyle = gr;
      g.fillRect(x * s, y * s, s, s);
    }
  }
});
alloc('ruler', 256, 24, (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#16181b';
  for (let i = 0; i <= 50; i++) {
    const x = 3 + i * 5;
    g.fillRect(x, 0, 1.2, i % 10 === 0 ? 14 : i % 5 === 0 ? 10 : 6);
  }
});

// --- display (emissivi)
alloc(
  'dUsb',
  128,
  96,
  (g, w, h) => {
    displayBg(g, w, h, '#020409');
    seg7(g, '5.08', 12, 8, 36, '#ffd84a', 'rgba(255,220,90,0.05)');
    text(g, 'V', w - 14, 34, 16, '#ffd84a', '800', 'center');
    seg7(g, '0.98', 10, 54, 34, '#45c8ff', 'rgba(80,200,255,0.05)');
    text(g, 'A', w - 14, 78, 16, '#45c8ff', '800', 'center');
  },
  true,
);
alloc(
  'dHeat',
  144,
  72,
  (g, w, h) => {
    displayBg(g, w, h, '#060300');
    seg7(g, '350°C', 8, 16, 38, '#ffa62b', 'rgba(255,170,60,0.06)');
  },
  true,
);
alloc(
  'dPlate',
  176,
  80,
  (g, w, h) => {
    displayBg(g, w, h, '#070101');
    seg7(g, '085°C', 10, 16, 46, '#ff3b2f', 'rgba(255,70,50,0.07)');
  },
  true,
);
alloc(
  'dPsu',
  232,
  126,
  (g, w, h) => {
    displayBg(g, w, h, '#050607');
    seg7(g, '04.20', 12, 10, 46, '#ff3b2f', 'rgba(255,70,50,0.07)');
    text(g, 'V', w - 20, 36, 24, '#ff3b2f', '800', 'center');
    seg7(g, '1.250', 12, 70, 46, '#3dff7a', 'rgba(70,255,130,0.06)');
    text(g, 'A', w - 20, 96, 24, '#3dff7a', '800', 'center');
  },
  true,
);
alloc(
  'dStation',
  232,
  92,
  (g, w, h) => {
    displayBg(g, w, h, '#060200');
    seg7(g, '380', 10, 14, 60, '#ff4a2f', 'rgba(255,80,50,0.07)');
    text(g, '°C', 124, 28, 16, '#ff4a2f', '800', 'center');
    seg7(g, '45', 150, 30, 44, '#45c8ff', 'rgba(80,200,255,0.06)');
    text(g, 'AIR', 178, 16, 11, '#45c8ff', '800', 'center');
  },
  true,
);
alloc(
  'dUltra',
  152,
  72,
  (g, w, h) => {
    displayBg(g, w, h, '#01050a');
    seg7(g, '03:00', 12, 14, 42, '#7fe3ff', 'rgba(120,220,255,0.06)');
  },
  true,
);
alloc(
  'dSep',
  144,
  68,
  (g, w, h) => {
    displayBg(g, w, h, '#020703');
    seg7(g, '080°C', 8, 14, 38, '#5dff8f', 'rgba(90,255,140,0.06)');
  },
  true,
);
alloc(
  'dProg',
  224,
  128,
  (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1238c8');
    grad.addColorStop(1, '#0a2590');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, 24);
    text(g, 'TRUE TONE', 8, 13, 14, '#0a2590', '900');
    text(g, 'FX', w - 8, 13, 13, '#0a2590', '900', 'right');
    text(g, '> READ ORIGINAL   OK', 10, 44, 13, '#ffffff', '700');
    text(g, '> WRITE NEW LCD   OK', 10, 64, 13, '#ffffff', '700');
    text(g, '> VERIFY', 10, 84, 13, '#ffffff', '700');
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.strokeRect(10, 100, w - 20, 16);
    g.fillStyle = '#7dffb0';
    g.fillRect(13, 103, (w - 26) * 0.72, 10);
  },
  true,
);
alloc(
  'dBatt',
  256,
  168,
  (g, w, h) => {
    displayBg(g, w, h, '#03070c');
    g.strokeStyle = '#7dffb0';
    g.lineWidth = 4;
    rr(g, 14, 16, 78, 40, 6);
    g.stroke();
    g.fillStyle = '#7dffb0';
    g.fillRect(94, 28, 7, 16);
    for (let i = 0; i < 4; i++) g.fillRect(21 + i * 17, 23, 13, 26);
    seg7(g, '98', 122, 12, 48, '#7dffb0', 'rgba(120,255,170,0.06)');
    text(g, '%', 206, 44, 26, '#7dffb0', '800', 'center');
    text(g, 'CAPACITY', 14, 84, 12, '#8fa3b5', '700');
    text(g, '2815', 200, 86, 30, '#ffffff', '800', 'right');
    text(g, 'mAh', 226, 90, 13, '#ffffff', '700', 'center');
    text(g, 'CYCLES', 14, 126, 12, '#8fa3b5', '700');
    text(g, '212', 200, 127, 30, '#ffd84a', '800', 'right');
    text(g, '3.82 V   31 °C   HEALTH: GOOD', 14, 156, 10, '#45c8ff', '700');
  },
  true,
);

// ------------------------------------------------------------------ accesso
/** Rettangolo UV [u0, v0, u1, v1] di una regione (v0 = bordo inferiore). */
export function atlasRect(name: string): UVRect {
  pack();
  const r = regions.get(name);
  if (!r) throw new Error(`tools-atlas: regione sconosciuta "${name}"`);
  return [r.x / SIZE_W, 1 - (r.y + r.h) / SIZE_H, (r.x + r.w) / SIZE_W, 1 - r.y / SIZE_H];
}

/** Dimensioni in pixel [w, h] di una regione (per posizionare comandi sopra i pannelli stampati). */
export function atlasPixels(name: string): readonly [number, number] {
  const r = regions.get(name);
  if (!r) throw new Error(`tools-atlas: regione sconosciuta "${name}"`);
  return [r.w, r.h];
}

/** UV del centro di una regione (per tinte piatte). */
export function atlasPoint(name: string): readonly [number, number] {
  const r = atlasRect(name);
  return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
}

let litTex: THREE.CanvasTexture | null = null;
let dimTex: THREE.CanvasTexture | null = null;
let ormTex: THREE.DataTexture | null = null;

function paintAtlas(dim: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  pack();
  c.width = SIZE_W;
  c.height = SIZE_H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, SIZE_W, SIZE_H);
  for (const r of regions.values()) {
    g.save();
    g.translate(r.x, r.y);
    g.beginPath();
    g.rect(-PAD, -PAD, r.w + PAD * 2, r.h + PAD * 2);
    g.clip();
    if (r.display) {
      g.fillStyle = '#05070a';
      g.fillRect(-PAD, -PAD, r.w + PAD * 2, r.h + PAD * 2);
    }
    r.paint(g, r.w, r.h);
    if (dim && r.display) {
      g.fillStyle = 'rgba(6,8,10,0.88)';
      g.fillRect(-PAD, -PAD, r.w + PAD * 2, r.h + PAD * 2);
    }
    g.restore();
  }
  return c;
}

function makeTex(dim: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(paintAtlas(dim));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

export function toolAtlasLit(): THREE.CanvasTexture {
  if (!litTex) litTex = makeTex(false);
  return litTex;
}

export function toolAtlasDim(): THREE.CanvasTexture {
  if (!dimTex) dimTex = makeTex(true);
  return dimTex;
}

/** Texture gradiente: campionata con uv1 = (roughness, metalness). */
export function toolOrm(): THREE.DataTexture {
  if (ormTex) return ormTex;
  const n = 16;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      data[i] = 255;
      data[i + 1] = Math.round((x / (n - 1)) * 255);
      data[i + 2] = Math.round((y / (n - 1)) * 255);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.channel = 1;
  t.needsUpdate = true;
  ormTex = t;
  return t;
}

/** uv1 corrispondente a una coppia (roughness, metalness). */
export function ormUv(roughness: number, metalness: number): readonly [number, number] {
  const n = 16;
  return [(0.5 + roughness * (n - 1)) / n, (0.5 + metalness * (n - 1)) / n];
}

export function disposeToolTextures(): void {
  litTex?.dispose();
  dimTex?.dispose();
  ormTex?.dispose();
  litTex = dimTex = ormTex = null;
}
