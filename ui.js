/* TRIZONE Next — ui.js · Rendering, gester och händelser. All logik importeras från core.
   Designspråk v0.1 (S4 rev 0.5.0: dagrader, fönsterchips som metadata) · beslut A+B 2026-08-02.
   Byggstämpelparitet över ALLA fem filer: core, ui, index (meta), sw (aktiv cache), plan. */
"use strict";
import { BUILD as CORE_BUILD, validatePlan, makeStore, weekView, planWeeks,
         manualAdjust, shortDate, DAYLABEL, WINDOWS, DEFAULT_CFG, resolveOrphan,
         dragReduce, dragIdle, hitTest, edgeScroll, DRAG,
         readActivityCache, deriveMatches, applyMatchLinks, dismissMatch,
         actZoneMinutes, matchDate, backupExport, backupImport } from "./core.js";

export const UI_BUILD = "next-0.7.0 · 2026-08-03";

const S = { plan:null, overlay:null, store:null, week:null, sel:null, tapMove:null, note:null,
            acts:[], mq:[], unplanned:[], importOpen:false,
            view:"plan", cfg:structuredClone(DEFAULT_CFG), cfgError:null, parity:[] };
const actById = id => S.acts.find(a => a.id === id);
let D = dragIdle, ghost = null, zones = [], zoneEls = new Map(), hotEl = null,
    rafId = 0, holdTimer = 0, swallowUntil = 0;   /* spökklick efter pointerup (0.5.2-buggen) */

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
/* Haptik (0.6.2) — INSTRUMENTERAD. Två fixförsök har misslyckats; i stället för
   ett tredje gissningsförsök mäter vi. `hapticLog` fångar API-läge och varje
   anrops returvärde, redovisat i paritetskortet och i testknappen.
   Känd begränsning: på touch ger pointerdown INTE användaraktivering i Chrome —
   bara touchend/click gör det. Långtryckets armering sker i en timer före
   touchend och kan därför blockeras tyst. Släppvibrationen läggs även på
   pointerup, som följer touchend. */
const HAPTIC = { arm: 18, day: 12, drop: [20, 30, 45], cancel: 8 };
const hapticLog = { api: typeof navigator !== "undefined" && "vibrate" in navigator,
                    calls: 0, lastArg: null, lastReturn: null, lastError: null };
function buzz(p) {
  hapticLog.calls++; hapticLog.lastArg = Array.isArray(p) ? p.join("-") : p;
  try {
    if (!navigator.vibrate) { hapticLog.lastReturn = "API saknas"; return false; }
    hapticLog.lastReturn = navigator.vibrate(p);
    return hapticLog.lastReturn;
  } catch (e) { hapticLog.lastError = e.message; hapticLog.lastReturn = "kastade fel"; return false; }
}
const hapticRow = () => hapticLog.api
  ? `API finns · ${hapticLog.calls} anrop · senast ${hapticLog.lastArg ?? "–"} ⇒ ${hapticLog.lastReturn ?? "–"}`
       + (hapticLog.lastError ? ` (${hapticLog.lastError})` : "")
  : "navigator.vibrate saknas i denna webbläsare";

/* ---------- Delar ---------- */
function zstrip(profile, big = false) {
  const segs = (profile ?? []).filter(p => Array.isArray(p) && p[1] > 0);
  return `<span class="zstrip${big ? " big" : ""}" role="img" aria-label="Zonprofil">` +
    segs.map(([z, m]) => `<i style="flex:${m};background:var(--z${z})" title="Z${z} ${m} min">` +
      (m >= 8 ? `<b>Z${z}</b>` : "") + `</i>`).join("") + `</span>`;
}

