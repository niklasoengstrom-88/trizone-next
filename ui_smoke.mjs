/* TRIZONE Next — ui_smoke.mjs · BUILD next-0.9.0 · 2026-08-03
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
  querySelector: sel => sel?.startsWith?.("meta") ? { content: "next-0.9.0 · 2026-08-03" }
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
globalThis.fetch = async () => ({ json: async () => plan });
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
  clickBtn({ backtoday: "" });
  has(els.app.innerHTML, "Klart för idag", "tillbaka till idag återställer hjälten"); }
{ clickBtn({ selday: "42|0" });
  has(els.app.innerHTML, "Ingen träning planerad", "dag utan pass i bläddring ⇒ vila");
  clickBtn({ backtoday: "" }); }

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
  has(els.app.innerHTML, "Ingrepp på detta pass", "P3: händelserna följer passet, inte bara loggen");
  await new Promise(r => setTimeout(r, 520));
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
  const touched = Object.entries(ov.sessions).filter(([, v]) => v.adjust?.durationMin || v.status === "struck");
  ok(touched.length > 0, "motorn ingriper: A-pass till underhållsdos, B-pass stryks");
  ok(touched.every(([, v]) => v.events.some(e => e.rule === "mode-vacation")),
     "P3: varje ingrepp lämnar läsbar post");
  ok(!ov.sessions["sk-w42-swim-css"]?.status,
     "läge som börjar idag rör inte gårdagens pass — inga retroaktiva ingrepp");
  const before = touched.map(([id, v]) => [id, v.adjust?.durationMin ?? null, v.status ?? null]);
  clickBtn({ nav: "idag" });
  has(els.app.innerHTML, "modechip", "aktivt läge syns på Idag");
  clickBtn({ nav: "plan" });
  clickBtn({ mode: "mode-vacation" });
  const off = JSON.parse(mem.get("trizone.overlay.v1"));
  /* §9: motorns ingrepp återställs — men pass du själv rört behåller DIN version */
  const mineToo = new Set(["sk-w42-bike-long", "sk-w42-run-easy"]);   /* justerade för hand i §5d-blocket */
  const pure = before.map(([id]) => id).filter(id => !mineToo.has(id));
  ok(pure.length > 0 && pure.every(id => !off.sessions[id].adjust?.durationMin && off.sessions[id].status !== "struck"),
     "avaktivering återställer exakt det motorn gjorde (P5)");
  ok(off.sessions["sk-w42-bike-long"].adjust?.durationMin === 90,
     "pass du justerat för hand behåller din version — handen vinner över motorn (§9)");
  ok(off.sessions["sk-w42-bike-long"].events.some(e => String(e.rule).startsWith("undo:")),
     "och valet redovisas i passets historik");
  ok(!off.modes.active.length, "läget är borta"); }

/* ---------- Skalet (0.7.0): flikar och vyer ---------- */
has(els.app.innerHTML, 'data-nav="plan"', "fliken Plan finns");
has(els.app.innerHTML, 'data-nav="logg"', "fliken Logg finns");
has(els.app.innerHTML, 'data-nav="installningar"', "fliken Inställningar finns");
ok(!els.app.innerHTML.includes("Utanför plan"), "Utanför plan bor inte längre i planvyn");
clickBtn({ nav: "installningar" });
has(els.app.innerHTML, "next-0.9.0", "byggstämpeln bor i Inställningar (T2)");
has(els.app.innerHTML, ">TRIZONE<", "wordmark bor i Inställningar, inte i appkromet");
has(els.app.innerHTML, "Livsschema", "livsschemat är redigerbart i Inställningar (D7)");
has(els.app.innerHTML, 'data-sched="2|Morgon"', "schemachipsen renderas per dag och fönster");
has(els.app.innerHTML, "data-buzztest", "haptiktestet bor i Inställningar");
has(els.app.innerHTML, "Föräldralösa överlagringar · 1", "föräldralösa får en beslutsvy");
has(els.app.innerHTML, "forsvunnet-pass-1", "den föräldralösa posten visas med sitt id");
{ clickBtn({ sched: "2|Morgon" });
  const cfg = JSON.parse(mem.get("trizone.next.cfg.v1"));
  ok(cfg.schedule["2"].includes("Morgon"), "schemaändring sparas i cfg-nyckeln");
  clickBtn({ sched: "2|Morgon" });
  ok(!JSON.parse(mem.get("trizone.next.cfg.v1")).schedule["2"].includes("Morgon"),
     "schemachip går att slå av igen"); }
{ clickBtn({ orphan: "forsvunnet-pass-1|archive" });
  const ov = JSON.parse(mem.get("trizone.overlay.v1"));
  ok(!ov.orphans.some(o => o.id === "forsvunnet-pass-1") && ov.archive["forsvunnet-pass-1"],
     "arkivering flyttar posten och sparas");
  ok(!els.app.innerHTML.includes("Föräldralösa"), "tömd lista försvinner ur vyn"); }
clickBtn({ nav: "logg" });
has(els.app.innerHTML, "Händelser", "Loggen visar händelselistan");
has(els.app.innerHTML, "orphan", "arkiveringsbeslutet är en läsbar post i loggen (P3)");
has(els.app.innerHTML, "Utanför plan", "Utanför plan bor i Loggen");
clickBtn({ nav: "plan" });

/* ---------- Löpande listan ---------- */
has(els.app.innerHTML, "Vecka 42", "vecka 42 i listan");
has(els.app.innerHTML, "Vecka 43", "vecka 43 i samma lista — ingen bläddring");
has(els.app.innerHTML, "Vecka 44", "vecka 44 i samma lista");
ok((els.app.innerHTML.match(/class="day/g) ?? []).length === 21, "21 dagrader — hela planen i följd");
has(els.app.innerHTML, "12 okt – 18 okt", "veckorubriken bär sina datum");
has(els.app.innerHTML, "ljusare = hårdare", "zonrampens legend finns");
ok(!els.app.innerHTML.includes('class="wtag"'), "fönstertaggen är borta ur kortet (0.5.2)");
has(els.app.innerHTML, "50 min", "kortet bär gren, prio, duration och titel — inget mer");
has(els.app.innerHTML, "data-today", "Idag-knappen finns");
ok(!/undefined|NaN|\[object/.test(els.app.innerHTML), "ingen undefined/NaN läcker ut i markup");

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
clickBtn({ nav: "logg" });
has(els.app.innerHTML, "Utanför plan", "främmande aktivitet listas utanför plan — i Loggen");
clickBtn({ nav: "plan" });
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

console.log(`\n${pass}/${pass+fail} röktester gröna` + (fail ? ` — ${fail} RÖDA` : ""));
process.exit(fail ? 1 : 0);
