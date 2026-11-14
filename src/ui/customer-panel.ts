/**
 * Customer panel (right side, shown while a customer stands at the counter).
 * Diagnosis tools → clues → verdict → price quote → propose / decline, plus the
 * counter-offer and "rack full" states. Pure view-model in, callbacks out.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/customer-panel.css';
import { t } from '../core/i18n';
import { cx, h, type Child } from './dom';
import { clamp, clamp01, formatMoney, type Urgency } from './format';
import { icon, type IconName } from './icons';
import { sfx } from './sound';
import { defineView, type View } from './view';
import { avatar, badge, bar, button, scroll, slider, type Tone } from './widgets';

export type DiagnosisActionId = 'inspect' | 'multimeter' | 'batteryTester' | 'psu';

export interface DiagnosisAction {
  id: DiagnosisActionId;
  /** ready = can be used now, done = already used, busy = running, locked = tool missing */
  state: 'ready' | 'done' | 'busy' | 'locked';
  /** why it is locked (already translated), e.g. "Ti serve il multimetro USB" */
  reason?: string;
}

export interface Clue {
  id: string;
  /** already translated finding, e.g. "Assorbimento a telefono spento: quasi nullo" */
  text: string;
  /** which tool produced it (drives the icon) */
  source?: DiagnosisActionId;
  /** short measured value shown as a readout, e.g. "0,02 A" or "71%" */
  value?: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
}

export interface NeededPart {
  /** translated part name, e.g. "Batteria Fone X" */
  name: string;
  icon?: IconName | string;
  /** pieces in stock (any quality) */
  stock: number;
  /** already ordered, arriving with the next delivery */
  incoming?: boolean;
}

export interface PriceQuote {
  min: number;
  max: number;
  step?: number;
  /** "fair" band highlighted on the slider */
  fairFrom: number;
  fairTo: number;
  /** initial slider position */
  suggested: number;
  /** cost of the parts for this job (shown with the resulting margin) */
  partsCost?: number;
}

export interface DiagnosisOption {
  id: string;
  /** translated, e.g. "Batteria esausta" */
  label: string;
  /** short translated explanation of the job */
  detail?: string;
  /** how the gathered clues bear on this option */
  mark?: 'none' | 'likely' | 'confirmed' | 'excluded';
  parts?: NeededPart[];
  /** price range for this job (falls back to `CustomerPanelProps.quote`) */
  quote?: PriceQuote;
}

export type PriceReaction = 'bargain' | 'fair' | 'pricey' | 'outrage';

export interface CustomerPanelProps {
  customer: {
    name: string;
    /** translated type, e.g. "Turista", "Istruttore di sub" */
    typeLabel: string;
    color?: string;
    icon?: IconName | string;
    /** 0..1 */
    patience: number;
  };
  /** the vague complaint, already translated */
  complaint: string;
  phone: {
    /** "Pear Fone X" */
    model: string;
    colorName?: string;
    /** CSS colour of the swatch */
    colorHex?: string;
  };
  deadline?: {
    /** e.g. "Entro le 18:00" */
    label: string;
    urgency: Urgency;
    /** e.g. "Ho il traghetto!" */
    note?: string;
  };
  actions: DiagnosisAction[];
  clues: Clue[];
  options: DiagnosisOption[];
  /** controlled selection; omit to let the panel keep it */
  selected?: string | null;
  quote?: PriceQuote;
  /** override the locally estimated reaction to the current price */
  reaction?: PriceReaction;
  /** the customer answered with a counter-offer */
  counter?: { price: number; yourPrice: number; text?: string };
  rackFull?: boolean;
}

export interface CustomerPanelCallbacks {
  onDiagnose(action: DiagnosisActionId): void;
  onSelectDiagnosis(id: string): void;
  onPriceChange(price: number): void;
  onPropose(price: number, diagnosisId: string): void;
  onDecline(): void;
  onAcceptCounter(): void;
  onRefuseCounter(): void;
  /** step away from the customer without answering */
  onLeave(): void;
}

