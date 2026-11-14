import * as THREE from 'three';
import type { Engine } from './engine';
import type { QualityPreset } from './quality';
import { computeAtmosphere, createAtmosphereState } from './atmosphere';
import type { AtmosphereState } from './atmosphere';
import { Sky } from './sky';
import { Terrain } from './terrain';
import { Water, tideAt } from './water';
import { Boats } from './boats';
import type { SupplierBoatState } from './boats';
import { Crabs, Gulls } from './fauna';
import { Rain } from './rain';
import { SEA_LEVEL, insidePad, shorelineZ, terrainHeight } from './layout';
import { createSharedUniforms } from './shared';
import type { SharedUniforms } from './shared';
import { FrameBudget } from './util/async';
import { makeKarstTexture, makeNoiseTexture, makeWaterNormalTexture } from '../procgen/textures/env/data-textures';
import { makeFootprintTexture, makePalmAtlas } from '../procgen/textures/env/palm-atlas';
import { buildKarstGeometry, createKarstMaterial, karstShelf } from '../procgen/nature/karst';
import { buildVegetation, createFoliageMaterials } from '../procgen/nature/vegetation';
import type { FoliageMaterials } from '../procgen/nature/vegetation';
import { buildBeachDebris, buildFootprints } from '../procgen/nature/beach-debris';

export interface WorldEnv {
  /** hours 0..24 */
  timeOfDay: number;
  /** 0..1 */
  rain: number;
  /** 0..1 */
  wind: number;
}

const SHADOW_DISTANCE = 70;

function isFree(x: number, z: number, margin: number): boolean {
  if (insidePad(x, z, margin)) return false;
  // keep clear of the karst headlands and of the supplier's landing spot
  if (karstShelf(x, z, SEA_LEVEL) > SEA_LEVEL - 1.5) return false;
  if (Math.abs(x - 9) < 2.2 + margin && z < -12.5) return false;
  return true;
}

function hoursApart(a: number, b: number): number {
  const d = Math.abs(a - b) % 24;
  return d > 12 ? 24 - d : d;
}

/** Koh Phi Phi: sky, sun & moon, sea, beach, karsts, palms, boats, wildlife and weather. */
export class World {
  readonly sunDirection = new THREE.Vector3(0.3, 0.8, 0.5).normalize();
  readonly beachPaths: THREE.Vector3[][] = [];
  readonly customerPath: THREE.Vector3[] = [];

