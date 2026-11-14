/**
 * Procedural canvas textures for phone internals. Everything is generated once and cached.
 */
import * as THREE from 'three';
import { RNG, hashString } from '../../core/rng';

const cache = new Map<string, THREE.Texture>();
let texScale = 1;

export function setPhoneTextureScale(s: number): void {
  texScale = s;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(16, Math.round(w * texScale));
  c.height = Math.max(16, Math.round(h * texScale));
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(texScale, texScale);
  return [c, ctx];
}

function finish(key: string, c: HTMLCanvasElement, srgb = true, repeat = false): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

export function disposePhoneTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

const REFS = ['U', 'C', 'R', 'L', 'FL', 'Q', 'D', 'J', 'TP', 'XW'];

/** Logic board solder mask with traces, vias, pads and silkscreen. */
export function pcbTexture(variant: 'teal' | 'navy' | 'black', seed: number): THREE.Texture {
  const key = `pcb:${variant}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 384;
  const H = 1024;
  const [c, g] = makeCanvas(W, H);
  const rng = new RNG(seed);
  const base = variant === 'teal' ? '#0f3b3a' : variant === 'navy' ? '#0c2340' : '#101418';
  const trace = variant === 'teal' ? '#1b5f58' : variant === 'navy' ? '#1a3f6e' : '#262c33';
  const traceHi = variant === 'teal' ? '#27807a' : variant === 'navy' ? '#27598f' : '#353d47';
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // subtle mask mottling
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${rng.range(0.004, 0.018)})`;
    g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(2, 30), rng.range(2, 30));
  }
  // routed traces in bundles, 45° bends
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let b = 0; b < 46; b++) {
    let x = rng.range(10, W - 10);
    let y = rng.range(10, H - 10);
    const lanes = rng.int(2, 7);
    const pitch = rng.range(3.2, 5.2);
    const horizontal = rng.chance(0.5);
    const pts: Array<[number, number]> = [[x, y]];
    const segs = rng.int(2, 5);
    let dir = horizontal ? 0 : 1;
    for (let s = 0; s < segs; s++) {
      const len = rng.range(30, 150) * (rng.chance(0.5) ? 1 : -1);
      if (dir === 0) x += len;
      else y += len;
      pts.push([x, y]);
      // 45° jog
      const j = rng.range(8, 26) * (rng.chance(0.5) ? 1 : -1);
      x += j;
      y += Math.abs(j) * (rng.chance(0.5) ? 1 : -1);
      pts.push([x, y]);
      dir = 1 - dir;
    }
    for (let l = 0; l < lanes; l++) {
      const off = (l - lanes / 2) * pitch;
      g.strokeStyle = l % 3 === 0 ? traceHi : trace;
      g.lineWidth = rng.range(1.1, 1.9);
      g.beginPath();
      pts.forEach(([px, py], i) => {
        const ox = px + off * 0.7;
        const oy = py + off * 0.7;
        if (i === 0) g.moveTo(ox, oy);
        else g.lineTo(ox, oy);
      });
      g.stroke();
    }
  }
  // vias
  for (let i = 0; i < 520; i++) {
    const x = rng.range(4, W - 4);
    const y = rng.range(4, H - 4);
    const r = rng.range(1.2, 2.2);
    g.fillStyle = '#b89a52';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#12100a';
    g.beginPath();
    g.arc(x, y, r * 0.45, 0, Math.PI * 2);
    g.fill();
  }
  // passive component footprints (tiny pads in pairs) and test points
  for (let i = 0; i < 260; i++) {
    const x = rng.range(6, W - 12);
    const y = rng.range(6, H - 12);
    const vertical = rng.chance(0.5);
    const w = rng.range(2.5, 4);
    const h = rng.range(2.5, 4);
    g.fillStyle = '#c8ae6a';
    g.fillRect(x, y, w, h);
    g.fillRect(x + (vertical ? 0 : w + 2.2), y + (vertical ? h + 2.2 : 0), w, h);
    g.fillStyle = rng.chance(0.5) ? '#5b4630' : '#1d1b1a';
    g.fillRect(x + (vertical ? 0.3 : w - 0.4), y + (vertical ? h - 0.4 : 0.3), vertical ? w - 0.6 : 3, vertical ? 3 : h - 0.6);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = '#d9c27a';
    g.beginPath();
    g.arc(rng.range(8, W - 8), rng.range(8, H - 8), rng.range(2.4, 3.4), 0, Math.PI * 2);
    g.fill();
  }
  // silkscreen
  g.fillStyle = 'rgba(235,240,240,0.82)';
  for (let i = 0; i < 120; i++) {
    g.font = `${rng.int(5, 7)}px monospace`;
    const ref = `${rng.pick(REFS)}${rng.int(1000, 9899)}`;
    g.save();
    g.translate(rng.range(4, W - 30), rng.range(8, H - 4));
    if (rng.chance(0.35)) g.rotate(-Math.PI / 2);
    g.fillText(ref, 0, 0);
    g.restore();
  }
  g.font = 'bold 9px monospace';
  g.fillText('PEAR LOGIC  820-0' + (1000 + (seed % 899)), 14, H - 14);
  g.fillText('DESIGNED ON KOH PHI PHI', 14, 22);
  g.strokeStyle = 'rgba(235,240,240,0.6)';
  g.lineWidth = 0.8;
  for (let i = 0; i < 30; i++) {
    g.strokeRect(rng.range(6, W - 60), rng.range(6, H - 60), rng.range(14, 54), rng.range(14, 54));
  }
  return finish(key, c);
}

