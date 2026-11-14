/**
 * Repair gauges: small glass overlays updated at 60 fps without touching the DOM structure.
 *
 *   const g = mountGauge(root.layers.hud, { kind: 'torque', mode: 'screw', green: [0.55, 0.8] });
 *   g.update({ value: torque, progress: turns });     // every frame
 *   g.setAnchor(mouseX, mouseY);                       // follow the cursor (omit → docked bottom-centre)
 *   g.destroy();
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/gauges.css';
import { t } from '../core/i18n';
import { h } from './dom';
import { clamp, clamp01, formatDecimal } from './format';
import { icon, type IconName } from './icons';

export type GaugeSpec =
  /** value = torque 0..1, progress = how far the screw is in/out 0..1. `green` = good torque window (wider with better tiers). */
  | { kind: 'torque'; mode: 'unscrew' | 'screw'; green: [number, number] }
  /** value = °C. ideal = adhesive releases, danger = damage starts. */
  | { kind: 'temperature'; min: number; max: number; ideal: [number, number]; danger: number }
  /** value = pull speed/tension 0..1 (above `safe` the tab snaps), progress = tab released 0..1 */
  | { kind: 'tension'; safe: number }
  /** value = cleaned fraction 0..1 */
  | { kind: 'clean'; label?: string }
  /** value = pick depth 0..1, above `danger` a flex cable is at risk (only when `risky` in update) */
  | { kind: 'pick'; danger: number }
  /** value = amperes, volts optional */
  | { kind: 'multimeter' }
  /** value = battery health 0..1, cycles optional */
  | { kind: 'battery' };

export interface GaugeValues {
  value: number;
  progress?: number;
  volts?: number;
  cycles?: number;
  /** pick: the current edge position hides a flex cable */
  risky?: boolean;
  /** overrides the automatic status line */
  note?: string;
}

export interface GaugeHandle {
  readonly el: HTMLElement;
  update(v: GaugeValues): void;
  /** Place the gauge next to a screen point (px). Call `dock()` to go back to bottom-centre. */
  setAnchor(x: number, y: number): void;
  dock(): void;
  destroy(): void;
}

type Tone = 'ok' | 'warn' | 'bad' | 'idle';

const SEGS: Record<string, string> = {
  a: '2,1 8,1 9,2 8,3 2,3 1,2',
  b: '9,2.5 10,3.5 10,8 9,9 8,8 8,3.5',
  c: '9,9 10,10 10,14.5 9,15.5 8,14.5 8,10',
  d: '2,15 8,15 9,16 8,17 2,17 1,16',
  e: '1,9 2,10 2,14.5 1,15.5 0,14.5 0,10',
  f: '1,2.5 2,3.5 2,8 1,9 0,8 0,3.5',
  g: '2,8 8,8 9,9 8,10 2,10 1,9',
};
const DIGITS: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };

function sevenSeg(count: number, dotAfter: number): { el: HTMLElement; set(text: string): void } {
  let svg = '';
  for (let i = 0; i < count; i++) {
    svg += `<g transform="translate(${i * 13 + 1},0)">`;
    for (const [name, pts] of Object.entries(SEGS)) svg += `<polygon data-s="${i}${name}" points="${pts}"/>`;
    svg += '</g>';
    if (i === dotAfter) svg += `<circle class="on" cx="${i * 13 + 12.6}" cy="16.4" r="1.1"/>`;
  }
  const el = h('span', { class: 'seg7', html: `<svg viewBox="0 0 ${count * 13 + 1} 18">${svg}</svg>` });
  const polys = new Map<string, Element>();
  el.querySelectorAll('polygon').forEach((p) => polys.set(p.getAttribute('data-s') ?? '', p));
  let last = '';
  return {
    el,
    set(text) {
      if (text === last) return;
      last = text;
      for (let i = 0; i < count; i++) {
        const on = DIGITS[text[i] ?? ' '] ?? '';
        for (const name of 'abcdefg') polys.get(`${i}${name}`)?.classList.toggle('on', on.includes(name));
      }
    },
  };
}

