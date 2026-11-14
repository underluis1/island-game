/** View-model mappers: simulation state → props of the dumb UI components. */
import { hasKey, t } from '../core/i18n';
import { absTime, now, partKey, type Customer, type GameState, type Line, type Order, type ReplacementQuality } from '../core/state';
import { PHONE_DEFS, PHONE_IDS, phoneDef } from '../data/phones';
import { DEFECT_RATE } from '../gameplay/repair/session';
import { FAULT_BY_ID } from '../gameplay/repair/faults';
import type { ComponentDef, PartCategory, RepairGoal } from '../gameplay/repair/types';
import { TOOL_BY_ID, type GameSim } from '../gameplay/sim';
import type { CustomerPanelProps, DiagnosisActionId } from '../ui/customer-panel';
import { colorFromString, formatClock } from '../ui/format';
import type { HudOrderChip } from '../ui/hud';
import type { PartPickerProps } from '../ui/part-picker';
import type { RepairGoalItem } from '../ui/repair-panel';
import type { TabletProps } from '../ui/tablet';
import type { DaySummary, DiagnosisTool } from '../core/state';
import type { DaySummaryProps } from '../ui/day-summary';

/** Translates a key; parameter values starting with "@" are themselves i18n keys. */
export function tr(key: string, params?: Record<string, string | number>): string {
  if (!params) return t(key);
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) out[k] = typeof v === 'string' && v.startsWith('@') ? t(v.slice(1)) : v;
  return t(key, out);
}

export const line = (l: Line | null | undefined): string => (l ? tr(l.key, l.params) : '');

export const TOOL_ICON: Record<string, string> = {
  driver: 'tool_screwdriver',
  spudger: 'tool_spudger',
  pick: 'tool_pick',
  suction: 'tool_suction',
  tweezers: 'tool_tweezers',
  heat: 'tool_heatgun',
  brush: 'tool_brush',
  ipa: 'tool_ipa',
  air: 'tool_air',
  toothpick: 'tool_toothpick',
  card: 'tool_clamp',
  adhesive: 'tool_adhesive',
  extractor: 'tool_extractor',
  flashlight: 'tool_flashlight',
  multimeter: 'tool_multimeter',
  programmer: 'tool_programmer',
  esd: 'tool_esd',
  mat: 'tool_magmat',
  battester: 'tool_battery_tester',
  ultrasonic: 'tool_ultrasonic',
  solder: 'tool_solder',
  microscope: 'tool_microscope',
  separator: 'tool_separator',
  chair: 'home',
  fan: 'wind',
  lamp: 'bulb',
  lights: 'sparkle',
  rack: 'phone',
  shelf: 'box',
};

const CAT_ICON: Partial<Record<PartCategory, string>> = {
  display: 'fn_display',
  battery: 'fn_battery',
  logic_board: 'part_board',
  charge_port: 'fn_charging',
  speaker: 'fn_speaker',
  taptic: 'fn_vibration',
  rear_camera: 'fn_rearCamera',
  front_sensor: 'fn_frontCamera',
  earpiece: 'fn_earpiece',
  home_button: 'fn_fingerprint',
  back_glass: 'phone',
  bracket: 'part_bracket',
  sim_tray: 'fn_sim',
};

export const modelName = (id: string): string => t(`phones.${id}.name`);
export const phoneColorHex = (modelId: string, color: number): string => {
  const def = PHONE_DEFS[modelId];
  return def?.colors[color % def.colors.length]?.body ?? '#cccccc';
};
const phaseOf = (stage: number): 'stall' | 'kiosk' | 'shop' => (stage >= 3 ? 'shop' : stage === 2 ? 'kiosk' : 'stall');
const faultName = (id: string): string => t(`faults.${id}.name`);

export function deadlineText(state: GameState, dueAt: number): { text: string; minutes: number } {
  const hours = dueAt - now(state);
  const minutes = Math.round(hours * 60);
  const dueDay = Math.floor(dueAt / 24) + 1;
  const dueTime = dueAt - (dueDay - 1) * 24;
  const text = dueDay === state.day ? t('game.common_today_at', { time: formatClock(dueTime) }) : t('game.common_day_at', { n: dueDay, time: formatClock(dueTime) });
  return { text, minutes };
}

