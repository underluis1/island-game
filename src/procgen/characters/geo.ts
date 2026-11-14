/**
 * Costruttore di geometria "skinned" a vertex color per i personaggi low-poly.
 * Tutto finisce in un'unica BufferGeometry indicizzata (posizione, normale, colore, skinIndex, skinWeight).
 */
import * as THREE from 'three';

/** colore sRGB 0xRRGGBB */
export type Hex = number;

export interface Ring {
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
  c: Hex;
  b0: number;
  b1?: number;
  /** peso di b1 (0..1) */
  w1?: number;
  /** esponente superellisse (2 = ellisse, >2 = più squadrato) */
  sq?: number;
}

export interface TubeOpts {
  capA?: boolean;
  capB?: boolean;
  /** colore per vertice (undefined = colore dell'anello) */
  colorAt?: (ring: number, k: number, ang: number) => Hex | undefined;
  /** skinning per vertice [b0, b1, w1] (undefined = quello dell'anello) */
  skinAt?: (ring: number, k: number, x: number, z: number) => [number, number, number] | undefined;
  /** sfasamento angolare in frazioni di lato */
  angOff?: number;
  flip?: boolean;
}

const tmpColor = new THREE.Color();
const tmpV = new THREE.Vector3();
const colorCache = new Map<number, [number, number, number]>();

function linear(hex: Hex): [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) {
    tmpColor.setHex(hex, THREE.SRGBColorSpace);
    c = [tmpColor.r, tmpColor.g, tmpColor.b];
    colorCache.set(hex, c);
  }
  return c;
}

