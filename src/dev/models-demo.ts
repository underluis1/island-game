/**
 * Demo di sviluppo per personaggi e strumenti procedurali (solo dev, non fa parte del gioco).
 * API: window.__models = { show(what), setAction(a), setTalking(on), setPhone(color), setActive(on), setCam(pos, target) }
 *   show('characters' | 'crowd' | 'tools' | 'hand' | 'bench' | <CharacterKind> | <toolId> | '<toolId>:up')
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AmbientCrowd, Character, CharacterAction, CharacterKind } from '../procgen/characters';
import type { ToolModel } from '../procgen/tools';

interface ItemStat {
  id: string;
  calls: number;
  tris: number;
}
interface Stats {
  fps: number;
  calls: number;
  triangles: number;
  items: ItemStat[];
}
interface ModelsApi {
  show(what: string): Promise<void>;
  setAction(a: CharacterAction): void;
  setTalking(on: boolean): void;
  setPhone(color: string | null): void;
  setActive(on: boolean): void;
  setCam(pos: [number, number, number], target: [number, number, number]): void;
  setTime(t: number, rain?: number): void;
  /** tutti i personaggi camminano di (dx, dz); la promise si risolve all'arrivo */
  walkBy(dx: number, dz: number, speed?: number): Promise<number>;
  step(seconds: number): void;
}
declare global {
  interface Window {
    __models: ModelsApi;
    __stats: Stats;
  }
}

const NAMED: CharacterKind[] = ['somchai', 'noi', 'dive_instructor', 'italian_backpacker', 'chai', 'assistant', 'player'];
const GENERIC: CharacterKind[] = ['tourist', 'local', 'diver', 'backpacker', 'business'];
const ACTIONS: CharacterAction[] = ['idle', 'walk', 'talk', 'wave', 'give', 'happy', 'angry', 'sit', 'work', 'think'];

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe3e6');
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new RoomEnvironment();
scene.environment = pmrem.fromScene(envScene, 0.03).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 200);
const camTarget = new THREE.Vector3(0, 0.9, 0);
camera.position.set(0, 1.6, 6);

const hemi = new THREE.HemisphereLight('#dff3ff', '#c9b79a', 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);

function makeGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#a79f90';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(90,80,70,0.16)';
  g.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const p = Math.round((i / 10) * 256) + 0.5;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, 256);
    g.moveTo(0, p);
    g.lineTo(256, p);
    g.stroke();
  }
  g.strokeStyle = 'rgba(90,80,70,0.3)';
  g.strokeRect(0.5, 0.5, 255, 255);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const groundTex = makeGroundTexture();
const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.92, metalness: 0 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/** cell = metri per riquadro grande della griglia (ogni riquadro ha 10 sottodivisioni). */
function setGroundCell(cell: number): void {
  groundTex.repeat.set(60 / cell, 60 / cell);
}

function fitShadow(center: THREE.Vector3, radius: number): void {
  sun.target.position.copy(center);
  sun.position.copy(center).add(new THREE.Vector3(0.55, 1.0, 0.6).normalize().multiplyScalar(radius * 4 + 1));
  const cam = sun.shadow.camera;
  cam.left = -radius;
  cam.right = radius;
  cam.top = radius;
  cam.bottom = -radius;
  cam.near = 0.01;
  cam.far = radius * 8 + 2;
  cam.updateProjectionMatrix();
  sun.shadow.normalBias = radius * 0.004;
  sun.shadow.bias = -0.00015;
}

// ---------------------------------------------------------------- stato demo
const content = new THREE.Group();
scene.add(content);
let characters: Character[] = [];
let tools: { model: ToolModel; id: string }[] = [];
let crowd: AmbientCrowd | null = null;
let toolsActive = false;
let envTime = 12;
let envRain = 0;
let itemStats: ItemStat[] = [];

function clearContent(): void {
  for (const c of characters) c.dispose();
  for (const t of tools) t.model.dispose();
  crowd?.dispose();
  characters = [];
  tools = [];
  crowd = null;
  itemStats = [];
  content.clear();
}

