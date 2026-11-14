/**
 * Stand-alone playground for the environment (dev only): /dev/world.html
 *   ?q=low|medium|high|ultra   quality preset          ?t=17.5   time of day
 *   ?cycle=1                   run the day/night cycle  ?hud=0    hide the stats overlay
 * Drag = look around, wheel = dolly, WASD = move. Everything is also scriptable through window.__world.
 */
import * as THREE from 'three';
import { Engine } from '../render/engine';
import { World } from '../render/world';
import type { QualityLevel } from '../core/settings';

interface DemoApi {
  ready: boolean;
  progress: number;
  setTime(h: number): void;
  setRain(x: number): void;
  setWind(x: number): void;
  setCam(pos: [number, number, number], target: [number, number, number]): void;
  setQuality(level: QualityLevel): void;
  setFocus(x: number, y: number, z: number, r: number): void;
  setSupplier(state: 'away' | 'arriving' | 'docked' | 'leaving'): void;
  setDof(enabled: boolean, focusDistance?: number, focusRange?: number, bokehScale?: number): void;
  setCycle(on: boolean): void;
  outline(channel: 'hover' | 'guide', on: boolean): void;
  benchmark(seconds?: number): Promise<QualityLevel>;
  maxBlockMs(): number;
  longTasks(): { ms: number; progress: number }[];
  slowFrames(): { ms: number; progress: number; ready: boolean }[];
  triangles(): Record<string, number>;
  engine: Engine;
  world: World;
}

interface DemoStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  quality: QualityLevel;
  time: number;
  initMs: number;
  maxInitBlockMs: number;
}

const params = new URLSearchParams(location.search);
const level = (params.get('q') ?? 'medium') as QualityLevel;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
if (params.get('hud') === '0') hud.style.display = 'none';

const engine = new Engine(canvas, level);
const world = new World(engine);
const env = { timeOfDay: Number(params.get('t') ?? 10), rain: 0, wind: 0.4 };
let cycle = params.get('cycle') === '1';

const target = new THREE.Vector3(0, 1, -1.5);
engine.camera.position.set(2.6, 2.3, 4.2);
engine.camera.lookAt(target);

// probe object to exercise the outline effect
const probe = new THREE.Mesh(
  new THREE.TorusKnotGeometry(0.22, 0.07, 96, 12),
  new THREE.MeshStandardMaterial({ color: 0xd8b070, roughness: 0.4, metalness: 0.1 }),
);
probe.position.set(0, 1.2, 0);
probe.castShadow = true;
probe.visible = false;
engine.scene.add(probe);

// long-task watchdog: the largest gap between two macrotasks during init
let maxBlock = 0;
let lastTick = performance.now();
let watching = true;
const longTasks: { ms: number; progress: number }[] = [];
const watchdog = (): void => {
  const now = performance.now();
  if (watching) {
    maxBlock = Math.max(maxBlock, now - lastTick);
    if (now - lastTick > 30) longTasks.push({ ms: Math.round(now - lastTick), progress: api.progress });
  }
  lastTick = now;
  if (watching) setTimeout(watchdog, 0);
};
setTimeout(watchdog, 0);

const api: DemoApi = {
  ready: false,
  progress: 0,
  setTime: (h) => {
    env.timeOfDay = h;
  },
  setRain: (x) => {
    env.rain = x;
  },
  setWind: (x) => {
    env.wind = x;
  },
  setCam: (pos, tgt) => {
    engine.camera.position.set(pos[0], pos[1], pos[2]);
    target.set(tgt[0], tgt[1], tgt[2]);
    engine.camera.lookAt(target);
  },
  setQuality: (l) => engine.setQuality(l),
  setFocus: (x, y, z, r) => world.setShadowFocus(new THREE.Vector3(x, y, z), r),
  setSupplier: (s) => world.setSupplierBoat(s),
  setDof: (enabled, focusDistance, focusRange, bokehScale) => engine.setDof({ enabled, focusDistance, focusRange, bokehScale }),
  setCycle: (on) => {
    cycle = on;
  },
  outline: (channel, on) => {
    probe.visible = true;
    engine.setOutline(channel, on ? [probe] : []);
  },
  benchmark: (seconds) => engine.benchmark(seconds),
  maxBlockMs: () => maxBlock,
  longTasks: () => longTasks,
  slowFrames: () => slowFrames,
  triangles: () => {
    const out: Record<string, number> = {};
    engine.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      const g = m.geometry;
      const n = g.index ? g.index.count : g.getAttribute('position').count;
      const inst = (m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1;
      const range = Number.isFinite(g.drawRange.count) ? Math.min(n, g.drawRange.count) : n;
      const key = m.name || m.material.constructor.name;
      out[key] = (out[key] ?? 0) + Math.round((range / 3) * inst);
    });
    return out;
  },
  engine,
  world,
};

