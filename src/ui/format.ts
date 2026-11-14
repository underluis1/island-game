/** Pure formatters (no DOM): unit-tested in tests/unit/ui-format.test.ts. */
import { getLang, t, type Lang } from '../core/i18n';

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Integer with thousands separators: 1.250 (it) / 1,250 (en). */
export function formatNumber(n: number, lang: Lang = getLang()): string {
  const neg = n < 0;
  const digits = String(Math.abs(Math.round(n)));
  const sep = lang === 'it' ? '.' : ',';
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += sep;
    out += digits[i];
  }
  return neg ? `−${out}` : out;
}

/** Baht amount: "฿ 1.250", "−฿ 80"; `signed` adds an explicit "+" to gains. */
export function formatMoney(amount: number, opts: { signed?: boolean; lang?: Lang } = {}): string {
  const n = Math.round(amount);
  const body = `฿ ${formatNumber(Math.abs(n), opts.lang)}`;
  if (n < 0) return `−${body}`;
  return opts.signed && n > 0 ? `+${body}` : body;
}

/** Game time in hours [0, 24) → "14:30". */
export function formatClock(hours: number): string {
  const total = Math.floor((((hours % 24) + 24) % 24) * 60 + 1e-6);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Duration in game minutes → "45 min", "2 h", "2 h 05". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${hh} h` : `${hh} h ${String(mm).padStart(2, '0')}`;
}

/** Seconds → "0:42" / "3:07" (minigame timers). */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatPercent(v01: number): string {
  return `${Math.round(clamp01(v01) * 100)}%`;
}

/** Decimal with the locale separator: 4,6 (it) / 4.6 (en). */
export function formatDecimal(v: number, digits = 1, lang: Lang = getLang()): string {
  const s = v.toFixed(digits);
  return lang === 'it' ? s.replace('.', ',') : s;
}

export function formatTemp(celsius: number): string {
  return `${Math.round(celsius)} °C`;
}

export function formatAmps(amps: number, lang: Lang = getLang()): string {
  return `${formatDecimal(amps, 2, lang)} A`;
}

export function formatMm(mm: number, lang: Lang = getLang()): string {
  return `${formatDecimal(mm, 1, lang)} mm`;
}

export type StarFill = 'full' | 'half' | 'empty';

/** 3.7 → full full full half empty (rounded to the nearest half star). */
export function starParts(value: number, max = 5): StarFill[] {
  const halves = Math.round(clamp(value, 0, max) * 2);
  const out: StarFill[] = [];
  for (let i = 0; i < max; i++) {
    const rest = halves - i * 2;
    out.push(rest >= 2 ? 'full' : rest === 1 ? 'half' : 'empty');
  }
  return out;
}

const KEY_NAMES: Record<string, string> = {
  Escape: 'Esc',
  Tab: 'Tab',
  Enter: '↵',
  Backspace: '⌫',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  CapsLock: 'Caps',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`',
};

/** KeyboardEvent.code → short label for key caps: "KeyF" → "F", "Digit3" → "3", "Space" → "Spazio". */
export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  if (code === 'Space') return t('ui.key.space');
  if (code === 'Delete') return t('ui.key.delete');
  return KEY_NAMES[code] ?? code;
}

/** Urgency bucket of a deadline, used for colours: minutes left → level. */
export type Urgency = 'calm' | 'soon' | 'urgent' | 'late';
export function urgencyOf(minutesLeft: number): Urgency {
  if (minutesLeft <= 0) return 'late';
  if (minutesLeft <= 45) return 'urgent';
  if (minutesLeft <= 120) return 'soon';
  return 'calm';
}

/** First letter for avatar circles (handles empty names). */
export function initialOf(name: string): string {
  const ch = Array.from(name.trim())[0];
  return ch ? ch.toUpperCase() : '?';
}

/** Deterministic pleasant colour from a string (avatars without an explicit colour). */
export function colorFromString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  const palette = ['#18b8b0', '#ff6f59', '#ffc145', '#8d7bd8', '#4fb86a', '#e58a3c', '#3f8fd0', '#d8679b'];
  return palette[Math.abs(hash) % palette.length] as string;
}
