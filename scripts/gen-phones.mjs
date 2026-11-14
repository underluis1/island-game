// Authoring tool: generates src/data/phones/*.json (the game only reads the JSON files).
// Run: node scripts/gen-phones.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const out = new URL('../src/data/phones/', import.meta.url);
mkdirSync(out, { recursive: true });

const screw = (id, screwType, length, position, extra = {}) => ({ type: 'screw', id, screwType, length, position, ...extra });
const conn = (id, connectorId, position, extra = {}) => ({ type: 'connector', id, connectorId, position, ...extra });
const adh = (id, kind, strength, extra = {}) => ({ type: 'adhesive', id, kind, strength, ...extra });
const clip = (id) => ({ type: 'clip', id });
const bracket = (id, bracketId) => ({ type: 'bracket', id, bracketId });

/** screws at the corners of a rect, inset by 1.6 mm; spec = [[type,len,extra?], ...] placed clockwise from top-left */
function cornerScrews(prefix, rect, specs) {
  const [cx, cy, w, h] = rect;
  const ix = w / 2 - 1.7;
  const iy = h / 2 - 1.7;
  const pts = [
    [cx - ix, cy + iy],
    [cx + ix, cy + iy],
    [cx + ix, cy - iy],
    [cx - ix, cy - iy],
    [cx, cy + iy],
    [cx, cy - iy],
  ];
  return specs.map(([type, len, extra], i) => screw(`${prefix}${i + 1}`, type, len, pts[i].map((v) => +v.toFixed(2)), extra ?? {}));
}

function comp(id, pid, gen, rect, z, t, o = {}) {
  return {
    id,
    nameKey: `parts.${pid}.name`,
    descKey: `parts.${pid}.desc`,
    mesh: { gen, params: o.params ?? {} },
    rect,
    z,
    t,
    ...(o.side ? { side: o.side } : {}),
    ...(o.parent ? { parent: o.parent } : {}),
    attachedBy: o.attachedBy ?? [],
    blockedBy: o.blockedBy ?? [],
    ...(o.hinge ? { hinge: o.hinge } : {}),
    fragility: o.fragility ?? 0.2,
    ...(o.pairing ? { pairing: true } : {}),
    value: o.value ?? 0,
    partCategory: o.cat ?? 'bracket',
    functions: o.functions ?? [],
    ...(o.removable === false ? { removable: false } : {}),
    ...(o.isBoard ? { isBoard: true } : {}),
    ...(o.externalClean ? { externalClean: true } : {}),
  };
}

const COLORS = {
  fone8: [
    { id: 'silver', body: '#d9dadc', back: '#f2f1ee' },
    { id: 'gold', body: '#e3c9b0', back: '#f6e3d3' },
    { id: 'graphite', body: '#4a4b4f', back: '#2b2c30' },
    { id: 'coral', body: '#c8413b', back: '#d94a43' },
  ],
  fonex: [
    { id: 'silver', body: '#dcdddf', back: '#f0f0ee' },
    { id: 'graphite', body: '#3d3e42', back: '#26272b' },
  ],
  fone12: [
    { id: 'lagoon', body: '#3f6f8f', back: '#4d85a8' },
    { id: 'mint', body: '#bfe3d0', back: '#d3f0df' },
    { id: 'midnight', body: '#2a2b30', back: '#1d1e22' },
    { id: 'coral', body: '#d9584c', back: '#e56a5c' },
    { id: 'sand', body: '#ece6dc', back: '#f6f2ea' },
  ],
  fone14: [
    { id: 'sky', body: '#a9c4dc', back: '#bcd3e6' },
    { id: 'starlight', body: '#ebe5d9', back: '#f5f1e8' },
    { id: 'midnight', body: '#2b2d33', back: '#1e2025' },
    { id: 'orchid', body: '#d8cbe6', back: '#e4daf0' },
    { id: 'sunset', body: '#e9c34f', back: '#f1d473' },
  ],
};

