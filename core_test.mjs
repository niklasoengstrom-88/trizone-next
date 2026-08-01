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

/* ================================================================
   REGELMOTORN — fixturer först (T1/T3/T4, överlämning §5)
   Scenarionummer refererar regelverk-spec v0.2 §11 T3.
   ================================================================ */
import { applyRules, applyActions, deactivateMode, mergeEngineFlags,
         isQuality, scaleProfile, downgradeProfile, sessionDate, hoursBetween,
         ENGINE } from "./core.js";

const B = {
  schedule: { 0:["Kväll"], 1:["Lunch","Kväll"], 2:["Kväll"], 3:["Kväll"],
              4:["Morgon","Kväll"], 5:["Morgon","Kväll"], 6:["Kväll"] },
  rules: [{ rule:"tissue-freeze", sport:["run"], substitute:{ quality:"bike", easy:"swim" } }]
};
const NOW = "2026-10-12T07:00:00";
const A = (r, rule, act, id) => r.actions.filter(a => a.rule===rule && (!act || a.action===act) && (!id || a.session===id));
const mode = (rule, from, to, extra={}) => ({ rule, from, to, t:"2026-10-11T20:00:00", ...extra });

/* ---------- Byggstenar ---------- */
ok(isQuality({durationMin:50, profile:[[1,26],[4,24]]}), "isQuality: 24 min Z4 ⇒ kvalitet");
ok(!isQuality({durationMin:150, profile:[[1,40],[2,110]]}), "isQuality: lång Z2 ⇒ inte kvalitet");
ok(isQuality({durationMin:60, profile:[[1,52],[5,8]]}), "isQuality: 8 min Z5 träffar minutgränsen");
eq(downgradeProfile([[1,12],[4,6],[3,4]]), [[1,12],[2,6],[2,4]], "downgrade: Z≥3 → Z2, Z1 orörd");
eq(sessionDate(plan, plan.sessions[2]), "2026-10-15", "sessionDate: v42 dag 3 = 2026-10-15 (ISO-veckomatte)");
eq(sessionDate(plan, plan.sessions[5]), null, "sessionDate: oplacerat menypass saknar datum");
{ const h = hoursBetween(plan, plan.sessions[1], plan.sessions[2]);
  eq(h, 24, "hoursBetween: ons Kväll → tors Kväll = 24 h"); }

/* ---------- mode-vacation (nivå 2) ---------- */
{ const ov = { modes:{ active:[ mode("mode-vacation","2026-10-12","2026-10-18") ] } };
  const r = applyRules(plan, ov, B, [], NOW);
  eq(A(r,"mode-vacation","strike").map(a=>a.session), ["sk-w42-swim-css"], "vacation: B stryks, protected och C rörs ej");
  const sh = A(r,"mode-vacation","shorten");
  eq(sh.map(a=>[a.session,a.payload.durationMin]).sort(),
     [["sk-w42-bike-long",90],["sk-w42-run-thr",30]], "vacation: A till underhållsdos 60 % (50→30, 150→90)");
  ok(sh.every(a=>a.orig.durationMin && a.orig.profile), "vacation: shorten bär orig för exakt återställning");
  ok(!r.actions.some(a=>a.session==="sk-w42-str-core" && a.action!=="warn"), "T3-6-släkting: skyddat pass rörs inte av vacation"); }

/* ---------- T3-6: skyddat pass under mode-reduced ---------- */
{ const ov = { modes:{ active:[ mode("mode-reduced","2026-10-12","2026-10-18") ] } };
  const r = applyRules(plan, ov, B, [], NOW);
  eq(A(r,"mode-reduced","strike").map(a=>a.session), ["sk-w42-swim-css"], "T3-6: reduced stryker B — skyddat pass överlever");
  ok(!r.actions.some(a=>["sk-w42-run-easy","sk-w42-swim-ow"].includes(a.session) && a.action==="strike"),
     "reduced: C är luft — stryks aldrig"); }

/* ---------- tissue-freeze: säkerhet ser ingen luft ---------- */
{ const ov = { modes:{ active:[ mode("tissue-freeze","2026-10-12","2026-10-18") ] } };
  const r = applyRules(plan, ov, B, [], NOW);
  const sub = A(r,"tissue-freeze","substitute");
  eq(sub.map(a=>[a.session,a.payload.sport]).sort(),
     [["sk-w42-run-easy","swim"],["sk-w42-run-thr","bike"]],
     "freeze: kvalitet→bike, lugnt→swim — även C-passet (nivå 1 gäller C)");
  ok(!sub.some(a=>a.session==="sk-w43-run-thr"), "freeze: pass utanför spannet rörs ej"); }

