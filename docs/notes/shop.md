# Negozio (3 fasi), cantiere e decorazioni — note

Tutto procedurale (nessun asset esterno). Demo: `dev/shop.html` (`npx vite --port 5182 --strictPort`), API di debug
`window.__shop = { setStage, setTime, setCam, showDecor(id|'all', from?, to?), setUpgrades, setOpts, showSite(2|3), auditDecor(), env, build }`.

## File
| File | Contenuto |
| --- | --- |
| `src/procgen/textures/props-textures.ts` | atlante 4×4 di tessere in scala di grigi (`TILE`) + texture ripetibili legno/paglia/intonaco/tela; cache per `textureScale`; `disposePropTextureCache()` |
| `src/procgen/textures/props-art.ts` | arte dei poster (canvas) |
| `src/procgen/props/kit.ts` | `Batch` (merge per materiale, ossi rigidi), `Pen`, `makeUber` (PBR con attributo per-vertice `rme` = roughness/metalness/emissione/sway), geometrie (`rbox`, `bamboo`, `tube`, `leaf`…) |
| `src/procgen/props/parts.ts` | sedie, ventilatori, split, lampade, radio, tablet, casse, portatelefoni, contenitori, prodotti, lucine, bandierine |
| `src/procgen/props/shop.ts` | `buildShop`, tipi pubblici, re-export di `buildConstructionSite` |
| `src/procgen/props/stage1.ts` / `stage2.ts` / `stage3.ts` | le tre fasi |
| `src/procgen/props/shop-common.ts`, `shop-ctx.ts`, `shop-types.ts`, `signs.ts` | elementi comuni, contesto, tipi, insegne su canvas |
| `src/procgen/props/site.ts` | cantiere notturno animato |
| `src/procgen/props/decor.ts` + `decor/*.ts` | `buildDecor`, `DECOR_IDS` |
| `src/data/decor.json`, `src/data/i18n/{it,en}/decor.json` | dati e testi delle 37 decorazioni |

## API effettiva
Identica al contratto (`ShopUpgrades`, `ShopOptions`, `ShopEnv`, `Rect`, `ShopBuild`, `buildShop`, `buildConstructionSite`,
`DecorModel`, `buildDecor`). Differenze/aggiunte:
- `ShopBuild.floorHeightAt(x, z): number` (extra): quota del piano calpestabile — 0 sulla sabbia, 0.10 sulla pedana (fase 2),
  0.03 sul pavimento (fase 3). `anchors.seat.y` segue già questa quota. Le decorazioni `ground` vanno posate a questa quota.
- `buildDecor` lancia un errore su id sconosciuto; `decor.ts` esporta anche `DECOR_IDS`.
- Mesh con nome, utili al gioco: `shop-awning` (tendone fase 1), `shop-roof` (paglia fase 2: nasconderla in modalità
  arredamento isometrica), `shop-walls`, `shop-glass`, `shop-lights`, `shop-wood`, `shop-props`, `shop-drips`.
- `interactables.fan` è lo split a parete in fase 3 con `fan: 2`; il ventilatore a piantana nelle fasi 1-2.
- `lampLight`: il gioco ne controlla `visible`/`intensity`; il paralume si accende di conseguenza.
- Luci locali reali: 1 PointLight con `lights ≥ 1` e 1 SpotLight con `lights = 2`, accese solo con `env.lampsOn`. Tutte le lucine sono emissive.
- `update`: pale e oscillazione del ventilatore, aletta dello split, tendone/bandierine/ciuffi di paglia col vento (shader),
  dissolvenza lucine e insegna, gocce dal bordo del tendone/tetto con `env.rain` (fasi 1-2).
- Le texture condivise restano in cache dopo `dispose()`; liberarle con `disposePropTextureCache()` alla chiusura.

## Slot per fase
| | wall | hang | shelf (base / +mensole) | device | decorArea |
| --- | --- | --- | --- | --- | --- |
| Fase 1 | 4 | 6 | 4 / 5 | 3 | x ±4.5, z −3.2…3.6 |
| Fase 2 | 7 | 7 | 7 | 6 | x ±5, z −3.6…4.2 |
| Fase 3 | 12 | 9 | 12 | 10 | x ±5.5, z −4.2…5 |

`rackSlots`: 3 / 5 / 8 secondo `upgrades.rack`.

## Budget misurato (demo, camera standard)
| Fase | mesh (draw call senza ombre) | di cui proiettano ombra | triangoli (base → upgrade massimi) |
| --- | --- | --- | --- |
| 1 Bancarella | 11 | 9 | 45k → 52k |
| 2 Chiosco | 12 | 9 | 57k → 64k |
| 3 Negozio | 12 | 9 | 57k → 62k |
| Cantiere | 3 | 2 | 17k (→2) / 24k (→3) |

Con il passaggio ombre: ≈ 20-21 draw call per fase (limite 45). Decorazioni: 1-2 mesh e ≤ 4.7k triangoli ciascuna.

## Decorazioni (37)
plants: plant_monstera, plant_banana, plant_palm, plant_orchid, plant_frangipani, plant_fern ·
lights: lantern_paper, lantern_bamboo, string_lights, tiki_torch, candle_coconut ·
beach: surfboard_stand, surfboard_wall, shell_giant, starfish, fishing_net, beach_umbrella, deck_chair, hammock, coconut_crate ·
furniture: barrel_table, rug_woven, rug_round, fountain ·
signs: neon_open, neon_phone, neon_palm, sign_arrows ·
animals: aquarium, parrot_perch ·
art: poster_sunset, poster_longtail, poster_repair ·
luck: spirit_house, lucky_cat, phuang_malai, wind_chimes.

Animate: pesci e bolle, pappagallo, zampa del gatto, fiamme, fontana, campane (ossi rigidi); foglie, lanterne, amaca, tele (vento nello shader);
neon sempre accesi con sfarfallio, lanterne/lucine con `env.lampsOn`.

## Scelte e problemi noti
- Dalla camera standard (2.6, 2.3, 4.2) tendone e tetto occupano per forza la fascia alta dell'inquadratura: la falda è inclinata
  in modo da mostrarne il lato superiore; orizzonte e mare restano liberi.
- Il cartello della fase 1-2 è su palo/portale davanti a sinistra (bifacciale); in fase 3 è un lightbox bifacciale sul tetto.
- Sotto tendone/tetto il banco è in ombra: serve una luce ambiente calda (rimbalzo della sabbia) nel World, altrimenti il legno risulta spento.
  In alternativa si può mettere `castShadow = false` su `shop-awning`.
- Fase 3: niente soffitto (diorama); muri destro e posteriore tagliati a gradoni.
- Il testo thai dipende dai font di sistema.
- Chioma dell'ombrellone e tavola da surf a parete sporgono oltre il footprint dichiarato.
- Animazioni delle decorazioni verificate a vista solo in parte (zampa del gatto su due scatti; le altre girano senza errori).

## Screenshot
`docs/screenshots/wip/shop/`: `stage{1,2,3}-{day,golden,night}.png`, `site2.png`, `site3.png`, `decor-final-{A,B,C,night}.png`, `decor-one-*.png`.
