/** Tablet › Catalogo: tools, spare parts, decorations, shop expansion and customisation. */
import { t } from '../../core/i18n';
import { cx, h } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';
import { sfx } from '../sound';
import { badge, button, emptyState, money, pips, segmented, tabs, textInput } from '../widgets';
import { activeCatalogTab, atmosphereChip, buyBlock, page, selectTab, thumb, tt, type TV } from './shared';
import type { BuyQuality, CatalogTab, ColorOptionVM, DecorVM, IconId, ShopPhase, ToolVM } from './types';

const SUBTABS: Array<{ id: CatalogTab; icon: IconId }> = [
  { id: 'tools', icon: 'tool_screwdriver' },
  { id: 'parts', icon: 'box' },
  { id: 'decor', icon: 'decor' },
  { id: 'expansion', icon: 'hammer' },
  { id: 'customize', icon: 'paint' },
];
const QUALITIES: BuyQuality[] = ['cheap', 'good', 'refurb'];
const PHASES: ShopPhase[] = ['stall', 'kiosk', 'shop'];
const PHASE_ICON: Record<ShopPhase, IconId> = { stall: 'palm', kiosk: 'tab_market', shop: 'shop' };

/* ------------------------------------------------------------------ tools */

function toolCard(v: TV, tool: ToolVM, i: number): HTMLElement {
  const tierName = tt(`tools.tier${Math.min(3, Math.max(1, tool.tier))}`);
  let action: HTMLElement;
  if (tool.state === 'owned') action = badge(t('ui.common.owned'), 'ok', 'check');
  else if (tool.state === 'locked') action = h('span', { class: 'tb-locked' }, icon('lock'), tool.requires ?? t('ui.common.locked'));
  else
    action = button({
      label: t('ui.common.buy'),
      icon: 'cart',
      variant: 'primary',
      size: 'sm',
      disabled: buyBlock(v, tool.price, tool.disabled),
      onClick: () => v.cb.onBuyTool(tool.id),
    });
  return h(
    'article',
    { class: cx('tb-tool card', `is-${tool.state}`), key: `${tool.id}:${tool.tier}`, style: { '--i': i } },
    thumb(tool.icon, undefined, 'tb-tool-thumb'),
    h(
      'div',
      { class: 'tb-tool-main' },
      h('div', { class: 'tb-tool-top' }, h('h3', { class: 'tb-card-title ellipsis' }, tool.name), tool.isNew ? badge(t('ui.common.new'), 'coral') : null),
      h('div', { class: 'tb-tool-tier' }, pips(tool.tier, tool.maxTier), h('span', null, tierName)),
      h('p', { class: 'tb-tool-effect' }, tool.effect),
    ),
    h('div', { class: 'tb-tool-buy' }, tool.state === 'owned' ? null : money(tool.price, { size: 'lg' }), action),
  );
}

function toolsBody(v: TV): HTMLElement {
  const tools = v.props.catalog.tools;
  if (tools.length === 0) return emptyState({ icon: 'tool_screwdriver', title: tt('tools.emptyTitle'), text: tt('tools.emptyText') });
  return h('div', { class: 'tb-grid tb-grid-2' }, tools.map((x, i) => toolCard(v, x, i)));
}

/* ------------------------------------------------------------------ parts */

