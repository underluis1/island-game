# Audio — note di design e API

Tutto l'audio è sintetizzato a runtime con Web Audio API: nessun file, nessuna libreria. Il codice vive in
`src/audio/`, la demo in `dev/audio.html` (+ `src/dev/audio-demo.ts`), la verifica oggettiva in
`scripts/audio-check.mjs`, i test unitari in `tests/unit/audio-*.test.ts`.

## Uso

```ts
import { AudioEngine } from './audio';

const audio = new AudioEngine();                 // non crea l'AudioContext
window.addEventListener('pointerdown', () => void audio.unlock(), { once: true });

audio.setVolumes(settings.volume);               // { master, music, ambience, sfx, voice } in 0..1
// a ogni frame:
audio.setEnvironment({ timeOfDay, rain, wind, boat, crowd, indoors });
audio.loop('screw_spin', holding, speed01);      // richiamabile a ogni frame
audio.update(dt);                                // scheduler di musica e ambiente

audio.sfx('screw_seat');                         // no-op prima di unlock
audio.sfx('screw_drop', { pan: -0.3, volume: 0.8, pitch: 1.1 });
const line = audio.speak('Sawasdee krap!', 'somchai', { onDone: next });   // line.duration, line.stop()
audio.nextStation();                             // radio: auto → island_lofi → thai_khim → sunset_ambient → beach_groove → off
audio.setFocus(1);                               // riparazione delicata: musica più piano, scura, con meno layer
audio.setPaused(true);                           // menu pausa
```

## API effettiva (`src/audio/engine.ts`)

Il contratto concordato è rispettato alla lettera. In più:

| Aggiunta | A cosa serve |
| --- | --- |
| `new AudioEngine({ context?, seed?, station? })` | `context`: un `BaseAudioContext` esistente (es. `OfflineAudioContext`) → motore subito sbloccato, usato dai test. `seed`: stessa musica a parità di seme (default casuale per sessione). `station`: stazione iniziale. |
| `engine.context` | il contesto in uso (`null` prima di `unlock`) |
| `engine.createAnalyser(fftSize?)` | `AnalyserNode` sull'uscita finale (VU meter della radio, test). Va scollegato da chi lo crea. |
| `engine.debugStats()` | istantanea: sorgenti one-shot vive, loop attivi, statistiche di musica (stile, battute, note per layer, deck) e ambiente (onde, gabbiani, tuoni, strati costruiti) |
| `RADIO_STATIONS` | ordine delle stazioni usato da `nextStation()` |
| `SfxOptions` | tipo di `{ pitch?, volume?, pan? }` |

Comportamenti da conoscere:

- **Prima di `unlock()`** tutto è no-op sicuro; i valori impostati (volumi, ambiente, stazione, focus, pausa)
  vengono ricordati e applicati allo sblocco. `speak()` restituisce comunque la durata e chiama `onDone` con un timer.
- **`speak().stop()` non chiama `onDone`**: `onDone` scatta solo alla fine naturale. Una nuova frase della stessa
  voce interrompe la precedente; al massimo 3 frasi insieme.
- **`sfx()`**: limite di voci e intervallo minimo per nome (es. `screw_turn`: 6 voci, 8 ms), quindi regge le
  raffiche; viene ignorato se il contesto è sospeso (scheda in background).
- **`setStation()`** suona `radio_tune` e cambia stile con stacco rapido (~0,3 s). In `auto` il cambio di fascia
  oraria avviene invece al **confine di battuta**, con dissolvenza incrociata di ~2,4 s.
- **`setPaused(true)`**: musica a −8 dB con passa-basso a 750 Hz, ambiente al 35%, loop degli strumenti muti;
  gli SFX dell'interfaccia restano a volume pieno.
- **Volumi**: curva quadratica (slider percettivamente uniforme).

## Struttura

| File | Contenuto |
| --- | --- |
| `types.ts` | tipi pubblici |
| `common.ts` | primitive one-shot (`tone`, `noise`, `modal`, `fm`, `click`), inviluppi, buffer di rumore condivisi, soft-clip |
| `sfx.ts` | i 67 SFX (`SFX`, `SFX_NAMES`, `playSfx`, `triggerSfx`) |
| `loops.ts` | gli 8 loop degli strumenti (`LoopBank`) |
| `music-theory.ts` | **puro**: scale, accordi, stili, generatore di sezioni con seed, forma, mix per ora del giorno |
| `scheduler.ts` | **puro**: `BarClock` (lookahead a battute), `swingBeat`, `EventTimer` |
| `instruments.ts` | Karplus-Strong (khim, nylon), ranat/marimba, piano elettrico FM, pad, basso, flauto khlui, campane, percussioni, impulso del riverbero, crackle |
| `music.ts` | `MusicPlayer`: deck per stile, layer, riverbero, wow da nastro, focus/pausa |
| `ambience.ts` | `Ambience`: mare, vento, fauna, notte, long-tail, folla, pioggia e tuoni |
| `voice-text.ts` | **puro**: testo → sillabe, intonazione, profili delle 12 voci |
| `voices.ts` | sintesi a formanti di una frase |
| `analysis.ts` | **puro**: FFT, centroide, bande, onset, altezza (usato da test e demo) |
| `engine.ts` | `AudioEngine`: mixer e API pubblica |

