/* TRIZONE Next — core.js
   Ren logik. Ingen DOM, inga sidoeffekter. Allt här är testbart i Node.
   Regelverk v0.2 · Planformat v0.3 · Designspråk v0.1 · Matchning v0.2 */
"use strict";

export const BUILD = "next-0.2.1 · 2026-08-02";
export const FORMAT_VERSION = 1;

/* ---------- Konstanter (spec-ärvda) ---------- */
export const WINDOWS = ["Morgon", "Lunch", "Kväll"];
export const SLOTORD = { Morgon: 0, Lunch: 1, "Kväll": 2 };
export const SPORTS = ["swim", "bike", "run", "strength"];
export const PRIOS = ["A", "B", "C"];
export const WEEKTYPES = ["normal", "recovery", "test", "race"];

/* Matchning §3: grenmappning intervals.icu-typ → gren */
export const SPORT_MAP = {
  Run: "run", VirtualRun: "run", TrailRun: "run", Treadmill: "run",
  Ride: "bike", VirtualRide: "bike", GravelRide: "bike", MountainBikeRide: "bike",
  Swim: "swim", OpenWaterSwim: "swim",
  WeightTraining: "strength", Workout: "strength"
};

/* Matchning §4: vikter och trösklar (M-T: startvärden, kalibreras mot historik) */
export const MATCH_W = { date: 40, sport: 30, duration: 15, window: 10, title: 5 };
export const MATCH_T = { auto: 70, ask: 45, tie: 2 };

/* ---------- Zonaggregatet (M2: en funktion, alla remsor) ---------- */
/* zoneDist: [[zon,min],...] ELLER [minZ1..minZ5] → [minZ1..minZ5] */
export function zoneDist(src) {
  const d = [0, 0, 0, 0, 0];
  if (!Array.isArray(src)) return d;
  if (src.length === 5 && src.every(v => typeof v === "number")) return src.slice();
  for (const seg of src) {
    if (!Array.isArray(seg) || seg.length !== 2) continue;
    const [z, m] = seg;
    if (z >= 1 && z <= 5 && m > 0) d[z - 1] += m;
  }
  return d;
}

/* ---------- Fönstermappning (matchning §5; gränser är profildata) ---------- */
export function windowOf(startLocal, cfg = {}) {
  const morgonEnd = cfg.morgonEnd ?? "10:30";
  const lunchEnd = cfg.lunchEnd ?? "14:30";
  const hm = String(startLocal).slice(11, 16); // "YYYY-MM-DDTHH:MM..."
  if (!/^\d\d:\d\d$/.test(hm)) return null;
  if (hm < morgonEnd) return "Morgon";
  if (hm < lunchEnd) return "Lunch";
  return "Kväll";
}

/* Datumkomponent med midnattsregel (matchning §8): starttid − 3 h */
export function matchDate(startLocal) {
  const t = new Date(String(startLocal));
  if (isNaN(t)) return null;
  t.setHours(t.getHours() - 3);
  return t.toISOString().slice(0, 10);
}

/* ---------- Effektivt pass (källa + överlagring; F1, §5d) ---------- */
export function effectiveSession(src, ov) {
  const s = { ...src };
  if (!ov) return s;
  if (ov.moved) { s.week = ov.moved.week ?? s.week; s.day = ov.moved.day ?? s.day; s.slot = ov.moved.slot ?? s.slot; }
  if (ov.placed) { s.week = ov.placed.week ?? s.week; s.day = ov.placed.day ?? s.day; s.slot = ov.placed.slot ?? s.slot; }
  if (ov.adjust) {
    if (ov.adjust.durationMin) s.durationMin = ov.adjust.durationMin;
    if (ov.adjust.sport) s.sport = ov.adjust.sport;            /* substitute */
    if (ov.adjust.profile) s.profile = ov.adjust.profile;      /* downgrade  */
  }
  if (ov.status) s.status = ov.status;
  return s;
}

