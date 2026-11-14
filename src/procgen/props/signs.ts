/** Insegne del negozio disegnate su canvas (cartello dipinto a mano, insegna intagliata, lightbox). */
import * as THREE from 'three';
import { RNG, hashString } from '../../core/rng';

type Ctx = CanvasRenderingContext2D;

const HAND = '"Chalkboard SE","Marker Felt","Comic Sans MS","Segoe Print","Bradley Hand",cursive,sans-serif';
const THAI = '"Thonburi","Sukhumvit Set","Leelawadee UI","Noto Sans Thai","Tahoma",sans-serif';
const BOLD = '"Avenir Next","Trebuchet MS","Segoe UI","Helvetica Neue",Arial,sans-serif';

/** Regioni UV [u0,v0,u1,v1] del canvas 1024×512. */
export const SIGN_UV = {
  main: [0, 0.25, 1, 1] as [number, number, number, number],
  smallA: [0, 0, 0.5, 0.25] as [number, number, number, number],
  smallB: [0.5, 0, 1, 0.25] as [number, number, number, number],
};

function fit(c: Ctx, text: string, px: number, weight: string, font: string, maxW: number): number {
  let size = px;
  c.font = `${weight} ${size}px ${font}`;
  const w = c.measureText(text).width;
  if (w > maxW) {
    size = Math.floor((size * maxW) / w);
    c.font = `${weight} ${size}px ${font}`;
  }
  return size;
}

/** Testo "a mano": ogni lettera leggermente ruotata e spostata. */
function handText(c: Ctx, text: string, cx: number, cy: number, px: number, maxW: number, rng: RNG, fill: string, shadow: string | null): void {
  const size = fit(c, text, px, 'bold', HAND, maxW);
  const chars = [...text];
  const widths = chars.map((ch) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const w = widths[i];
    c.save();
    c.translate(x + w / 2, cy + rng.range(-0.04, 0.04) * size);
    c.rotate(rng.range(-0.07, 0.07));
    if (shadow) {
      c.fillStyle = shadow;
      c.fillText(ch, size * 0.045, size * 0.055);
    }
    c.fillStyle = fill;
    c.fillText(ch, 0, 0);
    c.restore();
    x += w;
  });
}

function brushy(c: Ctx, x: number, y: number, w: number, h: number, rng: RNG, base: string, wear: string): void {
  c.fillStyle = base;
  c.fillRect(x, y, w, h);
  for (let i = 0; i < 260; i++) {
    const yy = y + rng.next() * h;
    const xx = x + rng.next() * w;
    c.strokeStyle = rng.chance(0.55) ? `rgba(255,255,255,${rng.range(0.03, 0.12)})` : `rgba(90,60,30,${rng.range(0.03, 0.1)})`;
    c.lineWidth = rng.range(1, 5);
    c.beginPath();
    c.moveTo(xx, yy);
    c.lineTo(xx + rng.range(40, 220), yy + rng.range(-2, 2));
    c.stroke();
  }
  // bordi consumati: riaffiora il legno
  for (let i = 0; i < 90; i++) {
    const side = rng.int(0, 3);
    const t = rng.next();
    const px = side < 2 ? x + t * w : side === 2 ? x + rng.range(0, 14) : x + w - rng.range(0, 14);
    const py = side === 0 ? y + rng.range(0, 10) : side === 1 ? y + h - rng.range(0, 10) : y + t * h;
    c.fillStyle = wear;
    c.globalAlpha = rng.range(0.25, 0.8);
    c.beginPath();
    c.ellipse(px, py, rng.range(4, 22), rng.range(2, 7), rng.range(-0.3, 0.3), 0, 6.283);
    c.fill();
  }
  c.globalAlpha = 1;
}

