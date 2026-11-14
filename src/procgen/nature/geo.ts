import * as THREE from 'three';

const _v = new THREE.Vector3();

/**
 * Minimal indexed-geometry accumulator used by the procedural nature generators.
 * Vertices carry position, uv, colour and an optional 4-float extra attribute; a transform matrix can be
 * set so sub-parts are authored in local space. Normals are computed (smooth across shared vertices)
 * unless explicitly given.
 */
export class GeoBuilder {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly ext: number[] = [];
  readonly idx: number[] = [];
  private readonly fixedNormals = new Map<number, [number, number, number]>();
  readonly matrix = new THREE.Matrix4();
  /** extra-attribute value used by helpers that do not pass one explicitly */
  defaultExt: [number, number, number, number] = [0, 0, 0, 0];

  constructor(private readonly extName: string | null = null) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  vertex(x: number, y: number, z: number, u: number, v: number, r: number, g: number, b: number, e0?: number, e1 = 0, e2 = 0, e3 = 0): number {
    _v.set(x, y, z).applyMatrix4(this.matrix);
    const i = this.pos.length / 3;
    this.pos.push(_v.x, _v.y, _v.z);
    this.uv.push(u, v);
    this.col.push(r, g, b);
    if (this.extName) {
      if (e0 === undefined) this.ext.push(this.defaultExt[0], this.defaultExt[1], this.defaultExt[2], this.defaultExt[3]);
      else this.ext.push(e0, e1, e2, e3);
    }
    return i;
  }