/** point on the dial for k in 0..1 (left → right over the top) */
function dial(k: number, r: number): string {
  const a = Math.PI * (1 - k);
  return `${(60 + r * Math.cos(a)).toFixed(2)} ${(60 - r * Math.sin(a)).toFixed(2)}`;
}
function arc(from: number, to: number, r: number): string {
  return `M${dial(from, r)} A${r} ${r} 0 0 1 ${dial(to, r)}`;
}

function shell(ic: IconName, title: string, cls: string): { el: HTMLElement; body: HTMLElement; status: HTMLElement } {
  const status = h('span', { class: 'gauge-status' });
  const body = h('div', { class: 'gauge-body' });
  const el = h('div', { class: `gauge glass ${cls}` }, h('div', { class: 'gauge-head' }, icon(ic), h('span', { class: 'gauge-title' }, title), status), body);
  return { el, body, status };
}

function meter(zones: Array<{ from: number; to: number; tone: Tone }>): { el: HTMLElement; marker: HTMLElement } {
  const marker = h('i', { class: 'gm-marker' });
  const el = h(
    'div',
    { class: 'gm' },
    h('div', { class: 'gm-track' }, zones.map((z) => h('i', { class: `gm-zone is-${z.tone}`, style: { left: `${z.from * 100}%`, width: `${(z.to - z.from) * 100}%` } }))),
    marker,
  );
  return { el, marker };
}

