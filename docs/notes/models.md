# Modelli procedurali: personaggi e strumenti

Demo: `npx vite --port 5183 --strictPort` → `http://localhost:5183/dev/models.html?show=<vista>`
(`characters`, `crowd`, `tools`, `hand`, `bench`, un `CharacterKind`, un `toolId`, `<toolId>:up`).
API di debug: `window.__models = { show, setAction, setTalking, setPhone, setActive, setCam, setTime, walkBy, step }`,
`window.__stats = { fps, calls, triangles, items[{ id, calls, tris }] }`. Screenshot in `docs/screenshots/wip/models/`.

## Personaggi — `src/procgen/characters`

```ts
import { createCharacter, AmbientCrowd, characterMaterial, disposeCharacterShared } from 'src/procgen/characters';

type CharacterKind = 'tourist' | 'local' | 'diver' | 'backpacker' | 'business'
  | 'somchai' | 'noi' | 'dive_instructor' | 'italian_backpacker' | 'chai' | 'assistant' | 'player';
type CharacterAction = 'idle' | 'walk' | 'talk' | 'wave' | 'give' | 'happy' | 'angry' | 'sit' | 'work' | 'think';
interface CharacterSpec { kind: CharacterKind; seed: number }
interface CharacterOptions { heightAt?(x, z): number; seatHeight?: number /* 0.58 */; benchHeight?: number /* 0.90 */ }
interface Character {
  readonly root: THREE.Group; readonly spec: CharacterSpec; readonly action: CharacterAction;
  setAction(a): void;                       // blend 0.25 s
  walkTo(target, speed = 1.25): Promise<void>;
  faceTowards(target): void; setTalking(on): void; setHeldPhone(color | null): void;
  update(dt): void; dispose(): void;
}
createCharacter(spec, opts?): Character
new AmbientCrowd({ count, seed, paths, heightAt?, seaDirection? })  // .root, .visibleCount, .update(dt, { timeOfDay, rain }), .dispose()
```

- Radice con i piedi all'origine, sguardo verso +Z; altezza 1.53–1.83 m (scala uniforme di un corpo canonico da 1.70 m).
- **1 SkinnedMesh = 1 draw call** per personaggio; 23 ossa; un solo `MeshStandardMaterial` a vertex color condiviso
  (`characterMaterial()`, si libera con `disposeCharacterShared()`); nessuna texture. `dispose()` libera geometria e scheletro.
- Accessori fusi nella geometria e pesati sull'osso giusto; il telefono in mano sta su un osso dedicato scalato a 0
  (`setHeldPhone` lo mostra e ne ricolora la scocca).
- Animazione tutta procedurale: ogni azione scrive un vettore di 49 parametri (busto, bersagli IK di mani e piedi, viso),
  i vettori si interpolano e un IK a due ossa li applica. Nessuna allocazione per frame.
- Viso: occhi che sbattono, sopracciglia (ossa `browL/R`), bocca con mandibola e angoli (`setTalking`, sorriso/broncio).
- `walkTo`: linea retta, rotazione morbida, cadenza legata alla distanza percorsa, torna a `idle`; una nuova `walkTo`
  o una `setAction` diversa da `walk` risolve la promise precedente.
- `sit`/`work`: la radice è il centro dello sgabello a terra. Con il banco a 0.90 m serve una seduta alta: il default
  `seatHeight` è 0.58 m (passare 0.46 per uno sgabello basso; le mani salgono comunque a `benchHeight`).
- Mr. Chai regge sempre la cassa col braccio sinistro (gesti solo col destro).

| Personaggio | Segni distintivi | Triangoli |
| --- | --- | --- |
| `somchai` | anziano, stempiato grigio, baffetti, occhiali sulla fronte, camicia a fiori turchese, infradito | 1881 |
| `noi` | chignon con fiore, maglietta rosa, gonna viola, grembiule chiaro | 2101 |
| `dive_instructor` | abbronzato, torso nudo, muta abbassata in vita, maschera sulla testa, collana | 1994 |
| `italian_backpacker` | ricci, barba, bandana rossa, canotta azzurra, zainone con materassino | 2247 |
| `chai` | cappello di paglia, sciarpa a quadri, cassa di ricambi | 2289 |
| `assistant` | coda di cavallo, polo turchese con logo, sneakers | 1893 |
| `player` | cappellino turchese, maglietta gialla con stampa sulla schiena, shorts di jeans | 2007 |
| generici (`tourist`, `local`, `diver`, `backpacker`, `business`) | da seed: genere, altezza, corporatura, pelle, capelli, abiti, cappelli, occhiali, macchina fotografica, zaino, maschera, cravatta | 1750–2490 |