function sessionCard(s) {
  const struck = s.status === "struck";
  return `<div class="sess${struck ? " struck" : ""}${s.status === "done" ? " done" : ""}" data-sess="${esc(s.id)}" tabindex="0" role="button"
      aria-label="${esc(s.title ?? s.id)}, ${s.durationMin} minuter">
    <i class="rib" style="background:var(--${esc(s.sport)})"></i>
    <div class="line1">
      <span class="prio p${esc(s.prio)}">${esc(s.prio)}</span>
      <span class="lbl">${SPORTLABEL[s.sport] ?? esc(s.sport)}</span>
      ${s.protected ? `<span class="shield" title="Skyddat pass">◈</span>` : ""}
      ${s.status === "done" ? `<span class="donetag">✓ utfört</span>` : ""}
      ${struck ? `<span class="tag">struket</span>` : ""}
      <span class="dur">${s.durationMin} min</span>
    </div>
    <div class="stitle">${esc(s.title ?? s.id)}</div>
    ${zstrip(s.profile)}
  </div>`;
}

/* ---------- Vyväxling (0.7.0): Plan · Logg · Inställningar ---------- */
const NAV = [["plan", "Plan"], ["logg", "Logg"], ["installningar", "Inställningar"]];
function render() {
  const h = [];
  if (S.view === "plan") renderPlan(h);
  else if (S.view === "logg") renderLogg(h);
  else renderSettings(h);
  h.push(`<nav class="tabs" aria-label="Huvudnavigering">` + NAV.map(([id, label]) =>
    `<button class="tab${S.view === id ? " active" : ""}" data-nav="${id}"
       aria-current="${S.view === id ? "page" : "false"}">${label}</button>`).join("") + `</nav>`);
  if (S.sel) { const s = findSess(S.sel); if (s) h.push(sheet(s)); }
  if (S.note) h.push(`<div class="toast${S.note.bad ? " bad" : ""}">${esc(S.note.text)}</div>`);
  app().innerHTML = h.join("");
  document.getElementById("impfile")?.addEventListener("change", async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try { importRaw(await f.text()); }
    catch (e) { S.note = { text: "Filen gick inte att läsa: " + e.message, bad: true }; render(); }
  });
}

/* ---------- Plan: löpande veckolista (beslut B) ---------- */
function renderPlan(h) {
  const weeks = planWeeks(S.plan);

  if (S.mq.length) {
    h.push(`<section class="confirm"><div class="eyebrow">Att bekräfta · ${S.mq.length}</div>`);
    for (const q of S.mq) {
      const a = actById(q.activityId), s = findSess(q.sessionId);
      if (!a || !s) continue;
      h.push(`<div class="qrow">
        <div class="qtext"><b>${esc(a.name || SPORTLABEL[s.sport] || "Aktivitet")}</b>
          <span class="dim">${esc(matchDate(a.start_date_local) ?? "")} · ${Math.round(a.moving_time / 60)} min</span>
          <span class="qvs">→ ${esc(s.title ?? s.id)}?</span></div>
        <div class="qacts"><button data-link="${esc(q.sessionId)}|${a.id}|${q.score}">Länka</button>
        <button class="ghostbtn" data-nolink="${esc(q.sessionId)}|${a.id}">Nej</button></div>
      </div>`);
    }
    h.push(`</section>`);
  }

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
      const trainday = (S.cfg.schedule[d.day] ?? []).length > 0;
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
}

/* ---------- Logg: händelser + utanför plan ---------- */
function renderLogg(h) {
  h.push(`<header class="viewhead"><h1>Logg</h1></header>`);

  if (S.unplanned.length) {
    h.push(`<section class="menu offplan"><div class="eyebrow">Utanför plan · ${S.unplanned.length}</div>
      <p class="hint">Aktiviteter utan pass i planen. Räknas, men jagas inte.</p>`);
    for (const id of S.unplanned) {
      const a = actById(id); if (!a) continue;
      h.push(`<div class="oprow"><span class="dim">${esc(matchDate(a.start_date_local) ?? "")}</span>
        <span>${esc(a.name || a.type)}</span><span class="dim">${Math.round(a.moving_time / 60)} min</span></div>`);
    }
    h.push(`</section>`);
  }

  const evs = [];
  for (const [id, so] of Object.entries(S.overlay?.sessions ?? {}))
    for (const e of so.events ?? []) evs.push({ ...e, session: e.session ?? id });
  for (const e of S.overlay?.modes?.log ?? []) evs.push(e);
  evs.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  h.push(`<section class="evlog"><div class="eyebrow">Händelser · ${evs.length}</div>
    <p class="hint">Varje ingrepp — motorns, matchningens och ditt eget — lämnar en läsbar post. Inget skrivs om.</p>`);
  if (!evs.length) h.push(`<p class="hint">Inga händelser ännu.</p>`);
  for (const e of evs.slice(0, 120)) {
    const s = e.session ? findSess(e.session) : null;
    h.push(`<div class="evrow">
      <div class="evtop"><span class="evrule">${esc(e.rule)}</span>
        <span class="dim">${esc(String(e.t).slice(0, 10))}</span></div>
      ${s ? `<div class="evsess">${esc(s.title ?? e.session)}</div>` : e.session ? `<div class="evsess dim">${esc(e.session)}</div>` : ""}
      <div class="evwhy">${esc(e.why ?? e.action ?? "")}</div>
    </div>`);
  }
  h.push(`</section>`);
}

