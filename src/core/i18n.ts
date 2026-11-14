/**
 * i18n: every namespace is a JSON file in src/data/i18n/<lang>/<namespace>.json.
 * Keys are addressed as "namespace.path.to.key". Params use {name} placeholders.
 */
export type Lang = 'it' | 'en';

type Dict = Record<string, string>;

const modules = import.meta.glob('../data/i18n/*/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

const dicts: Record<Lang, Dict> = { it: {}, en: {} };

function flatten(prefix: string, node: unknown, out: Dict): void {
  if (typeof node === 'string') {
    out[prefix] = node;
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flatten(prefix ? `${prefix}.${k}` : k, v, out);
    }
  }
}

for (const [path, mod] of Object.entries(modules)) {
  const m = /i18n\/(\w+)\/([\w-]+)\.json$/.exec(path);
  if (!m) continue;
  const lang = m[1] as Lang;
  const ns = m[2] as string;
  if (!(lang in dicts)) continue;
  flatten(ns, mod.default ?? mod, dicts[lang]);
}

let current: Lang = 'it';
const listeners = new Set<() => void>();

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const fn of listeners) fn();
}

export function getLang(): Lang {
  return current;
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function hasKey(key: string, lang: Lang = current): boolean {
  return key in dicts[lang];
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? dicts.it[key] ?? dicts.en[key];
  if (s === undefined) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

/** All flattened keys for a language (used by tests to check it/en parity). */
export function allKeys(lang: Lang): string[] {
  return Object.keys(dicts[lang]);
}
