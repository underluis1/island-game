/**
 * Menu screens: splash/loading, main menu (new game / load dialogs, language), pause menu and credits.
 * The settings panel lives in settings-panel.ts.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/menus.css';
import { getLang, t, type Lang } from '../core/i18n';
import { cx, h, type Child } from './dom';
import { clamp01, formatMoney } from './format';
import { icon } from './icons';
import { sfx } from './sound';
import { defineView, type Mounted } from './view';
import { button, emptyState, panelHeader, scroll, segmented, stars, textInput, toggle } from './widgets';

/* ------------------------------------------------------------------ logo */

const LOGO_SVG =
  '<svg viewBox="0 0 140 140" aria-hidden="true">' +
  '<defs><linearGradient id="lg-sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd76a"/><stop offset=".62" stop-color="#ff9a5b"/><stop offset="1" stop-color="#ff6f59"/></linearGradient>' +
  '<clipPath id="lg-clip"><circle cx="70" cy="70" r="60"/></clipPath></defs>' +
  '<circle cx="70" cy="70" r="64" fill="#fff9ea"/><circle cx="70" cy="70" r="60" fill="url(#lg-sun)"/>' +
  '<g clip-path="url(#lg-clip)">' +
  '<path d="M38 104c4-22 3-42-6-58" fill="none" stroke="#6b4229" stroke-width="6" stroke-linecap="round"/>' +
  '<g fill="#0f918b"><path d="M32 46c-10-10-24-10-32-2 12-3 20 0 26 6z"/><path d="M32 46c2-14 14-22 28-20-11 3-17 9-20 18z"/><path d="M32 46c12-6 26-2 32 10-10-7-19-8-28-5z"/><path d="M32 46c-12 0-20 8-22 20 6-9 13-13 22-14z"/></g>' +
  '<path class="lg-wave lg-wave-a" d="M-20 100c10-7 20-7 30 0s20 7 30 0 20-7 30 0 20 7 30 0 20-7 30 0 20 7 30 0v50h-180z" fill="#18b8b0"/>' +
  '<path class="lg-wave lg-wave-b" d="M-20 112c10-6 20-6 30 0s20 6 30 0 20-6 30 0 20 6 30 0 20-6 30 0 20 6 30 0v40h-180z" fill="#0f918b"/>' +
  '</g>' +
  '<g transform="rotate(12 92 72)"><rect x="70" y="30" width="44" height="86" rx="9" fill="#17324d"/><rect x="74" y="34" width="36" height="78" rx="6" fill="#234766"/>' +
  '<rect x="85" y="36.500" width="14" height="4" rx="2" fill="#17324d"/>' +
  '<path d="M83 74l7 7 13-15" fill="none" stroke="#ffc145" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>' +
  '</svg>';

/** "Island Fix" logo: badge (sun, palm, waves, phone) + wordmark. */
export function logo(size: 'md' | 'lg' = 'lg'): HTMLElement {
  return h(
    'div',
    { class: `logo logo-${size}` },
    h('div', { class: 'logo-badge', html: LOGO_SVG, dataset: { ic: 'logo' } }),
    h('div', { class: 'logo-text' }, h('div', { class: 'logo-title' }, 'Island ', h('span', null, 'Fix')), h('div', { class: 'logo-sub' }, 'Phone Repair Simulator')),
  );
}

function waves(): HTMLElement {
  return h('div', { class: 'menu-waves', 'aria-hidden': 'true' }, h('i', { class: 'w1' }), h('i', { class: 'w2' }), h('i', { class: 'w3' }));
}

/* ------------------------------------------------------------------ splash */

export interface SplashProps {
  /** 0..1 */
  progress: number;
  /** i18n key of the current loading step (e.g. "ui.splash.step.textures") */
  labelKey?: string;
  /** loading finished: show the "click to start" button (unlocks audio) */
  ready?: boolean;
}

export interface SplashHandle extends Mounted<SplashProps> {
  setProgress(progress: number, labelKey?: string): void;
  setReady(): void;
}