/* ---------- Inställningar: bindningar, paritet, backup, föräldralösa (T2, D7) ---------- */
function renderSettings(h) {
  h.push(`<header class="viewhead"><span class="wm">TRIZONE</span><h1>Inställningar</h1></header>`);

  h.push(`<section class="setsec"><div class="eyebrow">Livsschema</div>
    <p class="hint">Dagar och fönster du brukar träna. Framhäver i vyn och styr motorns flyttförslag — spärrar aldrig en placering.</p>`);
  for (let d = 0; d < 7; d++) {
    const wins = S.cfg.schedule[d] ?? [];
    h.push(`<div class="schedrow"><span class="dname">${DAYLABEL[d]}</span>` +
      WINDOWS.map(w => `<button class="schedchip${wins.includes(w) ? " on" : ""}"
        data-sched="${d}|${w}" aria-pressed="${wins.includes(w)}">${w}</button>`).join("") + `</div>`);
  }
  if (S.cfgError) h.push(`<p class="hint bad">${esc(S.cfgError)}</p>`);
  h.push(`</section>`);

  const orphans = S.overlay?.orphans ?? [];
  if (orphans.length) {
    h.push(`<section class="setsec"><div class="eyebrow">Föräldralösa överlagringar · ${orphans.length}</div>
      <p class="hint">Anteckningar vars pass försvann vid planbyte. Inget raderas utan ditt beslut.</p>`);
    for (const o of orphans) {
      const what = [o.data?.status, o.data?.moved ? "flyttad" : null, o.data?.adjust ? "justerad" : null,
                    o.placed ? "placerad" : null].filter(Boolean).join(" · ") || "överlagring";
      h.push(`<div class="orow"><div class="otext"><b>${esc(o.id)}</b>
          <span class="dim">${esc(what)} · plan ${esc(o.fromVersion ?? "?")}</span></div>
        <div class="qacts"><button data-orphan="${esc(o.id)}|archive">Arkivera</button>
        <button class="ghostbtn" data-orphan="${esc(o.id)}|delete">Radera</button></div></div>`);
    }
    h.push(`</section>`);
  }

  h.push(`<section class="setsec backup"><div class="eyebrow">Säkerhetskopia</div>
    <div class="acts"><button data-download>Ladda ned fil</button>
    <button class="ghostbtn" data-backup>Kopiera till urklipp</button>
    <button class="ghostbtn" data-import>Importera…</button></div>
    <p class="hint">Kopian bär placeringar, strykningar, länkar och livsschemat. Importen tar både fil och urklippstext.</p>
    ${S.importOpen ? `<textarea id="impbox" class="impbox" rows="4"
        placeholder="Klistra in säkerhetskopian här"></textarea>
      <div class="acts"><button data-import-go>Importera kopian</button>
      <label class="filelbl">Välj fil…<input type="file" id="impfile" accept=".json,application/json" style="display:none"></label></div>` : ""}
  </section>`);

  h.push(`<section class="setsec"><div class="eyebrow">Bygge</div>
    <div class="kv">${S.parity.map(r => `<span class="k">${esc(r.k)}</span><span class="v ${r.cls}">${esc(r.val)}</span>`).join("")}</div>
    <div class="acts" style="margin-top:10px"><button class="ghostbtn" data-buzztest>Testa vibration</button></div>
  </section>`);
}