function measure(id: string, root: THREE.Object3D): ItemStat {
  let calls = 0;
  let tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Line).isLine) return;
    const geo = m.geometry;
    const mats = Array.isArray(m.material) ? m.material.length : 1;
    calls += mats;
    if (m.isMesh) {
      const n = geo.index ? geo.index.count : geo.getAttribute('position').count;
      const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
      tris += (n / 3) * inst;
    }
  });
  return { id, calls, tris: Math.round(tris) };
}

function setCam(pos: [number, number, number], target: [number, number, number]): void {
  camera.position.set(pos[0], pos[1], pos[2]);
  camTarget.set(target[0], target[1], target[2]);
  camera.lookAt(camTarget);
  const d = camera.position.distanceTo(camTarget);
  camera.near = Math.max(0.002, d * 0.02);
  camera.far = Math.max(50, d * 40);
  camera.updateProjectionMatrix();
}

function frameBox(box: THREE.Box3, dir: THREE.Vector3, fill = 1.15): void {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(0.5 * size.length(), 0.01);
  const aspect = camera.aspect;
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const halfW = 0.5 * Math.hypot(size.x, size.z * 0.6);
  const halfH = 0.5 * Math.hypot(size.y, size.z * 0.7);
  const dist = Math.max(halfW / Math.tan(hFov / 2), halfH / Math.tan(vFov / 2)) * fill + size.z * 0.5;
  const p = center.clone().add(dir.clone().normalize().multiplyScalar(dist));
  setCam([p.x, p.y, p.z], [center.x, center.y, center.z]);
  fitShadow(center, radius * 1.1);
}

// ---------------------------------------------------------------- personaggi
async function showCharacters(): Promise<void> {
  const { createCharacter } = await import('../procgen/characters');
  setGroundCell(1);
  const list: { kind: CharacterKind; seed: number }[] = [];
  for (const k of NAMED) list.push({ kind: k, seed: 1 });
  for (let s = 0; s < 3; s++) for (const k of GENERIC) list.push({ kind: k, seed: 11 + s * 7 + GENERIC.indexOf(k) * 3 });
  const rows = [list.slice(0, 7), list.slice(7, 15), list.slice(15)];
  let n = 0;
  rows.forEach((row, r) => {
    row.forEach((spec, i) => {
      const ch = createCharacter(spec);
      const x = (i - (row.length - 1) / 2) * 0.95;
      ch.root.position.set(x, 0, -r * 1.5);
      ch.setAction(r === 0 ? 'idle' : (ACTIONS[(n * 3) % ACTIONS.length] as CharacterAction));
      content.add(ch.root);
      characters.push(ch);
      itemStats.push(measure(`${spec.kind}#${spec.seed}`, ch.root));
      n++;
    });
  });
  setCam([0, 2.5, 6.6], [0, 0.8, -1.2]);
  fitShadow(new THREE.Vector3(0, 0.8, -1.5), 5);
}

async function showCharacterKind(kind: CharacterKind): Promise<void> {
  const { createCharacter } = await import('../procgen/characters');
  setGroundCell(1);
  ACTIONS.forEach((a, i) => {
    const ch = createCharacter({ kind, seed: 1 });
    ch.root.position.set((i - (ACTIONS.length - 1) / 2) * 0.95, 0, 0);
    ch.setAction(a);
    if (a === 'talk') ch.setTalking(true);
    if (a === 'give') ch.setHeldPhone('#2a6fb0');
    content.add(ch.root);
    characters.push(ch);
    if (i === 0) itemStats.push(measure(`${kind}#1`, ch.root));
  });
  if (GENERIC.includes(kind)) {
    for (let i = 0; i < 10; i++) {
      const ch = createCharacter({ kind, seed: 100 + i * 13 });
      ch.root.position.set((i - 4.5) * 0.78, 0, -1.6);
      ch.root.rotation.y = (i - 4.5) * 0.12;
      content.add(ch.root);
      characters.push(ch);
      itemStats.push(measure(`${kind}#${100 + i * 13}`, ch.root));
    }
    setCam([0, 2.6, 9.4], [0, 0.8, -0.7]);
  } else {
    setCam([0, 1.9, 9.2], [0, 0.85, 0]);
  }
  fitShadow(new THREE.Vector3(0, 0.8, -0.8), 5.5);
}

