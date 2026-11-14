/** Small SVG chart (bars and/or lines, optional right axis) used by the day summary and the tablet statistics. */
import './styles/tokens.css';
import './styles/base.css';
import './styles/chart.css';
import { cx, h } from './dom';
import { formatNumber } from './format';

export type ChartTone = 'teal' | 'coral' | 'gold' | 'night' | 'green';

export interface ChartSeries {
  label: string;
  values: number[];
  tone: ChartTone;
  kind?: 'line' | 'bars';
  /** series on the right axis get their own scale (e.g. reputation 0–5 next to money) */
  axis?: 'left' | 'right';
  min?: number;
  max?: number;
  format?: (v: number) => string;
}

export interface ChartOptions {
  /** x-axis labels, one per data point (e.g. day numbers) */
  labels: string[];
  series: ChartSeries[];
  /** viewBox height for a 640-wide drawing (default 240) */
  height?: number;
  legend?: boolean;
  class?: string;
}

const W = 640;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

function range(list: ChartSeries[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const s of list) {
    for (const v of s.values) {
      if (v > max) max = v;
      if (v < min) min = v;
    }
    if (s.max !== undefined) max = Math.max(max, s.max);
    if (s.min !== undefined) min = Math.min(min, s.min);
  }
  const fixed = list.length > 0 && list.every((s) => s.max !== undefined);
  return { min: min < 0 ? -niceMax(-min) : 0, max: fixed ? max : niceMax(max) };
}

export function chart(o: ChartOptions): HTMLElement {
  const H = o.height ?? 240;
  const padL = 52;
  const padR = o.series.some((s) => s.axis === 'right') ? 40 : 14;
  const padT = 14;
  const padB = 30;
  const n = Math.max(1, o.labels.length);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const left = o.series.filter((s) => s.axis !== 'right');
  const right = o.series.filter((s) => s.axis === 'right');
  const rl = range(left);
  const rr = range(right);
  const slot = plotW / n;
  const xAt = (i: number): number => padL + slot * (i + 0.5);
  const yAt = (v: number, r: { min: number; max: number }): number => padT + plotH * (1 - (v - r.min) / (r.max - r.min || 1));
  let svg = '';
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = rl.min + ((rl.max - rl.min) * i) / ticks;
    const y = yAt(v, rl);
    svg += `<line class="ch-grid${v === 0 ? ' ch-zero' : ''}" x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    const fmt = left[0]?.format ?? ((x: number) => formatNumber(x));
    svg += `<text class="ch-tick" x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${esc(fmt(v))}</text>`;
    if (right.length > 0) {
      const vr = rr.min + ((rr.max - rr.min) * i) / ticks;
      const fr = right[0]?.format ?? ((x: number) => String(Math.round(x * 10) / 10));
      svg += `<text class="ch-tick" x="${W - padR + 8}" y="${(y + 4).toFixed(1)}" text-anchor="start">${esc(fr(vr))}</text>`;
    }
  }
  const every = Math.ceil(n / 12);
  o.labels.forEach((lab, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    svg += `<text class="ch-tick" x="${xAt(i).toFixed(1)}" y="${H - 9}" text-anchor="middle">${esc(lab)}</text>`;
  });
  const bars = o.series.filter((s) => s.kind === 'bars');
  bars.forEach((s, bi) => {
    const r = s.axis === 'right' ? rr : rl;
    const bw = Math.min(26, (slot * 0.7) / bars.length);
    s.values.forEach((v, i) => {
      const y0 = yAt(0, r);
      const y1 = yAt(v, r);
      const x = xAt(i) - (bw * bars.length) / 2 + bw * bi;
      const top = Math.min(y0, y1);
      const hgt = Math.max(1.5, Math.abs(y1 - y0));
      svg += `<rect class="ch-bar ch-${s.tone}" style="--i:${i}" x="${(x + 1).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${hgt.toFixed(1)}" rx="3"/>`;
    });
  });
  for (const s of o.series) {
    if (s.kind === 'bars' || s.values.length === 0) continue;
    const r = s.axis === 'right' ? rr : rl;
    const pts = s.values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v, r).toFixed(1)}`);
    if (pts.length > 1) {
      const base = yAt(Math.max(r.min, 0), r).toFixed(1);
      svg += `<polygon class="ch-area ch-${s.tone}" points="${xAt(0).toFixed(1)},${base} ${pts.join(' ')} ${xAt(s.values.length - 1).toFixed(1)},${base}"/>`;
      svg += `<polyline class="ch-line ch-${s.tone}" pathLength="1" points="${pts.join(' ')}"/>`;
    }
    s.values.forEach((v, i) => {
      if (s.values.length > 16 && i !== s.values.length - 1) return;
      svg += `<circle class="ch-dot ch-${s.tone}" cx="${xAt(i).toFixed(1)}" cy="${yAt(v, r).toFixed(1)}" r="${i === s.values.length - 1 ? 5 : 3.4}"/>`;
    });
  }
  return h(
    'figure',
    { class: cx('chart', o.class) },
    h('div', { class: 'chart-plot', html: `<svg viewBox="0 0 ${W} ${H}" role="img">${svg}</svg>` }),
    o.legend === false
      ? null
      : h(
          'figcaption',
          { class: 'chart-legend' },
          o.series.map((s) => h('span', { class: 'chart-key' }, h('i', { class: `chart-swatch ch-${s.tone} ${s.kind === 'bars' ? 'is-bar' : ''}` }), s.label)),
        ),
  );
}
