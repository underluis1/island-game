/**
 * Procedural generators for every phone component. Each generator builds its part in local space:
 * origin at the centre of the component footprint, z = 0 at the bottom of the part, the visible face at +z.
 * All sizes in millimetres.
 */
import * as THREE from 'three';
import { RNG, hashString } from '../../core/rng';
import type { PhoneModel } from '../../gameplay/repair/model';
import type { ComponentDef, ConnectorDef, MeshParam, PhoneDef } from '../../gameplay/repair/types';
import { atlasBox, box, cyl, extrudeShape, merge, move, pillow, planarUV, ribbon, roundedRectPath, roundedRectShape, slab } from './geo';
import { mat } from './materials';
import { batteryLabelTexture } from './textures';

export interface FlexVisual {
  /** group pivoting at the cable root; rotate around `axis` to lift the plug */
  group: THREE.Group;
  axis: THREE.Vector3;
  /** plug mesh (pick target) */
  plug: THREE.Mesh;
}

export interface PartBuild {
  group: THREE.Group;
  flexes: Map<string, FlexVisual>;
  tabs: THREE.Mesh[];
  /** extra objects toggled by the assembler (e.g. the home button disc seen from the front) */
  extras: Record<string, THREE.Object3D>;
  /** screen plane of the display */
  screen?: THREE.Mesh;
  /** mesh swapped when the battery swells */
  swell?: (amount: number) => void;
}

export interface GenCtx {
  def: PhoneDef;
  model: PhoneModel;
  comp: ComponentDef;
  color: { body: string; back: string };
  /** phone-space point → part-local x/y */
  local(px: number, py: number): [number, number];
  seed: number;
}

class Builder {
  private bins = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(material: THREE.Material, ...geos: THREE.BufferGeometry[]): this {
    let bin = this.bins.get(material);
    if (!bin) {
      bin = [];
      this.bins.set(material, bin);
    }
    bin.push(...geos);
    return this;
  }

  build(group: THREE.Group, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [material, geos] of this.bins) {
      if (geos.length === 0) continue;
      const m = new THREE.Mesh(merge(geos), material);
      m.castShadow = shadows;
      m.receiveShadow = true;
      group.add(m);
      out.push(m);
    }
    this.bins.clear();
    return out;
  }
}

const num = (p: Record<string, MeshParam> | undefined, k: string, d: number): number => {
  const v = p?.[k];
  return typeof v === 'number' ? v : d;
};
const str = (p: Record<string, MeshParam> | undefined, k: string, d: string): string => {
  const v = p?.[k];
  return typeof v === 'string' ? v : d;
};
const arr = (p: Record<string, MeshParam> | undefined, k: string): number[] | null => {
  const v = p?.[k];
  return Array.isArray(v) ? v : null;
};

function emptyBuild(): PartBuild {
  return { group: new THREE.Group(), flexes: new Map(), tabs: [], extras: {} };
}

/** A flex cable from `from` to `to` (local coords) ending in a board-to-board plug. */
export function makeFlex(
  from: THREE.Vector3,
  to: THREE.Vector3,
  width: number,
  opts: { black?: boolean; arch?: number } = {},
): FlexVisual {
  const group = new THREE.Group();
  group.position.copy(from);
  const d = new THREE.Vector3().subVectors(to, from);
  const len = Math.max(0.5, Math.hypot(d.x, d.y));
  const dir = new THREE.Vector3(d.x / len, d.y / len, 0);
  const arch = opts.arch ?? Math.min(1.2, len * 0.12);
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(dir.x * len * 0.3, dir.y * len * 0.3, arch * 0.8 + d.z * 0.2),
    new THREE.Vector3(dir.x * len * 0.7, dir.y * len * 0.7, arch + d.z * 0.8),
    new THREE.Vector3(d.x, d.y, d.z + 0.25),
  ];
  const cable = new THREE.Mesh(ribbon(pts, width, 0.14, 14), opts.black ? mat.flexBlack() : mat.flex());
  cable.castShadow = true;
  group.add(cable);
  const plugG = new THREE.Group();
  plugG.position.set(d.x, d.y, d.z);
  plugG.rotation.z = Math.atan2(dir.y, dir.x);
  const body = new THREE.Mesh(merge([box(2.3, Math.max(3.4, width + 0.8), 0.75, 0, 0, 0)]), mat.plug());
  const cap = new THREE.Mesh(merge([box(1.9, Math.max(3, width + 0.4), 0.14, 0, 0, 0.75)]), mat.plugCap());
  body.castShadow = true;
  plugG.add(body, cap);
  group.add(plugG);
  const axis = new THREE.Vector3(-dir.y, dir.x, 0); // lifts the far end towards +z when rotated by a negative angle
  return { group, axis, plug: body };
}

function connectorsOf(ctx: GenCtx): ConnectorDef[] {
  return ctx.model.connectorsOf(ctx.comp);
}

/** Adds one flex per connector, starting from the point of the footprint edge closest to the socket. */
function addConnectorFlexes(ctx: GenCtx, out: PartBuild, z: number, width = 3.2, black = false): void {
  const [, , w, h] = ctx.comp.rect;
  for (const c of connectorsOf(ctx)) {
    const [lx, ly] = ctx.local(c.position[0], c.position[1]);
    const ex = Math.max(-w / 2, Math.min(w / 2, lx));
    const ey = Math.max(-h / 2, Math.min(h / 2, ly));
    let from = new THREE.Vector3(ex, ey, z);
    if (Math.hypot(lx - ex, ly - ey) < 1.5) {
      // socket lies on the part itself: start the cable a little further inside
      const inward = new THREE.Vector2(-lx, -ly).normalize().multiplyScalar(5);
      from = new THREE.Vector3(lx + inward.x, ly + inward.y, z);
    }
    const fv = makeFlex(from, new THREE.Vector3(lx, ly, z + 0.1), width, { black });
    out.group.add(fv.group);
    out.flexes.set(c.id, fv);
  }
}

