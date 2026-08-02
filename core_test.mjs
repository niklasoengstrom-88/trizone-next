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


/* ================================================================
   LAGRINGSLAGRET — kvotvakt, avstämning, spärr
   ================================================================ */
import { makeStore, trimPlan, emptyOverlay, validateOverlay, reconcileOverlay,
         resolveOrphan, byteSize, KEYS } from "./core.js";

/* Falsk storage med kvottak — gör v32:s rad 944-lärdom testbar */
function fakeStorage(limitBytes = Infinity, seed = {}) {
  const m = new Map(Object.entries(seed));
  const used = (skip) => [...m].filter(([k]) => k !== skip).reduce((s, [, v]) => s + byteSize(v), 0);
  return {
    get length() { return m.size; },
    key: i => [...m.keys()][i],
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (used(k) + byteSize(v) > limitBytes) { const e = new Error("exceeded the quota"); e.name = "QuotaExceededError"; throw e; }
      m.set(k, v);
    },
    removeItem: k => m.delete(k),
    _dump: () => Object.fromEntries(m)
  };
}

/* ---------- trimPlan: vitlista (F5) ---------- */
{ const dirty = structuredClone(plan);
  dirty.sessions[0].coachNotes = "x".repeat(5000);
  dirty.sessions[0].rawApiBlob = { junk: true };
  dirty.debugDump = "y".repeat(9000);
  const t = trimPlan(dirty);
  ok(t.sessions[0].coachNotes === undefined && t.sessions[0].rawApiBlob === undefined,
     "F5: okända passfält når aldrig lagringen");
  ok(t.debugDump === undefined, "F5: okända toppnivåfält trimmas bort");
  eq(t.sessions.length, plan.sessions.length, "trimPlan: alla pass behålls");
  eq(t.sessions[2].profile, plan.sessions[2].profile, "trimPlan: zonprofilen är bärande data och behålls");
  ok(byteSize(JSON.stringify(t)) < byteSize(JSON.stringify(dirty)) - 13000, "F5: projektionen är faktiskt trimmad"); }

/* ---------- validateOverlay (§8) ---------- */
{ const v = validateOverlay({ sessions: { a: { status: "klart" } } });
  ok(!v.ok && v.errors[0].why.includes("okänd status"), "§8: okänd status avvisas med rotorsak");
  ok(validateOverlay(emptyOverlay("x")).ok, "§8: tom overlay är giltig");
  ok(!validateOverlay({ sessions: { a: { events: [{ rule: "x" }] } } }).ok, "§8: eventpost utan action/t avvisas");
  ok(!validateOverlay({ sessions: { a: { rpe: 14 } } }).ok, "§8: rpe utanför 1–10 avvisas");
  ok(validateOverlay({ sessions: { a: { status: "done", rpe: 7 } } }).ok, "§8: välformad post släpps igenom"); }

/* ---------- Kvotvakt (F5) ---------- */
{ const st = makeStore(fakeStorage(400, { "trizone.cache.v1": "z".repeat(300) }));
  const big = emptyOverlay("v1");
  for (let i = 0; i < 40; i++) big.sessions["s" + i] = { status: "done", rpe: 7 };
  const r = st.saveOverlay(big);
  ok(!r.ok, "kvot: skrivning som spränger taket lyckas inte");
  ok(r.error.includes("trizone.overlay.v1") && r.error.includes("kB"),
     "kvot: felmeddelandet namnger vilken nyckel och hur stor den är");
  ok(r.error.includes("trizone.cache.v1"), "kvot: felmeddelandet pekar ut vad som tar plats");
  ok(/Rensa|exportera/.test(r.error), "kvot: felmeddelandet säger vad man kan göra"); }
{ const fs = fakeStorage(400, { "trizone.overlay.v1": JSON.stringify(emptyOverlay("v1")) });
  const st = makeStore(fs);
  const before = fs.getItem("trizone.overlay.v1");
  const big = emptyOverlay("v1");
  for (let i = 0; i < 40; i++) big.sessions["s" + i] = { status: "done" };
  st.saveOverlay(big);
  eq(fs.getItem("trizone.overlay.v1"), before, "kvot: det gamla värdet står orört efter misslyckad skrivning"); }

