/**
 * Modelli 3D procedurali degli strumenti di riparazione.
 *
 * Convenzioni (metri):
 *  - strumenti a mano: punta di lavoro all'origine, corpo lungo +Y;
 *  - apparecchi da banco: centro della base all'origine, fronte verso +Z, ingombro ≤ 0.30 × 0.30 m.
 * Ogni modello usa i materiali condivisi del modulo (1 mesh opaca + al più 1 mesh "glow" per display/LED/parti
 * incandescenti; gli apparecchi da banco possono avere una mesh trasparente). `dispose()` libera le geometrie
 * del modello; materiali e texture condivisi si liberano con `disposeToolShared()`.
 */
import { buildBatteryTester, buildHeatPlate, buildHotAirStation, buildMicroscope, buildPowerSupply, buildProgrammer, buildSeparator, buildUltrasonic } from './bench';
import { buildBrush, buildCard, buildDriver, buildExtractor, buildPick, buildSpudger, buildSuction, buildToothpick, buildTweezers } from './hand-a';
import { buildAdhesive, buildAir, buildEsd, buildFlashlight, buildHeatHand, buildIpa, buildSolderIron, buildUsbTester } from './hand-b';
import type { ToolModel } from './kit';

export type { ToolModel } from './kit';
export { disposeToolShared } from './kit';

interface ToolDef {
  tiers: number;
  /** tier a partire dal quale il modello è un apparecchio da banco (0 = mai) */
  benchFrom: number;
  build(tier: number): ToolModel;
}

const DEFS: Record<string, ToolDef> = {
  driver: { tiers: 3, benchFrom: 0, build: buildDriver },
  spudger: { tiers: 3, benchFrom: 0, build: buildSpudger },
  pick: { tiers: 1, benchFrom: 0, build: buildPick },
  suction: { tiers: 3, benchFrom: 0, build: buildSuction },
  tweezers: { tiers: 3, benchFrom: 0, build: buildTweezers },
  heat: { tiers: 3, benchFrom: 3, build: (t) => (t >= 3 ? buildHeatPlate() : buildHeatHand(t)) },
  brush: { tiers: 2, benchFrom: 0, build: buildBrush },
  ipa: { tiers: 1, benchFrom: 0, build: buildIpa },
  air: { tiers: 2, benchFrom: 0, build: buildAir },
  toothpick: { tiers: 1, benchFrom: 0, build: buildToothpick },
  multimeter: { tiers: 2, benchFrom: 2, build: (t) => (t >= 2 ? buildPowerSupply() : buildUsbTester()) },
  flashlight: { tiers: 1, benchFrom: 0, build: buildFlashlight },
  extractor: { tiers: 1, benchFrom: 0, build: buildExtractor },
  adhesive: { tiers: 2, benchFrom: 0, build: buildAdhesive },
  card: { tiers: 1, benchFrom: 0, build: buildCard },
  esd: { tiers: 2, benchFrom: 0, build: buildEsd },
  solder: { tiers: 2, benchFrom: 2, build: (t) => (t >= 2 ? buildHotAirStation() : buildSolderIron()) },
  ultrasonic: { tiers: 1, benchFrom: 1, build: buildUltrasonic },
  microscope: { tiers: 1, benchFrom: 1, build: buildMicroscope },
  programmer: { tiers: 1, benchFrom: 1, build: buildProgrammer },
  separator: { tiers: 1, benchFrom: 1, build: buildSeparator },
  battester: { tiers: 1, benchFrom: 1, build: buildBatteryTester },
};

export const TOOL_MODEL_IDS: string[] = Object.keys(DEFS);

/** Tier disponibili per uno strumento (es. [1, 2, 3]); vuoto se l'id è sconosciuto. */
export function toolTiers(toolId: string): number[] {
  const d = DEFS[toolId];
  return d ? Array.from({ length: d.tiers }, (_, i) => i + 1) : [];
}

/** true se il modello (toolId, tier) è un apparecchio da banco (base all'origine, fronte +Z). */
export function isBenchTool(toolId: string, tier: number): boolean {
  const d = DEFS[toolId];
  return !!d && d.benchFrom > 0 && Math.min(Math.max(1, Math.round(tier)), d.tiers) >= d.benchFrom;
}

/** Costruisce il modello; il tier viene limitato all'intervallo disponibile. Lancia se l'id è sconosciuto. */
export function buildTool(toolId: string, tier: number): ToolModel {
  const d = DEFS[toolId];
  if (!d) throw new Error(`buildTool: strumento sconosciuto "${toolId}"`);
  return d.build(Math.min(Math.max(1, Math.round(tier)), d.tiers));
}
