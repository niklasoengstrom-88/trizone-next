/* TRIZONE Next — ui.js · Rendering och händelser. All logik importeras från core.
   Byggstämpelparitet över ALLA fem filer: core, ui, index (meta), sw (aktiv cache), plan. */
"use strict";
import { BUILD as CORE_BUILD, validatePlan, makeStore } from "./core.js";

export const UI_BUILD = "next-0.2.1 · 2026-08-02";

async function boot() {
  const el = document.getElementById("app");
  const rows = [];
  const row = (k, v, cls="") => rows.push(`<span class="k">${k}</span><span class="v ${cls}">${v}</span>`);
  const stamp = UI_BUILD.split(" ")[0];                    /* "next-0.2.1" */

  row("core.js", CORE_BUILD, CORE_BUILD === UI_BUILD ? "ok" : "bad");
  row("ui.js", UI_BUILD, CORE_BUILD === UI_BUILD ? "ok" : "bad");

  const meta = document.querySelector('meta[name="build"]')?.content ?? "meta saknas";
  row("index.html", meta, meta === UI_BUILD ? "ok" : "bad");

  /* sw: registrera + läs AKTIV cache — avslöjar halvlandade deployer */
  let swTxt = "ej registrerad (kräver https/localhost)", swCls = "";
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    try {
      await navigator.serviceWorker.register("./sw.js");
      const keys = await caches.keys();
      const mine = keys.filter(k => k.startsWith("trizone-next-"));
      const want = "trizone-next-" + stamp.replace("next-", "");
      if (!mine.length) { swTxt = "registrerad · cache byggs vid aktivering"; }
      else if (mine.length === 1 && mine[0] === want) { swTxt = mine[0]; swCls = "ok"; }
      else { swTxt = mine.join(", ") + " (väntat " + want + ") — ladda om"; swCls = "bad"; }
    } catch (e) { swTxt = "registrering misslyckades: " + e.message; swCls = "bad"; }
  }
  row("sw-cache", swTxt, swCls);

  /* plan: network-first, trimmad projektion till lagret (planformat §4.4) */
  const store = makeStore(window.localStorage);
  let plan = null;
  try {
    const res = await fetch("./plan.json", { cache: "no-cache" });
    plan = await res.json();
    const v = validatePlan(plan);
    if (v.ok) row("plan.json", `${plan.planVersion} · ${plan.sessions.length} pass, ${plan.weeks.length} veckor`, "ok");
    else { row("plan.json", `${v.errors.length} valideringsfel — renderas ej`, "bad"); plan = null; }
  } catch (e) {
    plan = store.loadPlan();                              /* offline: cachad projektion */
    row("plan.json", plan ? `offline · cachad ${plan.planVersion}` : "kunde inte hämtas: " + e.message,
        plan ? "" : "bad");
  }

  /* lagring: kvotvakt, avstämning, spärr vid trasig overlay (planformat §5, §7, F5) */
  if (plan) {
    const w = store.savePlan(plan);
    const l = store.loadOverlay(plan);
    if (l.dirty && !l.blocked) store.saveOverlay(l.overlay);
    const rep = store.report();
    const kb = n => (n / 1024).toFixed(1) + " kB";
    let txt, cls = "ok";
    if (l.blocked)        { txt = "SPÄRRAD — " + l.errors[0]; cls = "bad"; }
    else if (!w.ok)       { txt = w.error; cls = "bad"; }
    else {
      txt = `${rep.keys.length} nycklar · ${kb(rep.total)} totalt`;
      if (l.orphans?.length) { txt += ` · ${l.orphans.length} föräldralösa väntar på beslut`; cls = ""; }
    }
    row("lagring", txt, cls);
  }

  el.innerHTML = `<div class="kv">${rows.join("")}</div>`;
}
boot();
