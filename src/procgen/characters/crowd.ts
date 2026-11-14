/** Folla d'ambiente: turisti e gente del posto che passeggiano lungo percorsi (polilinee) sulla spiaggia. */
import * as THREE from 'three';
import { RNG } from '../../core/rng';
import { CharacterImpl } from './character';
import type { CharacterKind } from './look';

export interface CrowdEnv {
  /** ora di gioco [0, 24) */
  timeOfDay: number;
  /** intensità della pioggia 0..1 */
  rain: number;
}

export interface CrowdOptions {
  count: number;
  seed: number;
  paths: THREE.Vector3[][];
  heightAt?: (x: number, z: number) => number;
  /** direzione del mare (default -Z) verso cui si girano quando si fermano */
  seaDirection?: THREE.Vector3;
}

interface PathData {
  pts: THREE.Vector3[];
  cum: number[];
  length: number;
}

interface Walker {
  ch: CharacterImpl;
  state: 'hidden' | 'walk' | 'pause';
  leaving: boolean;
  path: number;
  dir: 1 | -1;
  s: number;
  lateral: number;
  speed: number;
  timer: number;
}

const KINDS: CharacterKind[] = ['tourist', 'tourist', 'tourist', 'backpacker', 'local', 'diver', 'tourist', 'local', 'backpacker', 'business'];
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function dayFactor(h: number): number {
  const ramp = (a: number, b: number, x: number): number => Math.min(1, Math.max(0, (x - a) / (b - a)));
  if (h < 5.5) return 0.08;
  if (h < 8.5) return 0.08 + 0.92 * ramp(5.5, 8.5, h);
  if (h < 18) return 1;
  if (h < 22) return 1 - 0.6 * ramp(18, 22, h);
  return 0.4 - 0.32 * ramp(22, 24, h);
}

export class AmbientCrowd {
  readonly root = new THREE.Group();
  private readonly walkers: Walker[] = [];
  private readonly paths: PathData[];
  private readonly rng: RNG;
  private readonly heightAt?: (x: number, z: number) => number;
  private readonly sea = new THREE.Vector3(0, 0, -1);
  private started = false;
  private spawnIn = 0;

  constructor(opts: CrowdOptions) {
    this.root.name = 'ambient-crowd';
    this.rng = new RNG(opts.seed ^ 0x7f4a7c15);
    this.heightAt = opts.heightAt;
    if (opts.seaDirection) this.sea.copy(opts.seaDirection).setY(0).normalize();
    this.paths = opts.paths
      .filter((p) => p.length >= 2)
      .map((pts) => {
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push((cum[i - 1] as number) + (pts[i] as THREE.Vector3).distanceTo(pts[i - 1] as THREE.Vector3));
        return { pts, cum, length: cum[cum.length - 1] as number };
      });
    const n = this.paths.length ? opts.count : 0;
    for (let i = 0; i < n; i++) {
      const kind = KINDS[(i + this.rng.int(0, 2)) % KINDS.length] as CharacterKind;
      const ch = new CharacterImpl({ kind, seed: opts.seed * 31 + i * 17 + 5 }, { heightAt: opts.heightAt });
      ch.root.visible = false;
      this.root.add(ch.root);
      this.walkers.push({ ch, state: 'hidden', leaving: false, path: 0, dir: 1, s: 0, lateral: 0, speed: 1.1, timer: 0 });
    }
  }

  /** Numero di passanti attualmente visibili. */
  get visibleCount(): number {
    let n = 0;
    for (const w of this.walkers) if (w.state !== 'hidden') n++;
    return n;
  }