function partsBody(v: TV): HTMLElement {
  const p = v.props.catalog.parts;
  const s = v.state;
  if (p.models.length === 0 || p.categories.length === 0) return emptyState({ icon: 'box', title: tt('parts.emptyTitle'), text: tt('parts.emptyText') });
  const modelId = p.models.some((m) => m.id === s.partsModel && !m.locked) ? s.partsModel : (p.models.find((m) => !m.locked)?.id ?? '');
  const catId = p.categories.some((c) => c.id === s.partsCategory) ? s.partsCategory : (p.categories[0]?.id ?? '');
  const row = p.rows.find((r) => r.modelId === modelId && r.categoryId === catId);
  const qty = s.partsQty;
  const express = s.partsExpress;
  const stepper = h(
    'div',
    { class: 'tb-stepper' },
    button({ icon: 'minus', size: 'sm', disabled: qty <= 1, ariaLabel: '-', onClick: () => v.set({ partsQty: Math.max(1, qty - 1) }) }),
    h('b', { class: 'num' }, `×${qty}`),
    button({ icon: 'plus', size: 'sm', disabled: qty >= 9, ariaLabel: '+', onClick: () => v.set({ partsQty: Math.min(9, qty + 1) }) }),
  );
  return h(
    'div',
    { class: 'tb-parts' },
    h(
      'div',
      { class: 'tb-parts-models' },
      p.models.map((m) =>
        h(
          'button',
          {
            type: 'button',
            key: m.id,
            class: cx('tb-chip pe', m.id === modelId && 'is-active', m.locked && 'is-locked'),
            dataset: { tip: m.locked, hover: '' },
            onClick: () => {
              if (m.locked) return sfx('error');
              sfx('ui_tab');
              v.set({ partsModel: m.id });
            },
          },
          icon(m.locked ? 'lock' : 'phone'),
          m.name,
        ),
      ),
    ),
    h(
      'div',
      { class: 'tb-parts-main' },
      h(
        'div',
        { class: 'tb-parts-cats scroll' },
        p.categories.map((c) => {
          const r = p.rows.find((x) => x.modelId === modelId && x.categoryId === c.id);
          const stock = r ? QUALITIES.reduce((n, q) => n + r.offers[q].stock, 0) : 0;
          return h(
            'button',
            {
              type: 'button',
              key: c.id,
              class: cx('tb-cat pe', c.id === catId && 'is-active', !r && 'is-missing'),
              dataset: { hover: '' },
              onClick: () => {
                sfx('ui_tab');
                v.set({ partsCategory: c.id });
              },
            },
            icon(c.icon ?? 'part_chip'),
            h('span', { class: 'grow ellipsis' }, c.name),
            stock > 0 ? h('span', { class: 'tb-cat-stock num' }, stock) : null,
          );
        }),
      ),
      row
        ? h(
            'div',
            { class: 'tb-parts-detail', key: `${modelId}:${catId}` },
            h('div', { class: 'tb-parts-name' }, thumb(row.icon ?? 'part_chip'), h('h3', { class: 'tb-card-title' }, row.name)),
            h(
              'div',
              { class: 'tb-quals' },
              QUALITIES.map((q) => {
                const o = row.offers[q];
                const unit = express ? o.expressPrice : o.price;
                const total = unit * qty;
                return h(
                  'article',
                  { class: cx('tb-qual card', `is-${q}`, o.unavailable && 'is-unavailable'), key: q },
                  h('div', { class: 'tb-qual-head' }, h('span', { class: 'tb-qual-stars' }, pips(q === 'cheap' ? 1 : q === 'good' ? 2 : 3, 3)), h('span', null, t(`ui.quality.${q === 'refurb' ? 'refurbShort' : q}`))),
                  h('div', { class: 'tb-qual-desc' }, o.note ?? tt(`parts.note.${q}`)),
                  h('div', { class: 'tb-qual-price' }, money(unit, { size: 'lg' }), h('span', { class: 'dim' }, tt('parts.each'))),
                  h(
                    'div',
                    { class: 'tb-qual-stock' },
                    h('span', { class: o.stock > 0 ? 't-ok' : 'dim' }, icon('box'), tt('parts.stock', { n: o.stock })),
                    o.incoming > 0 ? h('span', { class: 'tb-incoming' }, icon('boat'), tt('parts.incoming', { n: o.incoming })) : null,
                  ),
                  o.unavailable
                    ? h('span', { class: 'tb-locked' }, icon('lock'), o.unavailable)
                    : button({
                        label: tt('parts.orderFor', { price: formatMoney(total) }),
                        icon: express ? 'bolt' : 'boat',
                        variant: q === 'refurb' ? 'gold' : 'primary',
                        size: 'sm',
                        block: true,
                        disabled: buyBlock(v, total),
                        onClick: () => v.cb.onOrderPart(modelId, catId, q, qty, express),
                      }),
                );
              }),
            ),
            h(
              'div',
              { class: 'tb-parts-options card-sunken' },
              h('div', { class: 'tb-opt' }, h('span', { class: 'tb-opt-label' }, tt('parts.qty')), stepper),
              h(
                'div',
                { class: 'tb-opt grow' },
                h('span', { class: 'tb-opt-label' }, tt('parts.delivery')),
                segmented({
                  size: 'sm',
                  value: express ? 'express' : 'normal',
                  options: [
                    { value: 'normal', label: tt('parts.normal'), icon: 'boat' },
                    { value: 'express', label: tt('parts.express'), icon: 'bolt' },
                  ],
                  onChange: (val) => v.set({ partsExpress: val === 'express' }),
                }),
                h('span', { class: 'tb-eta' }, icon('clock'), express ? p.expressEta : p.normalEta),
              ),
            ),
          )
        : emptyState({ icon: 'box', title: tt('parts.noneTitle'), text: tt('parts.noneText'), class: 'tb-parts-detail' }),
    ),
  );
}

