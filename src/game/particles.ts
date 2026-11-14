/** Small pooled CPU particle system for tactile feedback (sparks, dust, smoke, sparkles, drops). */
import * as THREE from 'three';

export type ParticleKind = 'spark' | 'dust' | 'smoke' | 'sparkle' | 'heat' | 'drop' | 'coin' | 'confetti';

interface Spec {
  color: [number, number, number][];
  size: [number, number];
  life: [number, number];
  speed: [number, number];
  up: number;
  gravity: number;
  drag: number;
  spread: number;
}

const SPECS: Record<ParticleKind, Spec> = {
  spark: { color: [[1, 0.85, 0.35], [1, 0.6, 0.2], [1, 1, 0.8]], size: [1.5, 3], life: [0.18, 0.5], speed: [0.05, 0.25], up: 0.12, gravity: -0.9, drag: 1.5, spread: 1 },
  dust: { color: [[0.86, 0.78, 0.6], [0.93, 0.87, 0.72], [0.7, 0.62, 0.46]], size: [2, 5], life: [0.4, 0.9], speed: [0.01, 0.06], up: 0.04, gravity: -0.08, drag: 3, spread: 1 },
  smoke: { color: [[0.35, 0.35, 0.36], [0.5, 0.5, 0.52], [0.2, 0.2, 0.2]], size: [8, 20], life: [0.8, 1.8], speed: [0.01, 0.05], up: 0.09, gravity: 0.05, drag: 1.5, spread: 0.6 },
  sparkle: { color: [[1, 1, 1], [0.5, 1, 0.92], [1, 0.9, 0.5]], size: [2, 5], life: [0.4, 0.9], speed: [0.02, 0.09], up: 0.08, gravity: 0.02, drag: 2.5, spread: 1 },
  heat: { color: [[1, 0.55, 0.15], [1, 0.4, 0.1]], size: [3, 7], life: [0.3, 0.6], speed: [0.005, 0.02], up: 0.06, gravity: 0.06, drag: 2, spread: 0.5 },
  drop: { color: [[0.6, 0.85, 1], [0.8, 0.95, 1]], size: [1.5, 3], life: [0.25, 0.5], speed: [0.02, 0.08], up: 0.05, gravity: -0.8, drag: 1, spread: 0.8 },
  coin: { color: [[1, 0.82, 0.25], [1, 0.9, 0.5], [0.95, 0.7, 0.15]], size: [4, 8], life: [0.7, 1.3], speed: [0.2, 0.7], up: 1.2, gravity: -3.2, drag: 0.6, spread: 0.6 },
  confetti: { color: [[1, 0.44, 0.35], [0.1, 0.72, 0.69], [1, 0.76, 0.27], [0.97, 0.91, 0.78]], size: [4, 8], life: [1, 2], speed: [0.3, 1.2], up: 1.6, gravity: -2.4, drag: 1.2, spread: 1 },
};

const MAX = 384;

export class Particles {
  private geo = new THREE.BufferGeometry();
  private points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 4);
  private size = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private next = 0;
  private alive = 0;

  constructor(parent: THREE.Object3D) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float psize;
        attribute vec4 color;
        varying vec4 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = psize * (0.42 / max(0.05, -mv.z));
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.15, length(d)) * vColor.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.raycast = () => undefined;
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -1000;
    parent.add(this.points);
  }

  /** world-space burst; `scale` enlarges velocities and sizes for scene-sized effects (coins, confetti) */
  burst(at: THREE.Vector3, kind: ParticleKind, count: number, scale = 1): void {
    const spec = SPECS[kind];
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const sp = (spec.speed[0] + Math.random() * (spec.speed[1] - spec.speed[0])) * scale;
      this.pos[i * 3] = at.x + (Math.random() - 0.5) * 0.004 * scale;
      this.pos[i * 3 + 1] = at.y + Math.random() * 0.002 * scale;
      this.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.004 * scale;
      this.vel[i * 3] = Math.cos(a) * sp * spec.spread;
      this.vel[i * 3 + 1] = spec.up * scale * (0.5 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * sp * spec.spread;
      const c = spec.color[Math.floor(Math.random() * spec.color.length)] as [number, number, number];
      this.col[i * 4] = c[0];
      this.col[i * 4 + 1] = c[1];
      this.col[i * 4 + 2] = c[2];
      this.col[i * 4 + 3] = 1;
      const life = spec.life[0] + Math.random() * (spec.life[1] - spec.life[0]);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.grav[i] = spec.gravity * scale;
      this.drag[i] = spec.drag;
      this.baseSize[i] = (spec.size[0] + Math.random() * (spec.size[1] - spec.size[0])) * (scale > 1 ? scale * 0.5 : 1);
      this.size[i] = this.baseSize[i] as number;
    }
    this.alive = Math.max(this.alive, 1);
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      let life = this.life[i] as number;
      if (life <= 0) continue;
      life -= dt;
      this.life[i] = life;
      if (life <= 0) {
        this.pos[i * 3 + 1] = -1000;
        this.col[i * 4 + 3] = 0;
        continue;
      }
      alive++;
      const k = Math.exp(-(this.drag[i] as number) * dt);
      this.vel[i * 3] = (this.vel[i * 3] as number) * k;
      this.vel[i * 3 + 1] = (this.vel[i * 3 + 1] as number) * k + (this.grav[i] as number) * dt;
      this.vel[i * 3 + 2] = (this.vel[i * 3 + 2] as number) * k;
      this.pos[i * 3] = (this.pos[i * 3] as number) + (this.vel[i * 3] as number) * dt;
      this.pos[i * 3 + 1] = (this.pos[i * 3 + 1] as number) + (this.vel[i * 3 + 1] as number) * dt;
      this.pos[i * 3 + 2] = (this.pos[i * 3 + 2] as number) + (this.vel[i * 3 + 2] as number) * dt;
      const f = life / (this.maxLife[i] as number);
      this.col[i * 4 + 3] = Math.min(1, f * 2.2);
      this.size[i] = (this.baseSize[i] as number) * (0.6 + 0.4 * f);
    }
    this.alive = alive;
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
    this.geo.attributes.psize!.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
