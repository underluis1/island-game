import { hashString } from '../../core/rng';
import { evaluatePhone } from './evaluate';
import { PhoneModel } from './model';
import type { PhoneDef, PhoneInstance } from './types';

export interface AmmeterReading {
  amps: number;
  /** i18n key suffix: repair.ammeter.<pattern> */
  pattern: 'no_current' | 'trickle' | 'unstable' | 'boot_no_screen' | 'charging_ok' | 'charging_slow';
}

function jitter(phone: PhoneInstance, salt: string, span: number): number {
  return ((hashString(phone.uid + salt) % 1000) / 1000 - 0.5) * span;
}

/** What a USB ammeter shows when the phone is plugged in: the first clue of every diagnosis. */
export function ammeterReading(def: PhoneDef | PhoneModel, phone: PhoneInstance): AmmeterReading {
  const model = def instanceof PhoneModel ? def : new PhoneModel(def);
  const report = evaluatePhone(model, phone);
  const port = model.def.components.find((c) => c.partCategory === 'charge_port');
  const portState = port ? phone.comps[port.id]! : null;
  const board = model.boardId ? phone.comps[model.boardId]! : null;
  const bat = model.batteryId ? phone.comps[model.batteryId]! : null;
  if (!port || !portState || portState.state === 'removed' || portState.condition === 'damaged' || portState.dirt > 0.5) {
    return { amps: 0, pattern: 'no_current' };
  }
  if (phone.boardFaults.some((f) => f.affects.includes('charging')) || report.functions.charging === 'fail' && report.functions.power === 'pass') {
    return { amps: 0.02 + Math.abs(jitter(phone, 'a', 0.03)), pattern: 'trickle' };
  }
  if (board && (board.corrosion > 0.45 || board.condition === 'damaged')) {
    return { amps: 0.11 + jitter(phone, 'b', 0.08), pattern: 'unstable' };
  }
  if (bat && ((bat.health ?? 1) < 0.08 || bat.swollen)) {
    return { amps: 0.42 + jitter(phone, 'c', 0.1), pattern: 'charging_slow' };
  }
  if (report.functions.display === 'fail' && report.functions.power === 'pass') {
    return { amps: 0.55 + jitter(phone, 'd', 0.12), pattern: 'boot_no_screen' };
  }
  if (bat && (bat.health ?? 1) < 0.7) {
    return { amps: 1.05 + jitter(phone, 'e', 0.2), pattern: 'charging_slow' };
  }
  return { amps: 1.82 + jitter(phone, 'f', 0.3), pattern: 'charging_ok' };
}

export interface BatteryInfo {
  healthPct: number;
  cycles: number;
  swollen: boolean;
  present: boolean;
}

export function batteryInfo(def: PhoneDef | PhoneModel, phone: PhoneInstance): BatteryInfo {
  const model = def instanceof PhoneModel ? def : new PhoneModel(def);
  const bat = model.batteryId ? phone.comps[model.batteryId] : undefined;
  if (!bat || bat.state === 'removed') return { healthPct: 0, cycles: 0, swollen: false, present: false };
  const h = bat.health ?? 1;
  return {
    healthPct: Math.round(h * 100),
    cycles: Math.max(0, Math.round((1 - h) * 1900 + (hashString(phone.uid) % 40))),
    swollen: !!bat.swollen,
    present: true,
  };
}

/** What can be seen from outside without opening the phone (i18n keys: repair.inspect.<key>). */
export function visualInspection(def: PhoneDef | PhoneModel, phone: PhoneInstance): string[] {
  const model = def instanceof PhoneModel ? def : new PhoneModel(def);
  const notes: string[] = [];
  for (const c of model.def.components) {
    const cs = phone.comps[c.id]!;
    if (c.partCategory === 'display' && cs.condition === 'damaged') notes.push('cracked_display');
    if (c.partCategory === 'back_glass' && cs.condition === 'damaged') notes.push('cracked_back');
    if (c.partCategory === 'charge_port') {
      if (cs.dirt > 0.5) notes.push('port_dirty');
      if (cs.corrosion > 0.3) notes.push('port_corroded');
    }
    if (c.partCategory === 'battery' && cs.swollen) notes.push('display_lifted');
    if (c.partCategory === 'speaker' && cs.dirt > 0.5) notes.push('grille_sand');
  }
  if (phone.flags.water) notes.push('water_indicator');
  if (phone.flags.prevRepair) notes.push('previous_repair');
  if (notes.length === 0) notes.push('nothing_visible');
  return notes;
}
