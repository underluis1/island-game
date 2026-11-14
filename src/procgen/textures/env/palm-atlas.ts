import * as THREE from 'three';
import { RNG } from '../../../core/rng';

/**
 * Foliage atlas (v = 0 is the TOP row of the canvas):
 *   u 0.00–0.44  pinnate coconut frond (rachis at u = 0.22, base at v = 1, tip at v = 0)
 *   u 0.46–0.70  broad banana-like leaf (midrib at u = 0.58)
 *   u 0.75–1.00  palm bark, tiles vertically
 */
export const ATLAS = {
  frond: { u0: 0.004, u1: 0.436, uc: 0.22 },
  leaf: { u0: 0.465, u1: 0.695, uc: 0.58 },
  bark: { u0: 0.77, u1: 0.985 },
  /** frond half-width / frond length in the texture */
  frondAspect: 0.215,
  leafAspect: 0.112,
} as const;

function drawFrond(ctx: CanvasRenderingContext2D, S: number, rng: RNG): void {
  const cx = 0.22 * S;
  const N = 60;
  const lmax = 0.214 * S;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < N; i++) {
      const s = (i + (side > 0 ? 0.5 : 0)) / N;
      if (rng.chance(0.035) && s > 0.15) continue; // a few missing leaflets
      const y = S - (0.07 + 0.905 * s) * S;
      let len = lmax * (0.5 + 0.5 * Math.min(1, s / 0.22)) * (1 - 0.82 * Math.pow(s, 2.6));
      len *= rng.range(0.9, 1.04);
      const ang = ((76 - 46 * s + rng.range(-4, 4)) * Math.PI) / 180;
      const ex = cx + side * len * Math.sin(ang);
      const ey = y - len * Math.cos(ang) + len * 0.1; // slight droop
      const w = S * 0.0098 * (1 - 0.35 * s);
      const nx = Math.cos(ang);
      const ny = Math.sin(ang);
      const mx = (cx + ex) / 2;
      const my = (y + ey) / 2 - len * 0.045;
      const tone = rng.range(0, 1);
      const dry = rng.chance(0.06);
      const grad = ctx.createLinearGradient(cx, y, ex, ey);
      if (dry) {
        grad.addColorStop(0, 'rgb(96,112,44)');
        grad.addColorStop(1, 'rgb(168,138,62)');
      } else {
        grad.addColorStop(0, `rgb(${Math.round(40 + tone * 22)},${Math.round(98 + tone * 30)},${Math.round(28 + tone * 12)})`);
        grad.addColorStop(0.75, `rgb(${Math.round(62 + tone * 28)},${Math.round(128 + tone * 30)},${Math.round(36 + tone * 12)})`);
        grad.addColorStop(1, 'rgb(150,170,70)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, y + w);
      ctx.quadraticCurveTo(mx + side * nx * w * 1.6, my + ny * w * 1.6 + w, ex, ey);
      ctx.quadraticCurveTo(mx - side * nx * w * 1.6, my - ny * w * 1.6 - w, cx, y - w);
      ctx.closePath();
      ctx.fill();
    }
  }
  // rachis
  const g = ctx.createLinearGradient(0, S, 0, 0);
  g.addColorStop(0, 'rgb(128,132,62)');
  g.addColorStop(1, 'rgb(104,150,58)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - S * 0.011, S);
  ctx.lineTo(cx + S * 0.011, S);
  ctx.lineTo(cx + S * 0.0025, S * 0.03);
  ctx.lineTo(cx - S * 0.0025, S * 0.03);
  ctx.closePath();
  ctx.fill();
}

function drawBroadLeaf(ctx: CanvasRenderingContext2D, S: number, rng: RNG): void {
  const cx = 0.58 * S;
  const hw = 0.108 * S;
  const top = 0.035 * S;
  const bottom = 0.9 * S;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, bottom);
  ctx.bezierCurveTo(cx - hw * 1.25, bottom - 0.08 * S, cx - hw * 1.05, top + 0.2 * S, cx, top);
  ctx.bezierCurveTo(cx + hw * 1.05, top + 0.2 * S, cx + hw * 1.25, bottom - 0.08 * S, cx, bottom);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
  g.addColorStop(0, 'rgb(52,120,40)');
  g.addColorStop(0.5, 'rgb(84,152,52)');
  g.addColorStop(1, 'rgb(46,112,38)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // lateral veins
  ctx.lineWidth = Math.max(1, S * 0.0016);
  for (let i = 0; i < 46; i++) {
    const y = bottom - ((i + 0.5) / 46) * (bottom - top);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(30,84,26,0.55)' : 'rgba(120,180,70,0.35)';
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.quadraticCurveTo(cx + side * hw * 0.6, y - hw * 0.22, cx + side * hw * 1.3, y - hw * 0.62);
      ctx.stroke();
    }
  }
  // tears along the margins
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) {
    const side = rng.chance(0.5) ? -1 : 1;
    const y = top + rng.range(0.12, 0.85) * (bottom - top);
    const depth = hw * rng.range(0.35, 0.8);
    const gap = S * rng.range(0.003, 0.008);
    ctx.beginPath();
    ctx.moveTo(cx + side * (hw * 1.3), y - hw * 0.62 - gap);
    ctx.lineTo(cx + side * (hw * 1.3 - depth), y - hw * 0.62 + depth * 0.48);
    ctx.lineTo(cx + side * (hw * 1.3), y - hw * 0.62 + gap);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // midrib + stalk
  ctx.fillStyle = 'rgb(150,186,92)';
  ctx.beginPath();
  ctx.moveTo(cx - S * 0.007, S);
  ctx.lineTo(cx + S * 0.007, S);
  ctx.lineTo(cx + S * 0.0015, top);
  ctx.lineTo(cx - S * 0.0015, top);
  ctx.closePath();
  ctx.fill();
}

