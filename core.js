/* TRIZONE Next — core.js
   Ren logik. Ingen DOM, inga sidoeffekter. Allt här är testbart i Node.
   Regelverk v0.2 · Planformat v0.3 · Designspråk v0.1 · Matchning v0.2 */
"use strict";

export const BUILD = "next-0.19.0 · 2026-08-11";
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
  if (ov.moved) { s.week = ov.moved.week ?? s.week; s.day = ov.moved.day ?? s.day;
    if ("slot" in ov.moved) s.slot = ov.moved.slot ?? undefined; }   /* null = förslaget nollställt (beslut A) */
  if (ov.placed) { s.week = ov.placed.week ?? s.week; s.day = ov.placed.day ?? s.day;
    if ("slot" in ov.placed) s.slot = ov.placed.slot ?? undefined; }
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
    /* Fasens polariseringsmål (beslut A, §3 v0.4): andel 0.5–0.95, valfritt —
       frånvaro betyder att profilens värde gäller. Speglar ENGINE_FIELDS 50–95 %. */
    if (b.lowShare != null && !(typeof b.lowShare === "number" && b.lowShare >= 0.5 && b.lowShare <= 0.95))
      E(p, `ogiltigt fasmål lowShare: ${JSON.stringify(b.lowShare)} (väntat andel 0.5–0.95, eller uteslutet)`);
    /* Fasbriefing (B1/B3): ~5 meningar, synlig hela fasen. Tak 1200 tecken. */
    if (b.text !== undefined) {
      if (typeof b.text !== "object" || b.text === null || Array.isArray(b.text))
        E(p, `text måste vara ett objekt: ${JSON.stringify(b.text)}`);
      else if (b.text.brief !== undefined) {
        if (typeof b.text.brief !== "string" || !b.text.brief.trim())
          E(p, "fasbriefing text.brief måste vara icke-tom text");
        else if (b.text.brief.length > 1200)
          E(p, `fasbriefing för lång: ${b.text.brief.length} tecken (tak 1200 — ~5 meningar, B3)`);
      }
    }
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
  lowShareTarget: 0.78,   /* polariseringsgräns — profildata, inte sanning     */
  volumeCapPct: 110,      /* löpvolymtak i % av 3-veckorssnitt (opt-in/gren)   */
  driftPct: 125,          /* duration-drift: utfall över denna andel av plan   */
  slotHour: { Morgon: 7, Lunch: 12, "Kväll": 18 }  /* nominella klockslag för 24h-matte */
};

export const DAYNAMES = ["mån", "tis", "ons", "tors", "fre", "lör", "sön"];

/* ---------- Fasens polariseringsmål (beslut A, planformat §3 v0.4) ----------
   blocks[].lowShare bär fasens 80/20-mål; profilen är fallback, ENGINE sist.
   Hierarkin är avsiktlig: fasvärdet är coachens leverans per block — oenighet
   är en planrevision, inte en inställning. Rena funktioner, en sanning. */
export function blockForWeek(plan, weekNo) {
  const w = (plan?.weeks ?? []).find(x => x.week === weekNo);
  if (!w) return null;
  return (plan.blocks ?? []).find(b => b.id === w.block) ?? null;
}
export function blockForDate(plan, iso) {
  for (const b of plan?.blocks ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.start ?? "") || !(b.weeks > 0)) continue;
    if (iso >= b.start && iso < dayShift(b.start, b.weeks * 7)) return b;
  }
  return null;
}
export function phaseLowShare(plan, ref = {}, cfg = {}) {
  const block = ref.week != null ? blockForWeek(plan, ref.week)
              : ref.date != null ? blockForDate(plan, ref.date) : null;
  if (block?.lowShare != null)
    return { target: block.lowShare, source: "block", label: block.label ?? block.id };
  return { target: cfg.lowShareTarget ?? ENGINE.lowShareTarget, source: "profil", label: null };
}

/* ---------- Byggposition (0.18, planhero) ----------
   Ren aritmetik på block.start + weeks. "% av bygget" = hela dagar avklarade
   FÖRE idag / blockens samlade dagar — dag 1 är 0 %, dagen efter sista 100 %.
   state: before | in | gap | after. Glapp mellan block ger gap: passerade
   block räknas, inget block/veckotal påstås. Aldrig krasch, aldrig gissning. */
export function buildPosition(plan, todayISO) {
  const blocks = (plan?.blocks ?? [])
    .filter(b => /^\d{4}-\d{2}-\d{2}$/.test(b.start ?? "") && b.weeks > 0)
    .slice().sort((a, b) => a.start.localeCompare(b.start));
  if (!blocks.length || !/^\d{4}-\d{2}-\d{2}$/.test(todayISO ?? "")) return null;
  const dayN = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
  const t = dayN(todayISO);
  const totalDays = blocks.reduce((n, b) => n + b.weeks * 7, 0);
  let elapsed = 0, acc = 0, cur = null, weekInBlock = null, buildWeek = null;
  const bands = blocks.map(b => {
    const s = dayN(b.start), e = s + b.weeks * 7;            /* e exklusiv */
    let state = "future";
    if (t >= e) { state = "past"; elapsed += b.weeks * 7; }
    else if (t >= s) {
      state = "cur"; cur = b;
      const into = t - s;
      elapsed += into;
      weekInBlock = Math.floor(into / 7) + 1;
      buildWeek = Math.floor((acc + into) / 7) + 1;
    }
    acc += b.weeks * 7;
    return { id: b.id, label: b.label ?? b.id, weeks: b.weeks, state };
  });
  const state = cur ? "in"
              : t < dayN(blocks[0].start) ? "before"
              : bands.every(x => x.state === "past") ? "after" : "gap";
  return {
    state, bands, totalWeeks: totalDays / 7,
    block: cur ? { id: cur.id, label: cur.label ?? cur.id, weeks: cur.weeks } : null,
    weekInBlock, buildWeek,
    pct: Math.round(elapsed / totalDays * 100),
    pinPct: Math.min(100, Math.max(0, elapsed / totalDays * 100))
  };
}

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
/* Läge utan slutdatum verkar från 'from' till IDAG — dag för dag så länge det
   är aktivt. Framtiden rörs först när den blir nutid. (0.9.0-lärdomen nr 2:
   OPEN_END-sentineln strök hela framtiden vid "Sjuk" — 21 pass på ett tryck.) */
function sessionInSpan(plan, s, from, to, nowDate) {
  const hi = to ?? nowDate ?? from;
  const d = sessionDate(plan, s);
  if (d) return d >= from && d <= hi;
  const ws = weekSpan(plan, s.week);                 /* oplacerat: veckan överlappar spannet */
  return !!ws && ws[0] <= hi && ws[1] >= from;
}
function slotClock(plan, s) {                        /* nominell absoluttid i timmar, eller null */
  const d = sessionDate(plan, s);
  if (!d) return null;
  return Date.parse(d + "T00:00:00Z") / 3600000 + (s.slot ? ENGINE.slotHour[s.slot] : 12);
}                                                      /* fönsterlöst pass räknas mitt på dagen (beslut A) */
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
    /* H4 vaktar automatiska triggers. Användarstyrda lägen (modeKey) är redan
       bekräftade — spärra dem inte, annars dör ett omaktiverat läge samma dygn
       (0.9.0-buggen: på/av/på ⇒ tyst dött läge). */
    if (id && !extra.modeKey && firedToday(rule, id)) return false;
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
      if (s.status === "struck" || !sessionInSpan(plan, s, m.from, m.to, nowDate)) continue;
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
      if (!sessionInSpan(plan, s, m.from, m.to, nowDate)) continue;
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
    const targets = list().filter(s => (s.status ?? "planned") === "planned"
                                       && isQuality(s) && dateOf(s.id) === day);
    if (!targets.length) continue;
    if (f.source === "derived") {
      questions.push({ rule: "sleep-guard", sessions: targets.map(s => s.id),
        ask: (f.why ? f.why + ". " : "Vilopulsen ligger högt över baslinjen. ") +
             "Sov du dåligt? Dagens kvalitetspass föreslås växlas ned till Z2." });
      continue;
    }
    for (const s of targets) {
      const np = downgradeProfile(s.profile);
      if (sameJson(np, s.profile)) continue;
      if (push("sleep-guard", 1, s.id, "downgrade",
               "Dålig natt: dagens kvalitet växlas ned till Z2. Aldrig hård löpning efter dålig natt.",
               { profile: np }, { profile: s.profile },
               f.modeKey ? { modeKey: f.modeKey } : {})) s.profile = np;
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
      if (s.status === "struck" || s.prio === "C" || !sessionInSpan(plan, s, m.from, m.to, nowDate)) continue;
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
      if (!sessionInSpan(plan, s, m.from, m.to, nowDate)) continue;
      if (push("mode-reduced", 2, s.id, "strike",
               "Reducerad vecka: komprimeras till A-passen. B stryks.",
               {}, { status: s.status ?? "planned" }, { modeKey: modeKey(m) })) s.status = "struck";
    }
  }

  /* missed-A / missed-B — trigger manual (spec 1 §6, K4 dagbaserad rev 0.5.0):
     dagar är inte exklusiva, så ingen B-slot-fallback behövs — A flyttar till
     nästa schemadag som klarar D3-grinden, annars strykning (H2). */
  const findMoveTarget = (s) => {
    const sched = bindings.schedule ?? {};
    const days = Object.keys(sched).map(Number)
      .filter(d => (sched[d] ?? []).length).sort((a, b) => a - b);
    const gate = (day) => {
      if (!isQuality(s)) return true;
      const probe = { ...s, day, slot: null };
      return list().every(x => {
        if (x.id === s.id || x.status === "struck" || !isQuality(x)) return true;
        const h = hoursBetween(plan, probe, x);
        return h == null || h >= 24;
      });
    };
    for (const day of days)
      if (day > (s.day ?? -1) && gate(day)) return { week: s.week, day, slot: null };
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
    /* missed-A: move → strike, med D3/H2 (dagbaserad K4) */
    const found = findMoveTarget(s);
    if (found) {
      if (push("missed-A", 2, s.id, "move",
               `Missat A-pass flyttas till ${DAYNAMES[found.day]}.`,
               found, { week: s.week, day: s.day, slot: s.slot ?? null })) Object.assign(s, found);
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
        ask: `Löpvolymen ligger över taket (${cfg.volumeCapPct} % av 3-veckorssnittet). Korta veckans sista pass?` });
      continue;
    }
    push("volume-cap", 2, s.id, "warn",
         "Löpvolym över taket — dosen kapas.", {}, {});
    shortenTo(s, f.factor ?? 0.8, "volume-cap", 2, "Volymtak: passet kortas.");
  }

  const sname = (x) => `${x.title ?? x.id}${x.day != null ? ` (${DAYNAMES[x.day]})` : ""}`;

  /* ---------- NIVÅ 3 — optimering (endast warn) ---------- */
  const lvl3 = [];
  const placed = list().filter(s => s.status !== "struck" && slotClock(plan, s) != null);

  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    const h = hoursBetween(plan, a, b);
    if (h == null || h > 24) continue;
    if (isQuality(a) && isQuality(b)) {
      lvl3.push({ rule: "quality-spacing", level: 3, session: (a.day <= b.day ? b : a).id, action: "warn",
        why: `Två kvalitetspass inom 24 h: ${sname(a)} och ${sname(b)}. En dags mellanrum rekommenderas.`,
        payload: {}, orig: {}, t: now, pair: [a.id, b.id] });
    }
    const st = a.sport === "strength" ? a : b.sport === "strength" ? b : null;
    const q  = st === a ? b : a;
    /* Enkelriktad (spec 1 §6 rev 2026-08-04): regeln skyddar KVALITETSPASSET från
       trötta ben — styrka dagen efter kvalitet är sund sekvensering, inte ett fynd. */
    if (st && st.sport === "strength" && isQuality(q) &&
        (slotClock(plan, st) ?? 0) < (slotClock(plan, q) ?? 0)) {
      lvl3.push({ rule: "heavy-legs", level: 3, session: q.id, action: "warn",
        why: `Tunga ben: styrkan ${sname(st)} ligger inom ett dygn före ${sname(q)} — överväg ordningsbyte.`,
        payload: {}, orig: {}, t: now, pair: [st.id, q.id] });
    }
  }
  /* utfallsflaggor passerar som warn (beräknade uppströms) */
  for (const f of flags) {
    if (f.id === "polarization") {
      /* Beslut A: test-/race-veckor bedöms aldrig mot 80/20 — de ÄR planerat
         hårda. Tystnad kräver explicit veckotyp; saknad vecka tystar aldrig. */
      const wt = (plan?.weeks ?? []).find(w => w.week === f.week)?.type;
      if (wt !== "test" && wt !== "race") {
        const ph = phaseLowShare(plan, { week: f.week }, cfg);
        lvl3.push({ rule: "polarization", level: 3, session: f.sessionId ?? null, action: "warn",
          why: `Veckan under ${Math.round(ph.target * 100)} % lågintensivt`
             + (ph.source === "block" ? ` (fasens mål, ${ph.label})` : "")
             + ` — överväg att sänka ett pass.`,
          payload: {}, orig: {}, t: now, week: f.week });
      }
    }
    if (f.id === "rpe-watch") lvl3.push({ rule: "rpe-watch", level: 3, session: f.sessionId ?? null,
      action: "warn", why: "RPE ≥ 9 loggat — nästa kvalitetspass granskas mot återhämtning.", payload: {}, orig: {}, t: now });
    /* recovery-watch (fas B): trendsignalen talar, ändrar aldrig. Dagssignalen
       går separat väg via sleep-guard (nivå 1). Beslut fas B, alternativ C. */
    if (f.id === "recovery-watch") lvl3.push({ rule: "recovery-watch", level: 3, session: null,
      action: "warn", why: (f.why ? f.why + " — " : "") +
        "kroppen är inte färdig med gårdagen. Volym går bra; spara kvaliteten tills det vänder.",
      payload: {}, orig: {}, t: now });
    if (f.id === "duration-drift") lvl3.push({ rule: "duration-drift", level: 3, session: f.sessionId ?? null,
      action: "warn", why: `Utfall > ${cfg.driftPct} % av planerad duration — räknas mot veckovolymen.`, payload: {}, orig: {}, t: now, week: f.week });
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
      ov.modes.comeback = { need: a.comebackNeed ?? ENGINE.comebackCount, z2done: 0, passed: false, after: a.comebackAfter };
    }
  }
  return ov;
}