/* ------------------------------------------------------------------ Fone 8 */
function fone8() {
  const W = 67.3, H = 138.4;
  const lower = [22, -21, 10, 14];
  const upper = [10.5, 55, 9, 6.5];
  const camB = [21.5, 57, 17, 18];
  const homeB = [0, -60.5, 17, 13.5];
  const earB = [0, 61, 27, 8.5];
  return {
    id: 'fone8',
    nameKey: 'phones.fone8.name',
    year: 2017,
    minReputation: 0,
    dims: { w: W, h: H, d: 7.3, r: 9.5, flat: false },
    style: { front: 'home', camera: 'single', backMaterial: 'glass', bezelTop: 15.5, bezelBottom: 15.5, bezelSide: 4.2 },
    colors: COLORS.fone8,
    marketValue: 3200,
    difficulty: 1,
    components: [
      comp('housing', 'housing', 'housing', [0, 0, W, H], 0, 7.3, { cat: 'housing', removable: false, fragility: 0.1 }),
      comp('display', 'display_lcd', 'display', [0, 0, W - 2, H - 2], 5.5, 1.8, {
        cat: 'display', hinge: 'right', fragility: 0.7, pairing: true, value: 900,
        functions: ['display', 'touch', 'trueTone'],
        params: { flexSide: 'right', flexY: [-21, 55] },
        attachedBy: [
          screw('p2_l', 'P2', 3.4, [-5.2, -H / 2], { access: { side: 'any' } }),
          screw('p2_r', 'P2', 3.4, [5.2, -H / 2], { access: { side: 'any' } }),
          adh('disp_adh', 'perimeter', 0.35, { dangerZones: [[0.27, 0.43], [0.03, 0.1]] }),
          conn('conn_lcd', 'lcd', [22, -24.5], { under: 'lower_bracket' }),
          conn('conn_digitizer', 'digitizer', [22, -18.5], { under: 'lower_bracket' }),
          conn('conn_front_sensor', 'front_sensor', [10.5, 55], { under: 'upper_bracket' }),
        ],
      }),
      comp('home_bracket', 'home_bracket', 'bracket', homeB, 4.6, 0.4, {
        parent: 'display', params: { shape: 'home' },
        attachedBy: cornerScrews('hb', homeB, [['Y000', 1.2], ['Y000', 1.2], ['Y000', 1.3], ['Y000', 1.3]]),
      }),
      comp('home_button', 'home_button', 'home', [0, -60.5, 11.5, 11.5], 4.9, 1.6, {
        parent: 'display', cat: 'home_button', fragility: 0.8, pairing: true, value: 350, functions: ['biometric'],
        attachedBy: [bracket('home_br', 'home_bracket'), conn('conn_home', 'home', [7.5, -58], { local: true })],
      }),
      comp('earpiece_bracket', 'earpiece_bracket', 'bracket', earB, 4.6, 0.4, {
        parent: 'display', params: { shape: 'bar' },
        attachedBy: [
          screw('eb1', 'PH000', 2.5, [-11.5, 61]),
          screw('eb2', 'PH000', 1.8, [3, 63.5]),
          screw('eb3', 'PH000', 1.4, [11.5, 61]),
        ],
      }),
      comp('sensor_assembly', 'sensor_assembly', 'sensor_bar', [0, 61, 24, 6.5], 4.9, 1.8, {
        parent: 'display', cat: 'front_sensor', fragility: 0.6, value: 280, functions: ['frontCamera', 'earpiece'],
        attachedBy: [bracket('ear_br', 'earpiece_bracket'), clip('ear_clip')],
      }),
      comp('lower_bracket', 'lower_bracket', 'bracket', lower, 3.5, 0.4, {
        blockedBy: ['display@open'], params: { shape: 'plate' },
        attachedBy: cornerScrews('lb', lower, [
          ['Y000', 1.2, { overBoard: true, damages: 'touch' }],
          ['Y000', 1.2, { overBoard: true, damages: 'touch' }],
          ['Y000', 2.6, { overBoard: true, damages: 'touch' }],
          ['Y000', 1.2, { overBoard: true, damages: 'display' }],
        ]),
      }),
      comp('upper_bracket', 'upper_bracket', 'bracket', upper, 3.5, 0.4, {
        blockedBy: ['display@open'], params: { shape: 'plate' },
        attachedBy: [
          screw('ub1', 'PH000', 1.3, [7.6, 55], { overBoard: true, damages: 'frontCamera' }),
          screw('ub2', 'PH000', 1.3, [13.4, 55], { overBoard: true, damages: 'frontCamera' }),
        ],
      }),
      comp('battery', 'battery', 'battery', [-13.5, -3, 33, 84], 0.7, 3.2, {
        cat: 'battery', fragility: 0.5, value: 320, functions: ['power', 'battery'],
        blockedBy: ['display', 'taptic'], params: { capacity: '1821 mAh', wh: '6.96 Wh', tabsAt: 'bottom' },
        attachedBy: [
          adh('bat_adh', 'pulltab', 0.6, { tabs: 4 }),
          conn('conn_battery', 'battery', [19, -27], { under: 'lower_bracket', isBattery: true, access: { requires: ['display@open'] } }),
        ],
      }),
      comp('taptic', 'taptic', 'taptic', [-15.5, -57.5, 24, 11.5], 0.7, 3.4, {
        cat: 'taptic', value: 180, functions: ['vibration'], blockedBy: ['display'],
        attachedBy: [
          screw('tp1', 'PH000', 1.9, [-26, -53.5]),
          screw('tp2', 'PH000', 1.9, [-5, -53.5]),
          screw('tp3', 'SO', 2.1, [-15.5, -62]),
          conn('conn_taptic', 'taptic', [-2.5, -49]),
        ],
      }),
      comp('speaker', 'speaker', 'speaker', [17.5, -57, 22, 13], 0.7, 3.6, {
        cat: 'speaker', value: 150, functions: ['speaker'], blockedBy: ['display'],
        attachedBy: [
          screw('sp1', 'PH000', 1.4, [8.5, -52]),
          screw('sp2', 'PH000', 1.7, [27, -52]),
          screw('sp3', 'PH000', 1.9, [27, -62]),
        ],
      }),
      comp('cam_bracket', 'cam_bracket', 'bracket', camB, 4.4, 0.4, {
        blockedBy: ['display'], params: { shape: 'camera', holes: 1 },
        attachedBy: [screw('cb1', 'PH000', 1.6, [14.5, 64.5]), screw('cb2', 'PH000', 2.2, [28.5, 49.5])],
      }),
      comp('rear_camera', 'rear_camera', 'camera', [22, 59, 11.5, 11.5], 0.7, 4.6, {
        cat: 'rear_camera', fragility: 0.5, value: 380, functions: ['rearCamera'], blockedBy: ['display'],
        params: { lenses: 1 },
        attachedBy: [bracket('cam_br', 'cam_bracket'), conn('conn_camera', 'camera', [17, 50], { under: 'cam_bracket' })],
      }),
      comp('sim_tray', 'sim_tray', 'sim', [32.6, 12, 2, 14], 1.55, 1.3, {
        cat: 'sim_tray', value: 40, functions: ['sim'], attachedBy: [clip('sim_clip')],
      }),
      comp('logic_board', 'logic_board', 'board', [20, 13, 22, 96], 0.7, 2.6, {
        cat: 'logic_board', isBoard: true, fragility: 0.6, value: 1800, functions: ['power'],
        blockedBy: ['display', 'lower_bracket', 'upper_bracket', 'rear_camera', 'sim_tray'],
        params: { notch: [15, 52, 31, 61], chips: 7 },
        attachedBy: [
          screw('mb1', 'PH000', 1.3, [11, -32]),
          screw('mb2', 'SO', 2.2, [29, -6]),
          screw('mb3', 'SO', 2.6, [11, 22]),
          screw('mb4', 'PH000', 1.9, [29, 38]),
          screw('mb5', 'PH000', 3.1, [11, 46]),
        ],
      }),
      comp('charge_port', 'charge_port', 'port', [0, -65, 56, 6.5], 0.5, 2.4, {
        cat: 'charge_port', fragility: 0.4, value: 220, functions: ['charging', 'microphone'],
        blockedBy: ['display', 'taptic', 'speaker'], externalClean: true,
        params: { flexTo: [7, -42] },
        attachedBy: [
          screw('cp1', 'PH000', 1.2, [-24, -65.5]),
          screw('cp2', 'PH000', 1.5, [-12, -66.5]),
          screw('cp3', 'PH000', 1.5, [12, -66.5]),
          screw('cp4', 'PH000', 2.9, [24, -65.5]),
          adh('cp_adh', 'pad', 0.3),
          conn('conn_charge', 'charge', [7, -42]),
        ],
      }),
    ],
  };
}

