/* TRIZONE Next — ui.js · Rendering, gester och händelser. All logik importeras från core.
   Designspråk v0.1: S4 fönsterrader, L1 kort för objekt, L2 djup via ytsteg, §8 rörelse.
   Byggstämpelparitet över ALLA fem filer: core, ui, index (meta), sw (aktiv cache), plan. */
"use strict";
import { BUILD as CORE_BUILD, validatePlan, makeStore, weekView, planWeeks,
         manualAdjust, shortDate, WINDOWS, DAYLABEL,
         dragReduce, dragIdle, hitTest, nearestZone, edgeScroll, DRAG } from "./core.js";

export const UI_BUILD = "next-0.4.0 · 2026-08-02";

/* Livsschema: profildata (D7). Flyttas till Inställningar när de byggs.
   Schemat FRAMHÄVER fönster — det begränsar aldrig var något får placeras. */
const BINDINGS = { schedule: { 0:["Kväll"], 1:["Lunch","Kväll"], 2:["Kväll"], 3:["Kväll"],
                               4:["Morgon","Kväll"], 5:["Morgon","Kväll"], 6:["Kväll"] } };

const S = { plan:null, overlay:null, store:null, week:null, sel:null, tapMove:null, note:null };
let D = dragIdle, ghost = null, zones = [], rafId = 0, holdTimer = 0, dwell = { day:null, t:0 };

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const SPORTLABEL = { swim:"SIM", bike:"CYKEL", run:"LÖP", strength:"STYRKA" };
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const app = () => document.getElementById("app");
const view = () => weekView(S.plan, S.overlay, S.week, BINDINGS);
const findSess = (v, id) =>
  [...v.days.flatMap(d => d.slots).flatMap(x => x.sessions), ...v.unplaced].find(x => x.id === id);
const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };

/* ---------- Delar ---------- */
function zstrip(profile, big = false) {
  const segs = (profile ?? []).filter(p => Array.isArray(p) && p[1] > 0);
  return `<span class="zstrip${big ? " big" : ""}" role="img" aria-label="Zonprofil">` +
    segs.map(([z, m]) => `<i style="flex:${m};background:var(--z${z})" title="Z${z} ${m} min">` +
      (m >= 8 ? `<b>Z${z}</b>` : "") + `</i>`).join("") + `</span>`;
}

function sessionCard(s) {
  const struck = s.status === "struck";
  return `<div class="sess${struck ? " struck" : ""}" data-sess="${esc(s.id)}" tabindex="0" role="button"
      aria-label="${esc(s.title ?? s.id)}, ${s.durationMin} minuter">
    <i class="rib" style="background:var(--${esc(s.sport)})"></i>
    <div class="line1">
      <span class="prio p${esc(s.prio)}">${esc(s.prio)}</span>
      <span class="lbl">${SPORTLABEL[s.sport] ?? esc(s.sport)}</span>
      ${s.protected ? `<span class="shield" title="Skyddat pass">◈</span>` : ""}
      ${struck ? `<span class="tag">struket</span>` : ""}
      <span class="dur">${s.durationMin} min</span>
      <span class="grip" data-grip="${esc(s.id)}" aria-hidden="true">⠿</span>
    </div>
    <div class="stitle">${esc(s.title ?? s.id)}</div>
    ${zstrip(s.profile)}
  </div>`;
}