/* ---------- deactivateMode — exakt återställning (spec 1 §9) ----------
   Återställer ögonblicksbilden UTOM för pass användaren rört manuellt
   under lägets gång (events med rule "manual-*" efter lägets start).
   Ångring loggas som egen post; events skrivs aldrig om. */
/* Delad återställningsväg (spec 1 §9) för periodlägen OCH dygnsflaggor:
   snapshot åter — UTOM pass användaren rört manuellt efter t0. Handen vinner.
   Ångring loggas som egen post; events skrivs aldrig om. */
function restoreSnapshot(ov, key, t0, now, whyKeep, whyRestore) {
  const sn = ov.modes.snapshots?.[key] ?? {};
  for (const [id, prior] of Object.entries(sn)) {
    const cur = ov.sessions[id] ?? {};
    const events = cur.events ?? [];
    const userWon = events.some(e => String(e.rule ?? "").startsWith("manual") && String(e.t) > String(t0));
    if (userWon) {
      events.push({ rule: "undo:" + key, session: id, action: "keep", why: whyKeep, t: now });
      ov.sessions[id] = { ...cur, events };
    } else {
      ov.sessions[id] = { ...structuredClone(prior ?? {}), events:
        [...events, { rule: "undo:" + key, session: id, action: "restore", why: whyRestore, t: now }] };
    }
  }
  if (ov.modes.snapshots) delete ov.modes.snapshots[key];
}

export function deactivateMode(overlay, key, now = "") {
  const ov = structuredClone(overlay ?? {});
  ov.sessions ??= {}; ov.modes ??= {};
  const mode = (ov.modes.active ?? []).find(m => m.rule + "@" + m.from === key);
  restoreSnapshot(ov, key, mode?.t ?? "", now,
    "Läge avaktiverat — användarens manuella version behålls.",
    "Läge avaktiverat — föregående tillstånd återställt.");
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

export const KEYS = { plan: "trizone.plan.v1", overlay: "trizone.overlay.v1",
                      cfg: "trizone.next.cfg.v1",     /* cfg: beslut 0.7.0 — bindningar (D7) */
                      cache: "trizone.next.cache.v1" };  /* fas B: egen projektion, egen nyckel */

/* v32:s cache — läses READ-ONLY och bara när egen cache är tom (fas B §5.5).
   Skrivs aldrig härifrån. Städning beslutas när v32 arkiveras, inte före. */
export const V32_CACHE_KEY = "trizone.cache.v1";

/* Livsschemats default — profildata, överstyrs i Inställningar (D7).
   Schemat FRAMHÄVER träningsdagar och matar missed-A — det spärrar aldrig. */
export const DEFAULT_CFG = { schedule: { 0:["Kväll"], 1:["Lunch","Kväll"], 2:["Kväll"], 3:["Kväll"],
                                         4:["Morgon","Kväll"], 5:["Morgon","Kväll"], 6:["Kväll"] },
                             athlete: null,          /* null = ingen vakt; sätts vid första planläsning */
                             engine: {},             /* överstyr ENGINE-defaults (P2: uppsättningen är data) */
                             swimHrValid: false,     /* matchning §3: optisk handledspuls i vatten är ogiltig */
                             conn: { apiKey: "", athleteId: "", historyDays: 370 } };  /* fas B: anslutningen */

/* Redigerbara motorvärden med gränser — allt annat i ENGINE är kodkonstant */
export const ENGINE_FIELDS = {
  lowShareTarget: { label: "Mål lågintensivt", unit: "%", min: 50, max: 95, pct: true },
  volumeCapPct:   { label: "Löpvolymtak", unit: "% av 3-veckorssnitt", min: 100, max: 200 },
  comebackCount:  { label: "Z2-pass före kvalitet efter sjukdom", unit: "pass", min: 1, max: 6 },
  shortenFloorMin:{ label: "Kortaste pass vid nedkortning", unit: "min", min: 10, max: 45 },
  maintFactor:    { label: "Underhållsdos i semesterläge", unit: "%", min: 30, max: 90, pct: true }
};

export function validateCfg(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== "object") return { ok: false, errors: [{ where: "cfg", why: "inte ett objekt" }] };
  if (cfg.athlete !== undefined && cfg.athlete !== null && typeof cfg.athlete !== "string")
    errors.push({ where: "cfg.athlete", why: "måste vara text eller null" });
  if (cfg.engine !== undefined) {
    if (typeof cfg.engine !== "object" || cfg.engine === null)
      errors.push({ where: "cfg.engine", why: "inte ett objekt" });
    else for (const [k, v] of Object.entries(cfg.engine)) {
      const f = ENGINE_FIELDS[k];
      if (!f) { errors.push({ where: `engine.${k}`, why: "okänt motorvärde" }); continue; }
      const num = f.pct ? v * 100 : v;
      if (typeof v !== "number" || !Number.isFinite(v) || num < f.min || num > f.max)
        errors.push({ where: `engine.${k}`, why: `utanför ${f.min}–${f.max} ${f.unit}` });
    }
  }
  if (cfg.schedule !== undefined) {
    if (typeof cfg.schedule !== "object" || cfg.schedule === null)
      errors.push({ where: "cfg.schedule", why: "inte ett objekt" });
    else for (const [d, wins] of Object.entries(cfg.schedule)) {
      if (!(Number(d) >= 0 && Number(d) <= 6)) errors.push({ where: `schedule.${d}`, why: "dag utanför 0–6" });
      if (!Array.isArray(wins) || wins.some(w => !WINDOWS.includes(w)))
        errors.push({ where: `schedule.${d}`, why: `okänt fönster (väntat ${WINDOWS.join(" | ")})` });
    }
  }
  if (cfg.swimHrValid !== undefined && typeof cfg.swimHrValid !== "boolean")
    errors.push({ where: "cfg.swimHrValid", why: "måste vara true eller false" });
  if (cfg.conn !== undefined) {
    if (typeof cfg.conn !== "object" || cfg.conn === null)
      errors.push({ where: "cfg.conn", why: "inte ett objekt" });
    else for (const e of validateConn(cfg.conn).errors) errors.push(e);
  }
  return { ok: !errors.length, errors };
}

/* ================================================================
   ANSLUTNING TILL intervals.icu (fas B §5.1)
   Rena funktioner: URL och headers byggs och testas utan nät.
   Nätverkslagret i ui.js är tunt och dumt — all bedömning bor här.
   ================================================================ */

export const ICU = { base: "https://intervals.icu/api/v1/athlete",
                     defHistory: 370, minHistory: 30, maxHistory: 400, minKey: 12 };

/* athlete-ID: intervals.icu skriver det "i123456"; rena siffror accepteras också */
const ID_RE = /^i?\d{3,12}$/;

export function validateConn(conn) {
  const errors = [];
  if (!conn || typeof conn !== "object")
    return { ok: false, errors: [{ where: "conn", why: "inte ett objekt" }] };
  const key = conn.apiKey ?? "", id = conn.athleteId ?? "";
  if (typeof key !== "string") errors.push({ where: "conn.apiKey", why: "måste vara text" });
  if (typeof id !== "string") errors.push({ where: "conn.athleteId", why: "måste vara text" });
  if (typeof id === "string" && id.trim() && !ID_RE.test(id.trim()))
    errors.push({ where: "conn.athleteId",
      why: `"${id}" ser inte ut som ett athlete-ID (väntat i123456 eller 123456)` });
  if (typeof key === "string" && key.trim() && key.trim().length < ICU.minKey)
    errors.push({ where: "conn.apiKey",
      why: "nyckeln är för kort — kopiera hela från intervals.icu → Settings → Developer" });
  if (conn.historyDays !== undefined) {
    const d = conn.historyDays;
    if (typeof d !== "number" || !Number.isFinite(d) || d < ICU.minHistory || d > ICU.maxHistory)
      errors.push({ where: "conn.historyDays", why: `utanför ${ICU.minHistory}–${ICU.maxHistory} dagar` });
  }
  return { ok: !errors.length, errors };
}

/* Halvifylld anslutning är inte ett fel — den är bara inte klar än. */
export function connReady(conn) {
  const key = (conn?.apiKey ?? "").trim(), id = (conn?.athleteId ?? "").trim();
  if (!key && !id) return { ready: false, why: "ingen anslutning konfigurerad" };
  if (!key) return { ready: false, why: "API-nyckel saknas" };
  if (!id) return { ready: false, why: "athlete-ID saknas" };
  const v = validateConn(conn);
  if (!v.ok) return { ready: false, why: v.errors.map(e => e.why).join(" · ") };
  return { ready: true, why: `ansluten som ${id}` };
}

const b64 = s => typeof btoa === "function" ? btoa(s)
  : typeof Buffer !== "undefined" ? Buffer.from(s, "binary").toString("base64") : s;