/* ------------------------------------------------------------------ Fone X */
function foneX() {
  const W = 70.9, H = 143.6;
  const cb = [17, 12, 13, 27];
  const sb = [8, 56, 12, 6.5];
  const camB = [23.5, 55, 17, 30];
  return {
    id: 'fonex',
    nameKey: 'phones.fonex.name',
    year: 2018,
    minReputation: 1.5,
    dims: { w: W, h: H, d: 7.7, r: 11.5, flat: false },
    style: { front: 'notch', notchW: 35, camera: 'dual_v', backMaterial: 'glass', bezelTop: 4.5, bezelBottom: 4.5, bezelSide: 4.2, frame: 'steel' },
    colors: COLORS.fonex,
    marketValue: 6500,
    difficulty: 1.45,
    components: [
      comp('housing', 'housing', 'housing', [0, 0, W, H], 0, 7.7, { cat: 'housing', removable: false, fragility: 0.1 }),
      comp('display', 'display_oled', 'display', [0, 0, W - 2, H - 2], 5.7, 2, {
        cat: 'display', hinge: 'right', fragility: 0.8, pairing: true, value: 2800,
        functions: ['display', 'touch', 'trueTone'], params: { flexSide: 'right', flexY: [5, 22], oled: true },
        attachedBy: [
          screw('p2_l', 'P2', 6.9, [-5.6, -H / 2], { access: { side: 'any' } }),
          screw('p2_r', 'P2', 6.9, [5.6, -H / 2], { access: { side: 'any' } }),
          adh('disp_adh', 'perimeter', 0.6, { dangerZones: [[0.26, 0.42]] }),
          conn('conn_oled', 'oled', [18, 6], { under: 'conn_bracket' }),
          conn('conn_digitizer', 'digitizer', [18, 12.5], { under: 'conn_bracket' }),
          conn('conn_sensor', 'front_sensor', [18, 20], { under: 'conn_bracket' }),
        ],
      }),
      comp('earpiece_asm', 'earpiece_asm', 'sensor_bar', [0, 64.5, 30, 7], 4.9, 1.9, {
        parent: 'display', cat: 'front_sensor', fragility: 0.8, pairing: true, value: 450,
        functions: ['earpiece', 'biometric'], params: { flood: true },
        attachedBy: [
          screw('ea1', 'Y000', 1.1, [-13, 64.5]),
          screw('ea2', 'PH000', 1.6, [0, 67]),
          screw('ea3', 'Y000', 1.1, [13, 64.5]),
          conn('conn_ear', 'earpiece', [9, 61], { local: true }),
        ],
      }),
      comp('conn_bracket', 'conn_bracket', 'bracket', cb, 3.7, 0.4, {
        blockedBy: ['display@open'], params: { shape: 'plate' },
        attachedBy: [
          ...cornerScrews('kb', cb, [
            ['Y000', 1.1, { overBoard: true, damages: 'display' }],
            ['Y000', 1.1, { overBoard: true, damages: 'display' }],
            ['Y000', 1.1, { overBoard: true, damages: 'touch' }],
            ['Y000', 3.1, { overBoard: true, damages: 'touch' }],
          ]),
          screw('kb5', 'Y000', 1.5, [17, 12], { overBoard: true, damages: 'touch' }),
        ],
      }),
      comp('sensor_bracket', 'sensor_bracket', 'bracket', sb, 3.7, 0.4, {
        blockedBy: ['display@open'], params: { shape: 'plate' },
        attachedBy: [screw('sb1', 'Y000', 1.1, [3.8, 56]), screw('sb2', 'Y000', 1.1, [12.2, 56])],
      }),
      comp('battery', 'battery', 'battery', [-5.5, -4, 51, 96], 0.7, 3.3, {
        cat: 'battery', fragility: 0.5, value: 480, functions: ['power', 'battery'],
        blockedBy: ['display', 'taptic', 'speaker'],
        params: { capacity: '2716 mAh', wh: '10.35 Wh', shape: 'L', notch: [23.5, 57], tabsAt: 'both' },
        attachedBy: [
          adh('bat_adh', 'pulltab', 0.7, { tabs: 4 }),
          conn('conn_battery', 'battery', [13.5, 1.5], { under: 'conn_bracket', isBattery: true, access: { requires: ['display@open'] } }),
        ],
      }),
      comp('taptic', 'taptic', 'taptic', [-17, -61, 27, 12], 0.7, 3.5, {
        cat: 'taptic', value: 220, functions: ['vibration'], blockedBy: ['display'],
        attachedBy: [
          screw('tx1', 'Y000', 1.4, [-28.5, -57]),
          screw('tx2', 'PH000', 2.3, [-5.5, -57]),
          conn('conn_taptic', 'taptic', [-3, -53.5]),
        ],
      }),
      comp('speaker', 'speaker', 'speaker', [19, -61, 25, 13], 0.7, 3.8, {
        cat: 'speaker', value: 190, functions: ['speaker'], blockedBy: ['display'],
        attachedBy: [
          screw('sx1', 'PH000', 1.5, [8.5, -56]),
          screw('sx2', 'PH000', 1.5, [29.5, -56]),
          screw('sx3', 'PH000', 2.3, [29.5, -66]),
          screw('sx4', 'SO', 2.9, [19, -66.5]),
          conn('conn_speaker', 'speaker', [10, -52.5]),
        ],
      }),
      comp('truedepth', 'truedepth', 'truedepth', [-5, 64, 30, 7.5], 0.7, 4.2, {
        cat: 'front_sensor', fragility: 0.9, pairing: true, value: 900, functions: ['biometric', 'frontCamera'],
        blockedBy: ['display'],
        attachedBy: [conn('conn_truedepth', 'truedepth', [8, 56], { under: 'sensor_bracket' }), clip('td_clip')],
      }),
      comp('cam_bracket', 'cam_bracket', 'bracket', camB, 4.6, 0.4, {
        blockedBy: ['display'], params: { shape: 'camera', holes: 2 },
        attachedBy: [screw('cb1', 'PH000', 1.7, [16.5, 68]), screw('cb2', 'PH000', 1.7, [30.5, 42])],
      }),
      comp('rear_camera', 'rear_camera_dual', 'camera', [24, 57, 12, 24], 0.7, 4.9, {
        cat: 'rear_camera', fragility: 0.5, value: 750, functions: ['rearCamera'], blockedBy: ['display'],
        params: { lenses: 2, layout: 'v' },
        attachedBy: [bracket('cam_br', 'cam_bracket'), conn('conn_camera', 'camera', [18.5, 42.5], { under: 'cam_bracket' })],
      }),
      comp('sim_tray', 'sim_tray', 'sim', [34.4, -4, 2, 14], 1.55, 1.3, {
        cat: 'sim_tray', value: 40, functions: ['sim'], attachedBy: [clip('sim_clip')],
      }),
      comp('logic_board', 'logic_board_sandwich', 'board', [17.5, 17.5, 27, 47], 0.7, 3.2, {
        cat: 'logic_board', isBoard: true, fragility: 0.9, value: 4200, functions: ['power'],
        blockedBy: ['display', 'conn_bracket', 'sensor_bracket', 'rear_camera', 'sim_tray'],
        params: { sandwich: true, chips: 9 },
        attachedBy: [
          screw('mb1', 'SO', 2.2, [6, 39]),
          screw('mb2', 'SO', 2.9, [29, 39]),
          screw('mb3', 'PH000', 1.3, [6, -4]),
          screw('mb4', 'Y000', 1.2, [29, -4]),
        ],
      }),
      comp('charge_port', 'charge_port', 'port', [0, -68.5, 58, 5.5], 0.5, 2.4, {
        cat: 'charge_port', fragility: 0.4, value: 300, functions: ['charging', 'microphone'],
        blockedBy: ['display', 'taptic', 'speaker', 'battery'], externalClean: true,
        params: { flexTo: [8, -8] },
        attachedBy: [
          screw('cx1', 'PH000', 1.3, [-25, -68.5]),
          screw('cx2', 'PH000', 1.5, [-12, -69.5]),
          screw('cx3', 'PH000', 1.5, [12, -69.5]),
          screw('cx4', 'PH000', 3.0, [25, -68.5]),
          screw('cx5', 'SO', 2.4, [0, -66.5]),
          adh('cp_adh', 'pad', 0.5),
          conn('conn_charge', 'charge', [8, -8]),
        ],
      }),
    ],
  };
}

