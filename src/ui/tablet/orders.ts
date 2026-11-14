/** Tablet › Ordini: accepted jobs with status, deadline, price and the next action. */
import { cx, h } from '../dom';
import { urgencyOf } from '../format';
import { icon } from '../icons';
import { avatar, badge, bar, button, emptyState, money, type Tone } from '../widgets';
import { linkButton, page, phoneThumb, tt, type TV } from './shared';
import type { IconId, OrderStatus, OrderVM } from './types';

const STATUS: Record<OrderStatus, { tone: Tone; icon: IconId }> = {
  queued: { tone: 'neutral', icon: 'hourglass' },
  waiting_parts: { tone: 'warn', icon: 'box' },
  in_progress: { tone: 'teal', icon: 'tool_screwdriver' },
  assistant: { tone: 'info', icon: 'tab_assistant' },
  ready: { tone: 'ok', icon: 'check' },
};

function actions(v: TV, o: OrderVM): HTMLElement {
  const out: Array<HTMLElement | null> = [];
  if (o.status === 'ready') {
    out.push(button({ label: tt('orders.deliver'), icon: 'gift', variant: 'gold', disabled: o.deliverDisabled, onClick: () => v.cb.onDeliverOrder(o.id) }));
  } else if (o.status === 'assistant') {
    out.push(
      h(
        'div',
        { class: 'tb-order-progress' },
        h('span', { class: 'tb-order-progress-label' }, tt('orders.assistantWorking'), h('b', { class: 'num' }, `${Math.round((o.progress ?? 0) * 100)}%`)),
        bar({ value: o.progress ?? 0, tone: 'info' }),
      ),
    );
  } else {
    const missing = o.status === 'waiting_parts' ? tt('orders.missingReason') : undefined;
    out.push(
      button({
        label: o.status === 'in_progress' ? tt('orders.resume') : tt('orders.repair'),
        icon: 'tool_screwdriver',
        variant: 'primary',
        disabled: o.repairDisabled ?? missing,
        onClick: () => v.cb.onRepairOrder(o.id),
      }),
    );
    if (o.assignable && o.status !== 'in_progress') {
      out.push(
        button({
          label: tt('orders.assign'),
          icon: 'tab_assistant',
          size: 'sm',
          disabled: typeof o.assignable === 'string' ? o.assignable : undefined,
          onClick: () => v.cb.onAssignAssistant(o.id),
        }),
      );
    }
  }
  return h('div', { class: 'tb-order-actions' }, out);
}

function orderCard(v: TV, o: OrderVM, i: number): HTMLElement {
  const st = STATUS[o.status];
  const urgency = o.status === 'ready' ? 'calm' : urgencyOf(o.minutesLeft);
  return h(
    'article',
    { class: cx('tb-order card', `is-${o.status}`), key: o.id, style: { '--i': i } },
    phoneThumb(o.phoneColor),
    h(
      'div',
      { class: 'tb-order-main' },
      h('div', { class: 'tb-order-top' }, h('h3', { class: 'tb-order-model ellipsis' }, o.model), badge(tt(`orders.status.${o.status}`), st.tone, st.icon)),
      h('div', { class: 'tb-order-job' }, o.job),
      h(
        'div',
        { class: 'tb-order-who' },
        avatar({ name: o.customer, color: o.customerColor, size: 'sm' }),
        h('span', { class: 'tb-order-customer' }, o.customer),
        o.note ? h('span', { class: 'tb-order-note ellipsis' }, `“${o.note}”`) : null,
      ),
      o.missingParts && o.missingParts.length > 0
        ? h('div', { class: 'tb-order-missing' }, icon('box'), h('span', null, tt('orders.missing', { parts: o.missingParts.join(', ') })))
        : null,
    ),
    h(
      'div',
      { class: 'tb-order-side' },
      h('div', { class: 'tb-order-price' }, money(o.price, { size: 'lg' })),
      h('div', { class: cx('tb-deadline', `is-${urgency}`) }, icon(urgency === 'late' ? 'warn' : 'clock'), h('span', null, urgency === 'late' ? tt('orders.late') : o.deadlineText)),
    ),
    actions(v, o),
  );
}

export function renderOrders(v: TV): HTMLElement {
  const { orders, rack } = v.props.orders;
  const slots: HTMLElement[] = [];
  for (let i = 0; i < rack.capacity; i++) slots.push(h('i', { class: i < rack.used ? 'tb-rack-slot is-used' : 'tb-rack-slot' }));
  const full = rack.used >= rack.capacity;
  return page(
    {
      key: 'orders',
      title: tt('orders.title'),
      subtitle: orders.length > 0 ? tt('orders.subtitle', { n: orders.length }) : tt('orders.subtitleEmpty'),
      icon: 'tab_orders',
      trailing: h(
        'div',
        { class: cx('tb-rack', full && 'is-full'), dataset: { tip: full ? tt('orders.rackFull') : tt('orders.rackTip') } },
        h('span', { class: 'tb-rack-label' }, tt('orders.rack')),
        h('span', { class: 'tb-rack-slots' }, slots),
        h('b', { class: 'num' }, `${rack.used}/${rack.capacity}`),
      ),
    },
    orders.length === 0
      ? emptyState({ icon: 'tab_orders', title: tt('orders.emptyTitle'), text: tt('orders.emptyText') })
      : h('div', { class: 'tb-list' }, orders.map((o, i) => orderCard(v, o, i))),
    orders.some((o) => o.status === 'waiting_parts')
      ? h('div', { class: 'tb-hint' }, icon('boat'), h('span', { class: 'grow' }, tt('orders.partsHint')), linkButton(v, tt('orders.goParts'), 'catalog', 'parts', 'secondary'))
      : null,
  );
}