export const dayShift = (iso, n) => {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  if (isNaN(d)) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* (conn, kind, todayISO) → { url, headers } · kind: activities | wellness | athlete */
export function icuRequest(conn, kind, todayISO) {
  const r = connReady(conn);
  if (!r.ready) return { error: r.why };
  const id = encodeURIComponent(conn.athleteId.trim());
  const days = conn.historyDays ?? ICU.defHistory;
  const headers = { Authorization: "Basic " + b64("API_KEY:" + conn.apiKey.trim()) };
  const oldest = dayShift(todayISO, -days);
  if (!oldest) return { error: `ogiltigt datum: ${todayISO}` };
  if (kind === "activities")
    return { url: `${ICU.base}/${id}/activities?oldest=${oldest}&newest=${dayShift(todayISO, 1)}`, headers };
  if (kind === "wellness")
    return { url: `${ICU.base}/${id}/wellness?oldest=${oldest}&newest=${todayISO}`, headers };
  if (kind === "athlete")
    return { url: `${ICU.base}/${id}`, headers };
  return { error: `okänd hämtningstyp: ${kind}` };
}

/* v32:s säkerhetsregel, ärvd oavkortad: ett anrop som bär Authorization får
   ALDRIG gå via proxy — då skickas nyckeln till proxyägaren. */
export const proxyAllowed = (headers) => !(headers && headers.Authorization);

/* Fel pekar på rotorsak, inte på symptom (F4) */
export function icuError(status, kind) {
  if (status === 401) return `${kind}: 401 — API-nyckeln avvisades. Kopiera om den från intervals.icu → Settings → Developer.`;
  if (status === 403) return `${kind}: 403 — nyckeln gäller men inte för det här athlete-ID:t. Kontrollera ID:t.`;
  if (status === 404) return `${kind}: 404 — athlete-ID:t finns inte. Väntat format i123456.`;
  if (status === 429) return `${kind}: 429 — för många anrop. Vänta en stund och hämta om.`;
  if (status >= 500) return `${kind}: ${status} — intervals.icu svarar inte just nu. Cachen gäller tills vidare.`;
  return `${kind}: HTTP ${status}`;
}

export const byteSize = s => new TextEncoder().encode(String(s ?? "")).length;
const kB = n => (n / 1024).toFixed(n < 10240 ? 1 : 0) + " kB";

/* F5 — trimmad projektion: vitlista, aldrig råa svar. Okända fält från
   coachgenererad plandata når aldrig lagringen. */
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o?.[k] !== undefined) r[k] = o[k]; return r; };
export function trimPlan(plan) {
  const p = pick(plan, ["formatVersion", "planVersion", "generated", "athlete", "anchor"]);
  /* Regression 2026-08-10: lowShare (beslut A) ströks här och försvann tyst
     ur offline-projektionen. Vitlistan bär numera all beslutad blockdata. */
  p.blocks   = (plan.blocks   ?? []).map(b => {
    const t = pick(b, ["id", "label", "start", "weeks", "lowShare"]);
    if (typeof b.text?.brief === "string") t.text = { brief: b.text.brief };
    return t;
  });
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

/* ---------- Egen datacache (fas B §5.2) ----------
   EN nyckel, tre sektioner. De hämtas i samma svep, delar färskhet och hör ihop;
   tre nycklar hade gett tre kvotpunkter utan vinst (beslut fas B, produktägaren).
   Skrivningen är degraderande: vid kvotfel trimmas historiken bakifrån och
   försöket görs om, i stället för att allt-eller-inget faller. */
export const CACHE_VERSION = 1;
export const emptyCache = () => ({ v: CACHE_VERSION, activities: [], wellness: [], athlete: null,
                                   fetched: { activities: null, wellness: null, athlete: null } });

/* Behåll bara det som ligger inom historikfönstret */
export function trimCache(cache, todayISO, days = ICU.defHistory) {
  const cut = dayShift(todayISO, -days);
  const c = { ...emptyCache(), ...(cache ?? {}) };
  if (!cut) return c;
  return { ...c,
    activities: (c.activities ?? []).filter(a => String(a.start_date_local ?? "").slice(0, 10) >= cut),
    wellness:   (c.wellness   ?? []).filter(w => String(w.id ?? "").slice(0, 10) >= cut) };
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

  const report = () => {                      /* räknar ALLA nycklar — kvoten gör det (0.6.1) */
    const keys = [];
    for (let i = 0; i < (storage.length ?? 0); i++) {
      const k = storage.key(i);
      if (k) keys.push({ key: k, bytes: byteSize(storage.getItem(k)),
                         foreign: !k.startsWith("trizone.") });
    }
    keys.sort((a, b) => b.bytes - a.bytes);
    return { keys, total: keys.reduce((s, k) => s + k.bytes, 0),
             foreignBytes: keys.filter(k => k.foreign).reduce((s, k) => s + k.bytes, 0) };
  };

  const quotaMessage = (key, bytes) => {
    const r = report();
    const top = r.keys.filter(k => k.key !== key).slice(0, 2)
      .map(k => `${k.key}${k.foreign ? " (legacy)" : ""} ${kB(k.bytes)}`).join(", ");
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

    /* Bindningar (D7): trasig cfg blockerar aldrig appen — default gäller, felet redovisas */
    loadCfg() {
      const r = readJson(KEYS.cfg);
      if (r.missing) return { cfg: structuredClone(DEFAULT_CFG), error: null, stored: false };
      if (r.error) return { cfg: structuredClone(DEFAULT_CFG), error: r.error, stored: false };
      const v = validateCfg(r.value);
      if (!v.ok) return { cfg: structuredClone(DEFAULT_CFG),
        error: "cfg ogiltig (" + v.errors.map(e => `${e.where}: ${e.why}`).join(" · ") + ") — default gäller",
        stored: false };
      return { cfg: { ...structuredClone(DEFAULT_CFG), ...r.value }, error: null, stored: true };
    },
    saveCfg(cfg) {
      const v = validateCfg(cfg);
      if (!v.ok) return { ok: false, error: "cfg avvisad: " +
        v.errors.map(e => `${e.where}: ${e.why}`).join(" · ") };
      return write(KEYS.cfg, cfg);
    },

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

    /* ---------- Egen datacache (fas B) ----------
       Trasig cache blockerar aldrig appen: tom cache gäller och felet redovisas.
       Cachen är återskapbar med ett anrop — den ingår därför aldrig i backup. */
    loadCache() {
      const r = readJson(KEYS.cache);
      if (r.missing) return { cache: emptyCache(), error: null, stored: false };
      if (r.error) return { cache: emptyCache(), error: r.error, stored: false };
      const c = r.value;
      if (!c || typeof c !== "object" || !Array.isArray(c.activities))
        return { cache: emptyCache(), error: "cachen har okänd form — tom cache gäller, hämta om", stored: false };
      if (c.v !== CACHE_VERSION)
        return { cache: emptyCache(),
                 error: `cachens format är ${c.v ?? "okänt"} (appen läser ${CACHE_VERSION}) — hämta om`, stored: false };
      return { cache: { ...emptyCache(), ...c }, error: null, stored: true };
    },

    /* patch: { activities?, wellness?, athlete? } — fack utan värde lämnas orörda,
       så ett trasigt anrop aldrig raderar de två som gick igenom. */
    saveCache(cache, patch = {}, todayISO = "", days = ICU.defHistory) {
      let next = { ...emptyCache(), ...(cache ?? {}) };
      next.fetched = { ...next.fetched };
      for (const k of ["activities", "wellness", "athlete"]) {
        if (patch[k] === undefined) continue;
        next[k] = patch[k];
        next.fetched[k] = todayISO || next.fetched[k];
      }
      if (todayISO) next = { ...next, ...trimCache(next, todayISO, days) };
      let w = write(KEYS.cache, next);
      if (w.ok) return { ...w, cache: next, degraded: false };
      /* F5: hellre halv historik med besked än ingen cache alls */
      const half = Math.max(30, Math.floor((next.activities?.length ?? 0) / 2));
      const shrunk = { ...next, activities: (next.activities ?? []).slice(-half) };
      w = write(KEYS.cache, shrunk);
      if (w.ok) return { ...w, cache: shrunk, degraded: true,
        error: `Lagringen räckte inte till hela historiken — de ${half} senaste aktiviteterna sparades. ` +
               `Sänk historikfönstret i Inställningar eller rensa legacy-nycklar.` };
      return { ...w, cache };
    },

    clearCache() { try { storage.removeItem(KEYS.cache); return { ok: true }; }
                   catch (e) { return { ok: false, error: String(e?.message ?? e) }; } },

    unblock() { blocked = null; }
  };
}

/* ================================================================
   VECKOVYN — layoutmatte som ren funktion (v29-lärdomen)
   Designspråk S4: dagen är behållaren, fönstren är etiketter,
   pass-par staplas. Ingen DOM här; ui.js renderar resultatet.
   ================================================================ */

export const DAYLABEL = ["mån", "tis", "ons", "tors", "fre", "lör", "sön"];
const MONTHS = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
export function weekDates(plan, weekNo) {
  const wk = (plan?.weeks ?? []).find(w => w.week === weekNo);
  const mon = wk && isoWeekMonday(wk.iso);
  if (!mon) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
export const shortDate = iso =>
  iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}` : "";

/* weekView: (plan, overlay, weckNo, bindings) → renderbar veckostruktur.
   Läser alltid källa + överlagring (F1). Pass som flyttats IN i veckan
   följer med; pass som flyttats UT försvinner härifrån. */
export function weekView(plan, overlay, weekNo, bindings = {}) {
  const ov = overlay ?? {};
  const dates = weekDates(plan, weekNo);
  const week = (plan?.weeks ?? []).find(w => w.week === weekNo) ?? null;

  const eff = (plan?.sessions ?? [])
    .map(s => {
      const so = ov.sessions?.[s.id];
      const e = { ...effectiveSession(s, so), _src: s };
      if (!e.status && so?.match) { e.status = "done"; e.matchedActivity = so.match.activityId; }
      return e;                                    /* härledd status: länk ⇒ utfört; strykning vinner (M3, §5c) */
    })
    .filter(s => s.week === weekNo);

  const days = dates.map((date, day) => {
    const here = eff.filter(s => s.day === day)
      .sort((a, b) => (SLOTORD[a.slot] ?? 9) - (SLOTORD[b.slot] ?? 9)
                   || PRIOS.indexOf(a.prio) - PRIOS.indexOf(b.prio) || a.id.localeCompare(b.id));
    return { day, date, label: DAYLABEL[day], sessions: here,
             minutes: here.filter(s => s.status !== "struck").reduce((n, s) => n + (s.durationMin || 0), 0) };
  });

  const unplaced = eff.filter(s => s.day == null)
                      .sort((a, b) => PRIOS.indexOf(a.prio) - PRIOS.indexOf(b.prio) || a.id.localeCompare(b.id));

  const live = eff.filter(s => s.status !== "struck");
  const zones = live.reduce((acc, s) => zoneDist(s.profile).map((m, i) => acc[i] + m), [0,0,0,0,0]);
  const total = zones.reduce((a, b) => a + b, 0);
  return {
    week, weekNo, days, unplaced,
    summary: {
      planned: live.length, struck: eff.length - live.length, unplaced: unplaced.length,
      done: live.filter(s => s.status === "done").length,
      minutes: live.reduce((n, s) => n + (s.durationMin || 0), 0),
      zones, lowMinutes: zones[0] + zones[1],
      lowShare: total ? (zones[0] + zones[1]) / total : null   /* fönster = denna vecka (v28-regeln) */
    }
  };
}

/* Veckor som går att bläddra till, i planordning */
export const planWeeks = plan => (plan?.weeks ?? []).map(w => w.week).sort((a, b) => a - b);

/* ---------- Planposition (U5, 0.17.1) ----------
   Passerade veckor = sista dagen bakom idag; söndagen hör till innevarande.
   Aggregerad compliance med veckohuvudets formel: struket utanför båda,
   C utanför nämnaren och täljaren. Läser via weekView ⇒ källa + överlagring
   (F1) — pass flyttade in i en passerad vecka räknas där. */
export function pastSummary(plan, overlay, todayISO) {
  const past = planWeeks(plan).filter(wk => {
    const d = weekDates(plan, wk);
    return d.length === 7 && d[6] < todayISO;
  });
  if (!past.length) return null;
  let done = 0, total = 0;
  for (const wk of past) {
    const v = weekView(plan, overlay, wk);
    const live = [...v.days.flatMap(d => d.sessions), ...v.unplaced]
      .filter(s => s.status !== "struck" && s.prio !== "C");
    total += live.length;
    done += live.filter(s => s.status === "done").length;
  }
  return { weeks: past, done, total };
}

/* ---------- Manuell justering (planformat §5d) ----------
   Användarutlöst, begränsad till regelverkets åtgärdslista. Lagras som
   overlay-event märkt "manual-*" ⇒ användarens hand vinner vid
   lägesavaktivering (spec 1 §9, deactivateMode). Ren funktion. */
const MANUAL = ["move", "place", "unplace", "strike", "restore", "shorten", "downgrade", "substitute"];

export function manualAdjust(plan, overlay, id, action, payload = {}, now = "") {
  if (!MANUAL.includes(action)) return { overlay: overlay ?? emptyOverlay(), error: `okänd åtgärd: ${action}` };
  const src = (plan?.sessions ?? []).find(s => s.id === id);
  if (!src) return { overlay: overlay ?? emptyOverlay(), error: `okänt pass: ${id}` };
  const out = structuredClone(overlay ?? emptyOverlay(plan?.planVersion));
  out.sessions ??= {}; out.placed ??= {};
  const so = out.sessions[id] ??= {};
  const cur = effectiveSession(src, so);
  let why = "";

  switch (action) {
    case "move": case "place": {
      const t = { week: payload.week ?? cur.week, day: payload.day, slot: payload.slot ?? null };
      if (!(t.day >= 0 && t.day <= 6) || (t.slot != null && !WINDOWS.includes(t.slot)))
        return { overlay: overlay ?? emptyOverlay(), error: `ogiltigt mål: ${t.day}/${t.slot}` };
      const menu = src.day == null;                           /* menypass ⇒ placed, övriga ⇒ moved */
      if (menu) { so.placed = t; out.placed[id] = t; } else so.moved = t;
      why = `${menu ? "Placerat" : "Flyttat"} till ${DAYLABEL[t.day]}${t.slot ? " " + t.slot : ""}.`;
      break;
    }
    case "unplace":
      delete so.placed; delete so.moved; delete out.placed[id];
      why = "Tillbaka till veckans meny — oplacerat.";
      break;
    case "strike":
      so.status = "struck";
      why = payload.why ?? "Struket för hand. Jagas inte ikapp.";
      break;
    case "restore":
      delete so.status;
      why = "Strykning hävd.";
      break;
    case "shorten": {
      const nd = Math.max(ENGINE.shortenFloorMin, Math.round((payload.durationMin ?? cur.durationMin) / 5) * 5);
      so.adjust = { ...so.adjust, durationMin: nd, profile: scaleProfile(cur.profile, nd / cur.durationMin) };
      why = `Kortat ${cur.durationMin} → ${nd} min.`;
      break;
    }
    case "downgrade":
      so.adjust = { ...so.adjust, profile: downgradeProfile(cur.profile) };
      why = "Nedväxlat till Z2 för hand.";
      break;
    case "substitute":
      if (!SPORTS.includes(payload.sport)) return { overlay: overlay ?? emptyOverlay(), error: `okänd gren: ${payload.sport}` };
      so.adjust = { ...so.adjust, sport: payload.sport };
      why = `Grenbyte ${cur.sport} → ${payload.sport}.`;
      break;
  }
  (so.events ??= []).push({ rule: "manual-" + action, session: id, action, why, t: now });
  return { overlay: out, why };
}

/* ================================================================
   DRAGMASKINEN — direktmanipulation som ren logik (v29-principen)
   Geometri och tillståndsövergångar testas i Node; ui.js gör bara
   pekarhändelser, mätning och rendering.
   ================================================================ */

export const DRAG = {
  holdMs: 220,        /* långtryck innan drag armeras (touch) */
  moveTol: 14,        /* rörelse före armering = skroll, inte drag */
  tapMs: 300,         /* upp inom denna tid + tapDist ⇒ tryck trots glid */
  tapDist: 20,        /* fingerglid som fortfarande är ett tryck */
  weekDwellMs: 500,   /* håll över veckopilen ⇒ byt vecka, draget lever vidare */
  edgePx: 96,         /* autoskrollzon vid skärmkant */
  edgeStep: 14        /* px per bildruta i autoskroll */
};

/* Träfftest mot uppmätta zoner: [{id, x, y, w, h}] → id eller null.
   Sista träffen vinner (senare zoner ligger visuellt överst). */
export function hitTest(zones, x, y) {
  let hit = null;
  for (const z of zones ?? [])
    if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) hit = z.id;
  return hit;
}

/* Närmaste zon i lodled — används när släppet sker på dagen men
   mellan två fönster. Hellre närmaste rimliga mål än ett tappat drag. */
export function nearestZone(zones, x, y) {
  let best = null, bd = Infinity;
  for (const z of zones ?? []) {
    const dx = x < z.x ? z.x - x : x > z.x + z.w ? x - (z.x + z.w) : 0;
    const dy = y < z.y ? z.y - y : y > z.y + z.h ? y - (z.y + z.h) : 0;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = z.id; }
  }
  return best;
}

/* Tillståndsmaskin. Ren funktion: (state, event) → state.
   phase: idle → armed → drag → drop|idle */
export const dragIdle = { phase: "idle", id: null, x: 0, y: 0, day: null, slot: null, week: null, t0: 0 };

export function dragReduce(state = dragIdle, ev = {}) {
  const s = { ...dragIdle, ...state };
  switch (ev.type) {
    case "down":
      return { ...dragIdle, phase: "armed", id: ev.id, x: ev.x, y: ev.y, sx: ev.x, sy: ev.y,
               t0: ev.t ?? 0, grip: !!ev.grip, week: ev.week ?? null };
    case "hold":
      return s.phase === "armed" ? { ...s, phase: "drag" } : s;   /* slop drar aldrig */
    case "move":
      if (s.phase === "armed") {
        if (s.grip) return { ...s, phase: "drag", x: ev.x, y: ev.y };       /* greppet drar direkt */
        return Math.hypot(ev.x - s.sx, ev.y - s.sy) > DRAG.moveTol
          ? { ...s, phase: "slop", x: ev.x, y: ev.y }             /* troligen skroll — men döm inte än */
          : s;
      }
      if (s.phase === "slop" || s.phase === "drag") return { ...s, x: ev.x, y: ev.y };
      return s;
    case "over":
      return s.phase === "drag"
        ? { ...s, week: ev.week ?? s.week, day: ev.day ?? null, slot: ev.slot ?? null } : s;
    case "week":
      return s.phase === "drag" ? { ...s, week: ev.week, day: null, slot: null } : s;
    case "up":
      if (s.phase === "armed") return { ...dragIdle, tap: s.id };
      if (s.phase === "slop") {                                   /* glidande tryck är ändå ett tryck */
        const quick = (ev.t ?? Infinity) - s.t0 < DRAG.tapMs;
        const near = Math.hypot(s.x - s.sx, s.y - s.sy) < DRAG.tapDist;
        return quick && near ? { ...dragIdle, tap: s.id } : { ...dragIdle };
      }
      if (s.phase !== "drag") return { ...dragIdle };
      /* Fingret har inte rest någonstans ⇒ det var ett tryck, oavsett hur länge det låg kvar.
         (0.5.0-buggen: långt stillastående tryck blev en tom flytt till egen dag.) */
      if (Math.hypot(s.x - s.sx, s.y - s.sy) < DRAG.tapDist) return { ...dragIdle, tap: s.id };
      return s.day != null
        ? { ...dragIdle, drop: { id: s.id, week: s.week, day: s.day, slot: s.slot ?? null } }
        : { ...dragIdle, cancelled: true };
    case "cancel":
      return { ...dragIdle, cancelled: s.phase === "drag" };
    default:
      return s;
  }
}

/* Autoskroll: hur mycket sidan ska rulla när pekaren är nära kanten */
export function edgeScroll(y, viewportH) {
  if (y < DRAG.edgePx) return -DRAG.edgeStep;
  if (y > viewportH - DRAG.edgePx) return DRAG.edgeStep;
  return 0;
}

/* ================================================================
   UTFALL OCH HÄRLEDD STATUS (matchning v0.2 · planformat §5c)
   Aktiviteter läses READ-ONLY ur v32:s trizone.cache.v1 (beslut
   2026-08-02: Next skriver aldrig den nyckeln under samexistensen).
   ================================================================ */

/* Trimmad aktivitetsprojektion — endast fälten matchningen och
   utfallsvisningen använder (matchning §3, F5). */
const ACT_FIELDS = ["id", "type", "name", "start_date_local", "moving_time", "distance",
  "trainer", "icu_hr_zone_times", "icu_training_load", "average_heartrate", "icu_average_hr",
  "average_watts", "icu_average_watts", "has_device_watts", "device_watts", "average_cadence",
  "icu_rpe", "feel", "perceived_exertion"];   /* 0.8.0: klockans självskattning följer med */
const looksLikeActivity = a => a && typeof a === "object" &&
  a.id != null && typeof a.type === "string" && (a.start_date_local || a.start_date);

/* Tolerant extraktion: v32:s exakta cachestruktur ägs av v32 — vi letar,
   vi antar inte. Hittar första listan som ser ut som aktiviteter. */
export function readActivityCache(raw) {
  let c;
  try { c = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch (e) { return { activities: [], error: `cachen går inte att läsa: ${e.message}` }; }
  if (!c || typeof c !== "object") return { activities: [], error: "cachen saknas eller är tom" };

  const paths = [["activities"], ["data", "activities"], ["acts"], ["data", "acts"], ["data"]];
  let found = null, where = null;
  for (const p of paths) {
    let v = c;
    for (const k of p) v = v?.[k];
    if (Array.isArray(v) && v.length && v.filter(looksLikeActivity).length >= v.length / 2) {
      found = v; where = p.join("."); break;
    }
  }
  if (!found) {                                   /* sista utväg: sök en nivå ned */
    for (const [k, v] of Object.entries(c)) {
      if (Array.isArray(v) && v.length && v.filter(looksLikeActivity).length >= v.length / 2) {
        found = v; where = k; break;
      }
      if (v && typeof v === "object") for (const [k2, v2] of Object.entries(v)) {
        if (Array.isArray(v2) && v2.length && v2.filter(looksLikeActivity).length >= v2.length / 2) {
          found = v2; where = `${k}.${k2}`; break;
        }
      }
      if (found) break;
    }
  }
  if (!found) return { activities: [], error: "hittade ingen aktivitetslista i cachen — struktur okänd" };

  const activities = found.filter(looksLikeActivity).map(a => {
    const t = {};
    for (const k of ACT_FIELDS) if (a[k] !== undefined) t[k] = a[k];
    if (!t.start_date_local && a.start_date) t.start_date_local = a.start_date;
    return t;
  });
  return { activities, path: where, total: found.length };
}

/* ================================================================
   EGNA PROJEKTIONER (fas B §5.2) — Next bestämmer fälten själv.
   Skillnaden mot readActivityCache: den letar i någon annans struktur,
   dessa läser API:ets svar direkt och vitlistar (F5).
   ================================================================ */

export function projectActivities(raw) {
  if (!Array.isArray(raw)) return { activities: [], error: "aktivitetssvaret är ingen lista" };
  const activities = raw.filter(looksLikeActivity).map(a => {
    const t = {};
    for (const k of ACT_FIELDS) if (a[k] !== undefined) t[k] = a[k];
    if (!t.start_date_local && a.start_date) t.start_date_local = a.start_date;
    return t;
  }).sort((a, b) => String(a.start_date_local) < String(b.start_date_local) ? -1 : 1);
  return { activities, total: raw.length, dropped: raw.length - activities.length };
}

export const WELL_FIELDS = ["id", "restingHR", "resting_hr", "hrv", "hrvSDNN", "sleepSecs",
  "sleepScore", "sleepQuality", "ctl", "atl", "weight", "readiness"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function projectWellness(raw) {
  if (!Array.isArray(raw)) return { wellness: [], error: "wellnesssvaret är ingen lista" };
  const wellness = raw.filter(w => w && typeof w === "object" && DATE_RE.test(String(w.id ?? "")))
    .map(w => {
      const t = {};
      for (const k of WELL_FIELDS) if (w[k] !== undefined) t[k] = w[k];
      /* API:et har två stavningar; vi lagrar en (en sanning per fakta) */
      if (t.resting_hr !== undefined) { if (t.restingHR === undefined) t.restingHR = t.resting_hr;
                                        delete t.resting_hr; }
      return t;
    }).sort((a, b) => a.id < b.id ? -1 : 1);
  return { wellness, total: raw.length, dropped: raw.length - wellness.length };
}

/* Atletprofilen: zoner per gren + benchmarks. Defensivt byggd i v32:s anda —
   kända fältvarianter provas, orimliga värden förkastas, saknas allt blir det null. */
export function projectAthlete(raw) {
  if (!raw || typeof raw !== "object") return { athlete: null, error: "atletsvaret är inte ett objekt" };
  const settings = raw.sportSettings ?? raw.sport_settings ?? [];
  const sports = {};
  for (const s of Array.isArray(settings) ? settings : []) {
    const types = (s?.types ?? []).map(x => String(x));
    const sport = types.map(t => SPORT_MAP[t]).find(Boolean);
    if (!sport || sports[sport]) continue;
    const hz = s.hr_zones ?? s.hrZones ?? null;
    const zones = Array.isArray(hz) && hz.length >= 3 && hz.every(v => typeof v === "number" && v > 40 && v < 240)
      ? hz.map(Math.round) : null;
    const num = v => (typeof v === "number" && Number.isFinite(v) && v > 0) ? v : null;
    sports[sport] = { types, zones,
      lthr: num(s.lthr), ftp: num(s.ftp),
      thresholdPace: num(s.threshold_pace ?? s.thresholdPace) };   /* m/s (v32: kodningen verifierad) */
  }
  const athlete = { id: raw.id ?? null, name: raw.name ?? null, sports,
                    icu_ftp: (typeof raw.icu_ftp === "number" && raw.icu_ftp > 0) ? raw.icu_ftp : null };
  return { athlete, sportCount: Object.keys(sports).length };
}

/* Benchmarks: alltid ur atletens egna värden, aldrig absoluta antaganden.
   Saknat fält blir null — hellre tomt än påhittat (ingen falsk precision). */
export function benchmarksOf(athlete) {
  const s = athlete?.sports ?? {};
  const paceStr = mps => mps ? (() => {
    const secPerKm = 1000 / mps;
    return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")}/km`;
  })() : null;
  const cssStr = mps => mps ? (() => {
    const sec = 100 / mps;
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}/100 m`;
  })() : null;
  return {
    ftp: s.bike?.ftp ?? athlete?.icu_ftp ?? null,
    bikeLthr: s.bike?.lthr ?? null,
    runLthr: s.run?.lthr ?? null,
    runThreshold: paceStr(s.run?.thresholdPace),
    css: cssStr(s.swim?.thresholdPace)
  };
}

/* ---------- Källval (fas B §5.5) ----------
   Egen cache vinner alltid. v32 läses bara när egen är tom — aldrig
   sammanslagning av två källor, det vore en andra sanning (F3). */
export function pickActivitySource(own, v32raw) {
  const mine = own?.activities ?? [];
  if (mine.length)
    return { activities: mine, source: "next", fetched: own?.fetched?.activities ?? null,
             why: `${mine.length} aktiviteter ur egen cache` +
                  (own?.fetched?.activities ? ` (hämtade ${own.fetched.activities})` : "") };
  const r = readActivityCache(v32raw);
  if (r.activities.length)
    return { activities: r.activities, source: "v32", fetched: null,
             why: `${r.activities.length} lästa ur v32-cachen (${r.path}, read-only) — anslut i Inställningar för egen hämtning` };
  return { activities: [], source: "none", fetched: null,
           why: r.error ?? "ingen aktivitetsdata — anslut till intervals.icu i Inställningar" };
}

/* Utfallets zonremsa: icu_hr_zone_times (sekunder per zon) → [min Z1..Z5].
   Samma zoneDist som plan-sidan konsumerar resultatet (M2). */
export function actZoneMinutes(a) {
  const z = a?.icu_hr_zone_times;
  if (!Array.isArray(z) || z.length < 3 || !z.every(v => typeof v === "number")) return null;
  const m = z.slice(0, 5).map(sec => Math.round(sec / 60));
  while (m.length < 5) m.push(0);
  return m.some(v => v > 0) ? m : null;
}

/* ---------- deriveMatches — ren härledning (M4) ----------
   (plan, overlay, activities) → { links, questions, unplanned }
   Läser alltid källa + överlagring (flyttade/kortade pass matchar sitt
   aktuella läge). Struket pass matchas aldrig (M3). Avvisade par
   (matchDrop) föreslås aldrig igen. */
export function deriveMatches(plan, overlay, activities, opts = {}) {
  const ov = overlay ?? {};
  const sessions = (plan?.sessions ?? []).map(s => {
    const so = ov.sessions?.[s.id];
    const e = effectiveSession(s, so);
    e.date = sessionDate(plan, e);
    return e;
  }).filter(s => s.date);                          /* oplacerade menypass utan dag deltar ej */

  const linkedS = new Set(), linkedA = new Set();
  for (const [id, so] of Object.entries(ov.sessions ?? {}))
    if (so?.match?.activityId != null) { linkedS.add(id); linkedA.add(so.match.activityId); }

  const dates = sessions.map(s => s.date).sort();
  const lo = dates[0], hi = dates[dates.length - 1];
  const inSpan = a => { const d = matchDate(a.start_date_local);
    return d && d >= addDays(lo, -1) && d <= addDays(hi, 1); };

  const acts = (activities ?? []).filter(a => !linkedA.has(a.id) && inSpan(a) && activitySane(a).ok);
  const open = sessions.filter(s => !linkedS.has(s.id));
  const cfg = { dateOfSession: s => s.date, windows: opts.windows };

  const r = assignMatches(open, acts, cfg);
  const dropped = (sid, aid) => (ov.sessions?.[sid]?.matchDrop ?? []).includes(aid);
  const links = r.links.filter(l => !dropped(l.sessionId, l.activityId));
  const questions = r.questions.filter(q => !dropped(q.sessionId, q.activityId));

  const taken = new Set([...links.map(l => l.activityId), ...questions.map(q => q.activityId)]);
  const secondaries = new Set(detectDuplicates(acts).map(d => d.secondary));
  const unplanned = acts.filter(a => !taken.has(a.id) && !secondaries.has(a.id)).map(a => a.id);
  return { links, questions, unplanned };
}
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------- Länkskrivning (M1: länk, aldrig kopia · P3) ---------- */
export function applyMatchLinks(overlay, links, source = "auto", now = "") {
  const ov = structuredClone(overlay ?? {});
  ov.sessions ??= {};
  for (const l of links) {
    const so = ov.sessions[l.sessionId] ??= {};
    if (so.status === "struck") continue;                        /* M3: strykning rörs aldrig */
    so.match = { activityId: l.activityId, score: l.score };
    if (so.status === "done") delete so.status;                  /* härledd ersätter manuell */
    (so.events ??= []).push({ rule: source === "auto" ? "match-auto" : "match-confirm",
      session: l.sessionId, action: "link",
      why: `Aktivitet ${l.activityId} länkad (${l.score} p${source === "auto" ? ", tyst ≥ tröskel" : ", bekräftad"}).`,
      t: now });
  }
  return ov;
}

export function dismissMatch(overlay, sessionId, activityId, now = "") {
  const ov = structuredClone(overlay ?? {});
  const so = (ov.sessions ??= {})[sessionId] ??= {};
  so.matchDrop = [...(so.matchDrop ?? []), activityId];
  (so.events ??= []).push({ rule: "match-dismiss", session: sessionId, action: "warn",
    why: `Föreslagen länk till aktivitet ${activityId} avvisad — föreslås inte igen.`, t: now });
  return ov;
}

/* ================================================================
   SÄKERHETSKOPIA (planformat P5, beslutslogg 2026-07-29)
   Overlay + patchar via urklipp — samma buss som kontextexport och
   veckopatch. Import validerar och stämmer av; trasig kopia
   förklaras, importeras aldrig. Import är även räddningsvägen ur
   en spärrad overlay (S2).
   ================================================================ */
export function backupExport(overlay, planVersion, now = "", cfg = null) {
  const b = { kind: "trizone-next-backup", formatVersion: FORMAT_VERSION,
              exported: now, planVersion: planVersion ?? overlay?.planVersion ?? null,
              overlay: structuredClone(overlay ?? emptyOverlay()) };
  if (cfg) {
    b.cfg = structuredClone(cfg);               /* bindningar följer med (D7) */
    /* Fas B-beslut: API-nyckeln är en hemlighet, inte en inställning. Kopior
       hamnar i mail och molnmappar — nyckeln stannar i webbläsaren och skrivs
       in på nytt vid enhetsbyte. athlete-ID och historikfönster är inte hemliga. */
    if (b.cfg.conn) b.cfg.conn = { ...b.cfg.conn, apiKey: "" };
  }
  return b;
}

/* ---------- Beställningsexport (B6, PLANLEVERANS v2.1 §2) ----------
   Komponeras PÅ BEGÄRAN och lagras aldrig. Ger coachdialogen aktiva
   bindningar, protected-lista, motorvärden och benchmarks inför plan-
   leverans — utan att en ny coachtråd behöver trådminne.
   INTEGRITETSLAG: `reason` är hälsodata (spec 1 §5b) och FILTRERAS I KODEN.
   Implementerat som VITLISTA — endast rule / sport / substitute.{quality,easy}
   passerar. Okända fält kan bära hälsodata och släpps därför aldrig igenom,
   oavsett vad de heter. Fixturen i core_test bevisar att reason aldrig läcker. */
export function orderExport({ cfg = {}, plan = null, athlete = null, now = "" } = {}) {
  const bindings = (Array.isArray(cfg.rules) ? cfg.rules : [])
    .filter(r => r && typeof r.rule === "string")
    .map(r => {
      const o = { rule: r.rule };
      if (r.sport !== undefined) o.sport = [].concat(r.sport);
      const sub = pick(r.substitute ?? {}, ["quality", "easy"]);
      if (Object.keys(sub).length) o.substitute = sub;
      return o;
    });
  const engine = {};
  for (const k of Object.keys(ENGINE_FIELDS))
    engine[k] = (cfg.engine ?? {})[k] ?? ENGINE[k];
  const prot = (plan?.sessions ?? [])
    .filter(s => s.protected === true)
    .map(s => pick(s, ["id", "title", "sport", "prio"]));
  const benchmarks = Object.fromEntries(
    Object.entries(benchmarksOf(athlete)).filter(([, v]) => v != null));
  return { kind: "trizone-next-bestallning", formatVersion: FORMAT_VERSION,
           exported: now, athlete: cfg.athlete ?? plan?.athlete ?? null,
           bindings, protected: prot, engine, benchmarks };
}

export function backupImport(raw, plan, now = "") {
  let b;
  try { b = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch (e) { return { errors: [`kopian går inte att läsa: ${e.message}`] }; }
  if (b?.kind !== "trizone-next-backup")
    return { errors: [`inte en TRIZONE Next-säkerhetskopia (kind: ${b?.kind ?? "saknas"})`] };
  if (b.formatVersion !== FORMAT_VERSION)
    return { errors: [`okänd formatversion: ${b.formatVersion} (stödd: ${FORMAT_VERSION})`] };
  const v = validateOverlay(b.overlay);
  if (!v.ok) return { errors: v.errors.map(e => `${e.where}: ${e.why}`) };
  let cfg = null;
  if (b.cfg !== undefined) {
    const cv = validateCfg(b.cfg);
    if (!cv.ok) return { errors: cv.errors.map(e => `cfg · ${e.where}: ${e.why}`) };
    cfg = b.cfg;
  }
  const rec = reconcileOverlay(b.overlay, plan, now);          /* föräldralösa listas, raderas aldrig */
  return { overlay: rec.overlay, orphans: rec.orphans, errors: [],
           exported: b.exported, planVersion: b.planVersion, cfg };
}


/* ================================================================
   IDAG-VYN (0.8.0) — tillståndsberoende hjälte (designspråk §6)
   Ren funktion: (plan, overlay, dateISO) → dagens tillstånd.
   ================================================================ */

const PRIOORD = { A: 0, B: 1, C: 2 };

/* Vilken vecka och dag ett ISO-datum faller på i planen, om någon */
export function planDayOf(plan, dateISO) {
  for (const wk of planWeeks(plan))
    for (let d = 0; d < 7; d++)
      if (sessionDate(plan, { week: wk, day: d }) === dateISO) return { week: wk, day: d };
  return null;
}

/* (plan, overlay, dateISO) →
   { state: "pass" | "done" | "rest" | "off", hero, also, done, next, at }
   pass: minst ett oavklarat pass — hjälten är det högst prioriterade
   done: alla dagens pass utförda/strukna, minst ett utfört
   rest: dagen ligger i planen utan pass — vilodag enligt plan
   off:  datumet ligger utanför planens veckor                       */
export function todayView(plan, overlay, dateISO) {
  const at = planDayOf(plan, dateISO);
  const next = nextSession(plan, overlay, dateISO);
  if (!at) return { state: "off", hero: null, also: [], done: [], next, at: null };
  const v = weekView(plan, overlay, at.week);
  const all = v.days[at.day].sessions;
  const live = all.filter(s => s.status !== "struck");
  const open = live.filter(s => s.status !== "done").sort((a, b) => (PRIOORD[a.prio] ?? 9) - (PRIOORD[b.prio] ?? 9));
  const done = live.filter(s => s.status === "done");
  if (open.length) return { state: "pass", hero: open[0], also: open.slice(1), done, next, at };
  if (done.length) return { state: "done", hero: null, also: [], done, next, at };
  return { state: "rest", hero: null, also: [], done: [], next, at };
}

/* Nästa oavklarade pass efter ett datum — för vilodagens "Nästa:" */
export function nextSession(plan, overlay, dateISO) {
  const out = [];
  for (const wk of planWeeks(plan)) {
    const v = weekView(plan, overlay, wk);
    for (const d of v.days)
      for (const s of d.sessions)
        if (s.status !== "struck" && s.status !== "done" && d.date > dateISO)
          out.push({ ...s, date: d.date });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || (PRIOORD[a.prio] ?? 9) - (PRIOORD[b.prio] ?? 9));
  return out[0] ?? null;
}

/* ---------- RPE: härlett vinner, manuellt är fallback (§5c-mönstret) ---------- */
export function effectiveRpe(overlaySession, activity) {
  const a = activity?.icu_rpe ?? activity?.perceived_exertion;
  if (a != null && a >= 1 && a <= 10) return { value: a, source: "klockan" };
  const m = overlaySession?.rpe;
  if (m != null && m >= 1 && m <= 10) return { value: m, source: "manuell" };
  return null;
}
export const FEEL_LABEL = { 1: "mycket svag", 2: "svag", 3: "normal", 4: "stark", 5: "mycket stark" };

/* ---------- Manuell loggning (matchning §6: pass utan mätdata) ---------- */
export function logResult(plan, overlay, sessionId, { rpe = null, userNote = "" } = {}, now = "") {
  const src = (plan?.sessions ?? []).find(s => s.id === sessionId);
  if (!src) return { error: `okänt pass: ${sessionId}` };
  if (rpe != null && !(rpe >= 1 && rpe <= 10)) return { error: `RPE ${rpe} utanför 1–10` };
  const ov = structuredClone(overlay ?? {});
  const so = (ov.sessions ??= {})[sessionId] ??= {};
  if (so.status === "struck") return { error: "passet är struket — häv strykningen först" };
  so.status = "done";
  if (rpe != null) so.rpe = rpe;
  if (userNote) so.userNote = userNote;
  (so.events ??= []).push({ rule: "manual-log", session: sessionId, action: "warn",
    why: `Markerat utfört manuellt${rpe != null ? ` · RPE ${rpe}` : ""}.`, t: now });
  return { overlay: ov };
}

export function unlogResult(overlay, sessionId, now = "") {
  const ov = structuredClone(overlay ?? {});
  const so = ov.sessions?.[sessionId];
  if (so?.match) return { error: "passet är länkat till en aktivitet — loggningen ägs av matchningen" };
  if (!so || so.status !== "done") return { error: "ingen manuell loggning att ångra" };
  delete so.status; delete so.rpe; delete so.userNote;
  (so.events ??= []).push({ rule: "manual-unlog", session: sessionId, action: "warn",
    why: "Manuell loggning ångrad.", t: now });
  return { overlay: ov };
}


/* ================================================================
   ZONKONFIG-PARITET (matchning §7, 0.8.1)
   Utfallsremsan bygger på intervals.icu:s zonindelning. Speglar den
   inte appens antagande är remsan fel utan att säga det. D6: historik
   läses alltid med dagens fönster — därför granskas dagens konfig.
   ================================================================ */

export const ZONE_COUNT = 5;

/* (aktiviteter) → { ok, checked, mismatches[], why }
   Vi kan inte läsa intervals.icu:s inställningar härifrån (v32 äger anropet),
   men aktiviteternas egen zonvektor avslöjar indelningen: fel antal zoner
   betyder att appens femzonsmodell inte gäller för den aktiviteten. */
export function zoneParity(activities) {
  const checked = [], bad = [];
  for (const a of activities ?? []) {
    const z = a?.icu_hr_zone_times;
    if (!Array.isArray(z) || !z.length) continue;      /* ingen zondata ⇒ inget att granska */
    checked.push(a.id);
    if (z.length !== ZONE_COUNT) bad.push({ id: a.id, zones: z.length, sport: SPORT_MAP[a.type] ?? a.type });
  }
  if (!checked.length) return { ok: true, checked: 0, mismatches: [], why: "ingen zondata att granska" };
  if (!bad.length) return { ok: true, checked: checked.length, mismatches: [],
                            why: `${checked.length} aktiviteter har ${ZONE_COUNT} zoner — paritet` };
  const shapes = [...new Set(bad.map(b => b.zones))].sort((x, y) => x - y);
  const bySport = {};
  for (const b of bad) bySport[b.sport ?? "?"] = (bySport[b.sport ?? "?"] ?? 0) + 1;
  const dist = Object.entries(bySport).map(([k, n]) => `${k} ${n}`).join(" · ");
  return { ok: false, checked: checked.length, mismatches: bad,
           why: `${bad.length} av ${checked.length} aktiviteter har ${shapes.join("/")} zoner (${dist}), appen räknar med ${ZONE_COUNT}` +
                ` — utfallsremsan kan vara felkalibrerad för dessa. Kontrollera PULSzonerna (inte pace) per gren i intervals.icu.` };
}


/* ---------- Full zonparitet (fas B §5.4) ----------
   Dagens vakt räknar bara zonvektorns längd i aktiviteterna. Med egen
   atletprofil kan vi granska sanningen: intervals.icu:s faktiska zongränser.
   Appen har medvetet inget eget zonregister — profilen ÄR zonsanningen (F3,
   produktägarbeslut fas B). Vi läser, redovisar och varnar; vi justerar aldrig. */
export function zoneParityFull(athlete, activities, cfg = {}) {
  const problems = [], rows = [];
  /* Matchning §3: simpuls är ogiltig med optisk handledspuls. Med simdugligt
     bröstband (HRM-Pro/Swim/Tri) slås flaggan på i profilen och sim granskas
     som vilken gren som helst. Undantaget är alltså en INSTÄLLNING, inte en lag. */
  const swimOK = !!cfg.swimHrValid;
  const exempt = sp => sp === "strength" || (sp === "swim" && !swimOK);
  const sports = athlete?.sports ?? null;
  if (!sports || !Object.keys(sports).length)
    return { ...zoneParity(activities), profile: false, swimHrValid: swimOK,
             why: (zoneParity(activities).why) + " · atletprofilen inte hämtad än — gränserna kan inte granskas" };

  for (const [sport, s] of Object.entries(sports)) {
    if (exempt(sport)) {
      rows.push({ sport, zones: s.zones?.length ?? null, bounds: s.zones, lthr: s.lthr, exempt: true });
      continue;
    }
    if (!s.zones) { rows.push({ sport, zones: null, why: "inga pulszoner satta" });
                    problems.push(`${sport}: inga PULSzoner i profilen`); continue; }
    rows.push({ sport, zones: s.zones.length, bounds: s.zones, lthr: s.lthr });
    if (s.zones.length !== ZONE_COUNT)
      problems.push(`${sport}: ${s.zones.length} zoner i profilen, appen räknar med ${ZONE_COUNT}`);
    for (let i = 1; i < s.zones.length; i++)
      if (s.zones[i] <= s.zones[i - 1]) problems.push(`${sport}: zongränserna stiger inte (Z${i}→Z${i + 1})`);
  }

  /* Aktiviteternas vektorlängd mot profilens zonantal, per gren */
  const bySport = {};
  for (const a of activities ?? []) {
    const z = a?.icu_hr_zone_times;
    if (!Array.isArray(z) || !z.length) continue;
    const sp = SPORT_MAP[a.type] ?? a.type;
    (bySport[sp] ??= new Set()).add(z.length);
  }
  for (const [sp, lens] of Object.entries(bySport)) {
    if (exempt(sp)) continue;
    const want = sports[sp]?.zones?.length ?? ZONE_COUNT;
    const bad = [...lens].filter(n => n !== want);
    if (bad.length) problems.push(`${sp}: aktiviteter med ${bad.join("/")} zoner mot profilens ${want}`);
  }

  const shown = rows.map(r => `${r.sport} ${r.zones ?? "–"}${r.lthr ? ` (LTHR ${r.lthr})` : ""}` +
                              (r.exempt ? " (utan pulsremsa)" : "")).join(" · ");
  if (!problems.length)
    return { ok: true, profile: true, swimHrValid: swimOK, rows, mismatches: [],
             checked: (activities ?? []).length, why: `zonparitet mot intervals.icu: ${shown}` };
  return { ok: false, profile: true, swimHrValid: swimOK, rows, mismatches: problems,
           checked: (activities ?? []).length,
           why: problems.join(" · ") + " — rätta i intervals.icu (Settings → Zones) och hämta om." };
}

/* ================================================================
   ÅTERHÄMTNING (fas B §5.3) — alternativ C, produktägarbeslut 2026-08-04
   Två signaler med skilda uppgifter:
     • DAGSSIGNAL  → matar sleep-guard (nivå 1, derived ⇒ motorn FRÅGAR)
     • TRENDSIGNAL → matar recovery-watch (nivå 3, varnar bara)
   Allt mäts mot atletens EGEN baslinje. Absoluta timgränser förekommer inte:
   en småbarnsförälders normalnatt är inte en avvikelse, och en nivå 1-regel
   man lärt sig klicka bort är sämre än ingen regel alls.
   ================================================================ */

export const RECOV = {
  rhrDayDelta: 5,        /* dagssignal: +5 bpm över egen baslinje (regelverk §6) */
  sleepDayDeltaH: 1.5,   /* dagssignal: 1,5 h under egen baslinje */
  baseDays: 30,          /* baslinjefönster */
  minRhrBase: 14, minSleepBase: 10,   /* under detta vilar signalen — ingen falsk precision */
  maxAgeDays: 1,         /* mätning äldre än så är inte "i natt" */
  trendWin: 7, trendDelta: 5,          /* v32:s fälttestade trendmodell, oförändrad */
  minTrendPoints: 20, minTrendRecent: 4, minTrendBase: 14,
  hrvFrac: 0.9, minHrvBase: 7
};

const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const r1 = v => v == null ? null : Math.round(v * 10) / 10;

export function recovery(wellness, todayISO, opts = {}) {
  const R = { ...RECOV, ...opts };
  const rows = (wellness ?? [])
    .filter(w => DATE_RE.test(String(w?.id ?? "")) && w.id <= todayISO)
    .sort((a, b) => a.id < b.id ? -1 : 1);
  const day   = { date: null, rhr: null, rhrBase: null, rhrDelta: null,
                  sleepH: null, sleepBase: null, sleepDelta: null, flags: {}, why: [] };
  const trend = { rhr7: null, rhrBase: null, rhrDelta: null,
                  hrv: null, hrvBase: null, flags: {}, why: [] };
  const cov = { rhrDays: 0, sleepNights: 0, hrvDays: 0 };
  if (!rows.length) return { has: false, day, trend, coverage: cov, why: "ingen wellnessdata" };

  const rhr   = rows.filter(w => Number(w.restingHR) > 0).map(w => ({ d: w.id, v: Number(w.restingHR) }));
  const sleep = rows.filter(w => Number(w.sleepSecs) > 0).map(w => ({ d: w.id, v: Number(w.sleepSecs) / 3600 }));
  const hrv   = rows.filter(w => Number(w.hrv) > 0).map(w => ({ d: w.id, v: Number(w.hrv) }));
  cov.rhrDays = rhr.length; cov.sleepNights = sleep.length; cov.hrvDays = hrv.length;

  const fresh = arr => {                       /* senaste mätningen, om den är färsk nog */
    const last = arr[arr.length - 1];
    if (!last) return null;
    const cut = dayShift(todayISO, -R.maxAgeDays);
    return cut && last.d >= cut ? last : null;
  };
  const baseWin = (arr, exceptDate) => {
    const from = dayShift(todayISO, -R.baseDays);
    return arr.filter(x => x.d >= from && x.d !== exceptDate).map(x => x.v);
  };

  /* ---- Dagssignal: i natt mot din egen normal ---- */
  const lastR = fresh(rhr);
  if (lastR) {
    const base = baseWin(rhr, lastR.d);
    if (base.length >= R.minRhrBase) {
      const b = median(base);
      day.date = lastR.d; day.rhr = lastR.v; day.rhrBase = r1(b); day.rhrDelta = r1(lastR.v - b);
      if (lastR.v - b >= R.rhrDayDelta) { day.flags.rhr = true;
        day.why.push(`Vilopulsen i morse ${lastR.v} mot din normal ${Math.round(b)}`); }
    }
  }
  const lastS = fresh(sleep);
  if (lastS) {
    const base = baseWin(sleep, lastS.d);
    if (base.length >= R.minSleepBase) {
      const b = median(base);
      day.date ??= lastS.d; day.sleepH = r1(lastS.v); day.sleepBase = r1(b); day.sleepDelta = r1(lastS.v - b);
      day.sleep3 = r1(mean(sleep.slice(-3).map(x => x.v)));    /* v32:s inforuta: Sömn 3 nätter */
      if (b - lastS.v >= R.sleepDayDeltaH) { day.flags.sleep = true;
        day.why.push(`Sömnen ${r1(lastS.v)} h mot din normal ${r1(b)} h`); }
    }
  }

  /* ---- Trendsignal: v32:s modell, oförändrad ---- */
  if (rhr.length >= R.minTrendPoints) {
    const cut = dayShift(todayISO, -R.trendWin);
    const recent = rhr.filter(x => x.d >= cut).map(x => x.v);
    const base = rhr.filter(x => x.d < cut && x.d >= dayShift(todayISO, -(R.trendWin + R.baseDays))).map(x => x.v);
    if (recent.length >= R.minTrendRecent && base.length >= R.minTrendBase) {
      const m = mean(recent), b = mean(base);
      trend.rhr7 = r1(m); trend.rhrBase = r1(b); trend.rhrDelta = r1(m - b);
      if (m - b > R.trendDelta) { trend.flags.rhr = true;
        trend.why.push(`Vilopulsen ligger ${r1(m - b)} slag över din ${R.baseDays}-dagarsnormal (${Math.round(m)} mot ${Math.round(b)})`); }
    }
  }
  const lastH = hrv[hrv.length - 1];
  if (lastH) {
    const base = baseWin(hrv, null);
    if (base.length >= R.minHrvBase) {
      const b = mean(base);
      trend.hrv = Math.round(lastH.v); trend.hrvBase = Math.round(b);
      if (lastH.v < b * R.hrvFrac) { trend.flags.hrv = true;
        trend.why.push(`HRV ${Math.round(lastH.v)} ms mot din baslinje ${Math.round(b)} ms`); }
    }
  }

  const has = !!(day.rhr != null || day.sleepH != null || trend.rhr7 != null || trend.hrv != null);
  return { has, day, trend, coverage: cov,
           why: has ? "återhämtningsdata läst" : "för lite wellnessdata för baslinjer än" };
}

/* Motorflaggor ur wellness. Dagssignalen är derived ⇒ motorn frågar, du svarar (D2). */
export function wellnessFlags(wellness, todayISO, opts = {}) {
  const r = recovery(wellness, todayISO, opts);
  const out = [];
  if (!r.has) return out;
  if (r.day.flags.rhr || r.day.flags.sleep)
    out.push({ id: "sleep-guard", source: "derived", date: todayISO, why: r.day.why.join(" · ") });
  if (r.trend.flags.rhr || r.trend.flags.hrv)
    out.push({ id: "recovery-watch", source: "derived", why: r.trend.why.join(" · ") });
  return out;
}

/* ================================================================
   PMC + EFFEKTIVITET (0.12.0)
   ================================================================ */

/* PMC: CTL/ATL kommer FÄRDIGRÄKNADE från intervals.icu (wellness-fältet).
   Vi räknar dem aldrig om — en andra beräkning av samma sak divergerar
   garanterat (M2/effSeries-principen). TSB är den enda härledningen. */
export function pmcSeries(wellness, todayISO, days = 84) {
  const from = dayShift(todayISO, -days);
  return (wellness ?? [])
    .filter(w => DATE_RE.test(String(w?.id ?? "")) && w.id >= from && w.id <= todayISO
                 && Number.isFinite(Number(w.ctl)) && Number.isFinite(Number(w.atl)))
    .sort((a, b) => a.id < b.id ? -1 : 1)
    .map(w => ({ date: w.id, ctl: Math.round(Number(w.ctl) * 10) / 10,
                 atl: Math.round(Number(w.atl) * 10) / 10,
                 tsb: Math.round((Number(w.ctl) - Number(w.atl)) * 10) / 10 }));
}

/* TSB-tolkning. Intervallen är riktvärden ur träningslitteraturen, inte
   sanningar — de redovisas därför alltid tillsammans med siffran. */
export const TSB_BANDS = [
  { max: -25, key: "deep",    label: "Djup belastning" },
  { max: -5,  key: "build",   label: "I bygge" },   /* demons intervall: −5 till −20 */
  { max: 5,   key: "neutral", label: "Neutral" },
  { max: 25,  key: "fresh",   label: "Frisk" },
  { max: Infinity, key: "detrain", label: "Otränad risk" }
];

export function pmcStatus(wellness, todayISO, days = 84) {
  const s = pmcSeries(wellness, todayISO, days);
  if (!s.length)
    return { has: false, series: [], why: "intervals.icu har ingen CTL/ATL i fönstret än." };
  const last = s[s.length - 1];
  const band = TSB_BANDS.find(b => last.tsb <= b.max);
  const wk = s.length > 7 ? s[s.length - 8] : s[0];
  const dCtl = Math.round((last.ctl - wk.ctl) * 10) / 10;
  return { has: true, series: s, ...last, band: band.key, label: band.label,
           ctlDelta: dCtl, days,
           why: `Form (TSB) ${last.tsb > 0 ? "+" : ""}${last.tsb} = fitness ${last.ctl} − trötthet ${last.atl}. `
              + `Fitness ${dCtl >= 0 ? "+" : ""}${dCtl} på en vecka. `
              + `CTL och ATL kommer färdiga från intervals.icu — appen räknar dem aldrig om.` };
}

/* Pulsfönster HÄRLEDS ur atletprofilens zongränser (produktägarbeslut 2026-08-05):
   atletagnostiskt, och följer automatiskt med när trösklarna testas om.
   D6 gäller: historiken läses alltid med dagens fönster. */
export function zoneBand(athlete, sport, zone) {
  const z = athlete?.sports?.[sport]?.zones;
  if (!Array.isArray(z) || zone < 1 || zone > z.length) return null;
  return { lo: zone === 1 ? 0 : z[zone - 2] + 1, hi: z[zone - 1], zone };
}

/* Minsta kvadrat på (index, värde) — ren, testbar, ingen bibliotekstro. */
function fitLine(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  if (!den) return null;
  const slope = num / den;
  return { slope, at: x => my + slope * (x - mx) };
}

export const EFF = { minMinutes: 30, minSwimMeters: 600, minPoints: 4 };

/* Aerob effektivitet: samma puls, bättre output = progression.
   Löpning → tempo · cykel → watt (ENDAST med mätare) · sim → tempo (distansurval,
   aldrig pulsurval, eftersom simpuls inte är mätdata). */
export function effTrend(activities, athlete, sport, zone = 2, opts = {}) {
  const O = { ...EFF, ...opts };
  const band = sport === "swim" ? null : zoneBand(athlete, sport, zone);
  if (sport !== "swim" && !band)
    return { has: false, points: [], sport, zone,
             why: `Inga pulszoner för ${sport} i intervals.icu — fönstret kan inte härledas.` };

  const raw = [], skipped = { est: 0, trainer: 0, short: 0, band: 0, window: 0 };
  for (const a of activities ?? []) {
    if (SPORT_MAP[a.type] !== sport) continue;
    const secs = Number(a.moving_time) || 0, dist = Number(a.distance) || 0;
    const date = matchDate(a.start_date_local);
    if (!date) continue;
    if (O.from && date < O.from) { skipped.window++; continue; }

    if (sport === "swim") {
      if (dist < O.minSwimMeters) { skipped.short++; continue; }
      raw.push({ date, y: (secs / dist) * 100, unit: "s/100m" });   /* lägre = bättre */
      continue;
    }
    if (secs < O.minMinutes * 60) { skipped.short++; continue; }
    const hr = Number(a.average_heartrate ?? a.icu_average_hr);
    if (!Number.isFinite(hr) || hr < band.lo || hr > band.hi) { skipped.band++; continue; }

    if (sport === "bike") {
      /* Ärvd regel: watt utan mätare är Stravas estimat och används ALDRIG.
         BUGGFIX 2026-08-05 (fältverifierad: 34 spinningpass försvann): API-fältet
         heter device_watts — v32:s fälttestade läsning, rad 2028. has_device_watts
         var specens BEGREPPSNAMN, inte fältnamnet. Båda accepteras. */
      if (a.has_device_watts !== true && a.device_watts !== true) { skipped.est++; continue; }
      const w = Number(a.average_watts ?? a.icu_average_watts);
      if (!Number.isFinite(w) || w <= 0) { skipped.est++; continue; }
      raw.push({ date, y: w, unit: "W", hr });                       /* högre = bättre */
    } else {
      /* Löpband blandas aldrig med utomhus — estimatdistans mot GPS-distans */
      if (a.trainer === true) { skipped.trainer++; continue; }
      if (dist < 1000) { skipped.short++; continue; }
      raw.push({ date, y: (secs / dist) * 1000, unit: "s/km", hr }); /* lägre = bättre */
    }
  }

  raw.sort((a, b) => a.date < b.date ? -1 : 1);
  const notes = [];
  if (skipped.est) notes.push(`${skipped.est} cykelpass utan wattmätare uteslutna — estimat är inte mätvärden`);
  if (skipped.trainer) notes.push(`${skipped.trainer} löpbandspass uteslutna — estimatdistans blandas aldrig med GPS`);

  if (raw.length < O.minPoints)
    return { has: false, points: raw, sport, zone, band, skipped, lowerBetter: sport !== "bike",
             why: `För få pass i fönstret än (${raw.length} av minst ${O.minPoints}).`
                + (notes.length ? " " + notes.join(" · ") + "." : "") };

  const pts = raw.map((p, i) => ({ x: i, y: p.y }));
  const line = fitLine(pts);
  const first = line ? line.at(0) : raw[0].y, last = line ? line.at(pts.length - 1) : raw[raw.length - 1].y;
  const lowerBetter = sport !== "bike";
  const better = lowerBetter ? last < first : last > first;
  const unit = raw[0].unit;
  const fmt = v => unit === "W" ? `${Math.round(v)} W`
    : unit === "s/km" ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}/km`
    : `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}/100 m`;

  return { has: true, points: raw, sport, zone, band, unit, lowerBetter, skipped,
           first, last, from: raw[0].date, to: raw[raw.length - 1].date, n: raw.length, better,
           why: `${fmt(first)} → ${fmt(last)} över ${raw.length} pass `
              + (band ? `med snittpuls ${band.lo}–${band.hi} (Z${zone} ur intervals.icu), ` : `på ≥ ${O.minSwimMeters} m, `)
              + `${raw[0].date} till ${raw[raw.length - 1].date}. `
              + `${better ? "Samma puls, bättre output — progression." : "Ingen förbättring i fönstret."}`
              + (notes.length ? " " + notes.join(" · ") + "." : ""),
           fmt };
}

