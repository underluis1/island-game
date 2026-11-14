# Decisioni

Una riga per scelta: decisione — motivo.

- Marchio fittizio "Pear" (Fone 8 / X / 12 / 14, sistema PearOS, logo a pera) — nessun marchio reale, architettura interna ispirata ai modelli di riferimento.
- Origine del mondo = centro del tappetino da lavoro, piano del banco a y = 0,90 — tutte e tre le fasi del negozio condividono la stessa postazione.
- Telefoni definiti in JSON generati da `scripts/gen-phones.mjs` — meno errori di battitura su ~30 viti per modello; il gioco legge solo i JSON.
- Stato dei componenti a tre livelli (montato / aperto a libro / rimosso) — serve a modellare display e vetro posteriore incernierati prima di scollegarli.
- I connettori richiedono solo che le cover sopra siano aperte, non rimosse — rispecchia la procedura reale (batteria scollegata con il display ancora attaccato).
- Fone 14 con due lati di lavoro (display davanti, tutto il resto dal retro, connettore batteria dal davanti) — procedura distinta dagli altri modelli.
- Modalità "strict" solo nel tutorial: le azioni pericolose vengono rifiutate con spiegazione invece che punite — si impara senza frustrazione.
- Svitare non spana quasi mai una vite sana; il rischio vero è stringere troppo, e una vite spanata esce comunque a tentativi anche senza estrattore — nessuna riparazione può restare bloccata.
- Celle del tappetino magnetico da 4 viti; tappetino da 8 / 15 / 24 celle — con il kit base bisogna scegliere come raggruppare le lunghezze.
- La profondità del foro compare nel tooltip solo con la guida accesa — a guida spenta conta la memoria (bonus "Esperto").
- Giornata giocabile 07:00–22:00 in 12 minuti; nella vista riparazione il tempo scorre al 55% — una riparazione sta in una giornata senza togliere pressione.
- Diagnosi a scelta fra 3–4 ipotesi, con gli strumenti che ne escludono alcune — dà un ruolo concreto a multimetro, tester batteria e alimentatore.
- Decorazioni a parete/appese/su mensola agganciate a slot dell'edificio; a terra su griglia da 0,5 m — piazzamento sempre valido visivamente.
- Luce di lavoro e lampada sempre in scena, spente con intensità 0 — aggiungere luci a caldo ricompila tutti gli shader.
- Il tendone non proietta ombra — altrimenti il banco resta grigio e illeggibile.
- API di automazione `window.__game` attiva in sviluppo o con `?debug` — i test e2e girano sulla build di produzione, dove altrimenti non esisterebbe.
- Chiusura anticipata del negozio con `N` dopo le 18:00 — l'HUD non ha un pulsante dedicato.
- Font di sistema arrotondati — nessun font da scaricare o includere.
- Lavoro suddiviso in moduli con contratti (mondo, negozio, modelli, audio, simulazione, UI) sviluppati in parallelo — vedi `docs/notes/`.