/* ---------- Trasig overlay spärrar skrivning (S2) ---------- */
{ const fs = fakeStorage(1e6, { "trizone.overlay.v1": "{ trasig json" });
  const st = makeStore(fs);
  const r = st.loadOverlay(plan);
  ok(r.blocked && r.errors.length, "S2: oläsbar overlay rapporteras, inte ignoreras");
  const w = st.saveOverlay(emptyOverlay("x"));
  ok(!w.ok && w.error.includes("spärrad"), "S2: skrivning spärras — historik överskrivs aldrig tyst");
  eq(fs.getItem("trizone.overlay.v1"), "{ trasig json", "S2: rådata bevarad för räddning");
  st.unblock();
  ok(st.saveOverlay(emptyOverlay("x")).ok, "S2: användarens beslut häver spärren"); }
{ const st = makeStore(fakeStorage(1e6, { "trizone.overlay.v1": JSON.stringify({ sessions: { a: { status: "fel" } } }) }));
  ok(st.loadOverlay(plan).blocked, "S2: formfel spärrar också"); }
{ const st = makeStore(fakeStorage(1e6));
  ok(!st.saveOverlay({ sessions: { a: { status: "hittepå" } } }).ok, "trasig overlay skrivs aldrig, ens obruten spärr"); }

/* ---------- Avstämning vid ny planVersion (§5, P3) ---------- */
{ const ov = { ...emptyOverlay("2026-07-31.1"),
    sessions: { "sk-w42-run-thr": { status: "done", rpe: 7 }, "borta-1": { status: "struck" } },
    placed: { "borta-2": { week: 42, day: 3, slot: "Kväll" } } };
  const r = reconcileOverlay(ov, plan, "2026-08-02T09:00:00");
  ok(r.overlay.sessions["sk-w42-run-thr"], "avstämning: överlagring vars pass finns kvar följer med");
  eq(r.orphans.map(o => o.id).sort(), ["borta-1", "borta-2"], "avstämning: försvunna pass blir föräldralösa");
  ok(r.orphans.every(o => o.decision === null), "P3: varje föräldralös post väntar på ett beslut");
  eq(r.overlay.sessions["borta-1"], undefined, "avstämning: föräldralös lyfts ur aktiv rendering");
  ok(r.overlay.orphans.find(o => o.id === "borta-1").data.status === "struck",
     "P3: föräldralös data raderas aldrig — den bevaras i listan");
  const a = resolveOrphan(r.overlay, "borta-1", "archive", "2026-08-02T10:00:00");
  ok(a.archive["borta-1"] && !a.orphans.some(o => o.id === "borta-1"), "beslut: arkivering flyttar posten till arkivet");
  const d = resolveOrphan(r.overlay, "borta-2", "delete", "2026-08-02T10:00:00");
  ok(!d.archive["borta-2"] && d.modes.log.some(e => e.rule === "orphan" && e.action === "delete"),
     "beslut: radering är möjlig men aldrig tyst — den loggas"); }

