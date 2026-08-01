/* TRIZONE Next — core.js
   Ren logik. Ingen DOM, inga sidoeffekter. Allt här är testbart i Node.
   Regelverk v0.2 · Planformat v0.3 · Designspråk v0.1 · Matchning v0.2 */
"use strict";

export const BUILD = "next-0.1.1 · 2026-07-31";
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