/* Belastning per dag och gren (TSS ur icu_training_load) — v32:s stapelmodell.
   En rad per dag i fönstret, nollor där inget hände, så staplarna får rätt raster. */
export function dailyLoads(activities, todayISO, days) {
  const from = dayShift(todayISO, -days);
  if (!from) return [];
  const map = {};
  for (const a of activities ?? []) {
    const d = matchDate(a.start_date_local);
    if (!d || d < from || d > todayISO) continue;
    const sp = SPORT_MAP[a.type]; if (!sp) continue;
    const load = Number(a.icu_training_load) || 0; if (load <= 0) continue;
    map[d] ??= { date: d, swim: 0, bike: 0, run: 0, strength: 0, total: 0 };
    map[d][sp] += load; map[d].total += load;
  }
  const out = [];
  for (let d = from; d && d <= todayISO; d = dayShift(d, 1))
    out.push(map[d] ?? { date: d, swim: 0, bike: 0, run: 0, strength: 0, total: 0 });
  return out;
}

/* ================================================================
   STATUSGRID (0.11.0) — Analys-vyns fyra dimensioner
   Demons statusgrid är Nexts arvtagare till v32:s flaggpanel. Rena
   funktioner: varje siffra går att härleda, ingen skattas.
   V28-REGELN GÄLLER: ingen procentsiffra utan sitt tidsfönster.
   ================================================================ */

