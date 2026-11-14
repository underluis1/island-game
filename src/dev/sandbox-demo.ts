/** Dev-only: real Engine + World with the repair bench, to tune the look of phones in scene lighting. */
import * as THREE from 'three';
import { RNG } from '../core/rng';
import { Tweens } from '../core/tween';
import { PHONE_DEFS } from '../data/phones';
import { Bench } from '../game/bench';
import { RepairView, type RepairHost, type ToolId } from '../game/repair-view';
import { generateFaultyPhone } from '../gameplay/repair/faults';
import { createPhone } from '../gameplay/repair/model';
import { emptyGoal } from '../gameplay/repair/types';
import { buildTool } from '../procgen/tools';
import { Engine } from '../render/engine';
import { World } from '../render/world';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const q = new URLSearchParams(location.search);
const engine = new Engine(canvas, (q.get('q') as 'medium') ?? 'medium');
const world = new World(engine);
const tweens = new Tweens();
const bench = new Bench(1);
engine.scene.add(bench.root);
const table = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.84), new THREE.MeshStandardMaterial({ color: '#9a6b45', roughness: 0.8 }));
table.position.y = 0.875;
table.receiveShadow = true;
table.castShadow = true;
engine.scene.add(table);

const host: RepairHost = {
  sfx: () => undefined,
  loop: () => undefined,
  message: () => undefined,
  outline: (ch, objs) => engine.setOutline(ch, objs),
  tooltip: () => undefined,
  gauge: () => undefined,
  hint: () => undefined,
  choosePart: async () => 'good',
  tool: (id, tier) => {
    const t = buildTool(id, Math.max(1, tier));
    return { root: t.root, update: t.update ? (dt, a) => t.update!(dt, a) : undefined };
  },
  solder: () => undefined,
  onRepairEvent: () => undefined,
  onStateChanged: () => undefined,
  setFocus: () => undefined,
  breeze: () => 0,
  reduceMotion: () => false,
};
const view = new RepairView(engine.scene, engine.camera, canvas, tweens, bench, host);
let time = Number(q.get('t') ?? 10);
let repair = true;

function start(modelId: string, faults: string[] = []): void {
  if (view.active) view.close()?.dispose();
  const def = PHONE_DEFS[modelId]!;
  const r = faults.length ? generateFaultyPhone(def, faults, new RNG(7), 'demo') : { phone: createPhone(def, 'demo', 1), goal: { ...emptyGoal(), teardown: true } };
  view.open({ def, phone: r.phone, goal: r.goal, ctx: { tools: { driver: 3, spudger: 3, pick: 1, suction: 3, tweezers: 3, heat: 3, brush: 2, toothpick: 1, ipa: 1, card: 1, adhesive: 2 }, errorMult: 1, strict: true, matCells: 15 }, rng: new RNG(3) });
}

canvas.addEventListener('pointermove', (e) => view.onPointerMove(e));
canvas.addEventListener('pointerdown', (e) => view.onPointerDown(e));
window.addEventListener('pointerup', (e) => view.onPointerUp(e));
canvas.addEventListener('wheel', (e) => view.onWheel(e), { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const pose = { position: new THREE.Vector3(), target: new THREE.Vector3() };
Object.assign(window, {
  __sb: {
    view,
    start,
    setTime: (h: number) => (time = h),
    setRepair: (on: boolean) => (repair = on),
    tool: (id: ToolId | null) => view.selectTool(id),
    auto: (n: number) => {
      for (let i = 0; i < n; i++) {
        const h = view.hint;
        if (!h?.action) break;
        if (!view.perform(h.action.t === 'replace' ? { ...h.action, quality: 'good' } : h.action).ok) break;
      }
    },
    cam: (az: number, polar: number, dist: number, tx = 0.03, tz = 0) => {
      const g = (view as unknown as { camGoal: { azimuth: number; polar: number; dist: number; target: THREE.Vector3 } }).camGoal;
      Object.assign(g, { azimuth: az, polar, dist });
      g.target.set(tx, 0.9, tz);
    },
    stats: () => engine.stats(),
  },
});

void world.init().then(() => {
  start(q.get('m') ?? 'fone8');
  let last = performance.now();
  engine.renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tweens.update(dt);
    world.update(dt, { timeOfDay: time, rain: 0, wind: 0.4 });
    view.update(dt);
    if (repair) {
      view.cameraPose(pose);
      engine.camera.near = 0.01;
      engine.camera.far = 600;
      engine.camera.position.copy(pose.position);
      engine.camera.lookAt(pose.target);
      world.setShadowFocus(new THREE.Vector3(0, 0.9, 0), 0.6);
      engine.setDof({ enabled: true, focusDistance: pose.position.distanceTo(pose.target), focusRange: 0.5, bokehScale: 2 });
    } else {
      engine.camera.near = 0.1;
      engine.camera.far = 3000;
      engine.camera.position.set(2.6, 2.3, 4.2);
      engine.camera.lookAt(0, 1, -1.5);
      world.setShadowFocus(new THREE.Vector3(0, 0, 0), 16);
      engine.setDof({ enabled: false });
    }
    engine.camera.updateProjectionMatrix();
    engine.render(dt);
  });
});
