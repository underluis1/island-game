/**
 * HUD: money, reputation, day/clock/weather, active order chips, mode buttons, guide objective banner,
 * contextual prompt and selected tool. Toasts and game errors live in UIRoot (`root.toast`, `root.gameError`).
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/hud.css';
import { t } from '../core/i18n';
import type { KeyAction } from '../core/settings';
import { cx, h } from './dom';
import { clamp01, formatClock, formatMoney, formatDecimal, urgencyOf } from './format';
import { icon, type IconName } from './icons';
import { defineView } from './view';
import { animateNumber, button, kbd, pips, pulse, stars } from './widgets';

export type HudButtonId = 'tablet' | 'decor' | 'back' | 'flip' | 'guide' | 'test' | 'pause';
export type HudWeather = 'clear' | 'cloudy' | 'rain';
export type HudOrderStatus = 'queued' | 'waiting_parts' | 'in_progress' | 'assistant' | 'ready';

export interface HudOrderChip {
  id: string;
  /** phone model, e.g. "Fone X" */
  model: string;
  customer: string;
  /** "entro le 18:00", "tra 40 min" (already localised) */
  deadlineText: string;
  /** game minutes left: drives the urgency colour (≤0 late, ≤45 urgent, ≤120 soon) */
  minutesLeft: number;
  status: HudOrderStatus;
  /** highlighted (phone currently on the mat) */
  active?: boolean;
}

export interface HudButton {
  id: HudButtonId;
  /** toggled-on look (guide on, tablet open…) */
  active?: boolean;
  /** reason: the button is shown greyed out with this tooltip */
  disabled?: string;
  badge?: number;
  /** draw attention (tutorial) */
  highlight?: boolean;
}

export interface HudObjective {
  /** small heading, e.g. "Guida" or "Obiettivo" (default: ui.hud.objective) */
  title?: string;
  text: string;
  /** tool the player should hold (icon id, e.g. "tool_spudger") */
  icon?: IconName | string;
  /** "3 / 12" */
  step?: string;
  /** 0..1 progress of the whole job */
  progress?: number;
}

export interface HudPrompt {
  text: string;
  icon?: IconName | string;
  /** KeyboardEvent.code or "mouse" to show the mouse icon */
  kbd?: string;
  /** 0..1 hold progress ring */
  progress?: number;
  tone?: 'neutral' | 'warn';
}

export interface HudProps {
  money: number;
  /** 0..5 */
  reputation: number;
  day: number;
  /** game time in hours [0,24) */
  time: number;
  weather: HudWeather;
  orders: HudOrderChip[];
  /** buttons to show, in order (the glue picks them per game mode) */
  buttons: HudButton[];
  keys: Record<KeyAction, string>;
  /** currently held tool (null = bare hand) */
  tool?: { name: string; icon: IconName | string; tier?: number; maxTier?: number; detail?: string } | null;
  objective?: HudObjective | null;
  prompt?: HudPrompt | null;
  /** hide everything except toasts (cut-scenes, photo mode) */
  hidden?: boolean;
}

export interface HudCallbacks {
  onButton(id: HudButtonId): void;
  onOrderClick?(orderId: string): void;
}

const BUTTON_META: Record<HudButtonId, { icon: IconName; key?: KeyAction; label: string }> = {
  tablet: { icon: 'tablet', key: 'tablet', label: 'ui.hud.btn.tablet' },
  decor: { icon: 'decor', key: 'decor', label: 'ui.hud.btn.decor' },
  back: { icon: 'back', key: 'back', label: 'ui.hud.btn.back' },
  flip: { icon: 'flip', key: 'flip', label: 'ui.hud.btn.flip' },
  guide: { icon: 'bulb', key: 'guide', label: 'ui.hud.btn.guide' },
  test: { icon: 'check_circle', label: 'ui.hud.btn.test' },
  pause: { icon: 'pause', key: 'pause', label: 'ui.hud.btn.pause' },
};
const STATUS_ICON: Record<HudOrderStatus, IconName> = {
  queued: 'hourglass',
  waiting_parts: 'box',
  in_progress: 'tool_screwdriver',
  assistant: 'tab_assistant',
  ready: 'check',
};
const WEATHER_ICON: Record<HudWeather, IconName> = { clear: 'sun', cloudy: 'cloud', rain: 'rain' };

function skyIcon(time: number, weather: HudWeather): IconName {
  if (time < 5.5 || time >= 19.5) return 'moon';
  if (weather !== 'clear') return WEATHER_ICON[weather];
  if (time < 7 || time >= 17.5) return 'sunset';
  return 'sun';
}