/* ---------- T3-1: tre veckor, semester i mitten, två missade A ---------- */
{ const ov = { modes:{ active:[ mode("mode-vacation","2026-10-19","2026-10-25") ] } };
  const flags = [ {id:"missed", source:"manual", sessionId:"sk-w42-run-thr"},
                  {id:"missed", source:"manual", sessionId:"sk-w44-bike-ftp"} ];
  const r = applyRules(plan, ov, B, flags, NOW);
  eq(A(r,"mode-vacation","shorten").map(a=>[a.session,a.payload.durationMin]),
     [["sk-w43-run-thr",35]], "T3-1: semesterveckans A till underhållsdos (56→35)");
  eq(A(r,"missed-A","move","sk-w42-run-thr")[0]?.payload, {week:42,day:4,slot:"Morgon"},
     "T3-1: missat A flyttas till nästa lediga slot i egen vecka");
  eq(A(r,"missed-A","move","sk-w44-bike-ftp")[0]?.payload, {week:44,day:3,slot:"Kväll"},
     "T3-1: andra missade A flyttas i sin vecka");
  ok(A(r,"missed-A","move").every(a=>a.orig.slot), "missed-A: move bär ursprungsläget"); }

/* ---------- D3/H2: ingen slot utan kvalitetskonflikt ⇒ stryk ---------- */
const synth = { formatVersion:1, planVersion:"2026-07-31.1", blocks:[{id:"x",start:"2026-10-12",weeks:1}],
  weeks:[{week:42, iso:"2026-W42", block:"x", type:"normal"}],
  sessions:[
    {id:"q1", week:42, day:2, slot:"Kväll", sport:"run",  prio:"A", durationMin:50, profile:[[1,26],[4,24]]},
    {id:"q2", week:42, day:4, slot:"Kväll", sport:"bike", prio:"A", durationMin:60, profile:[[1,30],[4,30]]} ]};
{ const r = applyRules(synth, {}, { schedule:{4:["Morgon"]} },
                       [{id:"missed", source:"manual", sessionId:"q1"}], NOW);
  const st = A(r,"missed-A","strike","q1");
  eq(st.length, 1, "D3: enda lediga slot < 24 h från kvalitet ⇒ flytt vägras");
  ok(st[0].why.includes("H2"), "H2: strykningen förklarar varför flytten uteblev");
  ok(!A(r,"missed-A","move").length, "D3: ingen tyst flytt in i kvalitetskonflikt"); }

/* ---------- missed-A: B-slot-fallback ---------- */
{ const p2 = structuredClone(synth);
  p2.sessions[1] = {id:"b1", week:42, day:4, slot:"Kväll", sport:"swim", prio:"B", durationMin:40, profile:[[1,10],[2,30]]};
  const r = applyRules(p2, {}, { schedule:{} }, [{id:"missed", source:"manual", sessionId:"q1"}], NOW);
  eq(A(r,"missed-A","move","q1")[0]?.payload, {week:42,day:4,slot:"Kväll"}, "missed-A: tar B-passets slot när schemat är fullt");
  eq(A(r,"missed-A","strike","b1").length, 1, "missed-A: B:t som lämnar plats stryks — jagas inte ikapp"); }

/* ---------- missed-B / protected / C ---------- */
{ const r = applyRules(plan, {}, B, [
    {id:"missed", source:"manual", sessionId:"sk-w42-swim-css"},
    {id:"missed", source:"manual", sessionId:"sk-w42-str-core"},
    {id:"missed", source:"manual", sessionId:"sk-w42-run-easy"} ], NOW);
  eq(A(r,"missed-B","strike").map(a=>a.session), ["sk-w42-swim-css"], "missed-B: B stryks utan ersättning");
  eq(A(r,"missed-B","warn").map(a=>a.session), ["sk-w42-str-core"], "§8: skyddat pass stryks aldrig av missed-B — endast redovisning");
  ok(!r.actions.some(a=>a.session==="sk-w42-run-easy"), "fixtur 14-släkting: missat C ⇒ noll flaggor, noll åtgärder"); }

