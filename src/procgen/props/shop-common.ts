/** Elementi comuni alle fasi: oggetti del banco, sedute, tendone, cartello. */
import * as THREE from 'three';
import { type ColorLike, Pen, type Surf, TILE, type V3, tr, v3 } from './kit';
import { PAL, cashBox, cashRegister, chairErgo, chairWood, charm, fan, lamp, rack, radio, stoolPlastic, tablet } from './parts';
import type { SignFace, StageCtx } from './shop-ctx';

/** Oggetti fissi del banco (fuori dalla zona riservata), sedia, portatelefoni e cassa sull'ala destra. */
export function deskItems(c: StageCtx, o: { wingX: number; wingY: number; floorY: number; deskFan: boolean; register: boolean; rackDX?: number; cashDX?: number }): void {
  const up = c.opts.upgrades;
  c.lampPos = up.lamp === 1 ? lamp(c.lamp.at(-0.88, 0.9, -0.3, 0, -0.5, 0), 1, PAL.coral) : lamp(c.lamp.at(-0.95, 0.9, -0.27, 0, -0.42, 0), 2, PAL.coral);
  radio(c.radio.at(-0.8, 0.9, 0.23, 0, 0.4, 0), PAL.teal);
  c.anchors.tablet = tablet(c.tablet.at(0.8, 0.9, 0.17, 0, -0.45, 0));
  if (o.deskFan) c.fanRig = fan(c.fan.at(0.8, 0.9, -0.27, 0, -0.665, 0), false, PAL.turquoise);
  charm(c.atlas.at(-0.81, 0.9, -0.06, 0, 0.5, 0));
  const seat = c.atlas.at(0, o.floorY, 0.75);
  if (up.chair === 1) stoolPlastic(seat, PAL.red);
  else if (up.chair === 2) chairWood(seat, c.opts.awningColor);
  else chairErgo(seat.at(0, 0, 0.02, 0, 0.12, 0), c.opts.accentColor);
  c.anchors.seat.set(0, o.floorY, 0.75);
  const slots = ([3, 5, 8] as const)[up.rack - 1];
  c.rackSlots = rack(c.rack.at(o.wingX + (o.rackDX ?? 0.36), o.wingY, 0, 0, -Math.PI / 2, 0), slots);
  if (o.register) {
    cashRegister(c.atlas.at(o.wingX + (o.cashDX ?? 0.25), o.wingY, 0.0, 0, 0.5, 0), c.opts.accentColor);
    c.anchors.cashBox.set(o.wingX + (o.cashDX ?? 0.25), o.wingY, 0.0);
  } else {
    cashBox(c.atlas.at(o.wingX + 0.1, o.wingY, 0.27, 0, Math.PI / 2, 0), PAL.red);
    c.anchors.cashBox.set(o.wingX + 0.1, o.wingY, 0.27);
  }
}

/**
 * Tendone a strisce: falda rettangolare inclinata con leggera insaccatura fra i travetti.
 * `yAt(z)` dà la quota del telo lungo la pendenza. Balze smerlate sui lati indicati.
 */
export function awning(
  cloth: Pen,
  o: { x0: number; x1: number; z0: number; z1: number; yAt: (z: number) => number; stripes: number; color: ColorLike; sagPeriod: number; valance: { front: boolean; left: boolean; right: boolean }; drop: number },
): void {
  const { x0, x1, z0, z1, stripes } = o;
  const sw = (x1 - x0) / stripes;
  const white = 0xf5f0e4;
  const sagAt = (x: number): number => -0.03 * (0.5 - 0.5 * Math.cos(((x - x0) / o.sagPeriod) * Math.PI * 2));
  const yy = (x: number, z: number): number => {
    const tz = (z - z0) / (z1 - z0);
    const edge = Math.pow(Math.abs(tz * 2 - 1), 6) * -0.015;
    return o.yAt(z) + sagAt(x) * Math.sin(Math.PI * Math.min(1, Math.max(0, tz))) ** 0.5 + edge;
  };
  const NZ = 10;
  const NX = 2;
  for (let i = 0; i < stripes; i++) {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= NZ; j++)
      for (let k = 0; k <= NX; k++) {
        const x = x0 + (i + k / NX) * sw;
        const z = z0 + (j / NZ) * (z1 - z0);
        const y = yy(x, z);
        const e = 0.01;
        const dx = (yy(x + e, z) - yy(x - e, z)) / (2 * e);
        const dz = (yy(x, z + e) - yy(x, z - e)) / (2 * e);
        const n = new THREE.Vector3(-dx, 1, -dz).normalize();
        pos.push(x, y, z);
        nor.push(n.x, n.y, n.z);
        uv.push(k / NX, j / NZ);
        if (j < NZ && k < NX) {
          const a = j * (NX + 1) + k;
          const b = a + 1;
          const d = a + NX + 1;
          const e2 = d + 1;
          if (z1 > z0) idx.push(a, d, b, b, d, e2);
          else idx.push(a, b, d, b, e2, d);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    cloth.add(g, { color: i % 2 === 0 ? o.color : white, rough: 0.85, uv: [0.5, 5], sway: 0.004 });
  }
  // balze smerlate
  const flap = (w: number): THREE.BufferGeometry => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, -o.drop * 0.55);
    s.absarc(0, -o.drop * 0.55, w / 2, 0, Math.PI, true);
    s.lineTo(-w / 2, 0);
    return new THREE.ShapeGeometry(s, 6);
  };
  if (o.valance.front) {
    for (let i = 0; i < stripes; i++) {
      const x = x0 + (i + 0.5) * sw;
      const top = yy(x, z1);
      cloth.add(flap(sw), { color: i % 2 === 0 ? o.color : white, rough: 0.85, uv: [0.5, 0.5], swayFn: (_x, y) => Math.min(1, Math.max(0, (top - y) / o.drop)) * 0.03 }, tr(x, top, z1));
    }
  }
  const sideN = Math.round(Math.abs(z1 - z0) / sw);
  for (const [on, x] of [
    [o.valance.left, x0],
    [o.valance.right, x1],
  ] as const) {
    if (!on) continue;
    for (let j = 0; j < sideN; j++) {
      const za = z0 + (j / sideN) * (z1 - z0);
      const zb = z0 + ((j + 1) / sideN) * (z1 - z0);
      const ya = yy(x, za);
      const yb = yy(x, zb);
      const w = Math.hypot(zb - za, yb - ya);
      const dir = new THREE.Vector3(0, yb - ya, zb - za).normalize();
      const m = new THREE.Matrix4().makeBasis(dir, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
      m.setPosition(x, (ya + yb) / 2, (za + zb) / 2);
      const top = Math.max(ya, yb);
      cloth.add(flap(w), { color: j % 2 === 0 ? white : o.color, rough: 0.85, uv: [0.5, 0.5], swayFn: (_x, y) => Math.min(1, Math.max(0, (top - 0.08 - y) / o.drop)) * 0.03 }, m);
    }
  }
}

