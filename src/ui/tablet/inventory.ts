/** Tablet › Magazzino: spare parts, decorations in stock and owned used phones. */
import { t } from '../../core/i18n';
import { cx, h } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';
import { badge, button, emptyState, money, slider, tabs, type Tone } from '../widgets';
import { atmosphereChip, linkButton, page, phoneThumb, thumb, tt, type TV } from './shared';
import type { BuyQuality, InventoryTab, StockPartVM, UsedPhoneVM } from './types';

const Q_TONE: Record<BuyQuality, Tone> = { cheap: 'neutral', good: 'teal', refurb: 'gold' };

function partsBody(v: TV): HTMLElement {
  const inv = v.props.inventory;
  if (inv.parts.length === 0 && inv.incoming.length === 0) {
    return emptyState({ icon: 'box', title: tt('inventory.partsEmptyTitle'), text: tt('inventory.partsEmptyText'), action: linkButton(v, tt('inventory.goParts'), 'catalog', 'parts') });
  }
  const groups = new Map<string, StockPartVM[]>();
  for (const p of inv.parts) {
    const list = groups.get(p.model) ?? [];
    list.push(p);
    groups.set(p.model, list);
  }
  return h(
    'div',
    { class: 'col tb-gap' },
    inv.incoming.length > 0
      ? h(
          'div',
          { class: 'tb-incoming-box' },
          h('div', { class: 'tb-incoming-head' }, icon('boat'), h('b', null, tt('inventory.incoming'))),
          h(
            'div',
            { class: 'tb-incoming-list' },
            inv.incoming.map((x) =>
              h('div', { class: 'tb-incoming-row', key: x.id }, h('span', { class: 'grow ellipsis' }, x.name), h('b', { class: 'num' }, `×${x.qty}`), x.express ? badge(tt('parts.express'), 'info', 'bolt') : null, h('span', { class: 'tb-eta' }, icon('clock'), x.eta)),
            ),
          ),
        )
      : null,
    [...groups.entries()].map(([model, list]) =>
      h(
        'div',
        { class: 'col', key: model },
        h('div', { class: 'section-title' }, model),
        h(
          'div',
          { class: 'tb-grid tb-grid-3' },
          list.map((p) =>
            h(
              'div',
              { class: 'tb-stock card', key: p.id },
              thumb(p.icon ?? 'part_chip'),
              h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'tb-card-title ellipsis' }, p.name), h('div', { class: 'row' }, badge(t(`ui.quality.${p.quality === 'refurb' ? 'refurbShort' : p.quality}`), Q_TONE[p.quality]), p.reserved ? h('span', { class: 'tb-reserved' }, tt('inventory.reserved', { n: p.reserved })) : null)),
              h('b', { class: 'tb-qty num' }, `×${p.qty}`),
            ),
          ),
        ),
      ),
    ),
  );
}

function decorBody(v: TV): HTMLElement {
  const list = v.props.inventory.decor;
  if (list.length === 0) {
    return emptyState({ icon: 'decor', title: tt('inventory.decorEmptyTitle'), text: tt('inventory.decorEmptyText'), action: linkButton(v, tt('inventory.goDecor'), 'catalog', 'decor') });
  }
  return h(
    'div',
    { class: 'tb-grid tb-grid-3' },
    list.map((d) =>
      h(
        'div',
        { class: 'tb-stock card', key: d.id },
        thumb(d.icon ?? 'decor', d.color),
        h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'tb-card-title ellipsis' }, d.name), h('div', { class: 'row' }, atmosphereChip(d.atmosphere), h('span', { class: 'dim num' }, `×${d.qty}`))),
        button({ label: tt('inventory.place'), size: 'sm', variant: 'primary', icon: 'decor', onClick: () => v.cb.onPlaceDecor(d.id) }),
      ),
    ),
  );
}

