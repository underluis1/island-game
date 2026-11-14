/**
 * Demo di sviluppo: bancarella/chiosco/negozio + decorazioni.
 * Setup three minimale e autonomo (non usa src/render). API di debug in `window.__shop`.
 */
import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import decorData from '../data/decor.json';
import { buildDecor } from '../procgen/props/decor';
import { type ConstructionSite, type DecorModel, type ShopBuild, type ShopEnv, type ShopOptions, type ShopUpgrades, buildConstructionSite, buildShop } from '../procgen/props/shop';

interface DecorEntry {
  id: string;
  placement: 'ground' | 'wall' | 'hang' | 'shelf';
  footprint: [number, number];
}
const DECOR = decorData as unknown as DecorEntry[];

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 600);
const camTarget = new THREE.Vector3(0, 1, -1.5);
camera.position.set(2.6, 2.3, 4.2);
camera.lookAt(camTarget);

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -7;
sun.shadow.camera.right = 7;
sun.shadow.camera.top = 7;
sun.shadow.camera.bottom = -7;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfe3ff, 0xd9c59a, 1);
scene.add(hemi);
// rimbalzo caldo della sabbia (nella scena vera lo fornisce il World)
const bounce = new THREE.AmbientLight(0xffe9cc, 0.6);
scene.add(bounce);

// terreno provvisorio: sabbia + mare piatto (solo demo)
const sandMat = new THREE.MeshStandardMaterial({ color: 0xeadcb8, roughness: 1 });
const sand = new THREE.Mesh(new THREE.PlaneGeometry(400, 60), sandMat);
sand.rotation.x = -Math.PI / 2;
sand.position.set(0, 0, 14);
sand.receiveShadow = true;
scene.add(sand);
const seaMat = new THREE.MeshStandardMaterial({ color: 0x2bb8b4, roughness: 0.25, metalness: 0.1 });
const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 600), seaMat);
sea.rotation.x = -Math.PI / 2;
sea.position.set(0, -0.02, -316);
scene.add(sea);

// cielo a gradiente + environment map
const skyGeo = new THREE.SphereGeometry(500, 24, 12);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader:
    'varying vec3 vP; uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, pow(-h, 0.4)); gl_FragColor = vec4(c, 1.0); }',
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new THREE.Mesh(skyGeo, skyMat);
envScene.add(envSky);
let envRT: THREE.WebGLRenderTarget | null = null;

const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(scene, camera));
const bloom = new BloomEffect({ intensity: 0.9, luminanceThreshold: 1.0, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 });
composer.addPass(new EffectPass(camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }), new SMAAEffect()));

const env: ShopEnv = { timeOfDay: 11, wind: 0.3, rain: 0, lampsOn: false };
const opts: ShopOptions = {
  stage: 1,
  awningColor: '#e8503a',
  accentColor: '#1fa7a0',
  shopName: 'Island Fix',
  textureScale: 1,
  upgrades: { chair: 1, fan: 1, lamp: 1, lights: 1, rack: 1, shelf: 0 },
};

let shop: ShopBuild | null = null;
let site: ConstructionSite | null = null;
let decors: DecorModel[] = [];
const decorRoot = new THREE.Group();
scene.add(decorRoot);
const helperMat = new THREE.MeshStandardMaterial({ color: 0xcdbb98, roughness: 0.9 });
const helperGeo = new THREE.BoxGeometry(1, 1, 1);