function orderStatus(sim: GameSim, o: Order): 'queued' | 'waiting_parts' | 'in_progress' | 'assistant' | 'ready' {
  if (o.status === 'ready') return 'ready';
  if (sim.state.assistant.orderId === o.id) return 'assistant';
  if (o.status === 'in_progress') return 'in_progress';
  const missing = missingParts(sim, o.modelId, o.goal);
  return missing.length ? 'waiting_parts' : 'queued';
}

/** Categories the job needs that are not in stock in any grade. */
export function missingParts(sim: GameSim, modelId: string, goal: RepairGoal): PartCategory[] {
  const def = phoneDef(modelId);
  const out: PartCategory[] = [];
  for (const compId of goal.replace) {
    const c = def.components.find((x) => x.id === compId);
    if (!c) continue;
    const stock = sim.partsFor(modelId, c.partCategory);
    if (stock.cheap + stock.good + stock.refurb <= 0) out.push(c.partCategory);
  }
  return out;
}

export function hudOrders(sim: GameSim, activeId: string | null): HudOrderChip[] {
  const s = sim.state;
  return sim
    .orders()
    .filter((o) => o.kind !== 'tutorial')
    .map((o) => {
      const d = deadlineText(s, o.dueAt);
      return {
        id: o.id,
        model: modelName(o.modelId),
        customer: o.persona.name,
        deadlineText: d.text,
        minutesLeft: d.minutes,
        status: orderStatus(sim, o),
        active: o.id === activeId,
      };
    });
}

export function goalItems(sim: GameSim, modelId: string, goal: RepairGoal, phone: Order['phone']): RepairGoalItem[] {
  const def = phoneDef(modelId);
  const name = (id: string): string => t(def.components.find((c) => c.id === id)?.nameKey ?? id);
  const items: RepairGoalItem[] = [];
  if (goal.teardown) items.push({ id: 'teardown', text: t('repair.goal.teardown'), done: !!phone.flags.teardownDone, icon: 'explode' });
  for (const id of goal.replace) {
    const cs = phone.comps[id];
    items.push({ id: `r:${id}`, text: t('repair.goal.replace', { name: name(id) }), done: !!cs && cs.quality !== 'factory' && cs.condition !== 'damaged', icon: 'box' });
  }
  for (const id of goal.clean) {
    const cs = phone.comps[id];
    items.push({ id: `c:${id}`, text: t('repair.goal.clean', { name: name(id) }), done: !!cs && cs.dirt <= 0.05 && cs.corrosion <= 0.05, icon: 'tool_brush' });
  }
  for (const id of goal.reseat) {
    items.push({ id: `s:${id}`, text: t('repair.goal.reseat', { name: t('parts.display_lcd.name') }), done: !!phone.connectors[id]?.connected, icon: 'part_connector' });
  }
  for (const id of goal.solder) items.push({ id: `m:${id}`, text: t('repair.goal.solder'), done: !phone.boardFaults.some((f) => f.id === id), icon: 'tool_solder' });
  const closed = def.components.every((c) => !c.hinge || phone.comps[c.id]?.state === 'installed');
  const noLeft = def.components.every((c) => c.removable === false || phone.comps[c.id]?.state !== 'removed');
  items.push({ id: 'close', text: t('repair.goal.reassemble'), done: closed && noLeft && items.every((i) => i.done), icon: 'check_circle' });
  void sim;
  return items;
}

const TOOL_TO_ACTION: Record<DiagnosisTool, DiagnosisActionId> = { visual: 'inspect', multimeter: 'multimeter', battester: 'batteryTester', psu: 'psu' };
export const ACTION_TO_TOOL: Record<DiagnosisActionId, DiagnosisTool> = { inspect: 'visual', multimeter: 'multimeter', batteryTester: 'battester', psu: 'psu' };

export interface CounterUi {
  clues: CustomerPanelProps['clues'];
  selected: string | null;
  counter: { price: number; yourPrice: number; text?: string } | null;
}