/* ---------- Planvalidering (planformat §8: fela mot rotorsak) ---------- */
export function validatePlan(plan) {
  const errors = [];
  const E = (path, msg) => errors.push({ path, msg });

  if (!plan || typeof plan !== "object") { E("$", "planen är inte ett objekt"); return { ok: false, errors }; }
  if (plan.formatVersion !== FORMAT_VERSION) E("formatVersion", `okänd formatversion: ${plan.formatVersion} (stödd: ${FORMAT_VERSION})`);
  if (!plan.planVersion || !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(plan.planVersion)) E("planVersion", `saknas eller fel form (väntat "ÅÅÅÅ-MM-DD.n"): ${plan.planVersion}`);

  const blocks = plan.blocks ?? [];
  if (!blocks.length) E("blocks", "planen saknar block");
  const blockIds = new Set();
  blocks.forEach((b, i) => {
    const p = `blocks[${i}]`;
    if (!b.id) E(p, "block saknar id");
    else if (blockIds.has(b.id)) E(p, `dubblerat block-id: ${b.id}`); else blockIds.add(b.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.start ?? "")) E(p, `ogiltigt startdatum: ${b.start}`);
    if (!(b.weeks > 0)) E(p, `ogiltigt veckoantal: ${b.weeks}`);
  });

  const weeks = plan.weeks ?? [];
  const weekNos = new Set();
  weeks.forEach((w, i) => {
    const p = `weeks[${i}] (v.${w.week})`;
    if (!Number.isInteger(w.week)) E(p, `ogiltigt veckonummer: ${w.week}`);
    else if (weekNos.has(w.week)) E(p, `dubblerad vecka: ${w.week}`); else weekNos.add(w.week);
    if (!blockIds.has(w.block)) E(p, `refererar okänt block: "${w.block}"`);
    if (!WEEKTYPES.includes(w.type)) E(p, `okänd veckotyp: "${w.type}" (giltiga: ${WEEKTYPES.join("/")})`);
  });

  const sessions = plan.sessions ?? [];
  if (!sessions.length) E("sessions", "planen saknar pass");
  const ids = new Set();
  sessions.forEach((s, i) => {
    const p = `sessions[${i}] "${s.id ?? "?"}"`;
    if (!s.id) E(p, "pass saknar id");
    else if (ids.has(s.id)) E(p, `dubblerat pass-id: ${s.id}`); else ids.add(s.id);
    if (!weekNos.has(s.week)) E(p, `ligger i vecka ${s.week} som inte finns i planen`);
    if (!SPORTS.includes(s.sport)) E(p, `okänd gren: "${s.sport}"`);
    if (!PRIOS.includes(s.prio)) E(p, `okänd prio: "${s.prio}" (giltiga: A/B/C)`);
    if (s.slot != null && !WINDOWS.includes(s.slot)) E(p, `okänt tidsfönster: "${s.slot}" (giltiga: ${WINDOWS.join("/")} eller uteslutet)`);
    if (s.day != null && !(Number.isInteger(s.day) && s.day >= 0 && s.day <= 6)) E(p, `ogiltig dag: ${s.day} (0=mån … 6=sön)`);
    if (!(s.durationMin > 0)) E(p, `ogiltig duration: ${s.durationMin}`);
    if (!Array.isArray(s.profile) || !s.profile.length) E(p, "zonprofil saknas");
    else {
      for (const seg of s.profile) {
        if (!Array.isArray(seg) || seg.length !== 2 || !(seg[0] >= 1 && seg[0] <= 5) || !(seg[1] > 0)) {
          E(p, `trasigt profilsegment: ${JSON.stringify(seg)} (väntat [zon 1–5, minuter > 0])`); break;
        }
      }
      const sum = zoneDist(s.profile).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - s.durationMin) > 2)
        E(p, `zonprofilens summa ${sum} min ≠ duration ${s.durationMin} min (tolerans ±2)`);
    }
    if (typeof s.protected !== "undefined" && typeof s.protected !== "boolean") E(p, `protected måste vara bool: ${s.protected}`);
  });

  return { ok: errors.length === 0, errors };
}

/* ---------- Rimlighetsvakt för aktiviteter (matchning §9, DIST_OK-arvet) ---------- */
const DIST_OK = { run: [0.5, 60], bike: [1, 300], swim: [0.1, 10], strength: [0, 0] };
export function activitySane(a) {
  const sport = SPORT_MAP[a.type];
  if (!sport) return { ok: false, why: `okänd aktivitetstyp: "${a.type}"` };
  if (!(a.moving_time > 0)) return { ok: false, why: `ogiltig tid: ${a.moving_time}` };
  const km = (a.distance ?? 0) / 1000;
  const [lo, hi] = DIST_OK[sport];
  if (sport !== "strength" && km > 0 && (km < lo || km > hi))
    return { ok: false, why: `${km.toFixed(1)} km ${sport} utanför rimlighet [${lo}–${hi}] — kontrollera källan` };
  return { ok: true, sport };
}

/* ---------- Poängmodellen (matchning §4) ---------- */
const TITLE_KW = ["intervall", "tröskel", "test", "lugn", "lång", "teknik", "css", "ftp", "brick"];
export function matchScore(sess, act, cfg = {}) {
  const sane = activitySane(act);
  if (!sane.ok) return 0;
  if (sane.sport !== sess.sport) return 0;                       /* hård grengrind */
  let score = MATCH_W.sport;

  const ad = matchDate(act.start_date_local);
  const sd = cfg.dateOfSession ? cfg.dateOfSession(sess) : sess.date; /* "YYYY-MM-DD" */
  if (ad && sd) {
    const diff = Math.abs((new Date(ad) - new Date(sd)) / 86400000);
    score += diff === 0 ? MATCH_W.date : diff <= 1 ? MATCH_W.date / 2 : 0;
    if (diff > 1) return 0;                                      /* kandidatfönster ±1 dag */
  }

  const actMin = act.moving_time / 60;
  const rel = Math.abs(actMin - sess.durationMin) / (0.35 * sess.durationMin);
  score += MATCH_W.duration * Math.max(0, 1 - rel);

  const aw = windowOf(act.start_date_local, cfg.windows);
  if (!sess.slot) score += MATCH_W.window / 2;                   /* oplacerat menypass */
  else if (aw === sess.slot) score += MATCH_W.window;
  else if (aw && Math.abs(SLOTORD[aw] - SLOTORD[sess.slot]) === 1) score += MATCH_W.window / 2;

  const name = String(act.name ?? "").toLowerCase();
  const title = String(sess.title ?? "").toLowerCase();
  const hits = TITLE_KW.filter(k => name.includes(k) && title.includes(k)).length;
  score += Math.min(MATCH_W.title, hits * 2.5);

  return Math.round(score * 10) / 10;
}

/* ---------- Dubblettdetektion (matchning §8: klocka + telefon) ---------- */
export function detectDuplicates(acts) {
  const dups = [];
  for (let i = 0; i < acts.length; i++) for (let j = i + 1; j < acts.length; j++) {
    const a = acts[i], b = acts[j];
    if (SPORT_MAP[a.type] !== SPORT_MAP[b.type]) continue;
    const dt = Math.abs(new Date(a.start_date_local) - new Date(b.start_date_local)) / 60000;
    const dd = Math.abs(a.moving_time - b.moving_time) / Math.max(a.moving_time, b.moving_time);
    if (dt < 10 && dd < 0.15) {
      const rich = (x) => (x.has_device_watts ? 2 : 0) + (x.average_heartrate || x.icu_average_hr ? 1 : 0);
      dups.push({ primary: rich(a) >= rich(b) ? a.id : b.id, secondary: rich(a) >= rich(b) ? b.id : a.id });
    }
  }
  return dups;
}

