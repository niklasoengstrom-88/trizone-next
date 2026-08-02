/* TRIZONE Next — ui.js · Rendering och händelser. All logik importeras från core.
   Designspråk v0.1: S4 fönsterrader, L1 kort för objekt, L2 djup via ytsteg, T1 tvåröst.
   Byggstämpelparitet över ALLA fem filer: core, ui, index (meta), sw (aktiv cache), plan. */
"use strict";
import { BUILD as CORE_BUILD, validatePlan, makeStore, weekView, planWeeks,
         manualAdjust, shortDate, WINDOWS, DAYLABEL } from "./core.js";

export const UI_BUILD = "next-0.3.0 · 2026-08-02";

/* Livsschema: profildata (D7). Bor i konfigurationen tills Inställningar finns. */
const BINDINGS = { schedule: { 0:["Kväll"], 1:["Lunch","Kväll"], 2:["Kväll"], 3:["Kväll"],
                               4:["Morgon","Kväll"], 5:["Morgon","Kväll"], 6:["Kväll"] } };

const S = { plan:null, overlay:null, store:null, week:null, sel:null, placing:null, note:null };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const SPORTLABEL = { swim:"SIM", bike:"CYKEL", run:"LÖP", strength:"STYRKA" };
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const findSess = (v, id) =>
  [...v.days.flatMap(d => d.slots).flatMap(x => x.sessions), ...v.unplaced].find(x => x.id === id);

/* Zonremsa (S1, plansidan; utfallssidan tillkommer med matchningen) */
function zstrip(profile) {
  const segs = (profile ?? []).filter(p => Array.isArray(p) && p[1] > 0);
  return `<span class="zstrip" role="img" aria-label="Zonprofil">` +
    segs.map(([z, m]) => `<i style="flex:${m};background:var(--z${z})" title="Z${z} ${m} min">` +
      (m >= 8 ? `<b>Z${z}</b>` : "") + `</i>`).join("") + `</span>`;
}

function sessionCard(s) {
  const struck = s.status === "struck";
  return `<button class="sess${struck ? " struck" : ""}" data-sess="${esc(s.id)}">
    <i class="rib" style="background:var(--${esc(s.sport)})"></i>
    <span class="line1">
      <span class="prio p${esc(s.prio)}">${esc(s.prio)}</span>
      <span class="lbl">${SPORTLABEL[s.sport] ?? esc(s.sport)}</span>
      <span class="dur">${s.durationMin} min</span>
      ${s.protected ? `<span class="shield" title="Skyddat pass">◈</span>` : ""}
      ${struck ? `<span class="tag">struket</span>` : ""}
    </span>
    <span class="stitle">${esc(s.title ?? s.id)}</span>
    ${zstrip(s.profile)}
  </button>`;
}

