/** Tablet › Mercatino: today's second-hand listings (buy broken phones, fix them, resell). */
import { cx, h } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';
import { avatar, badge, button, emptyState, money } from '../widgets';
import { buyBlock, page, phoneThumb, tt, type TV } from './shared';
import type { MarketListingVM } from './types';

function listing(v: TV, l: MarketListingVM, i: number): HTMLElement {
  const margin = l.marketValue - l.price;
  return h(
    'article',
    { class: cx('tb-listing card', l.sold && 'is-sold'), key: l.id, style: { '--i': i } },
    h(
      'div',
      { class: 'tb-listing-head' },
      phoneThumb(l.phoneColor, 'tb-phone-lg'),
      h(
        'div',
        { class: 'grow', style: 'min-width:0' },
        h('h3', { class: 'tb-order-model ellipsis' }, l.model),
        h('div', { class: 'tb-order-who' }, avatar({ name: l.seller, color: l.sellerColor, size: 'sm' }), h('span', { class: 'tb-order-customer ellipsis' }, l.seller)),
      ),
    ),
    h('p', { class: 'tb-listing-pitch' }, `“${l.pitch}”`),
    h('div', { class: 'tb-issues' }, l.issues.map((x) => h('span', { class: 'tb-issue' }, x)), l.risky ? h('span', { class: 'tb-issue is-risky', dataset: { tip: tt('market.riskyTip') } }, icon('question'), tt('market.risky')) : null),
    h(
      'div',
      { class: 'tb-listing-foot' },
      h(
        'div',
        { class: 'tb-listing-prices' },
        money(l.price, { size: 'lg' }),
        h('span', { class: 'tb-listing-value', dataset: { tip: tt('market.valueTip') } }, tt('market.value', { price: formatMoney(l.marketValue) }), margin > 0 ? h('b', { class: 't-ok' }, ` (${formatMoney(margin, { signed: true })})`) : null),
      ),
      l.sold ? badge(tt('market.sold'), 'neutral', 'check') : button({ label: tt('market.buy'), icon: 'cart', variant: 'primary', disabled: buyBlock(v, l.price, l.disabled), onClick: () => v.cb.onBuyMarketPhone(l.id) }),
    ),
    l.sold ? h('span', { class: 'tb-stamp' }, tt('market.sold')) : null,
  );
}

export function renderMarket(v: TV): HTMLElement {
  const m = v.props.market;
  return page(
    { key: 'market', title: tt('market.title'), subtitle: tt('market.subtitle'), icon: 'tab_market', trailing: m.locked || m.listings.length === 0 ? null : h('span', { class: 'tb-eta' }, icon('sunset'), tt('market.refresh')) },
    m.locked
      ? emptyState({ icon: 'lock', title: tt('market.lockedTitle'), text: m.locked })
      : m.listings.length === 0
        ? emptyState({ icon: 'tab_market', title: tt('market.emptyTitle'), text: tt('market.emptyText') })
        : h('div', { class: 'tb-grid tb-grid-3' }, m.listings.map((l, i) => listing(v, l, i))),
  );
}