export function mix(a: Hex, b: Hex, t: number): Hex {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function shade(a: Hex, f: number): Hex {
  return f <= 1 ? mix(0x000000, a, f) : mix(a, 0xffffff, f - 1);
}

export class GeoBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];
  private idx: number[] = [];
  private grp: number[] = [];
  private nextGroup = 1;
  /** trasformazione applicata ai vertici aggiunti (null = identità) */
  mat: THREE.Matrix4 | null = null;

  get vertexCount(): number {
    return this.pos.length / 3;
  }
  get triangleCount(): number {
    return this.idx.length / 3;
  }

  group(): number {
    return this.nextGroup++;
  }

  vert(x: number, y: number, z: number, c: Hex, g: number, b0: number, b1 = 0, w1 = 0): number {
    if (this.mat) {
      tmpV.set(x, y, z).applyMatrix4(this.mat);
      x = tmpV.x;
      y = tmpV.y;
      z = tmpV.z;
    }
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    const l = linear(c);
    this.col.push(l[0], l[1], l[2]);
    this.si.push(b0, b1, 0, 0);
    this.sw.push(1 - w1, w1, 0, 0);
    this.grp.push(g);
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /** Riscrive il colore dei vertici [from, to). */
  static recolor(geo: THREE.BufferGeometry, from: number, to: number, c: Hex): void {
    const attr = geo.getAttribute('color') as THREE.BufferAttribute;
    const l = linear(c);
    for (let i = from; i < to; i++) attr.setXYZ(i, l[0], l[1], l[2]);
    attr.needsUpdate = true;
  }

  /** Tubo "loft" lungo Y: anelli ellittici (o superellittici) nel piano XZ, normali lisce. */
  tube(rings: Ring[], sides: number, opts: TubeOpts = {}): void {
    const g = this.group();
    const base = this.vertexCount;
    const off = opts.angOff ?? 0;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i] as Ring;
      const e = 2 / (r.sq ?? 2);
      for (let k = 0; k < sides; k++) {
        const ang = ((k + off) / sides) * Math.PI * 2;
        let cs = Math.cos(ang);
        let sn = Math.sin(ang);
        if (e !== 1) {
          cs = Math.sign(cs) * Math.pow(Math.abs(cs), e);
          sn = Math.sign(sn) * Math.pow(Math.abs(sn), e);
        }
        const x = r.x + r.rx * cs;
        const z = r.z + r.rz * sn;
        const c = opts.colorAt?.(i, k, ang) ?? r.c;
        const s = opts.skinAt?.(i, k, x, z);
        if (s) this.vert(x, r.y, z, c, g, s[0], s[1], s[2]);
        else this.vert(x, r.y, z, c, g, r.b0, r.b1 ?? 0, r.w1 ?? 0);
      }
    }
    const first = rings[0] as Ring;
    const lastR = rings[rings.length - 1] as Ring;
    let up = lastR.y >= first.y;
    if (opts.flip) up = !up;
    for (let i = 0; i < rings.length - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a = base + i * sides + k;
        const b = base + i * sides + ((k + 1) % sides);
        const c = base + (i + 1) * sides + ((k + 1) % sides);
        const d = base + (i + 1) * sides + k;
        if (up) this.quad(a, d, c, b);
        else this.quad(a, b, c, d);
      }
    }
    const cap = (ri: number, start: boolean): void => {
      const r = rings[ri] as Ring;
      const cg = this.group();
      const center = this.vert(r.x, r.y, r.z, r.c, cg, r.b0, r.b1 ?? 0, r.w1 ?? 0);
      const ringBase = this.vertexCount;
      for (let k = 0; k < sides; k++) {
        const src = (base + ri * sides + k) * 3;
        this.pos.push(this.pos[src] as number, this.pos[src + 1] as number, this.pos[src + 2] as number);
        const cs = (base + ri * sides + k) * 3;
        this.col.push(this.col[cs] as number, this.col[cs + 1] as number, this.col[cs + 2] as number);
        const ss = (base + ri * sides + k) * 4;
        this.si.push(this.si[ss] as number, this.si[ss + 1] as number, 0, 0);
        this.sw.push(this.sw[ss] as number, this.sw[ss + 1] as number, 0, 0);
        this.grp.push(cg);
      }
      for (let k = 0; k < sides; k++) {
        const a = ringBase + k;
        const b = ringBase + ((k + 1) % sides);
        if (start === up) this.tri(center, a, b);
        else this.tri(center, b, a);
      }
    };
    if (opts.capA) cap(0, true);
    if (opts.capB) cap(rings.length - 1, false);
  }

  /** Ellissoide (anelli lungo Y). */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, sides: number, nRings: number, c: Hex, b0: number, b1 = 0, w1 = 0): void {
    const rings: Ring[] = [];
    for (let i = 0; i <= nRings; i++) {
      const t = -1 + (2 * i) / nRings;
      const r = Math.max(0.02, Math.sqrt(Math.max(0, 1 - t * t)));
      const tt = i === 0 ? -0.985 : i === nRings ? 0.985 : t;
      rings.push({ x: cx, y: cy + ry * tt, z: cz, rx: rx * (i === 0 || i === nRings ? 0.12 : r), rz: rz * (i === 0 || i === nRings ? 0.12 : r), c, b0, b1, w1 });
    }
    this.tube(rings, sides, { capA: true, capB: true });
  }

  /** Scatola a spigoli vivi centrata in (cx,cy,cz). */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, c: Hex, b0: number, cTop?: Hex): void {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const faces: [number, number, number][][] = [
      [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
      [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
      [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],
      [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]],
      [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],
      [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]],
    ];
    faces.forEach((f, fi) => {
      const g = this.group();
      const col = fi === 4 && cTop !== undefined ? cTop : c;
      const v = f.map((p) => this.vert(cx + p[0], cy + p[1], cz + p[2], col, g, b0));
      this.quad(v[0] as number, v[1] as number, v[2] as number, v[3] as number);
    });
  }

  /** Poligono convesso piatto (ventaglio); i punti vanno in senso antiorario visti dal lato visibile. */
  poly(points: [number, number, number][], c: Hex, b0: number, skin?: (i: number) => [number, number, number]): number {
    const g = this.group();
    const start = this.vertexCount;
    points.forEach((p, i) => {
      const s = skin?.(i);
      if (s) this.vert(p[0], p[1], p[2], c, g, s[0], s[1], s[2]);
      else this.vert(p[0], p[1], p[2], c, g, b0);
    });
    for (let i = 1; i < points.length - 1; i++) this.tri(start, start + i, start + i + 1);
    return start;
  }

  build(): THREE.BufferGeometry {
    const n = this.vertexCount;
    const normals = new Float32Array(n * 3);
    const acc = new Map<string, [number, number, number]>();
    const keys: string[] = new Array<string>(n);
    for (let i = 0; i < n; i++) {
      keys[i] = `${this.grp[i]}|${Math.round((this.pos[i * 3] as number) * 5000)}|${Math.round((this.pos[i * 3 + 1] as number) * 5000)}|${Math.round((this.pos[i * 3 + 2] as number) * 5000)}`;
    }
    const p = this.pos;
    for (let t = 0; t < this.idx.length; t += 3) {
      const a = this.idx[t] as number;
      const b = this.idx[t + 1] as number;
      const c = this.idx[t + 2] as number;
      const ax = p[a * 3] as number;
      const ay = p[a * 3 + 1] as number;
      const az = p[a * 3 + 2] as number;
      const e1x = (p[b * 3] as number) - ax;
      const e1y = (p[b * 3 + 1] as number) - ay;
      const e1z = (p[b * 3 + 2] as number) - az;
      const e2x = (p[c * 3] as number) - ax;
      const e2y = (p[c * 3 + 1] as number) - ay;
      const e2z = (p[c * 3 + 2] as number) - az;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      for (const v of [a, b, c]) {
        const k = keys[v] as string;
        const cur = acc.get(k);
        if (cur) {
          cur[0] += nx;
          cur[1] += ny;
          cur[2] += nz;
        } else acc.set(k, [nx, ny, nz]);
      }
    }
    for (let i = 0; i < n; i++) {
      const v = acc.get(keys[i] as string);
      if (!v) {
        normals[i * 3 + 1] = 1;
        continue;
      }
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      normals[i * 3] = v[0] / l;
      normals[i * 3 + 1] = v[1] / l;
      normals[i * 3 + 2] = v[2] / l;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return geo;
  }
}
