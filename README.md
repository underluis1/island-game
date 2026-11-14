# Island Fix — Phone Repair Simulator

Gioco 3D per browser: apri una bancarella di riparazione smartphone sulla spiaggia di Koh Phi Phi, impara a smontare
un telefono pezzo per pezzo, servi i clienti e trasforma la bancarella in un vero laboratorio.

Tutto è generato dal codice: geometrie, texture, musica, effetti sonori e voci. Nessun asset esterno, nessuna
richiesta di rete a runtime. I telefoni sono del marchio fittizio **Pear** (Fone 8 / X / 12 / 14).

## Avvio

```bash
npm install
npm run dev        # sviluppo, http://localhost:5173
npm run build      # build di produzione in dist/
npm run preview    # serve dist/ su http://localhost:4173
```

La cartella `dist/` funziona con qualunque server statico (percorsi relativi).

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run typecheck` | TypeScript strict, nessun errore ammesso |
| `npm run lint` | ESLint, nessun warning ammesso |
| `npm run test` | test unitari (Vitest): motore di riparazione, simulazione, salvataggi, audio, i18n |
| `npm run e2e` | Playwright su Chromium con la build di produzione: avvio offline, budget prestazioni, playthrough automatico |
| `npm run verify` | tutto quanto sopra, in sequenza |
| `node scripts/shot.mjs <url> <out.png>` | screenshot headless con GPU (vedi intestazione dello script) |
| `node scripts/gen-phones.mjs` | rigenera `src/data/phones/*.json` (strumento di authoring) |

## Controlli

| Tasto | Azione |
| --- | --- |
| Clic sul cliente | ascolta il problema, diagnosi e preventivo |
| Clic sul tappetino | siediti al banco e ripara |
| `1`–`9` | `1` mano, `2`–`9` strumenti (premi di nuovo il tasto del cacciavite per cambiare punta; `E` strumento successivo) |
| `0` | mano libera (come `1`) |
| Clic sinistro | usa lo strumento (tieni premuto per svitare, avvitare, scaldare, pulire) |
| Clic destro + trascina | ruota la camera · clic destro su un pezzo smontato: sostituisci · su un display aperto: chiudi |
| Rotellina | zoom verso il cursore · `WASD`, frecce, tasto centrale o Maiusc+trascina: sposta |
| `P` | accendi / spegni il telefono |
| `V` | capovolgi il telefono |
| `F` | inquadra il pezzo sotto il cursore |
| `G` | guida on/off (senza guida: bonus "Esperto") |
| `T` | test finale |
| `Q` | esci dalla riparazione / dall'arredamento |
| `Tab` | tablet (ordini, catalogo, magazzino, mercatino, statistiche, recensioni, enciclopedia, assistente) |
| `B` | modalità arredamento (`R` ruota, `Canc` vendi al 50%, `X` rimetti in magazzino) |
| `N` | chiudi il negozio per oggi (dopo le 18:00) |
| `Esc` | pausa (salva, impostazioni, menu) |

I tasti delle azioni sono rimappabili dalle impostazioni.

## Struttura

```
src/
  main.ts          avvio
  core/            event bus, RNG con seed, i18n, impostazioni, tween, stato di gioco, salvataggi
  gameplay/        logica pura, testabile in Node
    repair/        motore di smontaggio: componenti, viti, adesivi, connettori, guasti, diagnosi, test, guida
    sim/ customers/ economy/ shop/ building/   clienti, ordini, economia, negozio, espansione, usato, assistente
    tutorial/      copione di zio Somchai
  game/            colla: modalità, camera, vista riparazione, bancarella, arredamento, mapper per la UI
  render/          Engine (post-processing, preset, benchmark) e World (cielo, mare, spiaggia, karst, meteo)
  procgen/         geometrie e texture procedurali: phones/, tools/, props/, nature/, characters/
  audio/           Web Audio: musica adattiva, ambiente, SFX, voci
  ui/              HUD, tablet, menu, dialoghi (DOM + CSS)
  data/            telefoni, strumenti, decorazioni, bilanciamento, clienti, i18n (it, en)
tests/             unit (Vitest) ed e2e (Playwright)
docs/              ARCHITECTURE, DECISIONS, PROGRESS, note dei moduli, screenshot
dev/               pagine di prova dei singoli moduli (non fanno parte della build)
```

Aggiungere un modello di telefono = un JSON in `src/data/phones/` (più la riga in `index.ts`): la logica non cambia.

## API di automazione

In sviluppo, o aggiungendo `?debug` all'URL, il gioco espone `window.__game` (vedi `src/game/debug.ts`):
è ciò che usano i test end-to-end per completare tutorial, ordini e salvataggi.
