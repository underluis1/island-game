/** Dev-only viewer for the procedural phones (not part of the game bundle). */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RNG } from '../core/rng';
import { Tweens } from '../core/tween';
import { PHONE_DEFS } from '../data/phones';
import { generateFaultyPhone } from '../gameplay/repair/faults';
import { autoStep } from '../gameplay/repair/hint';
import { createPhone } from '../gameplay/repair/model';
import { RepairSession } from '../gameplay/repair/session';
import { emptyGoal, type PhoneInstance, type RepairGoal } from '../gameplay/repair/types';
import { PhoneVisual } from '../procgen/phones/phone';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#5d7d86');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.005, 20);
const sun = new THREE.DirectionalLight('#fff2dd', 2.6);
sun.position.set(0.25, 0.6, 0.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -0.3;
sun.shadow.camera.right = sun.shadow.camera.top = 0.3;
sun.shadow.camera.near = 0.05;
sun.shadow.camera.far = 2;
sun.shadow.bias = -0.0004;
scene.add(sun, new THREE.HemisphereLight('#bfe6ff', '#6b5a48', 0.5));
const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshStandardMaterial({ color: '#2f6f73', roughness: 0.85 }));
mat.rotation.x = -Math.PI / 2;
mat.receiveShadow = true;
scene.add(mat);

const tweens = new Tweens();
let visual: PhoneVisual | null = null;
let session: RepairSession | null = null;
let goal: RepairGoal = { ...emptyGoal(), teardown: true };
let phone: PhoneInstance;
const holder = new THREE.Group();
holder.rotation.x = -Math.PI / 2;
holder.scale.setScalar(0.001);
holder.position.y = 0.0005;
scene.add(holder);

let trayN = 0;
function assignTray(p: PhoneInstance): void {
  for (const [id, cs] of Object.entries(p.comps)) {
    if (cs.state === 'removed' && !cs.tray) {
      const def = session!.model.comp(id);
      if (def.parent && p.comps[def.parent]!.state !== 'removed') continue;
      const col = trayN % 4;
      const row = Math.floor(trayN / 4);
      cs.tray = { x: -0.3 + col * 0.062 + (row % 2) * 0.02, z: -0.16 + row * 0.085, r: 0 };
      if (def.hinge) cs.tray = { x: 0.2 + (trayN % 2) * 0.09, z: 0.0, r: 0 };
      trayN++;
    }
  }
}

function load(modelId: string, faults: string[] = [], color = 0): void {
  visual?.dispose();
  trayN = 0;
  const def = PHONE_DEFS[modelId]!;
  if (faults.length) {
    const r = generateFaultyPhone(def, faults, new RNG(7), 'demo');
    phone = r.phone;
  } else phone = createPhone(def, 'demo', color);
  phone.color = color;
  session = new RepairSession(def, phone, { tools: { driver: 3, spudger: 3, pick: 1, suction: 3, tweezers: 3, heat: 3, brush: 2, toothpick: 1, ipa: 1, card: 1, adhesive: 2 }, errorMult: 1, strict: true, matCells: 24 }, new RNG(1));
  visual = new PhoneVisual(def, phone, { tweens });
  holder.add(visual.root);
  const g = visual.screenCtx;
  const { width: w, height: h } = visual.screenCanvas;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#18b8b0');
  grad.addColorStop(1, '#ff6f59');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  g.font = 'bold 40px system-ui';
  g.textAlign = 'center';
  g.fillText('12:47', w / 2, h * 0.3);
  visual.refreshScreen();
}

function steps(n: number, instant = true): string {
  let last = '';
  for (let i = 0; i < n; i++) {
    const st = autoStep(session!, goal);
    last = st.hint.textKey + ' ' + st.hint.target.id;
    if (st.hint.done || !st.result?.ok) break;
  }
  assignTray(phone);
  visual!.sync(phone, instant);
  return last;
}

function untilRemoved(compId: string): string {
  let last = '';
  for (let i = 0; i < 3000 && phone.comps[compId]!.state !== 'removed'; i++) {
    const st = autoStep(session!, goal);
    last = st.hint.textKey;
    if (st.hint.done || !st.result?.ok) break;
  }
  assignTray(phone);
  visual!.sync(phone, true);
  return last;
}

function untilOpen(compId: string): void {
  for (let i = 0; i < 3000 && phone.comps[compId]!.state === 'installed'; i++) {
    const st = autoStep(session!, goal);
    if (st.hint.done || !st.result?.ok) break;
  }
  visual!.sync(phone, true);
}

function cam(pos: [number, number, number], target: [number, number, number]): void {
  camera.position.set(...pos);
  camera.lookAt(...target);
}

cam([0, 0.3, 0.16], [0, 0, 0]);
load('fone8');

Object.assign(window, {
  __phone: {
    load,
    steps,
    untilRemoved,
    untilOpen,
    cam,
    setGoal: (g: Partial<RepairGoal>) => (goal = { ...emptyGoal(), ...g }),
    state: () => phone,
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  },
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  tweens.update(clock.getDelta());
  renderer.render(scene, camera);
});
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