/* ---------- Rundtur: motor → overlay → lagring → läsning ---------- */
{ const fs = fakeStorage(1e6);
  const st = makeStore(fs);
  ok(st.savePlan(plan).ok, "rundtur: trimmad plan sparas");
  const l0 = st.loadOverlay(plan);
  eq(l0.overlay.planVersion, plan.planVersion, "rundtur: tom overlay ärver planVersion");
  const r = applyRules(plan, l0.overlay, B, [{ id: "missed", source: "manual", sessionId: "sk-w42-swim-css" }], NOW);
  const ov1 = applyActions(l0.overlay, r.actions);
  ok(st.saveOverlay(ov1).ok, "rundtur: motorns overlay passerar validering och skrivs");
  const l1 = makeStore(fs).loadOverlay(plan);
  eq(l1.overlay.sessions["sk-w42-swim-css"].status, "struck", "rundtur: statusen överlever en omladdning");
  eq(l1.overlay.sessions["sk-w42-swim-css"].events[0].rule, "missed-B", "rundtur: P3-posten överlever omladdning");
  ok(!l1.dirty && !l1.blocked, "rundtur: oförändrad planVersion kräver ingen omskrivning");
  const rep = st.report();
  ok(rep.keys.some(k => k.key === KEYS.plan) && rep.total > 0, "report: nycklar och storlek redovisas");
  ok(rep.total < 200 * 1024, `budget: referensplanen + overlay ryms väl (${(rep.total/1024).toFixed(1)} kB)`); }


/* ================================================================
   VECKOVYN — layoutmatte (v29: layout är testad logik, inte DOM-tur)
   ================================================================ */
import { weekView, weekDates, planWeeks, manualAdjust, shortDate, DAYLABEL, WINDOWS } from "./core.js";

const cell = (v, d, slot) => v.days[d].slots.find(s => s.slot === slot);
const ids  = (v, d, slot) => (cell(v, d, slot)?.sessions ?? []).map(s => s.id);

/* ---------- Grundlayout ---------- */
{ const v = weekView(plan, {}, 42, B);
  eq(weekDates(plan, 42)[0], "2026-10-12", "veckodatum: v42 börjar måndag 12 okt");
  eq(v.days.length, 7, "veckan har sju dagrader — även tomma");
  eq(v.days.map(d => d.label), DAYLABEL, "dagrader i veckoordning mån→sön");
  eq(shortDate("2026-10-15"), "15 okt", "datumetikett kort och svensk");
  ok(v.days.every(d => d.slots.every(s => WINDOWS.includes(s.slot))), "endast kända tidsfönster renderas");
  ok(v.days[2].slots.map(s => s.slot).join() === "Kväll", "slots visas i fönsterordning");
  eq(v.week.type, "normal", "veckotypen följer med (styr uttryck i vyn)"); }

/* ---------- Pass hamnar rätt, pass-par staplas ---------- */
{ const v = weekView(plan, {}, 42, B);
  eq(ids(v, 3, "Kväll"), ["sk-w42-run-thr"], "passet ligger i sin dag och sitt fönster");
  eq(ids(v, 1, "Lunch"), ["sk-w42-swim-css"], "lunchpasset hamnar i lunchfönstret");
  const { overlay } = manualAdjust(plan, {}, "sk-w42-swim-ow", "place", { day: 5, slot: "Morgon" }, NOW);
  const par = cell(weekView(plan, overlay, 42, B), 5, "Morgon");
  eq(par.sessions.map(s => s.id), ["sk-w42-bike-long", "sk-w42-swim-ow"],
     "S4: pass-par staplas i samma fönster, A före C"); }

/* ---------- Oplacerade pass blir meny (menymodellen) ---------- */
{ const v = weekView(plan, {}, 42, B);
  ok(v.unplaced.some(s => s.id === "sk-w42-swim-ow"), "oplacerat pass hamnar i menyn, inte i en dag");
  ok(!v.days.flatMap(d => d.slots).flatMap(s => s.sessions).some(s => s.id === "sk-w42-swim-ow"),
     "oplacerat pass renderas aldrig som placerat");
  eq(v.summary.unplaced, v.unplaced.length, "sammanfattningen räknar menyn"); }

