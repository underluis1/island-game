/** Micro-soldering minigame — procedural canvas rendering (PCB, parts, solder, lens). */
import type { Layout, PadDef, PadState, SolderSim } from './game';

const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const R = 500;

type Ctx = CanvasRenderingContext2D;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function makeCanvas(px: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.setTransform(px / (R * 2), 0, 0, px / (R * 2), px / 2, px / 2);
  return { canvas, ctx };
}

/* ------------------------------------------------------------------ static board */

function trace(c: Ctx, pts: Array<[number, number]>, w: number): void {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = 'rgba(8, 48, 30, 0.55)';
  c.lineWidth = w + 5;
  c.stroke();
  c.strokeStyle = '#2f9d63';
  c.lineWidth = w;
  c.stroke();
  c.strokeStyle = 'rgba(160, 240, 190, 0.22)';
  c.lineWidth = Math.max(1.5, w * 0.22);
  c.stroke();
}

function via(c: Ctx, x: number, y: number, r = 11): void {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  g.addColorStop(0, '#fff1b0');
  g.addColorStop(0.6, '#d9a93c');
  g.addColorStop(1, '#8f6a18');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#0a2416';
  c.beginPath();
  c.arc(x, y, r * 0.42, 0, Math.PI * 2);
  c.fill();
}

