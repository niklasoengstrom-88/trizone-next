/* TRIZONE Next — ui.js · Rendering, gester och händelser. All logik importeras från core.
   Designspråk v0.1 (S4 rev 0.5.0: dagrader, fönsterchips som metadata) · beslut A+B 2026-08-02.
   Byggstämpelparitet över ALLA fem filer: core, ui, index (meta), sw (aktiv cache), plan. */
"use strict";
import { BUILD as CORE_BUILD, validatePlan, makeStore, weekView, planWeeks,
         manualAdjust, shortDate, DAYLABEL, WINDOWS, SPORTS, DEFAULT_CFG, resolveOrphan,
         todayView, planDayOf, effectiveRpe, logResult, unlogResult, FEEL_LABEL, sessionDate,
         monthView, planMonths, curtainReduce, curtainIdle,
         dragReduce, dragIdle, hitTest, edgeScroll, DRAG,
         readActivityCache, deriveMatches, applyMatchLinks, dismissMatch,
         actZoneMinutes, matchDate, backupExport, backupImport, zoneParity,
         applyRules, applyActions, deactivateMode, activateMode, LIFE_MODES,
         ENGINE_FIELDS, ENGINE, athleteGuard, isQuality } from "./core.js";

export const UI_BUILD = "next-0.9.4 · 2026-08-04";

const S = { plan:null, overlay:null, store:null, week:null, sel:null, tapMove:null, note:null,
            acts:[], mq:[], unplanned:[], importOpen:false, selDay:null, logOpen:null, adjOpen:null, zpar:null, evOpen:false, histOpen:null,
            monthOpen:false, monthYM:null,
            eq:[], warns:[], seen:new Set(), modeOpen:false,
            view:"idag", cfg:structuredClone(DEFAULT_CFG), cfgError:null, parity:[] };
const actById = id => S.acts.find(a => a.id === id);
let D = dragIdle, ghost = null, zones = [], zoneEls = new Map(), hotEl = null,
    rafId = 0, holdTimer = 0, swallowUntil = 0;   /* spökklick efter pointerup (0.5.2-buggen) */

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const SPORTLABEL = { swim:"SIM", bike:"CYKEL", run:"LÖP", strength:"STYRKA" };
const today = () => (globalThis.__TZ_TODAY ?? new Date().toISOString()).slice(0, 10);
const now = () => {                        /* samma klocka som today() — även under test */
  const t = new Date().toISOString();
  return globalThis.__TZ_TODAY ? globalThis.__TZ_TODAY.slice(0, 10) + t.slice(10) : t;
};
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
      ${badges(s)}
      <span class="dur">${s.durationMin} min</span>
    </div>
    <div class="stitle">${esc(s.title ?? s.id)}</div>
    ${zstrip(s.profile)}
  </div>`;
}

/* ---------- Vyväxling (0.7.0): Plan · Logg · Inställningar ---------- */
const NAV = [["idag", "Idag"], ["plan", "Plan"]];
function render() {
  const h = [];
  if (S.view === "idag") renderIdag(h);
  else if (S.view === "plan") renderPlan(h);
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

/* ---------- Idag: tillståndsberoende hjälte + veckostrip (§6, L4) ---------- */
const ICO = {
  cal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/><circle cx="8.6" cy="13.6" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="13.6" r=".9" fill="currentColor" stroke="none"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8.2" r="3.4"/><path d="M4.8 20c1.3-3.4 4-5 7.2-5s5.9 1.6 7.2 5"/></svg>`
};
const WEEKDAY = ["Måndag","Tisdag","Onsdag","Torsdag","Fredag","Lördag","Söndag"];

function rpeRow(s) {
  const so = S.overlay?.sessions?.[s.id];
  const r = effectiveRpe(so, s.matchedActivity ? actById(s.matchedActivity) : null);
  const feel = s.matchedActivity ? actById(s.matchedActivity)?.feel : null;
  const bits = [];
  if (r) bits.push(`RPE ${r.value} (${r.source})`);
  if (feel && FEEL_LABEL[feel]) bits.push(`kändes ${FEEL_LABEL[feel]}`);
  if (so?.userNote) bits.push(esc(so.userNote));
  return bits.length ? `<p class="hint">${bits.join(" · ")}</p>` : "";
}