  private readonly engine: Engine;
  private readonly root = new THREE.Group();
  private readonly shared: SharedUniforms = createSharedUniforms();
  private readonly atmo: AtmosphereState = createAtmosphereState();
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 0.9);
  private readonly fog = new THREE.FogExp2(0xbfd8ea, 0.002);
  private readonly focusCenter = new THREE.Vector3(0, 0.9, 0);
  private focusRadius = 18;
  private readonly disposables: { dispose(): void }[] = [];

  private sky: Sky | null = null;
  private terrain: Terrain | null = null;
  private water: Water | null = null;
  private boats: Boats | null = null;
  private gulls: Gulls | null = null;
  private crabs: Crabs | null = null;
  private rain: Rain | null = null;
  private karstMesh: THREE.Mesh | null = null;
  private karstTexture: THREE.Texture | null = null;
  private vegMeshes: THREE.Mesh[] = [];
  private foliage: FoliageMaterials | null = null;
  private palmAtlas: THREE.Texture | null = null;
  private debrisMesh: THREE.Mesh | null = null;
  private debrisMaterial: THREE.MeshStandardMaterial | null = null;
  private footprints: THREE.Mesh | null = null;
  private palmFeet: { x: number; z: number }[] = [];

  private pmrem: THREE.PMREMGenerator | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envTime = -100;
  private envRain = -1;
  private envCooldown = 0;
  private prevEnvironment: THREE.Texture | null = null;
  private prevFog: THREE.Scene['fog'] = null;

  private clock = 0;
  private wetness = 0;
  private wind = 0.4;
  private ready = false;
  private initStarted = false;
  private disposed = false;
  private qualityJob: Promise<void> = Promise.resolve();
  private unsubscribeQuality: (() => void) | null = null;
  private appliedPreset: QualityPreset;
  private pendingSupplier: SupplierBoatState = 'away';
  private _night = 0;
  private _lampsOn = false;

  constructor(engine: Engine) {
    this.engine = engine;
    this.appliedPreset = engine.preset;
    this.root.name = 'world';
    this.buildPaths();
  }

  /** 0 day … 1 full night */
  get nightFactor(): number {
    return this._night;
  }

  /** true from sunset to sunrise */
  get lampsOn(): boolean {
    return this._lampsOn;
  }

  heightAt(x: number, z: number): number {
    return terrainHeight(x, z);
  }

  setShadowFocus(center: THREE.Vector3, radius: number): void {
    this.focusCenter.copy(center);
    this.focusRadius = Math.max(0.2, radius);
  }

  setSupplierBoat(state: SupplierBoatState): void {
    this.pendingSupplier = state;
    if (this.boats) this.boats.setSupplier(state);
  }

  // ------------------------------------------------------------------ init

  async init(onProgress?: (p: number) => void): Promise<void> {
    if (this.initStarted || this.disposed) return;
    this.initStarted = true;
    const { engine, shared } = this;
    const { renderer, scene } = engine;
    const preset = engine.preset;
    this.appliedPreset = preset;
    const budget = new FrameBudget(9);
    const progress = (p: number): void => {
      if (onProgress) onProgress(p);
    };
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const ts = preset.textureScale;
    progress(0);

    // -- shared textures
    const noise = await makeNoiseTexture(256, budget);
    shared.uNoise.value = noise;
    this.disposables.push(noise);
    progress(0.06);
    await budget.yield();
    const waterNormal = await makeWaterNormalTexture(ts >= 2 ? 512 : 256, budget);
    this.disposables.push(waterNormal);
    progress(0.1);
    await budget.yield();

    // -- lights, fog, sky
    this.prevFog = scene.fog;
    this.prevEnvironment = scene.environment;
    scene.fog = this.fog;
    const sun = this.sun;
    sun.name = 'sun';
    sun.castShadow = true;
    sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    sun.shadow.bias = -0.00035;
    sun.shadow.radius = 2.4;
    this.root.add(sun, sun.target, this.hemi);
    scene.add(this.root);
    this.sky = new Sky(noise, preset.clouds);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    try {
      await renderer.compileAsync(this.sky.envScene, engine.camera);
    } catch (err) {
      console.warn('World: sky pre-compilation failed', err);
    }
    await this.addCompiled(this.sky.mesh);
    // from here on update() is live: lights, fog and the first environment map exist before any lit
    // material is compiled, so every program is built once, for the final lighting set-up
    this.ready = true;
    this.update(0, { timeOfDay: 10, rain: 0, wind: 0.4 });
    progress(0.14);
    await budget.yield();

    // -- beach + sea bed
    let step = 0;
    this.terrain = await Terrain.create(
      shared,
      {
        textureSize: Math.round(512 * Math.min(ts, 2)),
        anisotropy: aniso,
        caustics: preset.waterDetail >= 1,
        shelf: (x, z) => karstShelf(x, z, SEA_LEVEL),
      },
      budget,
      () => progress(0.14 + 0.08 * ++step),
    );
    await this.addCompiled(this.terrain.mesh);
    progress(0.44);
    await budget.yield();

    // -- sea
    this.water = new Water(shared, waterNormal, preset.waterSegments, preset.waterDetail);
    await this.addCompiled(this.water.mesh);
    progress(0.48);
    await budget.yield();

    // -- karsts
    this.karstTexture = await makeKarstTexture(Math.round(512 * ts), aniso, budget);
    progress(0.56);
    const karstGeo = await buildKarstGeometry(SEA_LEVEL, budget);
    const karstMat = createKarstMaterial(this.karstTexture, shared);
    this.karstMesh = new THREE.Mesh(karstGeo, karstMat);
    this.karstMesh.name = 'karst';
    this.karstMesh.matrixAutoUpdate = false;
    this.karstMesh.frustumCulled = false;
    this.karstMesh.receiveShadow = false;
    await this.addCompiled(this.karstMesh);
    this.disposables.push(karstGeo, karstMat);
    progress(0.66);
    await budget.yield();

    // -- palms & bushes
    this.palmAtlas = makePalmAtlas(ts >= 2 ? 2048 : ts < 1 ? 512 : 1024, aniso);
    await budget.yield();
    this.foliage = createFoliageMaterials(this.palmAtlas, shared);
    await this.buildVegetation(preset.vegetationDensity, budget);
    progress(0.82);
    await budget.yield();

    // -- shells, pebbles, rocks, footprints
    this.debrisMaterial = new THREE.MeshStandardMaterial({ name: 'BeachDebris', vertexColors: true, roughness: 0.72, metalness: 0 });
    await this.buildDebris(preset.vegetationDensity, budget);
    const fpTex = makeFootprintTexture();
    const fpMat = new THREE.MeshStandardMaterial({
      name: 'Footprints',
      color: new THREE.Color(0.42, 0.37, 0.3),
      map: fpTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const fpGeo = buildFootprints([...this.beachPaths, this.customerPath], terrainHeight, (x, z, m) => isFree(x, z, m), SEA_LEVEL);
    this.footprints = new THREE.Mesh(fpGeo, fpMat);
    this.footprints.name = 'footprints';
    this.footprints.matrixAutoUpdate = false;
    this.footprints.receiveShadow = true;
    this.footprints.renderOrder = -5;
    await this.addCompiled(this.footprints);
    this.disposables.push(fpTex, fpMat, fpGeo);
    progress(0.9);
    await budget.yield();

    // -- boats, wildlife, weather
    this.boats = new Boats();
    this.boats.setSupplier(this.pendingSupplier);
    this.boats.update(0, 0, 1);
    await this.addCompiled(this.boats.group);
    await budget.yield();
    this.gulls = new Gulls(shared);
    this.crabs = new Crabs();
    this.rain = new Rain(shared, preset.rainDrops);
    await this.addCompiled(this.gulls.mesh);
    await this.addCompiled(this.crabs.mesh);
    this.rain.mesh.visible = true;
    await this.addCompiled(this.rain.mesh);
    this.rain.mesh.visible = false;
    progress(0.97);
    await budget.yield();
    this.unsubscribeQuality = engine.onQualityChange((p) => {
      this.qualityJob = this.qualityJob.then(() => this.applyQuality(p)).catch((err: unknown) => console.error('World: quality change failed', err));
    });
    if (engine.preset !== preset) {
      const p = engine.preset;
      this.qualityJob = this.qualityJob.then(() => this.applyQuality(p));
    }
    progress(1);
  }

  private buildPaths(): void {
    const mk = (x0: number, x1: number, zOf: (x: number) => number): THREE.Vector3[] => {
      const pts: THREE.Vector3[] = [];
      const n = Math.ceil(Math.abs(x1 - x0) / 3.5);
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const z = zOf(x);
        pts.push(new THREE.Vector3(x, terrainHeight(x, z), z));
      }
      return pts;
    };
    // along the swash, mid beach (passes in front of the stall), and a meandering one in between
    this.beachPaths.push(mk(-72, 66, (x) => shorelineZ(x) + 2.5 + 0.35 * Math.sin(x * 0.21)));
    this.beachPaths.push(mk(68, -74, (x) => shorelineZ(x) + 6.7 + 0.3 * Math.sin(x * 0.13 + 1)));
    this.beachPaths.push(mk(-66, 70, (x) => shorelineZ(x) + 4.5 + 0.8 * Math.sin(x * 0.07 + 1)));
    const cp: readonly [number, number][] = [
      [44, shorelineZ(44) + 6.7],
      [34, shorelineZ(34) + 6.9],
      [24, shorelineZ(24) + 6.8],
      [15, -9.1],
      [8.5, -8.6],
      [4.2, -6.6],
      [1.6, -4.2],
      [0.3, -2.3],
      [0, -1.15],
    ];
    for (const [x, z] of cp) this.customerPath.push(new THREE.Vector3(x, terrainHeight(x, z), z));
  }

  /** compiles the programs of `obj` with the scene's lights / fog / environment without blocking, then adds it */
  private async addCompiled(obj: THREE.Object3D): Promise<void> {
    try {
      await this.engine.renderer.compileAsync(obj, this.engine.camera, this.engine.scene);
    } catch (err) {
      console.warn('World: shader pre-compilation failed, the program will compile on first use', err);
    }
    if (!this.disposed) this.root.add(obj);
  }

  private async buildVegetation(density: number, budget: FrameBudget): Promise<void> {
    if (!this.foliage) return;
    const result = await buildVegetation({ density, heightAt: terrainHeight, isFree, shoreZ: shorelineZ }, budget);
    this.palmFeet = result.palms.map((p) => ({ x: p.x, z: p.z }));
    const old = this.vegMeshes;
    const make = (geo: THREE.BufferGeometry, name: string, shadows: boolean): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, this.foliage?.material);
      mesh.name = name;
      mesh.customDepthMaterial = this.foliage?.depthMaterial;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      return mesh;
    };
    const near = make(result.near, 'vegetation-near', true);
    const far = make(result.far, 'vegetation-far', false);
    await this.addCompiled(near);
    await this.addCompiled(far);
    this.vegMeshes = [near, far];
    for (const m of old) {
      m.removeFromParent();
      m.geometry.dispose();
    }
  }

  private async buildDebris(density: number, budget: FrameBudget): Promise<void> {
    if (!this.debrisMaterial) return;
    const geo = await buildBeachDebris(
      { density, seaLevel: SEA_LEVEL, heightAt: terrainHeight, shoreZ: shorelineZ, isFree, palmFeet: this.palmFeet },
      budget,
    );
    const old = this.debrisMesh;
    const mesh = new THREE.Mesh(geo, this.debrisMaterial);
    mesh.name = 'beach-debris';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    await this.addCompiled(mesh);
    this.debrisMesh = mesh;
    if (old) {
      old.removeFromParent();
      old.geometry.dispose();
    }
  }

  /** hot quality switch: cheap toggles are immediate, texture / geometry rebuilds are sliced over frames */
  private async applyQuality(p: QualityPreset): Promise<void> {
    if (this.disposed || !this.ready) return;
    const prev = this.appliedPreset;
    this.appliedPreset = p;
    const budget = new FrameBudget(8);
    const renderer = this.engine.renderer;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    if (this.sun.shadow.mapSize.x !== p.shadowMapSize) {
      this.sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.sky?.setClouds(p.clouds);
    this.water?.setQuality(p.waterSegments, p.waterDetail);
    this.terrain?.setCaustics(p.waterDetail >= 1);
    this.rain?.setCount(p.rainDrops);
    this.envTime = -100; // refresh the environment map at the new size

    if (p.textureScale !== prev.textureScale) {
      const ts = p.textureScale;
      await this.terrain?.setTextureSize(Math.round(512 * Math.min(ts, 2)), aniso, budget);
      if (this.disposed) return;
      const karst = await makeKarstTexture(Math.round(512 * ts), aniso, budget);
      if (this.disposed) {
        karst.dispose();
        return;
      }
      if (this.karstMesh) {
        const mat = this.karstMesh.material as THREE.MeshStandardMaterial;
        mat.map = karst;
        this.karstTexture?.dispose();
        this.karstTexture = karst;
      } else karst.dispose();
      await budget.yield();
      if (this.foliage) {
        const atlas = makePalmAtlas(ts >= 2 ? 2048 : ts < 1 ? 512 : 1024, aniso);
        this.foliage.material.map = atlas;
        this.foliage.depthMaterial.map = atlas;
        this.palmAtlas?.dispose();
        this.palmAtlas = atlas;
      }
      await budget.yield();
    }
    if (p.vegetationDensity !== prev.vegetationDensity) {
      await this.buildVegetation(p.vegetationDensity, budget);
      if (this.disposed) return;
      await this.buildDebris(p.vegetationDensity, budget);
    }
  }

  // ------------------------------------------------------------------ frame

  update(dt: number, env: WorldEnv): void {
    if (!this.ready || this.disposed) return;
    const { engine, shared, atmo } = this;
    const step = Math.min(Math.max(dt, 0), 0.1);
    this.clock += step;
    const time = this.clock;
    const rain = Math.min(1, Math.max(0, env.rain));
    this.wind += (Math.min(1, Math.max(0, env.wind)) - this.wind) * Math.min(1, step * 0.8);
    const wind = this.wind;

    computeAtmosphere(env.timeOfDay, rain, atmo);
    this._night = atmo.night;
    this._lampsOn = atmo.lampsOn;
    this.sunDirection.copy(atmo.lightDir);

    // the world gets soaked quickly and dries slowly
    const wetTarget = rain;
    this.wetness += (wetTarget - this.wetness) * Math.min(1, step * (wetTarget > this.wetness ? 0.35 : 0.035));

    // ---- shared shader state
    shared.uTime.value = time;
    shared.uTide.value = tideAt(time);
    shared.uWet.value = this.wetness;
    shared.uRain.value = rain;
    shared.uNight.value = atmo.night;
    shared.uWindStrength.value = 0.25 + 0.75 * wind + 0.35 * rain;
    shared.uLightDir.value.copy(atmo.lightDir);
    shared.uLightColor.value.copy(atmo.lightColor).multiplyScalar(atmo.lightIntensity);
    shared.uGlintDir.value.copy(atmo.glintDir);
    shared.uGlintColor.value.copy(atmo.glintColor);
    shared.uSkyZenith.value.copy(atmo.zenith);
    shared.uSkyHorizon.value.copy(atmo.horizon);
    const wl = shared.uWaterLight.value;
    const sunIn = atmo.lightIntensity * Math.max(0.12, atmo.lightDir.y) * 0.3;
    wl.setRGB(
      atmo.lightColor.r * sunIn + atmo.hemiSky.r * 0.75,
      atmo.lightColor.g * sunIn + atmo.hemiSky.g * 0.75,
      atmo.lightColor.b * sunIn + atmo.hemiSky.b * 0.75,
    );

    // ---- lights + fog
    const sun = this.sun;
    sun.color.copy(atmo.lightColor);
    sun.intensity = atmo.lightIntensity;
    const r = this.focusRadius;
    shared.uShadowFocus.value.set(this.focusCenter.x, this.focusCenter.y, this.focusCenter.z, r);
    sun.target.position.copy(this.focusCenter);
    sun.position.copy(this.focusCenter).addScaledVector(atmo.lightDir, SHADOW_DISTANCE);
    sun.target.updateMatrixWorld();
    const cam = sun.shadow.camera;
    if (cam.right !== r) {
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.near = 1;
      cam.far = SHADOW_DISTANCE * 2;
      cam.updateProjectionMatrix();
      const texel = (2 * r) / sun.shadow.mapSize.x;
      sun.shadow.normalBias = Math.min(0.06, texel * 2.2);
      sun.shadow.bias = -Math.min(0.0012, 0.00012 + texel * 0.012);
    }
    this.hemi.color.copy(atmo.hemiSky);
    this.hemi.groundColor.copy(atmo.hemiGround);
    this.hemi.intensity = atmo.hemiIntensity;
    this.fog.color.copy(atmo.fog);
    this.fog.density = atmo.fogDensity;
    engine.scene.environmentIntensity = atmo.envIntensity;

    // ---- sky + environment map
    const sky = this.sky;
    if (sky) {
      sky.update(atmo, engine.camera, step, time, wind);
      this.envCooldown -= dt;
      const preset = engine.preset;
      const stale = hoursApart(atmo.time, this.envTime) >= preset.envRefreshHours || Math.abs(rain - this.envRain) > 0.07;
      if (stale && (this.envCooldown <= 0 || this.envTarget === null) && this.pmrem) {
        const rt = this.pmrem.fromScene(sky.envScene, 0, 0.1, 100, { size: preset.envMapSize });
        engine.scene.environment = rt.texture;
        if (this.envTarget) this.envTarget.dispose();
        this.envTarget = rt;
        this.envTime = atmo.time;
        this.envRain = rain;
        this.envCooldown = 0.6;
      }
    }

    // ---- sea, boats, wildlife, rain
    const waveAmp = 0.65 + 0.9 * wind + 0.7 * rain;
    this.water?.update(wind, rain);
    this.boats?.update(step, time, waveAmp);
    this.gulls?.update(step, time, rain);
    this.crabs?.update(step, time);
    this.rain?.update(rain, atmo.hemiSky);
    if (this.footprints) (this.footprints.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - 0.8 * this.wetness);
  }

  // ------------------------------------------------------------------ teardown

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    const scene = this.engine.scene;
    if (this.unsubscribeQuality) this.unsubscribeQuality();
    this.root.removeFromParent();
    if (scene.fog === this.fog) scene.fog = this.prevFog;
    if (this.envTarget && scene.environment === this.envTarget.texture) scene.environment = this.prevEnvironment;
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.sky?.dispose();
    this.terrain?.dispose();
    this.water?.dispose();
    this.boats?.dispose();
    this.gulls?.dispose();
    this.crabs?.dispose();
    this.rain?.dispose();
    this.karstTexture?.dispose();
    this.palmAtlas?.dispose();
    this.foliage?.material.dispose();
    this.foliage?.depthMaterial.dispose();
    for (const m of this.vegMeshes) m.geometry.dispose();
    this.debrisMesh?.geometry.dispose();
    this.debrisMaterial?.dispose();
    this.sun.shadow.map?.dispose();
    this.sun.dispose();
    this.hemi.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