function phoneIcon(c: Ctx, x: number, y: number, s: number, body: string, screen: string, crack: boolean): void {
  c.save();
  c.translate(x, y);
  c.rotate(-0.16);
  c.fillStyle = body;
  c.beginPath();
  c.roundRect(-s * 0.3, -s * 0.55, s * 0.6, s * 1.1, s * 0.1);
  c.fill();
  c.fillStyle = screen;
  c.beginPath();
  c.roundRect(-s * 0.24, -s * 0.44, s * 0.48, s * 0.82, s * 0.04);
  c.fill();
  if (crack) {
    c.strokeStyle = body;
    c.lineWidth = s * 0.025;
    c.beginPath();
    c.moveTo(-s * 0.05, -s * 0.44);
    c.lineTo(s * 0.04, -s * 0.2);
    c.lineTo(-s * 0.1, -s * 0.02);
    c.lineTo(s * 0.12, s * 0.16);
    c.moveTo(s * 0.04, -s * 0.2);
    c.lineTo(s * 0.24, -s * 0.12);
    c.stroke();
  }
  c.fillStyle = screen;
  c.beginPath();
  c.arc(0, s * 0.46, s * 0.04, 0, 6.283);
  c.fill();
  c.restore();
}

function wrenchIcon(c: Ctx, x: number, y: number, s: number, col: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(0.7);
  c.strokeStyle = col;
  c.lineCap = 'round';
  c.lineWidth = s * 0.14;
  c.beginPath();
  c.moveTo(0, -s * 0.3);
  c.lineTo(0, s * 0.5);
  c.stroke();
  c.lineWidth = s * 0.12;
  c.beginPath();
  c.arc(0, -s * 0.42, s * 0.16, 0.9 - Math.PI / 2, Math.PI * 2 - 0.9 - Math.PI / 2);
  c.stroke();
  c.restore();
}

function flower(c: Ctx, x: number, y: number, r: number): void {
  for (let i = 0; i < 5; i++) {
    c.save();
    c.translate(x, y);
    c.rotate((i / 5) * 6.283);
    const g = c.createLinearGradient(0, 0, 0, -r);
    g.addColorStop(0, '#f7c948');
    g.addColorStop(0.45, '#fff6dc');
    g.addColorStop(1, '#ffffff');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(r * 0.12, -r * 0.55, r * 0.3, r * 0.5, 0.35, 0, 6.283);
    c.fill();
    c.restore();
  }
}

