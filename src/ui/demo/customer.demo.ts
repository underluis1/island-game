import { getLang } from '../../core/i18n';
import {
  mountCustomerPanel,
  type Clue,
  type CustomerPanelCallbacks,
  type CustomerPanelProps,
  type DiagnosisOption,
} from '../customer-panel';
import { registerDemo, type DemoCtx } from './registry';

const L = (it: string, en: string): string => (getLang() === 'it' ? it : en);

function options(marks: Array<DiagnosisOption['mark']>): DiagnosisOption[] {
  return [
    {
      id: 'battery',
      label: L('Batteria esausta', 'Worn-out battery'),
      detail: L('Sostituzione batteria', 'Battery replacement'),
      mark: marks[0],
      parts: [{ name: L('Batteria Fone X', 'Fone X battery'), icon: 'fn_battery', stock: 2 }],
      quote: { min: 400, max: 2600, step: 10, fairFrom: 1100, fairTo: 1500, suggested: 1300, partsCost: 520 },
    },
    {
      id: 'port',
      label: L('Porta di ricarica sporca', 'Clogged charge port'),
      detail: L('Pulizia della porta, nessun ricambio', 'Port cleaning, no parts'),
      mark: marks[1],
      parts: [],
      quote: { min: 100, max: 1200, step: 10, fairFrom: 300, fairTo: 500, suggested: 400, partsCost: 0 },
    },
    {
      id: 'chargeic',
      label: L('Chip di ricarica guasto', 'Faulty charge IC'),
      detail: L('Microsaldatura sulla scheda logica', 'Micro-soldering on the logic board'),
      mark: marks[2],
      parts: [{ name: L('Chip di ricarica "Tigris"', '"Tigris" charge IC'), icon: 'part_chip', stock: 0 }],
      quote: { min: 1200, max: 5200, step: 10, fairFrom: 2600, fairTo: 3400, suggested: 3000, partsCost: 380 },
    },
    {
      id: 'water',
      label: L('Danni da acqua salata', 'Salt-water damage'),
      detail: L('Pulizia corrosione e connettori', 'Corrosion and connector cleaning'),
      mark: marks[3],
      parts: [{ name: L('Connettore di ricarica Fone X', 'Fone X charge port'), icon: 'fn_charging', stock: 0, incoming: true }],
      quote: { min: 600, max: 3600, step: 10, fairFrom: 1500, fairTo: 2100, suggested: 1800, partsCost: 450 },
    },
  ];
}

const clues = (): Clue[] => [
  { id: 'c1', source: 'inspect', text: L('Nessuna crepa, porta di ricarica pulita.', 'No cracks, charge port is clean.'), tone: 'ok' },
  { id: 'c2', source: 'multimeter', text: L('In carica assorbe pochissimo.', 'Draws almost nothing while charging.'), value: L('0,08 A', '0.08 A'), tone: 'warn' },
  { id: 'c3', source: 'batteryTester', text: L('Salute batteria molto bassa, 912 cicli.', 'Battery health very low, 912 cycles.'), value: '61%', tone: 'bad' },
];

function base(): CustomerPanelProps {
  return {
    customer: { name: 'Marco', typeLabel: L('Backpacker italiano', 'Italian backpacker'), color: '#e58a3c', patience: 0.78 },
    complaint: L(
      'Si spegne al 30% e la sera non arriva mai. Domani parto per Krabi, mi serve per le foto!',
      'It dies at 30% and never lasts until the evening. I leave for Krabi tomorrow, I need it for photos!',
    ),
    phone: { model: 'Pear Fone X', colorName: L('Grigio siderale', 'Space grey'), colorHex: '#4a4d55' },
    deadline: { label: L('Entro le 18:00', 'By 18:00'), urgency: 'soon', note: L('Ha il traghetto', 'Has a ferry to catch') },
    actions: [
      { id: 'inspect', state: 'ready' },
      { id: 'multimeter', state: 'ready' },
      { id: 'batteryTester', state: 'locked', reason: L('Ti serve il tester batterie', 'You need the battery tester') },
      { id: 'psu', state: 'locked', reason: L('Ti serve l\'alimentatore da banco', 'You need the bench power supply') },
    ],
    clues: [],
    options: options(['none', 'none', 'none', 'none']),
  };
}

function mount(ctx: DemoCtx, props: CustomerPanelProps): void {
  let cur = props;
  const m = mountCustomerPanel(
    ctx.root.layers.panels,
    cur,
    ctx.spy<CustomerPanelCallbacks>({
      onDiagnose: (id) => {
        ctx.log('onDiagnose', id);
        const all = clues();
        const next = all.find((c) => c.source === id) ?? all[0];
        cur = {
          ...cur,
          actions: cur.actions.map((a) => (a.id === id ? { ...a, state: 'done' as const } : a)),
          clues: next && !cur.clues.some((c) => c.id === next.id) ? [...cur.clues, next] : cur.clues,
        };
        m.update(cur);
      },
    }),
  );
  ctx.onCleanup(() => m.destroy(true));
}

registerDemo('customer', {
  title: 'Pannello cliente',
  bg: 'beach',
  variants: {
    fresh: (ctx) => mount(ctx, base()),
    clues: (ctx) =>
      mount(ctx, {
        ...base(),
        actions: [
          { id: 'inspect', state: 'done' },
          { id: 'multimeter', state: 'done' },
          { id: 'batteryTester', state: 'done' },
          { id: 'psu', state: 'locked', reason: L('Ti serve l\'alimentatore da banco', 'You need the bench power supply') },
        ],
        clues: clues(),
        options: options(['confirmed', 'excluded', 'likely', 'excluded']),
        selected: 'battery',
      }),
    pricey: (ctx) =>
      mount(ctx, {
        ...base(),
        customer: { name: 'Khun Noi', typeLabel: L('Proprietaria del bar accanto', 'Owner of the bar next door'), color: '#d8679b', patience: 0.45 },
        deadline: undefined,
        actions: [
          { id: 'inspect', state: 'done' },
          { id: 'multimeter', state: 'busy' },
          { id: 'batteryTester', state: 'ready' },
          { id: 'psu', state: 'ready' },
        ],
        clues: clues().slice(0, 2),
        options: options(['likely', 'excluded', 'likely', 'none']),
        selected: 'chargeic',
        reaction: 'outrage',
      }),
    counter: (ctx) =>
      mount(ctx, {
        ...base(),
        customer: { name: 'Dave', typeLabel: L('Istruttore di sub', 'Dive instructor'), color: '#3f8fd0', patience: 0.22 },
        deadline: { label: L('Entro 40 min', 'Within 40 min'), urgency: 'urgent' },
        actions: base().actions.map((a) => ({ ...a, state: a.state === 'ready' ? ('done' as const) : a.state })),
        clues: clues().slice(0, 2),
        options: options(['likely', 'excluded', 'none', 'likely']),
        selected: 'water',
        counter: {
          price: 1650,
          yourPrice: 2300,
          text: L('"È un po\' tanto, amico. Ci vengo ogni mese qui!"', '"That\'s a bit steep, mate. I\'m here every month!"'),
        },
      }),
    rackfull: (ctx) =>
      mount(ctx, {
        ...base(),
        clues: clues().slice(0, 1),
        actions: base().actions.map((a) => (a.id === 'inspect' ? { ...a, state: 'done' as const } : a)),
        options: options(['likely', 'none', 'none', 'none']),
        selected: 'battery',
        rackFull: true,
      }),
  },
});
