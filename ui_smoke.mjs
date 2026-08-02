/* TRIZONE Next — ui_smoke.mjs · BUILD next-0.3.0 · 2026-08-02
   Röktest av ui.js utan webbläsare: stubbad DOM, stubbad storage, stubbad fetch.
   Fångar importfel, renderingskrascher och trasiga händelseflöden innan enheten gör det.
   Kör tillsammans med core_test.mjs. */
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, true) : (fail++, console.error("  ✗ " + m), false);
const has = (s, txt, m) => ok(String(s).includes(txt), `${m} (hittade inte "${txt}")`);

const plan = JSON.parse(fs.readFileSync(new URL("./plan.json", import.meta.url)));
const els = { app: mkEl(), diag: mkEl() };
let handler = null;
function mkEl() { return { innerHTML: "", addEventListener: (_, h) => { handler = h; } }; }

const mem = new Map();
globalThis.window = { localStorage: {
  get length() { return mem.size; }, key: i => [...mem.keys()][i],
  getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) } };
globalThis.document = {
  getElementById: id => els[id],
  querySelector: () => ({ content: "next-0.3.0 · 2026-08-02" })
};
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
globalThis.location = { protocol: "file:" };
globalThis.fetch = async () => ({ json: async () => plan });

await import("./ui.js");
await new Promise(r => setTimeout(r, 20));

/* Rendering */
has(els.diag.innerHTML, "next-0.3.0", "paritetskortet renderas");
has(els.diag.innerHTML, "lagring", "lagringsraden renderas");
has(els.app.innerHTML, "Vecka 42", "veckovyn öppnar på rätt vecka");
has(els.app.innerHTML, "Löpintervaller", "passets titel renderas");
has(els.app.innerHTML, "Att placera", "menyn för oplacerade pass renderas");
has(els.app.innerHTML, "zstrip", "zonremsan renderas");
ok((els.app.innerHTML.match(/class="day/g) ?? []).length === 7, "sju dagrader renderas");
ok(!/undefined|NaN|\[object/.test(els.app.innerHTML), "ingen undefined/NaN läcker ut i markup");
ok(handler, "händelselyssnaren kopplas in");

/* Klickflöde: välj menypass → Placera → placera i slot */
const click = data => handler({ target: { closest: () => ({ dataset: data }) } });
click({ sess: "sk-w42-swim-ow" });
has(els.app.innerHTML, "sheetwrap", "tryck på pass öppnar justeringspanelen");
has(els.app.innerHTML, "Placera</button>", "menypass erbjuder Placera, inte Flytta");
click({ act: "move" });
has(els.app.innerHTML, "Placera här", "placeringsläget visar mål i varje fönster");
click({ place: "4|Morgon" });
has(els.app.innerHTML, "Placerat: fre Morgon", "placeringen kvitteras");
ok(!els.app.innerHTML.includes("Att placera"), "placerat pass lämnar menyn");
ok(JSON.parse(mem.get("trizone.overlay.v1")).placed["sk-w42-swim-ow"], "placeringen är sparad i lagret");

/* Strykning + ångring */
click({ sess: "sk-w42-swim-css" });
click({ act: "strike" });
has(els.app.innerHTML, "struket", "struket pass märks i vyn");
ok(JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-swim-css"].status === "struck",
   "strykningen är sparad");
click({ sess: "sk-w42-swim-css" });
click({ act: "restore" });
ok(!JSON.parse(mem.get("trizone.overlay.v1")).sessions["sk-w42-swim-css"].status,
   "strykningen går att häva från vyn");

/* Bläddring */
click({ week: "43" });
has(els.app.innerHTML, "Vecka 43", "veckobläddring fungerar");

console.log(`\n${pass}/${pass+fail} röktester gröna` + (fail ? ` — ${fail} RÖDA` : ""));
process.exit(fail ? 1 : 0);
