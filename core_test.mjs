/* TRIZONE Next — core_test.mjs
   T1: testselen föds med appen. Fixturnummer refererar matchningsspec §10.
   Körning: node core_test.mjs */
import { zoneDist, windowOf, matchDate, validatePlan, matchScore, assignMatches,
         detectDuplicates, effectiveSession, activitySane, MATCH_T } from "./core.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ` (fick ${JSON.stringify(a)}, väntade ${JSON.stringify(b)})`); }

/* ---------- zoneDist (M2) ---------- */
eq(zoneDist([[1,12],[4,6],[1,2],[4,6],[1,8]]), [22,0,0,12,0], "zoneDist: segment aggregeras per zon");
eq(zoneDist([10,20,5,0,0]), [10,20,5,0,0], "zoneDist: färdig fördelning passerar orörd");
eq(zoneDist([[9,10],[0,5],[2,-3]]), [0,0,0,0,0], "zoneDist: ogiltiga segment ignoreras");
eq(zoneDist(null), [0,0,0,0,0], "zoneDist: null → tom fördelning");

/* ---------- windowOf + matchDate ---------- */
eq(windowOf("2026-10-14T06:45:00"), "Morgon", "windowOf: 06:45 → Morgon");
eq(windowOf("2026-10-14T10:30:00"), "Lunch", "windowOf: 10:30 exakt → Lunch (gräns tillhör nästa)");
eq(windowOf("2026-10-14T14:29:00"), "Lunch", "windowOf: 14:29 → Lunch");
eq(windowOf("2026-10-14T18:05:00"), "Kväll", "windowOf: 18:05 → Kväll");
eq(windowOf("2026-10-14T09:00:00",{morgonEnd:"08:00"}), "Lunch", "windowOf: profilgräns styr (Davids schema)");
eq(matchDate("2026-10-15T00:40:00"), "2026-10-14", "fixtur 13: midnattspass räknas till kvällens datum");
eq(matchDate("2026-10-14T19:00:00"), "2026-10-14", "matchDate: normal kväll orörd");

/* ---------- validatePlan (planformat §8) ---------- */
const plan = JSON.parse(readFileSync("plan.json","utf8"));
ok(validatePlan(plan).ok, "referensplanen validerar");
const broken = JSON.parse(readFileSync("plan_broken.json","utf8"));
const vb = validatePlan(broken);
ok(!vb.ok && vb.errors.length === 4, "trasig plan: exakt 4 fel hittas");
ok(vb.errors.some(e=>e.msg.includes("34 min ≠ duration 50")), "rotorsak: profilsumma mot duration");
ok(vb.errors.some(e=>e.msg.includes('okänd gren: "löpning"')), "rotorsak: okänd gren namnges");
ok(vb.errors.some(e=>e.msg.includes("vecka 99")), "rotorsak: veckoreferens pekas ut");
ok(vb.errors.some(e=>e.msg.includes("dubblerat pass-id")), "rotorsak: id-kollision pekas ut");

/* ---------- Poängmodellen ---------- */
const cfg = { dateOfSession: s => s.date };
const runSess = { id:"r1", sport:"run", durationMin:50, slot:"Kväll", date:"2026-10-15", title:"Löpintervaller 4×6 min tröskel", status:"planned" };
const runAct  = { id:101, type:"Run", start_date_local:"2026-10-15T18:10:00", moving_time:52*60, distance:9800, name:"Kvällens intervaller" };
const s1 = matchScore(runSess, runAct, cfg);
ok(s1 >= MATCH_T.auto, `fixtur 1: exakt match ⇒ auto (poäng ${s1})`);

const dayOff = { ...runAct, id:102, start_date_local:"2026-10-16T18:10:00", moving_time:35*60 };
const s2 = matchScore(runSess, dayOff, cfg);
ok(s2 >= MATCH_T.ask && s2 < MATCH_T.auto, `frågezonen: ±1 dag + kortare ⇒ fråga (poäng ${s2})`);

const swimAct = { id:103, type:"Swim", start_date_local:"2026-10-15T18:10:00", moving_time:50*60, distance:2000 };
eq(matchScore(runSess, swimAct, cfg), 0, "grengrind: sim mot löppass ⇒ 0");

const farAct = { ...runAct, id:104, start_date_local:"2026-10-18T18:10:00" };
eq(matchScore(runSess, farAct, cfg), 0, "kandidatfönster: > ±1 dag ⇒ 0");