Grafo: `musica`, `ambiente`, `sfx` (+ loop), `voci` → `master` → compressore morbido (−14 dB, 3,5:1) →
soft-clip a tangente iperbolica (lineare fino a 0,6, mai oltre 0,96) → uscita. Il soft-clip garantisce che non si
arrivi mai al clipping digitale, qualunque cosa suoni insieme.

## SFX

Ricetta dei suoni tattili: **transiente** di rumore filtrato (il contatto) + **corpo** tonale con sweep discendente
(la massa) + **risonanze modali** inarmoniche (il metallo: rapporti 1 : 2,76 : 5,40 : 8,93 della barretta libera).
A ogni chiamata cambiano pitch (±`vary`), frequenze dei modi, tempi e numero di rimbalzi/schiocchi.

- Gli inviluppi partono da 0, decadono in esponenziale fino a −60 dB e chiudono con una rampa lineare a 0: nessun
  click di discontinuità (verificato: coda e ultimo campione a 0 per tutti i 67 SFX).
- `click()` è un passa-banda largo e non un passa-alto: la prima versione aveva troppa energia sopra i 10 kHz
  (i click risultavano "sputati"); la misura del centroide lo ha fatto emergere.
- `cash` = tasto e meccanismo (tonfo + clip) → campanello modale a 2637 Hz con secondo rintocco → cassetto che
  scorre e batte → 5-7 monete.
- `screw_drop` = 3-5 rimbalzi con intervalli e ampiezze decrescenti, poi un breve rotolio.
- I jingle (`day_start`, `day_end`, `success`…) sono in Re maggiore e non hanno variazione di pitch.

## Musica

- **Sezioni di 8 battute** su progressioni predefinite per stile. La melodia nasce da un motivo di due battute
  (figura ritmica da un banco + contorno ad arco sui gradi della pentatonica) sviluppato come A · A′ · B · A″:
  la risposta riusa il ritmo della domanda e ne cambia la coda, l'ultima unità chiude con una nota lunga di
  cadenza e poi silenzio (il "respiro"). Le note sui tempi forti si agganciano ai suoni dell'accordo.
- **Forma a rondò** (`planSection`): il tema torna a ogni giro e cambia ogni due giri, gli episodi si rinnovano
  a ogni giro; le riprese sono variate (acciaccature, note deboli che cadono). Stesso seme ⇒ stesso brano.
- **Stili / stazioni**: `island_lofi` (74 bpm, swing, Re maggiore: nylon, piano elettrico, batteria lo-fi, crackle,
  wow da nastro), `thai_khim` (88 bpm, Do maggiore: khim con tremolo sulle note lunghe, ranat a crome spezzate,
  ching/chap sul 2 e sul 4, klong), `sunset_ambient` (58 bpm, La minore: khlui o campane, arpa, pad, niente
  batteria), `beach_groove` (102 bpm, Sol maggiore: marimba, levare "skank", conga, shaker).
  `auto`: mattina → thai_khim, pomeriggio → beach_groove, sera → sunset_ambient, notte → island_lofi.
- **Layer per ora del giorno** (`layerMix`, interpolazione continua): mattina senza cassa e con i pizzicati in
  primo piano; pomeriggio con batteria, basso e tastiere pieni; sera pad e riverbero con ritmo appena accennato;
  notte poche note su un tappeto scuro. Ogni evento ha un `weight`: quando la densità cala spariscono prima le
  note deboli, quindi la melodia si dirada senza cambiare. I guadagni dei layer vengono aggiornati a confine di battuta.
- **Focus**: batteria e contrappunto escono, melodia più rada, filtro da 12 kHz a 1,7 kHz, −6 dB.
- **Karplus-Strong pre-renderizzato** in `AudioBuffer` (uno per nota, in cache): un anello di ritardo nel grafo
  Web Audio non scende sotto 128 campioni e non potrebbe intonare le note acute. L'anello è accordato con un
  all-pass frazionario (errore < 6 cent, testato).
- **Riverbero a convoluzione** con risposta generata: prime riflessioni sparse + coda di rumore che decade in
  2,6 s scurendosi.

## Ambiente

- **Mare**: ogni onda è una sequenza di automazioni su nodi persistenti — il corpo (rumore rosa, passa-basso che
  si apre) cresce per 2-4 s, frange, poi la schiuma (banda 2,4 → 5,2 kHz) risale la sabbia e si ritira. Durata,
  forza e posizione stereo cambiano a ogni onda.
- **Vento**: soffio a banda media + fruscio delle fronde, con raffiche ogni 2,5-7 s.
- **Fauna**: gabbiani (serie di 2-5 richiami ogni 14-42 s, solo di giorno e senza pioggia), uccellino del
  mattino, e di notte grilli (portanti a 3,9/4,4/5,1 kHz modulate da inviluppi di frinito in loop), insetti
  tropicali e ogni tanto il geco tokay.