const mondayOf = (iso) => {                    /* datum → måndagen i dess ISO-vecka */
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  if (isNaN(d)) return null;
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/* Träningstid per ISO-vecka, nyaste sist. sport=null ⇒ alla grenar. */
export function weeklyLoad(activities, todayISO, weeks = 8, sport = null) {
  const thisMon = mondayOf(todayISO);
  if (!thisMon) return [];
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const mon = dayShift(thisMon, -7 * i), sun = dayShift(mon, 6);
    const mins = (activities ?? []).filter(a => {
      const d = matchDate(a.start_date_local);
      if (!d || d < mon || d > sun) return false;
      return !sport || SPORT_MAP[a.type] === sport;
    }).reduce((n, a) => n + (Number(a.moving_time) || 0) / 60, 0);
    out.push({ monday: mon, minutes: Math.round(mins), hours: Math.round(mins / 6) / 10 });
  }
  return out;
}

/* Belastning: innevarande vecka mot rullande 3-veckorssnitt, mot profilens tak. */
export function loadStatus(activities, todayISO, cfg = {}) {
  const capPct = cfg.volumeCapPct ?? ENGINE.volumeCapPct;
  const all = weeklyLoad(activities, todayISO, 8);
  const run = weeklyLoad(activities, todayISO, 8, "run");
  if (!all.length || all.every(w => !w.minutes))
    return { key: "load", label: "Belastning", state: "idle", value: "Ingen data",
             why: "Inga aktiviteter i fönstret.", weeks: all, has: false };
  const prev3 = run.slice(-4, -1).map(w => w.minutes);
  const base = prev3.length ? prev3.reduce((a, b) => a + b, 0) / prev3.length : 0;
  const now = run[run.length - 1].minutes;
  const pct = base ? Math.round((now / base) * 100) : null;
  const hh = m => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;
  const over = pct != null && pct > capPct;
  const trend = pct == null ? "" : ` · ${pct >= 100 ? "↗" : "↘"} ${pct - 100 > 0 ? "+" : ""}${pct - 100} %`;
  return { key: "load", label: "Belastning", state: over ? "warn" : "ok",
           value: (over ? "Över taket" : "I nivå") + trend, weeks: all, runWeeks: run, pct, capPct,
           why: base
             ? `Löpning denna vecka ${hh(now)} h mot 3-veckorssnittet ${hh(Math.round(base))} h. `
               + (over ? `ÖVER volymtaket (${capPct} %).` : `Under volymtaket (${capPct} %).`)
             : `Löpning denna vecka ${hh(now)} h. För kort historik för ett 3-veckorssnitt än.`,
           has: true };
}

