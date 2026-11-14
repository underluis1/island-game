/** Decoration mode: grid placement with a green/red preview, rotation, pick-up and selling. */
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { GameSim } from '../gameplay/sim';
import type { DecorDef } from '../gameplay/sim/types';
import { buildDecor } from '../procgen/props/decor';
import type { DecorModel } from '../procgen/props/shop';
import type { StallScene } from './stall';

export interface DecorHost {
  sfx(name: string): void;
  message(kind: 'error' | 'info' | 'success', key: string, params?: Record<string, string | number>): void;
  onChanged(): void;
}

const GRID = 0.5;

export class DecorMode {
  active = false;
  /** uid of the instance being placed/moved */
  selected: string | null = null;
  private ghost: DecorModel | null = null;
  private ghostDef: DecorDef | null = null;
  private rot = 0;
  private pos = new THREE.Vector3();
  private valid = false;
  private footprint: THREE.Mesh;
  private slotMarkers: THREE.InstancedMesh;
  private grid: THREE.GridHelper;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hiddenRoof: THREE.Object3D[] = [];

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    private stall: StallScene,
    private sim: GameSim,
    private host: DecorHost,
  ) {
    this.footprint = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#35d07f', transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.footprint.rotation.x = -Math.PI / 2;
    this.footprint.visible = false;
    this.footprint.renderOrder = 6;
    scene.add(this.footprint);
    const ring = new THREE.TorusGeometry(0.09, 0.015, 8, 20);
    this.slotMarkers = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: '#18e0c8', transparent: true, opacity: 0.9, depthTest: false }), 16);
    this.slotMarkers.count = 0;
    this.slotMarkers.visible = false;
    this.slotMarkers.renderOrder = 7;
    this.slotMarkers.frustumCulled = false;
    scene.add(this.slotMarkers);
    this.grid = new THREE.GridHelper(12, 24, '#ffffff', '#ffffff');
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.16;
    this.grid.position.y = 0.012;
    this.grid.visible = false;
    scene.add(this.grid);
  }

  private get state(): GameState {
    return this.sim.state;
  }

  enter(): void {
    this.active = true;
    this.grid.visible = true;
    this.hiddenRoof = [];
    for (const name of ['shop-roof', 'shop-awning']) {
      const o = this.stall.shop.root.getObjectByName(name);
      if (o && o.visible) {
        o.visible = false;
        this.hiddenRoof.push(o);
      }
    }
  }

  exit(): void {
    this.cancel();
    this.active = false;
    this.grid.visible = false;
    for (const o of this.hiddenRoof) o.visible = true;
    this.hiddenRoof = [];
  }

  cameraPose(out: { position: THREE.Vector3; target: THREE.Vector3 }): void {
    const far = this.state.stage === 1 ? 1 : 1.25;
    out.position.set(5.2 * far, 6.8 * far, 6.4 * far);
    out.target.set(0, 0.6, -0.2);
  }

  /** Starts placing an instance (from stock, or an already placed one being moved). */
  select(uid: string): void {
    this.cancel();
    const inst = this.state.decor.find((d) => d.uid === uid);
    const def = inst ? this.stall.decorDef(inst.itemId) : undefined;
    if (!inst || !def) return;
    this.selected = uid;
    this.ghostDef = def;
    this.rot = inst.placed?.rot ?? 0;
    this.ghost = buildDecor(inst.itemId);
    this.ghost.root.traverse((o) => {
      o.raycast = () => undefined;
    });
    this.scene.add(this.ghost.root);
    this.footprint.visible = true;
    // the real object hides while it is being moved
    for (const o of this.stall.decorObjects()) if (o.userData.decorUid === uid) o.visible = false;
    this.showSlots(def);
    this.host.sfx('ui_click');
  }

  private showSlots(def: DecorDef): void {
    const slots = def.placement === 'ground' ? [] : this.stall.slots(def.placement);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    slots.slice(0, 16).forEach((s, i) => {
      if (s.normal) q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.normal);
      else q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      m.compose(s.position, q, new THREE.Vector3(1, 1, 1));
      this.slotMarkers.setMatrixAt(i, m);
    });
    this.slotMarkers.count = Math.min(16, slots.length);
    this.slotMarkers.instanceMatrix.needsUpdate = true;
    this.slotMarkers.visible = slots.length > 0;
  }

  cancel(): void {
    if (this.ghost) {
      this.scene.remove(this.ghost.root);
      this.ghost.dispose();
      this.ghost = null;
    }
    if (this.selected) for (const o of this.stall.decorObjects()) if (o.userData.decorUid === this.selected) o.visible = true;
    this.selected = null;
    this.ghostDef = null;
    this.footprint.visible = false;
    this.slotMarkers.visible = false;
  }

  rotate(): void {
    if (!this.selected) return;
    this.rot = (this.rot + 1) % 4;
    this.host.sfx('rotate_decor');
    this.refreshGhost();
  }

  private setRay(e: { clientX: number; clientY: number }): void {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.active || !this.ghostDef) return;
    this.setRay(e);
    const def = this.ghostDef;
    if (def.placement === 'ground') {
      const p = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(this.ground, p)) return;
      // odd-sized footprints sit on cell centres, even ones on grid lines
      const w = this.rot % 2 === 0 ? def.footprint[0] : def.footprint[1];
      const d = this.rot % 2 === 0 ? def.footprint[1] : def.footprint[0];
      const snap = (v: number, size: number): number => {
        const odd = Math.round(size / GRID) % 2 === 1;
        return odd ? Math.floor(v / GRID) * GRID + GRID / 2 : Math.round(v / GRID) * GRID;
      };
      this.pos.set(snap(p.x, w), 0, snap(p.z, d));
    } else {
      // snap to the slot closest to the cursor ray
      let best: THREE.Vector3 | null = null;
      let bd = 0.6;
      for (const s of this.stall.slots(def.placement)) {
        const dist = this.raycaster.ray.distanceToPoint(s.position);
        if (dist < bd) {
          bd = dist;
          best = s.position;
        }
      }
      if (!best) return;
      this.pos.copy(best);
    }
    this.refreshGhost();
  }

  private refreshGhost(): void {
    const def = this.ghostDef;
    if (!def || !this.ghost || !this.selected) return;
    this.stall.decorTransform(def, this.pos.x, this.pos.z, this.rot, this.ghost.root);
    const at = { x: this.pos.x, z: this.pos.z, rot: this.rot };
    this.valid = this.sim.canPlaceDecor(this.selected, at).ok;
    const w = this.rot % 2 === 0 ? def.footprint[0] : def.footprint[1];
    const d = this.rot % 2 === 0 ? def.footprint[1] : def.footprint[0];
    this.footprint.scale.set(Math.max(0.3, w), Math.max(0.3, d), 1);
    this.footprint.position.set(this.ghost.root.position.x, def.placement === 'ground' ? this.ghost.root.position.y + 0.02 : this.ghost.root.position.y - 0.25, this.ghost.root.position.z);
    (this.footprint.material as THREE.MeshBasicMaterial).color.set(this.valid ? '#35d07f' : '#ff4d3d');
  }

  onPointerDown(e: PointerEvent): void {
    if (!this.active) return;
    if (e.button === 2) {
      this.cancel();
      return;
    }
    if (e.button !== 0) return;
    this.setRay(e);
    if (this.selected) {
      this.onPointerMove(e);
      if (!this.valid) {
        this.host.sfx('error');
        this.host.message('error', 'economy.err.bad_position');
        return;
      }
      const res = this.sim.placeDecor(this.selected, { x: this.pos.x, z: this.pos.z, rot: this.rot });
      if (!res.ok) {
        this.host.sfx('error');
        this.host.message('error', res.reason, res.params);
        return;
      }
      this.host.sfx('place_decor');
      this.cancel();
      this.stall.syncDecor(this.state);
      this.host.onChanged();
      return;
    }
    // pick up a placed decoration
    const hits = this.raycaster.intersectObjects(this.stall.decorObjects(), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.decorUid) o = o.parent;
      if (o) {
        this.select(o.userData.decorUid as string);
        this.onPointerMove(e);
        return;
      }
    }
  }

  /** Sell the selected (or hovered) decoration at half price. */
  sellSelected(): void {
    const uid = this.selected;
    if (!uid) return;
    this.cancel();
    const res = this.sim.sellDecor(uid);
    if (res.ok) {
      this.host.sfx('sell');
      this.host.message('success', 'economy.msg.decor_sold', { amount: res.refund ?? 0 });
      this.stall.syncDecor(this.state);
      this.host.onChanged();
    }
  }

  /** Put the selected decoration back in stock. */
  storeSelected(): void {
    const uid = this.selected;
    if (!uid) return;
    this.cancel();
    if (this.sim.storeDecor(uid).ok) {
      this.stall.syncDecor(this.state);
      this.host.onChanged();
    }
  }

  update(dt: number): void {
    if (!this.active || !this.ghost) return;
    this.ghost.update?.(dt, this.stall.env);
  }

  dispose(): void {
    this.cancel();
    this.scene.remove(this.footprint, this.slotMarkers, this.grid);
    this.footprint.geometry.dispose();
    (this.footprint.material as THREE.Material).dispose();
    this.slotMarkers.geometry.dispose();
    (this.slotMarkers.material as THREE.Material).dispose();
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
  }
}
