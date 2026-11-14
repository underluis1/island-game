import { mountTablet, type BuyQuality, type CatalogTab, type PartOfferVM, type PartRowVM, type TabletCallbacks, type TabletProps, type TabletTab } from '../tablet';
import { registerDemo, type DemoCtx } from './registry';

const offer = (price: number, stock: number, incoming = 0): PartOfferVM => ({ price, expressPrice: Math.round(price * 1.35), stock, incoming });
const MODELS = [
  { id: 'fone8', name: 'Pear Fone 8' },
  { id: 'fonex', name: 'Pear Fone X' },
  { id: 'fone12', name: 'Pear Fone 12', locked: 'Reputazione 3★' },
  { id: 'fone14', name: 'Pear Fone 14', locked: 'Reputazione 4★' },
];
const CATS = [
  { id: 'display', name: 'Schermo', icon: 'fn_display', base: 900 },
  { id: 'battery', name: 'Batteria', icon: 'fn_battery', base: 350 },
  { id: 'charge_port', name: 'Porta di ricarica', icon: 'fn_charging', base: 260 },
  { id: 'speaker', name: 'Altoparlante', icon: 'fn_speaker', base: 180 },
  { id: 'taptic', name: 'Motore di vibrazione', icon: 'fn_vibration', base: 220 },
  { id: 'rear_camera', name: 'Fotocamera posteriore', icon: 'fn_rearCamera', base: 620 },
  { id: 'front_sensor', name: 'Sensori frontali', icon: 'fn_frontCamera', base: 480 },
  { id: 'earpiece', name: 'Capsula auricolare', icon: 'fn_earpiece', base: 150 },
  { id: 'back_glass', name: 'Vetro posteriore', icon: 'phone', base: 400 },
];
const rows: PartRowVM[] = MODELS.slice(0, 2).flatMap((m, mi) =>
  CATS.map((c, ci) => ({
    modelId: m.id,
    categoryId: c.id,
    name: `${c.name} · ${m.name}`,
    icon: c.icon,
    offers: {
      cheap: offer(Math.round(c.base * (0.55 + mi * 0.2)), ci % 3 === 0 ? 2 : 0),
      good: offer(Math.round(c.base * (1 + mi * 0.3)), ci % 2, ci === 1 ? 2 : 0),
      refurb: offer(Math.round(c.base * (1.7 + mi * 0.4)), ci === 0 ? 1 : 0),
    } as Record<BuyQuality, PartOfferVM>,
  })),
);

