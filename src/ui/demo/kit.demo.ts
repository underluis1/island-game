import { h } from '../dom';
import { ICON_NAMES, icon } from '../icons';
import { defineView } from '../view';
import {
  avatar,
  badge,
  bar,
  button,
  emptyState,
  field,
  money,
  panelHeader,
  pips,
  scroll,
  segmented,
  select,
  slider,
  stars,
  statRow,
  tabs,
  textInput,
  toggle,
} from '../widgets';
import { registerDemo } from './registry';

interface KitState {
  tab: string;
  seg: string;
  on: boolean;
  vol: number;
  name: string;
  sel: string;
}

const mountKit = defineView<Record<string, never>, { toast(kind: string): void }, KitState>({
  name: 'kit',
  state: () => ({ tab: 'a', seg: 'medium', on: true, vol: 0.6, name: 'Phi Phi Fix', sel: 'it' }),
  render: (v) =>
    h(
      'div',
      { class: 'panel demo-kit' },
      panelHeader({ title: 'Widget kit', icon: 'sparkle', subtitle: 'Pulsanti, controlli, indicatori' }),
      scroll(
        { class: 'demo-kit-cols' },
        h(
          'div',
          { class: 'col' },
          h('div', { class: 'section-title' }, 'Buttons'),
          h(
            'div',
            { class: 'row wrap' },
            button({ label: 'Primario', variant: 'primary', icon: 'check' }),
            button({ label: 'Accento', variant: 'accent' }),
            button({ label: 'Oro', variant: 'gold', icon: 'coin' }),
            button({ label: 'Secondario' }),
            button({ label: 'Ghost', variant: 'ghost' }),
            button({ label: 'Disabilitato', variant: 'primary', disabled: 'Ti serve il multimetro' }),
          ),
          h(
            'div',
            { class: 'row wrap' },
            button({ label: 'Grande', variant: 'primary', size: 'lg', iconEnd: 'arrow_right' }),
            button({ label: 'Piccolo', size: 'sm', icon: 'plus' }),
            button({ icon: 'gear', tip: 'Impostazioni' }),
            button({ label: 'Tablet', kbd: 'Tab', icon: 'tablet', badge: 3 }),
            button({ label: 'Attivo', active: true, icon: 'bulb' }),
          ),
          h(
            'div',
            { class: 'row wrap', style: 'padding: .8rem; border-radius: .8rem; background: linear-gradient(90deg,#19b7c4,#f4e3bd)' },
            button({ label: 'Tablet', variant: 'glass', icon: 'tablet', kbd: 'Tab' }),
            button({ variant: 'glass', icon: 'pause', tip: 'Pausa' }),
            button({ label: 'Guida', variant: 'glass', icon: 'bulb', active: true, kbd: 'KeyG' }),
            h('span', { class: 'glass', style: 'padding:.4rem .8rem' }, money(12450), ' ', stars(3.5)),
          ),
          h('div', { class: 'section-title' }, 'Tabs'),
          tabs({
            items: [
              { id: 'a', label: 'Strumenti', icon: 'tool_screwdriver' },
              { id: 'b', label: 'Ricambi', icon: 'box', badge: 2 },
              { id: 'c', label: 'Decorazioni', icon: 'decor' },
              { id: 'd', label: 'Bloccato', disabled: 'Sblocca il chiosco' },
            ],
            active: v.state.tab,
            onSelect: (tab) => v.set({ tab }),
          }),
          tabs({
            variant: 'underline',
            items: [
              { id: 'a', label: 'Ordini' },
              { id: 'b', label: 'Recensioni', badge: 4 },
              { id: 'c', label: 'Statistiche' },
            ],
            active: v.state.tab,
            onSelect: (tab) => v.set({ tab }),
          }),
          h('div', { class: 'section-title' }, 'Toast'),
          h(
            'div',
            { class: 'row wrap' },
            ...['info', 'success', 'warn', 'error', 'money', 'gameError'].map((k) => button({ label: k, size: 'sm', onClick: () => v.cb.toast(k) })),
          ),
          emptyState({ icon: 'tab_orders', title: 'Nessun ordine', text: 'I clienti arrivano lungo la spiaggia: clicca su di loro per ascoltare il problema.' }),
        ),
        h(
          'div',
          { class: 'col' },
          h('div', { class: 'section-title' }, 'Form'),
          field({
            label: 'Qualità grafica',
            hint: 'Rilevata automaticamente',
            icon: 'monitor',
            control: segmented({
              options: [
                { value: 'low', label: 'Basso' },
                { value: 'medium', label: 'Medio' },
                { value: 'high', label: 'Alto' },
                { value: 'ultra', label: 'Ultra' },
              ],
              value: v.state.seg,
              onChange: (seg) => v.set({ seg }),
            }),
          }),
          field({ label: 'Volume musica', icon: 'music', control: slider({ value: v.state.vol, onInput: (vol) => v.set({ vol }), format: (x) => `${Math.round(x * 100)}%` }) }),
          field({ label: 'Sottotitoli', icon: 'subtitles', control: toggle({ checked: v.state.on, onChange: (on) => v.set({ on }) }) }),
          field({
            label: 'Lingua',
            icon: 'globe',
            control: select({
              value: v.state.sel,
              options: [
                { value: 'it', label: 'Italiano' },
                { value: 'en', label: 'English' },
              ],
              onChange: (sel) => v.set({ sel }),
            }),
          }),
          field({ label: 'Nome del negozio', icon: 'shop', control: textInput({ value: v.state.name, onInput: (name) => v.set({ name }), maxLength: 24 }) }),
          h('div', { class: 'section-title' }, 'Indicatori'),
          h('div', { class: 'row wrap' }, stars(4.5, { size: 'lg' }), stars(2.5), stars(1, { size: 'sm' }), money(1250, { size: 'lg' }), money(-320, { tone: 'auto', signed: true }), money(80, { tone: 'auto', signed: true })),
          h('div', { class: 'row wrap' }, badge('Pronto', 'ok', 'check'), badge('In attesa', 'warn', 'hourglass'), badge('In ritardo', 'bad', 'warn'), badge('Express', 'info', 'bolt'), badge('Nuovo', 'teal'), badge('Livello 2', 'neutral'), pips(2), avatar({ name: 'Noi' }), avatar({ name: 'Somchai', size: 'lg', color: '#e58a3c' }), avatar({ name: 'x', icon: 'boat', size: 'sm' })),
          bar({ value: 0.62 }),
          bar({ value: 0.3, tone: 'coral', size: 'lg', zones: [{ from: 0.5, to: 0.8, tone: 'ok' }], marker: 0.65 }),
          h('div', { class: 'card', style: 'padding:.8rem 1rem' }, statRow('Riparazioni', money(3400)), statRow('Mance', money(260, { tone: 'auto', signed: true })), statRow('Affitto', money(-300, { tone: 'auto' }))),
          h('p', null, 'Testo con parola thai: ', h('span', { class: 'thai' }, 'sawasdee'), ' ', h('span', { class: 'thai-gloss' }, '(ciao)'), ' — ', h('span', { class: 'muted' }, 'testo secondario'), ' ', icon('heart')),
        ),
      ),
    ),
});

