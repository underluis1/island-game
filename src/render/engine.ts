import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  KernelSize,
  NormalPass,
  OutlineEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  SSAOEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { Effect, Pass } from 'postprocessing';
import { QUALITY_ORDER, QUALITY_PRESETS } from './quality';
import type { QualityLevel, QualityPreset } from './quality';

export interface DofOptions {
  enabled: boolean;
  /** metres from the camera */
  focusDistance?: number;
  /** metres around the focus distance that stay sharp */
  focusRange?: number;
  bokehScale?: number;
}

export interface EngineStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export type OutlineChannel = 'hover' | 'guide';

/** frame time budget (ms of GPU+CPU work) the benchmark aims for, leaving headroom for gameplay objects */
const BENCH_TARGET_MS = 9.5;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    // hidden tabs never fire rAF: never let the caller hang
    setTimeout(finish, 120);
  });
}

/**
 * Renderer + post-processing chain + quality presets.
 *
 * Pipeline (HalfFloat HDR buffers, tone mapping happens once, in the composer):
 *   RenderPass → [NormalPass + SSAO] → [DOF] → Bloom + ACES + Vignette + Outlines → SMAA/FXAA
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private _preset: QualityPreset;
  private readonly composer: EffectComposer;
  private readonly listeners = new Set<(p: QualityPreset) => void>();

  private passes: Pass[] = [];
  private effects: Effect[] = [];
  private dofEffect: DepthOfFieldEffect | null = null;
  private dofPass: EffectPass | null = null;
  private outlineHover: OutlineEffect | null = null;
  private outlineGuide: OutlineEffect | null = null;
  private readonly outlineSel: Record<OutlineChannel, THREE.Object3D[]> = { hover: [], guide: [] };
  private readonly dofState: Required<DofOptions> = { enabled: false, focusDistance: 0.6, focusRange: 0.25, bokehScale: 3 };

  private lastNear = -1;
  private lastFar = -1;
  private fpsSmoothed = 60;
  private lastFrameTime = 0;
  private readonly frameStats: EngineStats = { fps: 60, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };
  private disposed = false;
  private readonly onWindowResize = (): void => this.resize();

  constructor(canvas: HTMLCanvasElement, level: QualityLevel) {
    this._preset = QUALITY_PRESETS[level];

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Materials are only tone mapped by three when rendering straight to the canvas; inside the composer
    // (render targets) they stay linear HDR and the ToneMappingEffect applies ACES exactly once.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // soft (Vogel disk PCF) in three ≥ r182
    renderer.info.autoReset = false;
    renderer.setClearColor(0x000000, 1);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
    this.camera.position.set(2.6, 2.3, 4.2);
    this.camera.lookAt(0, 1, -1.5);
    this.scene.add(this.camera);

    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
      stencilBuffer: false,
      depthBuffer: true,
    });

    this.buildPipeline();
    this.resize();
    window.addEventListener('resize', this.onWindowResize);
  }

  get preset(): QualityPreset {
    return this._preset;
  }

  // ---------------------------------------------------------------- quality

  setQuality(level: QualityLevel): void {
    if (this.disposed) return;
    const next = QUALITY_PRESETS[level];
    if (next === this._preset) return;
    this._preset = next;
    this.buildPipeline();
    this.resize();
    for (const fn of this.listeners) fn(next);
  }

  onQualityChange(fn: (p: QualityPreset) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private disposePipeline(): void {
    this.composer.removeAllPasses();
    for (const p of this.passes) p.dispose();
    for (const e of this.effects) e.dispose();
    this.passes = [];
    this.effects = [];
    this.dofEffect = null;
    this.dofPass = null;
    this.outlineHover = null;
    this.outlineGuide = null;
  }

  private buildPipeline(): void {
    this.disposePipeline();
    const p = this._preset;
    const { scene, camera, composer } = this;
    const add = (pass: Pass): void => {
      composer.addPass(pass);
      this.passes.push(pass);
    };

    add(new RenderPass(scene, camera));

    if (p.ssao) {
      const normalPass = new NormalPass(scene, camera, { resolutionScale: 0.5 });
      add(normalPass);
      const ssao = new SSAOEffect(camera, normalPass.texture, {
        blendFunction: BlendFunction.MULTIPLY,
        samples: p.level === 'ultra' ? 13 : 9,
        rings: 7,
        worldDistanceThreshold: 30,
        worldDistanceFalloff: 12,
        worldProximityThreshold: 0.35,
        worldProximityFalloff: 0.15,
        luminanceInfluence: 0.55,
        minRadiusScale: 0.33,
        radius: 0.06,
        intensity: 1.6,
        bias: 0.03,
        fade: 0.02,
        resolutionScale: 0.5,
      });
      this.effects.push(ssao);
      add(new EffectPass(camera, ssao));
    }

    if (p.dof) {
      const dof = new DepthOfFieldEffect(camera, {
        focusDistance: this.dofState.focusDistance,
        focusRange: this.dofState.focusRange,
        bokehScale: this.dofState.bokehScale,
        resolutionScale: p.level === 'medium' ? 0.5 : 0.75,
      });
      this.effects.push(dof);
      this.dofEffect = dof;
      const pass = new EffectPass(camera, dof);
      pass.enabled = this.dofState.enabled;
      this.dofPass = pass;
      add(pass);
    }

    const finalEffects: Effect[] = [];
    if (p.bloom) {
      finalEffects.push(
        new BloomEffect({
          mipmapBlur: true,
          luminanceThreshold: 1.15,
          luminanceSmoothing: 0.5,
          intensity: 0.42,
          radius: 0.72,
          levels: p.level === 'medium' ? 5 : 6,
        }),
      );
    }
    finalEffects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    finalEffects.push(new VignetteEffect({ offset: 0.32, darkness: 0.42 }));

    const outlineScale = p.level === 'low' ? 0.5 : 0.75;
    const hover = new OutlineEffect(scene, camera, {
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: 6,
      pulseSpeed: 0,
      visibleEdgeColor: 0xffedc4,
      hiddenEdgeColor: 0x7a6238,
      kernelSize: KernelSize.SMALL,
      blur: p.level !== 'low',
      xRay: true,
      resolutionScale: outlineScale,
    });
    const guide = new OutlineEffect(scene, camera, {
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: 10,
      pulseSpeed: 0.3,
      visibleEdgeColor: 0x1ff2e0,
      hiddenEdgeColor: 0x0c7f88,
      kernelSize: KernelSize.MEDIUM,
      blur: p.level !== 'low',
      xRay: true,
      resolutionScale: outlineScale,
    });
    this.outlineHover = hover;
    this.outlineGuide = guide;
    hover.selection.set(this.outlineSel.hover);
    guide.selection.set(this.outlineSel.guide);
    finalEffects.push(hover, guide);
    this.effects.push(...finalEffects);
    add(new EffectPass(camera, ...finalEffects));

    if (p.antialias === 'smaa') {
      const smaa = new SMAAEffect({ preset: p.level === 'medium' ? SMAAPreset.MEDIUM : SMAAPreset.HIGH });
      this.effects.push(smaa);
      add(new EffectPass(camera, smaa));
    } else if (p.antialias === 'fxaa') {
      const fxaa = new FXAAEffect();
      this.effects.push(fxaa);
      add(new EffectPass(camera, fxaa));
    }

    this.lastNear = -1; // force camera settings refresh on next render
  }

  // ---------------------------------------------------------------- sizing

  resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, this._preset.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, true);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- frame

  render(dt: number): void {
    if (this.disposed) return;
    const cam = this.camera;
    if (cam.near !== this.lastNear || cam.far !== this.lastFar) {
      // depth-aware effects cache near/far: refresh them whenever the game switches view
      this.lastNear = cam.near;
      this.lastFar = cam.far;
      this.composer.setMainCamera(cam);
    }

    const info = this.renderer.info;
    info.reset();
    this.composer.render(dt);

    const now = performance.now();
    if (this.lastFrameTime > 0) {
      const frame = now - this.lastFrameTime;
      if (frame > 0 && frame < 1000) this.fpsSmoothed += (1000 / frame - this.fpsSmoothed) * 0.05;
    }
    this.lastFrameTime = now;
    const s = this.frameStats;
    s.fps = this.fpsSmoothed;
    s.drawCalls = info.render.calls;
    s.triangles = info.render.triangles;
    s.geometries = info.memory.geometries;
    s.textures = info.memory.textures;
  }

  stats(): EngineStats {
    return { ...this.frameStats };
  }

  // ---------------------------------------------------------------- effects

  setDof(opts: DofOptions): void {
    const st = this.dofState;
    st.enabled = opts.enabled;
    if (opts.focusDistance !== undefined) st.focusDistance = opts.focusDistance;
    if (opts.focusRange !== undefined) st.focusRange = opts.focusRange;
    if (opts.bokehScale !== undefined) st.bokehScale = opts.bokehScale;
    const dof = this.dofEffect;
    if (dof && this.dofPass) {
      dof.cocMaterial.focusDistance = st.focusDistance;
      dof.cocMaterial.focusRange = st.focusRange;
      dof.bokehScale = st.bokehScale;
      this.dofPass.enabled = st.enabled;
    }
  }

  setOutline(channel: OutlineChannel, objects: THREE.Object3D[]): void {
    const list = this.outlineSel[channel];
    if (objects.length === 0 && list.length === 0) return;
    list.length = 0;
    for (const o of objects) list.push(o);
    const fx = channel === 'hover' ? this.outlineHover : this.outlineGuide;
    if (fx) fx.selection.set(list);
  }

  // ---------------------------------------------------------------- benchmark

  /**
   * Renders the current scene for `seconds`, measuring the real cost of a frame (GPU work is forced to
   * complete with a 1-pixel readback), then picks, applies and returns the highest preset expected to
   * stay comfortably inside a 60 fps frame.
   */
  async benchmark(seconds = 3): Promise<QualityLevel> {
    const gl = this.renderer.getContext();
    const px = new Uint8Array(4);
    const samples: number[] = [];
    const start = performance.now();
    const warmup = Math.min(600, seconds * 200);
    const end = start + seconds * 1000;
    while (performance.now() < end && !this.disposed) {
      await nextFrame();
      if (this.disposed) break;
      const t0 = performance.now();
      this.render(1 / 60);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t1 = performance.now();
      if (t0 - start > warmup) samples.push(t1 - t0);
    }
    if (samples.length < 5) return this._preset.level;
    samples.sort((a, b) => a - b);
    // 70th percentile: robust to the odd GC pause but not blind to stutter
    const ms = samples[Math.floor(samples.length * 0.7)] as number;
    const baseCost = this._preset.cost;
    let chosen: QualityLevel = 'low';
    for (let i = QUALITY_ORDER.length - 1; i >= 0; i--) {
      const level = QUALITY_ORDER[i] as QualityLevel;
      const estimate = (ms * QUALITY_PRESETS[level].cost) / baseCost;
      if (estimate <= BENCH_TARGET_MS) {
        chosen = level;
        break;
      }
    }
    this.setQuality(chosen);
    return chosen;
  }

  // ---------------------------------------------------------------- teardown

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onWindowResize);
    this.listeners.clear();
    this.disposePipeline();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
