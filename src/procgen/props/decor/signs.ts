/** Insegne al neon e palo con frecce. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type ColorLike, type Pen, TILE, canvasTexture, cyl, extrude, rbox, tr, tube, v3 } from '../kit';
import { PAL } from '../parts';
import type { DecorModel } from '../shop-types';
import { Decor, type DecorOpts, arc2, neon } from './decor-kit';

type P2 = [number, number];

/** Infittisce una spezzata vicino ai vertici, così la spline resta aderente (curve strette da neon). */
function poly(pts: P2[]): P2[] {
  const out: P2[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    out.push([ax + (bx - ax) * 0.18, ay + (by - ay) * 0.18], [ax + (bx - ax) * 0.82, ay + (by - ay) * 0.82], [bx, by]);
  }
  return out;
}

function panel(p: Pen, w: number, h: number): void {
  p.add(rbox(w, h, 0.012, 0.005), { color: 0x16181c, rough: 0.25 }, tr(0, 0, 0.006));
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) p.add(cyl(0.01, 0.01, 0.006, 8), { color: PAL.chrome, metal: 1, rough: 0.3 }, tr(sx * (w / 2 - 0.03), sy * (h / 2 - 0.03), 0.012, Math.PI / 2));
  // trasformatore e cavo
  p.add(rbox(0.07, 0.035, 0.03, 0.006), { color: 0x2a2c30, rough: 0.5 }, tr(w / 2 - 0.08, -h / 2 - 0.02, 0.015));
  p.add(tube([v3(w / 2 - 0.05, -h / 2 - 0.03, 0.015), v3(w / 2 - 0.02, -h / 2 - 0.16, 0.012), v3(w / 2 - 0.06, -h / 2 - 0.3, 0.008)], 0.004, 4, 3), { color: 0x1d1e21, rough: 0.7 });
}

export function neonOpen(o: DecorOpts): DecorModel {
  const d = new Decor('neon_open', o);
  const p = d.p;
  panel(p, 0.8, 0.38);
  const pink: ColorLike = 0xff5a8a;
  const xs = [-0.225, -0.075, 0.075, 0.225];
  const O = arc2(xs[0], 0, 0.045, 0.078, 0, Math.PI * 2, 12);
  O.pop();
  neon(p, O, pink, true);
  let x = xs[1];
  neon(p, poly([[x - 0.04, -0.08], [x - 0.04, 0.08], [x + 0.02, 0.08], [x + 0.045, 0.04], [x + 0.02, 0.0], [x - 0.035, 0.0]]), pink);
  x = xs[2];
  neon(p, poly([[x + 0.04, 0.08], [x - 0.04, 0.08], [x - 0.04, -0.08], [x + 0.04, -0.08]]), pink);
  neon(p, [[x - 0.03, 0], [x, 0.0], [x + 0.028, 0]], pink);
  x = xs[3];
  neon(p, poly([[x - 0.04, -0.08], [x - 0.04, 0.08], [x + 0.04, -0.08], [x + 0.04, 0.08]]), pink);
  // cornice arrotondata turchese
  const bw = 0.35;
  const bh = 0.145;
  const r = 0.05;
  const border: P2[] = [
    ...arc2(bw - r, bh - r, r, r, 0, Math.PI / 2, 4),
    ...arc2(-bw + r, bh - r, r, r, Math.PI / 2, Math.PI, 4),
    ...arc2(-bw + r, -bh + r, r, r, Math.PI, Math.PI * 1.5, 4),
    ...arc2(bw - r, -bh + r, r, r, Math.PI * 1.5, Math.PI * 2, 4),
  ];
  neon(p, border, 0x4fe8e0, true, 0.008);
  return d.finish('neon');
}

export function neonPhone(o: DecorOpts): DecorModel {
  const d = new Decor('neon_phone', o);
  const p = d.p;
  panel(p, 0.46, 0.62);
  const w = 0.12;
  const h = 0.22;
  const r = 0.035;
  const body: P2[] = [
    ...arc2(w - r, h - r, r, r, 0, Math.PI / 2, 4),
    ...arc2(-w + r, h - r, r, r, Math.PI / 2, Math.PI, 4),
    ...arc2(-w + r, -h + r, r, r, Math.PI, Math.PI * 1.5, 4),
    ...arc2(w - r, -h + r, r, r, Math.PI * 1.5, Math.PI * 2, 4),
  ];
  neon(p, body, 0x4fe8e0, true, 0.012);
  neon(p, poly([[0.03, 0.14], [-0.045, 0.0], [0.02, 0.01], [-0.03, -0.12]]), 0xffd84a, false, 0.011);
  const home = arc2(0, -0.17, 0.018, 0.018, 0, Math.PI * 2, 8);
  home.pop();
  neon(p, home, 0xff5a8a, true, 0.007);
  neon(p, [[-0.035, 0.185], [0, 0.185], [0.035, 0.185]], 0xff5a8a, false, 0.007);
  // scintille
  for (const [cx, cy, s] of [
    [-0.175, 0.2, 0.035],
    [0.175, -0.12, 0.03],
    [0.17, 0.23, 0.02],
  ] as const) {
    neon(p, [[cx - s, cy], [cx, cy], [cx + s, cy]], 0xff5a8a, false, 0.006);
    neon(p, [[cx, cy - s], [cx, cy], [cx, cy + s]], 0xff5a8a, false, 0.006);
  }
  return d.finish('neon');
}

