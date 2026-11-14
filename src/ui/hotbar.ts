/** Tool hotbar (keys 1–9, pages when there are more than 9 tools) and the screwdriver bit selector. */
import './styles/tokens.css';
import './styles/base.css';
import './styles/hud.css';
import { t } from '../core/i18n';
import type { ScrewType } from '../gameplay/repair/types';
import { cx, h } from './dom';
import { icon, type IconName } from './icons';
import { sfx } from './sound';
import { defineView } from './view';
import { pips } from './widgets';

export interface HotbarTool {
  id: string;
  name: string;
  icon: IconName | string;
  /** 0 = not owned */
  tier: number;
  maxTier?: number;
  /** ok = selectable; disabled = owned but unusable now (reason); missing = not owned */
  state: 'ok' | 'disabled' | 'missing';
  reason?: string;
  /** the guide suggests this tool */
  suggested?: boolean;
}

export interface HotbarProps {
  tools: HotbarTool[];
  selectedId: string | null;
  /** controlled page (0-based); omitted = internal state following the selection */
  page?: number;
  /** shown only while the screwdriver is selected */
  bits?: { options: ScrewType[]; selected: ScrewType; suggested?: ScrewType } | null;
}

export interface HotbarCallbacks {
  onSelect(toolId: string): void;
  onSelectBit?(bit: ScrewType): void;
  onPage?(page: number): void;
}

const PER_PAGE = 9;

export const mountHotbar = defineView<HotbarProps, HotbarCallbacks, { page: number }>({
  name: 'hotbar',
  state: (p) => ({ page: Math.max(0, Math.floor(p.tools.findIndex((x) => x.id === p.selectedId) / PER_PAGE)) }),
  updated: (v, prev) => {
    if (v.props.selectedId === prev.selectedId || v.props.page !== undefined) return;
    const i = v.props.tools.findIndex((x) => x.id === v.props.selectedId);
    if (i >= 0 && Math.floor(i / PER_PAGE) !== v.state.page) v.set({ page: Math.floor(i / PER_PAGE) });
  },
  render: (v) => {
    const p = v.props;
    const pages = Math.max(1, Math.ceil(p.tools.length / PER_PAGE));
    const page = Math.min(pages - 1, p.page ?? v.state.page);
    const slice = p.tools.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
    const setPage = (n: number): void => {
      const next = (n + pages) % pages;
      sfx('ui_tab');
      v.set({ page: next });
      v.cb.onPage?.(next);
    };
    const selected = p.tools.find((x) => x.id === p.selectedId);
    return h(
      'div',
      { class: 'hotbar-wrap' },
      p.bits
        ? h(
            'div',
            { class: 'bits glass', key: 'bits' },
            h('span', { class: 'bits-label' }, t('ui.hotbar.bit')),
            p.bits.options.map((b) =>
              h(
                'button',
                {
                  type: 'button',
                  key: b,
                  class: cx('bit pe', b === p.bits?.selected && 'is-active', b === p.bits?.suggested && 'is-suggested'),
                  dataset: { tip: t(`ui.screw.${b}`), hover: '' },
                  onClick: () => {
                    if (b === p.bits?.selected) return;
                    sfx('ui_click');
                    v.cb.onSelectBit?.(b);
                  },
                },
                icon(`screw_${b}`),
                h('span', null, b),
              ),
            ),
          )
        : null,
      h(
        'div',
        { class: 'hotbar glass' },
        pages > 1 ? h('button', { type: 'button', class: 'hotbar-page pe', dataset: { hover: '', tip: t('ui.hotbar.prevPage') }, onClick: () => setPage(page - 1) }, icon('chevron_left')) : null,
        slice.map((tool, i) =>
          h(
            'button',
            {
              type: 'button',
              key: tool.id,
              class: cx('slot pe', tool.id === p.selectedId && 'is-selected', `is-${tool.state}`, tool.suggested && 'is-suggested'),
              dataset: { hover: '', tip: tool.state === 'ok' ? tool.name : `${tool.name}\n${tool.reason ?? (tool.state === 'missing' ? t('ui.hotbar.missing') : '')}` },
              'aria-label': tool.name,
              'aria-pressed': String(tool.id === p.selectedId),
              onClick: () => {
                if (tool.state !== 'ok') {
                  sfx('error');
                  return;
                }
                sfx('ui_click');
                v.cb.onSelect(tool.id);
              },
            },
            h('span', { class: 'slot-key' }, i + 1),
            h('span', { class: 'slot-ic' }, icon(tool.state === 'missing' ? 'lock' : tool.icon)),
            tool.state === 'missing' ? null : pips(tool.tier, tool.maxTier ?? 3, 'slot-tier'),
          ),
        ),
        pages > 1 ? h('button', { type: 'button', class: 'hotbar-page pe', dataset: { hover: '', tip: t('ui.hotbar.nextPage') }, onClick: () => setPage(page + 1) }, icon('chevron_right')) : null,
        pages > 1 ? h('span', { class: 'hotbar-dots' }, Array.from({ length: pages }, (_, i) => h('i', { class: i === page ? 'is-on' : '' }))) : null,
        selected ? h('span', { class: 'hotbar-name', key: `n-${selected.id}` }, selected.name) : null,
      ),
    );
  },
});
