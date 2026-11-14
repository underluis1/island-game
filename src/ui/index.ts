/** Island Fix UI library — public entry point. See docs/notes/ui.md. */
export { UIRoot, type LayerName, type ModalHandle, type ModalOptions, type ToastKind, type ToastOptions } from './root';
export { setSoundHook, sfx, type SoundHook, type UiSound } from './sound';
export { defineView, rerenderAll, type Mounted, type View } from './view';
export { h, cx, morph, attach } from './dom';
export { icon, iconSvg, hasIcon, ICON_NAMES, type IconName } from './icons';
export * from './format';
export * from './widgets';
export { chart, type ChartOptions, type ChartSeries, type ChartTone } from './chart';

export * from './menus';
export * from './settings-panel';
export * from './hud';
export * from './hotbar';
export * from './gauges';
export * from './dialogue';
export * from './decor-mode';
export * from './customer-panel';
export * from './repair-panel';
export * from './part-tooltip';
export * from './part-picker';
export * from './final-test';
export * from './delivery-result';
export * from './day-summary';
export * from './night-transition';
export * from './tablet';
export { mountSolderGame, type SolderCallbacks, type SolderFault, type SolderGameHandle, type SolderProps, type SolderSfx } from './solder';
export { drawPhoneScreen, drawPearLogo, PHONE_SCREEN_KINDS, TOUCH_TEST_CELLS, type PhoneScreenKind, type PhoneScreenState, type PhoneTestResult } from './phone-screens';