/* Intensitet ur UTFALL (matchning M-U: verkligheten räknas, även oplanerat).
   Sim utan giltig pulsdata hålls utanför och det redovisas — annars vore
   siffran en blandning av mätt och ogiltigt. */
export function intensityStatus(activities, todayISO, cfg = {}, days = 28, plan = null) {
  const ph = phaseLowShare(plan, { date: todayISO }, cfg);
  const target = ph.target;
  const from = dayShift(todayISO, -days);
  const swimOK = !!cfg.swimHrValid;
  let z = [0, 0, 0, 0, 0], skippedSwim = 0, used = 0;
  for (const a of activities ?? []) {
    const d = matchDate(a.start_date_local);
    if (!d || d < from || d > todayISO) continue;
    const zt = a.icu_hr_zone_times;
    if (!Array.isArray(zt) || !zt.length) continue;
    if (SPORT_MAP[a.type] === "swim" && !swimOK) { skippedSwim++; continue; }
    for (let i = 0; i < 5 && i < zt.length; i++) z[i] += (Number(zt[i]) || 0) / 60;
    used++;
  }
  const total = z.reduce((a, b) => a + b, 0);
  if (!total)
    return { key: "intensity", label: "Intensitet", state: "idle", value: "Ingen zondata",
             why: `Inga aktiviteter med pulszoner de senaste ${days} dagarna.`, has: false, zones: z };
  const share = (z[0] + z[1]) / total;
  const low = Math.round(share * 100);
  return { key: "intensity", label: "Intensitet", state: share >= target ? "ok" : "warn",
           value: `${low} % lågintensivt`, zones: z, share, target, window: days, used,
           why: `${low} % av ${Math.round(total)} zonminuter de senaste ${days} dagarna låg i Z1–Z2. `
              + (ph.source === "block" ? `Fasens mål ${Math.round(target * 100)} % (${ph.label}).`
                                       : `Mål ${Math.round(target * 100)} % (profil).`)
              + (skippedSwim ? ` ${skippedSwim} simpass utanför — optisk puls i vatten är inte mätdata.` : ""),
           has: true };
}