/* ------------------------------------------------------------------ decor */

function decorCard(v: TV, d: DecorVM, i: number, catName: string): HTMLElement {
  return h(
    'article',
    { class: cx('tb-decor card', d.locked && 'is-locked'), key: d.id, style: { '--i': i } },
    h('div', { class: 'tb-decor-art', style: { '--tc': d.color ?? 'var(--c-teal)' } }, icon(d.icon ?? 'decor'), d.isNew ? badge(t('ui.common.new'), 'coral') : null, d.owned > 0 ? h('span', { class: 'tb-owned' }, tt('decor.owned', { n: d.owned })) : null),
    h('h3', { class: 'tb-card-title ellipsis' }, d.name),
    h('div', { class: 'tb-decor-meta' }, h('span', { class: 'dim ellipsis' }, catName), atmosphereChip(d.atmosphere)),
    d.locked
      ? h('span', { class: 'tb-locked' }, icon('lock'), h('span', { class: 'ellipsis' }, d.locked))
      : h(
          'div',
          { class: 'tb-decor-buy' },
          money(d.price),
          button({ label: t('ui.common.buy'), variant: 'primary', size: 'sm', disabled: buyBlock(v, d.price, d.disabled), onClick: () => v.cb.onBuyDecor(d.id) }),
        ),
  );
}

function decorBody(v: TV): HTMLElement {
  const d = v.props.catalog.decor;
  if (d.items.length === 0) return emptyState({ icon: 'decor', title: tt('decor.emptyTitle'), text: tt('decor.emptyText') });
  const cat = d.categories.some((c) => c.id === v.state.decorCategory) ? v.state.decorCategory : 'all';
  const items = cat === 'all' ? d.items : d.items.filter((x) => x.category === cat);
  const nameOf = (id: string): string => d.categories.find((c) => c.id === id)?.name ?? '';
  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'tb-chips' },
      [{ id: 'all', name: tt('decor.all') }, ...d.categories].map((c) =>
        h(
          'button',
          {
            type: 'button',
            key: c.id,
            class: cx('tb-chip pe', c.id === cat && 'is-active'),
            dataset: { hover: '' },
            onClick: () => {
              sfx('ui_tab');
              v.set({ decorCategory: c.id });
            },
          },
          c.name,
        ),
      ),
    ),
    items.length === 0
      ? emptyState({ icon: 'decor', title: tt('decor.noneTitle'), text: tt('decor.noneText') })
      : h('div', { class: 'tb-grid tb-grid-4', key: cat }, items.map((x, i) => decorCard(v, x, i, nameOf(x.category)))),
  );
}

/* ------------------------------------------------------------------ expansion */

