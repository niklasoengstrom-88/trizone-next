/* TRIZONE Next — ui_smoke.mjs · BUILD next-0.18.0 · 2026-08-10
   Röktest av ui.js utan webbläsare: stubbad DOM, storage, pekare och geometri.
   Löpande veckolista (beslut B), dag som släppmål (beslut A). */
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, true) : (fail++, console.error("  ✗ " + m), false);
const has = (s, txt, m) => ok(String(s).includes(txt), `${m} (hittade inte "${txt}")`);
const plan = JSON.parse(fs.readFileSync(new URL("./plan_ref.json", import.meta.url)));

/* Geometri: 21 dagrader i följd — vecka wi, dag d på y = 100 + (wi*7+d)*80 */
const WEEKS = [42, 43, 44];
const dayRect = (wi, d) => ({ left: 0, top: 100 + (wi * 7 + d) * 80, width: 360, height: 80 });
const fakeEl = (dataset, rect) => ({ dataset, getBoundingClientRect: () => rect,
  innerHTML: "", style: {}, remove() {}, click() {}, addEventListener() {},
  classList: { add() {}, remove() {} } });

const H = {};
const mkRoot = () => ({
  innerHTML: "",
  addEventListener: (t, h) => { (H[t] ??= []).push(h); },
  setPointerCapture() {},
  querySelector: () => fakeEl({}, dayRect(0, 0)),
  querySelectorAll: (sel) => sel === "[data-day]"
    ? WEEKS.flatMap((wk, wi) => [...Array(7)].map((_, d) => fakeEl({ day: `${wk}|${d}` }, dayRect(wi, d))))
    : []
});
const els = { app: mkRoot() };

globalThis.__TZ_TODAY = "2026-10-15";   /* torsdag v.42 — run-thr-dagen */
const mem = new Map([
  ["trizone.overlay.v1", JSON.stringify({ planVersion: "gammal-plan",
    sessions: { "forsvunnet-pass-1": { status: "done" } }, placed: {}, patches: [], modes: {}, orphans: [], archive: {} })],
  ["trizone.cache.v1", JSON.stringify({ data: { athlete: {}, activities: [
  { id: 901, type: "Run",  name: "Löpintervaller tröskel", start_date_local: "2026-10-15T18:05:00",
    moving_time: 52 * 60, distance: 10400, icu_hr_zone_times: [720, 360, 120, 1500, 420],
    icu_rpe: 6, feel: 4 },
  { id: 902, type: "Ride", name: "Kort cykel", start_date_local: "2026-10-16T18:00:00",
    moving_time: 100 * 60, distance: 50000 },
  { id: 903, type: "Swim", name: "Morgonsim", start_date_local: "2026-10-16T06:40:00",
    moving_time: 30 * 60, distance: 1500 }
] } })]]);
globalThis.window = { innerHeight: 2200, scrollBy() {},
  localStorage: { get length() { return mem.size; }, key: i => [...mem.keys()][i],
    getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) } };
globalThis.document = {
  getElementById: id => els[id] ?? null,
  querySelector: sel => sel?.startsWith?.("meta") ? { content: "next-0.18.0 · 2026-08-10" }
                     : (els[sel] ?? null),
  addEventListener: (t, h) => { (H[t] ??= []).push(h); },
  createElement: () => fakeEl({}, dayRect(0, 0)),
  body: { classList: { add() {}, remove() {} }, appendChild() {} }
};
let clipped = null;
const vibes = [];
Object.defineProperty(globalThis, "navigator", {
  value: { clipboard: { writeText: async t => { clipped = t; } },
           vibrate: p => (vibes.push(p), true) }, configurable: true });
globalThis.location = { protocol: "file:" };
/* Fas B: nätverksstub. Spelar in varje anrop så att URL, headers och
   nyckelläckage kan granskas — nätet nås aldrig på riktigt härifrån. */
