/**
 * 3D hover tooltip: follows a screen-space point (the projected part or the cursor).
 * Imperative on purpose — `move()` is called every frame and only touches a transform;
 * the DOM is rebuilt only when `show()` receives different data.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/part-tooltip.css';
import { t } from '../core/i18n';
import type { Condition, PartQuality, ScrewType } from '../gameplay/repair/types';
import { clear, cx, h, type Child } from './dom';
import { clamp, clamp01, formatMm } from './format';
import { icon, type IconName } from './icons';

export interface PartTipData {
  kind: 'part';
  /** translated part name */
  name: string;
  icon?: IconName | string;
  condition: Condition;
  /** 0..1, shown when > 0 */
  dirt?: number;
  /** 0..1, shown when > 0 */
  corrosion?: number;
  quality?: PartQuality;
  /** the part carries pairing data: true = still paired, false = pairing lost; omit when irrelevant */
  paired?: boolean;
  fragile?: boolean;
  /** battery only */
  health?: number;
  swollen?: boolean;
  /** what the player can do now, e.g. "Clic: scollega con lo spudger" (translated) */
  hint?: string;
  /** why it cannot be touched yet, e.g. "Prima rimuovi la staffa" (translated) */
  blocked?: string;
}

export interface ScrewTipData {
  kind: 'screw';
  type: ScrewType;
  /** millimetres */
  length: number;
  stripped?: boolean;
  loose?: boolean;
  /** where it is / belongs, e.g. "Staffa connettore batteria" (translated) */
  where?: string;
  hint?: string;
  blocked?: string;
}

export interface TextTipData {
  kind: 'text';
  title: string;
  text?: string;
  icon?: IconName | string;
  hint?: string;
  blocked?: string;
}

export type TipData = PartTipData | ScrewTipData | TextTipData;

export interface PartTooltip {
  readonly el: HTMLElement;
  /** Show (or refresh) the tooltip anchored at a screen point (CSS pixels). */
  show(data: TipData, x: number, y: number): void;
  /** Reposition only — safe to call every frame. */
  move(x: number, y: number): void;
  hide(): void;
  destroy(): void;
}

const COND_TONE: Record<Condition, string> = { ok: 'ok', dirty: 'warn', corroded: 'bad', damaged: 'bad', missing: 'bad' };
const COND_ICON: Record<Condition, IconName> = { ok: 'check_circle', dirty: 'sparkle', corroded: 'drop', damaged: 'warn', missing: 'cross_circle' };
const QUALITY_TONE: Record<PartQuality, string> = { factory: 'neutral', cheap: 'warn', good: 'teal', refurb: 'gold' };

function meter(label: string, value: number, cls: string): HTMLElement {
  const on = Math.max(1, Math.round(clamp01(value) * 5));
  const pips: HTMLElement[] = [];
  for (let i = 0; i < 5; i++) pips.push(h('i', { class: i < on ? 'is-on' : null }));
  return h('div', { class: cx('pt-meter', cls) }, h('span', { class: 'pt-meter-label' }, label), h('span', { class: 'pt-meter-pips' }, pips), h('span', { class: 'pt-meter-val num' }, `${Math.round(clamp01(value) * 100)}%`));
}

const tag = (text: string, tone: string, ic?: IconName | string): HTMLElement => h('span', { class: `pt-tag is-${tone}` }, ic ? icon(ic) : null, text);

function foot(d: TipData): Child {
  return [
    d.blocked ? h('div', { class: 'pt-blocked' }, icon('lock'), h('span', null, d.blocked)) : null,
    d.hint ? h('div', { class: 'pt-hint' }, icon('mouse'), h('span', null, d.hint)) : null,
  ];
}