function full(): TabletProps {
  return {
    status: { shopName: 'Phi Phi Fix', day: 12, time: 14.5, money: 12450, reputation: 3.5 },
    badges: { orders: 4, reviews: 2 },
    orders: {
      rack: { used: 4, capacity: 5 },
      orders: [
        { id: 'o1', model: 'Pear Fone X', phoneColor: '#d9d9de', customer: 'Noi', customerColor: '#d8679b', job: 'Sostituzione batteria', note: 'Mi serve per stasera, apro il bar!', status: 'ready', price: 1450, deadlineText: 'entro le 18:00', minutesLeft: 210 },
        { id: 'o2', model: 'Pear Fone 8', phoneColor: '#e8c9b0', customer: 'Marco (backpacker)', job: 'Porta di ricarica: pulizia', status: 'in_progress', price: 600, deadlineText: 'tra 40 min', minutesLeft: 40, assignable: true },
        { id: 'o3', model: 'Pear Fone X', phoneColor: '#22262e', customer: 'Kai, istruttore sub', customerColor: '#3f8fd0', job: 'Schermo rotto', status: 'waiting_parts', price: 3200, deadlineText: 'domani 12:00', minutesLeft: 900, missingParts: ['Schermo Fone X'] },
        { id: 'o4', model: 'Pear Fone 8', phoneColor: '#b33a3a', customer: 'Mrs. Anderson', job: 'Caduto in mare: corrosione', status: 'assistant', price: 1900, deadlineText: 'tra 1 h 50', minutesLeft: 110, progress: 0.62 },
        { id: 'o5', model: 'Pear Fone 8', customer: 'Somsak', job: 'Altoparlante gracchiante', status: 'queued', price: 750, deadlineText: 'in ritardo', minutesLeft: -10, assignable: 'Tola è già occupato' },
      ],
    },
    catalog: {
      tools: [
        { id: 'screwdriver', name: 'Set cacciaviti di precisione', icon: 'tool_screwdriver', tier: 2, maxTier: 3, price: 1800, effect: 'Svita il 40% più in fretta e la zona verde della coppia è più ampia.', state: 'available', isNew: true },
        { id: 'suction', name: 'Ventosa', icon: 'tool_suction', tier: 1, maxTier: 3, price: 0, effect: 'Solleva lo schermo quel tanto che basta per infilare il plettro.', state: 'owned' },
        { id: 'heatgun', name: 'Pistola termica', icon: 'tool_heatgun', tier: 1, maxTier: 3, price: 950, effect: "Ammorbidisce l'adesivo. Attento a non esagerare.", state: 'available' },
        { id: 'multimeter', name: 'Multimetro USB', icon: 'tool_multimeter', tier: 1, maxTier: 2, price: 700, effect: "Misura l'assorbimento in ampere durante la diagnosi.", state: 'available' },
        { id: 'magmat', name: 'Tappetino magnetico grande', icon: 'tool_magmat', tier: 2, maxTier: 2, price: 18000, effect: '20 celle etichettate: le viti non rotolano più via.', state: 'available' },
        { id: 'microscope', name: 'Microscopio stereo', icon: 'tool_microscope', tier: 3, maxTier: 3, price: 14500, effect: 'Sblocca la microsaldatura sulla scheda logica.', state: 'locked', requires: 'Richiede il Negozio' },
        { id: 'ultrasonic', name: 'Vasca a ultrasuoni', icon: 'tool_ultrasonic', tier: 2, maxTier: 2, price: 5200, effect: 'Rimuove la corrosione in una sola passata.', state: 'locked', requires: 'Richiede il Chiosco' },
        { id: 'esd', name: 'Braccialetto ESD', icon: 'tool_esd', tier: 1, maxTier: 1, price: 450, effect: 'Riduce i danni casuali ai componenti delicati.', state: 'owned' },
      ],
      parts: { models: MODELS, categories: CATS.map(({ id, name, icon }) => ({ id, name, icon })), rows, normalEta: 'Arriva domattina con Mr. Chai', expressEta: 'Arriva tra 2 ore' },
      decor: {
        atmosphere: 34,
        categories: [
          { id: 'plants', name: 'Piante' },
          { id: 'lights', name: 'Luci' },
          { id: 'beach', name: 'Spiaggia' },
        ],
        items: [
          { id: 'd1', name: 'Palma in vaso', category: 'plants', icon: 'palm', color: '#4fb86a', atmosphere: 4, price: 350, owned: 1 },
          { id: 'd2', name: 'Lanterna di carta', category: 'lights', icon: 'bulb', color: '#ffc145', atmosphere: 3, price: 220, owned: 2, isNew: true },
          { id: 'd3', name: 'Tavola da surf', category: 'beach', icon: 'wave', color: '#18b8b0', atmosphere: 6, price: 900, owned: 0 },
          { id: 'd4', name: 'Ghirlanda phuang malai', category: 'plants', icon: 'heart', color: '#ff6f59', atmosphere: 2, price: 120, owned: 0 },
          { id: 'd5', name: 'Insegna al neon', category: 'lights', icon: 'bolt', color: '#8d7bd8', atmosphere: 9, price: 2400, owned: 0, locked: 'Richiede il Chiosco' },
          { id: 'd6', name: 'Conchiglie giganti', category: 'beach', icon: 'sparkle', color: '#e58a3c', atmosphere: 2, price: 90, owned: 3 },
          { id: 'd7', name: 'Acquario tropicale', category: 'beach', icon: 'drop', color: '#3f8fd0', atmosphere: 12, price: 14800, owned: 0 },
          { id: 'd8', name: 'Lucine a filo', category: 'lights', icon: 'sparkle', color: '#ffc145', atmosphere: 5, price: 480, owned: 1 },
        ],
      },
      expansion: {
        current: 'stall',
        next: {
          phase: 'kiosk',
          price: 25000,
          description: 'Un chiosco in legno e bambù con tetto di paglia: più spazio, più clienti, e una vetrinetta per gli accessori.',
          features: ['Secondo piano di lavoro', 'Vetrina accessori (reddito extra)', 'Rack da 8 telefoni', 'Nuove decorazioni e strumenti'],
          requirements: [
            { label: 'Reputazione 3★', met: true, progress: '3,5★' },
            { label: '25 riparazioni completate', met: false, progress: '18/25' },
          ],
        },
      },
      customize: {
        shopName: 'Phi Phi Fix',
        awningColor: 'coral',
        awningColors: [
          { id: 'coral', name: 'Corallo', color: '#ff6f59', color2: '#fff7e6' },
          { id: 'teal', name: 'Turchese', color: '#18b8b0', color2: '#fff7e6' },
          { id: 'gold', name: 'Sole', color: '#ffc145', color2: '#fff7e6' },
          { id: 'night', name: 'Notte', color: '#17324d', color2: '#f6e7c8' },
          { id: 'jungle', name: 'Giungla', color: '#4fb86a', color2: '#ffc145', locked: 'Reputazione 4★' },
        ],
        wallColor: 'wood',
        wallColors: [
          { id: 'wood', name: 'Legno', color: '#c79a6d' },
          { id: 'white', name: 'Calce', color: '#f6efe2' },
        ],
        wallsLocked: 'Disponibile dal Chiosco',
      },
    },
    inventory: {
      parts: [
        { id: 'p1', name: 'Batteria', model: 'Pear Fone 8', quality: 'good', qty: 2, icon: 'fn_battery', reserved: 1 },
        { id: 'p2', name: 'Schermo', model: 'Pear Fone 8', quality: 'cheap', qty: 1, icon: 'fn_display' },
        { id: 'p3', name: 'Porta di ricarica', model: 'Pear Fone 8', quality: 'refurb', qty: 1, icon: 'fn_charging' },
        { id: 'p4', name: 'Batteria', model: 'Pear Fone X', quality: 'refurb', qty: 1, icon: 'fn_battery' },
        { id: 'p5', name: 'Altoparlante', model: 'Pear Fone X', quality: 'good', qty: 3, icon: 'fn_speaker' },
      ],
      incoming: [
        { id: 'i1', name: 'Schermo · Pear Fone X (Buono)', qty: 1, eta: 'domattina' },
        { id: 'i2', name: 'Batteria · Pear Fone 8 (Economico)', qty: 2, eta: 'tra 2 ore', express: true },
      ],
      decor: [
        { id: 'd2', name: 'Lanterna di carta', qty: 1, atmosphere: 3, icon: 'bulb', color: '#ffc145' },
        { id: 'd6', name: 'Conchiglie giganti', qty: 2, atmosphere: 2, icon: 'sparkle', color: '#e58a3c' },
      ],
      phones: [
        { id: 'u1', model: 'Pear Fone 8', phoneColor: '#e8c9b0', state: 'repaired', conditionText: 'Riparato: batteria nuova, schermo originale.', paid: 900, minPrice: 1500, maxPrice: 5000, suggestedPrice: 3200 },
        { id: 'u2', model: 'Pear Fone X', phoneColor: '#22262e', state: 'broken', conditionText: 'Non si accende. Segni di ossidazione.', issues: ['Non si accende', 'Corrosione'], paid: 1400, minPrice: 0, maxPrice: 0, suggestedPrice: 0 },
        { id: 'u3', model: 'Pear Fone 8', phoneColor: '#b33a3a', state: 'listed', conditionText: 'In vetrina da ieri.', paid: 700, minPrice: 1500, maxPrice: 5000, suggestedPrice: 3000, listedPrice: 3400 },
      ],
    },
    market: {
      listings: [
        { id: 'm1', model: 'Pear Fone 8', phoneColor: '#d9d9de', seller: 'Lek', pitch: 'Schermo crepato ma funziona tutto, giuro!', issues: ['Vetro crepato'], price: 800, marketValue: 3200 },
        { id: 'm2', model: 'Pear Fone X', phoneColor: '#22262e', seller: 'Turista danese', sellerColor: '#3f8fd0', pitch: 'È caduto dal kayak. Non so se è recuperabile.', issues: ['Caduto in mare', 'Non si accende'], risky: true, price: 1200, marketValue: 7800 },
        { id: 'm3', model: 'Pear Fone 8', phoneColor: '#e8c9b0', seller: 'Nong', pitch: 'La batteria dura dieci minuti.', issues: ['Batteria esausta'], price: 950, marketValue: 3200, sold: true },
      ],
    },
    stats: {
      days: Array.from({ length: 12 }, (_, i) => ({ day: i + 1, income: 900 + i * 380 + ((i * 7919) % 900), expenses: 500 + ((i * 3571) % 1400), reputation: Math.min(5, 1.5 + i * 0.19) })),
      totals: { earned: 48250, spent: 21300, tips: 3120, repairs: 37, perfectRepairs: 14, customersServed: 41, customersLost: 6, phonesFlipped: 3, bestDay: 6900 },
    },
    reviews: {
      average: 3.9,
      reviews: [
        { id: 'r1', customer: 'Noi', customerColor: '#d8679b', customerType: 'Locale', stars: 5, text: 'Veloce, onesto e mi ha pure pulito la porta di ricarica. Torno di sicuro!', day: 12, model: 'Fone X', factors: [{ label: 'Rapido', positive: true }, { label: 'Prezzo giusto', positive: true }] },
        { id: 'r2', customer: 'Kai', customerColor: '#3f8fd0', customerType: 'Sub', stars: 4, text: 'Telefono come nuovo dopo un tuffo a 12 metri. Un po’ caro, ma ne è valsa la pena.', day: 11, model: 'Fone X', factors: [{ label: 'Qualità', positive: true }, { label: 'Caro', positive: false }] },
        { id: 'r3', customer: 'Mrs. Anderson', customerType: 'Turista', stars: 2, text: 'Mancava una vite e il Face ID non funziona più. Peccato.', day: 10, model: 'Fone X', factors: [{ label: 'Vite mancante', positive: false }, { label: 'Funzione persa', positive: false }] },
        { id: 'r4', customer: 'Marco', customerType: 'Backpacker', stars: 5, text: 'Grande! Riparato in mezz’ora mentre bevevo un cocco.', day: 9, model: 'Fone 8', factors: [{ label: 'Rapido', positive: true }] },
        { id: 'r5', customer: 'Somsak', customerType: 'Locale', stars: 3, text: 'Lavoro ok, ma ho aspettato parecchio.', day: 8, model: 'Fone 8', factors: [{ label: 'Lento', positive: false }] },
      ],
    },
    encyclopedia: {
      models: [
        {
          id: 'fone8',
          name: 'Pear Fone 8',
          year: 2017,
          entries: [
            { id: 'battery', name: 'Batteria', icon: 'fn_battery', unlocked: true, description: 'Cella agli ioni di litio da 1821 mAh. È incollata alla scocca con linguette adesive elastiche: tirandole lentamente e quasi in orizzontale si allungano e rilasciano la batteria senza piegarla.', tip: 'Scollega sempre la batteria per prima: finché è collegata la scheda è sotto tensione.', facts: [{ label: 'Fissaggio', value: '4 linguette adesive' }, { label: 'Connettore', value: 'Flex a pressione' }, { label: 'Fragilità', value: 'Alta (non piegare!)' }] },
            { id: 'display', name: 'Schermo', icon: 'fn_display', unlocked: true, description: 'Pannello LCD con vetro e digitalizzatore laminati.', isNew: true },
            { id: 'home', name: 'Tasto Home', icon: 'fn_fingerprint', unlocked: true, description: 'Sensore Touch ID accoppiato alla scheda logica.' },
            { id: 'taptic', name: 'Taptic Engine', icon: 'fn_vibration', unlocked: true, description: 'Attuatore lineare per la vibrazione.' },
            { id: 'speaker', name: 'Altoparlante', icon: 'fn_speaker', unlocked: true, description: 'Altoparlante inferiore.' },
            { id: 'port', name: 'Porta di ricarica', icon: 'fn_charging', unlocked: true, description: 'Gruppo connettore con microfoni.' },
            { id: 'board', name: 'Scheda logica', icon: 'part_board', unlocked: false },
            { id: 'rearcam', name: 'Fotocamera posteriore', icon: 'fn_rearCamera', unlocked: false },
            { id: 'frontcam', name: 'Sensori frontali', icon: 'fn_frontCamera', unlocked: false },
            { id: 'earpiece', name: 'Capsula', icon: 'fn_earpiece', unlocked: true, description: 'Altoparlante per le chiamate.' },
            { id: 'bracket', name: 'Staffa batteria', icon: 'part_bracket', unlocked: true, description: 'Protegge il connettore della batteria.' },
            { id: 'sim', name: 'Carrello SIM', icon: 'fn_sim', unlocked: false },
          ],
        },
        { id: 'fonex', name: 'Pear Fone X', year: 2018, entries: [{ id: 'battery', name: 'Batteria a L', icon: 'fn_battery', unlocked: true, description: 'Due celle a forma di L.' }, { id: 'faceid', name: 'Face ID', icon: 'fn_biometric', unlocked: false }] },
        { id: 'fone12', name: 'Pear Fone 12', locked: 'Non hai ancora aperto un Fone 12', entries: [] },
      ],
    },
    assistant: {
      hired: true,
      name: 'Tola',
      color: '#e58a3c',
      bio: 'Nipote di Noi, smanetta con i telefoni da quando aveva dieci anni. Affidabile sulle riparazioni semplici.',
      hireCost: 3000,
      wagePerDay: 400,
      skill: 2,
      abilities: ['Batterie', 'Pulizia porte', 'Altoparlanti'],
      status: 'working',
      job: { model: 'Pear Fone 8', customer: 'Mrs. Anderson', job: 'Pulizia corrosione', progress: 0.62, eta: 'finisce alle 15:40' },
      doneToday: 2,
      doneTotal: 11,
      log: [
        { time: '13:10', text: 'Ha iniziato il Fone 8 di Mrs. Anderson.' },
        { time: '12:40', text: 'Ha completato la batteria di Somsak (qualità 82%).' },
        { time: '10:05', text: 'Ha completato la pulizia della porta di Lek.' },
      ],
    },
  };
}

