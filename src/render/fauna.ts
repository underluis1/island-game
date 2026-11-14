import * as THREE from 'three';
import { RNG } from '../core/rng';
import { buildCrabGeometry, buildGullGeometry } from '../procgen/nature/fauna-geo';
import { SEA_LEVEL, insidePad, shorelineZ, terrainHeight } from './layout';
import type { SharedUniforms } from './shared';

const GULLS = 12;
const CRABS = 10;

/** Seagulls: a small boid flock wheeling over the bay; wings flap in the vertex shader. */
export class Gulls {
  readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly pos = new Float32Array(GULLS * 3);
  private readonly vel = new Float32Array(GULLS * 3);
  private readonly wander = new Float32Array(GULLS);
  private readonly bank = new Float32Array(GULLS);
  private readonly m = new THREE.Matrix4();

  constructor(shared: SharedUniforms) {
    this.geometry = buildGullGeometry();
    const phases = new Float32Array(GULLS);
    const rng = new RNG(606);
    for (let i = 0; i < GULLS; i++) {
      phases[i] = rng.next();
      this.pos[i * 3] = rng.range(-50, 30);
      this.pos[i * 3 + 1] = rng.range(9, 20);
      this.pos[i * 3 + 2] = rng.range(-70, -22);
      const a = rng.range(0, Math.PI * 2);
      this.vel[i * 3] = Math.cos(a) * 7;
      this.vel[i * 3 + 2] = Math.sin(a) * 7;
      this.wander[i] = rng.range(0, 100);
    }
    this.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    this.material = new THREE.MeshLambertMaterial({ name: 'Gull', vertexColors: true, side: THREE.DoubleSide });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          {
            float w = uv.x;
            float glide = smoothstep(-0.35, 0.45, sin(uTime * 0.23 + aPhase * 23.0));
            float ang = (sin(uTime * 8.0 + aPhase * 6.283) * 0.62 * glide + 0.14) * w;
            float span = abs(transformed.z);
            transformed.y += span * sin(ang);
            transformed.z *= mix(1.0, cos(ang), step(0.001, w));
          }`,
        );
    };
    this.material.customProgramCacheKey = () => 'gull';
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, GULLS);
    this.mesh.name = 'gulls';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.update(0.016, 0, 0);
  }

  update(dt: number, time: number, rain: number): void {
    const p = this.pos;
    const v = this.vel;
    const step = Math.min(dt, 0.05);
    const cx = -8;
    const cy = 14 - rain * 4;
    const cz = -44;
    for (let i = 0; i < GULLS; i++) {
      const ix = i * 3;
      let ax = 0;
      let ay = 0;
      let az = 0;
      // flock: separation + mild cohesion / alignment
      let nx = 0;
      let ny = 0;
      let nz = 0;
      let nvx = 0;
      let nvz = 0;
      let n = 0;
      for (let j = 0; j < GULLS; j++) {
        if (j === i) continue;
        const jx = j * 3;
        const dx = (p[jx] as number) - (p[ix] as number);
        const dy = (p[jx + 1] as number) - (p[ix + 1] as number);
        const dz = (p[jx + 2] as number) - (p[ix + 2] as number);
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 25 && d2 > 1e-4) {
          const k = 3.2 / d2;
          ax -= dx * k;
          ay -= dy * k;
          az -= dz * k;
        }
        if (d2 < 900) {
          nx += dx;
          ny += dy;
          nz += dz;
          nvx += v[jx] as number;
          nvz += v[jx + 2] as number;
          n++;
        }
      }
      if (n > 0) {
        ax += (nx / n) * 0.03 + ((nvx / n - (v[ix] as number)) * 0.05);
        ay += (ny / n) * 0.02;
        az += (nz / n) * 0.03 + ((nvz / n - (v[ix + 2] as number)) * 0.05);
      }
      // stay over the bay
      const ox = ((p[ix] as number) - cx) / 60;
      const oz = ((p[ix + 2] as number) - cz) / 34;
      const out = ox * ox + oz * oz;
      if (out > 1) {
        ax -= ox * (out - 1) * 2.2;
        az -= oz * (out - 1) * 2.2;
      }
      ay += (cy + 4 * Math.sin(time * 0.13 + i * 1.7) - (p[ix + 1] as number)) * 0.25;
      // lazy wandering turn
      const wa = Math.sin(time * 0.31 + (this.wander[i] as number)) + 0.5 * Math.sin(time * 0.77 + i * 2.3);
      ax += -(v[ix + 2] as number) * wa * 0.085;
      az += (v[ix] as number) * wa * 0.085;

      v[ix] = (v[ix] as number) + ax * step;
      v[ix + 1] = ((v[ix + 1] as number) + ay * step) * (1 - 0.8 * step);
      v[ix + 2] = (v[ix + 2] as number) + az * step;
      const sp = Math.hypot(v[ix] as number, v[ix + 2] as number) || 1;
      const target = 7.2 + 1.4 * Math.sin(i * 1.3);
      const k = 1 + ((target - sp) / sp) * Math.min(1, step * 2);
      v[ix] = (v[ix] as number) * k;
      v[ix + 2] = (v[ix + 2] as number) * k;
      p[ix] = (p[ix] as number) + (v[ix] as number) * step;
      p[ix + 1] = (p[ix + 1] as number) + (v[ix + 1] as number) * step;
      p[ix + 2] = (p[ix + 2] as number) + (v[ix + 2] as number) * step;

      // orientation: +X along velocity, banking into turns
      const fx = (v[ix] as number) / sp;
      const fz = (v[ix + 2] as number) / sp;
      const lateral = -ax * fz + az * fx;
      const bankTarget = Math.max(-0.7, Math.min(0.7, lateral * 0.16));
      this.bank[i] = (this.bank[i] as number) + (bankTarget - (this.bank[i] as number)) * Math.min(1, step * 3);
      const cb = Math.cos(this.bank[i] as number);
      const sb = Math.sin(this.bank[i] as number);
      const climb = Math.max(-0.3, Math.min(0.3, (v[ix + 1] as number) / sp));
      // right = forward × up; local Z = right rotated by the bank around forward
      const rx = -fz;
      const rz = fx;
      const e = this.m.elements;
      const s = 1.25;
      e[0] = fx * s;
      e[1] = climb * s;
      e[2] = fz * s;
      e[3] = 0;
      e[4] = -rx * sb * s;
      e[5] = cb * s;
      e[6] = -rz * sb * s;
      e[7] = 0;
      e[8] = rx * cb * s;
      e[9] = sb * s;
      e[10] = rz * cb * s;
      e[11] = 0;
      e[12] = p[ix] as number;
      e[13] = p[ix + 1] as number;
      e[14] = p[ix + 2] as number;
      e[15] = 1;
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

/** Beach crabs scuttling sideways in short bursts on the damp sand. */
export class Crabs {
  readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly x = new Float32Array(CRABS);
  private readonly z = new Float32Array(CRABS);
  private readonly heading = new Float32Array(CRABS);
  private readonly timer = new Float32Array(CRABS);
  private readonly dir = new Float32Array(CRABS);
  private readonly moving = new Uint8Array(CRABS);
  private readonly scale = new Float32Array(CRABS);
  private readonly rng = new RNG(1701);
  private readonly dummy = new THREE.Object3D();

  constructor() {
    this.geometry = buildCrabGeometry();
    this.material = new THREE.MeshStandardMaterial({ name: 'Crab', vertexColors: true, roughness: 0.55, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, CRABS);
    this.mesh.name = 'crabs';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const rng = this.rng;
    for (let i = 0; i < CRABS; i++) {
      let x = 0;
      let z = 0;
      for (let k = 0; k < 20; k++) {
        x = rng.range(-26, 24);
        z = shorelineZ(x) + rng.range(1.2, 5.5);
        if (!insidePad(x, z, 1.5)) break;
      }
      this.x[i] = x;
      this.z[i] = z;
      this.heading[i] = rng.range(0, Math.PI * 2);
      this.timer[i] = rng.range(0.3, 4);
      this.dir[i] = rng.chance(0.5) ? 1 : -1;
      this.scale[i] = rng.range(1.1, 1.7);
      this.write(i, 0);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private write(i: number, bob: number): void {
    const d = this.dummy;
    const x = this.x[i] as number;
    const z = this.z[i] as number;
    d.position.set(x, terrainHeight(x, z) + bob, z);
    d.rotation.set(0, this.heading[i] as number, 0);
    d.scale.setScalar(this.scale[i] as number);
    d.updateMatrix();
    this.mesh.setMatrixAt(i, d.matrix);
  }

  update(dt: number, time: number): void {
    const rng = this.rng;
    let dirty = false;
    for (let i = 0; i < CRABS; i++) {
      this.timer[i] = (this.timer[i] as number) - dt;
      if (this.moving[i] === 1) {
        // sideways: along the local Z axis
        const h = this.heading[i] as number;
        const sx = Math.sin(h) * (this.dir[i] as number);
        const sz = Math.cos(h) * (this.dir[i] as number);
        const nx = (this.x[i] as number) + sx * 0.55 * dt;
        const nz = (this.z[i] as number) + sz * 0.55 * dt;
        const shore = shorelineZ(nx);
        const blocked = insidePad(nx, nz, 1.2) || nz < shore + 0.5 || nz > shore + 7 || nx < -30 || nx > 28 || terrainHeight(nx, nz) < SEA_LEVEL + 0.07;
        if (blocked) {
          this.dir[i] = -(this.dir[i] as number);
          this.timer[i] = Math.min(this.timer[i] as number, 0.25);
        } else {
          this.x[i] = nx;
          this.z[i] = nz;
        }
        this.write(i, 0.004 * Math.abs(Math.sin(time * 38 + i)));
        dirty = true;
        if ((this.timer[i] as number) <= 0) {
          this.moving[i] = 0;
          this.timer[i] = rng.range(0.5, 4.5);
          this.write(i, 0);
        }
      } else if ((this.timer[i] as number) <= 0) {
        this.moving[i] = 1;
        this.timer[i] = rng.range(0.25, 1.3);
        if (rng.chance(0.4)) this.heading[i] = (this.heading[i] as number) + rng.range(-1.2, 1.2);
        if (rng.chance(0.5)) this.dir[i] = -(this.dir[i] as number);
      }
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