/** Mounting ears with a through hole at every screw of the part. */
function addEars(ctx: GenCtx, b: Builder, material: THREE.Material, z: number, t = 0.5): void {
  const [, , w, h] = ctx.comp.rect;
  for (const s of ctx.model.screwsOf(ctx.comp)) {
    const [lx, ly] = ctx.local(s.position[0], s.position[1]);
    const shape = roundedRectShape(3.6, 3.6, 1.6);
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.75, 0, Math.PI * 2, true);
    const ear = extrudeShape(shape, t, { holes: [hole] });
    b.add(material, move(ear, lx, ly, z));
    // bridge from the ear to the body when the screw sits outside the footprint
    const cx = Math.max(-w / 2 + 1, Math.min(w / 2 - 1, lx));
    const cy = Math.max(-h / 2 + 1, Math.min(h / 2 - 1, ly));
    const dx = lx - cx;
    const dy = ly - cy;
    const len = Math.hypot(dx, dy);
    if (len > 1.2) {
      const bridge = box(len, 2.2, t, 0, 0, 0);
      bridge.rotateZ(Math.atan2(dy, dx));
      b.add(material, move(bridge, (lx + cx) / 2, (ly + cy) / 2, z));
    }
  }
}

/* ------------------------------------------------------------------ housing */

function genHousing(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const { def } = ctx;
  const { w, h, d, r, flat } = def.dims;
  const b = new Builder();
  const steel = str(def.style, 'frame', 'alu') === 'steel';
  const frameMat = mat.frame(ctx.color.body, steel);
  const wall = flat ? 2.2 : 2.6;
  const midframe = num(def.style, 'midframe', 0);
  const hasBackGlass = def.components.some((c) => c.partCategory === 'back_glass');

  // frame ring
  const bevel = flat ? 0.45 : 1.9;
  const ringShape = roundedRectShape(w - bevel * 2, h - bevel * 2, r - bevel);
  const ring = extrudeShape(ringShape, d - 0.25, {
    bevel,
    curveSegments: 10,
    holes: [roundedRectPath(w - wall * 2, h - wall * 2, Math.max(1, r - wall))],
  });
  b.add(frameMat, ring);

  if (!hasBackGlass) {
    // fixed back: glass (or painted) plate, flush with the frame
    const back = slab(w - 1.4, h - 1.4, 1.0, r - 0.7, { curveSegments: 10 });
    b.add(mat.backGlass(ctx.color.back), move(back, 0, 0, -0.08));
    b.add(mat.inner(), box(w - wall * 2, h - wall * 2, 0.12, 0, 0, 0.9));
  } else {
    // mid-frame plate: front parts above, back parts below
    b.add(mat.inner(), box(w - wall * 2 + 0.6, h - wall * 2 + 0.6, 0.35, 0, 0, midframe - 0.35));
  }

  // internal ribs and wall liners
  const innerW = w - wall * 2;
  const innerH = h - wall * 2;
  const floorZ = hasBackGlass ? midframe : 1.0;
  b.add(mat.innerLight(), box(innerW - 6, 0.5, 0.5, 0, innerH / 2 - 9.5, floorZ));
  b.add(mat.innerLight(), box(innerW - 6, 0.5, 0.5, 0, -innerH / 2 + 12.5, floorZ));

  // screw bosses for every top-level part
  for (const c of def.components) {
    if (c.parent || c.id === ctx.comp.id || c.hinge) continue;
    const back = (c.side ?? 'front') === 'back';
    for (const s of ctx.model.screwsOf(c)) {
      const z0 = back ? c.z : floorZ;
      const z1 = back ? midframe - 0.35 : c.z;
      if (z1 - z0 > 0.15) b.add(mat.innerLight(), cyl(1.1, z1 - z0, s.position[0], s.position[1], z0, 10));
    }
  }

  // side buttons
  const btn = (x: number, y: number, len: number): void => {
    const g = slab(1.1, len, 2.2, 0.5, { bevel: 0.2 });
    g.rotateY(Math.PI / 2);
    b.add(frameMat, move(g, x, y, d / 2 + 0.55));
  };
  btn(w / 2 - 0.75, h * 0.18, 10);
  btn(-w / 2 - 1.45, h * 0.26, 6);
  btn(-w / 2 - 1.45, h * 0.15, 9);
  btn(-w / 2 - 1.45, h * 0.06, 9);

  // bottom edge: charge port, speaker holes, pentalobe screw seats
  const dark = mat.dark();
  const port = slab(8.2, 2.7, 1.4, 1.3);
  port.rotateX(Math.PI / 2);
  b.add(dark, move(port, 0, -h / 2 + 1.35, d / 2 - 0.2));
  for (let i = 0; i < 6; i++) {
    for (const sgn of [-1, 1]) {
      const hole = cyl(0.62, 1.2, 0, 0, 0, 10);
      hole.rotateX(Math.PI / 2);
      b.add(dark, move(hole, sgn * (11 + i * 2.6), -h / 2 + 1.15, d / 2 - 0.1));
    }
  }

  // camera island on fixed backs
  if (!hasBackGlass) {
    addCameraIsland(b, def, ctx.color.back, -1);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), mat.pearLogo(isDark(ctx.color.back) === false));
    logo.rotation.y = Math.PI;
    logo.position.set(0, h * 0.2, -0.12);
    out.group.add(logo);
  }

  b.build(out.group);
  return out;
}

function isDark(hex: string): boolean {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 < 0.35;
}