- **Long-tail**: dente di sega alla frequenza di scoppio + rumore di scarico tagliato dagli scoppi. Il doppler
  nasce dalla derivata di `boat`: sale di tono in avvicinamento, scende in allontanamento (rapporto misurato 1,13).
- **Folla**: loop di 7 s pre-calcolato con 6 "parlatori" sintetici (treno glottale, due formanti per sillaba,
  pause tra le frasi), letto due volte a velocità e pan diversi.
- **Pioggia**: scroscio stereo, corpo a banda media e gocce sulla tenda (più forti al chiuso); tuoni ogni
  28-78 s sopra `rain > 0.55`.
- **`indoors`**: passa-basso (18 kHz → 1,9 kHz) e −6 dB su tutto l'esterno.
- Gli strati rari (notte, barca, folla, pioggia) vengono costruiti al primo uso. `setEnvironment` costa
  pochissimo: i parametri audio vengono toccati in `update` solo quando cambiano davvero.

## Voci

Una sillaba per ogni gruppo consonanti+vocali. La vocale sceglie le due formanti, la consonante l'attacco
(scoppio, soffio o apertura graduale). Punteggiatura: `?` fa salire le ultime sillabe (+6 semitoni), `!` alza
tutto e accenta l'ultima parola, `.` scende; virgole e puntini sono pause. Una frase intera usa una sola catena
di 12 nodi pilotata da automazioni, qualunque sia la lunghezza. Profili: Somchai è il più grave e lento
(98 Hz, 9,5 sillabe/s), l'assistente del tablet il più acuto e "pulito" (290 Hz, onda triangolare).

## Efficienza

- Buffer di rumore condivisi per contesto (bianco, rosa, bruno; 3 s, loop senza giunture).
- Ogni sorgente one-shot scollega la propria catena su `ended`; i deck musicali ritirati vengono smontati dopo la
  dissolvenza; i loop spenti dopo 0,6 s.
- `update()` non alloca buffer: genera una sezione ogni 8 battute (~0,1 ms) e, alla prima occorrenza di una
  nota, il suo buffer Karplus-Strong (~0,4 ms). Costruzione del grafo allo sblocco: ~26 ms; chiacchiericcio al
  primo uso: ~20 ms.

## Verifica

```bash
npx vitest run tests/unit/audio-          # 43 test: logica musicale, scheduler, voci, sintesi pura
npx vite --port 5184 --strictPort         # demo: http://localhost:5184/dev/audio.html
node scripts/audio-check.mjs              # 193 controlli oggettivi (--only sfx,mix,music,ambience,voice,loops,live; --verbose)
```

`audio-check.mjs` rende tutto con `OfflineAudioContext` nella pagina demo e misura i segnali. Le scene usano il
motore completo: il rendering viene sospeso ogni 100 ms per chiamare `engine.update()`, cioè lo stesso scheduler
lookahead del tempo reale.

- **SFX** (ognuno con due semi): niente NaN, picco ≤ 0,98, non silenzioso, durata e centroide spettrale entro
  l'intervallo atteso per quel tipo di suono, coda a zero, attacco puntuale, niente componente continua, variazione
  tra una chiamata e l'altra.
- **Musica**: livelli, numero di battute coerente col tempo, note per layer, differenze tra stazioni, determinismo
  col seme, layer per ora del giorno (batteria assente la mattina e la notte, attacchi forti al secondo, centroide),
  stazione `auto`, transizione a confine di battuta, zapping, focus, pausa.
- **Ambiente**: respiro della risacca, bande per giorno/notte/vento/pioggia/folla/interno, eventi rari, doppler.
- **Voci**: durata = piano, altezza vicina al profilo, `?` contro `.`, `onDone`, interruzione.
- **Loop**: suonano, si spengono a zero, vengono smontati; `screw_spin` segue `intensity`.
- **Mixer**: raffiche attraverso il master senza clipping, scena di 60 s senza sorgenti residue.
- **Tempo reale**: `AudioContext` vero nella demo, segnale in uscita, nessun errore in console, tempi sul main thread.

## Limiti noti

- **Nessuno ha ascoltato questi suoni**: la verifica è fatta solo di misure. Livelli, bande e durate sono
  sotto controllo; il carattere dei timbri va giudicato a orecchio nella demo. Gli intervalli attesi di centroide
  per `build_saw`, `display_open/close`, `rotate_decor`, `radio_tune` e `thunder` sono stati allargati dopo la
  prima misura, perché la stima iniziale era troppo stretta per suoni a banda larga.
- La musica viene programmata una battuta alla volta: layer, densità e focus reagiscono entro una battuta
  (2-4 s); filtro e volume di focus/pausa sono immediati.
- Se `update()` non viene chiamato (scheda in background) la musica si ferma a fine battuta e riparte al rientro.
- Tutto è in temperamento equabile: niente accordatura thai a 7 gradi.
- Il doppler della long-tail dipende dalla derivata di `boat`: se il valore salta invece di variare con
  continuità, il tono fa uno scalino (lisciato in ~0,4 s).
