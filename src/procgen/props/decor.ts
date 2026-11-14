/**
 * Decorazioni piazzabili (dati in `src/data/decor.json`), tutte procedurali.
 * Origine del modello: ground = centro del footprint a terra; wall = punto di aggancio (schiena su z=0,
 * sporge verso +Z); hang = punto di sospensione (pende verso -Y); shelf = base.
 * Ogni decorazione: 1 mesh fusa (+ al più vetro/faccia poster), ≤ 3 draw call, ≤ 6k triangoli.
 */
import { aquarium, parrotPerch } from './decor/animals';
import { posterLongtail, posterRepair, posterSunset } from './decor/art';
import { barrelTable, beachUmbrella, coconutCrate, deckChair, fishingNet, hammock, shellGiant, starfish, surfboardStand, surfboardWall } from './decor/beach';
import type { DecorOpts } from './decor/decor-kit';
import { fountain, rugRound, rugWoven } from './decor/furniture';
import { candleCoconut, lanternBamboo, lanternPaper, stringLightsDecor, tikiTorch } from './decor/lights';
import { luckyCat, phuangMalai, spiritHouse, windChimes } from './decor/luck';
import { plantBanana, plantFern, plantFrangipani, plantMonstera, plantOrchid, plantPalm } from './decor/plants';
import { neonOpen, neonPalm, neonPhone, signArrows } from './decor/signs';
import type { DecorModel } from './shop-types';

export type { DecorModel } from './shop-types';

const BUILDERS: Record<string, (o: DecorOpts) => DecorModel> = {
  plant_monstera: plantMonstera,
  plant_banana: plantBanana,
  plant_palm: plantPalm,
  plant_orchid: plantOrchid,
  plant_frangipani: plantFrangipani,
  plant_fern: plantFern,
  lantern_paper: lanternPaper,
  lantern_bamboo: lanternBamboo,
  string_lights: stringLightsDecor,
  tiki_torch: tikiTorch,
  candle_coconut: candleCoconut,
  surfboard_stand: surfboardStand,
  surfboard_wall: surfboardWall,
  shell_giant: shellGiant,
  starfish,
  fishing_net: fishingNet,
  beach_umbrella: beachUmbrella,
  deck_chair: deckChair,
  hammock,
  coconut_crate: coconutCrate,
  barrel_table: barrelTable,
  neon_open: neonOpen,
  neon_phone: neonPhone,
  neon_palm: neonPalm,
  sign_arrows: signArrows,
  rug_woven: rugWoven,
  rug_round: rugRound,
  fountain,
  aquarium,
  parrot_perch: parrotPerch,
  poster_sunset: posterSunset,
  poster_longtail: posterLongtail,
  poster_repair: posterRepair,
  spirit_house: spiritHouse,
  lucky_cat: luckyCat,
  phuang_malai: phuangMalai,
  wind_chimes: windChimes,
};

/** Id di tutte le decorazioni costruibili. */
export const DECOR_IDS: readonly string[] = Object.keys(BUILDERS);

export function buildDecor(itemId: string, opts: { textureScale?: number; shopName?: string } = {}): DecorModel {
  const make = BUILDERS[itemId];
  if (!make) throw new Error(`buildDecor: decorazione sconosciuta "${itemId}"`);
  return make(opts);
}