export function mountSplash(parent: HTMLElement, props: SplashProps, cb: { onStart(): void }): SplashHandle {
  const view = defineView<SplashProps, { onStart(): void }>({
    name: 'splash',
    leaveMs: 600,
    render: (v) =>
      h(
        'div',
        { class: cx('splash pe', v.props.ready && 'is-ready') },
        h('div', { class: 'splash-sun' }),
        waves(),
        h(
          'div',
          { class: 'splash-center' },
          logo('lg'),
          v.props.ready
            ? button({ key: 'start', label: t('ui.splash.start'), variant: 'primary', size: 'lg', icon: 'play', class: 'splash-start', sound: 'success', onClick: () => v.cb.onStart() })
            : h(
                'div',
                { class: 'splash-load', key: 'load' },
                h('div', { class: 'splash-bar' }, h('i', { style: { width: `${(clamp01(v.props.progress) * 100).toFixed(1)}%` } })),
                h('div', { class: 'splash-label' }, h('span', null, t(v.props.labelKey ?? 'ui.splash.loading')), h('b', { class: 'num' }, `${Math.round(clamp01(v.props.progress) * 100)}%`)),
              ),
        ),
        h('div', { class: 'splash-foot' }, t('ui.splash.foot')),
      ),
  })(parent, props, cb);
  let current = props;
  return {
    get el() {
      return view.el;
    },
    update(p) {
      current = p;
      view.update(p);
    },
    destroy: (immediate) => view.destroy(immediate),
    setProgress(progress, labelKey) {
      current = { ...current, progress, labelKey: labelKey ?? current.labelKey };
      view.update(current);
    },
    setReady() {
      current = { ...current, progress: 1, ready: true };
      view.update(current);
    },
  };
}

/* ------------------------------------------------------------------ save slots */

export interface SaveSlotVM {
  /** "auto", "slot1", "slot2", "slot3" */
  id: string;
  kind: 'auto' | 'manual';
  empty: boolean;
  shopName?: string;
  day?: number;
  money?: number;
  reputation?: number;
  phase?: 'stall' | 'kiosk' | 'shop';
  /** epoch ms */
  savedAt?: number;
}

function slotTitle(s: SaveSlotVM, index: number): string {
  return s.kind === 'auto' ? t('ui.menu.autosave') : t('ui.menu.slot', { n: index });
}

