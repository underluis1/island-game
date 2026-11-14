import { getLang } from '../../core/i18n';
import { mountPartPicker, type PartPickerCallbacks, type PartPickerProps } from '../part-picker';
import { mountPartTooltip, type TipData } from '../part-tooltip';
import { mountRepairPanel, type RepairPanelCallbacks, type RepairPanelProps } from '../repair-panel';
import { registerDemo, type DemoCtx } from './registry';

const L = (it: string, en: string): string => (getLang() === 'it' ? it : en);

function panelProps(stage: 'start' | 'mid' | 'done'): RepairPanelProps {
  const done = stage === 'done';
  const mid = stage !== 'start';
  return {
    phone: { model: 'Pear Fone X', colorHex: '#4a4d55' },
    customer: { name: 'Marco', color: '#e58a3c' },
    deadline: { label: L('Entro le 18:00 · 2 h 10', 'By 18:00 · 2 h 10'), urgency: 'soon' },
    goals: [
      { id: 'g1', text: L('Scollega la batteria', 'Disconnect the battery'), done: mid, icon: 'part_connector' },
      { id: 'g2', text: L('Sostituisci la batteria', 'Replace the battery'), done, icon: 'fn_battery' },
      { id: 'g3', text: L('Pulisci la porta di ricarica', 'Clean the charge port'), done, icon: 'tool_brush' },
      { id: 'g4', text: L('Richiudi lo schermo con adesivo nuovo', 'Close the display with fresh adhesive'), done, icon: 'tool_adhesive' },
      { id: 'g5', text: L('Pulisci la scheda logica', 'Clean the logic board'), done: false, optional: true },
    ],
    mistakes:
      stage === 'start'
        ? []
        : [
            { id: 'm1', text: L('Batteria scollegata con il telefono acceso', 'Battery unplugged with the phone powered on'), severity: 2 },
            { id: 'm2', text: L('Vite Y000 spanata sulla staffa', 'Stripped Y000 screw on the bracket'), severity: 1 },
            ...(done ? [{ id: 'm3', text: L('Vite lunga nel foro corto: scheda forata', 'Long screw in a short hole: board pierced'), severity: 3 as const }] : []),
          ],
    screws: {
      held: stage === 'mid' ? { id: 's9', type: 'Y000', length: 1.2 } : null,
      mat: done
        ? []
        : mid
          ? [
              { id: 's1', type: 'P2', length: 6.7, cell: 0 },
              { id: 's2', type: 'P2', length: 6.7, cell: 1 },
              { id: 's3', type: 'Y000', length: 1.2, cell: 5 },
              { id: 's4', type: 'Y000', length: 1.2, cell: 6, stripped: true },
              { id: 's5', type: 'PH000', length: 2.7, cell: 7 },
              { id: 's6', type: 'SO', length: 3.1, cell: 12 },
            ]
          : [],
      matCells: 20,
      matCols: 5,
      bench: stage === 'mid' ? 1 : 0,
      lost: stage === 'mid' ? 1 : 0,
    },
    side: 'front',
    testBlocked: done ? undefined : L('Prima richiudi il telefono', 'Close the phone first'),
    keys: { flip: 'KeyV', back: 'KeyQ' },
  };
}

function mountPanel(ctx: DemoCtx, props: RepairPanelProps): void {
  const m = mountRepairPanel(ctx.root.layers.panels, props, ctx.spy<RepairPanelCallbacks>());
  ctx.onCleanup(() => m.destroy(true));
}

const tips = (): Array<{ data: TipData; x: number; y: number }> => [
  {
    x: 0.3,
    y: 0.12,
    data: {
      kind: 'part',
      name: L('Connettore di ricarica', 'Charge port assembly'),
      icon: 'fn_charging',
      condition: 'corroded',
      dirt: 0.62,
      corrosion: 0.35,
      hint: L('Trascina il pennello per pulire', 'Drag the brush to clean'),
    },
  },
  {
    x: 0.3,
    y: 0.5,
    data: {
      kind: 'part',
      name: L('Display OLED', 'OLED display'),
      icon: 'fn_display',
      condition: 'ok',
      quality: 'cheap',
      paired: false,
      fragile: true,
      blocked: L('Prima scollega la batteria!', 'Disconnect the battery first!'),
    },
  },
  {
    x: 0.56,
    y: 0.12,
    data: {
      kind: 'screw',
      type: 'Y000',
      length: 1.2,
      where: L('Staffa connettore batteria', 'Battery connector bracket'),
      hint: L('Tieni premuto per svitare (punta Y000)', 'Hold to unscrew (Y000 bit)'),
    },
  },
  {
    x: 0.56,
    y: 0.36,
    data: { kind: 'screw', type: 'P2', length: 6.7, stripped: true, where: L('Fondo scocca', 'Bottom edge'), blocked: L('Vite spanata: serve l\'estrattore', 'Stripped screw: you need the extractor') },
  },
  {
    x: 0.56,
    y: 0.62,
    data: { kind: 'part', name: L('Batteria', 'Battery'), icon: 'fn_battery', condition: 'damaged', swollen: true, health: 0.61, quality: 'factory', hint: L('Tira lentamente le linguette adesive', 'Pull the adhesive tabs slowly') },
  },
  { x: 0.8, y: 0.2, data: { kind: 'screw', type: 'SO', length: 3.1, loose: true } },
  { x: 0.8, y: 0.45, data: { kind: 'text', title: L('Tappetino magnetico', 'Magnetic mat'), text: L('Posa qui le viti: cella libera B3', 'Park screws here: free cell B3'), icon: 'tool_magmat' } },
  { x: 0.8, y: 0.66, data: { kind: 'part', name: 'Face ID', icon: 'fn_biometric', condition: 'ok', paired: true, quality: 'refurb' } },
];

