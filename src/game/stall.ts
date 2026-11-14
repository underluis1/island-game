/**
 * The shop scene: building (3 stages), decorations, people. Pure presentation driven by the game state.
 */
import * as THREE from 'three';
import type { Customer, DecorInstance, GameState, Persona } from '../core/state';
import { hashString } from '../core/rng';
import type { DecorDef } from '../gameplay/sim/types';
import { AmbientCrowd, createCharacter, type Character, type CharacterKind } from '../procgen/characters';
import { buildDecor } from '../procgen/props/decor';
import { buildConstructionSite, buildShop, type ConstructionSite, type DecorModel, type ShopBuild, type ShopEnv, type ShopUpgrades } from '../procgen/props/shop';
import type { World } from '../render/world';

export type StallPick = 'customer' | 'mat' | 'tablet' | 'radio' | 'rack' | 'pickup';

const NAMED_KIND: Record<string, CharacterKind> = {
  noi: 'noi',
  dive_instructor: 'dive_instructor',
  italian_backpacker: 'italian_backpacker',
  somchai: 'somchai',
  chai: 'chai',
  assistant: 'assistant',
};

function kindOf(p: Persona): CharacterKind {
  return NAMED_KIND[p.voice] ?? (p.character ? NAMED_KIND[p.character] : undefined) ?? p.kind;
}

interface Visitor {
  ch: Character;
  role: 'counter' | 'queue' | 'pickup' | 'leaving';
  token: number;
}

export function upgradesOf(state: GameState): ShopUpgrades {
  const t = state.tools;
  const clamp = <T extends number>(v: number | undefined, lo: number, hi: number): T => Math.max(lo, Math.min(hi, v ?? lo)) as T;
  return {
    chair: clamp<1 | 2 | 3>(t.chair, 1, 3),
    fan: clamp<1 | 2>(t.fan, 1, 2),
    lamp: clamp<1 | 2>(t.lamp, 1, 2),
    lights: clamp<0 | 1 | 2>(t.lights, 0, 2),
    rack: clamp<1 | 2 | 3>(t.rack, 1, 3),
    shelf: clamp<0 | 1>(t.shelf, 0, 1),
  };
}

export class StallScene {
  readonly root = new THREE.Group();
  shop!: ShopBuild;
  private shopKey = '';
  private decor = new Map<string, { model: DecorModel; key: string }>();
  private visitors = new Map<string, Visitor>();
  private rackPhones = new Map<string, THREE.Mesh>();
  private player: Character;
  private somchai: Character | null = null;
  private assistant: Character | null = null;
  private crowd: AmbientCrowd;
  private site: ConstructionSite | null = null;
  private raycaster = new THREE.Raycaster();
  private matProxy: THREE.Mesh;
  private tokens = 0;
  private phoneGeo: THREE.BufferGeometry;
  private spawn = new THREE.Vector3(11, 0, -6.5);
  readonly env: ShopEnv = { timeOfDay: 10, wind: 0.3, rain: 0, lampsOn: false };