/** Camera bump with lenses on the outer back surface. `dir` = -1 when the outside faces -z. */
function addCameraIsland(b: Builder, def: PhoneDef, backColor: string, dir: 1 | -1): void {
  const { w, h } = def.dims;
  const layout = str(def.style, 'camera', 'single');
  // seen from outside the camera sits top-left. With the outside facing +z that is -x; facing -z it is +x.
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry => {
    if (dir === 1) return move(g, -x, y, z);
    g.rotateY(Math.PI);
    return move(g, x, y, -z);
  };
  const cx = w / 2 - (layout === 'single' ? 11.5 : 14.5);
  const cy = h / 2 - (layout === 'single' ? 11 : layout === 'dual_d' ? 17 : 18);
  const lens = (x: number, y: number, rr: number): void => {
    b.add(mat.lensRing(), place(cyl(rr + 1.1, 1.5, 0, 0, 0, 28), x, y, 0.4));
    b.add(mat.lens(), place(cyl(rr, 0.25, 0, 0, 0, 28), x, y, 1.9));
    b.add(mat.dark(), place(cyl(rr * 0.42, 0.06, 0, 0, 0, 16), x, y, 2.16));
  };
  if (layout === 'single') {
    lens(cx, cy, 3.6);
    b.add(mat.whiteDot(), place(cyl(1.5, 0.3, 0, 0, 0, 14), cx - 9.5, cy, 0.05));
  } else {
    const plateW = layout === 'dual_d' ? 29 : 13.5;
    const plateH = layout === 'dual_d' ? 29 : 27;
    b.add(mat.backGlass(backColor), place(slab(plateW, plateH, 1.1, layout === 'dual_d' ? 8 : 6.5, { bevel: 0.35 }), cx, cy, 0));
    if (layout === 'dual_d') {
      lens(cx - 6, cy + 6, 5.2);
      lens(cx + 6, cy - 6, 5.2);
      b.add(mat.whiteDot(), place(cyl(1.7, 0.3, 0, 0, 0, 14), cx + 7, cy + 7, 1.1));
    } else {
      lens(cx, cy + 6.6, 4.3);
      lens(cx, cy - 6.6, 4.3);
      b.add(mat.whiteDot(), place(cyl(1.2, 0.3, 0, 0, 0, 14), cx, cy, 1.1));
    }
  }
}

/* ------------------------------------------------------------------ display */

function genDisplay(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const { def, comp } = ctx;
  const [, , w, h] = comp.rect;
  const t = comp.t;
  const r = Math.max(2, def.dims.r - 1);
  const b = new Builder();
  const style = def.style;
  const bezelTop = num(style, 'bezelTop', 4);
  const bezelBottom = num(style, 'bezelBottom', 4);
  const bezelSide = num(style, 'bezelSide', 3.5);
  const front = str(style, 'front', 'notch');
  const oled = comp.mesh.params?.oled === true;

  // cover glass
  b.add(mat.frontGlass(), slab(w, h, t, r, { bevel: 0.25, curveSegments: 10 }));

  // light-emitting panel (texture = PearOS screen)
  const sw = w - bezelSide * 2;
  const sh = h - bezelTop - bezelBottom;
  const sr = front === 'home' ? 0.6 : Math.max(2, r - bezelSide);
  const screenGeo = planarUV(new THREE.ShapeGeometry(roundedRectShape(sw, sh, sr), 8), sw, sh);
  const screenMat = new THREE.MeshStandardMaterial({
    color: '#000000',
    emissive: '#ffffff',
    emissiveIntensity: 0.95,
    roughness: 0.08,
    metalness: 0,
  });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(0, (bezelBottom - bezelTop) / 2, t + 0.012);
  out.group.add(screen);
  out.screen = screen;

  if (front === 'notch') {
    const nw = num(style, 'notchW', 34);
    const notch = new THREE.ShapeGeometry(roundedRectShape(nw, 6.2, 3), 6);
    b.add(mat.dark(), move(notch, 0, h / 2 - bezelTop - 2.4, t + 0.02));
    b.add(mat.grille(), move(planarUV(new THREE.PlaneGeometry(9, 0.9), 9 / 4, 0.9 / 4), 0, h / 2 - bezelTop - 0.9, t + 0.03));
    b.add(mat.lens(), cyl(1.25, 0.05, nw * 0.26, h / 2 - bezelTop - 2.6, t + 0.02, 16));
  } else {
    b.add(mat.grille(), move(planarUV(new THREE.PlaneGeometry(10, 1.3), 10 / 4, 1.3 / 4), 0, h / 2 - bezelTop * 0.5, t + 0.03));
    b.add(mat.lens(), cyl(1.3, 0.05, -8.5, h / 2 - bezelTop * 0.5, t + 0.02, 16));
    // home button seen from the front (hidden by the assembler when the button is removed)
    const ring = new THREE.Mesh(
      merge([move(new THREE.RingGeometry(4.9, 5.6, 32), 0, 0, 0)]),
      mat.frame('#c9ccd1', true),
    );
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.9, 32), mat.sapphire());
    const hb = new THREE.Group();
    hb.add(ring, disc);
    hb.position.set(0, -h / 2 + bezelBottom * 0.5, t + 0.025);
    out.group.add(hb);
    out.extras.homeFront = hb;
  }

  // underside (faces -z): backplate / OLED film, perimeter gasket seat
  const under = (g: THREE.BufferGeometry, z: number): THREE.BufferGeometry => {
    g.rotateY(Math.PI);
    return move(g, 0, 0, z);
  };
  if (oled) {
    b.add(mat.blackPlastic(), under(slab(sw + 1, sh + 1, 0.3, sr), -0.02));
    b.add(mat.copper(), under(box(sw * 0.55, sh * 0.3, 0.05, sw * 0.1, -sh * 0.18, 0), -0.3));
    b.add(mat.sticker(), under(box(12, 7, 0.05, -sw * 0.2, sh * 0.2, 0), -0.3));
  } else {
    b.add(mat.shield(), under(slab(sw + 1.4, sh + 2, 0.45, 0.8), -0.02));
    b.add(mat.sticker(), under(box(14, 6, 0.05, -sw * 0.15, sh * 0.1, 0), -0.46));
    for (const sx of [-1, 1]) b.add(mat.steel(), under(box(1.2, sh * 0.8, 0.25, (sx * (sw + 1.4)) / 2 - sx * 1.2, 0, 0), -0.6));
  }
  b.add(mat.adhesiveBlack(), under(extrudeShape(roundedRectShape(w - 0.6, h - 0.6, r), 0.12, { holes: [roundedRectPath(w - 3.2, h - 3.2, r - 1.2)] }), 0));

  // short flex tails on the hinge edge (shown by the assembler when the display is off the phone)
  const flexSide = str(comp.mesh.params, 'flexSide', 'right') === 'right' ? 1 : -1;
  const tails = new THREE.Group();
  for (const c of connectorsOf(ctx)) {
    if (c.local) continue;
    const [, ly] = ctx.local(c.position[0], c.position[1]);
    const fx = (flexSide * w) / 2 - flexSide * 3;
    // local x is mirrored on the underside: the tail folds back under the glass
    const fv = makeFlex(new THREE.Vector3(fx, ly, -0.5), new THREE.Vector3(fx - flexSide * 9, ly, -0.9), 3.4, { arch: -0.6 });
    fv.group.rotation.x = 0;
    tails.add(fv.group);
  }
  out.group.add(tails);
  out.extras.tails = tails;

  b.build(out.group);
  return out;
}

