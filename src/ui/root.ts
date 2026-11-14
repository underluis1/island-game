/**
 * UIRoot — owns the DOM layers above the WebGL canvas and the cross-cutting services:
 * modal stack (focus trap, Esc), toasts and in-game error banners, hover tooltips (`data-tip`),
 * text scale, reduced motion, hot language switch and the injectable UI sound hook.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/toast.css';
import { onLangChange } from '../core/i18n';
import type { Settings } from '../core/settings';
import { h } from './dom';
import { clamp, formatMoney } from './format';
import { icon, type IconName } from './icons';
import { setSoundHook, sfx, type SoundHook } from './sound';
import { rerenderAll } from './view';

export type LayerName = 'hud' | 'panels' | 'modal' | 'toast' | 'tooltip' | 'transition';
const LAYERS: LayerName[] = ['hud', 'panels', 'modal', 'toast', 'tooltip', 'transition'];

export type ToastKind = 'info' | 'success' | 'warn' | 'error' | 'money';

export interface ToastOptions {
  kind?: ToastKind;
  text: string;
  /** bold first line */
  title?: string;
  icon?: IconName | string;
  /** kind "money": signed amount shown big (+฿ 450) */
  amount?: number;
  /** ms on screen (default 3600) */
  duration?: number;
  /** skip the sound cue */
  silent?: boolean;
}

export interface ModalOptions {
  /** Esc / click on the backdrop closes it (default true) */
  dismissible?: boolean;
  /** called instead of closing when the player dismisses (lets the owner decide) */
  onDismiss?: () => void;
  backdrop?: 'dim' | 'blur' | 'clear' | 'none';
  /** keep Tab inside the modal (default true; the tablet turns it off because Tab closes it) */
  trapFocus?: boolean;
  /** skip the open/close cues */
  silent?: boolean;
  onClosed?: () => void;
}

export interface ModalHandle<M> {
  readonly content: M;
  readonly closed: boolean;
  close(): void;
}

interface ModalEntry {
  el: HTMLElement;
  opts: ModalOptions;
  close(): void;
  prevFocus: Element | null;
}

const FOCUSABLE = 'button:not([aria-disabled="true"]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
const TOAST_ICON: Record<ToastKind, IconName> = {
  info: 'info',
  success: 'check_circle',
  warn: 'warn',
  error: 'cross_circle',
  money: 'coin',
};

export class UIRoot {
  readonly el: HTMLElement;
  readonly layers: Record<LayerName, HTMLElement>;
  private modals: ModalEntry[] = [];
  private textScale = 1;
  private tooltip: HTMLElement;
  private tipTarget: HTMLElement | null = null;
  private tipTimer = 0;
  private fadeEl: HTMLElement;
  private toastStack: HTMLElement;
  private errorSlot: HTMLElement;
  private lastHover: Element | null = null;
  private disposers: Array<() => void> = [];

