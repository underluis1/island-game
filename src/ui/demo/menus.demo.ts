import { getLang, setLang } from '../../core/i18n';
import { defaultSettings, type Settings } from '../../core/settings';
import { mountDecorMode, type DecorModeCallbacks, type DecorModeProps } from '../decor-mode';
import { mountDialogue, type DialogueProps } from '../dialogue';
import { mountCredits, mountMainMenu, mountPauseMenu, mountSplash, type MainMenuCallbacks, type MainMenuProps, type PauseCallbacks, type SaveSlotVM } from '../menus';
import { mountSettingsPanel, type SettingsPanelProps } from '../settings-panel';
import { registerDemo, type DemoCtx } from './registry';

const SLOTS: SaveSlotVM[] = [
  { id: 'auto', kind: 'auto', empty: false, shopName: 'Phi Phi Fix', day: 12, money: 12450, reputation: 3.5, phase: 'stall', savedAt: Date.UTC(2026, 10, 10, 15, 42) },
  { id: 'slot1', kind: 'manual', empty: false, shopName: 'Phi Phi Fix', day: 11, money: 9800, reputation: 3.5, phase: 'stall', savedAt: Date.UTC(2026, 10, 9, 20, 5) },
  { id: 'slot2', kind: 'manual', empty: false, shopName: 'Sabai Sabai Phones', day: 34, money: 86200, reputation: 4.5, phase: 'kiosk', savedAt: Date.UTC(2026, 10, 2, 9, 30) },
  { id: 'slot3', kind: 'manual', empty: true },
];

function settings(ctx: DemoCtx, tab?: string): void {
  let props: SettingsPanelProps = { settings: { ...defaultSettings(), lang: getLang(), keys: { ...defaultSettings().keys, flip: 'KeyC' } }, detectedQuality: 'high' };
  const m = ctx.root.openModal(
    (parent) =>
      mountSettingsPanel(parent, props, {
        onChange: (s: Settings) => {
          ctx.log('onChange', s);
          props = { ...props, settings: s };
          ctx.root.applySettings(s);
          setLang(s.lang);
          m.content.update(props);
        },
        onClose: () => m.close(),
        onDetectQuality: () => {
          props = { ...props, detecting: true };
          m.content.update(props);
          window.setTimeout(() => {
            props = { ...props, detecting: false, settings: { ...props.settings, quality: 'high' } };
            m.content.update(props);
          }, 1500);
        },
      }),
    { backdrop: 'blur' },
  );
  if (tab) window.setTimeout(() => m.content.el.querySelector<HTMLElement>(`.settings-tabs .tab:nth-child(${tab})`)?.click(), 40);
  if (ctx.params.get('listen') === '1') window.setTimeout(() => m.content.el.querySelector<HTMLElement>('.key-row:nth-child(3)')?.click(), 120);
}

function mainMenu(ctx: DemoCtx, click?: string, empty = false): void {
  ctx.setBg('sunset');
  const props = (): MainMenuProps => ({ lastSave: empty ? null : (SLOTS[0] as SaveSlotVM), slots: empty ? SLOTS.map((s) => ({ id: s.id, kind: s.kind, empty: true })) : SLOTS, lang: getLang(), version: 'v1.0.0' });
  const m = mountMainMenu(
    ctx.root.layers.panels,
    props(),
    ctx.spy<MainMenuCallbacks>({
      onLang: (l) => {
        setLang(l);
        m.update(props());
      },
      onSettings: () => settings(ctx),
      onCredits: () => {
        const c = ctx.root.openModal((p) => mountCredits(p, { version: 'v1.0.0' }, { onClose: () => c.close() }));
      },
    }),
  );
  ctx.onCleanup(() => m.destroy(true));
  if (click) window.setTimeout(() => m.el.querySelector<HTMLElement>(click)?.click(), 60);
}

const LINES: DialogueProps[] = [
  { speaker: { name: 'Lung Somchai', role: 'il tuo mentore', color: '#e58a3c' }, text: '{{Sawasdee khrap|ciao}}! Prima regola del mestiere: scollega sempre la batteria. Finché è collegata, la scheda è sotto tensione… e un cacciavite che scivola fa {{pang!|bum!}}', progress: '2 / 6' },
  { speaker: { name: 'Lung Somchai', role: 'il tuo mentore', color: '#e58a3c' }, text: 'Allora, te la senti di aprire questo vecchio Fone 8?', choices: [{ id: 'yes', label: 'Certo, cominciamo!', icon: 'tool_screwdriver' }, { id: 'explain', label: 'Spiegami ancora le viti', icon: 'screw' }, { id: 'skip', label: 'Conosco già il mestiere', hint: 'salta il tutorial' }] },
];

function dialogue(ctx: DemoCtx, i: number, subtitles = true): void {
  let idx = i;
  const d = mountDialogue(
    ctx.root.layers.panels,
    { ...(LINES[idx] as DialogueProps), subtitles },
    {
      onAdvance: () => {
        ctx.log('onAdvance');
        idx = (idx + 1) % LINES.length;
        d.update({ ...(LINES[idx] as DialogueProps), subtitles });
      },
      onChoice: (id) => ctx.log('onChoice', id),
    },
  );
  if (ctx.params.get('instant') === '1') window.setTimeout(() => d.skip(), 60);
  ctx.onCleanup(() => d.destroy(true));
}

