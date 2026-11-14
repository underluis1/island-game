/** UI sound hook: the audio engine is injected by the game glue, the UI only names the cue. */
export type UiSound = 'ui_click' | 'ui_hover' | 'ui_open' | 'ui_close' | 'ui_tab' | 'error' | 'success';

export type SoundHook = (name: UiSound) => void;

let hook: SoundHook | null = null;

export function setSoundHook(fn: SoundHook | null): void {
  hook = fn;
}

/** Play a UI cue (no-op until a hook is installed). */
export function sfx(name: UiSound): void {
  hook?.(name);
}