  constructor(parent: HTMLElement = document.body) {
    this.el = h('div', { class: 'ui-root' });
    const layers = {} as Record<LayerName, HTMLElement>;
    for (const name of LAYERS) {
      layers[name] = h('div', { class: 'ui-layer', dataset: { layer: name } });
      this.el.appendChild(layers[name]);
    }
    this.layers = layers;
    this.tooltip = h('div', { class: 'ui-tooltip', role: 'tooltip' });
    layers.tooltip.appendChild(this.tooltip);
    this.fadeEl = h('div', { class: 'ui-fade' });
    layers.transition.appendChild(this.fadeEl);
    this.toastStack = h('div', { class: 'toast-stack' });
    this.errorSlot = h('div', { class: 'game-error-slot' });
    layers.toast.append(this.toastStack, this.errorSlot);
    parent.appendChild(this.el);

    const onResize = (): void => this.applyScale();
    const onKey = (ev: KeyboardEvent): void => this.onKeyDown(ev);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey, true);
    this.el.addEventListener('mouseover', this.onOver);
    this.el.addEventListener('mouseout', this.onOut);
    this.el.addEventListener('mousedown', this.hideTip);
    this.disposers.push(
      () => window.removeEventListener('resize', onResize),
      () => window.removeEventListener('keydown', onKey, true),
      onLangChange(() => rerenderAll()),
    );
    this.applyScale();
  }

  /* ------------------------------------------------------------ settings */

  /** Apply the accessibility-related settings (text scale, reduced motion). */
  applySettings(s: Pick<Settings, 'textScale' | 'reduceMotion'>): void {
    this.setTextScale(s.textScale);
    this.setReduceMotion(s.reduceMotion);
  }

  setTextScale(scale: number): void {
    this.textScale = clamp(scale, 0.8, 1.6);
    this.applyScale();
  }

  setReduceMotion(on: boolean): void {
    document.documentElement.classList.toggle('reduce-motion', on);
  }

  /** The audio engine plugs in here; the UI only names the cue to play. */
  setSoundHook(fn: SoundHook | null): void {
    setSoundHook(fn);
  }

  /** Root font-size = 16px × viewport factor × text scale; every UI size is in rem. */
  private applyScale(): void {
    const fit = clamp(Math.min(window.innerWidth / 1600, window.innerHeight / 900), 0.72, 1.35);
    document.documentElement.style.fontSize = `${(16 * fit * this.textScale).toFixed(2)}px`;
    document.documentElement.style.setProperty('--text-scale', String(this.textScale));
  }

  /* ------------------------------------------------------------ modals */

  get modalDepth(): number {
    return this.modals.length;
  }

  /**
   * Open a modal: `mount` receives the backdrop element and mounts the content into it.
   * While at least one modal is open the root consumes Esc (and Tab when `trapFocus`).
   */
  openModal<M extends { destroy(immediate?: boolean): void }>(
    mount: (parent: HTMLElement) => M,
    opts: ModalOptions = {},
  ): ModalHandle<M> {
    const backdrop = h('div', { class: 'modal-backdrop', dataset: { backdrop: opts.backdrop ?? 'dim' } });
    this.layers.modal.appendChild(backdrop);
    const content = mount(backdrop);
    let closed = false;
    const entry: ModalEntry = {
      el: backdrop,
      opts,
      prevFocus: document.activeElement,
      close: () => {
        if (closed) return;
        closed = true;
        const i = this.modals.indexOf(entry);
        if (i >= 0) this.modals.splice(i, 1);
        if (!opts.silent) sfx('ui_close');
        backdrop.classList.add('is-leaving');
        backdrop.style.pointerEvents = 'none';
        window.setTimeout(() => {
          content.destroy(true);
          backdrop.remove();
        }, 170);
        if (entry.prevFocus instanceof HTMLElement && entry.prevFocus.isConnected) entry.prevFocus.focus();
        opts.onClosed?.();
      },
    };
    backdrop.addEventListener('mousedown', (ev) => {
      if (ev.target === backdrop && opts.dismissible !== false) this.dismiss(entry);
    });
    this.modals.push(entry);
    if (!opts.silent) sfx('ui_open');
    backdrop.tabIndex = -1;
    (backdrop.querySelector<HTMLElement>('[autofocus]') ?? backdrop).focus({ preventScroll: true });
    return {
      content,
      get closed() {
        return closed;
      },
      close: entry.close,
    };
  }

  /** Close the top-most modal (as if the player pressed Esc). Returns false when none is open. */
  dismissTop(): boolean {
    const top = this.modals[this.modals.length - 1];
    if (!top) return false;
    this.dismiss(top);
    return true;
  }

  private dismiss(entry: ModalEntry): void {
    if (entry.opts.dismissible === false) return;
    if (entry.opts.onDismiss) entry.opts.onDismiss();
    else entry.close();
  }

  private onKeyDown(ev: KeyboardEvent): void {
    const top = this.modals[this.modals.length - 1];
    if (!top || top.el.querySelector('[data-capture-keys]')) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      this.dismiss(top);
    } else if (ev.key === 'Tab' && top.opts.trapFocus !== false) {
      ev.stopPropagation();
      const items = Array.from(top.el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => e.offsetParent !== null);
      if (items.length === 0) {
        ev.preventDefault();
        return;
      }
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (!top.el.contains(active)) {
        ev.preventDefault();
        first.focus();
      } else if (ev.shiftKey && active === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  }

  /* ------------------------------------------------------------ toasts */

  /** Stacked notification (bottom-right). Returns a function that removes it early. */
  toast(o: ToastOptions): () => void {
    const kind = o.kind ?? 'info';
    const el = h(
      'div',
      { class: `toast toast-${kind} pe`, role: 'status' },
      h('span', { class: 'toast-ic' }, icon(o.icon ?? TOAST_ICON[kind])),
      h(
        'div',
        { class: 'toast-body' },
        o.title ? h('div', { class: 'toast-title' }, o.title) : null,
        h('div', { class: 'toast-text' }, o.text),
      ),
      kind === 'money' && o.amount !== undefined
        ? h('span', { class: o.amount < 0 ? 'toast-amount is-loss' : 'toast-amount' }, formatMoney(o.amount, { signed: true }))
        : null,
    );
    this.toastStack.appendChild(el);
    while (this.toastStack.childElementCount > 5) this.toastStack.firstElementChild?.remove();
    if (!o.silent) sfx(kind === 'error' ? 'error' : kind === 'success' || kind === 'money' ? 'success' : 'ui_open');
    let gone = false;
    const remove = (): void => {
      if (gone) return;
      gone = true;
      el.classList.add('is-leaving');
      window.setTimeout(() => el.remove(), 260);
    };
    window.setTimeout(remove, o.duration ?? 3600);
    el.addEventListener('click', remove);
    return remove;
  }

  /**
   * Big, unmissable in-game refusal ("Prima scollega la batteria!") in the upper-middle of the screen.
   * A new error replaces the previous one.
   */
  gameError(text: string, ic: IconName | string = 'warn', duration = 2800): void {
    for (const old of Array.from(this.errorSlot.children)) old.remove();
    const el = h('div', { class: 'game-error', role: 'alert' }, h('span', { class: 'game-error-ic' }, icon(ic)), h('span', null, text));
    this.errorSlot.appendChild(el);
    sfx('error');
    window.setTimeout(() => {
      el.classList.add('is-leaving');
      window.setTimeout(() => el.remove(), 260);
    }, duration);
  }

  clearToasts(): void {
    this.toastStack.replaceChildren();
    this.errorSlot.replaceChildren();
  }

  /* ------------------------------------------------------------ tooltip (data-tip) */

  private onOver = (ev: MouseEvent): void => {
    const target = ev.target as Element | null;
    const hoverable = target?.closest('.btn, .tab, .seg-opt, [data-hover]') ?? null;
    if (hoverable !== this.lastHover) {
      this.lastHover = hoverable;
      if (hoverable && !hoverable.classList.contains('is-disabled')) sfx('ui_hover');
    }
    const tipEl = target?.closest<HTMLElement>('[data-tip]') ?? null;
    if (tipEl === this.tipTarget) return;
    this.hideTip();
    if (!tipEl) return;
    this.tipTarget = tipEl;
    this.tipTimer = window.setTimeout(() => this.showTip(tipEl), 320);
  };

  private onOut = (ev: MouseEvent): void => {
    const to = ev.relatedTarget as Node | null;
    if (this.tipTarget && (!to || !this.tipTarget.contains(to))) this.hideTip();
    if (this.lastHover && (!to || !this.lastHover.contains(to))) this.lastHover = null;
  };

  private showTip(target: HTMLElement): void {
    const text = target.getAttribute('data-tip');
    if (!text || !target.isConnected) return;
    this.tooltip.textContent = text;
    const r = target.getBoundingClientRect();
    const tw = this.tooltip.offsetWidth;
    const th = this.tooltip.offsetHeight;
    const gap = 8;
    const x = clamp(r.left + r.width / 2 - tw / 2, 6, window.innerWidth - tw - 6);
    const above = r.top - th - gap;
    const y = above < 6 ? r.bottom + gap : above;
    this.tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.tooltip.classList.add('is-on');
  }

  private hideTip = (): void => {
    window.clearTimeout(this.tipTimer);
    this.tipTarget = null;
    this.tooltip.classList.remove('is-on');
  };

  /* ------------------------------------------------------------ full-screen fade */

  /** Fade the whole screen to a colour (default night blue) or back. Resolves when done. */
  fade(toOpaque: boolean, ms = 500, color?: string): Promise<void> {
    if (color) this.fadeEl.style.background = color;
    this.fadeEl.style.transitionDuration = `${ms}ms`;
    void this.fadeEl.offsetWidth;
    this.fadeEl.classList.toggle('is-on', toOpaque);
    return new Promise((resolve) => window.setTimeout(resolve, ms + 20));
  }

  destroy(): void {
    for (const fn of this.disposers) fn();
    for (const m of [...this.modals]) m.close();
    this.el.remove();
  }
}
