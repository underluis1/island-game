/**
 * Kit di modellazione procedurale per gli strumenti.
 *
 * Tutto il modello opaco di uno strumento finisce in UNA geometria con un solo materiale condiviso:
 *  - colore        → vertex color
 *  - roughness/metalness per vertice → `uv1` che campiona una texture gradiente (vedi tools-atlas)
 *  - stampe/etichette → `uv` nell'atlante condiviso (le parti non stampate puntano al texel bianco)
 * Display, LED e parti incandescenti stanno in una seconda geometria ("glow") il cui vertex color
 * è la tinta emissiva (animabile per istanza senza clonare materiali).
 */
import * as THREE from 'three';
import { atlasPoint, disposeToolTextures, ormUv, toolAtlasDim, toolAtlasLit, toolOrm, type UVRect } from '../textures/tools-atlas';

export type P2 = readonly [number, number];
export type P3 = readonly [number, number, number];
export type { UVRect };

export interface Mat {
  /** colore sRGB esadecimale */
  c: number;
  /** roughness */
  r: number;
  /** metalness */
  m: number;
}
export const mat = (c: number, r: number, m = 0): Mat => ({ c, r, m });

/** punto di profilo per `lathe`: [raggio, y] o [raggio, y, materiale da qui in poi] */
export type LPt = readonly [number, number] | readonly [number, number, Mat];

export interface Xf {
  p?: P3;
  r?: P3;
  s?: number | P3;
}

const colorCache = new Map<number, readonly [number, number, number]>();
const tmpColor = new THREE.Color();
function linearRgb(hex: number): readonly [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) {
    tmpColor.setHex(hex, THREE.SRGBColorSpace);
    c = [tmpColor.r, tmpColor.g, tmpColor.b];
    colorCache.set(hex, c);
  }
  return c;
}

const WHITE = atlasPoint('white');

