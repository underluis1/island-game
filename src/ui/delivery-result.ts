/**
 * Delivery result (central paper panel, meant for `root.openModal`): payment + tip with count-up and
 * coins, animated stars, the customer's review, positive/negative factors and the reputation change.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/delivery-result.css';
import { t } from '../core/i18n';
import { cx, h } from './dom';
import { formatDecimal, formatMoney } from './format';
import { icon, type IconName } from './icons';
import { defineView } from './view';
import { animateNumber, avatar, button, money, stars } from './widgets';

export interface DeliveryFactor {
  /** already translated: "Consegna rapida", "Vite mancante"… */
  text: string;
  positive: boolean;
  icon?: IconName | string;
}

export interface DeliveryResultProps {
  customerName: string;
  /** avatar colour (defaults to a colour derived from the name) */
  customerColor?: string;
  /** "Turista", "Istruttore di sub"… (already translated) */
  customerType?: string;
  /** "Pear Fone X" */
  phoneName: string;
  /** "Sostituzione batteria" (already translated) */
  jobLabel?: string;
  /** agreed price actually paid */
  payment: number;
  tip: number;
  /** "Expert" bonus for working without the guide (omit or 0 to hide) */
  bonus?: number;
  /** cost of the parts used: shows the net profit line when present */
  partsCost?: number;
  /** review rating 0..5 (half stars allowed) */
  stars: number;
  /** review text, already translated; empty = no written review */
  reviewText: string;
  factors: DeliveryFactor[];
  reputationBefore: number;
  reputationAfter: number;
  /** final state at once: no count-up, no coin burst */
  instant?: boolean;
}

export interface DeliveryResultCallbacks {
  onContinue(): void;
}

const COINS = 12;

/** 3.8 → "3,8"; 3.95 → "3,95" */
const fmtRep = (x: number): string => formatDecimal(x, Math.abs(x * 10 - Math.round(x * 10)) < 1e-6 ? 1 : 2);

export const mountDeliveryResult = defineView<DeliveryResultProps, DeliveryResultCallbacks>({
  name: 'delivery-result',
  render: (v) => {
    const p = v.props;
    const bonus = p.bonus ?? 0;
    const total = p.payment + p.tip + bonus;
    const delta = Math.round((p.reputationAfter - p.reputationBefore) * 100) / 100;
    const mood = p.stars >= 4 ? 'happy' : p.stars >= 2.5 ? 'ok' : 'sad';
    const coins: HTMLElement[] = [];
    for (let i = 0; i < COINS; i++) {
      const a = (i / COINS) * Math.PI * 2 + (i % 2) * 0.4;
      const r = 4.2 + ((i * 7) % 5) * 0.75;
      coins.push(
        h(
          'i',
          { class: 'dr-coin', style: { '--i': i, '--dx': `${(Math.cos(a) * r * 1.5).toFixed(2)}rem`, '--dy': `${(-Math.abs(Math.sin(a)) * r - 1.5).toFixed(2)}rem` } },
          icon('coin'),
        ),
      );
    }
    const line = (label: string, amount: number, ic: IconName, cls?: string, signed = true): HTMLElement =>
      h(
        'div',
        { class: cx('dr-line', cls) },
        h('span', { class: 'dr-line-label' }, icon(ic), label),
        h('span', { class: 'dr-line-val num' }, formatMoney(amount, { signed })),
      );
    return h(
      'section',
      { class: cx('panel dr', `dr-${mood}`, p.instant && 'is-instant') },
      h(
        'header',
        { class: 'dr-head' },
        avatar({ name: p.customerName, color: p.customerColor, size: 'lg' }),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'dr-kicker' }, icon('check_circle'), t('ui.delivery.title')),
          h('h2', { class: 'panel-title ellipsis' }, p.customerName),
          h('div', { class: 'panel-sub ellipsis' }, [p.customerType, p.phoneName, p.jobLabel].filter(Boolean).join(' · ')),
        ),
      ),
      h(
        'div',
        { class: 'dr-body scroll' },
        h(
          'div',
          { class: 'dr-pay' },
          h(
            'div',
            { class: 'dr-total' },
            h('div', { class: 'dr-coins', 'aria-hidden': 'true' }, coins),
            h('div', { class: 'dr-total-label' }, t('ui.delivery.total')),
            h(
              'div',
              { class: 'dr-total-val' },
              icon('coin', 'dr-total-coin'),
              h('span', {
                class: 'num',
                keep: true,
                hook: (el: HTMLElement, first: boolean) => animateNumber(el, total, { from: first && !p.instant ? 0 : undefined, ms: 1100, delay: 250 }),
              }),
            ),
          ),
          h(
            'div',
            { class: 'dr-lines' },
            line(t('ui.delivery.payment'), p.payment, 'receipt', undefined, false),
            p.tip > 0 ? line(t('ui.delivery.tip'), p.tip, 'heart', 'is-tip') : h('div', { class: 'dr-line is-none' }, h('span', { class: 'dr-line-label' }, icon('heart'), t('ui.delivery.noTip')), h('span', { class: 'dr-line-val' }, '—')),
            bonus > 0 ? line(t('ui.delivery.bonus'), bonus, 'badge', 'is-tip') : null,
            p.partsCost !== undefined && p.partsCost > 0 ? line(t('ui.delivery.parts'), -p.partsCost, 'box', 'is-cost') : null,
            p.partsCost !== undefined && p.partsCost > 0
              ? h('div', { class: 'dr-line is-profit' }, h('span', { class: 'dr-line-label' }, t('ui.delivery.profit')), money(total - p.partsCost, { tone: 'auto', signed: true, coin: false }))
              : null,
          ),
        ),
        h(
          'div',
          { class: 'dr-review card' },
          h('div', { class: 'dr-review-top' }, h('span', { class: 'dr-review-by' }, t('ui.delivery.review', { name: p.customerName })), stars(p.stars, { size: 'lg', animate: !p.instant })),
          p.reviewText
            ? h('blockquote', { class: 'dr-quote' }, h('span', { class: 'dr-quote-mark', 'aria-hidden': 'true' }, '“'), p.reviewText)
            : h('div', { class: 'dr-quote is-none' }, t('ui.delivery.noReview')),
          p.factors.length > 0
            ? h(
                'div',
                { class: 'dr-factors' },
                p.factors.map((f, i) =>
                  h('span', { class: cx('dr-factor', f.positive ? 'is-pos' : 'is-neg'), style: { '--i': i } }, icon(f.icon ?? (f.positive ? 'thumb_up' : 'thumb_down')), f.text),
                ),
              )
            : null,
        ),
        h(
          'div',
          { class: 'dr-rep' },
          h('span', { class: 'dr-rep-label' }, icon('star'), t('ui.delivery.reputation')),
          h('span', { class: 'dr-rep-from num' }, fmtRep(p.reputationBefore)),
          icon('arrow_right', 'dr-rep-arrow'),
          h('span', { class: 'dr-rep-to num' }, fmtRep(p.reputationAfter)),
          stars(p.reputationAfter),
          delta !== 0
            ? h('span', { class: cx('dr-rep-delta', delta > 0 ? 'is-up' : 'is-down') }, icon(delta > 0 ? 'arrow_up' : 'arrow_down'), `${delta > 0 ? '+' : '−'}${fmtRep(Math.abs(delta))}`)
            : h('span', { class: 'dr-rep-delta' }, '±0'),
        ),
      ),
      h('footer', { class: 'dr-foot' }, button({ label: t('ui.delivery.continue'), variant: 'primary', size: 'lg', iconEnd: 'arrow_right', onClick: () => v.cb.onContinue() })),
    );
  },
});