/* ---------- Vy ---------- */
function render() {
  const v = view(), weeks = planWeeks(S.plan), i = weeks.indexOf(S.week), sum = v.summary;
  const dragging = D.phase === "drag";
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
    <span><b>${Math.round(sum.minutes / 6) / 10}</b> h</span>
    ${sum.lowShare != null ? `<span><b>${Math.round(sum.lowShare * 100)} %</b> lågintensivt denna vecka</span>` : ""}
    ${sum.struck ? `<span class="dim">${sum.struck} struket</span>` : ""}
  </div>`);
  if (sum.minutes) h.push(`<div class="wkzone">${zstrip(
      sum.zones.map((m, z) => [z + 1, m]).filter(p => p[1] > 0), true)}
      <span class="legend">ljusare = hårdare</span></div>`);

  h.push(`<div class="week${dragging ? " dragging" : ""}">`);
  for (const d of v.days) {
    const open = dragging && D.day === d.day;
    const slots = (open || S.tapMove)
      ? WINDOWS.map(slot => d.slots.find(s => s.slot === slot)
          ?? { slot, scheduled: (BINDINGS.schedule[d.day] ?? []).includes(slot), sessions: [] })
      : d.slots;
    h.push(`<section class="day${d.date === today() ? " today" : ""}${open ? " open" : ""}" data-day="${d.day}">
      <div class="dhead"><span class="dname">${d.label}</span><span class="ddate">${shortDate(d.date)}</span>
        ${d.minutes ? `<span class="dmin">${d.minutes} min</span>` : ""}</div>
      <div class="dslots">`);
    if (!slots.length) h.push(`<div class="rest">vila</div>`);
    for (const sl of slots) {
      const target = (open || S.tapMove);
      h.push(`<div class="slot${sl.scheduled ? "" : " offsched"}${target ? " droppable" : ""}${
              dragging && D.day === d.day && D.slot === sl.slot ? " hot" : ""}"
              data-slot="${d.day}|${esc(sl.slot)}">
        <span class="wchip">${esc(sl.slot)}</span>
        <div class="sessions">${sl.sessions.map(sessionCard).join("")}`);
      if (target && !sl.sessions.length) h.push(`<div class="empty">${S.tapMove ? "Placera här" : "släpp"}</div>`);
      h.push(`</div></div>`);
    }
    h.push(`</div></section>`);
  }
  h.push(`</div>`);

  if (v.unplaced.length) h.push(`<section class="menu" data-day="-1">
    <div class="eyebrow">Att placera · ${v.unplaced.length}</div>
    <p class="hint">Dra ett pass till en dag, eller tryck för att placera.</p>
    ${v.unplaced.map(sessionCard).join("")}
  </section>`);

  if (S.tapMove) h.push(`<div class="banner">Välj tidsfönster för <b>${esc(S.tapMove.title ?? S.tapMove.id)}</b>
    <button class="txtbtn" data-cancel="1">Avbryt</button></div>`);
  if (S.sel) { const s = findSess(v, S.sel); if (s) h.push(sheet(s)); }
  if (S.note) h.push(`<div class="toast${S.note.bad ? " bad" : ""}">${esc(S.note.text)}</div>`);

  app().innerHTML = h.join("");
  if (dragging) measure();
}

function sheet(s) {
  const placed = s.day != null && s.slot;
  return `<div class="sheetwrap" data-close="1"><div class="sheet" role="dialog" aria-label="Justera pass">
    <div class="eyebrow">${SPORTLABEL[s.sport] ?? esc(s.sport)} · ${s.durationMin} min · prio ${esc(s.prio)}</div>
    <h2>${esc(s.title ?? s.id)}</h2>
    ${s.text?.brief ? `<p class="serif">${esc(s.text.brief)}</p>` : ""}
    ${s.text?.place ? `<p class="hint">${esc(s.text.place)}</p>` : ""}
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

/* ---------- Lagring ---------- */
function save(res, okText) {
  if (res.error) { S.note = { text: res.error, bad: true }; return; }
  S.overlay = res.overlay;
  const w = S.store.saveOverlay(S.overlay);
  S.note = w.ok ? { text: okText } : { text: w.error, bad: true };
}
const moveTo = (id, target, label) =>
  save(manualAdjust(S.plan, S.overlay, id, "move", target, now()), label);