function phoneCard(v: TV, p: UsedPhoneVM): HTMLElement {
  const locked = v.props.inventory.showcaseLocked;
  const price = v.state.listPrices[p.id] ?? p.suggestedPrice;
  const profit = (p.state === 'listed' ? (p.listedPrice ?? price) : price) - p.paid;
  const stateBadge = p.state === 'broken' ? badge(tt('inventory.phoneBroken'), 'warn', 'phone_cracked') : p.state === 'repaired' ? badge(tt('inventory.phoneRepaired'), 'ok', 'check') : badge(tt('inventory.phoneListed'), 'gold', 'tag');
  let action: HTMLElement;
  if (p.state === 'broken') {
    action = h('div', { class: 'tb-used-action' }, h('span', { class: 'muted grow' }, tt('inventory.repairFirst')), button({ label: tt('orders.repair'), icon: 'tool_screwdriver', variant: 'primary', disabled: p.disabled, onClick: () => v.cb.onRepairUsedPhone(p.id) }));
  } else if (p.state === 'listed') {
    action = h(
      'div',
      { class: 'tb-used-action' },
      h('span', { class: 'grow' }, tt('inventory.listedAt'), ' ', money(p.listedPrice ?? price)),
      button({ label: tt('inventory.unlist'), size: 'sm', onClick: () => v.cb.onUnlistUsedPhone(p.id) }),
    );
  } else {
    action = h(
      'div',
      { class: 'tb-used-sell' },
      h(
        'div',
        { class: 'tb-used-price' },
        h('span', { class: 'tb-opt-label' }, tt('inventory.askPrice')),
        slider({
          value: price,
          min: p.minPrice,
          max: p.maxPrice,
          step: 50,
          band: { from: p.suggestedPrice * 0.92, to: Math.min(p.maxPrice, p.suggestedPrice * 1.08) },
          ariaLabel: tt('inventory.askPrice'),
          onInput: (val) => v.set({ listPrices: { ...v.state.listPrices, [p.id]: val } }),
        }),
        h('b', { class: 'tb-used-value num' }, formatMoney(price)),
      ),
      button({ label: tt('inventory.list'), icon: 'tag', variant: 'gold', disabled: p.disabled ?? locked, onClick: () => v.cb.onListUsedPhone(p.id, price) }),
    );
  }
  return h(
    'article',
    { class: cx('tb-used card', `is-${p.state}`), key: p.id },
    phoneThumb(p.phoneColor, 'tb-phone-lg'),
    h(
      'div',
      { class: 'tb-used-main' },
      h('div', { class: 'tb-order-top' }, h('h3', { class: 'tb-order-model ellipsis' }, p.model), stateBadge),
      h('div', { class: 'tb-order-job' }, p.conditionText),
      p.issues && p.issues.length > 0 ? h('div', { class: 'tb-issues' }, p.issues.map((x) => h('span', { class: 'tb-issue' }, x))) : null,
      h(
        'div',
        { class: 'tb-used-money' },
        h('span', null, tt('inventory.paid'), ' ', h('b', { class: 'num' }, formatMoney(p.paid))),
        p.state !== 'broken' ? h('span', { class: profit >= 0 ? 't-ok' : 't-bad' }, tt('inventory.margin'), ' ', h('b', { class: 'num' }, formatMoney(profit, { signed: true }))) : null,
      ),
      action,
    ),
  );
}

function phonesBody(v: TV): HTMLElement {
  const list = v.props.inventory.phones;
  if (list.length === 0) {
    return emptyState({ icon: 'phone', title: tt('inventory.phonesEmptyTitle'), text: tt('inventory.phonesEmptyText'), action: linkButton(v, tt('inventory.goMarket'), 'market') });
  }
  const locked = v.props.inventory.showcaseLocked;
  return h('div', { class: 'col tb-gap' }, locked ? h('div', { class: 'tb-hint' }, icon('lock'), h('span', null, locked)) : null, h('div', { class: 'tb-list' }, list.map((p) => phoneCard(v, p))));
}

export function renderInventory(v: TV): HTMLElement {
  const inv = v.props.inventory;
  const sub: InventoryTab = v.state.inventoryTab;
  const partCount = inv.parts.reduce((n, p) => n + p.qty, 0);
  return page(
    {
      key: `inventory-${sub}`,
      title: tt('inventory.title'),
      subtitle: tt('inventory.subtitle'),
      icon: 'tab_inventory',
      toolbar: tabs<InventoryTab>({
        items: [
          { id: 'parts', label: tt('inventory.tabs.parts'), icon: 'box', badge: partCount || undefined },
          { id: 'decor', label: tt('inventory.tabs.decor'), icon: 'decor', badge: inv.decor.reduce((n, d) => n + d.qty, 0) || undefined },
          { id: 'phones', label: tt('inventory.tabs.phones'), icon: 'phone', badge: inv.phones.length || undefined },
        ],
        active: sub,
        onSelect: (id) => v.set({ inventoryTab: id }),
      }),
    },
    sub === 'parts' ? partsBody(v) : sub === 'decor' ? decorBody(v) : phonesBody(v),
  );
}