function drawBark(ctx: CanvasRenderingContext2D, S: number, rng: RNG): void {
  const x0 = 0.75 * S;
  const w = 0.25 * S;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, w, S);
  ctx.clip();
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  g.addColorStop(0, 'rgb(118,104,88)');
  g.addColorStop(0.5, 'rgb(150,134,112)');
  g.addColorStop(1, 'rgb(122,108,90)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, 0, w, S);
  // fibres (drawn three times with ±S offset so the strip tiles vertically)
  for (let i = 0; i < 260; i++) {
    const x = x0 + rng.next() * w;
    const y = rng.next() * S;
    const len = S * rng.range(0.03, 0.12);
    const dark = rng.chance(0.55);
    ctx.strokeStyle = dark ? `rgba(60,50,40,${rng.range(0.12, 0.3)})` : `rgba(196,182,160,${rng.range(0.1, 0.25)})`;
    ctx.lineWidth = Math.max(1, S * rng.range(0.001, 0.003));
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(x, y + k * S);
      ctx.lineTo(x + rng.range(-2, 2), y + len + k * S);
      ctx.stroke();
    }
  }
  // leaf-scar rings
  const rings = 26;
  for (let i = 0; i < rings; i++) {
    const y = ((i + 0.5) / rings) * S;
    const wob = S * 0.004;
    ctx.strokeStyle = 'rgba(52,42,34,0.75)';
    ctx.lineWidth = S * rng.range(0.0035, 0.006);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    for (let k = 1; k <= 8; k++) ctx.lineTo(x0 + (k / 8) * w, y + (k === 8 ? 0 : rng.range(-wob, wob)));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(206,192,168,0.5)';
    ctx.lineWidth = S * 0.0028;
    ctx.beginPath();
    ctx.moveTo(x0, y + S * 0.006);
    ctx.lineTo(x0 + w, y + S * 0.006);
    ctx.stroke();
  }
  ctx.restore();
}

export function makePalmAtlas(size: number, anisotropy: number): THREE.DataTexture {
  const S = size;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, S, S);
  const rng = new RNG(90210);
  drawFrond(ctx, S, rng);
  drawBroadLeaf(ctx, S, rng);
  drawBark(ctx, S, rng);
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  // transparent texels get a leaf-green colour so mip-mapping does not bleed black into the edges
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i + 3] as number) < 12) {
      d[i] = 58;
      d[i + 1] = 112;
      d[i + 2] = 34;
      d[i + 3] = 0;
    }
  }
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** soft footprint decal (alpha only matters): bare foot, toes towards the top */
export function makeFootprintTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, w, h);
  ctx.filter = 'blur(2.5px)';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  // heel, arch, ball
  ctx.beginPath();
  ctx.ellipse(32, 98, 13, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(34, 70, 10, 18, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(32, 44, 17, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  // toes
  const toes: [number, number, number][] = [
    [16, 22, 5.5],
    [25, 16, 4.6],
    [34, 14, 4.4],
    [42, 16, 4.1],
    [49, 21, 3.7],
  ];
  for (const [x, y, r] of toes) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
