# Mondo (render/) — note d'uso

Demo: `npx vite --port 5181 --strictPort` → `http://localhost:5181/dev/world.html`
(`?q=low|medium|high|ultra`, `?t=17.9`, `?cycle=1`, `?hud=0`; drag = guarda, WASD/QE = muovi).
Da console / `--eval`: `__world.setTime(h)`, `setRain(x)`, `setWind(x)`, `setCam(pos, target)`, `setQuality(l)`,
`setFocus(x,y,z,r)`, `setSupplier(state)`, `setDof(on, dist, range, bokeh)`, `outline(channel, on)`, `benchmark()`,
`longTasks()`, `slowFrames()`, `triangles()`; `__stats` = fps, drawCalls, triangles, initMs, maxInitBlockMs.

## API (conforme al contratto)

`Engine` (`src/render/engine.ts`), `World` (`src/render/world.ts`), `QUALITY_PRESETS` (`src/render/quality.ts`).
Scostamenti / precisazioni:

- `Engine.benchmark()` **applica** anche il preset scelto (oltre a restituirlo).
- `Engine.resize()` dimensiona il canvas a `window.innerWidth × innerHeight`.
- `renderer.toneMapping = ACESFilmic`, ma dentro il composer i materiali restano lineari HDR e ACES viene applicato
  una sola volta dal `ToneMappingEffect` (three applica il tone mapping dei materiali solo sul canvas). Esposizione: `renderer.toneMappingExposure`.
- three r187 ha rimosso `PCFSoftShadowMap`: si usa `PCFShadowMap` (che ora è soft, Vogel disk).
- `World.setShadowFocus`: rispettato alla lettera, ma il **default è r = 18** e per la vista bancarella consiglio r ≈ 16–18:
  con r ≈ 7 le ombre delle palme sulla spiaggia restano fuori dalla shadow map (sabbia e vegetazione sfumano l'ombra
  verso il bordo della copertura, quindi non si vede mai un taglio netto). Per la riparazione r ≈ 0.6 va benissimo.
- `World.update()` è attivo già durante `init()` (dopo ~15% del caricamento) e si può chiamare ogni frame da subito.
- `World.sunDirection` = direzione della luce chiave (sole; di notte una luna "rialzata" a 27° per illuminare la spiaggia;
  la luna visibile resta bassa sul mare per avere il riflesso in inquadratura).
- `World.lampsOn` = sole sotto 3.5° (≈ 18:25 → 06:10). Alba 06:00, tramonto 18:36 (azimut 18° a sinistra di −Z).
- Preset: campi extra `vegetationDensity`, `waterSegments`, `waterDetail`, `clouds`, `envMapSize`, `envRefreshHours`, `rainDrops`, `cost`.

## Layout

- Mare a −Z, livello `SEA_LEVEL = −0.42`, battigia `shorelineZ(x)` ≈ −15.6 davanti al negozio (`src/render/layout.ts`).
- Pad piatto e sgombro x∈[−6,6], z∈[−5,6] a quota 0 esatta (`heightAt` = 0); raccordo morbido entro 3.2 m.
- `beachPaths`: 3 polilinee (bagnasciuga, metà spiaggia a ~6.7 m dall'acqua, una sinuosa in mezzo); `customerPath`
  da (44, ·, −8.6) a (0, 0, −1.15). Barca fornitore: prua sulla sabbia a ≈ (9, ·, −14.5); arrivo 17 s, partenza 15 s.
- Karst lontani bassi (altezza/distanza < 0.15) perché la camera bancarella vede solo ~11° di cielo sopra l'orizzonte;
  i promontori laterali (x ≈ ±125…190) escono dall'inquadratura e la incorniciano.

## Prestazioni misurate (Chromium headless, GPU Metal, 1600×900, camera bancarella, ore 10)

| Preset | draw call (totale, post incluso) | triangoli | note |
| --- | --- | --- | --- |
| Low | 18 | 219k | FXAA, niente bloom/nuvole/caustiche |
| Medium | **30** | **271k** | budget ambiente: ≤ 90 / ≤ 350k |
| High | 50 | 557k | NormalPass + SSAO raddoppiano la geometria |
| Ultra | 50 | 607k | shadow map 4096, texture ×2 |

60 fps (vsync) su tutti i preset sulla macchina di test; `benchmark(3)` sceglie `medium` in headless.
Con pioggia +1 draw call; con outline attivo l'OutlineEffect ridisegna la profondità della scena (solo mentre c'è una selezione).
`init()`: ~0.7 s, blocco massimo del main thread 35–80 ms a seconda del carico (compilazione shader asincrona con
`compileAsync`, texture e geometrie generate a fette da ~9 ms).

## Problemi noti

- Il blocco massimo in `init()` può superare di poco i 50 ms a cache shader fredda / CPU occupata (primo bake PMREM).
- `setQuality` a caldo causa un singhiozzo (0.4–1.4 s verso Ultra: ricompilazione shader, texture più grandi).
- Aggiungere/rimuovere luci in scena ricompila gli shader dell'ambiente: tenere le luci delle lampade sempre in scena e
  spegnerle con `intensity = 0`.
- La pioggia non conosce il tendone (le gocce svaniscono entro ~1.2 m dalla camera, quindi nella vista riparazione non disturbano).
- Con override material (NormalPass/outline) palme e mare sono resi senza vento/onde: irrilevante in pratica.
- Il piede delle palme molto inclinate entra nella sabbia con un angolo netto; nessuna scia dietro le barche di passaggio.

Screenshot: `docs/screenshots/wip/world/final-*.png`.