function decor(ctx: DemoCtx, invalid = false): void {
  let props: DecorModeProps = {
    money: 4350,
    selectedId: 'd3',
    placement: invalid ? 'invalid' : 'valid',
    sellRefund: null,
    keys: { rotate: 'KeyR', exit: 'KeyB' },
    atmosphere: { value: 34, next: 50, label: 'A 50: più turisti di passaggio e mance +10%' },
    categories: [
      { id: 'plants', name: 'Piante' },
      { id: 'lights', name: 'Luci' },
      { id: 'beach', name: 'Spiaggia' },
      { id: 'signs', name: 'Insegne' },
    ],
    items: [
      { id: 'd1', name: 'Palma in vaso', category: 'plants', icon: 'palm', color: '#4fb86a', atmosphere: 4, price: 350, stock: 1 },
      { id: 'd2', name: 'Lanterna di carta', category: 'lights', icon: 'bulb', color: '#ffc145', atmosphere: 3, price: 220, stock: 2 },
      { id: 'd3', name: 'Tavola da surf', category: 'beach', icon: 'wave', color: '#18b8b0', atmosphere: 6, price: 900, stock: 0 },
      { id: 'd4', name: 'Ghirlanda phuang malai', category: 'plants', icon: 'heart', color: '#ff6f59', atmosphere: 2, price: 120, stock: 0 },
      { id: 'd6', name: 'Conchiglie giganti', category: 'beach', icon: 'sparkle', color: '#e58a3c', atmosphere: 2, price: 90, stock: 0 },
      { id: 'd8', name: 'Lucine a filo', category: 'lights', icon: 'sparkle', color: '#ffc145', atmosphere: 5, price: 480, stock: 0 },
      { id: 'd7', name: 'Acquario tropicale', category: 'beach', icon: 'drop', color: '#3f8fd0', atmosphere: 12, price: 14800, stock: 0 },
      { id: 'd5', name: 'Insegna al neon', category: 'signs', icon: 'bolt', color: '#8d7bd8', atmosphere: 9, price: 2400, stock: 0, locked: 'Richiede il Chiosco' },
      { id: 'd9', name: 'Tappeto intrecciato', category: 'beach', icon: 'tool_magmat', color: '#d8679b', atmosphere: 3, price: 260, stock: 0 },
    ],
  };
  const m = mountDecorMode(
    ctx.root.layers.hud,
    props,
    ctx.spy<DecorModeCallbacks>({
      onSelect: (id) => {
        props = { ...props, selectedId: id };
        m.update(props);
      },
      onDeselect: () => {
        props = { ...props, selectedId: null };
        m.update(props);
      },
    }),
  );
  ctx.onCleanup(() => m.destroy(true));
}

registerDemo('splash', {
  title: 'Splash / caricamento',
  bg: 'dark',
  variants: {
    loading: (ctx) => {
      const s = mountSplash(ctx.root.layers.transition, { progress: 0 }, { onStart: () => ctx.log('onStart') });
      const fixed = ctx.params.get('p');
      const steps = ['world', 'textures', 'phones', 'audio', 'shop'];
      if (fixed) s.setProgress(Number(fixed), 'ui.splash.step.phones');
      else {
        let p = 0;
        const id = window.setInterval(() => {
          p = Math.min(1, p + 0.02);
          s.setProgress(p, `ui.splash.step.${steps[Math.min(4, Math.floor(p * 5))]}`);
          if (p >= 1) {
            window.clearInterval(id);
            s.setReady();
          }
        }, 60);
        ctx.onCleanup(() => window.clearInterval(id));
      }
      ctx.onCleanup(() => s.destroy(true));
    },
    ready: (ctx) => {
      const s = mountSplash(ctx.root.layers.transition, { progress: 1, ready: true }, { onStart: () => s.destroy() });
      ctx.onCleanup(() => s.destroy(true));
    },
  },
});
registerDemo('mainmenu', {
  title: 'Menu principale',
  bg: 'sunset',
  variants: {
    main: (ctx) => mainMenu(ctx),
    new: (ctx) => mainMenu(ctx, '.mainmenu-nav > :nth-child(2)'),
    load: (ctx) => mainMenu(ctx, '.mainmenu-nav > :nth-child(3)'),
    nosaves: (ctx) => mainMenu(ctx, undefined, true),
  },
});
registerDemo('settings', {
  title: 'Impostazioni',
  variants: { graphics: (ctx) => settings(ctx), audio: (ctx) => settings(ctx, '2'), game: (ctx) => settings(ctx, '3'), controls: (ctx) => settings(ctx, '4') },
});
registerDemo('pause', {
  title: 'Pausa e crediti',
  variants: {
    pause: (ctx) => {
      const m = ctx.root.openModal((p) => mountPauseMenu(p, { slots: SLOTS.slice(1), shopName: 'Phi Phi Fix', day: 12 }, ctx.spy<PauseCallbacks>({ onResume: () => m.close(), onSettings: () => settings(ctx) })), { backdrop: 'blur' });
    },
    save: (ctx) => {
      const m = ctx.root.openModal((p) => mountPauseMenu(p, { slots: SLOTS.slice(1), shopName: 'Phi Phi Fix', day: 12 }, ctx.spy<PauseCallbacks>({ onResume: () => m.close() })), { backdrop: 'blur' });
      window.setTimeout(() => m.content.el.querySelector<HTMLElement>('.pause-body > :nth-child(2)')?.click(), 60);
    },
    credits: (ctx) => {
      const m = ctx.root.openModal((p) => mountCredits(p, { version: 'Island Fix v1.0.0' }, { onClose: () => m.close() }), { backdrop: 'blur' });
    },
  },
});
registerDemo('dialogue', {
  title: 'Dialoghi',
  variants: { line: (ctx) => dialogue(ctx, 0), choices: (ctx) => dialogue(ctx, 1), compact: (ctx) => dialogue(ctx, 1, false) },
});
registerDemo('decor', { title: 'Modalità arredamento', variants: { place: (ctx) => decor(ctx), invalid: (ctx) => decor(ctx, true) } });
