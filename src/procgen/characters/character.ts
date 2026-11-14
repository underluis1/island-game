/** Personaggio low-poly: una sola SkinnedMesh a vertex color con scheletro e animazione procedurali. */
import * as THREE from 'three';
import { applyPose, evalAction, P, POSE_SIZE, type AnimCtx, type CharacterAction } from './anim';
import { buildBody, type Body } from './build';
import { GeoBuilder } from './geo';
import { makeLook, type CharacterSpec, type Look } from './look';
import { B, createRig, D, type Rig } from './rig';

export interface Character {
  /** piedi all'origine, sguardo verso +Z */
  readonly root: THREE.Group;
  readonly spec: CharacterSpec;
  readonly action: CharacterAction;
  setAction(a: CharacterAction): void;
  walkTo(target: THREE.Vector3, speed?: number): Promise<void>;
  faceTowards(target: THREE.Vector3): void;
  setTalking(on: boolean): void;
  setHeldPhone(color: string | null): void;
  update(dt: number): void;
  dispose(): void;
}

export interface CharacterOptions {
  heightAt?: (x: number, z: number) => number;
  /** altezza della seduta per 'sit'/'work' (default 0.58 m: sgabello alto adatto a un banco a 0.90 m) */
  seatHeight?: number;
  /** quota del piano di lavoro per 'work' (default 0.90 m) */
  benchHeight?: number;
}

let sharedMaterial: THREE.MeshStandardMaterial | null = null;

/** Materiale unico condiviso da tutti i personaggi (vertex color). */
export function characterMaterial(): THREE.MeshStandardMaterial {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
    sharedMaterial.name = 'characters';
  }
  return sharedMaterial;
}

/** Libera il materiale condiviso (da chiamare solo alla chiusura del gioco). */
export function disposeCharacterShared(): void {
  sharedMaterial?.dispose();
  sharedMaterial = null;
}

const BLEND_TIME = 0.25;
const tmpColor = new THREE.Color();
const wrapPi = (a: number): number => {
  let x = (a + Math.PI) % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x - Math.PI;
};

export class CharacterImpl implements Character {
  readonly root = new THREE.Group();
  readonly spec: CharacterSpec;
  readonly look: Look;
  readonly mesh: THREE.SkinnedMesh;
  readonly triangles: number;
  /** velocità (m/s) usata per la cadenza quando l'azione 'walk' è pilotata dall'esterno */
  paceSpeed = 1.25;
  private readonly inner = new THREE.Group();
  private readonly rig: Rig;
  private readonly body: Body;
  private readonly restPos: THREE.Vector3[];
  private readonly scale: number;
  private readonly pose = new Float32Array(POSE_SIZE);
  private readonly from = new Float32Array(POSE_SIZE);
  private readonly to = new Float32Array(POSE_SIZE);
  private readonly ctx: AnimCtx;
  private readonly heightAt?: (x: number, z: number) => number;
  private current: CharacterAction = 'idle';
  private blend = 1;
  private time: number;
  private yawTarget: number | null = null;
  private walking = false;
  private readonly walkTarget = new THREE.Vector3();
  private walkSpeed = 1.25;
  private walkResolve: (() => void) | null = null;
  private talking = false;
  private talkAmt = 0;
  private phoneOn = false;
  private phoneAmt = 0;
  private blinkIn: number;
  private blinkT = 1;

  constructor(spec: CharacterSpec, opts: CharacterOptions = {}) {
    this.spec = { kind: spec.kind, seed: spec.seed };
    this.look = makeLook(spec);
    this.body = buildBody(this.look);
    this.triangles = this.body.triangles;
    this.rig = createRig(this.body.dims);
    this.restPos = this.rig.bones.map((b) => b.position.clone());
    this.heightAt = opts.heightAt;
    this.scale = this.look.height / D.canonicalHeight;
    const s = this.scale;
    const ph = ((spec.seed * 0.618034 + spec.kind.length * 0.37) % 1) * Math.PI * 2;
    this.time = ph * 3;
    this.blinkIn = 1 + (ph % 3);
    this.ctx = {
      walkPhase: ph,
      ph,
      seatDY: (opts.seatHeight ?? 0.58) / s + 0.085 - D.hipsY,
      benchY: (opts.benchHeight ?? 0.9) / s + 0.05,
    };
    this.mesh = new THREE.SkinnedMesh(this.body.geometry, characterMaterial());
    this.mesh.name = `character:${spec.kind}`;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.add(this.rig.bones[B.hips] as THREE.Bone);
    this.mesh.bind(this.rig.skeleton);
    this.inner.scale.setScalar(s);
    this.inner.add(this.mesh);
    this.root.add(this.inner);
    this.root.name = `character-root:${spec.kind}`;
    (this.rig.bones[B.phone] as THREE.Bone).scale.setScalar(0.0001);
    evalAction(this.current, this.time, this.ctx, this.to);
    this.pose.set(this.to);
    this.finishPose();
  }

  get action(): CharacterAction {
    return this.current;
  }

  setAction(a: CharacterAction): void {
    if (this.walking && a !== 'walk') this.endWalk();
    this.startAction(a);
  }

  private startAction(a: CharacterAction): void {
    if (a === this.current) return;
    this.from.set(this.pose);
    this.blend = 0;
    this.current = a;
  }

  walkTo(target: THREE.Vector3, speed = 1.25): Promise<void> {
    this.endWalk();
    return new Promise<void>((resolve) => {
      this.walkResolve = resolve;
      this.walkTarget.copy(target);
      this.walkSpeed = speed;
      this.walking = true;
      this.startAction('walk');
    });
  }

