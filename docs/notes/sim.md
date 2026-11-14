# Simulazione di gioco (`src/gameplay/sim` e dintorni)

Tutta la logica "pura" (niente three.js/DOM, testabile in Node): clienti, preventivi, ordini, economia, reputazione,
ricambi, strumenti, decorazioni, espansione, usato, assistente, giornata, meteo, tutorial, stato e salvataggi.
Ogni valore di bilanciamento sta in `src/data/balance.json`.

## File

| File | Contenuto |
| --- | --- |
| `src/core/state.ts` | `GameState` (JSON puro) e tutti i tipi persistiti, `SCHEMA_VERSION`, `createInitialState` |
| `src/core/save.ts` | `SaveManager` (3 slot + autosave), `StorageLike`, migrazioni, validazione, import/export |
| `src/gameplay/sim/index.ts` | **facciata `GameSim`** (unico punto d'ingresso per la colla 3D/UI) |
| `src/gameplay/sim/types.ts` | `SimEvent`, `Result`, offerte del catalogo, esiti di preventivo e consegna |
| `src/gameplay/sim/orders.ts` | ciclo di vita degli ordini, scadenze, ritiri, consegna |
| `src/gameplay/sim/autorepair.ts` | riparazione guidata automatica che consuma il magazzino (assistente, bot, e2e) |
| `src/gameplay/sim/assistant.ts` | assistente della fase 3 |
| `src/gameplay/sim/autoplay.ts` | `AutoPlayer`: politica automatica usata dal test di bilanciamento (riusabile per l'e2e) |
| `src/gameplay/customers/{generate,diagnosis}.ts` | generazione clienti, afflusso, opzioni di diagnosi e indizi |
| `src/gameplay/economy/{pricing,review,reputation,parts,market,ledger}.ts` | prezzi, recensioni, reputazione, ricambi, usato, cassa |
| `src/gameplay/shop/tools.ts` | catalogo strumenti, `RepairContext`, capienze |
| `src/gameplay/building/{decor,stages}.ts` | decorazioni/atmosfera, fasi del negozio |
| `src/data/{balance,tools,customers}.json` | dati |
| `src/data/i18n/{it,en}/{faults,customers,reviews,tools,economy,phones,parts}.json` | testi |

## API di `GameSim`

```ts
static newGame(opts: { seed: number; shopName: string; skipTutorial?: boolean }, deps?: { decor?: DecorDef[] }): GameSim
static fromState(state: GameState, deps?: { decor?: DecorDef[] }): GameSim      // usa l'oggetto sul posto
get state(): GameState                                                         // JSON puro, sempre serializzabile

// orologio
advance(realDt: number, opts: { inRepair: boolean; paused?: boolean; talking?: boolean }): SimEvent[]
timeInfo(): { day; time; dayProgress; rain; phase: 'open'|'summary'; running }

// clienti e preventivi
customerAtCounter(): Customer | null
queue(): Customer[]
inspect(customerId: string, tool: 'visual'|'multimeter'|'battester'|'psu'): DiagnosisClue
diagnosisOptions(customerId: string): DiagnosisOption[]
quoteInfo(customerId: string, diagnosis: string): QuoteInfo | null      // { fair, min, max, labor, partsCost, parts, urgency, dueAt }
proposeQuote(customerId: string, diagnosis: string, price: number): QuoteOutcome
acceptCounter(customerId: string): Order | null
dismissCustomer(customerId: string): void

// ordini e riparazione (gli id valgono sia per gli ordini sia per i telefoni dell'usato)
orders(): Order[];  order(id): Order | null;  job(id): JobRef | null
rackCapacity(): number;  rackUsed(): number;  benchCount(): number
startRepair(id: string): Result
pauseRepair(id: string): Result
markReady(id: string, opts: { guideUsed: boolean }): Result
deliver(orderId: string): DeliverOutcome              // DeliveryResult | { ok: false; reason }
abandonOrder(orderId: string): Result
repairContext(opts?: { tutorial?: boolean }): RepairContext
createSession(id: string): RepairSession | null        // sessione del motore sul telefono del lavoro
replacePart(session: RepairSession, compId: string, quality: 'cheap'|'good'|'refurb'): ActionResult
flagDeadParts(id: string): string[]
partsNeeded(id: string): PartCategory[]
hasPart(modelId, category, quality): boolean
consumePart(modelId, category, quality): boolean
partsFor(modelId, category): Record<'cheap'|'good'|'refurb', number>
storage(): { used: number; capacity: number }

// negozio
catalog(): { tools: ToolOffer[]; parts(modelId): PartOffer[]; decor: DecorOffer[]; upgrades: UpgradeOffer[] }
buyTool(toolId: string): Result
buyPart(modelId, category, quality, opts: { express: boolean; qty?: number }): Result
refurbishDisplay(modelId: string): Result;  scrapDisplays(modelId: string): number
buyDecor(itemId: string): Result & { uid?: string }
canPlaceDecor(uid, place: { x; z; rot }): Result
placeDecor(uid, place): Result;  moveDecor(uid, place): Result
storeDecor(uid): Result;  sellDecor(uid): Result & { refund?: number }
setPlacementValidator(fn: ((item: DecorDef, at: DecorPlacement, state: GameState) => boolean) | null): void
atmosphere(): number
setCustomization(c: Partial<{ awningColor: string; accentColor: string; shopName: string }>): void
buyStage(): Result
hireAssistant(on: boolean): Result

// usato
market(): UsedListing[]
buyUsed(listingId: string): Result & { owned?: OwnedPhone }
ownedPhones(): OwnedPhone[]
usedSalePrice(ownedId: string): number
listForSale(ownedId: string): Result & { askPrice?: number }

// giornata
canCloseShop(): boolean
closeShop(): DaySummary | null          // null se non si può (prima delle 18:00, tutorial, resoconto già aperto)
startNextDay(): SimEvent[]

// tutorial, enciclopedia, statistiche
tutorial: { phase(); active(); advance(to?); skip(); createWreck(): Order; finishWreck(); createFirstCustomer(): Customer }
unlockEncyclopedia(key: string): boolean
reputation(): number
stats(): Stats & { day; playTime; reputation; reviews; atmosphere; money; debt }
```

`Result = { ok: true } | { ok: false; reason: string; params? }` con `reason` = chiave `economy.err.*`.
Tutti i testi sono `Line = { key, params? }`; un parametro che inizia con `@` è a sua volta una chiave da tradurre
(es. `model: "@phones.fone8.name"`).

### Note d'uso per la colla

- **Ciclo**: `advance()` a ogni frame → reagire agli eventi. A fine giornata arriva `day_end` (con il resoconto) oppure
  si chiama `closeShop()`; poi mostrare il resoconto, **autosalvare** (`SaveManager.autosave(sim.state)`) e chiamare
  `startNextDay()`. Gli eventi causati da chiamate dirette (la coda che avanza, `abandonOrder`, `closeShop`) vengono
  restituiti dal successivo `advance()` / `startNextDay()`.
- **Tempo**: 48 s reali per ora di gioco; con `inRepair: true` scorre a `repairTimeScale` (0,55) e accumula stanchezza.
  Fermo se `paused`, durante il tutorial e mentre è aperto il resoconto. `talking: true` congela la pazienza del
  cliente al banco mentre è aperta la finestra del preventivo.
- **Diagnosi**: l'id di un'opzione è `"guasto"` oppure `"guastoA+guastoB"` (clienti con due guasti). `inspect`
  restituisce le righe da mostrare e le opzioni appena escluse; la diagnosi vera non viene mai esclusa.
- **Riparazione**: `startRepair(id)` → `createSession(id)` → azioni del motore. Per sostituire un pezzo usare
  `replacePart(session, compId, quality)` (controlla, scala il magazzino, esegue `replace`). Dopo il test finale
  chiamare `flagDeadParts(id)`: i ricambi nati difettosi vengono marcati e la guida chiede di sostituirli di nuovo.
  `markReady` non giudica nulla: la valutazione avviene in `deliver`.
- **Consegna**: possibile solo con ordine `ready` e `order.customerPresent` (cliente che aspetta, o tornato: evento
  `pickup_arrived`). Quando un ordine diventa pronto il cliente viene "avvisato" e passa entro 0,4–1,4 ore.
- **Decorazioni**: la simulazione controlla solo la sovrapposizione fra oggetti dello stesso tipo di posa; i vincoli
  dell'edificio vanno forniti con `setPlacementValidator`. Al cambio di fase le decorazioni tornano in magazzino.
- **Tutorial**: stato in `state.tutorial = { phase, skipped, giftGiven }`. Il relitto è un `Order` con
  `kind: 'tutorial'` (non occupa il portatelefoni); il primo cliente porta un Fone 8 con `worn_battery` e fa comparire
  a magazzino una batteria "good".

## `GameState` (forma)

```ts
{
  schemaVersion, seed, rng, nextId, playTime, shopName,
  customization: { awningColor, accentColor },
  day, time, dayPhase: 'open'|'summary', warned,
  money, stage: 1|2|3, construction: 0|2|3,
  tools: Record<toolId, tier>, parts: Record<"model|category|quality", qty>, scrap: Record<model, qty>,
  deliveries: PartDelivery[], boatDay,
  counter: Customer | null, queue: Customer[], nextArrivalAt, recurring: Record<charId, day>, scheduled: [{ character, at }],
  orders: Order[], owned: OwnedPhone[], market: { day, listings: UsedListing[] },
  decor: [{ uid, itemId, placed: { x, z, rot } | null }],
  reputation: { value, reviews: Review[] /* ultime 40 */, total, penalty },
  loan: { debt }, ledger: Ledger /* giornata in corso */, history: DayRecord[] /* max 60 */, lastSummary: DaySummary | null,
  weather: { rainStart, rainEnd, rain }, assistant: { hired, orderId, remaining },
  tutorial: { phase, skipped, giftGiven }, encyclopedia: string[], stats: Stats
}
```

I tempi assoluti (`dueAt`, `pickupAt`, `arriveAt`…) sono ore dalla mezzanotte del giorno 1: `(day - 1) * 24 + time`.
L'RNG è serializzato in `state.rng`. Le liste storiche sono limitate (recensioni 40, storico 60 giorni, serie del
grafico 14): dopo 75 giornate simulate lo stato non cresce (test `sim-save`).

## `SimEvent`

`customer_arrived {customer, position}` · `customer_stepped_up {customer}` ·
`customer_left {customerId, reason: impatient|closing|dismissed|refused, line}` · `character_visit {character, customerId}` ·
`pickup_arrived {orderId, ready, line}` · `pickup_left {orderId}` · `order_overdue {orderId, graceHours}` ·
`order_postponed {orderId, dueAt, line}` · `order_failed {orderId, review, reputationDelta, line}` ·
`delivery_arrived {express, items[]}` · `supplier_boat {parcels}` · `used_sold {ownedId, modelId, price}` ·
`assistant_started {orderId, hours}` · `assistant_done {orderId, success}` · `rain_start {hours}` · `rain_stop` ·
`day_ending {hoursLeft}` · `day_end {summary}` · `loan {amount, line}` · `stage_built {stage}` · `day_start {day}`.

## Salvataggi (`src/core/save.ts`)

`new SaveManager(storage: StorageLike = localStorage, prefix = 'islandfix.save.')` con slot `auto | slot1 | slot2 | slot3`:
`save(slot, state)`, `autosave(state)`, `load(slot)`, `info(slot)`, `list()`, `latest()`, `delete(slot)`,
`exportSlot(slot)`, `importToSlot(slot, text)`; funzioni libere `exportSave(state)`, `importSave(text)`,
`migrateState(raw)`, `validateState(state)`, `defaultStorage()`, `MemoryStorage`.
File = `{ app: 'island-fix', schemaVersion, meta: { shopName, day, money, reputation, stage, playTime, savedAt }, state }`.
Errori gestiti (mai eccezioni): `empty | corrupt | newer_version | storage_failed` → testi `economy.save.*`.
Schema corrente **2**; la migrazione 1→2 rinomina `customization.wallColor` in `accentColor`, trasforma `debt` in
`loan.debt`, aggiunge `playTime`, `boatDay`, `scrap`, `tutorial.giftGiven` e, sugli ordini, `assistantTried` e `targets`.

## Formule principali

- **Prezzo equo** `F = Σ manodopera × laborMult(1,4) × difficoltà modello + Σ ricambi "good" × 1,3`, arrotondato a ฿10
  (in un lavoro doppio il guasto meno caro conta all'80%). Il cliente accetta fino a `F × budget` (0,8–1,6),
  contropropone fino a `× 1,25` (al massimo due volte), poi se ne va; oltre `× 1,9` c'è il 50% di probabilità di una
  recensione da 1★.
- **Ricambi**: `value × {cheap 0,55 · good 1 · refurb 1,7}`; express `× 1,35 + ฿60`, arriva dopo 2 ore; standard con la
  barca delle 07:30 del giorno dopo. Magazzino 14 posti (40 con le mensole) + bonus di fase.
- **Reputazione**: media pesata delle ultime 40 recensioni (la più recente pesa 1, la più vecchia 0,5) con un
  "prior" di 1★. Il peso del prior parte da 20 e sfuma a 0 tra la 20ª e la 160ª recensione totale; si sottrae la
  penalità dei prestiti (0,15 a prestito, recupero 0,03 al giorno). Rispetto all'esempio del brief (peso 5) il prior
  è più pesante: con peso 5 il Fone 12 si sbloccava già al secondo giorno.
- **Soddisfazione alla consegna** (0..1): base 0,86 se tutte le funzioni attese sono tornate (altrimenti
  `0,25 + 0,4 × frazione`, 0,2 se nessuna), poi: nuove funzioni rotte −0,18 l'una; accoppiamenti persi (True Tone
  −0,04, biometria −0,10); viti mancanti/lente; pezzi avanzati −0,15; non chiuso −0,40; tenuta persa −0,03 / guarnizione
  nuova +0,02 (+0,04 con il tier Pro); pulizia +0,05; ricambio economico notato −0,08 / ricondizionato +0,03;
  consegna rapida +0,03/+0,06, ritardo −0,10, giorno di ritardo −0,20; prezzo basso +0,08, giusto +0,03, alto
  −0,04/−0,14; errori di lavorazione fino a −0,06; "Esperto" (guida spenta) +0,04; diagnosi sbagliata −0,05;
  atmosfera ≥ 40 +0,02; indulgenza del tipo di cliente. Stelle: soglie 0,3 / 0,5 / 0,7 / 0,9. Telefono che non si
  accende: massimo 0,1. Pagamento: intero se tutto riparato, metà se parziale, zero se niente.
  Le "funzioni attese" (`order.targets`) sono quelle rotte all'accettazione che una riparazione perfetta riporta in
  vita, calcolate con una prova a secco al momento dell'accettazione.
- **Mancia**: solo con 4–5★, `pagato × quota del tipo × (1 a 5★, 0,4 a 4★) × (1 + 0,5 × atmosfera/100) × caso(0,5–1,5)`.
- **Afflusso** (clienti/ora): `0,75 × curva oraria × (1 + 0,12 × stelle) × (1 + min(0,9; 0,45 × atmosfera/100)) × (1 − 0,6 × pioggia) × fase(1 / 1,2 / 1,5)`.
- **`errorMult`** = 1 + caldo 11–15h (0,35; ventilatore ×0,5, condizionatore ×0) + buio dopo le 18:30 (0,40; lampada
  con lente −50%, lucine −25% a tier) + stanchezza (0,05 per ora al banco oltre la terza, max 0,40; sedia ×1 / 0,6 / 0,3).
- **Atmosfera** = Σ oggetti piazzati × 0,6^(n° di copie precedenti) + bonus fase (0/12/28) + lucine (0/6/14); oltre 120
  conta un quarto.
- **Usato**: annunci al 12–35% del valore; vendita = `valore × 0,72 × punteggio^1,5 × fattore ricambi × pulizia × tenuta`
  (15% se non si accende); tempo di vendita 0,3–2,2 giorni, più rapido con fase e atmosfera.
- **Costi fissi** per fase: affitto 150 / 650 / 1.800, elettricità 0 / 150 / 400, assistente 900 al giorno; vetrina
  accessori 0 / 420 / 1.100 di base. Saldo negativo a fine giornata → prestito di Somchai (riporta a ฿500), rimborsato
  col 25% dell'utile dei giorni successivi.

## Bilanciamento: risultati della simulazione

Test `tests/unit/sim-balance.test.ts` (per vedere la curva: `npx vitest run tests/unit/sim-balance --silent=false`).
Giocatore automatico: diagnosi con gli strumenti posseduti, prezzo equo, ricambi "good", riparazione con la guida
(1 s reale a passo), acquisto degli upgrade appena possibile. Tempi in ore reali equivalenti (giorni × 12 minuti).

| Seed | Primo upgrade | Chiosco | Negozio | Negozio completo | Reputazione | Riparazioni (5★) | Ordini falliti | Prestiti |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 0,14 h | 1,82 h | 5,86 h | 6,34 h | 4,73 | 299 (237) | 22 | 2 |
| 21 | 0,12 h | 1,54 h | 5,65 h | 5,84 h | 4,58 | 331 (233) | 16 | 1 |
| 99 | 0,30 h | 2,14 h | 5,45 h | 5,92 h | 4,73 | 308 (246) | 18 | 1 |

Obiettivi: primo upgrade ≈ 0,25 h, chiosco 1,5–2 h, negozio completo 6–8 h. "Negozio completo" = fase 3 con saldatore,
microscopio e assistente. Il terzo traguardo cade sul bordo basso dell'intervallo (5,8–6,3 h): il bot non sbaglia
mai un gesto, un giocatore vero è più lento. La durata reale di una sessione è più lunga di giorni × 12 minuti perché
nella vista riparazione il tempo rallenta (fino a ~21 minuti per giornata).

## Scostamenti e limiti noti

- Una giornata dura 12 minuti reali solo fuori dalla vista riparazione (vedi sopra).
- I ricambi sono indicizzati per categoria: sul Fone X la categoria `front_sensor` copre due componenti (gruppo
  auricolare e modulo del volto) e costa come il più caro.
- Gli strumenti vengono consegnati subito all'acquisto, non con la barca.
- `closeShop()` restituisce `DaySummary | null`; `startRepair/pauseRepair/markReady` restituiscono `Result`.
- Il bot perde circa il 5–7% degli ordini (accetta lavori urgenti che poi non finisce): è un limite della politica,
  non del gioco.

## Richieste verso il motore di riparazione (`src/gameplay/repair`, non modificato)

1. **Ciclo infinito della guida** con obiettivi che combinano `reseat` e altro lavoro (es. `worn_battery` +
   `loose_connector`): `nextHint` alterna `connect` / `disconnect` sul flat del display, su Fone 8, X e 12.
   Aggiramento: i clienti e il mercatino non generano mai `loose_connector` insieme a un altro guasto, e
   `autoRepair` esegue prima l'obiettivo senza `reseat` (il rimontaggio ricollega comunque i connettori).
   La correzione andrebbe fatta in `hint.ts` (fase `work`).
2. **Batteria "degradata" di serie**: `generateFaultyPhone` assegna una salute 0,78–0,97, ma sotto 0,80 la funzione
   `battery` risulta `degraded` anche senza guasto. Aggiramento: `order.targets`. Basterebbe partire da 0,80.
3. **Ricambi difettosi**: `needsReplace` legge `phone.flags['doa_<comp>']`, ma nessuno lo imposta né lo azzera.
   Lo fanno `GameSim.flagDeadParts` e `GameSim.replacePart`; sarebbe più pulito dentro il motore.
4. Con il cacciavite base una vite su un componente molto corroso si spana nel 15% dei casi e senza estrattore il
   lavoro resta bloccato: è coerente con il design, ma rende l'estrattore quasi obbligatorio per l'acqua di mare.
5. Le letture degli strumenti di diagnosi usano chiavi nel mio namespace (`faults.reading.*`), non `repair.inspect.*`
   / `repair.ammeter.*`.
