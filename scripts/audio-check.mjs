// Verifica oggettiva dell'audio (non potendo ascoltare): rende SFX, loop, voci, musica e ambiente con
// OfflineAudioContext dentro la pagina demo e misura i segnali.
// uso: node scripts/audio-check.mjs [--url http://localhost:5184/dev/audio.html] [--only sfx,music,ambience,voice,loops,mix,live] [--verbose]
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const url = opt('url', 'http://localhost:5184/dev/audio.html');
const only = opt('only', '').split(',').filter(Boolean);
const verbose = args.includes('--verbose');
const want = (group) => only.length === 0 || only.includes(group);

// Attese per ogni SFX, decise dal carattere del suono: [durata min, max (s), centroide min, max (Hz)].
// La durata è la regione sopra −60 dB dal picco, quindi più lunga di quella percepita.
const SFX_EXPECT = {
  screw_turn: [0.005, 0.06, 2500, 9000], // tick di cricchetto: brillante e cortissimo
  screw_out: [0.04, 0.2, 1800, 8000],
  screw_seat: [0.02, 0.12, 1200, 7000],
  screw_strip: [0.15, 0.4, 1500, 6000],
  screw_drop: [0.3, 1.0, 2500, 9000], // più rimbalzi metallici
  screw_mat: [0.03, 0.15, 1500, 8000],
  suction_attach: [0.06, 0.2, 100, 1500],
  suction_pop: [0.04, 0.15, 300, 2500],
  adhesive_creak: [0.3, 0.7, 1200, 5000],
  adhesive_tear: [0.25, 0.6, 1500, 6000],
  pick_slide: [0.12, 0.35, 2000, 7000],
  connector_snap: [0.01, 0.08, 1500, 8000],
  connector_press: [0.04, 0.12, 500, 4000],
  part_pickup: [0.03, 0.1, 500, 4000],
  part_place: [0.03, 0.12, 150, 2500],
  part_metal: [0.1, 0.4, 2000, 9000],
  display_open: [0.2, 0.5, 500, 5000], // grappolo di clip di plastica + fruscio
  display_close: [0.2, 0.45, 400, 5000],
  pulltab_stretch: [0.4, 0.8, 300, 3000],
  pulltab_snap: [0.06, 0.2, 300, 5000],
  glass_crack: [0.1, 0.5, 3000, 10000],
  spark: [0.1, 0.3, 2500, 10000],
  damage: [0.3, 0.7, 60, 1500],
  brush: [0.12, 0.3, 3000, 9000],
  air_blast: [0.3, 0.7, 1500, 6000],
  ipa_drip: [0.1, 0.25, 900, 4000],
  toothpick: [0.02, 0.1, 800, 4000],
  multimeter_beep: [0.1, 0.2, 2200, 4000],
  phone_boot: [0.9, 2.2, 400, 2500],
  phone_off: [0.5, 1.2, 300, 2000],
  phone_vibrate: [0.5, 0.7, 80, 1200],
  phone_speaker_test: [0.6, 1.0, 1000, 4000],
  camera_shutter: [0.06, 0.2, 1500, 7000],
  test_pass: [0.4, 0.9, 800, 3500],
  test_fail: [0.3, 0.6, 250, 1200],
  solder_tick: [0.02, 0.09, 4000, 12000],
  chip_place: [0.015, 0.07, 1500, 9000],
  cash: [0.6, 1.5, 2000, 7000], // campanello + monete: parziali metalliche
  coins: [0.2, 0.7, 3500, 10000],
  order_notify: [0.4, 0.9, 700, 3000],
  customer_bell: [0.8, 1.8, 1500, 5000],
  purchase: [0.4, 0.8, 1000, 6000],
  delivery: [0.8, 1.3, 100, 2500],
  ui_click: [0.01, 0.05, 800, 5000],
  ui_hover: [0.008, 0.03, 2000, 3500],
  ui_open: [0.08, 0.2, 500, 2500],
  ui_close: [0.07, 0.16, 500, 2500],
  ui_tab: [0.01, 0.05, 1000, 4500],
  error: [0.2, 0.35, 150, 600], // gentile: grave e rotondo
  success: [0.8, 1.4, 500, 2500],
  star: [0.3, 0.9, 2000, 7000],
  unlock: [0.8, 1.5, 800, 4000],
  day_end: [2.0, 3.2, 300, 2000],
  day_start: [1.6, 2.4, 300, 2500],
  tool_select: [0.04, 0.15, 1500, 7000],
  place_decor: [0.06, 0.18, 120, 1200],
  rotate_decor: [0.06, 0.14, 800, 4500],
  sell: [0.2, 0.45, 2000, 8000],
  build_hammer: [0.45, 0.8, 300, 3000],
  build_saw: [0.4, 0.65, 1500, 5000], // raspa a banda larga: i denti della sega sono un suono chiaro
  thunder: [3.0, 5.5, 30, 500], // rumore a banda bassa, lungo
  footstep_sand: [0.07, 0.16, 200, 2500],
  radio_tune: [0.3, 0.55, 1000, 5500], // fruscio di sintonia
  flashlight: [0.02, 0.09, 1200, 6000],
  camera_whoosh: [0.3, 0.5, 300, 2000],
  review_good: [0.7, 1.3, 800, 4000],
  review_bad: [0.5, 0.85, 150, 700],
};