/* ------------------------------------------------------------------ battery */

function genBattery(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const { comp } = ctx;
  const [, , w, h] = comp.rect;
  const t = comp.t;
  const p = comp.mesh.params;
  const shape = str(p, 'shape', 'rect');
  const notch = arr(p, 'notch');
  const capacity = str(p, 'capacity', '2000 mAh');
  const wh = str(p, 'wh', '7.6 Wh');
  // an L-shaped pack is two cells: the label sits on the tall one
  let mainW = w;
  let mainX = 0;
  let cell2: { w: number; h: number; x: number; y: number } | null = null;
  if (shape === 'L' && notch) {
    const nw = notch[0] as number;
    const nh = notch[1] as number;
    mainW = w - nw;
    const sign = ctx.local(1, 0)[0] < ctx.local(0, 0)[0] ? -1 : 1;
    mainX = (-sign * nw) / 2;
    cell2 = { w: nw - 0.6, h: h - nh, x: (sign * (w - nw)) / 2 + sign * 0.3, y: -nh / 2 };
  }
  const label = batteryLabelTexture(capacity, wh, h / mainW);
  const wrap = mat.batteryWrap(label);
  const body = new THREE.Group();
  out.group.add(body);
  const makeCells = (bulge: number): void => {
    for (const child of [...body.children]) {
      (child as THREE.Mesh).geometry.dispose();
      body.remove(child);
    }
    const main = planarUV(pillow(mainW, h, t, 2.2, bulge), mainW, h);
    const m1 = new THREE.Mesh(main, wrap);
    m1.position.x = mainX;
    m1.castShadow = m1.receiveShadow = true;
    body.add(m1);
    if (cell2) {
      const g2 = pillow(cell2.w, cell2.h, t, 2, bulge * 0.6);
      // keep the second cell plain: sample a dark corner of the label
      const uv = g2.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.02, 0.02);
      const m2 = new THREE.Mesh(g2, wrap);
      m2.position.set(cell2.x, cell2.y, 0);
      m2.castShadow = m2.receiveShadow = true;
      body.add(m2);
    }
  };
  makeCells(0.12);
  out.swell = (amount: number) => makeCells(0.12 + amount * 2.4);

  const b = new Builder();
  // protection board strip along the connector edge
  const conn = connectorsOf(ctx)[0];
  if (conn) {
    const [lx, ly] = ctx.local(conn.position[0], conn.position[1]);
    const onRight = lx > 0;
    const ex = (onRight ? 1 : -1) * (w / 2 - 1.2);
    b.add(mat.batteryFoil(), box(2, Math.min(h * 0.4, 30), t * 0.55, ex, Math.max(-h / 2 + 16, Math.min(h / 2 - 16, ly)), 0.2));
    const fv = makeFlex(new THREE.Vector3(ex, Math.max(-h / 2 + 4, Math.min(h / 2 - 4, ly)), t * 0.6), new THREE.Vector3(lx, ly, t * 0.55), 4.2, { black: true });
    out.group.add(fv.group);
    out.flexes.set(conn.id, fv);
  }
  b.build(out.group);

  // stretch-release pull tabs folded over the short edges
  const adh = ctx.model.adhesivesOf(comp).find((f) => f.kind === 'pulltab');
  const n = adh?.tabs ?? 0;
  const both = str(p, 'tabsAt', 'bottom') === 'both';
  for (let i = 0; i < n; i++) {
    const top = both && i >= n / 2;
    const row = both ? (i < n / 2 ? i : i - n / 2) : i;
    const cols = both ? Math.ceil(n / 2) : n;
    const span = mainW - 8;
    const x = mainX + (cols === 1 ? 0 : -span / 2 + (row / (cols - 1)) * span);
    const tabGeo = merge([
      box(5.5, 4.2, 0.12, 0, top ? -2.1 : 2.1, t + 0.02),
      box(5.5, 0.14, t * 0.9, 0, 0, 0.1),
      box(4.6, 3.2, 0.12, 0, top ? 1.6 : -1.6, 0.06),
    ]);
    const tab = new THREE.Mesh(tabGeo, mat.tab());
    tab.position.set(x, top ? h / 2 : -h / 2, 0);
    tab.userData.tabIndex = i;
    tab.userData.dir = top ? 1 : -1;
    out.group.add(tab);
    out.tabs.push(tab);
  }
  return out;
}

/* ------------------------------------------------------------------ logic board */

