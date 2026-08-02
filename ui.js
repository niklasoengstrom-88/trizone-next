/* TRIZONE Next — ui.js · Rendering, gester och händelser. All logik importeras från core.
   Designspråk v0.1 (S4 rev 0.5.0: dagrader, fönsterchips som metadata) · beslut A+B 2026-08-02.
   Byggstämpelparitet över ALLA fem filer: core, ui, index (meta), sw (aktiv cache), plan. */
"use strict";
import { BUILD as CORE_BUILD, validatePlan, makeStore, weekView, planWeeks,
         manualAdjust, shortDate, DAYLABEL,
         dragReduce, dragIdle, hitTest, edgeScroll, DRAG } from "./core.js";

export const UI_BUILD = "next-0.5.2 · 2026-08-02";

/* Livsschema: profildata (D7). Framhäver träningsdagar — spärrar aldrig placering. */
const BINDINGS = { schedule: { 0:["Kväll"], 1:["Lunch","Kväll"], 2:["Kväll"], 3:["Kväll"],
                               4:["Morgon","Kväll"], 5:["Morgon","Kväll"], 6:["Kväll"] } };

const S = { plan:null, overlay:null, store:null, week:null, sel:null, tapMove:null, note:null };
let D = dragIdle, ghost = null, zones = [], zoneEls = new Map(), hotEl = null,
    rafId = 0, holdTimer = 0;

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const SPORTLABEL = { swim:"SIM", bike:"CYKEL", run:"LÖP", strength:"STYRKA" };
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const app = () => document.getElementById("app");
const findSess = (id) => {
  for (const wk of planWeeks(S.plan)) {
    const v = weekView(S.plan, S.overlay, wk);
    const s = [...v.days.flatMap(d => d.sessions), ...v.unplaced].find(x => x.id === id);
    if (s) return s;
  }
  return null;
};
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
    </div>
    <div class="stitle">${esc(s.title ?? s.id)}</div>
    ${zstrip(s.profile)}
  </div>`;
}

/* ---------- Löpande veckolista (beslut B) ---------- */
function render() {
  const weeks = planWeeks(S.plan);
  const h = [];

  if (S.tapMove) h.push(`<div class="banner sticky">Tryck på en dag för <b>${esc(S.tapMove.title ?? S.tapMove.id)}</b>
    <button class="txtbtn" data-cancel="1">Avbryt</button></div>`);

  for (const [wi, wk] of weeks.entries()) {
    const v = weekView(S.plan, S.overlay, wk);
    const sum = v.summary;
    h.push(`<section class="wk" id="wk-${wk}">
      <header class="wkhead">
        <div class="wkrow">
          <h1>Vecka ${wk}</h1>
          <span class="wkdates">${shortDate(v.days[0].date)} – ${shortDate(v.days[6].date)}</span>
          <span class="wktype">${esc(v.week?.type === "normal" ? "" : v.week?.type ?? "")}</span>
        </div>
        ${v.week?.focus ? `<p class="focus">${esc(v.week.focus)}</p>` : ""}
        <div class="sums">
          <span><b>${sum.planned}</b> pass</span>
          <span><b>${Math.round(sum.minutes / 6) / 10}</b> h</span>
          ${sum.lowShare != null ? `<span><b>${Math.round(sum.lowShare * 100)} %</b> lågintensivt</span>` : ""}
          ${sum.struck ? `<span class="dim">${sum.struck} struket</span>` : ""}
        </div>
        ${sum.minutes ? `<div class="wkzone">${zstrip(sum.zones.map((m, z) => [z + 1, m]).filter(p => p[1] > 0), true)}
          ${wi === 0 ? `<span class="legend">ljusare = hårdare</span>` : ""}</div>` : ""}
      </header>`);

    for (const d of v.days) {
      const trainday = (BINDINGS.schedule[d.day] ?? []).length > 0;
      h.push(`<section class="day${d.date === today() ? " today" : ""}${d.sessions.length ? "" : " empty"}${trainday ? "" : " off"}"
          data-day="${wk}|${d.day}">
        <div class="dhead"><span class="dname">${d.label}</span><span class="ddate">${shortDate(d.date)}</span>
          ${d.minutes ? `<span class="dmin">${d.minutes} min</span>` : ""}</div>
        <div class="dsessions">${d.sessions.map(sessionCard).join("")}</div>
        ${S.tapMove ? `<button class="target" data-target="${wk}|${d.day}">Hit</button>` : ""}
      </section>`);
    }

    if (v.unplaced.length) h.push(`<section class="menu">
      <div class="eyebrow">Att placera · v.${wk} · ${v.unplaced.length}</div>
      ${v.unplaced.map(sessionCard).join("")}
    </section>`);
    h.push(`</section>`);
  }

  h.push(`<button class="fab" data-today aria-label="Till aktuell vecka">Idag</button>`);
  if (S.sel) { const s = findSess(S.sel); if (s) h.push(sheet(s)); }
  if (S.note) h.push(`<div class="toast${S.note.bad ? " bad" : ""}">${esc(S.note.text)}</div>`);

  app().innerHTML = h.join("");
}

function sheet(s) {
  const placed = s.day != null;
  return `<div class="sheetwrap" data-close="1"><div class="sheet" role="dialog" aria-label="Justera pass">
    <div class="eyebrow">${SPORTLABEL[s.sport] ?? esc(s.sport)} · ${s.durationMin} min · prio ${esc(s.prio)}${s.slot ? " · " + esc(s.slot) : ""}</div>
    <h2>${esc(s.title ?? s.id)}</h2>
    ${s.text?.brief ? `<p class="serif">${esc(s.text.brief)}</p>` : ""}
    ${s.text?.place ? `<p class="hint">${esc(s.text.place)}</p>` : ""}
    <div class="acts">
      <button data-act="move">${placed ? "Flytta" : "Placera"}</button>
      ${placed ? `<button data-act="unplace">Till menyn</button>` : ""}
      ${s.status === "struck" ? `<button data-act="restore">Ångra strykning</button>`
                              : `<button data-act="strike">Stryk</button>`}
      <button data-act="close" class="ghostbtn">Stäng</button>
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