export class Builder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private uv1: number[] = [];
  private idx: number[] = [];
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private mirrored = false;
  private plainUv: readonly [number, number] = WHITE;

  get vcount(): number {
    return this.pos.length / 3;
  }
  get empty(): boolean {
    return this.idx.length === 0;
  }

  /** Esegue fn con una trasformazione locale composta (T·R·S). */
  at(xf: Xf, fn: () => void): this {
    const saved = this.m.clone();
    const savedMir = this.mirrored;
    const s = xf.s === undefined ? [1, 1, 1] : typeof xf.s === 'number' ? [xf.s, xf.s, xf.s] : xf.s;
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...(xf.p ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(xf.r ?? [0, 0, 0]), 'XYZ')),
      new THREE.Vector3(s[0], s[1], s[2]),
    );
    this.m.multiply(local);
    this.sync();
    fn();
    this.m.copy(saved);
    this.mirrored = savedMir;
    this.sync();
    return this;
  }

  /** UV usata per le parti non texturizzate (default: texel bianco). */
  withPlainUv(name: string, fn: () => void): this {
    const saved = this.plainUv;
    this.plainUv = atlasPoint(name);
    fn();
    this.plainUv = saved;
    return this;
  }

  private sync(): void {
    this.nm.getNormalMatrix(this.m);
    this.mirrored = this.m.determinant() < 0;
  }

  // ---------------------------------------------------------------- basso livello
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, m: Mat, u?: number, v?: number): number {
    const e = this.m.elements;
    this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    const n = this.nm.elements;
    let ax = n[0] * nx + n[3] * ny + n[6] * nz;
    let ay = n[1] * nx + n[4] * ny + n[7] * nz;
    let az = n[2] * nx + n[5] * ny + n[8] * nz;
    const l = Math.hypot(ax, ay, az) || 1;
    ax /= l;
    ay /= l;
    az /= l;
    this.nor.push(ax, ay, az);
    const c = linearRgb(m.c);
    this.col.push(c[0], c[1], c[2]);
    this.uv.push(u ?? this.plainUv[0], v ?? this.plainUv[1]);
    const o = ormUv(m.r, m.m);
    this.uv1.push(o[0], o[1]);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    if (this.mirrored) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  /** Triangolo orientato in modo che la normale geometrica (spazio locale) segua `hint`. */
  private triO(a: number, b: number, c: number, pa: P3, pb: P3, pc: P3, hx: number, hy: number, hz: number): void {
    const ux = pb[0] - pa[0];
    const uy = pb[1] - pa[1];
    const uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0];
    const vy = pc[1] - pa[1];
    const vz = pc[2] - pa[2];
    const d = (uy * vz - uz * vy) * hx + (uz * vx - ux * vz) * hy + (ux * vy - uy * vx) * hz;
    if (d >= 0) this.tri(a, b, c);
    else this.tri(a, c, b);
  }

  // ---------------------------------------------------------------- solidi di rivoluzione
  /**
   * Solido di rivoluzione attorno a Y. Profilo percorso con y crescente → normali verso l'esterno;
   * con y decrescente → verso l'asse (superfici interne). Gli spigoli oltre `crease` gradi restano vivi.
   */
  lathe(profile: readonly LPt[], m: Mat, o: { segs?: number; crease?: number } = {}): this {
    const segs = o.segs ?? 16;
    const cosCrease = Math.cos(((o.crease ?? 50) * Math.PI) / 180);
    const n = profile.length;
    const sn: (P2 | null)[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = profile[i] as LPt;
      const b = profile[i + 1] as LPt;
      const dr = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dr, dy);
      sn.push(l < 1e-9 ? null : [dy / l, -dr / l]);
    }
    const jointNormal = (seg: number, other: number): P2 => {
      const a = sn[seg] as P2;
      const b = other >= 0 && other < n - 1 ? sn[other] : null;
      if (!b) return a;
      if (a[0] * b[0] + a[1] * b[1] < cosCrease) return a;
      const x = a[0] + b[0];
      const y = a[1] + b[1];
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    };
    let cur = m;
    for (let i = 0; i < n - 1; i++) {
      const a = profile[i] as LPt;
      const b = profile[i + 1] as LPt;
      if (a[2]) cur = a[2];
      if (!sn[i] || (a[0] <= 1e-9 && b[0] <= 1e-9)) continue;
      const n0 = jointNormal(i, i - 1);
      const n1 = jointNormal(i, i + 1);
      const base = this.vcount;
      for (let j = 0; j < segs; j++) {
        const th = (j / segs) * Math.PI * 2;
        const c = Math.cos(th);
        const s = Math.sin(th);
        this.v(a[0] * c, a[1], a[0] * s, n0[0] * c, n0[1], n0[0] * s, cur);
        this.v(b[0] * c, b[1], b[0] * s, n1[0] * c, n1[1], n1[0] * s, cur);
      }
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        const A = base + j * 2;
        const D = A + 1;
        const B = base + j1 * 2;
        const C = B + 1;
        if (a[0] > 1e-9) this.tri(A, D, B);
        if (b[0] > 1e-9) this.tri(B, D, C);
      }
    }
    return this;
  }

  /** Come lathe ma con scanalature assiali (zigrinatura dritta) a facce piatte. */
  fluted(profile: readonly P2[], m: Mat, flutes: number, depth: number): this {
    const segs = flutes * 2;
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i] as P2;
      const b = profile[i + 1] as P2;
      for (let j = 0; j < segs; j++) {
        const t0 = (j / segs) * Math.PI * 2;
        const t1 = ((j + 1) / segs) * Math.PI * 2;
        const f0 = j % 2 === 0 ? 1 : 1 - depth;
        const f1 = j % 2 === 0 ? 1 - depth : 1;
        const p: P3[] = [
          [a[0] * f0 * Math.cos(t0), a[1], a[0] * f0 * Math.sin(t0)],
          [a[0] * f1 * Math.cos(t1), a[1], a[0] * f1 * Math.sin(t1)],
          [b[0] * f1 * Math.cos(t1), b[1], b[0] * f1 * Math.sin(t1)],
          [b[0] * f0 * Math.cos(t0), b[1], b[0] * f0 * Math.sin(t0)],
        ];
        this.flatQuad(p[0] as P3, p[3] as P3, p[2] as P3, p[1] as P3, m);
      }
    }
    return this;
  }

  /** Quad piatto (a,b,c,d in senso antiorario visto dal lato esterno). */
  flatQuad(a: P3, b: P3, c: P3, d: P3, m: Mat, mb: Mat = m, mc: Mat = m, md: Mat = m): void {
    const ux = c[0] - a[0];
    const uy = c[1] - a[1];
    const uz = c[2] - a[2];
    const vx = d[0] - b[0];
    const vy = d[1] - b[1];
    const vz = d[2] - b[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-14) return;
    nx /= l;
    ny /= l;
    nz /= l;
    const i0 = this.v(a[0], a[1], a[2], nx, ny, nz, m);
    const i1 = this.v(b[0], b[1], b[2], nx, ny, nz, mb);
    const i2 = this.v(c[0], c[1], c[2], nx, ny, nz, mc);
    const i3 = this.v(d[0], d[1], d[2], nx, ny, nz, md);
    this.tri(i0, i1, i2);
    this.tri(i0, i2, i3);
  }

  cyl(r: number, y0: number, y1: number, m: Mat, segs = 12, chamfer = 0): this {
    const ch = Math.min(chamfer, r * 0.9, (y1 - y0) * 0.45);
    if (ch > 0) {
      return this.lathe(
        [
          [0, y0],
          [r - ch, y0],
          [r, y0 + ch],
          [r, y1 - ch],
          [r - ch, y1],
          [0, y1],
        ],
        m,
        { segs },
      );
    }
    return this.lathe(
      [
        [0, y0],
        [r, y0],
        [r, y1],
        [0, y1],
      ],
      m,
      { segs },
    );
  }

  ball(rx: number, ry: number, m: Mat, segs = 12, rings = 8): this {
    const prof: P2[] = [];
    for (let i = 0; i <= rings; i++) {
      const a = -Math.PI / 2 + (i / rings) * Math.PI;
      prof.push([Math.max(0, Math.cos(a)) * rx, Math.sin(a) * ry]);
    }
    return this.lathe(prof, m, { segs, crease: 180 });
  }

  torus(R: number, r: number, m: Mat, segs = 20, sides = 8): this {
    const prof: P2[] = [];
    for (let i = 0; i <= sides; i++) {
      const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
      prof.push([R + Math.cos(a) * r, Math.sin(a) * r]);
    }
    return this.lathe(prof, m, { segs, crease: 180 });
  }

  // ---------------------------------------------------------------- loft / sweep
  /**
   * Collega anelli con lo stesso numero di punti. Convenzione: punti ordinati come (cos→x, sin→z) e
   * anelli successivi lungo +Y → normali verso l'esterno. Anelli duplicati = spigolo vivo.
   */
  loft(rings: readonly (readonly P3[])[], m: Mat | readonly Mat[], o: { capStart?: boolean; capEnd?: boolean; flat?: boolean; open?: boolean; loop?: boolean; flip?: boolean } = {}): this {
    const nr = rings.length;
    const np = (rings[0] as readonly P3[]).length;
    const matAt = (i: number): Mat => (Array.isArray(m) ? ((m as readonly Mat[])[Math.min(i, (m as readonly Mat[]).length - 1)] as Mat) : (m as Mat));
    const sign = o.flip ? -1 : 1;
    const cols = o.open ? np - 1 : np;
    const rows = o.loop ? nr : nr - 1;
    if (o.flat) {
      for (let i = 0; i < rows; i++) {
        const r0 = rings[i] as readonly P3[];
        const r1 = rings[(i + 1) % nr] as readonly P3[];
        for (let j = 0; j < cols; j++) {
          const j1 = (j + 1) % np;
          const a = r0[j] as P3;
          const b = r0[j1] as P3;
          const c = r1[j1] as P3;
          const d = r1[j] as P3;
          const m0 = matAt(i);
          const m1 = matAt(i + 1);
          if (o.flip) this.flatQuad(a, b, c, d, m0, m0, m1, m1);
          else this.flatQuad(a, d, c, b, m0, m1, m1, m0);
        }
      }
    } else {
      const acc = new Float64Array(nr * np * 3);
      const tris: number[] = [];
      const P = (i: number, j: number): P3 => (rings[i] as readonly P3[])[j] as P3;
      const addTri = (i0: number, j0: number, i1: number, j1: number, i2: number, j2: number): void => {
        const a = P(i0, j0);
        const b = P(i1, j1);
        const c = P(i2, j2);
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const uz = b[2] - a[2];
        const vx = c[0] - a[0];
        const vy = c[1] - a[1];
        const vz = c[2] - a[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        if (nx * nx + ny * ny + nz * nz < 1e-26) return;
        for (const k of [i0 * np + j0, i1 * np + j1, i2 * np + j2]) {
          acc[k * 3] += nx;
          acc[k * 3 + 1] += ny;
          acc[k * 3 + 2] += nz;
        }
        tris.push(i0 * np + j0, i1 * np + j1, i2 * np + j2);
      };
      for (let i = 0; i < rows; i++) {
        const i1 = (i + 1) % nr;
        for (let j = 0; j < cols; j++) {
          const j1 = (j + 1) % np;
          addTri(i, j, i1, j, i, j1);
          addTri(i, j1, i1, j, i1, j1);
        }
      }
      const base = this.vcount;
      for (let i = 0; i < nr; i++) {
        const mm = matAt(i);
        for (let j = 0; j < np; j++) {
          const p = P(i, j);
          const k = (i * np + j) * 3;
          const nx = acc[k] as number;
          const ny = acc[k + 1] as number;
          const nz = acc[k + 2] as number;
          const l = Math.hypot(nx, ny, nz);
          if (l < 1e-20) this.v(p[0], p[1], p[2], 0, 1, 0, mm);
          else this.v(p[0], p[1], p[2], (sign * nx) / l, (sign * ny) / l, (sign * nz) / l, mm);
        }
      }
      for (let t = 0; t < tris.length; t += 3) {
        const a = base + (tris[t] as number);
        const b = base + (tris[t + 1] as number);
        const c = base + (tris[t + 2] as number);
        if (o.flip) this.tri(a, c, b);
        else this.tri(a, b, c);
      }
    }
    if (o.capStart) this.cap(rings[0] as readonly P3[], matAt(0), !o.flip);
    if (o.capEnd) this.cap(rings[nr - 1] as readonly P3[], matAt(nr - 1), !!o.flip);
    return this;
  }

  /** Tappo piatto a ventaglio su un anello. `down` = normale opposta al verso di avanzamento del loft. */
  cap(ring: readonly P3[], m: Mat, down: boolean): void {
    const n = ring.length;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let j = 0; j < n; j++) {
      const a = ring[j] as P3;
      const b = ring[(j + 1) % n] as P3;
      cx += a[0];
      cy += a[1];
      cz += a[2];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-20) return;
    // l'ordinamento standard (cos→x, sin→z) ha normale di Newell = -Y: il tappo finale guarda quindi a -newell
    const s = down ? 1 : -1;
    nx = (nx / l) * s;
    ny = (ny / l) * s;
    nz = (nz / l) * s;
    const c = this.v(cx / n, cy / n, cz / n, nx, ny, nz, m);
    const base = this.vcount;
    for (let j = 0; j < n; j++) {
      const p = ring[j] as P3;
      this.v(p[0], p[1], p[2], nx, ny, nz, m);
    }
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      if (down) this.tri(c, base + j, base + j1);
      else this.tri(c, base + j1, base + j);
    }
  }

  /**
   * Estrude una sezione 2D (o un cerchio di raggio dato) lungo un percorso con frame a trasporto parallelo.
   * Sezione: punti (u,v) ordinati come (cos, sin); `up` orienta l'asse u della sezione.
   */
  sweep(
    path: readonly P3[],
    section: readonly P2[] | number,
    m: Mat | readonly Mat[],
    o: { sides?: number; up?: P3; scale?: (t: number) => number | P2; caps?: boolean; loop?: boolean; twist?: number; flat?: boolean } = {},
  ): this {
    const sec: P2[] = [];
    if (typeof section === 'number') {
      const sides = o.sides ?? 6;
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        sec.push([Math.cos(a) * section, Math.sin(a) * section]);
      }
    } else sec.push(...section);
    const n = path.length;
    const T = new THREE.Vector3();
    const N = new THREE.Vector3();
    const B = new THREE.Vector3();
    const rings: P3[][] = [];
    const tangentAt = (i: number): void => {
      const a = path[o.loop ? (i - 1 + n) % n : Math.max(0, i - 1)] as P3;
      const b = path[o.loop ? (i + 1) % n : Math.min(n - 1, i + 1)] as P3;
      T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    };
    tangentAt(0);
    if (o.up) N.set(o.up[0], o.up[1], o.up[2]);
    else if (Math.abs(T.y) < 0.9) N.set(0, 1, 0);
    else N.set(1, 0, 0);
    N.addScaledVector(T, -N.dot(T)).normalize();
    for (let i = 0; i < n; i++) {
      tangentAt(i);
      N.addScaledVector(T, -N.dot(T)).normalize();
      B.crossVectors(N, T);
      const t = n > 1 ? i / (n - 1) : 0;
      const sc = o.scale ? o.scale(t) : 1;
      const su = typeof sc === 'number' ? sc : sc[0];
      const sv = typeof sc === 'number' ? sc : sc[1];
      const tw = (o.twist ?? 0) * t;
      const ct = Math.cos(tw);
      const st = Math.sin(tw);
      const p = path[i] as P3;
      const ring: P3[] = [];
      for (const q of sec) {
        const u = (q[0] * ct - q[1] * st) * su;
        const v = (q[0] * st + q[1] * ct) * sv;
        ring.push([p[0] + N.x * u + B.x * v, p[1] + N.y * u + B.y * v, p[2] + N.z * u + B.z * v]);
      }
      rings.push(ring);
    }
    return this.loft(rings, m, { capStart: o.caps && !o.loop, capEnd: o.caps && !o.loop, loop: o.loop, flat: o.flat });
  }

  // ---------------------------------------------------------------- scatole ed estrusioni
  /** Scatola centrata con spigoli smussati e normali interpolate (aspetto arrotondato, 44 triangoli). */
  box(w: number, h: number, d: number, m: Mat, bevel?: number): this {
    const b = Math.min(bevel ?? Math.min(w, h, d) * 0.1, Math.min(w, h, d) * 0.49);
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const ids: number[][] = [];
    const pts: P3[][] = [];
    for (let c = 0; c < 8; c++) {
      const sx = c & 1 ? 1 : -1;
      const sy = c & 2 ? 1 : -1;
      const sz = c & 4 ? 1 : -1;
      const px: P3 = [sx * hx, sy * (hy - b), sz * (hz - b)];
      const py: P3 = [sx * (hx - b), sy * hy, sz * (hz - b)];
      const pz: P3 = [sx * (hx - b), sy * (hy - b), sz * hz];
      pts.push([px, py, pz]);
      ids.push([this.v(px[0], px[1], px[2], sx, 0, 0, m), this.v(py[0], py[1], py[2], 0, sy, 0, m), this.v(pz[0], pz[1], pz[2], 0, 0, sz, m)]);
    }
    const quad = (c: number[], ax: number[], hint: P3): void => {
      const i = c.map((ci, k) => (ids[ci] as number[])[ax[k] as number] as number);
      const p = c.map((ci, k) => (pts[ci] as P3[])[ax[k] as number] as P3);
      this.triO(i[0] as number, i[1] as number, i[2] as number, p[0] as P3, p[1] as P3, p[2] as P3, hint[0], hint[1], hint[2]);
      this.triO(i[0] as number, i[2] as number, i[3] as number, p[0] as P3, p[2] as P3, p[3] as P3, hint[0], hint[1], hint[2]);
    };
    const bit = [1, 2, 4];
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3;
      const w2 = (axis + 2) % 3;
      for (const s of [0, 1]) {
        const c0 = s ? (bit[axis] as number) : 0;
        const cs = [c0, c0 | (bit[u] as number), c0 | (bit[u] as number) | (bit[w2] as number), c0 | (bit[w2] as number)];
        const hint: [number, number, number] = [0, 0, 0];
        hint[axis] = s ? 1 : -1;
        quad(cs, [axis, axis, axis, axis], hint);
      }
      // spigoli paralleli a `axis`
      for (const su of [0, 1]) {
        for (const sw of [0, 1]) {
          const c0 = (su ? (bit[u] as number) : 0) | (sw ? (bit[w2] as number) : 0);
          const c1 = c0 | (bit[axis] as number);
          const hint: [number, number, number] = [0, 0, 0];
          hint[u] = su ? 1 : -1;
          hint[w2] = sw ? 1 : -1;
          quad([c0, c1, c1, c0], [u, u, w2, w2], hint);
        }
      }
    }
    for (let c = 0; c < 8; c++) {
      const i = ids[c] as number[];
      const p = pts[c] as P3[];
      this.triO(i[0] as number, i[1] as number, i[2] as number, p[0] as P3, p[1] as P3, p[2] as P3, c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1);
    }
    return this;
  }

  /**
   * Prisma: contorno 2D nel piano XY estruso lungo Z (centrato). `bevel` smussa i bordi dei tappi.
   * `uvFront`/`uvBack` mappano il riquadro del contorno su una regione dell'atlante.
   */
  extrude(outline: readonly P2[], depth: number, m: Mat, o: { bevel?: number; uvFront?: UVRect; uvBack?: UVRect; crease?: number; capMat?: Mat } = {}): this {
    let pts = outline.slice();
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as P2;
      const b = pts[(i + 1) % pts.length] as P2;
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (area < 0) pts = pts.reverse();
    const n = pts.length;
    const bevel = Math.min(o.bevel ?? 0, depth * 0.49);
    const cosCrease = Math.cos(((o.crease ?? 40) * Math.PI) / 180);
    const en: P2[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i] as P2;
      const b = pts[(i + 1) % n] as P2;
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const l = Math.hypot(ex, ey) || 1;
      en.push([ey / l, -ex / l]);
    }
    const inset: P2[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = pts[i] as P2;
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
      const a = en[(i - 1 + n) % n] as P2;
      const b = en[i] as P2;
      let mx = a[0] + b[0];
      let my = a[1] + b[1];
      const l = Math.hypot(mx, my) || 1;
      mx /= l;
      my /= l;
      const cosHalf = Math.max(0.4, mx * b[0] + my * b[1]);
      inset.push([p[0] - (mx * bevel) / cosHalf, p[1] - (my * bevel) / cosHalf]);
    }
    const zs = depth / 2 - bevel;
    // lati: per ogni vertice due copie (lato precedente / lato successivo)
    const side: number[][] = []; // [prevBottom, prevTop, nextBottom, nextTop]
    for (let i = 0; i < n; i++) {
      const p = pts[i] as P2;
      const a = en[(i - 1 + n) % n] as P2;
      const b = en[i] as P2;
      let na = a;
      let nb = b;
      if (a[0] * b[0] + a[1] * b[1] >= cosCrease) {
        const x = a[0] + b[0];
        const y = a[1] + b[1];
        const l = Math.hypot(x, y) || 1;
        na = nb = [x / l, y / l];
      }
      side.push([this.v(p[0], p[1], -zs, na[0], na[1], 0, m), this.v(p[0], p[1], zs, na[0], na[1], 0, m), this.v(p[0], p[1], -zs, nb[0], nb[1], 0, m), this.v(p[0], p[1], zs, nb[0], nb[1], 0, m)]);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const s0 = side[i] as number[];
      const s1 = side[j] as number[];
      const p = pts[i] as P2;
      const q = pts[j] as P2;
      const e = en[i] as P2;
      const a: P3 = [p[0], p[1], -zs];
      const b: P3 = [q[0], q[1], -zs];
      const c: P3 = [q[0], q[1], zs];
      const d: P3 = [p[0], p[1], zs];
      this.triO(s0[2] as number, s1[0] as number, s1[1] as number, a, b, c, e[0], e[1], 0);
      this.triO(s0[2] as number, s1[1] as number, s0[3] as number, a, c, d, e[0], e[1], 0);
    }
    const contour = inset.map((p) => new THREE.Vector2(p[0], p[1]));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const cm = o.capMat ?? m;
    for (const sgn of [1, -1]) {
      const uvr = sgn > 0 ? o.uvFront : o.uvBack;
      const capIds: number[] = [];
      for (let i = 0; i < n; i++) {
        const p = inset[i] as P2;
        let u: number | undefined;
        let v: number | undefined;
        if (uvr) {
          let tx = (p[0] - minX) / (maxX - minX || 1);
          if (sgn < 0) tx = 1 - tx;
          const ty = (p[1] - minY) / (maxY - minY || 1);
          u = uvr[0] + (uvr[2] - uvr[0]) * tx;
          v = uvr[1] + (uvr[3] - uvr[1]) * ty;
        }
        capIds.push(this.v(p[0], p[1], (sgn * depth) / 2, 0, 0, sgn, cm, u, v));
      }
      for (const f of faces) {
        const [a, b, c] = f as [number, number, number];
        const pa = inset[a] as P2;
        const pb = inset[b] as P2;
        const pc = inset[c] as P2;
        this.triO(capIds[a] as number, capIds[b] as number, capIds[c] as number, [pa[0], pa[1], 0], [pb[0], pb[1], 0], [pc[0], pc[1], 0], 0, 0, sgn);
      }
      if (bevel > 0) {
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const s0 = side[i] as number[];
          const s1 = side[j] as number[];
          const k = sgn > 0 ? 1 : 0;
          const p = pts[i] as P2;
          const q = pts[j] as P2;
          const pi = inset[i] as P2;
          const qi = inset[j] as P2;
          const e = en[i] as P2;
          const z = sgn * zs;
          const zc = (sgn * depth) / 2;
          this.triO(s0[2 + k] as number, s1[k] as number, capIds[j] as number, [p[0], p[1], z], [q[0], q[1], z], [qi[0], qi[1], zc], e[0], e[1], sgn);
          this.triO(s0[2 + k] as number, capIds[j] as number, capIds[i] as number, [p[0], p[1], z], [qi[0], qi[1], zc], [pi[0], pi[1], zc], e[0], e[1], sgn);
        }
      }
    }
    return this;
  }

  // ---------------------------------------------------------------- superfici texturizzate
  /** Quad nel piano XY rivolto a +Z, centrato, mappato su una regione dell'atlante. */
  plate(w: number, h: number, m: Mat, uv: UVRect): this {
    const a = this.v(-w / 2, -h / 2, 0, 0, 0, 1, m, uv[0], uv[1]);
    const b = this.v(w / 2, -h / 2, 0, 0, 0, 1, m, uv[2], uv[1]);
    const c = this.v(w / 2, h / 2, 0, 0, 0, 1, m, uv[2], uv[3]);
    const d = this.v(-w / 2, h / 2, 0, 0, 0, 1, m, uv[0], uv[3]);
    this.tri(a, b, c);
    this.tri(a, c, d);
    return this;
  }

  /** Disco nel piano XY rivolto a +Z (opzionalmente mappato sull'atlante). */
  disc(r: number, m: Mat, uv?: UVRect, segs = 16): this {
    const map = (x: number, y: number): [number | undefined, number | undefined] => (uv ? [uv[0] + (uv[2] - uv[0]) * (x * 0.5 + 0.5), uv[1] + (uv[3] - uv[1]) * (y * 0.5 + 0.5)] : [undefined, undefined]);
    const cu = map(0, 0);
    const c = this.v(0, 0, 0, 0, 0, 1, m, cu[0], cu[1]);
    const base = this.vcount;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const u = map(Math.cos(a), Math.sin(a));
      this.v(Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, 1, m, u[0], u[1]);
    }
    for (let j = 0; j < segs; j++) this.tri(c, base + j, base + ((j + 1) % segs));
    return this;
  }

  /** Fascia cilindrica (etichetta avvolta) attorno a Y, angoli in radianti (0 = +X, π/2 = +Z). */
  band(r: number, y0: number, y1: number, a0: number, a1: number, m: Mat, uv: UVRect, segs = 12): this {
    const base = this.vcount;
    for (let j = 0; j <= segs; j++) {
      const t = j / segs;
      const a = a0 + (a1 - a0) * t;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const u = uv[2] - (uv[2] - uv[0]) * t;
      this.v(c * r, y0, s * r, c, 0, s, m, u, uv[1]);
      this.v(c * r, y1, s * r, c, 0, s, m, u, uv[3]);
    }
    for (let j = 0; j < segs; j++) {
      const A = base + j * 2;
      this.tri(A, A + 1, A + 2);
      this.tri(A + 2, A + 1, A + 3);
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(this.uv1, 2));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ------------------------------------------------------------------ generatori di anelli e percorsi
/** Anello (super)ellittico nel piano XZ a quota y. exp = 2 ellisse, > 2 più squadrato. */
export function ringE(y: number, rx: number, rz: number, n: number, exp = 2, cx = 0, cz = 0): P3[] {
  const out: P3[] = [];
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = 2 / exp;
    out.push([cx + Math.sign(c) * Math.pow(Math.abs(c), k) * rx, y, cz + Math.sign(s) * Math.pow(Math.abs(s), k) * rz]);
  }
  return out;
}