async function showCrowd(): Promise<void> {
  const { AmbientCrowd: Crowd } = await import('../procgen/characters');
  setGroundCell(1);
  const paths: THREE.Vector3[][] = [
    [new THREE.Vector3(-9, 0, -1.5), new THREE.Vector3(-3, 0, -2.2), new THREE.Vector3(3, 0, -1.4), new THREE.Vector3(9, 0, -2)],
    [new THREE.Vector3(9, 0, 0.6), new THREE.Vector3(2, 0, 0.1), new THREE.Vector3(-4, 0, 0.8), new THREE.Vector3(-9, 0, 0.2)],
  ];
  crowd = new Crowd({ count: 10, seed: 7, paths });
  content.add(crowd.root);
  itemStats.push(measure('crowd', crowd.root));
  setCam([0, 4.2, 11], [0, 0.6, -0.8]);
  fitShadow(new THREE.Vector3(0, 0.8, -0.8), 9);
}

// ---------------------------------------------------------------- strumenti
function restOnGround(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box.min.y;
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

async function showTools(filter: 'all' | 'hand' | 'bench' | string, upright: boolean): Promise<void> {
  const mod = await import('../procgen/tools');
  const entries: { id: string; tier: number; bench: boolean }[] = [];
  for (const id of mod.TOOL_MODEL_IDS) {
    for (const tier of mod.toolTiers(id)) entries.push({ id, tier, bench: mod.isBenchTool(id, tier) });
  }
  const single = filter !== 'all' && filter !== 'hand' && filter !== 'bench';
  const chosen = entries.filter((e) => (single ? e.id === filter : filter === 'all' || (filter === 'bench') === e.bench));
  const hand = chosen.filter((e) => !e.bench);
  const bench = chosen.filter((e) => e.bench);
  setGroundCell(single ? 0.1 : 0.5);
  const total = new THREE.Box3();

  const place = (e: { id: string; tier: number; bench: boolean }, x: number, z: number): void => {
    const model = mod.buildTool(e.id, e.tier);
    const holder = new THREE.Group();
    holder.add(model.root);
    if (!e.bench) {
      if (upright) {
        holder.rotation.set(0.25, 0, -0.3);
      } else {
        holder.rotation.set(-Math.PI / 2, 0, 0);
        holder.rotation.order = 'YXZ';
        holder.rotation.y = -0.45;
      }
    } else {
      holder.rotation.y = -0.35;
    }
    holder.position.set(x, 0, z);
    content.add(holder);
    const box = restOnGround(holder);
    if (!e.bench && upright) holder.position.y += 0.03;
    total.union(box);
    model.root.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    tools.push({ model, id: `${e.id}:t${e.tier}` });
    itemStats.push(measure(`${e.id}:t${e.tier}`, model.root));
  };

  if (single) {
    const step = bench.length ? 0.36 : 0.075;
    chosen.forEach((e, i) => place(e, (i - (chosen.length - 1) / 2) * step, 0));
    const dir = bench.length ? new THREE.Vector3(0.25, 0.55, 1) : upright ? new THREE.Vector3(0.1, 0.25, 1) : new THREE.Vector3(0.05, 1.1, 0.75);
    frameBox(total, dir, 1.05);
    return;
  }
  const perRow = 12;
  hand.forEach((e, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const count = Math.min(perRow, hand.length - row * perRow);
    place(e, (col - (count - 1) / 2) * 0.13, 0.32 + row * 0.3);
  });
  bench.forEach((e, i) => place(e, (i - (bench.length - 1) / 2) * 0.4, -0.25));
  frameBox(total, new THREE.Vector3(0, 0.95, 1), 1.0);
  if (filter === 'all') setCam([0, 1.55, 1.75], [0, 0, 0.12]);
}

// ---------------------------------------------------------------- API
async function show(what: string): Promise<void> {
  clearContent();
  const [name, flag] = what.split(':') as [string, string | undefined];
  if (name === 'characters') await showCharacters();
  else if (name === 'crowd') await showCrowd();
  else if (name === 'tools') await showTools('all', flag === 'up');
  else if (name === 'hand' || name === 'bench') await showTools(name, flag === 'up');
  else if ((NAMED as string[]).includes(name) || (GENERIC as string[]).includes(name)) await showCharacterKind(name as CharacterKind);
  else await showTools(name, flag === 'up');
}

function step(seconds: number): void {
  const dt = 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) tick(dt);
}