function passive(c: Ctx, x: number, y: number, vertical: boolean, kind: number, name: string): void {
  c.save();
  c.translate(x, y);
  if (vertical) c.rotate(Math.PI / 2);
  const w = kind === 2 ? 62 : 44;
  const hgt = kind === 2 ? 34 : 24;
  c.strokeStyle = 'rgba(235, 245, 235, 0.55)';
  c.lineWidth = 2;
  rr(c, -w / 2 - 7, -hgt / 2 - 6, w + 14, hgt + 12, 4);
  c.stroke();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  rr(c, -w / 2 + 3, -hgt / 2 + 4, w, hgt, 3);
  c.fill();
  const ends = c.createLinearGradient(0, -hgt / 2, 0, hgt / 2);
  ends.addColorStop(0, '#f2f4f6');
  ends.addColorStop(1, '#8e969c');
  c.fillStyle = ends;
  rr(c, -w / 2, -hgt / 2, w, hgt, 3);
  c.fill();
  const body = c.createLinearGradient(0, -hgt / 2, 0, hgt / 2);
  if (kind === 0) {
    body.addColorStop(0, '#d6b78a');
    body.addColorStop(1, '#a8845a');
  } else {
    body.addColorStop(0, '#2b2d33');
    body.addColorStop(1, '#131418');
  }
  c.fillStyle = body;
  c.fillRect(-w / 2 + w * 0.22, -hgt / 2, w * 0.56, hgt);
  if (kind !== 0) {
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.font = `700 ${hgt * 0.5}px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(kind === 2 ? '4R7' : '103', 0, 1);
  }
  c.restore();
  c.fillStyle = 'rgba(235, 245, 235, 0.7)';
  c.font = `700 15px ${MONO}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(name, x + (vertical ? 36 : 0), y + (vertical ? 0 : -30));
}

/** Pre-render the PCB under the part: solder mask, traces, vias, passives, silkscreen. */
export function buildBoard(layout: Layout, px: number): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(px);
  const rand = rng(layout.kind.length * 7919 + layout.pads.length * 104729);
  const bg = c.createRadialGradient(-120, -160, 60, 0, 0, R * 1.15);
  bg.addColorStop(0, '#23855a');
  bg.addColorStop(0.6, '#176a45');
  bg.addColorStop(1, '#0d4b30');
  c.fillStyle = bg;
  c.fillRect(-R, -R, R * 2, R * 2);
  // inner copper layer showing through the mask
  c.globalAlpha = 0.16;
  c.fillStyle = '#0a3a25';
  for (let i = 0; i < 9; i++) {
    const x = -R + rand() * R * 2;
    const y = -R + rand() * R * 2;
    rr(c, x, y, 120 + rand() * 260, 60 + rand() * 180, 14);
    c.fill();
  }
  c.globalAlpha = 1;
  // mask grain
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    c.fillRect(-R + rand() * R * 2, -R + rand() * R * 2, 2.2, 2.2);
  }
  const by = layout.body.y;
  const keepW = layout.body.w / 2 + 130;
  const keepH = layout.body.h / 2 + 130;
  // background bus traces around the keep-out
  for (let i = 0; i < 7; i++) {
    const y = -R + 40 + i * 20;
    trace(c, [[-R, y + 300 + i * 4], [-R + 150 + i * 16, y + 300 + i * 4], [-R + 330 + i * 16, y + 120], [-60 + i * 18, y + 120], [40 + i * 18, y + 20], [40 + i * 18, -R]], 9);
  }
  for (let i = 0; i < 5; i++) {
    const x = R - 60 - i * 22;
    trace(c, [[x, R], [x, 330 - i * 12], [x - 90, 240 - i * 12], [x - 90, keepH + by + 40 + i * 6]], 9);
    via(c, x - 90, keepH + by + 40 + i * 6, 10);
  }
  // traces leaving each pad
  layout.pads.forEach((p, i) => {
    const [dx, dy] = p.dir;
    const out = 90 + ((i * 37) % 3) * 22;
    const a: [number, number] = [p.x + dx * (p.w / 2), p.y + dy * (p.h / 2)];
    const b: [number, number] = [p.x + dx * (p.w / 2 + out), p.y + dy * (p.h / 2 + out)];
    const bend = (i % 2 ? 1 : -1) * (40 + ((i * 53) % 4) * 18);
    const cpt: [number, number] = dx !== 0 ? [b[0] + dx * Math.abs(bend), b[1] + bend] : [b[0] + bend, b[1] + dy * Math.abs(bend)];
    const far: [number, number] = dx !== 0 ? [dx * (R + 20), cpt[1]] : [cpt[0], dy * (R + 20)];
    const w = Math.min(16, Math.min(p.w, p.h) * 0.5);
    if (layout.style === 'jumper') {
      trace(c, [[dx * (R + 20), p.y], [p.x - dx * 62, p.y]], 20);
    } else if (i % 3 === 2) {
      trace(c, [a, b, cpt], w);
      via(c, cpt[0], cpt[1]);
    } else {
      trace(c, [a, b, cpt, far], w);
    }
  });
  const sw0 = layout.body.w / 2;
  const sh0 = layout.body.h / 2 + 80;
  // passives scattered outside the keep-out
  let placed = 0;
  const spots: Array<[number, number]> = [[-300, 380], [-170, 380], [-40, 380], [90, 380], [-sw0, by - sh0]];
  for (let tries = 0; tries < 400 && placed < 15; tries++) {
    const x = -R + 70 + rand() * (R * 2 - 140);
    const y = -R + 70 + rand() * (R * 2 - 140);
    if (Math.hypot(x, y) > R - 70) continue;
    if (Math.abs(x) < keepW && Math.abs(y - by) < keepH) continue;
    if (spots.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 110)) continue;
    spots.push([x, y]);
    const kind = Math.floor(rand() * 3);
    passive(c, x, y, rand() > 0.5, kind, `${kind === 0 ? 'C' : kind === 1 ? 'R' : 'L'}${10 + placed * 3}`);
    placed++;
  }
  // silkscreen
  c.strokeStyle = 'rgba(240, 248, 240, 0.8)';
  c.fillStyle = 'rgba(240, 248, 240, 0.85)';
  c.lineWidth = 3;
  const sw = layout.body.w + 26;
  const sh = layout.body.h + 26;
  if (layout.style !== 'jumper') {
    const L = 34;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as Array<[number, number]>) {
      c.beginPath();
      c.moveTo((sx * sw) / 2 - sx * L, by + (sy * sh) / 2);
      c.lineTo((sx * sw) / 2, by + (sy * sh) / 2);
      c.lineTo((sx * sw) / 2, by + (sy * sh) / 2 - sy * L);
      c.stroke();
    }
    c.beginPath();
    c.arc(-sw / 2 - 16, by - sh / 2 - 16, 7, 0, Math.PI * 2);
    c.fill();
  }
  c.font = `800 30px ${MONO}`;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(layout.designator, -sw / 2 + 4, by - sh / 2 - 70);
  c.font = `700 19px ${MONO}`;
  c.globalAlpha = 0.7;
  c.fillText('PEAR LOGIC 820-01X  REV C', -250, R - 120);
  c.globalAlpha = 1;
  // fiducial
  c.fillStyle = '#d9a93c';
  c.beginPath();
  c.arc(300, -350, 13, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(8,48,30,0.7)';
  c.lineWidth = 9;
  c.beginPath();
  c.arc(300, -350, 26, 0, Math.PI * 2);
  c.stroke();

  if (layout.style === 'jumper') drawScrewDamage(c, rand);
  return canvas;
}

