/** Infrastruttura e helper condivisi dai costruttori delle decorazioni. */
import * as THREE from 'three';
import { RNG, hashString } from '../../../core/rng';
import { getPropTextures } from '../../textures/props-textures';
import { Batch, type ColorLike, Disposer, Pen, type Surf, TILE, type UberUniforms, type V3, cyl, lathe, leaf, makeUber, sphere, tr, tube, v3 } from '../kit';
import type { DecorModel, ShopEnv } from '../shop-types';

export interface DecorOpts {
  textureScale?: number;
  shopName?: string;
}

export interface AnimArgs {
  t: number;
  dt: number;
  env: ShopEnv;
  bones: THREE.Bone[];
  /** posizioni di riposo degli ossi */
  rest: THREE.Vector3[];
  u: UberUniforms;
}
export type Anim = (a: AnimArgs) => void;
/** none: emissivi fissi · lamps: accesi con lampsOn · neon: sempre accesi con sfarfallio · fire: fiamma tremolante */
export type GlowMode = 'none' | 'lamps' | 'neon' | 'fire';

export const AX = new THREE.Vector3(1, 0, 0);
export const AY = new THREE.Vector3(0, 1, 0);
export const AZ = new THREE.Vector3(0, 0, 1);

export class Decor {
  readonly rng: RNG;
  readonly b: Batch;
  readonly p: Pen;
  readonly root = new THREE.Group();
  readonly D = new Disposer();
  readonly shopName: string;
  private readonly scale: number;

  constructor(id: string, opts: DecorOpts) {
    this.rng = new RNG(hashString(id));
    this.b = new Batch('atlas', this.rng);
    this.p = new Pen(this.b);
    this.root.name = `decor-${id}`;
    this.shopName = opts.shopName ?? 'Island Fix';
    this.scale = opts.textureScale ?? 1;
  }

  /** Mesh aggiuntiva (vetro, faccia di poster…): geometria e materiale vengono liberati col modello. */
  extra(mesh: THREE.Mesh, cast = false): THREE.Mesh {
    this.D.track(mesh.geometry);
    this.D.track(mesh.material as THREE.Material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  finish(glow: GlowMode = 'none', anim?: Anim): DecorModel {
    const tex = getPropTextures(this.scale);
    const mat = this.D.track(makeUber({ map: tex.atlas, bump: 0.2, side: THREE.DoubleSide }));
    const built = this.b.build(mat, { name: 'decor-body' });
    this.D.mesh(built.mesh);
    this.root.add(built.mesh);
    const u = mat.userData.u;
    const rest = built.bones.map((b) => b.position.clone());
    let t = this.rng.next() * 10;
    let level = glow === 'lamps' ? 0.05 : 1;
    u.uGlow.value = level;
    const root = this.root;
    const D = this.D;
    return {
      root,
      update: (dt: number, env: ShopEnv): void => {
        t += dt;
        u.uTime.value = t;
        u.uWind.value = 0.12 + Math.max(0, env.wind) * 1.1;
        if (glow === 'lamps') {
          level += ((env.lampsOn ? 1 : 0.05) - level) * Math.min(1, dt * 4);
          u.uGlow.value = level;
        } else if (glow === 'neon') {
          const dip = Math.sin(t * 0.7) > 0.992 ? 0.55 : 1;
          u.uGlow.value = (0.94 + 0.04 * Math.sin(t * 31) + 0.02 * Math.sin(t * 7.3)) * dip;
        } else if (glow === 'fire') {
          u.uGlow.value = 0.8 + 0.14 * Math.sin(t * 11) + 0.08 * Math.sin(t * 23.7 + 1) + 0.05 * Math.sin(t * 5.1);
        }
        if (anim) anim({ t, dt, env, bones: built.bones, rest, u });
      },
      dispose: (): void => {
        root.removeFromParent();
        D.dispose();
      },
    };
  }
}

// ───────────────────────────── geometrie ─────────────────────────────

/** Superficie parametrica P(u,v) su una griglia nu×nv. UV = (u,v). */
export function param(fn: (u: number, v: number) => V3, nu: number, nv: number, u0 = 0, u1 = 1, v0 = 0, v1 = 1): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = u0 + ((u1 - u0) * i) / nu;
      const v = v0 + ((v1 - v0) * j) / nv;
      const q = fn(u, v);
      pos.push(q.x, q.y, q.z);
      uv.push(u, v);
      if (i < nu && j < nv) {
        const a = j * (nu + 1) + i;
        idx.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Contorno simmetrico nel piano XY: y da 0 a L, semilarghezza hw(t). */
export function outline(L: number, hw: (t: number) => number, n = 20): THREE.Shape {
  const s = new THREE.Shape();
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([hw(t), L * t]);
  }
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= n; i++) s.lineTo(pts[i][0], pts[i][1]);
  for (let i = n; i >= 0; i--) s.lineTo(-pts[i][0], pts[i][1]);
  return s;
}

/** Foglia piatta da un contorno, con UV (u lungo y, v attraverso) e curvatura: z = droop·(y/L)², bordi piegati di `cup`. */
export function flatLeaf(shape: THREE.Shape, L: number, W: number, droop: number, cup = 0): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shape, 4);
  const p = g.attributes.position as THREE.BufferAttribute;
  const u = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const t = y / L;
    u.setXY(i, t, 0.5 + x / W);
    p.setZ(i, droop * t * t + cup * (x / W) * (x / W) * 4);
  }
  g.computeVertexNormals();
  return g;
}