/** 4×4 atlas of laser-etched chip markings; cell 15 is a plain package side. */
export function chipAtlasTexture(): THREE.Texture {
  const key = 'chips';
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 512;
  const [c, g] = makeCanvas(S, S);
  const rng = new RNG(4711);
  const names = ['PEAR A11', 'PMU 338S', 'TIGRIS 2', 'TRISTAR', 'NAND 64G', 'WLAN BT', 'AUDIO CX', 'NFC 100V', 'RF PA 77', 'MODEM X', 'TOUCH IC', 'BACKLGT', 'DISPLAY', 'CHARGER', 'GYRO 6A'];
  for (let i = 0; i < 16; i++) {
    const cx = (i % 4) * 128;
    const cy = Math.floor(i / 4) * 128;
    const grad = g.createLinearGradient(cx, cy, cx + 128, cy + 128);
    grad.addColorStop(0, '#1c1d20');
    grad.addColorStop(1, '#101113');
    g.fillStyle = grad;
    g.fillRect(cx, cy, 128, 128);
    for (let k = 0; k < 220; k++) {
      g.fillStyle = `rgba(255,255,255,${rng.range(0.01, 0.035)})`;
      g.fillRect(cx + rng.range(0, 127), cy + rng.range(0, 127), 1.4, 1.4);
    }
    if (i === 15) continue;
    g.fillStyle = 'rgba(190,196,204,0.62)';
    g.font = 'bold 15px monospace';
    g.textAlign = 'center';
    g.fillText(names[i] as string, cx + 64, cy + 52);
    g.font = '11px monospace';
    g.fillText(`${rng.int(1000, 9999)}${rng.pick(['A', 'B', 'K', 'T'])}${rng.int(10, 99)}`, cx + 64, cy + 72);
    g.fillText(`TH ${rng.int(17, 23)}${rng.int(10, 52)}`, cx + 64, cy + 90);
    g.beginPath();
    g.arc(cx + 18, cy + 110, 5, 0, Math.PI * 2);
    g.fill();
    // tiny stylised pear mark
    g.beginPath();
    g.ellipse(cx + 106, cy + 26, 7, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(cx + 106, cy + 15, 4, 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  return finish(key, c);
}

/** Battery wrap with a fictional label. */
export function batteryLabelTexture(capacity: string, wh: string, aspect: number): THREE.Texture {
  const key = `bat:${capacity}:${aspect.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 384;
  const H = Math.round(W * aspect);
  const [c, g] = makeCanvas(W, H);
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#17181b');
  grad.addColorStop(0.5, '#202226');
  grad.addColorStop(1, '#15161a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const rng = new RNG(hashString(capacity));
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(255,255,255,${rng.range(0.012, 0.04)})`;
    g.lineWidth = rng.range(0.6, 2);
    g.beginPath();
    const y = rng.range(0, H);
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + rng.range(-20, 20), W * 0.7, y + rng.range(-20, 20), W, y + rng.range(-14, 14));
    g.stroke();
  }
  g.fillStyle = '#e9e9e6';
  g.textAlign = 'left';
  g.font = 'bold 30px system-ui, sans-serif';
  g.fillText('Pear', 34, H * 0.2);
  g.font = '17px system-ui, sans-serif';
  g.fillText('Li-ion Polymer Battery', 34, H * 0.2 + 30);
  g.font = 'bold 22px monospace';
  g.fillText(`3.82V ⎓ ${capacity}`, 34, H * 0.2 + 66);
  g.font = '17px monospace';
  g.fillText(wh, 34, H * 0.2 + 92);
  g.font = '11px monospace';
  g.fillStyle = 'rgba(233,233,230,0.75)';
  const lines = [
    'ATTENZIONE / CAUTION / คำเตือน',
    'Non forare, non piegare, non scaldare.',
    'Do not puncture, bend or heat.',
    'Authorized Island Fix service only.',
    `Model P${1000 + (hashString(capacity) % 800)}  PCC  TH-${hashString(wh) % 9000}`,
  ];
  lines.forEach((l, i) => g.fillText(l, 34, H * 0.48 + i * 17));
  // pictograms
  const py = H * 0.74;
  for (let i = 0; i < 4; i++) {
    const px = 44 + i * 58;
    g.strokeStyle = '#e9e9e6';
    g.lineWidth = 2;
    g.strokeRect(px - 16, py - 16, 36, 36);
    g.beginPath();
    if (i === 0) {
      g.moveTo(px - 8, py + 10);
      g.lineTo(px + 2, py - 12);
      g.lineTo(px + 12, py + 10);
      g.closePath();
    } else if (i === 1) {
      g.arc(px + 2, py + 2, 11, 0, Math.PI * 2);
      g.moveTo(px - 6, py - 6);
      g.lineTo(px + 10, py + 10);
    } else if (i === 2) {
      g.moveTo(px - 8, py + 8);
      g.quadraticCurveTo(px + 2, py - 18, px + 12, py + 8);
    } else {
      g.rect(px - 7, py - 7, 18, 18);
      g.moveTo(px - 12, py + 14);
      g.lineTo(px + 16, py - 12);
    }
    g.stroke();
  }
  // barcode
  let bx = 34;
  g.fillStyle = '#e9e9e6';
  while (bx < W - 60) {
    const w = rng.pick([1, 1, 2, 3]);
    g.fillRect(bx, H * 0.88, w, 34);
    bx += w + rng.pick([1, 2, 2, 3]);
  }
  return finish(key, c);
}

/** Top-face texture of a screw head with the correct drive recess. */
export function screwHeadTexture(type: 'P2' | 'Y000' | 'PH000' | 'SO', stripped = false): THREE.Texture {
  const key = `screw:${type}:${stripped}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 96;
  const [c, g] = makeCanvas(S, S);
  const m = S / 2;
  const grad = g.createRadialGradient(m - 10, m - 12, 4, m, m, m);
  grad.addColorStop(0, type === 'SO' ? '#f3e2a8' : '#f5f6f8');
  grad.addColorStop(0.7, type === 'SO' ? '#c7a85a' : '#b9bdc4');
  grad.addColorStop(1, type === 'SO' ? '#8e7436' : '#7d828a');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // machining rings
  g.strokeStyle = 'rgba(0,0,0,0.10)';
  for (let r = 8; r < m; r += 5) {
    g.beginPath();
    g.arc(m, m, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#16171a';
  g.strokeStyle = '#16171a';
  g.lineCap = 'round';
  g.translate(m, m);
  if (stripped) {
    g.beginPath();
    g.arc(0, 0, 15, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.arc(0, 0, 9 + i, i, i + 1.4);
      g.stroke();
    }
  } else if (type === 'P2') {
    // pentalobe: five rounded lobes
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.arc(Math.cos(a) * 12, Math.sin(a) * 12, 7.2, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(0, 0, 11, 0, Math.PI * 2);
    g.fill();
  } else if (type === 'Y000') {
    g.lineWidth = 8;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
      g.stroke();
    }
  } else if (type === 'PH000') {
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(-20, 0);
    g.lineTo(20, 0);
    g.moveTo(0, -20);
    g.lineTo(0, 20);
    g.stroke();
  } else {
    // standoff: slotted hex post with a threaded hole
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(-26, 0);
    g.lineTo(26, 0);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 10, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.stroke();
  }
  return finish(key, c);
}

/** Tileable brushed-metal roughness/brightness strokes. */
export function brushedTexture(): THREE.Texture {
  const key = 'brushed';
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, S, S);
  const rng = new RNG(88);
  for (let i = 0; i < 1400; i++) {
    const v = rng.int(120, 235);
    g.strokeStyle = `rgba(${v},${v},${v},${rng.range(0.15, 0.5)})`;
    g.lineWidth = rng.range(0.4, 1.4);
    const y = rng.range(0, S);
    const x = rng.range(-40, S);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rng.range(30, 160), y + rng.range(-0.6, 0.6));
    g.stroke();
  }
  return finish(key, c, false, true);
}

/** Radial glass cracks from an impact point (transparent overlay). */
export function crackTexture(seed: number, aspect: number): THREE.Texture {
  const key = `crack:${seed}:${aspect.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 384;
  const H = Math.round(W * aspect);
  const [c, g] = makeCanvas(W, H);
  const rng = new RNG(seed);
  const ix = rng.range(W * 0.2, W * 0.8);
  const iy = rng.range(H * 0.12, H * 0.5);
  const rays: Array<Array<[number, number]>> = [];
  const n = rng.int(11, 17);
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + rng.range(-0.15, 0.15);
    let x = ix;
    let y = iy;
    const pts: Array<[number, number]> = [[x, y]];
    const steps = rng.int(8, 22);
    for (let s = 0; s < steps; s++) {
      const len = rng.range(14, 46);
      a += rng.range(-0.28, 0.28);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      pts.push([x, y]);
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) break;
    }
    rays.push(pts);
  }
  const strokeRay = (pts: Array<[number, number]>, w: number, style: string): void => {
    g.strokeStyle = style;
    g.lineWidth = w;
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.stroke();
  };
  g.lineJoin = 'bevel';
  for (const pts of rays) {
    strokeRay(pts, 2.6, 'rgba(10,12,16,0.55)');
    strokeRay(pts, 1.1, 'rgba(240,248,255,0.85)');
  }
  // concentric ring fragments
  for (let ring = 1; ring <= 5; ring++) {
    for (let i = 0; i < rays.length; i++) {
      if (rng.chance(0.42)) continue;
      const a = rays[i] as Array<[number, number]>;
      const b = rays[(i + 1) % rays.length] as Array<[number, number]>;
      const pa = a[Math.min(a.length - 1, ring)] as [number, number];
      const pb = b[Math.min(b.length - 1, ring)] as [number, number];
      strokeRay([pa, pb], 1.6, 'rgba(10,12,16,0.4)');
      strokeRay([pa, pb], 0.8, 'rgba(235,245,255,0.75)');
    }
  }
  // crushed impact point
  const grad = g.createRadialGradient(ix, iy, 0, ix, iy, 26);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(220,230,240,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(ix - 30, iy - 30, 60, 60);
  return finish(key, c);
}

/** Stylised pear logo for the back cover (white on transparent). NOT a real-world trademark. */
export function pearLogoTexture(): THREE.Texture {
  const key = 'pear';
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 128;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(64, 82, 30, 34, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(64, 48, 19, 24, 0, 0, Math.PI * 2);
  g.fill();
  // stem and leaf
  g.lineWidth = 5;
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(64, 26);
  g.quadraticCurveTo(66, 14, 72, 9);
  g.stroke();
  g.beginPath();
  g.ellipse(84, 16, 12, 6, -0.5, 0, Math.PI * 2);
  g.fill();
  return finish(key, c);
}

/** Speaker / earpiece mesh pattern (alpha holes on dark). */
export function grilleTexture(): THREE.Texture {
  const key = 'grille';
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 64;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#3b3d42';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#0b0b0d';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.beginPath();
      g.arc(x * 8 + (y % 2 ? 6 : 2), y * 8 + 4, 2.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  return finish(key, c, true, true);
}

/** Copper wireless-charging coil seen from above (rings on transparent). */
export function coilTexture(): THREE.Texture {
  const key = 'coil';
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#1b1c1f';
  g.beginPath();
  g.arc(128, 128, 126, 0, Math.PI * 2);
  g.fill();
  for (let r = 44; r < 118; r += 3.4) {
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, '#f0a868');
    grad.addColorStop(0.5, '#b86a30');
    grad.addColorStop(1, '#e89858');
    g.strokeStyle = grad;
    g.lineWidth = 2.3;
    g.beginPath();
    g.arc(128, 128, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#2a2b2f';
  g.beginPath();
  g.arc(128, 128, 40, 0, Math.PI * 2);
  g.fill();
  return finish(key, c);
}

export interface GrimeLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  /** total painted alpha at creation, used to compute the remaining fraction */
  initial: number;
}

/**
 * Per-part grime mask (sand + dust, or green/white corrosion). Not cached: the player erases it with the brush.
 */
export function createGrimeLayer(kind: 'dirt' | 'corrosion', seed: number, aspect: number, amount: number): GrimeLayer {
  const W = 128;
  const H = Math.max(24, Math.min(512, Math.round(W * aspect)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const rng = new RNG(seed);
  const blobs = Math.round((kind === 'dirt' ? 34 : 22) * (0.4 + amount) * Math.max(1, aspect * 0.6));
  for (let i = 0; i < blobs; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    const r = rng.range(8, 26) * (0.6 + amount * 0.6);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (kind === 'dirt') {
      const tone = rng.pick(['214,190,140', '196,170,120', '230,214,176', '170,150,112']);
      grad.addColorStop(0, `rgba(${tone},${rng.range(0.55, 0.9)})`);
      grad.addColorStop(1, `rgba(${tone},0)`);
    } else {
      const tone = rng.pick(['96,170,140', '150,205,180', '226,236,226', '70,140,120', '240,244,238']);
      grad.addColorStop(0, `rgba(${tone},${rng.range(0.7, 0.95)})`);
      grad.addColorStop(0.6, `rgba(${tone},${rng.range(0.3, 0.55)})`);
      grad.addColorStop(1, `rgba(${tone},0)`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // grains / crystals
  const grains = Math.round(blobs * (kind === 'dirt' ? 26 : 12));
  for (let i = 0; i < grains; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    ctx.fillStyle =
      kind === 'dirt'
        ? `rgba(${rng.int(150, 245)},${rng.int(130, 220)},${rng.int(90, 170)},${rng.range(0.5, 1)})`
        : `rgba(${rng.int(190, 250)},${rng.int(225, 250)},${rng.int(210, 240)},${rng.range(0.5, 1)})`;
    ctx.fillRect(x, y, rng.range(0.8, 2.2), rng.range(0.8, 2.2));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx, texture, initial: grimeAlpha(ctx, W, H) };
}

function grimeAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const data = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  for (let i = 3; i < data.length; i += 16) sum += data[i] as number;
  return sum;
}

/** Erases a soft circle (u,v in 0..1) and returns the remaining fraction of grime. */
export function eraseGrime(layer: GrimeLayer, u: number, v: number, radius: number, strength: number): number {
  const { canvas, ctx } = layer;
  const x = u * canvas.width;
  const y = (1 - v) * canvas.height;
  const r = radius * canvas.width;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(0,0,0,${strength})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  layer.texture.needsUpdate = true;
  if (layer.initial <= 0) return 0;
  return Math.min(1, grimeAlpha(ctx, canvas.width, canvas.height) / layer.initial);
}