const failures = [];
let checks = 0;
function check(group, name, ok, detail) {
  checks++;
  if (!ok) failures.push(`[${group}] ${name}: ${detail}`);
  if (verbose || !ok) console.log(`${ok ? '  ok ' : ' FAIL'} [${group}] ${name} — ${detail}`);
  return ok;
}
const f = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : String(v));
const pad = (s, n) => String(s).padEnd(n);
const padl = (s, n) => String(s).padStart(n);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e}`));
// il socket HMR di Vite viene simulato e lasciato muto: altri file che cambiano durante la verifica
// non devono ricaricare la pagina a metà rendering
await page.routeWebSocket(/.*/, () => {});
await page.goto(url);
await page.waitForFunction(() => Boolean(window.__audioTest));

const scene = (o) => page.evaluate((opts) => window.__audioTest.renderScene(opts), o);
const MUSIC_ONLY = { master: 0.8, music: 0.6, ambience: 0, sfx: 0.9, voice: 0.8 };
const AMB_ONLY = { master: 0.8, music: 0, ambience: 0.7, sfx: 0.9, voice: 0.8 };
const DRY = { master: 0.8, music: 0, ambience: 0, sfx: 0.9, voice: 0.8 };
const levelOk = (r) => r.bad === 0 && r.peak <= 0.98;

// ------------------------------------------------------------------------------------------------
if (want('sfx')) {
  console.log('\n== SFX (rendering offline, ognuno da solo) ==');
  const names = await page.evaluate(() => window.__audioTest.sfxNames);
  const info = await page.evaluate(() => window.__audioTest.sfxInfo);
  const missing = names.filter((n) => !SFX_EXPECT[n]);
  const extra = Object.keys(SFX_EXPECT).filter((n) => !names.includes(n));
  check('sfx', 'copertura', missing.length === 0 && extra.length === 0, `${names.length} SFX; senza attese: [${missing}] attese orfane: [${extra}]`);
  console.log(`${pad('nome', 20)}${padl('picco', 7)}${padl('rms', 7)}${padl('durata', 8)}${padl('centr.', 8)}${padl('coda', 9)}  varia  esito`);
  for (const name of names) {
    const exp = SFX_EXPECT[name];
    if (!exp) continue;
    const [a, b] = await page.evaluate(
      async (n) => [await window.__audioTest.renderSfx(n, 11), await window.__audioTest.renderSfx(n, 9973)],
      name,
    );
    const varies = a.print !== b.print;
    const problems = [];
    for (const r of [a, b]) {
      if (r.bad > 0) problems.push(`${r.bad} campioni non finiti`);
      if (r.peak > 0.98) problems.push(`clipping (picco ${f(r.peak)})`);
      if (r.peak < 0.03) problems.push(`troppo debole (picco ${f(r.peak)})`);
      if (r.activeRms < 0.006) problems.push(`quasi silenzioso (rms ${f(r.activeRms, 4)})`);
      if (r.duration < exp[0] || r.duration > exp[1]) problems.push(`durata ${f(r.duration)} fuori da [${exp[0]}, ${exp[1]}]`);
      if (r.centroid < exp[2] || r.centroid > exp[3]) problems.push(`centroide ${f(r.centroid, 0)} fuori da [${exp[2]}, ${exp[3]}]`);
      if (r.tail > 1e-4 || r.last > 1e-5) problems.push(`coda non a zero (${r.tail.toExponential(1)})`);
      if (Math.abs(r.start - 0.02) > 0.012) problems.push(`attacco in ritardo (${f(r.start)} s)`);
      if (Math.abs(r.dc) > 0.002) problems.push(`componente continua ${f(r.dc, 4)}`);
    }
    if (info[name].vary > 0 && !varies) problems.push('nessuna variazione tra due chiamate');
    const ok = problems.length === 0;
    checks++;
    if (!ok) failures.push(`[sfx] ${name}: ${[...new Set(problems)].join('; ')}`);
    console.log(
      `${pad(name, 20)}${padl(f(a.peak, 2), 7)}${padl(f(a.activeRms), 7)}${padl(f(a.duration), 8)}${padl(f(a.centroid, 0), 8)}${padl(a.tail.toExponential(0), 9)}  ${varies ? 'sì ' : 'no '}    ${ok ? 'ok' : 'FAIL ' + [...new Set(problems)].join('; ')}`,
    );
  }
}

// ------------------------------------------------------------------------------------------------
if (want('mix')) {
  console.log('\n== Mixer: raffiche di SFX attraverso il master ==');
  const steps = [];
  for (let i = 0; i < 60; i++) steps.push({ at: 0.2 + i * 0.03, sfx: 'screw_turn' });
  for (let i = 0; i < 10; i++) steps.push({ at: 2.2 + i * 0.01, sfx: 'cash' });
  for (const [i, n] of ['screw_drop', 'cash', 'customer_bell', 'thunder', 'success', 'damage', 'coins', 'day_end'].entries()) {
    steps.push({ at: 3 + i * 0.02, sfx: n });
  }
  const r = await scene({ seconds: 9, station: 'off', volumes: { ...DRY, master: 1, sfx: 1 }, steps, windows: [[0.2, 2], [8.6, 9]] });
  check('mix', 'raffica senza clipping', levelOk(r), `picco ${f(r.peak)} (limite 0.98), campioni non finiti ${r.bad}`);
  check('mix', 'raffica udibile', r.windows[0].rms > 0.01, `rms ${f(r.windows[0].rms)}`);
  check('mix', 'silenzio dopo la raffica', r.windows[1].rms < 2e-3, `rms finale ${r.windows[1].rms.toExponential(1)}`);
  check('mix', 'sorgenti one-shot liberate', r.stats.liveVoices === 0, `sorgenti vive a fine rendering: ${r.stats.liveVoices}`);
}

// ------------------------------------------------------------------------------------------------
if (want('music')) {
  console.log('\n== Musica (motore completo, scheduler lookahead, ambiente a zero) ==');
  console.log(`${pad('scena', 34)}${padl('picco', 7)}${padl('rms', 7)}${padl('centr.', 8)}${padl('onset', 7)}${padl('batt.', 7)}  note per layer`);
  const row = (label, r) => {
    const n = r.stats.music.notes;
    console.log(
      `${pad(label, 34)}${padl(f(r.peak, 2), 7)}${padl(f(r.rms), 7)}${padl(f(r.centroid, 0), 8)}${padl(r.onsets, 7)}${padl(r.stats.music.bars, 7)}  mel ${n.melody} ctr ${n.counter} key ${n.keys} pad ${n.pad} bas ${n.bass} drm ${n.drums} prc ${n.perc}${r.windows[0] ? '  bande ' + r.windows[0].bands.map((b) => f(b, 2)).join('/') : ''}`,
    );
  };
  const BPM = { island_lofi: 74, thai_khim: 88, sunset_ambient: 58, beach_groove: 102 };
  const seconds = 26;
  const byStation = {};
  for (const station of Object.keys(BPM)) {
    const r = await scene({ seconds, station, volumes: MUSIC_ONLY, env: { timeOfDay: 14 }, windows: [[2, seconds - 1]] });
    byStation[station] = r;
    row(`${station} @14h`, r);
    const bars = Math.floor(seconds / ((60 / BPM[station]) * 4));
    check('music', `${station}: livelli`, levelOk(r) && r.rms > 0.015 && r.rms < 0.2, `picco ${f(r.peak)}, rms ${f(r.rms)} (atteso 0.015–0.2)`);
    check('music', `${station}: battute coerenti col tempo`, Math.abs(r.stats.music.bars - bars) <= 1, `${r.stats.music.bars} battute in ${seconds}s (attese ≈ ${bars} a ${BPM[station]} bpm)`);
    check('music', `${station}: eventi di nota`, r.stats.music.notes.melody >= 6 && r.onsets >= 12, `melodia ${r.stats.music.notes.melody} note, ${r.onsets} onset rilevati`);
    check('music', `${station}: stile attivo`, r.stats.music.style === station && r.stats.music.decks === 1, `stile ${r.stats.music.style}, deck ${r.stats.music.decks}`);
  }
  check(
    'music',
    'le stazioni hanno caratteri diversi',
    byStation.beach_groove.onsets > byStation.sunset_ambient.onsets * 1.5 && byStation.sunset_ambient.stats.music.notes.drums === 0,
    `onset: groove ${byStation.beach_groove.onsets}, ambient ${byStation.sunset_ambient.onsets}; batteria nell'ambient: ${byStation.sunset_ambient.stats.music.notes.drums}`,
  );

  // determinismo: stesso seme ⇒ stessa musica
  const d1 = await scene({ seconds: 8, station: 'thai_khim', volumes: MUSIC_ONLY, env: { timeOfDay: 9 }, seed: 77 });
  const d2 = await scene({ seconds: 8, station: 'thai_khim', volumes: MUSIC_ONLY, env: { timeOfDay: 9 }, seed: 77 });
  const d3 = await scene({ seconds: 8, station: 'thai_khim', volumes: MUSIC_ONLY, env: { timeOfDay: 9 }, seed: 78 });
  const same = JSON.stringify(d1.stats.music.notes) === JSON.stringify(d2.stats.music.notes) && Math.abs(d1.rms - d2.rms) < 1e-6;
  check('music', 'stesso seme ⇒ stesso brano', same, `rms ${f(d1.rms, 6)} vs ${f(d2.rms, 6)}`);
  check('music', 'seme diverso ⇒ brano diverso', Math.abs(d1.rms - d3.rms) > 1e-6, `rms ${f(d1.rms, 6)} vs ${f(d3.rms, 6)}`);

  // layer per ora del giorno (stessa stazione, stesso seme)
  const hours = { mattina: 8.5, pomeriggio: 14, sera: 19, notte: 23.5 };
  const day = {};
  for (const [label, t] of Object.entries(hours)) {
    day[label] = await scene({ seconds: 28, station: 'island_lofi', volumes: MUSIC_ONLY, env: { timeOfDay: t }, windows: [[2, 27]] });
    row(`island_lofi ${label} (${t}h)`, day[label]);
    check('music', `${label}: livelli`, levelOk(day[label]) && day[label].rms > 0.006, `picco ${f(day[label].peak)}, rms ${f(day[label].rms)}`);
  }
  const dn = (k) => day[k].stats.music.notes;
  check('music', 'mattina senza cassa, pomeriggio con batteria', dn('mattina').drums === 0 && dn('pomeriggio').drums > 20, `batteria: mattina ${dn('mattina').drums}, pomeriggio ${dn('pomeriggio').drums}`);
  const att = (k) => day[k].windows[0].attacks;
  check('music', 'pomeriggio più ritmato', att('pomeriggio') > att('mattina') * 1.25 && att('pomeriggio') > att('sera') * 1.25 && att('sera') >= att('notte'), `attacchi forti al secondo: mattina ${f(att('mattina'), 2)}, pomeriggio ${f(att('pomeriggio'), 2)}, sera ${f(att('sera'), 2)}, notte ${f(att('notte'), 2)}`);
  check('music', 'notte minimale', dn('notte').drums === 0 && dn('notte').melody < dn('pomeriggio').melody && day.notte.rms < day.pomeriggio.rms, `melodia notte ${dn('notte').melody} vs pomeriggio ${dn('pomeriggio').melody}; rms ${f(day.notte.rms)} vs ${f(day.pomeriggio.rms)}`);
  check('music', 'sera e notte più scure', day.sera.centroid < day.pomeriggio.centroid && day.notte.centroid < day.sera.centroid, `centroide: pomeriggio ${f(day.pomeriggio.centroid, 0)}, sera ${f(day.sera.centroid, 0)}, notte ${f(day.notte.centroid, 0)} Hz`);
  check('music', 'la sera il pad pesa di più', day.sera.windows[0].bands[0] + day.sera.windows[0].bands[1] > day.pomeriggio.windows[0].bands[1] * 0.5, `energia <1 kHz sera ${f(day.sera.windows[0].bands[0] + day.sera.windows[0].bands[1], 2)}`);

  // stazione "auto": stile per fascia oraria + transizione a confine di battuta
  for (const [t, style] of [[8, 'thai_khim'], [14, 'beach_groove'], [19, 'sunset_ambient'], [23.5, 'island_lofi']]) {
    const r = await scene({ seconds: 6, station: 'auto', volumes: MUSIC_ONLY, env: { timeOfDay: t } });
    check('music', `auto @${t}h → ${style}`, r.stats.music.style === style && levelOk(r), `stile ${r.stats.music.style}`);
  }
  const tr = await scene({
    seconds: 24,
    station: 'auto',
    volumes: MUSIC_ONLY,
    env: { timeOfDay: 11.3 },
    steps: [{ at: 8, env: { timeOfDay: 11.6 } }],
    windows: [[2, 8], [9, 13], [16, 23]],
  });
  row('auto 11.3h → 11.6h (transizione)', tr);
  check('music', 'transizione auto mattina → pomeriggio', tr.stats.music.style === 'beach_groove' && tr.stats.music.decks === 1 && levelOk(tr), `stile finale ${tr.stats.music.style}, deck vivi ${tr.stats.music.decks}, picco ${f(tr.peak)}`);
  check('music', 'transizione senza buchi', tr.windows[1].rms > tr.windows[0].rms * 0.3, `rms prima ${f(tr.windows[0].rms)}, durante ${f(tr.windows[1].rms)}, dopo ${f(tr.windows[2].rms)}`);

  // cambio stazione dalla radio
  const sw = await scene({
    seconds: 20,
    station: 'island_lofi',
    volumes: MUSIC_ONLY,
    env: { timeOfDay: 14 },
    steps: [{ at: 6, station: 'thai_khim' }, { at: 6.3, station: 'sunset_ambient' }, { at: 6.5, station: 'beach_groove' }, { at: 14, station: 'off' }],
    windows: [[8, 13.5], [16, 20]],
  });
  check('music', 'zapping rapido tra stazioni', levelOk(sw) && sw.stats.music.decks === 0 && sw.windows[0].rms > 0.01, `picco ${f(sw.peak)}, deck vivi ${sw.stats.music.decks}, rms dopo lo zapping ${f(sw.windows[0].rms)}`);
  check('music', "radio 'off' ⇒ silenzio", sw.windows[1].rms < 1.5e-3, `rms ${sw.windows[1].rms.toExponential(1)}`);

  // focus e pausa
  const f0 = await scene({ seconds: 20, station: 'island_lofi', volumes: MUSIC_ONLY, env: { timeOfDay: 14 }, focus: 0, windows: [[4, 19]] });
  const f1 = await scene({ seconds: 20, station: 'island_lofi', volumes: MUSIC_ONLY, env: { timeOfDay: 14 }, focus: 1, windows: [[4, 19]] });
  row('island_lofi focus 1', f1);
  check('music', 'focus: più piano', f1.windows[0].rms < f0.windows[0].rms * 0.65, `rms ${f(f0.windows[0].rms)} → ${f(f1.windows[0].rms)}`);
  check('music', 'focus: più scuro e semplice', f1.windows[0].centroid < f0.windows[0].centroid * 0.8 && f1.stats.music.notes.drums === 0 && f1.stats.music.notes.melody < f0.stats.music.notes.melody, `centroide ${f(f0.windows[0].centroid, 0)} → ${f(f1.windows[0].centroid, 0)} Hz; batteria ${f0.stats.music.notes.drums} → ${f1.stats.music.notes.drums}; melodia ${f0.stats.music.notes.melody} → ${f1.stats.music.notes.melody}`);
  const ps = await scene({ seconds: 20, station: 'beach_groove', volumes: MUSIC_ONLY, env: { timeOfDay: 14 }, steps: [{ at: 10, paused: true }], windows: [[3, 10], [12, 20]] });
  check('music', 'pausa: attenuata e filtrata', ps.windows[1].rms < ps.windows[0].rms * 0.6 && ps.windows[1].centroid < ps.windows[0].centroid * 0.8, `rms ${f(ps.windows[0].rms)} → ${f(ps.windows[1].rms)}, centroide ${f(ps.windows[0].centroid, 0)} → ${f(ps.windows[1].centroid, 0)} Hz`);
}