function build(d: TipData): Child {
  if (d.kind === 'screw') {
    return [
      h(
        'div',
        { class: 'pt-head' },
        h('span', { class: 'pt-ic pt-ic-screw' }, icon(`screw_${d.type}`)),
        h('div', { class: 'pt-head-text' }, h('div', { class: 'pt-name' }, t(`ui.screw.${d.type}`)), d.where ? h('div', { class: 'pt-sub' }, d.where) : null),
        h('span', { class: 'pt-len num', title: t('ui.repair.tip.length') }, formatMm(d.length)),
      ),
      h(
        'div',
        { class: 'pt-tags' },
        d.stripped ? tag(t('ui.repair.stripped'), 'bad', 'warn') : null,
        d.loose ? tag(t('ui.repair.loose'), 'warn', 'rotate') : null,
        !d.stripped && !d.loose ? tag(t('ui.repair.tip.screwOk'), 'ok', 'check') : null,
      ),
      foot(d),
    ];
  }
  if (d.kind === 'text') {
    return [
      h(
        'div',
        { class: 'pt-head' },
        d.icon ? h('span', { class: 'pt-ic' }, icon(d.icon)) : null,
        h('div', { class: 'pt-head-text' }, h('div', { class: 'pt-name' }, d.title), d.text ? h('div', { class: 'pt-sub' }, d.text) : null),
      ),
      foot(d),
    ];
  }
  return [
    h(
      'div',
      { class: 'pt-head' },
      h('span', { class: 'pt-ic' }, icon(d.icon ?? 'part_chip')),
      h('div', { class: 'pt-head-text' }, h('div', { class: 'pt-name' }, d.name)),
    ),
    h(
      'div',
      { class: 'pt-tags' },
      tag(t(`ui.condition.${d.condition}`), COND_TONE[d.condition], COND_ICON[d.condition]),
      d.quality && d.quality !== 'factory' ? tag(t(`ui.quality.${d.quality === 'refurb' ? 'refurbShort' : d.quality}`), QUALITY_TONE[d.quality], 'box') : null,
      d.swollen ? tag(t('ui.repair.tip.swollen'), 'bad', 'warn') : null,
      d.health !== undefined ? tag(t('ui.repair.tip.health', { n: Math.round(d.health * 100) }), d.health < 0.8 ? 'warn' : 'ok', 'fn_battery') : null,
      d.fragile ? tag(t('ui.repair.tip.fragile'), 'neutral', 'heart') : null,
    ),
    d.dirt !== undefined && d.dirt > 0.01 ? meter(t('ui.repair.tip.dirt'), d.dirt, 'is-dirt') : null,
    d.corrosion !== undefined && d.corrosion > 0.01 ? meter(t('ui.repair.tip.corrosion'), d.corrosion, 'is-corrosion') : null,
    d.paired !== undefined
      ? h('div', { class: cx('pt-pair', d.paired ? 'is-ok' : 'is-bad') }, icon(d.paired ? 'lock' : 'unlock'), t(d.paired ? 'ui.repair.tip.paired' : 'ui.repair.tip.unpaired'))
      : null,
    foot(d),
  ];
}

export function mountPartTooltip(parent: HTMLElement): PartTooltip {
  const el = h('div', { class: 'part-tip', role: 'tooltip' });
  parent.appendChild(el);
  let sig = '';
  let w = 0;
  let hgt = 0;
  let visible = false;

  const place = (x: number, y: number): void => {
    const gap = 18;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let px = x + gap;
    if (px + w > vw - 8) px = x - gap - w;
    let py = y + gap * 0.6;
    if (py + hgt > vh - 8) py = y - gap * 0.6 - hgt;
    el.style.transform = `translate3d(${Math.round(clamp(px, 8, Math.max(8, vw - w - 8)))}px, ${Math.round(clamp(py, 8, Math.max(8, vh - hgt - 8)))}px, 0)`;
  };

  return {
    el,
    show(data, x, y) {
      const next = JSON.stringify(data);
      if (next !== sig) {
        sig = next;
        clear(el);
        const kids = build(data);
        const frag = h('div', { class: 'pt-inner' }, kids);
        el.appendChild(frag);
        el.dataset.kind = data.kind;
        w = el.offsetWidth;
        hgt = el.offsetHeight;
      }
      place(x, y);
      if (!visible) {
        visible = true;
        el.classList.add('is-on');
      }
    },
    move(x, y) {
      if (visible) place(x, y);
    },
    hide() {
      if (!visible) return;
      visible = false;
      el.classList.remove('is-on');
    },
    destroy() {
      el.remove();
    },
  };
}