/* ---------- Drag: mätning, spöke, dagmarkering utan omrendering ---------- */
function measure() {
  zones = []; zoneEls = new Map();
  for (const el of app().querySelectorAll("[data-day]")) {
    const r = el.getBoundingClientRect();
    const id = "day:" + el.dataset.day;
    zones.push({ id, x: r.left, y: r.top, w: r.width, h: r.height });
    zoneEls.set(id, el);
  }
}
function setHot(el) {
  if (hotEl === el) return;
  hotEl?.classList.remove("hot");
  hotEl = el ?? null;
  hotEl?.classList.add("hot");
}
function makeGhost(id, x, y) {
  const src = app().querySelector(`[data-sess="${CSS.escape(id)}"]`);
  if (!src) return;
  ghost = document.createElement("div");
  ghost.className = "ghost";
  ghost.style.width = Math.min(320, src.getBoundingClientRect().width) + "px";
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
  const tick = () => { window.scrollBy(0, step); measure(); pointOver(D.x, D.y); rafId = requestAnimationFrame(tick); };
  rafId = requestAnimationFrame(tick);
}

function pointOver(x, y) {
  const hit = hitTest(zones, x, y) ?? "";
  if (hit.startsWith("day:")) {
    const [wk, day] = hit.slice(4).split("|").map(Number);
    if (D.week !== wk || D.day !== day) {
      D = dragReduce(D, { type: "over", week: wk, day });
      setHot(zoneEls.get(hit)); buzz(4);
    }
  } else if (D.day != null) {
    D = dragReduce(D, { type: "over", day: null });
    setHot(null);
  }
}

function endDrag(ev) {
  clearTimeout(holdTimer); cancelAnimationFrame(rafId);
  const prev = D;
  D = dragReduce(D, ev);
  dropGhost(); setHot(null);
  document.body.classList.remove("nodrag");
  if (D.drop) {
    const { id, week, day } = D.drop;
    const cur = findSess(id);
    if (cur && cur.week === week && cur.day === day) {      /* släppt där det redan låg */
      D = dragIdle; render(); return;
    }
    buzz(10);
    moveTo(id, { week, day, slot: null }, `Flyttat: ${DAYLABEL[day]} v.${week}.`);
  } else if (D.cancelled) {
    S.note = { text: "Flytten avbröts — passet ligger kvar." };
  } else if (D.tap) {
    S.sel = D.tap;
  }
  D = dragIdle;
  if (prev.phase === "drag" || D !== prev) render();
}