  /** forces the normal of a vertex (given in builder-local space, rotated by the current matrix) */
  normal(i: number, x: number, y: number, z: number): void {
    _v.set(x, y, z).transformDirection(this.matrix);
    this.fixedNormals.set(i, [_v.x, _v.y, _v.z]);
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /** appends another builder's content (already transformed) */
  append(o: GeoBuilder): void {
    const base = this.vertexCount;
    for (let i = 0; i < o.pos.length; i++) this.pos.push(o.pos[i] as number);
    for (let i = 0; i < o.uv.length; i++) this.uv.push(o.uv[i] as number);
    for (let i = 0; i < o.col.length; i++) this.col.push(o.col[i] as number);
    if (this.extName) {
      if (o.ext.length === (o.pos.length / 3) * 4) for (let i = 0; i < o.ext.length; i++) this.ext.push(o.ext[i] as number);
      else for (let i = 0; i < (o.pos.length / 3) * 4; i++) this.ext.push(0);
    }
    for (let i = 0; i < o.idx.length; i++) this.idx.push((o.idx[i] as number) + base);
    o.fixedNormals.forEach((n, k) => this.fixedNormals.set(k + base, n));
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const n = this.vertexCount;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    if (this.extName) g.setAttribute(this.extName, new THREE.BufferAttribute(new Float32Array(this.ext), 4));
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeVertexNormals();
    if (this.fixedNormals.size > 0) {
      const na = g.getAttribute('normal') as THREE.BufferAttribute;
      this.fixedNormals.forEach((v, i) => na.setXYZ(i, v[0], v[1], v[2]));
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export type RGB = readonly [number, number, number];

/** sRGB hex → linear RGB triple (vertex colours are stored linear) */
export function rgb(hex: number): RGB {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export function shade(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** closed tube along a poly-line with per-ring radius; `flat` duplicates nothing (smooth shading) */
export function addTube(
  b: GeoBuilder,
  points: readonly THREE.Vector3[],
  radius: (t: number) => number,
  radial: number,
  color: RGB,
  opts: { u0?: number; u1?: number; vScale?: number; capStart?: boolean; capEnd?: boolean; ext?: (t: number) => readonly [number, number, number, number] } = {},
): void {
  const n = points.length;
  const u0 = opts.u0 ?? 0;
  const u1 = opts.u1 ?? 1;
  const vScale = opts.vScale ?? 1;
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const prevB = new THREE.Vector3(0, 0, 1);
  let first = true;
  const p = new THREE.Vector3();
  const rings: number[] = [];
  let len = 0;
  for (let i = 0; i < n; i++) {
    const cur = points[i] as THREE.Vector3;
    const prev = points[Math.max(i - 1, 0)] as THREE.Vector3;
    const next = points[Math.min(i + 1, n - 1)] as THREE.Vector3;
    if (i > 0) len += cur.distanceTo(prev);
    tangent.subVectors(next, prev).normalize();
    if (first && Math.abs(tangent.dot(prevB)) > 0.95) prevB.set(1, 0, 0);
    first = false;
    // parallel-transport style frame: reuse the previous binormal so the tube never twists
    normal.crossVectors(prevB, tangent).normalize();
    binormal.crossVectors(tangent, normal).normalize();
    prevB.copy(binormal);
    const t = n > 1 ? i / (n - 1) : 0;
    const r = radius(t);
    const e = opts.ext ? opts.ext(t) : b.defaultExt;
    rings.push(b.vertexCount);
    for (let s = 0; s < radial; s++) {
      const a = (s / radial) * Math.PI * 2;
      p.copy(cur).addScaledVector(normal, Math.cos(a) * r).addScaledVector(binormal, Math.sin(a) * r);
      // mirrored u so the texture has no seam around the tube
      const uu = u0 + (u1 - u0) * Math.abs((s / radial) * 2 - 1);
      b.vertex(p.x, p.y, p.z, uu, len * vScale, color[0], color[1], color[2], e[0], e[1], e[2], e[3]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const r0 = rings[i] as number;
    const r1 = rings[i + 1] as number;
    for (let s = 0; s < radial; s++) {
      const s1 = (s + 1) % radial;
      b.quad(r0 + s, r0 + s1, r1 + s1, r1 + s);
    }
  }
  const cap = (ringIndex: number, pt: THREE.Vector3, t: number, flip: boolean): void => {
    const e = opts.ext ? opts.ext(t) : b.defaultExt;
    const c = b.vertex(pt.x, pt.y, pt.z, (u0 + u1) / 2, t * len * vScale, color[0], color[1], color[2], e[0], e[1], e[2], e[3]);
    const r0 = rings[ringIndex] as number;
    for (let s = 0; s < radial; s++) {
      const s1 = (s + 1) % radial;
      if (flip) b.tri(c, r0 + s1, r0 + s);
      else b.tri(c, r0 + s, r0 + s1);
    }
  };
  if (opts.capStart) cap(0, points[0] as THREE.Vector3, 0, true);
  if (opts.capEnd) cap(n - 1, points[n - 1] as THREE.Vector3, 1, false);
}

/** axis-aligned box in builder-local space (flat shaded: 24 vertices) */
export function addBox(b: GeoBuilder, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: RGB, uvx = 0, uvy = 0): void {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const faces: readonly (readonly [number, number, number][])[] = [
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
    [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
    [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
  ];
  for (const f of faces) {
    const ids: number[] = [];
    for (const c of f) ids.push(b.vertex(cx + c[0] * hx, cy + c[1] * hy, cz + c[2] * hz, uvx, uvy, color[0], color[1], color[2]));
    b.quad(ids[0] as number, ids[1] as number, ids[2] as number, ids[3] as number);
  }
}

/** low-poly ellipsoid (smooth) */
export function addBlob(
  b: GeoBuilder,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  color: RGB,
  segs = 8,
  rings = 5,
  deform?: (nx: number, ny: number, nz: number) => number,
  uvx = 0,
  uvy = 0,
): void {
  const base = b.vertexCount;
  for (let j = 0; j <= rings; j++) {
    const ph = (j / rings) * Math.PI;
    for (let i = 0; i < segs; i++) {
      const th = (i / segs) * Math.PI * 2;
      const nx = Math.sin(ph) * Math.cos(th);
      const ny = Math.cos(ph);
      const nz = Math.sin(ph) * Math.sin(th);
      const k = deform ? deform(nx, ny, nz) : 1;
      b.vertex(cx + nx * rx * k, cy + ny * ry * k, cz + nz * rz * k, uvx, uvy, color[0], color[1], color[2]);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const i1 = (i + 1) % segs;
      const a = base + j * segs + i;
      const a1 = base + j * segs + i1;
      b.quad(a, a1, a1 + segs, a + segs);
    }
  }
}