function tick(dt: number): void {
  for (const c of characters) c.update(dt);
  for (const t of tools) t.model.update?.(dt, toolsActive);
  crowd?.update(dt, { timeOfDay: envTime, rain: envRain });
}

window.__stats = { fps: 0, calls: 0, triangles: 0, items: [] };
window.__models = {
  show,
  setAction(a) {
    for (const c of characters) c.setAction(a);
  },
  setTalking(on) {
    for (const c of characters) c.setTalking(on);
  },
  setPhone(color) {
    for (const c of characters) c.setHeldPhone(color);
  },
  setActive(on) {
    toolsActive = on;
  },
  setCam,
  async walkBy(dx, dz, speed) {
    await Promise.all(characters.map((c) => c.walkTo(c.root.position.clone().add(new THREE.Vector3(dx, 0, dz)), speed)));
    return characters.length;
  },
  setTime(t, rain = 0) {
    envTime = t;
    envRain = rain;
  },
  step,
};

// ---------------------------------------------------------------- UI minima + orbit
const bar = document.getElementById('bar') as HTMLDivElement;
const info = document.getElementById('info') as HTMLDivElement;
if (navigator.webdriver) {
  bar.style.display = 'none';
  info.style.display = 'none';
}
function addButton(label: string, fn: () => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', fn);
  bar.appendChild(b);
}
for (const v of ['characters', 'crowd', 'tools', 'hand', 'bench', ...NAMED, ...GENERIC]) addButton(v, () => void show(v));
for (const a of ACTIONS) addButton(`▶ ${a}`, () => window.__models.setAction(a));
addButton('tool on/off', () => {
  toolsActive = !toolsActive;
});
void import('../procgen/tools').then((m) => {
  for (const id of m.TOOL_MODEL_IDS) addButton(id, () => void show(id));
});

let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener('pointerup', () => {
  dragging = false;
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const off = camera.position.clone().sub(camTarget);
  const sph = new THREE.Spherical().setFromVector3(off);
  sph.theta -= (e.clientX - lastX) * 0.006;
  sph.phi = Math.min(Math.PI - 0.05, Math.max(0.05, sph.phi - (e.clientY - lastY) * 0.006));
  lastX = e.clientX;
  lastY = e.clientY;
  camera.position.copy(camTarget).add(off.setFromSpherical(sph));
  camera.lookAt(camTarget);
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const off = camera.position.clone().sub(camTarget).multiplyScalar(Math.exp(e.deltaY * 0.001));
    const p = camTarget.clone().add(off);
    setCam([p.x, p.y, p.z], [camTarget.x, camTarget.y, camTarget.z]);
  },
  { passive: false },
);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let fpsAcc = 0;
let fpsN = 0;
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  renderer.render(scene, camera);
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 0.5) {
    window.__stats.fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0;
    fpsN = 0;
  }
  window.__stats.calls = renderer.info.render.calls;
  window.__stats.triangles = renderer.info.render.triangles;
  window.__stats.items = itemStats;
  info.textContent = `fps ${window.__stats.fps}\ncalls ${window.__stats.calls}\ntris ${window.__stats.triangles}`;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

const initial = new URLSearchParams(location.search).get('show') ?? 'characters';
void show(initial);