// ------------------------------------------------------------------------------------------------
if (want('ambience')) {
  console.log('\n== Ambiente (musica a zero) ==');
  console.log(`${pad('scena', 26)}${padl('picco', 7)}${padl('rms', 7)}${padl('centr.', 8)}${padl('stereo', 8)}  bande <150 | 150-1k | 1k-3.5k | 3.5k-5.5k | >5.5k   eventi`);
  const amb = async (label, env, extra = {}) => {
    const seconds = extra.seconds ?? 26;
    const r = await scene({ station: 'off', volumes: AMB_ONLY, env, ...extra, seconds, windows: [[2, seconds - 0.5], ...(extra.windows ?? [])] });
    const s = r.stats.ambience;
    console.log(
      `${pad(label, 26)}${padl(f(r.peak, 2), 7)}${padl(f(r.rms), 7)}${padl(f(r.centroid, 0), 8)}${padl(f(r.stereo, 2), 8)}  ${r.windows[0].bands.map((b) => f(b, 3)).join(' | ')}   onde ${s.waves} gabbiani ${s.gulls} uccelli ${s.birds} gechi ${s.geckos} tuoni ${s.thunders} [${s.layers}]`,
    );
    check('ambience', `${label}: livelli`, levelOk(r) && r.rms > 0.004 && r.rms < 0.25, `picco ${f(r.peak)}, rms ${f(r.rms)}`);
    return r;
  };
  const windows2s = Array.from({ length: 12 }, (_, i) => [2 + i * 2, 4 + i * 2]);
  const base = await amb('giorno sereno (12h)', { timeOfDay: 12 }, { windows: windows2s });
  const swell = base.windows.slice(1).map((w) => w.rms);
  check('ambience', 'risacca: il livello respira', Math.max(...swell) / Math.min(...swell) > 1.6 && base.stats.ambience.waves >= 3, `rms per finestre da 2 s: min ${f(Math.min(...swell))}, max ${f(Math.max(...swell))}; onde ${base.stats.ambience.waves}`);
  check('ambience', 'onde = rumore a banda bassa', base.windows[0].bands[0] + base.windows[0].bands[1] > 0.6, `energia sotto 1 kHz: ${f(base.windows[0].bands[0] + base.windows[0].bands[1], 2)}`);
  check('ambience', 'immagine stereo', base.stereo < 0.995, `correlazione L/R ${f(base.stereo, 3)}`);

  const morning = await amb('mattina (8h), 60 s', { timeOfDay: 8 }, { seconds: 60 });
  check('ambience', 'di giorno: gabbiani e uccelli (occasionali)', morning.stats.ambience.gulls >= 1 && morning.stats.ambience.gulls <= 6 && morning.stats.ambience.birds >= 1, `gabbiani ${morning.stats.ambience.gulls}, uccelli ${morning.stats.ambience.birds} in 60 s`);

  const night = await amb('notte (23h), 60 s', { timeOfDay: 23 }, { seconds: 60 });
  check('ambience', 'notte: grilli (banda 3.5–5.5 kHz)', night.windows[0].bands[3] > base.windows[0].bands[3] * 3 && night.stats.ambience.layers.includes('night'), `frazione d'energia 3.5–5.5 kHz: giorno ${base.windows[0].bands[3].toExponential(1)}, notte ${night.windows[0].bands[3].toExponential(1)}`);
  check('ambience', 'notte: niente gabbiani', night.stats.ambience.gulls === 0 && night.stats.ambience.birds === 0, `gabbiani ${night.stats.ambience.gulls}, uccelli ${night.stats.ambience.birds}`);

  const wind = await amb('vento forte', { timeOfDay: 12, wind: 1 });
  check('ambience', 'vento: più livello e più fruscio', wind.rms > base.rms * 1.15 && wind.windows[0].bands[4] > base.windows[0].bands[4], `rms ${f(base.rms)} → ${f(wind.rms)}; >5.5 kHz ${base.windows[0].bands[4].toExponential(1)} → ${wind.windows[0].bands[4].toExponential(1)}`);

  const rain = await amb('temporale (pioggia 1), 70 s', { timeOfDay: 15, rain: 1 }, { seconds: 70 });
  check('ambience', 'pioggia: scroscio in banda alta', rain.windows[0].bands[4] > base.windows[0].bands[4] * 5 && rain.rms > base.rms, `>5.5 kHz ${base.windows[0].bands[4].toExponential(1)} → ${rain.windows[0].bands[4].toExponential(1)}; rms ${f(base.rms)} → ${f(rain.rms)}`);
  check('ambience', 'tuoni rari', rain.stats.ambience.thunders >= 1 && rain.stats.ambience.thunders <= 4 && rain.stats.ambience.gulls === 0, `${rain.stats.ambience.thunders} tuoni in 70 s, gabbiani ${rain.stats.ambience.gulls}`);

  const crowd = await amb('folla (crowd 1)', { timeOfDay: 12, crowd: 1 });
  check('ambience', 'chiacchiericcio: più energia in banda vocale', crowd.windows[0].bands[1] + crowd.windows[0].bands[2] > base.windows[0].bands[1] + base.windows[0].bands[2] && crowd.rms > base.rms * 1.1, `rms ${f(base.rms)} → ${f(crowd.rms)}; 1–3.5 kHz ${f(base.windows[0].bands[2], 3)} → ${f(crowd.windows[0].bands[2], 3)}`);

  const indoor = await amb('al chiuso (indoors 1)', { timeOfDay: 12, indoors: 1 });
  check('ambience', "l'interno attutisce l'esterno", indoor.rms < base.rms * 0.75 && indoor.centroid < base.centroid, `rms ${f(base.rms)} → ${f(indoor.rms)}; centroide ${f(base.centroid, 0)} → ${f(indoor.centroid, 0)} Hz`);

  // long-tail: avvicinamento in 8 s, allontanamento in 8 s
  const steps = [];
  for (let t = 2; t <= 18; t += 0.1) steps.push({ at: t, env: { boat: t <= 10 ? (t - 2) / 8 : Math.max(0, 1 - (t - 10) / 8) } });
  const boat = await amb('long-tail che passa', { timeOfDay: 12, wind: 0 }, { seconds: 22, steps, windows: [[7.2, 8.4], [11.6, 12.8], [9.4, 10.6], [20, 21.5]], pitchRange: [30, 75] });
  const [, appr, rec, close, gone] = boat.windows;
  check('ambience', 'long-tail: udibile da vicino, sparisce da lontano', close.rms > gone.rms * 1.8 && boat.stats.ambience.layers.includes('boat'), `rms vicino ${f(close.rms)}, lontano ${f(gone.rms)}`);
  check('ambience', 'long-tail: doppler (tono più alto in avvicinamento)', appr.pitch > 0 && rec.pitch > 0 && appr.pitch / rec.pitch > 1.05 && appr.pitch / rec.pitch < 1.3, `altezza in avvicinamento ${f(appr.pitch, 1)} Hz, in allontanamento ${f(rec.pitch, 1)} Hz (rapporto ${f(appr.pitch / rec.pitch, 3)})`);

  const pause = await scene({ seconds: 14, station: 'off', volumes: AMB_ONLY, env: { timeOfDay: 12, rain: 0.6 }, steps: [{ at: 7, paused: true }], windows: [[1, 7], [8.5, 14]] });
  check('ambience', 'pausa: ambiente abbassato', pause.windows[1].rms < pause.windows[0].rms * 0.6, `rms ${f(pause.windows[0].rms)} → ${f(pause.windows[1].rms)}`);
}

