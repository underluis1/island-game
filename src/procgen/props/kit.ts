/**
 * Kit di modellazione procedurale per oggetti di scena.
 *
 * - `Batch`: accumula geometrie (con colore, tessera d'atlante, rugosità, metallo, emissione,
 *   ondeggiamento e osso per vertice) e le fonde in UNA mesh → un draw call per materiale.
 * - `makeUber`: MeshStandardMaterial esteso che legge quegli attributi per vertice, così legno,
 *   plastica, metallo e lucine convivono nella stessa mesh.
 * - Geometrie di base con smussi (`rbox`), canne di bambù, tubi/corde, foglie.
 *
 * Convenzione UV: la "venatura" delle tessere corre lungo U. `rbox` ha U lungo X: modella i pezzi
 * lunghi lungo X e orientali con la matrice. `cyl`, `bamboo`, `lathe` hanno U lungo l'asse.
 */
import * as THREE from 'three';
import { RNG } from '../../core/rng';
import { TILE, type Tile } from '../textures/props-textures';

export { TILE };
export type { Tile };
export type V3 = THREE.Vector3;
export type ColorLike = THREE.ColorRepresentation;

export const v3 = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Matrice TRS compatta (rotazioni in radianti, ordine XYZ). */
export function tr(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

/** Matrice che porta una geometria costruita lungo +Y (base in 0) sul segmento a→b. */
export function alongY(a: V3, b: V3): THREE.Matrix4 {
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1));
}

/** Matrice che porta una geometria centrata e lunga in X sul segmento a→b (centro a metà). */
export function alongX(a: V3, b: V3): THREE.Matrix4 {
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
}

export interface Surf {
  color?: ColorLike;
  /** tessera d'atlante (solo batch 'atlas'); default plain */
  tile?: Tile;
  /** atlas: frazione della tessera usata lungo U,V (≤1). repeat: numero di ripetizioni lungo U,V */
  uv?: [number, number];
  /** scambia U e V (ruota la venatura di 90°) */
  rot?: boolean;
  rough?: number;
  metal?: number;
  /** emissione (moltiplica il colore; >1 per il bloom). Scalata dall'uniform uGlow del materiale */
  glow?: number;
  /** ampiezza (m) dell'ondeggiamento col vento */
  sway?: number;
  /** ampiezza per vertice (posizione finale) — ha precedenza su `sway` */
  swayFn?: (x: number, y: number, z: number) => number;
  /** osso (da `Batch.bone`) a cui legare rigidamente la geometria */
  bone?: number;
  /** variazione casuale di luminosità ±jitter */
  jitter?: number;
}

export interface Built {
  mesh: THREE.Mesh;
  /** ossa nell'ordine di creazione: bones[i] corrisponde all'indice restituito da `bone()` */
  bones: THREE.Bone[];
}

const _c = new THREE.Color();

export class Batch {
  private pos: number[] = [];
  private nor: number[] = [];
  private uvs: number[] = [];
  private col: number[] = [];
  private rme: number[] = [];
  private skin: number[] = [];
  private idx: number[] = [];
  private boneDefs: Array<{ pivot: V3; parent: number }> = [];

  constructor(
    readonly mode: 'atlas' | 'repeat',
    readonly rng: RNG,
  ) {}

  get triangles(): number {
    return this.idx.length / 3;
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }

  /** Crea un osso con perno `pivot` (spazio della mesh). Restituisce l'indice da usare in `Surf.bone`. */
  bone(pivot: V3, parent = 0): number {
    this.boneDefs.push({ pivot: pivot.clone(), parent });
    return this.boneDefs.length;
  }