/* fixtur 2b: manuellt kortat pass matchar mot justerad duration */
const shortened = effectiveSession(runSess, { adjust:{ durationMin:40 } });
const act40 = { ...runAct, id:105, moving_time:42*60 };
ok(matchScore(shortened, act40, cfg) >= MATCH_T.auto, "fixtur 2b: kortat 60→40 ger full poäng mot 42 min");

/* fixtur 2: flyttat pass — effectiveSession bär nya läget */
const moved = effectiveSession(runSess, { moved:{ day:4, slot:"Morgon" } });
eq([moved.day, moved.slot], [4,"Morgon"], "fixtur 2: överlagrad flytt läses");

/* fixtur 8: ersättningspass matchar ersättningens gren */
const subbed = effectiveSession(runSess, { adjust:{ sport:"bike" } });
const bikeAct = { id:106, type:"Ride", start_date_local:"2026-10-15T18:10:00", moving_time:50*60, distance:28000 };
ok(matchScore(subbed, bikeAct, cfg) >= MATCH_T.auto, "fixtur 8: substitute ⇒ match mot cykel");

/* ---------- Dubbletter (fixtur 4) ---------- */
const watch = { id:201, type:"Run", start_date_local:"2026-10-15T18:10:00", moving_time:3120, distance:9800, average_heartrate:158 };
const phone = { id:202, type:"Run", start_date_local:"2026-10-15T18:12:00", moving_time:3060, distance:9700 };
const dups = detectDuplicates([watch, phone]);
eq(dups, [{primary:201, secondary:202}], "fixtur 4: klocka+telefon ⇒ dubblett, rikast data primär");

/* ---------- assignMatches ---------- */
const sessions = [
  runSess,
  { id:"b1", sport:"bike", durationMin:150, slot:"Morgon", date:"2026-10-17", title:"Cykel lång Z2", status:"planned" },
  { id:"x1", sport:"run", durationMin:35, slot:"Kväll", date:"2026-10-18", title:"Lugn löpning", status:"struck" }
];
const acts = [
  runAct, watch, phone,
  { id:301, type:"Ride", start_date_local:"2026-10-17T08:15:00", moving_time:9100, distance:71000, name:"Långpass Z2" },
  { id:302, type:"Run", start_date_local:"2026-10-18T18:00:00", moving_time:34*60, distance:6400, name:"Lugn löpning" }
];
const r = assignMatches(sessions, acts, cfg);
ok(r.links.some(l=>l.sessionId==="b1"&&l.activityId===301), "cykeln automatchas");
ok(!r.links.some(l=>l.sessionId==="x1") && !r.questions.some(q=>q.sessionId==="x1"), "fixtur 5 (M3): struket pass matchas aldrig");
ok(r.unplanned.includes(302), "fixtur 5/11: aktivitet på struket pass ⇒ utanför plan");
ok(!r.links.some(l=>l.activityId===202) && !r.unplanned.includes(202), "dubblettens sekundär matchas aldrig");
const runLinksOrQ = r.links.filter(l=>l.sessionId==="r1").length + r.questions.filter(q=>q.sessionId==="r1").length;
eq(runLinksOrQ, 1, "1:1-regeln: löppasset får exakt en koppling");

/* fixtur 6: två pass likvärdig poäng ⇒ tvetydig, aldrig tyst */
const twin = [{...runSess, id:"r1"}, {...runSess, id:"r2", title:"Löpintervaller kopia"}];
const rt = assignMatches(twin, [runAct], cfg);
eq(rt.links.length, 0, "fixtur 6: likvärdiga kandidater ⇒ ingen automatik");
ok(rt.questions.length === 1 && rt.questions[0].why.includes("likvärdig"), "fixtur 6: fråga med motivering");

/* ---------- Rimlighetsvakt (fixtur: DIST_OK) ---------- */
ok(!activitySane({type:"Run", moving_time:3600, distance:412000}).ok, "rimlighetsvakt: 412 km löpning utesluts");
ok(activitySane({type:"Ride", moving_time:9000, distance:71000}).ok, "rimlighetsvakt: 71 km cykel passerar");

/* ---------- Sammanfattning ---------- */
console.log(`\n${pass}/${pass+fail} tester gröna` + (fail? ` — ${fail} RÖDA`:""));
process.exit(fail?1:0);
