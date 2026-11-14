# PROMPT — "Island Fix: Phone Repair Simulator" (build autonomo one-shot)

## 0. Ruolo e modalità di lavoro

Sei un game developer senior full-stack (graphics programmer + gameplay engineer + technical artist + sound designer procedurale). Devi costruire **da zero e in completa autonomia** un videogioco 3D per browser, giocabile in Google Chrome desktop, senza alcun intervento umano fino alla consegna.

Regole di autonomia (obbligatorie):
- **Non fare domande.** Quando una scelta è ambigua, prendi la decisione più ragionevole, annotala in `docs/DECISIONS.md` (una riga: decisione + motivo) e prosegui.
- Lavora per **milestone incrementali** (sezione 14). Alla fine di ogni milestone il gioco deve compilare, avviarsi e essere giocabile.
- Mantieni aggiornato `docs/PROGRESS.md` con: milestone completate, cosa manca, problemi noti.
- **Non fermarti** finché tutti i punti della "Definition of Done" (sezione 15) non sono verificati. Se qualcosa fallisce, correggi e riverifica.
- Nessun `TODO`, nessun placeholder (cubi grigi, testo "lorem ipsum", "coming soon") nella build finale.

---

## 1. Visione del gioco

**Titolo provvisorio:** *Island Fix* (sottotitolo: *Phone Repair Simulator*).

Il giocatore è un giovane riparatore che apre una **piccola bancarella di riparazione smartphone su Koh Phi Phi (Thailandia)**, sulla spiaggia, davanti al mare turchese, tra palme, long-tail boat e falesie calcaree. Parte quasi senza niente: un tappetino, un cacciavite economico, una ventosa. Impara a **smontare un telefono pezzo per pezzo**, pulire i componenti, sostituire le parti, rimontare e testare. Accetta ordini dai clienti, si fa pagare, e con i guadagni **compra strumenti migliori, decorazioni e amplia il negozio**, fino a trasformare la bancarella in un vero laboratorio sull'isola.

Tono: **cozy, rilassante, tattile, soddisfacente** (riferimenti di feeling: PC Building Simulator, PowerWash Simulator, Unpacking). Ogni vite, ogni connettore, ogni pezzo deve "suonare" e "sentirsi" bene.

**Nota marchi:** non usare il marchio "iPhone", né il logo Apple, né nomi/loghi reali. Nel gioco i telefoni sono di un brand fittizio (es. **"Pear"** con modelli **"Pear Fone 8 / X / 12 / 14"**), con architettura interna fedele ai rispettivi iPhone reali (disposizione componenti, tipi di viti, procedura di apertura), così il gioco resta didattico ma legalmente pulito.

---

## 2. Vincoli tecnici (non negoziabili)

- **Stack:** Vite + TypeScript (strict) + **Three.js** (WebGL2). Puoi usare librerie npm open source con licenza permissiva (MIT/BSD/Apache): es. `three`, `postprocessing`, `tone` (opzionale), `zustand` o store custom, `howler` NON necessario. Niente motori pesanti (no Unity/Godot export, no Babylon se usi Three).
- **Zero asset esterni scaricati.** Tutto è creato da noi: **geometrie 3D procedurali** (costruite via codice: `ExtrudeGeometry`, `LatheGeometry`, CSG leggero se serve, `RoundedBox` custom, merge di geometrie), **texture procedurali** (generate su canvas/shader: noise, PCB, legno, sabbia, tessuto, rame, vetro), **musica e SFX sintetizzati** con Web Audio API. Nessuna immagine, modello o audio preso da internet. Nessuna CDN a runtime: la build è totalmente offline.
- **Gira in Chrome "tranquillamente":** target **60 fps su GPU integrata** (es. Intel Iris Xe / Apple M1 a 1080p) con preset "Medio"; mai sotto 30 fps col preset "Basso" su hardware modesto.
  - Draw call < 200 per frame nella scena principale (usa `InstancedMesh`, merge statici, atlas di texture procedurali).
  - Triangoli a schermo < 600k.
  - `devicePixelRatio` limitato (max 1.5 su Medio, 2 su Alto).
  - Texture procedurali generate una volta e messe in cache (IndexedDB se utile), risoluzione adattiva al preset.
  - Build di produzione < 15 MB, caricamento iniziale < 5 s su connessione locale.