function slotCard(s: SaveSlotVM, index: number, o: { selected?: boolean; disabled?: string; action?: Child; onClick?: () => void }): HTMLElement {
  const date = s.savedAt ? new Date(s.savedAt).toLocaleString(getLang(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return h(
    'div',
    {
      class: cx('slot-card card pe', s.empty && 'is-empty', o.selected && 'is-selected', o.disabled && 'is-disabled', o.onClick && 'is-clickable'),
      key: s.id,
      role: o.onClick ? 'button' : null,
      tabindex: o.onClick ? '0' : null,
      dataset: { hover: o.onClick ? '' : null, tip: o.disabled },
      onClick: () => {
        if (!o.onClick) return;
        if (o.disabled) return sfx('error');
        sfx('ui_click');
        o.onClick();
      },
    },
    h('span', { class: 'slot-card-ic' }, icon(s.kind === 'auto' ? 'rotate' : s.empty ? 'plus' : 'save')),
    h(
      'div',
      { class: 'slot-card-main' },
      h('div', { class: 'slot-card-top' }, h('span', { class: 'slot-card-kind' }, slotTitle(s, index)), date ? h('span', { class: 'slot-card-date' }, date) : null),
      s.empty
        ? h('div', { class: 'slot-card-empty' }, t('ui.menu.slotEmpty'))
        : [
            h('div', { class: 'slot-card-name ellipsis' }, s.shopName ?? ''),
            h(
              'div',
              { class: 'slot-card-meta' },
              h('span', null, icon('calendar'), t('ui.common.day', { n: s.day ?? 1 })),
              h('span', null, icon('coin'), formatMoney(s.money ?? 0)),
              h('span', null, icon(s.phase === 'shop' ? 'shop' : s.phase === 'kiosk' ? 'tab_market' : 'palm'), t(`ui.phase.${s.phase ?? 'stall'}`)),
              stars(s.reputation ?? 0, { size: 'sm' }),
            ),
          ],
    ),
    o.action ?? null,
  );
}

/* ------------------------------------------------------------------ main menu */

export interface MainMenuProps {
  /** most recent save, shown under "Continua" (null = no save: button disabled) */
  lastSave: SaveSlotVM | null;
  /** autosave + the 3 manual slots, in display order */
  slots: SaveSlotVM[];
  lang: Lang;
  version?: string;
  defaultShopName?: string;
}

export interface NewGameRequest {
  shopName: string;
  slotId: string;
  skipTutorial: boolean;
}

export interface MainMenuCallbacks {
  onContinue(): void;
  onNewGame(req: NewGameRequest): void;
  onLoad(slotId: string): void;
  onDeleteSlot?(slotId: string): void;
  onSettings(): void;
  onCredits(): void;
  onLang(lang: Lang): void;
}

interface MainMenuState {
  view: 'main' | 'new' | 'load';
  shopName: string | null;
  slotId: string | null;
  skipTutorial: boolean;
  confirmDelete: string | null;
}

export const mountMainMenu = defineView<MainMenuProps, MainMenuCallbacks, MainMenuState>({
  name: 'main-menu',
  leaveMs: 300,
  state: () => ({ view: 'main', shopName: null, slotId: null, skipTutorial: false, confirmDelete: null }),
  mounted: (v) => {
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape' && v.state.view !== 'main') {
        ev.stopPropagation();
        sfx('ui_close');
        v.set({ view: 'main', confirmDelete: null });
      }
    };
    window.addEventListener('keydown', onKey, true);
    v.onDestroy(() => window.removeEventListener('keydown', onKey, true));
  },
  render: (v) => {
    const p = v.props;
    const s = v.state;
    const manual = p.slots.filter((x) => x.kind === 'manual');
    const close = (): void => v.set({ view: 'main', confirmDelete: null });
    let dialog: HTMLElement | null = null;
    if (s.view === 'new') {
      const name = s.shopName ?? p.defaultShopName ?? t('ui.menu.defaultShop');
      const slotId = s.slotId ?? manual.find((x) => x.empty)?.id ?? manual[0]?.id ?? '';
      const target = manual.find((x) => x.id === slotId);
      const valid = name.trim().length >= 2;
      dialog = h(
        'div',
        { class: 'menu-dialog panel', key: 'new' },
        panelHeader({ title: t('ui.menu.newGame'), icon: 'sparkle', subtitle: t('ui.menu.newGameSub'), onClose: close, closeTip: t('ui.common.close') }),
        h(
          'div',
          { class: 'menu-dialog-body' },
          h('div', { class: 'section-title' }, t('ui.menu.shopName')),
          textInput({ value: name, icon: 'shop', maxLength: 22, placeholder: t('ui.menu.shopNamePlaceholder'), onInput: (val) => v.set({ shopName: val }) }),
          h('div', { class: 'menu-sign wood' }, h('b', { class: 'ellipsis' }, name.trim() || '…'), h('span', null, 'ซ่อมมือถือ')),
          h('div', { class: 'section-title' }, t('ui.menu.chooseSlot')),
          h('div', { class: 'slot-list' }, manual.map((x, i) => slotCard(x, i + 1, { selected: x.id === slotId, onClick: () => v.set({ slotId: x.id }) }))),
          target && !target.empty ? h('div', { class: 'menu-warn' }, icon('warn'), t('ui.menu.overwrite')) : null,
          h('div', { class: 'menu-row' }, toggle({ checked: s.skipTutorial, onChange: (on) => v.set({ skipTutorial: on }), label: t('ui.menu.skipTutorial') }), h('span', { class: 'muted menu-hint' }, t('ui.menu.skipTutorialHint'))),
        ),
        h(
          'footer',
          { class: 'menu-dialog-foot' },
          button({ label: t('ui.common.cancel'), variant: 'ghost', sound: 'ui_close', onClick: close }),
          button({
            label: t('ui.menu.start'),
            variant: 'primary',
            size: 'lg',
            iconEnd: 'arrow_right',
            sound: 'success',
            disabled: valid ? undefined : t('ui.menu.nameTooShort'),
            onClick: () => v.cb.onNewGame({ shopName: name.trim(), slotId, skipTutorial: s.skipTutorial }),
          }),
        ),
      );
    } else if (s.view === 'load') {
      const any = p.slots.some((x) => !x.empty);
      let mi = 0;
      dialog = h(
        'div',
        { class: 'menu-dialog panel', key: 'load' },
        panelHeader({ title: t('ui.menu.load'), icon: 'folder', subtitle: t('ui.menu.loadSub'), onClose: close, closeTip: t('ui.common.close') }),
        h(
          'div',
          { class: 'menu-dialog-body' },
          any
            ? h(
                'div',
                { class: 'slot-list' },
                p.slots.map((x) => {
                  const idx = x.kind === 'manual' ? ++mi : 0;
                  if (s.confirmDelete === x.id) {
                    return h(
                      'div',
                      { class: 'slot-card card is-confirm', key: x.id },
                      icon('trash'),
                      h('span', { class: 'grow' }, t('ui.menu.deleteConfirm', { name: x.shopName ?? '' })),
                      button({ label: t('ui.common.cancel'), size: 'sm', onClick: () => v.set({ confirmDelete: null }) }),
                      button({
                        label: t('ui.menu.delete'),
                        size: 'sm',
                        variant: 'danger',
                        onClick: () => {
                          v.set({ confirmDelete: null });
                          v.cb.onDeleteSlot?.(x.id);
                        },
                      }),
                    );
                  }
                  return slotCard(x, idx, {
                    disabled: x.empty ? t('ui.menu.slotEmpty') : undefined,
                    onClick: () => v.cb.onLoad(x.id),
                    action:
                      !x.empty && x.kind === 'manual' && v.cb.onDeleteSlot
                        ? h(
                            'span',
                            { onClick: (ev: Event) => ev.stopPropagation() },
                            button({ icon: 'trash', variant: 'ghost', size: 'sm', tip: t('ui.menu.delete'), onClick: () => v.set({ confirmDelete: x.id }) }),
                          )
                        : !x.empty
                          ? icon('chevron_right', 'slot-card-go')
                          : null,
                  });
                }),
              )
            : emptyState({ icon: 'folder', title: t('ui.menu.noSavesTitle'), text: t('ui.menu.noSavesText') }),
        ),
      );
    }
    return h(
      'div',
      { class: cx('mainmenu', dialog && 'has-dialog') },
      h(
        'div',
        { class: 'mainmenu-col pe' },
        logo('md'),
        h(
          'nav',
          { class: 'mainmenu-nav' },
          h(
            'button',
            {
              type: 'button',
              class: cx('mm-continue btn btn-primary btn-lg', !p.lastSave && 'is-disabled'),
              'aria-disabled': p.lastSave ? null : 'true',
              dataset: { tip: p.lastSave ? null : t('ui.menu.noSavesTitle') },
              onClick: () => {
                if (!p.lastSave) return sfx('error');
                sfx('success');
                v.cb.onContinue();
              },
            },
            icon('play'),
            h(
              'span',
              { class: 'mm-continue-text' },
              h('b', null, t('ui.common.continue')),
              p.lastSave ? h('span', null, `${p.lastSave.shopName ?? ''} · ${t('ui.common.day', { n: p.lastSave.day ?? 1 })} · ${formatMoney(p.lastSave.money ?? 0)}`) : null,
            ),
          ),
          button({ label: t('ui.menu.newGame'), icon: 'sparkle', size: 'lg', block: true, sound: 'ui_open', onClick: () => v.set({ view: 'new' }) }),
          button({ label: t('ui.menu.load'), icon: 'folder', size: 'lg', block: true, sound: 'ui_open', onClick: () => v.set({ view: 'load' }) }),
          button({ label: t('ui.menu.settings'), icon: 'gear', size: 'lg', block: true, sound: 'ui_open', onClick: () => v.cb.onSettings() }),
          button({ label: t('ui.menu.credits'), icon: 'scroll', size: 'lg', block: true, sound: 'ui_open', onClick: () => v.cb.onCredits() }),
        ),
        h(
          'div',
          { class: 'mainmenu-lang' },
          icon('globe'),
          segmented<Lang>({
            size: 'sm',
            value: p.lang,
            options: [
              { value: 'it', label: 'Italiano' },
              { value: 'en', label: 'English' },
            ],
            onChange: (l) => v.cb.onLang(l),
          }),
        ),
      ),
      p.version ? h('div', { class: 'mainmenu-version' }, p.version) : null,
      dialog ? h('div', { class: 'menu-overlay pe', onMousedown: (ev: Event) => ev.target === ev.currentTarget && close() }, dialog) : null,
    );
  },
});

