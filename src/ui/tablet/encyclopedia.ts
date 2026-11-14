/** Tablet › Enciclopedia: every component taken apart at least once, per phone model. */
import { cx, h } from '../dom';
import { icon } from '../icons';
import { sfx } from '../sound';
import { badge, bar, button, emptyState, scroll } from '../widgets';
import { page, thumb, tt, type TV } from './shared';
import type { EncyclopediaEntryVM, EncyclopediaModelVM } from './types';

function detail(v: TV, model: EncyclopediaModelVM, e: EncyclopediaEntryVM | undefined): HTMLElement {
  const exploded = button({
    label: tt('encyclopedia.exploded'),
    icon: 'explode',
    variant: 'primary',
    block: true,
    disabled: model.explodedDisabled,
    onClick: () => v.cb.onExplodedView(model.id),
  });
  if (!e) {
    return h('aside', { class: 'tb-enc-detail card' }, emptyState({ icon: 'tab_encyclopedia', title: tt('encyclopedia.pickTitle'), text: tt('encyclopedia.pickText'), class: 'grow' }), exploded);
  }
  return h(
    'aside',
    { class: 'tb-enc-detail card', key: `${model.id}:${e.id}` },
    scroll(
      { class: 'tb-enc-scroll' },
      h('div', { class: 'tb-enc-hero' }, thumb(e.icon ?? 'part_chip', undefined, 'tb-thumb-xl'), h('div', null, h('div', { class: 'tb-opt-label' }, model.name), h('h3', { class: 'tb-exp-title' }, e.name))),
      h('p', { class: 'tb-enc-desc' }, e.description ?? ''),
      e.tip ? h('div', { class: 'tb-enc-tip' }, icon('bulb'), h('div', null, h('b', null, tt('encyclopedia.tip')), h('div', null, e.tip))) : null,
      e.facts && e.facts.length > 0 ? h('dl', { class: 'tb-facts' }, e.facts.map((f) => h('div', { class: 'tb-fact' }, h('dt', null, f.label), h('dd', null, f.value)))) : null,
    ),
    exploded,
  );
}

export function renderEncyclopedia(v: TV): HTMLElement {
  const models = v.props.encyclopedia.models;
  if (models.length === 0 || models.every((m) => m.locked)) {
    return page({ key: 'enc', title: tt('encyclopedia.title'), subtitle: tt('encyclopedia.subtitle'), icon: 'tab_encyclopedia' }, emptyState({ icon: 'tab_encyclopedia', title: tt('encyclopedia.emptyTitle'), text: tt('encyclopedia.emptyText') }));
  }
  const model = models.find((m) => m.id === v.state.encModel && !m.locked) ?? (models.find((m) => !m.locked) as EncyclopediaModelVM);
  const entry = model.entries.find((e) => e.id === v.state.encEntry && e.unlocked);
  const unlocked = model.entries.filter((e) => e.unlocked).length;
  const allUnlocked = models.reduce((n, m) => n + m.entries.filter((e) => e.unlocked).length, 0);
  const allTotal = models.reduce((n, m) => n + m.entries.length, 0);
  return page(
    {
      key: 'enc',
      title: tt('encyclopedia.title'),
      subtitle: tt('encyclopedia.subtitle'),
      icon: 'tab_encyclopedia',
      trailing: h('div', { class: 'tb-enc-total' }, h('span', null, tt('encyclopedia.discovered')), h('b', { class: 'num' }, `${allUnlocked}/${allTotal}`)),
      toolbar: h(
        'div',
        { class: 'tb-chips' },
        models.map((m) => {
          const got = m.entries.filter((e) => e.unlocked).length;
          return h(
            'button',
            {
              type: 'button',
              key: m.id,
              class: cx('tb-chip pe', m.id === model.id && 'is-active', m.locked && 'is-locked'),
              dataset: { tip: m.locked, hover: '' },
              onClick: () => {
                if (m.locked) return sfx('error');
                if (m.id === model.id) return;
                sfx('ui_tab');
                v.set({ encModel: m.id, encEntry: null });
              },
            },
            icon(m.locked ? 'lock' : 'phone'),
            m.name,
            m.locked ? null : h('span', { class: 'tb-chip-count num' }, `${got}/${m.entries.length}`),
          );
        }),
      ),
      bodyClass: 'tb-body-fixed',
    },
    h(
      'div',
      { class: 'tb-enc' },
      h(
        'div',
        { class: 'tb-enc-left' },
        h('div', { class: 'tb-enc-progress' }, h('span', null, model.year ? `${model.name} · ${model.year}` : model.name), bar({ value: model.entries.length ? unlocked / model.entries.length : 0, tone: 'teal', class: 'grow' }), h('b', { class: 'num' }, `${unlocked}/${model.entries.length}`)),
        scroll(
          { class: 'tb-enc-grid', key: model.id },
          model.entries.map((e) =>
            h(
              'button',
              {
                type: 'button',
                key: e.id,
                class: cx('tb-enc-tile pe', e.unlocked ? 'is-unlocked' : 'is-locked', entry?.id === e.id && 'is-active'),
                dataset: { tip: e.unlocked ? null : tt('encyclopedia.lockedTip'), hover: '' },
                onClick: () => {
                  if (!e.unlocked) return sfx('error');
                  sfx('ui_click');
                  v.set({ encEntry: e.id });
                  v.cb.onOpenEncyclopediaEntry(model.id, e.id);
                },
              },
              h('span', { class: 'tb-enc-tile-ic' }, icon(e.unlocked ? (e.icon ?? 'part_chip') : 'lock')),
              h('span', { class: 'tb-enc-tile-name' }, e.unlocked ? e.name : '???'),
              e.unlocked && e.isNew ? badge(tt('encyclopedia.new'), 'coral') : null,
            ),
          ),
        ),
      ),
      detail(v, model, entry),
    ),
  );
}
