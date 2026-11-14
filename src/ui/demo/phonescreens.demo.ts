/** PearOS gallery: every phone screen state, notch (default) or home-button (?variant=home) layout. */
import { h } from '../dom';
import { drawPhoneScreen, PHONE_SCREEN_KINDS, type PhoneScreenState } from '../phone-screens';
import { registerDemo, type DemoCtx } from './registry';

function grid(notch: boolean): (ctx: DemoCtx) => void {
  return (ctx) => {
    const wrap = h('div', {
      style: 'position:absolute;inset:0;display:grid;grid-template-columns:repeat(7,1fr);gap:1.2rem 1rem;padding:1.6rem 2.2rem;align-content:center;justify-items:center',
    });
    const items = PHONE_SCREEN_KINDS.map((kind) => {
      const canvas = h('canvas', { width: 300, height: notch ? 650 : 534, style: `height:${notch ? 21 : 18.5}rem;border-radius:${notch ? 1.5 : 0.3}rem;box-shadow:0 0 0 .3rem #1a1d24,0 0 0 .4rem #c4c7cf,0 .8rem 1.6rem rgba(0,0,0,.5)` });
      const state: PhoneScreenState = { kind, notch, clock: '14:30', battery: 0.64 };
      if (kind.startsWith('test_')) state.result = kind === 'test_biometric' ? 'pass' : 'running';
      wrap.appendChild(h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:.5rem;color:#fdf3dc;font:700 .75rem var(--font)' }, canvas, kind));
      return { canvas, state };
    });
    ctx.root.layers.panels.appendChild(wrap);
    const freeze = Number(ctx.params.get('t') ?? 'NaN');
    ctx.loop((time) => {
      for (const it of items) {
        const c = it.canvas.getContext('2d');
        if (c) drawPhoneScreen(c, it.canvas.width, it.canvas.height, it.state, Number.isFinite(freeze) ? freeze : time);
      }
    });
    ctx.onCleanup(() => wrap.remove());
  };
}

registerDemo('phonescreens', { title: 'Schermate PearOS (canvas)', bg: 'dark', variants: { notch: grid(true), home: grid(false) } });
