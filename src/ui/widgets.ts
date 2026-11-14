/**
 * Reusable widgets. Every function returns a plain element built with `h()`, so they can be used
 * inside any view render (morph-friendly) or mounted on their own.
 */
import './styles/tokens.css';
import './styles/base.css';
import { cx, h, type Child } from './dom';
import { clamp01, colorFromString, formatMoney, initialOf, keyLabel, starParts } from './format';
import { icon, type IconName } from './icons';
import { sfx, type UiSound } from './sound';

/* ------------------------------------------------------------------ buttons */

export type ButtonVariant = 'primary' | 'accent' | 'gold' | 'secondary' | 'ghost' | 'glass' | 'danger';

export interface ButtonOpts {
  label?: string;
  icon?: IconName | string;
  /** icon after the label */
  iconEnd?: IconName | string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  /** true, or a string explaining why (shown as tooltip; clicking plays the error cue) */
  disabled?: boolean | string;
  /** pressed / toggled-on look */
  active?: boolean;
  /** KeyboardEvent.code (or literal label) shown as a key cap */
  kbd?: string;
  tip?: string;
  /** stretch to the container width */
  block?: boolean;
  /** small notification badge */
  badge?: string | number;
  sound?: UiSound;
  class?: string;
  key?: string | number;
  onClick?: (ev: MouseEvent) => void;
  ariaLabel?: string;
}

export function button(o: ButtonOpts): HTMLButtonElement {
  const disabled = Boolean(o.disabled);
  const tip = typeof o.disabled === 'string' ? o.disabled : o.tip;
  return h(
    'button',
    {
      type: 'button',
      class: cx(
        'btn',
        `btn-${o.variant ?? 'secondary'}`,
        o.size && o.size !== 'md' && `btn-${o.size}`,
        !o.label && 'btn-icon',
        o.block && 'btn-block',
        o.active && 'is-active',
        disabled && 'is-disabled',
        o.class,
      ),
      key: o.key,
      'aria-disabled': disabled ? 'true' : null,
      'aria-pressed': o.active === undefined ? null : String(o.active),
      'aria-label': o.ariaLabel ?? (!o.label ? tip : null),
      dataset: { tip },
      onClick: (ev: Event) => {
        const el = ev.currentTarget as HTMLElement;
        if (disabled) {
          sfx('error');
          el.classList.remove('is-shake');
          void el.offsetWidth;
          el.classList.add('is-shake');
          return;
        }
        sfx(o.sound ?? 'ui_click');
        o.onClick?.(ev as MouseEvent);
      },
    },
    o.icon ? icon(o.icon) : null,
    o.label ? h('span', { class: 'btn-label' }, o.label) : null,
    o.iconEnd ? icon(o.iconEnd) : null,
    o.kbd ? kbd(o.kbd) : null,
    o.badge !== undefined && o.badge !== '' ? h('span', { class: 'btn-badge' }, o.badge) : null,
  );
}

/** Key cap. Accepts a KeyboardEvent.code ("KeyF") or a literal label ("1"). */
export function kbd(code: string, cls?: string): HTMLElement {
  return h('kbd', { class: cx('kbd', cls) }, keyLabel(code));
}

/* ------------------------------------------------------------------ tabs & choices */

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: IconName | string;
  badge?: string | number;
  disabled?: boolean | string;
}

export function tabs<T extends string>(o: {
  items: Array<TabItem<T>>;
  active: T;
  onSelect: (id: T) => void;
  variant?: 'pills' | 'underline' | 'rail';
  class?: string;
}): HTMLElement {
  return h(
    'div',
    { class: cx('tabs', `tabs-${o.variant ?? 'pills'}`, o.class), role: 'tablist' },
    o.items.map((it) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          key: it.id,
          class: cx('tab', it.id === o.active && 'is-active', it.disabled && 'is-disabled'),
          'aria-selected': String(it.id === o.active),
          dataset: { tip: typeof it.disabled === 'string' ? it.disabled : null },
          onClick: () => {
            if (it.disabled) {
              sfx('error');
              return;
            }
            if (it.id === o.active) return;
            sfx('ui_tab');
            o.onSelect(it.id);
          },
        },
        it.icon ? icon(it.icon) : null,
        h('span', { class: 'tab-label' }, it.label),
        it.badge !== undefined && it.badge !== '' && it.badge !== 0 ? h('span', { class: 'tab-badge' }, it.badge) : null,
      ),
    ),
  );
}