function empty(): TabletProps {
  const p = full();
  p.badges = {};
  p.status = { shopName: 'Phi Phi Fix', day: 1, time: 8.25, money: 350, reputation: 0 };
  p.orders = { orders: [], rack: { used: 0, capacity: 3 } };
  p.catalog.tools = [];
  p.catalog.decor = { atmosphere: 0, categories: [], items: [] };
  p.catalog.parts = { ...p.catalog.parts, rows: [] };
  p.inventory = { parts: [], incoming: [], decor: [], phones: [] };
  p.market = { listings: [], locked: 'Il mercatino apre quando raggiungi 2★ di reputazione.' };
  p.stats = { days: [], totals: { earned: 0, spent: 0, tips: 0, repairs: 0, perfectRepairs: 0, customersServed: 0, customersLost: 0, phonesFlipped: 0, bestDay: 0 } };
  p.reviews = { reviews: [], average: 0 };
  p.encyclopedia = { models: [] };
  p.assistant = { ...p.assistant, hired: false, locked: "L'assistente si può assumere quando apri il Negozio." };
  return p;
}

function show(ctx: DemoCtx, props: TabletProps, tab: TabletTab, catalogTab?: CatalogTab, click?: string): void {
  let p: TabletProps = { ...props, tab, catalogTab };
  const handle = ctx.root.openModal(
    (parent) =>
      mountTablet(
        parent,
        p,
        ctx.spy<TabletCallbacks>({
          onClose: () => handle.close(),
          onTabChange: (t2, c2) => {
            p = { ...p, tab: t2, catalogTab: c2 };
            handle.content.update(p);
          },
        }),
      ),
    { trapFocus: false, backdrop: 'blur' },
  );
  if (click) window.setTimeout(() => handle.content.el.querySelector<HTMLElement>(click)?.click(), 50);
}