/* ---------- T3-4 + normerande exemplet: nivå 1 och nivå 2 på samma pass ---------- */
{ const ov = { modes:{ active:[ mode("tissue-freeze","2026-10-12","2026-10-18") ] } };
  const r = applyRules(plan, ov, B, [{id:"missed", source:"manual", sessionId:"sk-w42-run-thr"}], NOW);
  eq(A(r,"tissue-freeze","substitute","sk-w42-run-thr")[0]?.payload.sport, "bike",
     "T3-4: nivå 1 vinner — passet ersätts, fryses ur löpning");
  eq(A(r,"missed-A","move","sk-w42-run-thr")[0]?.payload, {week:42,day:4,slot:"Morgon"},
     "normerande exemplet: strukturregeln tillämpas därefter på ersättningspasset"); }
{ const ov = { modes:{ active:[ mode("illness-stop","2026-10-15","2026-10-15") ] } };
  const r = applyRules(plan, ov, B, [{id:"missed", source:"manual", sessionId:"sk-w42-run-thr"}], NOW);
  eq(A(r,"illness-stop","strike","sk-w42-run-thr").length, 1, "T4: illness-stop stryker");
  ok(!r.actions.some(a=>a.rule==="missed-A"), "T4: nivå 2 rör aldrig ett nivå 1-struket pass"); }

/* ---------- T4: illness + vacation överlappande ---------- */
{ const ov = { modes:{ active:[ mode("illness-stop","2026-10-15","2026-10-15"),
                               mode("mode-vacation","2026-10-12","2026-10-18") ] } };
  const r = applyRules(plan, ov, B, [], NOW);
  ok(A(r,"illness-stop","strike","sk-w42-run-thr").length===1 &&
     !r.actions.some(a=>a.session==="sk-w42-run-thr" && a.rule==="mode-vacation"),
     "T4: struket av nivå 1 ⇒ vacation lämnar passet");
  eq(A(r,"mode-vacation","shorten","sk-w42-bike-long")[0]?.payload.durationMin, 90,
     "T4: vacation verkar vidare på resten av veckan"); }

/* ---------- sleep-guard — D2: derived frågar, manual agerar ---------- */
{ const r = applyRules(plan, {}, B, [{id:"sleep-guard", source:"derived", date:"2026-10-15"}], NOW);
  ok(r.questions.some(q=>q.rule==="sleep-guard" && q.sessions.includes("sk-w42-run-thr")),
     "D2: derived trigger ger fråga");
  ok(!A(r,"sleep-guard").length, "D2: derived trigger ändrar ingenting"); }
{ const r = applyRules(plan, {}, B, [{id:"sleep-guard", source:"manual", date:"2026-10-15"}], NOW);
  const d = A(r,"sleep-guard","downgrade","sk-w42-run-thr");
  eq(d.length, 1, "sleep-guard manual: dagens kvalitet växlas ned");
  ok(zoneDist(d[0].payload.profile)[3]===0 && zoneDist(d[0].payload.profile)[4]===0,
     "sleep-guard: nedväxlad profil saknar Z4/Z5");
  eq(zoneDist(d[0].payload.profile).reduce((a,b)=>a+b,0), 50, "downgrade: durationen behålls"); }

/* ---------- T3-3: sjukläge över veckogräns + comeback-grind (D5) ---------- */
{ const ov = { modes:{ active:[ mode("illness-stop","2026-10-15","2026-10-20") ] } };
  const r = applyRules(plan, ov, B, [], NOW);
  eq(A(r,"illness-stop","strike").map(a=>a.session).sort(),
     ["sk-w42-bike-long","sk-w42-run-easy","sk-w42-run-thr","sk-w42-swim-ow"],
     "T3-3: allt i spannet stryks — även C och oplacerat (veckoöverlapp); pass före spannet orörda");
  const ov1 = applyActions(ov, r.actions);
  eq(ov1.modes.comeback, {need:2, z2done:0, passed:false, after:"2026-10-20"},
     "T3-3: sjukstopp öppnar comeback-grinden");
  const r2 = applyRules(plan, ov1, B, [], "2026-10-21T07:00:00");
  eq(A(r2,"illness-rampback","downgrade").map(a=>a.session).sort(),
     ["sk-w43-run-thr","sk-w44-bike-ftp"],
     "T3-3: kvalitet efter spannet hålls på Z2 tills grinden bekräftats — återintro på rätt pass");
  const ov2 = structuredClone(ov1); ov2.modes.comeback.z2done = 2;
  ok(applyRules(plan, ov2, B, [], "2026-10-25T07:00:00").questions.some(q=>q.rule==="illness-rampback"),
     "D5: två normalkända Z2-pass ⇒ motorn frågar, användaren bekräftar");
  const ov3 = structuredClone(ov1); ov3.modes.comeback.passed = true;
  ok(!applyRules(plan, ov3, B, [], "2026-10-25T07:00:00").actions.some(a=>a.rule==="illness-rampback"),
     "D5: bekräftad grind ⇒ kvalitet återupptagen"); }