/* ------------------------------------------------------------------ Fone 12 */
function fone12() {
  const W = 71.5, H = 146.7;
  const db = [-20.5, -11, 10, 14.5];
  const bb = [-12, -25, 9.5, 7.5];
  const tb = [-11.5, 40, 13, 9];
  const camB = [-22, 56, 21, 27];
  return {
    id: 'fone12',
    nameKey: 'phones.fone12.name',
    year: 2021,
    minReputation: 2.8,
    dims: { w: W, h: H, d: 7.4, r: 10.5, flat: true },
    style: { front: 'notch', notchW: 34, camera: 'dual_v', backMaterial: 'glass', bezelTop: 3.6, bezelBottom: 3.6, bezelSide: 3.4 },
    colors: COLORS.fone12,
    marketValue: 11500,
    difficulty: 1.8,
    components: [
      comp('housing', 'housing', 'housing', [0, 0, W, H], 0, 7.4, { cat: 'housing', removable: false, fragility: 0.1 }),
      comp('display', 'display_oled', 'display', [0, 0, W - 2, H - 2], 5.4, 2, {
        cat: 'display', hinge: 'left', fragility: 0.8, pairing: true, value: 3600,
        functions: ['display', 'touch', 'trueTone'], params: { flexSide: 'left', flexY: [-12, 38], oled: true },
        attachedBy: [
          screw('p2_l', 'P2', 6.7, [-5.6, -H / 2], { access: { side: 'any' } }),
          screw('p2_r', 'P2', 6.7, [5.6, -H / 2], { access: { side: 'any' } }),
          adh('disp_adh', 'perimeter', 0.85, { dangerZones: [[0.76, 0.9]] }),
          conn('conn_oled', 'oled', [-20.5, -14], { under: 'disp_bracket' }),
          conn('conn_digitizer', 'digitizer', [-20.5, -8], { under: 'disp_bracket' }),
          conn('conn_front', 'ambient', [-14, 38.5], { under: 'top_bracket' }),
        ],
      }),
      comp('disp_bracket', 'disp_bracket', 'bracket', db, 3.6, 0.4, {
        blockedBy: ['display@open'], params: { shape: 'plate' },
        attachedBy: [
          screw('db1', 'Y000', 1.1, [-23.5, -5.5], { overBoard: true, damages: 'display' }),
          screw('db2', 'Y000', 1.1, [-17.5, -5.5], { overBoard: true, damages: 'display' }),
          screw('db3', 'Y000', 1.5, [-20.5, -16.5], { overBoard: true, damages: 'touch' }),
        ],
      }),
      comp('bat_bracket', 'bat_bracket', 'bracket', bb, 3.6, 0.4, {
        blockedBy: ['display@open'], params: { shape: 'plate' },
        attachedBy: [
          screw('bb1', 'Y000', 1.1, [-15, -25], { overBoard: true, damages: 'charging' }),
          screw('bb2', 'PH000', 1.3, [-9, -25], { overBoard: true, damages: 'charging' }),
        ],
      }),
      comp('top_bracket', 'top_bracket', 'bracket', tb, 3.6, 0.4, {
        blockedBy: ['display@open'], params: { shape: 'plate' },
        attachedBy: [
          screw('tb1', 'Y000', 1.0, [-16, 42.5], { overBoard: true, damages: 'frontCamera' }),
          screw('tb2', 'PH000', 1.4, [-7, 42.5], { overBoard: true, damages: 'frontCamera' }),
          screw('tb3', 'SO', 2.0, [-11.5, 37]),
        ],
      }),
      comp('earpiece', 'earpiece', 'earpiece', [0, 69, 20, 5], 0.7, 3.4, {
        cat: 'earpiece', value: 160, functions: ['earpiece'], blockedBy: ['display'],
        attachedBy: [
          screw('ep1', 'PH000', 1.6, [-8, 69]),
          screw('ep2', 'PH000', 1.9, [8, 69]),
          conn('conn_ear', 'earpiece', [-3, 62.5]),
        ],
      }),
      comp('truedepth', 'truedepth', 'truedepth', [13, 62, 26, 7], 0.7, 4, {
        cat: 'front_sensor', fragility: 0.9, pairing: true, value: 1100, functions: ['biometric', 'frontCamera'],
        blockedBy: ['display', 'earpiece'],
        attachedBy: [conn('conn_truedepth', 'truedepth', [-8.5, 40.5], { under: 'top_bracket' }), clip('td_clip')],
      }),
      comp('cam_bracket', 'cam_bracket', 'bracket', camB, 4.6, 0.4, {
        blockedBy: ['display'], params: { shape: 'camera', holes: 2 },
        attachedBy: [
          screw('cb1', 'PH000', 1.3, [-30.5, 67.5]),
          screw('cb2', 'Y000', 1.6, [-13.5, 67.5]),
          screw('cb3', 'SO', 2.2, [-13.5, 44.5]),
        ],
      }),
      comp('rear_camera', 'rear_camera_dual', 'camera', [-22, 56.5, 19, 23], 0.7, 4.9, {
        cat: 'rear_camera', fragility: 0.5, pairing: true, value: 900, functions: ['rearCamera'], blockedBy: ['display'],
        params: { lenses: 2, layout: 'v' },
        attachedBy: [bracket('cam_br', 'cam_bracket'), conn('conn_camera', 'camera', [-14.5, 45.5], { under: 'cam_bracket' })],
      }),
      comp('speaker', 'speaker', 'speaker', [-18.5, -63, 27, 13.5], 0.7, 3.7, {
        cat: 'speaker', value: 210, functions: ['speaker'], blockedBy: ['display'],
        attachedBy: [
          screw('sk1', 'PH000', 1.4, [-30, -58]),
          screw('sk2', 'PH000', 1.4, [-7, -58]),
          screw('sk3', 'PH000', 2.1, [-30, -68]),
          screw('sk4', 'SO', 2.5, [-18.5, -68.5]),
          conn('conn_speaker', 'speaker', [-11, -53.5]),
        ],
      }),
      comp('taptic', 'taptic', 'taptic', [16, -63, 25, 12], 0.7, 3.5, {
        cat: 'taptic', value: 240, functions: ['vibration'], blockedBy: ['display'],
        attachedBy: [
          screw('tt1', 'PH000', 1.6, [5.5, -59]),
          screw('tt2', 'Y000', 1.4, [26.5, -59]),
          conn('conn_taptic', 'taptic', [4, -55]),
        ],
      }),
      comp('battery', 'battery', 'battery', [10.5, -3, 38, 86], 0.7, 3.2, {
        cat: 'battery', fragility: 0.5, pairing: true, value: 520, functions: ['power', 'battery'],
        blockedBy: ['display', 'speaker', 'taptic'], params: { capacity: '2815 mAh', wh: '10.78 Wh', tabsAt: 'both' },
        attachedBy: [
          adh('bat_adh', 'pulltab', 0.75, { tabs: 4 }),
          conn('conn_battery', 'battery', [-12, -25], { under: 'bat_bracket', isBattery: true, access: { requires: ['display@open'] } }),
        ],
      }),
      comp('sim_tray', 'sim_tray', 'sim', [-34.7, -8, 2, 14], 1.55, 1.3, {
        cat: 'sim_tray', value: 40, functions: ['sim'], attachedBy: [clip('sim_clip')],
      }),
      comp('logic_board', 'logic_board', 'board', [-21, 10, 22, 64], 0.7, 2.8, {
        cat: 'logic_board', isBoard: true, fragility: 0.75, value: 5200, functions: ['power'],
        blockedBy: ['display', 'disp_bracket', 'bat_bracket', 'top_bracket', 'rear_camera', 'sim_tray'],
        params: { chips: 10 },
        attachedBy: [
          screw('mb1', 'PH000', 1.3, [-30, -19]),
          screw('mb2', 'SO', 2.2, [-12, -1]),
          screw('mb3', 'SO', 2.7, [-30, 18]),
          screw('mb4', 'Y000', 1.2, [-12, 30]),
          screw('mb5', 'PH000', 2.9, [-30, 39]),
        ],
      }),
      comp('charge_port', 'charge_port', 'port', [0, -70.4, 58, 5], 0.5, 2.4, {
        cat: 'charge_port', fragility: 0.4, value: 340, functions: ['charging', 'microphone'],
        blockedBy: ['display', 'speaker', 'taptic'], externalClean: true,
        params: { flexTo: [-13, -33] },
        attachedBy: [
          screw('cq1', 'PH000', 1.3, [-26, -70.5]),
          screw('cq2', 'PH000', 1.5, [-13, -71.2]),
          screw('cq3', 'PH000', 1.5, [13, -71.2]),
          screw('cq4', 'PH000', 2.8, [26, -70.5]),
          screw('cq5', 'Y000', 1.2, [0, -69]),
          adh('cp_adh', 'pad', 0.5),
          conn('conn_charge', 'charge', [-13, -33]),
        ],
      }),
    ],
  };
}