/* ---------- Drag: mätning, spöke, autoskroll ---------- */
function measure() {
  zones = [];
  for (const el of app().querySelectorAll("[data-day]")) {
    const r = el.getBoundingClientRect();
    zones.push({ id: "day:" + el.dataset.day, x: r.left, y: r.top, w: r.width, h: r.height });
  }
  for (const el of app().querySelectorAll(".slot.droppable")) {
    const r = el.getBoundingClientRect();
    zones.push({ id: "slot:" + el.dataset.slot, x: r.left, y: r.top, w: r.width, h: r.height });
  }
  for (const el of app().querySelectorAll(".nav:not([disabled])")) {
    const r = el.getBoundingClientRect();
    zones.push({ id: "week:" + el.dataset.week, x: r.left, y: r.top, w: r.width, h: r.height });
  }
}

function makeGhost(id, x, y) {
  const src = app().querySelector(`[data-sess="${CSS.escape(id)}"]`);
  if (!src) return;
  ghost = document.createElement("div");
  ghost.className = "ghost";
  ghost.style.width = src.getBoundingClientRect().width + "px";
  ghost.innerHTML = src.innerHTML;
  document.body.appendChild(ghost);
  moveGhost(x, y);
}
const moveGhost = (x, y) => { if (ghost) ghost.style.transform = `translate3d(${x}px,${y}px,0)`; };
const dropGhost = () => { ghost?.remove(); ghost = null; };

function autoscroll(y) {
  cancelAnimationFrame(rafId);
  const step = edgeScroll(y, window.innerHeight);
  if (!step || D.phase !== "drag") return;
  const tick = () => { window.scrollBy(0, step); measure(); rafId = requestAnimationFrame(tick); };
  rafId = requestAnimationFrame(tick);
}

function pointOver(x, y) {
  const hit = hitTest(zones, x, y) ?? "";
  if (hit.startsWith("week:")) {
    const wk = Number(hit.slice(5));
    if (dwell.day !== hit) dwell = { day: hit, t: Date.now() };
    else if (Date.now() - dwell.t > DRAG.weekDwellMs && wk !== S.week) {
      S.week = wk; D = dragReduce(D, { type: "week", week: wk }); dwell = { day: null, t: 0 };
      buzz(6); render();
    }
    return;
  }
  dwell = { day: null, t: 0 };
  if (hit.startsWith("slot:")) {
    const [day, slot] = hit.slice(5).split("|");
    const changed = D.day !== Number(day) || D.slot !== slot;
    D = dragReduce(D, { type: "over", day: Number(day), slot });
    if (changed) render();
    return;
  }
  if (hit.startsWith("day:")) {
    const day = Number(hit.slice(4));
    if (day < 0) { D = dragReduce(D, { type: "over", day: null, slot: null }); return; }
    if (D.day !== day) {                                   /* dagen öppnar sina fönster */
      D = dragReduce(D, { type: "over", day, slot: null });
      buzz(4); render();
      const near = nearestZone(zones.filter(z => z.id.startsWith("slot:" + day + "|")), x, y);
      if (near) D = dragReduce(D, { type: "over", day, slot: near.split("|")[1] });
    } else if (D.slot == null) {
      const near = nearestZone(zones.filter(z => z.id.startsWith("slot:" + day + "|")), x, y);
      if (near) { D = dragReduce(D, { type: "over", day, slot: near.split("|")[1] }); render(); }
    }
    return;
  }
  if (D.day != null) { D = dragReduce(D, { type: "over", day: null, slot: null }); render(); }
}

function endDrag(ev) {
  clearTimeout(holdTimer); cancelAnimationFrame(rafId);
  const prev = D;
  D = dragReduce(D, ev);
  dropGhost();
  document.body.classList.remove("nodrag");
  if (D.drop) {
    const { id, week, day, slot } = D.drop;
    buzz(10);
    moveTo(id, { week, day, slot }, `Flyttat: ${DAYLABEL[day]} ${slot}.`);
  } else if (D.cancelled) {
    S.note = { text: "Flytten avbröts — passet ligger kvar." };
  } else if (D.tap) {
    S.sel = D.tap;
  }
  D = dragIdle;
  if (prev.phase !== "idle") render();
}