// ------------------------------------------------------------------------------------------------
if (want('voice')) {
  console.log('\n== Voci ==');
  const voices = await page.evaluate(() => window.__audioTest.voiceIds);
  const line = 'Sawasdee krap! Hai scollegato la batteria, vero? Bene, ora le viti.';
  console.log(`${pad('voce', 20)}${padl('picco', 7)}${padl('rms', 7)}${padl('durata', 8)}${padl('piano', 8)}${padl('altezza', 9)}${padl('centr.', 8)}`);
  const res = {};
  for (const v of voices) {
    const planned = await page.evaluate(([t, id]) => window.__audioTest.speakDuration(t, id), [line, v]);
    const r = await scene({ seconds: planned + 1.2, station: 'off', volumes: DRY, steps: [{ at: 0.2, speak: [line, v] }], windows: [[0.25, 0.25 + planned]] });
    res[v] = { r, planned };
    console.log(`${pad(v, 20)}${padl(f(r.peak, 2), 7)}${padl(f(r.activeRms), 7)}${padl(f(r.duration), 8)}${padl(f(planned), 8)}${padl(f(r.windows[0].pitch, 0), 9)}${padl(f(r.centroid, 0), 8)}`);
    check('voice', `${v}: livelli`, levelOk(r) && r.activeRms > 0.01 && r.peak > 0.05, `picco ${f(r.peak)}, rms ${f(r.activeRms)}`);
    check('voice', `${v}: durata = piano`, Math.abs(r.end - (0.21 + planned)) < 0.15 && r.tail < 1e-4, `fine a ${f(r.end)} s, attesa ${f(0.21 + planned)} s; coda ${r.tail.toExponential(1)}`);
    check('voice', `${v}: onDone alla fine`, r.spoken === 1, `onDone ricevuti: ${r.spoken}`);
  }
  check('voice', 'Somchai è la voce più grave', res.somchai.r.centroid < res.noi.r.centroid && res.somchai.r.centroid < res.assistant.r.centroid && res.somchai.planned > res.noi.planned, `centroide somchai ${f(res.somchai.r.centroid, 0)}, noi ${f(res.noi.r.centroid, 0)}, assistant ${f(res.assistant.r.centroid, 0)} Hz; durata ${f(res.somchai.planned)} vs ${f(res.noi.planned)} s`);
  const short = await page.evaluate(() => window.__audioTest.speakDuration('Ciao.', 'noi'));
  const long = await page.evaluate(() => window.__audioTest.speakDuration('Ciao, questo telefono è caduto in mare ieri sera e adesso non si accende più.', 'noi'));
  check('voice', 'durata proporzionale al testo', long > short * 5, `"Ciao." ${f(short)} s; frase lunga ${f(long)} s`);
  // intonazione: la domanda sale, l'affermazione scende (stesse parole)
  const tail = async (text) => {
    const planned = await page.evaluate((t) => window.__audioTest.speakDuration(t, 'customer_b'), text);
    const r = await scene({ seconds: planned + 0.8, station: 'off', volumes: DRY, steps: [{ at: 0.1, speak: [text, 'customer_b'] }], windows: [[0.11 + planned - 0.13, 0.11 + planned - 0.04]], pitchRange: [70, 400] });
    return r.windows[0].pitch;
  };
  const q = await tail('Si puo riparare la la la?');
  const s = await tail('Si puo riparare la la la.');
  check('voice', 'intonazione: ? sale, . scende', q > s * 1.25, `altezza finale: domanda ${f(q, 0)} Hz, affermazione ${f(s, 0)} Hz`);
  const stop = await scene({ seconds: 3, station: 'off', volumes: DRY, steps: [{ at: 0.1, speak: [line, 'somchai'] }, { at: 0.8, speak: ['Mai pen rai!', 'somchai'] }], windows: [[2.4, 3]] });
  check('voice', 'una nuova frase interrompe la precedente della stessa voce', stop.windows[0].rms < 1e-4 && stop.spoken === 1, `rms dopo la seconda frase ${stop.windows[0].rms.toExponential(1)}, onDone ${stop.spoken}`);
}