export function mountGauge(parent: HTMLElement, spec: GaugeSpec): GaugeHandle {
  let apply: (v: GaugeValues) => void;
  let lastTone: Tone | '' = '';
  let lastStatus = '';
  let s: ReturnType<typeof shell>;
  const setStatus = (text: string, tone: Tone): void => {
    if (text !== lastStatus) {
      lastStatus = text;
      s.status.textContent = text;
    }
    if (tone !== lastTone) {
      lastTone = tone;
      s.el.dataset.tone = tone;
    }
  };

  switch (spec.kind) {
    case 'torque': {
      s = shell('tool_screwdriver', t(`ui.gauge.torque.${spec.mode}`), 'gauge-torque');
      const [g0, g1] = spec.green;
      const svg =
        `<svg viewBox="0 0 120 70">` +
        `<path class="gd-zone is-warn" d="${arc(0, g0, 48)}"/><path class="gd-zone is-ok" d="${arc(g0, g1, 48)}"/><path class="gd-zone is-bad" d="${arc(g1, 1, 48)}"/>` +
        `<path class="gd-ring-bg" d="${arc(0, 1, 57)}"/><path class="gd-ring" pathLength="1" d="${arc(0, 1, 57)}"/>` +
        `<g class="gd-needle"><path d="M60 60L60 20"/></g><circle class="gd-hub" cx="60" cy="60" r="5"/></svg>`;
      const dialEl = h('div', { class: 'gd', html: svg });
      const needle = dialEl.querySelector('.gd-needle') as SVGElement;
      const ring = dialEl.querySelector('.gd-ring') as SVGElement;
      const labels = h('div', { class: 'gd-labels' }, h('span', null, t('ui.gauge.torque.loose')), h('span', null, t('ui.gauge.torque.stripped')));
      s.body.append(dialEl, labels);
      apply = (v) => {
        const k = clamp01(v.value);
        needle.style.transform = `rotate(${(k * 180 - 90).toFixed(1)}deg)`;
        ring.style.strokeDashoffset = String(1 - clamp01(v.progress ?? 0));
        if (v.note) setStatus(v.note, 'idle');
        else if (k < 0.03) setStatus(t('ui.gauge.torque.hold'), 'idle');
        else if (k < g0) setStatus(t('ui.gauge.torque.loose'), 'warn');
        else if (k <= g1) setStatus(t('ui.gauge.torque.good'), 'ok');
        else setStatus(t('ui.gauge.torque.danger'), 'bad');
      };
      break;
    }
    case 'temperature': {
      s = shell('thermo', t('ui.gauge.temp.title'), 'gauge-meter');
      const k = (c: number): number => clamp01((c - spec.min) / (spec.max - spec.min));
      const m = meter([
        { from: k(spec.ideal[0]), to: k(spec.ideal[1]), tone: 'ok' },
        { from: k(spec.danger), to: 1, tone: 'bad' },
      ]);
      const val = h('b', { class: 'gauge-value num' });
      s.body.append(h('div', { class: 'gauge-row' }, val, m.el));
      let lastT = NaN;
      apply = (v) => {
        m.marker.style.left = `${(k(v.value) * 100).toFixed(1)}%`;
        const r = Math.round(v.value);
        if (r !== lastT) {
          lastT = r;
          val.textContent = `${r} °C`;
        }
        if (v.note) setStatus(v.note, 'idle');
        else if (v.value >= spec.danger) setStatus(t('ui.gauge.temp.danger'), 'bad');
        else if (v.value > spec.ideal[1]) setStatus(t('ui.gauge.temp.hot'), 'warn');
        else if (v.value >= spec.ideal[0]) setStatus(t('ui.gauge.temp.ideal'), 'ok');
        else setStatus(t('ui.gauge.temp.cold'), 'idle');
      };
      break;
    }
    case 'tension': {
      s = shell('part_flex', t('ui.gauge.tension.title'), 'gauge-meter');
      const m = meter([
        { from: 0.08, to: spec.safe, tone: 'ok' },
        { from: spec.safe, to: 1, tone: 'bad' },
      ]);
      const prog = h('i');
      s.body.append(m.el, h('div', { class: 'gauge-sub' }, h('span', null, t('ui.gauge.tension.released')), h('span', { class: 'gauge-mini' }, prog)));
      apply = (v) => {
        const k = clamp01(v.value);
        m.marker.style.left = `${(k * 100).toFixed(1)}%`;
        prog.style.width = `${(clamp01(v.progress ?? 0) * 100).toFixed(1)}%`;
        if (v.note) setStatus(v.note, 'idle');
        else if (k > spec.safe) setStatus(t('ui.gauge.tension.danger'), 'bad');
        else if (k > spec.safe * 0.8) setStatus(t('ui.gauge.tension.careful'), 'warn');
        else if (k > 0.08) setStatus(t('ui.gauge.tension.good'), 'ok');
        else setStatus(t('ui.gauge.tension.pull'), 'idle');
      };
      break;
    }
    case 'pick': {
      s = shell('tool_pick', t('ui.gauge.pick.title'), 'gauge-meter');
      const m = meter([
        { from: 0.12, to: spec.danger, tone: 'ok' },
        { from: spec.danger, to: 1, tone: 'bad' },
      ]);
      s.body.append(m.el, h('div', { class: 'gd-labels' }, h('span', null, t('ui.gauge.pick.shallow')), h('span', null, t('ui.gauge.pick.deep'))));
      apply = (v) => {
        const k = clamp01(v.value);
        m.marker.style.left = `${(k * 100).toFixed(1)}%`;
        if (v.note) setStatus(v.note, 'idle');
        else if (k > spec.danger) setStatus(v.risky ? t('ui.gauge.pick.flex') : t('ui.gauge.pick.danger'), 'bad');
        else if (k >= 0.12) setStatus(v.risky ? t('ui.gauge.pick.careful') : t('ui.gauge.pick.good'), v.risky ? 'warn' : 'ok');
        else setStatus(t('ui.gauge.pick.insert'), 'idle');
      };
      break;
    }
    case 'clean': {
      s = shell('tool_brush', spec.label ?? t('ui.gauge.clean.title'), 'gauge-meter');
      const fill = h('i');
      const val = h('b', { class: 'gauge-value num' });
      s.body.append(h('div', { class: 'gauge-row' }, val, h('span', { class: 'gauge-mini is-big' }, fill)));
      let lastP = -1;
      apply = (v) => {
        const k = clamp01(v.value);
        fill.style.width = `${(k * 100).toFixed(1)}%`;
        const pct = Math.round(k * 100);
        if (pct !== lastP) {
          lastP = pct;
          val.textContent = `${pct}%`;
        }
        setStatus(v.note ?? (k >= 0.995 ? t('ui.gauge.clean.done') : ''), k >= 0.995 ? 'ok' : 'idle');
      };
      break;
    }
    case 'multimeter': {
      s = shell('tool_multimeter', t('ui.gauge.meter.title'), 'gauge-lcd');
      const seg = sevenSeg(3, 0);
      const volts = h('span', { class: 'lcd-volts num' });
      s.body.append(h('div', { class: 'lcd' }, seg.el, h('span', { class: 'lcd-unit' }, 'A'), volts));
      let lastV = '';
      apply = (v) => {
        const a = clamp(v.value, 0, 9.99);
        seg.set(a.toFixed(2).replace('.', ''));
        const vt = v.volts !== undefined ? `${formatDecimal(v.volts, 2)} V` : '';
        if (vt !== lastV) {
          lastV = vt;
          volts.textContent = vt;
        }
        if (v.note) setStatus(v.note, 'idle');
        else if (a < 0.01) setStatus(t('ui.gauge.meter.none'), 'bad');
        else if (a < 0.15) setStatus(t('ui.gauge.meter.low'), 'warn');
        else if (a > 2.2) setStatus(t('ui.gauge.meter.high'), 'bad');
        else setStatus(t('ui.gauge.meter.normal'), 'ok');
      };
      break;
    }
    case 'battery': {
      s = shell('fn_battery', t('ui.gauge.battery.title'), 'gauge-battery');
      const fill = h('i');
      const val = h('b', { class: 'gauge-value num' });
      const cycles = h('span', { class: 'gauge-cycles' });
      s.body.append(h('div', { class: 'gauge-row' }, h('span', { class: 'batt' }, fill), h('div', null, val, cycles)));
      let lastP = -1;
      let lastC = -1;
      apply = (v) => {
        const k = clamp01(v.value);
        fill.style.width = `${(k * 100).toFixed(1)}%`;
        const pct = Math.round(k * 100);
        if (pct !== lastP) {
          lastP = pct;
          val.textContent = `${pct}%`;
        }
        if (v.cycles !== undefined && v.cycles !== lastC) {
          lastC = v.cycles;
          cycles.textContent = t('ui.gauge.battery.cycles', { n: Math.round(v.cycles) });
        }
        if (v.note) setStatus(v.note, 'idle');
        else if (k >= 0.8) setStatus(t('ui.gauge.battery.good'), 'ok');
        else if (k >= 0.6) setStatus(t('ui.gauge.battery.worn'), 'warn');
        else setStatus(t('ui.gauge.battery.replace'), 'bad');
      };
      break;
    }
  }

  const el = s.el;
  el.classList.add('is-docked');
  parent.appendChild(el);
  return {
    el,
    update: (v) => apply(v),
    setAnchor(x, y) {
      el.classList.remove('is-docked');
      const w = el.offsetWidth;
      const hh = el.offsetHeight;
      const px = clamp(x + 28, 8, window.innerWidth - w - 8);
      const py = clamp(y - hh - 18, 8, window.innerHeight - hh - 8);
      el.style.transform = `translate(${px.toFixed(0)}px, ${py.toFixed(0)}px)`;
    },
    dock() {
      el.classList.add('is-docked');
      el.style.transform = '';
    },
    destroy() {
      el.classList.add('is-leaving');
      window.setTimeout(() => el.remove(), 160);
    },
  };
}