registerDemo('kit', {
  title: 'Widget kit',
  variants: {
    widgets: (ctx) => {
      const m = mountKit(
        ctx.root.layers.panels,
        {},
        {
          toast: (k) => {
            if (k === 'gameError') ctx.root.gameError('Prima scollega la batteria!', 'fn_battery');
            else if (k === 'money') ctx.root.toast({ kind: 'money', title: 'Pagamento ricevuto', text: 'Fone X · batteria', amount: 1450 });
            else ctx.root.toast({ kind: k as 'info', title: 'Notifica', text: 'Mr. Chai ha consegnato 3 ricambi.' });
          },
        },
      );
      ctx.onCleanup(() => m.destroy(true));
      if (ctx.params.get('toasts') === '1') {
        ctx.root.toast({ kind: 'info', text: 'Mr. Chai arriva domattina con i ricambi.', duration: 60000 });
        ctx.root.toast({ kind: 'success', title: 'Riparazione completata', text: 'Fone 8 pronto per la consegna.', duration: 60000 });
        ctx.root.toast({ kind: 'error', text: 'Rack pieno: consegna un telefono prima.', duration: 60000 });
        ctx.root.toast({ kind: 'money', title: 'Pagamento ricevuto', text: 'Fone X · batteria', amount: 1450, duration: 60000 });
        ctx.root.gameError('Prima scollega la batteria!', 'fn_battery', 60000);
      }
    },
    icons: (ctx) => {
      const el = h(
        'div',
        { class: 'panel demo-kit' },
        panelHeader({ title: `Icone (${ICON_NAMES.length})`, icon: 'sparkle' }),
        scroll({ class: 'demo-icons' }, ICON_NAMES.map((n) => h('div', { class: 'demo-icon' }, icon(n), n))),
      );
      ctx.root.layers.panels.appendChild(el);
      ctx.onCleanup(() => el.remove());
    },
  },
});