/** Vaso tornito con terriccio. Base in origine. */
export function pot(p: Pen, r: number, h: number, color: ColorLike = 0xc56a42, tile: (typeof TILE)[keyof typeof TILE] = TILE.terracotta, rough = 0.85): void {
  p.add(
    lathe([[0, 0], [r * 0.62, 0], [r * 0.68, h * 0.04], [r * 0.96, h * 0.86], [r * 1.07, h * 0.87], [r * 1.08, h], [r * 0.94, h], [r * 0.9, h * 0.9]], 18),
    { tile, color, rough, uv: [0.6, 0.8] },
  );
  p.cy(r * 0.91, r * 0.91, 0.006, 0, h * 0.9, 0, { tile: TILE.coir, color: 0x4a3423, rough: 1, uv: [0.3, 0.3] }, 16);
}

/** Fronda di palma/felce: rachide arcuato lungo +Z (parte dall'origine, sale e ricade) con foglioline ai lati. */
export function frond(p: Pen, len: number, rise: number, droop: number, pairs: number, leafLen: number, color: ColorLike, sway: number): void {
  const pts: V3[] = [];
  const N = 6;
  const at = (t: number): V3 => v3(0, rise * Math.sin(t * Math.PI * 0.6) - droop * t * t, len * t);
  for (let i = 0; i <= N; i++) pts.push(at(i / N));
  const y0 = p.pt(0, 0, 0).y;
  const sw: Surf = { swayFn: (_x, y) => Math.max(0, y - y0 + 0.1) * sway + sway * 0.03 };
  p.add(tube(pts, len * 0.012, 4, 2), { color: 0x7a8a3a, rough: 0.7, ...sw });
  for (let i = 0; i < pairs; i++) {
    const t = 0.12 + (0.88 * (i + 0.5)) / pairs;
    const c = at(t);
    const d = at(Math.min(1, t + 0.02)).sub(at(t - 0.02));
    const pitch = Math.atan2(d.y, d.z);
    const l = leafLen * Math.sin(Math.PI * Math.pow(t, 0.7)) + leafLen * 0.25;
    for (const s of [-1, 1]) {
      const q = p.at(c.x, c.y, c.z, -pitch, 0, 0).at(0, 0, 0, 0, s * 1.05, 0).at(0, 0, 0, 1.25, 0, 0);
      q.add(leaf(l, l * 0.2, { bend: 0.55, segs: 2, fold: l * 0.02 }), { tile: TILE.leaf, color, rough: 0.6, jitter: 0.12, uv: [0.5, 0.5], ...sw });
    }
  }
}

/** Fiore a 5 petali rivolto verso +Y (centro in origine). */
export function flower(p: Pen, r: number, petal: ColorLike, center: ColorLike, surf: Surf = {}, petals = 5): void {
  for (let i = 0; i < petals; i++) {
    const q = p.at(0, 0, 0, 0, (i / petals) * Math.PI * 2, 0).at(0, 0, 0, 1.2, 0, 0);
    q.add(leaf(r, r * 0.75, { bend: 0.5, segs: 2, fold: r * 0.05 }), { color: petal, rough: 0.7, ...surf });
  }
  p.add(sphere(r * 0.2, 6, 4), { color: center, rough: 0.6, ...surf }, tr(0, r * 0.08, 0));
}

/** Fiamma a goccia (base in origine), tre strati emissivi. */
export function flame(p: Pen, h: number, surf: Surf = {}): void {
  const prof = (s: number): Array<[number, number]> => [[0, 0], [h * 0.2 * s, h * 0.12 * s], [h * 0.26 * s, h * 0.3 * s], [h * 0.16 * s, h * 0.6 * s], [h * 0.05 * s, h * 0.85 * s], [0, h * s]];
  p.add(lathe(prof(1), 8), { color: 0xff6a1a, glow: 3.2, rough: 1, ...surf });
  p.add(lathe(prof(0.68), 8), { color: 0xffb02e, glow: 4.5, rough: 1, ...surf }, tr(0, h * 0.02, h * 0.02));
  p.add(lathe(prof(0.38), 6), { color: 0xfff0a0, glow: 6, rough: 1, ...surf }, tr(0, h * 0.04, h * 0.04));
}

/** Tubo al neon lungo punti 2D (piano XY, a distanza z dal pannello) con distanziali. */
export function neon(p: Pen, pts: Array<[number, number]>, color: ColorLike, closed = false, r = 0.011, z = 0.035, glow = 5): void {
  const path = pts.map(([x, y]) => v3(x, y, z));
  p.add(tube(path, r, 6, 5, closed), { color, rough: 0.3, glow });
  const step = Math.max(1, Math.floor(pts.length / 3));
  for (let i = 0; i < pts.length; i += step) p.add(cyl(r * 0.5, r * 0.5, z, 5), { color: 0xdfe6ea, rough: 0.2 }, tr(pts[i][0], pts[i][1], 0, Math.PI / 2));
}

/** Punti di un arco/ellisse 2D. */
export function arc2(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 10): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** Contorno di tavola da surf (y da 0 = coda a L = punta). */
export function boardShape(L: number, W: number): THREE.Shape {
  return outline(L, (t) => (W / 2) * Math.pow(Math.sin(Math.PI * Math.pow(0.04 + t * 0.96, 0.82)), 0.6), 24);
}
