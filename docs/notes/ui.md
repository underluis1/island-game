# UI — libreria di componenti (`src/ui/`)

DOM + CSS sopra il canvas WebGL, nessun framework. Ogni componente è "dumb": riceve **props (view-model puro)** e
**callback**, non importa logica di gioco (solo `import type` da `gameplay/repair/types`, più `core/i18n`,
`core/settings`). Entry point unico: `import { … } from './ui'` (`src/ui/index.ts`).

- Galleria: `npx vite --port 5185` → `/dev/ui.html` (indice), `?screen=NOME&variant=V&lang=en&scale=1.3&log=1&motion=0`,
  da console `__ui.show('tablet', 'parts')`, `__ui.list()`, `__ui.calls` (callback invocate).
- Screenshot di riferimento: `docs/screenshots/wip/ui/<screen>-<variant>.png` (+ `*-en-720-13.png` = EN, 1280×720, testo 130%).
- Test: `tests/unit/ui-format.test.ts`, `ui-i18n.test.ts` (parità chiavi IT/EN + segnaposto), `ui-logic.test.ts`.

## Convenzioni

| Tema | Regola |
| --- | --- |
| Mount | `mountX(parent, props, callbacks) → { el, update(props), destroy(immediate?) }` (`Mounted<P>`). `update` fa un *morph* del DOM: scroll, focus e animazioni sopravvivono. Le callback sono fissate al mount. |
| Stringhe | Etichette statiche via `t('ui.…')` (`src/data/i18n/{it,en}/ui.json`). Testi di gioco (nomi, lamentele, recensioni, descrizioni) arrivano **già tradotti** nelle props. Cambio lingua a caldo: `setLang()` → `UIRoot` ri-renderizza tutte le view montate. |
| Misure | Tutto in `rem`. `UIRoot` imposta `html { font-size }` = 16px × fattore viewport (riferimento 1600×900) × `textScale`. |
| Mouse | `.ui-root` ha `pointer-events: none` (ereditato); tornano interattivi solo pannelli, pulsanti, `.pe`. |
| Token | `styles/tokens.css` (palette, raggi, ombre, easing). Superfici: `.panel` (carta), `.glass` (HUD), `.card`, `.wood`. |
| Icone | `icon('nome')` — 154 SVG inline in `icons.ts` (`tool_*`, `fn_*` = FunctionId, `screw_P2/Y000/PH000/SO`, `tab_*`, generiche). Nome sconosciuto → icona "question". |
| Suoni | `root.setSoundHook((name) => …)` con `'ui_click'|'ui_hover'|'ui_open'|'ui_close'|'ui_tab'|'error'|'success'`. I componenti chiamano `sfx()` da soli. |
| Reduce motion | `root.setReduceMotion(true)` mette `.reduce-motion` su `<html>`: animazioni/transizioni azzerate, typewriter e count-up istantanei. |

## Infrastruttura

```ts
const root = new UIRoot(document.body);
root.applySettings(settings);                 // textScale + reduceMotion
root.setSoundHook((name) => audio.playUi(name));
root.layers.hud | panels | modal | toast | tooltip | transition   // contenitori a tutto schermo

const m = root.openModal((parent) => mountPauseMenu(parent, props, cb), { backdrop: 'blur' });
m.content.update(next); m.close();
// ModalOptions: dismissible (Esc / click fuori), onDismiss, backdrop 'dim'|'blur'|'clear'|'none', trapFocus, silent, onClosed
root.modalDepth; root.dismissTop();           // con un modale aperto la root consuma Esc (e Tab se trapFocus)

root.toast({ kind: 'money', title: 'Pagamento ricevuto', text: 'Fone X · batteria', amount: 1450 });  // info|success|warn|error|money
root.gameError('Prima scollega la batteria!', 'fn_battery');   // banner grande, centrato in alto, con suono "error"
await root.fade(true, 500); await root.fade(false);            // dissolvenza a tutto schermo
```