/** Aggiunge una faccia (fronte + retro) dell'insegna: pannello centrato in `m`, normale +Z locale. */
export function signFace(c: StageCtx, w: number, h: number, m: THREE.Matrix4, uv: [number, number, number, number], doubleSided: boolean, thickness = 0.03): void {
  const f: SignFace = { w, h, m: m.clone().multiply(tr(0, 0, thickness / 2 + 0.002)), uv };
  c.signFaces.push(f);
  if (doubleSided) c.signFaces.push({ w, h, m: m.clone().multiply(tr(0, 0, -thickness / 2 - 0.002, 0, Math.PI, 0)), uv });
}

/** Chiodi/viti a vista. */
export function nails(p: Pen, pts: V3[], r = 0.006): void {
  const s: Surf = { color: PAL.iron, metal: 0.9, rough: 0.5 };
  for (const q of pts) p.cy(r, r, 0.003, q.x, q.y, q.z, s, 6);
}

/** Mensolina su palo: tavoletta con due staffe di bambù. Restituisce il centro del piano. */
export function poleShelf(c: StageCtx, x: number, y: number, z: number, dirX: number, dirZ: number): V3 {
  const cx = x + dirX * 0.16;
  const cz = z + dirZ * 0.16;
  c.wood.add(new THREE.BoxGeometry(0.26, 0.02, 0.22), { color: PAL.woodPale, rough: 0.85, uv: [0.3, 0.2] }, tr(cx, y - 0.01, cz, 0, Math.atan2(dirX, dirZ), 0));
  c.atlas.cane(v3(x, y - 0.2, z), v3(x + dirX * 0.24, y - 0.025, z + dirZ * 0.24), 0.012, { color: PAL.bamboo });
  c.atlas.lash(v3(x, y - 0.02, z), 0.05, 'y');
  return v3(cx, y, cz);
}

export const BULBS_FESTIVE: ColorLike[] = [PAL.warm, 0xff8a70, PAL.warm, 0x7fe6dc, PAL.warm, 0xffd45a];
export const BULBS_WARM: ColorLike[] = [0xffd9a0, 0xffe2b0];
export const tileSurf = (tile: (typeof TILE)[keyof typeof TILE], color: ColorLike, rough = 0.85): Surf => ({ tile, color, rough });

/**
 * Falda di paglia a corsi sovrapposti fra una linea di gronda (e0→e1) e una di colmo (r0→r1).
 * Per le falde triangolari passare r0 = r1. Aggiunge anche l'intradosso scuro e ciuffi in gronda.
 */