function genBoard(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const { comp, def, model } = ctx;
  const [cx, cy, w, h] = comp.rect;
  const p = comp.mesh.params;
  const rng = new RNG(ctx.seed);
  const b = new Builder();
  const variant = def.year >= 2021 ? 'black' : def.year >= 2018 ? 'navy' : 'teal';
  const pcbMat = mat.pcb(variant, 100 + (hashString(def.id) % 50));
  const PCB_T = 0.8;

  // outline, optionally with a corner notch (camera cut-out)
  const shape = new THREE.Shape();
  const notch = arr(p, 'notch');
  const hw = w / 2;
  const hh = h / 2;
  if (notch) {
    const [ax, ay] = ctx.local(notch[0] as number, notch[1] as number);
    const [bx] = ctx.local(notch[2] as number, notch[3] as number);
    const nx0 = Math.min(ax, bx);
    const ny0 = ay;
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, ny0);
    shape.lineTo(nx0, ny0);
    shape.lineTo(nx0, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();
  } else {
    shape.moveTo(-hw + 1, -hh);
    shape.lineTo(hw - 1, -hh);
    shape.lineTo(hw, -hh + 1);
    shape.lineTo(hw, hh - 1);
    shape.lineTo(hw - 1, hh);
    shape.lineTo(-hw + 1, hh);
    shape.lineTo(-hw, hh - 1);
    shape.lineTo(-hw, -hh + 1);
    shape.closePath();
  }
  const holes: THREE.Path[] = [];
  const screwPts: Array<[number, number]> = [];
  for (const s of model.screwsOf(comp)) {
    const [lx, ly] = ctx.local(s.position[0], s.position[1]);
    screwPts.push([lx, ly]);
    const hole = new THREE.Path();
    hole.absarc(lx, ly, 0.8, 0, Math.PI * 2, true);
    holes.push(hole);
  }
  const pcb = planarUV(extrudeShape(shape, PCB_T, { holes }), w, h);
  b.add(pcbMat, pcb);
  for (const [lx, ly] of screwPts) {
    b.add(mat.gold(), move(new THREE.RingGeometry(0.8, 1.7, 20), lx, ly, PCB_T + 0.01));
  }

  // board-to-board sockets for every cable that plugs into the board
  const keepOut: Array<[number, number, number]> = screwPts.map(([x, y]) => [x, y, 2.6]);
  for (const { f } of model.allConnectors()) {
    if (f.local) continue;
    const [lx, ly] = ctx.local(f.position[0], f.position[1]);
    if (Math.abs(lx) > hw + 1 || Math.abs(ly) > hh + 1) continue;
    b.add(mat.socket(), box(2.7, 5.2, 0.5, lx, ly, PCB_T));
    b.add(mat.blackPlastic(), box(1.5, 4.4, 0.52, lx, ly, PCB_T));
    keepOut.push([lx, ly, 4.2]);
  }
  const inNotch = (x: number, y: number): boolean => {
    if (!notch) return false;
    const [ax, ay] = ctx.local(notch[0] as number, notch[1] as number);
    const [bx] = ctx.local(notch[2] as number, notch[3] as number);
    return x > Math.min(ax, bx) - 1.5 && y > ay - 1.5;
  };
  const free = (x: number, y: number, rad: number): boolean =>
    !inNotch(x, y) && keepOut.every(([kx, ky, kr]) => Math.hypot(kx - x, ky - y) > kr + rad);

  // SIM reader first: it must sit where the tray slides in
  const sim = def.components.find((c) => c.partCategory === 'sim_tray');
  if (sim) {
    const [sx, sy] = ctx.local(sim.rect[0], sim.rect[1]);
    const x = Math.max(-hw + 7, Math.min(hw - 7, sx - Math.sign(sx || 1) * 8));
    if (Math.abs(sy) < hh - 8 && !inNotch(x, sy)) {
      b.add(mat.steel(), move(slab(13, 15, 1.5, 0.5, { bevel: 0.1 }), x, sy, PCB_T));
      keepOut.push([x, sy, 8.5]);
    }
  }

  // shield cans, then chips, then passives: rejection-sampled so nothing overlaps
  const sandwich = p?.sandwich === true;
  const maxT = Math.max(0.9, comp.t - PCB_T - 0.15);
  const area = w * h;
  const shieldCount = Math.round(area / 330);
  for (let i = 0, tries = 0; i < shieldCount && tries < 200; tries++) {
    const sw = rng.range(w * 0.36, w * 0.8);
    const sh = rng.range(7, 15);
    const x = rng.range(-hw + sw / 2 + 1, hw - sw / 2 - 1);
    const y = rng.range(-hh + sh / 2 + 1, hh - sh / 2 - 1);
    const rad = Math.hypot(sw, sh) * 0.5;
    if (!free(x, y, rad * 0.86)) continue;
    const th = rng.range(0.8, maxT);
    b.add(mat.shield(), move(slab(sw, sh, th, 0.7, { bevel: 0.12 }), x, y, PCB_T));
    // spot-weld dimples along the rim
    for (let k = 0; k < 4; k++) {
      b.add(mat.steel(), cyl(0.28, 0.05, x + (k < 2 ? -1 : 1) * (sw / 2 - 1), y + (k % 2 ? -1 : 1) * (sh / 2 - 1), PCB_T + th, 8));
    }
    const topping = rng.next();
    if (topping < 0.5) b.add(mat.sticker(), box(sw * 0.42, sh * 0.34, 0.03, x + rng.range(-1.5, 1.5), y, PCB_T + th));
    else if (topping < 0.75) b.add(mat.foam(), box(sw * 0.5, sh * 0.4, 0.12, x, y, PCB_T + th));
    keepOut.push([x, y, rad * 0.86]);
    i++;
  }
  let chipIdx = hashString(def.id) % 15;
  const chipCount = Math.round(area / 150) + num(p, 'chips', 6);
  for (let i = 0, tries = 0; i < chipCount && tries < 500; tries++) {
    const cw = rng.range(3.2, 8.5);
    const ch = rng.range(3.2, 8.5);
    const x = rng.range(-hw + cw / 2 + 0.8, hw - cw / 2 - 0.8);
    const y = rng.range(-hh + ch / 2 + 0.8, hh - ch / 2 - 0.8);
    const rad = Math.hypot(cw, ch) * 0.5;
    if (!free(x, y, rad * 0.9)) continue;
    b.add(mat.chips(), atlasBox(cw, ch, rng.range(0.55, Math.min(1.1, maxT)), x, y, PCB_T, chipIdx % 15, 15));
    chipIdx++;
    keepOut.push([x, y, rad * 0.9]);
    i++;
  }
  for (let i = 0; i < 260; i++) {
    const x = rng.range(-hw + 1, hw - 1);
    const y = rng.range(-hh + 1, hh - 1);
    if (!free(x, y, 0.7)) continue;
    const vertical = rng.chance(0.5);
    const m = rng.next();
    b.add(m < 0.4 ? mat.gold() : m < 0.75 ? mat.blackPlastic() : mat.sticker(), box(vertical ? 0.55 : 1.1, vertical ? 1.1 : 0.55, 0.4, x, y, PCB_T));
    keepOut.push([x, y, 0.7]);
  }
  if (sandwich) {
    // second board stacked on an interposer frame
    const iw = w * 0.82;
    const ih = h * 0.52;
    const iy = hh - ih / 2 - 3;
    const frame = extrudeShape(roundedRectShape(iw, ih, 1), 0.9, { holes: [roundedRectPath(iw - 2.4, ih - 2.4, 0.6)] });
    b.add(mat.gold(), move(frame, 0, iy, PCB_T));
    b.add(pcbMat, move(planarUV(slab(iw, ih, 0.6, 1), w, h), 0, iy, PCB_T + 0.9));
    b.add(mat.shield(), move(slab(iw * 0.8, ih * 0.42, 0.7, 0.6, { bevel: 0.1 }), 0, iy + ih * 0.2, PCB_T + 1.5));
    b.add(mat.chips(), atlasBox(8, 8, 0.6, -iw * 0.15, iy - ih * 0.22, PCB_T + 1.5, 0, 15));
    b.add(mat.chips(), atlasBox(5, 6, 0.6, iw * 0.22, iy - ih * 0.24, PCB_T + 1.5, 4, 15));
  }
  void cx;
  void cy;
  b.build(out.group);
  return out;
}

