import { DEFAULT_KEYS } from '../../core/settings';
import type { ScrewType } from '../../gameplay/repair/types';
import { mountGauge, type GaugeSpec } from '../gauges';
import { mountHotbar, type HotbarProps, type HotbarTool } from '../hotbar';
import { mountHud, type HudCallbacks, type HudProps } from '../hud';
import { registerDemo, type DemoCtx } from './registry';

const TOOLS: HotbarTool[] = [
  { id: 'hand', name: 'Mano', icon: 'tool_hand', tier: 1, maxTier: 1, state: 'ok' },
  { id: 'screwdriver', name: 'Cacciavite di precisione', icon: 'tool_screwdriver', tier: 2, state: 'ok' },
  { id: 'suction', name: 'Ventosa', icon: 'tool_suction', tier: 1, state: 'ok' },
  { id: 'pick', name: 'Plettro di apertura', icon: 'tool_pick', tier: 1, state: 'ok' },
  { id: 'spudger', name: 'Spudger', icon: 'tool_spudger', tier: 2, state: 'ok', suggested: true },
  { id: 'heatgun', name: 'Pistola termica', icon: 'tool_heatgun', tier: 1, state: 'ok' },
  { id: 'brush', name: 'Pennellino antistatico', icon: 'tool_brush', tier: 1, state: 'ok' },
  { id: 'ipa', name: 'Alcol isopropilico', icon: 'tool_ipa', tier: 1, state: 'disabled', reason: 'Finito: ordinalo dal catalogo' },
  { id: 'multimeter', name: 'Multimetro USB', icon: 'tool_multimeter', tier: 0, state: 'missing' },
  { id: 'tweezers', name: 'Pinzette', icon: 'tool_tweezers', tier: 1, state: 'ok' },
  { id: 'air', name: 'Aria compressa', icon: 'tool_air', tier: 1, state: 'ok' },
];

function hudProps(repair: boolean): HudProps {
  return {
    money: 12450,
    reputation: 3.5,
    day: 12,
    time: repair ? 16.75 : 14.5,
    weather: 'clear',
    keys: DEFAULT_KEYS,
    orders: [
      { id: 'o1', model: 'Fone X', customer: 'Noi', deadlineText: '18:00', minutesLeft: 200, status: 'ready' },
      { id: 'o2', model: 'Fone 8', customer: 'Marco', deadlineText: '40 min', minutesLeft: 40, status: 'in_progress', active: repair },
      { id: 'o3', model: 'Fone X', customer: 'Kai, istruttore sub', deadlineText: 'domani', minutesLeft: 900, status: 'waiting_parts' },
      { id: 'o4', model: 'Fone 8', customer: 'Mrs. Anderson', deadlineText: '1 h 50', minutesLeft: 110, status: 'queued' },
    ],
    buttons: repair
      ? [{ id: 'back' }, { id: 'flip' }, { id: 'guide', active: true }, { id: 'test', disabled: 'Richiudi il telefono prima del test' }, { id: 'tablet', badge: 2 }, { id: 'pause' }]
      : [{ id: 'tablet', badge: 2, highlight: true }, { id: 'decor' }, { id: 'guide', active: true }, { id: 'pause' }],
    tool: repair ? { name: 'Cacciavite di precisione', icon: 'tool_screwdriver', tier: 2, detail: 'Punta P2' } : null,
    objective: repair
      ? { text: 'Scollega la batteria con lo spudger prima di toccare gli altri connettori.', icon: 'tool_spudger', step: '7 / 18', progress: 0.38 }
      : { title: 'Suggerimento', text: 'Un cliente ti aspetta al banco: clicca su di lui.', icon: 'user' },
    prompt: repair ? { text: 'Tieni premuto per svitare', progress: 0.62 } : { text: 'Clicca sul tappetino per metterti al lavoro', kbd: 'mouse' },
  };
}

