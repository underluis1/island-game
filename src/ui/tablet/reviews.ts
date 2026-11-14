/** Tablet › Recensioni: what customers wrote, with the factors behind each rating. */
import { t } from '../../core/i18n';
import { cx, h } from '../dom';
import { formatDecimal } from '../format';
import { icon } from '../icons';
import { avatar, emptyState, segmented, stars } from '../widgets';
import { page, tt, type TV } from './shared';
import type { ReviewVM } from './types';

function reviewCard(r: ReviewVM, i: number): HTMLElement {
  return h(
    'article',
    { class: 'tb-review card', key: r.id, style: { '--i': Math.min(i, 8) } },
    avatar({ name: r.customer, color: r.customerColor }),
    h(
      'div',
      { class: 'tb-review-main' },
      h(
        'div',
        { class: 'tb-review-top' },
        h('b', { class: 'ellipsis' }, r.customer),
        r.customerType ? h('span', { class: 'dim' }, r.customerType) : null,
        h('span', { class: 'grow' }),
        stars(r.stars),
      ),
      h('p', { class: 'tb-review-text' }, `“${r.text}”`),
      h(
        'div',
        { class: 'tb-review-foot' },
        r.factors?.map((f) => h('span', { class: cx('tb-factor', f.positive ? 'is-pos' : 'is-neg') }, icon(f.positive ? 'thumb_up' : 'thumb_down'), f.label)),
        h('span', { class: 'grow' }),
        h('span', { class: 'dim tb-review-when' }, r.model ? `${r.model} · ` : '', t('ui.common.day', { n: r.day })),
      ),
    ),
  );
}

export function renderReviews(v: TV): HTMLElement {
  const { reviews, average } = v.props.reviews;
  if (reviews.length === 0) {
    return page({ key: 'reviews', title: tt('reviews.title'), subtitle: tt('reviews.subtitleEmpty'), icon: 'tab_reviews' }, emptyState({ icon: 'tab_reviews', title: tt('reviews.emptyTitle'), text: tt('reviews.emptyText') }));
  }
  const filter = v.state.reviewFilter;
  const shown = filter === 'all' ? reviews : reviews.filter((r) => (filter === 'positive' ? r.stars >= 4 : r.stars < 4));
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => Math.min(5, Math.max(1, Math.round(r.stars))) === n).length }));
  const max = Math.max(1, ...dist.map((d) => d.count));
  return page(
    {
      key: 'reviews',
      title: tt('reviews.title'),
      subtitle: tt('reviews.subtitle', { n: reviews.length }),
      icon: 'tab_reviews',
      trailing: segmented({
        size: 'sm',
        value: filter,
        options: [
          { value: 'all', label: tt('reviews.all') },
          { value: 'positive', label: tt('reviews.positive'), icon: 'thumb_up' },
          { value: 'negative', label: tt('reviews.negative'), icon: 'thumb_down' },
        ],
        onChange: (val) => v.set({ reviewFilter: val }),
      }),
      bodyClass: 'tb-reviews',
    },
    h(
      'aside',
      { class: 'tb-rating card' },
      h('div', { class: 'tb-rating-num num' }, formatDecimal(average, 1)),
      stars(average, { size: 'lg' }),
      h('div', { class: 'dim' }, tt('reviews.count', { n: reviews.length })),
      h(
        'div',
        { class: 'tb-dist' },
        dist.map((d) => h('div', { class: 'tb-dist-row' }, h('span', { class: 'num' }, d.n), icon('star'), h('span', { class: 'tb-dist-bar' }, h('i', { style: { width: `${(d.count / max) * 100}%` } })), h('span', { class: 'num dim' }, d.count))),
      ),
    ),
    shown.length === 0
      ? emptyState({ icon: filter === 'negative' ? 'thumb_up' : 'tab_reviews', title: tt(filter === 'negative' ? 'reviews.noNegativeTitle' : 'reviews.noPositiveTitle'), text: tt(filter === 'negative' ? 'reviews.noNegativeText' : 'reviews.noPositiveText'), class: 'tb-list' })
      : h('div', { class: 'tb-list', key: filter }, shown.map((r, i) => reviewCard(r, i))),
  );
}