/** Applica una trasformazione (posizione + rotazione eulero XYZ + scala) a un anello. */
export function xfRing(ring: readonly P3[], xf: Xf): P3[] {
  const s = xf.s === undefined ? [1, 1, 1] : typeof xf.s === 'number' ? [xf.s, xf.s, xf.s] : xf.s;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...(xf.p ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(xf.r ?? [0, 0, 0]), 'XYZ')), new THREE.Vector3(s[0], s[1], s[2]));
  const v = new THREE.Vector3();
  return ring.map((p) => {
    v.set(p[0], p[1], p[2]).applyMatrix4(m);
    return [v.x, v.y, v.z] as P3;
  });
}

/** Contorno 2D di un rettangolo arrotondato (antiorario), centrato. */
export function roundRect(w: number, h: number, r: number, cornerSegs = 4): P2[] {
  const rr = Math.min(r, w / 2, h / 2);
  const out: P2[] = [];
  const corners: P2[] = [
    [w / 2 - rr, h / 2 - rr],
    [-w / 2 + rr, h / 2 - rr],
    [-w / 2 + rr, -h / 2 + rr],
    [w / 2 - rr, -h / 2 + rr],
  ];
  corners.forEach((c, k) => {
    for (let i = 0; i <= cornerSegs; i++) {
      const a = (k + i / cornerSegs) * (Math.PI / 2);
      out.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
    }
  });
  return out;
}

