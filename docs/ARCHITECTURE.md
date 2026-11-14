# Island Fix — Architettura

Stack: Vite + TypeScript strict + Three.js (WebGL2) + `postprocessing`. Nessun asset esterno: geometrie, texture,
musica e SFX sono generati via codice. UI = DOM + CSS sopra il canvas.

## Convenzioni globali

- Unità: **metri**, Y verso l'alto. Il telefono è a scala reale (≈ 0.07 × 0.15 m).
- **Origine del mondo = centro del tappetino da lavoro**: il piano del banco è a `y = 0.90`, centro tappetino `(0, 0.90, 0)`.
  Il banco occupa circa `x ∈ [-0.95, 0.95]`, `z ∈ [-0.42, 0.42]` in tutte e tre le fasi del negozio.
- Il **mare è verso -Z** (battigia a `z ≈ -16`), la spiaggia corre lungo X. Il giocatore siede a `+Z` e guarda verso `-Z`.
  I clienti si fermano a `(0, 0, -1.15)` guardando `+Z`. I karst sono nella baia a `z ∈ [-120, -450]`.
- Ora di gioco: `timeOfDay` in ore `[0, 24)`. Giornata giocabile 07:00 → 22:00.
- Logica di gioco (`src/gameplay`, `src/core`) **senza dipendenze da three/DOM**: testabile in Node con Vitest.
- i18n: `src/data/i18n/<lang>/<namespace>.json`, chiavi `namespace.percorso.chiave`, IT e EN sempre allineati.
- Nessun `console.log`, nessun `alert/confirm/prompt`, nessun `any`, nessun TODO/placeholder.
- Dispose: ogni oggetto che crea geometrie/materiali/texture espone `dispose()`.

## Moduli

| Cartella | Contenuto |
| --- | --- |
| `src/core` | event bus, RNG con seed, i18n, impostazioni, tween, stato di gioco, salvataggi |
| `src/render` | `Engine` (renderer, post-processing, preset qualità, benchmark), `World` (cielo, mare, spiaggia, karst, palme, barche, fauna, meteo, luci) |
| `src/procgen` | geometrie/texture procedurali: `phones/`, `tools/`, `props/` (bancarella, chiosco, negozio, decorazioni), `nature/`, `characters/`, `textures/` |
| `src/gameplay` | `repair/` (motore di smontaggio puro), `customers/`, `economy/`, `shop/`, `building/`, `tutorial/` |
| `src/audio` | motore Web Audio, musica procedurale adattiva, ambiente, SFX, voci |
| `src/ui` | HUD, tablet, menu, dialoghi (DOM + CSS) |
| `src/data` | JSON data-driven: telefoni, strumenti, decorazioni, bilanciamento, clienti, i18n |
| `src/game` | colla: modalità di gioco, viste, controller che collegano logica ↔ render ↔ audio ↔ UI |

## Budget prestazioni (preset Medio, scena principale)

Draw call totali < 200, triangoli < 600k. Ripartizione: ambiente ≤ 90 draw call / 350k tri; edificio + decorazioni ≤ 60;
personaggi ≤ 30; banco, telefono e strumenti ≤ 40 (nella vista bancarella il telefono è una mesh unita).
