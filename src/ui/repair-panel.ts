/**
 * Repair side panel (left, compact, collapsible): phone and customer, goal checklist,
 * mistakes made so far, screws in hand / on the magnetic mat, Flip / Final test / Exit.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/repair-panel.css';
import { t } from '../core/i18n';
import type { ScrewType, Side } from '../gameplay/repair/types';
import { cx, h } from './dom';
import { formatMm, type Urgency } from './format';
import { icon, type IconName } from './icons';
import { sfx } from './sound';
import { defineView, type View } from './view';
import { avatar, badge, bar, button, scroll, type Tone } from './widgets';

export interface RepairGoalItem {
  id: string;
  /** translated, e.g. "Sostituisci la batteria" */
  text: string;
  done: boolean;
  optional?: boolean;
  icon?: IconName | string;
}

export interface RepairMistakeItem {
  id: string;
  /** translated, e.g. "Vite spanata sulla staffa" */
  text: string;
  severity: 1 | 2 | 3;
}

export interface ScrewChip {
  id: string;
  type: ScrewType;
  /** millimetres */
  length: number;
  stripped?: boolean;
}

export interface RepairPanelProps {
  phone: { model: string; colorHex?: string };
  /** omitted when the phone belongs to the player (tutorial wreck, used phone) */
  customer?: { name: string; color?: string };
  deadline?: { label: string; urgency: Urgency };
  goals: RepairGoalItem[];
  mistakes: RepairMistakeItem[];
  screws: {
    held: ScrewChip | null;
    /** screws parked on the magnetic mat, by cell index (row-major) */
    mat: Array<ScrewChip & { cell: number }>;
    matCells: number;
    /** columns of the mat grid (default 5) */
    matCols?: number;
    /** screws lying loose on the bench */
    bench: number;
    lost: number;
  };
  /** which side of the phone faces up */
  side: Side;
  /** reason why the final test cannot start yet (translated); omit when it can */
  testBlocked?: string;
  /** KeyboardEvent.code of the shortcuts shown on the buttons */
  keys: { flip: string; back: string };
  /** controlled collapsed state; omit to let the panel keep it */
  collapsed?: boolean;
}

export interface RepairPanelCallbacks {
  onFlip(): void;
  onFinalTest(): void;
  onExit(): void;
  onToggle?(collapsed: boolean): void;
  /** click on a screw parked on the mat */
  onPickScrew?(id: string): void;
}

interface State {
  collapsed: boolean;
}

type V = View<RepairPanelProps, RepairPanelCallbacks, State>;

const URGENCY_TONE: Record<Urgency, Tone> = { calm: 'ok', soon: 'warn', urgent: 'bad', late: 'bad' };

/** Mat cell label like the silk-screen on the real mat: A1, B1 … (column letter + row number). */
export function matCellLabel(cell: number, cols: number): string {
  return `${String.fromCharCode(65 + (cell % cols))}${Math.floor(cell / cols) + 1}`;
}

function screwChip(s: ScrewChip, cls?: string): HTMLElement {
  return h(
    'span',
    { class: cx('rp-screw', s.stripped && 'is-stripped', cls), dataset: { tip: `${t(`ui.screw.${s.type}`)} · ${formatMm(s.length)}${s.stripped ? ` · ${t('ui.repair.stripped')}` : ''}` } },
    icon(`screw_${s.type}`),
    h('span', { class: 'rp-screw-len num' }, formatMm(s.length)),
  );
}

function toggle(v: V, collapsed: boolean): void {
  sfx(collapsed ? 'ui_close' : 'ui_open');
  v.state.collapsed = collapsed;
  v.cb.onToggle?.(collapsed);
  v.rerender();
}