/* ------------------------------------------------------------------ brackets */

function genBracket(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const { comp, model } = ctx;
  const [, , w, h] = comp.rect;
  const shapeKind = str(comp.mesh.params, 'shape', 'plate');
  const b = new Builder();
  const shape = roundedRectShape(w, h, shapeKind === 'home' ? 3 : 1.1);
  const holes: THREE.Path[] = [];
  for (const s of model.screwsOf(comp)) {
    const [lx, ly] = ctx.local(s.position[0], s.position[1]);
    const hole = new THREE.Path();
    hole.absarc(lx, ly, 0.72, 0, Math.PI * 2, true);
    holes.push(hole);
  }
  if (shapeKind === 'camera') {
    const n = num(comp.mesh.params, 'holes', 1);
    for (let i = 0; i < n; i++) {
      const hole = new THREE.Path();
      const y = n === 1 ? 1.5 : (i - 0.5) * Math.min(13, h * 0.44);
      hole.absarc(n === 1 ? 0.5 : 0, y, Math.min(4.6, w * 0.26), 0, Math.PI * 2, true);
      holes.push(hole);
    }
  } else if (shapeKind === 'home') {
    const hole = new THREE.Path();
    hole.absarc(0, 0, 4.4, 0, Math.PI * 2, true);
    holes.push(hole);
  }
  b.add(mat.steel(), extrudeShape(shape, comp.t, { holes, curveSegments: 8 }));
  // stiffening ribs
  if (shapeKind === 'plate') {
    b.add(mat.steel(), box(w * 0.5, 0.5, 0.18, 0, h * 0.18, comp.t));
    b.add(mat.steel(), box(w * 0.5, 0.5, 0.18, 0, -h * 0.18, comp.t));
    b.add(mat.foam(), box(w * 0.42, h * 0.2, 0.2, 0, 0, comp.t));
  } else if (shapeKind === 'bar') {
    b.add(mat.steel(), box(w * 0.6, 0.5, 0.18, 0, 0, comp.t));
  }
  b.build(out.group);
  return out;
}

/* ------------------------------------------------------------------ small modules */

function genTaptic(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const [, , w, h] = ctx.comp.rect;
  const t = ctx.comp.t;
  const b = new Builder();
  b.add(mat.steel(), move(slab(w - 1.2, h - 1.2, t - 0.3, 1.2, { bevel: 0.3 }), 0, 0, 0.15));
  b.add(mat.blackPlastic(), box(w * 0.46, h * 0.5, 0.06, -w * 0.12, 0, t - 0.15));
  b.add(mat.sticker(), box(w * 0.2, h * 0.3, 0.07, w * 0.28, 0, t - 0.15));
  b.add(mat.rubber(), box(w - 3, 0.6, 0.5, 0, h / 2 - 0.5, 0));
  addEars(ctx, b, mat.steel(), 0.1);
  b.build(out.group);
  addConnectorFlexes(ctx, out, t * 0.55, 2.6);
  return out;
}

function genSpeaker(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const [, , w, h] = ctx.comp.rect;
  const t = ctx.comp.t;
  const b = new Builder();
  const s = new THREE.Shape();
  const hw = w / 2 - 0.4;
  const hh = h / 2 - 0.4;
  s.moveTo(-hw + 1, -hh);
  s.lineTo(hw - 1, -hh);
  s.lineTo(hw, -hh + 1);
  s.lineTo(hw, hh - 3);
  s.lineTo(hw - 3, hh);
  s.lineTo(-hw + 1.5, hh);
  s.lineTo(-hw, hh - 1.5);
  s.lineTo(-hw, -hh + 1);
  s.closePath();
  b.add(mat.blackPlastic(), extrudeShape(s, t, { bevel: 0.25 }));
  b.add(mat.grille(), move(planarUV(new THREE.PlaneGeometry(w * 0.44, h * 0.36), (w * 0.44) / 4, (h * 0.36) / 4), -w * 0.12, 0, t + 0.01));
  b.add(mat.rubber(), box(w * 0.6, 1, 0.5, 0, -hh + 0.2, t * 0.3));
  b.add(mat.gold(), cyl(0.7, 0.5, w * 0.28, h * 0.18, t, 10), cyl(0.7, 0.5, w * 0.28, -h * 0.12, t, 10));
  b.add(mat.sticker(), box(w * 0.18, h * 0.22, 0.04, w * 0.22, -h * 0.25, t));
  addEars(ctx, b, mat.blackPlastic(), 0.4);
  b.build(out.group);
  addConnectorFlexes(ctx, out, t * 0.5, 2.6);
  return out;
}