  private place(w: Walker, snap: boolean): void {
    const p = this.paths[w.path] as PathData;
    const s = Math.min(p.length, Math.max(0, w.s));
    let i = 1;
    while (i < p.pts.length - 1 && (p.cum[i] as number) < s) i++;
    const a = p.pts[i - 1] as THREE.Vector3;
    const b = p.pts[i] as THREE.Vector3;
    const seg = (p.cum[i] as number) - (p.cum[i - 1] as number) || 1;
    const t = (s - (p.cum[i - 1] as number)) / seg;
    tmpA.copy(b).sub(a).setY(0).normalize();
    const root = w.ch.root;
    root.position.set(a.x + (b.x - a.x) * t - tmpA.z * w.lateral, 0, a.z + (b.z - a.z) * t + tmpA.x * w.lateral);
    root.position.y = this.heightAt ? this.heightAt(root.position.x, root.position.z) : a.y + (b.y - a.y) * t;
    if (snap) root.rotation.y = Math.atan2(tmpA.x * w.dir, tmpA.z * w.dir);
    else w.ch.faceTowards(tmpB.set(root.position.x + tmpA.x * w.dir, 0, root.position.z + tmpA.z * w.dir));
  }

  private spawn(w: Walker, anywhere: boolean): void {
    const r = this.rng;
    w.path = r.int(0, this.paths.length - 1);
    w.dir = r.chance(0.5) ? 1 : -1;
    const len = (this.paths[w.path] as PathData).length;
    w.s = anywhere ? r.range(0.05, 0.95) * len : w.dir === 1 ? 0 : len;
    w.lateral = r.range(-0.7, 0.7);
    w.speed = r.range(0.85, 1.35);
    w.leaving = false;
    w.state = 'walk';
    w.timer = r.range(6, 30);
    w.ch.root.visible = true;
    w.ch.setAction('walk');
    this.place(w, true);
  }

  update(dt: number, env: CrowdEnv): void {
    const total = this.walkers.length;
    if (total === 0) return;
    const rain = Math.min(1, Math.max(0, env.rain));
    const wanted = Math.round(total * dayFactor(((env.timeOfDay % 24) + 24) % 24) * (1 - 0.8 * rain));
    let active = 0;
    for (const w of this.walkers) if (w.state !== 'hidden' && !w.leaving) active++;
    if (!this.started) {
      this.started = true;
      for (const w of this.walkers) {
        if (active >= wanted) break;
        this.spawn(w, true);
        active++;
      }
    }
    // troppi: qualcuno se ne va (camminando fino al bordo del percorso)
    if (active > wanted) {
      let extra = active - wanted;
      for (const w of this.walkers) {
        if (extra <= 0) break;
        if (w.state !== 'hidden' && !w.leaving) {
          w.leaving = true;
          if (w.state === 'pause') {
            w.state = 'walk';
            w.ch.setAction('walk');
          }
          // esce dal lato più vicino
          const len = (this.paths[w.path] as PathData).length;
          w.dir = w.s > len / 2 ? 1 : -1;
          extra--;
        }
      }
    } else if (active < wanted) {
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        for (const w of this.walkers) {
          if (w.state === 'hidden') {
            this.spawn(w, false);
            break;
          }
        }
        this.spawnIn = this.rng.range(1.2, 4);
      }
    }
    const hurry = 1 + 0.55 * rain;
    for (const w of this.walkers) {
      if (w.state === 'hidden') continue;
      const ch = w.ch;
      if (w.state === 'walk') {
        const v = w.speed * (w.leaving ? hurry * 1.1 : hurry);
        ch.paceSpeed = v;
        w.s += w.dir * v * dt;
        const len = (this.paths[w.path] as PathData).length;
        if (w.s <= 0 || w.s >= len) {
          w.state = 'hidden';
          w.leaving = false;
          ch.root.visible = false;
          continue;
        }
        this.place(w, false);
        w.timer -= dt;
        if (w.timer <= 0 && !w.leaving && rain < 0.3) {
          w.state = 'pause';
          w.timer = this.rng.range(4, 10);
          ch.setAction(this.rng.chance(0.2) ? 'think' : 'idle');
          ch.faceTowards(tmpB.set(ch.root.position.x + this.sea.x * 10 + this.rng.range(-3, 3), 0, ch.root.position.z + this.sea.z * 10));
        }
      } else {
        w.timer -= dt;
        if (w.timer <= 0 || rain > 0.5) {
          w.state = 'walk';
          w.timer = this.rng.range(10, 40);
          ch.setAction('walk');
        }
      }
      ch.update(dt);
    }
  }

  dispose(): void {
    for (const w of this.walkers) w.ch.dispose();
    this.walkers.length = 0;
    this.root.removeFromParent();
  }
}
