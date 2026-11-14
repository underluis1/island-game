/** Tablet › Statistiche: money and reputation per day, lifetime totals. */
import { t } from '../../core/i18n';
import { chart } from '../chart';
import { h } from '../dom';
import { formatDecimal, formatMoney, formatNumber } from '../format';
import { icon } from '../icons';
import { emptyState } from '../widgets';
import { page, tt, type TV } from './shared';
import type { IconId } from './types';

function tile(ic: IconId, label: string, value: string, tone: string, i: number): HTMLElement {
  return h('div', { class: `tb-tile card is-${tone}`, style: { '--i': i } }, h('span', { class: 'tb-tile-ic' }, icon(ic)), h('div', { class: 'tb-tile-text' }, h('div', { class: 'tb-tile-value num' }, value), h('div', { class: 'tb-tile-label' }, label)));
}

export function renderStats(v: TV): HTMLElement {
  const s = v.props.stats;
  const tot = s.totals;
  if (s.days.length === 0) {
    return page({ key: 'stats', title: tt('stats.title'), subtitle: tt('stats.subtitle'), icon: 'tab_stats' }, emptyState({ icon: 'tab_stats', title: tt('stats.emptyTitle'), text: tt('stats.emptyText') }));
  }
  const days = s.days.slice(-14);
  return page(
    { key: 'stats', title: tt('stats.title'), subtitle: tt('stats.subtitle'), icon: 'tab_stats' },
    h(
      'div',
      { class: 'tb-tiles' },
      tile('coins', tt('stats.earned'), formatMoney(tot.earned), 'teal', 0),
      tile('receipt', tt('stats.spent'), formatMoney(tot.spent), 'coral', 1),
      tile('chart', tt('stats.profit'), formatMoney(tot.earned - tot.spent, { signed: true }), tot.earned - tot.spent >= 0 ? 'green' : 'coral', 2),
      tile('heart', tt('stats.tips'), formatMoney(tot.tips), 'gold', 3),
    ),
    h(
      'div',
      { class: 'tb-stats-main' },
      h(
        'div',
        { class: 'tb-chart card' },
        h('div', { class: 'section-title' }, tt('stats.chartTitle', { n: days.length })),
        chart({
          height: 250,
          labels: days.map((d) => t('ui.common.dayShort', { n: d.day })),
          series: [
            { label: tt('stats.income'), values: days.map((d) => d.income), tone: 'teal', kind: 'bars', format: (x) => formatNumber(x) },
            { label: tt('stats.expenses'), values: days.map((d) => d.expenses), tone: 'coral', kind: 'bars' },
            { label: t('ui.common.reputation'), values: days.map((d) => d.reputation), tone: 'gold', axis: 'right', min: 0, max: 5, format: (x) => `${formatDecimal(x, 0)}★` },
          ],
        }),
      ),
      h(
        'div',
        { class: 'tb-totals card' },
        h('div', { class: 'section-title' }, tt('stats.totals')),
        h(
          'dl',
          { class: 'tb-facts' },
          ...(
            [
              ['tool_screwdriver', tt('stats.repairs'), formatNumber(tot.repairs)],
              ['sparkle', tt('stats.perfect'), formatNumber(tot.perfectRepairs)],
              ['users', tt('stats.served'), formatNumber(tot.customersServed)],
              ['exit', tt('stats.lost'), formatNumber(tot.customersLost)],
              ['tag', tt('stats.flipped'), formatNumber(tot.phonesFlipped)],
              ['star', tt('stats.bestDay'), formatMoney(tot.bestDay)],
            ] as Array<[IconId, string, string]>
          ).map(([ic, label, value]) => h('div', { class: 'tb-fact' }, h('dt', null, icon(ic), label), h('dd', { class: 'num' }, value))),
        ),
      ),
    ),
  );
}