function outcome(s) {
  if (!s.matchedActivity) return "";
  const a = actById(s.matchedActivity);
  if (!a) return "";
  const min = Math.round(a.moving_time / 60);
  const km = a.distance > 0 ? ` · ${(a.distance / 1000).toFixed(1)} km` : "";
  let strip = "";
  if (s.sport === "swim") strip = `<p class="hint">Simpuls (optisk) är ogiltig — ingen zonremsa. Tempo och distans gäller.</p>`;
  else if (s.sport !== "strength") {
    const zm = actZoneMinutes(a);
    strip = zm ? zstrip(zm.map((m, z) => [z + 1, m]).filter(p => p[1] > 0))
               : `<p class="hint">Ingen zondata i aktiviteten.</p>`;
  }
  return `<div class="dual">
    <div class="eyebrow">Plan</div>${zstrip(s.profile)}
    <div class="eyebrow" style="margin-top:8px">Utfört · ${min} min${km}</div>${strip}
  </div>`;
}

function sheet(s) {
  const placed = s.day != null;
  return `<div class="sheetwrap" data-close="1"><div class="sheet" role="dialog" aria-label="Justera pass">
    <div class="eyebrow">${SPORTLABEL[s.sport] ?? esc(s.sport)} · ${s.durationMin} min · prio ${esc(s.prio)}${s.slot ? " · " + esc(s.slot) : ""}</div>
    <h2>${esc(s.title ?? s.id)}</h2>
    ${s.text?.brief ? `<p class="serif">${esc(s.text.brief)}</p>` : ""}
    ${zstrip(s.profile)}
    ${s.text?.exec ? `<div class="tblock"><div class="eyebrow">Genomförande</div>
      <p class="serif">${esc(s.text.exec)}</p></div>` : ""}
    ${s.text?.goal ? `<div class="tblock"><div class="eyebrow">Mot målet</div>
      <p class="serif">${esc(s.text.goal)}</p></div>` : ""}
    ${outcome(s)}
    ${s.text?.place ? `<p class="hint placenote">${esc(s.text.place)}</p>` : ""}
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

/* ---------- Matchning: härled, auto-länka, spara (§5c) ---------- */
function recomputeMatches() {
  if (!S.acts.length) { S.mq = []; S.unplanned = []; return; }
  const r = deriveMatches(S.plan, S.overlay, S.acts);
  if (r.links.length) {
    S.overlay = applyMatchLinks(S.overlay, r.links, "auto", now());
    const w = S.store.saveOverlay(S.overlay);
    if (!w.ok) S.note = { text: w.error, bad: true };
  }
  const r2 = r.links.length ? deriveMatches(S.plan, S.overlay, S.acts) : r;
  S.mq = r2.questions; S.unplanned = r2.unplanned;
}

/* ---------- Lagring ---------- */
function save(res, okText) {
  if (res.error) { S.note = { text: res.error, bad: true }; return; }
  S.overlay = res.overlay;
  const w = S.store.saveOverlay(S.overlay);
  S.note = w.ok ? { text: okText } : { text: w.error, bad: true };
  recomputeMatches();
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
      setHot(zoneEls.get(hit)); buzz(HAPTIC.day);
    }
  } else if (D.day != null) {
    D = dragReduce(D, { type: "over", day: null });
    setHot(null);
  }
}

function endDrag(ev) {
  clearTimeout(holdTimer); cancelAnimationFrame(rafId);
  const prev = D;
  if (prev.phase === "idle") { D = dragIdle; return; }   /* inget pass inblandat — rör inte vyn */
  D = dragReduce(D, ev);
  dropGhost(); setHot(null);
  document.body.classList.remove("nodrag");
  swallowUntil = Date.now() + 500;      /* webbläsarens click för samma tryck ska inte träffa nya knappar */
  if (D.drop) {
    const { id, week, day } = D.drop;
    const cur = findSess(id);
    if (cur && cur.week === week && cur.day === day) {      /* släppt där det redan låg */
      D = dragIdle; render(); return;
    }
    buzz(HAPTIC.drop);
    moveTo(id, { week, day, slot: null }, `Flyttat: ${DAYLABEL[day]} v.${week}.`);
  } else if (D.cancelled) {
    buzz(HAPTIC.cancel);
    S.note = { text: "Flytten avbröts — passet ligger kvar." };
  } else if (D.tap) {
    S.sel = D.tap;
  }
  D = dragIdle;
  render();
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
      document.body.classList.add("nodrag"); buzz(HAPTIC.arm);
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

  root.addEventListener("pointerup", (ev) => {
    if (D.phase === "drag") buzz(HAPTIC.drop);      /* pointerup följer touchend ⇒ aktivering finns */
    endDrag({ type: "up", t: Date.now() });
  });
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
    if (swallowUntil && Date.now() < swallowUntil) {        /* spökklicket från trycket vi just hanterade */
      swallowUntil = 0;
      ev.preventDefault?.(); ev.stopPropagation?.();
      return;
    }
    swallowUntil = 0;
    const t = ev.target.closest("[data-act],[data-cancel],[data-close],[data-target],[data-today],[data-link],[data-nolink],[data-backup],[data-download],[data-import],[data-import-go],[data-nav],[data-sched],[data-orphan],[data-buzztest]");
    if (!t) return;
    S.note = null;
    if (t.dataset.nav) { S.view = t.dataset.nav; S.sel = null; S.tapMove = null; render(); return; }
    if (t.dataset.sched) {
      const [d, w] = t.dataset.sched.split("|");
      const wins = new Set(S.cfg.schedule[d] ?? []);
      wins.has(w) ? wins.delete(w) : wins.add(w);
      S.cfg.schedule[d] = WINDOWS.filter(x => wins.has(x));
      const r = S.store.saveCfg(S.cfg);
      if (!r.ok) S.note = { text: r.error, bad: true };
      render(); return;
    }
    if (t.dataset.orphan) {
      const [id, decision] = t.dataset.orphan.split("|");
      S.overlay = resolveOrphan(S.overlay, id, decision, now());
      const w = S.store.saveOverlay(S.overlay);
      S.note = w.ok ? { text: decision === "archive" ? "Arkiverad." : "Raderad — beslutet är loggat." }
                    : { text: w.error, bad: true };
      render(); return;
    }
    if (t.dataset.buzztest != null) {
      const r = buzz([120, 60, 120]);
      S.note = { text: `Vibration: ${hapticRow()}${r === false ? " — webbläsaren NEKADE anropet" : ""}`,
                 bad: r === false || !hapticLog.api };
      render(); return;
    }
    if (t.dataset.download != null) {
      try {
        const json = JSON.stringify(backupExport(S.overlay, S.plan.planVersion, now(), S.cfg), null, 2);
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url; a.download = `trizone-next-backup-${now().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        S.note = { text: `Fil skapad (${(json.length / 1024).toFixed(1)} kB) — spara den utanför telefonen.` };
      } catch (e) { S.note = { text: "Nedladdning misslyckades: " + e.message, bad: true }; }
      render(); return;
    }
    if (t.dataset.backup != null) {
      const json = JSON.stringify(backupExport(S.overlay, S.plan.planVersion, now(), S.cfg));
      (navigator.clipboard?.writeText(json) ?? Promise.reject())
        .then(() => { S.note = { text: `Säkerhetskopia i urklipp (${(json.length/1024).toFixed(1)} kB). Spara den någonstans varaktigt.` }; render(); })
        .catch(() => { S.note = { text: "Urklipp nekades — kopian kunde inte kopieras.", bad: true }; render(); });
      return;
    }
    if (t.dataset.import != null) { S.importOpen = !S.importOpen; render(); return; }
    if (t.dataset.importGo != null) {
      const raw = document.getElementById("impbox")?.value ?? "";
      const r = backupImport(raw, S.plan, now());
      if (r.errors.length) { S.note = { text: "Import avvisad: " + r.errors[0], bad: true }; render(); return; }
      S.overlay = r.overlay;
      if (r.cfg) { S.cfg = { ...structuredClone(DEFAULT_CFG), ...r.cfg }; S.store.saveCfg(S.cfg); }
      S.store.unblock();                                   /* giltig kopia häver S2-spärren */
      const w = S.store.saveOverlay(S.overlay, { force: true });
      S.note = w.ok
        ? { text: `Importerad (${r.exported?.slice(0,10) ?? "okänt datum"})`
            + (r.orphans.length ? ` · ${r.orphans.length} föräldralösa väntar på beslut` : "") }
        : { text: w.error, bad: true };
      S.importOpen = false;
      recomputeMatches(); render(); return;
    }
    if (t.dataset.link) {
      const [sid, aid, sc] = t.dataset.link.split("|");
      S.overlay = applyMatchLinks(S.overlay, [{ sessionId: sid, activityId: Number(aid), score: Number(sc) }], "confirm", now());
      const w = S.store.saveOverlay(S.overlay);
      S.note = w.ok ? { text: "Länkat — passet är utfört." } : { text: w.error, bad: true };
      recomputeMatches();
    }
    else if (t.dataset.nolink) {
      const [sid, aid] = t.dataset.nolink.split("|");
      S.overlay = dismissMatch(S.overlay, sid, Number(aid), now());
      const w = S.store.saveOverlay(S.overlay);
      if (!w.ok) S.note = { text: w.error, bad: true };
      recomputeMatches();
    }
    else if (t.dataset.cancel) { S.tapMove = null; S.sel = null; }
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