/* ---------- T3-2: löpfrys på/av = exakt återställning ---------- */
{ const key = "tissue-freeze@2026-10-12";
  const ov0 = { modes:{ active:[ mode("tissue-freeze","2026-10-12","2026-10-18") ] } };
  const r = applyRules(plan, ov0, B, [], NOW);
  const ov1 = applyActions(ov0, r.actions);
  eq(effectiveSession(plan.sessions[2], ov1.sessions["sk-w42-run-thr"]).sport, "bike",
     "T3-2: frys aktiv ⇒ effektivt pass är cykel");
  const ov2 = deactivateMode(ov1, key, "2026-10-20T08:00:00");
  const eff = effectiveSession(plan.sessions[2], ov2.sessions["sk-w42-run-thr"]);
  eq([eff.sport, eff.durationMin, eff.profile], ["run", 50, plan.sessions[2].profile],
     "T3-2: avaktivering återställer exakt föregående tillstånd");
  const evs = ov2.sessions["sk-w42-run-thr"].events.map(e=>e.rule);
  ok(evs.includes("tissue-freeze") && evs.includes("undo:"+key),
     "P3/§9: historiken skrivs aldrig om — ingrepp och ångring är egna poster");
  ok(!ov2.modes.active.length, "T3-2: läget borta ur aktiva listan"); }

/* ---------- T3-5: manuell ändring under läge ⇒ användarens hand vinner ---------- */
{ const key = "mode-vacation@2026-10-12";
  const ov0 = { modes:{ active:[ mode("mode-vacation","2026-10-12","2026-10-18") ] } };
  const ov1 = applyActions(ov0, applyRules(plan, ov0, B, [], NOW).actions);
  const so = ov1.sessions["sk-w42-run-thr"];
  so.adjust = { ...so.adjust, durationMin: 45 };
  so.events.push({ rule:"manual-adjust", session:"sk-w42-run-thr", action:"shorten",
                   why:"Manuell justering", t:"2026-10-14T10:00:00" });
  const ov2 = deactivateMode(ov1, key, "2026-10-19T08:00:00");
  eq(effectiveSession(plan.sessions[2], ov2.sessions["sk-w42-run-thr"]).durationMin, 45,
     "T3-5: manuellt rört pass behåller användarens version");
  eq(effectiveSession(plan.sessions[3], ov2.sessions["sk-w42-bike-long"]).durationMin, 150,
     "T3-5: orörda pass återställs ur ögonblicksbilden");
  eq(effectiveSession(plan.sessions[0], ov2.sessions["sk-w42-swim-css"]).status, undefined,
     "T3-5: strykning ur läget hävs vid avaktivering"); }

/* ---------- Nivå 3: tunga ben inkl. samma dag (korrigerade definitionen) ---------- */
{ const r = applyRules(plan, {}, B, [], NOW);
  const hl = A(r,"heavy-legs","warn");
  ok(hl.length===1 && hl[0].pair.includes("sk-w42-str-core") && hl[0].pair.includes("sk-w42-run-thr"),
     "tunga ben: styrka 24 h före kvalitet ⇒ warn");
  ok(r.actions.filter(a=>a.level===3).every(a=>a.action==="warn"), "H1: nivå 3 ändrar aldrig — endast warn"); }
{ const p = structuredClone(synth);
  p.sessions[1] = {id:"st", week:42, day:2, slot:"Morgon", sport:"strength", prio:"B", durationMin:40, profile:[[1,40]]};
  const r = applyRules(p, {}, B, [], NOW);
  eq(A(r,"heavy-legs","warn").length, 1, "tunga ben: samma dag, tidigare fönster ⇒ warn (demobuggens fall)"); }
{ const p = structuredClone(synth);
  p.sessions[1] = {id:"st", week:42, day:3, slot:"Morgon", sport:"strength", prio:"B", durationMin:40, profile:[[1,40]]};
  const r = applyRules(p, {}, B, [], NOW);
  eq(A(r,"heavy-legs","warn").length, 1, "tunga ben: båda riktningar — styrka dagen efter kvalitet"); }

