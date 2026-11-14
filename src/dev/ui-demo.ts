/**
 * UI gallery: mounts every UI component with fake data above a CSS backdrop that stands in for the 3D scene.
 *   /dev/ui.html?screen=hud&variant=repair&lang=en&scale=1.3&log=1
 *   window.__ui.show('tablet', 'catalog')
 */
import '../ui/demo/demo.css';
import { getLang, setLang, t, type Lang } from '../core/i18n';
import { h } from '../ui/dom';
import { demos, type DemoBg, type DemoCtx } from '../ui/demo/registry';
import { UIRoot } from '../ui/root';

import.meta.glob('../ui/demo/*.demo.ts', { eager: true });

const params = new URLSearchParams(location.search);
const scene = document.getElementById('scene') as HTMLElement;
scene.className = 'demo-scene';
scene.append(
  h('div', { class: 'demo-sky' }),
  h('div', { class: 'demo-sun' }),
  h('div', { class: 'demo-karst demo-karst-a' }),
  h('div', { class: 'demo-karst demo-karst-b' }),
  h('div', { class: 'demo-sea' }),
  h('div', { class: 'demo-sand' }),
  h('div', { class: 'demo-bench' }, h('div', { class: 'demo-mat' }, h('div', { class: 'demo-phone' }))),
);

const root = new UIRoot(document.body);
const logEl = h('div', { class: 'demo-log' });
if (params.get('log') === '1') document.body.appendChild(logEl);
const calls: Array<{ name: string; args: unknown[] }> = [];

let cleanups: Array<() => void> = [];
let current = '';
let currentVariant = '';

function setBg(bg: DemoBg): void {
  scene.dataset.bg = bg;
}

function teardown(): void {
  for (const fn of cleanups) fn();
  cleanups = [];
  for (let i = 0; i < 8 && root.modalDepth > 0; i++) root.dismissTop();
  root.clearToasts();
  for (const name of ['hud', 'panels', 'modal'] as const) root.layers[name].replaceChildren();
}

function makeCtx(variant: string): DemoCtx {
  const log = (name: string, ...args: unknown[]): void => {
    calls.push({ name, args });
    const line = h('div', null, `${name}(${args.map((a) => safeJson(a)).join(', ')})`);
    logEl.prepend(line);
    while (logEl.childElementCount > 8) logEl.lastElementChild?.remove();
  };
  return {
    root,
    variant,
    params,
    log,
    spy<C extends object>(overrides?: Partial<C>): C {
      return new Proxy((overrides ?? {}) as C, {
        get(target, prop) {
          if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
          return (...args: unknown[]) => log(String(prop), ...args);
        },
      });
    },
    setBg,
    loop(fn) {
      let raf = 0;
      let last = performance.now();
      const tick = (now: number): void => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        fn(now / 1000, dt);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      cleanups.push(() => cancelAnimationFrame(raf));
    },
    onCleanup(fn) {
      cleanups.push(fn);
    },
  };
}

function safeJson(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 60 ? `${s.slice(0, 57)}…` : s;
  } catch {
    return String(v);
  }
}

function showIndex(): void {
  setBg('beach');
  const list = h(
    'div',
    { class: 'demo-index panel pe' },
    h('h1', null, t('ui.demo.title')),
    h('p', { class: 'muted' }, t('ui.demo.hint')),
    h(
      'div',
      { class: 'demo-index-grid scroll' },
      [...demos.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, def]) =>
          h(
            'div',
            { class: 'demo-index-item' },
            h('strong', null, def.title ?? name),
            h(
              'div',
              { class: 'demo-index-links' },
              Object.keys(def.variants).map((v) =>
                h('a', { href: `?screen=${name}&variant=${v}&lang=${getLang()}` }, v),
              ),
            ),
          ),
        ),
    ),
  );
  root.layers.panels.appendChild(list);
}

function show(name: string, variant?: string): boolean {
  teardown();
  current = name;
  const def = demos.get(name);
  if (!def) {
    showIndex();
    return false;
  }
  const names = Object.keys(def.variants);
  const v = variant && variant in def.variants ? variant : (names[0] as string);
  currentVariant = v;
  setBg((params.get('bg') as DemoBg | null) ?? def.bg ?? 'beach');
  (def.variants[v] as (ctx: DemoCtx) => void)(makeCtx(v));
  return true;
}

const lang = params.get('lang');
if (lang === 'en' || lang === 'it') setLang(lang);
const scale = Number(params.get('scale') ?? '1');
root.setTextScale(Number.isFinite(scale) && scale > 0 ? scale : 1);
root.setReduceMotion(params.get('motion') === '0');

declare global {
  interface Window {
    __ui: {
      root: UIRoot;
      show: typeof show;
      list(): Record<string, string[]>;
      setLang(lang: Lang): void;
      setScale(scale: number): void;
      calls: typeof calls;
      current(): { screen: string; variant: string };
    };
  }
}

window.__ui = {
  root,
  show,
  list: () => Object.fromEntries([...demos.entries()].map(([k, d]) => [k, Object.keys(d.variants)])),
  setLang: (l) => setLang(l),
  setScale: (s) => root.setTextScale(s),
  calls,
  current: () => ({ screen: current, variant: currentVariant }),
};

show(params.get('screen') ?? '', params.get('variant') ?? undefined);