/* Dagsform: recovery()-signalerna, tolkade. */
export function formStatus(recov) {
  if (!recov?.has)
    return { key: "form", label: "Dagsform", state: "idle", value: "Ingen data",
             why: "Ingen wellnessdata hämtad än.", has: false };
  const d = recov.day, t = recov.trend;
  const dayOff = !!(d.flags.rhr || d.flags.sleep);
  const trendOff = !!(t.flags.rhr || t.flags.hrv);
  const parts = [];
  if (d.rhr != null) parts.push(`Vilopuls i morse ${d.rhr} mot normalen ${d.rhrBase}`);
  if (d.sleepH != null) parts.push(`sömn ${d.sleepH} h mot normalen ${d.sleepBase} h`);
  if (t.hrv != null) parts.push(`HRV ${t.hrv} ms mot baslinjen ${t.hrvBase} ms`);
  const tail = dayOff ? " Motorn föreslår nedväxling av dagens kvalitetspass — du bestämmer."
             : trendOff ? " Trenden avviker: volym går bra, spara kvaliteten tills den vänder."
             : " Allt inom din egen baslinje.";
  return { key: "form", label: "Dagsform",
           state: dayOff ? "warn" : trendOff ? "warn" : "ok",
           value: dayOff ? "Avvikande" : trendOff ? "Trend att bevaka" : "Normal",
           why: parts.join(" · ") + "." + tail, has: true, dayOff, trendOff };
}