/* ------------------------------------------------------------------ pause */

export interface PauseProps {
  /** the 3 manual slots */
  slots: SaveSlotVM[];
  /** reason why saving is not possible now (e.g. mid-repair) */
  saveDisabled?: string;
  shopName?: string;
  day?: number;
}

export interface PauseCallbacks {
  onResume(): void;
  onSave(slotId: string): void;
  onSettings(): void;
  onMainMenu(): void;
}

export const mountPauseMenu = defineView<PauseProps, PauseCallbacks, { view: 'main' | 'save' | 'quit'; saved: string | null }>({
  name: 'pause',
  state: () => ({ view: 'main', saved: null }),
  render: (v) => {
    const s = v.state;
    let body: Child;
    if (s.view === 'save') {
      body = [
        h(
          'div',
          { class: 'slot-list' },
          v.props.slots.map((x, i) =>
            slotCard(x, i + 1, {
              selected: s.saved === x.id,
              action: s.saved === x.id ? h('span', { class: 'slot-card-saved' }, icon('check'), t('ui.pause.saved')) : icon('save', 'slot-card-go'),
              onClick: () => {
                v.set({ saved: x.id });
                v.cb.onSave(x.id);
              },
            }),
          ),
        ),
        button({ label: t('ui.common.back'), icon: 'chevron_left', variant: 'ghost', onClick: () => v.set({ view: 'main' }) }),
      ];
    } else if (s.view === 'quit') {
      body = [
        h('div', { class: 'menu-warn' }, icon('warn'), t('ui.pause.quitConfirm')),
        h('div', { class: 'menu-row is-end' }, button({ label: t('ui.common.cancel'), onClick: () => v.set({ view: 'main' }) }), button({ label: t('ui.pause.mainMenu'), variant: 'danger', icon: 'exit', onClick: () => v.cb.onMainMenu() })),
      ];
    } else {
      body = [
        button({ label: t('ui.pause.resume'), icon: 'play', variant: 'primary', size: 'lg', block: true, kbd: 'Escape', sound: 'ui_close', onClick: () => v.cb.onResume() }),
        button({ label: t('ui.pause.save'), icon: 'save', size: 'lg', block: true, disabled: v.props.saveDisabled, onClick: () => v.set({ view: 'save', saved: null }) }),
        button({ label: t('ui.menu.settings'), icon: 'gear', size: 'lg', block: true, sound: 'ui_open', onClick: () => v.cb.onSettings() }),
        button({ label: t('ui.pause.mainMenu'), icon: 'exit', size: 'lg', block: true, onClick: () => v.set({ view: 'quit' }) }),
      ];
    }
    return h(
      'div',
      { class: 'pause panel', role: 'dialog' },
      h('div', { class: 'pause-plate wood' }, icon('pause'), t(s.view === 'save' ? 'ui.pause.save' : 'ui.pause.title')),
      v.props.shopName ? h('div', { class: 'pause-sub' }, `${v.props.shopName}${v.props.day ? ` · ${t('ui.common.day', { n: v.props.day })}` : ''}`) : null,
      h('div', { class: 'pause-body', key: s.view }, body),
    );
  },
});