/* ---------- Nivå 3: quality-spacing + flaggmerge ---------- */
{ const p = structuredClone(synth);
  p.sessions[1].day = 3; p.sessions[1].slot = "Morgon";      /* q2: 13 h från q1 */
  const r = applyRules(p, {}, B, [], NOW);
  eq(A(r,"quality-spacing","warn").length, 1, "quality-spacing: två kvalitetspass inom 24 h ⇒ warn"); }
{ const p = structuredClone(synth);
  p.sessions[0].day = 3;                                     /* q1: tors Kväll */
  p.sessions[1] = {id:"q2", week:42, day:4, slot:"Morgon", sport:"bike", prio:"A", durationMin:60, profile:[[1,30],[4,30]]};
  p.sessions.push({id:"st", week:42, day:2, slot:"Kväll", sport:"strength", prio:"B", durationMin:40, profile:[[1,40]]});
  const r = applyRules(p, {}, B, [], NOW);
  const qs = A(r,"quality-spacing","warn");
  eq([qs.length, A(r,"heavy-legs").length], [1, 0], "flaggmerge: quality-spacing äter heavy-legs på samma dygn");
  ok(qs[0].merged?.includes("heavy-legs") && qs[0].why.includes("Tunga ben"),
     "flaggmerge: överlevande nyckel behålls, budskapet slås ihop"); }
{ const r = applyRules(plan, {}, B, [
    {id:"polarization", source:"derived", week:42},
    {id:"duration-drift", source:"derived", sessionId:"sk-w42-bike-long", week:42} ], NOW);
  eq([A(r,"polarization").length, A(r,"duration-drift").length], [1, 0],
     "flaggmerge: polarization äter duration-drift — samma rot");
  ok(A(r,"polarization")[0].merged?.includes("duration-drift"), "flaggmerge: uppäten nyckel redovisas"); }

/* ---------- volume-cap: D2 + warn/shorten ---------- */
{ const r = applyRules(plan, {}, B, [{id:"volume-cap", source:"derived", sessionId:"sk-w42-bike-long"}], NOW);
  ok(r.questions.some(q=>q.rule==="volume-cap") && !A(r,"volume-cap").length,
     "volume-cap derived: fråga, ingen åtgärd (D2)"); }
{ const r = applyRules(plan, {}, B, [{id:"volume-cap", source:"manual", sessionId:"sk-w42-bike-long", factor:0.8}], NOW);
  ok(A(r,"volume-cap","warn").length===1, "volume-cap manual: varningen redovisas");
  eq(A(r,"volume-cap","shorten")[0]?.payload.durationMin, 120, "volume-cap manual: dosen kapas (150→120)"); }

/* ---------- Hysteres H4: samma regel max 1 gång per pass och dygn ---------- */
{ const f = [{id:"missed", source:"manual", sessionId:"sk-w42-run-thr"}];
  const r1 = applyRules(plan, {}, B, f, NOW);
  const ov1 = applyActions({}, r1.actions);
  const r2 = applyRules(plan, ov1, B, f, "2026-10-12T19:00:00");
  eq(A(r1,"missed-A","move").length, 1, "H4: första utlösningen flyttar");
  eq(A(r2,"missed-A").length, 0, "H4: samma regel, samma pass, samma dygn ⇒ tyst"); }

/* ---------- Skyddsgolvet (K3): shorten på protected ---------- */
{ const p = structuredClone(synth);
  p.sessions = [{id:"pa", week:42, day:2, slot:"Kväll", sport:"run", prio:"A", protected:true,
                 durationMin:30, profile:[[1,14],[4,16]]}];
  const ov = { modes:{ active:[ mode("mode-vacation","2026-10-12","2026-10-18") ] } };
  const r = applyRules(p, ov, B, [], NOW);
  eq(A(r,"mode-vacation","shorten")[0]?.payload.durationMin, 20,
     "K3: skyddat pass kortas aldrig under golvet (max av 20 min och 50 %)"); }

/* ---------- applyActions: P3-posten + uttömmande åtgärdslista ---------- */
{ const ov = applyActions({}, [{rule:"missed-B", level:2, session:"sk-w42-swim-css", action:"strike",
                                why:"test", payload:{}, orig:{status:"planned"}, t:NOW}]);
  const e = ov.sessions["sk-w42-swim-css"].events[0];
  ok(e.rule==="missed-B" && e.session==="sk-w42-swim-css" && e.action==="strike" && e.why && e.t,
     "P3: varje ingrepp lämnar läsbar post {rule, session, action, why, t}");
  eq(ov.sessions["sk-w42-swim-css"].status, "struck", "applyActions: strike skriver status"); }
{ const ov = applyActions({}, [{rule:"x", level:2, session:"s1", action:"explode", why:"", payload:{}, orig:{}, t:NOW}]);
  eq(ov.sessions["s1"], undefined, "åtgärdslistan är uttömmande: okänd åtgärd skrivs aldrig"); }

/* ---------- Sammanfattning ---------- */
console.log(`\n${pass}/${pass+fail} tester gröna` + (fail? ` — ${fail} RÖDA`:""));
process.exit(fail?1:0);