  private endWalk(): void {
    this.walking = false;
    const r = this.walkResolve;
    this.walkResolve = null;
    if (r) r();
  }

  faceTowards(target: THREE.Vector3): void {
    const dx = target.x - this.root.position.x;
    const dz = target.z - this.root.position.z;
    if (dx * dx + dz * dz < 1e-8) return;
    this.yawTarget = Math.atan2(dx, dz);
  }

  setTalking(on: boolean): void {
    this.talking = on;
  }

  setHeldPhone(color: string | null): void {
    this.phoneOn = color !== null;
    if (color !== null) {
      tmpColor.set(color);
      GeoBuilder.recolor(this.body.geometry, this.body.phoneFrom, this.body.phoneTo, tmpColor.getHex(THREE.SRGBColorSpace));
    }
  }

  update(dt: number): void {
    this.time += dt;
    const root = this.root;
    let pace = this.paceSpeed;
    if (this.walking) {
      const dx = this.walkTarget.x - root.position.x;
      const dz = this.walkTarget.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      const yawErr = dist > 1e-4 ? Math.abs(wrapPi(Math.atan2(dx, dz) - root.rotation.y)) : 0;
      const slow = Math.max(0.25, Math.cos(Math.min(yawErr, Math.PI / 2)));
      const step = this.walkSpeed * slow * dt;
      pace = this.walkSpeed * slow;
      if (dist <= step || dist < 0.01) {
        root.position.x = this.walkTarget.x;
        root.position.z = this.walkTarget.z;
        this.endWalk();
        this.startAction('idle');
      } else {
        root.position.x += (dx / dist) * step;
        root.position.z += (dz / dist) * step;
        this.yawTarget = Math.atan2(dx, dz);
      }
      if (this.heightAt) root.position.y = this.heightAt(root.position.x, root.position.z);
    }
    if (this.yawTarget !== null) {
      const diff = wrapPi(this.yawTarget - root.rotation.y);
      if (Math.abs(diff) < 0.002) {
        root.rotation.y = this.yawTarget;
        this.yawTarget = null;
      } else root.rotation.y += diff * (1 - Math.exp(-dt * 7));
    }
    if (this.current === 'walk') this.ctx.walkPhase += ((pace * dt) / (1.32 * this.scale)) * Math.PI * 2;

    evalAction(this.current, this.time, this.ctx, this.to);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / BLEND_TIME);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      const p = this.pose;
      const f = this.from;
      const t = this.to;
      for (let i = 0; i < POSE_SIZE; i++) p[i] = (f[i] as number) + ((t[i] as number) - (f[i] as number)) * k;
    } else this.pose.set(this.to);

    // battito di ciglia
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0;
      this.blinkIn = 2.2 + ((this.time * 7.13) % 3.2);
    }
    if (this.blinkT < 1) this.blinkT = Math.min(1, this.blinkT + dt / 0.14);
    this.talkAmt += ((this.talking ? 1 : 0) - this.talkAmt) * (1 - Math.exp(-dt * 10));
    this.phoneAmt += ((this.phoneOn ? 1 : 0) - this.phoneAmt) * (1 - Math.exp(-dt * 12));
    this.finishPose();
  }

  /** Sovrapposizioni (parlato, ciglia, postura, oggetti) e scrittura sulle ossa. */
  private finishPose(): void {
    const p = this.pose;
    const t = this.time;
    const L = this.look;
    if (this.blinkT < 1) p[P.eyeClose] = Math.max(p[P.eyeClose] as number, Math.sin(this.blinkT * Math.PI));
    if (this.talkAmt > 0.01) {
      const syl = Math.abs(Math.sin(t * 10.5 + Math.sin(t * 3.7) * 2.2)) * (0.55 + 0.45 * Math.sin(t * 2.3 + 1));
      p[P.jaw] = Math.max(p[P.jaw] as number, this.talkAmt * (0.25 + 0.75 * syl));
      p[P.hdRX] = (p[P.hdRX] as number) + this.talkAmt * 0.035 * Math.sin(t * 5.2);
    }
    if (L.stoop > 0) {
      p[P.spRX] = (p[P.spRX] as number) + L.stoop;
      p[P.chRX] = (p[P.chRX] as number) + L.stoop * 0.8;
      p[P.hdRX] = (p[P.hdRX] as number) - L.stoop * 1.3;
    }
    if (L.crate) {
      // il braccio sinistro regge sempre la cassa
      p[P.aL] = -this.body.dims.shX + 0.02;
      p[P.aL + 1] = -0.385 + (p[P.chRX] as number) * 0.2;
      p[P.aL + 2] = 0.33;
      p[P.pL] = 1;
      p[P.pL + 1] = -0.6;
      p[P.pL + 2] = -0.6;
      p[P.hL] = -0.4;
      p[P.hL + 1] = 1.2;
      p[P.hL + 2] = 0;
      p[P.chRY] = (p[P.chRY] as number) * 0.4;
    }
    (this.rig.bones[B.phone] as THREE.Bone).scale.setScalar(Math.max(0.0001, this.phoneAmt));
    applyPose(p, this.rig.bones, this.body.dims, this.restPos);
  }

  dispose(): void {
    this.endWalk();
    this.root.removeFromParent();
    this.body.geometry.dispose();
    this.rig.skeleton.dispose();
  }
}

export function createCharacter(spec: CharacterSpec, opts?: CharacterOptions): Character {
  return new CharacterImpl(spec, opts);
}