/** Sezione rettangolare arrotondata nella convenzione (cos, sin) usata da `sweep`/`loft`. */
export function rectSection(w: number, h: number, r = 0, cornerSegs = 2): P2[] {
  if (r <= 0) {
    return [
      [w / 2, h / 2],
      [-w / 2, h / 2],
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
    ];
  }
  return roundRect(w, h, r, cornerSegs);
}

/** Anello rettangolare arrotondato nel piano XZ a quota y (w lungo X, d lungo Z). */
export function ringR(y: number, w: number, d: number, r: number, cornerSegs = 3, cx = 0, cz = 0): P3[] {
  return roundRect(w, d, r, cornerSegs).map((p) => [cx + p[0], y, cz + p[1]] as P3);
}

/** Campiona una spline Catmull-Rom passante per i punti dati. */
export function spline(pts: readonly P3[], n: number, closed = false): P3[] {
  const c = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed,
    'centripetal',
  );
  const out: P3[] = [];
  const count = closed ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const v = c.getPoint(i / n);
    out.push([v.x, v.y, v.z]);
  }
  return out;
}

/** Arco di profilo per lathe: punti (cx + R cos a, cy + R sin a) per a da a0 ad a1 (radianti). */
export function arc(cx: number, cy: number, R: number, a0: number, a1: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  }
  return out;
}

