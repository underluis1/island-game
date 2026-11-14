/**
 * Final test panel (right side, the 3D phone stays visible in the middle).
 * The phone functions reveal one by one on an internal timer; `onReveal` lets the glue play the cue
 * and show the matching PearOS test screen on the 3D phone. Issues and the quality score appear at the end.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/final-test.css';
import { t } from '../core/i18n';
import type { FunctionId, TestStatus } from '../gameplay/repair/types';
import { cx, h } from './dom';
import { clamp01 } from './format';
import { icon, type IconName } from './icons';
import { defineView, type View } from './view';
import { animateNumber, button, panelHeader, scroll } from './widgets';

export interface FinalTestItem {
  fn: FunctionId;
  status: TestStatus;
  /** optional short detail, already translated ("True Tone perso: display non programmato") */
  note?: string;
}

export type FinalTestIssueKind =
  | 'missingScrews'
  | 'looseScrews'
  | 'strippedScrews'
  | 'leftoverParts'
  | 'waterSeal'
  | 'notClosed'
  | 'dirty'
  | 'custom';

export interface FinalTestIssue {
  kind: FinalTestIssueKind;
  /** number of screws / parts for the counted kinds */
  count?: number;
  /** kind "custom": the whole line; other kinds: extra detail (e.g. names of the leftover parts) — already translated */
  text?: string;
  /** 1 = cosmetic, 2 = the customer will notice, 3 = serious */
  severity: 1 | 2 | 3;
  icon?: IconName | string;
}

export interface FinalTestProps {
  /** "Pear Fone X" */
  phoneName: string;
  customerName?: string;
  /** functions in reveal order */
  items: FinalTestItem[];
  issues: FinalTestIssue[];
  /** overall quality 0..1 (TestReport.score) */
  score: number;
  /** ms between two reveals (default 520) */
  stepMs?: number;
  /** show the final state at once (no timed reveal) */
  instant?: boolean;
  /** change it to restart the reveal with new results (re-test) */
  runId?: string | number;
  /** reason why "ready for delivery" is not available (button disabled with tooltip) */
  deliverDisabled?: string;
}

export interface FinalTestCallbacks {
  /** a function result has just been revealed (not fired for skipped ones or in instant mode) */
  onReveal?(fn: FunctionId, status: TestStatus, index: number): void;
  /** every result is on screen (also after a skip) */
  onRevealDone?(): void;
  onBack(): void;
  onDeliver(): void;
}

interface State {
  revealed: number;
  done: boolean;
  timer: number;
}

type V = View<FinalTestProps, FinalTestCallbacks, State>;

const STATUS_ICON: Record<TestStatus, IconName> = { pass: 'check', degraded: 'warn', fail: 'cross', na: 'minus' };
const ISSUE_ICON: Record<FinalTestIssueKind, IconName> = {
  missingScrews: 'screw',
  looseScrews: 'screw',
  strippedScrews: 'screw',
  leftoverParts: 'box',
  waterSeal: 'drop',
  notClosed: 'phone',
  dirty: 'tool_brush',
  custom: 'warn',
};

/** Quality score → grade key (ui.test.grade.*). */
export function gradeOf(score: number): 'perfect' | 'great' | 'good' | 'fair' | 'poor' {
  if (score >= 0.95) return 'perfect';
  if (score >= 0.8) return 'great';
  if (score >= 0.6) return 'good';
  if (score >= 0.4) return 'fair';
  return 'poor';
}

function issueText(i: FinalTestIssue): string {
  if (i.kind === 'custom') return i.text ?? '';
  const base = t(`ui.test.issue.${i.kind}`, { n: i.count ?? 0 });
  return i.text ? `${base} — ${i.text}` : base;
}

function finish(v: V): void {
  window.clearTimeout(v.state.timer);
  if (v.state.done) return;
  v.set({ revealed: v.props.items.length, done: true });
  v.cb.onRevealDone?.();
}

function schedule(v: V): void {
  window.clearTimeout(v.state.timer);
  if (v.destroyed || v.state.done) return;
  if (v.props.instant || document.documentElement.classList.contains('reduce-motion')) {
    finish(v);
    return;
  }
  const first = v.state.revealed === 0;
  v.state.timer = window.setTimeout(
    () => {
      const i = v.state.revealed;
      const item = v.props.items[i];
      if (!item) {
        finish(v);
        return;
      }
      v.set({ revealed: i + 1 });
      v.cb.onReveal?.(item.fn, item.status, i);
      if (i + 1 >= v.props.items.length) v.state.timer = window.setTimeout(() => finish(v), 450);
      else schedule(v);
    },
    first ? 650 : (v.props.stepMs ?? 520),
  );
}

function tile(item: FinalTestItem, i: number, v: V): HTMLElement {
  const shown = i < v.state.revealed;
  const current = !v.state.done && i === v.state.revealed;
  const status = shown ? item.status : 'pending';
  return h(
    'div',
    {
      class: cx('ft-item', shown && 'is-revealed', current && 'is-current'),
      key: item.fn,
      dataset: { status, tip: shown ? (item.note ? `${t(`ui.test.status.${item.status}`)} — ${item.note}` : t(`ui.test.status.${item.status}`)) : null },
    },
    h('span', { class: 'ft-item-ic' }, icon(`fn_${item.fn}`)),
    h('span', { class: 'ft-item-name ellipsis' }, t(`ui.fn.${item.fn}`)),
    shown
      ? h('span', { class: 'ft-item-st is-badge', 'aria-label': t(`ui.test.status.${item.status}`) }, icon(STATUS_ICON[item.status]))
      : h('span', { class: 'ft-item-st' }, current ? h('span', { class: 'ft-spin' }) : h('span', { class: 'ft-dots' }, '···')),
  );
}