/** Segmented control for 2–5 mutually exclusive options. */
export function segmented<T extends string | number>(o: {
  options: Array<{ value: T; label: string; icon?: IconName | string; tip?: string }>;
  value: T;
  onChange: (value: T) => void;
  class?: string;
  size?: 'sm' | 'md';
}): HTMLElement {
  return h(
    'div',
    { class: cx('seg', o.size === 'sm' && 'seg-sm', o.class), role: 'radiogroup' },
    o.options.map((opt) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: cx('seg-opt', opt.value === o.value && 'is-active'),
          'aria-checked': String(opt.value === o.value),
          dataset: { tip: opt.tip },
          onClick: () => {
            if (opt.value === o.value) return;
            sfx('ui_tab');
            o.onChange(opt.value);
          },
        },
        opt.icon ? icon(opt.icon) : null,
        opt.label,
      ),
    ),
  );
}

export function toggle(o: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  class?: string;
}): HTMLElement {
  return h(
    'label',
    { class: cx('toggle', o.checked && 'is-on', o.class) },
    h('input', {
      type: 'checkbox',
      checked: o.checked,
      onChange: (ev: Event) => {
        sfx('ui_click');
        o.onChange((ev.currentTarget as HTMLInputElement).checked);
      },
    }),
    h('span', { class: 'toggle-track' }, h('span', { class: 'toggle-thumb' })),
    o.label ? h('span', { class: 'toggle-label' }, o.label) : null,
  );
}

export function slider(o: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** fired continuously while dragging */
  onInput?: (value: number) => void;
  /** fired when the drag ends */
  onChange?: (value: number) => void;
  /** value bubble text */
  format?: (value: number) => string;
  /** highlighted band on the track, in value units (e.g. the "fair price" range) */
  band?: { from: number; to: number; tone?: 'ok' | 'warn' };
  class?: string;
  ariaLabel?: string;
}): HTMLElement {
  const min = o.min ?? 0;
  const max = o.max ?? 1;
  const pct = (v: number): string => `${(clamp01((v - min) / (max - min || 1)) * 100).toFixed(2)}%`;
  return h(
    'div',
    { class: cx('slider', o.class), style: { '--p': pct(o.value) } },
    h(
      'div',
      { class: 'slider-track' },
      h('div', { class: 'slider-fill' }),
      o.band
        ? h('div', {
            class: cx('slider-band', `tone-${o.band.tone ?? 'ok'}`),
            style: { left: pct(o.band.from), right: `calc(100% - ${pct(o.band.to)})` },
          })
        : null,
    ),
    h('input', {
      type: 'range',
      min,
      max,
      step: o.step ?? 'any',
      value: o.value,
      'aria-label': o.ariaLabel,
      onInput: (ev: Event) => {
        const el = ev.currentTarget as HTMLInputElement;
        const v = Number(el.value);
        const wrap = el.parentElement as HTMLElement;
        wrap.style.setProperty('--p', pct(v));
        const out = wrap.querySelector('.slider-value');
        if (out && o.format) out.textContent = o.format(v);
        o.onInput?.(v);
      },
      onChange: (ev: Event) => o.onChange?.(Number((ev.currentTarget as HTMLInputElement).value)),
    }),
    o.format ? h('output', { class: 'slider-value' }, o.format(o.value)) : null,
  );
}

export function select<T extends string>(o: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  class?: string;
  ariaLabel?: string;
}): HTMLElement {
  return h(
    'span',
    { class: cx('select', o.class) },
    h(
      'select',
      {
        'aria-label': o.ariaLabel,
        value: o.value,
        onChange: (ev: Event) => {
          sfx('ui_click');
          o.onChange((ev.currentTarget as HTMLSelectElement).value as T);
        },
      },
      o.options.map((opt) => h('option', { value: opt.value, selected: opt.value === o.value }, opt.label)),
    ),
    icon('chevron_down'),
  );
}