/* ---------- Överlagring styr vyn, aldrig källan (F1) ---------- */
{ const { overlay } = manualAdjust(plan, {}, "sk-w42-swim-ow", "place", { day: 4, slot: "Morgon" }, NOW);
  const v = weekView(plan, overlay, 42, B);
  eq(ids(v, 4, "Morgon"), ["sk-w42-swim-ow"], "placering ur menyn syns i vyn");
  eq(v.unplaced.length, 0, "placerat pass lämnar menyn");
  eq(plan.sessions.find(s => s.id === "sk-w42-swim-ow").day, undefined, "F1: källplanen är orörd");
  ok(overlay.placed["sk-w42-swim-ow"], "menypass lagras som placed (planformat §5)"); }
{ const { overlay } = manualAdjust(plan, {}, "sk-w42-run-thr", "move", { day: 4, slot: "Kväll" }, NOW);
  const v = weekView(plan, overlay, 42, B);
  eq(ids(v, 4, "Kväll"), ["sk-w42-run-thr"], "flyttat pass syns på nya platsen");
  eq(ids(v, 3, "Kväll").length, 0, "flyttat pass lämnar gamla platsen");
  ok(overlay.sessions["sk-w42-run-thr"].moved, "placerat pass som flyttas lagras som moved"); }

/* ---------- Fönster utanför livsschemat renderas ändå, men märks ---------- */
{ const { overlay } = manualAdjust(plan, {}, "sk-w42-swim-ow", "place", { day: 0, slot: "Morgon" }, NOW);
  const v = weekView(plan, overlay, 42, B);
  const c = cell(v, 0, "Morgon");
  ok(c && c.sessions.length === 1, "pass i ett fönster utanför schemat göms aldrig");
  eq(c.scheduled, false, "fönstret märks som utanför livsschemat");
  ok(cell(v, 0, "Kväll").scheduled, "schemalagda fönster märks som schemalagda"); }

/* ---------- Manuell justering: hela §5d-listan ---------- */
{ const r = manualAdjust(plan, {}, "sk-w42-swim-css", "strike", {}, NOW);
  const v = weekView(plan, r.overlay, 42, B);
  const s = v.days.flatMap(d => d.slots).flatMap(x => x.sessions).find(x => x.id === "sk-w42-swim-css");
  eq(s.status, "struck", "struket pass ligger kvar i vyn, märkt — inte bortplockat");
  eq(v.summary.planned, weekView(plan, {}, 42, B).summary.planned - 1, "struket räknas inte som planerat");
  const back = manualAdjust(plan, r.overlay, "sk-w42-swim-css", "restore", {}, NOW).overlay;
  eq(back.sessions["sk-w42-swim-css"].status, undefined, "strykning går att häva");
  eq(back.sessions["sk-w42-swim-css"].events.map(e => e.rule), ["manual-strike", "manual-restore"],
     "P3: både ingrepp och ångring är egna poster — historiken skrivs aldrig om"); }
{ const r = manualAdjust(plan, {}, "sk-w42-bike-long", "shorten", { durationMin: 92 }, NOW);
  const s = effectiveSession(plan.sessions.find(x => x.id === "sk-w42-bike-long"), r.overlay.sessions["sk-w42-bike-long"]);
  eq(s.durationMin, 90, "manuell kortning avrundas till 5 min");
  eq(zoneDist(s.profile).reduce((a, b) => a + b, 0), 90, "kortning skalar zonprofilen proportionellt"); }
{ eq(manualAdjust(plan, {}, "sk-w42-run-thr", "substitute", { sport: "bike" }, NOW)
      .overlay.sessions["sk-w42-run-thr"].adjust.sport, "bike", "manuellt grenbyte lagras");
  ok(manualAdjust(plan, {}, "sk-w42-run-thr", "substitute", { sport: "padel" }, NOW).error,
     "okänd gren avvisas");
  ok(manualAdjust(plan, {}, "sk-w42-run-thr", "explode", {}, NOW).error,
     "§5d: bara regelverkets åtgärdslista — ingen fri redigering");
  ok(manualAdjust(plan, {}, "finns-ej", "strike", {}, NOW).error, "okänt pass avvisas med rotorsak");
  ok(manualAdjust(plan, {}, "sk-w42-run-thr", "move", { day: 9, slot: "Kväll" }, NOW).error,
     "ogiltigt mål avvisas"); }