export function customerPanelProps(sim: GameSim, c: Customer, ui: CounterUi): CustomerPanelProps {
  const s = sim.state;
  const owned = (tool: DiagnosisTool): boolean =>
    tool === 'visual' || (tool === 'multimeter' && (s.tools.multimeter ?? 0) >= 1) || (tool === 'battester' && (s.tools.battester ?? 0) >= 1) || (tool === 'psu' && (s.tools.multimeter ?? 0) >= 2);
  const options = sim.diagnosisOptions(c.id).map((o) => {
    const q = sim.quoteInfo(c.id, o.id);
    return {
      id: o.id,
      label: o.nameKeys.map((k) => t(k)).join(' + '),
      detail: o.descKeys.map((k) => t(k)).join(' '),
      mark: o.mark === 'excluded' ? ('excluded' as const) : o.mark === 'confirmed' ? ('confirmed' as const) : ('none' as const),
      parts: q?.parts.map((p) => ({ name: t(p.nameKey), icon: CAT_ICON[p.category], stock: p.inStock })) ?? [],
      quote: q
        ? { min: q.min, max: q.max, step: 10, fairFrom: Math.round(q.fair * 0.9), fairTo: Math.round(q.fair * 1.1), suggested: Math.round(q.fair / 10) * 10, partsCost: q.partsCost }
        : undefined,
    };
  });
  const sel = options.find((o) => o.id === ui.selected);
  const d = deadlineText(s, c.dueAt);
  return {
    customer: {
      name: c.name,
      typeLabel: t(`customers.kind.${c.kind}`),
      color: colorFromString(c.name),
      patience: Math.max(0, Math.min(1, c.patience / Math.max(0.001, c.patienceMax))),
    },
    complaint: c.complaints.map(line).join(' '),
    phone: { model: modelName(c.modelId), colorHex: phoneColorHex(c.modelId, c.phone.color) },
    deadline: { label: d.text, urgency: d.minutes < 120 ? 'urgent' : d.minutes < 360 ? 'soon' : 'calm', note: line(c.urgencyLine) } as CustomerPanelProps['deadline'],
    actions: (['visual', 'multimeter', 'battester', 'psu'] as DiagnosisTool[]).map((tool) => ({
      id: TOOL_TO_ACTION[tool],
      state: c.toolsUsed.includes(tool) ? ('done' as const) : owned(tool) ? ('ready' as const) : ('locked' as const),
      reason: owned(tool) ? undefined : t('game.customer_toolMissing'),
    })),
    clues: ui.clues,
    options,
    selected: ui.selected,
    quote: sel?.quote,
    counter: ui.counter ?? undefined,
    rackFull: sim.rackUsed() >= sim.rackCapacity(),
  };
}

export function partPickerProps(sim: GameSim, modelId: string, comp: ComponentDef): PartPickerProps {
  const offers = sim.catalog().parts(modelId).filter((p) => p.category === comp.partCategory);
  const q = (quality: ReplacementQuality): PartPickerProps['options'][number] => {
    const o = offers.find((x) => x.quality === quality);
    return {
      quality,
      stock: sim.state.parts[partKey(modelId, comp.partCategory, quality)] ?? 0,
      orderPrice: o?.price ?? 0,
      expressPrice: o?.expressPrice,
      incoming: o?.incoming ?? 0,
      defectRisk: DEFECT_RATE[quality],
    };
  };
  const pairingKey = `game.pairing.${comp.partCategory}`;
  return {
    partName: t(comp.nameKey),
    phoneModel: modelName(modelId),
    icon: CAT_ICON[comp.partCategory],
    options: [q('cheap'), q('good'), q('refurb')],
    pairingNote: comp.pairing && hasKey(pairingKey) ? t(pairingKey) : undefined,
    pairingOk: !comp.pairing,
    recommended: 'good',
    money: sim.state.money,
  };
}

export function daySummaryProps(state: GameState, sum: DaySummary, saved: boolean): DaySummaryProps {
  const inc = (Object.entries(sum.income) as Array<[string, number]>).filter(([k, v]) => v !== 0 && k !== 'tips').map(([k, v]) => ({ label: t(`economy.income.${k}`), amount: v }));
  const exp = (Object.entries(sum.expenses) as Array<[string, number]>).filter(([, v]) => v !== 0).map(([k, v]) => ({ label: t(`economy.expense.${k}`), amount: v }));
  return {
    day: sum.day,
    shopName: state.shopName,
    income: inc,
    tips: sum.income.tips,
    expenses: exp,
    balance: sum.moneyEnd,
    reputation: sum.repEnd,
    reputationDelta: sum.repEnd - sum.repStart,
    reviews: sum.reviews.map((r) => ({ customerName: r.name, customerColor: colorFromString(r.name), stars: r.stars, text: r.text.map(line).join(' ') })),
    history: sum.series.map((d) => ({ day: d.day, net: d.net, reputation: d.reputation })),
    repairs: sum.jobsDone,
    customers: sum.customers,
    loan: sum.loan > 0 ? { lenderName: t('tutorial.speaker.somchai'), lenderColor: '#e0803a', amount: sum.loan, quote: line(sum.loanLine), reputationLoss: 0.1 } : undefined,
    saved,
  };
}