function heroCard(s, cta = true) {
  return `<div class="sess hero" data-sess="${esc(s.id)}" tabindex="0" role="button"
      aria-label="${esc(s.title ?? s.id)}, ${s.durationMin} minuter">
    <i class="rib" style="background:var(--${esc(s.sport)})"></i>
    <div class="line1">
      <span class="prio p${esc(s.prio)}">${esc(s.prio)}</span>
      <span class="lbl">${SPORTLABEL[s.sport] ?? esc(s.sport)}</span>
      ${s.protected ? `<span class="shield">◈</span>` : ""}
      <span class="dur">${s.durationMin} min</span>
    </div>
    <div class="herotitle">${esc(s.title ?? s.id)}</div>
    ${s.text?.brief ? `<p class="serif herobrief">${esc(s.text.brief)}</p>` : ""}
    ${zstrip(s.profile, true)}
    ${cta ? `<div class="acts heroacts"><button data-logopen="${esc(s.id)}">Markera utfört</button></div>` : ""}
  </div>`;
}

function monthPanel(h, selDate) {
  const months = planMonths(S.plan);
  if (!S.monthYM || !months.includes(S.monthYM)) {
    const t = today().slice(0, 7);
    S.monthYM = months.includes(t) ? t : months[0];
  }
  const m = monthView(S.plan, S.overlay, S.monthYM);
  const i = months.indexOf(S.monthYM);
  h.push(`<div class="mwrap" data-stripzone>
    <div class="mhead">
      <button class="mnav" data-mprev ${i <= 0 ? "disabled" : ""} aria-label="Föregående månad">‹</button>
      <span class="mlabel">${esc(m.label)}</span>
      <button class="mnav" data-mnext ${i >= months.length - 1 ? "disabled" : ""} aria-label="Nästa månad">›</button>
    </div>
    <div class="mgrid">
      <span class="mwk"></span>${["M","T","O","T","F","L","S"].map(d => `<span class="mdow">${d}</span>`).join("")}
      ${m.rows.map(r => `<span class="mwk">${r.week ?? ""}</span>` + r.days.map(d => {
        const cls = (d.inMonth ? "" : " out") + (d.date === today() ? " tod" : "") + (d.date === selDate ? " sel" : "");
        const dots = d.dots.map(x =>
          `<i class="sdot${x.done ? " full" : ""}" style="color:var(--${esc(x.sport)})"></i>`).join("");
        return d.at
          ? `<button class="mcell${cls}" data-selday="${d.at.week}|${d.at.day}">
               <span class="mdd">${Number(d.date.slice(8))}</span><span class="sdots">${dots}</span></button>`
          : `<span class="mcell${cls}"><span class="mdd">${Number(d.date.slice(8))}</span></span>`;
      }).join("")).join("")}
    </div>
  </div>`);
}

function calZone(h, wk, selDate) {
  h.push(`<div class="calzone">`);
  h.push(`<div class="stripwrap${S.monthOpen ? " closed" : ""}">`);
  stripGrid(h, wk, selDate);
  h.push(`</div><div class="curtain${S.monthOpen ? " open" : ""}" id="curtain">`);
  monthPanel(h, selDate);
  h.push(`</div><button class="chandle" data-chandle
    aria-label="${S.monthOpen ? "Fäll ihop månaden" : "Dra ned månaden"}"
    aria-expanded="${S.monthOpen}"><i></i></button></div>`);
}

function stripGrid(h, wk, selDate) {
  const v = weekView(S.plan, S.overlay, wk);
  h.push(`<div class="strip7">` + v.days.map(d => {
    const dots = d.sessions.filter(s => s.status !== "struck").map(s =>
      `<i class="sdot${s.status === "done" ? " full" : ""}" style="color:var(--${esc(s.sport)})"></i>`).join("");
    const cls = (d.date === today() ? " tod" : "") + (d.date === selDate ? " sel" : "");
    return `<button class="scell${cls}" data-selday="${wk}|${d.day}">
      <span class="sdl">${d.label}</span><span class="sdd">${Number(d.date.slice(8))}</span>
      <span class="sdots">${dots}</span></button>`;
  }).join("") + `</div>`);
}