function lerpColor(a: number, b: number, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

function setTime(h: number): void {
  env.timeOfDay = h;
  const day = Math.max(0, Math.sin(((h - 6) / 12.5) * Math.PI));
  const ang = ((h - 6) / 12.5) * Math.PI;
  const night = h < 5.8 || h > 18.6;
  const golden = Math.max(0, 1 - Math.abs(h - 17.6) / 1.4);
  if (night) {
    sun.position.set(-8, 14, 6);
    sun.color.set(0x8fa8ff);
    sun.intensity = 0.35;
    hemi.intensity = 0.22;
    bounce.intensity = 0.05;
    hemi.color.set(0x6f86c9);
    hemi.groundColor.set(0x2a2f45);
    skyMat.uniforms.top.value.set(0x05081a);
    skyMat.uniforms.horizon.value.set(0x1b2748);
    skyMat.uniforms.ground.value.set(0x0b1022);
    seaMat.color.set(0x0d2b3c);
    sandMat.color.set(0xb9ad92);
  } else {
    sun.position.set(Math.cos(ang) * 14, Math.max(0.12, Math.sin(ang)) * 16, 7);
    sun.color.copy(lerpColor(0xffffff, 0xffa25a, golden));
    sun.intensity = 0.5 + day * 1.7;
    hemi.intensity = 0.3 + day * 0.5;
    bounce.intensity = 0.15 + day * 0.75;
    hemi.color.copy(lerpColor(0xbfe3ff, 0xffc9a0, golden));
    hemi.groundColor.set(0xd9c59a);
    skyMat.uniforms.top.value.copy(lerpColor(0x2f7fd6, 0x39508f, golden));
    skyMat.uniforms.horizon.value.copy(lerpColor(0xbfe6f5, 0xffb37a, golden));
    skyMat.uniforms.ground.value.copy(lerpColor(0xd9cfae, 0x9a7a5a, golden));
    seaMat.color.copy(lerpColor(0x2bb8b4, 0x3a8f9a, golden));
    sandMat.color.copy(lerpColor(0xd9c59c, 0xd6b388, golden));
  }
  env.lampsOn = h >= 17.8 || h < 6.3;
  if (shop) {
    shop.lampLight.visible = true;
    shop.lampLight.intensity = env.lampsOn ? 1.4 : 0.0;
  }
  envRT?.dispose();
  envRT = pmrem.fromScene(envScene, 0, 1, 600);
  scene.environment = envRT.texture;
  scene.environmentIntensity = night ? 0.5 : 1;
}

function clearDecor(): void {
  for (const d of decors) d.dispose();
  decors = [];
  while (decorRoot.children.length) decorRoot.remove(decorRoot.children[0]);
}

function rebuild(): void {
  shop?.dispose();
  shop = buildShop(opts);
  scene.add(shop.root);
  setTime(env.timeOfDay);
}

function setStage(n: 1 | 2 | 3): void {
  opts.stage = n;
  site?.dispose();
  site = null;
  clearDecor();
  rebuild();
}

function setUpgrades(o: Partial<ShopUpgrades>): void {
  Object.assign(opts.upgrades, o);
  rebuild();
}

function setOpts(o: Partial<ShopOptions>): void {
  Object.assign(opts, o);
  rebuild();
}

function setCam(pos: [number, number, number], target: [number, number, number], fov?: number): void {
  camera.position.set(...pos);
  camTarget.set(...target);
  camera.lookAt(camTarget);
  if (fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

function placeDecor(entry: DecorEntry, x: number, z: number): void {
  const d = buildDecor(entry.id, { textureScale: opts.textureScale, shopName: opts.shopName });
  decors.push(d);
  const holder = new THREE.Group();
  holder.add(d.root);
  if (entry.placement === 'wall') {
    const w = new THREE.Mesh(helperGeo, helperMat);
    w.scale.set(1.5, 2.2, 0.06);
    w.position.set(0, 1.1, -0.03);
    w.receiveShadow = true;
    w.castShadow = true;
    holder.add(w);
    d.root.position.set(0, 1.4, 0);
  } else if (entry.placement === 'hang') {
    const bar = new THREE.Mesh(helperGeo, helperMat);
    bar.scale.set(1.4, 0.05, 0.05);
    bar.position.set(0, 2.225, 0);
    bar.castShadow = true;
    holder.add(bar);
    for (const sx of [-0.7, 0.7]) {
      const post = new THREE.Mesh(helperGeo, helperMat);
      post.scale.set(0.05, 2.25, 0.05);
      post.position.set(sx, 1.125, 0);
      post.castShadow = true;
      holder.add(post);
    }
    d.root.position.set(0, 2.2, 0);
  } else if (entry.placement === 'shelf') {
    const ped = new THREE.Mesh(helperGeo, helperMat);
    ped.scale.set(0.6, 0.9, 0.5);
    ped.position.set(0, 0.45, 0);
    ped.receiveShadow = true;
    ped.castShadow = true;
    holder.add(ped);
    d.root.position.set(0, 0.9, 0);
  }
  holder.position.set(x, 0, z);
  decorRoot.add(holder);
}

/** Mostra una decorazione (o la griglia di tutte, o un sottoinsieme per indice `from..to`). */
function showDecor(id: string, from = 0, to = 999): number {
  shop?.dispose();
  shop = null;
  site?.dispose();
  site = null;
  clearDecor();
  if (id === 'all') {
    const list = DECOR.slice(from, to);
    const cols = Math.ceil(Math.sqrt(list.length * 1.6));
    const rows = Math.ceil(list.length / cols);
    const sp = 2.2;
    list.forEach((e, i) => placeDecor(e, ((i % cols) - (cols - 1) / 2) * sp, (Math.floor(i / cols) - (rows - 1) / 2) * sp));
    const span = Math.max(cols * sp * 0.6, rows * sp * 1.05);
    const far = list.length > 16 ? 1.45 : 1;
    setCam([span * 0.2 * far, (span * 0.5 + 1.2) * far, (span * 0.8 + 1.6) * far], [0, 0.8, 0], 40);
    return list.length;
  }
  const e = DECOR.find((x) => x.id === id);
  if (!e) return 0;
  placeDecor(e, 0, 0);
  const box = new THREE.Box3().setFromObject(decors[0].root);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 1.15 + 0.35;
  setCam([c.x + r * 0.7, c.y + r * 0.45, c.z + r * 1.1], [c.x, c.y, c.z], 40);
  return 1;
}

function showSite(to: 2 | 3): void {
  shop?.dispose();
  shop = null;
  clearDecor();
  site?.dispose();
  site = buildConstructionSite(to);
  scene.add(site.root);
}

function countRoot(root: THREE.Object3D): { meshes: number; casters: number; triangles: number } {
  let meshes = 0;
  let casters = 0;
  let triangles = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!o.visible || !(m.isMesh || (o as THREE.Points).isPoints)) return;
    meshes++;
    if (m.castShadow) casters++;
    const g = m.geometry;
    triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  return { meshes, casters, triangles: Math.round(triangles) };
}

function decorStats(): Array<{ id: string; meshes: number; triangles: number }> {
  return decors.map((d, i) => {
    const s = countRoot(d.root);
    return { id: decorRoot.children[i] ? (DECOR.find((_e, j) => j === i)?.id ?? '') : '', meshes: s.meshes, triangles: s.triangles };
  });
}

/** Statistiche di ogni decorazione costruita singolarmente. */
function auditDecor(): Array<{ id: string; meshes: number; triangles: number }> {
  return DECOR.map((e) => {
    const d = buildDecor(e.id, { textureScale: 1 });
    const s = countRoot(d.root);
    d.dispose();
    return { id: e.id, meshes: s.meshes, triangles: s.triangles };
  });
}

const dbg = window as unknown as Record<string, unknown>;
dbg.__shop = { setStage, setTime, setCam, showDecor, setUpgrades, setOpts, showSite, decorStats, auditDecor, env, get build() { return shop; } };

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
const q = new URLSearchParams(location.search);
opts.stage = (Number(q.get('stage')) || 1) as 1 | 2 | 3;
rebuild();
setTime(Number(q.get('time')) || 11);

const timer = new THREE.Timer();
function frame(): void {
  timer.update();
  const dt = Math.min(0.05, timer.getDelta());
  shop?.update(dt, env);
  site?.update(dt);
  for (const d of decors) d.update?.(dt, env);
  renderer.info.reset();
  composer.render(dt);
  const s = shop ? countRoot(shop.root) : site ? countRoot(site.root) : countRoot(decorRoot);
  dbg.__stats = {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    shopMeshes: s.meshes,
    shopShadowCasters: s.casters,
    shopTriangles: s.triangles,
  };
  requestAnimationFrame(frame);
}
frame();