export function textInput(o: {
  value: string;
  placeholder?: string;
  maxLength?: number;
  onInput: (value: string) => void;
  onEnter?: () => void;
  icon?: IconName | string;
  class?: string;
  ariaLabel?: string;
}): HTMLElement {
  return h(
    'span',
    { class: cx('input', o.class) },
    o.icon ? icon(o.icon) : null,
    h('input', {
      type: 'text',
      value: o.value,
      placeholder: o.placeholder,
      maxlength: o.maxLength,
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': o.ariaLabel ?? o.placeholder,
      onInput: (ev: Event) => o.onInput((ev.currentTarget as HTMLInputElement).value),
      onKeydown: (ev: Event) => {
        const e = ev as KeyboardEvent;
        e.stopPropagation();
        if (e.key === 'Enter') o.onEnter?.();
      },
    }),
  );
}

/* ------------------------------------------------------------------ display */

/** Scrollable column with the styled scrollbar. */
export function scroll(props: { class?: string; key?: string }, ...children: Child[]): HTMLElement {
  return h('div', { class: cx('scroll', props.class), key: props.key, tabindex: '-1' }, ...children);
}

const STAR_PATH = 'M12 2.6l2.85 5.85 6.4.9-4.65 4.5 1.12 6.37L12 17.2l-5.72 3.02 1.12-6.37-4.65-4.5 6.4-.9z';
const STAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;

/** Star rating with half stars. `animate` pops the stars in one after the other. */
export function stars(value: number, o: { max?: number; size?: 'sm' | 'md' | 'lg' | 'xl'; animate?: boolean; class?: string } = {}): HTMLElement {
  return h(
    'span',
    {
      class: cx('stars', o.size && `stars-${o.size}`, o.animate && 'stars-animate', o.class),
      role: 'img',
      'aria-label': `${value.toFixed(1)} / ${o.max ?? 5}`,
    },
    starParts(value, o.max ?? 5).map((f, i) =>
      h(
        'span',
        { class: `star star-${f}`, style: { '--i': i } },
        h('span', { class: 'star-bg', html: STAR_SVG }),
        f === 'empty' ? null : h('span', { class: 'star-fg', html: STAR_SVG }),
      ),
    ),
  );
}