/* ---------- Veckovyn (S4) ---------- */
function render() {
  const v = weekView(S.plan, S.overlay, S.week, BINDINGS);
  const weeks = planWeeks(S.plan);
  const i = weeks.indexOf(S.week);
  const sum = v.summary;
  const h = [];

  h.push(`<div class="wknav">
    <button class="nav" data-week="${weeks[i-1] ?? ""}" ${i <= 0 ? "disabled" : ""} aria-label="Föregående vecka">‹</button>
    <div class="wkhead">
      <div class="eyebrow">${esc(v.week?.block ?? "")} · ${esc(v.week?.type ?? "")}</div>
      <h1>Vecka ${S.week}</h1>
    </div>
    <button class="nav" data-week="${weeks[i+1] ?? ""}" ${i < 0 || i >= weeks.length-1 ? "disabled" : ""} aria-label="Nästa vecka">›</button>
  </div>`);

  if (v.week?.focus) h.push(`<p class="focus">${esc(v.week.focus)}</p>`);

  h.push(`<div class="sums">
    <span><b>${sum.planned}</b> pass</span>
    <span><b>${Math.round(sum.minutes / 6) / 10}</b> h planerat</span>
    ${sum.lowShare != null ? `<span><b>${Math.round(sum.lowShare * 100)} %</b> lågintensivt denna vecka</span>` : ""}
    ${sum.struck ? `<span class="dim">${sum.struck} struket</span>` : ""}
  </div>`);

  if (S.placing) h.push(`<div class="banner">Välj tidsfönster för <b>${esc(S.placing.title ?? S.placing.id)}</b>
    <button class="txtbtn" data-cancel="1">Avbryt</button></div>`);

  h.push(`<div class="week">`);
  for (const d of v.days) {
    const slots = S.placing
      ? [...new Set([...(BINDINGS.schedule[d.day] ?? []), ...d.slots.map(s => s.slot)])]
          .sort((a, b) => WINDOWS.indexOf(a) - WINDOWS.indexOf(b))
          .map(slot => d.slots.find(s => s.slot === slot) ?? { slot, scheduled: true, sessions: [] })
      : d.slots;
    h.push(`<section class="day${d.date === today() ? " today" : ""}">
      <div class="dhead"><span class="dname">${d.label}</span><span class="ddate">${shortDate(d.date)}</span>
        ${d.minutes ? `<span class="dmin">${d.minutes} min</span>` : ""}</div>
      <div class="dslots">`);
    if (!slots.length) h.push(`<div class="rest">vila</div>`);
    for (const sl of slots) {
      h.push(`<div class="slot${sl.scheduled ? "" : " offsched"}">
        <span class="wchip">${esc(sl.slot)}</span>
        <div class="sessions">`);
      h.push(sl.sessions.map(s => sessionCard(s)).join(""));
      if (S.placing) h.push(`<button class="target" data-place="${d.day}|${esc(sl.slot)}">Placera här</button>`);
      h.push(`</div></div>`);
    }
    h.push(`</div></section>`);
  }
  h.push(`</div>`);

  if (v.unplaced.length) h.push(`<section class="menu">
    <div class="eyebrow">Att placera · ${v.unplaced.length}</div>
    <p class="hint">Passen ligger utanför dagarna tills du placerar dem.</p>
    ${v.unplaced.map(s => sessionCard(s)).join("")}
  </section>`);

  if (S.sel) { const s = findSess(v, S.sel); if (s) h.push(sheet(s)); }
  if (S.note) h.push(`<div class="toast${S.note.bad ? " bad" : ""}">${esc(S.note.text)}</div>`);

  document.getElementById("app").innerHTML = h.join("");
}

function sheet(s) {
  const placed = s.day != null && s.slot;
  return `<div class="sheetwrap" data-close="1"><div class="sheet" role="dialog" aria-label="Justera pass">
    <div class="eyebrow">${SPORTLABEL[s.sport] ?? esc(s.sport)} · ${s.durationMin} min · prio ${esc(s.prio)}</div>
    <h2>${esc(s.title ?? s.id)}</h2>
    ${s.text?.brief ? `<p class="serif">${esc(s.text.brief)}</p>` : ""}
    <div class="acts">
      <button data-act="move">${placed ? "Flytta" : "Placera"}</button>
      ${placed ? `<button data-act="unplace">Till menyn</button>` : ""}
      ${s.status === "struck" ? `<button data-act="restore">Ångra strykning</button>`
                              : `<button data-act="strike">Stryk</button>`}
      <button data-act="close" class="ghost">Stäng</button>
    </div>
    <p class="hint">Justeringar ändrar dosen, inte innehållet. Nya intervaller kommer via coachen.</p>
  </div></div>`;
}

/* ---------- Händelser ---------- */
function save(res, okText) {
  if (res.error) { S.note = { text: res.error, bad: true }; return; }
  S.overlay = res.overlay;
  const w = S.store.saveOverlay(S.overlay);
  S.note = w.ok ? { text: okText } : { text: w.error, bad: true };
}

