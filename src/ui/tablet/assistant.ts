/** Tablet › Assistente: hire / dismiss the helper and follow what they are doing. */
import { t } from '../../core/i18n';
import { h } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';
import { avatar, badge, bar, button, emptyState, money, pips, type Tone } from '../widgets';
import { buyBlock, page, tt, type TV } from './shared';
import type { AssistantVM } from './types';

const STATUS_TONE: Record<NonNullable<AssistantVM['status']>, Tone> = { idle: 'neutral', working: 'teal', off: 'night' };

function profile(a: AssistantVM, trailing: HTMLElement | null): HTMLElement {
  return h(
    'div',
    { class: 'tb-as-profile card' },
    avatar({ name: a.name, color: a.color, size: 'xl' }),
    h(
      'div',
      { class: 'grow', style: 'min-width:0' },
      h('div', { class: 'row wrap' }, h('h3', { class: 'tb-exp-title' }, a.name), trailing),
      h('div', { class: 'tb-as-skill' }, h('span', { class: 'tb-opt-label' }, tt('assistant.skill')), pips(a.skill, 3)),
      h('p', { class: 'tb-exp-desc' }, a.bio),
      h('div', { class: 'tb-issues' }, a.abilities.map((x) => h('span', { class: 'tb-issue is-good' }, icon('check'), x))),
    ),
  );
}

export function renderAssistant(v: TV): HTMLElement {
  const a = v.props.assistant;
  const head = { key: 'assistant', title: tt('assistant.title'), subtitle: tt('assistant.subtitle'), icon: 'tab_assistant' };
  if (a.locked) return page(head, emptyState({ icon: 'lock', title: tt('assistant.lockedTitle'), text: a.locked }));
  if (!a.hired) {
    return page(
      head,
      h(
        'div',
        { class: 'col tb-gap tb-as' },
        profile(a, badge(tt('assistant.available'), 'ok')),
        h(
          'div',
          { class: 'tb-as-offer card' },
          h('div', { class: 'tb-as-cost' }, h('span', { class: 'tb-opt-label' }, tt('assistant.hireCost')), money(a.hireCost, { size: 'xl' })),
          h('div', { class: 'tb-as-cost' }, h('span', { class: 'tb-opt-label' }, tt('assistant.wage')), h('span', { class: 'row' }, money(a.wagePerDay, { size: 'lg' }), h('span', { class: 'dim' }, tt('assistant.perDay')))),
          h('p', { class: 'grow muted tb-as-note' }, tt('assistant.hireNote')),
          button({ label: tt('assistant.hire'), icon: 'tab_assistant', variant: 'gold', size: 'lg', sound: 'success', disabled: buyBlock(v, a.hireCost, a.hireDisabled), onClick: () => v.cb.onHireAssistant() }),
        ),
      ),
    );
  }
  const status = a.status ?? 'idle';
  return page(
    head,
    h(
      'div',
      { class: 'col tb-gap tb-as' },
      profile(a, badge(tt(`assistant.status.${status}`), STATUS_TONE[status], status === 'working' ? 'tool_screwdriver' : status === 'off' ? 'moon' : 'hourglass')),
      h(
        'div',
        { class: 'tb-as-cols' },
        h(
          'div',
          { class: 'tb-as-job card' },
          h('div', { class: 'section-title' }, tt('assistant.currentJob')),
          a.job
            ? h(
                'div',
                { class: 'col' },
                h('div', { class: 'row' }, icon('phone'), h('b', { class: 'grow ellipsis' }, `${a.job.model} — ${a.job.job}`)),
                h('div', { class: 'muted' }, `${t('ui.common.customer')}: ${a.job.customer}`),
                bar({ value: a.job.progress, tone: 'teal', size: 'lg' }),
                h('div', { class: 'row between' }, h('b', { class: 'num' }, `${Math.round(a.job.progress * 100)}%`), h('span', { class: 'tb-eta' }, icon('clock'), a.job.eta)),
              )
            : h('div', { class: 'tb-as-idle' }, icon('palm'), h('span', null, tt('assistant.noJob'))),
          h(
            'div',
            { class: 'tb-as-stats' },
            h('div', null, h('b', { class: 'num' }, a.doneToday ?? 0), h('span', null, tt('assistant.doneToday'))),
            h('div', null, h('b', { class: 'num' }, a.doneTotal ?? 0), h('span', null, tt('assistant.doneTotal'))),
            h('div', null, h('b', { class: 'num' }, formatMoney(a.wagePerDay)), h('span', null, tt('assistant.wage'))),
          ),
        ),
        h(
          'div',
          { class: 'tb-as-log card' },
          h('div', { class: 'section-title' }, tt('assistant.log')),
          a.log && a.log.length > 0
            ? h('ul', { class: 'tb-log' }, a.log.map((l) => h('li', null, h('span', { class: 'num dim' }, l.time), h('span', null, l.text))))
            : h('div', { class: 'tb-as-idle' }, icon('list'), h('span', null, tt('assistant.logEmpty'))),
        ),
      ),
      v.state.confirmFire
        ? h(
            'div',
            { class: 'tb-confirm' },
            h('span', { class: 'grow' }, tt('assistant.fireConfirm', { name: a.name })),
            button({ label: t('ui.common.cancel'), size: 'sm', onClick: () => v.set({ confirmFire: false }) }),
            button({
              label: tt('assistant.fire'),
              variant: 'danger',
              size: 'sm',
              onClick: () => {
                v.set({ confirmFire: false });
                v.cb.onFireAssistant();
              },
            }),
          )
        : h('div', { class: 'row' }, h('span', { class: 'grow' }), button({ label: tt('assistant.fire'), variant: 'ghost', size: 'sm', icon: 'exit', onClick: () => v.set({ confirmFire: true }) })),
    ),
  );
}