- **Avvio:** `npm install && npm run dev` per sviluppo, `npm run build && npm run preview` per la build. Deve anche funzionare aprendo la cartella `dist/` servita da qualunque server statico.
- **Salvataggio:** autosave in `localStorage`/IndexedDB (3 slot + autosave), con versione dello schema e migrazioni.
- **Lingue:** Italiano (default) e Inglese, tutte le stringhe in file i18n.
- **Input:** mouse + tastiera (obbligatorio). Il gioco non deve richiedere gamepad.

---

## 3. Direzione artistica e ambientazione

Stile: **stylized-realistic** — forme pulite e leggibili, materiali PBR credibili, luce calda tropicale. Deve sembrare un gioco indie curato, non una demo tecnica.

### 3.1 La scena esterna (Koh Phi Phi)
- Spiaggia di sabbia bianca con leggere dune (heightmap procedurale), impronte e conchiglie sparse (instanced).
- **Mare turchese** con shader custom: gradiente di profondità (turchese vicino a riva → blu profondo), schiuma sulla battigia animata, riflessi speculari del sole, leggere onde (Gerstner semplificate), caustiche finte sul fondale basso.
- **Falesie calcaree** (karst) sullo sfondo: rilievi verticali procedurali con vegetazione in cima, nebbiolina atmosferica.
- **Palme** procedurali (tronco curvo segmentato + fronde a geometria a nastro) che ondeggiano col vento (vertex shader).
- **Long-tail boat** colorate ancorate e che passano lentamente all'orizzonte, con nastri colorati a prua.
- Elementi vivi: gabbiani (boids semplici), granchietti sulla sabbia, turisti stilizzati che passeggiano (low-poly, animazione procedurale di camminata), bandierine e lanterne che si muovono.
- **Ciclo giorno/notte** (una giornata di gioco ≈ 12 minuti reali): alba rosata, mezzogiorno brillante, **golden hour** spettacolare, sera con lanterne e lucine (string lights) accese sulla bancarella, notte stellata con luna riflessa sul mare.
- Meteo occasionale: acquazzone tropicale breve (particelle pioggia + gocce sul tendone + suono), poi sole.

### 3.2 La bancarella (livello iniziale)
- Banchetto di legno grezzo con tendone a strisce, cartello scritto a mano ("PHONE FIX – ซ่อมมือถือ"), sgabello di plastica, lampada da tavolo, ventilatore che gira, un piccolo Buddha o un portafortuna, una radio.
- Sul banco: **tappetino da lavoro** dove avviene la riparazione (vista ravvicinata).

### 3.3 Rendering
- `ACESFilmicToneMapping`, color management corretto (sRGB).
- Ombre: una `DirectionalLight` (sole) con shadow map, cascade semplificata o shadow camera che segue il banco; ombre soft.
- Ambiente: sky shader fisico (Preetham/Hosek semplificato) + `PMREMGenerator` per l'environment map dinamica (rigenerata a intervalli, non ogni frame).
- Post-processing (libreria `postprocessing`): Bloom leggero, SMAA/FXAA, vignetta leggera, **depth of field nella vista riparazione** (sfoca lo sfondo), SSAO solo su preset Alto.
- Preset grafici: Basso / Medio / Alto / Ultra, con selezione automatica al primo avvio in base a un mini-benchmark di 3 secondi.

---

## 4. Telecamere e modalità di visuale