function pickerProps(variant: 'stock' | 'order'): PartPickerProps {
  return {
    partName: L('Display', 'Display'),
    phoneModel: 'Pear Fone X',
    icon: 'fn_display',
    recommended: 'good',
    money: variant === 'order' ? 2600 : 8400,
    options: [
      { quality: 'cheap', stock: variant === 'order' ? 0 : 3, paidPrice: 890, orderPrice: 950, expressPrice: 1330, defectRisk: 0.18 },
      { quality: 'good', stock: variant === 'order' ? 0 : 1, paidPrice: 1750, orderPrice: 1800, expressPrice: 2520, defectRisk: 0.06, incoming: variant === 'order' ? 1 : 0 },
      { quality: 'refurb', stock: variant === 'order' ? 1 : 0, paidPrice: 3350, orderPrice: 3400, expressPrice: 4760, defectRisk: 0.01 },
    ],
    pairingNote:
      variant === 'order'
        ? L('True Tone salvato con il programmatore: verrà riscritto sul nuovo display.', 'True Tone saved with the programmer: it will be written to the new display.')
        : L('True Tone: senza programmatore chip i dati di calibrazione andranno persi.', 'True Tone: without the chip programmer the calibration data will be lost.'),
    pairingOk: variant === 'order',
  };
}

function openPicker(ctx: DemoCtx, props: PartPickerProps): void {
  const modal = ctx.root.openModal((el) => mountPartPicker(el, props, ctx.spy<PartPickerCallbacks>({ onCancel: () => modal.close() })), { silent: true });
}

registerDemo('repair', {
  title: 'Pannello riparazione, tooltip 3D, scelta ricambio',
  bg: 'bench',
  variants: {
    panel: (ctx) => mountPanel(ctx, panelProps('mid')),
    start: (ctx) => mountPanel(ctx, panelProps('start')),
    done: (ctx) => mountPanel(ctx, panelProps('done')),
    collapsed: (ctx) => {
      let props: RepairPanelProps = { ...panelProps('mid'), collapsed: true };
      const m = mountRepairPanel(
        ctx.root.layers.panels,
        props,
        ctx.spy<RepairPanelCallbacks>({
          onToggle: (collapsed) => {
            props = { ...props, collapsed };
            m.update(props);
          },
        }),
      );
      ctx.onCleanup(() => m.destroy(true));
    },
    tooltips: (ctx) => {
      const made = tips().map((tp) => {
        const tip = mountPartTooltip(ctx.root.layers.tooltip);
        tip.show(tp.data, window.innerWidth * tp.x, window.innerHeight * tp.y);
        return tip;
      });
      ctx.onCleanup(() => made.forEach((m) => m.destroy()));
    },
    follow: (ctx) => {
      mountPanel(ctx, panelProps('mid'));
      const tip = mountPartTooltip(ctx.root.layers.tooltip);
      const all = tips();
      let i = 0;
      let x = window.innerWidth / 2;
      let y = window.innerHeight / 2;
      const onMove = (ev: MouseEvent): void => {
        x = ev.clientX;
        y = ev.clientY;
      };
      const onDown = (): void => {
        i = (i + 1) % all.length;
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mousedown', onDown);
      ctx.loop(() => tip.show((all[i] as { data: TipData }).data, x, y));
      ctx.onCleanup(() => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mousedown', onDown);
        tip.destroy();
      });
    },
    picker: (ctx) => {
      mountPanel(ctx, panelProps('mid'));
      openPicker(ctx, pickerProps('stock'));
    },
    'picker-order': (ctx) => openPicker(ctx, pickerProps('order')),
  },
});