/* ------------------------------------------------------------------ Fone 14 */
function fone14() {
  const W = 71.5, H = 146.7;
  const fb = [-17, -19, 14, 17];
  const ftb = [-10, 51, 12, 7];
  const bkb = [9, 30, 11, 8];
  const camB = [-20, 55, 26, 29];
  const B = { side: 'back' };
  return {
    id: 'fone14',
    nameKey: 'phones.fone14.name',
    year: 2023,
    minReputation: 3.8,
    dims: { w: W, h: H, d: 7.8, r: 11, flat: true },
    style: { front: 'notch', notchW: 27, camera: 'dual_d', backMaterial: 'glass', bezelTop: 3.4, bezelBottom: 3.4, bezelSide: 3.2, midframe: 4.3 },
    colors: COLORS.fone14,
    marketValue: 16500,
    difficulty: 2.1,
    components: [
      comp('housing', 'housing', 'housing', [0, 0, W, H], 0, 7.8, { cat: 'housing', removable: false, fragility: 0.1 }),
      comp('display', 'display_oled', 'display', [0, 0, W - 2, H - 2], 5.8, 2, {
        cat: 'display', hinge: 'left', fragility: 0.8, pairing: true, value: 4200,
        functions: ['display', 'touch', 'trueTone'], params: { flexSide: 'left', flexY: [-19, 51], oled: true },
        attachedBy: [
          screw('p2_l', 'P2', 6.8, [-5.6, -H / 2], { access: { side: 'any' } }),
          screw('p2_r', 'P2', 6.8, [5.6, -H / 2], { access: { side: 'any' } }),
          adh('disp_adh', 'perimeter', 0.8, { dangerZones: [[0.76, 0.9]] }),
          conn('conn_oled', 'oled', [-17, -15], { under: 'front_bracket' }),
          conn('conn_digitizer', 'digitizer', [-17, -21], { under: 'front_bracket' }),
          conn('conn_front', 'ambient', [-12.5, 51], { under: 'front_top_bracket' }),
        ],
      }),
      comp('front_bracket', 'front_bracket', 'bracket', fb, 5, 0.4, {
        blockedBy: ['display@open'], params: { shape: 'plate' },
        attachedBy: [
          screw('fb1', 'Y000', 1.0, [-22, -12.5], { overBoard: true, damages: 'display' }),
          screw('fb2', 'Y000', 1.0, [-12, -12.5], { overBoard: true, damages: 'display' }),
          screw('fb3', 'Y000', 1.3, [-17, -25.5], { overBoard: true, damages: 'touch' }),
        ],
      }),
      comp('front_top_bracket', 'front_top_bracket', 'bracket', ftb, 5, 0.4, {
        blockedBy: ['display@open'], params: { shape: 'plate' },
        attachedBy: [screw('ft1', 'PH000', 1.2, [-14, 51]), screw('ft2', 'PH000', 1.2, [-6, 51])],
      }),
      comp('earpiece', 'earpiece', 'earpiece', [0, 69.2, 18, 4.5], 4.6, 1.1, {
        cat: 'earpiece', value: 170, functions: ['earpiece'], blockedBy: ['display'],
        attachedBy: [
          screw('ep1', 'PH000', 1.5, [-7.5, 69.2]),
          screw('ep2', 'PH000', 1.8, [7.5, 69.2]),
          conn('conn_ear', 'earpiece', [-7.5, 52.5], { under: 'front_top_bracket' }),
        ],
      }),
      comp('truedepth', 'truedepth', 'truedepth', [9, 62.5, 26, 7], 4.6, 1.1, {
        cat: 'front_sensor', fragility: 0.9, pairing: true, value: 1300, functions: ['biometric', 'frontCamera'],
        blockedBy: ['display', 'earpiece'],
        attachedBy: [conn('conn_truedepth', 'truedepth', [-10, 49.5], { under: 'front_top_bracket' }), clip('td_clip')],
      }),
      comp('sim_tray', 'sim_tray', 'sim', [-34.7, -8, 2, 14], 1.55, 1.3, {
        cat: 'sim_tray', value: 40, functions: ['sim'], attachedBy: [clip('sim_clip')],
      }),
      comp('back_glass', 'back_glass', 'backglass', [0, 0, W - 2, H - 2], 0, 1.3, {
        ...B, cat: 'back_glass', hinge: 'right', fragility: 0.8, value: 650, functions: ['wireless'],
        params: { flexSide: 'right', camera: 'dual_d' },
        attachedBy: [
          adh('back_adh', 'perimeter', 0.9, { dangerZones: [[0.2, 0.34]] }),
          conn('conn_back', 'wireless', [9, 30], { under: 'back_bracket' }),
        ],
      }),
      comp('back_bracket', 'back_bracket', 'bracket', bkb, 1.6, 0.4, {
        ...B, blockedBy: ['back_glass@open'], params: { shape: 'plate' },
        attachedBy: [screw('kb1', 'Y000', 1.1, [5.5, 30]), screw('kb2', 'Y000', 1.1, [12.5, 30])],
      }),
      comp('cam_bracket', 'cam_bracket', 'bracket', camB, 1.5, 0.4, {
        ...B, blockedBy: ['back_glass'], params: { shape: 'camera', holes: 2 },
        attachedBy: [
          screw('cb1', 'PH000', 1.4, [-31, 67.5]),
          screw('cb2', 'Y000', 1.5, [-9, 67.5]),
          screw('cb3', 'SO', 2.3, [-9, 42.5]),
        ],
      }),
      comp('rear_camera', 'rear_camera_dual', 'camera', [-20, 55.5, 24, 25], 1.3, 3, {
        ...B, cat: 'rear_camera', fragility: 0.5, value: 1200, functions: ['rearCamera'], blockedBy: ['back_glass'],
        params: { lenses: 2, layout: 'd' },
        attachedBy: [bracket('cam_br', 'cam_bracket'), conn('conn_camera', 'camera', [-11, 43.5], { under: 'cam_bracket' })],
      }),
      comp('speaker', 'speaker', 'speaker', [-18.5, -63, 27, 13.5], 1.3, 3, {
        ...B, cat: 'speaker', value: 230, functions: ['speaker'], blockedBy: ['back_glass'],
        attachedBy: [
          screw('sk1', 'PH000', 1.4, [-30, -58]),
          screw('sk2', 'PH000', 1.4, [-7, -58]),
          screw('sk3', 'Y000', 1.9, [-30, -68]),
          screw('sk4', 'SO', 2.5, [-18.5, -68.5]),
          conn('conn_speaker', 'speaker', [-11, -53.5]),
        ],
      }),
      comp('taptic', 'taptic', 'taptic', [16, -63, 25, 12], 1.3, 3, {
        ...B, cat: 'taptic', value: 260, functions: ['vibration'], blockedBy: ['back_glass'],
        attachedBy: [
          screw('tt1', 'PH000', 1.6, [5.5, -59]),
          screw('tt2', 'Y000', 1.4, [26.5, -59]),
          conn('conn_taptic', 'taptic', [4, -55]),
        ],
      }),
      comp('battery', 'battery', 'battery', [10.5, -5, 38, 82], 1.3, 3, {
        ...B, cat: 'battery', fragility: 0.5, pairing: true, value: 580, functions: ['power', 'battery'],
        blockedBy: ['back_glass', 'speaker', 'taptic'], params: { capacity: '3279 mAh', wh: '12.68 Wh', tabsAt: 'both' },
        attachedBy: [
          adh('bat_adh', 'pulltab', 0.8, { tabs: 4 }),
          conn('conn_battery', 'battery', [-12.5, -24], {
            isBattery: true,
            access: { side: 'front', requires: ['display@open', 'front_bracket'] },
          }),
        ],
      }),
      comp('logic_board', 'logic_board', 'board', [-21, 8, 22, 62], 1.3, 2.9, {
        ...B, cat: 'logic_board', isBoard: true, fragility: 0.75, value: 6400, functions: ['power'],
        blockedBy: ['back_glass', 'back_bracket', 'rear_camera', 'sim_tray'],
        params: { chips: 11 },
        attachedBy: [
          screw('mb1', 'PH000', 1.3, [-30, -20]),
          screw('mb2', 'SO', 2.2, [-12, -2]),
          screw('mb3', 'SO', 2.8, [-30, 16]),
          screw('mb4', 'Y000', 1.2, [-12, 28]),
          screw('mb5', 'PH000', 2.9, [-30, 36]),
        ],
      }),
      comp('charge_port', 'charge_port', 'port', [0, -70.4, 58, 5], 1.2, 2.4, {
        ...B, cat: 'charge_port', fragility: 0.4, value: 380, functions: ['charging', 'microphone'],
        blockedBy: ['back_glass', 'speaker', 'taptic'], externalClean: true,
        params: { flexTo: [-13, -33] },
        attachedBy: [
          screw('cq1', 'PH000', 1.3, [-26, -70.5]),
          screw('cq2', 'PH000', 1.5, [-13, -71.2]),
          screw('cq3', 'PH000', 1.5, [13, -71.2]),
          screw('cq4', 'PH000', 2.8, [26, -70.5]),
          screw('cq5', 'Y000', 1.2, [0, -69]),
          adh('cp_adh', 'pad', 0.5),
          conn('conn_charge', 'charge', [-13, -33]),
        ],
      }),
    ],
  };
}

for (const def of [fone8(), foneX(), fone12(), fone14()]) {
  writeFileSync(new URL(`${def.id}.json`, out), JSON.stringify(def, null, 1) + '\n');
  const screws = def.components.flatMap((c) => c.attachedBy.filter((f) => f.type === 'screw')).length;
  console.log(def.id, 'components:', def.components.length, 'screws:', screws);
}
