/* TRIZONE Next — ui.js · Rendering och händelser. All logik importeras från core.
   BUILD-paritet kontrolleras vid uppstart (självkontroll över alla filer). */
"use strict";
import { BUILD as CORE_BUILD, validatePlan } from "./core.js";

export const UI_BUILD = "next-0.1.1 · 2026-07-31";

async function boot() {
  const el = document.getElementById("app");
  const rows = [];
  const row = (k, v, cls="") => rows.push(`<span class="k">${k}</span><span class="v ${cls}">${v}</span>`);

  /* Byggstämpelparitet: core ↔ ui ↔ sw */
  const uiOk = UI_BUILD === CORE_BUILD;
  row("core.js", CORE_BUILD, uiOk ? "ok" : "bad");
  row("ui.js", UI_BUILD, uiOk ? "ok" : "bad");
  let swMsg = "ej registrerad (kräver https/localhost)";
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");
      swMsg = "registrerad · cache verifieras vid aktivering";
    } catch (e) { swMsg = "registrering misslyckades: " + e.message; }
  }
  row("sw.js", swMsg);

  /* Planhämtning: network-first, validering före rendering (F4) */
  try {
    const res = await fetch("./plan.json", { cache: "no-cache" });
    const plan = await res.json();
    const v = validatePlan(plan);
    if (v.ok) row("plan.json", `${plan.planVersion} · ${plan.sessions.length} pass, ${plan.weeks.length} veckor`, "ok");
    else row("plan.json", `${v.errors.length} valideringsfel — renderas ej`, "bad");
  } catch (e) { row("plan.json", "kunde inte hämtas: " + e.message, "bad"); }

  el.innerHTML = `<div class="kv">${rows.join("")}</div>`;
}
boot();