/* ---------- Tilldelning: 1:1, girigt, trösklar, frågor (matchning §4, §6) ---------- */
export function assignMatches(sessions, activities, cfg = {}) {
  const links = [], questions = [], unplanned = [];
  const secondaries = new Set(detectDuplicates(activities).map(d => d.secondary));
  const cand = [];
  const matchable = sessions.filter(s => s.status !== "struck");  /* M3 */

  for (const a of activities) {
    if (secondaries.has(a.id)) continue;
    for (const s of matchable) {
      const sc = matchScore(s, a, cfg);
      if (sc > 0) cand.push({ s: s.id, a: a.id, sc });
    }
  }
  cand.sort((x, y) => y.sc - x.sc);
  const usedS = new Set(), usedA = new Set();

  for (const c of cand) {
    if (usedS.has(c.s) || usedA.has(c.a)) continue;
    const rival = cand.find(o => o !== c && o.a === c.a && !usedS.has(o.s) && Math.abs(o.sc - c.sc) <= MATCH_T.tie);
    if (c.sc >= MATCH_T.auto && !rival) {
      links.push({ sessionId: c.s, activityId: c.a, score: c.sc });
      usedS.add(c.s); usedA.add(c.a);
    } else if (c.sc >= MATCH_T.ask) {
      questions.push({ sessionId: c.s, activityId: c.a, score: c.sc, why: rival ? "två pass med likvärdig poäng" : "poäng i frågezonen" });
      usedS.add(c.s); usedA.add(c.a);                            /* reserveras tills svar */
    }
  }
  for (const a of activities) {
    if (secondaries.has(a.id)) continue;
    if (!usedA.has(a.id) && !questions.some(q => q.activityId === a.id)) unplanned.push(a.id);
  }
  return { links, questions, unplanned, duplicates: detectDuplicates(activities) };
}

/* ================================================================
   REGELMOTORN (regelverk v0.2 §3–§10 · planformat §5, §5d)
   Ren funktion. Derived triggers och utfallsflaggor beräknas
   UPPSTRÖMS och kommer in som `flags` — motorn beräknar ingen
   fysiologi, den reagerar (precisering K5).
   ================================================================ */

/* Motorkonstanter — preciseringar K1–K3 (beslutslogg 2026-08-01) */
export const ENGINE = {
  qualityHardMin: 8,      /* K1: Z4+Z5 ≥ 8 min ⇒ kvalitet (v26-arvet, 480 s) */
  qualityHardShare: 0.12, /* K1: eller ≥ 12 % av durationen                    */
  maintFactor: 0.6,       /* K2: underhållsdos = 60 % av planerad duration     */
  shortenFloorMin: 20,    /* K2/K3: shorten går aldrig under 20 min            */
  protectedFloor: 0.5,    /* K3: kärndel för skyddade pass = 50 % av duration  */
  comebackCount: 2,       /* D5: profildefault, överstyrs i bindings           */
  slotHour: { Morgon: 7, Lunch: 12, "Kväll": 18 }  /* nominella klockslag för 24h-matte */
};

export const DAYNAMES = ["mån", "tis", "ons", "tors", "fre", "lör", "sön"];

/* Restriktivitetsordning för D4 (mest restriktiv vinner vid lika nivå) */
export const ACTION_RANK = { strike: 5, substitute: 4, downgrade: 3, shorten: 2, move: 1, warn: 0 };

/* K1 — kvalitetspass: Z4+Z5 ≥ 8 min eller ≥ 12 % av durationen */
export function isQuality(s) {
  const d = zoneDist(s.profile);
  const hard = d[3] + d[4];
  return hard >= ENGINE.qualityHardMin ||
         (s.durationMin > 0 && hard / s.durationMin >= ENGINE.qualityHardShare);
}

/* Zonprofil skalas proportionellt (shorten: profilen behålls, kortas) */
export function scaleProfile(profile, factor) {
  if (!Array.isArray(profile)) return profile;
  return profile.map(([z, m]) => [z, Math.max(1, Math.round(m * factor))]);
}

/* Downgrade: kvalitet → Z2. Zoner ≥ 3 sänks till 2, Z1 orörd, duration behålls. */
export function downgradeProfile(profile) {
  if (!Array.isArray(profile)) return profile;
  return profile.map(([z, m]) => [z >= 3 ? 2 : z, m]);
}