function wire() {
  const root = app();

  root.addEventListener("pointerdown", (ev) => {
    if (ev.button > 0) return;
    const card = ev.target.closest("[data-sess]");
    if (!card) return;
    const wk = Number(ev.target.closest(".wk")?.id?.slice(3) ?? S.week);
    const grip = ev.pointerType === "mouse";      /* mus drar direkt; finger kräver alltid långtryck */
    D = dragReduce(dragIdle, { type: "down", id: card.dataset.sess, x: ev.clientX, y: ev.clientY,
                               t: Date.now(), grip, week: wk });
    root.setPointerCapture?.(ev.pointerId);
    clearTimeout(holdTimer);
    if (!grip) holdTimer = setTimeout(() => {
      if (D.phase !== "armed") return;
      D = dragReduce(D, { type: "hold" });
      document.body.classList.add("nodrag"); buzz(8);
      makeGhost(D.id, D.x, D.y); measure(); pointOver(D.x, D.y);
    }, DRAG.holdMs);
  });

  root.addEventListener("pointermove", (ev) => {
    if (D.phase === "idle") return;
    const was = D.phase;
    D = dragReduce(D, { type: "move", x: ev.clientX, y: ev.clientY });
    if (D.phase === "slop") { clearTimeout(holdTimer); return; }
    if (was === "armed" && D.phase === "drag") {             /* grepp/mus: draget startar direkt */
      clearTimeout(holdTimer);
      document.body.classList.add("nodrag");
      makeGhost(D.id, D.x, D.y); measure();
    }
    if (D.phase !== "drag") return;
    moveGhost(ev.clientX, ev.clientY);
    pointOver(ev.clientX, ev.clientY);
    autoscroll(ev.clientY);
  });

  root.addEventListener("pointerup", (ev) => endDrag({ type: "up", t: Date.now() }));
  root.addEventListener("pointercancel", () => endDrag({ type: "cancel" }));
  root.addEventListener("touchmove", (ev) => { if (D.phase === "drag") ev.preventDefault(); }, { passive: false });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { if (D.phase !== "idle") endDrag({ type: "cancel" });
                               else if (S.sel || S.tapMove) { S.sel = null; S.tapMove = null; render(); } }
    if ((ev.key === "Enter" || ev.key === " ") && ev.target?.dataset?.sess) {
      ev.preventDefault(); S.sel = ev.target.dataset.sess; render();
    }
  });

  root.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-act],[data-cancel],[data-close],[data-target],[data-today]");
    if (!t) return;
    S.note = null;
    if (t.dataset.cancel) { S.tapMove = null; S.sel = null; }
    else if (t.dataset.close != null && t === ev.target) { S.sel = null; }
    else if (t.dataset.today != null) { S.sel = null;
      document.getElementById("wk-" + S.week)?.scrollIntoView({ behavior: "smooth" }); return; }
    else if (t.dataset.target && S.tapMove) {
      const [wk, day] = t.dataset.target.split("|").map(Number);
      moveTo(S.tapMove.id, { week: wk, day, slot: null }, `Placerat: ${DAYLABEL[day]} v.${wk}.`);
      S.tapMove = null; S.sel = null;
    }
    else if (t.dataset.act) {
      const act = t.dataset.act, id = S.sel;
      if (act === "move") { S.tapMove = findSess(id); S.sel = null; }
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
    S.week = ws.find(w => weekView(S.plan, S.overlay, w).days.some(d => d.date === today())) ?? ws[0];
  }

  document.getElementById("diag").innerHTML = `<div class="kv">${diag.join("")}</div>`;
  if (!S.plan) { app().innerHTML = `<p class="sub">Ingen giltig plan — veckan renderas inte. Se paritetskortet.</p>`; return; }
  wire();
  render();
  document.getElementById("wk-" + S.week)?.scrollIntoView();
}
boot();