const icuCalls = [];
const icuState = { status: 200, throwOn: null };
const wellDay = (i) => {                       /* 35 dygn fram t.o.m. 2026-10-15 */
  const d = new Date(Date.UTC(2026, 8, 11)); d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
/* Sista veckan förhöjd: dagssignalen OCH trendsignalen fyrar båda (alternativ C) */
const ICU_WELLNESS = Array.from({ length: 35 }, (_, i) => ({
  id: wellDay(i), restingHR: i >= 28 ? 56 : 48, hrv: 62, sleepSecs: 6.4 * 3600,
  ctl: 55 + i * 0.3, atl: 60 + (i % 7) }));
const ICU_ACTIVITIES = [
  { id: 901, type: "Run", name: "Löpintervaller tröskel", start_date_local: "2026-10-15T18:05:00",
    moving_time: 52 * 60, distance: 10400, icu_hr_zone_times: [720, 360, 120, 1500, 420],
    icu_rpe: 6, feel: 4, kudos_count: 9, icu_training_load: 55 },
  { id: 902, type: "Ride", name: "Spinning", start_date_local: "2026-10-14T18:00:00",
    moving_time: 100 * 60, distance: 50000, average_heartrate: 130,
    average_watts: 178, device_watts: true, icu_training_load: 60 },
  { id: 903, type: "Swim", name: "Morgonsim", start_date_local: "2026-10-16T06:40:00",
    moving_time: 30 * 60, distance: 1500 },
  { id: 904, type: "Run", name: "Egen extralöpning", start_date_local: "2026-10-17T07:00:00",
    moving_time: 40 * 60, distance: 8000 },
  /* Matchar måndagens sk-w42-swim-css — bär zondata så att remsan KAN renderas
     när swimHrValid slås på, och tigas när den är av. */
  { id: 905, type: "Swim", name: "CSS-intervaller", start_date_local: "2026-10-13T18:10:00",
    moving_time: 45 * 60, distance: 2200, icu_hr_zone_times: [600, 900, 600, 500, 100] },
  /* Tyst löphistorik (inga zoner, ingen distans, ingen puls) — ger loadStatus
     ett 3-veckorssnitt att jämföra mot utan att röra intensitet/effektivitet.
     Ligger > ±1 dag från alla pass ⇒ aldrig matchkandidater. */
  { id: 906, type: "Run", name: "Historiklöpning 1", start_date_local: "2026-09-24T18:00:00", moving_time: 30 * 60 },
  { id: 907, type: "Run", name: "Historiklöpning 2", start_date_local: "2026-10-01T18:00:00", moving_time: 30 * 60 },
  { id: 908, type: "Run", name: "Historiklöpning 3", start_date_local: "2026-10-08T18:00:00", moving_time: 30 * 60 }];
const ICU_ATHLETE = { id: "i123456", name: "Niklas", icu_ftp: 262, sportSettings: [
  { types: ["Ride", "VirtualRide"], hr_zones: [120, 140, 155, 168, 185], lthr: 168, ftp: 262 },
  { types: ["Run"], hr_zones: [128, 148, 162, 173, 190], lthr: 173, threshold_pace: 2.967 },
  { types: ["Swim"], threshold_pace: 0.8065 } ] };
globalThis.fetch = async (url, opts) => {
  if (!String(url).includes("intervals.icu")) return { ok: true, status: 200, json: async () => plan };
  icuCalls.push({ url: String(url), headers: opts?.headers ?? {} });
  if (icuState.throwOn && String(url).includes(icuState.throwOn)) throw new Error("Failed to fetch");
  if (icuState.status !== 200) return { ok: false, status: icuState.status, json: async () => ({}) };
  const body = String(url).includes("/activities") ? ICU_ACTIVITIES
             : String(url).includes("/wellness") ? ICU_WELLNESS : ICU_ATHLETE;
  return { ok: true, status: 200, json: async () => body };
};
globalThis.CSS = { escape: s => s };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

await import("./ui.js");
await new Promise(r => setTimeout(r, 20));

const fire = (type, ev) => (H[type] ?? []).forEach(h => h(ev));
const target = (dataset, kinds, wk) => ({
  dataset,
  closest: sel => {
    if (sel === ".wk") return wk != null ? { id: "wk-" + wk } : null;
    return kinds.some(k => sel.includes(k)) ? { dataset } : null;
  }
});
const ghostClick = () => fire("click", { target: target({ act: "strike" }, ["data-act"]),
  preventDefault(){}, stopPropagation(){} });
const tapCard = (id, wk = 42) => { const t = target({ sess: id }, ["data-sess"], wk);
  fire("pointerdown", { button: 0, target: t, clientX: 5, clientY: 5, pointerType: "touch", pointerId: 1 });
  fire("pointerup", { target: t, t: Date.now() });
  ghostClick();                      /* värsta fallet: spökklicket landar på Stryk */ };
const clickBtn = dataset => fire("click", { target: target(dataset, Object.keys(dataset).map(k => "data-" + k)) });

/* ---------- Idag-vyn (0.8.0) ---------- */
has(els.app.innerHTML, 'data-nav="idag"', "Idag-fliken finns och är första");
has(els.app.innerHTML, "Klart för idag", "auto-matchat pass ⇒ hjälten är Klart för idag");
has(els.app.innerHTML, "RPE 6 (klockan)", "klockans RPE visas med källa — härlett vinner");
has(els.app.innerHTML, "kändes stark", "känsloskalan renderas som text, inte siffra");
has(els.app.innerHTML, "strip7", "veckostrippen renderas ovanför vecket (L4)");
has(els.app.innerHTML, 'class="sdot full"', "utfört pass = fylld grenprick");
{ clickBtn({ selday: "42|5" });
  has(els.app.innerHTML, "Lördag", "bläddring: vald dag tar hjältepositionen");
  has(els.app.innerHTML, "Tillbaka till idag", "återvägen finns alltid");
  has(els.app.innerHTML, "hicon", "genvägsikonerna följer med i bläddringsläget (0.9.4-buggen)");
  clickBtn({ backtoday: "" });
  has(els.app.innerHTML, "Klart för idag", "tillbaka till idag återställer hjälten"); }
{ clickBtn({ selday: "42|0" });
  has(els.app.innerHTML, "Ingen träning planerad", "dag utan pass i bläddring ⇒ vila");
  clickBtn({ backtoday: "" }); }

/* ---------- Gardinen (0.9.3) ---------- */
has(els.app.innerHTML, "data-chandle", "handtaget finns — en tydlig yta att ta tag i");
has(els.app.innerHTML, 'class="curtain"', "gardinen är stängd vid start");
has(els.app.innerHTML, "hicon", "genvägsikonerna finns i Idag-huvudet");
has(els.app.innerHTML, 'data-nav="plan" aria-label="Till planen"', "kalenderikonen går till Planen");
{ clickBtn({ chandle: "" });                       /* tryck togglar — gesten är aldrig enda vägen */
  await new Promise(r => setTimeout(r, 350));
  has(els.app.innerHTML, 'class="curtain open"', "tryck på handtaget öppnar gardinen");
  has(els.app.innerHTML, "Oktober 2026", "månaden med namn (displaysnitt)");
  has(els.app.innerHTML, 'class="mwk">42', "veckonummerkolumnen finns");
  has(els.app.innerHTML, "stripwrap closed", "strippen kollapsar när månaden är ute (§7)");
  clickBtn({ mnext: "" });
  has(els.app.innerHTML, "November 2026", "bläddring till nästa månad");
  clickBtn({ mprev: "" });
  clickBtn({ selday: "42|5" });
  has(els.app.innerHTML, "Lördag", "dagcell i månaden öppnar bläddringsläget");
  clickBtn({ backtoday: "" });
  clickBtn({ chandle: "" });
  await new Promise(r => setTimeout(r, 350));
  has(els.app.innerHTML, "stripwrap", "ihopfälld gardin ger strippen tillbaka"); }
{ /* draggesten via handtaget: reducern styr, tröskeln avgör */
  const grab = { closest: sel => sel.includes("data-chandle") ? { dataset: { chandle: "" } } : null };
  fire("pointerdown", { target: grab, clientX: 60, clientY: 100 });
  fire("pointermove", { target: grab, clientX: 60, clientY: 260 });
  fire("pointerup",   { target: grab, clientX: 60, clientY: 260, t: Date.now() });
  await new Promise(r => setTimeout(r, 350));
  has(els.app.innerHTML, 'class="curtain open"', "drag över tröskeln öppnar gardinen");
  /* månadssvep: horisontellt bläddrar, med haptisk kvittens */
  { const zone = { closest: sel => sel.includes(".mwrap") ? {} : null };
    fire("pointerdown", { target: zone, clientX: 300, clientY: 200 });
    fire("pointerup",   { target: zone, clientX: 160, clientY: 210 });
    has(els.app.innerHTML, "November 2026", "svep vänster bläddrar till nästa månad");
    fire("pointerdown", { target: zone, clientX: 100, clientY: 200 });
    fire("pointerup",   { target: zone, clientX: 260, clientY: 205 });
    has(els.app.innerHTML, "Oktober 2026", "svep höger bläddrar tillbaka");
    fire("pointerdown", { target: zone, clientX: 100, clientY: 100 });
    fire("pointerup",   { target: zone, clientX: 170, clientY: 260 });
    has(els.app.innerHTML, "Oktober 2026", "diagonalt svep bläddrar INTE — sloppkravet håller"); }
  fire("pointerdown", { target: grab, clientX: 60, clientY: 300 });
  fire("pointermove", { target: grab, clientX: 60, clientY: 80 });
  fire("pointerup",   { target: grab, clientX: 60, clientY: 80, t: Date.now() });
  await new Promise(r => setTimeout(r, 350));
  has(els.app.innerHTML, "stripwrap", "drag uppåt stänger — rullgardin åt båda håll");
  ok(vibes.length > 0, "gardinen kvitterar med haptik"); }

/* ---------- Manuell loggning (0.8.0) ---------- */
clickBtn({ nav: "plan" });
{ const t = target({ sess: "sk-w42-str-core" }, ["data-sess"], 42);
  fire("pointerdown", { button: 0, target: t, clientX: 8, clientY: 8, pointerType: "touch", pointerId: 11 });
  fire("pointerup", { target: t, t: Date.now() });
  has(els.app.innerHTML, "Markera utfört", "oavklarat pass erbjuder loggning i panelen");
  await new Promise(r => setTimeout(r, 520));
  clickBtn({ logopen: "sk-w42-str-core" });
  has(els.app.innerHTML, "logRpe", "loggformuläret öppnas");
  els.logRpe = { value: "7" }; els.logNote = { value: "tungt men fint" };
  clickBtn({ logsave: "sk-w42-str-core" });
  const so = JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-str-core"];
  ok(so.status === "done" && so.rpe === 7 && so.userNote === "tungt men fint",
     "loggningen sparas: utfört + RPE + notering");
  ok(so.events.some(e => e.rule === "manual-log"), "P3: loggningen lämnar post"); }
{ const t = target({ sess: "sk-w42-str-core" }, ["data-sess"], 42);
  fire("pointerdown", { button: 0, target: t, clientX: 8, clientY: 8, pointerType: "touch", pointerId: 13 });
  fire("pointerup", { target: t, t: Date.now() });
  has(els.app.innerHTML, "RPE 7 (manuell)", "manuell RPE visas i panelen när klockdata saknas");
  await new Promise(r => setTimeout(r, 520));
  fire("click", { target: target({ act: "close" }, ["data-act"]) }); }
{ const t = target({ sess: "sk-w42-str-core" }, ["data-sess"], 42);
  fire("pointerdown", { button: 0, target: t, clientX: 8, clientY: 8, pointerType: "touch", pointerId: 12 });
  fire("pointerup", { target: t, t: Date.now() });
  has(els.app.innerHTML, "Ångra loggning", "manuellt loggat pass kan ångras");
  await new Promise(r => setTimeout(r, 520));
  clickBtn({ unlog: "sk-w42-str-core" });
  ok(!JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-str-core"].status,
     "ångra återställer exakt"); }
clickBtn({ nav: "installningar" });
has(els.app.innerHTML, "RPE i 1 av dem", "aktivitetsraden räknar RPE-bärande aktiviteter — svaret på länk 2");
has(els.app.innerHTML, "zonparitet", "paritetsraden redovisas i Inställningar (§7)");
has(els.app.innerHTML, "5 zoner", "paritetsraden säger vad den granskat");
clickBtn({ nav: "plan" });

/* ---------- §5d-verben i panelen (0.8.1) ---------- */
{ const t = target({ sess: "sk-w42-bike-long" }, ["data-sess"], 42);
  fire("pointerdown", { button: 0, target: t, clientX: 8, clientY: 8, pointerType: "touch", pointerId: 21 });
  fire("pointerup", { target: t, t: Date.now() });
  has(els.app.innerHTML, "data-adjopen", "panelen erbjuder Justera");
  await new Promise(r => setTimeout(r, 520));
  clickBtn({ adjopen: "sk-w42-bike-long" });
  has(els.app.innerHTML, "Justera dosen", "justeringsformuläret öppnas");
  has(els.app.innerHTML, "aldrig vad passet innehåller", "gränsdragningen mot coachen står i klartext");
  els.adjMin = { value: "90" };
  clickBtn({ adj: "shorten|sk-w42-bike-long" });
  const so = JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-bike-long"];
  ok(so.adjust.durationMin === 90, "shorten skriver ny duration i overlayn");
  ok(so.adjust.profile.reduce((n, p) => n + p[1], 0) <= 92, "zonprofilen skalas med");
  has(els.app.innerHTML, "Kortat", "kortat pass bär badge"); }
{ const t = target({ sess: "sk-w42-bike-long" }, ["data-sess"], 42);
  fire("pointerdown", { button: 0, target: t, clientX: 8, clientY: 8, pointerType: "touch", pointerId: 22 });
  fire("pointerup", { target: t, t: Date.now() });
  has(els.app.innerHTML, "data-histopen", "historiken är hopfälld bakom knapp (0.9.1)");
  ok(!els.app.innerHTML.includes("Ingrepp på detta pass"), "…och listan renderas inte oombedd");
  await new Promise(r => setTimeout(r, 520));
  clickBtn({ histopen: "sk-w42-bike-long" });
  has(els.app.innerHTML, "Ingrepp på detta pass", "P3: händelserna följer passet — när du ber om dem");
  clickBtn({ histclose: "" });
  clickBtn({ adjopen: "sk-w42-bike-long" });
  els.adjSport = { value: "swim" };
  clickBtn({ adj: "substitute|sk-w42-bike-long" });
  ok(JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-bike-long"].adjust.sport === "swim",
     "substitute byter gren");
  has(els.app.innerHTML, "Ersättning", "grenbyte bär badge");
  /* Grenbytet gör passet till kandidat för simaktiviteter — återställ så senare
     matchningstester ser oförändrat läge (testisolering, inte kosmetika). */
  clickBtn({ adjopen: "sk-w42-bike-long" });
  els.adjSport = { value: "bike" };
  clickBtn({ adj: "substitute|sk-w42-bike-long" }); }
{ const t = target({ sess: "sk-w42-run-easy" }, ["data-sess"], 42);
  fire("pointerdown", { button: 0, target: t, clientX: 8, clientY: 8, pointerType: "touch", pointerId: 23 });
  fire("pointerup", { target: t, t: Date.now() });
  await new Promise(r => setTimeout(r, 520));
  clickBtn({ adjopen: "sk-w42-run-easy" });
  clickBtn({ adj: "downgrade|sk-w42-run-easy" });
  const so = JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-run-easy"];
  ok(so.adjust.profile.every(p => p[0] <= 2), "downgrade lägger hela profilen i Z1–Z2");
  has(els.app.innerHTML, "Nedväxlat", "nedväxlat pass bär badge"); }

/* ---------- Regelmotorn i UI (0.9.0) ---------- */
clickBtn({ nav: "installningar" });
has(els.app.innerHTML, "atlet", "atletvakten redovisas i paritetskortet (D-M2)");
has(els.app.innerHTML, "Motorvärden", "motorvärden är redigerbara i profilen (P2)");
has(els.app.innerHTML, 'data-eng="lowShareTarget"', "80/20-målet är ett fält, inte en sanning");
{ els['[data-eng="lowShareTarget"]'] = { value: "70" };
  clickBtn({ engsave: "" });
  const cfg = JSON.parse(mem.get("trizone.next.cfg.v1"));
  ok(Math.abs((cfg.engine?.lowShareTarget ?? 0) - 0.70) < 1e-9, "eget mål sparas som andel");
  els['[data-eng="lowShareTarget"]'] = { value: "20" };
  clickBtn({ engsave: "" });
  has(els.app.innerHTML, "Avvisat", "orimligt värde avvisas med gränsen i klartext");
  els['[data-eng="lowShareTarget"]'] = { value: "" };
  clickBtn({ engsave: "" }); }
clickBtn({ nav: "plan" });
has(els.app.innerHTML, 'data-mode="mode-vacation"', "livslägen finns som chips i Plan");
has(els.app.innerHTML, "aldrig blockgränser", "strukturskyddet står i klartext (D1)");
{ clickBtn({ mode: "mode-vacation" });
  const ov = JSON.parse(mem.get("trizone.overlay.v1"));
  ok(ov.modes.active.some(m => m.rule === "mode-vacation"), "läget aktiveras och sparas");
  ok(ov.sessions["sk-w42-run-thr"]?.adjust?.durationMin,
     "motorn ingriper i DAGENS pass: A-passet går till underhållsdos");
  ok(ov.sessions["sk-w42-run-thr"].events.some(e => e.rule === "mode-vacation"),
     "P3: varje ingrepp lämnar läsbar post");
  ok(ov.sessions["sk-w42-bike-long"]?.adjust?.durationMin === 90 &&
     !ov.sessions["sk-w42-bike-long"].events.some(e => e.rule === "mode-vacation"),
     "0.9.0-buggen: öppet läge rör ALDRIG framtiden — lördagen är orörd av motorn");
  ok(!ov.sessions["sk-w42-swim-css"]?.status,
     "…och inte gårdagen heller — inga retroaktiva ingrepp");
  clickBtn({ nav: "idag" });
  has(els.app.innerHTML, "modechip", "aktivt läge syns på Idag");
  clickBtn({ nav: "plan" });
  clickBtn({ mode: "mode-vacation" });
  const off = JSON.parse(mem.get("trizone.overlay.v1"));
  ok(!off.sessions["sk-w42-run-thr"].adjust?.durationMin,
     "avaktivering återställer exakt det motorn gjorde (P5)");
  ok(off.sessions["sk-w42-run-thr"].events.some(e => String(e.rule).startsWith("undo:")),
     "och återställningen redovisas i passets historik");
  ok(!off.modes.active.length, "läget är borta"); }

/* ---------- Skalet (0.7.0): flikar och vyer ---------- */
has(els.app.innerHTML, 'data-nav="plan"', "fliken Plan finns");
ok(!/class="tab[^"]*" data-nav="installningar"/.test(els.app.innerHTML),
   "Inställningar är inte längre en flik — personikonen är vägen (0.9.4)");
{ clickBtn({ nav: "plan" });
  has(els.app.innerHTML, ">Planen<", "Plan-vyn har ett huvud");
  has(els.app.innerHTML, 'data-nav="installningar" aria-label="Till inställningar"',
      "personikonen finns även i Planen — Inställningar nås alltid");
  clickBtn({ nav: "idag" }); }