function paintPainted(c: Ctx, name: string, color: string, rng: RNG): void {
  const W = 1024;
  const H = 384;
  brushy(c, 0, 0, W, H, rng, '#f4e7c6', '#9a7448');
  c.fillStyle = 'rgba(60,40,20,0.55)';
  c.fillRect(0, H / 3 - 2, W, 4);
  c.fillRect(0, (2 * H) / 3 - 2, W, 4);
  // cornice a pennello
  c.strokeStyle = color;
  c.lineWidth = 9;
  c.setLineDash([46, 9, 70, 12]);
  c.strokeRect(20, 20, W - 40, H - 40);
  c.setLineDash([]);
  phoneIcon(c, 118, 190, 150, '#1f4f57', '#8fdcd3', true);
  wrenchIcon(c, 925, 205, 120, '#1f4f57');
  handText(c, name, 512, 62, 54, 640, rng, '#5a3b22', null);
  handText(c, 'PHONE FIX', 520, 170, 150, 640, rng, color, '#1f4f57');
  c.font = `bold 86px ${THAI}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillText('ซ่อมมือถือ', 524, 304);
  c.fillStyle = '#1f6f78';
  c.fillText('ซ่อมมือถือ', 520, 300);
  // cartellini piccoli
  brushy(c, 0, 384, 512, 128, rng, '#1f8f8a', '#7d5d3a');
  handText(c, 'OPEN', 160, 452, 84, 250, rng, '#fff7e0', 'rgba(0,0,0,0.25)');
  c.font = `bold 70px ${THAI}`;
  c.fillStyle = '#ffe9a8';
  c.fillText('เปิด', 390, 450);
  brushy(c, 512, 384, 512, 128, rng, '#f6c94a', '#7d5d3a');
  handText(c, 'FAST! 30 min', 768, 450, 70, 440, rng, '#5a2a1a', null);
}

function paintCarved(c: Ctx, name: string, color: string, rng: RNG): void {
  const W = 1024;
  const H = 384;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#6b4226');
  g.addColorStop(1, '#4e2f1a');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 240; i++) {
    c.strokeStyle = rng.chance(0.5) ? `rgba(20,10,5,${rng.range(0.08, 0.3)})` : `rgba(190,140,90,${rng.range(0.05, 0.18)})`;
    c.lineWidth = rng.range(1, 3);
    const y = rng.next() * H;
    c.beginPath();
    c.moveTo(0, y);
    c.bezierCurveTo(W * 0.3, y + rng.range(-10, 10), W * 0.6, y + rng.range(-10, 10), W, y + rng.range(-6, 6));
    c.stroke();
  }
  c.strokeStyle = '#e8c36a';
  c.lineWidth = 7;
  c.beginPath();
  c.roundRect(22, 22, W - 44, H - 44, 36);
  c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.4)';
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(32, 32, W - 64, H - 64, 28);
  c.stroke();
  flower(c, 105, 120, 62);
  flower(c, 925, 270, 62);
  flower(c, 160, 290, 38);
  flower(c, 880, 100, 38);
  const carve = (text: string, y: number, px: number, font: string, fill: string, maxW: number): void => {
    fit(c, text, px, 'bold', font, maxW);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillText(text, 516, y + 5);
    c.fillStyle = 'rgba(255,230,180,0.35)';
    c.fillText(text, 510, y - 3);
    c.fillStyle = fill;
    c.fillText(text, 512, y);
  };
  carve('PHONE FIX', 150, 150, BOLD, '#f6ead0', 640);
  carve('ซ่อมมือถือ', 262, 74, THAI, '#f0c55a', 520);
  carve(`· ${name} ·`, 330, 44, HAND, color, 560);
  // cartellini
  c.fillStyle = '#4e2f1a';
  c.fillRect(0, 384, 1024, 128);
  c.strokeStyle = '#e8c36a';
  c.lineWidth = 5;
  c.strokeRect(10, 394, 492, 108);
  c.strokeRect(522, 394, 492, 108);
  c.fillStyle = '#f6ead0';
  fit(c, 'OPEN · เปิด', 78, 'bold', THAI, 440);
  c.fillText('OPEN · เปิด', 256, 450);
  fit(c, 'ACCESSORIES', 64, 'bold', BOLD, 440);
  c.fillStyle = '#f0c55a';
  c.fillText('ACCESSORIES', 768, 450);
}

function paintLightbox(c: Ctx, name: string, color: string): void {
  const W = 1024;
  const H = 384;
  c.fillStyle = '#fffdf4';
  c.fillRect(0, 0, W, H);
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(28, 28, 230, H - 56, 44);
  c.fill();
  phoneIcon(c, 132, 190, 190, '#fffdf4', color, false);
  wrenchIcon(c, 196, 250, 90, '#ffd36a');
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  fit(c, 'PHONE FIX', 168, '800', BOLD, 700);
  c.fillStyle = color;
  c.fillText('PHONE FIX', 292, 138);
  c.fillStyle = '#f2705a';
  fit(c, 'ซ่อมมือถือ', 84, 'bold', THAI, 380);
  c.fillText('ซ่อมมือถือ', 296, 268);
  c.fillStyle = '#39424a';
  fit(c, name, 50, 'italic 600', BOLD, 300);
  c.textAlign = 'right';
  c.fillText(name, 990, 312);
  c.fillStyle = color;
  c.fillRect(292, 208, 700, 8);
  // pannelli piccoli
  c.fillStyle = color;
  c.fillRect(0, 384, 512, 128);
  c.fillStyle = '#fffdf4';
  c.textAlign = 'center';
  fit(c, 'OPEN · เปิด', 80, 'bold', THAI, 440);
  c.fillText('OPEN · เปิด', 256, 450);
  c.fillStyle = '#fffdf4';
  c.fillRect(512, 384, 512, 128);
  c.fillStyle = '#f2705a';
  fit(c, 'REFURBISHED', 70, '800', BOLD, 440);
  c.fillText('REFURBISHED', 768, 450);
}

export function paintSign(style: 'painted' | 'carved' | 'lightbox', shopName: string, color: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const c = cv.getContext('2d') as Ctx;
  const rng = new RNG(hashString(shopName) ^ 0x5151);
  const name = shopName.trim().slice(0, 28) || 'Island Fix';
  if (style === 'painted') paintPainted(c, name, color, rng);
  else if (style === 'carved') paintCarved(c, name, color, rng);
  else paintLightbox(c, name, color);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
