/* TRIZONE Next — ui_smoke.mjs · BUILD next-0.5.0 · 2026-08-02
   Röktest av ui.js utan webbläsare: stubbad DOM, storage, pekare och geometri.
   Löpande veckolista (beslut B), dag som släppmål (beslut A). */
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, true) : (fail++, console.error("  ✗ " + m), false);
const has = (s, txt, m) => ok(String(s).includes(txt), `${m} (hittade inte "${txt}")`);
const plan = JSON.parse(fs.readFileSync(new URL("./plan.json", import.meta.url)));

/* Geometri: 21 dagrader i följd — vecka wi, dag d på y = 100 + (wi*7+d)*80 */
const WEEKS = [42, 43, 44];
const dayRect = (wi, d) => ({ left: 0, top: 100 + (wi * 7 + d) * 80, width: 360, height: 80 });
const fakeEl = (dataset, rect) => ({ dataset, getBoundingClientRect: () => rect,
  innerHTML: "", style: {}, remove() {}, classList: { add() {}, remove() {} } });

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
const els = { app: mkRoot(), diag: mkRoot() };

const mem = new Map();
globalThis.window = { innerHeight: 2200, scrollBy() {},
  localStorage: { get length() { return mem.size; }, key: i => [...mem.keys()][i],
    getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) } };
globalThis.document = {
  getElementById: id => els[id] ?? null,
  querySelector: () => ({ content: "next-0.5.0 · 2026-08-02" }),
  addEventListener: (t, h) => { (H[t] ??= []).push(h); },
  createElement: () => fakeEl({}, dayRect(0, 0)),
  body: { classList: { add() {}, remove() {} }, appendChild() {} }
};
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
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
const tapCard = (id, wk = 42) => { const t = target({ sess: id }, ["data-sess"], wk);
  fire("pointerdown", { button: 0, target: t, clientX: 5, clientY: 5, pointerType: "touch", pointerId: 1 });
  fire("pointerup", { target: t, t: Date.now() }); };
const clickBtn = dataset => fire("click", { target: target(dataset, Object.keys(dataset).map(k => "data-" + k)) });

/* ---------- Löpande listan ---------- */
has(els.diag.innerHTML, "next-0.5.0", "paritetskortet renderas");
has(els.app.innerHTML, "Vecka 42", "vecka 42 i listan");
has(els.app.innerHTML, "Vecka 43", "vecka 43 i samma lista — ingen bläddring");
has(els.app.innerHTML, "Vecka 44", "vecka 44 i samma lista");
ok((els.app.innerHTML.match(/class="day/g) ?? []).length === 21, "21 dagrader — hela planen i följd");
has(els.app.innerHTML, "12 okt – 18 okt", "veckorubriken bär sina datum");
has(els.app.innerHTML, "ljusare = hårdare", "zonrampens legend finns");
has(els.app.innerHTML, 'class="wtag">Kväll', "planens fönsterförslag visas som metadata-tagg");
has(els.app.innerHTML, "data-today", "Idag-knappen finns");
ok(!/undefined|NaN|\[object/.test(els.app.innerHTML), "ingen undefined/NaN läcker ut i markup");

/* ---------- Tryckvägen: panel → dag ---------- */
tapCard("sk-w42-swim-ow");
has(els.app.innerHTML, "sheetwrap", "tryck på pass öppnar justeringspanelen");
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
await drag("sk-w42-run-thr", 1, 4);              /* vecka 43, fredag */
has(els.app.innerHTML, "Flyttat: fre v.43", "drag till en annan vecka i listan — släpp på dagen räcker");
{ const m = JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-run-thr"].moved;
  ok(m?.week === 43 && m.day === 4 && m.slot === null, "dragets flytt sparad utan fönstertvång");
}
const before = mem.get("trizone.overlay.v1");
await drag("sk-w42-bike-long", 0, 1, { commit: false });
ok(mem.get("trizone.overlay.v1") === before, "avbrutet drag lämnar overlayn orörd");
has(els.app.innerHTML, "avbröts", "avbrutet drag förklaras");

/* ---------- Strykning, ångring ---------- */
tapCard("sk-w42-swim-css"); clickBtn({ act: "strike" });
has(els.app.innerHTML, "struket", "struket pass märks i vyn");
tapCard("sk-w42-swim-css"); clickBtn({ act: "restore" });
ok(!JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-swim-css"].status, "strykningen går att häva");

console.log(`\n${pass}/${pass+fail} röktester gröna` + (fail ? ` — ${fail} RÖDA` : ""));
process.exit(fail ? 1 : 0);