function expansionBody(v: TV): HTMLElement {
  const e = v.props.catalog.expansion;
  const idx = PHASES.indexOf(e.current);
  const steps = h(
    'ol',
    { class: 'tb-phases' },
    PHASES.map((ph, i) =>
      h(
        'li',
        { class: cx('tb-phase', i < idx && 'is-done', i === idx && 'is-current', e.next?.phase === ph && 'is-next') },
        h('span', { class: 'tb-phase-ic' }, icon(i < idx ? 'check' : PHASE_ICON[ph])),
        h('span', { class: 'tb-phase-name' }, t(`ui.phase.${ph}`)),
        i === idx ? h('span', { class: 'tb-phase-tag' }, tt('expansion.youAreHere')) : null,
      ),
    ),
  );
  if (!e.next) {
    return h('div', { class: 'col' }, steps, emptyState({ icon: 'shop', title: tt('expansion.doneTitle'), text: tt('expansion.doneText') }));
  }
  const n = e.next;
  const unmet = n.requirements.find((r) => !r.met);
  const block = buyBlock(v, n.price, n.disabled ?? (unmet ? tt('expansion.unmet') : undefined));
  let action: HTMLElement;
  if (e.building) {
    action = h('div', { class: 'tb-building' }, icon('hammer'), h('div', null, h('b', null, tt('expansion.bookedTitle')), h('div', { class: 'muted' }, tt('expansion.bookedText'))));
  } else if (v.state.confirmExpansion && !block) {
    action = h(
      'div',
      { class: 'tb-confirm' },
      h('span', { class: 'grow' }, tt('expansion.confirm', { price: formatMoney(n.price) })),
      button({ label: t('ui.common.cancel'), size: 'sm', onClick: () => v.set({ confirmExpansion: false }) }),
      button({
        label: t('ui.common.confirm'),
        variant: 'gold',
        size: 'sm',
        icon: 'hammer',
        sound: 'success',
        onClick: () => {
          v.set({ confirmExpansion: false });
          v.cb.onBuyExpansion();
        },
      }),
    );
  } else {
    action = h(
      'div',
      { class: 'tb-exp-buy' },
      h('div', null, h('div', { class: 'tb-opt-label' }, t('ui.common.price')), money(n.price, { size: 'xl' })),
      button({ label: tt('expansion.build'), icon: 'hammer', variant: 'gold', size: 'lg', disabled: block, onClick: () => v.set({ confirmExpansion: true }) }),
    );
  }
  return h(
    'div',
    { class: 'col tb-exp' },
    steps,
    h(
      'article',
      { class: 'tb-exp-card card' },
      h(
        'div',
        { class: 'tb-exp-head' },
        h('span', { class: 'tb-exp-art' }, icon(PHASE_ICON[n.phase])),
        h('div', { class: 'grow' }, h('div', { class: 'tb-opt-label' }, tt('expansion.next')), h('h3', { class: 'tb-exp-title' }, t(`ui.phase.${n.phase}`)), h('p', { class: 'tb-exp-desc' }, n.description)),
      ),
      h(
        'div',
        { class: 'tb-exp-cols' },
        h('div', null, h('div', { class: 'section-title' }, tt('expansion.features')), h('ul', { class: 'tb-ticks' }, n.features.map((f) => h('li', null, icon('sparkle'), h('span', null, f))))),
        h(
          'div',
          null,
          h('div', { class: 'section-title' }, tt('expansion.requirements')),
          h(
            'ul',
            { class: 'tb-ticks' },
            n.requirements.map((r) => h('li', { class: r.met ? 'is-met' : 'is-unmet' }, icon(r.met ? 'check_circle' : 'cross_circle'), h('span', { class: 'grow' }, r.label), r.progress ? h('b', { class: 'num' }, r.progress) : null)),
            h('li', { class: v.props.status.money >= n.price ? 'is-met' : 'is-unmet' }, icon(v.props.status.money >= n.price ? 'check_circle' : 'cross_circle'), h('span', { class: 'grow' }, tt('expansion.reqMoney')), h('b', { class: 'num' }, formatMoney(n.price))),
          ),
        ),
      ),
      action,
    ),
  );
}

/* ------------------------------------------------------------------ customize */