function importRaw(raw) {
  const r = backupImport(raw, S.plan, now());
  if (r.errors.length) { S.note = { text: "Import avvisad: " + r.errors[0], bad: true }; render(); return; }
  S.overlay = r.overlay;
  if (r.cfg) { S.cfg = { ...structuredClone(DEFAULT_CFG), ...r.cfg }; S.store.saveCfg(S.cfg); }
  S.store.unblock();
  const w = S.store.saveOverlay(S.overlay, { force: true });
  S.note = w.ok
    ? { text: `Importerad (${r.exported?.slice(0, 10) ?? "okänt datum"})`
        + (r.orphans.length ? ` · ${r.orphans.length} föräldralösa väntar på beslut` : "") }
    : { text: w.error, bad: true };
  S.importOpen = false;
  recomputeMatches(); render();
}

/* ---------- Start ---------- */
async function boot() {
  const stamp = UI_BUILD.split(" ")[0];
  const row = (k, val, cls="") => S.parity.push({ k, val, cls });

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
  { const c = S.store.loadCfg(); S.cfg = c.cfg; S.cfgError = c.error; }
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
          + (rep.foreignBytes ? ` (varav legacy ${(rep.foreignBytes/1024).toFixed(1)} kB)` : "")
          + (l.orphans?.length ? ` · ${l.orphans.length} föräldralösa väntar på beslut` : ""),
        l.blocked ? "bad" : "ok");
    const ws = planWeeks(S.plan);
    S.week = ws.find(w => weekView(S.plan, S.overlay, w).days.some(d => d.date === today())) ?? ws[0];

    /* Utfall: v32:s aktivitetscache, READ-ONLY (beslut 2026-08-02) */
    const cr = readActivityCache(window.localStorage.getItem("trizone.cache.v1"));
    S.acts = cr.activities;
    row("aktiviteter", cr.error ? cr.error
        : `${cr.activities.length} lästa ur v32-cachen (${cr.path}, read-only)`,
        cr.error ? "" : "ok");
    recomputeMatches();
  }

  row("haptik", hapticRow(), hapticLog.api ? "" : "bad");
  if (!S.plan) { S.view = "installningar"; render(); return; }   /* felläget landar där pariteten bor */
  wire();
  render();
  document.getElementById("wk-" + S.week)?.scrollIntoView();
}
boot();
