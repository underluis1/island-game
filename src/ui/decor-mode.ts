/**
 * Decoration mode overlay: object palette (in stock + buyable, by category), controls bar,
 * total atmosphere meter and exit button. The 3D placement itself happens in the scene.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/decor-mode.css';
import { t } from '../core/i18n';
import { cx, h } from './dom';
import { clamp01 } from './format';
import { icon, type IconName } from './icons';
import { sfx } from './sound';
import { defineView } from './view';
import { button, kbd, money, tabs } from './widgets';

export interface DecorItemVM {
  id: string;
  name: string;
  icon?: IconName | string;
  /** tint of the thumbnail */
  color?: string;
  category: string;
  atmosphere: number;
  price: number;
  /** owned and not placed yet */
  stock: number;
  /** reason (phase/reputation requirement) */
  locked?: string;
}

export interface DecorModeProps {
  money: number;
  categories: Array<{ id: string; name: string }>;
  items: DecorItemVM[];
  /** item currently attached to the cursor */
  selectedId: string | null;
  /** total atmosphere and the next milestone (more customers / tips) */
  atmosphere: { value: number; next?: number; label?: string };
  /** placement preview state of the held item */
  placement?: 'valid' | 'invalid' | null;
  /** an already placed object is selected: enables "sell" hint with its refund */
  sellRefund?: number | null;
  keys: { rotate: string; exit: string };
}

export interface DecorModeCallbacks {
  /** pick an item from the palette (buys it on placement when stock is 0) */
  onSelect(itemId: string): void;
  onDeselect(): void;
  onExit(): void;
}

export const mountDecorMode = defineView<DecorModeProps, DecorModeCallbacks, { category: string }>({
  name: 'decor-mode',
  leaveMs: 200,
  state: () => ({ category: 'all' }),
  render: (v) => {
    const p = v.props;
    const cat = p.categories.some((c) => c.id === v.state.category) || v.state.category === 'stock' ? v.state.category : 'all';
    const items = cat === 'all' ? p.items : cat === 'stock' ? p.items.filter((x) => x.stock > 0) : p.items.filter((x) => x.category === cat);
    const inStock = p.items.reduce((n, x) => n + x.stock, 0);
    const a = p.atmosphere;
    return h(
      'div',
      { class: 'decor' },
      h(
        'div',
        { class: 'decor-top' },
        h(
          'div',
          { class: 'decor-atmo glass' },
          h('span', { class: 'decor-atmo-ic' }, icon('sparkle')),
          h(
            'div',
            { class: 'grow' },
            h('div', { class: 'decor-atmo-top' }, h('span', null, t('ui.common.atmosphere')), h('b', { class: 'num' }, a.value), a.next ? h('span', { class: 'decor-atmo-next num' }, `/ ${a.next}`) : null),
            h('div', { class: 'decor-atmo-bar' }, h('i', { style: { width: `${clamp01(a.next ? a.value / a.next : 1) * 100}%` } })),
            a.label ? h('div', { class: 'decor-atmo-label' }, a.label) : null,
          ),
        ),
        h(
          'div',
          { class: cx('decor-help glass', p.placement === 'invalid' && 'is-invalid') },
          p.placement === 'invalid'
            ? h('span', { class: 'decor-help-item' }, icon('cross_circle'), t('ui.decor.invalid'))
            : [
                h('span', { class: 'decor-help-item' }, icon('mouse'), t('ui.decor.place')),
                h('span', { class: 'decor-help-item' }, kbd(p.keys.rotate), t('ui.decor.rotate')),
                h('span', { class: 'decor-help-item' }, kbd('Delete'), p.sellRefund ? [t('ui.decor.sellFor'), ' ', money(p.sellRefund, { size: 'sm' })] : t('ui.decor.sell')),
              ],
        ),
        button({ label: t('ui.decor.exit'), icon: 'check', variant: 'primary', kbd: p.keys.exit, class: 'decor-exit', sound: 'ui_close', onClick: () => v.cb.onExit() }),
      ),
      h(
        'div',
        { class: 'decor-palette panel pe' },
        h(
          'div',
          { class: 'decor-palette-head' },
          tabs({
            items: [{ id: 'all', label: t('ui.decor.all') }, { id: 'stock', label: t('ui.decor.stock'), badge: inStock || undefined }, ...p.categories.map((c) => ({ id: c.id, label: c.name }))],
            active: cat,
            onSelect: (id) => v.set({ category: id }),
          }),
          h('span', { class: 'grow' }),
          money(p.money, { size: 'lg' }),
        ),
        items.length === 0
          ? h('div', { class: 'decor-empty' }, icon('decor'), t(cat === 'stock' ? 'ui.decor.emptyStock' : 'ui.decor.empty'))
          : h(
              'div',
              { class: 'decor-items scroll', key: cat },
              items.map((it) => {
                const poor = it.stock === 0 && p.money < it.price;
                const blocked = it.locked ?? (poor ? t('ui.common.notEnoughMoney') : undefined);
                return h(
                  'button',
                  {
                    type: 'button',
                    key: it.id,
                    class: cx('decor-item pe', it.id === p.selectedId && 'is-selected', blocked && 'is-blocked'),
                    style: { '--tc': it.color ?? 'var(--c-teal)' },
                    dataset: { hover: '', tip: blocked },
                    onClick: () => {
                      if (blocked) return sfx('error');
                      sfx('ui_click');
                      if (it.id === p.selectedId) v.cb.onDeselect();
                      else v.cb.onSelect(it.id);
                    },
                  },
                  h('span', { class: 'decor-item-art' }, icon(it.locked ? 'lock' : (it.icon ?? 'decor')), it.stock > 0 ? h('span', { class: 'decor-item-stock' }, `×${it.stock}`) : null),
                  h('span', { class: 'decor-item-name' }, it.name),
                  h('span', { class: 'decor-item-foot' }, h('span', { class: 'decor-item-atmo' }, icon('sparkle'), `+${it.atmosphere}`), it.stock > 0 ? h('span', { class: 'decor-item-own' }, t('ui.decor.owned')) : money(it.price, { size: 'sm' })),
                );
              }),
            ),
      ),
    );
  },
});