Tooltip: qualunque elemento con `data-tip="testo"` (i widget lo impostano da `tip` / `disabled: 'motivo'`).

Helper (`format.ts`, puri): `formatMoney` (`฿ 1.250`, `signed`), `formatNumber`, `formatClock(ore)`, `formatDuration(min)`,
`formatTimer(s)`, `formatPercent`, `formatDecimal`, `formatTemp`, `formatAmps`, `formatMm`, `starParts`, `keyLabel(code)`,
`urgencyOf(minuti)`, `initialOf`, `colorFromString`.

Widget (`widgets.ts`, restituiscono elementi usabili in qualunque `render`): `button`, `kbd`, `tabs`, `segmented`, `toggle`,
`slider` (con `band`), `select`, `textInput`, `scroll`, `stars` (mezze stelle, `animate`), `money`, `badge`, `bar`
(zone + marker), `pips`, `avatar`, `emptyState`, `panelHeader`, `field`, `statRow`, `animateNumber` (count-up), `pulse`.
`chart({ labels, series })` (`chart.ts`): barre/linee SVG con asse destro opzionale.

Nuovo componente: `defineView<Props, Callbacks, State>({ name, state?, render(v), mounted?, updated?, leaveMs? })` con
`h(tag, props, ...children)`; props speciali di `h`: `key`, `keep` (sottoalbero gestito a mano), `hook(el, first)`, `html`, `dataset`, `onX`.

## Componenti

| # | Mount | File | Layer consigliato | Demo |
| --- | --- | --- | --- | --- |
| 1 | `mountSplash(parent, { progress, labelKey?, ready? }, { onStart })` → + `setProgress(p, labelKey?)`, `setReady()` | `menus.ts` | `transition` | `splash` |
| 2 | `mountMainMenu(parent, MainMenuProps, MainMenuCallbacks)` | `menus.ts` | `panels` | `mainmenu` |
| 3 | `mountSettingsPanel(parent, { settings, detectedQuality?, detecting? }, { onChange, onClose, onDetectQuality? })` | `settings-panel.ts` | `openModal` | `settings` |
| 4 | `mountPauseMenu(parent, { slots, saveDisabled?, shopName?, day? }, { onResume, onSave, onSettings, onMainMenu })`, `mountCredits(parent, { version? }, { onClose })` | `menus.ts` | `openModal` | `pause` |
| 5 | `mountHud(parent, HudProps, { onButton, onOrderClick? })` | `hud.ts` | `hud` | `hud` |
| 6 | `mountHotbar(parent, { tools, selectedId, page?, bits? }, { onSelect, onSelectBit?, onPage? })` | `hotbar.ts` | `hud` | `hud` |
| 7 | `mountGauge(parent, GaugeSpec)` → `{ update(values), setAnchor(x, y), dock(), destroy() }` | `gauges.ts` | `hud` | `hud/gauges` |
| 8 | `mountDialogue(parent, DialogueProps, { onAdvance, onChoice?, onChar?, onLineDone? })` → + `skip()`, `typing` | `dialogue.ts` | `panels` | `dialogue` |
| 9 | `mountCustomerPanel(parent, CustomerPanelProps, CustomerPanelCallbacks)` | `customer-panel.ts` | `panels` | `customer` |
| 10 | `mountTablet(parent, TabletProps, TabletCallbacks)` | `tablet/` | `openModal({ trapFocus: false })` | `tablet` |
| 11 | `mountRepairPanel(parent, RepairPanelProps, RepairPanelCallbacks)`; `mountPartTooltip(parent)` → `{ show(data, x, y), move(x, y), hide(), destroy() }`; `mountPartPicker(parent, PartPickerProps, { onPick, onOrder, onCancel })` | `repair-panel.ts`, `part-tooltip.ts`, `part-picker.ts` | `panels` / `tooltip` / `openModal` | `repair` |
| 12 | `mountFinalTest(parent, FinalTestProps, { onReveal?, onRevealDone?, onBack, onDeliver })` | `final-test.ts` | `panels` | `finaltest` |
| 13 | `mountDeliveryResult(parent, DeliveryResultProps, { onContinue })` | `delivery-result.ts` | `openModal` | `delivery` |
| 14 | `mountDaySummary(parent, DaySummaryProps, { onNextDay })`; `mountNightTransition(parent, { mode: 'night'|'build', day, building?, shopName?, hold? }, { onCovered?, onReady?, onDone })` | `day-summary.ts`, `night-transition.ts` | `openModal` / `transition` | `summary`, `night` |
| 15 | `mountDecorMode(parent, DecorModeProps, { onSelect, onDeselect, onExit })` | `decor-mode.ts` | `hud` | `decor` |
| 16 | `mountSolderGame(parent, { faultKind, toolTier, steadiness }, { onDone(quality), onSfx? })` → `{ phase, quality, skipTo(), freeze(), destroy() }` | `solder/` | `modal` (a tutto schermo) | `solder` |
| 17 | `drawPhoneScreen(ctx, w, h, state: PhoneScreenState, time)` | `phone-screens.ts` | texture canvas | `phonescreens` |

