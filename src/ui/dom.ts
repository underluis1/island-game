/**
 * Tiny DOM toolkit: hyperscript `h()` + a keyed DOM morph.
 *
 * Components render a fresh element tree from their props; `morph()` patches the live tree in place,
 * so scroll positions, focus, CSS animations and hover states survive every update.
 */

export type Child = Node | string | number | null | undefined | false | Child[];

type Handler = (ev: Event) => void;

/** Called with the *live* element after every render (first = element just created). */
export type Hook<E extends Element = HTMLElement> = (el: E, first: boolean) => void;

export interface Props {
  class?: string | false | null;
  style?: string | Record<string, string | number | null | undefined | false>;
  /** stable identity among siblings (lists that reorder / insert) */
  key?: string | number;
  /** raw inner HTML (used for inline SVG) */
  html?: string;
  /** the subtree is managed imperatively: morph keeps the live children untouched */
  keep?: boolean;
  hook?: Hook<never>;
  dataset?: Record<string, string | number | boolean | null | undefined>;
  [attr: string]: unknown;
}

interface Managed extends Element {
  __on?: Record<string, Handler>;
  __ls?: Set<string>;
  __hook?: Hook<never>;
  __live?: Element;
  __born?: boolean;
}

let pendingHooks: Managed[] = [];

function dispatch(this: Managed, ev: Event): void {
  this.__on?.[ev.type]?.call(this, ev);
}

function listen(el: Managed, type: string): void {
  if (!el.__ls) el.__ls = new Set();
  if (el.__ls.has(type)) return;
  el.__ls.add(type);
  el.addEventListener(type, dispatch, type === 'wheel' || type === 'touchstart' ? { passive: true } : undefined);
}

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(parent, c);
  } else if (child instanceof Node) {
    parent.appendChild(child);
  } else {
    parent.appendChild(document.createTextNode(String(child)));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag) as HTMLElementTagNameMap[K] & Managed;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else {
          for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
            if (sv === null || sv === undefined || sv === false) continue;
            el.style.setProperty(sk, String(sv));
          }
        }
      } else if (k === 'key') el.setAttribute('data-key', String(v));
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'keep') el.setAttribute('data-keep', '');
      else if (k === 'hook') {
        el.__hook = v as Hook<never>;
        pendingHooks.push(el);
      } else if (k === 'dataset') {
        for (const [dk, dv] of Object.entries(v as Record<string, unknown>)) {
          if (dv === null || dv === undefined || dv === false) continue;
          el.setAttribute(`data-${dk}`, String(dv));
        }
      } else if (k.startsWith('on') && typeof v === 'function') {
        const type = k.slice(2).toLowerCase();
        (el.__on ??= {})[type] = v as Handler;
        listen(el, type);
      } else if (k === 'value' && 'value' in el) {
        (el as unknown as HTMLInputElement).value = String(v);
        el.setAttribute('value', String(v));
      } else if (k === 'checked' && 'checked' in el) {
        (el as unknown as HTMLInputElement).checked = Boolean(v);
        if (v) el.setAttribute('checked', '');
      } else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) append(el, c);
  return el;
}

/** Join class names, skipping falsy entries. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  let out = '';
  for (const p of parts) if (p) out += out ? ` ${p}` : p;
  return out;
}

const keyOf = (n: Node): string | null => (n.nodeType === 1 ? (n as Element).getAttribute('data-key') : null);

function compatible(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  const ea = a as Element;
  const eb = b as Element;
  return ea.tagName === eb.tagName && ea.getAttribute('data-ic') === eb.getAttribute('data-ic');
}

function syncAttrs(live: Element, next: Element): void {
  for (const a of Array.from(live.attributes)) {
    if (!next.hasAttribute(a.name)) live.removeAttribute(a.name);
  }
  for (const a of Array.from(next.attributes)) {
    if (live.getAttribute(a.name) !== a.value) live.setAttribute(a.name, a.value);
  }
}

function morphNode(live: Node, next: Node): void {
  if (live.nodeType !== 1) {
    if (live.nodeValue !== next.nodeValue) live.nodeValue = next.nodeValue;
    return;
  }
  const a = live as Managed;
  const b = next as Managed;
  b.__live = a;
  a.__on = b.__on;
  if (b.__on) for (const type of Object.keys(b.__on)) listen(a, type);
  a.__hook = b.__hook;
  syncAttrs(a, b);
  if (a instanceof HTMLInputElement && b instanceof HTMLInputElement) {
    if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.checked;
    else if (a.value !== b.value && !(document.activeElement === a && a.type === 'text')) a.value = b.value;
  } else if (a instanceof HTMLSelectElement && b instanceof HTMLSelectElement) {
    morphChildren(a, b);
    a.value = b.value;
    return;
  }
  if (a.hasAttribute('data-keep') || a.hasAttribute('data-ic')) return;
  morphChildren(a, b);
}

function morphChildren(live: Element, next: Element): void {
  let keyed: Map<string, Element> | null = null;
  for (let c = live.firstChild; c; c = c.nextSibling) {
    const k = keyOf(c);
    if (k !== null) (keyed ??= new Map()).set(k, c as Element);
  }
  let cursor: ChildNode | null = live.firstChild;
  for (const nc of Array.from(next.childNodes)) {
    let match: ChildNode | null = null;
    const k = keyOf(nc);
    if (k !== null) {
      const m = keyed?.get(k);
      if (m && compatible(m, nc)) {
        match = m;
        keyed?.delete(k);
      }
    } else {
      let c = cursor;
      while (c && keyOf(c) !== null) c = c.nextSibling;
      if (c && compatible(c, nc)) match = c;
    }
    if (match) {
      if (match === cursor) cursor = cursor.nextSibling;
      else live.insertBefore(match, cursor);
      morphNode(match, nc);
    } else {
      live.insertBefore(nc, cursor);
    }
  }
  while (cursor) {
    const n: ChildNode | null = cursor.nextSibling;
    live.removeChild(cursor);
    cursor = n;
  }
}

function runHooks(): void {
  const list = pendingHooks;
  pendingHooks = [];
  for (const el of list) {
    const live = (el.__live ?? el) as Managed;
    if (!live.isConnected || !live.__hook) continue;
    const first = !live.__born;
    live.__born = true;
    (live.__hook as Hook<Element>)(live, first);
  }
}

/**
 * Patch `live` so it matches `next` (which is consumed). Returns the element now in the document
 * (`live`, or `next` when the root tag changed).
 */
export function morph<E extends Element>(live: E, next: E): E {
  let out = live;
  if (!compatible(live, next) || keyOf(live) !== keyOf(next)) {
    live.replaceWith(next);
    out = next;
  } else {
    morphNode(live, next);
  }
  runHooks();
  return out;
}

/** Run the `hook` props of a freshly created tree once it is attached to the document. */
export function attach<E extends Element>(parent: Element, el: E): E {
  parent.appendChild(el);
  runHooks();
  return el;
}

/** Remove every child. */
export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
