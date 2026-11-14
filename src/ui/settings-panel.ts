/**
 * Settings panel: graphics, audio, game/accessibility and key remapping.
 * Controlled component: it renders `props.settings` and reports every change through `onChange(next)`.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/menus.css';
import { t, type Lang } from '../core/i18n';
import { DEFAULT_KEYS, defaultSettings, type KeyAction, type QualityLevel, type Settings } from '../core/settings';
import { cx, h } from './dom';
import { keyLabel } from './format';
import { icon, type IconName } from './icons';
import { sfx } from './sound';
import { defineView } from './view';
import { button, field, kbd, panelHeader, scroll, segmented, slider, tabs, toggle } from './widgets';

export interface SettingsPanelProps {
  settings: Settings;
  /** result of the automatic benchmark, shown next to "rileva automaticamente" */
  detectedQuality?: QualityLevel;
  /** benchmark running: the detect button shows a spinner state */
  detecting?: boolean;
}

export interface SettingsPanelCallbacks {
  onChange(settings: Settings): void;
  onClose(): void;
  /** run the 3-second benchmark; the glue then calls update() with the new quality */
  onDetectQuality?(): void;
}

type SettingsTab = 'graphics' | 'audio' | 'game' | 'controls';

interface SettingsState {
  tab: SettingsTab;
  listening: KeyAction | null;
  keyError: string | null;
  confirmReset: boolean;
}

export const KEY_ACTIONS: KeyAction[] = ['tablet', 'pause', 'focus', 'guide', 'rotate', 'back', 'flip', 'decor'];
const ACTION_ICON: Record<KeyAction, IconName> = { tablet: 'tablet', pause: 'pause', focus: 'target', guide: 'bulb', rotate: 'rotate', back: 'back', flip: 'flip', decor: 'decor' };
const QUALITIES: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
const VOLUMES: Array<{ id: keyof Settings['volume']; icon: IconName }> = [
  { id: 'master', icon: 'volume' },
  { id: 'music', icon: 'music' },
  { id: 'ambience', icon: 'wave' },
  { id: 'sfx', icon: 'tool_screwdriver' },
  { id: 'voice', icon: 'chat' },
];
const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** Keys that can never be bound: digits select tools. */
export function isReservedKey(code: string): boolean {
  return /^Digit[0-9]$/.test(code) || /^Numpad[0-9]$/.test(code) || code === 'MetaLeft' || code === 'MetaRight';
}

/** Bind `code` to `action`; if another action used it, the two swap keys. Pure. */
export function rebindKey(keys: Record<KeyAction, string>, action: KeyAction, code: string): Record<KeyAction, string> {
  const next = { ...keys };
  const other = KEY_ACTIONS.find((a) => a !== action && next[a] === code);
  if (other) next[other] = next[action];
  next[action] = code;
  return next;
}