export function thatchSlope(T: Pen, e0: V3, e1: V3, r0: V3, r1: V3, courses = 5, color: ColorLike = PAL.thatch): void {
  const rng = T.b.rng;
  const quad = (a: V3, b: V3, cc: V3, d: V3, s: Surf): void => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z, d.x, d.y, d.z], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    T.add(g, s);
  };
  const up = e1.clone().sub(e0).cross(r0.clone().sub(e0)).normalize();
  if (up.y < 0) up.negate();
  const slopeLen = e0.clone().add(e1).multiplyScalar(0.5).distanceTo(r0.clone().add(r1).multiplyScalar(0.5));
  for (let i = 0; i < courses; i++) {
    const t0 = i / courses;
    const t1 = Math.min(1, (i + 1.35) / courses);
    const a = e0.clone().lerp(r0, t0).addScaledVector(up, 0.085);
    const b = e1.clone().lerp(r1, t0).addScaledVector(up, 0.085);
    const cTop = e1.clone().lerp(r1, t1).addScaledVector(up, 0.02);
    const dTop = e0.clone().lerp(r0, t1).addScaledVector(up, 0.02);
    const w = Math.max(0.3, a.distanceTo(b));
    const shade = 1 - 0.1 * (i % 2) + rng.range(-0.04, 0.04);
    const col = new THREE.Color(color).multiplyScalar(shade);
    quad(a, b, cTop, dTop, { color: col, rough: 1, uv: [w / 1.3, (slopeLen * (t1 - t0)) / 1.3], sway: i === 0 ? 0.004 : 0 });
    // testata del corso (spessore della paglia)
    const a2 = e0.clone().lerp(r0, t0).addScaledVector(up, -0.01);
    const b2 = e1.clone().lerp(r1, t0).addScaledVector(up, -0.01);
    quad(a2, b2, b, a, { color: col.clone().multiplyScalar(0.6), rough: 1, uv: [w / 1.3, 0.08] });
  }
  // intradosso
  quad(e1.clone(), e0.clone(), r0.clone(), r1.clone(), { color: new THREE.Color(color).multiplyScalar(0.55), rough: 1, uv: [e0.distanceTo(e1) / 1.3, slopeLen / 1.3] });
  // ciuffi irregolari lungo la gronda
  const n = Math.round(e0.distanceTo(e1) / 0.035);
  const down = e0.clone().sub(r0).normalize();
  for (let i = 0; i < n; i++) {
    const t = (i + rng.next()) / n;
    const base = e0.clone().lerp(e1, t).addScaledVector(up, 0.04);
    const len = rng.range(0.04, 0.13);
    const wdt = rng.range(0.008, 0.022);
    const side = e1.clone().sub(e0).normalize().multiplyScalar(wdt);
    const tip = base.clone().addScaledVector(down, len).add(new THREE.Vector3(0, -len * 0.5, 0));
    const col = new THREE.Color(color).multiplyScalar(rng.range(0.7, 1.05));
    quad(base.clone().sub(side), base.clone().add(side), tip.clone().add(side.clone().multiplyScalar(0.4)), tip.clone().sub(side.clone().multiplyScalar(0.4)), { color: col, rough: 1, uv: [0.06, 0.15], sway: 0.012 });
  }
}

/** Pannello portautensili con attrezzi appesi (schiena su z=0, verso +Z, centro in origine). */
export function pegboard(p: Pen, w: number, h: number): void {
  p.add(new THREE.BoxGeometry(w, h, 0.012), { color: 0xe9dcc0, tile: TILE.paper, rough: 0.8, uv: [0.6, 0.6] }, tr(0, 0, 0.006));
  p.box(w + 0.03, 0.03, 0.02, 0, h / 2, 0.01, { tile: TILE.woodFine, color: PAL.woodDark }, 0.004);
  p.box(w + 0.03, 0.03, 0.02, 0, -h / 2, 0.01, { tile: TILE.woodFine, color: PAL.woodDark }, 0.004);
  const cols = [PAL.coral, PAL.yellow, PAL.turquoise, PAL.blue, PAL.green, PAL.orange];
  const n = Math.floor((w - 0.1) / 0.07);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.07 + i * 0.07;
    const len = 0.1 + ((i * 37) % 5) * 0.012;
    p.cy(0.011, 0.009, 0.07, x, h * 0.18, 0.024, { color: cols[i % cols.length], rough: 0.45 }, 8);
    p.cy(0.003, 0.003, len, x, h * 0.18 - len, 0.024, { color: PAL.chrome, metal: 1, rough: 0.3 }, 5);
    p.box(0.03, 0.006, 0.02, x, h * 0.18 + 0.005, 0.018, { color: PAL.iron, metal: 0.8, rough: 0.5 }, 0);
  }
  // pinze, nastro, pinzette
  const y2 = -h * 0.22;
  for (const [x, col] of [
    [-w * 0.3, PAL.red],
    [-w * 0.1, PAL.blue],
  ] as const) {
    for (const s of [-1, 1]) {
      p.add(new THREE.BoxGeometry(0.012, 0.09, 0.01), { color: col, rough: 0.5 }, tr(x + s * 0.012, y2 - 0.02, 0.02, 0, 0, s * 0.12));
      p.add(new THREE.BoxGeometry(0.008, 0.06, 0.008), { color: PAL.steel, metal: 1, rough: 0.35 }, tr(x - s * 0.004, y2 + 0.05, 0.02, 0, 0, -s * 0.06));
    }
  }
  p.add(new THREE.TorusGeometry(0.035, 0.014, 6, 16), { color: 0xe8d37a, rough: 0.6 }, tr(w * 0.14, y2, 0.022));
  p.add(new THREE.TorusGeometry(0.028, 0.011, 6, 16), { color: 0x2a2b2e, rough: 0.6 }, tr(w * 0.32, y2 + 0.01, 0.02));
}
