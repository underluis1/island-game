/**
 * Replacement part picker (modal content): three quality grades side by side with the price paid,
 * stock, defect risk and pairing note; grades that are out of stock offer to order instead.
 *
 *   const modal = root.openModal((el) => mountPartPicker(el, props, { onPick, onOrder, onCancel }), { onDismiss: onCancel });
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/part-picker.css';
import { t } from '../core/i18n';
import type { PartQuality } from '../gameplay/repair/types';
import { cx, h } from './dom';
import { clamp01, formatMoney, formatPercent } from './format';
import { icon, type IconName } from './icons';
import { defineView } from './view';
import { badge, button, panelHeader, pips, type Tone } from './widgets';

export type ReplacementQuality = Exclude<PartQuality, 'factory'>;

export interface PartPickerOption {
  quality: ReplacementQuality;
  /** pieces in stock */
  stock: number;
  /** what the player paid for the piece in stock (average), baht */
  paidPrice?: number;
  /** catalogue price for a normal order (delivery tomorrow morning) */
  orderPrice: number;
  /** catalogue price for an express order (delivered today); omit if not offered */
  expressPrice?: number;
  /** pieces already ordered and on their way */
  incoming?: number;
  /** probability 0..1 that the part is defective */
  defectRisk: number;
  /** extra translated note; defaults to a generic line per grade */
  note?: string;
}

export interface PartPickerProps {
  /** translated, e.g. "Display" */
  partName: string;
  /** "Pear Fone X" */
  phoneModel: string;
  icon?: IconName | string;
  options: PartPickerOption[];
  /** translated pairing warning, e.g. "True Tone: trasferisci i dati con il programmatore o andrà perso." */
  pairingNote?: string;
  /** false = the pairing note is a warning (programmer missing / data not saved) */
  pairingOk?: boolean;
  recommended?: ReplacementQuality;
  /** current money, to disable orders the player cannot afford */
  money?: number;
}

export interface PartPickerCallbacks {
  onPick(quality: ReplacementQuality): void;
  onOrder(quality: ReplacementQuality, express: boolean): void;
  onCancel(): void;
}

const GRADE: Record<ReplacementQuality, { tier: number; tone: Tone; note: string }> = {
  cheap: { tier: 1, tone: 'warn', note: 'ui.repair.picker.noteCheap' },
  good: { tier: 2, tone: 'teal', note: 'ui.repair.picker.noteGood' },
  refurb: { tier: 3, tone: 'gold', note: 'ui.repair.picker.noteRefurb' },
};

function risk(v: number): { key: string; tone: Tone } {
  if (v < 0.04) return { key: 'ui.repair.picker.riskLow', tone: 'ok' };
  if (v < 0.12) return { key: 'ui.repair.picker.riskMid', tone: 'warn' };
  return { key: 'ui.repair.picker.riskHigh', tone: 'bad' };
}

export const mountPartPicker = defineView<PartPickerProps, PartPickerCallbacks>({
  name: 'part-picker',
  render: (v) => {
    const p = v.props;
    const cant = (price: number): string | false => (p.money !== undefined && p.money < price ? t('ui.common.notEnoughMoney') : false);
    return h(
      'div',
      { class: 'panel part-picker' },
      panelHeader({
        title: t('ui.repair.picker.title'),
        subtitle: t('ui.repair.picker.subtitle', { part: p.partName, model: p.phoneModel }),
        icon: p.icon ?? 'box',
        onClose: () => v.cb.onCancel(),
        closeTip: t('ui.common.close'),
      }),
      h(
        'div',
        { class: 'pp-grid', style: { '--n': p.options.length } },
        p.options.map((o) => {
          const g = GRADE[o.quality];
          const r = risk(o.defectRisk);
          const has = o.stock > 0;
          return h(
            'article',
            { class: cx('pp-card', `is-${o.quality}`, !has && 'is-missing', p.recommended === o.quality && 'is-rec'), key: o.quality },
            p.recommended === o.quality ? h('div', { class: 'pp-rec' }, icon('star'), t('ui.repair.picker.recommended')) : null,
            h('div', { class: 'pp-grade' }, pips(g.tier, 3), h('h3', { class: 'pp-name' }, t(`ui.quality.${o.quality}`))),
            h('p', { class: 'pp-note' }, o.note ?? t(g.note)),
            h(
              'dl',
              { class: 'pp-stats' },
              h('dt', null, t('ui.repair.picker.stock')),
              h('dd', null, has ? badge(String(o.stock), 'ok', 'box') : badge(t('ui.repair.picker.missing'), 'neutral')),
              h('dt', null, has && o.paidPrice !== undefined ? t('ui.repair.picker.paid') : t('ui.common.price')),
              h('dd', { class: 'pp-price num' }, formatMoney(has && o.paidPrice !== undefined ? o.paidPrice : o.orderPrice)),
              h('dt', null, t('ui.repair.picker.defect')),
              h(
                'dd',
                { class: 'pp-risk' },
                h('span', { class: `pp-risk-bar tone-${r.tone}`, style: { '--v': clamp01(o.defectRisk / 0.25).toFixed(3) } }, h('i', null)),
                h('span', { class: `pp-risk-text tone-${r.tone}` }, `${t(r.key)} · ${formatPercent(o.defectRisk)}`),
              ),
            ),
            h(
              'div',
              { class: 'pp-actions' },
              has
                ? button({ label: t('ui.repair.picker.use'), icon: 'check', variant: 'primary', block: true, sound: 'success', onClick: () => v.cb.onPick(o.quality) })
                : [
                    o.incoming ? h('div', { class: 'pp-incoming' }, icon('boat'), t('ui.repair.picker.incoming', { n: o.incoming })) : null,
                    button({
                      label: `${t('ui.repair.picker.orderNormal')} · ${formatMoney(o.orderPrice)}`,
                      icon: 'boat',
                      size: 'sm',
                      block: true,
                      disabled: cant(o.orderPrice),
                      onClick: () => v.cb.onOrder(o.quality, false),
                    }),
                    o.expressPrice !== undefined
                      ? button({
                          label: `${t('ui.repair.picker.orderExpress')} · ${formatMoney(o.expressPrice)}`,
                          icon: 'bolt',
                          size: 'sm',
                          variant: 'gold',
                          block: true,
                          disabled: cant(o.expressPrice),
                          onClick: () => v.cb.onOrder(o.quality, true),
                        })
                      : null,
                  ],
            ),
          );
        }),
      ),
      h(
        'footer',
        { class: 'pp-foot' },
        p.pairingNote
          ? h(
              'div',
              { class: cx('pp-pairing', p.pairingOk ? 'is-ok' : 'is-warn') },
              h('span', { class: 'pp-pairing-ic' }, icon(p.pairingOk ? 'lock' : 'warn')),
              h('div', null, h('div', { class: 'pp-pairing-title' }, t('ui.repair.picker.pairing')), h('div', { class: 'pp-pairing-text' }, p.pairingNote)),
            )
          : h('span', { class: 'grow' }),
        button({ label: t('ui.repair.picker.keepOld'), variant: 'ghost', sound: 'ui_close', onClick: () => v.cb.onCancel() }),
      ),
    );
  },
});
