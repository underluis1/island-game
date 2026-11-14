/**
 * Tablet — the shop's management device (orders, catalog, inventory, market, stats, reviews,
 * encyclopedia, assistant). Mount it with `root.openModal((p) => mountTablet(p, props, cb), { trapFocus: false })`
 * or directly on the panels layer; it centres itself inside its parent.
 */
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/tablet.css';
import { t } from '../../core/i18n';
import { cx, h } from '../dom';
import { formatClock } from '../format';
import { icon } from '../icons';
import { sfx } from '../sound';
import { defineView } from '../view';
import { kbd, money, stars } from '../widgets';
import { renderAssistant } from './assistant';
import { renderCatalog } from './catalog';
import { renderEncyclopedia } from './encyclopedia';
import { renderInventory } from './inventory';
import { renderMarket } from './market';
import { renderOrders } from './orders';
import { renderReviews } from './reviews';
import { activeTab, selectTab, tt, type TV } from './shared';
import { renderStats } from './stats';
import type { TabletCallbacks, TabletProps, TabletState, TabletTab } from './types';

export type * from './types';

export const TABLET_TABS: TabletTab[] = ['orders', 'catalog', 'inventory', 'market', 'stats', 'reviews', 'encyclopedia', 'assistant'];

const RENDER: Record<TabletTab, (v: TV) => HTMLElement> = {
  orders: renderOrders,
  catalog: renderCatalog,
  inventory: renderInventory,
  market: renderMarket,
  stats: renderStats,
  reviews: renderReviews,
  encyclopedia: renderEncyclopedia,
  assistant: renderAssistant,
};

function rail(v: TV): HTMLElement {
  const active = activeTab(v);
  return h(
    'nav',
    { class: 'tb-rail', role: 'tablist', 'aria-orientation': 'vertical' },
    TABLET_TABS.map((id) => {
      const locked = v.props.lockedTabs?.[id];
      const badge = v.props.badges?.[id];
      return h(
        'button',
        {
          type: 'button',
          role: 'tab',
          key: id,
          class: cx('tb-rail-tab pe', id === active && 'is-active', locked && 'is-locked'),
          'aria-selected': String(id === active),
          dataset: { tip: locked, hover: '' },
          onClick: () => {
            if (locked) {
              sfx('error');
              return;
            }
            if (id === active) return;
            sfx('ui_tab');
            selectTab(v, id);
          },
        },
        h('span', { class: 'tb-rail-ic' }, icon(locked ? 'lock' : `tab_${id}`)),
        h('span', { class: 'tb-rail-label' }, tt(`tabs.${id}`)),
        badge ? h('span', { class: 'tb-rail-badge' }, badge) : null,
      );
    }),
  );
}

function statusBar(v: TV): HTMLElement {
  const s = v.props.status;
  const night = s.time < 6 || s.time >= 19;
  return h(
    'header',
    { class: 'tb-status' },
    h('div', { class: 'tb-status-shop' }, icon('shop'), h('span', { class: 'ellipsis' }, s.shopName)),
    h(
      'div',
      { class: 'tb-status-time' },
      h('span', null, t('ui.common.day', { n: s.day })),
      h('i', { class: 'tb-status-sep' }),
      icon(night ? 'moon' : 'sun'),
      h('span', { class: 'num' }, formatClock(s.time)),
    ),
    h(
      'div',
      { class: 'tb-status-right' },
      h('span', { class: 'tb-status-rep', dataset: { tip: t('ui.common.reputation') } }, stars(s.reputation, { size: 'sm' })),
      h('span', { class: 'tb-status-money' }, money(s.money)),
      h(
        'button',
        {
          type: 'button',
          class: 'tb-close pe',
          'aria-label': t('ui.common.close'),
          dataset: { tip: t('ui.common.close'), hover: '' },
          onClick: () => {
            sfx('ui_close');
            v.cb.onClose();
          },
        },
        icon('cross'),
        kbd(v.props.closeKey ?? 'Tab'),
      ),
    ),
  );
}

export const mountTablet = defineView<TabletProps, TabletCallbacks, TabletState>({
  name: 'tablet',
  leaveMs: 180,
  state: (p) => ({
    tab: p.tab ?? 'orders',
    catalogTab: p.catalogTab ?? 'tools',
    partsModel: p.catalog.parts.models.find((m) => !m.locked)?.id ?? '',
    partsCategory: p.catalog.parts.categories[0]?.id ?? '',
    partsQty: 1,
    partsExpress: false,
    decorCategory: 'all',
    inventoryTab: 'parts',
    listPrices: {},
    reviewFilter: 'all',
    encModel: p.encyclopedia.models.find((m) => !m.locked)?.id ?? '',
    encEntry: null,
    nameDraft: null,
    confirmFire: false,
    confirmExpansion: false,
  }),
  render: (v) => {
    const tab = activeTab(v);
    return h(
      'div',
      { class: 'tablet pe', role: 'dialog', 'aria-label': tt('title') },
      h('i', { class: 'tb-cam' }),
      h('div', { class: 'tb-screen' }, statusBar(v), h('div', { class: 'tb-main' }, rail(v), h('div', { class: 'tb-content', dataset: { tab } }, RENDER[tab](v)))),
    );
  },
});