I tipi completi (con commenti su ogni campo) sono accanto a ciascun componente; di seguito i punti che servono alla colla.

### 1–4 Menu
- `SaveSlotVM { id, kind: 'auto'|'manual', empty, shopName?, day?, money?, reputation?, phase?, savedAt? (epoch ms) }`.
- `MainMenuProps { lastSave: SaveSlotVM | null, slots (autosave + 3 slot), lang, version?, defaultShopName? }`.
  Callback: `onContinue()`, `onNewGame({ shopName, slotId, skipTutorial })`, `onLoad(slotId)`, `onDeleteSlot?(slotId)`,
  `onSettings()`, `onCredits()`, `onLang(lang)`. I dialog "Nuova partita" e "Carica" sono interni al componente (Esc li chiude).
- Impostazioni: componente **controllato** — a ogni `onChange(settings)` la colla salva, applica (`root.applySettings`, `setLang`,
  audio, qualità) e richiama `update({ settings })`. Tab: Grafica, Audio (5 volumi), Gioco (lingua, scala testo, sottotitoli,
  guida), Comandi (clic sull'azione → "Premi un tasto…"; conflitto = scambio dei tasti; 1–9 riservati; Esc annulla).
  Helper puri esportati: `rebindKey`, `isReservedKey`, `KEY_ACTIONS`, `actionKeyLabel`.
- `logo('md'|'lg')` restituisce il logo riutilizzabile.

### 5–7 HUD, hotbar, gauge
```ts
const hud = mountHud(root.layers.hud, {
  money, reputation, day, time /* ore 0..24 */, weather: 'clear'|'cloudy'|'rain',
  orders: [{ id, model, customer, deadlineText, minutesLeft, status: 'queued'|'waiting_parts'|'in_progress'|'assistant'|'ready', active? }],
  buttons: [{ id: 'back' }, { id: 'flip' }, { id: 'guide', active: true }, { id: 'test', disabled: 'Richiudi il telefono' }, { id: 'tablet', badge: 2 }, { id: 'pause' }],
  keys: settings.keys,
  tool: { name, icon, tier, detail: 'Punta P2' } | null,
  objective: { text, icon: 'tool_spudger', step: '7 / 18', progress: 0.38 } | null,   // banner guida / obiettivo
  prompt: { text: 'Tieni premuto per svitare', progress: 0.6 } | { text, kbd: 'mouse' | 'KeyF' } | null,
  hidden?: boolean,
}, { onButton: (id) => …, onOrderClick: (orderId) => … });
```
- `HudButtonId`: `tablet | decor | back | flip | guide | test | pause` — la colla sceglie quali mostrare per modalità; le scorciatoie vengono da `keys`.
- Variazioni di `money` tra due `update` → count-up + lampo verde/rosso + delta flottante.
- Hotbar: `HotbarTool { id, name, icon, tier, maxTier?, state: 'ok'|'disabled'|'missing', reason?, suggested? }`; 9 slot per pagina
  (frecce + puntini se > 9; i tasti 1–9 li gestisce la colla chiamando `onSelect` della pagina corrente — `onPage` la comunica).
  `bits: { options: ScrewType[], selected, suggested? } | null` mostra il selettore punta sopra la barra (`onSelectBit`).
- Gauge (`update` a 60 fps, tocca solo stile/testo):

| `kind` | config | `update({ value, … })` |
| --- | --- | --- |
| `torque` | `mode: 'screw'|'unscrew'`, `green: [da, a]` (più ampia coi tier alti) | `value` coppia 0..1, `progress` anello avanzamento |
| `temperature` | `min, max, ideal: [a, b], danger` (°C) | `value` in °C |
| `tension` | `safe` (soglia strappo 0..1) | `value` velocità/tensione, `progress` rilascio linguetta |
| `pick` | `danger` (profondità 0..1) | `value` profondità, `risky` (flex sotto il plettro) |
| `clean` | `label?` | `value` pulizia 0..1 |
| `multimeter` | — | `value` ampere (display a 7 segmenti), `volts?` |
| `battery` | — | `value` salute 0..1, `cycles?` |

`note` in `update` sostituisce la riga di stato automatica. Di default il gauge è ancorato in basso al centro; `setAnchor(x, y)` lo porta vicino al cursore.

### 8 Dialoghi
`DialogueProps { speaker: { name, role?, color?, icon? }, text, choices?: [{ id, label, icon?, hint? }], subtitles?, speed?, progress? }`.
Markup nel testo: `{{sawasdee|ciao}}` → parola thai evidenziata + traduzione tra parentesi. Clic/Spazio/Invio: completa la riga,
poi `onAdvance()`; con `choices` si sceglie col clic o con 1–9 (`onChoice(id)`). `onChar(char, index)` per la voce sintetizzata.
`subtitles: false` → box ridotto (nome + puntini). `update()` con testo diverso riavvia il typewriter.

### 9 Pannello cliente
Props: `customer { name, typeLabel, color?, icon?, patience 0..1 }`, `complaint`, `phone { model, colorName?, colorHex? }`,
`deadline? { label, urgency, note? }`, `actions: DiagnosisAction[]` (`id: 'inspect'|'multimeter'|'batteryTester'|'psu'`,
`state: 'ready'|'done'|'busy'|'locked'`, `reason?`), `clues`, `options: DiagnosisOption[]` (`mark: 'none'|'likely'|'confirmed'|'excluded'`,
`parts?`, `quote?`), `selected?`, `quote?: { min, max, step?, fairFrom, fairTo, suggested, partsCost? }`, `reaction?`,
`counter? { price, yourPrice, text? }`, `rackFull?`.
Callback: `onDiagnose(id)`, `onSelectDiagnosis(id)`, `onPriceChange(price)`, `onPropose(price, diagnosisId)`, `onDecline()`,
`onAcceptCounter()`, `onRefuseCounter()`, `onLeave()`. `priceReaction(price, quote)` è esportata (pura).

### 10 Tablet
`TabletProps { tab?, catalogTab?, status { shopName, day, time, money, reputation }, badges?, lockedTabs?, closeKey?, orders, catalog
{ tools, parts, decor, expansion, customize }, inventory, market, stats, reviews, encyclopedia, assistant }` — tipi in `tablet/types.ts`.
`tab`/`catalogTab` omessi = stato interno; se passati sono controllati (aggiornali in `onTabChange`).
Callback: `onClose`, `onTabChange?`, `onRepairOrder`, `onDeliverOrder`, `onAssignAssistant`, `onBuyTool`,
`onOrderPart(modelId, categoryId, quality, qty, express)`, `onBuyDecor`, `onBuyExpansion`, `onSetAwningColor`, `onSetWallColor`,
`onRenameShop`, `onPlaceDecor`, `onRepairUsedPhone`, `onListUsedPhone(id, price)`, `onUnlistUsedPhone`, `onBuyMarketPhone`,
`onOpenEncyclopediaEntry(modelId, entryId)`, `onExplodedView(modelId)`, `onHireAssistant`, `onFireAssistant`.
I pulsanti d'acquisto si disabilitano da soli se `status.money` non basta; ogni tab ha il suo stato vuoto.

### 11 Riparazione
- `RepairPanelProps { phone, customer?, deadline?, goals: [{ id, text, done, optional?, icon? }], mistakes: [{ id, text, severity 1–3 }],
  screws { held, mat[], matCells, matCols?, bench, lost }, side, testBlocked?, keys { flip, back }, collapsed? }`;
  callback `onFlip`, `onFinalTest`, `onExit`, `onToggle?`, `onPickScrew?`.
- Tooltip 3D: `tip.show(data, x, y)` ricostruisce il DOM solo se i dati cambiano, `tip.move(x, y)` solo transform (clamp ai bordi).
  `TipData = PartTipData | ScrewTipData | TextTipData`.
- Scelta ricambio: `PartPickerProps { partName, phoneModel, icon?, options: [{ quality, stock, paidPrice?, orderPrice, expressPrice?,
  incoming?, defectRisk, note? }], pairingNote?, pairingOk?, recommended?, money? }`.

### 12–14 Test finale, consegna, resoconto, notte
- Test finale: `items: [{ fn: FunctionId, status: TestStatus, note? }]` rivelati uno alla volta (`stepMs`, `onReveal(fn, status, i)` per
  suoni e schermata PearOS; clic = salta), `issues`, `score 0..1`, `deliverDisabled?`, `runId` per rilanciare, `instant`.
- Consegna: `payment, tip, bonus?, partsCost?, stars, reviewText, factors: [{ label, positive }], reputationBefore/After`.
- Resoconto: `income/expenses: SummaryLine[]`, `tips`, `balance`, `reputation(+Delta)`, `reviews`, `history` (grafico), `loan?`
  (prestito di Somchai con battuta), `saved?`.
- Notte: `mode: 'night'` (solo cambio giorno) o `'build'` + `building: 'kiosk'|'shop'`; `onCovered` = schermo coperto (qui la colla
  cambia scena), `onReady`, `onDone`; `hold: true` aspetta il clic.

### 15 Arredamento
`DecorModeProps { money, categories, items: [{ id, name, icon?, color?, category, atmosphere, price, stock, locked? }], selectedId,
atmosphere { value, next?, label? }, placement?: 'valid'|'invalid'|null, sellRefund?, keys { rotate, exit } }`.

### 16–17 Canvas
- Microsaldatura: 4 fasi (flussante → calore → posizionamento → saldatura) + esito; `onDone(quality)` alla conferma. `onSfx` nomi in `SolderSfx`.
- PearOS: `PhoneScreenState { kind, notch, progress?, result?, battery?, clock?, camera?, deadCells?, level?, charging?, severity? }`,
  `kind` ∈ `PHONE_SCREEN_KINDS` (`off, boot, home, power_off, test_touch, test_true_tone, test_biometric, test_camera, test_speaker,
  test_microphone, charging, vibration, glitch, backlight`). Le scritte usano `ui.pearos.*`.

## Problemi noti
- I dati finti della galleria sono in italiano anche con `lang=en` (i testi di gioco arrivano dalle props).
- Slot dei salvataggi nel menu Pausa: su larghezze strette i metadati vanno su due righe.
- Pannello cliente a 1280×720 con testo al 130%: il corpo scorre molto perché il piede del preventivo è alto.
- Le azioni di diagnosi bloccate mostrano il motivo solo nel tooltip.
- Interazioni verificate con uno smoke test Playwright (rimappatura tasti con scambio e tasti riservati, nuova partita, hotbar e
  pagine, dialoghi con Spazio/1–9, ordine ricambi dal tablet, slider prezzo + proposta). Il minigioco di microsaldatura è stato
  verificato fase per fase tramite `skipTo()` e screenshot, non con una partita completa trascinando il mouse.