function wire() {
  document.getElementById("app").addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-week],[data-sess],[data-act],[data-place],[data-cancel],[data-close]");
    if (!t) return;
    S.note = null;

    if (t.dataset.week) { S.week = Number(t.dataset.week); S.sel = null; S.placing = null; }
    else if (t.dataset.cancel) { S.placing = null; S.sel = null; }
    else if (t.dataset.close) { if (t !== ev.target) return; S.sel = null; }
    else if (t.dataset.sess) { S.sel = t.dataset.sess; }
    else if (t.dataset.place) {
      const [day, slot] = t.dataset.place.split("|");
      save(manualAdjust(S.plan, S.overlay, S.placing.id, "move",
                        { week: S.week, day: Number(day), slot }, now()),
           `Placerat: ${DAYLABEL[day]} ${slot}.`);
      S.placing = null; S.sel = null;
    }
    else if (t.dataset.act) {
      const act = t.dataset.act, id = S.sel;
      const s = findSess(weekView(S.plan, S.overlay, S.week, BINDINGS), id);
      if (act === "move") { S.placing = s; S.sel = null; }
      else if (act === "close") { S.sel = null; }
      else { save(manualAdjust(S.plan, S.overlay, id, act, {}, now()),
                  act === "strike" ? "Struket." : act === "restore" ? "Strykningen hävd." : "Tillbaka i menyn.");
             S.sel = null; }
    }
    render();
  });
}

/* ---------- Start: paritet, plan, lagring, vy ---------- */
async function boot() {
  const stamp = UI_BUILD.split(" ")[0];
  const diag = [];
  const row = (k, val, cls="") => diag.push(`<span class="k">${k}</span><span class="v ${cls}">${val}</span>`);

  row("core.js", CORE_BUILD, CORE_BUILD === UI_BUILD ? "ok" : "bad");
  row("ui.js", UI_BUILD, CORE_BUILD === UI_BUILD ? "ok" : "bad");
  const meta = document.querySelector('meta[name="build"]')?.content ?? "meta saknas";
  row("index.html", meta, meta === UI_BUILD ? "ok" : "bad");

  let swTxt = "ej registrerad (kräver https/localhost)", swCls = "";
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    try {
      await navigator.serviceWorker.register("./sw.js");
      const keys = await caches.keys();
      const mine = keys.filter(k => k.startsWith("trizone-next-"));
      const want = "trizone-next-" + stamp.replace("next-", "");
      if (!mine.length) swTxt = "registrerad · cache byggs vid aktivering";
      else if (mine.length === 1 && mine[0] === want) { swTxt = mine[0]; swCls = "ok"; }
      else { swTxt = mine.join(", ") + " (väntat " + want + ") — ladda om"; swCls = "bad"; }
    } catch (e) { swTxt = "registrering misslyckades: " + e.message; swCls = "bad"; }
  }
  row("sw-cache", swTxt, swCls);

  S.store = makeStore(window.localStorage);
  try {
    const res = await fetch("./plan.json", { cache: "no-cache" });
    const p = await res.json();
    const v = validatePlan(p);
    if (v.ok) { S.plan = p; row("plan.json", `${p.planVersion} · ${p.sessions.length} pass, ${p.weeks.length} veckor`, "ok"); }
    else row("plan.json", `${v.errors.length} fel: ${v.errors[0].path} — ${v.errors[0].msg}`, "bad");
  } catch (e) {
    S.plan = S.store.loadPlan();
    row("plan.json", S.plan ? `offline · cachad ${S.plan.planVersion}` : "kunde inte hämtas: " + e.message,
        S.plan ? "" : "bad");
  }

  if (S.plan) {
    S.store.savePlan(S.plan);
    const l = S.store.loadOverlay(S.plan);
    S.overlay = l.overlay;
    if (l.dirty && !l.blocked) S.store.saveOverlay(S.overlay);
    const rep = S.store.report();
    row("lagring", l.blocked ? "SPÄRRAD — " + l.errors[0]
        : `${rep.keys.length} nycklar · ${(rep.total/1024).toFixed(1)} kB`
          + (l.orphans?.length ? ` · ${l.orphans.length} föräldralösa väntar på beslut` : ""),
        l.blocked ? "bad" : "ok");
    const ws = planWeeks(S.plan);
    S.week = ws.find(w => weekView(S.plan, S.overlay, w, BINDINGS).days.some(d => d.date === today())) ?? ws[0];
  }

  document.getElementById("diag").innerHTML = `<div class="kv">${diag.join("")}</div>`;
  if (!S.plan) { document.getElementById("app").innerHTML =
    `<p class="sub">Ingen giltig plan — veckan renderas inte. Se paritetskortet.</p>`; return; }
  wire();
  render();
}
boot();
