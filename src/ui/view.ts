/**
 * Component runtime. A view is a pure `render(props, state) → element` function plus optional
 * lifecycle hooks; `update(props)` morphs the live DOM instead of rebuilding it.
 *
 *   const mountThing = defineView<ThingProps, ThingCallbacks>({ name: 'thing', render: (v) => h('div', ...) });
 *   const thing = mountThing(parent, props, callbacks);
 *   thing.update(nextProps);   // cheap, keeps scroll/focus
 *   thing.destroy();
 */
import { attach, morph } from './dom';

export interface Mounted<P> {
  readonly el: HTMLElement;
  update(props: P): void;
  /** Removes the element (after a short exit animation unless `immediate`). */
  destroy(immediate?: boolean): void;
}

export interface View<P, C, S> {
  props: P;
  readonly cb: C;
  state: S;
  el: HTMLElement;
  /** Merge a patch into the local UI state and re-render. */
  set(patch: Partial<S>): void;
  rerender(): void;
  onDestroy(fn: () => void): void;
  readonly destroyed: boolean;
}

export interface ViewDef<P, C, S> {
  name: string;
  state?: (props: P) => S;
  render: (v: View<P, C, S>) => HTMLElement;
  /** after the first render, element attached */
  mounted?: (v: View<P, C, S>) => void;
  /** after every later render */
  updated?: (v: View<P, C, S>, prev: P) => void;
  /** exit animation length in ms (the element gets `.is-leaving`); 0 = remove at once */
  leaveMs?: number;
}

const live = new Set<{ rerender(): void }>();

/** Re-render every mounted view (language change, text scale…). */
export function rerenderAll(): void {
  for (const v of [...live]) v.rerender();
}

export function defineView<P, C = Record<string, never>, S = Record<string, never>>(
  def: ViewDef<P, C, S>,
): (parent: HTMLElement, props: P, callbacks: C) => Mounted<P> {
  return (parent, props, callbacks) => {
    const cleanups: Array<() => void> = [];
    let destroyed = false;
    let rendering = false;
    let dirty = false;
    const v: View<P, C, S> = {
      props,
      cb: callbacks,
      state: (def.state ? def.state(props) : {}) as S,
      el: null as unknown as HTMLElement,
      set(patch) {
        Object.assign(v.state as object, patch);
        v.rerender();
      },
      rerender() {
        if (destroyed) return;
        if (rendering) {
          dirty = true;
          return;
        }
        rendering = true;
        try {
          const next = def.render(v);
          next.dataset.view = def.name;
          v.el = morph(v.el, next);
        } finally {
          rendering = false;
        }
        if (dirty) {
          dirty = false;
          v.rerender();
        }
      },
      onDestroy(fn) {
        cleanups.push(fn);
      },
      get destroyed() {
        return destroyed;
      },
    };
    v.el = def.render(v);
    v.el.dataset.view = def.name;
    attach(parent, v.el);
    live.add(v);
    def.mounted?.(v);
    return {
      get el() {
        return v.el;
      },
      update(next) {
        if (destroyed) return;
        const prev = v.props;
        v.props = next;
        v.rerender();
        def.updated?.(v, prev);
      },
      destroy(immediate) {
        if (destroyed) return;
        destroyed = true;
        live.delete(v);
        for (const fn of cleanups) fn();
        const el = v.el;
        const ms = immediate ? 0 : (def.leaveMs ?? 0);
        if (ms > 0 && el.isConnected) {
          el.classList.add('is-leaving');
          el.style.pointerEvents = 'none';
          window.setTimeout(() => el.remove(), ms);
        } else {
          el.remove();
        }
      },
    };
  };
}