function renderMat(v: V): HTMLElement {
  const s = v.props.screws;
  const cols = s.matCols ?? 5;
  const byCell = new Map(s.mat.map((m) => [m.cell, m]));
  const cells: HTMLElement[] = [];
  for (let i = 0; i < s.matCells; i++) {
    const sc = byCell.get(i);
    cells.push(
      h(
        'button',
        {
          type: 'button',
          key: `c${i}`,
          class: cx('rp-cell', sc && 'is-full pe', sc?.stripped && 'is-stripped'),
          tabindex: sc ? null : '-1',
          dataset: { tip: sc ? `${matCellLabel(i, cols)} · ${t(`ui.screw.${sc.type}`)} · ${formatMm(sc.length)}` : null, hover: Boolean(sc) },
          onClick: () => {
            if (!sc || !v.cb.onPickScrew) return;
            sfx('ui_click');
            v.cb.onPickScrew(sc.id);
          },
        },
        sc ? [icon(`screw_${sc.type}`), h('span', { class: 'rp-cell-len num' }, sc.length.toFixed(1))] : h('span', { class: 'rp-cell-label' }, matCellLabel(i, cols)),
      ),
    );
  }
  return h('div', { class: 'rp-mat', style: { '--cols': cols } }, cells);
}

export const mountRepairPanel = defineView<RepairPanelProps, RepairPanelCallbacks, State>({
  name: 'repair-panel',
  leaveMs: 180,
  state: (p) => ({ collapsed: p.collapsed ?? false }),
  render: (v) => {
    const p = v.props;
    const collapsed = p.collapsed ?? v.state.collapsed;
    const required = p.goals.filter((g) => !g.optional);
    const done = required.filter((g) => g.done).length;
    const total = required.length;
    const allDone = total > 0 && done === total;
    const worst = p.mistakes.reduce((m, x) => Math.max(m, x.severity), 0);

    if (collapsed) {
      return h(
        'aside',
        { class: 'panel repair-panel is-collapsed' },
        h(
          'button',
          {
            type: 'button',
            class: 'rp-mini pe',
            dataset: { tip: t('ui.repair.expand'), hover: true },
            'aria-label': t('ui.repair.expand'),
            onClick: () => toggle(v, false),
          },
          h('span', { class: 'rp-phone-ic' }, icon('phone')),
          h('span', { class: cx('rp-mini-count num', allDone && 'is-done') }, icon(allDone ? 'check_circle' : 'clipboard'), `${done}/${total}`),
          p.mistakes.length > 0 ? h('span', { class: cx('rp-mini-count num is-bad') }, icon('warn'), p.mistakes.length) : null,
          icon('chevron_right', 'rp-mini-chev'),
        ),
      );
    }

    return h(
      'aside',
      { class: 'panel repair-panel' },
      h(
        'header',
        { class: 'rp-head' },
        h('span', { class: 'rp-phone-ic', style: { '--ph': p.phone.colorHex ?? null } }, icon('phone')),
        h(
          'div',
          { class: 'rp-head-text' },
          h('h2', { class: 'rp-model ellipsis' }, p.phone.model),
          h(
            'div',
            { class: 'rp-owner' },
            p.customer
              ? [avatar({ name: p.customer.name, color: p.customer.color, size: 'sm', class: 'rp-owner-av' }), h('span', { class: 'ellipsis' }, t('ui.repair.for', { name: p.customer.name }))]
              : h('span', { class: 'ellipsis' }, t('ui.repair.ownPhone')),
          ),
        ),
        button({ icon: 'chevron_left', variant: 'ghost', size: 'sm', class: 'rp-collapse', tip: t('ui.repair.collapse'), sound: 'ui_close', onClick: () => toggle(v, true) }),
      ),
      p.deadline ? h('div', { class: 'rp-deadline' }, badge(p.deadline.label, URGENCY_TONE[p.deadline.urgency], 'clock')) : null,
      scroll(
        { class: 'rp-body' },
        h(
          'section',
          { class: 'rp-section' },
          h('div', { class: 'section-title' }, t('ui.repair.goals'), h('span', { class: 'rp-count num' }, t('ui.repair.goalsDone', { done, total }))),
          bar({ value: total ? done / total : 0, tone: allDone ? 'ok' : 'teal', size: 'sm' }),
          h(
            'ul',
            { class: 'rp-goals' },
            p.goals.map((g) =>
              h(
                'li',
                { class: cx('rp-goal', g.done && 'is-done', g.optional && 'is-optional'), key: g.id },
                h('span', { class: 'rp-check' }, g.done ? icon('check') : null),
                h('span', { class: 'rp-goal-text' }, g.text, g.optional ? h('span', { class: 'rp-optional' }, ` · ${t('ui.repair.optional')}`) : null),
                g.icon ? icon(g.icon, 'rp-goal-ic') : null,
              ),
            ),
          ),
          allDone ? h('div', { class: 'rp-alldone', key: 'alldone' }, icon('sparkle'), t('ui.repair.allDone')) : null,
        ),
        h(
          'section',
          { class: 'rp-section' },
          h(
            'div',
            { class: 'section-title' },
            t('ui.repair.mistakes'),
            p.mistakes.length > 0 ? h('span', { class: cx('rp-count num', worst >= 2 ? 'is-bad' : 'is-warn') }, p.mistakes.length) : null,
          ),
          p.mistakes.length === 0
            ? h('div', { class: 'rp-clean' }, icon('thumb_up'), t('ui.repair.noMistakes'))
            : h(
                'ul',
                { class: 'rp-mistakes' },
                p.mistakes.map((m) =>
                  h(
                    'li',
                    { class: `rp-mistake sev-${m.severity}`, key: m.id },
                    h('span', { class: 'rp-sev', 'aria-hidden': 'true' }, h('i', null), h('i', null), h('i', null)),
                    h('span', { class: 'rp-mistake-text' }, m.text),
                  ),
                ),
              ),
        ),
        h(
          'section',
          { class: 'rp-section' },
          h('div', { class: 'section-title' }, t('ui.repair.screws'), h('span', { class: 'rp-count num' }, t('ui.repair.matCount', { n: p.screws.mat.length, total: p.screws.matCells }))),
          h(
            'div',
            { class: cx('rp-hand', p.screws.held && 'is-full') },
            icon('tool_hand'),
            h('span', { class: 'rp-hand-label' }, t('ui.repair.inHand')),
            p.screws.held ? screwChip(p.screws.held) : h('span', { class: 'rp-hand-empty' }, t('ui.repair.handEmpty')),
          ),
          renderMat(v),
          p.screws.bench > 0 ? h('div', { class: 'rp-note is-warn' }, icon('warn'), t('ui.repair.onBench', { n: p.screws.bench })) : null,
          p.screws.lost > 0 ? h('div', { class: 'rp-note is-bad' }, icon('tool_flashlight'), t('ui.repair.lost', { n: p.screws.lost })) : null,
        ),
      ),
      h(
        'footer',
        { class: 'rp-foot' },
        button({
          label: t('ui.repair.finalTest'),
          icon: 'check_circle',
          variant: allDone ? 'primary' : 'secondary',
          block: true,
          disabled: p.testBlocked ?? false,
          class: allDone && !p.testBlocked ? 'rp-test is-ready' : 'rp-test',
          onClick: () => v.cb.onFinalTest(),
        }),
        h(
          'div',
          { class: 'rp-foot-row' },
          button({
            label: t('ui.repair.flip'),
            icon: 'flip',
            size: 'sm',
            kbd: p.keys.flip,
            tip: t(p.side === 'front' ? 'ui.repair.sideFront' : 'ui.repair.sideBack'),
            class: 'grow',
            onClick: () => v.cb.onFlip(),
          }),
          button({ label: t('ui.repair.exit'), icon: 'exit', size: 'sm', kbd: p.keys.back, class: 'grow', sound: 'ui_close', onClick: () => v.cb.onExit() }),
        ),
      ),
    );
  },
});
