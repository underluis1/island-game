import type { FunctionId, TestStatus } from '../../gameplay/repair/types';
import { mountDaySummary, type DaySummaryCallbacks, type DaySummaryProps } from '../day-summary';
import { mountDeliveryResult, type DeliveryResultCallbacks, type DeliveryResultProps } from '../delivery-result';
import { mountFinalTest, type FinalTestCallbacks, type FinalTestItem, type FinalTestProps } from '../final-test';
import { mountNightTransition, type NightTransitionCallbacks, type NightTransitionProps } from '../night-transition';
import { registerDemo, type DemoCtx } from './registry';

const FN_ORDER: FunctionId[] = [
  'power',
  'display',
  'touch',
  'trueTone',
  'biometric',
  'frontCamera',
  'rearCamera',
  'speaker',
  'earpiece',
  'microphone',
  'charging',
  'vibration',
  'wireless',
  'sim',
  'battery',
];

const items = (over: Partial<Record<FunctionId, TestStatus>> = {}, notes: Partial<Record<FunctionId, string>> = {}): FinalTestItem[] =>
  FN_ORDER.map((fn) => ({ fn, status: over[fn] ?? 'pass', note: notes[fn] }));

const instant = (ctx: DemoCtx): boolean => ctx.params.get('instant') === '1';

function finalTest(ctx: DemoCtx, props: FinalTestProps): void {
  const m = mountFinalTest(ctx.root.layers.panels, { ...props, instant: instant(ctx) }, ctx.spy<FinalTestCallbacks>());
  ctx.onCleanup(() => m.destroy(true));
}

function delivery(ctx: DemoCtx, props: DeliveryResultProps): void {
  const modal = ctx.root.openModal((parent) => mountDeliveryResult(parent, { ...props, instant: instant(ctx) }, ctx.spy<DeliveryResultCallbacks>({ onContinue: () => modal.close() })), {
    dismissible: false,
    backdrop: 'blur',
    silent: true,
  });
  ctx.onCleanup(() => modal.close());
}

function summary(ctx: DemoCtx, props: DaySummaryProps): void {
  const modal = ctx.root.openModal((parent) => mountDaySummary(parent, { ...props, instant: instant(ctx) }, ctx.spy<DaySummaryCallbacks>({ onNextDay: () => modal.close() })), {
    dismissible: false,
    backdrop: 'blur',
    silent: true,
  });
  ctx.onCleanup(() => modal.close());
}

function night(ctx: DemoCtx, props: NightTransitionProps): void {
  const m = mountNightTransition(
    ctx.root.layers.transition,
    { ...props, instant: instant(ctx), hold: instant(ctx) || ctx.params.get('hold') === '1' },
    ctx.spy<NightTransitionCallbacks>({
      onDone: () => {
        ctx.log('onDone');
        m.destroy(true);
      },
    }),
  );
  ctx.onCleanup(() => m.destroy(true));
}

registerDemo('finaltest', {
  title: 'Test finale',
  bg: 'bench',
  variants: {
    perfect: (ctx) => finalTest(ctx, { phoneName: 'Pear Fone X', customerName: 'Marco (backpacker)', items: items({ sim: 'na' }), issues: [], score: 0.98 }),
    issues: (ctx) =>
      finalTest(ctx, {
        phoneName: 'Pear Fone 12',
        customerName: 'Khun Noi',
        items: items(
          { trueTone: 'fail', biometric: 'degraded', speaker: 'degraded', vibration: 'fail', sim: 'na' },
          { trueTone: 'Display sostituito senza programmatore', vibration: 'Taptic Engine scollegato' },
        ),
        issues: [
          { kind: 'missingScrews', count: 2, severity: 2 },
          { kind: 'looseScrews', count: 1, severity: 1 },
          { kind: 'strippedScrews', count: 1, severity: 2 },
          { kind: 'leftoverParts', count: 1, text: 'Staffa del connettore display', severity: 3 },
          { kind: 'waterSeal', severity: 2 },
          { kind: 'dirty', severity: 1 },
          { kind: 'custom', text: 'Vite lunga nel foro sbagliato: scheda logica perforata', severity: 3, icon: 'part_board' },
        ],
        score: 0.46,
        deliverDisabled: undefined,
      }),
    running: (ctx) => finalTest(ctx, { phoneName: 'Pear Fone 8', customerName: 'Dive Dave', items: items({ charging: 'degraded' }), issues: [{ kind: 'looseScrews', count: 1, severity: 1 }], score: 0.84, stepMs: 900 }),
  },
});

registerDemo('delivery', {
  title: 'Risultato consegna',
  bg: 'beach',
  variants: {
    happy: (ctx) =>
      delivery(ctx, {
        customerName: 'Sofia Bianchi',
        customerType: 'Turista',
        phoneName: 'Pear Fone 12',
        jobLabel: 'Sostituzione schermo',
        payment: 3200,
        tip: 350,
        bonus: 120,
        partsCost: 1450,
        stars: 5,
        reviewText: 'Schermo come nuovo in meno di un’ora, e ho pure fatto in tempo a prendere il traghetto. Khop khun kha!',
        factors: [
          { text: 'Consegna in anticipo', positive: true, icon: 'clock' },
          { text: 'Tutte le funzioni OK', positive: true, icon: 'check_circle' },
          { text: 'Prezzo onesto', positive: true, icon: 'coin' },
          { text: 'Telefono pulitissimo', positive: true, icon: 'sparkle' },
        ],
        reputationBefore: 3.8,
        reputationAfter: 3.95,
      }),
    unhappy: (ctx) =>
      delivery(ctx, {
        customerName: 'Dive Dave',
        customerColor: '#3f8fd0',
        customerType: 'Istruttore di sub',
        phoneName: 'Pear Fone X',
        jobLabel: 'Danni da acqua salata',
        payment: 1800,
        tip: 0,
        partsCost: 900,
        stars: 2,
        reviewText: 'Si accende, ma il Face ID non va più e dentro tintinna una vite. Mi aspettavo di meglio.',
        factors: [
          { text: 'Face ID perso', positive: false, icon: 'fn_biometric' },
          { text: '2 viti mancanti', positive: false, icon: 'screw' },
          { text: 'In ritardo di 40 min', positive: false, icon: 'clock' },
          { text: 'Ricambio economico', positive: false, icon: 'tag' },
          { text: 'Si accende di nuovo', positive: true, icon: 'fn_power' },
        ],
        reputationBefore: 3.6,
        reputationAfter: 3.35,
      }),
    plain: (ctx) =>
      delivery(ctx, {
        customerName: 'Somsak',
        customerType: 'Locale',
        phoneName: 'Pear Fone 8',
        jobLabel: 'Pulizia porta di ricarica',
        payment: 400,
        tip: 0,
        stars: 3.5,
        reviewText: '',
        factors: [],
        reputationBefore: 2.5,
        reputationAfter: 2.5,
      }),
  },
});