const variants: Record<string, (ctx: DemoCtx) => void> = {
  orders: (c) => show(c, full(), 'orders'),
  tools: (c) => show(c, full(), 'catalog', 'tools'),
  parts: (c) => show(c, full(), 'catalog', 'parts'),
  decor: (c) => show(c, full(), 'catalog', 'decor'),
  expansion: (c) => show(c, full(), 'catalog', 'expansion'),
  customize: (c) => show(c, full(), 'catalog', 'customize'),
  inventory: (c) => show(c, full(), 'inventory'),
  'inventory-decor': (c) => show(c, full(), 'inventory', undefined, '.tb-toolbar .tab:nth-child(2)'),
  'inventory-phones': (c) => show(c, full(), 'inventory', undefined, '.tb-toolbar .tab:nth-child(3)'),
  market: (c) => show(c, full(), 'market'),
  stats: (c) => show(c, full(), 'stats'),
  reviews: (c) => show(c, full(), 'reviews'),
  encyclopedia: (c) => show(c, full(), 'encyclopedia', undefined, '.tb-enc-tile'),
  assistant: (c) => show(c, full(), 'assistant'),
  'assistant-hire': (c) => show(c, { ...full(), assistant: { ...full().assistant, hired: false } }, 'assistant'),
};
for (const tab of ['orders', 'catalog', 'inventory', 'market', 'stats', 'reviews', 'encyclopedia', 'assistant'] as TabletTab[]) {
  variants[`empty-${tab}`] = (c) => show(c, empty(), tab);
}

registerDemo('tablet', { title: 'Tablet', variants });
