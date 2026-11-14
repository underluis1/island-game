import type { Lang } from './i18n';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export type KeyAction =
  | 'tablet'
  | 'pause'
  | 'focus'
  | 'guide'
  | 'rotate'
  | 'back'
  | 'flip'
  | 'decor';

export interface Settings {
  version: number;
  lang: Lang;
  quality: QualityLevel;
  benchmarkDone: boolean;
  volume: { master: number; music: number; ambience: number; sfx: number; voice: number };
  textScale: number;
  subtitles: boolean;
  reduceMotion: boolean;
  guide: boolean;
  keys: Record<KeyAction, string>;
}

const KEY = 'islandfix.settings.v1';

export const DEFAULT_KEYS: Record<KeyAction, string> = {
  tablet: 'Tab',
  pause: 'Escape',
  focus: 'KeyF',
  guide: 'KeyG',
  rotate: 'KeyR',
  back: 'KeyQ',
  flip: 'KeyV',
  decor: 'KeyB',
};

export function defaultSettings(): Settings {
  return {
    version: 1,
    lang: 'it',
    quality: 'medium',
    benchmarkDone: false,
    volume: { master: 0.8, music: 0.6, ambience: 0.7, sfx: 0.9, voice: 0.8 },
    textScale: 1,
    subtitles: true,
    reduceMotion: false,
    guide: true,
    keys: { ...DEFAULT_KEYS },
  };
}

export function loadSettings(): Settings {
  const def = defaultSettings();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...def,
      ...parsed,
      volume: { ...def.volume, ...(parsed.volume ?? {}) },
      keys: { ...def.keys, ...(parsed.keys ?? {}) },
    };
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings stay in memory */
  }
}