/* ---------- Handen vinner: manuell justering överlever lägesavaktivering ---------- */
{ const ov0 = { modes: { active: [ mode("mode-vacation", "2026-10-12", "2026-10-18") ] } };
  const ov1 = applyActions(ov0, applyRules(plan, ov0, B, [], NOW).actions);
  const ov2 = manualAdjust(plan, ov1, "sk-w42-run-thr", "move", { day: 4, slot: "Morgon" }, "2026-10-14T10:00").overlay;
  const ov3 = deactivateMode(ov2, "mode-vacation@2026-10-12", "2026-10-19T08:00");
  eq(effectiveSession(plan.sessions[2], ov3.sessions["sk-w42-run-thr"]).day, 4,
     "§9: manuellt flyttat pass behåller användarens placering när läget släpper"); }

/* ---------- Sammanfattning: siffror med sitt fönster (v28) ---------- */
{ const v = weekView(plan, {}, 42, B);
  const live = plan.sessions.filter(s => s.week === 42);
  eq(v.summary.minutes, live.reduce((n, s) => n + s.durationMin, 0), "veckominuter = summan av veckans pass");
  eq(v.summary.zones.reduce((a, b) => a + b, 0), v.summary.minutes, "zonsumman stämmer mot durationen");
  ok(v.summary.lowShare > 0 && v.summary.lowShare <= 1, "lågintensiv andel är en kvot, inte en siffra i luften");
  const tom = weekView(plan, {}, 43, B);
  ok(weekView({ weeks: [], sessions: [] }, {}, 1, B).summary.lowShare === null,
     "tom vecka ger ingen procentsiffra alls — hellre tomt än falskt");
  ok(tom.days.length === 7, "vecka utan pass renderas ändå som sju rader"); }

/* ---------- Bläddring ---------- */
{ eq(planWeeks(plan), [42, 43, 44], "veckor att bläddra mellan kommer ur planen");
  eq(weekDates(plan, 99), [], "okänd vecka ger inga datum i stället för att gissa"); }

/* ---------- Motor + hand i samma overlay ---------- */
{ const r = applyRules(plan, {}, B, [{ id: "missed", source: "manual", sessionId: "sk-w42-swim-css" }], NOW);
  const ov1 = applyActions({}, r.actions);
  const ov2 = manualAdjust(plan, ov1, "sk-w42-swim-css", "restore", {}, "2026-10-12T20:00").overlay;
  const v = weekView(plan, ov2, 42, B);
  ok(v.days.flatMap(d => d.slots).flatMap(s => s.sessions).some(x => x.id === "sk-w42-swim-css" && !x.status),
     "användaren kan häva motorns strykning — handen vinner");
  eq(ov2.sessions["sk-w42-swim-css"].events.map(e => e.rule), ["missed-B", "manual-restore"],
     "P3: motorns och handens poster ligger sida vid sida"); }

/* ---------- Svitvakt (regression 2026-08-02) ----------
   En kvarglömd avslutning mitt i filen lät sviten sluta tyst efter 102 tester
   och rapportera grönt. En svit som ljuger uppåt är värre än en röd svit. */
const EXPECTED_MIN = 182;
if (pass + fail < EXPECTED_MIN) {
  console.error(`  ✗ SVITEN AVBRÖTS: ${pass+fail} tester kördes, minst ${EXPECTED_MIN} väntade`);
  fail++;
}

/* ---------- Sammanfattning ---------- */
console.log(`\n${pass}/${pass+fail} tester gröna` + (fail? ` — ${fail} RÖDA`:""));
process.exit(fail?1:0);