/* ---------- Datumgeometri (ISO-vecka → datum; behövs för dag/24h-matte) ---------- */
function isoWeekMonday(iso) {                        /* "2026-W42" → UTC-måndag */
  const m = /^(\d{4})-W(\d{2})$/.exec(String(iso));
  if (!m) return null;
  const [y, w] = [Number(m[1]), Number(m[2])];
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon1 = new Date(jan4); mon1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  mon1.setUTCDate(mon1.getUTCDate() + (w - 1) * 7);
  return mon1;
}
export function sessionDate(plan, s) {               /* → "YYYY-MM-DD" eller null (oplacerat) */
  const wk = (plan.weeks ?? []).find(w => w.week === s.week);
  if (!wk || s.day == null) return null;
  const d = isoWeekMonday(wk.iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + s.day);
  return d.toISOString().slice(0, 10);
}
function weekSpan(plan, weekNo) {                    /* → [måndag, söndag] eller null */
  const wk = (plan.weeks ?? []).find(w => w.week === weekNo);
  const d = wk && isoWeekMonday(wk.iso);
  if (!d) return null;
  const end = new Date(d); end.setUTCDate(d.getUTCDate() + 6);
  return [d.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}
function sessionInSpan(plan, s, from, to) {          /* oplacerat pass: veckan överlappar spannet */
  const d = sessionDate(plan, s);
  if (d) return d >= from && d <= to;
  const ws = weekSpan(plan, s.week);
  return !!ws && ws[0] <= to && ws[1] >= from;
}
function slotClock(plan, s) {                        /* nominell absoluttid i timmar, eller null */
  const d = sessionDate(plan, s);
  if (!d || !s.slot) return null;
  return Date.parse(d + "T00:00:00Z") / 3600000 + ENGINE.slotHour[s.slot];
}
export function hoursBetween(plan, a, b) {
  const ha = slotClock(plan, a), hb = slotClock(plan, b);
  return ha == null || hb == null ? null : Math.abs(ha - hb);
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- applyRules — motorns enda ingång ----------
   (plan, overlay, bindings, flags, now) → { actions, questions, log }
   Muterar ingenting. Nivåordning genom pipeline: nivå 1 transformerar
   arbetskopian, nivå 2 arbetar på resultatet ("strukturregeln tillämpas
   därefter på ersättningspasset" — spec 1 §3), nivå 3 endast warn. */
export function applyRules(plan, overlay, bindings = {}, flags = [], now = "") {
  const cfg = { ...ENGINE, ...(bindings.engine ?? {}) };
  const nowDate = String(now).slice(0, 10);
  const ov = overlay ?? {};
  const actions = [], questions = [];

  /* Arbetskopia: källa + overlay, transformeras progressivt */
  const work = {};
  for (const s of plan.sessions ?? []) work[s.id] = effectiveSession(s, ov.sessions?.[s.id]);
  const list = () => Object.values(work);
  const dateOf = id => sessionDate(plan, work[id]);

  /* H4: samma regel max 1 gång per pass och dygn — läser overlayens events */
  const firedToday = (rule, id) =>
    (ov.sessions?.[id]?.events ?? []).some(e => e.rule === rule && String(e.t).slice(0, 10) === nowDate);

  const push = (rule, level, id, action, why, payload = {}, orig = {}, extra = {}) => {
    if (id && firedToday(rule, id)) return false;
    actions.push({ rule, level, session: id, action, why, payload, orig, t: now, ...extra });
    return true;
  };

  const shortenTo = (s, factor, rule, level, why, extra) => {
    const floor = Math.max(cfg.shortenFloorMin,
                           s.protected ? Math.ceil(s.durationMin * cfg.protectedFloor) : 0);
    const nd = Math.max(floor, Math.round(s.durationMin * factor / 5) * 5);
    if (nd >= s.durationMin) return;
    const np = scaleProfile(s.profile, nd / s.durationMin);
    if (push(rule, level, s.id, "shorten", why,
             { durationMin: nd, profile: np },
             { durationMin: s.durationMin, profile: s.profile }, extra)) {
      s.durationMin = nd; s.profile = np;
    }
  };

  const modes = ov.modes?.active ?? [];
  const modeKey = m => m.rule + "@" + m.from;

  /* ---------- NIVÅ 1 — säkerhet ---------- */

  /* illness-stop: allt i spannet stryks, även protected och C — feber tränas aldrig igenom */
  for (const m of modes.filter(m => m.rule === "illness-stop")) {
    for (const s of list()) {
      if (s.status === "struck" || !sessionInSpan(plan, s, m.from, m.to)) continue;
      if (push("illness-stop", 1, s.id, "strike",
               "Sjukdomsstopp: allt i spannet stryks. Feber tränas aldrig igenom.",
               {}, { status: s.status ?? "planned" },
               { modeKey: modeKey(m), comebackAfter: m.to })) s.status = "struck";
    }
  }

  /* tissue-freeze: bunden gren ersätts — gäller även C (säkerhet ser ingen luft) */
  for (const m of modes.filter(m => m.rule === "tissue-freeze")) {
    const b = (bindings.rules ?? []).find(r => r.rule === "tissue-freeze") ?? {};
    const sports = m.sport ? [].concat(m.sport) : (b.sport ?? []);
    const sub = b.substitute ?? {};
    for (const s of list()) {
      if (s.status === "struck" || !sports.includes(s.sport)) continue;
      if (!sessionInSpan(plan, s, m.from, m.to)) continue;
      const target = isQuality(s) ? sub.quality : sub.easy;
      if (!target || target === s.sport) continue;
      if (push("tissue-freeze", 1, s.id, "substitute",
               `Frys på ${s.sport}: passet växlas till ${target}, stimulansen behålls.`,
               { sport: target }, { sport: s.sport }, { modeKey: modeKey(m) })) s.sport = target;
    }
  }

  /* sleep-guard — D2: derived frågar, manual agerar */
  for (const f of flags.filter(f => f.id === "sleep-guard")) {
    const day = f.date ?? nowDate;
    const targets = list().filter(s => s.status !== "struck" && isQuality(s) && dateOf(s.id) === day);
    if (!targets.length) continue;
    if (f.source === "derived") {
      questions.push({ rule: "sleep-guard", sessions: targets.map(s => s.id),
        ask: "Vilopulsen ligger högt över baslinjen — sov du dåligt? Dagens kvalitetspass föreslås växlas ned till Z2." });
      continue;
    }
    for (const s of targets) {
      const np = downgradeProfile(s.profile);
      if (sameJson(np, s.profile)) continue;
      if (push("sleep-guard", 1, s.id, "downgrade",
               "Dålig natt: dagens kvalitet växlas ned till Z2. Aldrig hård löpning efter dålig natt.",
               { profile: np }, { profile: s.profile })) s.profile = np;
    }
  }

  /* illness-rampback — D5: grind, inte räknare. Kvalitet hålls Z2 tills bekräftat. */
  const cb = ov.modes?.comeback;
  if (cb && !cb.passed) {
    for (const s of list()) {
      if (s.status === "struck" || !isQuality(s)) continue;
      const d = dateOf(s.id);
      if (!d || !(d > cb.after)) continue;
      const np = downgradeProfile(s.profile);
      if (sameJson(np, s.profile)) continue;
      if (push("illness-rampback", 1, s.id, "downgrade",
               "Comeback: kvalitet hålls på Z2 tills grinden bekräftats.",
               { profile: np }, { profile: s.profile })) s.profile = np;
    }
    if ((cb.z2done ?? 0) >= (cb.need ?? cfg.comebackCount)) {
      questions.push({ rule: "illness-rampback",
        ask: `${cb.need ?? cfg.comebackCount} Z2-pass i normal känsla — återuppta kvalitet?` });
    }
  }

  /* ---------- NIVÅ 2 — struktur ---------- */

  /* mode-vacation: B stryks (ej protected), A till underhållsdos. C är luft. */
  for (const m of modes.filter(m => m.rule === "mode-vacation")) {
    for (const s of list()) {
      if (s.status === "struck" || s.prio === "C" || !sessionInSpan(plan, s, m.from, m.to)) continue;
      if (s.prio === "B" && !s.protected) {
        if (push("mode-vacation", 2, s.id, "strike",
                 "Semester: B-pass stryks och jagas inte ikapp.",
                 {}, { status: s.status ?? "planned" }, { modeKey: modeKey(m) })) s.status = "struck";
      } else if (s.prio === "A") {
        shortenTo(s, cfg.maintFactor, "mode-vacation", 2,
                  "Semester: A-pass hålls på underhållsdos.", { modeKey: modeKey(m) });
      }
    }
  }

  /* mode-reduced: veckan komprimeras till A. B stryks (ej protected), C är luft. */
  for (const m of modes.filter(m => m.rule === "mode-reduced")) {
    for (const s of list()) {
      if (s.status === "struck" || s.prio !== "B" || s.protected) continue;
      if (!sessionInSpan(plan, s, m.from, m.to)) continue;
      if (push("mode-reduced", 2, s.id, "strike",
               "Reducerad vecka: komprimeras till A-passen. B stryks.",
               {}, { status: s.status ?? "planned" }, { modeKey: modeKey(m) })) s.status = "struck";
    }
  }

  /* missed-A / missed-B — trigger manual (spec 1 §6) */
  const occupied = (week, day, slot, exceptId) =>
    list().some(x => x.id !== exceptId && x.status !== "struck" &&
                     x.week === week && x.day === day && x.slot === slot);

  const findMoveTarget = (s) => {
    const sched = bindings.schedule ?? {};
    const cands = [];
    for (let day = (s.day ?? -1) + 1; day <= 6; day++)
      for (const slot of (sched[day] ?? []))
        if (!occupied(s.week, day, slot, s.id) && !(day === s.day && slot === s.slot))
          cands.push({ week: s.week, day, slot });
    /* D3-grinden: kvalitetspass måste hamna ≥ 1 dygn (24 h) från närmaste andra kvalitetspass */
    const gate = (c) => {
      if (!isQuality(s)) return true;
      const probe = { ...s, ...c };
      return list().every(x => {
        if (x.id === s.id || x.status === "struck" || !isQuality(x)) return true;
        const h = hoursBetween(plan, probe, x);
        return h == null || h >= 24;
      });
    };
    for (const c of cands) if (gate(c)) return { target: c };
    /* fallback: ta ett B-pass slot (ej protected) — B:t stryks */
    for (const b of list()) {
      if (b.prio !== "B" || b.protected || b.status === "struck" || b.week !== s.week ||
          b.day == null || !b.slot) continue;
      if (gate({ week: b.week, day: b.day, slot: b.slot }))
        return { target: { week: b.week, day: b.day, slot: b.slot }, takeB: b.id };
    }
    return null;
  };

  for (const f of flags.filter(f => f.id === "missed" && f.sessionId)) {
    const s = work[f.sessionId];
    if (!s || s.status === "struck" || s.prio === "C") continue;   /* C: luft, flaggas aldrig */
    if (s.prio === "B") {
      if (s.protected) {
        push("missed-B", 2, s.id, "warn",
             "Skyddspasset stryks aldrig av missed-B — planera om det manuellt.", {}, {});
      } else if (push("missed-B", 2, s.id, "strike",
                      "Missat B-pass stryks. B jagas aldrig ikapp.",
                      {}, { status: s.status ?? "planned" })) s.status = "struck";
      continue;
    }
    /* missed-A: move → (B-slot) → strike, med D3/H2/H3 */
    const found = findMoveTarget(s);
    if (found) {
      if (found.takeB) {
        const b = work[found.takeB];
        if (push("missed-A", 2, b.id, "strike",
                 "A-passet tar B-passets slot. B jagas inte ikapp.",
                 {}, { status: b.status ?? "planned" })) b.status = "struck";
      }
      if (push("missed-A", 2, s.id, "move",
               `Missat A-pass flyttas till ${DAYNAMES[found.target.day]} ${found.target.slot}.`,
               found.target, { week: s.week, day: s.day, slot: s.slot })) Object.assign(s, found.target);
    } else if (push("missed-A", 2, s.id, "strike",
                    "Ingen ledig slot utan kvalitetskonflikt (H2/D3) — passet stryks i stället för att flyttas.",
                    {}, { status: s.status ?? "planned" })) s.status = "struck";
  }

  /* volume-cap: derived frågar (D2), manual/bekräftad ⇒ warn + shorten */
  for (const f of flags.filter(f => f.id === "volume-cap" && f.sessionId)) {
    const s = work[f.sessionId];
    if (!s || s.status === "struck") continue;
    if (f.source === "derived") {
      questions.push({ rule: "volume-cap", sessions: [s.id],
        ask: "Löpvolymen ligger över taket (110 % av 3-veckorssnittet). Korta veckans sista pass?" });
      continue;
    }
    push("volume-cap", 2, s.id, "warn",
         "Löpvolym över taket — dosen kapas.", {}, {});
    shortenTo(s, f.factor ?? 0.8, "volume-cap", 2, "Volymtak: passet kortas.");
  }

  /* ---------- NIVÅ 3 — optimering (endast warn) ---------- */
  const lvl3 = [];
  const placed = list().filter(s => s.status !== "struck" && slotClock(plan, s) != null);

  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    const h = hoursBetween(plan, a, b);
    if (h == null || h > 24) continue;
    if (isQuality(a) && isQuality(b)) {
      lvl3.push({ rule: "quality-spacing", level: 3, session: (a.day <= b.day ? b : a).id, action: "warn",
        why: `Två kvalitetspass inom 24 h (${a.id} · ${b.id}). En dags mellanrum rekommenderas.`,
        payload: {}, orig: {}, t: now, pair: [a.id, b.id] });
    }
    const st = a.sport === "strength" ? a : b.sport === "strength" ? b : null;
    const q  = st === a ? b : a;
    if (st && st.sport === "strength" && isQuality(q)) {
      lvl3.push({ rule: "heavy-legs", level: 3, session: q.id, action: "warn",
        why: `Tunga ben: styrka (${st.id}) inom 24 h från kvalitet (${q.id}) — överväg ordningsbyte.`,
        payload: {}, orig: {}, t: now, pair: [st.id, q.id] });
    }
  }
  /* utfallsflaggor passerar som warn (beräknade uppströms) */
  for (const f of flags) {
    if (f.id === "polarization") lvl3.push({ rule: "polarization", level: 3, session: f.sessionId ?? null,
      action: "warn", why: `Veckan under 78 % lågintensivt — överväg att sänka ett pass.`, payload: {}, orig: {}, t: now, week: f.week });
    if (f.id === "rpe-watch") lvl3.push({ rule: "rpe-watch", level: 3, session: f.sessionId ?? null,
      action: "warn", why: "RPE ≥ 9 loggat — nästa kvalitetspass granskas mot återhämtning.", payload: {}, orig: {}, t: now });
    if (f.id === "duration-drift") lvl3.push({ rule: "duration-drift", level: 3, session: f.sessionId ?? null,
      action: "warn", why: "Utfall > 125 % av planerad duration — räknas mot veckovolymen.", payload: {}, orig: {}, t: now, week: f.week });
  }
  actions.push(...mergeEngineFlags(lvl3));

  const log = actions.map(a =>
    `[${a.rule}·n${a.level}] ${a.session ?? "vecka"} → ${a.action}: ${a.why}`);
  return { actions, questions, log };
}

/* Flaggmerge (spec 1 §10, precisering K6): bredare mönster äter smalare,
   överlevande nyckel behålls så loggspells inte bryts. */
export function mergeEngineFlags(warns) {
  const out = [...warns];
  const eat = (survivorRule, preyRule, samePair) => {
    for (const s of out.filter(w => w.rule === survivorRule)) {
      const prey = out.find(w => w.rule === preyRule &&
        (!samePair || (w.pair && s.pair && w.pair.some(id => s.pair.includes(id)))));
      if (prey) {
        s.why += " · " + prey.why;
        s.merged = [...(s.merged ?? []), preyRule];
        out.splice(out.indexOf(prey), 1);
      }
    }
  };
  eat("quality-spacing", "heavy-legs", true);   /* samma dygn/par */
  eat("polarization", "duration-drift", false); /* samma rot: för mycket, för hårt */
  return out;
}

/* ---------- applyActions — overlay-skrivning (planformat §5, P3, §9) ----------
   Ren funktion: (overlay, actions) → ny overlay. Kvotvakten ligger i
   lagringswrappern (UI-sessionen), inte här. Periodåtgärder (modeKey)
   tar ögonblicksbild per pass före första beröring. */
export function applyActions(overlay, actions) {
  const ov = structuredClone(overlay ?? {});
  ov.sessions ??= {}; ov.modes ??= {};
  for (const a of actions) {
    if (!(a.action in ACTION_RANK)) continue;   /* åtgärdslistan är uttömmande (spec 1 §4) */
    const ev = { rule: a.rule, session: a.session, action: a.action, why: a.why, t: a.t };
    if (a.session == null) { (ov.modes.log ??= []).push(ev); continue; }
    const so = ov.sessions[a.session] ??= {};
    if (a.modeKey && a.action !== "warn") {
      const sn = (ov.modes.snapshots ??= {})[a.modeKey] ??= {};
      if (!(a.session in sn)) {
        const { events, ...rest } = overlay?.sessions?.[a.session] ?? {};
        sn[a.session] = structuredClone(rest);
      }
    }
    switch (a.action) {
      case "strike":     so.status = "struck"; break;
      case "move":       so.moved = { week: a.payload.week, day: a.payload.day, slot: a.payload.slot }; break;
      case "substitute": so.adjust = { ...so.adjust, sport: a.payload.sport }; break;
      case "downgrade":  so.adjust = { ...so.adjust, profile: a.payload.profile }; break;
      case "shorten":    so.adjust = { ...so.adjust, durationMin: a.payload.durationMin, profile: a.payload.profile }; break;
      case "warn":       break;
    }
    (so.events ??= []).push(ev);
    if (a.rule === "illness-stop" && a.comebackAfter && !ov.modes.comeback) {
      ov.modes.comeback = { need: ENGINE.comebackCount, z2done: 0, passed: false, after: a.comebackAfter };
    }
  }
  return ov;
}

/* ---------- deactivateMode — exakt återställning (spec 1 §9) ----------
   Återställer ögonblicksbilden UTOM för pass användaren rört manuellt
   under lägets gång (events med rule "manual-*" efter lägets start).
   Ångring loggas som egen post; events skrivs aldrig om. */
export function deactivateMode(overlay, key, now = "") {
  const ov = structuredClone(overlay ?? {});
  ov.sessions ??= {}; ov.modes ??= {};
  const mode = (ov.modes.active ?? []).find(m => m.rule + "@" + m.from === key);
  const t0 = mode?.t ?? "";
  const sn = ov.modes.snapshots?.[key] ?? {};
  for (const [id, prior] of Object.entries(sn)) {
    const cur = ov.sessions[id] ?? {};
    const events = cur.events ?? [];
    const userWon = events.some(e => String(e.rule ?? "").startsWith("manual") && String(e.t) > String(t0));
    if (userWon) {
      events.push({ rule: "undo:" + key, session: id, action: "keep",
                    why: "Läge avaktiverat — användarens manuella version behålls.", t: now });
      ov.sessions[id] = { ...cur, events };
    } else {
      ov.sessions[id] = { ...structuredClone(prior ?? {}), events:
        [...events, { rule: "undo:" + key, session: id, action: "restore",
                      why: "Läge avaktiverat — föregående tillstånd återställt.", t: now }] };
    }
  }
  if (ov.modes.snapshots) delete ov.modes.snapshots[key];
  ov.modes.active = (ov.modes.active ?? []).filter(m => m.rule + "@" + m.from !== key);
  (ov.modes.log ??= []).push({ rule: "mode-off", session: null, action: "deactivate",
    why: `Läget ${key} avaktiverat.`, t: now });
  return ov;
}

/* ================================================================
   LAGRINGSLAGRET (planformat §4.4, §5, §7, §8 · F5)
   Injicerad storage-adapter ⇒ kvotvägen är testbar. Ingen DOM.
   Nycklar beslutade i planformat §7 — inga nya nycklar tillkommer.
   ================================================================ */

export const KEYS = { plan: "trizone.plan.v1", overlay: "trizone.overlay.v1" };

export const byteSize = s => new TextEncoder().encode(String(s ?? "")).length;
const kB = n => (n / 1024).toFixed(n < 10240 ? 1 : 0) + " kB";

/* F5 — trimmad projektion: vitlista, aldrig råa svar. Okända fält från
   coachgenererad plandata når aldrig lagringen. */
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o?.[k] !== undefined) r[k] = o[k]; return r; };
export function trimPlan(plan) {
  const p = pick(plan, ["formatVersion", "planVersion", "generated", "athlete", "anchor"]);
  p.blocks   = (plan.blocks   ?? []).map(b => pick(b, ["id", "label", "start", "weeks"]));
  p.weeks    = (plan.weeks    ?? []).map(w => pick(w, ["week", "iso", "block", "type", "focus"]));
  p.sessions = (plan.sessions ?? []).map(s => {
    const t = pick(s, ["id", "week", "day", "slot", "sport", "prio", "protected",
                       "title", "durationMin", "profile"]);
    if (s.text) t.text = pick(s.text, ["brief", "exec", "place", "goal"]);
    return t;
  });
  if (plan.changelog) p.changelog = plan.changelog.slice(-5);
  return p;
}

