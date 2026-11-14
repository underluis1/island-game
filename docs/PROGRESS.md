# Avanzamento

Ultimo `npm run verify`: **verde** — typecheck, lint, 222 test unitari, build (2,0 MB JS + 0,14 MB CSS), 4 test e2e.

## Milestone

| | Stato | Note |
| --- | --- | --- |
| M0 Setup | fatta | Vite + TS strict, ESLint, Vitest, Playwright (Chromium con GPU), `npm run verify` |
| M1 Mondo | fatta | cielo fisico, mare con shader, spiaggia, karst, palme, long-tail, gabbiani, granchi, giorno/notte, pioggia, 4 preset + benchmark |
| M2 Motore di riparazione | fatta | modello dati a componenti/fissaggi, viti per tipo e lunghezza, tappetino magnetico, connettori, adesivo e calore, linguette; 100+ test |
| M3 Pulizia, diagnosi, test finale | fatta | sporco/corrosione cancellabili col pennello, alcol, stuzzicadenti; multimetro; test con schermate PearOS |
| M4 Tutorial | fatta | zio Somchai: introduzione, smontaggio e rimontaggio guidati, primo cliente, primo acquisto; saltabile |
| M5 Clienti, economia, giornata, salvataggi | fatta | preventivi con diagnosi, ordini, recensioni, resoconto, 3 slot + autosave con migrazioni |
| M6 Strumenti e modelli | fatta | 29 strumenti/upgrade con tier; Fone 8, X, 12, 14 con procedure distinte |
| M7 Arredamento ed espansione | fatta | 37 decorazioni, griglia e slot, atmosfera; bancarella → chiosco → negozio |
| M8 Audio | fatta | musica adattiva, ambiente, 67 SFX, voci, mixer |
| M9 Endgame | fatta in parte | vedi "Cosa manca" |
| M10 Polish | fatta in parte | vedi "Cosa manca" |

## Misure (Chromium headless, GPU Metal, 1600×900, preset Medio)

- Scena principale: 60 fps (tetto del vsync), 49–75 draw call, 310–415k triangoli (budget: < 200 / < 600k).
- Vista riparazione: ~310 draw call (telefono smontabile pezzo per pezzo), 60 fps.
- 10 giornate simulate: geometrie e texture GPU costanti (43 / 57), salvataggio 10–19 kB.
- Caricamento iniziale ~2 s in locale.

## Verificato da test automatici

- Smontaggio e rimontaggio completi dei 4 modelli, con ogni tipo di guasto, tramite la guida.
- Playthrough: tutorial intero, primo ordine, incasso, acquisto strumento, decorazione, salva → ricarica → stato identico.
- Avvio dalla build di produzione senza errori in console e senza richieste di rete esterne.
- Parità completa delle chiavi italiano/inglese.

## Provato a mano (mouse e tastiera simulati) ma non coperto da test

- Nel gioco completo: vista esplosa dall'enciclopedia a banco vuoto, clic sul tappetino, selezione strumenti dalla barra, svitatura, pausa, impostazioni, acquisto del
  chiosco dal tablet, chiusura anticipata, resoconto, cantiere notturno e riapertura al giorno 2 in fase chiosco.
- Nella pagina di prova della riparazione:

  svitare, tappetino magnetico, calore, ventosa, plettro, apertura a libro, coppia di serraggio, spudger sui
  connettori, linguette batteria, stuzzicadenti nella porta, pulizia con alcol.

## Cosa manca / problemi noti

- **Mai provato da una persona**: tutto è stato verificato con test e mouse simulato. Sensazione dei comandi, difficoltà
  dei minigiochi e bilanciamento reale vanno giudicati giocando.
- **Audio mai ascoltato**: livelli, durate e spettro sono misurati, il carattere dei suoni no.
- **Microsaldatura**: il minigioco si apre cliccando la scheda smontata (verificato), ma nessuna partita di saldatura è
  stata giocata fino in fondo dentro il gioco.
- **Non provati dentro una partita**: assistente, vendita dell'usato dalla vetrina, programmatore chip, torcia per le
  viti perse, estrattore, passaggio al negozio (fase 3). La logica è coperta dai test unitari.
- **Draw call nella vista riparazione** sopra 200 (il budget riguarda la scena principale).
- **Prestazioni su GPU integrata non misurate**: in headless si vede solo il tetto dei 60 fps.
- Blocco del main thread fino a ~80 ms durante il caricamento del mondo (obiettivo 50 ms).
- Cambiare preset grafico a caldo causa un singhiozzo di 0,4–1,4 s.
- La pioggia attraversa il tendone; il testo thai dipende dai font di sistema.
- Dettagli dei telefoni: la SIM del Fone X resta visibile accanto alla scheda; la staffa fotocamera del Fone 14 non è
  centrata sulle lenti.

## Screenshot

- Set finale in `docs/screenshots/final/` (25 immagini, rigenerabili con `node scripts/final-shots.mjs`).
- Le cartelle per milestone `docs/screenshots/Mx/` non sono state prodotte; gli scatti intermedi di lavoro (`docs/screenshots/wip/`) restano solo in locale, fuori dal repository.
