/**
 * Micro-soldering minigame: self-contained canvas component (microscope view + DOM side panel).
 *
 *   const game = mountSolderGame(root.layers.modal, { faultKind: 'charge_ic', toolTier: 1, steadiness: 0.6 },
 *     { onDone: (quality) => …, onSfx: (name) => audio.play(name) });
 *   game.destroy();
 *
 * Phases: 1 flux (drag) → 2 heat in the temperature window → 3 align the new part → 4 solder every pad.
 * Final quality = mean precision of the four phases (0..1), reported through `onDone` when the player
 * leaves the result card.
 */
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/solder.css';
import { onLangChange, t } from '../../core/i18n';
import { cx, h } from '../dom';
import { formatPercent, formatTemp, formatTimer } from '../format';
import { icon } from '../icons';
import { button } from '../widgets';
import { SolderSim, type SolderProps, type SolderSfx } from './game';
import { buildBoard, drawFrame, paintFlux } from './render';

export type { SolderFault, SolderProps, SolderSfx } from './game';

export interface SolderCallbacks {
  /** final precision 0..1, fired once when the player confirms the result card */
  onDone(quality: number): void;
  /** sound cue for the audio engine */
  onSfx?(name: SolderSfx): void;
}

export interface SolderGameHandle {
  readonly el: HTMLElement;
  /** 1 flux · 2 heat · 3 place · 4 solder · 5 result */
  readonly phase: number;
  /** current mean precision 0..1 (final once phase = 5) */
  readonly quality: number;
  /** dev/test: jump to a phase with the previous ones done; `sample` poses a mid-phase snapshot */
  skipTo(phase: number, sample?: boolean): void;
  /** dev/test: stop the simulation clock (rendering continues) */
  freeze(on: boolean): void;
  destroy(): void;
}

const TEMP_MAX = 500;
const HINT_KEY = ['', 'flux', 'heat', 'place', 'solder', 'done'];