  /** Aggiunge (e consuma) una geometria. */
  add(g: THREE.BufferGeometry, s: Surf = {}, m?: THREE.Matrix4): this {
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    const base = this.pos.length / 3;
    const count = p.count;
    const tile = s.tile ?? TILE.plain;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    if (u) {
      for (let i = 0; i < count; i++) {
        const a = s.rot ? u.getY(i) : u.getX(i);
        const b = s.rot ? u.getX(i) : u.getY(i);
        if (a < minU) minU = a;
        if (a > maxU) maxU = a;
        if (b < minV) minV = b;
        if (b > maxV) maxV = b;
      }
    }
    const du = maxU - minU > 1e-6 ? 1 / (maxU - minU) : 0;
    const dv = maxV - minV > 1e-6 ? 1 / (maxV - minV) : 0;
    const su = s.uv ? s.uv[0] : 1;
    const sv = s.uv ? s.uv[1] : 1;
    const atlas = this.mode === 'atlas';
    const ou = atlas ? this.rng.next() * Math.max(0, 1 - su) : this.rng.next();
    const ov = atlas ? this.rng.next() * Math.max(0, 1 - sv) : this.rng.next();
    const tcol = tile % 4;
    const trow = Math.floor(tile / 4);
    _c.set(s.color ?? 0xffffff);
    if (s.jitter) _c.multiplyScalar(1 + (this.rng.next() - 0.5) * 2 * s.jitter);
    const rough = s.rough ?? 0.8;
    const metal = s.metal ?? 0;
    const glow = s.glow ?? 0;
    const sway = s.sway ?? 0;
    const bone = s.bone ?? 0;
    for (let i = 0; i < count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      let uu = 0.5;
      let vv = 0.5;
      if (u && tile !== TILE.plain) {
        uu = ((s.rot ? u.getY(i) : u.getX(i)) - minU) * du;
        vv = ((s.rot ? u.getX(i) : u.getY(i)) - minV) * dv;
      }
      if (atlas) {
        if (tile === TILE.plain) {
          this.uvs.push(0.125, 1 - 0.125);
        } else {
          const tu = Math.min(1, ou + uu * su);
          const tv = Math.min(1, ov + vv * sv);
          this.uvs.push((tcol + 0.03 + 0.94 * tu) / 4, 1 - (trow + 0.03 + 0.94 * tv) / 4);
        }
      } else {
        this.uvs.push(ou + uu * su, ov + vv * sv);
      }
      this.col.push(_c.r, _c.g, _c.b);
      this.rme.push(rough, metal, glow, s.swayFn ? s.swayFn(p.getX(i), p.getY(i), p.getZ(i)) : sway);
      this.skin.push(bone);
    }
    if (g.index) {
      const ix = g.index;
      for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i));
    } else {
      for (let i = 0; i < count; i++) this.idx.push(base + i);
    }
    g.dispose();
    return this;
  }

  /** Fonde tutto in una mesh (SkinnedMesh se sono stati creati ossi). Il batch resta riutilizzabile solo per lettura. */
  build(material: THREE.Material, opts: { cast?: boolean; receive?: boolean; name?: string } = {}): Built {
    const g = new THREE.BufferGeometry();
    const count = this.pos.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('rme', new THREE.Float32BufferAttribute(this.rme, 4));
    g.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    let mesh: THREE.Mesh;
    const bones: THREE.Bone[] = [];
    if (this.boneDefs.length > 0) {
      const si = new Uint16Array(count * 4);
      const sw = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        si[i * 4] = this.skin[i];
        sw[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      const sk = new THREE.SkinnedMesh(g, material);
      const root = new THREE.Bone();
      const all: THREE.Bone[] = [root];
      const pivots: V3[] = [new THREE.Vector3()];
      for (const d of this.boneDefs) {
        const b = new THREE.Bone();
        const parent = all[d.parent];
        b.position.copy(d.pivot).sub(pivots[d.parent]);
        parent.add(b);
        all.push(b);
        pivots.push(d.pivot);
      }
      sk.add(root);
      sk.bind(new THREE.Skeleton(all));
      sk.frustumCulled = false;
      bones.push(...all);
      mesh = sk;
    } else {
      mesh = new THREE.Mesh(g, material);
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    mesh.castShadow = opts.cast ?? true;
    mesh.receiveShadow = opts.receive ?? true;
    if (opts.name) mesh.name = opts.name;
    return { mesh, bones };
  }
}

export interface UberUniforms {
  uTime: { value: number };
  uWind: { value: number };
  uGlow: { value: number };
}

export type UberMaterial = THREE.MeshStandardMaterial & { userData: { u: UberUniforms } };

/**
 * Materiale PBR con attributo per-vertice `rme` = (roughness, metalness, emissione, sway).
 * `map` viene usata anche come bump map. Uniform in `material.userData.u`.
 */
export function makeUber(
  opts: { map?: THREE.Texture | null; bump?: number; side?: THREE.Side; transparent?: boolean; opacity?: number; alphaTest?: number } = {},
): UberMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 1,
    map: opts.map ?? null,
    bumpMap: opts.map && (opts.bump ?? 1) > 0 ? opts.map : null,
    bumpScale: opts.bump ?? 1,
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    alphaTest: opts.alphaTest ?? 0,
  }) as UberMaterial;
  const u: UberUniforms = { uTime: { value: 0 }, uWind: { value: 0.3 }, uGlow: { value: 1 } };
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uWind = u.uWind;
    shader.uniforms.uGlow = u.uGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 rme;\nvarying vec4 vRme;\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRme = rme;
        float swayPh = uTime * 2.3 + transformed.x * 2.7 + transformed.z * 2.1 + transformed.y * 1.3;
        transformed.x += sin(swayPh) * rme.w * uWind;
        transformed.z += cos(swayPh * 0.83 + 1.0) * rme.w * uWind * 0.8;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vRme;\nuniform float uGlow;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vRme.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vRme.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vRme.z * uGlow;');
  };
  mat.customProgramCacheKey = () => 'props-uber-v1';
  return mat;
}