function drawScrewDamage(c: Ctx, rand: () => number): void {
  // torn mask and the hole punched by the long screw
  c.fillStyle = 'rgba(20, 26, 20, 0.55)';
  c.beginPath();
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = 104 + rand() * 26;
    const x = Math.cos(a) * r * 0.92;
    const y = Math.sin(a) * r;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.fill();
  // laminate fibres
  c.strokeStyle = 'rgba(214, 190, 120, 0.5)';
  c.lineWidth = 2.5;
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r0 = 58 + rand() * 10;
    const r1 = 74 + rand() * 30;
    c.beginPath();
    c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    c.lineTo(Math.cos(a + 0.12) * r1, Math.sin(a + 0.12) * r1);
    c.stroke();
  }
  const g = c.createRadialGradient(-10, -12, 6, 0, 0, 62);
  g.addColorStop(0, '#020403');
  g.addColorStop(0.8, '#0b120d');
  g.addColorStop(1, '#3a3220');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 60, 0, Math.PI * 2);
  c.fill();
  // curled copper at the cut ends
  c.strokeStyle = '#d98a4a';
  c.lineWidth = 7;
  c.lineCap = 'round';
  for (const y of [-62, 0, 62]) {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 80, y);
      c.quadraticCurveTo(s * 66, y - 8, s * 62, y - 20 + rand() * 12);
      c.stroke();
    }
  }
}

/* ------------------------------------------------------------------ dynamic pieces */

function padRect(c: Ctx, p: PadDef, grow = 0): void {
  rr(c, p.x - p.w / 2 - grow, p.y - p.h / 2 - grow, p.w + grow * 2, p.h + grow * 2, 7 + grow);
}