1. **Vista Bancarella** (default): camera in terza persona fissa/semi-libera che inquadra il banco, il mare e i clienti che arrivano. Click su cliente → ordine; click sul tappetino → Vista Riparazione.
2. **Vista Riparazione** (cuore del gioco): camera ravvicinata dall'alto sul tappetino, orbit limitato (rotazione, zoom, pan con mouse), transizione fluida (tween 0.6 s). Il telefono e i suoi pezzi sono grandi e leggibili.
3. **Modalità Arredamento**: camera isometrica sulla bancarella/negozio, griglia per posizionare oggetti.
4. **Vista Microscopio** (sbloccabile): zoom estremo sulla scheda logica per la microsaldatura.

---

## 5. Il sistema di smontaggio (il cuore — deve essere dettagliatissimo)

### 5.1 Modello dati
Ogni modello di telefono è definito in un file **JSON data-driven** (`src/data/phones/*.json`), non hard-coded. Ogni telefono è un **albero di componenti con dipendenze**:

```
Component {
  id, nameKey, mesh (generatore procedurale + parametri),
  attachedBy: [ { type: "screw", screwType, length, position } |
                { type: "adhesive", strength } |
                { type: "connector", connectorId } |
                { type: "clip" } |
                { type: "bracket", bracketId } ],
  blockedBy: [componentIds],   // cosa va rimosso prima
  fragility: 0..1,             // probabilità di danno se maneggiato male
  condition: "ok" | "damaged" | "dirty" | "corroded" | "missing",
  dirt: 0..1, corrosion: 0..1,
  pairing: boolean,            // es. Face ID / Touch ID legati alla scheda
  value, partCategory
}
```

Il sistema calcola automaticamente quali azioni sono possibili in ogni momento (un componente è rimovibile solo quando tutti i suoi `blockedBy` e fissaggi sono stati rimossi).

### 5.2 Sequenza realistica (esempio "Pear Fone X", ispirata alla procedura reale)
1. Spegnere il telefono (se lo dimentichi: rischio cortocircuito quando scolleghi).
2. Svitare le **2 viti pentalobe** accanto alla porta di ricarica (richiede punta P2).
3. **Scaldare i bordi** dello schermo (heat gun o iOpener) — barra di temperatura: troppo poco = l'adesivo non cede; troppo = danno al display/batteria.
4. **Ventosa** + **plettro di apertura**: sollevare, inserire il plettro e farlo scorrere lungo i bordi tagliando l'adesivo, evitando le zone pericolose (cavi flex sul lato) — se infili il plettro troppo a fondo nel punto sbagliato rompi il flat.
5. Aprire lo schermo "a libro" sul lato giusto.
6. Rimuovere le viti **tri-point/Y000** della staffa del connettore batteria.
7. **Scollegare la batteria per prima** (con lo spudger). Se scolleghi altro prima: rischio di danno alla scheda (evento con probabilità).
8. Rimuovere staffa e connettori del display, del sensore frontale, ecc.
9. Proseguire: batteria (linguette adesive "pull-tab" da tirare lentamente, possono spezzarsi → serve alcol isopropilico e pazienza), Taptic Engine, altoparlante, connettore Lightning/porta, fotocamere, scheda logica.