/** Tiene traccia di ciò che va liberato. */
export class Disposer {
  private items: Array<{ dispose(): void }> = [];
  track<T extends { dispose(): void }>(o: T): T {
    this.items.push(o);
    return o;
  }
  mesh(m: THREE.Mesh): THREE.Mesh {
    this.items.push(m.geometry);
    const sk = m as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) this.items.push(sk.skeleton);
    return m;
  }
  dispose(): void {
    for (const it of this.items) it.dispose();
    this.items.length = 0;
  }
}

// ───────────────────────────── geometrie ─────────────────────────────

function swapUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const u = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < u.count; i++) u.setXY(i, u.getY(i), u.getX(i));
  return g;
}

/** Parallelepipedo con spigoli smussati (raggio r, n segmenti di smusso). U lungo X sulle facce lunghe. */
export function rbox(w: number, h: number, d: number, r = 0.008, n = 1): THREE.BufferGeometry {
  if (r <= 0) return new THREE.BoxGeometry(w, h, d);
  const half = [w / 2, h / 2, d / 2];
  r = Math.max(0.0001, Math.min(r, w / 2, h / 2, d / 2) * 0.98);
  const stops = (hf: number): number[] => {
    const a: number[] = [];
    for (let i = 0; i <= n; i++) a.push(-hf + r * (1 - Math.cos(((i / n) * Math.PI) / 2)));
    const b = a.map((v) => -v).reverse();
    return a.concat(b);
  };
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // [asse U, asse V, asse W]
  const faces: Array<[number, number, number, number]> = [
    [0, 2, 1, 1],
    [0, 2, 1, -1],
    [0, 1, 2, 1],
    [0, 1, 2, -1],
    [2, 1, 0, 1],
    [2, 1, 0, -1],
  ];
  const P = [0, 0, 0];
  const I = [0, 0, 0];
  for (const [au, av, aw, sign] of faces) {
    const su = stops(half[au]);
    const sv = stops(half[av]);
    const base = pos.length / 3;
    for (let j = 0; j < sv.length; j++)
      for (let i = 0; i < su.length; i++) {
        P[au] = su[i];
        P[av] = sv[j];
        P[aw] = sign * half[aw];
        let len = 0;
        for (let k = 0; k < 3; k++) {
          I[k] = Math.max(-half[k] + r, Math.min(half[k] - r, P[k]));
          len += (P[k] - I[k]) ** 2;
        }
        len = Math.sqrt(len) || 1;
        const nx = (P[0] - I[0]) / len;
        const ny = (P[1] - I[1]) / len;
        const nz = (P[2] - I[2]) / len;
        pos.push(I[0] + nx * r, I[1] + ny * r, I[2] + nz * r);
        nor.push(nx, ny, nz);
        uv.push(su[i] / (2 * half[au]) + 0.5, sv[j] / (2 * half[av]) + 0.5);
      }
    // orientamento: (U × V) · W
    const eu = [0, 0, 0];
    const ev = [0, 0, 0];
    eu[au] = 1;
    ev[av] = 1;
    const cross = [eu[1] * ev[2] - eu[2] * ev[1], eu[2] * ev[0] - eu[0] * ev[2], eu[0] * ev[1] - eu[1] * ev[0]];
    const flip = cross[aw] * sign < 0;
    const nu = su.length;
    for (let j = 0; j < sv.length - 1; j++)
      for (let i = 0; i < nu - 1; i++) {
        const a = base + j * nu + i;
        const b = a + 1;
        const c = a + nu;
        const d2 = c + 1;
        if (flip) idx.push(a, c, b, b, c, d2);
        else idx.push(a, b, c, b, d2, c);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Cilindro/tronco di cono con base a y=0 e altezza h. U lungo l'asse. */
export function cyl(rTop: number, rBot: number, h: number, seg = 12, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  g.translate(0, h / 2, 0);
  return swapUV(g);
}

/** Solido di rivoluzione attorno a Y dal profilo [raggio, y]. U lungo l'asse. */
export function lathe(profile: Array<[number, number]>, seg = 16): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.00001), y)),
    seg,
  );
  return swapUV(g);
}