export function neonPalm(o: DecorOpts): DecorModel {
  const d = new Decor('neon_palm', o);
  const p = d.p;
  panel(p, 0.62, 0.66);
  // sole
  neon(p, arc2(0.06, -0.08, 0.2, 0.2, 0.12, Math.PI - 0.12, 14), 0xff8a3a, false, 0.012, 0.03);
  // tronco
  neon(p, [[-0.07, -0.22], [-0.05, -0.1], [-0.01, 0.02], [0.05, 0.13]], 0xffd84a, false, 0.013, 0.045);
  // fronde
  const top: P2 = [0.05, 0.13];
  const fr: Array<[number, number, number]> = [
    [-0.2, 0.12, 0.1],
    [-0.14, 0.24, 0.06],
    [0.0, 0.27, 0.03],
    [0.16, 0.23, 0.07],
    [0.21, 0.09, 0.1],
  ];
  for (const [dx, dy, drop] of fr) {
    const ex = top[0] + dx;
    const ey = top[1] + dy - drop * 1.6;
    neon(p, [top, [top[0] + dx * 0.45, top[1] + dy * 0.75], [top[0] + dx * 0.8, top[1] + dy * 0.8 - drop * 0.4], [ex, ey]], 0x5cff8a, false, 0.011, 0.045);
  }
  // onde
  for (const y of [-0.235, -0.285]) {
    const wave: P2[] = [];
    for (let i = 0; i <= 12; i++) wave.push([-0.24 + i * 0.04, y + Math.sin(i * 1.4 + y * 30) * 0.014]);
    neon(p, wave, 0x4fc8ff, false, 0.008);
  }
  return d.finish('neon');
}

export function signArrows(o: DecorOpts): DecorModel {
  const d = new Decor('sign_arrows', o);
  const p = d.p;
  p.add(rbox(2.1, 0.08, 0.08, 0.014), { tile: TILE.wood, color: PAL.drift, rough: 0.95, uv: [1, 0.1] }, tr(0, 1.0, 0, 0, 0, Math.PI / 2 + 0.02));
  p.add(cyl(0.17, 0.2, 0.05, 12), { tile: TILE.stone, color: 0xe2d2a8, rough: 1, uv: [0.4, 0.4] });
  const rows: Array<{ text: string; bg: string; fg: string; yaw: number; y: number; flip: boolean }> = [
    { text: 'BEACH · หาด', bg: '#1fa7a0', fg: '#fff7e0', yaw: 0.25, y: 1.86, flip: false },
    { text: d.shopName.slice(0, 16), bg: '#f2705a', fg: '#fff7e0', yaw: -0.35, y: 1.66, flip: true },
    { text: 'ITALIA 9000 km', bg: '#f6c94a', fg: '#5a2a1a', yaw: 0.1, y: 1.46, flip: false },
    { text: 'FERRY 5 min', bg: '#f4efe2', fg: '#24406e', yaw: -0.15, y: 1.26, flip: true },
  ];
  const tex = canvasTexture(512, 512, (c) => {
    rows.forEach((r, i) => {
      c.fillStyle = r.bg;
      c.fillRect(0, i * 128, 512, 128);
      for (let k = 0; k < 60; k++) {
        c.strokeStyle = k % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(60,40,20,0.08)';
        c.lineWidth = 1 + (k % 4);
        const y = i * 128 + ((k * 37) % 128);
        c.beginPath();
        c.moveTo((k * 53) % 300, y);
        c.lineTo(((k * 53) % 300) + 200, y + 1);
        c.stroke();
      }
      c.fillStyle = r.fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      let px = 74;
      c.font = `bold ${px}px "Chalkboard SE","Marker Felt","Comic Sans MS","Thonburi",sans-serif`;
      const w = c.measureText(r.text).width;
      if (w > 470) {
        px = Math.floor((px * 470) / w);
        c.font = `bold ${px}px "Chalkboard SE","Marker Felt","Comic Sans MS","Thonburi",sans-serif`;
      }
      c.fillText(r.text, 256, i * 128 + 66);
    });
  });
  const faces: THREE.BufferGeometry[] = [];
  rows.forEach((r, i) => {
    const dir = r.flip ? -1 : 1;
    const s = new THREE.Shape();
    s.moveTo(-0.3 * dir, -0.07);
    s.lineTo(0.26 * dir, -0.07);
    s.lineTo(0.38 * dir, 0);
    s.lineTo(0.26 * dir, 0.07);
    s.lineTo(-0.3 * dir, 0.07);
    s.closePath();
    const m = tr(0, r.y, 0, 0, r.yaw, dir * 0.04).multiply(tr(dir * 0.1, 0, 0.052));
    const g = extrude(s, 0.022, 0.003, 2);
    g.translate(0, 0, -0.011);
    p.add(g, { tile: TILE.wood, color: r.bg, rough: 0.9, uv: [0.5, 0.2] }, m);
    p.add(cyl(0.007, 0.007, 0.004, 6), { color: PAL.iron, metal: 0.9, rough: 0.5 }, m.clone().multiply(tr(-dir * 0.1, 0, 0.014, Math.PI / 2)));
    for (const back of [false, true]) {
      const f = new THREE.PlaneGeometry(0.52, 0.125);
      const uv = f.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / 4);
      f.applyMatrix4(m.clone().multiply(tr(-0.03 * dir, 0, back ? -0.0155 : 0.0155, 0, back ? Math.PI : 0, 0)));
      faces.push(f);
    }
  });
  const merged = mergeGeometries(faces);
  faces.forEach((f) => f.dispose());
  d.D.track(tex);
  d.extra(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })));
  return d.finish();
}