`AmbientCrowd`: `count` personaggi (1 draw call ciascuno, quelli nascosti non costano nulla) lungo le polilinee `paths`
(gli estremi devono stare fuori campo: lì entrano ed escono). Presenze = `count × fattore orario × (1 − 0.8·rain)`:
piene 8:30–18, in calo fino alle 22, quasi nessuno di notte. Chi è di troppo esce camminando (più in fretta con la pioggia);
ogni tanto qualcuno si ferma 4–10 s rivolto verso il mare.

## Strumenti — `src/procgen/tools`

```ts
interface ToolModel { root: THREE.Group; update?(dt, active): void; dispose(): void }
buildTool(toolId, tier): ToolModel      // tier limitato all'intervallo valido; lancia su id sconosciuto
TOOL_MODEL_IDS: string[]                // 22 id
toolTiers(toolId): number[]             // es. [1, 2, 3]
isBenchTool(toolId, tier): boolean
disposeToolShared(): void               // materiali e atlante condivisi, solo alla chiusura
```

Scala reale. A mano: punta all'origine, corpo lungo +Y. Da banco: centro della base all'origine, fronte +Z.
Tre materiali condivisi (`tools-main` opaco con colore/roughness/metalness per vertice e stampe da atlante,
`tools-glow` per display/LED/resistenze, `tools-glass` per il coperchio della vasca) e un atlante canvas 2048×1024 in cache.

Draw call / triangoli (m = a mano, b = da banco):

| toolId | t1 | t2 | t3 |
| --- | --- | --- | --- |
| driver | m 1/608 | m 1/1622 | m 1/1718 |
| spudger | m 1/500 | m 1/486 | m 1/674 |
| pick | m 1/188 | | |
| suction | m 1/1176 | m 1/1776 | m 1/2288 |
| tweezers | m 1/776 | m 1/760 | m 1/760 |
| heat | m 2/1390 | m 2/1342 | b 2/1582 |
| brush | m 1/512 | m 1/710 | |
| ipa | m 1/724 | | |
| air | m 1/1590 | m 1/916 | |
| toothpick | m 1/192 | | |
| multimeter | m 2/564 | b 2/3232 | |
| flashlight | m 2/1230 | | |
| extractor | m 1/1068 | | |
| adhesive | m 1/1962 | m 1/530 | |
| card | m 1/188 | | |
| esd | m 1/2004 | m 1/≈2918 | |
| solder | m 3/2980 | b 2/3576 | |
| ultrasonic | b 3/1652 | | |
| microscope | b 2/4690 | | |
| programmer | b 2/1570 | | |
| separator | b 2/2240 | | |
| battester | b 2/1864 | | |

`update(dt, active)`: resistenza del phon/heat gun che si arrossa con inerzia, display e LED di tutti gli apparecchi,
anello LED del microscopio, lente della torcia, punta calda del saldatore, micro-vibrazione di vasca e separatrice.

## Problemi noti

- `solder` t1 ha 3 draw call (budget 2): il supporto con molla è una mesh separata (`root.getObjectByName('stand')`)
  per poterlo lasciare sul banco quando lo stilo è sul cursore; lo stilo da solo ne ha 2.
- Etichette di `ipa` e `air` t2 dritte a contenitore appoggiato, quindi capovolte in uso con la punta in basso.
- Nessuna ventola in rotazione negli strumenti.
- Gonne e grembiule si deformano male da seduti (`sit`/`work` con `noi` o clienti in gonna).
- Capelli lunghi sotto i cappelli a tesa si leggono come due ciocche sottili ai lati del viso.
- Le decalcomanie del viso stanno 2–4 mm sopra la testa: nessuno z-fighting osservato nella demo, non provato a 30+ m.