/** Canna di bambù lungo +Y (base in 0) con nodi in rilievo e leggera rastremazione. */
export function bamboo(len: number, r: number, seg = 7, nodeEvery = 0.3): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [[0, 0], [r, 0]];
  const nodes = Math.max(1, Math.round(len / nodeEvery));
  for (let i = 1; i < nodes; i++) {
    const y = (i / nodes) * len;
    const rr = r * (1 - 0.1 * (y / len));
    pts.push([rr, y - r * 0.35], [rr * 1.14, y], [rr * 0.98, y + r * 0.35]);
  }
  pts.push([r * 0.9, len], [0, len]);
  return lathe(pts, seg);
}

/** Tubo lungo una spline passante per i punti (corde, cavi, tubi piegati). U lungo il percorso. */
export function tube(points: V3[], radius: number, radial = 5, perSpan = 4, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(2, (points.length - 1) * perSpan), radius, radial, closed);
}

/** Punti di una corda tesa fra a e b con freccia `sag` verso il basso. */
export function sagPoints(a: V3, b: V3, sag: number, n = 8): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

/** Corda/cavo fra due punti con freccia. */
export function rope(a: V3, b: V3, sag: number, radius: number, radial = 5): THREE.BufferGeometry {
  return tube(sagPoints(a, b, sag, 6), radius, radial, 2);
}

export function sphere(r: number, ws = 12, hs = 8): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, ws, hs);
}

export function torus(R: number, r: number, radial = 6, tubular = 16, arc = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.TorusGeometry(R, r, radial, tubular, arc);
}

/** Piano XY centrato (normale +Z). */
export function plane(w: number, h: number, sw = 1, sh = 1): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h, sw, sh);
}

/** Estrusione lungo +Z di una forma 2D (XY), con smusso opzionale. */
export function extrude(shape: THREE.Shape, depth: number, bevel = 0, curveSegments = 8): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    curveSegments,
  });
}

/** Rettangolo arrotondato centrato come Shape. */
export function roundRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * Foglia/petalo: nastro che parte dall'origine, cresce lungo +Y e si incurva verso +Z.
 * U lungo la foglia (costa centrale a v=0.5). Usare un materiale DoubleSide.
 * `bend`: angolo totale di curvatura (rad); `fold`: piega a V dei bordi (m); `width(t)`: profilo 0..1.
 */