export const emptyOverlay = (planVersion = null) =>
  ({ planVersion, sessions: {}, placed: {}, patches: [], modes: {}, orphans: [], archive: {} });

/* §8 — overlayvalidering. Trasig data renderas aldrig, den förklaras. */
const STATUS = ["planned", "done", "struck"];
export function validateOverlay(ov, plan = null) {
  const errors = [];
  const bad = (where, why) => errors.push({ where, why });
  if (!ov || typeof ov !== "object") return { ok: false, errors: [{ where: "overlay", why: "inte ett objekt" }] };
  if (ov.sessions && typeof ov.sessions !== "object") bad("overlay.sessions", "inte ett objekt");
  const ids = plan ? new Set((plan.sessions ?? []).map(s => s.id)) : null;
  for (const [id, so] of Object.entries(ov.sessions ?? {})) {
    if (!so || typeof so !== "object") { bad(id, "posten är inte ett objekt"); continue; }
    if (so.status !== undefined && !STATUS.includes(so.status))
      bad(id, `okänd status "${so.status}" (väntat ${STATUS.join(" | ")})`);
    if (so.moved !== undefined && (so.moved === null || typeof so.moved !== "object" || so.moved.week == null))
      bad(id, "moved saknar week");
    if (so.events !== undefined && !Array.isArray(so.events)) bad(id, "events är inte en lista");
    for (const [i, e] of (Array.isArray(so.events) ? so.events : []).entries())
      if (!e || !e.rule || !e.action || !e.t) bad(`${id}.events[${i}]`, "post saknar rule/action/t");
    if (so.rpe !== undefined && !(Number(so.rpe) >= 1 && Number(so.rpe) <= 10)) bad(id, "rpe utanför 1–10");
  }
  if (ids) for (const id of Object.keys(ov.sessions ?? {}))
    if (!ids.has(id)) bad(id, "pass-id saknas i planen — hanteras som föräldralöst, aldrig raderat");
  return { ok: !errors.length, errors };
}