function lensModule(b: Builder, x: number, y: number, size: number, t: number): void {
  b.add(mat.shield(), move(slab(size, size, t * 0.62, 1, { bevel: 0.15 }), x, y, 0));
  b.add(mat.lensRing(), cyl(size * 0.4, t * 0.3, x, y, t * 0.62, 28, size * 0.36));
  b.add(mat.lens(), cyl(size * 0.3, 0.12, x, y, t * 0.92, 28));
  b.add(mat.dark(), cyl(size * 0.12, 0.05, x, y, t * 0.92 + 0.12, 16));
}

function genCamera(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const [, , w, h] = ctx.comp.rect;
  const t = ctx.comp.t;
  const p = ctx.comp.mesh.params;
  const lenses = num(p, 'lenses', 1);
  const layout = str(p, 'layout', 'v');
  const b = new Builder();
  if (lenses === 1) {
    lensModule(b, 0, 0, Math.min(w, h) - 0.6, t);
  } else if (layout === 'd') {
    const s = Math.min(w, h) * 0.5;
    lensModule(b, -w * 0.22, h * 0.22, s, t);
    lensModule(b, w * 0.22, -h * 0.22, s, t);
    b.add(mat.steel(), box(w * 0.5, 2, 0.4, 0, 0, 0).rotateZ(-Math.PI / 4));
  } else {
    const s = Math.min(w - 0.6, h / 2 - 0.5);
    lensModule(b, 0, h / 4, s, t);
    lensModule(b, 0, -h / 4, s, t);
    b.add(mat.steel(), box(w * 0.5, 1.6, 0.4, 0, 0, 0));
  }
  b.build(out.group);
  addConnectorFlexes(ctx, out, 0.5, 3);
  return out;
}

function genPort(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const [, , w, h] = ctx.comp.rect;
  const t = ctx.comp.t;
  const b = new Builder();
  // main flex backbone along the bottom edge
  b.add(mat.flex(), box(w, h * 0.55, 0.16, 0, h * 0.15, 0.05));
  // connector shell
  b.add(mat.steel(), move(slab(9.6, h * 0.95, t, 0.9, { bevel: 0.2 }), 0, -h * 0.02, 0));
  const mouth = slab(7.6, 1.6, 1.0, 0.7);
  mouth.rotateX(Math.PI / 2);
  b.add(mat.dark(), move(mouth, 0, -h / 2 + 0.6, t / 2 - 0.2));
  // microphones and gaskets
  for (const sx of [-1, 1]) {
    b.add(mat.gold(), cyl(1.3, 0.9, sx * w * 0.2, 0, 0.2, 14));
    b.add(mat.rubber(), move(new THREE.RingGeometry(1.3, 2, 16), sx * w * 0.2, 0, 1.12));
    b.add(mat.rubber(), box(4.5, 1.5, 1, sx * w * 0.34, -h * 0.2, 0.2));
    b.add(mat.blackPlastic(), box(3, h * 0.6, 0.7, sx * w * 0.44, h * 0.05, 0.2));
  }
  addEars(ctx, b, mat.steel(), 0.1);
  b.build(out.group);
  // long tail to the board
  for (const c of connectorsOf(ctx)) {
    const [lx, ly] = ctx.local(c.position[0], c.position[1]);
    const from = new THREE.Vector3(Math.max(-w / 2 + 3, Math.min(w / 2 - 3, lx)), h * 0.3, 0.15);
    const fv = makeFlex(from, new THREE.Vector3(lx, ly, 0.3), 3.6, { arch: 0.5 });
    out.group.add(fv.group);
    out.flexes.set(c.id, fv);
  }
  return out;
}

function genHome(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const [, , w] = ctx.comp.rect;
  const t = ctx.comp.t;
  const b = new Builder();
  b.add(mat.steel(), cyl(w / 2, t * 0.5, 0, 0, 0, 30));
  b.add(mat.blackPlastic(), cyl(w / 2 - 0.9, t * 0.5, 0, 0, t * 0.5, 30));
  b.add(mat.gold(), box(2.6, 2.6, 0.12, 0, 0, t));
  b.add(mat.rubber(), move(new THREE.RingGeometry(w / 2, w / 2 + 0.7, 30), 0, 0, 0.05));
  b.build(out.group);
  addConnectorFlexes(ctx, out, t * 0.6, 2.4);
  return out;
}

function genSensorBar(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const [, , w, h] = ctx.comp.rect;
  const t = ctx.comp.t;
  const flood = ctx.comp.mesh.params?.flood === true;
  const b = new Builder();
  b.add(mat.flex(), box(w, h * 0.7, 0.16, 0, 0, 0));
  // earpiece speaker
  b.add(mat.blackPlastic(), move(slab(w * 0.36, h * 0.8, t, 0.8, { bevel: 0.15 }), 0, 0, 0.1));
  b.add(mat.grille(), move(planarUV(new THREE.PlaneGeometry(w * 0.28, h * 0.4), (w * 0.28) / 4, (h * 0.4) / 4), 0, 0, t + 0.11));
  // front camera + sensors
  b.add(mat.shield(), move(slab(h * 0.8, h * 0.8, t * 0.9, 0.6), -w * 0.33, 0, 0.1));
  b.add(mat.lens(), cyl(h * 0.24, 0.1, -w * 0.33, 0, t * 0.9 + 0.1, 20));
  b.add(mat.blackPlastic(), box(h * 0.5, h * 0.5, t * 0.6, w * 0.3, 0, 0.1));
  b.add(mat.lens(), cyl(h * 0.14, 0.06, w * 0.3, 0, t * 0.6 + 0.1, 14));
  if (flood) {
    b.add(mat.steel(), move(slab(h * 0.7, h * 0.7, t * 0.8, 0.5), w * 0.42, 0, 0.1));
    b.add(mat.redDot(), cyl(h * 0.12, 0.05, w * 0.42, 0, t * 0.8 + 0.1, 12));
  }
  addEars(ctx, b, mat.steel(), 0);
  b.build(out.group);
  addConnectorFlexes(ctx, out, 0.2, 2.6);
  return out;
}