export function leaf(
  len: number,
  w: number,
  o: { bend?: number; fold?: number; segs?: number; width?: (t: number) => number; startAngle?: number } = {},
): THREE.BufferGeometry {
  const segs = o.segs ?? 6;
  const bend = o.bend ?? 0.8;
  const fold = o.fold ?? w * 0.12;
  const wf = o.width ?? ((t: number): number => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let y = 0;
  let z = 0;
  const ds = len / segs;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = (o.startAngle ?? 0) + bend * t;
    if (i > 0) {
      y += Math.cos(a) * ds;
      z += Math.sin(a) * ds;
    }
    const hw = (w / 2) * Math.max(0.02, wf(t));
    // normale locale della costa
    const ny = -Math.sin(a);
    const nz = Math.cos(a);
    const f = fold * Math.max(0.02, wf(t));
    pos.push(-hw, y + ny * f, z + nz * f, 0, y, z, hw, y + ny * f, z + nz * f);
    uv.push(t, 0, t, 0.5, t, 1);
    if (i < segs) {
      const b = i * 3;
      idx.push(b, b + 1, b + 3, b + 1, b + 4, b + 3, b + 1, b + 2, b + 4, b + 2, b + 5, b + 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Disegna testo su canvas adattandolo alla larghezza massima. Restituisce la dimensione usata. */
export function fitText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, font: string): number {
  let size = px;
  c.font = `${size}px ${font}`;
  const w = c.measureText(text).width;
  if (w > maxW) {
    size = Math.floor((px * maxW) / w);
    c.font = `${size}px ${font}`;
  }
  c.fillText(text, x, y);
  return size;
}

/** CanvasTexture sRGB pronta per poster/insegne. */
export function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  draw(c, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * "Penna" con trasformazione e superficie di base: rende componibili le parti
 * (`pen.at(x,y,z).box(...)`). Tutte le coordinate sono locali alla penna.
 */
export class Pen {
  constructor(
    readonly b: Batch,
    readonly m: THREE.Matrix4 = new THREE.Matrix4(),
    readonly s: Surf = {},
  ) {}

  at(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sc = 1): Pen {
    return new Pen(this.b, this.m.clone().multiply(tr(x, y, z, rx, ry, rz, sc)), this.s);
  }
  mat(local: THREE.Matrix4): Pen {
    return new Pen(this.b, this.m.clone().multiply(local), this.s);
  }
  surf(s: Surf): Pen {
    return new Pen(this.b, this.m, { ...this.s, ...s });
  }
  on(b: Batch): Pen {
    return new Pen(b, this.m, this.s);
  }
  /** punto locale → spazio del batch */
  pt(x: number, y: number, z: number): V3 {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.m);
  }
  add(g: THREE.BufferGeometry, s: Surf = {}, local?: THREE.Matrix4): this {
    this.b.add(g, { ...this.s, ...s }, local ? this.m.clone().multiply(local) : this.m.clone());
    return this;
  }
  private plankUV(len: number, cross: number, s: Surf): Surf {
    if (s.uv || this.s.uv) return s;
    return this.b.mode === 'repeat'
      ? { ...s, uv: [len / 1.1, cross / 1.1] }
      : { ...s, uv: [Math.min(1, len / 1.2), Math.min(1, Math.max(0.08, cross / 1.2))] };
  }
  /** scatola smussata centrata in (x,y,z) */
  box(w: number, h: number, d: number, x: number, y: number, z: number, s: Surf = {}, r = 0.006, n = 1): this {
    return this.add(rbox(w, h, d, r, n), this.plankUV(w, Math.max(h, d), s), tr(x, y, z));
  }
  /** asse/trave lunga in X (centro in x,y,z) */
  px(len: number, h: number, d: number, x: number, y: number, z: number, s: Surf = {}, r = 0.006): this {
    return this.add(rbox(len, h, d, r), this.plankUV(len, Math.max(h, d), s), tr(x, y, z));
  }
  /** montante verticale alto `len` (centro in x,y,z), sezione wx × dz */
  py(len: number, wx: number, dz: number, x: number, y: number, z: number, s: Surf = {}, r = 0.006): this {
    return this.add(rbox(len, wx, dz, r), this.plankUV(len, Math.max(wx, dz), s), tr(x, y, z, 0, 0, Math.PI / 2));
  }
  /** asse lunga in Z (centro in x,y,z), sezione wx × h */
  pz(len: number, h: number, wx: number, x: number, y: number, z: number, s: Surf = {}, r = 0.006): this {
    return this.add(rbox(len, h, wx, r), this.plankUV(len, Math.max(h, wx), s), tr(x, y, z, 0, Math.PI / 2, 0));
  }
  /** trave a sezione rettangolare fra due punti */
  beam(a: V3, b: V3, h: number, d: number, s: Surf = {}, r = 0.006): this {
    const len = a.distanceTo(b);
    return this.add(rbox(len, h, d, r), this.plankUV(len, Math.max(h, d), s), alongX(a, b));
  }
  /** cilindro verticale con base in (x,y,z) */
  cy(rTop: number, rBot: number, h: number, x: number, y: number, z: number, s: Surf = {}, seg = 12): this {
    return this.add(cyl(rTop, rBot, h, seg), s, tr(x, y, z));
  }
  /** asta cilindrica fra due punti */
  rod(a: V3, b: V3, r: number, s: Surf = {}, seg = 6): this {
    return this.add(cyl(r, r, a.distanceTo(b), seg), s, alongY(a, b));
  }
  /** canna di bambù fra due punti */
  cane(a: V3, b: V3, r: number, s: Surf = {}, seg = 7): this {
    const len = a.distanceTo(b);
    return this.add(bamboo(len, r, seg), { tile: TILE.bamboo, uv: [Math.min(1, len / 2), 0.5], ...s }, alongY(a, b));
  }
  /** corda fra due punti */
  cord(a: V3, b: V3, sag: number, r: number, s: Surf = {}): this {
    return this.add(rope(a, b, sag, r), { tile: TILE.rope, uv: [1, 0.2], ...s });
  }
  /** legatura di corda attorno a un punto (anelli sovrapposti) orientata lungo `axis` */
  lash(p: V3, radius: number, axis: 'x' | 'y' | 'z' = 'y', s: Surf = {}): this {
    const g = cyl(radius, radius, radius * 1.6, 8);
    g.translate(0, -radius * 0.8, 0);
    const m = tr(p.x, p.y, p.z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
    return this.add(g, { tile: TILE.rope, uv: [0.3, 0.6], color: 0xb89a6a, rough: 1, ...s }, m);
  }
}