/** Gold pads; `exposed` 0..1 fades them in (scraped mask on the screw-damage board). */
export function drawPads(c: Ctx, layout: Layout, pads: PadState[], exposed: number, oldSolder: number): void {
  layout.pads.forEach((p, i) => {
    c.globalAlpha = exposed;
    c.fillStyle = 'rgba(6, 40, 24, 0.8)';
    padRect(c, p, 5);
    c.fill();
    const g = c.createLinearGradient(p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2);
    g.addColorStop(0, '#ffe9a0');
    g.addColorStop(0.45, '#e2b545');
    g.addColorStop(1, '#a87c1e');
    c.fillStyle = g;
    padRect(c, p);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    rr(c, p.x - p.w / 2 + 4, p.y - p.h / 2 + 3, p.w - 8, Math.max(3, p.h * 0.16), 3);
    c.fill();
    if (oldSolder > 0 && !(pads[i] as PadState).joint) {
      // dull residue of the old joint
      c.globalAlpha = exposed * oldSolder * 0.85;
      const s = c.createRadialGradient(p.x - 4, p.y - 4, 2, p.x, p.y, Math.min(p.w, p.h) * 0.55);
      s.addColorStop(0, '#c9ced2');
      s.addColorStop(1, '#6f777d');
      c.fillStyle = s;
      c.beginPath();
      c.ellipse(p.x, p.y, p.w * 0.36, p.h * 0.36, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  });
}

function chipBody(c: Ctx, w: number, h: number, label: string, burnt: boolean): void {
  c.fillStyle = 'rgba(0,0,0,0.45)';
  rr(c, -w / 2 + 8, -h / 2 + 12, w, h, 12);
  c.fill();
  const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, '#3a3d45');
  g.addColorStop(0.5, '#22242a');
  g.addColorStop(1, '#14151a');
  c.fillStyle = g;
  rr(c, -w / 2, -h / 2, w, h, 10);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.lineWidth = 3;
  rr(c, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 7);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.beginPath();
  c.arc(-w / 2 + 30, -h / 2 + 30, 10, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(225, 230, 235, 0.72)';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const fs = Math.min(h * 0.2, (w * 1.35) / label.length);
  c.font = `700 ${fs}px ${MONO}`;
  c.fillText(label, 0, -fs * 0.35);
  c.font = `600 ${fs * 0.55}px ${MONO}`;
  c.fillStyle = 'rgba(225, 230, 235, 0.5)';
  c.fillText('PEAR 2241 TH', 0, fs * 0.6);
  // stylised pear mark
  c.fillStyle = 'rgba(225, 230, 235, 0.45)';
  c.beginPath();
  c.ellipse(w / 2 - 34, h / 2 - 32, 10, 12, 0, 0, Math.PI * 2);
  c.ellipse(w / 2 - 34, h / 2 - 46, 6, 8, 0, 0, Math.PI * 2);
  c.fill();
  if (burnt) {
    const b = c.createRadialGradient(w * 0.12, -h * 0.05, 4, w * 0.12, -h * 0.05, Math.max(w, h) * 0.6);
    b.addColorStop(0, 'rgba(10, 4, 0, 0.95)');
    b.addColorStop(0.35, 'rgba(60, 26, 6, 0.75)');
    b.addColorStop(1, 'rgba(60, 26, 6, 0)');
    c.fillStyle = b;
    rr(c, -w / 2, -h / 2, w, h, 10);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(w * 0.12, -h * 0.05);
    c.lineTo(w * 0.24, -h * 0.26);
    c.lineTo(w * 0.2, -h * 0.4);
    c.moveTo(w * 0.12, -h * 0.05);
    c.lineTo(-w * 0.08, h * 0.12);
    c.lineTo(-w * 0.2, h * 0.1);
    c.moveTo(w * 0.12, -h * 0.05);
    c.lineTo(w * 0.3, h * 0.14);
    c.stroke();
  }
}

function legs(c: Ctx, layout: Layout): void {
  const by = layout.body.y;
  for (const p of layout.pads) {
    const [dx, dy] = p.dir;
    const g = dx !== 0 ? c.createLinearGradient(0, p.y - by - p.h / 2, 0, p.y - by + p.h / 2) : c.createLinearGradient(p.x - p.w / 2, 0, p.x + p.w / 2, 0);
    g.addColorStop(0, '#f4f6f8');
    g.addColorStop(0.5, '#b9c0c6');
    g.addColorStop(1, '#7c858c');
    c.fillStyle = g;
    const lw = dx !== 0 ? p.w * 0.86 : p.w * 0.62;
    const lh = dy !== 0 ? p.h * 0.86 : p.h * 0.62;
    rr(c, p.x - dx * p.w * 0.2 - lw / 2, p.y - by - dy * p.h * 0.2 - lh / 2, lw, lh, 4);
    c.fill();
  }
}

/** The removable part, drawn around its own origin (caller translates/rotates). */
export function drawPart(c: Ctx, layout: Layout, burnt: boolean): void {
  const { w, h } = layout.body;
  if (layout.style === 'chip' || layout.style === 'sot') {
    legs(c, layout);
    chipBody(c, w, h, layout.label, burnt);
  } else if (layout.style === 'connector') {
    legs(c, layout);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    rr(c, -w / 2 + 8, -h / 2 + 12, w, h, 8);
    c.fill();
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#efe3c6');
    g.addColorStop(1, '#bfae86');
    c.fillStyle = g;
    rr(c, -w / 2, -h / 2, w, h, 8);
    c.fill();
    // latch
    const lg = c.createLinearGradient(0, -h / 2, 0, 0);
    lg.addColorStop(0, '#3a3d45');
    lg.addColorStop(1, '#191a1f');
    c.fillStyle = lg;
    rr(c, -w / 2 + 16, -h / 2 + 10, w - 32, h * 0.42, 5);
    c.fill();
    // contact slots
    for (const p of layout.pads) {
      if (p.dir[1] === 0) continue;
      c.fillStyle = burnt ? '#5b6b46' : '#d9a93c';
      c.fillRect(p.x - 7, h * 0.02, 14, h * 0.4);
      if (burnt) {
        c.fillStyle = 'rgba(190, 230, 200, 0.75)';
        c.beginPath();
        c.arc(p.x + ((p.x * 7) % 5) - 2, h * 0.2 + ((p.x * 3) % 9) - 4, 6, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.font = `700 20px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(235,235,235,0.55)';
    c.fillText(layout.label, 0, -h / 2 + 10 + h * 0.21);
  } else {
    // kapton patch with three enamelled jumper wires going around the screw hole
    c.fillStyle = 'rgba(226, 150, 40, 0.34)';
    rr(c, -w / 2, -h / 2, w, h, 26);
    c.fill();
    c.strokeStyle = 'rgba(255, 200, 110, 0.55)';
    c.lineWidth = 3;
    rr(c, -w / 2, -h / 2, w, h, 26);
    c.stroke();
    c.lineCap = 'round';
    const ys = [-62, 0, 62];
    const bulge = [-108, -150, 108];
    ys.forEach((y, i) => {
      for (const pass of [0, 1]) {
        c.strokeStyle = pass === 0 ? 'rgba(60, 24, 6, 0.6)' : i === 1 ? '#e7884a' : '#d9733a';
        c.lineWidth = pass === 0 ? 13 : 8;
        c.beginPath();
        c.moveTo(-138, y);
        c.bezierCurveTo(-70, y, -90, bulge[i] as number, 0, bulge[i] as number);
        c.bezierCurveTo(90, bulge[i] as number, 70, y, 138, y);
        c.stroke();
      }
      c.strokeStyle = 'rgba(255, 230, 190, 0.6)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-136, y - 2);
      c.bezierCurveTo(-70, y - 2, -90, (bulge[i] as number) - 2, 0, (bulge[i] as number) - 2);
      c.stroke();
    });
  }
}

function blob(c: Ctx, x: number, y: number, rx: number, ry: number, seed: number, rough: number): void {
  c.beginPath();
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + Math.sin(a * 3 + seed) * rough + Math.sin(a * 7 + seed * 1.7) * rough * 0.6;
    const px = x + Math.cos(a) * rx * k;
    const py = y + Math.sin(a) * ry * k;
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  c.closePath();
}

/** Finished joints + the one being made (`liveFill` on pad `liveIndex`). */
export function drawJoints(c: Ctx, layout: Layout, pads: PadState[], liveIndex: number, liveFill: number): void {
  layout.pads.forEach((p, i) => {
    const st = pads[i] as PadState;
    const live = i === liveIndex && liveFill > 0.02;
    if (!st.joint && !live) return;
    const kind = st.joint?.kind ?? 'good';
    const fill = st.joint ? st.joint.fill : liveFill;
    const seed = st.joint?.seed ?? i * 11;
    const grow = Math.min(1.25, 0.35 + fill * 0.75);
    let rx = (p.w / 2) * grow + 3;
    let ry = (p.h / 2) * grow + 3;
    let cx = p.x;
    let cy = p.y;
    if (kind === 'bridge') {
      // spills over to the next pad along the row
      const nb = layout.pads[i + 1] ?? layout.pads[i - 1];
      if (nb && Math.hypot(nb.x - p.x, nb.y - p.y) < 130) {
        cx = (p.x + nb.x) / 2;
        cy = (p.y + nb.y) / 2;
        rx = Math.abs(nb.x - p.x) / 2 + p.w * 0.62;
        ry = Math.abs(nb.y - p.y) / 2 + p.h * 0.62;
      } else {
        rx *= 1.5;
        ry *= 1.5;
      }
    }
    c.fillStyle = 'rgba(0,0,0,0.35)';
    blob(c, cx + 3, cy + 5, rx, ry, seed, kind === 'cold' ? 0.12 : 0.03);
    c.fill();
    const g = c.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, 1, cx, cy, Math.max(rx, ry) * 1.1);
    if (kind === 'cold') {
      g.addColorStop(0, '#a9adb0');
      g.addColorStop(1, '#5f6468');
    } else if (live && !st.joint) {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, '#ffe9c4');
      g.addColorStop(1, '#b99a78');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, '#e3e8ec');
      g.addColorStop(0.7, '#9aa3aa');
      g.addColorStop(1, '#646c73');
    }
    c.fillStyle = g;
    blob(c, cx, cy, rx, ry, seed, kind === 'cold' ? 0.12 : 0.03);
    c.fill();
    if (kind === 'cold') {
      c.fillStyle = 'rgba(40,44,48,0.5)';
      for (let k = 0; k < 5; k++) {
        c.beginPath();
        c.arc(cx + Math.sin(seed + k * 2.1) * rx * 0.5, cy + Math.cos(seed + k * 1.3) * ry * 0.5, 2.6, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.beginPath();
      c.ellipse(cx - rx * 0.3, cy - ry * 0.36, rx * 0.22, ry * 0.13, -0.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.beginPath();
      c.ellipse(cx + rx * 0.3, cy + ry * 0.4, rx * 0.16, ry * 0.07, -0.5, 0, Math.PI * 2);
      c.fill();
    }
  });
}

function drawSmoke(c: Ctx, sim: SolderSim): void {
  for (const s of sim.smoke) {
    const k = s.life / s.max;
    const a = 0.22 * (1 - k) * Math.min(1, s.life * 5);
    const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 1.6);
    g.addColorStop(0, `rgba(236, 240, 244, ${a.toFixed(3)})`);
    g.addColorStop(1, 'rgba(236, 240, 244, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(s.x, s.y, s.r * 1.6, 0, Math.PI * 2);
    c.fill();
  }
}

function ring(c: Ctx, x: number, y: number, r: number, from: number, to: number, color: string, w: number): void {
  c.beginPath();
  c.arc(x, y, r, -Math.PI / 2 + from * Math.PI * 2, -Math.PI / 2 + to * Math.PI * 2);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke();
}

function drawTool(c: Ctx, sim: SolderSim, hotAir: boolean): void {
  const { x, y } = sim.tip;
  c.save();
  c.translate(x, y);
  if (sim.phase === 1) {
    // flux syringe coming from the lower right
    c.rotate(-0.7);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    rr(c, -14, 110, 64, 330, 12);
    c.fill();
    const ng = c.createLinearGradient(-5, 0, 5, 0);
    ng.addColorStop(0, '#fbfcfd');
    ng.addColorStop(1, '#7f8990');
    c.fillStyle = ng;
    c.beginPath();
    c.moveTo(-2, 0);
    c.lineTo(2, 0);
    c.lineTo(5, 84);
    c.lineTo(-5, 84);
    c.fill();
    c.fillStyle = '#2a8f8a';
    rr(c, -13, 80, 26, 34, 6);
    c.fill();
    const bg = c.createLinearGradient(-30, 0, 30, 0);
    bg.addColorStop(0, 'rgba(255, 236, 170, 0.95)');
    bg.addColorStop(0.35, 'rgba(244, 184, 62, 0.95)');
    bg.addColorStop(1, 'rgba(176, 112, 20, 0.95)');
    c.fillStyle = bg;
    rr(c, -30, 110, 60, 330, 10);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.45)';
    rr(c, -22, 118, 9, 300, 4);
    c.fill();
    c.strokeStyle = 'rgba(90, 56, 6, 0.55)';
    c.lineWidth = 2.5;
    for (let m = 0; m < 6; m++) {
      c.beginPath();
      c.moveTo(6, 150 + m * 44);
      c.lineTo(30, 150 + m * 44);
      c.stroke();
    }
    if (sim.down) {
      c.fillStyle = 'rgba(255, 206, 90, 0.95)';
      c.beginPath();
      c.arc(0, 2, 10, 0, Math.PI * 2);
      c.fill();
    }
  } else if (sim.phase === 2 && hotAir) {
    c.lineCap = 'butt';
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 26;
    c.beginPath();
    c.arc(5, 8, 62, 0, Math.PI * 2);
    c.stroke();
    const g = c.createLinearGradient(-70, -70, 70, 70);
    g.addColorStop(0, '#eef1f4');
    g.addColorStop(0.5, '#8b949b');
    g.addColorStop(1, '#4d555c');
    c.strokeStyle = g;
    c.lineWidth = 20;
    c.beginPath();
    c.arc(0, 0, 62, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, 70, Math.PI * 1.05, Math.PI * 1.55);
    c.stroke();
  } else if (sim.phase === 2 || sim.phase === 4) {
    // soldering iron tip coming from the lower right
    c.rotate(-0.72);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.moveTo(8, 12);
    c.lineTo(34, 150);
    c.lineTo(-2, 150);
    c.fill();
    const g = c.createLinearGradient(-16, 0, 16, 0);
    g.addColorStop(0, '#fdfdfd');
    g.addColorStop(0.5, '#aeb6bc');
    g.addColorStop(1, '#5d656b');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(15, 120);
    c.lineTo(-15, 120);
    c.closePath();
    c.fill();
    const hot = sim.down ? 1 : 0.35;
    c.fillStyle = `rgba(255, 150, 60, ${0.55 * hot})`;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(6, 44);
    c.lineTo(-6, 44);
    c.closePath();
    c.fill();
    const hg = c.createLinearGradient(-22, 0, 22, 0);
    hg.addColorStop(0, '#59616a');
    hg.addColorStop(0.5, '#2a2f35');
    hg.addColorStop(1, '#14171b');
    c.fillStyle = hg;
    rr(c, -22, 120, 44, 420, 8);
    c.fill();
    c.fillStyle = '#18b8b0';
    c.fillRect(-22, 150, 44, 16);
  }
  c.restore();
}

/** Full frame. `c` already maps board units (origin = centre). */
export function drawFrame(
  c: Ctx,
  sim: SolderSim,
  board: HTMLCanvasElement,
  flux: HTMLCanvasElement,
  labels: (key: string) => string,
  hotAir: boolean,
): void {
  const L = sim.layout;
  const by = L.body.y;
  c.save();
  c.beginPath();
  c.arc(0, 0, R, 0, Math.PI * 2);
  c.clip();
  c.drawImage(board, -R, -R, R * 2, R * 2);

  const jumper = L.style === 'jumper';
  drawPads(c, L, sim.pads, jumper ? Math.min(1, 0.25 + sim.melt * 0.75) : 1, jumper ? 0 : 1 - sim.melt * 0.6);

  // scorch marks from overheating
  if (sim.scorch > 0.01) {
    const s = c.createRadialGradient(0, by, 30, 0, by, 330);
    s.addColorStop(0, `rgba(40, 18, 4, ${(0.7 * sim.scorch).toFixed(3)})`);
    s.addColorStop(1, 'rgba(40, 18, 4, 0)');
    c.fillStyle = s;
    c.fillRect(-R, -R, R * 2, R * 2);
  }

  // flux film (burns off a little once heated)
  c.globalAlpha = 1 - sim.melt * 0.45;
  c.drawImage(flux, -R, -R, R * 2, R * 2);
  c.globalAlpha = 1;

  // old part
  if (!jumper && sim.lift < 1) {
    const k = sim.lift;
    c.save();
    c.translate(k * 220, by - k * 260);
    c.rotate(k * 0.35);
    c.scale(1 + k * 0.25, 1 + k * 0.25);
    c.globalAlpha = 1 - k * k;
    drawPart(c, L, L.kind === 'short' || L.kind === 'connector');
    c.restore();
    c.globalAlpha = 1;
  }

  // heat glow under the nozzle
  if (sim.phase === 2 && sim.temp > 60) {
    const a = Math.min(0.5, (sim.temp - 60) / 700);
    const g = c.createRadialGradient(sim.tip.x, sim.tip.y, 10, sim.tip.x, sim.tip.y, 280);
    g.addColorStop(0, `rgba(255, 170, 60, ${a.toFixed(3)})`);
    g.addColorStop(0.5, `rgba(255, 110, 40, ${(a * 0.4).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255, 110, 40, 0)');
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.fillRect(-R, -R, R * 2, R * 2);
    c.globalCompositeOperation = 'source-over';
  }

  // ghost target + new part
  if (sim.phase === 3 || (sim.phase >= 4 && sim.placed)) {
    if (!sim.placed) {
      c.save();
      c.translate(0, by);
      c.setLineDash([16, 12]);
      c.lineDashOffset = -sim.time * 40;
      c.strokeStyle = 'rgba(140, 255, 235, 0.85)';
      c.lineWidth = 4;
      rr(c, -L.body.w / 2 - 6, -L.body.h / 2 - 6, L.body.w + 12, L.body.h + 12, 16);
      c.stroke();
      c.setLineDash([]);
      c.restore();
      const near = Math.hypot(sim.tip.x, sim.tip.y - by) < sim.tune.placeTol && Math.abs(sim.angle) < sim.tune.placeAngle;
      c.save();
      c.translate(sim.tip.x + Math.sin(sim.time * 60) * sim.placeShake * 10, sim.tip.y);
      c.rotate((sim.angle * Math.PI) / 180);
      c.scale(1.06, 1.06);
      c.globalAlpha = 0.93;
      drawPart(c, L, false);
      c.globalAlpha = 1;
      if (near) {
        c.strokeStyle = 'rgba(120, 255, 170, 0.95)';
        c.lineWidth = 5;
        rr(c, -L.body.w / 2 - 10, -L.body.h / 2 - 10, L.body.w + 20, L.body.h + 20, 18);
        c.stroke();
      }
      c.restore();
    } else {
      const e = 1 - Math.pow(1 - sim.snap, 3);
      c.save();
      c.translate(sim.partPos.x * (1 - e), by + sim.partPos.y * (1 - e));
      c.rotate(((sim.angle * Math.PI) / 180) * (1 - e) * (sim.phase === 3 ? 1 : 0));
      drawPart(c, L, false);
      c.restore();
    }
  }

  drawJoints(c, L, sim.pads, sim.phase === 4 && sim.holding ? sim.padIndex : -1, sim.fill);

  // current pad indicator
  if (sim.phase === 4 && sim.pause <= 0 && sim.padIndex < L.pads.length) {
    const p = L.pads[sim.padIndex] as PadDef;
    const r = Math.max(p.w, p.h) / 2 + 30;
    const pulse = 1 + Math.sin(sim.time * 6) * 0.04;
    c.lineCap = 'butt';
    ring(c, p.x, p.y, r * pulse, 0, 1, 'rgba(8, 20, 30, 0.6)', 13);
    const span = 1.22;
    ring(c, p.x, p.y, r * pulse, sim.tune.fillLo / span, sim.tune.fillHi / span, 'rgba(110, 240, 150, 0.95)', 13);
    ring(c, p.x, p.y, r * pulse, 1.04 / span, 1, 'rgba(255, 111, 89, 0.95)', 13);
    if (sim.holding) {
      const a = -Math.PI / 2 + (Math.min(span, sim.fill) / span) * Math.PI * 2;
      c.strokeStyle = '#fff';
      c.lineWidth = 6;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(p.x + Math.cos(a) * (r * pulse - 13), p.y + Math.sin(a) * (r * pulse - 13));
      c.lineTo(p.x + Math.cos(a) * (r * pulse + 13), p.y + Math.sin(a) * (r * pulse + 13));
      c.stroke();
    } else {
      c.fillStyle = 'rgba(140, 255, 235, 0.95)';
      c.beginPath();
      const ay = p.y - r - 26 + Math.sin(sim.time * 5) * 6;
      c.moveTo(p.x, ay + 16);
      c.lineTo(p.x - 13, ay - 4);
      c.lineTo(p.x + 13, ay - 4);
      c.fill();
    }
  }
  // un-fluxed pads hint
  if (sim.phase === 1) {
    L.pads.forEach((p, i) => {
      const f = (sim.pads[i] as PadState).flux;
      if (f >= 1) return;
      c.strokeStyle = `rgba(140, 255, 235, ${(0.45 + Math.sin(sim.time * 5 + i) * 0.25).toFixed(3)})`;
      c.lineWidth = 3;
      padRect(c, p, 9);
      c.stroke();
    });
  }

  drawSmoke(c, sim);
  if (sim.pause <= 0 || sim.phase === 4) drawTool(c, sim, hotAir);

  // floating feedback
  for (const p of sim.popups) {
    const k = p.t / 1.4;
    const txt = labels(p.key);
    c.font = `800 34px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const y = p.y - k * 46;
    const scale = Math.min(1, p.t * 8);
    c.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    const w = c.measureText(txt).width + 36;
    c.save();
    c.translate(Math.max(-R + w / 2 + 60, Math.min(R - w / 2 - 60, p.x)), y);
    c.scale(scale, scale);
    c.fillStyle = p.tone === 'good' ? '#2e8f4c' : p.tone === 'warn' ? '#d9952a' : '#d64d39';
    rr(c, -w / 2, -26, w, 52, 26);
    c.fill();
    c.fillStyle = '#fff';
    c.fillText(txt, 0, 2);
    c.restore();
    c.globalAlpha = 1;
  }

  // lens: reticle, vignette, chromatic rim, glare
  c.strokeStyle = 'rgba(255,255,255,0.14)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-R, 0);
  c.lineTo(-R + 70, 0);
  c.moveTo(R, 0);
  c.lineTo(R - 70, 0);
  c.moveTo(0, -R);
  c.lineTo(0, -R + 70);
  c.moveTo(0, R);
  c.lineTo(0, R - 70);
  c.stroke();
  const v = c.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.8, 'rgba(0,8,12,0.38)');
  v.addColorStop(1, 'rgba(0,4,8,0.92)');
  c.fillStyle = v;
  c.fillRect(-R, -R, R * 2, R * 2);
  c.lineWidth = 6;
  c.strokeStyle = 'rgba(80, 200, 255, 0.16)';
  c.beginPath();
  c.arc(0, 0, R - 8, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = 'rgba(255, 120, 90, 0.12)';
  c.beginPath();
  c.arc(0, 0, R - 16, 0, Math.PI * 2);
  c.stroke();
  const gl = c.createLinearGradient(-R, -R, 0, 0);
  gl.addColorStop(0, 'rgba(255,255,255,0.16)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  c.fillStyle = gl;
  c.beginPath();
  c.ellipse(-190, -250, 300, 120, -0.75, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Paint queued flux stamps into the persistent flux layer. */
export function paintFlux(layer: HTMLCanvasElement, stamps: Array<{ x: number; y: number }>): void {
  if (stamps.length === 0) return;
  const c = layer.getContext('2d') as Ctx;
  const s = layer.width / (R * 2);
  c.setTransform(s, 0, 0, s, layer.width / 2, layer.height / 2);
  for (const st of stamps) {
    const g = c.createRadialGradient(st.x - 8, st.y - 10, 2, st.x, st.y, 44);
    g.addColorStop(0, 'rgba(255, 244, 200, 0.2)');
    g.addColorStop(0.3, 'rgba(240, 180, 60, 0.12)');
    g.addColorStop(1, 'rgba(240, 180, 60, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(st.x, st.y, 44, 0, Math.PI * 2);
    c.fill();
  }
}