function renderIdag(h) {
  const tISO = today();
  const at = planDayOf(S.plan, tISO);
  const sel = S.selDay && !(S.selDay.week === at?.week && S.selDay.day === at?.day) ? S.selDay : null;

  if (sel) {                                        /* bläddring: vald dag tar hjältepositionen */
    const v = weekView(S.plan, S.overlay, sel.week);
    const d = v.days[sel.day];
    h.push(`<header class="viewhead"><h1>${WEEKDAY[sel.day]}</h1>
      <span class="sub">${shortDate(d.date)} · v.${sel.week}</span>
      <span class="hicons">
        <button class="hicon" data-nav="plan" aria-label="Till planen">${ICO.cal}</button>
        <button class="hicon" data-nav="installningar" aria-label="Till inställningar">${ICO.user}</button>
      </span></header>`);
    calZone(h, sel.week, d.date);
    const live = d.sessions.filter(s => s.status !== "struck");
    if (live.length) h.push(`<div class="dsessions herolist">${live.map(s => sessionCard(s)).join("")}</div>`);
    else h.push(`<section class="restcard"><div class="eyebrow">Vila</div>
      <p class="serif">Ingen träning planerad den här dagen.</p></section>`);
    h.push(`<div class="acts"><button class="ghostbtn" data-backtoday>Tillbaka till idag</button></div>`);
    return;
  }

  h.push(`<header class="viewhead"><h1>Idag</h1>
    <span class="sub">${WEEKDAY[new Date(tISO + "T12:00:00Z").getUTCDay() === 0 ? 6 : new Date(tISO + "T12:00:00Z").getUTCDay() - 1]} ${shortDate(tISO)}</span>
    <span class="hicons">
      <button class="hicon" data-nav="plan" aria-label="Till planen">${ICO.cal}</button>
      <button class="hicon" data-nav="installningar" aria-label="Till inställningar">${ICO.user}</button>
    </span></header>`);

  const t = todayView(S.plan, S.overlay, tISO);
  if (t.at) calZone(h, t.at.week, null);

  const active = S.overlay?.modes?.active ?? [];
  if (active.length) h.push(`<section class="modebar">${active.map(m =>
    `<span class="modechip">${esc(LIFE_MODES[m.rule]?.label ?? m.rule)}</span>`).join("")}
    <span class="hint">${esc(LIFE_MODES[active[0].rule]?.why ?? "")}</span></section>`);

  questionCards(h);
  warnStep(h);

  if (t.state === "pass") {
    h.push(heroCard(t.hero));
    if (t.also.length) h.push(`<div class="eyebrow alsohead">Även idag</div>
      <div class="dsessions">${t.also.map(s => sessionCard(s)).join("")}</div>`);
    if (t.done.length) h.push(`<div class="eyebrow alsohead">Utfört idag</div>
      <div class="dsessions">${t.done.map(s => sessionCard(s)).join("")}</div>`);
  }
  else if (t.state === "done") {
    h.push(`<section class="donecard"><div class="eyebrow">Klart för idag</div>
      <p class="serif">Dagens träning är genomförd.</p>
      <div class="dsessions">${t.done.map(s => sessionCard(s)).join("")}</div>
      ${t.done.map(rpeRow).join("")}</section>`);
  }
  else if (t.state === "rest") {
    h.push(`<section class="restcard"><div class="eyebrow">Vila</div>
      <p class="serif">Ingen träning idag — vilan är en del av planen.</p>
      ${t.next ? `<p class="hint">Nästa: ${WEEKDAY[t.next.day]} — ${esc(t.next.title)} · ${t.next.durationMin} min</p>` : ""}</section>`);
  }
  else {
    h.push(`<section class="restcard"><div class="eyebrow">Utanför planen</div>
      <p class="serif">Dagens datum ligger utanför planens veckor.</p>
      ${t.next ? `<p class="hint">Planen börjar ${shortDate(t.next.date)}: ${esc(t.next.title)}.</p>` : ""}</section>`);
  }
}