// ------------------------------------------------------------------------------------------------
if (want('loops')) {
  console.log('\n== Loop degli strumenti ==');
  const loops = await page.evaluate(() => window.__audioTest.loopNames);
  console.log(`${pad('loop', 18)}${padl('picco', 7)}${padl('rms on', 8)}${padl('centr.', 8)}${padl('rms off', 10)}`);
  for (const name of loops) {
    const r = await scene({ seconds: 3.2, station: 'off', volumes: DRY, steps: [{ at: 0.2, loop: [name, true, 0.7] }, { at: 1.8, loop: [name, false] }], windows: [[0.6, 1.7], [2.7, 3.2]] });
    console.log(`${pad(name, 18)}${padl(f(r.peak, 2), 7)}${padl(f(r.windows[0].rms), 8)}${padl(f(r.windows[0].centroid, 0), 8)}${padl(r.windows[1].rms.toExponential(1), 10)}`);
    check('loops', `${name}: suona e si spegne`, levelOk(r) && r.windows[0].rms > 0.003 && r.windows[1].rms < 1e-4 && r.stats.activeLoops === 0, `rms acceso ${f(r.windows[0].rms)}, spento ${r.windows[1].rms.toExponential(1)}, loop vivi ${r.stats.activeLoops}`);
  }
  const spin = async (i) => (await scene({ seconds: 2, station: 'off', volumes: DRY, steps: [{ at: 0.1, loop: ['screw_spin', true, i] }], windows: [[0.5, 1.9]] })).windows[0];
  const lo = await spin(0.1);
  const hi = await spin(1);
  check('loops', 'screw_spin: il tono segue intensity', hi.centroid > lo.centroid * 1.1, `centroide ${f(lo.centroid, 0)} Hz (0.1) → ${f(hi.centroid, 0)} Hz (1.0)`);
  // aggiornamento a ogni frame: non deve accumulare nodi né produrre click
  const steps = [];
  for (let t = 0.1; t < 3; t += 0.1) steps.push({ at: t, loop: ['heatgun', true, 0.5 + 0.5 * Math.sin(t * 3)] });
  steps.push({ at: 3, loop: ['heatgun', false] });
  const upd = await scene({ seconds: 4.2, station: 'off', volumes: DRY, steps, windows: [[3.8, 4.2]] });
  check('loops', 'heatgun aggiornato a ogni frame', levelOk(upd) && upd.stats.activeLoops === 0 && upd.windows[0].rms < 1e-4, `picco ${f(upd.peak)}, loop vivi ${upd.stats.activeLoops}`);
}