function swatches(options: ColorOptionVM[], current: string, onPick: (id: string) => void, striped: boolean): HTMLElement {
  return h(
    'div',
    { class: 'tb-swatches' },
    options.map((c) =>
      h(
        'button',
        {
          type: 'button',
          key: c.id,
          class: cx('tb-swatch pe', c.id === current && 'is-active', c.locked && 'is-locked', striped && 'is-striped'),
          style: { '--c1': c.color, '--c2': c.color2 ?? c.color },
          'aria-label': c.name,
          dataset: { tip: c.locked ? `${c.name} — ${c.locked}` : c.name, hover: '' },
          onClick: () => {
            if (c.locked) return sfx('error');
            if (c.id === current) return;
            sfx('ui_click');
            onPick(c.id);
          },
        },
        c.id === current ? icon('check') : c.locked ? icon('lock') : null,
      ),
    ),
  );
}

function customizeBody(v: TV): HTMLElement {
  const c = v.props.catalog.customize;
  const draft = v.state.nameDraft ?? c.shopName;
  const clean = draft.trim();
  const dirty = clean !== c.shopName && clean.length > 0;
  const awning = c.awningColors.find((x) => x.id === c.awningColor);
  const wall = c.wallColors.find((x) => x.id === c.wallColor);
  const save = (): void => {
    if (!dirty) return;
    v.cb.onRenameShop(clean);
    v.set({ nameDraft: null });
  };
  return h(
    'div',
    { class: 'tb-custom' },
    h(
      'div',
      { class: 'tb-preview card-sunken', style: { '--c1': awning?.color ?? '#ff6f59', '--c2': awning?.color2 ?? '#fff7e6', '--wall': wall?.color ?? '#c79a6d' } },
      h('div', { class: 'tb-preview-awning' }),
      h('div', { class: 'tb-preview-wall' }, h('div', { class: 'tb-preview-sign wood' }, h('b', { class: 'ellipsis' }, clean || c.shopName), h('span', null, 'ซ่อมมือถือ'))),
      h('div', { class: 'tb-preview-counter' }),
    ),
    h(
      'div',
      { class: 'col tb-custom-form' },
      h('div', { class: 'section-title' }, tt('customize.name')),
      h(
        'div',
        { class: 'row' },
        textInput({ value: draft, icon: 'shop', maxLength: c.maxNameLength ?? 22, placeholder: tt('customize.namePlaceholder'), class: 'grow', onInput: (val) => v.set({ nameDraft: val }), onEnter: save }),
        button({ label: tt('customize.save'), variant: 'primary', icon: 'check', disabled: !dirty, onClick: save }),
      ),
      h('div', { class: 'section-title' }, tt('customize.awning')),
      swatches(c.awningColors, c.awningColor, (id) => v.cb.onSetAwningColor(id), true),
      h('div', { class: 'section-title' }, tt('customize.walls')),
      c.wallsLocked ? h('span', { class: 'tb-locked' }, icon('lock'), c.wallsLocked) : swatches(c.wallColors, c.wallColor, (id) => v.cb.onSetWallColor(id), false),
    ),
  );
}

/* ------------------------------------------------------------------ page */

export function renderCatalog(v: TV): HTMLElement {
  const sub = activeCatalogTab(v);
  const body = sub === 'tools' ? toolsBody(v) : sub === 'parts' ? partsBody(v) : sub === 'decor' ? decorBody(v) : sub === 'expansion' ? expansionBody(v) : customizeBody(v);
  return page(
    {
      key: `catalog-${sub}`,
      title: tt('catalog.title'),
      subtitle: tt(`catalog.sub.${sub}`),
      icon: 'tab_catalog',
      trailing: sub === 'decor' ? h('span', { class: 'tb-atmo-total', dataset: { tip: tt('decor.atmosphereTip') } }, icon('sparkle'), h('span', null, t('ui.common.atmosphere')), h('b', { class: 'num' }, v.props.catalog.decor.atmosphere)) : null,
      toolbar: tabs({
        items: SUBTABS.map((s) => ({ id: s.id, label: tt(`catalog.tabs.${s.id}`), icon: s.icon })),
        active: sub,
        onSelect: (id) => selectTab(v, 'catalog', id),
      }),
      bodyClass: sub === 'parts' ? 'tb-body-fixed' : undefined,
    },
    body,
  );
}
