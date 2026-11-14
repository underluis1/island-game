/**
 * End-of-day summary (central paper panel, meant for `root.openModal`): income and expenses by item,
 * tips, net result and balance (count-up), today's reviews, chart of the last days, Somchai's loan.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/day-summary.css';
import { t } from '../core/i18n';
import { chart } from './chart';
import { cx, h } from './dom';
import { formatDecimal, formatMoney } from './format';
import { icon, type IconName } from './icons';
import { defineView } from './view';
import { animateNumber, avatar, button, emptyState, scroll, stars } from './widgets';

export interface SummaryLine {
  /** already translated: "Riparazioni", "Affitto del posto"… */
  label: string;
  /** positive number, in baht (the section decides the sign) */
  amount: number;
  /** e.g. number of repairs behind the amount */
  count?: number;
  icon?: IconName | string;
}

export interface SummaryReview {
  customerName: string;
  customerColor?: string;
  stars: number;
  /** already translated */
  text: string;
}

export interface SummaryHistoryPoint {
  day: number;
  /** net profit of that day */
  net: number;
  /** reputation at the end of that day (0..5) */
  reputation: number;
}

export interface SummaryLoan {
  /** "Zio Somchai" */
  lenderName: string;
  lenderColor?: string;
  amount: number;
  /** Somchai's line, already translated */
  quote: string;
  /** reputation lost (positive number, e.g. 0.2) */
  reputationLoss: number;
}

export interface DaySummaryProps {
  day: number;
  shopName?: string;
  /** income lines WITHOUT tips (tips have their own line) */
  income: SummaryLine[];
  tips: number;
  expenses: SummaryLine[];
  /** balance when the day ended, loan included */
  balance: number;
  reputation: number;
  /** change of reputation over the day */
  reputationDelta: number;
  reviews: SummaryReview[];
  /** last days, oldest first, today included */
  history: SummaryHistoryPoint[];
  repairs?: number;
  customers?: number;
  loan?: SummaryLoan;
  /** shows the "game saved" note next to the button */
  saved?: boolean;
  /** final state at once (no count-up) */
  instant?: boolean;
}

export interface DaySummaryCallbacks {
  onNextDay(): void;
}

/** Left-axis bounds giving four round steps (the chart draws 5 grid lines). */
export function niceBounds(values: number[]): { min: number; max: number } {
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  if (hi === 0 && lo === 0) return { min: 0, max: 400 };
  for (let pow = 1; pow < 1e9; pow *= 10) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * pow;
      const neg = Math.ceil(-lo / step);
      const pos = Math.ceil(hi / step);
      if (neg + pos > 4 || neg > 2 || (neg === 2 && m === 2)) continue;
      return { min: -neg * step, max: (4 - neg) * step };
    }
  }
  return { min: lo, max: hi };
}

function lines(list: SummaryLine[], sign: 1 | -1, emptyKey: string): HTMLElement[] {
  if (list.length === 0) return [h('div', { class: 'ds-none' }, t(emptyKey))];
  return list.map((l) =>
    h(
      'div',
      { class: 'ds-line' },
      h('span', { class: 'ds-line-ic' }, icon(l.icon ?? (sign > 0 ? 'coin' : 'receipt'))),
      h('span', { class: 'ds-line-label ellipsis' }, l.label),
      l.count !== undefined ? h('span', { class: 'ds-line-count' }, `×${l.count}`) : null,
      h('span', { class: 'ds-line-dots' }),
      h('span', { class: cx('ds-line-val num', sign > 0 ? 'is-in' : 'is-out') }, formatMoney(sign * l.amount, { signed: sign > 0 })),
    ),
  );
}

