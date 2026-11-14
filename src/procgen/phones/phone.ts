/**
 * PhoneVisual: the 3D counterpart of a PhoneInstance. It owns every mesh of a phone and knows how to
 * pose them for any repair state. `sync()` moves whatever changed (with tweens) to its new place.
 *
 * Space: `root` is in millimetres, "mat space": +x right, +y away from the player, +z up.
 * The game scales/rotates `root` onto the bench.
 */
import * as THREE from 'three';
import { hashString } from '../../core/rng';
import { ease, type Tweens } from '../../core/tween';
import { PhoneModel } from '../../gameplay/repair/model';
import type { ComponentDef, ConnectorDef, PhoneDef, PhoneInstance, ScrewDef, ScrewItem } from '../../gameplay/repair/types';
import { box, cyl, merge } from './geo';
import { mat } from './materials';
import { generatePart, makeFlex, type FlexVisual, type PartBuild } from './parts';
import { crackTexture, createGrimeLayer, eraseGrime, type GrimeLayer } from './textures';

export type PickKind = 'comp' | 'screw' | 'hole' | 'connector' | 'tab' | 'power';
export interface PickInfo {
  kind: PickKind;
  id: string;
  /** tab index for kind = tab */
  index?: number;
}

export interface PartVisual {
  def: ComponentDef;
  group: THREE.Group;
  build: PartBuild;
  /** +1: visible face towards the screen side, -1: towards the back */
  facing: 1 | -1;
  /** hinge pivot (hinged parts only); the part group is its child while in the phone */
  pivot?: THREE.Group;
  homeParent: THREE.Object3D;
  homePos: THREE.Vector3;
  homeQuat: THREE.Quaternion;
  dirt?: { layer: GrimeLayer; mesh: THREE.Mesh };
  corrosion?: { layer: GrimeLayer; mesh: THREE.Mesh };
  damage?: THREE.Mesh;
  qualityTag?: THREE.Mesh;
  lastState: string;
}

export interface ScrewVisual {
  id: string;
  group: THREE.Group;
  head: THREE.Mesh;
  /** where the screw sits when driven into its own hole */
  homeParent: THREE.Object3D;
  lastLoc: string;
}

interface HoleVisual {
  def: ScrewDef;
  owner: ComponentDef;
  parent: THREE.Object3D;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  proxy: THREE.Mesh;
  ring: THREE.Mesh;
}

interface ConnVisual {
  def: ConnectorDef;
  owner: ComponentDef;
  flex: FlexVisual;
  proxy: THREE.Mesh;
  /** flex drawn in phone space for hinged owners (visible only while the cover is open) */
  hingeFlex: boolean;
  lift: number;
}

export interface MatLayout {
  /** centre of each magnetic-mat cell in mat space (mm) */
  cellCenter(cell: number): THREE.Vector3;
}

export interface PhoneVisualOptions {
  tweens: Tweens;
  /** instant = no animation (first build, loading a save) */
  screenSize?: number;
}

const OPEN_ANGLE = THREE.MathUtils.degToRad(102);
const GAP_ANGLE = THREE.MathUtils.degToRad(2.6);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Q_IDENT = new THREE.Quaternion();
const Q_FLIP_Y = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI);

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

let proxyMat: THREE.MeshBasicMaterial | null = null;
function proxyMaterial(): THREE.MeshBasicMaterial {
  if (!proxyMat) {
    proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  }
  return proxyMat;
}

