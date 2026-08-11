/* TRIZONE Next — ui.js · Rendering, gester och händelser. All logik importeras från core.
   Designspråk v0.1 (S4 rev 0.5.0: dagrader, fönsterchips som metadata) · beslut A+B 2026-08-02.
   Byggstämpelparitet över ALLA fem filer: core, ui, index (meta), sw (aktiv cache), plan. */
"use strict";
import { BUILD as CORE_BUILD, validatePlan, makeStore, weekView, planWeeks, weekDates,
         manualAdjust, shortDate, DAYLABEL, WINDOWS, SPORTS, DEFAULT_CFG, resolveOrphan,
         todayView, planDayOf, effectiveRpe, logResult, unlogResult, FEEL_LABEL, sessionDate,
         monthView, planMonths, curtainReduce, curtainIdle,
         dragReduce, dragIdle, hitTest, edgeScroll, DRAG,
         deriveMatches, applyMatchLinks, dismissMatch,
         actZoneMinutes, matchDate, backupExport, backupImport, zoneParity,
         ICU, connReady, validateConn, icuRequest, icuError, proxyAllowed,
         projectActivities, projectWellness, projectAthlete, benchmarksOf,
         pickActivitySource, zoneParityFull, recovery, wellnessFlags,
         emptyCache, V32_CACHE_KEY, statusGrid, pmcStatus, effTrend, zoneBand, dailyLoads, dayShift,
         applyRules, applyActions, deactivateMode, activateMode, LIFE_MODES,
         DAY_FLAGS, setDayFlag, clearDayFlag, dayFlagActive, dayFlagEngineFlags,
         ENGINE_FIELDS, ENGINE, athleteGuard, isQuality,
         orderExport, blockForDate, pastSummary, buildPosition } from "./core.js";

export const UI_BUILD = "next-0.19.1 · 2026-08-11";

const S = { plan:null, overlay:null, store:null, week:null, sel:null, tapMove:null, note:null,
            acts:[], mq:[], unplanned:[], importOpen:false, selDay:null, logOpen:null, adjOpen:null, zpar:null, evOpen:false, histOpen:null,
            monthOpen:false, monthYM:null,
            eq:[], warns:[], seen:new Set(), modeOpen:false, missPick:false,
            view:"idag", cfg:structuredClone(DEFAULT_CFG), cfgError:null, parity:[],
            /* fas B: egen datapipeline */
            cache:emptyCache(), src:null, athlete:null, bench:null, recov:null,
            connMsg:null, syncing:false, syncMsg:null, lastSync:0, dimOpen:null, effSport:"run", effZone:2, effRange:370, effSel:null, pmcRange:90, pmcSel:null };