export const mountDaySummary = defineView<DaySummaryProps, DaySummaryCallbacks>({
  name: 'day-summary',
  render: (v) => {
    const p = v.props;
    const incomeTotal = p.income.reduce((s, l) => s + l.amount, 0) + p.tips;
    const expenseTotal = p.expenses.reduce((s, l) => s + l.amount, 0);
    const net = incomeTotal - expenseTotal;
    const count = (to: number, signed: boolean, delay: number) => ({
      keep: true,
      hook: (el: HTMLElement, first: boolean) =>
        animateNumber(el, to, { from: first && !p.instant ? 0 : undefined, ms: 1000, delay, format: (n) => formatMoney(n, { signed }) }),
    });
    const bounds = niceBounds(p.history.map((d) => d.net));
    const repDelta = Math.round(p.reputationDelta * 100) / 100;
    return h(
      'section',
      { class: cx('panel ds', p.instant && 'is-instant') },
      h(
        'header',
        { class: 'ds-head wood' },
        h('span', { class: 'ds-head-ic' }, icon('sunset')),
        h(
          'div',
          { class: 'grow' },
          h('h2', { class: 'ds-title' }, t('ui.summary.title')),
          h('div', { class: 'ds-sub ellipsis' }, [t('ui.common.day', { n: p.day }), p.shopName].filter(Boolean).join(' · ')),
        ),
        p.repairs !== undefined ? h('div', { class: 'ds-stat' }, h('b', null, p.repairs), h('span', null, t('ui.summary.repairs'))) : null,
        p.customers !== undefined ? h('div', { class: 'ds-stat' }, h('b', null, p.customers), h('span', null, t('ui.summary.customers'))) : null,
        h(
          'div',
          { class: 'ds-rep' },
          h('div', { class: 'ds-rep-top' }, h('b', { class: 'num' }, formatDecimal(p.reputation, 1)), stars(p.reputation)),
          h(
            'span',
            { class: cx('ds-rep-delta', repDelta > 0 && 'is-up', repDelta < 0 && 'is-down') },
            repDelta === 0 ? `${t('ui.common.reputation')} ±0` : `${t('ui.common.reputation')} ${repDelta > 0 ? '+' : '−'}${formatDecimal(Math.abs(repDelta), 1)}`,
          ),
        ),
      ),
      scroll(
        { class: 'ds-body' },
        h(
          'div',
          { class: 'ds-col' },
          h(
            'div',
            { class: 'card ds-card' },
            h('div', { class: 'ds-card-head' }, h('span', { class: 'ds-card-title is-in' }, icon('arrow_down'), t('ui.summary.income')), h('span', { class: 'ds-card-total num is-in' }, formatMoney(incomeTotal, { signed: true }))),
            lines(p.income, 1, 'ui.summary.noIncome'),
            p.tips > 0
              ? h(
                  'div',
                  { class: 'ds-line is-tips' },
                  h('span', { class: 'ds-line-ic' }, icon('heart')),
                  h('span', { class: 'ds-line-label' }, t('ui.summary.tips')),
                  h('span', { class: 'ds-line-dots' }),
                  h('span', { class: 'ds-line-val num is-in' }, formatMoney(p.tips, { signed: true })),
                )
              : null,
          ),
          h(
            'div',
            { class: 'card ds-card' },
            h('div', { class: 'ds-card-head' }, h('span', { class: 'ds-card-title is-out' }, icon('arrow_up'), t('ui.summary.expenses')), h('span', { class: 'ds-card-total num is-out' }, formatMoney(-expenseTotal))),
            lines(p.expenses, -1, 'ui.summary.noExpenses'),
          ),
          p.loan
            ? h(
                'div',
                { class: 'ds-loan' },
                avatar({ name: p.loan.lenderName, color: p.loan.lenderColor ?? '#e58a3c', size: 'lg' }),
                h(
                  'div',
                  { class: 'grow' },
                  h('div', { class: 'ds-loan-title' }, t('ui.summary.loanTitle', { name: p.loan.lenderName })),
                  h('div', { class: 'ds-loan-quote' }, `“${p.loan.quote}”`),
                  h(
                    'div',
                    { class: 'ds-loan-tags' },
                    h('span', { class: 'badge tone-ok' }, icon('coin'), `${t('ui.summary.loanAmount')} ${formatMoney(p.loan.amount, { signed: true })}`),
                    h('span', { class: 'badge tone-bad' }, icon('star'), `${t('ui.summary.loanRep')} −${formatDecimal(p.loan.reputationLoss, 1)}`),
                  ),
                ),
              )
            : null,
        ),
        h(
          'div',
          { class: 'ds-col' },
          h(
            'div',
            { class: 'card ds-card' },
            h('div', { class: 'ds-card-head' }, h('span', { class: 'ds-card-title' }, icon('chart'), t('ui.summary.chart'))),
            chart({
              height: 200,
              labels: p.history.map((d) => t('ui.common.dayShort', { n: d.day })),
              series: [
                { label: t('ui.summary.chartNet'), values: p.history.map((d) => d.net), tone: 'teal', kind: 'bars', min: bounds.min, max: bounds.max },
                { label: t('ui.summary.chartRep'), values: p.history.map((d) => d.reputation), tone: 'gold', axis: 'right', min: 0, max: 5, format: (x) => (x === 0 || x === 5 ? String(x) : x === 2.5 ? formatDecimal(2.5, 1) : '') },
              ],
            }),
          ),
          h(
            'div',
            { class: 'card ds-card ds-reviews' },
            h('div', { class: 'ds-card-head' }, h('span', { class: 'ds-card-title' }, icon('tab_reviews'), t('ui.summary.reviews')), p.reviews.length > 0 ? h('span', { class: 'badge tone-neutral' }, p.reviews.length) : null),
            p.reviews.length === 0
              ? emptyState({ icon: 'palm', title: t('ui.summary.noReviews'), text: t('ui.summary.noReviewsText'), class: 'ds-empty' })
              : p.reviews.map((r, i) =>
                  h(
                    'div',
                    { class: 'ds-review', style: { '--i': i } },
                    avatar({ name: r.customerName, color: r.customerColor, size: 'sm' }),
                    h(
                      'div',
                      { class: 'grow' },
                      h('div', { class: 'ds-review-top' }, h('b', { class: 'ellipsis' }, r.customerName), stars(r.stars, { size: 'sm' })),
                      h('div', { class: 'ds-review-text' }, r.text),
                    ),
                  ),
                ),
          ),
        ),
      ),
      h(
        'footer',
        { class: 'ds-foot' },
        h(
          'div',
          { class: cx('ds-net', net < 0 ? 'is-neg' : 'is-pos') },
          h('div', { class: 'ds-net-label' }, t('ui.summary.net')),
          h('div', { class: 'ds-net-val num', ...count(net, true, 300) }),
        ),
        h(
          'div',
          { class: 'ds-balance' },
          h('div', { class: 'ds-net-label' }, t('ui.summary.balance')),
          h('div', { class: 'ds-balance-val' }, icon('coin'), h('span', { class: 'num', ...count(p.balance, false, 700) })),
        ),
        h('span', { class: 'grow' }),
        p.saved ? h('span', { class: 'ds-saved' }, icon('save'), t('ui.summary.saved')) : null,
        button({ label: t('ui.summary.next'), variant: 'primary', size: 'lg', icon: 'sun', iconEnd: 'arrow_right', onClick: () => v.cb.onNextDay() }),
      ),
    );
  },
});