export const mountHud = defineView<HudProps, HudCallbacks>({
  name: 'hud',
  render: (v) => {
    const p = v.props;
    const dayK = clamp01((p.time - 7) / 15);
    return h(
      'div',
      { class: cx('hud', p.hidden && 'is-hidden') },
      h(
        'div',
        { class: 'hud-tl' },
        h(
          'div',
          { class: 'hud-money glass', dataset: { tip: t('ui.common.money') } },
          icon('coin', 'hud-coin'),
          h('span', { class: 'hud-money-val num', keep: true, hook: (el: HTMLElement, first: boolean) => (first ? animateNumber(el, p.money, { from: p.money }) : animateNumber(el, p.money)) }),
          h('span', { class: 'hud-money-fx', keep: true }),
        ),
        h(
          'div',
          { class: 'hud-rep glass', dataset: { tip: t('ui.common.reputation') } },
          stars(p.reputation),
          h('span', { class: 'hud-rep-val num' }, formatDecimal(p.reputation, 1)),
        ),
      ),
      h(
        'div',
        { class: 'hud-tc' },
        h(
          'div',
          { class: 'hud-clock glass' },
          h('span', { class: 'hud-day' }, t('ui.common.day', { n: p.day })),
          h('i', { class: 'hud-sep' }),
          h('span', { class: cx('hud-sky', `is-${skyIcon(p.time, p.weather)}`), dataset: { tip: t(`ui.weather.${p.weather}`) } }, icon(skyIcon(p.time, p.weather))),
          h('span', { class: 'hud-time num' }, formatClock(p.time)),
          h('span', { class: 'hud-dayline' }, h('i', { style: { width: `${(dayK * 100).toFixed(1)}%` } })),
        ),
        p.objective
          ? h(
              'div',
              { class: 'hud-objective glass', key: 'objective' },
              h('span', { class: 'hud-objective-ic' }, icon(p.objective.icon ?? 'bulb')),
              h(
                'div',
                { class: 'hud-objective-body' },
                h('div', { class: 'hud-objective-title' }, p.objective.title ?? t('ui.hud.objective'), p.objective.step ? h('span', { class: 'hud-objective-step num' }, p.objective.step) : null),
                h('div', { class: 'hud-objective-text' }, p.objective.text),
              ),
              p.objective.progress !== undefined ? h('span', { class: 'hud-objective-bar' }, h('i', { style: { width: `${clamp01(p.objective.progress) * 100}%` } })) : null,
            )
          : null,
      ),
      h(
        'div',
        { class: 'hud-tr' },
        h(
          'div',
          { class: 'hud-buttons' },
          p.buttons.map((b) => {
            const meta = BUTTON_META[b.id];
            const big = b.id === 'test' || b.id === 'back' || (b.id === 'tablet' && p.buttons.length <= 4);
            return button({
              key: b.id,
              variant: 'glass',
              icon: meta.icon,
              label: big ? t(meta.label) : undefined,
              tip: big ? undefined : t(meta.label),
              kbd: meta.key ? p.keys[meta.key] : undefined,
              active: b.active,
              disabled: b.disabled,
              badge: b.badge || undefined,
              class: cx('hud-btn', b.highlight && 'is-highlight', b.id === 'test' && 'hud-btn-test'),
              sound: b.id === 'tablet' ? 'ui_open' : 'ui_click',
              onClick: () => v.cb.onButton(b.id),
            });
          }),
        ),
        p.orders.length > 0
          ? h(
              'div',
              { class: 'hud-orders' },
              p.orders.map((o) => {
                const urgency = o.status === 'ready' ? 'calm' : urgencyOf(o.minutesLeft);
                return h(
                  'button',
                  {
                    type: 'button',
                    key: o.id,
                    class: cx('hud-order glass pe', `is-${o.status}`, `u-${urgency}`, o.active && 'is-active'),
                    dataset: { hover: '', tip: `${o.customer} · ${t(`ui.hud.order.${o.status}`)}` },
                    onClick: () => v.cb.onOrderClick?.(o.id),
                  },
                  h('span', { class: 'hud-order-ic' }, icon(STATUS_ICON[o.status])),
                  h('span', { class: 'hud-order-body' }, h('b', { class: 'ellipsis' }, o.model), h('span', { class: 'ellipsis' }, o.customer)),
                  h('span', { class: 'hud-order-time' }, o.status === 'ready' ? t('ui.hud.order.ready') : [icon(urgency === 'late' ? 'warn' : 'clock'), o.deadlineText]),
                );
              }),
            )
          : null,
      ),
      p.tool
        ? h(
            'div',
            { class: 'hud-tool glass', key: 'tool' },
            h('span', { class: 'hud-tool-ic' }, icon(p.tool.icon)),
            h('div', null, h('div', { class: 'hud-tool-name' }, p.tool.name), h('div', { class: 'hud-tool-sub' }, p.tool.tier ? pips(p.tool.tier, p.tool.maxTier ?? 3) : null, p.tool.detail ?? null)),
          )
        : null,
      p.prompt
        ? h(
            'div',
            { class: cx('hud-prompt glass', p.prompt.tone === 'warn' && 'is-warn'), key: 'prompt' },
            p.prompt.progress !== undefined
              ? h('span', { class: 'hud-prompt-ring', style: { '--k': clamp01(p.prompt.progress).toFixed(3) } }, icon(p.prompt.icon ?? 'mouse'))
              : p.prompt.kbd === 'mouse'
                ? icon('mouse', 'hud-prompt-ic')
                : p.prompt.kbd
                  ? kbd(p.prompt.kbd)
                  : p.prompt.icon
                    ? icon(p.prompt.icon, 'hud-prompt-ic')
                    : null,
            h('span', null, p.prompt.text),
          )
        : null,
    );
  },
  updated: (v, prev) => {
    const delta = v.props.money - prev.money;
    if (delta === 0) return;
    const pill = v.el.querySelector('.hud-money');
    const fx = v.el.querySelector('.hud-money-fx');
    if (!pill || !fx) return;
    pulse(pill, delta > 0 ? 'is-gain' : 'is-loss');
    const float = h('span', { class: delta > 0 ? 'hud-delta is-gain' : 'hud-delta is-loss' }, formatMoney(delta, { signed: true }));
    fx.appendChild(float);
    window.setTimeout(() => float.remove(), 1500);
  },
});