export const AWNING_COLORS = ['#e8553d', '#18b8b0', '#ffc145', '#3f7fd9', '#7bbf5a', '#d95fa0', '#17324d'];
export const WALL_COLORS = ['#2bb5a8', '#f6e7c8', '#ff8a65', '#5b8def', '#8a5a3c', '#f2f2f2'];

export function tabletProps(sim: GameSim, opts: { tab?: TabletProps['tab']; catalogTab?: TabletProps['catalogTab']; activeId: string | null; closeKey: string }): TabletProps {
  const s = sim.state;
  const cat = sim.catalog();
  const rep = sim.reputation();
  const models = PHONE_IDS.map((id) => ({ id, name: modelName(id), locked: rep < phoneDef(id).minReputation ? t('game.common_needsReputation', { n: phoneDef(id).minReputation.toFixed(1) }) : undefined }));
  const catSet = new Map<string, { id: string; name: string; icon?: string }>();
  const rows: TabletProps['catalog']['parts']['rows'] = [];
  for (const id of PHONE_IDS) {
    const offers = cat.parts(id);
    const byCat = new Map<string, typeof offers>();
    for (const o of offers) {
      const list = byCat.get(o.category) ?? [];
      list.push(o);
      byCat.set(o.category, list);
    }
    for (const [category, list] of byCat) {
      catSet.set(category, { id: category, name: t(`parts.category.${category}`), icon: CAT_ICON[category as PartCategory] });
      const of = (q: ReplacementQuality): TabletProps['catalog']['parts']['rows'][number]['offers']['good'] => {
        const o = list.find((x) => x.quality === q);
        return { price: o?.price ?? 0, expressPrice: o?.expressPrice ?? 0, stock: o?.inStock ?? 0, incoming: o?.incoming ?? 0 };
      };
      rows.push({ modelId: id, categoryId: category, name: t(list[0]!.nameKey), icon: CAT_ICON[category as PartCategory], offers: { cheap: of('cheap'), good: of('good'), refurb: of('refurb') } });
    }
  }
  const stageUp = cat.upgrades.find((u) => (u.id === 'stage2' || u.id === 'stage3') && !u.owned);
  const assistantUp = cat.upgrades.find((u) => u.id === 'assistant');
  const decorCats = [...new Set(cat.decor.map((d) => d.category))];
  const stockDecor = new Map<string, number>();
  for (const d of s.decor) if (!d.placed) stockDecor.set(d.itemId, (stockDecor.get(d.itemId) ?? 0) + 1);
  const lockText = (k: string | null): string | undefined => (k ? t(k) : undefined);
  const assistantOrder = s.assistant.orderId ? s.orders.find((o) => o.id === s.assistant.orderId) : undefined;

  return {
    tab: opts.tab,
    catalogTab: opts.catalogTab,
    status: { shopName: s.shopName, day: s.day, time: s.time, money: s.money, reputation: rep },
    badges: { orders: sim.orders().filter((o) => o.status === 'ready').length || undefined, market: sim.market().length || undefined },
    closeKey: opts.closeKey,
    orders: {
      orders: sim
        .orders()
        .filter((o) => o.kind !== 'tutorial')
        .map((o) => {
          const d = deadlineText(s, o.dueAt);
          const miss = missingParts(sim, o.modelId, o.goal).map((c) => t(`parts.category.${c}`));
          return {
            id: o.id,
            model: modelName(o.modelId),
            phoneColor: phoneColorHex(o.modelId, o.phone.color),
            customer: o.persona.name,
            customerColor: colorFromString(o.persona.name),
            job: o.diagnosed.map(faultName).join(' + '),
            status: orderStatus(sim, o),
            price: o.price,
            deadlineText: d.text,
            minutesLeft: d.minutes,
            missingParts: miss,
            deliverDisabled: o.status !== 'ready' ? t('game.orders_notReady') : !o.customerPresent ? t('game.orders_customerAway') : undefined,
            repairDisabled: o.status === 'ready' ? undefined : undefined,
            assignable: s.assistant.hired && o.status === 'queued' && !s.assistant.orderId && !o.goal.solder.length,
          };
        }),
      rack: { used: sim.rackUsed(), capacity: sim.rackCapacity() },
    },
    catalog: {
      tools: cat.tools.map((o) => ({
        id: o.id,
        name: hasKey(o.tierKey) && t(o.tierKey) !== t(o.nameKey) ? `${t(o.nameKey)} · ${t(o.tierKey)}` : t(o.nameKey),
        icon: TOOL_ICON[o.id] ?? 'tool_hand',
        tier: o.owned,
        maxTier: o.maxTier,
        price: o.price,
        effect: t(o.effectKey),
        state: o.nextTier == null ? ('owned' as const) : o.locked && !o.available && o.locked !== 'economy.err.no_money' ? ('locked' as const) : ('available' as const),
        requires: o.locked && o.locked !== 'economy.err.no_money' ? t(o.locked, { n: o.minReputation, stage: o.minStage }) : undefined,
        disabled: !o.available && o.nextTier != null ? lockText(o.locked) : undefined,
      })),
      parts: { models, categories: [...catSet.values()], rows, normalEta: t('game.catalog_etaNormal'), expressEta: t('game.catalog_etaExpress') },
      decor: {
        categories: decorCats.map((c) => ({ id: c, name: hasKey(`decor.categories.${c}`) ? t(`decor.categories.${c}`) : c })),
        items: cat.decor.map((d) => ({
          id: d.id,
          name: t(d.nameKey),
          category: d.category,
          atmosphere: d.atmosphere,
          price: d.price,
          owned: d.owned,
          locked: d.locked && d.locked !== 'economy.err.no_money' ? t(d.locked, { stage: d.stageMin }) : undefined,
          disabled: !d.available && d.locked === 'economy.err.no_money' ? t(d.locked) : undefined,
        })),
        atmosphere: sim.atmosphere(),
      },
      expansion: {
        current: phaseOf(s.stage),
        building: s.construction !== 0,
        next: stageUp
          ? {
              phase: stageUp.id === 'stage2' ? 'kiosk' : 'shop',
              price: stageUp.price,
              description: t(stageUp.descKey),
              features: [1, 2, 3, 4].map((i) => `economy.upgrade.${stageUp.id}.f${i}`).filter((k) => hasKey(k)).map((k) => t(k)),
              requirements: [
                { label: t('ui.common.reputation'), met: rep >= stageUp.minReputation, progress: `${rep.toFixed(1)} / ${stageUp.minReputation.toFixed(1)}` },
                { label: t('ui.common.money'), met: s.money >= stageUp.price },
              ],
              disabled: stageUp.available ? undefined : lockText(stageUp.locked),
            }
          : undefined,
      },
      customize: {
        shopName: s.shopName,
        maxNameLength: 22,
        awningColors: AWNING_COLORS.map((c) => ({ id: c, name: c, color: c, color2: '#ffffff' })),
        awningColor: s.customization.awningColor,
        wallColors: WALL_COLORS.map((c) => ({ id: c, name: c, color: c })),
        wallColor: s.customization.accentColor,
        wallsLocked: s.stage < 2 ? t('game.customize_wallsLocked') : undefined,
      },
    },
    inventory: {
      parts: Object.entries(s.parts)
        .filter(([, qty]) => qty > 0)
        .map(([key, qty]) => {
          const [modelId, category, quality] = key.split('|') as [string, PartCategory, ReplacementQuality];
          return { id: key, name: t(`parts.category.${category}`), model: modelName(modelId), quality, qty, icon: CAT_ICON[category] };
        }),
      incoming: s.deliveries.map((d) => ({
        id: d.id,
        name: `${t(`parts.category.${d.category}`)} · ${modelName(d.modelId)}`,
        qty: d.qty,
        eta: deadlineText(s, d.arriveAt).text,
        express: d.express,
      })),
      decor: [...stockDecor.entries()].map(([itemId, qty]) => {
        const def = cat.decor.find((d) => d.id === itemId);
        return { id: itemId, name: def ? t(def.nameKey) : itemId, qty, atmosphere: def?.atmosphere ?? 0 };
      }),
      phones: sim.ownedPhones().map((o) => {
        const price = sim.usedSalePrice(o.id);
        return {
          id: o.id,
          model: modelName(o.modelId),
          phoneColor: phoneColorHex(o.modelId, o.phone.color),
          state: o.status === 'listed' ? ('listed' as const) : o.status === 'repaired' ? ('repaired' as const) : ('broken' as const),
          conditionText: o.faults.map(faultName).join(', '),
          issues: o.faults.map(faultName),
          paid: o.buyPrice,
          minPrice: Math.round(price * 0.7),
          maxPrice: Math.round(price * 1.3),
          suggestedPrice: price,
          listedPrice: o.status === 'listed' ? o.askPrice : undefined,
        };
      }),
    },
    market: {
      listings: sim.market().map((l) => ({
        id: l.id,
        model: modelName(l.modelId),
        phoneColor: phoneColorHex(l.modelId, l.color),
        seller: l.seller,
        sellerColor: colorFromString(l.seller),
        pitch: line(l.description),
        issues: [],
        price: l.price,
        marketValue: phoneDef(l.modelId).marketValue,
        disabled: s.money < l.price ? t('economy.err.no_money') : sim.rackUsed() >= sim.rackCapacity() ? t('economy.err.rack_full') : undefined,
      })),
    },
    stats: {
      days: s.history.map((d) => ({ day: d.day, income: d.income, expenses: d.expenses, reputation: d.reputation })),
      totals: {
        earned: s.stats.totalEarned,
        spent: s.history.reduce((a, d) => a + d.expenses, 0),
        tips: s.stats.totalTips,
        repairs: s.stats.repairs,
        perfectRepairs: s.stats.perfectRepairs,
        customersServed: s.stats.customersServed,
        customersLost: s.stats.customersLost,
        phonesFlipped: s.stats.usedSold,
        bestDay: s.stats.bestDay,
      },
    },
    reviews: {
      reviews: [...s.reputation.reviews].reverse().map((r) => ({
        id: r.id,
        customer: r.name,
        customerColor: colorFromString(r.name),
        customerType: t(`customers.kind.${r.kind}`),
        stars: r.stars,
        text: r.text.map(line).join(' '),
        day: r.day,
        model: modelName(r.modelId),
      })),
      average: rep,
    },
    encyclopedia: {
      models: PHONE_IDS.map((id) => {
        const def = phoneDef(id);
        return {
          id,
          name: modelName(id),
          year: def.year,
          entries: def.components
            .filter((c) => c.removable !== false)
            .map((c) => {
              const unlocked = s.encyclopedia.includes(`${id}:${c.id}`);
              return {
                id: c.id,
                name: unlocked ? t(c.nameKey) : '???',
                icon: CAT_ICON[c.partCategory],
                unlocked,
                description: unlocked ? t(c.descKey) : undefined,
                facts: unlocked
                  ? [
                      { label: t('game.encyclopedia_screws'), value: String(c.attachedBy.filter((f) => f.type === 'screw').length) },
                      { label: t('game.encyclopedia_value'), value: c.value ? `฿ ${c.value}` : '—' },
                    ]
                  : undefined,
              };
            }),
        };
      }),
    },
    assistant: {
      locked: s.stage < 3 ? t('game.assistant_locked') : undefined,
      hired: s.assistant.hired,
      name: t('game.assistant_name'),
      bio: t('game.assistant_bio'),
      hireCost: assistantUp?.price ?? 0,
      wagePerDay: assistantUp?.price ?? 0,
      skill: 0.7,
      abilities: [],
      status: !s.assistant.hired ? 'off' : s.assistant.orderId ? 'working' : 'idle',
      job: assistantOrder
        ? { model: modelName(assistantOrder.modelId), customer: assistantOrder.persona.name, job: assistantOrder.diagnosed.map(faultName).join(' + '), progress: 0.5, eta: formatClock(s.time + s.assistant.remaining) }
        : undefined,
      hireDisabled: assistantUp && !assistantUp.available && !assistantUp.owned ? lockText(assistantUp.locked) : undefined,
    },
  };
}

export { absTime, FAULT_BY_ID, TOOL_BY_ID };