/** Money amount with the coin icon. */
export function money(
  amount: number,
  o: { signed?: boolean; size?: 'sm' | 'md' | 'lg' | 'xl'; tone?: 'auto' | 'plain' | 'gain' | 'loss'; coin?: boolean; class?: string } = {},
): HTMLElement {
  const tone = o.tone === 'auto' ? (amount < 0 ? 'loss' : amount > 0 ? 'gain' : 'plain') : (o.tone ?? 'plain');
  return h(
    'span',
    { class: cx('money', o.size && `money-${o.size}`, `money-${tone}`, o.class) },
    o.coin === false ? null : icon('coin', 'money-coin'),
    h('span', { class: 'money-val' }, formatMoney(amount, { signed: o.signed })),
  );
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'gold' | 'teal' | 'coral' | 'night';

export function badge(text: string | number, tone: Tone = 'neutral', ic?: IconName | string): HTMLElement {
  return h('span', { class: `badge tone-${tone}` }, ic ? icon(ic) : null, text);
}

/** Progress / meter bar. `zones` paint coloured ranges behind the fill; `marker` draws a tick. */
export function bar(o: {
  value: number;
  tone?: Tone;
  zones?: Array<{ from: number; to: number; tone: Tone }>;
  marker?: number;
  size?: 'sm' | 'md' | 'lg';
  class?: string;
  label?: string;
}): HTMLElement {
  return h(
    'div',
    {
      class: cx('bar', `tone-${o.tone ?? 'teal'}`, o.size && `bar-${o.size}`, o.class),
      role: 'progressbar',
      'aria-valuenow': Math.round(clamp01(o.value) * 100),
      'aria-label': o.label,
      style: { '--v': clamp01(o.value).toFixed(4) },
    },
    o.zones?.map((z) =>
      h('span', {
        class: `bar-zone tone-${z.tone}`,
        style: { left: `${clamp01(z.from) * 100}%`, width: `${(clamp01(z.to) - clamp01(z.from)) * 100}%` },
      }),
    ),
    h('span', { class: 'bar-fill' }),
    o.marker !== undefined ? h('span', { class: 'bar-marker', style: { left: `${clamp01(o.marker) * 100}%` } }) : null,
  );
}

/** Tier pips: ●●○ */
export function pips(value: number, max = 3, cls?: string): HTMLElement {
  const out: HTMLElement[] = [];
  for (let i = 0; i < max; i++) out.push(h('i', { class: i < value ? 'pip is-on' : 'pip' }));
  return h('span', { class: cx('pips', cls), 'aria-label': `${value}/${max}` }, out);
}

/** Round "portrait": coloured disc with an initial or an icon. */
export function avatar(o: { name: string; color?: string; icon?: IconName | string; size?: 'sm' | 'md' | 'lg' | 'xl'; class?: string }): HTMLElement {
  return h(
    'span',
    {
      class: cx('avatar', o.size && `avatar-${o.size}`, o.class),
      style: { '--av': o.color ?? colorFromString(o.name) },
      'aria-hidden': 'true',
    },
    o.icon ? icon(o.icon) : initialOf(o.name),
  );
}

/** Friendly empty state for lists and tabs. */
export function emptyState(o: { icon: IconName | string; title: string; text?: string; action?: HTMLElement | null; class?: string }): HTMLElement {
  return h(
    'div',
    { class: cx('empty', o.class) },
    h('div', { class: 'empty-art' }, icon(o.icon)),
    h('div', { class: 'empty-title' }, o.title),
    o.text ? h('div', { class: 'empty-text' }, o.text) : null,
    o.action ?? null,
  );
}

/** Title row of a paper panel (icon, title, optional subtitle, trailing content, close button). */
export function panelHeader(o: {
  title: string;
  icon?: IconName | string;
  subtitle?: string;
  trailing?: Child;
  onClose?: () => void;
  closeTip?: string;
  class?: string;
}): HTMLElement {
  return h(
    'header',
    { class: cx('panel-head', o.class) },
    o.icon ? h('span', { class: 'panel-head-ic' }, icon(o.icon)) : null,
    h('div', { class: 'panel-head-text' }, h('h2', { class: 'panel-title' }, o.title), o.subtitle ? h('div', { class: 'panel-sub' }, o.subtitle) : null),
    o.trailing ?? null,
    o.onClose ? button({ icon: 'cross', variant: 'ghost', size: 'sm', class: 'panel-close', tip: o.closeTip, sound: 'ui_close', onClick: o.onClose }) : null,
  );
}

/** Label + control row (settings, forms). */
export function field(o: { label: string; hint?: string; icon?: IconName | string; control: Child; class?: string }): HTMLElement {
  return h(
    'div',
    { class: cx('field', o.class) },
    h(
      'div',
      { class: 'field-label' },
      o.icon ? icon(o.icon) : null,
      h('div', null, h('div', { class: 'field-name' }, o.label), o.hint ? h('div', { class: 'field-hint' }, o.hint) : null),
    ),
    h('div', { class: 'field-control' }, o.control),
  );
}

/** "label ........ value" row for summaries. */
export function statRow(label: Child, value: Child, cls?: string): HTMLElement {
  return h('div', { class: cx('stat-row', cls) }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-dots' }), h('span', { class: 'stat-value' }, value));
}

/* ------------------------------------------------------------------ animated numbers */

interface NumEl extends HTMLElement {
  __num?: number;
  __raf?: number;
}

/**
 * Count-up: animates the element's text from its current number to `to`.
 * Use as a hook on a `keep` element:  h('span', { keep: true, hook: (el, first) => animateNumber(el, v, { from: first ? 0 : undefined }) })
 */
export function animateNumber(
  target: HTMLElement,
  to: number,
  o: { ms?: number; format?: (v: number) => string; from?: number; delay?: number; onDone?: () => void } = {},
): void {
  const el = target as NumEl;
  const format = o.format ?? ((v: number) => formatMoney(v));
  const from = o.from ?? el.__num ?? to;
  if (el.__raf) cancelAnimationFrame(el.__raf);
  const reduce = document.documentElement.classList.contains('reduce-motion');
  if (from === to || reduce) {
    el.__num = to;
    el.textContent = format(to);
    o.onDone?.();
    return;
  }
  const ms = o.ms ?? Math.min(1400, 350 + Math.abs(to - from) * 0.6);
  const start = performance.now() + (o.delay ?? 0);
  el.textContent = format(from);
  const step = (now: number): void => {
    const k = clamp01((now - start) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    const v = from + (to - from) * e;
    el.__num = v;
    el.textContent = format(Math.round(v));
    if (k < 1) el.__raf = requestAnimationFrame(step);
    else {
      el.__num = to;
      el.__raf = undefined;
      o.onDone?.();
    }
  };
  el.__raf = requestAnimationFrame(step);
}

/** Restart a CSS animation class on an element (flash, shake, pop…). */
export function pulse(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