function genTrueDepth(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const [, , w, h] = ctx.comp.rect;
  const t = ctx.comp.t;
  const b = new Builder();
  b.add(mat.steel(), move(slab(w, h * 0.55, t * 0.35, 0.8), 0, 0, 0));
  const mod = (x: number, lens: THREE.Material, rr: number): void => {
    b.add(mat.shield(), move(slab(h * 0.92, h * 0.92, t * 0.85, 0.8, { bevel: 0.12 }), x, 0, 0));
    b.add(mat.lensRing(), cyl(rr + 0.5, t * 0.12, x, 0, t * 0.85, 22));
    b.add(lens, cyl(rr, 0.08, x, 0, t * 0.97, 22));
  };
  mod(-w * 0.34, mat.lens(), h * 0.26);
  mod(0, mat.redDot(), h * 0.16);
  mod(w * 0.34, mat.lens(), h * 0.3);
  b.build(out.group);
  addConnectorFlexes(ctx, out, 0.3, 4);
  return out;
}

function genSim(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const [, , w, h] = ctx.comp.rect;
  const t = ctx.comp.t;
  const b = new Builder();
  // the tray slides in along x: outer cap on the frame side, card carrier towards the inside
  const side = Math.sign(ctx.comp.rect[0]) || 1;
  const dir = Math.sign(ctx.local(ctx.comp.rect[0] + side, ctx.comp.rect[1])[0]) || 1;
  b.add(mat.frame(ctx.color.body), box(w * 0.7, h, t, dir * w * 0.15, 0, 0));
  const carrier = extrudeShape(roundedRectShape(13, h - 1.6, 0.8), 0.5, { holes: [roundedRectPath(11, h - 3.6, 0.5)] });
  b.add(mat.steel(), move(carrier, -dir * 7, 0, t * 0.3));
  b.add(mat.simCard(), box(10.6, h - 4, 0.3, -dir * 7, 0, t * 0.35));
  b.add(mat.gold(), box(6, 5, 0.05, -dir * 7.5, 0, t * 0.35 + 0.3));
  b.build(out.group);
  return out;
}

function genEarpiece(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const [, , w, h] = ctx.comp.rect;
  const t = ctx.comp.t;
  const b = new Builder();
  b.add(mat.blackPlastic(), move(slab(w * 0.7, h * 0.9, t, 0.8, { bevel: 0.15 }), 0, 0, 0));
  b.add(mat.grille(), move(planarUV(new THREE.PlaneGeometry(w * 0.5, h * 0.45), (w * 0.5) / 4, (h * 0.45) / 4), 0, 0, t + 0.01));
  b.add(mat.rubber(), box(w * 0.74, 0.5, t * 0.6, 0, h * 0.45, 0));
  addEars(ctx, b, mat.blackPlastic(), 0.2);
  b.build(out.group);
  addConnectorFlexes(ctx, out, t * 0.4, 2.4);
  return out;
}

function genBackGlass(ctx: GenCtx): PartBuild {
  const out = emptyBuild();
  const { def, comp } = ctx;
  const [, , w, h] = comp.rect;
  const t = comp.t;
  const r = Math.max(2, def.dims.r - 1);
  const b = new Builder();
  b.add(mat.backGlass(ctx.color.back), slab(w, h, t, r, { bevel: 0.25, curveSegments: 10 }));
  // outer face is +z in part space
  const shifted = new Builder();
  addCameraIsland(shifted, def, ctx.color.back, 1);
  const g = new THREE.Group();
  g.position.z = t;
  shifted.build(g);
  out.group.add(g);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), mat.pearLogo(isDark(ctx.color.back) === false));
  logo.position.set(0, h * 0.02, t + 0.03);
  out.group.add(logo);
  // inner face: charging coil, shielding, adhesive seat
  const under = (geo: THREE.BufferGeometry, z: number): THREE.BufferGeometry => {
    geo.rotateY(Math.PI);
    return move(geo, 0, 0, z);
  };
  b.add(mat.blackPlastic(), under(slab(w - 6, h - 12, 0.2, r - 3), -0.02));
  b.add(mat.adhesiveBlack(), under(extrudeShape(roundedRectShape(w - 0.6, h - 0.6, r), 0.1, { holes: [roundedRectPath(w - 3.4, h - 3.4, r - 1.3)] }), 0));
  b.build(out.group);
  const coil = new THREE.Mesh(new THREE.CircleGeometry(24, 48), mat.coil());
  coil.rotation.y = Math.PI;
  coil.position.set(0, -h * 0.04, -0.24);
  out.group.add(coil);
  // short flex tail on the inner face (the assembler draws the stretched cable while the cover is open)
  const tails = new THREE.Group();
  for (const c of connectorsOf(ctx)) {
    const [lx, ly] = ctx.local(c.position[0], c.position[1]);
    const fv = makeFlex(new THREE.Vector3(lx * 0.3, ly - 8, -0.3), new THREE.Vector3(lx, ly, -0.6), 3.6, { arch: -0.5 });
    tails.add(fv.group);
  }
  out.group.add(tails);
  out.extras.tails = tails;
  return out;
}

const GENERATORS: Record<string, (ctx: GenCtx) => PartBuild> = {
  housing: genHousing,
  display: genDisplay,
  battery: genBattery,
  board: genBoard,
  bracket: genBracket,
  taptic: genTaptic,
  speaker: genSpeaker,
  camera: genCamera,
  port: genPort,
  home: genHome,
  sensor_bar: genSensorBar,
  truedepth: genTrueDepth,
  sim: genSim,
  earpiece: genEarpiece,
  backglass: genBackGlass,
};

export function generatePart(ctx: GenCtx): PartBuild {
  const gen = GENERATORS[ctx.comp.mesh.gen];
  if (!gen) throw new Error(`no mesh generator "${ctx.comp.mesh.gen}" for ${ctx.comp.id}`);
  const build = gen(ctx);
  build.group.name = ctx.comp.id;
  return build;
}