/* ------------------------------------------------------------------ credits */

export interface CreditsProps {
  version?: string;
}

export const mountCredits = defineView<CreditsProps, { onClose(): void }>({
  name: 'credits',
  render: (v) =>
    h(
      'div',
      { class: 'credits panel', role: 'dialog' },
      panelHeader({ title: t('ui.credits.title'), icon: 'scroll', onClose: () => v.cb.onClose(), closeTip: t('ui.common.close') }),
      scroll(
        { class: 'credits-body' },
        logo('md'),
        h('p', { class: 'credits-lead' }, t('ui.credits.lead')),
        h(
          'div',
          { class: 'credits-grid' },
          (['procedural', 'audio', 'didactic'] as const).map((k) => h('div', { class: 'credits-card card' }, icon(k === 'procedural' ? 'sparkle' : k === 'audio' ? 'music' : 'book'), h('b', null, t(`ui.credits.${k}Title`)), h('p', null, t(`ui.credits.${k}Text`)))),
        ),
        h('div', { class: 'section-title' }, t('ui.credits.libs')),
        h(
          'ul',
          { class: 'credits-libs' },
          [
            ['three.js', 'MIT', t('ui.credits.three')],
            ['postprocessing', 'Zlib', t('ui.credits.postprocessing')],
            ['Vite · TypeScript', 'MIT · Apache-2.0', t('ui.credits.tooling')],
          ].map(([name, lic, what]) => h('li', null, h('b', null, name), h('span', { class: 'badge tone-neutral' }, lic), h('span', { class: 'muted' }, what))),
        ),
        h('p', { class: 'credits-note' }, t('ui.credits.trademark')),
        h('p', { class: 'credits-thanks' }, h('span', { class: 'thai' }, 'ขอบคุณครับ'), ' ', h('span', { class: 'thai-gloss' }, `(${t('ui.credits.thanks')})`)),
        v.props.version ? h('p', { class: 'dim credits-version' }, v.props.version) : null,
      ),
    ),
});