const actById = id => S.acts.find(a => a.id === id);
let D = dragIdle, ghost = null, zones = [], zoneEls = new Map(), hotEl = null,
    rafId = 0, holdTimer = 0, swallowUntil = 0;   /* spökklick efter pointerup (0.5.2-buggen) */

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const SPORTLABEL = { swim:"SIM", bike:"CYKEL", run:"LÖP", strength:"STYRKA" };
const RECOV_DAYS = 30;                     /* speglar core.RECOV.baseDays i texten */
const RECOV_DELTA = 5;                     /* speglar core.RECOV.rhrDayDelta i texten */
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
const NAV = [["idag", "Idag"], ["plan", "Plan"], ["analys", "Analys"]];
function render() {
  const h = [];
  if (S.view === "idag") renderIdag(h);
  else if (S.view === "plan") renderPlan(h);
  else if (S.view === "omplanera") renderOmplanera(h);     /* U3: undervy till Plan */
  else if (S.view === "analys") renderAnalys(h);
  else renderSettings(h);
  const tabOf = id => S.view === id || (S.view === "omplanera" && id === "plan");
  h.push(`<nav class="tabs" aria-label="Huvudnavigering">` + NAV.map(([id, label]) =>
    `<button class="tab${tabOf(id) ? " active" : ""}" data-nav="${id}"
       aria-current="${tabOf(id) ? "page" : "false"}">${label}</button>`).join("") + `</nav>`);
  if (S.sel) { const s = findSess(S.sel); if (s) h.push(sheet(s)); }
  if (S.note) h.push(`<div class="toast${S.note.bad ? " bad" : ""}">${esc(S.note.text)}</div>`);
  scheduleToast();
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
    dayformChips(h, [t.hero, ...t.also].filter(s => s && s.status !== "struck"));
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

/* ---------- Matchbekräftelser (§5c) — bor i överblicken: de föder compliance ---------- */
function confirmSection(h) {
  if (!S.mq.length) return;
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

/* ---------- Livslägen & dagsform (0.18.1, demo bild 3) ----------
   Periodlägena som finns idag. Dagsform-chipsen (Dålig natt) kräver 0.19:s
   regelarbete — inga döda knappar skeppas. */
function modesSection(h) {
  h.push(`<section class="modes card"><div class="eyebrow">Livslägen &amp; dagsform</div>
    <p class="hint">Alla regler som formar planen — samlade här. Idag-fliken flaggar när något är aktivt.</p>
    <div class="slot-lbl">Dagsform</div>
    <div class="lifemodes">${Object.entries(DAY_FLAGS).map(([flag, m]) => {
      const on = dayFlagActive(S.overlay, flag, today());
      return `<button class="chipbtn modetog${on ? " on" : ""}" data-dayflag="${flag}"
        aria-pressed="${on}"><span class="dot"></span>${m.label}${on ? " · gäller idag" : ""}</button>`;
    }).join("")}</div>
    <div class="slot-lbl">Period</div>
    <div class="lifemodes">${Object.entries(LIFE_MODES).map(([rule, m]) => {
      const on = (S.overlay?.modes?.active ?? []).find(a => a.rule === rule);
      return `<button class="chipbtn modetog${on ? " on" : ""}" data-mode="${rule}"
        aria-pressed="${!!on}"><span class="dot"></span>${m.label}</button>`;
    }).join("")}</div>
    <p class="cue">${Object.values(DAY_FLAGS).map(m => `${m.label}: ${m.why}`).join(" ")}
      ${Object.values(LIFE_MODES).map(m => `${m.label}: ${m.why}`).join(" ")}</p>
    <p class="hint">Lägen rör pass — aldrig blockgränser, loppdatum eller delmål. Allt går att ångra.</p>
  </section>`);
}

/* ---------- Planhero v1 (0.18, demo v13) ----------
   buildPosition är ren corefunktion — här bara rendering. Briefing (U1)
   expanderbar under fasbandet; S.briefOpen är rent vytillstånd. */
function planHero(h) {
  const bp = buildPosition(S.plan, today());
  if (!bp) return;
  const cur = blockForDate(S.plan, today());
  const big = bp.state === "in" ? `V. ${bp.buildWeek}`
            : bp.state === "before" ? "Snart" : bp.state === "gap" ? "Mellan block" : "Klart";
  const meta = bp.state === "in"
    ? `av ${bp.totalWeeks}${bp.block ? ` · ${esc(bp.block.label)} · vecka ${bp.weekInBlock} av ${bp.block.weeks} i blocket` : ""}`
    : bp.state === "before" ? `bygget börjar om ${bp.totalWeeks} veckor räknat` : `${bp.totalWeeks} veckors bygge`;
  h.push(`<section class="planhero">
    <div class="big"><span class="n">${big}</span><span class="u">${meta}</span></div>
    <div class="phaseband">${bp.bands.map(b =>
      `<div class="phase ${b.state === "past" ? "past" : b.state === "cur" ? "cur" : ""}"
        style="flex:${b.weeks}"><span>${esc(b.label)}</span></div>`).join("")}
      <div class="todaypin" style="left:${bp.pinPct}%"></div></div>
    <div class="meter"><div class="fill" style="width:${bp.pct}%"></div></div>
    <div class="meter-lbl"><span>${bp.pct} % av bygget avklarat</span><span>${bp.totalWeeks} veckor totalt</span></div>
    ${cur?.text?.brief ? `<button class="brieffold${S.briefOpen ? " open" : ""}" data-briefopen>
        <span class="eyebrow">Fas · ${esc(cur.label ?? cur.id)}</span>
        <span class="chev">${S.briefOpen ? "Dölj" : "Om fasen"}</span></button>
      ${S.briefOpen ? `<p class="brief">${esc(cur.text.brief)}</p>` : ""}` : ""}
  </section>`);
}

/* ---------- Kompaktrad (0.18, demo bild 2): prick + titel + fönster + prio ----------
   Bär data-sess ⇒ tryck öppnar samma passdetalj-sheet som överallt annars. */
function compactRow(s) {
  const struck = s.status === "struck";
  return `<div class="crow${struck ? " struck" : ""}${s.status === "done" ? " done" : ""}"
      data-sess="${esc(s.id)}" tabindex="0" role="button"
      aria-label="${esc(s.title ?? s.id)}, ${s.durationMin} minuter">
    <i class="cdot" style="background:var(--${esc(s.sport)})"></i>
    <span class="ctitle">${esc(s.title ?? s.id)}</span>
    ${s.slot ? `<span class="cslot">${esc(s.slot)}</span>` : `<span class="cslot dim">${s.durationMin} min</span>`}
    ${badges(s)}
    ${s.status === "done" ? `<span class="donetag">✓ utfört</span>`
      : struck ? `<span class="tag">struket</span>`
      : `<span class="prio p${esc(s.prio)}">${esc(s.prio)}</span>`}
  </div>`;
}

/* ---------- Innevarande vecka (0.18.1) ----------
   Beräknas vid varje rendering — S.week från boot blir fel när veckan
   skiftar med appen öppen. Idag i planen ⇒ den veckan; annars nästa
   kommande; annars sista. Uppdaterar S.week så Idag-fabben följer med. */
function currentWeek() {
  const ws = planWeeks(S.plan);
  const t = today();
  const cur = ws.find(w => { const d = weekDates(S.plan, w); return d[0] <= t && t <= d[6]; })
           ?? ws.find(w => weekDates(S.plan, w)[0] > t)
           ?? ws[ws.length - 1] ?? null;
  if (cur != null) S.week = cur;
  return cur;
}

/* ---------- Plan: överblick (0.18) ----------
   Struktur beslutad 2026-08-10: hero → frågor/bekräftelser → pastfold →
   veckolista (kompaktrader) → Läget → utanför plan. Omplanera (U3) är
   egen vy bakom kalendersymbolen — överblicken flyttar aldrig något. */
function renderPlan(h) {
  const weeks = planWeeks(S.plan);

  h.push(`<header class="viewhead"><h1>Planen</h1>
    <span class="hicons">
      <button class="hicon" data-nav="omplanera" aria-label="Till omplanering">${ICO.cal}</button>
      <button class="hicon" data-nav="installningar" aria-label="Till inställningar">${ICO.user}</button>
    </span></header>`);

  planHero(h);
  questionCards(h);
  warnStep(h);
  confirmSection(h);

  /* U5 (0.17.1): passerade veckor hopfällda — semantiken låst i fixturer */
  const past = pastSummary(S.plan, S.overlay, today());
  if (past) h.push(`<button class="pastfold${S.pastOpen ? " open" : ""}" data-pastopen>
    <span>✓ ${past.weeks.length} avklarad${past.weeks.length === 1 ? " vecka" : "e veckor"} · ${past.done}/${past.total} pass</span>
    <span class="chev">${S.pastOpen ? "Dölj" : "Visa"}</span></button>`);

  /* 0.18.1 (demo bild 2): överblicken visar BARA innevarande vecka.
     Kommande veckor bor i Omplanera — överblicken ska läsas på fem sekunder.
     Öppnad pastfold visar de passerade veckorna i samma kompakta form. */
  const cw = currentWeek();
  const showWeeks = S.pastOpen && past
    ? [...past.weeks, cw].filter((w, i, a) => a.indexOf(w) === i)
    : [cw];
  for (const wk of showWeeks) {
    if (!weeks.includes(wk)) continue;
    const v = weekView(S.plan, S.overlay, wk);
    const sum = v.summary;
    const live = [...v.days.flatMap(d => d.sessions), ...v.unplaced]
      .filter(s => s.status !== "struck" && s.prio !== "C");           /* samma formel som pastSummary */
    const done = live.filter(s => s.status === "done").length;
    h.push(`<section class="wk" id="wk-${wk}">
      <header class="wkhead">
        <div class="eyebrow">${wk === cw ? "Denna vecka · " : ""}v.${wk} (${shortDate(v.days[0].date)} – ${shortDate(v.days[6].date)})${v.week?.type && v.week.type !== "normal" ? ` · ${esc(v.week.type)}` : ""}</div>
        ${v.week?.focus ? `<p class="focus">${esc(v.week.focus)}</p>` : ""}
        <div class="sums">
          <span class="compl"><b>${done}</b> av ${live.length} pass utförda</span>
          <span><b>${Math.round(sum.minutes / 6) / 10}</b> h</span>
          ${sum.lowShare != null ? `<span><b>${Math.round(sum.lowShare * 100)} %</b> lågintensivt</span>` : ""}
          ${sum.struck ? `<span class="dim">${sum.struck} struket</span>` : ""}
        </div>
        ${sum.minutes ? `<div class="wkzone">${zstrip(sum.zones.map((m, z) => [z + 1, m]).filter(p => p[1] > 0), true)}
          <span class="legend">ljusare = hårdare</span></div>` : ""}
      </header>`);

    for (const d of v.days) {
      if (!d.sessions.length) continue;                    /* överblicken visar träning, inte tomrum */
      h.push(`<div class="cday${d.date === today() ? " today" : ""}">
        <div class="dhead"><span class="dname">${d.label}</span><span class="ddate">${shortDate(d.date)}</span></div>
        ${d.sessions.map(compactRow).join("")}
      </div>`);
    }
    if (v.unplaced.length) h.push(`<div class="cday">
      <div class="dhead"><span class="dname">Att placera</span><span class="ddate">${v.unplaced.length}</span></div>
      ${v.unplaced.map(compactRow).join("")}
    </div>`);
    h.push(`<div class="acts"><button class="ghostbtn" data-nav="omplanera">Omplanera pass …</button></div>
    </section>`);
  }

  modesSection(h);
  offplanSection(h);
  h.push(`<button class="fab" data-today aria-label="Till aktuell vecka">Idag</button>`);
}

/* ---------- Dragbar kompaktrad i Omplanera (0.18.1) ----------
   Samma data-sess ⇒ tryck = sheet, långtryck = drag. Duration alltid med —
   här flyttar man dos, inte läser prosa. Zonbandet är utelämnat med avsikt. */
function rearrRow(s) {
  const struck = s.status === "struck";
  return `<div class="crow rearr${struck ? " struck" : ""}${s.status === "done" ? " done" : ""}"
      data-sess="${esc(s.id)}" tabindex="0" role="button"
      aria-label="${esc(s.title ?? s.id)}, ${s.durationMin} minuter">
    <i class="cdot" style="background:var(--${esc(s.sport)})"></i>
    <span class="ctitle">${esc(s.title ?? s.id)}</span>
    <span class="cslot">${s.durationMin} min${s.slot ? ` · ${esc(s.slot)}` : ""}</span>
    ${badges(s)}
    ${s.status === "done" ? `<span class="donetag">✓</span>`
      : struck ? `<span class="tag">struket</span>`
      : `<span class="prio p${esc(s.prio)}">${esc(s.prio)}</span>`}
  </div>`;
}

/* ---------- Omplanera (U3, 0.18): gamla Plan-vyn, oförändrad interaktion ----------
   Drag & drop, tryckplacering, dagmål, Att placera-menyn. Nås via
   kalendersymbolen i Plan. Ingen ny logik — bara ny adress. */
function renderOmplanera(h) {
  const weeks = planWeeks(S.plan);

  h.push(`<header class="viewhead"><button class="hicon backbtn" data-nav="plan" aria-label="Tillbaka till planen">‹</button>
    <h1>Omplanera</h1>
    <span class="hicons">
      <button class="hicon" data-nav="installningar" aria-label="Till inställningar">${ICO.user}</button>
    </span></header>
    <p class="hint">Tryck på ett pass för att flytta eller justera. Motorn varnar — du bestämmer.</p>`);

  if (S.tapMove) h.push(`<div class="banner sticky">Tryck på en dag för <b>${esc(S.tapMove.title ?? S.tapMove.id)}</b>
    <button class="txtbtn" data-cancel="1">Avbryt</button></div>`);

  const past = pastSummary(S.plan, S.overlay, today());
  if (past) h.push(`<button class="pastfold${S.pastOpen ? " open" : ""}" data-pastopen>
    <span>✓ ${past.weeks.length} avklarad${past.weeks.length === 1 ? " vecka" : "e veckor"} · ${past.done}/${past.total} pass</span>
    <span class="chev">${S.pastOpen ? "Dölj" : "Visa"}</span></button>`);

  for (const wk of weeks) {
    if (past && !S.pastOpen && past.weeks.includes(wk)) continue;
    const v = weekView(S.plan, S.overlay, wk);
    const sum = v.summary;
    h.push(`<section class="wk slim" id="wk-${wk}">
      <header class="wkhead slim">
        <span class="wkline"><b>Vecka ${wk}</b> · ${shortDate(v.days[0].date)} – ${shortDate(v.days[6].date)}
          · ${sum.planned} pass · ${Math.round(sum.minutes / 6) / 10} h${sum.struck ? ` · ${sum.struck} struket` : ""}${v.week?.type && v.week.type !== "normal" ? ` · ${esc(v.week.type)}` : ""}</span>
      </header>`);

    for (const d of v.days) {
      h.push(`<section class="day slim${d.date === today() ? " today" : ""}${d.sessions.length ? "" : " empty"}"
          data-day="${wk}|${d.day}">
        <div class="dhead"><span class="dname">${d.label}</span><span class="ddate">${shortDate(d.date)}</span>
          ${d.minutes ? `<span class="dmin">${d.minutes} min</span>` : ""}</div>
        ${d.sessions.map(rearrRow).join("")}
        ${S.tapMove ? `<button class="target slim" data-target="${wk}|${d.day}">Hit</button>` : ""}
      </section>`);
    }

    if (v.unplaced.length) h.push(`<section class="menu slim">
      <div class="eyebrow">Att placera · v.${wk} · ${v.unplaced.length}</div>
      ${v.unplaced.map(rearrRow).join("")}
    </section>`);
    h.push(`</section>`);
  }

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
/* ---------- Anslutning (fas B §5.1) ---------- */
function connSection(h) {
  const c = S.cfg.conn ?? { apiKey: "", athleteId: "", historyDays: ICU.defHistory };
  const r = connReady(c);
  h.push(`<section class="setsec"><div class="eyebrow">intervals.icu</div>
    <p class="hint">Nyckeln sparas bara i den här webbläsaren och skickas enbart till
      intervals.icu — aldrig via mellanhand, aldrig till en säkerhetskopia.</p>
    <div class="kv"><span class="k">Status</span>
      <span class="v ${r.ready ? "ok" : ""}">${esc(r.why)}</span></div>
    <label class="lfl"><span>API-nyckel <span class="dim">(Settings → Developer)</span></span>
      <input type="password" id="connKey" value="${esc(c.apiKey ?? "")}" autocomplete="off"
        placeholder="klistra in nyckeln"></label>
    <label class="lfl"><span>Athlete-ID</span>
      <input type="text" id="connId" value="${esc(c.athleteId ?? "")}" placeholder="i123456"
        autocomplete="off" inputmode="text"></label>
    <label class="lfl"><span>Historik <span class="dim">(dagar, ${ICU.minHistory}–${ICU.maxHistory})</span></span>
      <input type="number" id="connDays" value="${Number(c.historyDays ?? ICU.defHistory)}"
        min="${ICU.minHistory}" max="${ICU.maxHistory}" inputmode="numeric"></label>
    <div class="acts"><button data-connsave>Spara anslutning</button>
      <button class="ghostbtn" data-conntest>Testa anslutningen</button>
      <button class="ghostbtn" data-sync ${S.syncing ? "disabled" : ""}>${S.syncing ? "Hämtar…" : "Uppdatera nu"}</button></div>
    ${S.connMsg ? `<p class="hint ${S.connMsg.bad ? "bad" : "ok"}">${esc(S.connMsg.text)}</p>` : ""}
    ${S.syncMsg ? `<p class="hint ${S.syncMsg.bad ? "bad" : "ok"}">${esc(S.syncMsg.text)}</p>` : ""}
  </section>`);
}

/* ---------- Data: vad appen faktiskt har (fas B §5.2–5.4) ---------- */
function dataSection(h) {
  const c = S.cache ?? emptyCache();
  const f = c.fetched ?? {};
  const b = S.bench;
  h.push(`<section class="setsec"><div class="eyebrow">Data</div>
    <div class="kv">
      <span class="k">Källa</span><span class="v ${S.src?.source === "next" ? "ok" : ""}">${esc(S.src?.why ?? "–")}</span>
      <span class="k">Wellness</span><span class="v">${(c.wellness ?? []).length} dagar${f.wellness ? " · " + esc(f.wellness) : ""}</span>
      <span class="k">Atletprofil</span><span class="v">${S.athlete ? Object.keys(S.athlete.sports ?? {}).length + " grenar" + (f.athlete ? " · " + esc(f.athlete) : "") : "inte hämtad"}</span>
      <span class="k">Zonparitet</span><span class="v ${S.zpar?.ok ? "ok" : "bad"}">${esc(S.zpar?.why ?? "–")}</span>
    </div>`);

  if (b) h.push(`<div class="eyebrow" style="margin-top:12px">Benchmarks i intervals.icu</div>
    <p class="hint">Läses härifrån, ändras aldrig här. Zoner och trösklar sätter du i intervals.icu — appen har medvetet inget eget register.</p>
    <div class="kv">
      <span class="k">FTP</span><span class="v">${b.ftp ?? "–"}${b.ftp ? " W" : ""}</span>
      <span class="k">Tröskeltempo löp</span><span class="v">${esc(b.runThreshold ?? "–")}</span>
      <span class="k">CSS sim</span><span class="v">${esc(b.css ?? "–")}</span>
      <span class="k">LTHR löp / cykel</span><span class="v">${b.runLthr ?? "–"} / ${b.bikeLthr ?? "–"}</span>
    </div>`);

  const rc = S.recov;
  if (rc?.has) {
    const d = rc.day, t = rc.trend;
    const line = (k, v, warn) => `<span class="k">${k}</span><span class="v ${warn ? "bad" : ""}">${v}</span>`;
    h.push(`<div class="eyebrow" style="margin-top:12px">Återhämtning</div>
      <p class="hint">Allt mäts mot din egen baslinje över ${RECOV_DAYS} dagar — aldrig mot ett absolut tal.</p>
      <div class="kv">
        ${d.rhr != null ? line("Vilopuls i morse", `${d.rhr} <span class="dim">(normal ${d.rhrBase})</span>`, d.flags.rhr) : ""}
        ${d.sleepH != null ? line("Sömn senaste natten", `${d.sleepH} h <span class="dim">(normal ${d.sleepBase} h)</span>`, d.flags.sleep) : ""}
        ${t.rhr7 != null ? line("Vilopuls 7 dagar", `${t.rhr7} <span class="dim">(bas ${t.rhrBase})</span>`, t.flags.rhr) : ""}
        ${t.hrv != null ? line("HRV", `${t.hrv} ms <span class="dim">(bas ${t.hrvBase} ms)</span>`, t.flags.hrv) : ""}
      </div>`);
  } else if ((c.wellness ?? []).length) {
    h.push(`<p class="hint">För lite wellnessdata för baslinjer än — signalerna tiger hellre än gissar.</p>`);
  }
  h.push(`<div class="eyebrow" style="margin-top:12px">Simpuls</div>
    <p class="hint">Optisk handledspuls i vatten är inte mätdata — därför visas ingen zonremsa
      på simpass som standard. Har du ett simdugligt bröstband (HRM-Pro/Swim/Tri) slår du på
      remsan här. Simpuls ligger fysiologiskt lägre än landpuls; ett eget simoffset kan behövas
      och beslutas då, inte nu.</p>
    <div class="acts"><button class="modetog${S.cfg.swimHrValid ? " on" : ""}" data-swimhr
      aria-pressed="${!!S.cfg.swimHrValid}">Pulsremsa på simpass: ${S.cfg.swimHrValid ? "på" : "av"}</button></div>
    <div class="acts" style="margin-top:10px">
    <button class="ghostbtn" data-clearcache>Rensa datacachen</button></div>
    <p class="hint">Cachen är återskapbar med en hämtning och ingår därför aldrig i säkerhetskopian.</p>
  </section>`);
}

/* ================================================================
   ANALYS (0.11.0) — statusgriden. L3: visa → förklara → fördjupa.
   Kortet visar tolkningen; ett tryck fäller ut varför. Ingen dimension
   bär statusfärg utan en bedömning bakom sig.
   ================================================================ */
const DIMDOT = { ok: "ok", warn: "warn", risk: "risk", idle: "idle" };

function renderAnalys(h) {
  h.push(`<header class="viewhead"><div class="eyebrow">Facit · deterministiskt, aldrig gissningar</div>
    <h1>Analys</h1>
    <p class="lede">Tryck på en dimension för varför. Varje siffra går att härleda —
      inget här är skattat.</p></header>`);

  /* Regressionsvakt 0.16.0: core-funktionerna läser cfg PLATT (lowShareTarget,
     volumeCapPct) men S.cfg bär dem under engine — utan utplattningen jämförde
     Analys alltid mot 78/110 % oavsett profil. swimHrValid är toppnivå. */
  const ecfg = { ...(S.cfg.engine ?? {}), swimHrValid: S.cfg.swimHrValid };
  const grid = statusGrid(S.acts ?? [], S.recov, today(), ecfg, S.plan);
  h.push(`<section class="dimgrid">`);
  for (const d of grid) {
    const open = S.dimOpen === d.key;
    h.push(`<button class="dimcard${open ? " open" : ""}${d.has ? "" : " idle"}"
        data-dim="${d.key}" aria-expanded="${open}">
      <span class="dimhead"><span class="dot ${DIMDOT[d.state] ?? "idle"}"></span>
        <span class="eyebrow">${esc(d.label)}</span></span>
      <span class="dimval">${esc(d.value)}</span>
      ${open ? `<span class="dimwhy">${esc(d.why)}</span>` : ""}
    </button>`);
  }
  h.push(`</section>`);

  /* Belastning · 8 veckor — ren layoutmatte, ett koordinatsystem (v29-lärdomen) */
  const load = grid[0];
  if (load.has && load.weeks?.length) {
    const max = Math.max(...load.weeks.map(w => w.minutes), 1);
    h.push(`<section class="setsec"><div class="eyebrow">Belastning · 8 veckor</div>
      <div class="bars">${load.weeks.map(w => {
        const pct = Math.round((w.minutes / max) * 100);
        return `<div class="bar"><span class="barval">${w.hours}</span>
          <span class="barcol" style="height:${Math.max(pct, 2)}%"></span>
          <span class="barlab">${esc(w.monday.slice(5))}</span></div>`;
      }).join("")}</div>
      <p class="hint">Timmar per vecka, alla grenar. Måndagens datum märker stapeln.</p>
    </section>`);
  }

  pmcSection(h);
  effSection(h);

  h.push(`<section class="setsec"><div class="eyebrow">Vad som inte finns här än</div>
    <p class="hint">Benchmarktrender mot mål och tidsintervallväljare per graf kommer
      när de kan ritas ur mätdata — aldrig ur skattningar.</p></section>`);
}

/* ---------- PMC: fitness, trötthet, form ----------
   0.15.0-geometrin: ETT koordinatsystem (dagcellens mittpunkt) för linjer,
   staplar, guide och tryckytor — v29-lagen, nu även här. Pixeltrogen viewBox
   (demons modell) så att cirklar är cirklar, inte ellipser. */
const PMC_RANGES = [[30, "1M"], [90, "3M"], [180, "6M"], [370, "Säsong"]];
const LOADCOLORS = [["swim", "Sim"], ["bike", "Cykel"], ["run", "Löp"], ["strength", "Styrka"]];
const CW = 356;                                  /* ritytans bredd i enheter ≈ px på mobil */

function pmcSection(h) {
  const range = S.pmcRange;
  const p = pmcStatus(S.cache?.wellness ?? [], today(), range);
  h.push(`<section class="setsec"><div class="eyebrow">Form · fitness och trötthet</div>
    <div class="chips">${PMC_RANGES.map(([d, l]) =>
      `<button class="chip${range === d ? " on" : ""}" data-pmcrange="${d}">${l}</button>`).join("")}</div>`);

  const rc = S.recov;
  if (rc?.has) {
    const d = rc.day, tr = rc.trend;
    h.push(`<div class="kv">
      ${d.sleep3 != null ? `<span class="k">Sömn 3 nätter</span><span class="v">${d.sleep3} h</span>` : ""}
      ${d.rhr != null ? `<span class="k">Vilopuls</span><span class="v${d.flags.rhr ? " bad" : ""}">${d.rhr} <span class="dim">(baslinje ${d.rhrBase})</span></span>` : ""}
      ${tr.hrv != null ? `<span class="k">HRV</span><span class="v${tr.flags.hrv ? " bad" : ""}">${tr.hrv} ms <span class="dim">(baslinje ${tr.hrvBase} ms)</span></span>` : ""}
    </div>
    <p class="hint">Avvikande vilopuls (≥ +${RECOV_DELTA} bpm mot din baslinje) gör att motorn
      frågar om dagens kvalitetspass — den ändrar aldrig något själv.</p>`);
  }
  if (!p.has) { h.push(`<p class="hint">${esc(p.why)}</p></section>`); return; }

  const loads = dailyLoads(S.acts ?? [], today(), range);
  const n = Math.max(loads.length, 1), ix = Object.fromEntries(loads.map((l, i) => [l.date, i]));
  const H = 200, bw = (CW - 4) / n;
  const xc = i => (2 + (i + 0.5) * bw);          /* dagcellens mitt — ENDA x-systemet */
  const vals = p.series.flatMap(d => [d.ctl, d.atl]);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(hi - lo, 1);
  const yLine = v => (122 - (v - lo) / span * 108).toFixed(1);   /* linjer i bandet 14–122 */
  const linePts = key => p.series.map(d => `${xc(ix[d.date] ?? 0).toFixed(2)},${yLine(d[key])}`).join(" ");
  const ctlPts = linePts("ctl"), atlPts = linePts("atl");
  const area = `M ${ctlPts.split(" ")[0]} L ${ctlPts.split(" ").slice(1).join(" L ")} L ${xc(n - 1).toFixed(2)},${H} L ${xc(0).toFixed(2)},${H} Z`;
  const maxL = Math.max(...loads.map(l => l.total), 1);
  let bars = "";
  for (let i = 0; i < loads.length; i++) {       /* staplar upp i kurvornas rum — integrerade som v32 */
    const l = loads[i]; if (!l.total) continue;
    let y = H - 4;
    const w = Math.max(bw * 0.68, 0.8), x = (xc(i) - w / 2).toFixed(2);
    for (const [sp] of LOADCOLORS) { if (!l[sp]) continue;
      const hgt = l[sp] / maxL * 82; y -= hgt;
      bars += `<rect x="${x}" y="${y.toFixed(1)}" width="${w.toFixed(2)}" height="${hgt.toFixed(1)}" fill="var(--${sp})" opacity=".88"/>`; }
  }
  const taps = loads.map((l, i) =>
    `<rect x="${(xc(i) - bw / 2).toFixed(2)}" y="0" width="${bw.toFixed(2)}" height="${H}" fill="transparent" data-pmcday="${l.date}"/>`).join("");
  const si = S.pmcSel != null ? ix[S.pmcSel] : null;
  const sd = si != null ? p.series.find(x => x.date === S.pmcSel) : null;
  const marker = (pts, color) => sd == null ? "" :
    `<circle cx="${xc(si).toFixed(2)}" cy="${pts}" r="4.6" fill="var(--bg)" stroke="${color}" stroke-width="2"/>`;

  h.push(`<div class="chartwrap"><div class="ylab tall3"><span>${Math.round(hi)}</span><span>${Math.round((hi + lo) / 2)}</span><span>${Math.round(lo)}</span></div>
    <svg class="chart" viewBox="0 0 ${CW} ${H}">
      <defs><linearGradient id="ctlfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5B93E6" stop-opacity=".15"/>
        <stop offset="1" stop-color="#5B93E6" stop-opacity="0"/></linearGradient></defs>
      <line x1="2" y1="14" x2="${CW - 2}" y2="14" stroke="var(--line-soft)" stroke-width=".7"/>
      <line x1="2" y1="68" x2="${CW - 2}" y2="68" stroke="var(--line-soft)" stroke-width=".7"/>
      <line x1="2" y1="122" x2="${CW - 2}" y2="122" stroke="var(--line-soft)" stroke-width=".7"/>
      <path d="${area}" fill="url(#ctlfill)"/>
      ${bars}
      ${si != null ? `<line x1="${xc(si).toFixed(2)}" y1="6" x2="${xc(si).toFixed(2)}" y2="${H - 4}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 3" opacity=".75"/>` : ""}
      <polyline points="${atlPts}" fill="none" stroke="var(--warn)" stroke-width="1.9"
        stroke-linejoin="round" stroke-linecap="round" opacity=".92"/>
      <polyline points="${ctlPts}" fill="none" stroke="var(--info)" stroke-width="2.4"
        stroke-linejoin="round" stroke-linecap="round"/>
      ${sd ? marker(yLine(sd.atl), "var(--warn)") + marker(yLine(sd.ctl), "var(--info)") : ""}
      ${taps}</svg></div>
    <div class="xlab"><span>${esc(loads[0]?.date ?? "")}</span><span>Tryck i grafen för en dag</span><span>${esc(loads[loads.length - 1]?.date ?? "")}</span></div>
    <div class="legend"><span><i class="sw" style="background:var(--info)"></i>Fitness (CTL)</span>
      <span><i class="sw" style="background:var(--warn)"></i>Trötthet (ATL)</span>
      <span><i class="sw" style="background:var(--run)"></i>Belastning/dag, grenfärg</span></div>`);

  if (si != null) {
    const ld = loads[si], parts = [];
    if (sd) parts.push(`Form ${sd.tsb > 0 ? "+" : ""}${sd.tsb} · Fitness ${sd.ctl} · Trötthet ${sd.atl}`);
    const lp = LOADCOLORS.filter(([k]) => ld?.[k]).map(([k, lbl]) => `${lbl} ${Math.round(ld[k])} TSS`).join(" · ");
    parts.push(lp || "Vilodag");
    h.push(`<p class="ptdetail">${esc(S.pmcSel)} · ${parts.join(" · ")}</p>`);
  }

  h.push(`<div class="kv"><span class="k">Form (TSB)</span><span class="v">${p.tsb > 0 ? "+" : ""}${p.tsb} · ${esc(p.label)}</span>
      <span class="k">Fitness / trötthet</span><span class="v">${p.ctl} / ${p.atl}</span></div>
    <p class="hint">${esc(p.why)}</p>
    <p class="hint">Riktvärdena för vad ett TSB-tal betyder är litteraturens, inte dina —
      läs siffran mot hur benen känns, inte tvärtom.</p></section>`);
}

/* ---------- Effektivitet per gren ---------- */
const EFFSPORTS = [["run", "Löpning"], ["bike", "Cykel"], ["swim", "Simning"]];
const EFF_RANGES = [[90, "3M"], [180, "6M"], [370, "Säsong"]];

function effSection(h) {
  const sport = S.effSport, zone = S.effZone, range = S.effRange;
  const t = effTrend(S.acts ?? [], S.athlete, sport, zone, { from: dayShift(today(), -range) });
  h.push(`<section class="setsec"><div class="eyebrow">Aerob effektivitet</div>
    <p class="hint">Samma puls, bättre output = progression. Uppmätt, aldrig prognos.</p>
    <div class="chips">${EFFSPORTS.map(([id, label]) =>
      `<button class="chip${sport === id ? " on" : ""}" data-effsport="${id}">${label}</button>`).join("")}</div>
    <div class="chips">${EFF_RANGES.map(([d, l]) =>
      `<button class="chip${range === d ? " on" : ""}" data-effrange="${d}">${l}</button>`).join("")}</div>`);

  if (sport !== "swim") {
    h.push(`<div class="chips">${[2, 3].map(z => {
      const b = zoneBand(S.athlete, sport, z);
      return `<button class="chip${zone === z ? " on" : ""}" data-effzone="${z}">Z${z}${
        b ? ` · ${b.lo}–${b.hi}` : ""}</button>`;
    }).join("")}</div>
    <p class="hint">Fönstren är dina egna zongränser ur intervals.icu — inga tumregler.
      Z3 låter dig jämföra pass i racepace.</p>`);
  } else {
    h.push(`<p class="hint">Sim väljs på distans (≥ 600 m), aldrig på puls —
      optisk handledspuls i vatten är inte mätdata.</p>`);
  }

  if (!t.has) { h.push(`<p class="hint">${esc(t.why)}</p></section>`); return; }

  const H = 170;
  const ys = t.points.map(pt => pt.y);
  const lo = Math.min(...ys), hi = Math.max(...ys), span = Math.max(hi - lo, 1);
  const col = { run: "var(--run)", bike: "var(--bike)", swim: "var(--swim)" }[sport];
  const yOf = v => t.lowerBetter ? ((v - lo) / span * 138 + 12) : (H - 20 - (v - lo) / span * 138);
  const xOf = i => (14 + i / Math.max(t.points.length - 1, 1) * (CW - 28)).toFixed(1);
  const dots = t.points.map((pt, i) => {
    const seld = S.effSel === i, cx = xOf(i), cy = yOf(pt.y).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="${seld ? 9 : 6.5}" fill="${col}" opacity=".13"/>
      <circle cx="${cx}" cy="${cy}" r="${seld ? 4.6 : 3.4}" fill="${col}" stroke="var(--bg)" stroke-width="1.3"/>
      ${seld ? `<circle cx="${cx}" cy="${cy}" r="7" fill="none" stroke="var(--accent)" stroke-width="1.2"/>` : ""}
      <circle cx="${cx}" cy="${cy}" r="13" fill="transparent" data-effpt="${i}"/>`;
  }).join("");
  const selGuide = S.effSel != null && t.points[S.effSel]
    ? `<line x1="${xOf(S.effSel)}" y1="8" x2="${xOf(S.effSel)}" y2="${H - 8}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 3" opacity=".6"/>` : "";
  const midVal = t.lowerBetter ? lo + span / 2 : hi - span / 2;
  const topLab = t.fmt(t.lowerBetter ? lo : hi), botLab = t.fmt(t.lowerBetter ? hi : lo);

  h.push(`<div class="chartwrap"><div class="ylab tall3"><span>${esc(topLab)}</span><span>${esc(t.fmt(midVal))}</span><span>${esc(botLab)}</span></div>
    <svg class="chart" viewBox="0 0 ${CW} ${H}">
      <line x1="2" y1="12" x2="${CW - 2}" y2="12" stroke="var(--line-soft)" stroke-width=".7"/>
      <line x1="2" y1="${H / 2}" x2="${CW - 2}" y2="${H / 2}" stroke="var(--line-soft)" stroke-width=".7"/>
      <line x1="2" y1="${H - 20}" x2="${CW - 2}" y2="${H - 20}" stroke="var(--line-soft)" stroke-width=".7"/>
      ${selGuide}
      <line x1="${xOf(0)}" y1="${yOf(t.first).toFixed(1)}" x2="${xOf(t.points.length - 1)}" y2="${yOf(t.last).toFixed(1)}"
        stroke="${col}" stroke-width="1.4" stroke-dasharray="5 5" opacity=".7"/>
      ${dots}</svg></div>
    <div class="xlab"><span>${esc(t.from)}</span><span>Tryck på en punkt</span><span>${esc(t.to)}</span></div>`);

  if (S.effSel != null && t.points[S.effSel]) {
    const pt = t.points[S.effSel];
    h.push(`<p class="ptdetail">${esc(pt.date)} · ${esc(t.fmt(pt.y))}${pt.hr ? ` @ ${Math.round(pt.hr)} bpm` : ""}</p>`);
  }
  h.push(`<p class="hint">Uppåt i grafen = bättre. ${esc(t.why)}</p></section>`);
}

function renderSettings(h) {
  h.push(`<header class="viewhead"><span class="wm">TRIZONE</span><h1>Inställningar</h1></header>`);

  connSection(h);
  dataSection(h);

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

  /* B6: beställningsexporten — komponeras vid tryck, lagras aldrig */
  h.push(`<section class="setsec"><div class="eyebrow">Beställning till coachen</div>
    <div class="acts"><button data-order>Kopiera beställningsexport</button></div>
    <p class="hint">Aktiva bindningar, skyddade pass, motorvärden och benchmarks — underlaget för
      nästa planleverans. Orsakstexter följer aldrig med; de är dina.</p>
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
  /* Matchning §3: simremsan renderas först när simdugligt bröstband finns och
     flaggan slagits på i profilen. Utan den: ingen låtsasremsa, tempo gäller. */
  if (s.sport === "swim" && !S.cfg.swimHrValid)
    strip = `<p class="hint">Simpuls (optisk) är ogiltig — ingen zonremsa. Tempo och distans gäller.</p>`;
  else if (s.sport !== "strength") {
    const zm = actZoneMinutes(a);
    strip = zm ? zstrip(zm.map((m, z) => [z + 1, m]).filter(p => p[1] > 0))
               : `<p class="hint">Ingen zondata i aktiviteten.</p>`;
    if (zm && s.sport === "swim")
      strip += `<p class="hint">Simpuls ligger fysiologiskt lägre än landpuls — remsan läses med det i minnet.</p>`;
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
/* ================================================================
   HÄMTNING (fas B) — tunt lager. All bedömning bor i core.
   Nyckeln lämnar aldrig webbläsaren: proxyAllowed vaktar det i kod,
   inte i kommentar. Anropet går direkt till intervals.icu, som v32
   har bevisat fungerar från GitHub Pages.
   ================================================================ */
const SYNC_COOLDOWN_MS = 15 * 60 * 1000;      /* auto vid boot, max var 15:e minut */

async function icuFetch(conn, kind) {
  const req = icuRequest(conn, kind, today());
  if (req.error) return { error: req.error };
  if (proxyAllowed(req.headers)) return { error: "internt fel: auth-header saknas — anropet stoppat" };
  try {
    const r = await fetch(req.url, { headers: req.headers });
    if (!r.ok) return { error: icuError(r.status, kind) };
    return { data: await r.json() };
  } catch (e) {
    return { error: `${kind}: ${e.message} — troligen nätverk eller CORS. Cachen gäller tills vidare.` };
  }
}

async function syncNow({ auto = false } = {}) {
  const r = connReady(S.cfg.conn);
  if (!r.ready) { if (!auto) { S.syncMsg = { text: r.why, bad: true }; render(); } return; }
  if (S.syncing) return;
  if (auto && Date.now() - S.lastSync < SYNC_COOLDOWN_MS) return;
  S.syncing = true; S.syncMsg = { text: "Hämtar från intervals.icu…" }; if (!auto) render();

  const [a, w, p] = await Promise.all([          /* ett trasigt anrop sänker aldrig de andra */
    icuFetch(S.cfg.conn, "activities"),
    icuFetch(S.cfg.conn, "wellness"),
    icuFetch(S.cfg.conn, "athlete")]);

  const patch = {}, fails = [], notes = [];
  if (a.data) { const pr = projectActivities(a.data);
    if (pr.error) fails.push("aktiviteter: " + pr.error);
    else { patch.activities = pr.activities;
           notes.push(`${pr.activities.length} aktiviteter` + (pr.dropped ? ` (${pr.dropped} okända förkastade)` : "")); } }
  else fails.push(a.error);
  if (w.data) { const pr = projectWellness(w.data);
    if (pr.error) fails.push("wellness: " + pr.error);
    else { patch.wellness = pr.wellness; notes.push(`${pr.wellness.length} wellnessdagar`); } }
  else fails.push(w.error);
  if (p.data) { const pr = projectAthlete(p.data);
    if (!pr.error) { patch.athlete = pr.athlete; notes.push(`${pr.sportCount} grenar i profilen`); } }
  /* atletprofilen är ren förbättring — den får fela tyst (v32:s val, ärvt) */

  S.syncing = false;
  S.lastSync = Date.now();
  if (Object.keys(patch).length) {
    const res = S.store.saveCache(S.cache, patch, today(), S.cfg.conn.historyDays ?? ICU.defHistory);
    if (res.cache) S.cache = res.cache;
    if (!res.ok) fails.push(res.error);
    else if (res.degraded) fails.push(res.error);
  }
  S.syncMsg = { text: (notes.length ? "Hämtat: " + notes.join(" · ") : "Inget hämtat") +
                      (fails.length ? " — " + fails.join(" · ") : ""),
                bad: !!fails.length };
  refreshData();
  render();
}

/* Läser om allt som hänger på cachen. Anropas efter hämtning och vid boot. */
function refreshData() {
  const src = pickActivitySource(S.cache, window.localStorage.getItem(V32_CACHE_KEY));
  S.acts = src.activities;
  S.src = src;
  S.athlete = S.cache.athlete ?? null;
  S.bench = S.athlete ? benchmarksOf(S.athlete) : null;
  S.recov = (S.cache.wellness ?? []).length ? recovery(S.cache.wellness, today()) : null;
  S.zpar = S.athlete ? zoneParityFull(S.athlete, src.activities, S.cfg) : zoneParity(src.activities);
  if (S.plan) { recomputeMatches(); runEngine(); }
}

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

/* Flaggor appen härleder själv. Wellness-flaggorna (fas B, alternativ C):
   dagssignal → sleep-guard (nivå 1, frågar) · trend → recovery-watch (nivå 3, varnar).
   Utan wellnessdata produceras inga flaggor — appen hittar aldrig på. */
function engineFlags() {
  const f = [];
  for (const [id, so] of Object.entries(S.overlay?.sessions ?? {})) {
    const r = so.rpe ?? (so.match ? actById(so.match.activityId)?.icu_rpe : null);
    if (r != null && r >= 9) f.push({ id: "rpe-watch", sessionId: id });
  }
  f.push(...wellnessFlags(S.cache?.wellness ?? [], today()));
  f.push(...dayFlagEngineFlags(S.overlay, today()));   /* B19-1: expiry per körning */
  return f;
}

/* ---------- Dagsform (B19-1, 0.19.0) ----------
   Sov dåligt = dygnsflagga (släpper vid midnatt) · Känning = periodläge
   (samma data-mode som i Plan) · Hinner inte = tillståndslös action in i
   missed-flödet. Tre semantiker ⇒ tre mekanismer, ett chipsband. */
function sleepFlagToggle() {
  const d = today();
  if (dayFlagActive(S.overlay, "sleep", d)) {
    S.overlay = clearDayFlag(S.overlay, "sleep", d, now());
    const w = S.store.saveOverlay(S.overlay);
    S.note = w.ok ? { text: "Sov dåligt släppt — dagens pass återställda." }
                  : { text: w.error, bad: true };
    runEngine({ apply: false });
  } else {
    const r = setDayFlag(S.overlay, "sleep", d, now());
    if (r.error) { S.note = { text: r.error, bad: true }; return; }
    S.overlay = r.overlay;
    const w = S.store.saveOverlay(S.overlay);
    if (!w.ok) { S.note = { text: w.error, bad: true }; return; }
    runEngine();
    S.note = { text: "Sov dåligt: dagens kvalitet växlas ned till Z2. Gäller idag — tryck igen för att ångra." };
  }
  recomputeMatches();
}

function reportMissed(id) {
  const r = applyRules(S.plan, S.overlay, S.cfg,
                       [...engineFlags(), { id: "missed", sessionId: id }], now());
  const mine = r.actions.filter(a => a.session === id && String(a.rule).startsWith("missed"));
  const ch = mine.filter(a => a.action !== "warn");
  if (ch.length) {
    S.overlay = applyActions(S.overlay, ch);
    const w = S.store.saveOverlay(S.overlay);
    if (!w.ok) { S.note = { text: w.error, bad: true }; return; }
  }
  const a = mine[0];
  S.note = !a ? { text: "Inget att göra — passet är redan hanterat." }
    : a.action === "move"   ? { text: `A-passet flyttat: ${a.why}` }
    : a.action === "strike" ? { text: a.why }
    : { text: a.why };
  S.missPick = false;
  runEngine({ apply: false });
  recomputeMatches();
}

function dayformChips(h, planned) {
  const d = today();
  const sleepOn = dayFlagActive(S.overlay, "sleep", d);
  const tfOn = (S.overlay?.modes?.active ?? []).some(a => a.rule === "tissue-freeze");
  h.push(`<section class="dayform card"><div class="eyebrow">Om inte?</div>
    <div class="lifemodes">
      <button class="chipbtn modetog${sleepOn ? " on" : ""}" data-dayflag="sleep"
        aria-pressed="${sleepOn}"><span class="dot"></span>${DAY_FLAGS.sleep.label}${sleepOn ? " · gäller idag" : ""}</button>
      <button class="chipbtn modetog${tfOn ? " on" : ""}" data-mode="tissue-freeze"
        aria-pressed="${tfOn}"><span class="dot"></span>${LIFE_MODES["tissue-freeze"].label}</button>
      ${planned.length ? `<button class="chipbtn actchip" data-nothit>Hinner inte&nbsp;›</button>` : ""}
    </div>
    ${S.missPick && planned.length ? `<div class="misspick">
      <p class="hint">Vilket pass hinner du inte? A flyttas om det går, B stryks — jagas aldrig ikapp.</p>
      ${planned.map(s => `<div class="qrow"><div class="qtext"><b>${esc(s.title ?? s.id)}</b>
        <span class="dim">${s.durationMin} min · ${esc(s.prio)}-pass${s.protected ? " · ◈ skyddat" : ""}</span></div>
        <div class="qacts"><button data-missed="${esc(s.id)}">Hinner inte</button></div></div>`).join("")}
      <div class="acts"><button class="ghostbtn" data-missabort>Avbryt</button></div>
    </div>` : ""}
  </section>`);
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

/* ---------- Toast-timeout (0.19.1, S25-fynd) ----------
   Kvittenser låg kvar tills nästa tryck och skymde kromet. Ok-toaster
   släcks själva; FELtoaster ligger kvar tills nästa interaktion — ett fel
   ska inte kunna blinka förbi oläst. Samma note-objekt startar aldrig om
   sin klocka vid omrendering. */
const TOAST_MS = () => globalThis.__TZ_TOAST_MS ?? 4500;
let toastRef = null, toastTimer = null;
function scheduleToast() {
  if (!S.note) { toastRef = null; return; }
  if (S.note.bad || S.note === toastRef) return;
  toastRef = S.note;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (S.note === toastRef) { S.note = null; render(); }
  }, TOAST_MS());
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
    const t = ev.target.closest("[data-act],[data-order],[data-pastopen],[data-briefopen],[data-cancel],[data-close],[data-target],[data-today],[data-link],[data-nolink],[data-backup],[data-download],[data-import],[data-import-go],[data-nav],[data-orphan],[data-buzztest],[data-selday],[data-backtoday],[data-logopen],[data-logsave],[data-logcancel],[data-unlog],[data-adjopen],[data-adjcancel],[data-adj],[data-mode],[data-dayflag],[data-nothit],[data-missed],[data-missabort],[data-eqyes],[data-eqno],[data-warnack],[data-engsave],[data-evlog],[data-histopen],[data-histclose],[data-chandle],[data-mprev],[data-mnext],[data-connsave],[data-conntest],[data-sync],[data-clearcache],[data-swimhr],[data-dim],[data-effsport],[data-effzone],[data-effrange],[data-effpt],[data-pmcrange],[data-pmcday]");
    if (!t) return;
    S.note = null;
    if (t.dataset.chandle != null) { cuCommit(!S.monthOpen); return; }
    if (t.dataset.mprev != null || t.dataset.mnext != null) {
      goMonth(t.dataset.mnext != null ? 1 : -1);
      render(); return; }
    if (t.dataset.evlog != null) { S.evOpen = !S.evOpen; render(); return; }
    if (t.dataset.histopen) { S.histOpen = t.dataset.histopen; render(); return; }
    if (t.dataset.histclose != null) { S.histOpen = null; render(); return; }
    if (t.dataset.dayflag) { sleepFlagToggle(); render(); return; }
    if (t.dataset.nothit != null) { S.missPick = !S.missPick; render(); return; }
    if (t.dataset.missabort != null) { S.missPick = false; render(); return; }
    if (t.dataset.missed) { reportMissed(t.dataset.missed); render(); return; }
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
    if (t.dataset.eqyes === "sleep-guard") {
      /* B19-1: derived-frågans Ja landar i samma dygnsflagga som chippet —
         samma tillstånd, samma expiry, samma ångra. */
      if (!dayFlagActive(S.overlay, "sleep", today())) sleepFlagToggle();
      render(); return;
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
    /* ---------- Anslutning (fas B) ---------- */
    if (t.dataset.connsave != null) {
      const raw = { apiKey: (document.getElementById("connKey")?.value ?? "").trim(),
                    athleteId: (document.getElementById("connId")?.value ?? "").trim(),
                    historyDays: Number(document.getElementById("connDays")?.value) || ICU.defHistory };
      const v = validateConn(raw);
      if (!v.ok) { S.connMsg = { text: "Avvisat — " + v.errors.map(e => e.why).join(" · "), bad: true };
                   render(); return; }
      const next = { ...S.cfg, conn: raw };
      const r = S.store.saveCfg(next);
      if (!r.ok) { S.connMsg = { text: r.error, bad: true }; render(); return; }
      S.cfg = next;
      S.connMsg = { text: connReady(raw).ready
        ? "Anslutningen sparad. Tryck Testa anslutningen för att bekräfta mot intervals.icu."
        : "Sparat — " + connReady(raw).why };
      render(); return;
    }
    if (t.dataset.conntest != null) {
      const r = connReady(S.cfg.conn);
      if (!r.ready) { S.connMsg = { text: r.why, bad: true }; render(); return; }
      S.connMsg = { text: "Testar…" }; render();
      icuFetch(S.cfg.conn, "athlete").then(res => {
        if (res.error) { S.connMsg = { text: res.error, bad: true }; render(); return; }
        const p = projectAthlete(res.data);
        S.connMsg = { text: `Anslutningen fungerar — ${p.athlete?.name ?? "atlet"} `
          + `(${p.sportCount} grenar med inställningar). Tryck Uppdatera nu för att hämta data.` };
        render();
      });
      return;
    }
    if (t.dataset.sync != null) { syncNow(); return; }
    if (t.dataset.dim) { S.dimOpen = S.dimOpen === t.dataset.dim ? null : t.dataset.dim; render(); return; }
    if (t.dataset.effsport) { S.effSport = t.dataset.effsport; S.effSel = null; render(); return; }
    if (t.dataset.effzone) { S.effZone = Number(t.dataset.effzone); S.effSel = null; render(); return; }
    if (t.dataset.effrange) { S.effRange = Number(t.dataset.effrange); S.effSel = null; render(); return; }
    if (t.dataset.effpt != null) { const i = Number(t.dataset.effpt);
      S.effSel = S.effSel === i ? null : i; render(); return; }
    if (t.dataset.pmcrange) { S.pmcRange = Number(t.dataset.pmcrange); S.pmcSel = null; render(); return; }
    if (t.dataset.pmcday) { S.pmcSel = S.pmcSel === t.dataset.pmcday ? null : t.dataset.pmcday; render(); return; }
    if (t.dataset.swimhr != null) {
      const next = { ...S.cfg, swimHrValid: !S.cfg.swimHrValid };
      const r = S.store.saveCfg(next);
      if (!r.ok) { S.syncMsg = { text: r.error, bad: true }; render(); return; }
      S.cfg = next;
      S.syncMsg = { text: next.swimHrValid
        ? "Pulsremsan på simpass är på. Zonpariteten granskar nu även simmens pulszoner i intervals.icu."
        : "Pulsremsan på simpass är av. Simpass visar tempo och distans." };
      refreshData(); render(); return;
    }
    if (t.dataset.clearcache != null) {
      const r = S.store.clearCache();
      S.cache = emptyCache();
      S.syncMsg = { text: r.ok ? "Datacachen rensad. Hämta om för att fylla den igen."
                                : r.error, bad: !r.ok };
      refreshData(); render(); return;
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
    if (t.dataset.nav) { S.view = t.dataset.nav; S.sel = null; S.tapMove = null; S.selDay = null; S.logOpen = null; S.adjOpen = null; S.histOpen = null; render();
      window.scrollTo?.(0, 0);                             /* ny vy börjar överst (0.18.2) */
      return; }
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
    if (t.dataset.pastopen != null) { S.pastOpen = !S.pastOpen; render(); return; }
    if (t.dataset.briefopen != null) { S.briefOpen = !S.briefOpen; render(); return; }
    if (t.dataset.order != null) {        /* B6: komponeras här, skrivs aldrig till lagring */
      const json = JSON.stringify(orderExport({ cfg: S.cfg, plan: S.plan,
                                                athlete: S.athlete, now: now() }), null, 2);
      (navigator.clipboard?.writeText(json) ?? Promise.reject())
        .then(() => { S.note = { text: `Beställningsexport i urklipp (${(json.length/1024).toFixed(1)} kB). Klistra in i coachdialogen tillsammans med PLANLEVERANS.` }; render(); })
        .catch(() => { S.note = { text: "Urklipp nekades — exporten kunde inte kopieras.", bad: true }; render(); });
      return;
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
      if (act === "move") { S.tapMove = findSess(id); S.sel = null;
        if (S.view === "plan") S.view = "omplanera"; }     /* U3: dagmålen bor i Omplanera */
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

    /* Utfall (fas B): egen cache först, v32 read-only bara när egen är tom */
    { const lc = S.store.loadCache();
      S.cache = lc.cache;
      if (lc.error) row("datacache", lc.error, "bad");
      refreshData();
      const nRpe = S.acts.filter(a => a.icu_rpe != null || a.perceived_exertion != null).length;
      row("aktiviteter", `${S.src.why} · RPE i ${nRpe} av dem`,
          S.src.source === "next" ? "ok" : S.src.source === "v32" ? "" : "bad");
      row("zonparitet", S.zpar.why, S.zpar.ok ? "ok" : "bad");
      const rc = S.recov;
      row("wellness", (S.cache.wellness ?? []).length
            ? `${S.cache.wellness.length} dagar · ${rc?.has ? "baslinjer klara" : "för tunt underlag för baslinjer"}`
            : "ingen wellnessdata — anslut i Inställningar",
          (S.cache.wellness ?? []).length ? "ok" : "");
    }
  }

  row("haptik", hapticRow(), hapticLog.api ? "" : "bad");
  if (!S.plan) { S.view = "installningar"; render(); return; }   /* felläget landar där pariteten bor */
  wire();
  wireCurtain(app());
  wireMonthSwipe(app());
  render();
  document.getElementById("wk-" + S.week)?.scrollIntoView();
  /* Auto-hämtning efter första ritningen: appen är användbar direkt ur cachen,
     nätet får ta den tid det tar. Cooldown i syncNow (15 min). */
  if (connReady(S.cfg.conn).ready) syncNow({ auto: true });
}
boot();
