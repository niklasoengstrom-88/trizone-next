/* TRIZONE Next — ui_smoke.mjs · BUILD next-0.4.0 · 2026-08-02
   Röktest av ui.js utan webbläsare: stubbad DOM, storage, pekare och geometri.
   Kör hela klickvägen OCH hela dragvägen. Kör tillsammans med core_test.mjs. */
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, true) : (fail++, console.error("  ✗ " + m), false);
const has = (s, txt, m) => ok(String(s).includes(txt), `${m} (hittade inte "${txt}")`);
const plan = JSON.parse(fs.readFileSync(new URL("./plan.json", import.meta.url)));

/* ---------- Geometri för den fejkade vyn: dag d på y=100+d*90, tre fönster à 28 px ---------- */
const dayRect = d => ({ left: 0, top: 100 + d * 90, width: 360, height: 90 });
const slotRect = (d, k) => ({ left: 20, top: 104 + d * 90 + k * 28, width: 320, height: 28 });
const SLOTS = ["Morgon", "Lunch", "Kväll"];
const fakeEl = (dataset, rect) => ({ dataset, getBoundingClientRect: () => rect,
                                     innerHTML: "", style: {}, remove() {} });

const H = {};                                        /* händelselyssnare per typ */
const mkRoot = () => ({
  innerHTML: "",
  addEventListener: (t, h) => { (H[t] ??= []).push(h); },
  setPointerCapture() {},
  querySelector: () => fakeEl({}, dayRect(0)),
  querySelectorAll: (sel) => {
    if (sel === "[data-day]") return [...Array(7)].map((_, d) => fakeEl({ day: String(d) }, dayRect(d)));
    if (sel === ".slot.droppable")
      return [...Array(7)].flatMap((_, d) => SLOTS.map((s, k) => fakeEl({ slot: `${d}|${s}` }, slotRect(d, k))));
    if (sel.startsWith(".nav")) return [];
    return [];
  }
});
const els = { app: mkRoot(), diag: mkRoot() };

const mem = new Map();
globalThis.window = { innerHeight: 800, scrollBy() {},
  localStorage: { get length() { return mem.size; }, key: i => [...mem.keys()][i],
    getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) } };
globalThis.document = {
  getElementById: id => els[id],
  querySelector: () => ({ content: "next-0.4.0 · 2026-08-02" }),
  addEventListener: (t, h) => { (H[t] ??= []).push(h); },
  createElement: () => fakeEl({}, dayRect(0)),
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
/* target.closest(sel): svarar bara på de selektorer som verkligen matchar elementet */
const target = (dataset, kinds) => ({
  dataset,
  closest: sel => kinds.some(k => sel.includes(k)) ? { dataset } : null
});
const tapCard = id => { const t = target({ sess: id }, ["data-sess"]);
  fire("pointerdown", { button: 0, target: t, clientX: 5, clientY: 5, pointerType: "touch", pointerId: 1 });
  fire("pointerup", { target: t }); };
const clickBtn = dataset => fire("click", { target: target(dataset, Object.keys(dataset).map(k => "data-" + k)) });

/* ---------- Rendering ---------- */
has(els.diag.innerHTML, "next-0.4.0", "paritetskortet renderas");
has(els.diag.innerHTML, "lagring", "lagringsraden renderas");
has(els.app.innerHTML, "Vecka 42", "veckovyn öppnar på rätt vecka");
has(els.app.innerHTML, "Löpintervaller", "passets titel renderas");
has(els.app.innerHTML, "Att placera", "menyn för oplacerade pass renderas");
has(els.app.innerHTML, "ljusare = hårdare", "zonrampens legend finns (designspråk §4)");
has(els.app.innerHTML, "grip", "passkortet visar dragaffordans");
ok((els.app.innerHTML.match(/class="day/g) ?? []).length === 7, "sju dagrader renderas");
ok(!/undefined|NaN|\[object/.test(els.app.innerHTML), "ingen undefined/NaN läcker ut i markup");

/* ---------- Tryckvägen (tangentbord/skärmläsare + fallback) ---------- */
tapCard("sk-w42-swim-ow");
has(els.app.innerHTML, "sheetwrap", "tryck på pass öppnar justeringspanelen");
has(els.app.innerHTML, "Placera</button>", "menypass erbjuder Placera");
clickBtn({ act: "move" });
has(els.app.innerHTML, "Placera här", "tryckvägen visar mål i alla tre fönster");
ok((els.app.innerHTML.match(/Placera här/g) ?? []).length >= 14,
   "alla dagar öppnar alla fönster — schemat begränsar inte placeringen");
clickBtn({ slot: "0|Morgon" });
has(els.app.innerHTML, "Placerat: mån Morgon", "placeringen kvitteras");
ok(JSON.parse(mem.get("trizone.overlay.v1")).placed["sk-w42-swim-ow"], "placeringen är sparad");

/* ---------- Dragvägen: långtryck → dra över dag → släpp i fönster ---------- */
const drag = (id, toDay, slotIdx, { hold = true } = {}) => {
  const t = target({ sess: id }, ["data-sess"]);
  fire("pointerdown", { button: 0, target: t, clientX: 100, clientY: 110, pointerType: "touch", pointerId: 2 });
  return new Promise(r => setTimeout(() => {                 /* invänta långtrycket */
    const rect = slotRect(toDay, slotIdx);
    const x = rect.left + 40, y = rect.top + 10;
    fire("pointermove", { clientX: x, clientY: y });
    if (hold) fire("pointerup", { }); else fire("pointercancel", {});
    r();
  }, 260));
};
await drag("sk-w42-run-thr", 5, 2);
has(els.app.innerHTML, "Flyttat: lör Kväll", "drag och släpp flyttar passet");
{ const ov = JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-run-thr"];
  ok(ov?.moved?.day === 5 && ov.moved.slot === "Kväll", "dragets flytt är sparad i overlayn");
  ok(ov.events.at(-1).rule === "manual-move", "P3: draget lämnar en läsbar post"); }
has(els.app.innerHTML, "lör", "vyn ritas om efter släppet");

/* Avbrutet drag ändrar ingenting */
const before = mem.get("trizone.overlay.v1");
await drag("sk-w42-bike-long", 1, 0, { hold: false });
ok(mem.get("trizone.overlay.v1") === before, "avbrutet drag lämnar overlayn orörd");
has(els.app.innerHTML, "avbröts", "avbrutet drag förklaras för användaren");

/* ---------- Strykning, ångring, bläddring ---------- */
tapCard("sk-w42-swim-css"); clickBtn({ act: "strike" });
has(els.app.innerHTML, "struket", "struket pass märks i vyn");
tapCard("sk-w42-swim-css"); clickBtn({ act: "restore" });
ok(!JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-swim-css"].status, "strykningen går att häva");
clickBtn({ week: "43" });
has(els.app.innerHTML, "Vecka 43", "veckobläddring fungerar");

console.log(`\n${pass}/${pass+fail} röktester gröna` + (fail ? ` — ${fail} RÖDA` : ""));
process.exit(fail ? 1 : 0);