let burnTex: THREE.CanvasTexture | null = null;
function burnTexture(): THREE.CanvasTexture {
  if (!burnTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(8,6,4,0.95)');
    grad.addColorStop(0.45, 'rgba(40,24,10,0.75)');
    grad.addColorStop(0.8, 'rgba(90,60,20,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    burnTex = new THREE.CanvasTexture(c);
    burnTex.colorSpace = THREE.SRGBColorSpace;
  }
  return burnTex;
}

export class PhoneVisual {
  readonly root = new THREE.Group();
  readonly phoneGroup = new THREE.Group();
  readonly model: PhoneModel;
  readonly parts = new Map<string, PartVisual>();
  readonly screws = new Map<string, ScrewVisual>();
  readonly holes = new Map<string, HoleVisual>();
  readonly connectors = new Map<string, ConnVisual>();
  readonly screenCanvas: HTMLCanvasElement;
  readonly screenCtx: CanvasRenderingContext2D;
  readonly screenTexture: THREE.CanvasTexture;
  /** hinge angle animation state per hinged part */
  private hingeAngle = new Map<string, number>();
  private flipAngle = 0;
  /** where the phone body sits on the mat (mm) */
  readonly phoneOffset = new THREE.Vector3(-20, 0, 0);
  private tweens: Tweens;
  private ownGeos: THREE.BufferGeometry[] = [];
  private ownMats: THREE.Material[] = [];
  private ownTex: THREE.Texture[] = [];
  private pickables: THREE.Object3D[] = [];
  private portLint: THREE.Mesh | null = null;
  private screenMat: THREE.MeshStandardMaterial | null = null;
  private d: number;

  constructor(
    readonly def: PhoneDef,
    phone: PhoneInstance,
    opts: PhoneVisualOptions,
  ) {
    this.model = new PhoneModel(def);
    this.tweens = opts.tweens;
    this.d = def.dims.d;
    this.root.name = `phone:${phone.uid}`;
    this.root.add(this.phoneGroup);
    this.phoneGroup.position.copy(this.phoneOffset);

    const sz = opts.screenSize ?? 256;
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = sz;
    this.screenCanvas.height = Math.round((sz * def.dims.h) / def.dims.w);
    this.screenCtx = this.screenCanvas.getContext('2d') as CanvasRenderingContext2D;
    this.screenCtx.fillStyle = '#000';
    this.screenCtx.fillRect(0, 0, this.screenCanvas.width, this.screenCanvas.height);
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.ownTex.push(this.screenTexture);

    const color = def.colors[phone.color % def.colors.length] ?? def.colors[0]!;
    // parents first, so children can attach to their parent's group
    const ordered = [...def.components].sort((a, b) => Number(!!a.parent) - Number(!!b.parent));
    for (const comp of ordered) this.buildPart(comp, phone, color);
    this.buildScrews(phone);
    this.buildConnectors();
    this.buildPortLint();
    this.sync(phone, true);
  }

  /* ------------------------------------------------------------------ construction */

  private facingOf(c: ComponentDef): 1 | -1 {
    const base: 1 | -1 = this.model.sideOf(c) === 'back' ? -1 : 1;
    return c.parent ? (-base as 1 | -1) : base;
  }

  private buildPart(comp: ComponentDef, phone: PhoneInstance, color: { body: string; back: string }): void {
    const facing = this.facingOf(comp);
    const [cx, cy] = comp.rect;
    const mirror = facing === -1;
    const build = generatePart({
      def: this.def,
      model: this.model,
      comp,
      color,
      seed: hashString(`${this.def.id}:${comp.id}`),
      local: (px, py) => [mirror ? -(px - cx) : px - cx, py - cy],
    });
    const group = build.group;
    let homeParent: THREE.Object3D = this.phoneGroup;
    const homePos = new THREE.Vector3();
    const homeQuat = new THREE.Quaternion();
    let pivot: THREE.Group | undefined;

    if (comp.parent) {
      const parent = this.parts.get(comp.parent);
      if (!parent) throw new Error(`parent ${comp.parent} of ${comp.id} not built`);
      homeParent = parent.group;
      const [pcx, pcy] = parent.def.rect;
      const depth = comp.partCategory === 'bracket' ? 2.5 : 0.5;
      // children hang on the inner face of their parent
      homePos.set((cx - pcx) * (parent.facing === 1 ? 1 : -1), cy - pcy, parent.facing === 1 ? -depth : -depth);
      homeQuat.copy(Q_FLIP_Y);
    } else if (comp.hinge) {
      pivot = new THREE.Group();
      pivot.name = `${comp.id}:pivot`;
      const [, , w] = comp.rect;
      const hx = cx + (comp.hinge === 'right' ? w / 2 : -w / 2);
      const hz = facing === 1 ? comp.z : comp.z + comp.t;
      pivot.position.set(hx, cy, hz);
      this.phoneGroup.add(pivot);
      homeParent = pivot;
      homePos.set(cx - hx, 0, facing === 1 ? 0 : 0);
      if (facing === -1) homeQuat.copy(Q_FLIP_Y);
    } else {
      homePos.set(cx, cy, facing === 1 ? comp.z : comp.z + comp.t);
      if (facing === -1) homeQuat.copy(Q_FLIP_Y);
    }
    homeParent.add(group);
    group.position.copy(homePos);
    group.quaternion.copy(homeQuat);

    const pv: PartVisual = { def: comp, group, build, facing, pivot, homeParent, homePos, homeQuat, lastState: '' };
    this.parts.set(comp.id, pv);

    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.pick) o.userData.pick = { kind: 'comp', id: comp.id } satisfies PickInfo;
    });
    build.tabs.forEach((t, i) => {
      t.userData.pick = { kind: 'tab', id: comp.id, index: i } satisfies PickInfo;
    });
    if (comp.removable !== false) this.pickables.push(group);

    if (build.screen) {
      const m = build.screen.material as THREE.MeshStandardMaterial;
      m.emissiveMap = this.screenTexture;
      m.needsUpdate = true;
      this.screenMat = m;
      this.ownMats.push(m);
      this.ownGeos.push(build.screen.geometry);
    }
    this.ensureGrime(pv, phone);
  }

  /** Lazily creates dirt/corrosion overlays when a part has any. */
  private ensureGrime(pv: PartVisual, phone: PhoneInstance): void {
    const cs = phone.comps[pv.def.id];
    if (!cs) return;
    const [, , w, h] = pv.def.rect;
    const make = (kind: 'dirt' | 'corrosion', amount: number): { layer: GrimeLayer; mesh: THREE.Mesh } => {
      const layer = createGrimeLayer(kind, hashString(`${phone.uid}:${pv.def.id}:${kind}`), h / w, amount);
      const material = new THREE.MeshStandardMaterial({
        map: layer.texture,
        transparent: true,
        depthWrite: false,
        roughness: kind === 'dirt' ? 1 : 0.7,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, material);
      if (pv.def.hinge) {
        // covers show their grime on the inner face, where the connectors are
        mesh.position.z = kind === 'dirt' ? -0.82 : -0.78;
        mesh.rotation.y = Math.PI;
        mesh.scale.set(0.86, 0.9, 1);
      } else mesh.position.z = pv.def.t + (kind === 'dirt' ? 0.1 : 0.06);
      mesh.renderOrder = 2;
      mesh.userData.pick = { kind: 'comp', id: pv.def.id } satisfies PickInfo;
      mesh.userData.grime = kind;
      pv.group.add(mesh);
      this.ownGeos.push(geo);
      this.ownMats.push(material);
      this.ownTex.push(layer.texture);
      return { layer, mesh };
    };
    if (cs.dirt > 0.02 && !pv.dirt) pv.dirt = make('dirt', cs.dirt);
    if (cs.corrosion > 0.02 && !pv.corrosion) pv.corrosion = make('corrosion', cs.corrosion);
  }

  private screwPose(owner: ComponentDef, s: ScrewDef): { parent: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion } {
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const { h } = this.def.dims;
    if (Math.abs(s.position[1]) >= h / 2 - 0.01) {
      // edge screw (pentalobes next to the charge port): driven horizontally into the frame
      pos.set(s.position[0], -h / 2 - 0.02, this.d / 2);
      quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      return { parent: this.phoneGroup, pos, quat };
    }
    if (owner.parent) {
      const parent = this.parts.get(owner.parent)!;
      const own = this.parts.get(owner.id)!;
      const [pcx, pcy] = parent.def.rect;
      pos.set(s.position[0] - pcx, s.position[1] - pcy, own.homePos.z - owner.t - 0.02);
      quat.copy(Q_FLIP_Y);
      return { parent: parent.group, pos, quat };
    }
    const facing = this.facingOf(owner);
    pos.set(s.position[0], s.position[1], facing === 1 ? owner.z + owner.t + 0.02 : owner.z - 0.02);
    if (facing === -1) quat.copy(Q_FLIP_Y);
    return { parent: this.phoneGroup, pos, quat };
  }

  private buildScrews(phone: PhoneInstance): void {
    const proxyGeo = new THREE.CylinderGeometry(2.3, 2.3, 1.6, 10);
    proxyGeo.rotateX(Math.PI / 2);
    const ringGeo = merge([cyl(1.05, 0.06, 0, 0, -0.04, 14)]);
    this.ownGeos.push(proxyGeo, ringGeo);
    const topGeos = new Map<string, THREE.BufferGeometry>();
    const headR = (type: string): number => (type === 'SO' ? 1.35 : type === 'P2' ? 0.95 : 1.1);
    const topGeo = (type: string): THREE.BufferGeometry => {
      let g = topGeos.get(type);
      if (!g) {
        g = new THREE.CircleGeometry(headR(type), type === 'SO' ? 6 : 18);
        g.translate(0, 0, 0.5);
        topGeos.set(type, g);
        this.ownGeos.push(g);
      }
      return g;
    };
    for (const { owner, f } of this.model.allScrews()) {
      const pose = this.screwPose(owner, f);
      // hole: dark seat + invisible, generous pick proxy
      const ring = new THREE.Mesh(ringGeo, mat.hole());
      ring.position.copy(pose.pos);
      ring.quaternion.copy(pose.quat);
      pose.parent.add(ring);
      const proxy = new THREE.Mesh(proxyGeo, proxyMaterial());
      proxy.position.copy(pose.pos);
      proxy.quaternion.copy(pose.quat);
      proxy.userData.pick = { kind: 'hole', id: f.id } satisfies PickInfo;
      pose.parent.add(proxy);
      this.holes.set(f.id, { def: f, owner, parent: pose.parent, pos: pose.pos, quat: pose.quat, proxy, ring });
    }
    for (const item of Object.values(phone.screws)) {
      const group = new THREE.Group();
      group.name = `screw:${item.id}`;
      // body (head skirt + threaded shank) in one mesh, drive recess as a textured cap
      const len = Math.max(0.8, item.length);
      const r = headR(item.type);
      const bodyGeo = merge([
        cyl(r * 0.86, 0.5, 0, 0, 0, item.type === 'SO' ? 6 : 18, r),
        cyl(item.type === 'SO' ? 0.8 : 0.5, len, 0, 0, -len, 8),
      ]);
      this.ownGeos.push(bodyGeo);
      const body = new THREE.Mesh(bodyGeo, mat.screwBody(item.type === 'SO'));
      body.castShadow = true;
      const head = new THREE.Mesh(topGeo(item.type), mat.screwHead(item.type, item.stripped));
      group.add(body, head);
      const pick = new THREE.Mesh(proxyGeo, proxyMaterial());
      pick.userData.pick = { kind: 'screw', id: item.id } satisfies PickInfo;
      group.add(pick);
      const home = this.holes.get(item.id);
      this.screws.set(item.id, { id: item.id, group, head, homeParent: home?.parent ?? this.phoneGroup, lastLoc: '' });
      this.root.add(group);
    }
  }

  private buildConnectors(): void {
    const proxyGeo = box(6, 7.5, 3, 0, 0, -0.8);
    this.ownGeos.push(proxyGeo);
    for (const { owner, f } of this.model.allConnectors()) {
      const pv = this.parts.get(owner.id)!;
      let flex = pv.build.flexes.get(f.id);
      let hingeFlex = false;
      if (!flex && owner.hinge && pv.pivot) {
        // cable stretched between the open cover and the board, in phone space
        const facing = pv.facing;
        const hingeSign = owner.hinge === 'right' ? 1 : -1;
        const hinge = pv.pivot.position;
        const from = new THREE.Vector3(hinge.x + hingeSign * 0.6, f.position[1], hinge.z + facing * 3.2);
        const socketZ = this.socketZ(facing);
        const to = new THREE.Vector3(f.position[0], f.position[1], socketZ);
        flex = makeFlex(from, to, 3.4, { arch: facing * 1.6 });
        if (facing === -1) {
          // plug must face the back side
          flex.plug.parent!.rotation.x = Math.PI;
        }
        this.phoneGroup.add(flex.group);
        hingeFlex = true;
      }
      if (!flex) continue;
      const proxy = new THREE.Mesh(proxyGeo, proxyMaterial());
      proxy.userData.pick = { kind: 'connector', id: f.id } satisfies PickInfo;
      flex.plug.parent!.add(proxy);
      flex.plug.userData.pick = { kind: 'connector', id: f.id } satisfies PickInfo;
      this.connectors.set(f.id, { def: f, owner, flex, proxy, hingeFlex, lift: 0 });
    }
  }

  private socketZ(facing: 1 | -1): number {
    const board = this.model.boardId ? this.model.comp(this.model.boardId) : null;
    if (!board) return this.d / 2;
    const boardBack = (board.side ?? 'front') === 'back';
    if (facing === 1) return boardBack ? num(this.def.style.midframe, this.d / 2) + 0.1 : board.z + 1.4;
    return boardBack ? board.z - 0.1 : board.z;
  }

  private buildPortLint(): void {
    const port = this.def.components.find((c) => c.externalClean);
    if (!port) return;
    const { h } = this.def.dims;
    const layer = createGrimeLayer('dirt', hashString(`${this.def.id}:lint`), 0.35, 1);
    const material = new THREE.MeshStandardMaterial({ map: layer.texture, transparent: true, roughness: 1, depthWrite: false });
    const geo = new THREE.PlaneGeometry(7.6, 2.3);
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(0, -h / 2 - 0.03, this.d / 2 - 0.2);
    mesh.userData.pick = { kind: 'comp', id: port.id } satisfies PickInfo;
    this.phoneGroup.add(mesh);
    this.portLint = mesh;
    this.ownGeos.push(geo);
    this.ownMats.push(material);
    this.ownTex.push(layer.texture);
  }

  /* ------------------------------------------------------------------ posing */

  private animate(
    obj: THREE.Object3D,
    parent: THREE.Object3D,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    instant: boolean,
    opts: { arc?: number; dur?: number; delay?: number } = {},
  ): void {
    const prev = obj.userData.tween as { cancel(): void } | undefined;
    prev?.cancel();
    if (obj.parent !== parent) {
      if (obj.parent) parent.attach(obj);
      else parent.add(obj);
    }
    if (instant) {
      obj.position.copy(pos);
      obj.quaternion.copy(quat);
      return;
    }
    if (obj.position.distanceToSquared(pos) < 1e-6 && Math.abs(obj.quaternion.dot(quat)) > 0.99999) return;
    const p0 = obj.position.clone();
    const q0 = obj.quaternion.clone();
    const arc = opts.arc ?? 0;
    // arc direction: "up" in mat space expressed in the parent's local frame
    const up = new THREE.Vector3(0, 0, 1);
    if (arc !== 0) {
      parent.updateWorldMatrix(true, false);
      this.root.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(this.root.matrixWorld);
      up.transformDirection(inv);
    }
    obj.userData.tween = this.tweens.add(
      opts.dur ?? 0.38,
      (k) => {
        obj.position.lerpVectors(p0, pos, k);
        if (arc !== 0) obj.position.addScaledVector(up, Math.sin(k * Math.PI) * arc);
        obj.quaternion.slerpQuaternions(q0, quat, k);
      },
      { ease: ease.inOutCubic, delay: opts.delay ?? 0 },
    );
  }

  /** Where a removed part rests on the work mat (mat space, mm). */
  private trayPose(pv: PartVisual, phone: PhoneInstance): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const cs = phone.comps[pv.def.id]!;
    const tray = cs.tray ?? { x: 0, z: 0, r: 0 };
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tray.r);
    let z = 0.15;
    if (pv.def.hinge && pv.facing === 1) {
      // covers lie inner face up so their sub-assemblies stay reachable
      quat.multiply(Q_FLIP_Y);
      z = pv.def.t + 0.2;
    }
    return { pos: new THREE.Vector3(tray.x * 1000, -tray.z * 1000, z), quat };
  }

  private setHinge(pv: PartVisual, angle: number, instant: boolean): void {
    if (!pv.pivot) return;
    const sign = pv.facing * (pv.def.hinge === 'right' ? 1 : -1);
    const target = angle * sign;
    const id = pv.def.id;
    const current = this.hingeAngle.get(id) ?? 0;
    const pivot = pv.pivot;
    const prev = pivot.userData.tween as { cancel(): void } | undefined;
    prev?.cancel();
    if (instant || Math.abs(current - target) < 1e-4) {
      pivot.rotation.y = target;
      this.hingeAngle.set(id, target);
      return;
    }
    const big = Math.abs(current - target) > 0.5;
    pivot.userData.tween = this.tweens.add(
      big ? 0.75 : 0.3,
      (k) => {
        const a = current + (target - current) * k;
        pivot.rotation.y = a;
        this.hingeAngle.set(id, a);
      },
      { ease: big ? ease.inOutCubic : ease.outBack },
    );
  }

  /** Mat cell centres are provided by the bench; set before the first sync. */
  matLayout: MatLayout = { cellCenter: (cell) => new THREE.Vector3(120 + (cell % 4) * 18, 30 - Math.floor(cell / 4) * 18, 0.6) };

  /** Brings every object to the pose implied by the state. Animated unless `instant`. */
  sync(phone: PhoneInstance, instant = false): void {
    // orientation
    const targetFlip = phone.orientation === 'back' ? Math.PI : 0;
    if (Math.abs(targetFlip - this.flipAngle) > 1e-4) {
      const from = this.flipAngle;
      const pg = this.phoneGroup;
      const prev = pg.userData.tween as { cancel(): void } | undefined;
      prev?.cancel();
      const apply = (a: number): void => {
        this.flipAngle = a;
        pg.rotation.y = a;
        const s = Math.sin(a / 2);
        // rotate about the long axis through the body centre, landing flat on the mat either way
        const lift = Math.sin(a) * (this.def.dims.w / 2) * 0.9;
        pg.position.set(this.phoneOffset.x, this.phoneOffset.y, s * s * this.d + Math.abs(lift));
      };
      if (instant) apply(targetFlip);
      else pg.userData.tween = this.tweens.add(0.7, (k) => apply(from + (targetFlip - from) * k), { ease: ease.inOutCubic });
    }

    for (const pv of this.parts.values()) {
      const cs = phone.comps[pv.def.id]!;
      const key = `${cs.state}:${cs.tray?.x ?? 0}:${cs.tray?.z ?? 0}:${cs.tray?.r ?? 0}`;
      const stateChanged = key !== pv.lastState;
      const first = pv.lastState === '';
      if (stateChanged) {
        const inst = instant || first;
        if (cs.state === 'removed') {
          const pose = this.trayPose(pv, phone);
          this.animate(pv.group, this.root, pose.pos, pose.quat, inst, { arc: 16, dur: 0.55 });
        } else {
          this.animate(pv.group, pv.homeParent, pv.homePos, pv.homeQuat, inst, { arc: pv.def.hinge ? 0 : 14, dur: 0.5 });
        }
        pv.lastState = key;
      }
      if (pv.pivot) {
        let angle = 0;
        if (cs.state === 'open') angle = OPEN_ANGLE;
        else if (cs.state === 'installed') {
          const per = this.model.adhesivesOf(pv.def).find((f) => f.kind === 'perimeter');
          const st = per ? phone.adhesives[per.id] : undefined;
          if (st && st.bonded && st.gap) {
            const cut = st.segs.reduce((a, v) => a + v, 0) / st.segs.length;
            angle = GAP_ANGLE * (1 + cut * 1.6);
          }
        }
        this.setHinge(pv, angle, instant || first);
      }
      // sub-objects
      if (pv.build.extras.tails) pv.build.extras.tails.visible = cs.state === 'removed';
      if (pv.build.extras.homeFront) {
        const child = this.def.components.find((c) => c.parent === pv.def.id && c.partCategory === 'home_button');
        pv.build.extras.homeFront.visible = !child || phone.comps[child.id]!.state !== 'removed';
      }
      // pull tabs
      const tabsAdh = this.model.adhesivesOf(pv.def).find((f) => f.kind === 'pulltab');
      if (tabsAdh) {
        const st = phone.adhesives[tabsAdh.id]!;
        pv.build.tabs.forEach((tab, i) => {
          const done = (st.segs[i] ?? 1) >= 1;
          tab.visible = st.bonded && !done;
          if (!tab.userData.dragging) {
            const stretch = 1 + (st.segs[i] ?? 0) * 2.2;
            tab.scale.set(1 / Math.sqrt(stretch), stretch, 1);
          }
        });
      }
      // condition overlays
      this.ensureGrime(pv, phone);
      if (pv.dirt) {
        (pv.dirt.mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(1, cs.dirt * 1.6);
        pv.dirt.mesh.visible = cs.dirt > 0.01;
      }
      if (pv.corrosion) {
        (pv.corrosion.mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(1, cs.corrosion * 1.7);
        pv.corrosion.mesh.visible = cs.corrosion > 0.01;
      }
      this.syncDamage(pv, phone);
      if (pv.build.swell) {
        const want = cs.swollen ? 1 : 0;
        if (pv.group.userData.swell !== want) {
          pv.build.swell(want);
          pv.group.userData.swell = want;
          pv.group.traverse((o) => {
            if ((o as THREE.Mesh).isMesh && !o.userData.pick) o.userData.pick = { kind: 'comp', id: pv.def.id } satisfies PickInfo;
          });
        }
      }
    }

    // screws
    for (const item of Object.values(phone.screws)) this.syncScrew(item, phone, instant);
    for (const [id, hv] of this.holes) {
      hv.ring.visible = phone.holes[id] == null;
    }

    // connectors
    for (const [id, cv] of this.connectors) {
      const ks = phone.connectors[id]!;
      const ownerState = phone.comps[cv.owner.id]!.state;
      if (cv.hingeFlex) cv.flex.group.visible = ownerState === 'open';
      const lift = ks.connected ? 0 : cv.hingeFlex ? 0.5 : 0.42;
      if (Math.abs(lift - cv.lift) > 1e-3) {
        const from = cv.lift;
        const g = cv.flex.group;
        const axis = cv.flex.axis;
        const prev = g.userData.tween as { cancel(): void } | undefined;
        prev?.cancel();
        const sign = cv.hingeFlex ? this.parts.get(cv.owner.id)!.facing : 1;
        const apply = (v: number): void => {
          cv.lift = v;
          g.quaternion.setFromAxisAngle(axis, -v * sign);
        };
        if (instant) apply(lift);
        else g.userData.tween = this.tweens.add(0.26, (k) => apply(from + (lift - from) * k), { ease: ease.outBack });
      }
    }

    // lint in the charge port
    if (this.portLint) {
      const port = this.def.components.find((c) => c.externalClean)!;
      const cs = phone.comps[port.id]!;
      (this.portLint.material as THREE.MeshStandardMaterial).opacity = Math.min(1, cs.dirt * 1.4);
      this.portLint.visible = cs.dirt > 0.02 && cs.state !== 'removed';
    }
  }

  private syncDamage(pv: PartVisual, phone: PhoneInstance): void {
    const cs = phone.comps[pv.def.id]!;
    const damaged = cs.condition === 'damaged';
    if (damaged && !pv.damage) {
      const [, , w, h] = pv.def.rect;
      const glass = pv.def.partCategory === 'display' || pv.def.partCategory === 'back_glass';
      if (glass) {
        const tex = crackTexture(hashString(`${phone.uid}:${pv.def.id}`) % 9, h / w);
        const material = new THREE.MeshPhysicalMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          roughness: 0.25,
          metalness: 0,
          emissive: '#9fb4c8',
          emissiveMap: tex,
          emissiveIntensity: 0.25,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });
        const geo = new THREE.PlaneGeometry(w - 1, h - 1);
        pv.damage = new THREE.Mesh(geo, material);
        pv.damage.position.z = pv.def.t + 0.03;
        pv.damage.renderOrder = 3;
        this.ownGeos.push(geo);
        this.ownMats.push(material);
      } else if (!cs.swollen) {
        const s = Math.min(w, h) * 0.8;
        const material = new THREE.MeshBasicMaterial({
          map: burnTexture(),
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });
        const geo = new THREE.PlaneGeometry(s, s);
        pv.damage = new THREE.Mesh(geo, material);
        pv.damage.position.set(w * 0.1, -h * 0.08, pv.def.t + 0.12);
        pv.damage.renderOrder = 3;
        this.ownGeos.push(geo);
        this.ownMats.push(material);
      }
      if (pv.damage) {
        pv.damage.userData.pick = { kind: 'comp', id: pv.def.id } satisfies PickInfo;
        pv.group.add(pv.damage);
      }
    }
    if (pv.damage) pv.damage.visible = damaged;

    // small quality sticker on replacement parts
    const q = cs.quality;
    const want = q === 'factory' ? '' : q;
    if ((pv.group.userData.quality ?? '') !== want) {
      pv.group.userData.quality = want;
      if (pv.qualityTag) {
        pv.group.remove(pv.qualityTag);
        pv.qualityTag = undefined;
      }
      if (want && pv.def.partCategory !== 'bracket') {
        const [, , w, h] = pv.def.rect;
        const color = want === 'cheap' ? '#ff9f43' : want === 'good' ? '#3ecf8e' : '#5aa9ff';
        const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 });
        const geo = new THREE.CircleGeometry(Math.min(1.6, Math.min(w, h) * 0.14), 16);
        pv.qualityTag = new THREE.Mesh(geo, material);
        const underside = pv.def.hinge ? -1 : 1;
        pv.qualityTag.position.set(w * 0.32, h * 0.36, underside === 1 ? pv.def.t + 0.14 : -0.75);
        if (underside === -1) pv.qualityTag.rotation.y = Math.PI;
        pv.group.add(pv.qualityTag);
        this.ownGeos.push(geo);
        this.ownMats.push(material);
      }
    }
  }

  private syncScrew(item: ScrewItem, phone: PhoneInstance, instant: boolean): void {
    const sv = this.screws.get(item.id);
    if (!sv) return;
    const loc = item.loc;
    const key =
      loc.k === 'hole' ? `hole:${loc.hole}` : loc.k === 'mat' ? `mat:${loc.cell}:${this.matSlot(item, phone)}` : loc.k === 'bench' ? `bench:${loc.x}:${loc.z}` : loc.k;
    const strippedKey = `${item.stripped}`;
    if (sv.head.userData.stripped !== strippedKey) {
      sv.head.userData.stripped = strippedKey;
      sv.head.material = mat.screwHead(item.type, item.stripped);
    }
    if (key === sv.lastLoc) return;
    const first = sv.lastLoc === '';
    sv.lastLoc = key;
    const inst = instant || first;
    sv.group.visible = loc.k !== 'lost';
    if (loc.k === 'hole') {
      const hv = this.holes.get(loc.hole);
      if (!hv) return;
      this.animate(sv.group, hv.parent, hv.pos, hv.quat, inst, { arc: 4, dur: 0.3 });
    } else if (loc.k === 'mat') {
      const c = this.matLayout.cellCenter(loc.cell);
      const slot = this.matSlot(item, phone);
      const off = [
        [-3.2, 3.2],
        [3.2, 3.2],
        [-3.2, -3.2],
        [3.2, -3.2],
      ][slot % 4]!;
      tmpV.set(c.x + off[0]!, c.y + off[1]!, c.z + item.length + 0.05);
      this.animate(sv.group, this.root, tmpV.clone(), Q_IDENT, inst, { arc: 10, dur: 0.32 });
    } else if (loc.k === 'bench') {
      tmpV.set(loc.x * 1000, -loc.z * 1000, 0.55);
      // a dropped screw lies on its side
      tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 + 0.25).premultiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (hashString(item.id) % 628) / 100),
      );
      this.animate(sv.group, this.root, tmpV.clone(), tmpQ.clone(), inst, { arc: 6, dur: 0.3 });
    } else if (loc.k === 'held') {
      // the interaction layer drives held screws every frame
      const prev = sv.group.userData.tween as { cancel(): void } | undefined;
      prev?.cancel();
      if (sv.group.parent !== this.root) this.root.attach(sv.group);
    }
  }

  /** Stable slot (0..3) of a screw inside its mat cell. */
  private matSlot(item: ScrewItem, phone: PhoneInstance): number {
    if (item.loc.k !== 'mat') return 0;
    const cell = item.loc.cell;
    const same = Object.values(phone.screws)
      .filter((s) => s.loc.k === 'mat' && s.loc.cell === cell)
      .map((s) => s.id)
      .sort();
    return Math.max(0, same.indexOf(item.id));
  }

  /* ------------------------------------------------------------------ interaction helpers */

  /** Objects worth raycasting for a given kind of target. */
  pickTargets(kinds: PickKind[]): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    if (kinds.includes('comp') || kinds.includes('tab')) out.push(...this.pickables);
    if (kinds.includes('comp') && this.portLint?.visible) out.push(this.portLint);
    if (kinds.includes('hole')) for (const h of this.holes.values()) out.push(h.proxy);
    if (kinds.includes('screw')) for (const s of this.screws.values()) if (s.group.visible) out.push(s.group);
    if (kinds.includes('connector')) for (const c of this.connectors.values()) if (c.flex.group.visible) out.push(c.proxy, c.flex.plug);
    return out;
  }

  static pickInfo(obj: THREE.Object3D | null): PickInfo | null {
    let o: THREE.Object3D | null = obj;
    while (o) {
      if (o.userData.pick) return o.userData.pick as PickInfo;
      o = o.parent;
    }
    return null;
  }

  /** Objects to outline for a pick target. */
  highlightObjects(info: PickInfo): THREE.Object3D[] {
    switch (info.kind) {
      case 'comp': {
        const pv = this.parts.get(info.id);
        if (!pv) return [];
        const out: THREE.Object3D[] = [];
        for (const child of pv.group.children) {
          // do not outline sub-assemblies or grime planes with the parent
          if (child.userData.grime || child === pv.damage) continue;
          const sub = [...this.parts.values()].some((p) => p.group === child);
          if (!sub) out.push(child);
        }
        return out;
      }
      case 'tab': {
        const pv = this.parts.get(info.id);
        const tab = pv?.build.tabs[info.index ?? 0];
        return tab ? [tab] : [];
      }
      case 'screw': {
        const sv = this.screws.get(info.id);
        return sv ? [sv.head] : [];
      }
      case 'hole': {
        const sid = this.holes.get(info.id);
        return sid ? [sid.ring] : [];
      }
      case 'connector': {
        const cv = this.connectors.get(info.id);
        return cv ? [cv.flex.plug] : [];
      }
      default:
        return [];
    }
  }

  /** World position of a pick target (for camera focus, tool placement, tooltips). */
  targetWorld(info: PickInfo, out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateWorldMatrix(true, true);
    switch (info.kind) {
      case 'hole': {
        const hv = this.holes.get(info.id);
        if (hv) return out.copy(hv.pos).applyMatrix4(hv.parent.matrixWorld);
        break;
      }
      case 'screw': {
        const sv = this.screws.get(info.id);
        if (sv) return sv.group.getWorldPosition(out);
        break;
      }
      case 'connector': {
        const cv = this.connectors.get(info.id);
        if (cv) return cv.flex.plug.getWorldPosition(out);
        break;
      }
      case 'tab': {
        const tab = this.parts.get(info.id)?.build.tabs[info.index ?? 0];
        if (tab) return tab.getWorldPosition(out);
        break;
      }
      case 'comp': {
        const pv = this.parts.get(info.id);
        if (pv) {
          out.set(0, 0, pv.def.t);
          return out.applyMatrix4(pv.group.matrixWorld);
        }
        break;
      }
      default:
        break;
    }
    return this.root.getWorldPosition(out);
  }

  /** Brush stroke at a UV position on a part's grime; returns the remaining fraction (0..1) of that layer. */
  eraseGrimeAt(compId: string, kind: 'dirt' | 'corrosion', u: number, v: number, radius: number, strength: number): number {
    const pv = this.parts.get(compId);
    const g = kind === 'dirt' ? pv?.dirt : pv?.corrosion;
    if (!g) return 0;
    return eraseGrime(g.layer, u, v, radius, strength);
  }

  setScreenOn(on: boolean): void {
    if (this.screenMat) this.screenMat.emissiveIntensity = on ? 0.95 : 0;
  }

  /** Call after drawing on `screenCtx`. */
  refreshScreen(): void {
    this.screenTexture.needsUpdate = true;
  }

  /** Hide the internals when the closed phone is only seen from afar. */
  setDetail(full: boolean, phone: PhoneInstance): void {
    const closed = this.def.components.every((c) => !c.hinge || phone.comps[c.id]!.state === 'installed');
    for (const pv of this.parts.values()) {
      if (pv.def.parent || pv.def.hinge || pv.def.removable === false) continue;
      const st = phone.comps[pv.def.id]!.state;
      pv.group.visible = full || !closed || st === 'removed';
    }
  }

  dispose(): void {
    for (const pv of this.parts.values()) {
      pv.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    }
    for (const cv of this.connectors.values()) {
      cv.flex.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    }
    for (const g of this.ownGeos) g.dispose();
    for (const m of this.ownMats) m.dispose();
    for (const t of this.ownTex) t.dispose();
    this.root.removeFromParent();
  }
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' ? v : d;
}