export const mountSettingsPanel = defineView<SettingsPanelProps, SettingsPanelCallbacks, SettingsState>({
  name: 'settings',
  state: () => ({ tab: 'graphics', listening: null, keyError: null, confirmReset: false }),
  mounted: (v) => {
    const onKey = (ev: KeyboardEvent): void => {
      const action = v.state.listening;
      if (!action) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.code === 'Escape' && action !== 'pause') {
        v.set({ listening: null, keyError: null });
        return;
      }
      if (isReservedKey(ev.code)) {
        sfx('error');
        v.set({ keyError: t('ui.settings.keys.reserved') });
        return;
      }
      sfx('success');
      const s = v.props.settings;
      v.set({ listening: null, keyError: null });
      v.cb.onChange({ ...s, keys: rebindKey(s.keys, action, ev.code) });
    };
    window.addEventListener('keydown', onKey, true);
    v.onDestroy(() => window.removeEventListener('keydown', onKey, true));
  },
  render: (v) => {
    const s = v.props.settings;
    const st = v.state;
    const set = (patch: Partial<Settings>): void => v.cb.onChange({ ...s, ...patch });
    let body: HTMLElement[];
    if (st.tab === 'graphics') {
      body = [
        field({
          label: t('ui.settings.quality'),
          hint: t(`ui.settings.qualityHint.${s.quality}`),
          icon: 'monitor',
          control: segmented<QualityLevel>({ value: s.quality, options: QUALITIES.map((q) => ({ value: q, label: t(`ui.settings.q.${q}`) })), onChange: (quality) => set({ quality }) }),
        }),
        field({
          label: t('ui.settings.detect'),
          hint: v.props.detecting ? t('ui.settings.detecting') : v.props.detectedQuality ? t('ui.settings.detected', { q: t(`ui.settings.q.${v.props.detectedQuality}`) }) : t('ui.settings.detectHint'),
          icon: 'sparkle',
          control: button({ label: t('ui.settings.detectBtn'), icon: 'rotate', disabled: v.props.detecting || !v.cb.onDetectQuality, class: v.props.detecting ? 'is-spinning' : undefined, onClick: () => v.cb.onDetectQuality?.() }),
        }),
        field({ label: t('ui.settings.reduceMotion'), hint: t('ui.settings.reduceMotionHint'), icon: 'motion', control: toggle({ checked: s.reduceMotion, onChange: (reduceMotion) => set({ reduceMotion }) }) }),
      ];
    } else if (st.tab === 'audio') {
      body = VOLUMES.map((vol) =>
        field({
          label: t(`ui.settings.vol.${vol.id}`),
          icon: s.volume[vol.id] === 0 ? 'mute' : vol.icon,
          class: vol.id === 'master' ? 'is-master' : undefined,
          control: slider({ value: s.volume[vol.id], min: 0, max: 1, step: 0.01, format: pct, ariaLabel: t(`ui.settings.vol.${vol.id}`), onInput: (val) => set({ volume: { ...s.volume, [vol.id]: val } }) }),
        }),
      );
    } else if (st.tab === 'game') {
      body = [
        field({
          label: t('ui.settings.lang'),
          icon: 'globe',
          control: segmented<Lang>({ value: s.lang, options: [{ value: 'it', label: 'Italiano' }, { value: 'en', label: 'English' }], onChange: (lang) => set({ lang }) }),
        }),
        field({
          label: t('ui.settings.textScale'),
          hint: t('ui.settings.textScaleHint'),
          icon: 'text_size',
          control: slider({ value: s.textScale, min: 0.85, max: 1.4, step: 0.05, format: pct, ariaLabel: t('ui.settings.textScale'), onChange: (textScale) => set({ textScale }) }),
        }),
        field({ label: t('ui.settings.subtitles'), hint: t('ui.settings.subtitlesHint'), icon: 'subtitles', control: toggle({ checked: s.subtitles, onChange: (subtitles) => set({ subtitles }) }) }),
        field({ label: t('ui.settings.guide'), hint: t('ui.settings.guideHint'), icon: 'bulb', control: toggle({ checked: s.guide, onChange: (guide) => set({ guide }) }) }),
      ];
    } else {
      body = [
        h('p', { class: cx('keys-hint', st.keyError && 'is-error') }, icon(st.keyError ? 'warn' : 'keyboard'), st.keyError ?? (st.listening ? t('ui.settings.keys.press') : t('ui.settings.keys.hint'))),
        h(
          'div',
          { class: 'keys-grid' },
          KEY_ACTIONS.map((a) =>
            h(
              'button',
              {
                type: 'button',
                key: a,
                class: cx('key-row pe', st.listening === a && 'is-listening', s.keys[a] !== DEFAULT_KEYS[a] && 'is-custom'),
                dataset: { hover: '' },
                onClick: () => {
                  sfx('ui_click');
                  v.set({ listening: st.listening === a ? null : a, keyError: null });
                },
              },
              icon(ACTION_ICON[a]),
              h('span', { class: 'grow' }, t(`ui.settings.keys.action.${a}`)),
              st.listening === a ? h('span', { class: 'key-wait' }, t('ui.settings.keys.waiting')) : kbd(s.keys[a]),
            ),
          ),
          h('div', { class: 'key-row is-fixed' }, icon('tool_screwdriver'), h('span', { class: 'grow' }, t('ui.settings.keys.tools')), h('span', { class: 'row' }, kbd('1'), '–', kbd('9')), icon('lock', 'dim')),
        ),
        h('div', { class: 'menu-row is-end' }, button({ label: t('ui.settings.keys.reset'), size: 'sm', icon: 'rotate', disabled: KEY_ACTIONS.every((a) => s.keys[a] === DEFAULT_KEYS[a]), onClick: () => set({ keys: { ...DEFAULT_KEYS } }) })),
      ];
    }
    return h(
      'div',
      { class: 'settings panel', role: 'dialog', dataset: { 'capture-keys': st.listening ? '' : null } },
      panelHeader({ title: t('ui.settings.title'), icon: 'gear', onClose: () => v.cb.onClose(), closeTip: t('ui.common.close') }),
      h(
        'div',
        { class: 'settings-tabs' },
        tabs<SettingsTab>({
          variant: 'underline',
          active: st.tab,
          items: [
            { id: 'graphics', label: t('ui.settings.tab.graphics'), icon: 'monitor' },
            { id: 'audio', label: t('ui.settings.tab.audio'), icon: 'volume' },
            { id: 'game', label: t('ui.settings.tab.game'), icon: 'user' },
            { id: 'controls', label: t('ui.settings.tab.controls'), icon: 'keyboard' },
          ],
          onSelect: (tab) => v.set({ tab, listening: null, keyError: null }),
        }),
      ),
      scroll({ class: 'settings-body', key: st.tab }, body),
      h(
        'footer',
        { class: 'menu-dialog-foot' },
        st.confirmReset
          ? [
              h('span', { class: 'grow muted' }, t('ui.settings.resetConfirm')),
              button({ label: t('ui.common.cancel'), size: 'sm', onClick: () => v.set({ confirmReset: false }) }),
              button({
                label: t('ui.settings.reset'),
                size: 'sm',
                variant: 'danger',
                onClick: () => {
                  v.set({ confirmReset: false, listening: null });
                  v.cb.onChange({ ...defaultSettings(), lang: s.lang, benchmarkDone: s.benchmarkDone });
                },
              }),
            ]
          : [button({ label: t('ui.settings.reset'), variant: 'ghost', icon: 'rotate', onClick: () => v.set({ confirmReset: true }) }), h('span', { class: 'grow' }), button({ label: t('ui.common.close'), variant: 'primary', icon: 'check', sound: 'ui_close', onClick: () => v.cb.onClose() })],
      ),
    );
  },
});

/** Human label of the key bound to an action (for prompts like "Premi [F]"). */
export function actionKeyLabel(settings: Settings, action: KeyAction): string {
  return keyLabel(settings.keys[action]);
}