function wire() {
  const root = app();

  root.addEventListener("pointerdown", (ev) => {
    if (ev.button > 0) return;
    const card = ev.target.closest("[data-sess]");
    const ctl = ev.target.closest("[data-week],[data-act],[data-cancel],[data-slot].droppable,[data-close]");
    if (ctl && !card) return;                                /* knappar sköts av click */
    if (!card) return;
    const grip = !!ev.target.closest("[data-grip]") || ev.pointerType === "mouse";
    D = dragReduce(dragIdle, { type: "down", id: card.dataset.sess, x: ev.clientX, y: ev.clientY,
                               t: Date.now(), grip, week: S.week });
    root.setPointerCapture?.(ev.pointerId);
    clearTimeout(holdTimer);
    if (!grip) holdTimer = setTimeout(() => {
      if (D.phase !== "armed") return;
      D = dragReduce(D, { type: "hold" });
      document.body.classList.add("nodrag"); buzz(8);
      makeGhost(D.id, D.x, D.y); render(); measure(); pointOver(D.x, D.y);
    }, DRAG.holdMs);
  });

  root.addEventListener("pointermove", (ev) => {
    if (D.phase === "idle") return;
    const was = D.phase;
    D = dragReduce(D, { type: "move", x: ev.clientX, y: ev.clientY });
    if (was === "armed" && D.phase === "drag") {             /* grepp/mus: draget startar direkt */
      clearTimeout(holdTimer);
      document.body.classList.add("nodrag");
      makeGhost(D.id, D.x, D.y); render(); measure();
    }
    if (D.phase !== "drag") { clearTimeout(holdTimer); return; }
    moveGhost(ev.clientX, ev.clientY);
    pointOver(ev.clientX, ev.clientY);
    autoscroll(ev.clientY);
  });

  root.addEventListener("pointerup", () => endDrag({ type: "up" }));
  root.addEventListener("pointercancel", () => endDrag({ type: "cancel" }));
  /* Touch: hindra sidan från att rulla medan draget pågår */
  root.addEventListener("touchmove", (ev) => { if (D.phase === "drag") ev.preventDefault(); }, { passive: false });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { if (D.phase !== "idle") endDrag({ type: "cancel" });
                               else if (S.sel || S.tapMove) { S.sel = null; S.tapMove = null; render(); } }
    if ((ev.key === "Enter" || ev.key === " ") && ev.target?.dataset?.sess) {
      ev.preventDefault(); S.sel = ev.target.dataset.sess; render();
    }
  });

  root.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-week],[data-act],[data-cancel],[data-close],[data-slot].droppable");
    if (!t) return;
    S.note = null;
    if (t.dataset.week) { S.week = Number(t.dataset.week); S.sel = null; S.tapMove = null; }
    else if (t.dataset.cancel) { S.tapMove = null; S.sel = null; }
    else if (t.dataset.close) { if (t !== ev.target) return; S.sel = null; }
    else if (t.dataset.slot && S.tapMove) {
      const [day, slot] = t.dataset.slot.split("|");
      moveTo(S.tapMove.id, { week: S.week, day: Number(day), slot }, `Placerat: ${DAYLABEL[day]} ${slot}.`);
      S.tapMove = null; S.sel = null;
    }
    else if (t.dataset.act) {
      const act = t.dataset.act, id = S.sel, s = findSess(view(), id);
      if (act === "move") { S.tapMove = s; S.sel = null; }
      else if (act === "close") { S.sel = null; }
      else { save(manualAdjust(S.plan, S.overlay, id, act, {}, now()),
                  act === "strike" ? "Struket." : act === "restore" ? "Strykningen hävd." : "Tillbaka i menyn.");
             S.sel = null; }
    }
    render();
  });
}

/* ---------- Start ---------- */
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
  if (!S.plan) { app().innerHTML = `<p class="sub">Ingen giltig plan — veckan renderas inte. Se paritetskortet.</p>`; return; }
  wire();
  render();
}
boot();