function mount(ctx: DemoCtx, repair: boolean, gauge?: GaugeSpec): void {
  let props = hudProps(repair);
  const hud = mountHud(ctx.root.layers.hud, props, ctx.spy<HudCallbacks>());
  let hb: HotbarProps = { tools: TOOLS, selectedId: repair ? 'screwdriver' : 'hand', bits: repair ? { options: ['P2', 'Y000', 'PH000', 'SO'], selected: 'P2', suggested: 'Y000' } : null };
  const hotbar = mountHotbar(ctx.root.layers.hud, hb, {
    onSelect: (id) => {
      ctx.log('onSelect', id);
      hb = { ...hb, selectedId: id, bits: id === 'screwdriver' ? { options: ['P2', 'Y000', 'PH000', 'SO'], selected: 'P2' } : null };
      hotbar.update(hb);
    },
    onSelectBit: (bit: ScrewType) => {
      ctx.log('onSelectBit', bit);
      if (hb.bits) hb = { ...hb, bits: { ...hb.bits, selected: bit } };
      hotbar.update(hb);
    },
  });
  ctx.onCleanup(() => {
    hud.destroy(true);
    hotbar.destroy(true);
  });
  if (ctx.params.get('money') === '1') {
    window.setTimeout(() => {
      props = { ...props, money: props.money + 1450 };
      hud.update(props);
    }, 500);
  }
  if (gauge) {
    const g = mountGauge(ctx.root.layers.hud, gauge);
    ctx.loop((time) => {
      const k = 0.5 + 0.5 * Math.sin(time * 1.3);
      if (gauge.kind === 'temperature') g.update({ value: 30 + k * 85 });
      else if (gauge.kind === 'multimeter') g.update({ value: 0.2 + k * 1.1, volts: 5.02 });
      else if (gauge.kind === 'battery') g.update({ value: 0.74, cycles: 812 });
      else g.update({ value: k * 0.95, progress: (time * 0.2) % 1 });
    });
    ctx.onCleanup(() => g.destroy());
  }
}

function allGauges(ctx: DemoCtx): void {
  const specs: GaugeSpec[] = [
    { kind: 'torque', mode: 'screw', green: [0.5, 0.78] },
    { kind: 'torque', mode: 'unscrew', green: [0.3, 0.85] },
    { kind: 'temperature', min: 20, max: 130, ideal: [70, 90], danger: 105 },
    { kind: 'tension', safe: 0.62 },
    { kind: 'pick', danger: 0.7 },
    { kind: 'clean' },
    { kind: 'multimeter' },
    { kind: 'battery' },
  ];
  const vals = [0.64, 0.12, 82, 0.7, 0.45, 0.63, 0.42, 0.74];
  specs.forEach((spec, i) => {
    const g = mountGauge(ctx.root.layers.hud, spec);
    g.setAnchor(90 + (i % 4) * (window.innerWidth / 4.2), 330 + Math.floor(i / 4) * 260);
    const base = vals[i] as number;
    ctx.loop((time) => {
      const animate = ctx.params.get('still') !== '1';
      const w = animate ? Math.sin(time * 1.2 + i) * 0.5 + 0.5 : -1;
      if (spec.kind === 'temperature') g.update({ value: w < 0 ? base : 30 + w * 90 });
      else if (spec.kind === 'multimeter') g.update({ value: w < 0 ? base : w * 2.4, volts: 5.02 });
      else if (spec.kind === 'battery') g.update({ value: base, cycles: 812 });
      else g.update({ value: w < 0 ? base : w, progress: w < 0 ? 0.6 : (time * 0.15) % 1, risky: i === 4 });
    });
    ctx.onCleanup(() => g.destroy());
  });
}

registerDemo('hud', {
  title: 'HUD + hotbar + gauge',
  variants: {
    stall: (ctx) => mount(ctx, false),
    repair: (ctx) => {
      ctx.setBg('bench');
      mount(ctx, true, { kind: 'torque', mode: 'unscrew', green: [0.3, 0.85] });
    },
    heat: (ctx) => {
      ctx.setBg('bench');
      mount(ctx, true, { kind: 'temperature', min: 20, max: 130, ideal: [70, 90], danger: 105 });
    },
    gauges: (ctx) => {
      ctx.setBg('bench');
      allGauges(ctx);
    },
  },
});