// ------------------------------------------------------------------ materiali condivisi
let mainMat: THREE.MeshStandardMaterial | null = null;
let glowMat: THREE.MeshStandardMaterial | null = null;
let glassMat: THREE.MeshPhysicalMaterial | null = null;

/** Materiale opaco condiviso da tutti gli strumenti. */
export function toolMaterial(): THREE.MeshStandardMaterial {
  if (!mainMat) {
    mainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: toolAtlasLit(), roughnessMap: toolOrm(), metalnessMap: toolOrm(), roughness: 1, metalness: 1 });
    mainMat.name = 'tools-main';
  }
  return mainMat;
}

/** Materiale per display/LED/parti incandescenti: emissivo = atlante × vertex color (animabile per istanza). */
export function toolGlowMaterial(): THREE.MeshStandardMaterial {
  if (!glowMat) {
    glowMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: toolAtlasDim(), emissiveMap: toolAtlasLit(), emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.22, metalness: 0 });
    glowMat.name = 'tools-glow';
    glowMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <color_fragment>', '')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
    };
    glowMat.customProgramCacheKey = () => 'tools-glow-v1';
  }
  return glowMat;
}

/** Plastica trasparente fumé (coperchi, schermi protettivi). */
export function toolGlassMaterial(): THREE.MeshPhysicalMaterial {
  if (!glassMat) {
    glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb4c0, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.05 });
    glassMat.name = 'tools-glass';
  }
  return glassMat;
}