  constructor(
    scene: THREE.Scene,
    private world: World,
    private decorDefs: DecorDef[],
    private textureScale: number,
  ) {
    this.root.name = 'stall';
    scene.add(this.root);
    const height = (x: number, z: number): number => this.floorAt(x, z);
    this.player = createCharacter({ kind: 'player', seed: 7 }, { heightAt: height });
    this.root.add(this.player.root);
    this.crowd = new AmbientCrowd({ count: 7, seed: 11, paths: world.beachPaths, heightAt: (x, z) => world.heightAt(x, z) });
    this.root.add(this.crowd.root);
    this.matProxy = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.4), new THREE.MeshBasicMaterial({ visible: false }));
    this.matProxy.position.set(0, 0.94, 0);
    this.root.add(this.matProxy);
    const g = new THREE.BoxGeometry(0.068, 0.14, 0.008, 1, 1, 1);
    this.phoneGeo = g;
    const path = world.customerPath;
    if (path.length >= 2) {
      // start the walk-in a dozen metres out along the approach path
      const end = path[path.length - 1] as THREE.Vector3;
      for (let i = path.length - 2; i >= 0; i--) {
        if ((path[i] as THREE.Vector3).distanceTo(end) > 10) {
          this.spawn.copy(path[i] as THREE.Vector3);
          break;
        }
      }
    }
  }

  floorAt(x: number, z: number): number {
    if (this.shop && Math.abs(x) < 6 && z > -5 && z < 6) return this.shop.floorHeightAt(x, z);
    return this.world.heightAt(x, z);
  }

  /** Rebuilds the building when stage, colours, name or comfort upgrades changed. */
  syncShop(state: GameState): boolean {
    const up = upgradesOf(state);
    const key = JSON.stringify([state.stage, state.customization, state.shopName, up]);
    if (key === this.shopKey) return false;
    this.shopKey = key;
    if (this.shop) {
      this.root.remove(this.shop.root);
      this.shop.dispose();
    }
    this.shop = buildShop({
      stage: state.stage,
      awningColor: state.customization.awningColor,
      accentColor: state.customization.accentColor,
      shopName: state.shopName,
      textureScale: this.textureScale,
      upgrades: up,
    });
    this.root.add(this.shop.root);
    // the bench sits in shade: keep the awning from blacking out the work area
    for (const name of ['shop-awning', 'shop-roof']) {
      const cover = this.shop.root.getObjectByName(name);
      if (cover) cover.castShadow = false;
    }
    const seat = this.shop.anchors.seat;
    this.player.root.position.set(seat.x, seat.y, seat.z);
    this.player.root.rotation.y = Math.PI;
    this.player.setAction('sit');
    // every decoration must be re-seated on the new floor
    for (const d of this.decor.values()) d.key = '';
    this.syncDecor(state);
    return true;
  }

  setPlayerWorking(on: boolean): void {
    this.player.setAction(on ? 'work' : 'sit');
  }

  setPlayerVisible(v: boolean): void {
    this.player.root.visible = v;
  }

  /* ------------------------------------------------------------------ decorations */

  decorDef(itemId: string): DecorDef | undefined {
    return this.decorDefs.find((d) => d.id === itemId);
  }

  /** World transform of a decoration for a stored placement. */
  decorTransform(def: DecorDef, x: number, z: number, rot: number, out: THREE.Object3D): void {
    if (def.placement === 'ground') {
      out.position.set(x, this.floorAt(x, z), z);
      out.rotation.set(0, (rot * Math.PI) / 2, 0);
      return;
    }
    const slot = this.nearestSlot(def.placement, x, z);
    if (!slot) {
      out.position.set(x, 1.6, z);
      return;
    }
    out.position.copy(slot.position);
    out.rotation.set(0, slot.normal ? Math.atan2(slot.normal.x, slot.normal.z) : 0, 0);
  }

  slots(placement: DecorDef['placement']): Array<{ position: THREE.Vector3; normal?: THREE.Vector3 }> {
    if (!this.shop) return [];
    if (placement === 'wall') return this.shop.wallSlots;
    if (placement === 'hang') return this.shop.hangSlots.map((p) => ({ position: p }));
    if (placement === 'shelf') return this.shop.shelfSlots.map((p) => ({ position: p }));
    return [];
  }

  nearestSlot(placement: DecorDef['placement'], x: number, z: number, maxDist = 0.5): { position: THREE.Vector3; normal?: THREE.Vector3 } | null {
    let best: { position: THREE.Vector3; normal?: THREE.Vector3 } | null = null;
    let bd = maxDist;
    for (const s of this.slots(placement)) {
      const d = Math.hypot(s.position.x - x, s.position.z - z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Rules the simulation cannot know: building footprint, walkways, slot availability. */
  validPlacement(def: DecorDef, at: { x: number; z: number; rot: number }, state: GameState, movingUid?: string): boolean {
    if (!this.shop) return false;
    if (def.placement !== 'ground') {
      const slot = this.nearestSlot(def.placement, at.x, at.z, 0.05);
      if (!slot) return false;
      return !state.decor.some((d) => {
        if (!d.placed || d.uid === movingUid) return false;
        const od = this.decorDef(d.itemId);
        return od?.placement === def.placement && Math.hypot(d.placed.x - at.x, d.placed.z - at.z) < 0.05;
      });
    }
    const w = (at.rot % 2 === 0 ? def.footprint[0] : def.footprint[1]) / 2;
    const dd = (at.rot % 2 === 0 ? def.footprint[1] : def.footprint[0]) / 2;
    const a = this.shop.decorArea;
    if (at.x - w < a.minX || at.x + w > a.maxX || at.z - dd < a.minZ || at.z + dd > a.maxZ) return false;
    for (const b of this.shop.blocked) {
      if (at.x + w > b.minX && at.x - w < b.maxX && at.z + dd > b.minZ && at.z - dd < b.maxZ) return false;
    }
    return true;
  }

  syncDecor(state: GameState): void {
    const alive = new Set<string>();
    for (const inst of state.decor) {
      if (!inst.placed) continue;
      alive.add(inst.uid);
      this.placeDecorVisual(inst);
    }
    for (const [uid, d] of this.decor) {
      if (alive.has(uid)) continue;
      this.root.remove(d.model.root);
      d.model.dispose();
      this.decor.delete(uid);
    }
  }

  private placeDecorVisual(inst: DecorInstance): void {
    const def = this.decorDef(inst.itemId);
    if (!def || !inst.placed) return;
    const key = `${inst.placed.x}:${inst.placed.z}:${inst.placed.rot}`;
    let d = this.decor.get(inst.uid);
    if (!d) {
      const model = buildDecor(inst.itemId, { textureScale: this.textureScale });
      model.root.userData.decorUid = inst.uid;
      this.root.add(model.root);
      d = { model, key: '' };
      this.decor.set(inst.uid, d);
    }
    if (d.key !== key) {
      this.decorTransform(def, inst.placed.x, inst.placed.z, inst.placed.rot, d.model.root);
      d.key = key;
    }
  }

  decorObjects(): THREE.Object3D[] {
    return [...this.decor.values()].map((d) => d.model.root);
  }

  /* ------------------------------------------------------------------ people */

  private makeVisitor(p: Persona, role: Visitor['role'], heldColor: string | null): Visitor {
    const ch = createCharacter({ kind: kindOf(p), seed: p.look }, { heightAt: (x, z) => this.floorAt(x, z) });
    ch.root.position.copy(this.spawn);
    ch.setHeldPhone(heldColor);
    this.root.add(ch.root);
    return { ch, role, token: ++this.tokens };
  }

  private spotFor(role: Visitor['role'], index = 0): THREE.Vector3 {
    const c = this.shop.anchors.customerSpot;
    if (role === 'counter') return c.clone();
    if (role === 'pickup') return new THREE.Vector3(c.x + 0.75, c.y, c.z - 0.1);
    return new THREE.Vector3(c.x - 0.8 - index * 0.75, c.y, c.z - 0.9 - index * 0.25);
  }

  private async walk(v: Visitor, to: THREE.Vector3, then?: () => void): Promise<void> {
    const token = ++this.tokens;
    v.token = token;
    await v.ch.walkTo(to, 1.9);
    if (v.token !== token) return;
    v.ch.faceTowards(new THREE.Vector3(0, 0, 0.6));
    then?.();
  }

  customerArrives(c: Customer, position: 'counter' | 'queue', queueIndex = 0, instant = false): void {
    if (this.visitors.has(c.id)) return;
    const v = this.makeVisitor(c, position, '#2a2c30');
    this.visitors.set(c.id, v);
    const spot = this.spotFor(position, queueIndex);
    if (instant) {
      v.ch.root.position.copy(spot);
      v.ch.root.rotation.y = 0;
    } else void this.walk(v, spot, () => position === 'counter' && v.ch.setAction('wave'));
  }

  customerStepsUp(id: string): void {
    const v = this.visitors.get(id);
    if (!v) return;
    v.role = 'counter';
    void this.walk(v, this.spotFor('counter'));
  }

  pickupArrives(orderId: string, persona: Persona, instant = false): void {
    const id = `pickup:${orderId}`;
    if (this.visitors.has(id)) return;
    const v = this.makeVisitor(persona, 'pickup', null);
    this.visitors.set(id, v);
    if (instant) v.ch.root.position.copy(this.spotFor('pickup'));
    else void this.walk(v, this.spotFor('pickup'));
  }

  visitorLeaves(id: string, mood: 'happy' | 'angry' | 'idle' = 'idle'): void {
    const v = this.visitors.get(id);
    if (!v) return;
    this.visitors.delete(id);
    v.role = 'leaving';
    const go = (): void => {
      void this.walk(v, this.spawn, () => {
        this.root.remove(v.ch.root);
        v.ch.dispose();
      });
    };
    if (mood === 'idle') go();
    else {
      v.ch.setAction(mood);
      const token = ++this.tokens;
      v.token = token;
      setTimeout(() => v.token === token && go(), 1300);
    }
    this.leaving.push(v);
  }
  private leaving: Visitor[] = [];

  visitor(id: string): Character | null {
    return this.visitors.get(id)?.ch ?? null;
  }

  setTalking(id: string | null): void {
    for (const [vid, v] of this.visitors) v.ch.setTalking(vid === id);
    this.somchai?.setTalking(id === 'somchai');
  }

  showSomchai(on: boolean): void {
    if (on && !this.somchai) {
      this.somchai = createCharacter({ kind: 'somchai', seed: 1 }, { heightAt: (x, z) => this.floorAt(x, z) });
      this.somchai.root.position.set(1.6, this.floorAt(1.6, 0.25), 0.25);
      this.somchai.root.rotation.y = -Math.PI / 2;
      this.root.add(this.somchai.root);
    } else if (!on && this.somchai) {
      const s = this.somchai;
      this.somchai = null;
      s.setAction('wave');
      void s.walkTo(new THREE.Vector3(-9, 0, 3), 1.2).then(() => {
        this.root.remove(s.root);
        s.dispose();
      });
      this.leaving.push({ ch: s, role: 'leaving', token: 0 });
    }
  }

  showAssistant(on: boolean, working: boolean): void {
    if (on && !this.assistant) {
      this.assistant = createCharacter({ kind: 'assistant', seed: 5 }, { heightAt: (x, z) => this.floorAt(x, z) });
      const a = this.shop.anchors.assistantSpot;
      this.assistant.root.position.copy(a);
      this.assistant.root.rotation.y = Math.PI;
      this.root.add(this.assistant.root);
    } else if (!on && this.assistant) {
      this.root.remove(this.assistant.root);
      this.assistant.dispose();
      this.assistant = null;
    }
    this.assistant?.setAction(working ? 'work' : 'idle');
  }

  /** Reconciles visitors with the state after loading a save. */
  restorePeople(state: GameState): void {
    for (const [id, v] of [...this.visitors]) {
      this.root.remove(v.ch.root);
      v.ch.dispose();
      this.visitors.delete(id);
    }
    if (state.counter) this.customerArrives(state.counter, 'counter', 0, true);
    state.queue.forEach((c, i) => this.customerArrives(c, 'queue', i, true));
    for (const o of state.orders) if (o.customerPresent && o.status !== 'delivered') this.pickupArrives(o.id, o.persona, true);
  }

  /* ------------------------------------------------------------------ rack */

  syncRack(state: GameState, activeJobId: string | null, colorOf: (modelId: string, color: number) => string): void {
    const jobs: Array<{ id: string; modelId: string; color: number }> = [];
    for (const o of state.orders) {
      if ((o.status === 'queued' || o.status === 'in_progress' || o.status === 'ready') && o.id !== activeJobId) jobs.push({ id: o.id, modelId: o.modelId, color: o.phone.color });
    }
    for (const o of state.owned) if (o.id !== activeJobId) jobs.push({ id: o.id, modelId: o.modelId, color: o.phone.color });
    const alive = new Set(jobs.map((j) => j.id));
    for (const [id, m] of this.rackPhones) {
      if (!alive.has(id)) {
        this.root.remove(m);
        (m.material as THREE.Material).dispose();
        this.rackPhones.delete(id);
      }
    }
    jobs.forEach((j, i) => {
      const slot = this.shop.rackSlots[i % Math.max(1, this.shop.rackSlots.length)];
      if (!slot) return;
      let m = this.rackPhones.get(j.id);
      if (!m) {
        m = new THREE.Mesh(this.phoneGeo, new THREE.MeshStandardMaterial({ color: colorOf(j.modelId, j.color), metalness: 0.6, roughness: 0.3 }));
        m.castShadow = true;
        this.root.add(m);
        this.rackPhones.set(j.id, m);
      }
      m.position.set(slot.x, slot.y + 0.072, slot.z);
      m.rotation.set(-0.18, 0, 0);
    });
  }

  /* ------------------------------------------------------------------ construction */

  showConstruction(toStage: 0 | 2 | 3): void {
    if (this.site) {
      this.root.remove(this.site.root);
      this.site.dispose();
      this.site = null;
    }
    if (toStage) {
      this.site = buildConstructionSite(toStage);
      this.root.add(this.site.root);
    }
    if (this.shop) this.shop.root.visible = !toStage;
  }

  /* ------------------------------------------------------------------ picking */

  pick(camera: THREE.Camera, ndc: THREE.Vector2): { kind: StallPick; id?: string; object: THREE.Object3D } | null {
    this.raycaster.setFromCamera(ndc, camera);
    const cands: Array<{ kind: StallPick; id?: string; object: THREE.Object3D }> = [];
    for (const [id, v] of this.visitors) {
      if (v.role === 'counter') cands.push({ kind: 'customer', id, object: v.ch.root });
      else if (v.role === 'pickup') cands.push({ kind: 'pickup', id: id.replace('pickup:', ''), object: v.ch.root });
    }
    cands.push({ kind: 'mat', object: this.matProxy });
    if (this.shop) {
      cands.push({ kind: 'tablet', object: this.shop.interactables.tablet });
      cands.push({ kind: 'radio', object: this.shop.interactables.radio });
      cands.push({ kind: 'rack', object: this.shop.interactables.rack });
    }
    let best: { kind: StallPick; id?: string; object: THREE.Object3D } | null = null;
    let bd = Infinity;
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    for (const c of cands) {
      // characters are skinned: a padded bounding box is both cheaper and more forgiving than triangles
      if (c.kind === 'customer' || c.kind === 'pickup') {
        const p = c.object.position;
        box.min.set(p.x - 0.32, p.y, p.z - 0.32);
        box.max.set(p.x + 0.32, p.y + 1.85, p.z + 0.32);
      } else {
        box.setFromObject(c.object);
        box.expandByScalar(0.03);
      }
      if (this.raycaster.ray.intersectBox(box, hit)) {
        const d = hit.distanceTo(this.raycaster.ray.origin);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
    }
    return best;
  }

  update(dt: number, env: ShopEnv, crowdOn: boolean): void {
    Object.assign(this.env, env);
    this.shop?.update(dt, env);
    for (const d of this.decor.values()) d.model.update?.(dt, env);
    this.player.update(dt);
    this.somchai?.update(dt);
    this.assistant?.update(dt);
    for (const v of this.visitors.values()) v.ch.update(dt);
    this.leaving = this.leaving.filter((v) => v.ch.root.parent != null);
    for (const v of this.leaving) v.ch.update(dt);
    this.crowd.root.visible = crowdOn;
    if (crowdOn) this.crowd.update(dt, { timeOfDay: env.timeOfDay, rain: env.rain });
    this.site?.update(dt);
  }

  /** Stable pseudo-random helper for cosmetic choices. */
  static tint(seed: string): number {
    return hashString(seed);
  }
}