/* §5 + P3 — avstämning vid ny planVersion.
   Överlagringar vars pass finns kvar följer med. Övriga blir föräldralösa:
   de raderas ALDRIG, de listas för beslut. */
export function reconcileOverlay(ov, plan, now = "") {
  const out = structuredClone(ov ?? emptyOverlay());
  out.sessions ??= {}; out.placed ??= {}; out.orphans ??= []; out.archive ??= {};
  const ids = new Set((plan?.sessions ?? []).map(s => s.id));
  const fresh = [];
  for (const id of Object.keys(out.sessions))
    if (!ids.has(id)) {
      fresh.push({ id, data: out.sessions[id], placed: out.placed[id] ?? null,
                   fromVersion: out.planVersion ?? null, since: now, decision: null });
      delete out.sessions[id]; delete out.placed[id];
    }
  for (const id of Object.keys(out.placed)) if (!ids.has(id)) {
    fresh.push({ id, data: null, placed: out.placed[id], fromVersion: out.planVersion ?? null, since: now, decision: null });
    delete out.placed[id];
  }
  out.orphans = [...out.orphans, ...fresh];
  out.planVersion = plan?.planVersion ?? out.planVersion;
  return { overlay: out, orphans: fresh, changed: fresh.length > 0 || ov?.planVersion !== out.planVersion };
}