// ------------------------------------------------------------------------------------------------
if (want('mix')) {
  console.log('\n== Scena completa: 60 s di gioco simulato ==');
  const steps = [];
  const names = await page.evaluate(() => window.__audioTest.sfxNames);
  names.forEach((n, i) => steps.push({ at: 3 + i * 0.6, sfx: n }));
  steps.push({ at: 5, loop: ['heatgun', true, 0.8] }, { at: 12, loop: ['heatgun', false] });
  steps.push({ at: 14, speak: ['Khob khun krap! Torna a trovarmi, eh?', 'somchai'] });
  steps.push({ at: 20, focus: 1 }, { at: 30, focus: 0 }, { at: 40, env: { rain: 0.8, crowd: 0.6, boat: 0.7 } });
  // a 50 s si spegne tutto ciò che crea sorgenti one-shot: a fine rendering non deve restarne nessuna
  steps.push({ at: 50, station: 'off', env: { rain: 0, timeOfDay: 2 } });
  const full = await scene({ seconds: 60, station: 'auto', env: { timeOfDay: 15, crowd: 0.3 }, steps, windows: [[1, 49]] });
  check('mix', 'scena completa: nessun clipping', levelOk(full), `picco ${f(full.peak)}, rms ${f(full.rms)}, campioni non finiti ${full.bad}`);
  check('mix', 'scena completa: volume rilassante', full.windows[0].rms > 0.02 && full.windows[0].rms < 0.22, `rms ${f(full.windows[0].rms)} (${f(20 * Math.log10(full.windows[0].rms), 1)} dBFS)`);
  const m = full.stats.music.notes;
  const scheduled = m.melody + m.counter + m.keys + m.pad + m.bass + m.drums + m.perc;
  check('mix', 'nessun leak: tutte le sorgenti one-shot si sono scollegate', full.stats.liveVoices <= 12 && full.stats.music.decks === 0 && full.stats.activeLoops === 0, `${scheduled} note + ${names.length} SFX schedulati; sorgenti ancora vive 10 s dopo lo stop: ${full.stats.liveVoices}; deck ${full.stats.music.decks}, loop ${full.stats.activeLoops}`);
}