/* Skaderisk: ingen bedömning görs förrän regelmotorn är kopplad i UI (fas 4).
   Kortet finns för layoutens skull men bär INTE statusfärg — en grön prick
   utan bedömning bakom vore ett påstående appen inte kan stå för. */
export function injuryStatus() {
  return { key: "injury", label: "Skaderisk", state: "idle", value: "Inte kopplad än",
           why: "Bindningar och aktiva regler visas här när regelmotorn får sitt gränssnitt. "
              + "Tills dess görs ingen bedömning — och då visas ingen.", has: false };
}

export function statusGrid(activities, recov, todayISO, cfg = {}, plan = null) {
  return [loadStatus(activities, todayISO, cfg),
          intensityStatus(activities, todayISO, cfg, 28, plan),
          formStatus(recov),
          injuryStatus()];
}

/* ================================================================
   ATLETVAKT (D-M2, 0.9.0) — fel plan ska aldrig laddas tyst
   ================================================================ */
export function athleteGuard(plan, cfg) {
  const planAthlete = plan?.athlete ?? null;
  const profile = cfg?.athlete ?? null;
  if (!planAthlete) return { ok: true, why: "planen anger ingen atlet — vakten vilar" };
  if (!profile) return { ok: true, adopt: planAthlete,
                         why: `profilen kopplas till atlet "${planAthlete}"` };
  if (profile === planAthlete) return { ok: true, why: `atlet "${profile}"` };
  return { ok: false, why: `planen gäller "${planAthlete}" men profilen tillhör "${profile}"` +
    ` — planen laddas inte. Byt atlet i Inställningar eller lägg rätt plan i repot.` };
}

/* Livslägen: aktivering med ögonblicksbild (spec 1 §9) */
export const LIFE_MODES = {
  "mode-vacation": { label: "Semester", why: "B-pass stryks, A-pass går till underhållsdos." },
  "mode-reduced":  { label: "Reducerad vecka", why: "Veckan komprimeras till A-pass." },
  "illness-stop":  { label: "Sjuk", why: "Allt i spannet stryks. Feber tränas aldrig igenom." },
  "tissue-freeze": { label: "Känning", why: "Berörd gren ersätts tills läget hävs." }
};

export function activateMode(overlay, rule, { from, to = null } = {}, now = "") {
  if (!LIFE_MODES[rule]) return { error: `okänt läge: ${rule}` };
  if (!from) return { error: "läget saknar startdatum" };
  const ov = structuredClone(overlay ?? {});
  ov.modes ??= {}; ov.modes.active ??= [];
  const key = rule + "@" + from;
  if (ov.modes.active.some(m => m.rule + "@" + m.from === key)) return { error: "läget är redan aktivt" };
  ov.modes.active.push({ rule, from, to, t: now });
  (ov.modes.log ??= []).push({ rule: "mode-on", session: null, action: "activate",
    why: `${LIFE_MODES[rule].label} aktiverat från ${from}${to ? ` till ${to}` : ""}.`, t: now });
  return { overlay: ov, key };
}

/* ================================================================
   DYGNSFLAGGOR (B19-1, 0.19.0) — dagsform, skild från LIFE_MODES.
   Tre semantiker, tre mekanismer: periodläge (snapshot, manuell av),
   dygnsflagga (datumstämplad, släpper vid midnatt), action (tillståndslös).
   Flaggan lagras i overlayen (ingen ny nyckel), utvärderas mot DAGENS
   datum vid varje anrop — aldrig boot-tillstånd (0.18.1-läxan).
   En framtida derived-trigger (RHR-fråga, D2) landar i samma flagga:
   ett beteende, två ingångar.
   ================================================================ */
export const DAY_FLAGS = {
  sleep: { label: "Sov dåligt", rule: "sleep-guard",
           why: "Dagens kvalitetspass växlas ned till Z2. Gäller idag — släpper vid midnatt." }
};
const dayKey = (flag, date) => `dayflag:${flag}@${date}`;

export function setDayFlag(overlay, flag, date, now = "") {
  if (!DAY_FLAGS[flag]) return { error: `okänd dagsflagga: ${flag}` };
  if (!DATE_RE.test(String(date))) return { error: "dagsflaggan saknar giltigt datum" };
  const ov = structuredClone(overlay ?? {});
  ov.modes ??= {};
  const prev = ov.modes.dayflags ?? [];
  if (prev.some(f => f.flag === flag && f.date === date)) return { error: "flaggan är redan satt" };
  /* Städa passerade dagars flaggor + snapshots: dagen hände med flaggan,
     inget ska återställas i efterhand. */
  for (const f of prev) if (f.date !== date && ov.modes.snapshots)
    delete ov.modes.snapshots[dayKey(f.flag, f.date)];
  ov.modes.dayflags = [...prev.filter(f => f.date === date), { flag, date, t: now }];
  (ov.modes.log ??= []).push({ rule: "dayflag-on", session: null, action: "activate",
    why: `${DAY_FLAGS[flag].label} — gäller ${date}.`, t: now });
  return { overlay: ov, key: dayKey(flag, date) };
}

export function clearDayFlag(overlay, flag, date, now = "") {
  const ov = structuredClone(overlay ?? {});
  ov.sessions ??= {}; ov.modes ??= {};
  const f = (ov.modes.dayflags ?? []).find(x => x.flag === flag && x.date === date);
  if (!f) return ov;
  restoreSnapshot(ov, dayKey(flag, date), f.t ?? "", now,
    "Flaggan släppt — användarens manuella version behålls.",
    "Flaggan släppt — föregående tillstånd återställt.");
  ov.modes.dayflags = ov.modes.dayflags.filter(x => !(x.flag === flag && x.date === date));
  (ov.modes.log ??= []).push({ rule: "dayflag-off", session: null, action: "deactivate",
    why: `${DAY_FLAGS[flag].label} släppt för ${date}.`, t: now });
  return ov;
}

export const dayFlagActive = (overlay, flag, todayISO) =>
  (overlay?.modes?.dayflags ?? []).some(f => f.flag === flag && f.date === todayISO);

/* Motorflaggor ur dygnsflaggorna. Datumet utvärderas VID VARJE anrop:
   en flagga satt igår är inert idag, oavsett hur länge appen stått öppen. */
export function dayFlagEngineFlags(overlay, todayISO) {
  return (overlay?.modes?.dayflags ?? [])
    .filter(f => DAY_FLAGS[f.flag] && f.date === todayISO)
    .map(f => ({ id: DAY_FLAGS[f.flag].rule, source: "manual", date: f.date,
                 modeKey: dayKey(f.flag, f.date) }));
}


/* ================================================================
   MÅNADSVYN (0.9.2, designspråk §7) — ren kalenderfunktion
   ================================================================ */
export const MONTHNAMES = ["Januari","Februari","Mars","April","Maj","Juni",
  "Juli","Augusti","September","Oktober","November","December"];

/* Vilka månader planen spänner över, i ordning: ["2026-08", …] */
export function planMonths(plan) {
  const out = new Set();
  for (const wk of planWeeks(plan))
    for (let d = 0; d < 7; d++) {
      const iso = sessionDate(plan, { week: wk, day: d });
      if (iso) out.add(iso.slice(0, 7));
    }
  return [...out].sort();
}

/* (plan, overlay, "YYYY-MM") → { ym, label, rows:[{week, days:[{date, inMonth, at, dots}]}] }
   Måndagsstartade rader; dots = { sport, done } per icke-struket pass. */
export function monthView(plan, overlay, ym) {
  const [Y, M] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(Y, M - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first); start.setUTCDate(1 - lead);
  const cache = new Map();
  const rows = [];
  for (let r = 0; r < 6; r++) {
    const days = []; let weekNo = null;
    for (let c = 0; c < 7; c++) {
      const d = new Date(start); d.setUTCDate(start.getUTCDate() + r * 7 + c);
      const iso = d.toISOString().slice(0, 10);
      const at = planDayOf(plan, iso);
      let dots = [];
      if (at) {
        if (!cache.has(at.week)) cache.set(at.week, weekView(plan, overlay, at.week));
        dots = cache.get(at.week).days[at.day].sessions
          .filter(s => s.status !== "struck")
          .map(s => ({ sport: s.sport, done: s.status === "done" }));
        weekNo ??= at.week;
      }
      days.push({ date: iso, inMonth: d.getUTCMonth() === M - 1, at, dots });
    }
    if (days.some(x => x.inMonth)) rows.push({ week: weekNo, days });
  }
  return { ym, label: `${MONTHNAMES[M - 1]} ${Y}`, rows };
}


/* ================================================================
   GARDINEN (0.9.3) — månadsvyn följer fingret
   Ren tillståndsmaskin, samma mönster som dragReduce. UI:t mappar
   progress 0–1 till höjd; reducern vet inget om pixlar utom spannet.
   ================================================================ */

export const CURTAIN = { range: 260, tapMax: 6, flickVel: 0.5, commitAt: 0.4 };
export const curtainIdle = { phase: "idle", y0: 0, t0: 0, open: false, progress: 0, commit: null };

export function curtainReduce(c, ev) {
  switch (ev.type) {
    case "down":
      return { phase: "drag", y0: ev.y, t0: ev.t ?? 0, open: !!ev.open,
               progress: ev.open ? 1 : 0, commit: null, moved: false };
    case "move": {
      if (c.phase !== "drag") return c;
      const dy = ev.y - c.y0;
      const raw = c.open ? 1 + dy / CURTAIN.range : dy / CURTAIN.range;
      return { ...c, moved: c.moved || Math.abs(dy) > CURTAIN.tapMax,
               progress: Math.max(0, Math.min(1, raw)), lastY: ev.y, lastT: ev.t ?? c.t0 };
    }
    case "up": {
      if (c.phase !== "drag") return { ...curtainIdle };
      const dy = (ev.y ?? c.lastY ?? c.y0) - c.y0;
      const dt = Math.max(1, (ev.t ?? c.lastT ?? c.t0) - c.t0);
      if (!c.moved && Math.abs(dy) <= CURTAIN.tapMax)
        return { ...curtainIdle, commit: c.open ? "close" : "open", tap: true };   /* tryck togglar (§9) */
      const vel = dy / dt;                                    /* px/ms, tecken = riktning */
      if (Math.abs(vel) >= CURTAIN.flickVel)
        return { ...curtainIdle, commit: vel > 0 ? "open" : "close" };
      return { ...curtainIdle, commit: c.progress >= CURTAIN.commitAt ? "open" : "close" };
    }
    case "cancel":
      return { ...curtainIdle, commit: c.phase === "drag" ? (c.open ? "open" : "close") : null };
    default:
      return c;
  }
}