/* Ett beslut per post (P3). Radering är möjlig men aldrig tyst — den loggas. */
export function resolveOrphan(ov, id, decision, now = "") {
  const out = structuredClone(ov ?? emptyOverlay());
  out.orphans ??= []; out.archive ??= {}; out.modes ??= {};
  const i = out.orphans.findIndex(o => o.id === id);
  if (i < 0) return out;
  const [orph] = out.orphans.splice(i, 1);
  (out.modes.log ??= []).push({ rule: "orphan", session: id, action: decision,
    why: decision === "archive" ? "Föräldralös överlagring arkiverad."
                                : "Föräldralös överlagring raderad på användarens beslut.", t: now });
  if (decision === "archive") out.archive[id] = { ...orph, decision, t: now };
  return out;
}

/* ---------- makeStore — enda vägen till persistens ----------
   Kvotvakt på varje skrivning; felmeddelandet säger VAD som är fullt
   och VAD man kan göra (F5). Vid kvotfel behålls det gamla värdet orört. */
export function makeStore(storage) {
  let blocked = null;                     /* S2: trasig overlay spärrar skrivning tills beslut */

  const report = () => {
    const keys = [];
    for (let i = 0; i < (storage.length ?? 0); i++) {
      const k = storage.key(i);
      if (k?.startsWith("trizone.")) keys.push({ key: k, bytes: byteSize(storage.getItem(k)) });
    }
    keys.sort((a, b) => b.bytes - a.bytes);
    return { keys, total: keys.reduce((s, k) => s + k.bytes, 0) };
  };

  const quotaMessage = (key, bytes) => {
    const r = report();
    const top = r.keys.filter(k => k.key !== key).slice(0, 2)
      .map(k => `${k.key} ${kB(k.bytes)}`).join(", ");
    return `Lagringen är full — ${key} (${kB(bytes)}) kunde inte sparas och det gamla värdet står kvar. ` +
           `Störst just nu: ${top || "inget annat"}. Totalt ${kB(r.total)}. ` +
           `Rensa aktivitetscachen eller exportera säsongen i Profil.`;
  };

  const write = (key, value) => {
    const json = JSON.stringify(value);
    try { storage.setItem(key, json); return { ok: true, bytes: byteSize(json) }; }
    catch (e) {
      const quota = /quota|exceeded|NS_ERROR_DOM_QUOTA/i.test(String(e?.name) + String(e?.message));
      return { ok: false, bytes: byteSize(json),
               error: quota ? quotaMessage(key, byteSize(json)) : `Kunde inte spara ${key}: ${e?.message ?? e}` };
    }
  };

  const readJson = (key) => {
    const raw = storage.getItem(key);
    if (raw == null) return { missing: true };
    try { return { value: JSON.parse(raw) }; }
    catch (e) { return { error: `${key} går inte att läsa (${e.message}). Rådata bevarad — inget skrivs över.` }; }
  };

  return {
    KEYS, report,
    get blocked() { return blocked; },

    savePlan: (plan) => write(KEYS.plan, trimPlan(plan)),
    loadPlan: () => { const r = readJson(KEYS.plan); return r.value ?? null; },

    loadOverlay(plan) {
      const r = readJson(KEYS.overlay);
      if (r.error) { blocked = r.error; return { overlay: emptyOverlay(plan?.planVersion), errors: [r.error], blocked: true, dirty: false }; }
      if (r.missing) return { overlay: emptyOverlay(plan?.planVersion), errors: [], blocked: false, dirty: true, orphans: [] };
      const v = validateOverlay(r.value);            /* utan plan: formfel först, id-avvikelse via avstämning */
      if (!v.ok) { blocked = v.errors.map(e => `${e.where}: ${e.why}`).join(" · "); 
                   return { overlay: r.value, errors: v.errors, blocked: true, dirty: false }; }
      const rec = reconcileOverlay(r.value, plan, new Date().toISOString());
      blocked = null;
      return { overlay: rec.overlay, orphans: rec.orphans, errors: [], blocked: false, dirty: rec.changed };
    },

    saveOverlay(ov, { force = false } = {}) {
      if (blocked && !force) return { ok: false, error: "Skrivning spärrad: " + blocked };
      const v = validateOverlay(ov);
      if (!v.ok) return { ok: false, error: "Overlay avvisad (skrivs aldrig trasig): " +
                                            v.errors.map(e => `${e.where}: ${e.why}`).join(" · ") };
      const w = write(KEYS.overlay, ov);
      if (w.ok) blocked = null;
      return w;
    },

    unblock() { blocked = null; }
  };
}
