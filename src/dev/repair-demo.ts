/** Dev-only harness for the repair view (not part of the game bundle). */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RNG } from '../core/rng';
import { Tweens } from '../core/tween';
import { PHONE_DEFS } from '../data/phones';
import { Bench } from '../game/bench';
import { HAND_TOOLS, RepairView, type GaugeData, type RepairHost, type ToolId } from '../game/repair-view';
import { generateFaultyPhone } from '../gameplay/repair/faults';
import { autoStep } from '../gameplay/repair/hint';
import { createPhone } from '../gameplay/repair/model';
import { emptyGoal, type RepairGoal } from '../gameplay/repair/types';
import type { PickKind } from '../procgen/phones/phone';
import { buildTool } from '../procgen/tools';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const logEl = document.getElementById('log') as HTMLElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fc7d6');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 50);
const sun = new THREE.DirectionalLight('#fff2dd', 2.4);
sun.position.set(0.4, 1.9, 0.5);
sun.target.position.set(0, 0.9, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -0.45, right: 0.45, top: 0.45, bottom: -0.45, near: 0.1, far: 4 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.0006;
scene.add(sun, sun.target, new THREE.HemisphereLight('#bfe6ff', '#8a7358', 0.6));
const table = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.04, 0.84), new THREE.MeshStandardMaterial({ color: '#9a6b45', roughness: 0.8 }));
table.position.y = 0.88;
table.receiveShadow = true;
scene.add(table);

const tweens = new Tweens();
const bench = new Bench(1);
scene.add(bench.root);
const messages: string[] = [];
const events: string[] = [];
let gauge: GaugeData | null = null;
let hintText = '';
const host: RepairHost = {
  sfx: (n) => events.push(`sfx:${n}`),
  loop: () => undefined,
  message: (kind, key) => {
    messages.push(`${kind}:${key}`);
    if (messages.length > 6) messages.shift();
  },
  outline: () => undefined,
  tooltip: () => undefined,
  gauge: (g) => (gauge = g),
  hint: (h) => (hintText = h ? `${h.textKey} → ${h.target.id} [${h.tool ?? 'hand'}${h.bit ? ' ' + h.bit : ''}]` : ''),
  choosePart: async () => 'good',
  tool: (id, tier) => {
    const t = buildTool(id, Math.max(1, tier));
    return { root: t.root, update: t.update ? (dt, a) => t.update!(dt, a) : undefined };
  },
  solder: () => undefined,
  onRepairEvent: (ev) => events.push(ev.type),
  onStateChanged: () => undefined,
  setFocus: () => undefined,
  breeze: () => 1,
  reduceMotion: () => false,
};
const view = new RepairView(scene, camera, canvas, tweens, bench, host);

function start(modelId: string, faults: string[], goal?: Partial<RepairGoal>, tools?: Record<string, number>): void {
  if (view.active) view.close()?.dispose();
  const def = PHONE_DEFS[modelId]!;
  let phone = createPhone(def, 'demo');
  let g: RepairGoal = { ...emptyGoal(), teardown: true };
  if (faults.length) {
    const r = generateFaultyPhone(def, faults, new RNG(7), 'demo');
    phone = r.phone;
    g = r.goal;
  }
  if (goal) g = { ...emptyGoal(), ...goal };
  view.open({
    def,
    phone,
    goal: g,
    ctx: {
      tools: tools ?? { driver: 1, spudger: 1, pick: 1, suction: 1, tweezers: 1, heat: 1, brush: 1, toothpick: 1, ipa: 1, card: 1, adhesive: 1, flashlight: 1, multimeter: 1, extractor: 1, air: 1, programmer: 1 },
      errorMult: 1,
      strict: false,
      matCells: 15,
    },
    rng: new RNG(3),
  });
}
start('fone8', []);

canvas.addEventListener('pointermove', (e) => view.onPointerMove(e));
canvas.addEventListener('pointerdown', (e) => view.onPointerDown(e));
window.addEventListener('pointerup', (e) => view.onPointerUp(e));
canvas.addEventListener('wheel', (e) => view.onWheel(e), { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  view.onKey(e.code, true);
  const n = Number(e.key);
  if (n >= 1 && n <= 9) view.selectTool(HAND_TOOLS[n - 1] as ToolId);
  if (e.key === '0' || e.key === '`') view.selectTool(null);
  if (e.code === 'KeyF') view.focus();
  if (e.code === 'KeyV') view.flip();
  if (e.code === 'KeyP') view.togglePower();
  if (e.code === 'KeyB') view.cycleBit(1);
  if (e.code === 'KeyG') view.setGuide(!view.guide);
  if (e.code === 'KeyT') {
    const order: ToolId[] = ['toothpick', 'card', 'adhesive', 'extractor', 'flashlight', 'multimeter', 'programmer', 'air'];
    view.selectTool(order[(order.indexOf(view.tool as ToolId) + 1) % order.length] as ToolId);
  }
});
window.addEventListener('keyup', (e) => view.onKey(e.code, false));

const pose = { position: new THREE.Vector3(), target: new THREE.Vector3() };
Object.assign(window, {
  __repair: {
    view,
    start,
    tool: (id: ToolId | null) => view.selectTool(id),
    bit: (b: 'P2' | 'Y000' | 'PH000' | 'SO') => view.setBit(b),
    /** screen position of a pick target */
    screenOf: (kind: PickKind, id: string, index?: number) => {
      const p = view.visual!.targetWorld({ kind, id, index });
      p.project(camera);
      return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
    },
    phonePoint: (x: number, y: number, z: number) => {
      const p = new THREE.Vector3(x, y, z);
      view.visual!.phoneGroup.localToWorld(p);
      p.project(camera);
      return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
    },
    cellScreen: (cell: number) => {
      const p = bench.cellCenter(cell);
      bench.root.localToWorld(p);
      p.project(camera);
      return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
    },
    auto: (n: number) => {
      let last = '';
      for (let i = 0; i < n; i++) {
        const h = view.hint;
        if (!h?.action) {
          last = h?.textKey ?? 'none';
          break;
        }
        const a = h.action.t === 'replace' ? { ...h.action, quality: 'good' as const } : h.action;
        const r = view.perform(a);
        last = `${h.textKey} ${r.ok}`;
        if (!r.ok) break;
      }
      return last;
    },
    autoLogic: (n: number) => {
      for (let i = 0; i < n; i++) autoStep(view.session!, view.job!.goal);
      view.visual!.sync(view.job!.phone, true);
      view.refreshHint();
    },
    state: () => view.job?.phone,
    hint: () => hintText,
    messages: () => messages,
    events: () => events.splice(0),
    gauge: () => gauge,
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    cam: (az: number, polar: number, dist: number, tx = -0.02, tz = 0) => {
      const g = (view as unknown as { camGoal: { azimuth: number; polar: number; dist: number; target: THREE.Vector3 } }).camGoal;
      g.azimuth = az;
      g.polar = polar;
      g.dist = dist;
      g.target.set(tx, 0.9, tz);
    },
  },
});

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tweens.update(dt);
  view.update(dt);
  view.cameraPose(pose);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  renderer.render(scene, camera);
  logEl.textContent = `tool: ${view.tool ?? 'hand'}  bit: ${view.bit}\nhint: ${hintText}\n${messages.join('\n')}\n${gauge ? JSON.stringify(gauge) : ''}`;
});
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