export const mountFinalTest = defineView<FinalTestProps, FinalTestCallbacks, State>({
  name: 'final-test',
  leaveMs: 180,
  state: (p) => ({ revealed: p.instant ? p.items.length : 0, done: Boolean(p.instant), timer: 0 }),
  mounted: (v) => {
    v.onDestroy(() => window.clearTimeout(v.state.timer));
    schedule(v);
  },
  updated: (v, prev) => {
    if (prev.runId !== v.props.runId) {
      window.clearTimeout(v.state.timer);
      v.set({ revealed: v.props.instant ? v.props.items.length : 0, done: Boolean(v.props.instant) });
      schedule(v);
    }
  },
  render: (v) => {
    const p = v.props;
    const { done, revealed } = v.state;
    const total = p.items.length;
    const counted = p.items.filter((i) => i.status !== 'na');
    const passed = counted.filter((i) => i.status === 'pass').length;
    const score = clamp01(p.score);
    const grade = gradeOf(score);
    const tone = score >= 0.8 ? 'ok' : score >= 0.5 ? 'warn' : 'bad';
    return h(
      'div',
      { class: 'ft-wrap' },
      h(
        'section',
        { class: cx('panel ft', done && 'is-done') },
        panelHeader({
          title: t('ui.test.title'),
          icon: 'clipboard',
          subtitle: p.customerName ? `${p.phoneName} · ${p.customerName}` : p.phoneName,
          trailing: done
            ? null
            : button({ label: t('ui.test.skip'), size: 'sm', variant: 'ghost', iconEnd: 'chevron_right', key: 'skip', onClick: () => finish(v) }),
        }),
        scroll(
          { class: 'ft-body' },
          h('div', { class: 'ft-grid' }, p.items.map((it, i) => tile(it, i, v))),
          h(
            'div',
            { class: 'ft-legend' },
            (['pass', 'degraded', 'fail', 'na'] as const).map((st) =>
              h('span', { class: 'ft-legend-key', dataset: { status: st } }, h('i', null, icon(STATUS_ICON[st])), t(`ui.test.status.${st}`)),
            ),
          ),
          h(
            'div',
            { class: cx('ft-score card', `tone-${done ? tone : 'neutral'}`), style: { '--v': done ? score.toFixed(3) : (revealed / Math.max(1, total)).toFixed(3) } },
            h(
              'div',
              { class: 'ft-ring' },
              h('div', {
                html: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ft-ring-bg" cx="50" cy="50" r="42"/><circle class="ft-ring-fg" cx="50" cy="50" r="42" pathLength="100"/></svg>',
              }),
              done
                ? h('span', {
                    class: 'ft-ring-num',
                    key: 'num',
                    keep: true,
                    hook: (el: HTMLElement, first: boolean) =>
                      animateNumber(el, Math.round(score * 100), { from: first && !p.instant ? 0 : undefined, ms: 900, format: (n) => `${n}%` }),
                  })
                : h('span', { class: 'ft-ring-wait', key: 'wait' }, icon('hourglass')),
            ),
            done
              ? h(
                  'div',
                  { class: 'ft-score-text', key: 'done' },
                  h('div', { class: 'ft-score-label' }, t('ui.test.score')),
                  h('div', { class: 'ft-grade' }, t(`ui.test.grade.${grade}`)),
                  h('div', { class: 'ft-score-sub' }, t('ui.test.summary', { pass: passed, total: counted.length })),
                )
              : h(
                  'div',
                  { class: 'ft-score-text', key: 'run' },
                  h('div', { class: 'ft-score-label' }, t('ui.test.score')),
                  h('div', { class: 'ft-grade is-wait' }, t('ui.test.running')),
                  h('div', { class: 'ft-score-sub' }, t('ui.test.progress', { done: revealed, total })),
                ),
          ),
          done
            ? h(
                'div',
                { class: 'ft-issues', key: 'issues' },
                h('div', { class: 'section-title' }, t('ui.test.issues')),
                p.issues.length === 0
                  ? h('div', { class: 'ft-clean' }, icon('sparkle'), t('ui.test.noIssues'))
                  : p.issues.map((is, i) =>
                      h(
                        'div',
                        { class: `ft-issue sev-${is.severity}`, style: { '--i': i } },
                        h('span', { class: 'ft-issue-ic' }, icon(is.icon ?? ISSUE_ICON[is.kind])),
                        h('span', { class: 'ft-issue-text' }, issueText(is)),
                      ),
                    ),
              )
            : null,
        ),
        h(
          'footer',
          { class: 'ft-foot' },
          button({ label: t('ui.test.back'), icon: 'back', onClick: () => v.cb.onBack() }),
          button({
            label: t('ui.test.deliver'),
            variant: 'primary',
            icon: 'check',
            class: 'grow',
            disabled: !done ? true : (p.deliverDisabled ?? false),
            onClick: () => v.cb.onDeliver(),
          }),
        ),
      ),
    );
  },
});
