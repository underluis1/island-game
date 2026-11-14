/**
 * Full-screen night / construction transition between two days.
 * Timeline: fade in → "work" (night falls, or the new building rises behind a scaffold) → "ready"
 * (new day title / "Il chiosco è pronto!") → fade out → onDone. A click skips ahead.
 * Mount it in `root.layers.transition`; it destroys nothing by itself: call `destroy()` in `onDone`.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/night-transition.css';
import { t } from '../core/i18n';
import { h } from './dom';
import { icon } from './icons';
import { defineView, type View } from './view';

export type NightPhase = 'in' | 'work' | 'ready' | 'out';

export interface NightTransitionProps {
  /** 'night' = plain night between two days; 'build' = night with the construction site */
  mode: 'night' | 'build';
  /** number of the day that is about to start */
  day: number;
  /** mode 'build': what has been built */
  building?: 'kiosk' | 'shop';
  /** shown on the sign of the new building */
  shopName?: string;
  /** start directly on the final "ready" phase (screenshots, reduced motion) */
  instant?: boolean;
  /** stay on the "ready" phase until the player clicks (default: auto-advance) */
  hold?: boolean;
}

export interface NightTransitionCallbacks {
  /** the screen is fully covered: safe moment to swap the 3D scene / advance the simulation */
  onCovered?(): void;
  /** the "ready" phase started (play the fanfare / rooster) */
  onReady?(): void;
  /** fade-out finished */
  onDone(): void;
}

interface State {
  phase: NightPhase;
  timer: number;
}

type V = View<NightTransitionProps, NightTransitionCallbacks, State>;

const FADE = 700;

function starShadows(count: number, seed: number): string {
  let s = seed;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = (0.35 + rnd() * 0.65).toFixed(2);
    out.push(`${(rnd() * 100).toFixed(1)}vw ${(rnd() * 62).toFixed(1)}vh 0 ${(rnd() * 0.06).toFixed(3)}rem rgba(255,250,235,${a})`);
  }
  return out.join(',');
}
const STARS_A = starShadows(70, 7);
const STARS_B = starShadows(45, 91);

const PALM =
  '<g class="nt-sil"><path d="M58 252c4-50-10-92 16-140l8 3c-22 46-8 86-10 137z"/><path d="M78 114c-14-22-40-30-64-18 20 0 34 6 44 18-18-6-38 0-50 18 20-10 40-10 58-6zM78 114c8-26 32-40 58-34-20 4-32 14-38 28 16-10 36-8 52 8-22-6-42-6-60 4zM78 114c-4-24 6-44 28-54-10 14-14 30-10 48z"/></g>';

const KIOSK = `
  <g class="nt-bld">
    <g class="nt-sil">
      <rect x="186" y="150" width="9" height="102"/><rect x="345" y="150" width="9" height="102"/>
      <path d="M150 156l84-62h72l84 62-10 8-14-6-12 8-14-8-12 8-14-8-12 8-14-8-12 8-14-8-12 8-14-8-12 8-14-8-12 6z"/>
      <path d="M176 204h188v10H176zM182 214h176v38H182z"/>
      <rect x="264" y="76" width="12" height="20"/>
    </g>
    <path class="nt-wood" d="M186 222h168M186 236h168" />
    <rect class="nt-sign" x="222" y="166" width="96" height="26" rx="5"/>
    <text class="nt-sign-text" x="270" y="184" text-anchor="middle">__NAME__</text>
    <path class="nt-wire" d="M196 160q37 18 74 4t74 0"/>
    <g class="nt-lit"><circle cx="214" cy="170" r="4.500"/><circle cx="240" cy="172" r="4"/><circle cx="300" cy="170" r="4"/><circle cx="326" cy="166" r="4.500"/><circle cx="270" cy="164" r="3.500"/></g>
  </g>`;

const SHOP = `
  <g class="nt-bld">
    <g class="nt-sil">
      <path d="M150 122h240v130H150z"/><path d="M138 108h264v16H138z"/>
      <path d="M200 78h140v30H200z"/>
    </g>
    <rect class="nt-glass nt-lit" x="166" y="150" width="132" height="84" rx="4"/>
    <path class="nt-mullion" d="M210 150v84M254 150v84"/>
    <rect class="nt-glass nt-lit" x="318" y="158" width="52" height="94" rx="3"/>
    <path class="nt-awning" d="M160 124h220l10 20H150z"/>
    <path class="nt-awning-stripe" d="M186 124l-6 20h22l4-20zM230 124l-2 20h22v-20zM274 124l2 20h22l-4-20zM318 124l6 20h22l-8-20z"/>
    <rect class="nt-sign nt-lit" x="206" y="83" width="128" height="20" rx="4"/>
    <text class="nt-sign-text" x="270" y="98" text-anchor="middle">__NAME__</text>
  </g>`;