ok(!els.app.innerHTML.includes('data-nav="logg"'), "Logg-fliken är borttagen (beslut 0.9.1)");
has(els.app.innerHTML, 'data-nav="installningar"', "fliken Inställningar finns");

clickBtn({ nav: "installningar" });
/* ---------- Leveransvakt (regression 2026-08-05) ----------
   0.10.0 levererades TVÅ gånger med olika innehåll och samma stämpel. sw.js
   cachar ui.js och core.js cache-first, och cachenamnet bärs av stämpeln —
   alltså serverade service workern den första leveransens ui.js till en
   användare som deployat den andra. index.html är network-first och såg färsk
   ut, vilket dolde felet. Regeln som följer: VARJE zip får eget patchnummer,
   även småfixar inom samma session. Testet nedan tvingar fram medvetenheten. */
const STAMP = (await import("./ui.js")).UI_BUILD;
const CORE_STAMP = (await import("./core.js")).BUILD;
has(els.app.innerHTML, STAMP, "byggstämpeln bor i Inställningar (T2)");
ok(STAMP === "next-0.18.0 · 2026-08-10", "stämpeln i ui.js är den väntade för denna release");
ok(CORE_STAMP === STAMP, "core.js och ui.js bär SAMMA stämpel — annars serverar sw:n blandade filer");
{ const sw = fs.readFileSync(new URL("./sw.js", import.meta.url), "utf8");
  const ver = STAMP.split(" ")[0].replace("next-", "");
  ok(sw.includes(`const CACHE = "trizone-next-${ver}"`),
     "sw-cachenamnet följer stämpeln — annars invalideras aldrig den gamla koden"); }
