/**
 * "PearOS" phone screens drawn on a 2D canvas — used as the texture of the 3D phone display.
 *
 *   drawPhoneScreen(ctx, 512, 1024, { kind: 'test_touch', notch: true, progress: 0.6 }, timeSeconds);
 *
 * Everything is procedural and scales with (w, h); the function draws inside [0,w]×[0,h] of the
 * current transform and never reads pixels back, so it works on any (Offscreen)Canvas context.
 * Fictional brand: the logo is a stylised pear.
 */
import { t } from '../core/i18n';

export type PhoneScreenKind =
  | 'off'
  | 'boot'
  | 'home'
  | 'power_off'
  | 'test_touch'
  | 'test_true_tone'
  | 'test_biometric'
  | 'test_camera'
  | 'test_speaker'
  | 'test_microphone'
  | 'charging'
  | 'vibration'
  | 'glitch'
  | 'backlight';

export const PHONE_SCREEN_KINDS: PhoneScreenKind[] = [
  'off',
  'boot',
  'home',
  'power_off',
  'test_touch',
  'test_true_tone',
  'test_biometric',
  'test_camera',
  'test_speaker',
  'test_microphone',
  'charging',
  'vibration',
  'glitch',
  'backlight',
];

export type PhoneTestResult = 'running' | 'pass' | 'fail';

export interface PhoneScreenState {
  kind: PhoneScreenKind;
  /** true = edge-to-edge screen with a notch (Fone X/12/14), false = classic screen with home button (Fone 8) */
  notch: boolean;
  /**
   * 0..1, meaning depends on the screen: boot bar, power-off slider thumb, touch grid coverage,
   * biometric scan. When omitted the screen animates on its own from `time`.
   */
  progress?: number;
  /** outcome badge for the test screens (default 'running') */
  result?: PhoneTestResult;
  /** battery level 0..1 (status bar and charging screen) */
  battery?: number;
  /** status-bar clock, e.g. "14:30" */
  clock?: string;
  /** test_camera: which camera */
  camera?: 'front' | 'rear';
  /** test_touch: indices (row-major, 5 columns × 9 rows) of cells that never respond */
  deadCells?: number[];
  /** test_microphone / test_speaker: signal level 0..1 (default: animated) */
  level?: number;
  /** charging: false shows the "not charging" state */
  charging?: boolean;
  /** glitch: 0..1 severity (default 0.6) */
  severity?: number;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const TEAL = '#18b8b0';
const CORAL = '#ff6f59';
const GOLD = '#ffc145';
const GREEN = '#4fd17a';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

interface Frame {
  c: Ctx;
  w: number;
  h: number;
  /** 1% of the width */
  u: number;
  time: number;
  s: PhoneScreenState;
  /** top inset below the status bar */
  top: number;
}

function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + k, y);
  c.lineTo(x + w - k, y);
  c.quadraticCurveTo(x + w, y, x + w, y + k);
  c.lineTo(x + w, y + h - k);
  c.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  c.lineTo(x + k, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - k);
  c.lineTo(x, y + k);
  c.quadraticCurveTo(x, y, x + k, y);
  c.closePath();
}

function text(f: Frame, str: string, x: number, y: number, size: number, color: string, weight = 700, align: CanvasTextAlign = 'center'): void {
  const c = f.c;
  c.font = `${weight} ${size * f.u}px ${FONT}`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.fillStyle = color;
  c.fillText(str, x, y);
}

/** Text shrunk to fit `maxW`. */
function fitText(f: Frame, str: string, x: number, y: number, size: number, maxW: number, color: string, weight = 700): void {
  const c = f.c;
  c.font = `${weight} ${size * f.u}px ${FONT}`;
  const m = c.measureText(str).width;
  const k = m > maxW ? maxW / m : 1;
  text(f, str, x, y, size * k, color, weight);
}

/** The Pear logo: plump pear body, short stalk and one leaf. (cx, cy) = centre, s = height. */
export function drawPearLogo(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  const k = s / 100;
  c.save();
  c.translate(cx, cy);
  c.scale(k, k);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, -30);
  c.bezierCurveTo(13, -30, 17, -17, 19, -6);
  c.bezierCurveTo(22, 6, 36, 12, 36, 28);
  c.bezierCurveTo(36, 44, 20, 52, 0, 52);
  c.bezierCurveTo(-20, 52, -36, 44, -36, 28);
  c.bezierCurveTo(-36, 12, -22, 6, -19, -6);
  c.bezierCurveTo(-17, -17, -13, -30, 0, -30);
  c.fill();
  c.strokeStyle = color;
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(0, -31);
  c.quadraticCurveTo(0, -40, 5, -46);
  c.stroke();
  c.beginPath();
  c.moveTo(6, -41);
  c.bezierCurveTo(12, -54, 26, -55, 32, -51);
  c.bezierCurveTo(28, -40, 16, -36, 6, -41);
  c.fill();
  c.restore();
}

/* ------------------------------------------------------------------ chrome */

function statusBar(f: Frame, color: string): void {
  const { c, w, u, s } = f;
  const y = (s.notch ? 5.6 : 3.4) * u;
  const clock = s.clock ?? '9:41';
  if (s.notch) text(f, clock, 14 * u, y, 4.3, color, 800);
  else {
    text(f, clock, w / 2, y, 3.6, color, 800);
    text(f, 'Pear', 14.5 * u, y, 3.3, color, 700, 'left');
  }
  // signal
  const sx = s.notch ? w - 31 * u : 4 * u;
  c.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const bh = (1.2 + i * 0.8) * u;
    rrect(c, sx + i * 1.9 * u, y + 1.8 * u - bh, 1.3 * u, bh, 0.4 * u);
    c.fill();
  }
  // wifi (only where there is room)
  if (s.notch) {
    c.strokeStyle = color;
    c.lineWidth = 0.9 * u;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(w - 19.5 * u, y + 1.6 * u, (1 + i * 1.5) * u, -Math.PI * 0.75, -Math.PI * 0.25);
      c.stroke();
    }
  }
  // battery
  const bx = w - 14 * u;
  const lvl = clamp01(s.battery ?? 0.82);
  c.globalAlpha = 0.45;
  c.strokeStyle = color;
  c.lineWidth = 0.5 * u;
  rrect(c, bx, y - 1.9 * u, 8.4 * u, 3.8 * u, 1.1 * u);
  c.stroke();
  rrect(c, bx + 8.9 * u, y - 0.7 * u, 0.7 * u, 1.4 * u, 0.3 * u);
  c.fill();
  c.globalAlpha = 1;
  c.fillStyle = lvl < 0.2 ? CORAL : color;
  rrect(c, bx + 0.8 * u, y - 1.1 * u, 6.8 * u * lvl, 2.2 * u, 0.6 * u);
  c.fill();
}