/** Libera materiali e texture condivisi (da chiamare solo alla chiusura del gioco). */
export function disposeToolShared(): void {
  mainMat?.dispose();
  glowMat?.dispose();
  glassMat?.dispose();
  mainMat = glowMat = null;
  glassMat = null;
  disposeToolTextures();
}

// ------------------------------------------------------------------ assemblaggio
export interface ToolModel {
  root: THREE.Group;
  update?(dt: number, active: boolean): void;
  dispose(): void;
}

export interface GlowRange {
  start: number;
  end: number;
}

export class Asm {
  readonly main = new Builder();
  readonly glow = new Builder();
  readonly glass = new Builder();
  readonly root = new THREE.Group();
  private geos: THREE.BufferGeometry[] = [];
  glowGeo: THREE.BufferGeometry | null = null;
  private glowState = new Map<GlowRange, number>();

  /** Registra i vertici glow aggiunti da fn come intervallo animabile. */
  glowPart(fn: () => void): GlowRange {
    const start = this.glow.vcount;
    fn();
    return { start, end: this.glow.vcount };
  }

  /** Aggiunge alla root una mesh separata (parti mobili) costruita con un Builder dedicato. */
  extra(b: Builder, kind: 'main' | 'glow' | 'glass' = 'main', name = 'part'): THREE.Mesh {
    const geo = b.build();
    this.geos.push(geo);
    const mesh = new THREE.Mesh(geo, kind === 'main' ? toolMaterial() : kind === 'glow' ? toolGlowMaterial() : toolGlassMaterial());
    mesh.name = name;
    mesh.castShadow = kind !== 'glass';
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** Imposta la tinta emissiva (lineare, può superare 1) di un intervallo glow. */
  setGlow(range: GlowRange, r: number, g: number, b: number): void {
    if (!this.glowGeo) return;
    const key = Math.round(r * 200) * 1e8 + Math.round(g * 200) * 1e4 + Math.round(b * 200);
    if (this.glowState.get(range) === key) return;
    this.glowState.set(range, key);
    const attr = this.glowGeo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = range.start; i < range.end; i++) attr.setXYZ(i, r, g, b);
    attr.needsUpdate = true;
  }

  finish(name: string, update?: (dt: number, active: boolean) => void): ToolModel {
    this.root.name = name;
    if (!this.main.empty) this.extra(this.main, 'main', 'body').renderOrder = 0;
    if (!this.glow.empty) {
      const mesh = this.extra(this.glow, 'glow', 'glow');
      mesh.castShadow = false;
      this.glowGeo = mesh.geometry;
    }
    if (!this.glass.empty) this.extra(this.glass, 'glass', 'glass').renderOrder = 2;
    const geos = this.geos;
    const root = this.root;
    return {
      root,
      update,
      dispose: () => {
        for (const g of geos) g.dispose();
        root.clear();
        root.removeFromParent();
      },
    };
  }
}

/** Avvicina `cur` a `target` con costante di tempo `tau` (secondi). */
export function approach(cur: number, target: number, dt: number, tau: number): number {
  return cur + (target - cur) * (1 - Math.exp(-dt / Math.max(1e-4, tau)));
}