interface State {
  selected: string | null;
  /** null = follow the suggested price */
  price: number | null;
  priceFor: string | null;
}

/** Vague reaction estimate from where the price sits relative to the fair band. */
export function priceReaction(price: number, q: PriceQuote): PriceReaction {
  if (price < q.fairFrom) return 'bargain';
  if (price <= q.fairTo) return 'fair';
  return price <= q.fairTo + (q.max - q.fairTo) * 0.45 ? 'pricey' : 'outrage';
}

const ACTION_ICON: Record<DiagnosisActionId, IconName> = {
  inspect: 'tool_magnifier',
  multimeter: 'tool_multimeter',
  batteryTester: 'tool_battery_tester',
  psu: 'tool_psu',
};

/* local face icons for the reaction line (not part of the shared icon set) */
const FACE: Record<PriceReaction, string> = {
  bargain: '<path d="M8 13.5c1 2.4 2.3 3.5 4 3.5s3-1.100 4-3.500z" fill="currentColor" stroke="none"/><path d="M8 10c.5-.8 1.500-.8 2 0M14 10c.5-.8 1.500-.8 2 0"/>',
  fair: '<path d="M8.500 14.500c2 1.700 5 1.700 7 0"/><path d="M9 10v.6M15 10v.6" stroke-width="2.400"/>',
  pricey: '<path d="M8.500 15.500c1.500-.9 3-1.200 7-.4"/><path d="M9 10.300v.6M15 10.300v.6" stroke-width="2.400"/><path d="M7.500 7.800l2.500.6M16.500 7.200l-2.500 1.200"/>',
  outrage: '<path d="M8.500 16.500c2-2.200 5-2.200 7 0"/><path d="M9 11v.6M15 11v.6" stroke-width="2.400"/><path d="M7.500 7.500l3 1.500M16.500 7.500l-3 1.500"/>',
};
const face = (r: PriceReaction): HTMLElement =>
  h('span', {
    class: 'ic cp-face',
    html: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="f" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/>${FACE[r]}</svg>`,
  });

const REACTION_TONE: Record<PriceReaction, Tone> = { bargain: 'teal', fair: 'ok', pricey: 'warn', outrage: 'bad' };
const URGENCY_TONE: Record<Urgency, Tone> = { calm: 'ok', soon: 'warn', urgent: 'bad', late: 'bad' };
const MARK: Record<'likely' | 'confirmed' | 'excluded', { tone: Tone; icon: IconName; key: string }> = {
  likely: { tone: 'warn', icon: 'bulb', key: 'ui.customer.markLikely' },
  confirmed: { tone: 'ok', icon: 'check', key: 'ui.customer.markConfirmed' },
  excluded: { tone: 'neutral', icon: 'cross', key: 'ui.customer.markExcluded' },
};

type V = View<CustomerPanelProps, CustomerPanelCallbacks, State>;

const selectedId = (v: V): string | null => (v.props.selected !== undefined ? v.props.selected : v.state.selected);

function currentPrice(v: V, q: PriceQuote, sel: string | null): number {
  const raw = v.state.price !== null && v.state.priceFor === sel ? v.state.price : q.suggested;
  return clamp(raw, q.min, q.max);
}

function section(title: string, trailing: Child, ...children: Child[]): HTMLElement {
  return h('section', { class: 'cp-section' }, h('div', { class: 'section-title' }, title, trailing), ...children);
}

function renderActions(v: V): HTMLElement {
  return h(
    'div',
    { class: 'cp-actions' },
    v.props.actions.map((a) => {
      const locked = a.state === 'locked';
      const inert = a.state !== 'ready';
      return h(
        'button',
        {
          type: 'button',
          key: a.id,
          class: cx('cp-act pe', `is-${a.state}`),
          'aria-disabled': inert ? 'true' : null,
          dataset: { tip: locked ? a.reason : null, hover: !inert },
          onClick: (ev: Event) => {
            if (a.state === 'ready') {
              sfx('ui_click');
              v.cb.onDiagnose(a.id);
            } else if (locked) {
              sfx('error');
              const el = ev.currentTarget as HTMLElement;
              el.classList.remove('is-shake');
              void el.offsetWidth;
              el.classList.add('is-shake');
            }
          },
        },
        h('span', { class: 'cp-act-ic' }, icon(ACTION_ICON[a.id])),
        h(
          'span',
          { class: 'cp-act-text' },
          h('span', { class: 'cp-act-name' }, t(`ui.customer.act.${a.id}`)),
          a.state === 'done'
            ? h('span', { class: 'cp-act-sub t-ok' }, icon('check'), t('ui.customer.actDone'))
            : a.state === 'busy'
              ? h('span', { class: 'cp-act-sub' }, t('ui.customer.actBusy'))
              : locked
                ? h('span', { class: 'cp-act-sub' }, icon('lock'), t('ui.common.locked'))
                : null,
        ),
      );
    }),
  );
}

function renderClues(v: V): HTMLElement {
  if (v.props.clues.length === 0) {
    return h('div', { class: 'cp-noclue' }, icon('search'), h('span', null, t('ui.customer.noClues')));
  }
  return h(
    'ul',
    { class: 'cp-clues' },
    v.props.clues.map((c) =>
      h(
        'li',
        { class: cx('cp-clue', `is-${c.tone ?? 'neutral'}`), key: c.id },
        h('span', { class: 'cp-clue-ic' }, icon(c.source ? ACTION_ICON[c.source] : 'info')),
        h('span', { class: 'cp-clue-text' }, c.text),
        c.value ? h('span', { class: 'cp-clue-val num' }, c.value) : null,
      ),
    ),
  );
}

function renderOptions(v: V, sel: string | null): HTMLElement {
  return h(
    'div',
    { class: 'cp-options', role: 'radiogroup' },
    v.props.options.map((o) => {
      const mark = o.mark && o.mark !== 'none' ? MARK[o.mark] : null;
      const active = o.id === sel;
      return h(
        'button',
        {
          type: 'button',
          role: 'radio',
          key: o.id,
          class: cx('cp-opt pe', active && 'is-active', o.mark === 'excluded' && 'is-excluded', o.mark === 'confirmed' && 'is-confirmed'),
          'aria-checked': String(active),
          dataset: { hover: true },
          onClick: () => {
            if (active) return;
            sfx('ui_tab');
            v.state.selected = o.id;
            v.cb.onSelectDiagnosis(o.id);
            v.rerender();
          },
        },
        h('span', { class: 'cp-opt-radio' }),
        h('span', { class: 'cp-opt-text' }, h('span', { class: 'cp-opt-label' }, o.label), o.detail ? h('span', { class: 'cp-opt-detail' }, o.detail) : null),
        mark ? badge(t(mark.key), mark.tone, mark.icon) : null,
      );
    }),
  );
}

function renderParts(parts: NeededPart[]): HTMLElement {
  if (parts.length === 0) return h('div', { class: 'cp-noparts' }, icon('check_circle'), t('ui.customer.noParts'));
  return h(
    'ul',
    { class: 'cp-parts' },
    parts.map((p) =>
      h(
        'li',
        { class: 'cp-part', key: p.name },
        h('span', { class: 'cp-part-ic' }, icon(p.icon ?? 'box')),
        h('span', { class: 'cp-part-name ellipsis' }, p.name),
        p.stock > 0
          ? badge(t('ui.customer.partInStock', { n: p.stock }), 'ok', 'check')
          : p.incoming
            ? badge(t('ui.customer.partIncoming'), 'info', 'boat')
            : badge(t('ui.customer.partMissing'), 'warn', 'cart'),
      ),
    ),
  );
}

function renderQuote(v: V, q: PriceQuote, sel: string, price: number): HTMLElement {
  const reaction = v.props.reaction ?? priceReaction(price, q);
  const span = q.max - q.min || 1;
  const mid = clamp01(((q.fairFrom + q.fairTo) / 2 - q.min) / span) * 100;
  return h(
    'div',
    { class: 'cp-quote' },
    h(
      'div',
      { class: 'cp-quote-top' },
      h('span', { class: 'cp-quote-label' }, t('ui.customer.quote')),
      h('span', { class: 'cp-quote-price num' }, icon('coin', 'money-coin'), formatMoney(price)),
    ),
    slider({
      value: price,
      min: q.min,
      max: q.max,
      step: q.step ?? 10,
      band: { from: q.fairFrom, to: q.fairTo },
      ariaLabel: t('ui.customer.quote'),
      class: 'cp-slider',
      onInput: (val) => {
        v.state.price = val;
        v.state.priceFor = sel;
        v.cb.onPriceChange(val);
        v.rerender();
      },
    }),
    h(
      'div',
      { class: 'cp-scale' },
      h('span', { class: 'num' }, formatMoney(q.min)),
      h('span', { class: 'cp-scale-fair', style: { left: `${clamp(mid, 18, 82).toFixed(1)}%` } }, t('ui.customer.fair')),
      h('span', { class: 'num' }, formatMoney(q.max)),
    ),
    h('div', { class: cx('cp-reaction', `tone-${REACTION_TONE[reaction]}`), key: 'reaction' }, face(reaction), h('span', null, t(`ui.customer.reaction.${reaction}`))),
    q.partsCost !== undefined
      ? h(
          'div',
          { class: 'cp-margin' },
          h('span', null, t('ui.customer.partsCost'), ' ', h('b', { class: 'num' }, formatMoney(q.partsCost))),
          h('span', null, t('ui.customer.margin'), ' ', h('b', { class: cx('num', price - q.partsCost < 0 ? 't-bad' : 't-ok') }, formatMoney(price - q.partsCost, { signed: true }))),
        )
      : null,
  );
}

function renderFooter(v: V, sel: string | null): HTMLElement {
  const p = v.props;
  if (p.counter) {
    return h(
      'footer',
      { class: 'cp-foot cp-counter', key: 'counter' },
      h('div', { class: 'cp-counter-tag' }, icon('chat'), t('ui.customer.counterTitle')),
      h('div', { class: 'cp-counter-ask' }, t('ui.customer.counterAsk', { price: formatMoney(p.counter.price) })),
      p.counter.text ? h('div', { class: 'cp-counter-text' }, p.counter.text) : null,
      h('div', { class: 'cp-counter-yours' }, t('ui.customer.counterYours', { price: formatMoney(p.counter.yourPrice) })),
      h(
        'div',
        { class: 'cp-buttons' },
        button({ label: t('ui.customer.counterRefuse'), variant: 'secondary', icon: 'cross', onClick: () => v.cb.onRefuseCounter() }),
        button({ label: t('ui.customer.counterAccept'), variant: 'primary', size: 'lg', icon: 'check', class: 'grow', sound: 'success', onClick: () => v.cb.onAcceptCounter() }),
      ),
    );
  }
  const opt = p.options.find((o) => o.id === sel) ?? null;
  const q = opt ? (opt.quote ?? p.quote ?? null) : null;
  const price = q && sel ? currentPrice(v, q, sel) : 0;
  const blocked = p.rackFull ? t('ui.customer.rackFullReason') : !opt || !q ? t('ui.customer.needDiagnosis') : false;
  return h(
    'footer',
    { class: 'cp-foot', key: 'quote' },
    p.rackFull
      ? h(
          'div',
          { class: 'cp-rack' },
          h('span', { class: 'cp-rack-ic' }, icon('warn')),
          h('div', null, h('div', { class: 'cp-rack-title' }, t('ui.customer.rackFull')), h('div', { class: 'cp-rack-text' }, t('ui.customer.rackFullText'))),
        )
      : q && sel
        ? renderQuote(v, q, sel, price)
        : h('div', { class: 'cp-pick' }, icon('arrow_up'), t('ui.customer.pickFirst')),
    h(
      'div',
      { class: 'cp-buttons' },
      button({ label: t('ui.customer.decline'), variant: 'secondary', onClick: () => v.cb.onDecline() }),
      button({
        label: q && sel && !p.rackFull ? `${t('ui.customer.propose')} · ${formatMoney(price)}` : t('ui.customer.propose'),
        variant: 'primary',
        size: 'lg',
        class: 'grow',
        disabled: blocked,
        onClick: () => {
          if (sel) v.cb.onPropose(price, sel);
        },
      }),
    ),
  );
}

export const mountCustomerPanel = defineView<CustomerPanelProps, CustomerPanelCallbacks, State>({
  name: 'customer-panel',
  leaveMs: 180,
  state: (p) => ({ selected: p.selected ?? null, price: null, priceFor: null }),
  render: (v) => {
    const p = v.props;
    const sel = selectedId(v);
    const opt = p.options.find((o) => o.id === sel) ?? null;
    const patience = clamp01(p.customer.patience);
    const mood = patience > 0.6 ? 'High' : patience > 0.3 ? 'Mid' : 'Low';
    return h(
      'aside',
      { class: cx('panel customer-panel', p.counter && 'has-counter') },
      h(
        'header',
        { class: 'cp-head' },
        avatar({ name: p.customer.name, color: p.customer.color, icon: p.customer.icon, size: 'lg' }),
        h(
          'div',
          { class: 'cp-head-text' },
          h('h2', { class: 'cp-name ellipsis' }, p.customer.name),
          h('div', { class: 'cp-type' }, p.customer.typeLabel),
          h(
            'div',
            { class: cx('cp-patience', `is-${mood.toLowerCase()}`), dataset: { tip: t('ui.customer.patience') } },
            icon('hourglass'),
            bar({ value: patience, tone: mood === 'High' ? 'ok' : mood === 'Mid' ? 'gold' : 'coral', label: t('ui.customer.patience') }),
            h('span', { class: 'cp-patience-label' }, t(`ui.customer.patience${mood}`)),
          ),
        ),
        button({ icon: 'cross', variant: 'ghost', size: 'sm', class: 'cp-close', tip: t('ui.customer.leave'), sound: 'ui_close', onClick: () => v.cb.onLeave() }),
      ),
      scroll(
        { class: 'cp-body' },
        h('blockquote', { class: 'cp-complaint' }, h('span', { class: 'cp-quote-mark' }, '“'), p.complaint),
        h(
          'div',
          { class: 'cp-phone card' },
          h('span', { class: 'cp-phone-ic' }, icon('phone')),
          h(
            'div',
            { class: 'cp-phone-text' },
            h('div', { class: 'cp-phone-model ellipsis' }, p.phone.model),
            p.phone.colorName
              ? h('div', { class: 'cp-phone-color' }, h('i', { class: 'cp-swatch', style: { background: p.phone.colorHex ?? '#888' } }), p.phone.colorName)
              : null,
          ),
          h(
            'div',
            { class: 'cp-deadline' },
            p.deadline
              ? [badge(p.deadline.label, URGENCY_TONE[p.deadline.urgency], 'clock'), p.deadline.note ? h('div', { class: 'cp-deadline-note' }, p.deadline.note) : null]
              : badge(t('ui.customer.noDeadline'), 'neutral', 'palm'),
          ),
        ),
        section(t('ui.customer.diagnosis'), null, renderActions(v), renderClues(v)),
        section(t('ui.customer.verdict'), null, renderOptions(v, sel)),
        opt ? section(t('ui.customer.parts'), null, renderParts(opt.parts ?? [])) : null,
      ),
      renderFooter(v, sel),
    );
  },
});
