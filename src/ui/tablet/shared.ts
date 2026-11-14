/** Helpers shared by the tablet tabs. */
import { t } from '../../core/i18n';
import { cx, h, type Child } from '../dom';
import { icon } from '../icons';
import type { View } from '../view';
import { button, scroll } from '../widgets';
import type { CatalogTab, IconId, TabletCallbacks, TabletProps, TabletState, TabletTab } from './types';

export type TV = View<TabletProps, TabletCallbacks, TabletState>;

/** Shorthand for `t('ui.tablet.…')`. */
export const tt = (key: string, params?: Record<string, string | number>): string => t(`ui.tablet.${key}`, params);

/** One tablet "app page": title row, optional toolbar (sub-tabs, filters) and a scrollable body. */
export function page(
  o: { key: string; title: string; subtitle?: string; icon: IconId; trailing?: Child; toolbar?: Child; bodyClass?: string; footer?: Child },
  ...body: Child[]
): HTMLElement {
  return h(
    'section',
    { class: 'tb-page', key: o.key },
    h(
      'header',
      { class: 'tb-page-head' },
      h('span', { class: 'tb-page-ic' }, icon(o.icon)),
      h('div', { class: 'tb-page-titles' }, h('h2', { class: 'tb-page-title' }, o.title), o.subtitle ? h('div', { class: 'tb-page-sub' }, o.subtitle) : null),
      o.trailing ? h('div', { class: 'tb-page-trailing' }, o.trailing) : null,
    ),
    o.toolbar ? h('div', { class: 'tb-toolbar' }, o.toolbar) : null,
    scroll({ class: cx('tb-body', o.bodyClass), key: `${o.key}-body` }, ...body),
    o.footer ?? null,
  );
}

/** Tiny phone silhouette tinted with the body colour. */
export function phoneThumb(color?: string, cls?: string): HTMLElement {
  return h('span', { class: cx('tb-phone', cls), style: { '--pc': color ?? '#2a2f3a' }, 'aria-hidden': 'true' }, h('i', null));
}

/** Rounded tile with an icon, tinted with `color`. */
export function thumb(ic: IconId, color?: string, cls?: string): HTMLElement {
  return h('span', { class: cx('tb-thumb', cls), style: color ? { '--tc': color } : undefined, 'aria-hidden': 'true' }, icon(ic));
}

/** Reason that disables a purchase: explicit reason first, then the money check. */
export function buyBlock(v: TV, price: number, reason?: string): string | undefined {
  if (reason) return reason;
  return v.props.status.money < price ? t('ui.common.notEnoughMoney') : undefined;
}

/** Small "label: value" pill used in card footers. */
export function meta(ic: IconId, text: Child, cls?: string): HTMLElement {
  return h('span', { class: cx('tb-meta', cls) }, icon(ic), h('span', null, text));
}

export function atmosphereChip(value: number): HTMLElement {
  return h('span', { class: 'tb-atmo', dataset: { tip: t('ui.common.atmosphere') } }, icon('sparkle'), `+${value}`);
}

/** Active tab: the controlled prop wins over the local state. */
export function activeTab(v: TV): TabletTab {
  return v.props.tab ?? v.state.tab;
}

export function activeCatalogTab(v: TV): CatalogTab {
  return v.props.catalogTab ?? v.state.catalogTab;
}

export function selectTab(v: TV, tab: TabletTab, catalogTab?: CatalogTab): void {
  v.set({ tab, catalogTab: catalogTab ?? v.state.catalogTab, confirmFire: false, confirmExpansion: false });
  v.cb.onTabChange?.(tab, catalogTab ?? activeCatalogTab(v));
}

/** Button that jumps to another tab ("Vai al catalogo"). */
export function linkButton(v: TV, label: string, tab: TabletTab, catalogTab?: CatalogTab, variant: 'primary' | 'secondary' = 'primary'): HTMLElement {
  return button({ label, variant, iconEnd: 'arrow_right', sound: 'ui_tab', onClick: () => selectTab(v, tab, catalogTab) });
}