const w = window as unknown as { __world: DemoApi; __stats: DemoStats };
w.__world = api;
w.__stats = { fps: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, quality: level, time: env.timeOfDay, initMs: 0, maxInitBlockMs: 0 };

// ---- minimal fly controls
const keys = new Set<string>();
let dragging = false;
let yaw = 0;
let pitch = 0;
const syncAngles = (): void => {
  const d = new THREE.Vector3().subVectors(target, engine.camera.position).normalize();
  yaw = Math.atan2(-d.x, -d.z);
  pitch = Math.asin(d.y);
};
syncAngles();
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  syncAngles();
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', () => {
  dragging = false;
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= e.movementX * 0.004;
  pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.004));
  const d = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  target.copy(engine.camera.position).add(d);
  engine.camera.lookAt(target);
});
canvas.addEventListener('wheel', (e) => {
  const d = new THREE.Vector3().subVectors(target, engine.camera.position).normalize();
  engine.camera.position.addScaledVector(d, -e.deltaY * 0.01);
  target.addScaledVector(d, -e.deltaY * 0.01);
});
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));

const slowFrames: { ms: number; progress: number; ready: boolean }[] = [];
const tmp = new THREE.Vector3();
const side = new THREE.Vector3();
let last = performance.now();
let hudTimer = 0;

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (cycle) env.timeOfDay = (env.timeOfDay + (dt * 24) / 120) % 24; // demo cycle: one day in two minutes

  if (keys.size > 0) {
    tmp.subVectors(target, engine.camera.position).normalize();
    side.crossVectors(tmp, engine.camera.up).normalize();
    const sp = (keys.has('ShiftLeft') ? 30 : 6) * dt;
    const move = new THREE.Vector3();
    if (keys.has('KeyW')) move.addScaledVector(tmp, sp);
    if (keys.has('KeyS')) move.addScaledVector(tmp, -sp);
    if (keys.has('KeyD')) move.addScaledVector(side, sp);
    if (keys.has('KeyA')) move.addScaledVector(side, -sp);
    if (keys.has('KeyE')) move.y += sp;
    if (keys.has('KeyQ')) move.y -= sp;
    engine.camera.position.add(move);
    target.add(move);
  }

  const r0 = performance.now();
  world.update(dt, env);
  engine.render(dt);
  const r1 = performance.now();
  if (r1 - r0 > 25) slowFrames.push({ ms: Math.round(r1 - r0), progress: api.progress, ready: api.ready });

  const s = engine.stats();
  const st = w.__stats;
  st.fps = Math.round(s.fps * 10) / 10;
  st.drawCalls = s.drawCalls;
  st.triangles = s.triangles;
  st.geometries = s.geometries;
  st.textures = s.textures;
  st.quality = engine.preset.level;
  st.time = Math.round(env.timeOfDay * 100) / 100;
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.25;
    hud.textContent = `${st.quality}  ${st.fps.toFixed(0)} fps  calls ${st.drawCalls}  tris ${(st.triangles / 1000).toFixed(0)}k\ntime ${st.time.toFixed(2)}  rain ${env.rain.toFixed(2)}  night ${world.nightFactor.toFixed(2)}  lamps ${world.lampsOn ? 'on' : 'off'}`;
  }
}

const t0 = performance.now();
requestAnimationFrame(frame);
world
  .init((p) => {
    api.progress = p;
  })
  .then(() => {
    watching = false;
    w.__stats.initMs = Math.round(performance.now() - t0);
    w.__stats.maxInitBlockMs = Math.round(maxBlock);
    api.ready = true;
  })
  .catch((err: unknown) => {
    console.error('world init failed', err);
  });