has(els.app.innerHTML, ">TRIZONE<", "wordmark bor i Inställningar, inte i appkromet");
ok(!els.app.innerHTML.includes("Livsschema"), "livsschema-editorn är borttagen (beslut 0.9.1)");
has(els.app.innerHTML, "data-evlog", "händelseloggen nås via knapp i Inställningar");
has(els.app.innerHTML, "data-buzztest", "haptiktestet bor i Inställningar");
has(els.app.innerHTML, "Föräldralösa överlagringar · 1", "föräldralösa får en beslutsvy");
has(els.app.innerHTML, "forsvunnet-pass-1", "den föräldralösa posten visas med sitt id");
{ clickBtn({ evlog: "" });
  has(els.app.innerHTML, "match-auto", "händelseloggen expanderar och visar posterna");
  clickBtn({ evlog: "" });
  ok(!els.app.innerHTML.includes("evrow"), "…och går att fälla ihop igen"); }
{ clickBtn({ orphan: "forsvunnet-pass-1|archive" });
  const ov = JSON.parse(mem.get("trizone.overlay.v1"));
  ok(!ov.orphans.some(o => o.id === "forsvunnet-pass-1") && ov.archive["forsvunnet-pass-1"],
     "arkivering flyttar posten och sparas");
  ok(!els.app.innerHTML.includes("Föräldralösa"), "tömd lista försvinner ur vyn"); }
clickBtn({ nav: "plan" });