/* ---------- Plan: löpande veckolista (beslut B) ---------- */
function renderPlan(h) {
  const weeks = planWeeks(S.plan);

  h.push(`<header class="viewhead"><h1>Planen</h1>
    <span class="hicons">
      <button class="hicon" data-nav="installningar" aria-label="Till inställningar">${ICO.user}</button>
    </span></header>`);

  h.push(`<section class="modes"><div class="eyebrow">Läget</div>
    <div class="chiprow">${Object.entries(LIFE_MODES).map(([rule, m]) => {
      const on = (S.overlay?.modes?.active ?? []).find(a => a.rule === rule);
      return `<button class="modetog${on ? " on" : ""}" data-mode="${rule}"
        aria-pressed="${!!on}">${m.label}</button>`;
    }).join("")}</div>
    <p class="hint">Lägen rör pass — aldrig blockgränser, loppdatum eller delmål. Allt går att ångra.</p>
  </section>`);

  questionCards(h);
  warnStep(h);

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
          ${(() => { const live = v.days.flatMap(d => d.sessions).filter(s => s.status !== "struck" && s.prio !== "C");
             const done = live.filter(s => s.status === "done").length;
             return done ? `<span class="compl"><b>${done}</b> av ${live.length} utförda</span>` : ""; })()}
        </div>
        ${sum.minutes ? `<div class="wkzone">${zstrip(sum.zones.map((m, z) => [z + 1, m]).filter(p => p[1] > 0), true)}
          ${wi === 0 ? `<span class="legend">ljusare = hårdare</span>` : ""}</div>` : ""}
      </header>`);

    for (const d of v.days) {
      const trainday = true;
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

  offplanSection(h);
  h.push(`<button class="fab" data-today aria-label="Till aktuell vecka">Idag</button>`);
}

/* ---------- Utanför plan (bor i Plan-vyn, beslut 0.9.1) ---------- */
function offplanSection(h) {
  if (!S.unplanned.length) return;
  h.push(`<section class="menu offplan"><div class="eyebrow">Utanför plan · ${S.unplanned.length}</div>
    <p class="hint">Aktiviteter utan pass i planen. Räknas, men jagas inte.</p>`);
  for (const id of S.unplanned) {
    const a = actById(id); if (!a) continue;
    h.push(`<div class="oprow"><span class="dim">${esc(matchDate(a.start_date_local) ?? "")}</span>
      <span>${esc(a.name || a.type)}</span><span class="dim">${Math.round(a.moving_time / 60)} min</span></div>`);
  }
  h.push(`</section>`);
}

/* ---------- Händelselogg (knappsektion i Inställningar, beslut 0.9.1) ---------- */
function eventLog(h) {
  const evs = [];
  for (const [id, so] of Object.entries(S.overlay?.sessions ?? {}))
    for (const e of so.events ?? []) evs.push({ ...e, session: e.session ?? id });
  for (const e of S.overlay?.modes?.log ?? []) evs.push(e);
  evs.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  h.push(`<section class="setsec"><div class="eyebrow">Händelselogg</div>
    <p class="hint">Varje ingrepp — motorns, matchningens och ditt eget. Inget skrivs om.</p>
    <div class="acts"><button class="ghostbtn" data-evlog>${S.evOpen ? "Dölj" : "Visa"} händelser · ${evs.length}</button></div>`);
  if (S.evOpen) {
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
  }
  h.push(`</section>`);
}

/* ---------- Inställningar: bindningar, paritet, backup, föräldralösa (T2, D7) ---------- */
function renderSettings(h) {
  h.push(`<header class="viewhead"><span class="wm">TRIZONE</span><h1>Inställningar</h1></header>`);

  h.push(`<section class="setsec"><div class="eyebrow">Motorvärden</div>
    <p class="hint">Dina gränser, inte appens sanningar. Tomt fält = standardvärdet.</p>`);
  for (const [k, f] of Object.entries(ENGINE_FIELDS)) {
    const cur = S.cfg.engine?.[k];
    const shown = cur == null ? "" : (f.pct ? Math.round(cur * 100) : cur);
    const def = f.pct ? Math.round(ENGINE[k] * 100) : ENGINE[k];
    h.push(`<label class="lfl engrow"><span>${f.label} <span class="dim">(${f.unit}, standard ${def})</span></span>
      <input type="number" data-eng="${k}" value="${shown}" min="${f.min}" max="${f.max}"
        placeholder="${def}" inputmode="numeric"></label>`);
  }
  h.push(`<div class="acts"><button data-engsave>Spara motorvärden</button></div></section>`);

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

  eventLog(h);

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
    if (zm && S.zpar && !S.zpar.ok)                    /* §7: aldrig en tyst felkalibrerad remsa */
      strip += `<p class="hint bad">⚠ Zonparitet saknas — ${esc(S.zpar.why)}</p>`;
  }
  return `<div class="dual">
    <div class="eyebrow">Plan</div>${zstrip(s.profile)}
    <div class="eyebrow" style="margin-top:8px">Utfört · ${min} min${km}</div>${strip}
    ${rpeRow(s)}
  </div>`;
}

/* §5d: dosen ändras i appen, innehållet via coachen. Verben är regelverkets, inte nya. */
function adjustForm(s) {
  const steps = [15, 20, 30, 40, 45, 60, 75, 90].filter(m => m < s.durationMin);
  const others = SPORTS.filter(x => x !== s.sport);
  return `<div class="logform">
    <div class="eyebrow">Justera dosen</div>
    <p class="hint">Ändrar hur mycket eller hur hårt — aldrig vad passet innehåller.
      Nya intervaller kommer via coachen.</p>
    ${steps.length ? `<label class="lfl">Korta till
      <select id="adjMin">${steps.map(m => `<option value="${m}">${m} min</option>`).join("")}</select></label>
      <div class="acts"><button data-adj="shorten|${esc(s.id)}">Korta</button></div>` : ""}
    <div class="acts" style="margin-top:10px">
      <button class="ghostbtn" data-adj="downgrade|${esc(s.id)}">Växla ned till Z2</button>
    </div>
    <label class="lfl">Byt gren
      <select id="adjSport">${others.map(x =>
        `<option value="${x}">${SPORTLABEL[x]}</option>`).join("")}</select></label>
    <div class="acts"><button class="ghostbtn" data-adj="substitute|${esc(s.id)}">Byt gren</button>
      <button class="ghostbtn" data-adjcancel>Stäng</button></div>
  </div>`;
}

/* P3: posten följer passet — hopfälld tills du ber om den (beslut 0.9.1) */
function sessEvents(s) {
  const evs = S.overlay?.sessions?.[s.id]?.events ?? [];
  if (!evs.length) return "";
  if (S.histOpen !== s.id)
    return `<div class="acts"><button class="ghostbtn" data-histopen="${esc(s.id)}">Historik · ${evs.length}</button></div>`;
  return `<div class="tblock"><div class="eyebrow">Ingrepp på detta pass · ${evs.length}</div>
    ${evs.slice(-10).reverse().map(e => `<div class="pevrow">
      <span class="evrule">${esc(e.rule)}</span>
      <span class="dim">${esc(String(e.t).slice(0, 10))}</span>
      <div class="evwhy">${esc(e.why ?? e.action ?? "")}</div></div>`).join("")}
    <div class="acts"><button class="ghostbtn" data-histclose>Dölj historik</button></div></div>`;
}

/* Badges: vad som avviker från källplanen syns på kortet */
function badges(s) {
  const adj = S.overlay?.sessions?.[s.id]?.adjust ?? null;
  const so = S.overlay?.sessions?.[s.id] ?? {};
  const b = [];
  if (adj?.durationMin) b.push(`<span class="badge">Kortat</span>`);
  if (adj?.profile && !adj.durationMin) b.push(`<span class="badge">Nedväxlat</span>`);
  if (adj?.sport) b.push(`<span class="badge">Ersättning</span>`);
  if (so.moved || so.placed) b.push(`<span class="badge">Flyttat</span>`);
  return b.join("");
}

function logForm(s) {
  return `<div class="logform">
    <div class="eyebrow">Markera utfört</div>
    <label class="lfl">RPE 1–10 <span class="dim">(valfri — klockans värde vinner om passet matchas)</span>
      <select id="logRpe"><option value="">–</option>${[1,2,3,4,5,6,7,8,9,10]
        .map(n => `<option value="${n}">${n}</option>`).join("")}</select></label>
    <label class="lfl">Notering <input id="logNote" type="text" maxlength="140" placeholder=""></label>
    <div class="acts"><button data-logsave="${esc(s.id)}">Spara</button>
      <button class="ghostbtn" data-logcancel>Avbryt</button></div>
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
    ${s.status === "done" && !s.matchedActivity ? rpeRow(s) : ""}
    ${s.text?.place ? `<p class="hint placenote">${esc(s.text.place)}</p>` : ""}
    ${S.logOpen === s.id ? logForm(s) : ""}
    ${S.adjOpen === s.id ? adjustForm(s) : ""}
    ${sessEvents(s)}
    <div class="acts">
      ${s.status !== "done" && s.status !== "struck" && S.logOpen !== s.id
        ? `<button data-logopen="${esc(s.id)}">Markera utfört</button>` : ""}
      ${s.status === "done" && !s.matchedActivity
        ? `<button data-unlog="${esc(s.id)}">Ångra loggning</button>` : ""}
      <button data-act="move">${placed ? "Flytta" : "Placera"}</button>
      ${s.status !== "struck" && S.adjOpen !== s.id ? `<button data-adjopen="${esc(s.id)}">Justera</button>` : ""}
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

/* ---------- Regelmotorn (0.9.0) ----------
   Motorn körs vid varje förändring. Nivå 1–2 med session ⇒ tillämpas och loggas.
   Frågor ⇒ D2: motorn frågar, användaren svarar. Nivå 3 ⇒ varningar, aldrig ändring. */
function runEngine({ apply = true } = {}) {
  if (!S.plan) return;
  const r = applyRules(S.plan, S.overlay, S.cfg, engineFlags(), now());
  const changes = r.actions.filter(a => a.session && a.action !== "warn");
  if (apply && changes.length) {
    S.overlay = applyActions(S.overlay, changes);
    const w = S.store.saveOverlay(S.overlay);
    if (!w.ok) { S.note = { text: w.error, bad: true }; return; }
  }
  S.eq = r.questions ?? [];
  S.warns = r.actions.filter(a => a.action === "warn");
  if (changes.length) recomputeMatches();
}

/* Flaggor appen kan härleda själv idag. Wellness-baserade flaggor
   (RHR, HRV, sömn) tillkommer med egen datapipeline — inga låtsasflaggor. */
function engineFlags() {
  const f = [];
  for (const [id, so] of Object.entries(S.overlay?.sessions ?? {})) {
    const r = so.rpe ?? (so.match ? actById(so.match.activityId)?.icu_rpe : null);
    if (r != null && r >= 9) f.push({ id: "rpe-watch", sessionId: id });
  }
  return f;
}

function warnStep(h) {                     /* varningstrappan (designspråk §7) */
  const uniq = [], seenKey = new Set();
  for (const w of S.warns) {
    const k = w.rule + "|" + w.session + "|" + w.why;
    if (!seenKey.has(k)) { seenKey.add(k); uniq.push(w); }
  }
  const dups = S.warns.length - uniq.length;
  if (dups > 0) console.warn(`[TRIZONE] ${dups} dubblettvarningar filtrerade — rapportera med säkerhetskopia`);
  const unseen = uniq.filter(w => !S.seen.has(w.rule + "|" + w.session));
  if (!unseen.length) return;
  h.push(`<section class="warnbanner"><div class="eyebrow">Motorn varnar · ${unseen.length}</div>
    ${unseen.map(w => `<div class="wrow"><span class="evrule">${esc(w.rule)}</span>
      <div class="evwhy">${esc(w.why)}</div></div>`).join("")}
    <div class="acts"><button class="ghostbtn" data-warnack>Sett</button></div>
    <p class="hint">Nivå 3 ändrar aldrig planen. Du bestämmer.</p></section>`);
}

function questionCards(h) {                /* D2: motorn frågar, användaren svarar */
  if (!S.eq.length) return;
  h.push(`<section class="qcards"><div class="eyebrow">Motorn frågar · ${S.eq.length}</div>`);
  for (const q of S.eq) {
    h.push(`<div class="qrow"><div class="qtext">${esc(q.ask)}</div>
      <div class="qacts"><button data-eqyes="${esc(q.rule)}">Ja</button>
      <button class="ghostbtn" data-eqno="${esc(q.rule)}">Nej</button></div></div>`);
  }
  h.push(`</section>`);
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
    const pre = manualAdjust(S.plan, S.overlay, id, "move", { week, day, slot: null }, now());
    let extra = "";
    if (!pre.error) {                       /* motorn varnar men du bestämmer */
      const r = applyRules(S.plan, pre.overlay, S.cfg, [], now());
      const hit = r.actions.filter(a => a.action === "warn" && a.level === 3 &&
        (a.session === id || (a.pair ?? []).includes(id)));
      if (hit.length) extra = " ⚠ " + hit[0].why;
    }
    moveTo(id, { week, day, slot: null }, `Flyttat: ${DAYLABEL[day]} v.${week}.${extra}`);
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
    const t = ev.target.closest("[data-act],[data-cancel],[data-close],[data-target],[data-today],[data-link],[data-nolink],[data-backup],[data-download],[data-import],[data-import-go],[data-nav],[data-orphan],[data-buzztest],[data-selday],[data-backtoday],[data-logopen],[data-logsave],[data-logcancel],[data-unlog],[data-adjopen],[data-adjcancel],[data-adj],[data-mode],[data-eqyes],[data-eqno],[data-warnack],[data-engsave],[data-evlog],[data-histopen],[data-histclose],[data-chandle],[data-mprev],[data-mnext]");
    if (!t) return;
    S.note = null;
    if (t.dataset.chandle != null) { cuCommit(!S.monthOpen); return; }
    if (t.dataset.mprev != null || t.dataset.mnext != null) {
      goMonth(t.dataset.mnext != null ? 1 : -1);
      render(); return; }
    if (t.dataset.evlog != null) { S.evOpen = !S.evOpen; render(); return; }
    if (t.dataset.histopen) { S.histOpen = t.dataset.histopen; render(); return; }
    if (t.dataset.histclose != null) { S.histOpen = null; render(); return; }
    if (t.dataset.mode) {
      const rule = t.dataset.mode;
      const on = (S.overlay?.modes?.active ?? []).find(a => a.rule === rule);
      if (on) {
        S.overlay = deactivateMode(S.overlay, rule + "@" + on.from, now());
        const w = S.store.saveOverlay(S.overlay);
        S.note = w.ok ? { text: `${LIFE_MODES[rule].label} avslaget — föregående tillstånd återställt.` }
                      : { text: w.error, bad: true };
        runEngine({ apply: false });
      } else {
        const r = activateMode(S.overlay, rule, { from: today() }, now());
        if (r.error) { S.note = { text: r.error, bad: true }; render(); return; }
        S.overlay = r.overlay;
        const w = S.store.saveOverlay(S.overlay);
        if (!w.ok) { S.note = { text: w.error, bad: true }; render(); return; }
        runEngine();
        S.note = { text: `${LIFE_MODES[rule].label} aktiverat. ${LIFE_MODES[rule].why}` };
      }
      recomputeMatches(); render(); return;
    }
    if (t.dataset.eqyes) {
      const q = S.eq.find(x => x.rule === t.dataset.eqyes);
      if (q) {
        const r = applyRules(S.plan, S.overlay, S.cfg,
          [...engineFlags(), ...(q.sessions ?? []).map(id => ({ id: q.rule, sessionId: id, source: "manual" }))], now());
        const ch = r.actions.filter(a => a.session && a.action !== "warn" && a.rule === q.rule);
        S.overlay = applyActions(S.overlay, ch);
        const w = S.store.saveOverlay(S.overlay);
        S.note = w.ok ? { text: `${q.rule}: bekräftat — ${ch.length} pass ändrade.` } : { text: w.error, bad: true };
        runEngine({ apply: false }); recomputeMatches();
      }
      render(); return;
    }
    if (t.dataset.eqno) {
      S.eq = S.eq.filter(x => x.rule !== t.dataset.eqno);
      S.note = { text: "Nej — planen är orörd." };
      render(); return;
    }
    if (t.dataset.warnack != null) {
      for (const w of S.warns) S.seen.add(w.rule + "|" + w.session);
      render(); return;
    }
    if (t.dataset.engsave != null) {
      const eng = {};
      let bad = null;
      for (const [k, f] of Object.entries(ENGINE_FIELDS)) {
        const raw = document.querySelector(`[data-eng="${k}"]`)?.value ?? "";
        if (raw === "") continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < f.min || n > f.max) { bad = `${f.label}: ${f.min}–${f.max} ${f.unit}`; break; }
        eng[k] = f.pct ? n / 100 : n;
      }
      if (bad) { S.note = { text: "Avvisat — " + bad, bad: true }; render(); return; }
      const next = { ...S.cfg, engine: eng };
      const r = S.store.saveCfg(next);
      if (r.ok) { S.cfg = next; S.note = { text: "Motorvärden sparade." }; runEngine({ apply: false }); }
      else S.note = { text: r.error, bad: true };
      render(); return;
    }
    if (t.dataset.adjopen) { S.adjOpen = t.dataset.adjopen; S.logOpen = null; render(); return; }
    if (t.dataset.adjcancel != null) { S.adjOpen = null; render(); return; }
    if (t.dataset.adj) {
      const [verb, id] = t.dataset.adj.split("|");
      const payload = verb === "shorten" ? { durationMin: Number(document.getElementById("adjMin")?.value) }
                    : verb === "substitute" ? { sport: document.getElementById("adjSport")?.value }
                    : {};
      S.adjOpen = null;
      save(manualAdjust(S.plan, S.overlay, id, verb, payload, now()),
           verb === "shorten" ? "Kortat." : verb === "downgrade" ? "Nedväxlat till Z2." : "Gren bytt.");
      render(); return;
    }
    if (t.dataset.selday) {
      const [wk, d] = t.dataset.selday.split("|").map(Number);
      S.selDay = { week: wk, day: d }; render(); return;
    }
    if (t.dataset.backtoday != null) { S.selDay = null; render(); return; }
    if (t.dataset.logopen) { S.logOpen = t.dataset.logopen; S.adjOpen = null; S.sel = t.dataset.logopen; render(); return; }
    if (t.dataset.logcancel != null) { S.logOpen = null; render(); return; }
    if (t.dataset.logsave) {
      const rpeRaw = document.getElementById("logRpe")?.value ?? "";
      const note = document.getElementById("logNote")?.value?.trim() ?? "";
      const r = logResult(S.plan, S.overlay, t.dataset.logsave,
        { rpe: rpeRaw === "" ? null : Number(rpeRaw), userNote: note }, now());
      S.logOpen = null;
      save(r, "Markerat utfört.");
      render(); return;
    }
    if (t.dataset.unlog) {
      save(unlogResult(S.overlay, t.dataset.unlog, now()), "Loggningen ångrad.");
      render(); return;
    }
    if (t.dataset.nav) { S.view = t.dataset.nav; S.sel = null; S.tapMove = null; S.selDay = null; S.logOpen = null; S.adjOpen = null; S.histOpen = null; render(); return; }
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

/* Gardinen (0.9.3): handtaget är den enda dragytan — passkorten under behåller
   sin långtrycksgest orörd. Reducern är ren; här bor bara DOM-kopplingen. */
function goMonth(delta) {
  const months = planMonths(S.plan);
  const i = months.indexOf(S.monthYM);
  S.monthYM = months[Math.max(0, Math.min(months.length - 1, i + delta))];
}

/* Månadssvep (0.9.4): horisontellt inom månadsytan bläddrar. Slopkrav mot
   vertikal skroll; dagcellernas tryck överlever (rörelse dödar klicket). */
function wireMonthSwipe(root) {
  let x0 = null, y0 = null;
  root.addEventListener("pointerdown", (ev) => {
    const z = ev.target.closest?.(".mwrap");
    x0 = z ? ev.clientX : null; y0 = z ? ev.clientY : null;
  });
  root.addEventListener("pointerup", (ev) => {
    if (x0 == null) return;
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    x0 = null; y0 = null;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goMonth(dx < 0 ? 1 : -1);
    buzz(HAPTIC.day);
    render();
  });
}

let CU = { ...curtainIdle }, cuTicked = false;
const cuEls = () => ({ cur: document.getElementById("curtain"),
                       strip: app().querySelector?.(".stripwrap"),
                       zone: app().querySelector?.(".calzone") });
function cuApply(p) {
  const { cur, strip, zone } = cuEls();
  if (!cur?.style) return;
  const hMax = Math.min(460, cur.scrollHeight || 380), sMax = strip?.scrollHeight || 64;
  zone?.classList?.add("dragging");
  cur.style.maxHeight = Math.round(p * hMax) + "px";
  if (strip?.style) { strip.style.maxHeight = Math.round((1 - p) * sMax) + "px";
                      strip.style.opacity = String(1 - p); }
  if (!cuTicked && p >= 0.4) { cuTicked = true; buzz(HAPTIC.day); }     /* gardinen fastnar här */
  if (cuTicked && p < 0.4) cuTicked = false;
}
function cuCommit(open) {
  const { cur, strip, zone } = cuEls();
  S.monthOpen = open;
  zone?.classList?.remove("dragging");
  if (cur?.style) { cur.style.maxHeight = ""; cur.classList?.[open ? "add" : "remove"]("open"); }
  if (strip?.style) { strip.style.maxHeight = ""; strip.style.opacity = "";
                      strip.classList?.[open ? "add" : "remove"]("closed"); }
  buzz(HAPTIC.day);
  setTimeout(render, 320);                        /* normalisera efter övergången */
}
function wireCurtain(root) {
  root.addEventListener("pointerdown", (ev) => {
    if (!ev.target.closest?.("[data-chandle]")) return;
    CU = curtainReduce(curtainIdle, { type: "down", y: ev.clientY, t: Date.now(), open: S.monthOpen });
    cuTicked = S.monthOpen;
  });
  root.addEventListener("pointermove", (ev) => {
    if (CU.phase !== "drag") return;
    CU = curtainReduce(CU, { type: "move", y: ev.clientY, t: Date.now() });
    cuApply(CU.progress);
  });
  const done = (type) => (ev) => {
    if (CU.phase !== "drag") return;
    CU = curtainReduce(CU, { type, y: ev.clientY, t: Date.now() });
    if (CU.commit) cuCommit(CU.commit === "open");
    CU = { ...curtainIdle };
  };
  root.addEventListener("pointerup", done("up"));
  root.addEventListener("pointercancel", done("cancel"));
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
    if (v.ok) {
      const g = athleteGuard(p, S.cfg);                 /* D-M2: fel plan laddas aldrig tyst */
      if (!g.ok) { row("plan.json", g.why, "bad"); row("atlet", g.why, "bad"); }
      else {
        if (g.adopt) { S.cfg = { ...S.cfg, athlete: g.adopt }; S.store.saveCfg(S.cfg); }
        S.plan = p;
        row("plan.json", `${p.planVersion} · ${p.sessions.length} pass, ${p.weeks.length} veckor`, "ok");
        row("atlet", g.why, "ok");
      }
    }
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
    S.zpar = zoneParity(cr.activities);
    row("zonparitet", S.zpar.why, S.zpar.ok ? "ok" : "bad");
    const nRpe = cr.activities.filter(a => a.icu_rpe != null || a.perceived_exertion != null).length;
    row("aktiviteter", cr.error ? cr.error
        : `${cr.activities.length} lästa ur v32-cachen (${cr.path}, read-only)`
          + ` · RPE i ${nRpe} av dem`,
        cr.error ? "" : "ok");
    recomputeMatches();
    runEngine();
  }

  row("haptik", hapticRow(), hapticLog.api ? "" : "bad");
  if (!S.plan) { S.view = "installningar"; render(); return; }   /* felläget landar där pariteten bor */
  wire();
  wireCurtain(app());
  wireMonthSwipe(app());
  render();
  document.getElementById("wk-" + S.week)?.scrollIntoView();
}
boot();