export function mountSolderGame(parent: HTMLElement, props: SolderProps, callbacks: SolderCallbacks): SolderGameHandle {
  const sfx = (name: SolderSfx): void => callbacks.onSfx?.(name);
  const sim = new SolderSim(props, sfx);
  const hotAir = props.toolTier === 2;
  const tune = sim.tune;

  /* ------------------------------------------------------------ DOM */
  const canvas = h('canvas', { class: 'solder-canvas' });
  const zoomTag = h('div', { class: 'solder-zoom' }, '×40');
  const stepEls = [1, 2, 3, 4].map((n) => h('li', { class: 'solder-step' }, h('span', { class: 'solder-step-n' }, String(n)), h('span', { class: 'solder-step-name' })));
  const titleEl = h('h2', { class: 'panel-title' });
  const faultEl = h('div', { class: 'panel-sub' });
  const hintTitle = h('div', { class: 'solder-hint-title' });
  const hintText = h('div', { class: 'solder-hint-text' });
  const hintIcon = h('span', { class: 'solder-hint-ic' });

  const pct = (v: number): string => `${((v / TEMP_MAX) * 100).toFixed(2)}%`;
  const needle = h('div', { class: 'solder-temp-needle' });
  const tempVal = h('span', { class: 'solder-temp-val num' });
  const tempState = h('span', { class: 'solder-temp-state' });
  const tempLabel = h('span', { class: 'solder-meter-label' });
  const idealTag = h('span', { class: 'solder-temp-tag is-ideal', style: { left: pct((tune.tempLo + tune.tempHi) / 2) } });
  const dangerTag = h('span', { class: 'solder-temp-tag is-danger', style: { left: pct((tune.tempDanger + TEMP_MAX) / 2) } });
  const tempBox = h(
    'div',
    { class: 'solder-meter solder-temp' },
    h('div', { class: 'solder-meter-head' }, tempLabel, tempState, tempVal),
    h(
      'div',
      { class: 'solder-temp-track' },
      h('div', { class: 'solder-temp-zone is-ideal', style: { left: pct(tune.tempLo), width: pct(tune.tempHi - tune.tempLo) } }),
      h('div', { class: 'solder-temp-zone is-danger', style: { left: pct(tune.tempDanger), right: '0' } }),
      needle,
    ),
    h('div', { class: 'solder-temp-tags' }, idealTag, dangerTag),
  );

  const tally = { good: h('b', { class: 'num' }), cold: h('b', { class: 'num' }), bridge: h('b', { class: 'num' }) };
  const tallyLabel = { good: h('span'), cold: h('span'), bridge: h('span') };
  const padCount = h('span', { class: 'solder-temp-val num' });
  const padLabel = h('span', { class: 'solder-meter-label' });
  const tallyBox = h(
    'div',
    { class: 'solder-meter solder-tally' },
    h('div', { class: 'solder-meter-head' }, padLabel, padCount),
    h(
      'div',
      { class: 'solder-tally-row' },
      h('span', { class: 'solder-tally-item is-good' }, icon('check_circle'), tally.good, tallyLabel.good),
      h('span', { class: 'solder-tally-item is-cold' }, icon('drop'), tally.cold, tallyLabel.cold),
      h('span', { class: 'solder-tally-item is-bridge' }, icon('warn'), tally.bridge, tallyLabel.bridge),
    ),
  );

  const progFill = h('div', { class: 'solder-prog-fill' });
  const progLabel = h('span', { class: 'solder-meter-label' });
  const progVal = h('span', { class: 'solder-temp-val num' });
  const progBox = h('div', { class: 'solder-meter' }, h('div', { class: 'solder-meter-head' }, progLabel, progVal), h('div', { class: 'solder-prog' }, progFill));
  const timerEl = h('span', { class: 'num' });
  const toolEl = h('span', { class: 'solder-foot-tool' });

  const side = h(
    'aside',
    { class: 'solder-side panel' },
    h('header', { class: 'panel-head solder-head' }, h('span', { class: 'panel-head-ic' }, icon('tool_microscope')), h('div', { class: 'panel-head-text' }, titleEl, faultEl)),
    h('ol', { class: 'solder-steps' }, stepEls),
    h('div', { class: 'solder-hint' }, hintIcon, h('div', { class: 'solder-hint-body' }, hintTitle, hintText)),
    tempBox,
    tallyBox,
    progBox,
    h('footer', { class: 'solder-foot' }, h('span', { class: 'solder-foot-time' }, icon('clock'), timerEl), toolEl),
  );
  const resultSlot = h('div', { class: 'solder-result-slot' });
  const el = h(
    'div',
    { class: 'solder pe', dataset: { view: 'solder' } },
    h('div', { class: 'solder-stage' }, h('div', { class: 'solder-scope' }, canvas, h('div', { class: 'solder-scope-glass' })), zoomTag),
    side,
    resultSlot,
  );
  parent.appendChild(el);

  /* ------------------------------------------------------------ canvas */
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  let px = 0;
  let board: HTMLCanvasElement | null = null;
  const flux = document.createElement('canvas');
  const allStamps: Array<{ x: number; y: number }> = [];

  const resize = (): void => {
    const size = canvas.clientWidth;
    if (size <= 0) return;
    const next = Math.round(size * Math.min(2, window.devicePixelRatio || 1));
    if (next === px) return;
    px = next;
    canvas.width = px;
    canvas.height = px;
    board = buildBoard(sim.layout, px);
    flux.width = px;
    flux.height = px;
    paintFlux(flux, allStamps);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const toBoard = (ev: PointerEvent): void => {
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0) return;
    sim.pointer(((ev.clientX - r.left) / r.width - 0.5) * 1000, ((ev.clientY - r.top) / r.height - 0.5) * 1000);
  };
  const onDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    toBoard(ev);
    sim.press();
  };
  const onMove = (ev: PointerEvent): void => toBoard(ev);
  const onUp = (ev: PointerEvent): void => {
    toBoard(ev);
    sim.release();
  };
  const noMenu = (ev: Event): void => ev.preventDefault();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', noMenu);

  /* ------------------------------------------------------------ texts */
  let shownPhase = -1;
  let resultShown = false;
  let done = false;

  const hintIconFor = (phase: number): string => {
    if (phase === 1) return 'drop';
    if (phase === 2) return 'flame';
    if (phase === 3) return 'target';
    if (phase === 4) return hotAir ? 'tool_hotair' : 'tool_solder';
    return 'check_circle';
  };

  const refreshText = (): void => {
    const phase = sim.phase;
    titleEl.textContent = t('ui.solder.title');
    faultEl.textContent = t(`ui.solder.fault.${props.faultKind}`);
    stepEls.forEach((li, i) => {
      li.className = cx('solder-step', i + 1 < phase && 'is-done', i + 1 === phase && 'is-active');
      (li.lastElementChild as HTMLElement).textContent = t(`ui.solder.step.${i + 1}`);
      const n = li.firstElementChild as HTMLElement;
      if (i + 1 < phase) n.replaceChildren(icon('check'));
      else n.textContent = String(i + 1);
    });
    const key = HINT_KEY[Math.min(5, phase)] as string;
    hintTitle.textContent = t(`ui.solder.hintTitle.${key}`);
    const special = phase === 2 && props.faultKind === 'long_screw' ? 'heat_long_screw' : phase === 3 && props.faultKind === 'long_screw' ? 'place_long_screw' : key;
    hintText.textContent = t(`ui.solder.hint.${special}`);
    hintIcon.replaceChildren(icon(hintIconFor(phase)));
    tempLabel.textContent = t('ui.solder.temp');
    idealTag.textContent = t('ui.solder.ideal');
    dangerTag.textContent = t('ui.solder.danger');
    padLabel.textContent = t('ui.solder.pads');
    tallyLabel.good.textContent = t('ui.solder.tally.good');
    tallyLabel.cold.textContent = t('ui.solder.tally.cold');
    tallyLabel.bridge.textContent = t('ui.solder.tally.bridge');
    progLabel.textContent = t('ui.solder.progress');
    toolEl.textContent = t(hotAir ? 'ui.solder.tool.hotair' : 'ui.solder.tool.iron');
    tempBox.hidden = phase !== 2;
    tallyBox.hidden = phase !== 4;
    progBox.hidden = phase === 3 || phase >= 5;
    if (resultShown) renderResult();
  };

  const gradeOf = (q: number): 's' | 'a' | 'b' | 'c' => (q >= 0.9 ? 's' : q >= 0.75 ? 'a' : q >= 0.55 ? 'b' : 'c');

  function renderResult(): void {
    const q = sim.quality;
    const grade = gradeOf(q);
    const circ = 2 * Math.PI * 52;
    const card = h(
      'div',
      { class: `solder-result panel grade-${grade}` },
      h('div', { class: 'solder-result-kicker' }, t('ui.solder.result.title')),
      h(
        'div',
        { class: 'solder-result-top' },
        h(
          'div',
          { class: 'solder-ring' },
          h('div', {
            class: 'solder-ring-svg',
            html: `<svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" cx="60" cy="60" r="52" stroke-dasharray="${circ.toFixed(1)}" style="--off:${(circ * (1 - q)).toFixed(1)};--circ:${circ.toFixed(1)}"/></svg>`,
          }),
          h('div', { class: 'solder-ring-val num' }, formatPercent(q)),
        ),
        h('div', { class: 'solder-result-text' }, h('div', { class: 'solder-result-grade' }, t(`ui.solder.result.grade.${grade}`)), h('div', { class: 'solder-result-note' }, t(`ui.solder.result.note.${grade}`))),
      ),
      h(
        'div',
        { class: 'solder-result-rows' },
        sim.scores.map((s, i) =>
          h(
            'div',
            { class: 'solder-result-row', style: { '--i': i } },
            h('span', { class: 'solder-result-name' }, t(`ui.solder.step.${i + 1}`)),
            h('span', { class: 'solder-result-bar' }, h('i', { class: s >= 0.75 ? 'is-good' : s >= 0.5 ? 'is-mid' : 'is-low', style: { width: `${Math.round(s * 100)}%` } })),
            h('span', { class: 'solder-result-pct num' }, formatPercent(s)),
          ),
        ),
      ),
      h(
        'div',
        { class: 'solder-result-foot' },
        h(
          'div',
          { class: 'solder-result-stats' },
          h('span', null, icon('clock'), formatTimer(sim.elapsed)),
          sim.counts.cold > 0 ? h('span', { class: 't-warn' }, icon('drop'), t('ui.solder.result.cold', { n: sim.counts.cold })) : null,
          sim.counts.bridge > 0 ? h('span', { class: 't-bad' }, icon('warn'), t('ui.solder.result.bridge', { n: sim.counts.bridge })) : null,
          sim.counts.cold + sim.counts.bridge === 0 ? h('span', { class: 't-ok' }, icon('sparkle'), t('ui.solder.result.clean')) : null,
        ),
        button({
          label: t('ui.common.continue'),
          variant: 'primary',
          size: 'lg',
          iconEnd: 'arrow_right',
          onClick: () => {
            if (done) return;
            done = true;
            callbacks.onDone(sim.quality);
          },
        }),
      ),
    );
    resultSlot.replaceChildren(card);
    resultSlot.classList.add('is-on');
  }

  const offLang = onLangChange(refreshText);

  /* ------------------------------------------------------------ loop */
  let raf = 0;
  let last = performance.now();
  let frozen = false;
  let destroyed = false;
  const label = (key: string): string => t(`ui.solder.fb.${key}`);

  const frame = (now: number): void => {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!frozen) sim.update(dt);
    if (sim.stamps.length > 0) {
      allStamps.push(...sim.stamps);
      if (allStamps.length > 6000) allStamps.splice(0, allStamps.length - 6000);
      paintFlux(flux, sim.stamps);
      sim.stamps.length = 0;
    }
    if (sim.phase !== shownPhase) {
      shownPhase = sim.phase;
      if (sim.phase >= 5 && !resultShown) resultShown = true;
      refreshText();
    }
    // HUD
    if (sim.phase === 2) {
      const temp = sim.temp;
      needle.style.left = pct(Math.min(TEMP_MAX, temp));
      tempVal.textContent = formatTemp(temp);
      const state = temp > tune.tempDanger ? 'danger' : temp > tune.tempHi ? 'hot' : temp >= tune.tempLo ? 'ideal' : 'cold';
      if (tempBox.dataset.state !== state) {
        tempBox.dataset.state = state;
        tempState.textContent = t(`ui.solder.tempState.${state}`);
      }
    } else if (sim.phase === 4) {
      padCount.textContent = `${Math.min(sim.padIndex + 1, sim.pads.length)} / ${sim.pads.length}`;
      tally.good.textContent = String(sim.counts.good);
      tally.cold.textContent = String(sim.counts.cold);
      tally.bridge.textContent = String(sim.counts.bridge);
    }
    const p = sim.progress;
    progFill.style.width = `${(p * 100).toFixed(1)}%`;
    progVal.textContent = formatPercent(p);
    timerEl.textContent = formatTimer(sim.elapsed);
    el.classList.toggle('is-between', sim.pause > 0);
    // canvas
    if (board && px > 0) {
      const s = px / 1000;
      ctx.setTransform(s, 0, 0, s, px / 2, px / 2);
      ctx.clearRect(-500, -500, 1000, 1000);
      drawFrame(ctx, sim, board, flux, label, hotAir);
    }
  };
  raf = requestAnimationFrame(frame);

  return {
    el,
    get phase() {
      return sim.phase;
    },
    get quality() {
      return sim.quality;
    },
    skipTo(phase, sample) {
      sim.skipTo(phase, sample);
    },
    freeze(on) {
      frozen = on;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      offLang();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('contextmenu', noMenu);
      flux.width = 0;
      if (board) board.width = 0;
      canvas.width = 0;
      el.remove();
    },
  };
}