/* ---------- Överblicken (0.18): hero, veckolista, kompaktrader ---------- */
has(els.app.innerHTML, "Vecka 42", "vecka 42 i listan");
has(els.app.innerHTML, "Vecka 43", "vecka 43 i samma lista — ingen bläddring");
has(els.app.innerHTML, "Vecka 44", "vecka 44 i samma lista");
has(els.app.innerHTML, "12 okt – 18 okt", "veckorubriken bär sina datum");
has(els.app.innerHTML, "ljusare = hårdare", "zonrampens legend finns");
ok(!els.app.innerHTML.includes('class="wtag"'), "fönstertaggen är borta ur kortet (0.5.2)");
has(els.app.innerHTML, "data-today", "Idag-knappen finns");
ok(!/undefined|NaN|\[object/.test(els.app.innerHTML), "ingen undefined/NaN läcker ut i markup");
has(els.app.innerHTML, 'class="planhero"', "planheron renderas överst (0.18)");
has(els.app.innerHTML, "% av bygget avklarat", "byggprocenten sägs i klartext, aldrig bara en stapel");
has(els.app.innerHTML, "vecka 1 av 3 i blocket", "blockpositionen ur buildPosition — 15 okt är vecka 1");
has(els.app.innerHTML, "todaypin", "nu-markören står i fasbandet");
has(els.app.innerHTML, "pass utförda", "veckohuvudet bär compliance (demo bild 2)");
ok((els.app.innerHTML.match(/class="crow/g) ?? []).length >= 8, "kompaktrader — alla pass som rader, inte kort");
ok(!els.app.innerHTML.includes("data-target"), "överblicken har inga dagmål — flytt bor i Omplanera (U3)");
has(els.app.innerHTML, 'data-nav="omplanera" aria-label="Till omplanering"', "kalendersymbolen i Plan leder till Omplanera");
has(els.app.innerHTML, 'data-mode="mode-vacation"', "Läget ligger kvar i överblicken — längst ner (demo, G1)");

/* ---------- Omplanera (U3): gamla vyn oförändrad bakom kalendersymbolen ---------- */
clickBtn({ nav: "omplanera" });
has(els.app.innerHTML, ">Omplanera<", "Omplanera-vyn har ett huvud");
ok((els.app.innerHTML.match(/class="day/g) ?? []).length === 21, "21 dagrader — hela planen i följd");
has(els.app.innerHTML, "50 min", "kortet bär gren, prio, duration och titel — inget mer");
has(els.app.innerHTML, 'data-nav="plan" aria-label="Tillbaka till planen"', "återvägen till överblicken finns");
has(els.app.innerHTML, 'class="tab active" data-nav="plan"', "Plan-fliken lyser även i undervyn");
ok(!els.app.innerHTML.includes('data-mode="mode-vacation"'), "livslägena bor i överblicken, inte i flyttvyn");
clickBtn({ nav: "plan" });

/* ---------- Utfall: härledd status ur v32-cachen (0.6.0) ---------- */
clickBtn({ nav: "installningar" });
has(els.app.innerHTML, "lästa ur v32-cachen", "aktivitetsraden i paritetskortet");
has(els.app.innerHTML, "read-only", "raden intygar att cachen aldrig skrivs");
clickBtn({ nav: "plan" });
has(els.app.innerHTML, "✓ utfört", "exakt match ⇒ passet märks utfört utan handpåläggning");
{ const so = JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-run-thr"];
  ok(so?.match?.activityId === 901, "auto-länken är sparad i overlayn");
  ok(so.events.some(e => e.rule === "match-auto"), "P3: tyst länk redovisas i händelseloggen"); }
has(els.app.innerHTML, "Att bekräfta", "mittzonskandidaten blir en fråga, aldrig ett tyst facit");
has(els.app.innerHTML, "Utanför plan", "främmande aktivitet listas utanför plan — i Plan-vyn");
{ fire("click", { target: target({ nolink: "sk-w42-bike-long|902" }, ["data-nolink"]) });
  const so = JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-bike-long"];
  ok(so?.matchDrop?.includes(902), "Nej sparas — paret föreslås aldrig igen");
  ok(!els.app.innerHTML.includes("Att bekräfta"), "avvisad fråga försvinner ur vyn"); }
{ const t = target({ sess: "sk-w42-run-thr" }, ["data-sess"], 42);
  fire("pointerdown", { button: 0, target: t, clientX: 5, clientY: 5, pointerType: "touch", pointerId: 5 });
  fire("pointerup", { target: t, t: Date.now() });
  has(els.app.innerHTML, "Genomförande", "panelen bär exec-texten — hur passet ska köras");
  has(els.app.innerHTML, "Mot målet", "panelen bär goal-texten");
  has(els.app.innerHTML, ">Plan<", "panelen visar plansidan av dubbelremsan");
  has(els.app.innerHTML, "Utfört · 52 min", "panelen visar utfallsraden med duration och distans");
  await new Promise(r => setTimeout(r, 500));
  fire("click", { target: target({ act: "close" }, ["data-act"]) }); }

/* ---------- Spökklicksspärren (0.5.2-buggen) ---------- */
{ const t = target({ sess: "sk-w42-run-thr" }, ["data-sess"], 42);
  fire("pointerdown", { button: 0, target: t, clientX: 40, clientY: 900, pointerType: "touch", pointerId: 9 });
  fire("pointerup", { target: t, t: Date.now() });
  has(els.app.innerHTML, "sheetwrap", "tryck öppnar panelen");
  fire("click", { target: target({ act: "strike" }, ["data-act"]) });   /* spökklicket */
  ok(!JSON.parse(mem.get("trizone.overlay.v1") ?? "{}").sessions?.["sk-w42-run-thr"]?.status,
     "spökklick på Stryk utlöser ingenting — passet stryks inte av ett vanligt tryck");
  has(els.app.innerHTML, "sheetwrap", "spökklick stänger inte heller panelen");
  await new Promise(r => setTimeout(r, 500));
  fire("click", { target: target({ act: "close" }, ["data-act"]) });
  ok(!els.app.innerHTML.includes("sheetwrap"), "riktigt klick efter spärren fungerar som vanligt"); }

/* ---------- Tryckvägen: panel → dag ---------- */
tapCard("sk-w42-swim-ow");
has(els.app.innerHTML, "sheetwrap", "tryck på pass öppnar justeringspanelen");
ok(!JSON.parse(mem.get("trizone.overlay.v1")).sessions?.["sk-w42-swim-ow"]?.status,
   "0.5.2-buggen: spökklicket efter trycket stryker inte passet");
has(els.app.innerHTML, "sheetwrap", "0.5.2-buggen: spökklicket stänger inte panelen heller");
clickBtn({ act: "move" });
has(els.app.innerHTML, "Tryck på en dag", "placeringsläget instruerar tydligt");
ok((els.app.innerHTML.match(/data-target/g) ?? []).length === 21, "alla 21 dagar är mål — även i andra veckor");
clickBtn({ target: "43|0" });
has(els.app.innerHTML, "Placerat: mån v.43", "tryckplacering över veckogräns kvitteras");
{ const p = JSON.parse(mem.get("trizone.overlay.v1")).placed["sk-w42-swim-ow"];
  ok(p?.week === 43 && p.day === 0 && p.slot === null, "placeringen sparad — dag utan fönster (beslut A)"); }

/* ---------- Dragvägen: långtryck → dag i annan vecka → släpp ---------- */
const drag = (id, wi, d, { commit = true, wk = 42 } = {}) => {
  const t = target({ sess: id }, ["data-sess"], wk);
  fire("pointerdown", { button: 0, target: t, clientX: 100, clientY: 110, pointerType: "touch", pointerId: 2 });
  return new Promise(r => setTimeout(() => {
    const rc = dayRect(wi, d);
    fire("pointermove", { clientX: 180, clientY: rc.top + 40 });
    if (commit) fire("pointerup", { t: Date.now() }); else fire("pointercancel", {});
    r();
  }, 260));
};
/* Långt stillastående tryck ⇒ panel, aldrig flytt (0.5.0-buggen) */
{ const t = target({ sess: "sk-w42-bike-long" }, ["data-sess"], 42);
  fire("pointerdown", { button: 0, target: t, clientX: 90, clientY: 120, pointerType: "touch", pointerId: 7 });
  await new Promise(r => setTimeout(r, 300));
  fire("pointerup", { t: Date.now() });
  has(els.app.innerHTML, "sheetwrap", "långt tryck utan rörelse öppnar panelen");
  ok(!els.app.innerHTML.includes("Flyttat:"), "långt tryck skriver ingen flytt");
  fire("click", { target: target({ act: "close" }, ["data-act"]) }); }
ok(!els.app.innerHTML.includes("data-grip"), "greppet är borttaget — hela kortet drar via långtryck");
{ const before = els.app.innerHTML;
  fire("pointerup", { t: Date.now() });          /* släpp utan föregående tryck på pass */
  ok(els.app.innerHTML === before, "pointerup utan pass rör inte vyn — knappar rivs inte mellan tryck och klick"); }
await drag("sk-w42-run-thr", 1, 4);              /* vecka 43, fredag */
has(els.app.innerHTML, "Flyttat: fre v.43", "drag till en annan vecka i listan — släpp på dagen räcker");
{ const m = JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-run-thr"].moved;
  ok(m?.week === 43 && m.day === 4 && m.slot === null, "dragets flytt sparad utan fönstertvång");
}
/* ---------- Haptiken är en kodväg, inte en förhoppning (0.6.0-regressionen) ---------- */
ok(vibes.includes(18), "armeringen vibrerar kännbart (≥ 12 ms)");
ok(vibes.includes(12), "dagbyte ger tick — man känner hur långt passet rest");
ok(vibes.some(v => Array.isArray(v) && v.length === 3), "släppet ger bekräftelsemönster");
ok(vibes.every(v => Array.isArray(v) || v === 1 || v >= 12), "inga pulser under känseltröskeln kvar");

const before = mem.get("trizone.overlay.v1");
await drag("sk-w42-bike-long", 0, 1, { commit: false });
ok(mem.get("trizone.overlay.v1") === before, "avbrutet drag lämnar overlayn orörd");
has(els.app.innerHTML, "avbröts", "avbrutet drag förklaras");

/* ---------- Strykning, ångring ---------- */
tapCard("sk-w42-swim-css"); clickBtn({ act: "strike" });
has(els.app.innerHTML, "struket", "struket pass märks i vyn");
tapCard("sk-w42-swim-css"); clickBtn({ act: "restore" });
ok(!JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-swim-css"].status, "strykningen går att häva");

/* ---------- Säkerhetskopia (0.6.1 → bor i Inställningar 0.7.0) ---------- */
clickBtn({ nav: "installningar" });
has(els.app.innerHTML, "Ladda ned fil", "backupen kan laddas ned som fil");
has(els.app.innerHTML, "Kopiera till urklipp", "urklippsvägen finns kvar som alternativ");
has(els.app.innerHTML, "haptik", "pariteten redovisar haptikläget");
fire("click", { target: target({ backup: "" }, ["data-backup"]) });
await new Promise(r => setTimeout(r, 10));
ok(clipped && JSON.parse(clipped).kind === "trizone-next-backup", "kopian hamnar i urklipp");
ok(JSON.parse(clipped).overlay.sessions, "kopian bär overlayn — inte bara konfiguration");
fire("click", { target: target({ import: "" }, ["data-import"]) });
has(els.app.innerHTML, "impbox", "importpanelen öppnas");
els.impbox = { value: clipped };
fire("click", { target: target({ importGo: "" }, ["data-import-go"]) });
has(els.app.innerHTML, "Importerad", "rundturen export → import fungerar i vyn");

/* ---------- 0.17.0: Beställningsexport (B6) ---------- */
has(els.app.innerHTML, "Kopiera beställningsexport", "beställningsexporten bor i Inställningar");
clipped = null;
fire("click", { target: target({ order: "" }, ["data-order"]) });
await new Promise(r => setTimeout(r, 10));
{ const ord = JSON.parse(clipped);
  ok(ord.kind === "trizone-next-bestallning", "beställningen hamnar i urklipp med eget kind-fält");
  ok(ord.protected.some(p => p.id === "sk-w42-str-core"),
     "protected-listan bär skyddspasset ur planen");
  ok(!clipped.includes("reason") && !clipped.includes("stressfraktur"),
     "SMOKE B6: reason förekommer aldrig i det som når urklippet");
  ok(ord.engine.lowShareTarget != null && typeof ord.benchmarks === "object",
     "motorvärden och benchmarks följer med");
  ok(![...mem.values()].some(v => String(v).includes("trizone-next-bestallning")),
     "beställningen lagras ALDRIG — komponeras på begäran och lämnar inga spår"); }

/* ---------- Fasbriefing (B1) — bor i planheron sedan 0.18 (U1) ---------- */
clickBtn({ nav: "plan" });
has(els.app.innerHTML, "Fas · Skelettblock", "briefexpandern bär blockets etikett som eyebrow");
ok(!els.app.innerHTML.includes("Skelettblocket bygger vanan"), "briefen är hopfälld tills man ber om den");
clickBtn({ briefopen: "" });
has(els.app.innerHTML, "Skelettblocket bygger vanan", "expandern fäller ut hela briefen — texten oavkortad");
clickBtn({ briefopen: "" });
ok(!els.app.innerHTML.includes("Skelettblocket bygger vanan"), "…och går att fälla ihop igen");

/* ================================================================
   FAS B — anslutning, hämtning, fallback, wellness (0.10.0)
   ================================================================ */
clickBtn({ nav: "installningar" });
has(els.app.innerHTML, "intervals.icu", "anslutningssektionen finns i Inställningar");
has(els.app.innerHTML, "ingen anslutning konfigurerad", "utan anslutning sägs det rakt ut");
has(els.app.innerHTML, "Testa anslutningen", "testknappen finns");
has(els.app.innerHTML, 'type="password"', "API-nyckeln skrivs i lösenordsfält, inte i klartext");
has(els.app.innerHTML, "aldrig till en säkerhetskopia", "det sägs var nyckeln INTE hamnar");
has(els.app.innerHTML, "read-only", "före anslutning läses v32-cachen och det redovisas");

/* Fallback: utan egen cache gäller v32 — men bara då */
has(els.app.innerHTML, "v32-cachen", "källraden namnger v32 som nuvarande källa");
has(els.app.innerHTML, "ingen wellnessdata", "wellness saknas och det syns");

/* Anslutningen avvisar skräp innan den sparas */
els.connKey = { value: "abcdefghijkl" }; els.connId = { value: "gurka" }; els.connDays = { value: "370" };
clickBtn({ connsave: "" });
has(els.app.innerHTML, "i123456", "ogiltigt athlete-ID avvisas med väntat format");
ok(!mem.has("trizone.next.cfg.v1") || !JSON.parse(mem.get("trizone.next.cfg.v1")).conn?.athleteId,
   "avvisad anslutning skrivs aldrig till lagringen");

els.connKey = { value: "kort" }; els.connId = { value: "i123456" };
clickBtn({ connsave: "" });
has(els.app.innerHTML, "Developer", "för kort nyckel säger var den riktiga hämtas");

/* Giltig anslutning sparas */
els.connKey = { value: "hemlignyckel1234" }; els.connId = { value: "i123456" }; els.connDays = { value: "370" };
clickBtn({ connsave: "" });
has(els.app.innerHTML, "Anslutningen sparad", "giltig anslutning sparas");
ok(JSON.parse(mem.get("trizone.next.cfg.v1")).conn.apiKey === "hemlignyckel1234",
   "anslutningen ligger i cfg — bredvid bindningarna (D7)");

/* Testknappen slår mot atletprofilen och rapporterar namn */
clickBtn({ conntest: "" });
await new Promise(r => setTimeout(r, 20));
has(els.app.innerHTML, "Anslutningen fungerar", "testknappen bekräftar mot riktigt svar");
has(els.app.innerHTML, "3 grenar", "testet redovisar vad som faktiskt hittades");
ok(icuCalls.length === 1 && icuCalls[0].url.endsWith("/athlete/i123456"),
   "testknappen hämtar bara profilen — inte hela historiken");

/* SÄKERHET: nyckeln i header, aldrig i URL, aldrig via mellanhand */
ok(icuCalls[0].headers.Authorization?.startsWith("Basic "),
   "SÄKERHET: anropet bär Basic-auth i header");
ok(!icuCalls.some(c => c.url.includes("hemlignyckel")),
   "SÄKERHET: nyckeln hamnar aldrig i en URL");

/* Hämtning: tre anrop, egen cache skrivs, källan byter */
clickBtn({ sync: "" });
await new Promise(r => setTimeout(r, 30));
ok(icuCalls.length === 4, "Uppdatera nu gör exakt tre anrop (aktiviteter, wellness, profil)");
ok(icuCalls.some(c => c.url.includes("/activities?oldest=")), "aktivitetsanropet bär historikfönstret");
ok(mem.has("trizone.next.cache.v1"), "hämtningen skriver till EGEN cachenyckel");
{ const c = JSON.parse(mem.get("trizone.next.cache.v1"));
  ok(c.activities.length === 8, "alla aktiviteter projiceras in (5 + 3 historiklöpningar)");
  ok(!("kudos_count" in c.activities.find(a => a.id === 901)),
     "okända fält vitlistas bort på vägen in (F5)");
  ok(c.activities.find(a => a.id === 901).icu_rpe === 6, "icu_rpe följer med i egen projektion");
  ok(c.wellness.length === 35, "wellness cachas");
  ok(c.athlete.sports.run.lthr === 173, "atletprofilen cachas med zoner och LTHR");
  ok(c.fetched.activities === "2026-10-15", "hämtningstidpunkten stämplas"); }
ok(!JSON.parse(mem.get("trizone.cache.v1")).__touched,
   "v32:s cache skrivs ALDRIG — den läses read-only");

has(els.app.innerHTML, "Hämtat:", "synken redovisar vad som hämtades");
has(els.app.innerHTML, "egen cache", "källan har bytt till egen cache");
has(els.app.innerHTML, "35 dagar", "wellnessdagarna redovisas");

/* Benchmarks läses ur profilen — och ändras aldrig här */
has(els.app.innerHTML, "262", "FTP läses ur intervals.icu-profilen");
has(els.app.innerHTML, "5:37/km", "tröskeltempot avkodas ur m/s");
has(els.app.innerHTML, "2:04/100 m", "CSS avkodas ur simmens tröskel");
has(els.app.innerHTML, "ändras aldrig här", "appen är läsare, inte register — zoner sätts i intervals.icu");

/* Full zonparitet mot profilens faktiska gränser */
has(els.app.innerHTML, "zonparitet mot intervals.icu", "pariteten granskas mot profilen, inte bara vektorlängd");
has(els.app.innerHTML, "LTHR 173", "zongränsernas ursprung redovisas granskningsbart");

/* Återhämtning: alternativ C, egen baslinje */
has(els.app.innerHTML, "Vilopuls i morse", "dagssignalen visas");
has(els.app.innerHTML, "normal 48", "baslinjen är HANS egen, inte ett absolut tal");
has(els.app.innerHTML, "din egen baslinje", "det sägs uttryckligen att måttet är relativt");

/* Alternativ C i UI: trendsignalen VARNAR (nivå 3), dagssignalen FRÅGAR (nivå 1) */
clickBtn({ nav: "idag" });
has(els.app.innerHTML, "Motorn varnar", "trendsignalen når varningstrappan");
has(els.app.innerHTML, "recovery-watch", "trendvarningen namnger sin regel");
has(els.app.innerHTML, "Volym går bra", "varningen säger vad man KAN göra, inte bara vad som är fel");
has(els.app.innerHTML, "Nivå 3 ändrar aldrig planen", "trendsignalen rör aldrig planen");
ok(!JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-run-thr"]?.events
     ?.some(e => e.rule === "sleep-guard" || e.rule === "recovery-watch"),
   "varken dags- eller trendsignal ändrar overlayn på egen hand (D2, H1)");

/* Dagssignalen frågar bara när dagen faktiskt bär ett kvalitetspass.
   Här ligger torsdagens A-pass flyttat till fredag av ett tidigare test —
   motorn läser det ÖVERLAGRADE läget, inte källplanens dag. Det är regeln
   som fungerar, inte ett bortfall: en fråga om ett pass som inte ligger idag
   vore precis det tjat den externa granskningen varnade för. */
ok(!els.app.innerHTML.includes("Sov du dåligt"),
   "sleep-guard tiger när dagen saknar kvalitetspass — motorn läser överlagrat läge");

/* Nyckeln följer aldrig med säkerhetskopian */
clickBtn({ nav: "installningar" });
fire("click", { target: target({ backup: "" }, ["data-backup"]) });
await new Promise(r => setTimeout(r, 10));
ok(!String(clipped).includes("hemlignyckel"),
   "SÄKERHET: API-nyckeln finns inte i säkerhetskopian");
ok(JSON.parse(clipped).cfg.conn.athleteId === "i123456",
   "athlete-ID följer med — det är inte hemligt");
ok(JSON.parse(mem.get("trizone.next.cfg.v1")).conn.apiKey === "hemlignyckel1234",
   "exporten muterar inte den sparade anslutningen");

/* Fel från API:et pekar på rotorsak och dödar aldrig appen */
icuState.status = 401;
clickBtn({ sync: "" });
await new Promise(r => setTimeout(r, 30));
has(els.app.innerHTML, "nyckeln avvisades", "401 förklaras som fel nyckel, inte 'något gick fel'");
ok(JSON.parse(mem.get("trizone.next.cache.v1")).activities.length === 8,
   "misslyckad hämtning lämnar den gamla cachen orörd");
icuState.status = 200;

icuState.throwOn = "/wellness";
clickBtn({ sync: "" });
await new Promise(r => setTimeout(r, 30));
has(els.app.innerHTML, "Hämtat:", "ett trasigt anrop sänker inte de andra");
ok(JSON.parse(mem.get("trizone.next.cache.v1")).wellness.length === 35,
   "wellness-facket behåller sitt gamla värde när dess anrop failar (patch-semantik)");
icuState.throwOn = null;

/* swimHrValid: reglaget finns, är av från start, och styr både remsa och paritet */
has(els.app.innerHTML, "Simpuls", "simpulsavsnittet finns i Inställningar");
has(els.app.innerHTML, "Pulsremsa på simpass: av", "reglaget är AV från start");
has(els.app.innerHTML, "simdugligt bröstband", "det sägs vad som krävs för att slå på det");
has(els.app.innerHTML, "utan pulsremsa", "zonparitetsraden redovisar sim som undantagen");
clickBtn({ nav: "plan" });
tapCard("sk-w42-swim-css");
has(els.app.innerHTML, "Simpuls (optisk) är ogiltig", "simpass visar tempo, aldrig en låtsasremsa");
clickBtn({ cancel: "" });
clickBtn({ nav: "installningar" });
clickBtn({ swimhr: "" });
has(els.app.innerHTML, "Pulsremsa på simpass: på", "reglaget går att slå på");
has(els.app.innerHTML, "granskar nu även simmens", "påslaget förklarar vad det innebär");
ok(JSON.parse(mem.get("trizone.next.cfg.v1")).swimHrValid === true,
   "swimHrValid sparas i profilen (D7), inte i planen");
ok(!els.app.innerHTML.includes("utan pulsremsa"),
   "med flaggan på granskas sim som alla andra grenar");
clickBtn({ nav: "plan" });
tapCard("sk-w42-swim-css");
ok(!els.app.innerHTML.includes("Simpuls (optisk) är ogiltig"),
   "med flaggan på försvinner ursäkten — remsan renderas");
has(els.app.innerHTML, "fysiologiskt lägre", "simremsan bär sin tolkningsnot (matchning §3)");
clickBtn({ cancel: "" });
clickBtn({ nav: "installningar" });
clickBtn({ swimhr: "" });
has(els.app.innerHTML, "Pulsremsa på simpass: av", "reglaget går att slå av igen");
ok(JSON.parse(mem.get("trizone.next.cfg.v1")).swimHrValid === false, "avslaget sparas också");

/* ---------- ANALYS-vyn (0.11.0) ---------- */
/* Regressionsvakt 0.16.0: motorvärden bor under cfg.engine men griden läser
   platt — före fixen jämförde Analys alltid mot 78/110 % oavsett profil. */
clickBtn({ nav: "installningar" });
els['[data-eng="volumeCapPct"]'] = { value: "180" };
clickBtn({ engsave: "" });
ok(JSON.parse(mem.get("trizone.next.cfg.v1")).engine?.volumeCapPct === 180,
   "volymtaket 180 % sparas under engine");
clickBtn({ nav: "analys" });
has(els.app.innerHTML, "Analys", "Analys finns som egen vy");
has(els.app.innerHTML, "aldrig gissningar", "vyn deklarerar sin egen ambition");
has(els.app.innerHTML, "Belastning", "dimension 1 finns");
has(els.app.innerHTML, "Intensitet", "dimension 2 finns");
has(els.app.innerHTML, "Dagsform", "dimension 3 finns");
has(els.app.innerHTML, "Skaderisk", "dimension 4 finns som flik");
has(els.app.innerHTML, "Inte kopplad än", "skaderisk säger rakt ut att den saknar funktion");
ok(!/ingen aktiv flagga/i.test(els.app.innerHTML),
   "skaderisk PÅSTÅR ALDRIG att risken är låg — en grön prick utan bedömning vore en lögn");
ok(els.app.innerHTML.includes('class="dot idle"'),
   "skaderisk bär neutral markör, inte statusfärg");
ok((els.app.innerHTML.match(/class="dimcard/g) ?? []).length === 4, "griden har fyra kort");

/* L3: visa → förklara → fördjupa. Varför ligger ett tryck bort, inte framme. */
ok(!els.app.innerHTML.includes("dimwhy"), "varför är dolt tills man frågar efter det");
clickBtn({ dim: "form" });
has(els.app.innerHTML, "dimwhy", "ett tryck fäller ut varför");
has(els.app.innerHTML, "normalen", "dagsformens varför visar baslinjen, inte bara värdet");
clickBtn({ dim: "form" });
ok(!els.app.innerHTML.includes("dimwhy"), "ett andra tryck fäller in igen");
clickBtn({ dim: "intensity" });
has(els.app.innerHTML, "28 dagar", "V28-REGELN: procentsiffran bär sitt tidsfönster");
has(els.app.innerHTML, "Fasens mål 75 %", "blocks[].lowShare: fasens mål visas i Analys (beslut A)");
has(els.app.innerHTML, "Skelettblock", "fasmålet bär sin källa — blocket namnges");
clickBtn({ dim: "intensity" });
clickBtn({ dim: "load" });
has(els.app.innerHTML, "(180 %)", "REGRESSION 0.16.0: profilens volymtak når griden — cfg.engine plattas ut");
clickBtn({ dim: "load" });

/* Grafer: ett koordinatsystem per axel (v29-lärdomen) */
has(els.app.innerHTML, "Belastning · 8 veckor", "belastningsgrafen finns");
has(els.app.innerHTML, "barcol", "staplarna renderas");
has(els.app.innerHTML, "Timmar per vecka", "grafen säger vad axeln visar");
ok(!els.app.innerHTML.includes("Dagsform · vilopuls"),
   "0.14.0: vilopulskurvan är BORTA — ersatt av inforutan (produktägarbeslut, missades i 0.13.0)");
has(els.app.innerHTML, "vilopuls", "vilopulsen finns kvar i text — i inforutan och motorförklaringen");
has(els.app.innerHTML, "ändrar aldrig något själv", "kurvan säger vad motorn gör med avvikelsen");
has(els.app.innerHTML, "aldrig ur skattningar", "det som saknas redovisas ärligt");

/* ---------- PMC (0.12.0): intervals.icu räknar, appen räknar aldrig om ---------- */
has(els.app.innerHTML, "fitness och trötthet", "PMC-avsnittet finns");
has(els.app.innerHTML, "Form (TSB)", "TSB redovisas");
has(els.app.innerHTML, "Fitness (CTL)", "legenden namnger kurvorna");
has(els.app.innerHTML, "räknar dem aldrig om",
   "M2: det sägs att CTL/ATL kommer färdiga — appen gör ingen andra beräkning");
has(els.app.innerHTML, "hur benen känns", "TSB-tolkningen relativiseras mot verkligheten");

/* ---------- Effektivitet: härledda fönster, Z2/Z3-växling ---------- */
has(els.app.innerHTML, "Aerob effektivitet", "effektivitetsavsnittet finns");
has(els.app.innerHTML, "aldrig prognos", "avsnittet deklarerar att det är uppmätt");
has(els.app.innerHTML, "Löpning", "grenväljaren finns");
has(els.app.innerHTML, "dina egna zongränser", "fönstrens ursprung sägs ut");
has(els.app.innerHTML, "Z2 · 129–148", "Z2-fönstret HÄRLEDS ur profilen och visas på knappen");
has(els.app.innerHTML, "Z3 · 149–162", "Z3-fönstret finns som val — racepace-jämförelsen");
clickBtn({ effzone: "3" });
ok(els.app.innerHTML.includes('data-effzone="3"'), "zonvalet går att växla");
clickBtn({ effsport: "swim" });
has(els.app.innerHTML, "aldrig på puls", "sim väljs på distans — simpuls är inte mätdata");
ok(!els.app.innerHTML.includes("Z2 · "), "sim visar inga pulszonval alls");
clickBtn({ effsport: "bike" });
has(els.app.innerHTML, "Z2 · 121–140", "cykeln bär sina EGNA gränser, aldrig löpningens");
clickBtn({ effsport: "run" });
clickBtn({ effzone: "2" });

clickBtn({ nav: "installningar" });

/* ---------- 0.13.0: wattregression, intervall, inforuta, tryckbara grafer ---------- */
clickBtn({ nav: "analys" });
has(els.app.innerHTML, "Sömn 3 nätter", "v32:s inforuta finns — sömn, vilopuls, HRV mot baslinje");
has(els.app.innerHTML, "baslinje", "inforutan redovisar baslinjerna");
has(els.app.innerHTML, "1M", "PMC har tidsintervallväljare");
has(els.app.innerHTML, "Tryck i grafen för en dag", "PMC-grafen deklarerar sin tryckbarhet");
has(els.app.innerHTML, "Belastning/dag, grenfärg", "TSS-staplarna i grenfärg finns i legenden");

clickBtn({ pmcday: "2026-10-15" });
has(els.app.innerHTML, "ptdetail", "tryck på en dag fäller ut detaljraden");
has(els.app.innerHTML, "Löp 55 TSS", "dagdetaljen visar belastning per gren");
clickBtn({ pmcday: "2026-10-15" });
ok(!els.app.innerHTML.includes("Löp 55 TSS"), "andra trycket fäller in detaljen");

/* REGRESSION device_watts: spinningpasset får inte längre uteslutas */
clickBtn({ effsport: "bike" });
has(els.app.innerHTML, "(1 av minst 4)", "REGRESSION: device_watts-passet räknas nu in i fönstret");
ok(!els.app.innerHTML.includes("utan wattmätare uteslutna"),
   "REGRESSION: inga falska uteslutningar när mätaren finns");
has(els.app.innerHTML, "3M", "effektiviteten har tidsintervallväljare");
clickBtn({ effsport: "run" });
ok(els.app.innerHTML.includes("minst 4"), "run: för få pass i stubben — meddelas ärligt i stället för tom graf");

clickBtn({ nav: "installningar" });

/* Cachen går att rensa — och då gäller v32 igen */
clickBtn({ clearcache: "" });
ok(!mem.has("trizone.next.cache.v1"), "datacachen går att rensa");
has(els.app.innerHTML, "read-only", "efter rensning faller källan tillbaka på v32 igen");

/* ---------- 0.17.1: Planposition (U5) — passerade veckor hopfällda ----------
   Tidsskifte via __TZ_TODAY, ÅTERSTÄLLS efteråt. Exakta kvoter testas i
   core-fixturerna; här testas att vyn fäller, expanderar och återgår. */
clickBtn({ nav: "plan" });
ok(!els.app.innerHTML.includes("avklarad"), "U5: inga passerade veckor ⇒ ingen hopfällningsrad");
has(els.app.innerHTML, "<h1>Vecka 42</h1>", "U5: innevarande vecka renderas som vanligt");

globalThis.__TZ_TODAY = "2026-10-26";                /* måndag efter v.43 */
clickBtn({ nav: "idag" }); clickBtn({ nav: "plan" });
has(els.app.innerHTML, "2 avklarade veckor", "U5: två passerade veckor fälls ihop till en rad");
ok(!els.app.innerHTML.includes("<h1>Vecka 42</h1>"), "U5: passerad vecka renderas inte hopfälld");
has(els.app.innerHTML, "<h1>Vecka 44</h1>", "U5: innevarande vecka står överst — Plan öppnar på nu");
has(els.app.innerHTML, "ljusare = hårdare", "U5: zonlegenden följer första SYNLIGA veckan");

clickBtn({ pastopen: "" });
has(els.app.innerHTML, "<h1>Vecka 42</h1>", "U5: expandering visar de passerade veckorna");
has(els.app.innerHTML, "Dölj", "U5: raden växlar till Dölj i öppet läge");
clickBtn({ pastopen: "" });
ok(!els.app.innerHTML.includes("<h1>Vecka 42</h1>"), "U5: hopfällning igen döljer dem");

globalThis.__TZ_TODAY = "2026-10-19";                /* måndag efter v.42 */
clickBtn({ nav: "idag" }); clickBtn({ nav: "plan" });
has(els.app.innerHTML, "1 avklarad vecka", "U5: singularform vid en passerad vecka");

globalThis.__TZ_TODAY = "2026-10-15";                /* ÅTERSTÄLLD */
clickBtn({ nav: "idag" }); clickBtn({ nav: "plan" });
ok(!els.app.innerHTML.includes("avklarad"), "U5: tiden återställd — sviten lämnar rent efter sig");

/* Svitvakt (fas B) — röksviten saknade den vakt kärnsviten fick efter
   2026-08-02. En avkortad svit som rapporterar grönt är värre än en röd. */
const EXPECTED_MIN = 297;
if (pass + fail < EXPECTED_MIN) {
  console.error(`  ✗ RÖKSVITEN AVBRÖTS: ${pass+fail} tester kördes, minst ${EXPECTED_MIN} väntade`);
  fail++;
}

console.log(`\n${pass}/${pass+fail} röktester gröna` + (fail ? ` — ${fail} RÖDA` : ""));
process.exit(fail ? 1 : 0);