const HISTORY = [
  { day: 6, net: 820, reputation: 2.9 },
  { day: 7, net: 1460, reputation: 3.1 },
  { day: 8, net: -380, reputation: 3.0 },
  { day: 9, net: 2150, reputation: 3.3 },
  { day: 10, net: 1720, reputation: 3.5 },
  { day: 11, net: 2980, reputation: 3.7 },
  { day: 12, net: 3410, reputation: 3.9 },
];

registerDemo('summary', {
  title: 'Resoconto giornaliero',
  bg: 'sunset',
  variants: {
    normal: (ctx) =>
      summary(ctx, {
        day: 12,
        shopName: 'Phi Phi Fix',
        income: [
          { label: 'Riparazioni', amount: 6400, count: 4, icon: 'tool_screwdriver' },
          { label: 'Telefoni usati venduti', amount: 2800, count: 1, icon: 'phone' },
          { label: 'Accessori', amount: 360, count: 3, icon: 'tag' },
        ],
        tips: 450,
        expenses: [
          { label: 'Ricambi ordinati', amount: 5200, icon: 'box' },
          { label: 'Consegna express', amount: 300, icon: 'bolt' },
          { label: 'Affitto del posto', amount: 800, icon: 'home' },
          { label: 'Elettricità', amount: 300, icon: 'bulb' },
        ],
        balance: 14790,
        reputation: 3.9,
        reputationDelta: 0.2,
        repairs: 4,
        customers: 6,
        reviews: [
          { customerName: 'Sofia Bianchi', stars: 5, text: 'Schermo come nuovo in meno di un’ora. Consigliatissimo!' },
          { customerName: 'Khun Noi', stars: 4.5, text: 'Veloce e gentile, prezzo giusto. Tornerò di sicuro.', customerColor: '#d8679b' },
          { customerName: 'Dive Dave', stars: 3, text: 'Funziona, ma l’altoparlante gracchia ancora un po’.', customerColor: '#3f8fd0' },
          { customerName: 'Marco', stars: 4, text: 'Batteria nuova, dura tutto il giorno. Grazie!' },
        ],
        history: HISTORY,
        saved: true,
      }),
    loan: (ctx) =>
      summary(ctx, {
        day: 8,
        shopName: 'Phi Phi Fix',
        income: [{ label: 'Riparazioni', amount: 900, count: 1, icon: 'tool_screwdriver' }],
        tips: 0,
        expenses: [
          { label: 'Ricambi ordinati', amount: 1650, icon: 'box' },
          { label: 'Rimborso al cliente', amount: 600, icon: 'user' },
          { label: 'Affitto del posto', amount: 400, icon: 'home' },
        ],
        balance: 500,
        reputation: 2.8,
        reputationDelta: -0.3,
        repairs: 1,
        customers: 3,
        reviews: [{ customerName: 'Hans', stars: 1.5, text: 'Ha perforato la scheda con una vite troppo lunga. Mai più.', customerColor: '#8d7bd8' }],
        history: HISTORY.slice(0, 3).map((d, i) => (i === 2 ? { ...d, net: -1750, reputation: 2.8 } : d)),
        loan: {
          lenderName: 'Zio Somchai',
          amount: 1500,
          quote: 'Mai pen rai, ragazzo! Ai miei tempi ho spanato più viti di quante ne abbia svitate. Tieni, ma domani offri tu il pad thai.',
          reputationLoss: 0.2,
        },
        saved: true,
      }),
    empty: (ctx) =>
      summary(ctx, {
        day: 2,
        shopName: 'Phi Phi Fix',
        income: [],
        tips: 0,
        expenses: [{ label: 'Affitto del posto', amount: 200, icon: 'home' }],
        balance: 1300,
        reputation: 2.5,
        reputationDelta: 0,
        repairs: 0,
        customers: 0,
        reviews: [],
        history: [
          { day: 1, net: 450, reputation: 2.5 },
          { day: 2, net: -200, reputation: 2.5 },
        ],
      }),
  },
});

registerDemo('night', {
  title: 'Transizione notte / cantiere',
  bg: 'night',
  variants: {
    night: (ctx) => night(ctx, { mode: 'night', day: 13 }),
    kiosk: (ctx) => night(ctx, { mode: 'build', building: 'kiosk', day: 19, shopName: 'Phi Phi Fix' }),
    shop: (ctx) => night(ctx, { mode: 'build', building: 'shop', day: 41, shopName: 'Phi Phi Fix' }),
    work: (ctx) => night(ctx, { mode: 'build', building: 'kiosk', day: 19, shopName: 'Phi Phi Fix' }),
  },
});