Ogni modello ha la sua sequenza coerente con il telefono reale di riferimento: 
- **Fone 8** (tasto Home con Touch ID accoppiato, schermo che si apre lateralmente, viti Phillips #000 e tri-point),
- **Fone X** (notch, Face ID accoppiato, scheda logica "a sandwich" — delicatissima),
- **Fone 12** (bordi piatti, adesivo più forte, telecamera con calibrazione),
- **Fone 14** (vetro posteriore rimovibile: si può aprire dal retro).

### 5.3 Viti (meccanica chiave)
- Tipi: **Pentalobe P2, Tri-point Y000, Phillips #000, Standoff**, con **lunghezze diverse** (es. 1.2 mm, 1.3 mm, 2.7 mm, 3.1 mm).
- Ogni vite rimossa va posata sul **tappetino magnetico a griglia** (oggetto 3D con celle etichettate). Se le viti finiscono sparse sul banco, il vento del ventilatore/il caso possono farne "rotolare" una (cercarla con la torcia).
- **Long screw damage:** rimontare una vite lunga nel foro di una corta danneggia la scheda (come nella realtà). Il giocatore deve ricordarsi l'ordine o usare il tappetino.
- Svitare/avvitare: si tiene premuto il click mentre si muove il mouse in cerchio o si tiene premuto con un indicatore di **coppia**: troppo forte = vite spanata (serve estrattore), troppo debole = vite non fissata (il test finale lo rileva).
- Cacciaviti di qualità migliore = meno rischio di spanare, più velocità.

### 5.4 Interazioni tattili
- **Hotbar strumenti** (1–9) con l'utensile selezionato visibile in mano/cursore 3D.
- **Raycasting** preciso sui pezzi: hover = outline luminoso + tooltip con nome e stato.
- Trascinare i pezzi rimossi sul tappetino (snap su zone libere); i pezzi restano dove li lasci.
- Connettori flex: si "staccano" con lo spudger con animazione a scatto e suono "click".
- Adesivo: visualizzato con shader (strisce lucide che si deformano e si allungano mentre tiri).
- Calore: effetto heat-shimmer leggero + colore che vira sull'arancio nella zona scaldata.
- **Modalità "Guida"** attivabile: evidenzia il prossimo passo consigliato (utile nel tutorial e per principianti; disattivandola si guadagna un bonus "Esperto").

### 5.5 Pulizia e cura dei componenti
- Sporco, sabbia (siamo in spiaggia!), lanugine nella porta di ricarica, **corrosione da acqua salata** (clienti caduti in mare!), ossidazione dei connettori.
- Strumenti: pennellino antistatico, **alcol isopropilico 99%** + spazzolino, aria compressa, stuzzicadenti per la porta, e da sbloccare la **vasca a ultrasuoni**.
- Meccanica: "dipingere" con il pennello sullo sporco (texture mask che si svuota, con particelle di polvere e suono), barra di pulizia %. La corrosione richiede più passate e alcol; sui connettori pesantemente corrosi serve microsaldatura.

### 5.6 Diagnostica e test
- **Diagnosi** prima della riparazione: il cliente descrive il problema in modo vago ("non carica", "è caduto in mare", "lo schermo fa le righe"). Il giocatore usa strumenti: ispezione visiva, **multimetro USB** (assorbimento in ampere: ci dice se il telefono si accende/in che stato è), alimentatore da banco (sbloccabile), test della batteria (cicli/salute %).
- **Test finale** dopo il rimontaggio: schermo touch (griglia), True Tone, Face ID/Touch ID, fotocamere, altoparlante, microfono, ricarica, vibrazione. Ogni test è una piccola animazione sul telefono 3D (lo schermo mostra UI fittizia del sistema "PearOS").
- **Accoppiamento (pairing):** se sostituisci display/Face ID/Touch ID senza i passaggi corretti (es. trasferire il chip del True Tone con il programmatore, sbloccabile), funzioni perse → cliente meno soddisfatto. Didattico e fedele alla realtà.

### 5.7 Microsaldatura (endgame)
Sbloccabile con microscopio + stazione ad aria calda + saldatore fine: riparare un connettore danneggiato, sostituire un chip di ricarica (Tristar/Tigris fittizio) — minigioco di precisione (mano ferma, temperatura, flussante, stagno).

---

## 6. Tutorial e personaggi

- **Mentore:** *Lung Somchai* ("zio Somchai"), anziano riparatore dell'isola che va in pensione e ti lascia la bancarella. Ti insegna il primo smontaggio completo passo-passo (su un vecchio Fone 8 da pezzi di ricambio), spiegando *perché* si fa ogni passaggio (scollegare la batteria, tappetino magnetico, calore, ecc.). Dialoghi brevi, simpatici, con qualche parola thai (con traduzione).
- **Struttura tutorial:** 
  1. Smontaggio completo guidato di un telefono-relitto (senza cliente, senza fretta).
  2. Rimontaggio guidato.
  3. Primo cliente reale: sostituzione batteria semplice.
  4. Primo acquisto in negozio (strumento migliore).
- Il tutorial si può saltare dal menu.
- **Personaggi ricorrenti:** la proprietaria del bar accanto (Noi), un istruttore di sub che rompe sempre il telefono, un backpacker italiano, un fornitore di pezzi che arriva in long-tail boat ogni mattina (Mr. Chai). Personaggi low-poly stilizzati, animazioni procedurali (idle, camminata, gesti), con "voce" stile Animal Crossing (sillabe sintetizzate).

---

## 7. Ordini, clienti ed economia

- Valuta: **Baht (฿)**.
- I clienti arrivano a piedi lungo la spiaggia (frequenza in base a ora del giorno, reputazione e decorazioni del negozio). Ognuno ha: tipo (turista, locale, sub, backpacker, business), telefono + guasto (generato proceduralmente ma coerente con i dati del modello), budget, pazienza, priorità ("mi serve entro il tramonto, ho il traghetto!").
- **Tablet ordini**: preventivo (il giocatore propone un prezzo; troppo alto = il cliente rifiuta o lascia recensione negativa; giusto = accetta; basso = più reputazione ma meno guadagno), scadenza, note.
- Coda di lavori: puoi accettare più ordini e riporre i telefoni in un portatelefoni a slot (capienza limitata, ampliabile).
- **Ricambi:** si ordinano dal fornitore (consegna la mattina dopo, o "express" a costo più alto). Tre qualità: *Economico* (aftermarket, rischio difetti, il cliente se ne accorge), *Buono*, *Originale ricondizionato* (caro). Magazzino ricambi visibile.
- **Mercatino dell'usato:** puoi comprare telefoni rotti a poco, ripararli e rivenderli (secondo loop economico).
- **Reputazione** (1–5 stelle) + recensioni testuali generate dai risultati (velocità, qualità, prezzo, viti mancanti, funzioni perse). La reputazione sblocca clienti e modelli più remunerativi.
- **Costi fissi:** affitto giornaliero del posto, elettricità (dalla fase negozio), ricambi. Bancarotta impossibile in modo frustrante: se vai sotto zero, zio Somchai ti presta soldi (con battuta), ma perdi un po' di reputazione.
- Fine giornata: **resoconto** (entrate, uscite, mance, recensioni, grafico semplice), poi salvataggio automatico e notte → giorno successivo.
- Bilanciamento: il primo upgrade significativo deve arrivare entro ~15 minuti di gioco; la bancarella → chiosco entro ~1,5–2 ore; negozio completo entro ~6–8 ore. Tutti i valori di bilanciamento in un unico file `src/data/balance.json`.

---

## 8. Progressione: strumenti e upgrade

Negozio interno ("catalogo" sul tablet, consegna via barca):

**Strumenti (con tier: Base → Pro → Elite)**
- Set cacciaviti (velocità, precisione coppia), plettri e spudger, ventosa (presa), heat gun → piastra riscaldante separatrice (riscaldamento uniforme), tappetino magnetico grande, lampada con lente d'ingrandimento → microscopio stereo, multimetro → alimentatore da banco, kit pulizia → vasca a ultrasuoni, saldatore → stazione di saldatura ad aria calda, programmatore chip True Tone/batterie, macchina separatrice per vetri (refurbish display: separare vetro rotto da OLED funzionante), tester batterie, polvere/aria compressa, guanti antistatici e braccialetto ESD (riduce danni casuali).

Ogni strumento ha un modello 3D procedurale dettagliato, un suono e un effetto pratico sulle meccaniche (non solo cosmetico).

**Comfort/efficienza:** sedia migliore, ventilatore → condizionatore (nelle ore calde il caldo aumenta gli errori), luce migliore (meno errori di sera), mensole, portatelefoni.

---

## 9. Personalizzazione ed espansione del negozio

- **Modalità Arredamento** con griglia, rotazione (R), anteprima verde/rossa di posizionamento valido, vendita oggetti al 50%.
- Decorazioni: piante tropicali, lanterne, ghirlande di fiori (phuang malai), tavole da surf, insegne neon, tappeti, conchiglie, poster stilizzati, acquario, pappagallo animato, colori del tendone/pareti, cartello personalizzabile con il nome del negozio scelto dal giocatore.
- Le decorazioni aumentano un valore di **"Atmosfera"** che attrae più clienti e più mance.
- **Espansione in 3 fasi** (con cantiere animato di transizione notturna):
  1. **Bancarella** sulla sabbia (tendone, banchetto).
  2. **Chiosco in legno e bambù** con tetto di paglia, bancone più grande, secondo piano di lavoro, piccola vetrina per vendere accessori (cover, cavi, power bank → reddito extra).
  3. **Negozio vero** affacciato sul mare: vetrata, aria condizionata, banco microsaldatura, retrobottega magazzino, vetrina telefoni ricondizionati, insegna luminosa. Eventualmente un **assistente** assumibile che gestisce riparazioni semplici in automatico (sistema idle leggero).

---

## 10. Audio (tutto sintetizzato con Web Audio API)

- **Musica procedurale adattiva:** chill/lo-fi con influenze thai — scala pentatonica, timbro pizzicato tipo *khim*/ *ranat* (synth FM o Karplus-Strong), basso morbido, percussioni leggere (sintetizzate), pad caldi. Strati che cambiano con l'ora del giorno (mattina acustica, pomeriggio più ritmata, sera più ambient, notte minimale) e si abbassano durante le riparazioni delicate. Generatore con semi casuali per variazioni infinite ma coerenti, con progressioni di accordi predefinite e transizioni morbide. **Radio** sulla bancarella per cambiare "stazione"/mood.
- **Ambiente:** onde (rumore filtrato modulato), vento tra le palme, gabbiani, motori delle long-tail boat (oscillatori + rumore con doppler), chiacchiericcio lontano, pioggia.
- **SFX tattili** (priorità massima, devono essere soddisfacenti): click delle viti (varianti di pitch casuali), vite che cade e rimbalza sul banco, "pop" della ventosa, scricchiolio dell'adesivo, "snap" dei connettori, ronzio del heat gun, bip del multimetro, sfrigolio dello stagno, cassa che fa "cha-ching", notifica ordine.
- Mixer con volumi separati (musica, ambiente, SFX, voci) nelle impostazioni. Audio audio sbloccato al primo click utente (policy di Chrome).

---

## 11. UI/UX

- Stile UI: caldo e pulito, palette ispirata al tramonto tropicale (sabbia, turchese, corallo, legno), angoli arrotondati, icone disegnate in SVG da te, font di sistema o font open-source incluso nel bundle (licenza OFL).
- Schermate: splash/caricamento animato (onde + logo), menu principale con la scena dell'isola sullo sfondo, nuovo gioco/carica/impostazioni/crediti, HUD (soldi, ora, reputazione, ordini attivi, strumento selezionato), tablet (ordini, catalogo, magazzino, statistiche, recensioni), resoconto giornaliero, pausa.
- **Feedback chiaro:** ogni azione proibita spiega il perché ("Prima scollega la batteria!"), ogni errore ha un suono e un'icona.
- Accessibilità: testo scalabile, opzione sottotitoli per i dialoghi, opzione "riduci movimento camera", tasti rimappabili.
- Scorciatoie: `1–9` strumenti, `Tab` tablet, `Esc` pausa, `F` focus sul pezzo, `G` guida, `R` ruota (arredamento).

---

## 12. Architettura del codice

```
src/
  main.ts
  core/        (game loop, time/day cycle, event bus, state machine, save/load, i18n, settings, rng con seed)
  render/      (renderer, postprocessing, quality presets, sky, water, lighting, shaders/)
  procgen/     (geometrie procedurali: phones/, tools/, props/, nature/, characters/; texture procedurali)
  gameplay/    (repair/ [albero componenti, viti, adesivo, connettori, pulizia, test], customers/, economy/, shop/, building/, tutorial/)
  audio/       (engine, music generator, sfx, ambience)
  ui/          (componenti HUD/tablet/menu — DOM+CSS sopra il canvas, niente framework pesante o, se vuoi, Preact)
  data/        (phones/*.json, tools.json, decor.json, balance.json, customers.json, i18n/it.json, i18n/en.json)
tests/         (unit Vitest + e2e Playwright)
docs/          (PROGRESS.md, DECISIONS.md, ARCHITECTURE.md)
```

- Gameplay **data-driven**: aggiungere un nuovo modello di telefono = aggiungere un JSON + un generatore di mesh parametrico, senza toccare la logica.
- Logica di gioco separata dal rendering (la simulazione dello smontaggio deve essere testabile in Node senza WebGL).
- Dispose corretto di geometrie/materiali/texture: nessun memory leak dopo 10 giornate di gioco.

---

## 13. Qualità grafica dei telefoni (dettaglio richiesto)

I telefoni sono la "star": devono essere **belli da vicino**.
- Scocca in alluminio/acciaio con bordi arrotondati, vetro con riflessi (MeshPhysicalMaterial: clearcoat, transmission leggera dove serve), tasti, griglie degli altoparlanti, isola fotocamera con lenti (riflessi iridescenti).
- Interno: **scheda logica** con texture PCB procedurale (piste, vias, serigrafie fittizie), chip con scritte fittizie, schermature metalliche (shield) con riflessi spazzolati, **cavi flex** color ambra con curve realistiche, **batteria** con etichetta fittizia e linguette adesive, Taptic Engine, speaker, fotocamere modulari, viti con testa del tipo corretto visibile (pentalobe a 5 punte, tri-point a Y, croce).
- Stati visibili: vetro crepato (texture procedurale di crepe radiali dal punto d'impatto), batteria gonfia, corrosione verde/bianca sui connettori, sabbia e polvere, ammaccature.
- Esplosione animata ("exploded view") a fine riparazione o dal menu enciclopedia.
- **Enciclopedia**: ogni componente smontato almeno una volta si sblocca in un'enciclopedia 3D consultabile con descrizione didattica reale di cosa fa.

---

## 14. Piano di lavoro a milestone (esegui in ordine, verifica ognuna)

- **M0 – Setup:** progetto Vite+TS, lint, Vitest, Playwright con Chromium, script `npm run verify` (typecheck + test + build + e2e). Scena vuota a 60 fps.
- **M1 – Mondo:** spiaggia, mare con shader, cielo, ciclo giorno/notte, palme, karst, bancarella, preset grafici + benchmark.
- **M2 – Motore di riparazione:** modello dati componenti, Fone 8 completo procedurale, smontaggio/rimontaggio completo con viti, tappetino magnetico, connettori, adesivo, calore. Unit test sulla logica (ordine, dipendenze, long screw damage).
- **M3 – Pulizia, diagnosi e test finale.**
- **M4 – Tutorial con zio Somchai** + primo cliente.
- **M5 – Clienti, ordini, economia, giornata e resoconto, salvataggi.**
- **M6 – Negozio strumenti + tier + effetti meccanici; modelli Fone X, 12, 14.**
- **M7 – Arredamento + espansione chiosco → negozio, atmosfera.**
- **M8 – Audio completo** (musica procedurale adattiva, ambiente, SFX).
- **M9 – Endgame:** microsaldatura, programmatore chip, assistente, mercatino usato, enciclopedia.
- **M10 – Polish:** juice (particelle, animazioni, tween), bilanciamento, i18n completo, accessibilità, ottimizzazione performance, menu, crediti.

**Ciclo di verifica autonoma dopo OGNI milestone:**
1. `npm run verify` deve passare senza errori né warning di TypeScript.
2. Avvia la build in **Chrome headless (Playwright)**, apri il gioco, controlla **zero errori in console** e zero errori WebGL.
3. Cattura **screenshot** delle viste principali (bancarella giorno, golden hour, notte, vista riparazione, tablet, arredamento) in `docs/screenshots/Mx/` e **analizzali tu stesso**: composizione, leggibilità, colori, assenza di glitch (z-fighting, texture nere, oggetti fluttuanti, testo che esce dai box). Se qualcosa non è all'altezza di "grafica fantastica", miglioralo prima di procedere.
4. Misura gli fps medi su 20 secondi nella scena principale (log via `performance.now`) e controlla draw call/triangoli (`renderer.info`); se sotto target, ottimizza.
5. Test e2e di **playthrough automatico**: uno script che completa il tutorial (smontaggio + rimontaggio + test) tramite un'API di debug esposta solo in dev (`window.__game`), accetta un ordine, ripara, incassa, compra uno strumento, piazza una decorazione, salva e ricarica, verificando che lo stato sia identico.
6. Aggiorna `docs/PROGRESS.md`.

---

## 15. Definition of Done (tutto deve essere vero)

- [ ] Il gioco si avvia in Chrome dalla build di produzione, offline, senza errori in console.
- [ ] 60 fps su preset Medio in scena principale (misurato in headless con GPU software come riferimento relativo + budget draw call/triangoli rispettati).
- [ ] Tutorial completo e giocabile dall'inizio alla fine; saltabile.
- [ ] 4 modelli di telefono (Fone 8, X, 12, 14) completamente smontabili e rimontabili, ognuno con procedura distinta e fedele.
- [ ] Meccaniche presenti e funzionanti: viti con tipi/lunghezze, tappetino magnetico, long screw damage, calore/adesivo, ordine di scollegamento batteria, pulizia/corrosione, diagnosi, test finale, pairing.
- [ ] Almeno 12 tipi di guasto diversi generati per i clienti.
- [ ] Economia completa: preventivi, ricambi a 3 qualità, affitto, mance, reputazione, recensioni, resoconto giornaliero, mercatino usato.
- [ ] Almeno 20 strumenti/upgrade con effetto meccanico reale e 30+ decorazioni.
- [ ] Espansione in 3 fasi (bancarella → chiosco → negozio) visivamente distinte.
- [ ] Ciclo giorno/notte e pioggia, mare animato, vita sull'isola (barche, gabbiani, persone).
- [ ] Musica procedurale adattiva + ambiente + SFX, tutto sintetizzato, con mixer.
- [ ] Salvataggio/caricamento a slot affidabile; nessun leak dopo 10 giornate simulate.
- [ ] Italiano e Inglese completi.
- [ ] Nessun asset esterno, nessun marchio reale (Apple/iPhone), nessun placeholder, nessun TODO.
- [ ] `README.md` con istruzioni di avvio, comandi, struttura del progetto e controlli di gioco.
- [ ] Screenshot finali in `docs/screenshots/final/`.

---

## 16. Cose da NON fare

- Non ridurre lo scope di tua iniziativa per "finire prima": se il tempo stringe, completa le milestone in ordine con qualità alta piuttosto che tutte a metà, e documenta cosa resta in `PROGRESS.md`.
- Non usare cubi/sfere come rappresentazione finale di nessun oggetto.
- Non caricare nulla da CDN o da internet a runtime.
- Non usare `alert()`/`confirm()`/`prompt()` del browser.
- Non bloccare il main thread per più di 50 ms (genera texture e geometrie pesanti a chunk o in Web Worker con `OffscreenCanvas`).
- Non lasciare console.log rumorosi in produzione.

**Inizia ora da M0 e procedi in autonomia fino alla Definition of Done.**