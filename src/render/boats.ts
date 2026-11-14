import * as THREE from 'three';
import { buildLongtail } from '../procgen/nature/longtail';
import { sampleWaves } from './water';
import type { WaveSample } from './water';

export type SupplierBoatState = 'away' | 'arriving' | 'docked' | 'leaving';

interface Floating {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  heading: number;
  phase: number;
}

interface Passing extends Floating {
  speed: number;
  dir: number;
}

const ARRIVE_TIME = 17;
const LEAVE_TIME = 15;
const DOCK = new THREE.Vector3(9.0, 0, -19.3);
const DOCK_HEADING = -Math.PI / 2 + 0.06; // bow towards the beach (+Z)
const AWAY = new THREE.Vector3(96, 0, -132);

const _wave: WaveSample = { y: 0, slopeX: 0, slopeZ: 0 };
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();

/** rotation.y that points the local +X axis (bow) along (dx, dz) */
function headingOf(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

function angleLerp(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Long-tail boats: moored ones bobbing in the bay, slow traffic on the horizon and the supplier's boat. */
export class Boats {
  readonly group = new THREE.Group();
  private readonly material: THREE.MeshStandardMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly anchored: Floating[] = [];
  private readonly passing: Passing[] = [];
  private readonly supplier: Floating;
  private supplierState: SupplierBoatState = 'away';
  private supplierT = 1;
  private readonly arriveCurve: THREE.CatmullRomCurve3;
  private readonly leaveCurve: THREE.CatmullRomCurve3;

  constructor() {
    this.group.name = 'boats';
    this.material = new THREE.MeshStandardMaterial({ name: 'Longtail', vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });

    const make = (seed: number, scheme: number, canopy: boolean): THREE.Mesh => {
      const g = buildLongtail({ seed, scheme, canopy });
      this.geometries.push(g);
      const m = new THREE.Mesh(g, this.material);
      m.rotation.order = 'YZX';
      m.castShadow = false;
      m.receiveShadow = false;
      this.group.add(m);
      return m;
    };

    const moor: readonly [number, number, number, number, boolean][] = [
      [-7.5, -29, -1.25, 0, true],
      [-21, -25.5, -1.9, 1, false],
      [17.5, -33, -1.05, 2, true],
      [-36, -39, -2.3, 3, false],
    ];
    moor.forEach(([x, z, heading, scheme, canopy], i) => {
      this.anchored.push({ mesh: make(300 + i, scheme, canopy), x, z, heading, phase: i * 1.9 });
    });

    this.passing.push({ mesh: make(401, 4, true), x: -260, z: -158, heading: 0, phase: 0.4, speed: 3.4, dir: 1 });
    this.passing.push({ mesh: make(402, 1, false), x: 190, z: -212, heading: Math.PI, phase: 2.2, speed: 2.7, dir: -1 });

    this.supplier = { mesh: make(500, 2, true), x: AWAY.x, z: AWAY.z, heading: 0, phase: 1.1 };
    this.supplier.mesh.name = 'supplier-boat';
    this.supplier.mesh.castShadow = true;
    this.supplier.mesh.visible = false;

    this.arriveCurve = new THREE.CatmullRomCurve3(
      [AWAY.clone(), new THREE.Vector3(54, 0, -84), new THREE.Vector3(22, 0, -46), new THREE.Vector3(10.4, 0, -30), DOCK.clone()],
      false,
      'centripetal',
    );
    this.leaveCurve = new THREE.CatmullRomCurve3(
      [new THREE.Vector3(9.6, 0, -31), new THREE.Vector3(20, 0, -44), new THREE.Vector3(52, 0, -66), AWAY.clone()],
      false,
      'centripetal',
    );
  }

  get supplierBoatState(): SupplierBoatState {
    return this.supplierState;
  }

  setSupplier(state: SupplierBoatState): void {
    if (state === this.supplierState) return;
    const prev = this.supplierState;
    this.supplierState = state;
    if (state === 'arriving') this.supplierT = prev === 'docked' ? 1 : 0;
    else if (state === 'leaving') this.supplierT = prev === 'away' ? 1 : 0;
    else this.supplierT = 1;
  }

  private float(b: Floating, time: number, waveAmp: number, extraPitch: number): void {
    sampleWaves(b.x, b.z, time, waveAmp, _wave);
    const m = b.mesh;
    const fx = Math.cos(b.heading);
    const fz = -Math.sin(b.heading);
    const slopeF = _wave.slopeX * fx + _wave.slopeZ * fz;
    const slopeS = -_wave.slopeX * fz + _wave.slopeZ * fx;
    m.position.set(b.x, _wave.y + 0.02 * Math.sin(time * 1.3 + b.phase), b.z);
    m.rotation.y = b.heading;
    m.rotation.z = Math.atan(slopeF) * 0.75 + extraPitch + 0.012 * Math.sin(time * 0.9 + b.phase * 2);
    m.rotation.x = -Math.atan(slopeS) * 0.75 + 0.035 * Math.sin(time * 0.7 + b.phase);
  }

  update(dt: number, time: number, waveAmp: number): void {
    for (let i = 0; i < this.anchored.length; i++) {
      const b = this.anchored[i] as Floating;
      const swing = 0.07 * Math.sin(time * 0.11 + b.phase);
      const h = b.heading;
      b.heading = h + swing;
      this.float(b, time, waveAmp, 0);
      b.heading = h;
    }
    for (let i = 0; i < this.passing.length; i++) {
      const b = this.passing[i] as Passing;
      b.x += b.speed * b.dir * dt;
      if (b.x > 460) b.x = -460;
      if (b.x < -460) b.x = 460;
      this.float(b, time, waveAmp, 0.035);
    }

    // supplier
    const s = this.supplier;
    const state = this.supplierState;
    if (state === 'away') {
      s.mesh.visible = false;
      return;
    }
    s.mesh.visible = true;
    if (state === 'docked') {
      s.x = DOCK.x;
      s.z = DOCK.z;
      s.heading = DOCK_HEADING;
      this.float(s, time, waveAmp, 0.045);
      return;
    }
    if (state === 'arriving') {
      this.supplierT = Math.min(1, this.supplierT + dt / ARRIVE_TIME);
      // fast at sea, gliding in to the beach
      const u = 1 - Math.pow(1 - this.supplierT, 2.2);
      this.arriveCurve.getPoint(u, _p);
      this.arriveCurve.getTangent(Math.min(u, 0.995), _t);
      s.x = _p.x;
      s.z = _p.z;
      s.heading = angleLerp(headingOf(_t.x, _t.z), DOCK_HEADING, Math.pow(u, 6));
      this.float(s, time, waveAmp, 0.05 * (1 - u) + 0.03 * u);
      if (this.supplierT >= 1) this.supplierState = 'docked';
      return;
    }
    // leaving: back off the sand in reverse, then swing round and head out
    this.supplierT = Math.min(1, this.supplierT + dt / LEAVE_TIME);
    const t = this.supplierT;
    const backPhase = 0.3;
    if (t < backPhase) {
      const k = t / backPhase;
      const e = k * k * (3 - 2 * k);
      s.x = DOCK.x + (9.6 - DOCK.x) * e;
      s.z = DOCK.z + (-31 - DOCK.z) * e;
      s.heading = DOCK_HEADING;
      this.float(s, time, waveAmp, 0.02);
    } else {
      const k = (t - backPhase) / (1 - backPhase);
      const u = k * k;
      this.leaveCurve.getPoint(u, _p);
      this.leaveCurve.getTangent(Math.max(u, 0.005), _t);
      s.x = _p.x;
      s.z = _p.z;
      s.heading = angleLerp(DOCK_HEADING, headingOf(_t.x, _t.z), Math.min(1, k * 5));
      this.float(s, time, waveAmp, 0.05);
    }
    if (this.supplierT >= 1) {
      this.supplierState = 'away';
      s.mesh.visible = false;
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