// ------------------------------------------------------------------------------------------------
if (want('live')) {
  console.log('\n== Tempo reale (AudioContext vero, pagina demo) ==');
  await page.click('#unlock');
  await page.waitForTimeout(2500);
  const live = await page.evaluate(async () => {
    const eng = window.__audio;
    const an = eng.createAnalyser(2048);
    const buf = new Float32Array(2048);
    const measure = () => {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      let p = 0;
      for (const v of buf) {
        s += v * v;
        p = Math.max(p, Math.abs(v));
      }
      return { rms: Math.sqrt(s / buf.length), peak: p };
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let rms = 0;
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      await wait(100);
      const m = measure();
      rms = Math.max(rms, m.rms);
      peak = Math.max(peak, m.peak);
    }
    const before = eng.debugStats();
    // tutti gli SFX, poi una raffica di click di vite, cambio stazione, una voce e un loop
    for (const n of window.__audioTest.sfxNames) {
      eng.sfx(n);
      await wait(25);
      peak = Math.max(peak, measure().peak);
    }
    for (let i = 0; i < 200; i++) eng.sfx('screw_turn');
    eng.nextStation();
    const say = eng.speak('Sawasdee krap!', 'somchai');
    eng.loop('heatgun', true, 0.7);
    await wait(700);
    peak = Math.max(peak, measure().peak);
    eng.loop('heatgun', false);
    await wait(6500);
    const after = eng.debugStats();
    an.disconnect();
    return { state: eng.context.state, unlocked: eng.unlocked, rms, peak, before, after, station: eng.station, sayDuration: say.duration, t: eng.context.currentTime };
  });
  check('live', 'contesto sbloccato e in esecuzione', live.unlocked && live.state === 'running' && live.t > 5, `stato ${live.state}, currentTime ${f(live.t, 1)} s`);
  check('live', 'esce segnale', live.rms > 0.002, `rms max ${f(live.rms, 4)}`);
  check('live', 'nessun clipping in tempo reale', live.peak <= 0.98, `picco ${f(live.peak)}`);
  check('live', 'musica in avanzamento', live.after.music.bars > live.before.music.bars, `battute ${live.before.music.bars} → ${live.after.music.bars}; stazione ${live.station}`);
  check('live', 'nessun leak di sorgenti dopo 67 SFX + raffica', live.after.liveVoices < 120 && live.after.activeLoops === 0, `sorgenti vive: prima ${live.before.liveVoices}, dopo ${live.after.liveVoices}; loop ${live.after.activeLoops}`);
  const tm = await page.evaluate(() => window.__audioTest.timings());
  check('live', 'nessun blocco lungo del main thread', tm.build < 50 && tm.babble < 50 && tm.section < 5 && tm.strings < 5, `costruzione del grafo ${f(tm.build, 1)} ms, chiacchiericcio ${f(tm.babble, 1)} ms, sezione musicale ${f(tm.section, 2)} ms, nota Karplus-Strong ${f(tm.strings, 2)} ms (limite 50 ms per operazione)`);
  check('live', 'nessun errore in console', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(' | ') : 'console pulita');
}

await browser.close();
console.log(`\n${checks - failures.length}/${checks} controlli superati`);
if (failures.length) {
  console.log('\nFALLITI:');
  for (const x of failures) console.log('  ' + x);
  process.exit(1);
}