const SCAFFOLD = `
  <g class="nt-scaf">
    <path d="M136 252V70M404 252V70M270 252V70M136 200h268M136 148h268M136 96h268M136 252l134-52M270 252l134-52M136 148l134-52M270 148l134-52"/>
    <path class="nt-plank" d="M130 200h280M130 148h280"/>
  </g>
  <g class="nt-hammer"><rect x="-3" y="-34" width="6" height="38" rx="2"/><rect x="-13" y="-44" width="26" height="13" rx="3"/></g>
  <g class="nt-sparks"><path d="M0-9l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/></g>`;

function sceneSvg(p: NightTransitionProps): string {
  const name = (p.shopName ?? 'PHONE FIX').replace(/[<>&]/g, '').slice(0, 16).toUpperCase();
  const bld = p.mode === 'build' ? (p.building === 'shop' ? SHOP : KIOSK).replace('__NAME__', name) + SCAFFOLD : '';
  return `<svg viewBox="0 0 480 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    ${PALM}${bld}
    <path class="nt-sil" d="M-400 252q160-14 320-4t320-2 320 0 320-2v70H-400z"/>
  </svg>`;
}

function go(v: V, phase: NightPhase): void {
  window.clearTimeout(v.state.timer);
  if (v.destroyed) return;
  v.set({ phase });
  const next = (ms: number, to: NightPhase): void => {
    v.state.timer = window.setTimeout(() => go(v, to), ms);
  };
  if (phase === 'in') {
    v.state.timer = window.setTimeout(() => {
      v.cb.onCovered?.();
      go(v, 'work');
    }, FADE);
  } else if (phase === 'work') {
    next(v.props.mode === 'build' ? 3400 : 1700, 'ready');
  } else if (phase === 'ready') {
    v.cb.onReady?.();
    if (!v.props.hold) next(v.props.mode === 'build' ? 3600 : 2100, 'out');
  } else {
    v.state.timer = window.setTimeout(() => v.cb.onDone(), FADE);
  }
}

export const mountNightTransition = defineView<NightTransitionProps, NightTransitionCallbacks, State>({
  name: 'night-transition',
  state: (p) => ({ phase: p.instant ? 'ready' : 'in', timer: 0 }),
  mounted: (v) => {
    v.onDestroy(() => window.clearTimeout(v.state.timer));
    if (v.props.instant || document.documentElement.classList.contains('reduce-motion')) {
      v.cb.onCovered?.();
      go(v, 'ready');
    } else go(v, 'in');
  },
  render: (v) => {
    const p = v.props;
    const { phase } = v.state;
    const ready = phase === 'ready' || phase === 'out';
    const build = p.mode === 'build';
    const kind = p.building === 'shop' ? 'Shop' : 'Kiosk';
    return h(
      'div',
      {
        class: 'nt pe',
        dataset: { phase, mode: p.mode, instant: p.instant ? '1' : null },
        onClick: () => {
          if (phase === 'work') go(v, 'ready');
          else if (phase === 'ready') go(v, 'out');
        },
      },
      h('div', { class: 'nt-sky' }),
      h('div', { class: 'nt-dawn' }),
      h('div', { class: 'nt-stars', style: { 'box-shadow': STARS_A } }),
      h('div', { class: 'nt-stars nt-stars-b', style: { 'box-shadow': STARS_B } }),
      h('div', { class: 'nt-moon' }),
      h('div', { class: 'nt-sea' }),
      h('div', { class: 'nt-scene', keep: true, html: sceneSvg(p) }),
      h(
        'div',
        { class: 'nt-text' },
        ready
          ? h(
              'div',
              { class: 'nt-block', key: 'ready' },
              h('div', { class: 'nt-kicker' }, icon(build ? 'hammer' : 'sun'), build ? t('ui.night.day', { n: p.day }) : t('ui.night.morning')),
              h('h1', { class: 'nt-title' }, build ? t(`ui.night.ready${kind}`) : t('ui.night.day', { n: p.day })),
              build ? h('p', { class: 'nt-sub' }, t(`ui.night.ready${kind}Sub`)) : null,
            )
          : h(
              'div',
              { class: 'nt-block', key: 'work' },
              h('div', { class: 'nt-kicker' }, icon(build ? 'hammer' : 'moon'), build ? t('ui.night.building') : t('ui.night.sleeping')),
              build ? h('div', { class: 'nt-progress' }, h('i', null)) : h('div', { class: 'nt-zzz', 'aria-hidden': 'true' }, h('span', null, 'z'), h('span', null, 'z'), h('span', null, 'Z')),
            ),
      ),
      h('div', { class: 'nt-skip' }, icon('mouse'), t('ui.night.skip')),
    );
  },
});
