/**
 * Game: the glue between simulation, 3D scene, audio and UI. It owns the main loop, the game modes
 * (menu, stall, repair, decoration, daily report) and every flow that crosses module boundaries.
 */
import * as THREE from 'three';
import { AudioEngine, type LoopName, type SfxName, type VoiceId } from '../audio';
import { getLang, setLang, t, type Lang } from '../core/i18n';
import { RNG, hashString } from '../core/rng';
import { SaveManager, defaultStorage, type SlotId } from '../core/save';
import { loadSettings, saveSettings, type KeyAction, type Settings } from '../core/settings';
import type { Customer, GameState, Order } from '../core/state';
import { Tweens, ease } from '../core/tween';
import { phoneDef } from '../data/phones';
import { createPhone } from '../gameplay/repair/model';
import { emptyGoal, type ComponentDef, type FunctionId, type Hint, type PartQuality, type RepairEvent, type TestReport, type TestStatus } from '../gameplay/repair/types';
import { GameSim, type DeliveryResult, type SimEvent } from '../gameplay/sim';
import { TUTORIAL_AFTER_TEST, TUTORIAL_BYE, TUTORIAL_INTRO, TUTORIAL_PURCHASE, TutorialTeacher, type DialogLine } from '../gameplay/tutorial/script';
import type { PhoneVisual } from '../procgen/phones/phone';
import { buildTool } from '../procgen/tools';
import { Engine } from '../render/engine';
import { World } from '../render/world';
import { mountCustomerPanel, type CustomerPanelProps } from '../ui/customer-panel';
import { mountDaySummary } from '../ui/day-summary';
import { mountDeliveryResult } from '../ui/delivery-result';
import { mountDialogue, type DialogueHandle } from '../ui/dialogue';
import { mountFinalTest, type FinalTestIssue, type FinalTestItem } from '../ui/final-test';
import { colorFromString, keyLabel } from '../ui/format';
import { mountGauge, type GaugeHandle, type GaugeSpec, type GaugeValues } from '../ui/gauges';
import { mountHotbar } from '../ui/hotbar';
import { mountHud, type HudButton, type HudButtonId, type HudProps } from '../ui/hud';
import { mountCredits, mountMainMenu, mountPauseMenu, mountSplash, type SaveSlotVM, type SplashHandle } from '../ui/menus';
import { mountNightTransition } from '../ui/night-transition';
import { mountPartPicker } from '../ui/part-picker';
import { mountPartTooltip, type PartTooltip } from '../ui/part-tooltip';
import { mountRepairPanel } from '../ui/repair-panel';
import { mountSettingsPanel } from '../ui/settings-panel';
import { mountDecorMode, type DecorModeProps } from '../ui/decor-mode';
import { UIRoot } from '../ui/root';
import { mountSolderGame } from '../ui/solder';
import { mountTablet, type TabletProps } from '../ui/tablet';
import type { Mounted } from '../ui/view';
import { Bench, matGrid } from './bench';
import { DecorMode } from './decor-mode';
import { Particles } from './particles';
import { PhoneScreenDriver } from './phone-screen';
import { BITS, HAND_TOOLS, RepairView, type GaugeData, type RepairHost, type ToolId, type TooltipData } from './repair-view';
import { StallScene } from './stall';
import { ACTION_TO_TOOL, TOOL_ICON, customerPanelProps, daySummaryProps, goalItems, hudOrders, line, modelName, partPickerProps, phoneColorHex, tabletProps, tr, type CounterUi } from './vm';

export type Mode = 'boot' | 'menu' | 'stall' | 'repair' | 'decor' | 'summary';

const STALL_CAM = { position: new THREE.Vector3(2.5, 2.25, 4.1), target: new THREE.Vector3(0, 1.0, -1.5) };
const MENU_CAM = { position: new THREE.Vector3(-3.4, 1.9, 5.6), target: new THREE.Vector3(0.4, 1.1, -3) };
const VOICE_OF: Record<string, VoiceId> = { somchai: 'somchai', noi: 'noi', chai: 'chai' };

interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export class Game {
  readonly settings: Settings = loadSettings();
  readonly ui = new UIRoot(document.getElementById('ui') ?? document.body);
  readonly engine: Engine;
  readonly world: World;
  readonly audio = new AudioEngine();
  readonly tweens = new Tweens();
  readonly saves = new SaveManager(defaultStorage());
  readonly bench: Bench;
  sim: GameSim | null = null;
  stall!: StallScene;
  repair!: RepairView;
  decor: DecorMode | null = null;
  mode: Mode = 'boot';
  activeJobId: string | null = null;
  ready = false;

  private canvas: HTMLCanvasElement;
  private particles: Particles;
  private benchFill: THREE.PointLight;
  private last = performance.now();
  private pose: Pose = { position: MENU_CAM.position.clone(), target: MENU_CAM.target.clone() };
  private poseFrom: Pose = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private poseTo: Pose = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private blend = 1;
  private blendDur = 0.6;
  private mouse = new THREE.Vector2();
  private visual: PhoneVisual | null = null;
  private visualJobId: string | null = null;
  private screen: PhoneScreenDriver | null = null;
  private teacher = new TutorialTeacher([]);
  private guideUsed = new Map<string, boolean>();
  private paused = false;
  private boat = 0;
  private boatTarget = 0;
  private focus = 0;
  private uiDirty = true;
  private uiTimer = 0;
  private frames = 0;
  private fpsAcc = 0;
  private fpsAvg = 60;
  private lastHint: Hint | null = null;
  private busy = false; // a modal flow (dialogue, report…) owns the screen
  private matGlow = false;
  private exhibit = false; // exploded-view showcase from the encyclopedia

  // mounted UI
  private splash: SplashHandle | null = null;
  private hud: Mounted<HudProps> | null = null;
  private hotbar: ReturnType<typeof mountHotbar> | null = null;
  private repairPanel: ReturnType<typeof mountRepairPanel> | null = null;
  private tooltip: PartTooltip;
  private gauge: { key: string; handle: GaugeHandle } | null = null;
  private dialogue: DialogueHandle | null = null;
  private lesson: DialogueHandle | null = null;
  private tablet: { close(): void; content: Mounted<TabletProps> } | null = null;
  private tabletTab: TabletProps['tab'] = 'orders';
  private tabletCatalogTab: TabletProps['catalogTab'] = 'tools';
  private counterPanel: { handle: Mounted<CustomerPanelProps>; ui: CounterUi; customerId: string } | null = null;
  private menu: { destroy(immediate?: boolean): void } | null = null;
  private decorPalette: Mounted<DecorModeProps> | null = null;
  private hintObjective: HudProps['objective'] = null;
  private prompt: HudProps['prompt'] = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    setLang(this.settings.lang);
    this.ui.applySettings(this.settings);
    this.engine = new Engine(canvas, this.settings.quality);
    this.world = new World(this.engine);
    this.bench = new Bench(this.engine.preset.textureScale);
    this.engine.scene.add(this.bench.root);
    this.particles = new Particles(this.engine.scene);
    // soft work light over the bench: always in the scene (adding lights later would recompile every shader)
    this.benchFill = new THREE.PointLight('#fff1dc', 0, 2.2, 1.6);
    this.benchFill.position.set(0.15, 1.55, 0.35);
    this.engine.scene.add(this.benchFill);
    this.tooltip = mountPartTooltip(this.ui.layers.tooltip);
    this.audio.setVolumes(this.settings.volume);
    this.ui.setSoundHook((name) => this.audio.sfx(name));
  }

  /* ================================================================== boot */

  async boot(): Promise<void> {
    this.splash = mountSplash(this.ui.layers.transition, { progress: 0 }, { onStart: () => void this.startFromSplash() });
    this.engine.renderer.setAnimationLoop(() => this.frame());
    await this.world.init((p) => this.splash?.setProgress(p * 0.8, 'ui.splash.step.world'));
    const decorDefs = GameSim.newGame({ seed: 1, shopName: 'x', skipTutorial: true }).catalog().decor;
    this.stall = new StallScene(this.engine.scene, this.world, decorDefs, this.engine.preset.textureScale);
    // a showroom state behind the main menu
    const preview = GameSim.newGame({ seed: 4242, shopName: 'Island Fix', skipTutorial: true });
    this.stall.syncShop(preview.state);
    this.splash.setProgress(0.9, 'ui.splash.step.shop');
    this.repair = new RepairView(this.engine.scene, this.engine.camera, this.canvas, this.tweens, this.bench, this.repairHost());
    this.bindInput();
    if (!this.settings.benchmarkDone) {
      this.splash.setProgress(0.95, 'ui.splash.step.textures');
      this.applyPose(STALL_CAM);
      const level = await this.engine.benchmark(3);
      this.settings.quality = level;
      this.settings.benchmarkDone = true;
      saveSettings(this.settings);
    }
    this.splash.setProgress(1);
    this.splash.setReady();
    this.ready = true;
  }

  private async startFromSplash(): Promise<void> {
    await this.audio.unlock();
    this.splash?.destroy();
    this.splash = null;
    this.showMenu();
  }

  /* ================================================================== menu */

  private slotVM(slot: SlotId): SaveSlotVM {
    const info = this.saves.info(slot);
    const m = info.meta;
    return {
      id: slot,
      kind: slot === 'auto' ? 'auto' : 'manual',
      empty: !m,
      shopName: m?.shopName,
      day: m?.day,
      money: m?.money,
      reputation: m?.reputation,
      phase: m ? (m.stage >= 3 ? 'shop' : m.stage === 2 ? 'kiosk' : 'stall') : undefined,
      savedAt: m?.savedAt,
    };
  }

  showMenu(): void {
    this.setMode('menu');
    this.hud?.destroy(true);
    this.hud = null;
    this.audio.setPaused(false);
    const latest = this.saves.latest();
    const mount = (): void => {
      this.menu?.destroy(true);
      this.menu = mountMainMenu(
        this.ui.layers.panels,
        {
          lastSave: latest ? this.slotVM(latest) : null,
          slots: (['auto', 'slot1', 'slot2', 'slot3'] as SlotId[]).map((s) => this.slotVM(s)),
          lang: getLang(),
          version: '1.0',
          defaultShopName: 'Island Fix',
        },
        {
          onContinue: () => latest && this.loadGame(latest),
          onNewGame: (req) => this.newGame(req.shopName, req.slotId as SlotId, req.skipTutorial),
          onLoad: (slot) => this.loadGame(slot as SlotId),
          onDeleteSlot: (slot) => {
            this.saves.delete(slot as SlotId);
            mount();
          },
          onSettings: () => this.openSettings(),
          onCredits: () => {
            const m = this.ui.openModal((p) => mountCredits(p, { version: '1.0' }, { onClose: () => m.close() }));
          },
          onLang: (lang: Lang) => {
            this.settings.lang = lang;
            setLang(lang);
            saveSettings(this.settings);
            mount();
          },
        },
      );
    };
    mount();
  }

  private closeMenu(): void {
    this.menu?.destroy();
    this.menu = null;
  }

  newGame(shopName: string, slot: SlotId, skipTutorial: boolean, fixedSeed?: number): void {
    void slot;
    const seed = fixedSeed ?? (Date.now() ^ hashString(shopName)) >>> 0;
    this.sim = GameSim.newGame({ seed, shopName: shopName.trim() || 'Island Fix', skipTutorial });
    this.enterWorld(true);
  }

  loadGame(slot: SlotId): boolean {
    const res = this.saves.load(slot);
    if (!res.ok) {
      this.ui.toast({ kind: 'error', text: t(`game.save.${res.error}`) });
      return false;
    }
    this.sim = GameSim.fromState(res.state);
    this.enterWorld(false);
    return true;
  }

  /** Builds the scene for the current simulation and starts playing. */
  private enterWorld(fresh: boolean): void {
    const sim = this.sim!;
    this.closeMenu();
    this.busy = false;
    this.clearPhoneVisual();
    this.teacher = new TutorialTeacher([]);
    this.guideUsed.clear();
    sim.setPlacementValidator((def, at, state) => this.stall.validPlacement(def, at, state));
    this.stall.syncShop(sim.state);
    this.stall.syncDecor(sim.state);
    this.stall.restorePeople(sim.state);
    this.stall.showConstruction(0);
    this.stall.showSomchai(sim.tutorial.active());
    this.decor?.dispose();
    this.decor = new DecorMode(this.engine.scene, this.engine.camera, this.canvas, this.stall, sim, {
      sfx: (n) => this.sfx(n),
      message: (kind, key, params) => this.message(kind, key, params),
      onChanged: () => this.markDirty(),
    });
    this.bench.setMatCells(matGrid(sim.repairContext().matCells).cells);
    this.mountHud();
    this.setMode('stall');
    // resume the job that was on the bench
    const inProgress = sim.orders().find((o) => o.status === 'in_progress') ?? null;
    this.activeJobId = inProgress?.id ?? sim.ownedPhones().find((o) => o.status === 'in_progress')?.id ?? null;
    if (this.activeJobId) this.ensurePhoneVisual(this.activeJobId);
    this.syncRack();
    this.markDirty();
    if (sim.state.dayPhase === 'summary' && sim.state.lastSummary) {
      void this.showSummary();
    } else if (fresh && sim.tutorial.active()) {
      void this.runTutorialIntro();
    } else if (fresh) {
      this.sfx('day_start');
      this.autosave();
    } else if (sim.tutorial.phase() === 'teardown' || sim.tutorial.phase() === 'reassembly' || sim.tutorial.phase() === 'intro') {
      void this.runTutorialIntro();
    }
  }

  /* ================================================================== modes & camera */

  private setMode(mode: Mode): void {
    if (this.mode === mode) return;
    const prev = this.mode;
    this.mode = mode;
    this.poseFrom.position.copy(this.pose.position);
    this.poseFrom.target.copy(this.pose.target);
    this.blend = prev === 'boot' ? 1 : 0;
    this.blendDur = this.settings.reduceMotion ? 0.01 : 0.6;
    if (prev !== 'boot' && prev !== 'menu') this.sfx('camera_whoosh');
    this.engine.setOutline('hover', []);
    this.engine.setOutline('guide', []);
    this.tooltip.hide();
    this.stall?.setPlayerWorking(mode === 'repair');
    this.stall?.setPlayerVisible(mode !== 'repair');
    this.markDirty();
  }

  private desiredPose(out: Pose): void {
    switch (this.mode) {
      case 'repair':
        this.repair.cameraPose(out);
        break;
      case 'decor':
        this.decor?.cameraPose(out);
        break;
      case 'boot':
      case 'menu': {
        const a = performance.now() * 0.00004;
        out.position.set(MENU_CAM.position.x + Math.sin(a) * 0.8, MENU_CAM.position.y + Math.sin(a * 1.7) * 0.15, MENU_CAM.position.z + Math.cos(a) * 0.4);
        out.target.copy(MENU_CAM.target);
        break;
      }
      default: {
        // semi-free: the view leans a little with the mouse
        const k = this.settings.reduceMotion ? 0 : 1;
        out.position.set(STALL_CAM.position.x + this.mouse.x * 0.35 * k, STALL_CAM.position.y + this.mouse.y * 0.12 * k, STALL_CAM.position.z);
        out.target.set(STALL_CAM.target.x + this.mouse.x * 0.5 * k, STALL_CAM.target.y + this.mouse.y * 0.2 * k, STALL_CAM.target.z);
      }
    }
  }

  private applyPose(p: Pose): void {
    this.pose.position.copy(p.position);
    this.pose.target.copy(p.target);
    this.engine.camera.position.copy(p.position);
    this.engine.camera.lookAt(p.target);
  }

  private updateCamera(dt: number): void {
    this.desiredPose(this.poseTo);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDur);
      const k = ease.inOutCubic(this.blend);
      this.pose.position.lerpVectors(this.poseFrom.position, this.poseTo.position, k);
      this.pose.target.lerpVectors(this.poseFrom.target, this.poseTo.target, k);
    } else {
      const k = this.mode === 'repair' ? 1 : 1 - Math.exp(-dt * 5);
      this.pose.position.lerp(this.poseTo.position, k);
      this.pose.target.lerp(this.poseTo.target, k);
    }
    const cam = this.engine.camera;
    const close = this.mode === 'repair';
    const near = close ? 0.01 : 0.1;
    const far = close ? 700 : 3000;
    if (cam.near !== near || cam.far !== far) {
      cam.near = near;
      cam.far = far;
      cam.updateProjectionMatrix();
    }
    cam.position.copy(this.pose.position);
    cam.lookAt(this.pose.target);
    if (close) {
      this.world.setShadowFocus(this.bench.root.position, 0.7);
      this.engine.setDof({ enabled: true, focusDistance: this.pose.position.distanceTo(this.pose.target), focusRange: 0.45, bokehScale: 2.2 });
    } else {
      this.world.setShadowFocus(new THREE.Vector3(0, 0, -1), 16);
      this.engine.setDof({ enabled: false });
    }
  }

  /* ================================================================== main loop */

  private frame(): void {
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - this.last) / 1000);
    this.last = nowMs;
    this.frames++;
    this.fpsAcc += dt;
    if (this.fpsAcc >= 1) {
      this.fpsAvg = this.frames / this.fpsAcc;
      this.frames = 0;
      this.fpsAcc = 0;
    }
    const sim = this.sim;
    const playing = sim && this.mode !== 'menu' && this.mode !== 'boot';
    if (playing && !this.paused) {
      const events = sim.advance(dt, { inRepair: this.mode === 'repair', paused: this.busy && this.mode !== 'repair', talking: !!this.counterPanel || !!this.dialogue });
      for (const ev of events) this.onSimEvent(ev);
      sim.state.playTime += dt;
    }
    const ti = sim && playing ? sim.timeInfo() : null;
    const timeOfDay = ti ? ti.time : 17.2;
    const rain = ti ? ti.rain : 0;
    const wind = 0.3 + rain * 0.5;
    const simDt = this.paused ? 0 : dt;
    this.tweens.update(dt);
    this.world.update(simDt, { timeOfDay, rain, wind });
    if (this.stall) {
      this.stall.update(simDt, { timeOfDay, rain, wind, lampsOn: this.world.lampsOn }, this.mode !== 'repair');
      if (this.stall.shop) {
        const lamp = this.stall.shop.lampLight;
        lamp.intensity = this.world.lampsOn || this.mode === 'repair' ? 1.4 : 0;
      }
    }
    const fillGoal = this.mode === 'repair' ? 1.5 + this.world.nightFactor * 1.5 : 0;
    this.benchFill.intensity += (fillGoal - this.benchFill.intensity) * Math.min(1, dt * 4);
    if (this.repair && !this.paused) this.repair.update(dt);
    this.decor?.update(dt);
    this.screen?.update(simDt);
    this.particles.update(dt);
    this.updateCamera(dt);
    this.boat += (this.boatTarget - this.boat) * Math.min(1, dt * 0.25);
    this.audio.setEnvironment({ timeOfDay, rain, wind, boat: this.boat, crowd: this.mode === 'repair' ? 0.25 : 0.5, indoors: sim?.state.stage === 3 ? 0.55 : 0 });
    this.audio.setFocus(this.focus);
    this.audio.update(dt);
    this.uiTimer += dt;
    if (this.uiDirty || this.uiTimer > 0.5) this.refreshUi();
    this.engine.render(dt);
  }

  /* ================================================================== simulation events */

  private onSimEvent(ev: SimEvent): void {
    const sim = this.sim!;
    switch (ev.type) {
      case 'customer_arrived':
        this.stall.customerArrives(ev.customer, ev.position, sim.queue().findIndex((c) => c.id === ev.customer.id));
        if (ev.position === 'counter') {
          this.sfx('customer_bell');
          this.toast('info', t('game.customer_arrived', { name: ev.customer.name }), 'user');
        }
        break;
      case 'customer_stepped_up':
        this.stall.customerStepsUp(ev.customer.id);
        this.sfx('customer_bell');
        break;
      case 'customer_left':
        if (this.counterPanel?.customerId === ev.customerId) this.closeCounter();
        this.stall.visitorLeaves(ev.customerId, ev.reason === 'impatient' ? 'angry' : 'idle');
        if (ev.reason === 'impatient') this.toast('warn', line(ev.line) || t('game.customer_left'), 'hourglass');
        break;
      case 'pickup_arrived': {
        const o = sim.order(ev.orderId);
        if (o) this.stall.pickupArrives(o.id, o.persona);
        this.sfx('order_notify');
        this.toast(ev.ready ? 'success' : 'warn', line(ev.line), 'user');
        break;
      }
      case 'order_overdue':
        this.sfx('order_notify');
        this.toast('warn', t('game.order_overdue'), 'hourglass');
        break;
      case 'order_failed':
        this.stall.visitorLeaves(`pickup:${ev.orderId}`, 'angry');
        this.sfx('review_bad');
        this.toast('error', line(ev.line), 'thumb_down');
        if (this.activeJobId === ev.orderId) this.dropActiveJob();
        break;
      case 'order_postponed':
      case 'pickup_left':
        this.stall.visitorLeaves(`pickup:${ev.orderId}`, 'idle');
        if (ev.type === 'order_postponed') this.toast('warn', line(ev.line), 'clock');
        break;
      case 'delivery_arrived':
        this.sfx('delivery');
        this.toast('success', t('game.delivery', { n: ev.items.reduce((a, i) => a + i.qty, 0) }), 'box');
        break;
      case 'supplier_boat':
        this.world.setSupplierBoat('arriving');
        this.boatTarget = 1;
        window.setTimeout(() => {
          this.world.setSupplierBoat('leaving');
          this.boatTarget = 0;
        }, 34000);
        break;
      case 'used_sold':
        this.sfx('cash');
        this.ui.toast({ kind: 'money', text: t('game.used_sold', { model: modelName(ev.modelId) }), amount: ev.price });
        break;
      case 'assistant_done':
        this.toast(ev.success ? 'success' : 'warn', t(ev.success ? 'game.assistant_done' : 'game.assistant_failed'), 'user');
        break;
      case 'rain_start':
        this.toast('info', t('game.rain_start'), 'rain');
        break;
      case 'day_ending':
        this.toast('info', t('game.day_ending'), 'sunset');
        break;
      case 'day_end':
        void this.showSummary();
        break;
      case 'loan':
        this.toast('warn', line(ev.line), 'coins');
        break;
      case 'stage_built':
        this.stall.syncShop(sim.state);
        break;
      default:
        break;
    }
    this.markDirty();
  }

  /* ================================================================== feedback helpers */

  sfx(name: string, opts?: { pitch?: number; volume?: number }): void {
    this.audio.sfx(name as SfxName, opts);
  }

  private toast(kind: 'info' | 'success' | 'warn' | 'error', text: string, icon?: string): void {
    if (text) this.ui.toast({ kind, text, icon });
  }

  private message(kind: 'error' | 'warn' | 'info' | 'success', key: string, params?: Record<string, string | number>): void {
    const text = tr(key, params);
    if (!text) return;
    if (kind === 'error') this.ui.gameError(text);
    else this.toast(kind, text);
  }

  private markDirty(): void {
    this.uiDirty = true;
  }

  private coins(count: number): void {
    const p = this.stall.shop ? this.stall.shop.anchors.cashBox.clone() : new THREE.Vector3(0.6, 0.95, -0.2);
    p.y += 0.1;
    this.particles.burst(p, 'coin', count, 1);
  }

  /* ================================================================== dialogues */

  /** Dialogue markup ({{thai|gloss}}) is for the eyes only: the voice reads the plain words. */
  private speakText(text: string, voice: VoiceId): void {
    this.audio.speak(text.replace(/\{\{([^|}]+)(?:\|[^}]*)?\}\}/g, '$1'), voice);
  }


  /** Blocking dialogue: resolves when the player has clicked through every line. */
  private say(lines: Array<{ speaker: string; name: string; text: string; voice?: VoiceId; visitor?: string }>): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      this.busy = true;
      const show = (): void => {
        const l = lines[i]!;
        const props = {
          speaker: { name: l.name, color: colorFromString(l.name) },
          text: l.text,
          subtitles: this.settings.subtitles,
          progress: lines.length > 1 ? `${i + 1}/${lines.length}` : undefined,
        };
        if (this.dialogue) this.dialogue.update(props);
        else
          this.dialogue = mountDialogue(this.ui.layers.panels, props, {
            onAdvance: () => {
              i++;
              if (i >= lines.length) {
                this.dialogue?.destroy();
                this.dialogue = null;
                this.stall.setTalking(null);
                this.busy = false;
                resolve();
              } else show();
            },
            onLineDone: () => this.stall.setTalking(null),
          });
        if (l.voice) this.speakText(l.text, l.voice);
        this.stall.setTalking(l.visitor ?? l.speaker);
      };
      show();
    });
  }

  /** Dialogue with choices; resolves with the id picked. */
  private ask(name: string, text: string, choices: Array<{ id: string; label: string; icon?: string }>, voice?: VoiceId): Promise<string> {
    return new Promise((resolve) => {
      this.busy = true;
      const handle = mountDialogue(
        this.ui.layers.panels,
        { speaker: { name, color: colorFromString(name) }, text, choices, subtitles: true },
        {
          onAdvance: () => undefined,
          onChoice: (id) => {
            handle.destroy();
            this.busy = false;
            this.stall.setTalking(null);
            resolve(id);
          },
        },
      );
      if (voice) this.speakText(text, voice);
    });
  }

  private sayScript(lines: DialogLine[]): Promise<void> {
    return this.say(lines.map((l) => ({ speaker: l.speaker, name: t(`tutorial.speaker.${l.speaker}`), text: t(l.key), voice: VOICE_OF[l.speaker] })));
  }

  /** Non-blocking lesson from Somchai while the player keeps working. */
  private showLesson(l: DialogLine): void {
    this.lesson?.destroy(true);
    const text = t(l.key);
    const handle = mountDialogue(
      this.ui.layers.panels,
      { speaker: { name: t(`tutorial.speaker.${l.speaker}`), color: '#e0803a' }, text, subtitles: true },
      {
        onAdvance: () => {
          handle.destroy();
          if (this.lesson === handle) this.lesson = null;
        },
      },
    );
    this.lesson = handle;
    this.speakText(text, 'somchai');
  }

  /* ================================================================== tutorial */

  private async runTutorialIntro(): Promise<void> {
    const sim = this.sim!;
    this.stall.showSomchai(true);
    if (sim.tutorial.phase() === 'intro') {
      const first = TUTORIAL_INTRO[0]!;
      const choice = await this.ask(t('tutorial.speaker.somchai'), t(first.key), [
        { id: 'go', label: t('game.tutorial_start'), icon: 'play' },
        { id: 'skip', label: t('tutorial.skip'), icon: 'arrow_right' },
      ], 'somchai');
      if (this.sim !== sim) return;
      if (choice === 'skip') {
        this.skipTutorial();
        return;
      }
      await this.sayScript(TUTORIAL_INTRO.slice(1));
      if (this.sim !== sim) return;
      sim.tutorial.advance('teardown');
    }
    if (sim.tutorial.phase() === 'teardown' || sim.tutorial.phase() === 'reassembly') {
      const wreck = sim.tutorial.createWreck();
      this.activeJobId = wreck.id;
      this.ensurePhoneVisual(wreck.id);
      this.prompt = { text: t('game.prompt.click_mat'), icon: 'mouse' };
    }
    this.markDirty();
  }

  skipTutorial(): void {
    const sim = this.sim;
    if (!sim || !sim.tutorial.active()) return;
    if (this.mode === 'repair') this.exitRepair();
    const wreck = sim.orders().find((o) => o.kind === 'tutorial');
    if (wreck && this.activeJobId === wreck.id) this.dropActiveJob();
    sim.tutorial.skip();
    this.stall.showSomchai(false);
    this.lesson?.destroy(true);
    this.lesson = null;
    this.prompt = null;
    this.toast('info', t('game.tutorial_skipped'));
    this.autosave();
    this.markDirty();
  }

  private tutorialOnHint(h: Hint | null): void {
    const sim = this.sim;
    if (!sim || !h || !sim.tutorial.active()) return;
    const phase = sim.tutorial.phase();
    const job = this.repair.job;
    if (phase === 'teardown' && job?.phone.flags.teardownDone) {
      sim.tutorial.advance('reassembly');
      this.showLesson({ speaker: 'somchai', key: 'tutorial.lesson.teardown_done' });
      return;
    }
    const l = this.teacher.lessonFor(phase, h.textKey);
    if (l) this.showLesson(l);
  }

  private async tutorialAfterTest(): Promise<void> {
    const sim = this.sim!;
    this.exitRepair();
    this.dropActiveJob();
    sim.tutorial.finishWreck();
    sim.tutorial.advance('first_customer');
    this.lesson?.destroy(true);
    this.lesson = null;
    await this.sayScript(TUTORIAL_AFTER_TEST);
    const c = sim.tutorial.createFirstCustomer();
    this.stall.customerArrives(c, 'counter');
    this.sfx('customer_bell');
    this.prompt = { text: t('tutorial.first_customer.counter'), icon: 'mouse' };
    this.markDirty();
  }

  /* ================================================================== counter / quotes */

  private openCounter(c: Customer): void {
    if (this.counterPanel || this.busy) return;
    const sim = this.sim!;
    const ui: CounterUi = { clues: [], selected: null, counter: null };
    this.prompt = null;
    this.audio.speak(line(c.greeting), (c.voice as VoiceId) ?? 'customer_a');
    this.stall.setTalking(c.id);
    window.setTimeout(() => this.stall.setTalking(null), 1800);
    const refresh = (): void => this.counterPanel?.handle.update(customerPanelProps(sim, c, ui));
    const handle = mountCustomerPanel(this.ui.layers.panels, customerPanelProps(sim, c, ui), {
      onDiagnose: (action) => {
        const clue = sim.inspect(c.id, ACTION_TO_TOOL[action]);
        if (!clue.available) return;
        this.sfx(action === 'inspect' ? 'ui_click' : 'multimeter_beep');
        clue.lines.forEach((l, i) => ui.clues.push({ id: `${action}:${ui.clues.length}:${i}`, text: line(l), source: action, tone: 'neutral' }));
        if (clue.ammeter) ui.clues.push({ id: `${action}:amp`, text: t(`repair.ammeter.${clue.ammeter.pattern}`), source: action, value: `${clue.ammeter.amps.toFixed(2)} A`, tone: clue.ammeter.pattern === 'charging_ok' ? 'ok' : 'warn' });
        if (clue.battery?.present) ui.clues.push({ id: `${action}:bat`, text: t('game.battery_clue', { cycles: clue.battery.cycles }), source: action, value: `${clue.battery.healthPct}%`, tone: clue.battery.healthPct < 80 ? 'warn' : 'ok' });
        if (clue.confirmed) ui.selected = clue.confirmed;
        refresh();
      },
      onSelectDiagnosis: (id) => {
        ui.selected = id;
        refresh();
      },
      onPriceChange: () => undefined,
      onPropose: (price, diagnosis) => {
        const out = sim.proposeQuote(c.id, diagnosis, price);
        if (out.type === 'accepted') this.onQuoteAccepted(c, out.order, line(out.line));
        else if (out.type === 'counter') {
          ui.counter = { price: out.price, yourPrice: price, text: line(out.line) };
          this.audio.speak(line(out.line), (c.voice as VoiceId) ?? 'customer_a');
          refresh();
        } else if (out.type === 'refused') {
          this.toast('warn', line(out.line), 'thumb_down');
          this.sfx('review_bad');
          this.closeCounter();
        } else this.message('error', out.reason);
      },
      onDecline: () => {
        sim.dismissCustomer(c.id);
        this.closeCounter();
      },
      onAcceptCounter: () => {
        const order = sim.acceptCounter(c.id);
        if (order) this.onQuoteAccepted(c, order, '');
      },
      onRefuseCounter: () => {
        ui.counter = null;
        refresh();
      },
      onLeave: () => this.closeCounter(),
    });
    this.counterPanel = { handle, ui, customerId: c.id };
    this.markDirty();
  }

  private closeCounter(): void {
    this.counterPanel?.handle.destroy();
    this.counterPanel = null;
    this.markDirty();
  }

  private onQuoteAccepted(c: Customer, order: Order, text: string): void {
    const sim = this.sim!;
    this.closeCounter();
    this.sfx('order_notify');
    this.toast('success', text || t('game.order_accepted', { name: c.name }), 'clipboard');
    if (order.customerPresent) {
      // the customer waits nearby
      this.stall.visitorLeaves(c.id, 'idle');
      this.stall.pickupArrives(order.id, order.persona);
    } else this.stall.visitorLeaves(c.id, 'happy');
    this.syncRack();
    if (sim.tutorial.phase() === 'first_customer') {
      this.prompt = { text: t('tutorial.first_customer.accepted'), icon: 'mouse' };
    }
    if (!this.activeJobId) {
      this.activeJobId = order.id;
      this.ensurePhoneVisual(order.id);
      this.syncRack();
    }
    this.autosave();
    this.markDirty();
  }

  /* ================================================================== delivery */

  deliver(orderId: string): void {
    const sim = this.sim!;
    if (this.busy) return;
    const order = sim.order(orderId);
    const out = sim.deliver(orderId);
    if (!out.ok) {
      this.message('error', out.reason);
      this.sfx('error');
      return;
    }
    if (this.activeJobId === orderId) this.dropActiveJob();
    this.syncRack();
    this.showDelivery(out, order);
  }

  private showDelivery(res: DeliveryResult, order: Order | null): void {
    const sim = this.sim!;
    this.busy = true;
    this.sfx('cash');
    this.coins(18);
    this.sfx(res.stars >= 4 ? 'review_good' : res.stars <= 2 ? 'review_bad' : 'star');
    const before = sim.reputation() - res.reputationDelta;
    const modal = this.ui.openModal(
      (p) =>
        mountDeliveryResult(
          p,
          {
            customerName: res.review.name,
            customerColor: colorFromString(res.review.name),
            phoneName: modelName(res.review.modelId),
            jobLabel: order?.diagnosed.map((f) => t(`faults.${f}.name`)).join(' + '),
            payment: res.paid,
            tip: res.tip,
            stars: res.stars,
            reviewText: res.review.text.map(line).join(' '),
            factors: res.factors.filter((f) => Math.abs(f.delta) > 0.01).slice(0, 6).map((f) => ({ text: t(`game.factor.${f.factor}`), positive: f.delta >= 0 })),
            reputationBefore: before,
            reputationAfter: sim.reputation(),
            instant: this.settings.reduceMotion,
          },
          { onContinue: () => modal.close() },
        ),
      {
        dismissible: false,
        onClosed: () => {
          this.busy = false;
          this.stall.visitorLeaves(`pickup:${res.orderId}`, res.stars >= 3 ? 'happy' : 'angry');
          this.autosave();
          void this.tutorialAfterDelivery();
          this.markDirty();
        },
      },
    );
    this.audio.speak(line(res.line), (order?.persona.voice as VoiceId) ?? 'customer_a');
  }

  private async tutorialAfterDelivery(): Promise<void> {
    const sim = this.sim!;
    if (sim.tutorial.phase() !== 'first_customer') return;
    sim.tutorial.advance('first_purchase');
    this.prompt = null;
    await this.say([{ speaker: 'somchai', name: t('tutorial.speaker.somchai'), text: t('tutorial.first_customer.delivered'), voice: 'somchai' }]);
    await this.sayScript(TUTORIAL_PURCHASE);
    this.prompt = { text: t('game.prompt.open_tablet'), icon: 'tablet', kbd: keyLabel(this.settings.keys.tablet) };
    this.markDirty();
  }

  private async tutorialAfterPurchase(): Promise<void> {
    const sim = this.sim!;
    if (sim.tutorial.phase() !== 'first_purchase') return;
    this.closeTablet();
    this.prompt = null;
    await this.sayScript(TUTORIAL_BYE);
    sim.tutorial.advance('done');
    this.stall.showSomchai(false);
    this.sfx('day_start');
    this.autosave();
    this.markDirty();
  }

  /* ================================================================== bench / repair */

  private syncRack(): void {
    if (!this.sim || !this.stall.shop) return;
    this.stall.syncRack(this.sim.state, this.activeJobId, phoneColorHex);
  }

  private clearPhoneVisual(): void {
    if (this.repair?.active) this.repair.close();
    this.visual?.dispose();
    this.visual = null;
    this.visualJobId = null;
    this.screen = null;
  }

  private dropActiveJob(): void {
    if (this.mode === 'repair') this.exitRepair();
    this.clearPhoneVisual();
    this.activeJobId = null;
    this.syncRack();
  }

  private jobData(id: string): { modelId: string; phone: Order['phone']; goal: Order['goal']; tutorial: boolean; persona: Order['persona'] | null; dueAt: number | null } | null {
    const ref = this.sim?.job(id);
    if (!ref) return null;
    if (ref.type === 'order') return { modelId: ref.job.modelId, phone: ref.job.phone, goal: ref.job.goal, tutorial: ref.job.kind === 'tutorial', persona: ref.job.persona, dueAt: ref.job.dueAt };
    return { modelId: ref.job.modelId, phone: ref.job.phone, goal: ref.job.goal, tutorial: false, persona: null, dueAt: null };
  }

  /** Puts the phone of a job on the bench (closed, as seen from the stall view). */
  private ensurePhoneVisual(id: string): void {
    if (this.visualJobId === id && this.visual) return;
    const job = this.jobData(id);
    if (!job) return;
    this.clearPhoneVisual();
    const sim = this.sim!;
    const def = phoneDef(job.modelId);
    this.bench.setMatCells(sim.repairContext().matCells);
    // open the view once to build the visual, then leave it on the bench
    this.repair.open({ def, phone: job.phone, goal: job.goal, ctx: sim.repairContext({ tutorial: job.tutorial }), rng: new RNG(sim.state.rng ^ hashString(id)) });
    this.visual = this.repair.close();
    this.visualJobId = id;
    if (this.visual) {
      this.screen = new PhoneScreenDriver(this.visual, def, job.phone, () => {
        const h = sim.state.time;
        return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
      });
    }
  }

  /** Sit down at the bench and work on a job. */
  enterRepair(id?: string): void {
    const sim = this.sim;
    if (!sim || this.busy || this.mode === 'repair') return;
    let jobId = id ?? this.activeJobId;
    if (!jobId) {
      const jobs = [...sim.orders().filter((o) => o.status === 'queued' || o.status === 'in_progress'), ...sim.ownedPhones().filter((o) => o.status === 'broken' || o.status === 'in_progress')];
      if (jobs.length === 1) jobId = jobs[0]!.id;
      else {
        if (jobs.length === 0) this.toast('info', t('game.no_jobs'), 'clipboard');
        else this.openTablet('orders');
        return;
      }
    }
    if (this.activeJobId && this.activeJobId !== jobId) sim.pauseRepair(this.activeJobId);
    const job = this.jobData(jobId);
    if (!job) return;
    if (!job.tutorial) {
      const res = sim.startRepair(jobId);
      if (!res.ok) {
        this.message('error', res.reason, res.params);
        return;
      }
    }
    this.closeTablet();
    this.activeJobId = jobId;
    this.ensurePhoneVisual(jobId);
    const def = phoneDef(job.modelId);
    this.repair.guide = job.tutorial ? true : this.settings.guide;
    if (this.repair.guide) this.guideUsed.set(jobId, true);
    this.repair.open({ def, phone: job.phone, goal: job.goal, ctx: sim.repairContext({ tutorial: job.tutorial }), rng: new RNG((sim.state.rng ^ hashString(jobId)) + Math.floor(sim.state.time * 1000)) }, this.visual ?? undefined);
    this.prompt = null;
    this.setMode('repair');
    this.mountRepairUi();
    this.syncRack();
  }

  /** Encyclopedia: a pristine unit of the model floats apart over the empty bench. */
  showExploded(modelId: string): void {
    const sim = this.sim;
    if (!sim || this.busy || this.mode !== 'stall' || this.activeJobId) return;
    const def = phoneDef(modelId);
    this.clearPhoneVisual();
    const phone = createPhone(def, `exhibit-${modelId}`, 0);
    phone.poweredOn = false;
    this.exhibit = true;
    this.repair.guide = false;
    this.repair.open({ def, phone, goal: emptyGoal(), ctx: { tools: {}, errorMult: 1, strict: true, matCells: 8 }, rng: new RNG(1) });
    this.visual = this.repair.visual;
    this.visualJobId = null;
    this.repair.selectTool(null);
    this.setMode('repair');
    this.prompt = { text: t('game.prompt.exploded', { name: modelName(modelId) }), icon: 'explode', kbd: keyLabel(this.settings.keys.back) };
    window.setTimeout(() => this.exhibit && this.repair.explode(1), 700);
  }

  exitRepair(): void {
    if (this.mode !== 'repair') return;
    if (this.exhibit) {
      this.exhibit = false;
      this.repair.close();
      this.visual?.dispose();
      this.visual = null;
      this.hintObjective = null;
      this.prompt = null;
      this.setMode('stall');
      return;
    }
    const sim = this.sim!;
    this.repair.close();
    this.hotbar?.destroy();
    this.hotbar = null;
    this.repairPanel?.destroy();
    this.repairPanel = null;
    this.setGauge(null);
    this.hintObjective = null;
    this.focus = 0;
    if (this.activeJobId && !this.jobData(this.activeJobId)?.tutorial) sim.pauseRepair(this.activeJobId);
    this.setMode('stall');
    this.autosave();
  }

  private repairHost(): RepairHost {
    return {
      sfx: (n, o) => this.sfx(n, o),
      loop: (n, on, i) => this.audio.loop(n as LoopName, on, i),
      message: (kind, key, params) => this.message(kind, key, params),
      outline: (ch, objs) => this.engine.setOutline(ch, objs),
      tooltip: (d) => this.showTooltip(d),
      gauge: (g) => this.setGauge(g),
      hint: (h) => this.onHint(h),
      choosePart: (comp) => this.choosePart(comp),
      tool: (id, tier) => {
        try {
          const m = buildTool(id, Math.max(1, tier));
          return { root: m.root, update: m.update ? (dt, a) => m.update!(dt, a) : undefined };
        } catch {
          return null;
        }
      },
      solder: (faultId) => this.solder(faultId),
      onRepairEvent: (ev) => this.onRepairEvent(ev),
      onStateChanged: () => this.markDirty(),
      setFocus: (a) => (this.focus = a),
      breeze: () => ((this.sim?.state.tools.fan ?? 1) >= 2 ? 0.4 : 1),
      reduceMotion: () => this.settings.reduceMotion,
    };
  }

  private onRepairEvent(ev: RepairEvent): void {
    const sim = this.sim;
    if (!sim) return;
    if (ev.type === 'encyclopedia' && ev.id && sim.unlockEncyclopedia(ev.id)) {
      const [, compId] = ev.id.split(':');
      const def = this.repair.session?.model.comps.get(compId ?? '');
      this.sfx('unlock');
      this.ui.toast({ kind: 'info', text: t('game.encyclopedia_new', { name: def ? t(def.nameKey) : '' }), icon: 'book', duration: 1500, silent: true });
    }
    if (ev.type === 'power_on') this.screen?.boot();
  }

  private onHint(h: Hint | null): void {
    this.lastHint = h;
    if (h) {
      this.hintObjective = { title: t('game.guide'), text: tr(h.textKey, h.params), icon: h.tool ? (TOOL_ICON[h.tool] ?? 'target') : 'target' };
      if (this.activeJobId) this.guideUsed.set(this.activeJobId, true);
    } else this.hintObjective = null;
    this.tutorialOnHint(this.repair?.hint ?? h);
    this.markDirty();
  }

  private showTooltip(d: TooltipData | null): void {
    if (!d) {
      this.tooltip.hide();
      return;
    }
    const lines = d.lines.map((l) => tr(l.key, l.params));
    this.tooltip.show({ kind: 'text', title: t(d.nameKey), text: lines.join(' · ') || undefined }, d.x, d.y);
  }

  private setGauge(g: GaugeData | null): void {
    if (!g) {
      this.gauge?.handle.destroy();
      this.gauge = null;
      return;
    }
    let spec: GaugeSpec;
    let v: GaugeValues;
    switch (g.kind) {
      case 'unscrew':
        spec = { kind: 'torque', mode: 'unscrew', green: [0, 1] };
        v = { value: g.progress, progress: g.progress };
        break;
      case 'torque':
        spec = { kind: 'torque', mode: 'screw', green: [g.loose / g.max, g.over / g.max] };
        v = { value: g.value / g.max };
        break;
      case 'temp':
        spec = { kind: 'temperature', min: 25, max: g.max, ideal: [g.soft, g.danger - 10], danger: g.danger };
        v = { value: g.temp };
        break;
      case 'tab':
        spec = { kind: 'tension', safe: g.safe / 1.5 };
        v = { value: g.speed / 1.5, progress: g.progress };
        break;
      case 'clean':
        spec = { kind: 'clean' };
        v = { value: g.pct / 100 };
        break;
      case 'depth':
        spec = { kind: 'pick', danger: 0.6 };
        v = { value: g.depth, risky: g.danger };
        break;
      case 'ammeter':
        spec = { kind: 'multimeter' };
        v = { value: g.reading.amps, note: t(`repair.ammeter.${g.reading.pattern}`) };
        break;
      default:
        spec = { kind: 'clean', label: t(g.labelKey) };
        v = { value: g.value };
    }
    const key = JSON.stringify(spec);
    if (this.gauge?.key !== key) {
      this.gauge?.handle.destroy();
      const handle = mountGauge(this.ui.layers.hud, spec);
      handle.dock();
      this.gauge = { key, handle };
    }
    this.gauge.handle.update(v);
  }

  private choosePart(comp: ComponentDef): Promise<Exclude<PartQuality, 'factory'> | null> {
    const sim = this.sim!;
    const modelId = this.repair.job?.def.id ?? 'fone8';
    return new Promise((resolve) => {
      let done = false;
      const finish = (q: Exclude<PartQuality, 'factory'> | null): void => {
        if (done) return;
        done = true;
        modal.close();
        resolve(q);
      };
      const modal = this.ui.openModal(
        (p) =>
          mountPartPicker(p, partPickerProps(sim, modelId, comp), {
            onPick: (q) => {
              if (!sim.consumePart(modelId, comp.partCategory, q)) {
                this.message('error', 'economy.err.no_part');
                return;
              }
              finish(q);
            },
            onOrder: (q, express) => {
              const res = sim.buyPart(modelId, comp.partCategory, q, { express });
              if (!res.ok) this.message('error', res.reason, res.params);
              else {
                this.sfx('purchase');
                this.toast('success', t(express ? 'game.part_ordered_express' : 'game.part_ordered'), 'boat');
                modal.content.update(partPickerProps(sim, modelId, comp));
              }
            },
            onCancel: () => finish(null),
          }),
        { onDismiss: () => finish(null) },
      );
    });
  }

  private mountRepairUi(): void {
    this.hotbar?.destroy(true);
    this.repairPanel?.destroy(true);
    this.hotbar = mountHotbar(this.ui.layers.hud, this.hotbarProps(), {
      onSelect: (id) => {
        this.repair.selectTool(id === 'hand' || this.repair.tool === id ? null : (id as ToolId));
        this.markDirty();
      },
      onSelectBit: (bit) => this.repair.setBit(bit),
    });
    this.repairPanel = mountRepairPanel(this.ui.layers.hud, this.repairPanelProps(), {
      onFlip: () => this.repair.flip(),
      onFinalTest: () => void this.runFinalTest(),
      onExit: () => this.exitRepair(),
      onPickScrew: (id) => {
        if (this.repair.tool !== 'driver') this.repair.selectTool('driver');
        this.repair.perform({ t: 'pickScrew', screw: id });
      },
    });
  }

  private hotbarProps(): Parameters<typeof mountHotbar>[1] {
    const s = this.repair.session;
    const hintTool = this.repair.guide ? this.lastHint?.tool : null;
    return {
      tools: [
        {
          id: 'hand',
          name: t('game.hand'),
          icon: 'tool_hand',
          tier: 1,
          maxTier: 1,
          state: 'ok' as const,
          suggested: this.repair.guide && !!this.lastHint?.action && this.lastHint.tool === null && this.repair.tool !== null,
        },
        ...HAND_TOOLS.map((id) => {
          const tier = s?.tool(id) ?? 0;
          return {
            id,
            name: t(`tools.${id}.name`),
            icon: TOOL_ICON[id] ?? 'tool_hand',
            tier,
            maxTier: 3,
            state: tier > 0 ? ('ok' as const) : ('missing' as const),
            suggested: hintTool === id && this.repair.tool !== id,
          };
        }),
      ],
      selectedId: this.repair.tool ?? 'hand',
      bits: this.repair.tool === 'driver' ? { options: BITS, selected: this.repair.bit, suggested: this.repair.guide ? this.lastHint?.bit : undefined } : null,
    };
  }

  private repairPanelProps(): Parameters<typeof mountRepairPanel>[1] {
    const sim = this.sim!;
    const job = this.jobData(this.activeJobId ?? '');
    const s = this.repair.session;
    const ph = job?.phone;
    const screws = ph ? Object.values(ph.screws) : [];
    const held = screws.find((x) => x.loc.k === 'held');
    const grid = matGrid(s?.ctx.matCells ?? 8);
    return {
      phone: { model: job ? modelName(job.modelId) : '', colorHex: job ? phoneColorHex(job.modelId, job.phone.color) : undefined },
      customer: job?.persona ? { name: job.persona.name, color: colorFromString(job.persona.name) } : undefined,
      goals: job && ph ? goalItems(sim, job.modelId, job.goal, ph) : [],
      mistakes: (ph?.mistakes ?? []).map((m, i) => ({ id: `${i}`, text: tr(`repair.mistake.${m.key}`, m.params), severity: m.severity })),
      screws: {
        held: held ? { id: held.id, type: held.type, length: held.length, stripped: held.stripped } : null,
        mat: screws.filter((x) => x.loc.k === 'mat').map((x) => ({ id: x.id, type: x.type, length: x.length, stripped: x.stripped, cell: (x.loc as { cell: number }).cell })),
        matCells: grid.cells,
        matCols: grid.cols,
        bench: screws.filter((x) => x.loc.k === 'bench').length,
        lost: screws.filter((x) => x.loc.k === 'lost').length,
      },
      side: ph?.orientation ?? 'front',
      keys: { flip: keyLabel(this.settings.keys.flip), back: keyLabel(this.settings.keys.back) },
    };
  }

  /* ================================================================== final test */

  async runFinalTest(): Promise<void> {
    const sim = this.sim!;
    const jobId = this.activeJobId;
    const job = jobId ? this.jobData(jobId) : null;
    if (!job || !jobId || this.busy || !this.screen) return;
    this.busy = true;
    this.repair.selectTool(null);
    const items: FinalTestItem[] = [];
    const wait = (s: number): Promise<void> => new Promise((r) => window.setTimeout(r, this.settings.reduceMotion ? 30 : s * 1000));
    let modal: ReturnType<UIRoot['openModal']> | null = null;
    const props = (report: TestReport | null, instant: boolean): Parameters<typeof mountFinalTest>[1] => ({
      phoneName: modelName(job.modelId),
      customerName: job.persona?.name,
      items: [...items],
      issues: report ? this.testIssues(report) : [],
      score: report?.score ?? 0,
      instant,
      runId: jobId,
    });
    const onStep = (fn: FunctionId, status: TestStatus): void => {
      items.push({ fn, status });
      this.sfx(status === 'pass' ? 'test_pass' : status === 'fail' ? 'test_fail' : 'ui_tab');
      if (fn === 'vibration' && status === 'pass') this.sfx('phone_vibrate');
      if (fn === 'speaker' && status === 'pass') this.sfx('phone_speaker_test');
      if (fn === 'rearCamera' && status === 'pass') this.sfx('camera_shutter');
    };
    const report = await this.screen.runTest(onStep, wait);
    // dead-on-arrival spares reveal themselves now
    const dead = sim.flagDeadParts(jobId);
    if (dead.length) this.toast('warn', t('game.dead_part'), 'warn');
    const tutorial = job.tutorial;
    const closedOk = report.closed && report.leftoverParts.length === 0;
    modal = this.ui.openModal(
      (p) =>
        mountFinalTest(p, { ...props(report, true), deliverDisabled: closedOk ? undefined : t('game.test_not_closed') }, {
          onBack: () => modal?.close(),
          onDeliver: () => {
            modal?.close();
            if (tutorial) {
              void this.tutorialAfterTest();
              return;
            }
            const res = sim.markReady(jobId, { guideUsed: this.guideUsed.get(jobId) ?? false });
            if (!res.ok) {
              this.message('error', res.reason, res.params);
              return;
            }
            this.sfx('success');
            this.exitRepair();
            const order = sim.order(jobId);
            if (order?.customerPresent) this.deliver(jobId);
            else {
              this.toast('success', t('game.ready_for_pickup'), 'check_circle');
              this.dropActiveJob();
            }
          },
        }),
      { onClosed: () => (this.busy = false) },
    );
    this.repair.refreshHint();
    this.markDirty();
  }

  private testIssues(r: TestReport): FinalTestIssue[] {
    const out: FinalTestIssue[] = [];
    if (r.missingScrews) out.push({ kind: 'missingScrews', count: r.missingScrews, severity: r.missingScrews > 2 ? 2 : 1 });
    if (r.looseScrews) out.push({ kind: 'looseScrews', count: r.looseScrews, severity: 1 });
    if (r.strippedScrews) out.push({ kind: 'strippedScrews', count: r.strippedScrews, severity: 1 });
    if (r.leftoverParts.length) out.push({ kind: 'leftoverParts', count: r.leftoverParts.length, severity: 3 });
    if (!r.closed) out.push({ kind: 'notClosed', severity: 3 });
    else if (!r.waterSeal) out.push({ kind: 'waterSeal', severity: 1 });
    if (r.cleanliness < 0.9) out.push({ kind: 'dirty', severity: 1 });
    return out;
  }

  /** Micro-soldering minigame for a board fault of the phone on the bench. */
  solder(faultId: string): void {
    const s = this.repair.session;
    if (!s || this.busy) return;
    const check = s.can({ t: 'solder', fault: faultId, quality: 1 });
    if (!check.ok) {
      this.message('error', check.reason, check.params);
      return;
    }
    const fault = s.phone.boardFaults.find((f) => f.id === faultId);
    if (!fault) return;
    this.busy = true;
    this.ui.clearToasts();
    this.audio.loop('microscope_hum', true, 0.5);
    const modal = this.ui.openModal(
      (p) =>
        mountSolderGame(
          p,
          { faultKind: fault.kind, toolTier: (s.tool('solder') >= 2 ? 2 : 1) as 1 | 2, steadiness: Math.max(0.2, 1 - (s.ctx.errorMult - 1)) },
          {
            onDone: (quality) => {
              modal.close();
              this.repair.perform({ t: 'solder', fault: faultId, quality });
            },
            onSfx: (name) => this.sfx(name),
          },
        ),
      {
        dismissible: false,
        onClosed: () => {
          this.busy = false;
          this.audio.loop('microscope_hum', false);
        },
      },
    );
  }

  /* ================================================================== tablet */

  openTablet(tab?: TabletProps['tab']): void {
    const sim = this.sim;
    if (!sim || this.tablet || this.busy || this.mode === 'menu') return;
    if (tab) this.tabletTab = tab;
    if (sim.tutorial.phase() === 'first_purchase') {
      this.tabletTab = 'catalog';
      this.tabletCatalogTab = 'tools';
      this.prompt = null;
    }
    const props = (): TabletProps => tabletProps(sim, { tab: this.tabletTab, catalogTab: this.tabletCatalogTab, activeId: this.activeJobId, closeKey: keyLabel(this.settings.keys.tablet) });
    const refresh = (): void => {
      this.tablet?.content.update(props());
      this.markDirty();
    };
    const act = (res: { ok: boolean; reason?: string; params?: Record<string, string | number> }, okSfx: string): boolean => {
      if (!res.ok) {
        this.message('error', res.reason ?? '', res.params);
        this.sfx('error');
        return false;
      }
      this.sfx(okSfx);
      refresh();
      return true;
    };
    const modal = this.ui.openModal(
      (p) =>
        mountTablet(p, props(), {
          onClose: () => this.closeTablet(),
          onTabChange: (tb, ct) => {
            this.tabletTab = tb;
            this.tabletCatalogTab = ct;
            refresh();
          },
          onRepairOrder: (id) => this.enterRepair(id),
          onDeliverOrder: (id) => {
            this.closeTablet();
            this.deliver(id);
          },
          onAssignAssistant: () => refresh(),
          onBuyTool: (id) => {
            if (!act(sim.buyTool(id), 'purchase')) return;
            this.coins(6);
            this.stall.syncShop(sim.state);
            this.bench.setMatCells(sim.repairContext().matCells);
            void this.tutorialAfterPurchase();
          },
          onOrderPart: (modelId, category, quality, qty, express) => act(sim.buyPart(modelId, category as ComponentDef['partCategory'], quality, { express, qty }), 'purchase'),
          onBuyDecor: (id) => act(sim.buyDecor(id), 'purchase'),
          onBuyExpansion: () => {
            if (act(sim.buyStage(), 'purchase')) this.toast('success', t('game.construction_started'), 'hammer');
          },
          onSetAwningColor: (c) => {
            sim.setCustomization({ awningColor: c });
            this.stall.syncShop(sim.state);
            refresh();
          },
          onSetWallColor: (c) => {
            sim.setCustomization({ accentColor: c });
            this.stall.syncShop(sim.state);
            refresh();
          },
          onRenameShop: (name) => {
            sim.setCustomization({ shopName: name });
            this.stall.syncShop(sim.state);
            refresh();
          },
          onPlaceDecor: (itemId) => {
            const inst = sim.state.decor.find((d) => d.itemId === itemId && !d.placed);
            if (!inst) return;
            this.closeTablet();
            this.enterDecor();
            this.decor?.select(inst.uid);
          },
          onRepairUsedPhone: (id) => this.enterRepair(id),
          onListUsedPhone: (id) => act(sim.listForSale(id), 'success'),
          onUnlistUsedPhone: () => refresh(),
          onBuyMarketPhone: (id) => {
            if (act(sim.buyUsed(id), 'purchase')) this.syncRack();
          },
          onOpenEncyclopediaEntry: () => undefined,
          onExplodedView: (modelId) => {
            if (this.mode === 'repair' && !this.exhibit && this.repair.job?.def.id === modelId) {
              this.closeTablet();
              this.repair.explode(1);
              window.setTimeout(() => this.repair.explode(0), 4500);
            } else if (this.mode === 'stall' && !this.activeJobId) {
              this.closeTablet();
              this.showExploded(modelId);
            } else this.toast('info', t('game.exploded_needs_bench'), 'explode');
          },
          onHireAssistant: () => {
            if (act(sim.hireAssistant(true), 'purchase')) this.stall.showAssistant(true, false);
          },
          onFireAssistant: () => {
            if (act(sim.hireAssistant(false), 'ui_click')) this.stall.showAssistant(false, false);
          },
        }),
      { backdrop: 'dim', trapFocus: false, onClosed: () => (this.tablet = null) },
    );
    this.tablet = modal;
  }

  closeTablet(): void {
    this.tablet?.close();
    this.tablet = null;
  }

  /* ================================================================== decoration mode */

  private decorProps(): DecorModeProps {
    const sim = this.sim!;
    const cat = sim.catalog().decor;
    const stock = new Map<string, number>();
    for (const d of sim.state.decor) if (!d.placed) stock.set(d.itemId, (stock.get(d.itemId) ?? 0) + 1);
    const sel = this.decor?.selected ? sim.state.decor.find((d) => d.uid === this.decor?.selected) : undefined;
    const selDef = sel ? cat.find((d) => d.id === sel.itemId) : undefined;
    return {
      money: sim.state.money,
      categories: [...new Set(cat.map((d) => d.category))].map((c) => ({ id: c, name: t(`decor.categories.${c}`) })),
      items: cat.map((d) => ({
        id: d.id,
        name: t(d.nameKey),
        category: d.category,
        atmosphere: d.atmosphere,
        price: d.price,
        stock: stock.get(d.id) ?? 0,
        locked: d.locked && d.locked !== 'economy.err.no_money' ? t(d.locked, { stage: d.stageMin }) : undefined,
      })),
      selectedId: sel?.itemId ?? null,
      atmosphere: { value: sim.atmosphere() },
      placement: null,
      sellRefund: selDef && sel?.placed ? Math.round(selDef.price * 0.5) : null,
      keys: { rotate: keyLabel(this.settings.keys.rotate), exit: keyLabel(this.settings.keys.back) },
    };
  }

  enterDecor(): void {
    const sim = this.sim;
    if (!sim || this.busy || this.mode !== 'stall' || sim.tutorial.active()) return;
    this.closeCounter();
    this.decor?.enter();
    this.setMode('decor');
    this.decorPalette = mountDecorMode(this.ui.layers.hud, this.decorProps(), {
      onSelect: (itemId) => {
        // place from stock, buying one first when none is left
        let inst = sim.state.decor.find((d) => d.itemId === itemId && !d.placed);
        if (!inst) {
          const res = sim.buyDecor(itemId);
          if (!res.ok) {
            this.message('error', res.reason, res.params);
            this.sfx('error');
            return;
          }
          this.sfx('purchase');
          inst = sim.state.decor.find((d) => d.uid === res.uid);
        }
        if (inst) this.decor?.select(inst.uid);
        this.markDirty();
      },
      onDeselect: () => {
        this.decor?.cancel();
        this.markDirty();
      },
      onExit: () => this.exitDecor(),
    });
  }

  exitDecor(): void {
    if (this.mode !== 'decor') return;
    this.decor?.exit();
    this.decorPalette?.destroy();
    this.decorPalette = null;
    this.setMode('stall');
    this.autosave();
  }

  /* ================================================================== day end */

  private async showSummary(): Promise<void> {
    const sim = this.sim!;
    const sum = sim.state.lastSummary;
    if (!sum) return;
    if (this.mode === 'repair') this.exitRepair();
    if (this.mode === 'decor') this.exitDecor();
    this.closeTablet();
    this.closeCounter();
    this.busy = true;
    this.setMode('summary');
    this.sfx('day_end');
    const saved = this.autosave();
    await new Promise<void>((resolve) => {
      const modal = this.ui.openModal((p) => mountDaySummary(p, daySummaryProps(sim.state, sum, saved), { onNextDay: () => modal.close() }), { dismissible: false, onClosed: resolve });
    });
    const building = sim.state.construction;
    await new Promise<void>((resolve) => {
      const night = mountNightTransition(
        this.ui.layers.transition,
        { mode: building ? 'build' : 'night', day: sim.state.day + 1, building: building === 3 ? 'shop' : 'kiosk', shopName: sim.state.shopName, instant: this.settings.reduceMotion },
        {
          onCovered: () => {
            if (building) this.stall.showConstruction(building);
            if (building) {
              this.sfx('build_hammer');
              window.setTimeout(() => this.sfx('build_saw'), 500);
            }
            for (const ev of sim.startNextDay()) this.onSimEvent(ev);
            for (const o of sim.orders()) if (!o.customerPresent) this.stall.visitorLeaves(`pickup:${o.id}`);
            this.stall.syncShop(sim.state);
            this.stall.restorePeople(sim.state);
            this.syncRack();
          },
          onDone: () => {
            this.stall.showConstruction(0);
            night.destroy();
            resolve();
          },
        },
      );
    });
    this.busy = false;
    this.setMode('stall');
    this.sfx('day_start');
    this.autosave();
    this.markDirty();
  }

  closeShopEarly(): void {
    const sim = this.sim;
    if (!sim || this.busy || !sim.canCloseShop()) return;
    void this.ask(sim.state.shopName, t('game.close_shop_q'), [
      { id: 'yes', label: t('game.close_shop_yes'), icon: 'moon' },
      { id: 'no', label: t('game.close_shop_no'), icon: 'back' },
    ]).then((id) => {
      if (id === 'yes' && sim.closeShop()) void this.showSummary();
    });
  }

  /* ================================================================== saving / pause / settings */

  autosave(): boolean {
    if (!this.sim) return false;
    return this.saves.autosave(this.sim.state).ok;
  }

  togglePause(): void {
    if (!this.sim || this.mode === 'menu' || this.mode === 'boot') return;
    if (this.paused) return;
    this.paused = true;
    this.audio.setPaused(true);
    const resume = (): void => {
      this.paused = false;
      this.audio.setPaused(false);
      this.last = performance.now();
    };
    const modal = this.ui.openModal(
      (p) =>
        mountPauseMenu(
          p,
          { slots: (['slot1', 'slot2', 'slot3'] as SlotId[]).map((s) => this.slotVM(s)), shopName: this.sim?.state.shopName, day: this.sim?.state.day },
          {
            onResume: () => modal.close(),
            onSave: (slot) => {
              const res = this.saves.save(slot as SlotId, this.sim!.state);
              this.toast(res.ok ? 'success' : 'error', t(res.ok ? 'game.saved' : 'game.save.storage_failed'), 'save');
              modal.content.update({ slots: (['slot1', 'slot2', 'slot3'] as SlotId[]).map((s) => this.slotVM(s)), shopName: this.sim?.state.shopName, day: this.sim?.state.day });
            },
            onSettings: () => this.openSettings(),
            onMainMenu: () => {
              this.autosave();
              modal.close();
              this.leaveToMenu();
            },
          },
        ),
      { onClosed: resume },
    );
  }

  private leaveToMenu(): void {
    if (this.mode === 'repair') this.exitRepair();
    if (this.mode === 'decor') this.exitDecor();
    this.closeTablet();
    this.closeCounter();
    this.lesson?.destroy(true);
    this.lesson = null;
    this.clearPhoneVisual();
    this.activeJobId = null;
    this.sim = null;
    this.prompt = null;
    this.showMenu();
  }

  /** Applies and persists a settings change coming from the settings screen. */
  applySettings(next: Settings): void {
    const prev = { ...this.settings };
    Object.assign(this.settings, next);
    saveSettings(this.settings);
    if (prev.lang !== next.lang) setLang(next.lang);
    this.ui.applySettings(this.settings);
    this.audio.setVolumes(this.settings.volume);
    if (prev.quality !== next.quality) this.engine.setQuality(next.quality);
    if (this.repair?.active) this.repair.setGuide(this.settings.guide);
    this.markDirty();
  }

  openSettings(): void {
    const modal = this.ui.openModal((p) =>
      mountSettingsPanel(
        p,
        { settings: this.settings },
        {
          onChange: (next) => {
            this.applySettings(next);
            modal.content.update({ settings: this.settings });
          },
          onDetectQuality: () => {
            modal.content.update({ settings: this.settings, detecting: true });
            void this.engine.benchmark(3).then((level) => {
              this.applySettings({ ...this.settings, quality: level, benchmarkDone: true });
              modal.content.update({ settings: this.settings, detectedQuality: level, detecting: false });
            });
          },
          onClose: () => modal.close(),
        },
      ),
    );
  }

  /* ================================================================== HUD */

  private mountHud(): void {
    this.hud?.destroy(true);
    this.hud = mountHud(this.ui.layers.hud, this.hudProps(), {
      onButton: (id) => this.onHudButton(id),
      onOrderClick: (id) => {
        const o = this.sim?.order(id);
        if (o?.status === 'ready' && o.customerPresent) this.deliver(id);
        else if (this.mode === 'stall') this.enterRepair(id);
      },
    });
  }

  private onHudButton(id: HudButtonId): void {
    switch (id) {
      case 'tablet':
        if (this.tablet) this.closeTablet();
        else this.openTablet();
        break;
      case 'decor':
        if (this.mode === 'decor') this.exitDecor();
        else this.enterDecor();
        break;
      case 'back':
        if (this.mode === 'repair') this.exitRepair();
        else if (this.mode === 'decor') this.exitDecor();
        break;
      case 'flip':
        this.repair.flip();
        break;
      case 'guide':
        this.settings.guide = !this.repair.guide;
        saveSettings(this.settings);
        this.repair.setGuide(this.settings.guide);
        this.markDirty();
        break;
      case 'test':
        void this.runFinalTest();
        break;
      case 'pause':
        this.togglePause();
        break;
    }
  }

  private hudProps(): HudProps {
    const sim = this.sim!;
    const ti = sim.timeInfo();
    const repair = this.mode === 'repair';
    const buttons: HudButton[] = [];
    if (this.mode === 'stall') {
      buttons.push({ id: 'tablet', badge: sim.orders().filter((o) => o.status === 'ready').length || undefined, highlight: sim.tutorial.phase() === 'first_purchase' });
      buttons.push({ id: 'decor', disabled: sim.tutorial.active() ? t('game.after_tutorial') : undefined });
    } else if (repair && this.exhibit) {
      buttons.push({ id: 'back' });
    } else if (repair) {
      buttons.push({ id: 'back' }, { id: 'flip' }, { id: 'guide', active: this.repair.guide }, { id: 'test', highlight: !!this.lastHint?.done }, { id: 'tablet' });
    } else if (this.mode === 'decor') buttons.push({ id: 'back' });
    buttons.push({ id: 'pause' });
    const tool = repair && !this.exhibit
      ? this.repair.tool
        ? { name: t(`tools.${this.repair.tool}.name`), icon: TOOL_ICON[this.repair.tool] ?? 'tool_hand', tier: this.repair.session?.tool(this.repair.tool) ?? 1, maxTier: 3, detail: this.repair.tool === 'driver' ? this.repair.bit : undefined }
        : { name: t('game.hand'), icon: 'tool_hand' }
      : null;
    let prompt = this.prompt;
    if (!prompt && repair && !this.exhibit) prompt = { text: t('game.prompt.camera'), icon: 'mouse' };
    if (!prompt && this.mode === 'stall' && sim.canCloseShop() && !sim.customerAtCounter()) prompt = { text: t('game.prompt.close_shop'), icon: 'moon', kbd: 'N' };
    return {
      money: sim.state.money,
      reputation: sim.reputation(),
      day: ti.day,
      time: ti.time,
      weather: ti.rain > 0.3 ? 'rain' : ti.rain > 0.02 ? 'cloudy' : 'clear',
      orders: hudOrders(sim, this.activeJobId),
      buttons,
      keys: this.settings.keys,
      tool,
      objective: repair && this.repair.guide ? this.hintObjective : null,
      prompt,
      hidden: this.mode === 'summary' || this.mode === 'decor',
    };
  }

  private refreshUi(): void {
    this.uiDirty = false;
    this.uiTimer = 0;
    if (!this.sim || this.mode === 'menu' || this.mode === 'boot') return;
    this.hud?.update(this.hudProps());
    // a phone waiting on the bench: the work mat pulses to invite the click
    if (this.mode === 'stall') {
      const waiting = !!this.activeJobId && !this.busy && !this.counterPanel && !this.tablet;
      if (waiting !== this.matGlow) {
        this.matGlow = waiting;
        this.engine.setOutline('guide', waiting ? [this.bench.surface] : []);
      }
    } else this.matGlow = false;
    if (this.mode === 'decor') this.decorPalette?.update(this.decorProps());
    if (this.mode === 'repair') {
      this.hotbar?.update(this.hotbarProps());
      this.repairPanel?.update(this.repairPanelProps());
    }
    if (this.counterPanel) {
      const c = this.sim.customerAtCounter();
      if (c && c.id === this.counterPanel.customerId) this.counterPanel.handle.update(customerPanelProps(this.sim, c, this.counterPanel.ui));
    }
    const a = this.sim.state.assistant;
    if (this.stall.shop && this.sim.state.stage === 3) this.stall.showAssistant(a.hired, !!a.orderId);
  }

  /* ================================================================== input */

  private action(code: string): KeyAction | null {
    for (const [a, k] of Object.entries(this.settings.keys) as Array<[KeyAction, string]>) if (k === code) return a;
    return null;
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
      if (this.mode === 'repair') this.repair.onPointerMove(e);
      else if (this.mode === 'decor') this.decor?.onPointerMove(e);
      else if (this.mode === 'stall') this.stallHover();
    });
    c.addEventListener('pointerdown', (e) => {
      void this.audio.unlock();
      if (this.busy || this.paused) return;
      if (this.mode === 'repair' && (!this.exhibit || e.button !== 0)) this.repair.onPointerDown(e);
      else if (this.mode === 'decor') this.decor?.onPointerDown(e);
      else if (this.mode === 'stall' && e.button === 0) this.stallClick();
    });
    window.addEventListener('pointerup', (e) => {
      if (this.mode === 'repair') this.repair.onPointerUp(e);
    });
    c.addEventListener('wheel', (e) => this.mode === 'repair' && this.repair.onWheel(e), { passive: true });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.repair.onKey(e.code, false));
    window.addEventListener('blur', () => {
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) this.repair.onKey(k, false);
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (!this.sim || this.mode === 'menu' || this.mode === 'boot') return;
    const act = this.action(e.code);
    if (act === 'tablet') {
      e.preventDefault();
      if (this.tablet) this.closeTablet();
      else this.openTablet();
      return;
    }
    if (e.code === 'Space' && (this.dialogue || this.lesson)) return;
    if (act === 'pause') {
      if (this.ui.modalDepth > 0) return; // UIRoot closes the top modal on Esc
      if (this.decor?.selected) this.decor.cancel();
      else this.togglePause();
      return;
    }
    if (this.ui.modalDepth > 0 || this.busy) return;
    if (this.mode === 'repair' && this.exhibit) {
      this.repair.onKey(e.code, true);
      if (act === 'back') this.exitRepair();
      return;
    }
    if (this.mode === 'repair') {
      this.repair.onKey(e.code, true);
      const n = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : NaN;
      if (n >= 1 && n <= 9) {
        // slot 1 is the bare hand, then the tools in hotbar order (9 per page)
        const slots: Array<ToolId | null> = [null, ...HAND_TOOLS];
        const page = Math.floor(Math.max(0, slots.indexOf(this.repair.tool)) / 9);
        const idx = page * 9 + n - 1 < slots.length ? page * 9 + n - 1 : n - 1;
        const id = slots[idx];
        if (id === null) this.repair.selectTool(null);
        else if (id !== undefined) {
          if (this.repair.tool === id && id === 'driver') this.repair.cycleBit(1);
          else this.repair.selectTool(id);
        }
        this.markDirty();
      } else if (e.code === 'Digit0' || e.code === 'Backquote') {
        this.repair.selectTool(null);
        this.markDirty();
      } else if (act === 'focus') this.repair.focus();
      else if (act === 'guide') this.onHudButton('guide');
      else if (act === 'flip') this.repair.flip();
      else if (act === 'back') this.exitRepair();
      else if (e.code === 'KeyP') this.repair.togglePower();
      else if (e.code === 'KeyT') void this.runFinalTest();
      else if (e.code === 'KeyE') {
        const next = HAND_TOOLS[(HAND_TOOLS.indexOf(this.repair.tool as ToolId) + 1) % HAND_TOOLS.length];
        if (next) this.repair.selectTool(next);
        this.markDirty();
      } else if (e.code === 'KeyM') {
        const fault = this.repair.session?.phone.boardFaults[0];
        if (fault) this.solder(fault.id);
      }
    } else if (this.mode === 'decor') {
      if (act === 'rotate') this.decor?.rotate();
      else if (e.code === 'Delete' || e.code === 'Backspace') this.decor?.sellSelected();
      else if (act === 'back' || act === 'decor') this.exitDecor();
      else if (e.code === 'KeyX') this.decor?.storeSelected();
    } else if (this.mode === 'stall') {
      if (act === 'decor') this.enterDecor();
      else if (e.code === 'KeyN') this.closeShopEarly();
      else if (e.code === 'Enter') this.enterRepair();
    }
  }

  private stallPick(): ReturnType<StallScene['pick']> {
    return this.stall.pick(this.engine.camera, this.mouse);
  }

  private stallHover(): void {
    if (this.busy || this.ui.modalDepth > 0) {
      this.canvas.style.cursor = '';
      return;
    }
    const p = this.stallPick();
    this.canvas.style.cursor = p ? 'pointer' : '';
    if (p && p.kind === 'mat') this.engine.setOutline('hover', [this.bench.surface]);
    else if (p && (p.kind === 'radio' || p.kind === 'tablet' || p.kind === 'rack')) this.engine.setOutline('hover', [p.object]);
    else this.engine.setOutline('hover', []);
  }

  private stallClick(): void {
    const sim = this.sim;
    if (!sim) return;
    const p = this.stallPick();
    if (!p) return;
    switch (p.kind) {
      case 'customer': {
        const c = sim.customerAtCounter();
        if (c) this.openCounter(c);
        break;
      }
      case 'pickup': {
        const o = p.id ? sim.order(p.id) : null;
        if (!o) break;
        if (o.status === 'ready') this.deliver(o.id);
        else this.toast('info', t('game.not_ready_yet', { name: o.persona.name }), 'hourglass');
        break;
      }
      case 'mat':
        this.enterRepair();
        break;
      case 'tablet':
      case 'rack':
        this.openTablet('orders');
        break;
      case 'radio': {
        const st = this.audio.nextStation();
        this.toast('info', t(`game.radio.${st}`), 'music');
        break;
      }
    }
  }

  /* ================================================================== debug / tests */

  /**
   * Automation: plays one whole day in an instant — buys a used phone, repairs it on the bench with the
   * guide, lists it, closes the shop and starts the next morning. Exercises every create/dispose path.
   */
  simulateDay(): void {
    const sim = this.sim;
    if (!sim || sim.tutorial.active()) return;
    const listing = sim.market()[0];
    if (listing) {
      sim.state.money += listing.price;
      const res = sim.buyUsed(listing.id);
      if (res.ok && res.owned) {
        const owned = res.owned;
        for (const cat of sim.partsNeeded(owned.id)) {
          const key = `${owned.modelId}|${cat}|good`;
          sim.state.parts[key] = (sim.state.parts[key] ?? 0) + 1;
        }
        sim.state.tools.ipa = Math.max(1, sim.state.tools.ipa ?? 0);
        this.enterRepair(owned.id);
        if (this.mode === 'repair') {
          for (let i = 0; i < 6000; i++) {
            const h = this.repair.hint;
            if (!h?.action || h.done) break;
            let action = h.action;
            if (action.t === 'replace') {
              const def = this.repair.session!.model.comp(action.comp);
              if (!sim.consumePart(owned.modelId, def.partCategory, 'good')) break;
              action = { ...action, quality: 'good' };
            }
            if (!this.repair.perform(action).ok) break;
          }
          this.tweens.flush();
          sim.markReady(owned.id, { guideUsed: true });
          this.exitRepair();
          this.dropActiveJob();
          sim.listForSale(owned.id);
        }
      }
    }
    sim.state.time = 21.9;
    for (const ev of sim.advance(20, { inRepair: false })) if (ev.type !== 'day_end') this.onSimEvent(ev);
    if (sim.state.dayPhase !== 'summary') sim.closeShop();
    for (const ev of sim.startNextDay()) this.onSimEvent(ev);
    this.stall.syncShop(sim.state);
    this.stall.restorePeople(sim.state);
    this.syncRack();
    this.autosave();
  }

  /** Automation: diagnose correctly and take the job at the fair price. */
  acceptFairQuote(): boolean {
    const sim = this.sim;
    const c = sim?.customerAtCounter();
    if (!sim || !c) return false;
    this.closeCounter();
    const diagnosis = sim.diagnosisOptions(c.id).find((o) => o.faults.length === c.faults.length && o.faults.every((f) => c.faults.includes(f)));
    if (!diagnosis) return false;
    const q = sim.quoteInfo(c.id, diagnosis.id);
    if (!q) return false;
    const out = sim.proposeQuote(c.id, diagnosis.id, q.fair);
    const order = out.type === 'accepted' ? out.order : out.type === 'counter' ? sim.acceptCounter(c.id) : null;
    if (!order) return false;
    this.onQuoteAccepted(c, order, '');
    return true;
  }


  stats(): { fps: number; drawCalls: number; triangles: number; geometries: number; textures: number } {
    return { ...this.engine.stats(), fps: this.fpsAvg };
  }

  get state(): GameState | null {
    return this.sim?.state ?? null;
  }
}