function notchCutout(f: Frame): void {
  if (!f.s.notch) return;
  const { c, w, u } = f;
  c.fillStyle = '#000';
  const nw = 46 * u;
  rrect(c, w / 2 - nw / 2, -3 * u, nw, 9.4 * u, 3.6 * u);
  c.fill();
  c.fillStyle = '#0d1420';
  c.beginPath();
  c.arc(w / 2 + 12 * u, 3 * u, 1.3 * u, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#10131a';
  rrect(c, w / 2 - 7 * u, 2.3 * u, 14 * u, 1.3 * u, 0.6 * u);
  c.fill();
}

function homeIndicator(f: Frame, color: string): void {
  if (!f.s.notch) return;
  const { c, w, h, u } = f;
  c.fillStyle = color;
  rrect(c, w / 2 - 17 * u, h - 3.6 * u, 34 * u, 1.3 * u, 0.65 * u);
  c.fill();
}

function resultBadge(f: Frame, y: number): void {
  const { c, w, u, s, time } = f;
  const res = s.result ?? 'running';
  const bw = 46 * u;
  const bh = 11 * u;
  const x = w / 2 - bw / 2;
  if (res === 'running') {
    c.fillStyle = 'rgba(255,255,255,0.1)';
    rrect(c, x, y, bw, bh, bh / 2);
    c.fill();
    for (let i = 0; i < 3; i++) {
      const k = 0.35 + 0.65 * Math.max(0, Math.sin(time * 5 - i * 0.9));
      c.fillStyle = `rgba(255,255,255,${k.toFixed(3)})`;
      c.beginPath();
      c.arc(w / 2 + (i - 1) * 4.5 * u, y + bh / 2, 1.3 * u, 0, Math.PI * 2);
      c.fill();
    }
    return;
  }
  const ok = res === 'pass';
  c.fillStyle = ok ? '#1f9d55' : '#d64d39';
  rrect(c, x, y, bw, bh, bh / 2);
  c.fill();
  c.strokeStyle = '#fff';
  c.lineWidth = 1.4 * u;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const ix = x + 8 * u;
  const iy = y + bh / 2;
  c.beginPath();
  if (ok) {
    c.moveTo(ix - 2.4 * u, iy);
    c.lineTo(ix - 0.6 * u, iy + 1.9 * u);
    c.lineTo(ix + 2.8 * u, iy - 2 * u);
  } else {
    c.moveTo(ix - 2 * u, iy - 2 * u);
    c.lineTo(ix + 2 * u, iy + 2 * u);
    c.moveTo(ix + 2 * u, iy - 2 * u);
    c.lineTo(ix - 2 * u, iy + 2 * u);
  }
  c.stroke();
  fitText(f, t(ok ? 'ui.pearos.pass' : 'ui.pearos.fail'), w / 2 + 4 * u, iy + 0.2 * u, 5, bw - 18 * u, '#fff', 800);
}

function darkBg(f: Frame, tint = '#101826'): void {
  const { c, w, h } = f;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, tint);
  g.addColorStop(1, '#05080d');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------------ screens */

function drawOff(f: Frame): void {
  const { c, w, h } = f;
  c.fillStyle = '#020203';
  c.fillRect(0, 0, w, h);
  const g = c.createLinearGradient(0, 0, w, h * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.012)');
  g.addColorStop(0.36, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

function drawBacklight(f: Frame): void {
  const { c, w, h, time } = f;
  c.fillStyle = '#050608';
  c.fillRect(0, 0, w, h);
  const flick = 0.82 + 0.1 * Math.sin(time * 2.1) + 0.08 * (hash(Math.floor(time * 9)) - 0.5);
  const g = c.createRadialGradient(w / 2, h * 0.55, w * 0.1, w / 2, h * 0.55, h * 0.75);
  g.addColorStop(0, `rgba(96, 104, 128, ${(0.5 * flick).toFixed(3)})`);
  g.addColorStop(0.6, `rgba(48, 54, 72, ${(0.4 * flick).toFixed(3)})`);
  g.addColorStop(1, 'rgba(20, 22, 30, 0.2)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // light bleeding from the LED edge at the bottom
  const b = c.createLinearGradient(0, h, 0, h * 0.84);
  b.addColorStop(0, `rgba(170, 180, 210, ${(0.35 * flick).toFixed(3)})`);
  b.addColorStop(1, 'rgba(170, 180, 210, 0)');
  c.fillStyle = b;
  c.fillRect(0, h * 0.84, w, h * 0.16);
}

function drawBoot(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  c.fillStyle = '#000';
  c.fillRect(0, 0, w, h);
  const glow = c.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.5);
  glow.addColorStop(0, 'rgba(255,255,255,0.07)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);
  drawPearLogo(c, w / 2, h * 0.45, 30 * u, '#f5f5f7');
  const p = s.progress ?? (time * 0.18) % 1.15;
  const bw = 40 * u;
  const by = h * 0.45 + 27 * u;
  c.fillStyle = 'rgba(255,255,255,0.18)';
  rrect(c, w / 2 - bw / 2, by, bw, 1.3 * u, 0.65 * u);
  c.fill();
  c.fillStyle = '#f5f5f7';
  rrect(c, w / 2 - bw / 2, by, bw * clamp01(p), 1.3 * u, 0.65 * u);
  c.fill();
}

function wallpaper(f: Frame): void {
  const { c, w, h, u, time } = f;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#16345a');
  g.addColorStop(0.3, '#e0607e');
  g.addColorStop(0.52, '#ffb35c');
  g.addColorStop(0.6, '#ffd98a');
  g.addColorStop(0.62, '#19b7c4');
  g.addColorStop(1, '#0a4f7a');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // sun
  const sy = h * 0.57;
  const sg = c.createRadialGradient(w * 0.5, sy, 0, w * 0.5, sy, 30 * u);
  sg.addColorStop(0, 'rgba(255, 250, 220, 0.95)');
  sg.addColorStop(0.3, 'rgba(255, 226, 150, 0.6)');
  sg.addColorStop(1, 'rgba(255, 226, 150, 0)');
  c.fillStyle = sg;
  c.fillRect(0, sy - 30 * u, w, 31.5 * u);
  // karst islands
  c.fillStyle = 'rgba(40, 46, 86, 0.75)';
  c.beginPath();
  c.moveTo(4 * u, h * 0.615);
  c.quadraticCurveTo(10 * u, h * 0.54, 18 * u, h * 0.56);
  c.quadraticCurveTo(24 * u, h * 0.52, 30 * u, h * 0.615);
  c.fill();
  c.beginPath();
  c.moveTo(70 * u, h * 0.615);
  c.quadraticCurveTo(78 * u, h * 0.555, 84 * u, h * 0.575);
  c.quadraticCurveTo(92 * u, h * 0.59, 96 * u, h * 0.615);
  c.fill();
  // waves
  for (let i = 0; i < 5; i++) {
    const y0 = h * (0.66 + i * 0.075);
    c.fillStyle = `rgba(255,255,255,${(0.1 - i * 0.012).toFixed(3)})`;
    c.beginPath();
    c.moveTo(0, y0);
    for (let x = 0; x <= w; x += w / 16) c.lineTo(x, y0 + Math.sin(x / (9 * u) + time * (0.7 + i * 0.2) + i * 1.7) * 1.3 * u);
    c.lineTo(w, y0 + 5 * u);
    c.lineTo(0, y0 + 5 * u);
    c.fill();
  }
}

type Glyph = (c: Ctx, s: number) => void;

const APPS: Array<{ key: string; a: string; b: string; glyph: Glyph }> = [
  {
    key: 'phone',
    a: '#5fe08a',
    b: '#1f9d55',
    glyph: (c, s) => {
      c.lineWidth = s * 0.17;
      c.beginPath();
      c.arc(s * 0.1, -s * 0.1, s * 0.42, Math.PI * 0.62, Math.PI * 1.02);
      c.stroke();
      c.lineWidth = s * 0.26;
      c.beginPath();
      c.arc(s * 0.1, -s * 0.1, s * 0.42, Math.PI * 0.53, Math.PI * 0.64);
      c.stroke();
      c.beginPath();
      c.arc(s * 0.1, -s * 0.1, s * 0.42, Math.PI * 1.0, Math.PI * 1.11);
      c.stroke();
    },
  },
  {
    key: 'messages',
    a: '#6fe6dd',
    b: TEAL,
    glyph: (c, s) => {
      c.beginPath();
      c.ellipse(0, -s * 0.05, s * 0.4, s * 0.31, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(-s * 0.3, s * 0.1);
      c.lineTo(-s * 0.36, s * 0.38);
      c.lineTo(-s * 0.05, s * 0.22);
      c.fill();
    },
  },
  {
    key: 'photos',
    a: '#ffffff',
    b: '#e9edf2',
    glyph: (c, s) => {
      const cols = [CORAL, GOLD, GREEN, TEAL, '#6aa5ff', '#b68cf0'];
      cols.forEach((col, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        c.fillStyle = col;
        c.globalAlpha = 0.85;
        c.beginPath();
        c.ellipse(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2, s * 0.22, s * 0.13, a, 0, Math.PI * 2);
        c.fill();
      });
      c.globalAlpha = 1;
    },
  },
  {
    key: 'camera',
    a: '#9aa3ad',
    b: '#555d67',
    glyph: (c, s) => {
      rrect(c, -s * 0.4, -s * 0.24, s * 0.8, s * 0.54, s * 0.1);
      c.fill();
      rrect(c, -s * 0.16, -s * 0.34, s * 0.32, s * 0.14, s * 0.04);
      c.fill();
      c.fillStyle = '#555d67';
      c.beginPath();
      c.arc(0, s * 0.03, s * 0.16, 0, Math.PI * 2);
      c.fill();
    },
  },
  {
    key: 'maps',
    a: '#8fe3a0',
    b: '#3aa76d',
    glyph: (c, s) => {
      c.beginPath();
      c.arc(0, -s * 0.1, s * 0.24, Math.PI, 0);
      c.quadraticCurveTo(s * 0.22, s * 0.12, 0, s * 0.4);
      c.quadraticCurveTo(-s * 0.22, s * 0.12, -s * 0.24, -s * 0.1);
      c.fill();
      c.fillStyle = '#3aa76d';
      c.beginPath();
      c.arc(0, -s * 0.1, s * 0.09, 0, Math.PI * 2);
      c.fill();
    },
  },
  {
    key: 'weather',
    a: '#7cc4ff',
    b: '#2f7fd6',
    glyph: (c, s) => {
      c.fillStyle = GOLD;
      c.beginPath();
      c.arc(s * 0.14, -s * 0.14, s * 0.2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(-s * 0.16, s * 0.12, s * 0.17, 0, Math.PI * 2);
      c.arc(s * 0.04, s * 0.06, s * 0.21, 0, Math.PI * 2);
      c.arc(s * 0.22, s * 0.14, s * 0.15, 0, Math.PI * 2);
      c.fill();
    },
  },
  {
    key: 'music',
    a: '#ff8f7d',
    b: '#e2452f',
    glyph: (c, s) => {
      c.beginPath();
      c.ellipse(-s * 0.18, s * 0.26, s * 0.14, s * 0.1, -0.3, 0, Math.PI * 2);
      c.ellipse(s * 0.22, s * 0.18, s * 0.14, s * 0.1, -0.3, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = s * 0.08;
      c.beginPath();
      c.moveTo(-s * 0.06, s * 0.26);
      c.lineTo(-s * 0.06, -s * 0.26);
      c.lineTo(s * 0.34, -s * 0.36);
      c.lineTo(s * 0.34, s * 0.18);
      c.stroke();
    },
  },
  {
    key: 'notes',
    a: '#ffe08a',
    b: '#f2b632',
    glyph: (c, s) => {
      c.lineWidth = s * 0.08;
      c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(-s * 0.3, -s * 0.2 + i * s * 0.22);
        c.lineTo(i === 2 ? s * 0.06 : s * 0.3, -s * 0.2 + i * s * 0.22);
        c.stroke();
      }
    },
  },
  {
    key: 'clock',
    a: '#2c3440',
    b: '#0c1016',
    glyph: (c, s) => {
      c.beginPath();
      c.arc(0, 0, s * 0.38, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#0c1016';
      c.lineWidth = s * 0.07;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(0, -s * 0.24);
      c.lineTo(0, 0);
      c.lineTo(s * 0.17, s * 0.1);
      c.stroke();
    },
  },
  {
    key: 'settings',
    a: '#b9c0c9',
    b: '#727b86',
    glyph: (c, s) => {
      c.lineWidth = s * 0.14;
      c.beginPath();
      c.arc(0, 0, s * 0.23, 0, Math.PI * 2);
      c.stroke();
      c.lineCap = 'round';
      c.lineWidth = s * 0.12;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.beginPath();
        c.moveTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3);
        c.lineTo(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4);
        c.stroke();
      }
    },
  },
  {
    key: 'mail',
    a: '#7ab8ff',
    b: '#2468d8',
    glyph: (c, s) => {
      rrect(c, -s * 0.38, -s * 0.25, s * 0.76, s * 0.5, s * 0.07);
      c.fill();
      c.strokeStyle = '#2468d8';
      c.lineWidth = s * 0.06;
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(-s * 0.36, -s * 0.22);
      c.lineTo(0, s * 0.06);
      c.lineTo(s * 0.36, -s * 0.22);
      c.stroke();
    },
  },
  {
    key: 'calendar',
    a: '#ffffff',
    b: '#eef0f3',
    glyph: (c, s) => {
      c.fillStyle = CORAL;
      rrect(c, -s * 0.36, -s * 0.38, s * 0.72, s * 0.2, s * 0.05);
      c.fill();
      c.fillStyle = '#17324d';
      c.font = `800 ${s * 0.52}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('11', 0, s * 0.13);
    },
  },
];

function appIcon(f: Frame, app: (typeof APPS)[number], x: number, y: number, size: number, label: boolean): void {
  const c = f.c;
  c.fillStyle = 'rgba(0,0,0,0.22)';
  rrect(c, x - size / 2, y - size / 2 + size * 0.06, size, size, size * 0.24);
  c.fill();
  const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  g.addColorStop(0, app.a);
  g.addColorStop(1, app.b);
  c.fillStyle = g;
  rrect(c, x - size / 2, y - size / 2, size, size, size * 0.24);
  c.fill();
  c.save();
  c.translate(x, y);
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  app.glyph(c, size);
  c.restore();
  if (label) {
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = f.u * 1.2;
    fitText(f, t(`ui.pearos.apps.${app.key}`), x, y + size * 0.76, 3, size * 1.35, '#fff', 700);
    c.shadowBlur = 0;
  }
}

function drawHome(f: Frame): void {
  const { c, w, h, u } = f;
  wallpaper(f);
  statusBar(f, '#fff');
  const size = 15 * u;
  const gapX = (w - 4 * size) / 5;
  const rowH = size * 1.62;
  const dockH = 23 * u;
  const dockY = h - dockH - (f.s.notch ? 6 : 3) * u;
  const y0 = f.top + 4 * u + size / 2;
  const rows = Math.max(1, Math.min(3, Math.floor((dockY - 8 * u - y0 + rowH * 0.4) / rowH)));
  for (let i = 0; i < rows * 4 && i < 8; i++) {
    const app = APPS[4 + i] as (typeof APPS)[number];
    appIcon(f, app, gapX + size / 2 + (i % 4) * (size + gapX), y0 + Math.floor(i / 4) * rowH, size, true);
  }
  // page dots
  for (let i = 0; i < 3; i++) {
    c.fillStyle = i === 0 ? '#fff' : 'rgba(255,255,255,0.45)';
    c.beginPath();
    c.arc(w / 2 + (i - 1) * 3.4 * u, dockY - 4.5 * u, 0.9 * u, 0, Math.PI * 2);
    c.fill();
  }
  // dock
  c.fillStyle = 'rgba(255,255,255,0.26)';
  rrect(c, 3.5 * u, dockY, w - 7 * u, dockH, 7.5 * u);
  c.fill();
  for (let i = 0; i < 4; i++) appIcon(f, APPS[i] as (typeof APPS)[number], gapX + size / 2 + i * (size + gapX), dockY + dockH / 2, size, false);
  homeIndicator(f, 'rgba(255,255,255,0.9)');
}

function drawPowerOff(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  wallpaper(f);
  c.fillStyle = 'rgba(8, 12, 20, 0.78)';
  c.fillRect(0, 0, w, h);
  statusBar(f, 'rgba(255,255,255,0.8)');
  const tw = w - 16 * u;
  const th = 17 * u;
  const tx = 8 * u;
  const ty = f.top + 16 * u;
  c.fillStyle = 'rgba(255,255,255,0.16)';
  rrect(c, tx, ty, tw, th, th / 2);
  c.fill();
  const p = clamp01(s.progress ?? 0);
  // shimmering hint
  const label = t('ui.pearos.slide');
  c.save();
  rrect(c, tx + th, ty, tw - th - 2 * u, th, th / 2);
  c.clip();
  c.globalAlpha = 1 - p;
  const sh = c.createLinearGradient(tx, 0, tx + tw, 0);
  const k = (time * 0.45) % 1.4;
  sh.addColorStop(clamp01(k - 0.25), 'rgba(255,255,255,0.45)');
  sh.addColorStop(clamp01(k), 'rgba(255,255,255,1)');
  sh.addColorStop(clamp01(k + 0.25), 'rgba(255,255,255,0.45)');
  c.font = `600 ${4.6 * u}px ${FONT}`;
  const m = c.measureText(label).width;
  const maxW = tw - th - 6 * u;
  const fs = m > maxW ? (4.6 * maxW) / m : 4.6;
  c.font = `600 ${fs * u}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = sh;
  c.fillText(label, tx + th + (tw - th) / 2 - 1 * u, ty + th / 2);
  c.restore();
  // knob
  const kx = tx + th / 2 + (tw - th) * p;
  const ky = ty + th / 2;
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(kx, ky, th / 2 - 1.3 * u, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#e2452f';
  c.lineWidth = 1.3 * u;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(kx, ky + 0.3 * u, 3.1 * u, -Math.PI * 0.28, Math.PI * 1.28);
  c.stroke();
  c.beginPath();
  c.moveTo(kx, ky - 3.6 * u);
  c.lineTo(kx, ky - 0.2 * u);
  c.stroke();
  // cancel
  const cy = h - 30 * u;
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.beginPath();
  c.arc(w / 2, cy, 8.5 * u, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#fff';
  c.lineWidth = 1.2 * u;
  c.beginPath();
  c.moveTo(w / 2 - 2.8 * u, cy - 2.8 * u);
  c.lineTo(w / 2 + 2.8 * u, cy + 2.8 * u);
  c.moveTo(w / 2 + 2.8 * u, cy - 2.8 * u);
  c.lineTo(w / 2 - 2.8 * u, cy + 2.8 * u);
  c.stroke();
  text(f, t('ui.pearos.cancel'), w / 2, cy + 13.5 * u, 4, '#fff', 600);
  homeIndicator(f, 'rgba(255,255,255,0.7)');
}

const TOUCH_COLS = 5;
const TOUCH_ROWS = 9;
/** Number of cells of the touch-test grid (row-major indices for `deadCells`). */
export const TOUCH_TEST_CELLS = TOUCH_COLS * TOUCH_ROWS;

function drawTouch(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  darkBg(f);
  statusBar(f, '#fff');
  fitText(f, t('ui.pearos.touch'), w / 2, f.top + 6 * u, 5.4, w * 0.8, '#f4f7fb', 800);
  const total = TOUCH_COLS * TOUCH_ROWS;
  const p = s.progress ?? clamp01(((time * 0.22) % 1.3) / 1);
  const gx = 5 * u;
  const gy = f.top + 13 * u;
  const gw = w - 10 * u;
  const gh = h - gy - 24 * u;
  const cw = gw / TOUCH_COLS;
  const ch = gh / TOUCH_ROWS;
  const dead = new Set(s.deadCells ?? []);
  const lit = p * total;
  let done = 0;
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / TOUCH_COLS);
    const colRaw = i % TOUCH_COLS;
    // snake order: the finger sweeps left→right, then right→left
    const order = row * TOUCH_COLS + (row % 2 === 0 ? colRaw : TOUCH_COLS - 1 - colRaw);
    const x = gx + colRaw * cw;
    const y = gy + row * ch;
    const isDead = dead.has(i);
    const on = !isDead && order < lit;
    if (on) done++;
    const fresh = on ? clamp01(1 - (lit - order) / 3) : 0;
    rrect(c, x + 0.7 * u, y + 0.7 * u, cw - 1.4 * u, ch - 1.4 * u, 1.6 * u);
    if (on) {
      c.fillStyle = fresh > 0 ? `rgba(120, 240, 228, ${(0.75 + 0.25 * fresh).toFixed(3)})` : 'rgba(24, 184, 176, 0.85)';
      c.fill();
    } else if (isDead && order < lit) {
      c.fillStyle = 'rgba(255, 111, 89, 0.22)';
      c.fill();
      c.strokeStyle = CORAL;
      c.lineWidth = 0.5 * u;
      c.stroke();
      c.beginPath();
      c.moveTo(x + cw / 2 - 2 * u, y + ch / 2 - 2 * u);
      c.lineTo(x + cw / 2 + 2 * u, y + ch / 2 + 2 * u);
      c.moveTo(x + cw / 2 + 2 * u, y + ch / 2 - 2 * u);
      c.lineTo(x + cw / 2 - 2 * u, y + ch / 2 + 2 * u);
      c.lineWidth = 0.8 * u;
      c.stroke();
    } else {
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.22)';
      c.lineWidth = 0.35 * u;
      c.stroke();
    }
  }
  // finger position
  if (p > 0 && p < 1) {
    const idx = Math.min(total - 1, Math.floor(lit));
    const row = Math.floor(idx / TOUCH_COLS);
    const col = row % 2 === 0 ? idx % TOUCH_COLS : TOUCH_COLS - 1 - (idx % TOUCH_COLS);
    const fx = gx + (col + 0.5) * cw;
    const fy = gy + (row + 0.5) * ch;
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 0.6 * u;
    c.beginPath();
    c.arc(fx, fy, 4 * u + Math.sin(time * 9) * 0.5 * u, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fill();
  }
  const fy2 = h - 20 * u;
  if ((s.result ?? 'running') === 'running') {
    text(f, `${done} / ${total}`, w / 2, fy2 + 3 * u, 5, '#fff', 800);
    fitText(f, t('ui.pearos.touchHint'), w / 2, fy2 + 9.5 * u, 3.4, w * 0.84, 'rgba(255,255,255,0.6)', 600);
  } else resultBadge(f, fy2);
  homeIndicator(f, 'rgba(255,255,255,0.6)');
}

function drawTrueTone(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  const fail = s.result === 'fail';
  const k = fail ? 0 : 0.5 + 0.5 * Math.sin(time * 1.4);
  const cool = [236, 242, 255];
  const warm = [255, 232, 196];
  const mix = cool.map((v, i) => Math.round(v + ((warm[i] as number) - v) * k));
  c.fillStyle = `rgb(${mix.join(',')})`;
  c.fillRect(0, 0, w, h);
  statusBar(f, '#1c2430');
  fitText(f, t('ui.pearos.trueTone'), w / 2, f.top + 8 * u, 6.2, w * 0.8, '#1c2430', 800);
  // paper sample card
  const cy = h * 0.42;
  c.fillStyle = 'rgba(0,0,0,0.08)';
  rrect(c, 14 * u, cy - 19 * u, 72 * u, 42 * u, 5 * u);
  c.fill();
  c.fillStyle = '#fff';
  rrect(c, 14 * u, cy - 21 * u, 72 * u, 42 * u, 5 * u);
  c.fill();
  // colour chips
  const chips = ['#ff6f59', '#ffc145', '#4fd17a', '#18b8b0', '#5b8def', '#b68cf0'];
  chips.forEach((col, i) => {
    c.fillStyle = col;
    rrect(c, 19 * u + i * 10.6 * u, cy - 15 * u, 8.6 * u, 8.6 * u, 2 * u);
    c.fill();
  });
  for (let i = 0; i < 6; i++) {
    const v = Math.round(40 + i * 40);
    c.fillStyle = `rgb(${v},${v},${v})`;
    rrect(c, 19 * u + i * 10.6 * u, cy - 3.5 * u, 8.6 * u, 5 * u, 1.2 * u);
    c.fill();
  }
  c.fillStyle = '#c8ced6';
  rrect(c, 19 * u, cy + 6 * u, 50 * u, 2.2 * u, 1.1 * u);
  c.fill();
  rrect(c, 19 * u, cy + 11 * u, 34 * u, 2.2 * u, 1.1 * u);
  c.fill();
  // ambient sensor slider
  const sy = h * 0.66;
  const g = c.createLinearGradient(14 * u, 0, 86 * u, 0);
  g.addColorStop(0, '#cfe0ff');
  g.addColorStop(1, '#ffcf8f');
  c.fillStyle = g;
  rrect(c, 14 * u, sy, 72 * u, 3 * u, 1.5 * u);
  c.fill();
  c.fillStyle = '#fff';
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 0.5 * u;
  c.beginPath();
  c.arc(14 * u + 72 * u * k, sy + 1.5 * u, 3.6 * u, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  fitText(f, t(fail ? 'ui.pearos.trueToneOff' : 'ui.pearos.trueToneOn'), w / 2, sy + 10 * u, 4.2, w * 0.8, fail ? '#c0392b' : '#49566a', 700);
  resultBadge(f, h - 22 * u);
  homeIndicator(f, 'rgba(0,0,0,0.5)');
}

function drawBiometric(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  darkBg(f, '#121a2b');
  statusBar(f, '#fff');
  const res = s.result ?? 'running';
  const face = s.notch;
  fitText(f, t(face ? 'ui.pearos.faceId' : 'ui.pearos.touchId'), w / 2, f.top + 8 * u, 6.2, w * 0.8, '#f4f7fb', 800);
  const cx = w / 2;
  const cy = h * 0.44;
  const R0 = 24 * u;
  const p = s.progress ?? (res === 'running' ? (time * 0.35) % 1 : 1);
  const col = res === 'fail' ? CORAL : res === 'pass' ? GREEN : '#6fe6dd';
  c.lineCap = 'round';
  if (face) {
    // corner brackets
    c.strokeStyle = col;
    c.lineWidth = 1.5 * u;
    const b = R0 * 1.05;
    const L = 8 * u;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as Array<[number, number]>) {
      c.beginPath();
      c.moveTo(cx + sx * b, cy + sy * (b - L));
      c.quadraticCurveTo(cx + sx * b, cy + sy * b, cx + sx * (b - L), cy + sy * b);
      c.stroke();
    }
    // face
    c.strokeStyle = '#f4f7fb';
    c.lineWidth = 1.5 * u;
    c.beginPath();
    c.moveTo(cx - 8 * u, cy - 8 * u);
    c.lineTo(cx - 8 * u, cy - 3.5 * u);
    c.moveTo(cx + 8 * u, cy - 8 * u);
    c.lineTo(cx + 8 * u, cy - 3.5 * u);
    c.moveTo(cx + 0.5 * u, cy - 7 * u);
    c.lineTo(cx + 0.5 * u, cy + 3 * u);
    c.lineTo(cx - 2.5 * u, cy + 3 * u);
    c.stroke();
    c.beginPath();
    if (res === 'fail') c.arc(cx, cy + 15 * u, 8 * u, Math.PI * 1.2, Math.PI * 1.8);
    else c.arc(cx, cy + 3 * u, 10 * u, Math.PI * 0.22, Math.PI * 0.78);
    c.stroke();
    // scan line + dots
    if (res === 'running') {
      const yy = cy - b + 2 * b * (0.5 + 0.5 * Math.sin(time * 2.6));
      const g = c.createLinearGradient(0, yy - 5 * u, 0, yy + 5 * u);
      g.addColorStop(0, 'rgba(111, 230, 221, 0)');
      g.addColorStop(0.5, 'rgba(111, 230, 221, 0.55)');
      g.addColorStop(1, 'rgba(111, 230, 221, 0)');
      c.fillStyle = g;
      c.fillRect(cx - b, yy - 5 * u, b * 2, 10 * u);
      for (let i = 0; i < 40; i++) {
        const a = hash(i) * Math.PI * 2;
        const r = Math.sqrt(hash(i + 50)) * b * 0.9;
        const tw = 0.5 + 0.5 * Math.sin(time * 4 + i);
        c.fillStyle = `rgba(111, 230, 221, ${(0.5 * tw).toFixed(3)})`;
        c.beginPath();
        c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.5 * u, 0, Math.PI * 2);
        c.fill();
      }
    }
  } else {
    // fingerprint ridges filling from the bottom
    const ridges = 7;
    for (let i = 0; i < ridges; i++) {
      const r = (4 + i * 3.1) * u;
      const a0 = Math.PI * (1.08 - i * 0.012) + Math.sin(i * 2.3) * 0.12;
      const a1 = Math.PI * (1.92 + i * 0.012) + Math.cos(i * 1.7) * 0.12;
      for (const pass of [0, 1]) {
        c.strokeStyle = pass === 0 ? 'rgba(255,255,255,0.16)' : col;
        c.lineWidth = 1.5 * u;
        c.save();
        if (pass === 1) {
          c.beginPath();
          const top = cy + R0 - 2 * R0 * clamp01(p);
          c.rect(cx - R0 * 1.2, top, R0 * 2.4, 2 * R0);
          c.clip();
        }
        c.beginPath();
        c.arc(cx, cy + 2 * u, r, a0, a1);
        c.stroke();
        if (i > 0) {
          c.beginPath();
          c.moveTo(cx - r, cy + 2 * u);
          c.lineTo(cx - r * (1 - 0.02 * i), cy + 2 * u + Math.min(16 * u, (20 - i * 2.2) * u));
          c.moveTo(cx + r, cy + 2 * u);
          c.lineTo(cx + r * (1 - 0.02 * i), cy + 2 * u + Math.min(16 * u, (18 - i * 1.6) * u));
          c.stroke();
        }
        c.restore();
      }
    }
  }
  // progress ring
  c.lineWidth = 1.2 * u;
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.beginPath();
  c.arc(cx, cy, R0 * 1.42, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = col;
  c.beginPath();
  c.arc(cx, cy, R0 * 1.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(p));
  c.stroke();
  fitText(f, t(res === 'fail' ? 'ui.pearos.bioFail' : res === 'pass' ? 'ui.pearos.pass' : 'ui.pearos.bioHint'), cx, cy + R0 * 1.42 + 9 * u, 4.2, w * 0.84, res === 'fail' ? '#ff9c8c' : 'rgba(255,255,255,0.7)', 600);
  resultBadge(f, h - 22 * u);
  homeIndicator(f, 'rgba(255,255,255,0.6)');
}

function drawCamera(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  const front = s.camera === 'front';
  const fail = s.result === 'fail';
  c.fillStyle = '#000';
  c.fillRect(0, 0, w, h);
  const vy = f.top + 12 * u;
  const vh = h - vy - 34 * u;
  c.save();
  c.beginPath();
  c.rect(0, vy, w, vh);
  c.clip();
  if (fail) {
    c.fillStyle = '#07080a';
    c.fillRect(0, vy, w, vh);
    const cell = 3 * u;
    const seed = Math.floor(time * 14);
    for (let y = vy; y < vy + vh; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const n = hash(x * 0.37 + y * 1.13 + seed * 7.7);
        if (n > 0.8) {
          c.fillStyle = `rgba(255,255,255,${((n - 0.8) * 0.5).toFixed(3)})`;
          c.fillRect(x, y, cell, cell);
        }
      }
    }
    fitText(f, t('ui.pearos.noSignal'), w / 2, vy + vh / 2, 5, w * 0.8, 'rgba(255,255,255,0.75)', 700);
  } else {
    // live view: the beach outside the stall, gently swaying
    const sway = Math.sin(time * 0.8) * 1.2 * u;
    const hor = vy + vh * 0.52 + Math.sin(time * 0.6) * 0.6 * u;
    const sky = c.createLinearGradient(0, vy, 0, hor);
    sky.addColorStop(0, '#4fb4e6');
    sky.addColorStop(1, '#c9eef5');
    c.fillStyle = sky;
    c.fillRect(0, vy, w, hor - vy);
    c.fillStyle = '#fff6cf';
    c.beginPath();
    c.arc(w * 0.76 + sway, vy + vh * 0.16, 5 * u, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#5d8f86';
    c.beginPath();
    c.moveTo(6 * u + sway, hor);
    c.quadraticCurveTo(14 * u + sway, hor - 15 * u, 22 * u + sway, hor - 11 * u);
    c.quadraticCurveTo(30 * u + sway, hor - 17 * u, 38 * u + sway, hor);
    c.fill();
    const sea = c.createLinearGradient(0, hor, 0, vy + vh * 0.74);
    sea.addColorStop(0, '#0e86ad');
    sea.addColorStop(1, '#27c9c4');
    c.fillStyle = sea;
    c.fillRect(0, hor, w, vh * 0.24);
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 0.4 * u;
    for (let i = 0; i < 4; i++) {
      const yy = hor + (2 + i * 4.5) * u;
      c.beginPath();
      for (let x = 0; x <= w; x += w / 14) {
        const y2 = yy + Math.sin(x / (7 * u) + time * 1.2 + i) * 0.6 * u;
        if (x === 0) c.moveTo(x, y2);
        else c.lineTo(x, y2);
      }
      c.stroke();
    }
    const sand = c.createLinearGradient(0, vy + vh * 0.74, 0, vy + vh);
    sand.addColorStop(0, '#f6e7c8');
    sand.addColorStop(1, '#dfc08a');
    c.fillStyle = sand;
    c.fillRect(0, vy + vh * 0.74, w, vh * 0.26);
    if (front) {
      // selfie: a cheerful head and shoulders
      const hx = w / 2 + sway * 0.6;
      const hy = vy + vh * 0.5;
      c.fillStyle = '#18b8b0';
      c.beginPath();
      c.ellipse(hx, vy + vh + 4 * u, 34 * u, 30 * u, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#e9b98c';
      c.fillRect(hx - 5 * u, hy + 12 * u, 10 * u, 12 * u);
      c.beginPath();
      c.ellipse(hx, hy, 15 * u, 17 * u, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#3b2a20';
      c.beginPath();
      c.ellipse(hx, hy - 9 * u, 16 * u, 10.5 * u, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = '#2a1d16';
      const blink = Math.sin(time * 0.9) > 0.97 ? 0.2 : 1;
      c.beginPath();
      c.ellipse(hx - 5.5 * u, hy - 1 * u, 1.4 * u, 1.7 * u * blink, 0, 0, Math.PI * 2);
      c.ellipse(hx + 5.5 * u, hy - 1 * u, 1.4 * u, 1.7 * u * blink, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#2a1d16';
      c.lineWidth = 1 * u;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(hx, hy + 4 * u, 5.5 * u, Math.PI * 0.18, Math.PI * 0.82);
      c.stroke();
    } else {
      // palm tree and a long-tail boat
      c.strokeStyle = '#6b4229';
      c.lineWidth = 2.2 * u;
      c.lineCap = 'round';
      const px = 80 * u + sway;
      c.beginPath();
      c.moveTo(px + 4 * u, vy + vh);
      c.quadraticCurveTo(px + 6 * u, vy + vh * 0.6, px, vy + vh * 0.34);
      c.stroke();
      c.strokeStyle = '#2f8f4b';
      c.lineWidth = 1.8 * u;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.95 + (i / 5) * Math.PI * 0.9 + Math.sin(time * 1.3 + i) * 0.05;
        c.beginPath();
        c.moveTo(px, vy + vh * 0.34);
        c.quadraticCurveTo(px + Math.cos(a) * 9 * u, vy + vh * 0.34 + Math.sin(a) * 9 * u - 3 * u, px + Math.cos(a) * 17 * u, vy + vh * 0.34 + Math.sin(a) * 12 * u + 4 * u);
        c.stroke();
      }
      const bx = 34 * u + ((time * 1.2 * u) % (20 * u));
      c.fillStyle = '#8a5a3c';
      c.beginPath();
      c.moveTo(bx, hor + 7 * u);
      c.lineTo(bx + 20 * u, hor + 7 * u);
      c.lineTo(bx + 24 * u, hor + 4.5 * u);
      c.lineTo(bx - 4 * u, hor + 3.5 * u);
      c.fill();
      c.fillStyle = CORAL;
      c.fillRect(bx + 4 * u, hor + 2.2 * u, 9 * u, 2 * u);
    }
    // focus brackets
    const fx = w / 2 + Math.sin(time * 0.7) * 3 * u;
    const fy = vy + vh * 0.48;
    const fs = (11 + Math.max(0, Math.sin(time * 1.5)) * 1.5) * u;
    c.strokeStyle = GOLD;
    c.lineWidth = 0.6 * u;
    c.strokeRect(fx - fs, fy - fs, fs * 2, fs * 2);
    // rule of thirds
    c.strokeStyle = 'rgba(255,255,255,0.22)';
    c.lineWidth = 0.25 * u;
    c.beginPath();
    for (let i = 1; i < 3; i++) {
      c.moveTo((w * i) / 3, vy);
      c.lineTo((w * i) / 3, vy + vh);
      c.moveTo(0, vy + (vh * i) / 3);
      c.lineTo(w, vy + (vh * i) / 3);
    }
    c.stroke();
  }
  c.restore();
  statusBar(f, '#fff');
  fitText(f, t(front ? 'ui.pearos.cameraFront' : 'ui.pearos.cameraRear'), w / 2, f.top + 6 * u, 4.6, w * 0.84, GOLD, 800);
  // shutter
  const sy = h - 17 * u;
  if ((s.result ?? 'running') === 'running') {
    c.strokeStyle = '#fff';
    c.lineWidth = 1.1 * u;
    c.beginPath();
    c.arc(w / 2, sy, 9 * u, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(w / 2, sy, 7.3 * u, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.2)';
    rrect(c, 10 * u, sy - 6 * u, 12 * u, 12 * u, 2.5 * u);
    c.fill();
    c.beginPath();
    c.arc(w - 16 * u, sy, 6 * u, 0, Math.PI * 2);
    c.fill();
  } else resultBadge(f, sy - 5.5 * u);
  homeIndicator(f, 'rgba(255,255,255,0.6)');
}

function speakerGlyph(f: Frame, x: number, y: number, s: number): void {
  const c = f.c;
  c.fillStyle = '#f4f7fb';
  c.beginPath();
  c.moveTo(x - s * 0.5, y - s * 0.22);
  c.lineTo(x - s * 0.2, y - s * 0.22);
  c.lineTo(x + s * 0.12, y - s * 0.5);
  c.lineTo(x + s * 0.12, y + s * 0.5);
  c.lineTo(x - s * 0.2, y + s * 0.22);
  c.lineTo(x - s * 0.5, y + s * 0.22);
  c.closePath();
  c.fill();
}

function drawSpeaker(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  darkBg(f, '#1a1630');
  statusBar(f, '#fff');
  const fail = s.result === 'fail';
  fitText(f, t('ui.pearos.speaker'), w / 2, f.top + 8 * u, 6, w * 0.84, '#f4f7fb', 800);
  const cx = w / 2 - 6 * u;
  const cy = h * 0.4;
  speakerGlyph(f, cx, cy, 26 * u);
  c.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const ph = (time * 1.4 + i * 0.25) % 1;
    const r = (10 + i * 7 + (fail ? 0 : ph * 7)) * u;
    const a = fail ? 0.12 : (1 - (i + ph) / 4.2) * 0.95;
    c.strokeStyle = `rgba(255, 193, 69, ${Math.max(0, a).toFixed(3)})`;
    c.lineWidth = 1.7 * u;
    c.beginPath();
    c.arc(cx + 2 * u, cy, r, -Math.PI * 0.3, Math.PI * 0.3);
    c.stroke();
  }
  // equaliser
  const n = 13;
  const bw = (w - 20 * u) / n;
  const base = h * 0.72;
  for (let i = 0; i < n; i++) {
    const lvl = fail ? 0.04 : (s.level ?? 1) * (0.25 + 0.75 * Math.abs(Math.sin(time * (3 + (i % 5) * 0.9) + i * 1.3) * Math.cos(time * 1.7 + i * 0.6)));
    const bh = Math.max(1.2 * u, lvl * 22 * u);
    const g = c.createLinearGradient(0, base - bh, 0, base);
    g.addColorStop(0, GOLD);
    g.addColorStop(1, CORAL);
    c.fillStyle = fail ? 'rgba(255,255,255,0.25)' : g;
    rrect(c, 10 * u + i * bw + bw * 0.18, base - bh, bw * 0.64, bh, bw * 0.3);
    c.fill();
  }
  resultBadge(f, h - 22 * u);
  homeIndicator(f, 'rgba(255,255,255,0.6)');
}

function drawMicrophone(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  darkBg(f, '#0f2430');
  statusBar(f, '#fff');
  const fail = s.result === 'fail';
  fitText(f, t('ui.pearos.mic'), w / 2, f.top + 8 * u, 6, w * 0.84, '#f4f7fb', 800);
  const cx = w / 2;
  const cy = h * 0.36;
  const lvl = fail ? 0 : (s.level ?? 0.35 + 0.65 * Math.abs(Math.sin(time * 2.3) * Math.sin(time * 0.9 + 1)));
  // level halo
  c.fillStyle = `rgba(24, 184, 176, ${(0.12 + lvl * 0.2).toFixed(3)})`;
  c.beginPath();
  c.arc(cx, cy, (17 + lvl * 9) * u, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = `rgba(24, 184, 176, ${(0.2 + lvl * 0.25).toFixed(3)})`;
  c.beginPath();
  c.arc(cx, cy, (13 + lvl * 4) * u, 0, Math.PI * 2);
  c.fill();
  // mic
  c.fillStyle = '#f4f7fb';
  rrect(c, cx - 4.5 * u, cy - 11 * u, 9 * u, 15 * u, 4.5 * u);
  c.fill();
  c.strokeStyle = '#f4f7fb';
  c.lineWidth = 1.5 * u;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(cx, cy - 1 * u, 8 * u, Math.PI * 0.05, Math.PI * 0.95);
  c.stroke();
  c.beginPath();
  c.moveTo(cx, cy + 7 * u);
  c.lineTo(cx, cy + 11 * u);
  c.moveTo(cx - 4 * u, cy + 11 * u);
  c.lineTo(cx + 4 * u, cy + 11 * u);
  c.stroke();
  // waveform
  const base = h * 0.66;
  c.strokeStyle = fail ? 'rgba(255,255,255,0.3)' : '#6fe6dd';
  c.lineWidth = 1.1 * u;
  c.lineJoin = 'round';
  c.beginPath();
  for (let i = 0; i <= 60; i++) {
    const x = 8 * u + ((w - 16 * u) * i) / 60;
    const env = Math.sin((i / 60) * Math.PI);
    const y = base + Math.sin(i * 0.55 + time * 9) * Math.sin(i * 0.17 + time * 2.2) * env * lvl * 12 * u;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  fitText(f, t(fail ? 'ui.pearos.noSignal' : 'ui.pearos.micHint'), cx, base + 17 * u, 3.8, w * 0.84, fail ? '#ff9c8c' : 'rgba(255,255,255,0.65)', 600);
  resultBadge(f, h - 22 * u);
  homeIndicator(f, 'rgba(255,255,255,0.6)');
}

function drawCharging(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  c.fillStyle = '#000';
  c.fillRect(0, 0, w, h);
  const on = s.charging !== false && s.result !== 'fail';
  const lvl = clamp01(s.battery ?? 0.46);
  const col = !on ? '#8a93a0' : lvl < 0.2 ? CORAL : GREEN;
  const cx = w / 2;
  const cy = h * 0.42;
  const bw = 56 * u;
  const bh = 27 * u;
  const pulse = on ? 0.5 + 0.5 * Math.sin(time * 2.4) : 0;
  const glow = c.createRadialGradient(cx, cy, 0, cx, cy, 55 * u);
  glow.addColorStop(0, on ? `rgba(79, 209, 122, ${(0.16 + pulse * 0.1).toFixed(3)})` : 'rgba(255,255,255,0.04)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = glow;
  c.fillRect(0, cy - 55 * u, w, 110 * u);
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 1.2 * u;
  rrect(c, cx - bw / 2, cy - bh / 2, bw, bh, 6.5 * u);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.5)';
  rrect(c, cx + bw / 2 + 1.2 * u, cy - 4.5 * u, 2.6 * u, 9 * u, 1.3 * u);
  c.fill();
  const iw = bw - 5 * u;
  c.save();
  rrect(c, cx - iw / 2, cy - bh / 2 + 2.5 * u, iw, bh - 5 * u, 4.4 * u);
  c.clip();
  c.fillStyle = col;
  c.fillRect(cx - iw / 2, cy - bh / 2, iw * lvl, bh);
  if (on) {
    // charge shimmer running through the fill
    const sx = cx - iw / 2 + ((time * 0.6) % 1) * iw * lvl;
    const sg = c.createLinearGradient(sx - 8 * u, 0, sx + 8 * u, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sg;
    c.fillRect(cx - iw / 2, cy - bh / 2, iw * lvl, bh);
  }
  c.restore();
  if (on) {
    // bolt
    c.fillStyle = '#fff';
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 0.6 * u;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(cx + 2.5 * u, cy - 9.5 * u);
    c.lineTo(cx - 6 * u, cy + 1.5 * u);
    c.lineTo(cx - 0.5 * u, cy + 1.5 * u);
    c.lineTo(cx - 2.5 * u, cy + 9.5 * u);
    c.lineTo(cx + 6 * u, cy - 1.5 * u);
    c.lineTo(cx + 0.5 * u, cy - 1.5 * u);
    c.closePath();
    c.fill();
    c.stroke();
  }
  text(f, `${Math.round(lvl * 100)}%`, cx, cy + bh / 2 + 13 * u, 11, '#fff', 800);
  fitText(f, t(on ? 'ui.pearos.charging' : 'ui.pearos.notCharging'), cx, cy + bh / 2 + 24 * u, 4.4, w * 0.8, on ? '#8fe6a4' : '#ff9c8c', 700);
  if (s.result && s.result !== 'running') resultBadge(f, h - 22 * u);
}

function drawVibration(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  darkBg(f, '#2a1630');
  statusBar(f, '#fff');
  const fail = s.result === 'fail';
  fitText(f, t('ui.pearos.vibration'), w / 2, f.top + 8 * u, 6, w * 0.84, '#f4f7fb', 800);
  const burst = fail ? 0 : (time * 1.1) % 1 < 0.6 ? 1 : 0;
  const cx = w / 2 + (burst ? Math.sin(time * 70) * 1.2 * u : 0);
  const cy = h * 0.44;
  c.save();
  c.translate(cx, cy);
  c.rotate(burst ? Math.sin(time * 55) * 0.03 : 0);
  c.fillStyle = '#f4f7fb';
  rrect(c, -10 * u, -19 * u, 20 * u, 38 * u, 4.5 * u);
  c.fill();
  c.fillStyle = '#2a1630';
  rrect(c, -8 * u, -15.5 * u, 16 * u, 29 * u, 2 * u);
  c.fill();
  c.fillStyle = '#b68cf0';
  c.beginPath();
  c.arc(0, 0, (3 + burst * Math.abs(Math.sin(time * 20)) * 2) * u, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.strokeStyle = fail ? 'rgba(255,255,255,0.15)' : '#b68cf0';
  c.lineWidth = 1.5 * u;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const a = fail ? 1 : burst ? 1 - i * 0.25 : 0.15;
      c.globalAlpha = a;
      const x = w / 2 + side * (16 + i * 6 + (burst ? Math.abs(Math.sin(time * 12 + i)) * 1.5 : 0)) * u;
      const amp = (7 - i * 1.4) * u;
      c.beginPath();
      c.moveTo(x, cy - amp * 1.5);
      c.lineTo(x + side * 2 * u, cy - amp * 0.75);
      c.lineTo(x, cy);
      c.lineTo(x + side * 2 * u, cy + amp * 0.75);
      c.lineTo(x, cy + amp * 1.5);
      c.stroke();
    }
  }
  c.globalAlpha = 1;
  resultBadge(f, h - 22 * u);
  homeIndicator(f, 'rgba(255,255,255,0.6)');
}

function drawGlitch(f: Frame): void {
  const { c, w, h, u, s, time } = f;
  const sev = clamp01(s.severity ?? 0.6);
  const step = Math.floor(time * 11);
  // torn horizontal bands of the home screen
  const bands = 7;
  let y = 0;
  for (let i = 0; i < bands; i++) {
    const bh = i === bands - 1 ? h - y : h * (0.08 + hash(i * 3.1 + Math.floor(time * 2)) * 0.14);
    const tear = hash(i * 9.7 + step) < 0.2 + sev * 0.35 ? (hash(i + step * 1.3) - 0.5) * 30 * u * sev : 0;
    c.save();
    c.beginPath();
    c.rect(0, y, w, bh);
    c.clip();
    c.translate(tear, 0);
    drawHome(f);
    if (tear !== 0) {
      c.fillStyle = hash(i + step) > 0.5 ? 'rgba(255, 0, 90, 0.16)' : 'rgba(0, 255, 200, 0.14)';
      c.fillRect(-w, y, w * 3, bh);
    }
    c.restore();
    y += bh;
    if (y >= h) break;
  }
  // stuck vertical lines (the classic "righe" of a damaged panel)
  const lines = Math.round(4 + sev * 12);
  for (let i = 0; i < lines; i++) {
    const x = hash(i * 17.3) * w;
    const lw = (0.3 + hash(i * 5.1) * 1.3) * u;
    const cols = ['#00ff9c', '#ff2bd6', '#ffffff', '#32a0ff', '#000000'];
    c.globalAlpha = 0.55 + 0.45 * hash(i * 2.2 + Math.floor(time * 5));
    c.fillStyle = cols[Math.floor(hash(i * 7.7) * cols.length)] as string;
    c.fillRect(x, 0, lw, h);
  }
  c.globalAlpha = 1;
  // a dead, flickering block
  const bx = w * 0.55;
  const bw2 = w * (0.16 + sev * 0.2);
  const g = c.createLinearGradient(bx, 0, bx + bw2, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.7, 'rgba(40, 0, 70, 0.75)');
  g.addColorStop(1, 'rgba(40, 0, 70, 0)');
  c.globalAlpha = 0.7 + 0.3 * hash(step * 0.7);
  c.fillStyle = g;
  c.fillRect(bx, 0, bw2, h);
  c.globalAlpha = 1;
  // scanline noise
  for (let i = 0; i < 26; i++) {
    const yy = hash(i * 3.3 + step * 5.1) * h;
    c.fillStyle = `rgba(255,255,255,${(0.05 + hash(i + step) * 0.12).toFixed(3)})`;
    c.fillRect(0, yy, w, 0.4 * u);
  }
  if (hash(step * 2.9) < sev * 0.18) {
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(0, 0, w, h);
  }
}

/* ------------------------------------------------------------------ entry point */

/**
 * Draw one PearOS screen into `ctx` at (0,0)–(w,h).
 * @param time seconds, drives every animation (pass the game clock; frozen time = static frame)
 */
export function drawPhoneScreen(ctx: Ctx, w: number, h: number, state: PhoneScreenState, time: number): void {
  const u = w / 100;
  const f: Frame = { c: ctx, w, h, u, time, s: state, top: (state.notch ? 11 : 7) * u };
  ctx.save();
  ctx.beginPath();
  if (state.notch) rrect(ctx, 0, 0, w, h, 11 * u);
  else ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  switch (state.kind) {
    case 'off':
      drawOff(f);
      break;
    case 'backlight':
      drawBacklight(f);
      break;
    case 'boot':
      drawBoot(f);
      break;
    case 'home':
      drawHome(f);
      break;
    case 'power_off':
      drawPowerOff(f);
      break;
    case 'test_touch':
      drawTouch(f);
      break;
    case 'test_true_tone':
      drawTrueTone(f);
      break;
    case 'test_biometric':
      drawBiometric(f);
      break;
    case 'test_camera':
      drawCamera(f);
      break;
    case 'test_speaker':
      drawSpeaker(f);
      break;
    case 'test_microphone':
      drawMicrophone(f);
      break;
    case 'charging':
      drawCharging(f);
      break;
    case 'vibration':
      drawVibration(f);
      break;
    case 'glitch':
      drawGlitch(f);
      break;
  }
  if (state.kind !== 'off' && state.kind !== 'backlight') notchCutout(f);
  ctx.restore();
}
