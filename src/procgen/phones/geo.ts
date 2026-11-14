/** Geometry helpers. All dimensions in millimetres; +z is "up" out of the phone back. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.max(0.01, Math.min(r, hw - 0.01, hh - 0.01));
  s.moveTo(-hw + rr, -hh);
  s.lineTo(hw - rr, -hh);
  s.absarc(hw - rr, -hh + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(hw, hh - rr);
  s.absarc(hw - rr, hh - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(-hw + rr, hh);
  s.absarc(-hw + rr, hh - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hh + rr);
  s.absarc(-hw + rr, -hh + rr, rr, Math.PI, Math.PI * 1.5, false);
  return s;
}

export function roundedRectPath(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Path {
  const s = roundedRectShape(w, h, r);
  const p = new THREE.Path(s.getPoints(8).map((v) => new THREE.Vector2(v.x + cx, v.y + cy)));
  return p;
}

export interface SlabOpts {
  bevel?: number;
  curveSegments?: number;
  holes?: THREE.Path[];
}

/** Extruded shape: bottom at z=0, top at z=t. */
export function extrudeShape(shape: THREE.Shape, t: number, opts: SlabOpts = {}): THREE.BufferGeometry {
  if (opts.holes) shape.holes.push(...opts.holes);
  const bevel = Math.min(opts.bevel ?? 0, t / 2 - 0.001);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, t - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: bevel > 0 ? 3 : 0,
    curveSegments: opts.curveSegments ?? 6,
  });
  if (bevel > 0) g.translate(0, 0, bevel);
  return g;
}

export function slab(w: number, h: number, t: number, r: number, opts: SlabOpts = {}): THREE.BufferGeometry {
  const bevel = opts.bevel ?? 0;
  return extrudeShape(roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.01, r - bevel)), t, opts);
}

/** Sets UVs from x/y position mapped onto [0,1] over the given rectangle (centred). */
export function planarUV(g: THREE.BufferGeometry, w: number, h: number, cx = 0, cy = 0): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - cx) / w + 0.5;
    uv[i * 2 + 1] = (pos.getY(i) - cy) / h + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function box(w: number, h: number, t: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, t);
  g.translate(x, y, z + t / 2);
  return g;
}

/** Box whose top (+z) face maps to one cell of a square atlas; the other faces map to `sideCell`. */
export function atlasBox(
  w: number,
  h: number,
  t: number,
  x: number,
  y: number,
  z: number,
  cell: number,
  sideCell: number,
  grid = 4,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, t);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const put = (face: number, c: number): void => {
    const cu = (c % grid) / grid;
    const cv = 1 - (Math.floor(c / grid) + 1) / grid;
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i, cu + uv.getX(i) / grid, cv + uv.getY(i) / grid);
    }
  };
  for (let f = 0; f < 6; f++) put(f, f === 4 ? cell : sideCell);
  g.translate(x, y, z + t / 2);
  return g;
}

/** Cylinder with its axis along z, bottom at z. */
export function cyl(r: number, t: number, x = 0, y = 0, z = 0, seg = 20, rTop = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, r, t, seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z + t / 2);
  return g;
}

/**
 * Flat flexible ribbon following a smooth path. Width is measured in the plane perpendicular to the path
 * and to +z, so the cable lies flat like a real flex.
 */
export function ribbon(points: THREE.Vector3[], width: number, thickness = 0.12, samples = 24): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
  const n = samples;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 0, 1);
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const nor = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPoint(t, p);
    curve.getTangent(t, tan);
    side.crossVectors(tan, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    nor.crossVectors(side, tan).normalize();
    for (const s of [-1, 1]) {
      for (const k of [1, -1]) {
        pos.push(
          p.x + side.x * s * width * 0.5 + nor.x * k * thickness * 0.5,
          p.y + side.y * s * width * 0.5 + nor.y * k * thickness * 0.5,
          p.z + side.z * s * width * 0.5 + nor.z * k * thickness * 0.5,
        );
        uv.push(s * 0.5 + 0.5, t);
      }
    }
  }
  // 4 verts per ring: [L top, L bottom, R top, R bottom]
  for (let i = 0; i < n; i++) {
    const a = i * 4;
    const b = a + 4;
    idx.push(a, a + 2, b, a + 2, b + 2, b); // top
    idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); // bottom
    idx.push(a, b, a + 1, a + 1, b, b + 1); // left edge
    idx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2); // right edge
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Merges geometries (normalising attributes) and disposes the inputs. */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    if (!ng.getAttribute('uv')) {
      ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.getAttribute('position').count * 2), 2));
    }
    if (!ng.getAttribute('normal')) ng.computeVertexNormals();
    for (const name of Object.keys(ng.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') ng.deleteAttribute(name);
    }
    return ng;
  });
  if (list.length === 1) return list[0] as THREE.BufferGeometry;
  const out = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!out) throw new Error('merge failed');
  return out;
}

export function move(g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  g.translate(x, y, z);
  return g;
}

/** Soft pillow: a rounded slab whose top bulges (used for swollen batteries). */
export function pillow(w: number, h: number, t: number, r: number, bulge: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, t, 14, 22, 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const hw = w / 2;
  const hh = h / 2;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    // round the outline corners
    const dx = Math.max(0, Math.abs(x) - (hw - r));
    const dy = Math.max(0, Math.abs(y) - (hh - r));
    if (dx > 0 && dy > 0) {
      const d = Math.hypot(dx, dy);
      if (d > r) {
        x = Math.sign(x) * (hw - r + (dx / d) * r);
        y = Math.sign(y) * (hh - r + (dy / d) * r);
      }
    }
    // soften the top/bottom edges and add the bulge on top
    const ex = 1 - Math.pow(Math.abs(x) / hw, 6);
    const ey = 1 - Math.pow(Math.abs(y) / hh, 6);
    const edge = Math.max(0, Math.min(ex, ey));
    const dome = Math.cos((x / hw) * Math.PI * 0.5) * Math.cos((y / hh) * Math.PI * 0.5);
    if (z > 0) z = (t / 2) * (0.82 + 0.18 * edge) + bulge * dome;
    else if (z < 0) z = -(t / 2) * (0.9 + 0.1 * edge);
    pos.setXYZ(i, x, y, z);
  }
  g.translate(0, 0, t / 2);
  g.computeVertexNormals();
  return g;
}
