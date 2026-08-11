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
const plan = JSON.parse(readFileSync("plan_ref.json","utf8"));   /* testfixturen — plan.json är alltid den skarpa planen (0.7.0) */
ok(validatePlan(plan).ok, "referensplanen validerar");
const broken = JSON.parse(readFileSync("plan_broken.json","utf8"));
const vb = validatePlan(broken);
ok(!vb.ok && vb.errors.length === 5, "trasig plan: exakt 5 fel hittas");
ok(vb.errors.some(e=>e.msg.includes("34 min ≠ duration 50")), "rotorsak: profilsumma mot duration");
ok(vb.errors.some(e=>e.msg.includes("lowShare")), "rotorsak: orimligt fasmål (lowShare 1.4) pekas ut");
ok(vb.errors.some(e=>e.msg.includes('okänd gren: "löpning"')), "rotorsak: okänd gren namnges");
ok(vb.errors.some(e=>e.msg.includes("vecka 99")), "rotorsak: veckoreferens pekas ut");
ok(vb.errors.some(e=>e.msg.includes("dubblerat pass-id")), "rotorsak: id-kollision pekas ut");

/* ---------- blocks[].lowShare (beslut A, planformat §3 v0.4) ----------
   Fasens polariseringsmål bor i blocket; profilen är fallback. */
import { blockForWeek, blockForDate, phaseLowShare } from "./core.js";
{ const mk = ls => ({ ...structuredClone(plan),
    blocks: [{ id: "skelett", label: "Skelettblock", start: "2026-10-12", weeks: 3,
               ...(ls !== undefined ? { lowShare: ls } : {}) }] });
  ok(validatePlan(mk(0.75)).ok, "lowShare 0.75: giltigt fasmål");
  ok(validatePlan(mk(undefined)).ok, "lowShare frånvarande: giltigt — profilen är fallback");
  ok(!validatePlan(mk(1.4)).ok, "lowShare 1.4: avvisas — andel, inte procent");
  ok(!validatePlan(mk(0.3)).ok, "lowShare 0.3: avvisas — under settingsgolvet 50 %");
  ok(!validatePlan(mk("0.75")).ok, "lowShare som sträng: avvisas — typ, inte tolkning");
  const err = validatePlan(mk(1.4)).errors[0];
  ok(err.msg.includes("0.5") && err.msg.includes("0.95"), "felet säger gränserna, inte bara nej"); }

{ ok(blockForWeek(plan, 42)?.id === "skelett", "blockForWeek: vecka → block via weeks[].block");
  ok(blockForWeek(plan, 99) === null, "blockForWeek: okänd vecka ⇒ null, aldrig gissning");
  ok(blockForDate(plan, "2026-10-15")?.id === "skelett", "blockForDate: datum i blockspannet");
  ok(blockForDate(plan, "2026-10-11") === null, "blockForDate: dagen före blockstart ⇒ null");
  ok(blockForDate(plan, "2026-11-02") === null, "blockForDate: dagen efter blockslut ⇒ null (start+3v)"); }

{ /* Hierarkin: block > profil > ENGINE-default */
  const ph = phaseLowShare(plan, { week: 42 }, { lowShareTarget: 0.70 });
  eq([ph.target, ph.source], [0.75, "block"], "fasupplösning: blockets 0.75 vinner över profilens 0.70");
  ok(ph.label === "Skelettblock", "fasupplösning: blockets etikett följer med");
  const bare = structuredClone(plan); delete bare.blocks[0].lowShare;
  eq(phaseLowShare(bare, { week: 42 }, { lowShareTarget: 0.70 }).target, 0.70,
     "utan blockvärde: profilen är fallback");
  eq(phaseLowShare(bare, { week: 42 }, {}).source, "profil",
     "fallbackens källa redovisas som profil även vid ENGINE-default");
  eq(phaseLowShare(bare, { week: 42 }, {}).target, 0.78, "utan båda: ENGINE-default 0.78");
  eq(phaseLowShare(plan, { date: "2026-10-20" }, {}).target, 0.75,
     "datumväg: samma svar som veckovägen — en sanning");
  eq(phaseLowShare(null, { week: 42 }, {}).target, 0.78, "utan plan: default, aldrig krasch"); }

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
  eq(A(r,"missed-A","move","sk-w42-run-thr")[0]?.payload, {week:42,day:4,slot:null},
     "T3-1: missat A flyttas till nästa schemadag i egen vecka — utan fönstertvång");
  eq(A(r,"missed-A","move","sk-w44-bike-ftp")[0]?.payload, {week:44,day:3,slot:null},
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

/* ---------- missed-A: dagar är inte exklusiva (K4-rev 0.5.0) ---------- */
{ const p2 = structuredClone(synth);
  p2.sessions[1] = {id:"b1", week:42, day:5, slot:"Kväll", sport:"swim", prio:"B", durationMin:40, profile:[[1,10],[2,30]]};
  const r = applyRules(p2, {}, { schedule:{5:["Kväll"]} }, [{id:"missed", source:"manual", sessionId:"q1"}], NOW);
  eq(A(r,"missed-A","move","q1")[0]?.payload, {week:42,day:5,slot:null},
     "K4-rev: A flyttar till en dag som redan har pass — dagen är ingen exklusiv slot");
  eq(A(r,"missed-A","strike","b1").length, 0, "K4-rev: inget B stryks för att bereda plats");
  const r2 = applyRules(p2, {}, { schedule:{} }, [{id:"missed", source:"manual", sessionId:"q1"}], NOW);
  eq(A(r2,"missed-A","strike","q1").length, 1, "tomt livsschema ⇒ ingen flyttkandidat ⇒ strykning"); }

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
  eq(A(r,"missed-A","move","sk-w42-run-thr")[0]?.payload, {week:42,day:4,slot:null},
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
  eq(A(r,"heavy-legs","warn").length, 0,
     "REVIDERAD 2026-08-04: styrka dagen EFTER kvalitet ⇒ tyst — regeln skyddar kvalitetspasset, inte styrkan"); }

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

const ids = (v, d) => v.days[d].sessions.map(s => s.id);

/* ---------- Grundlayout ---------- */
{ const v = weekView(plan, {}, 42, B);
  eq(weekDates(plan, 42)[0], "2026-10-12", "veckodatum: v42 börjar måndag 12 okt");
  eq(v.days.length, 7, "veckan har sju dagrader — även tomma");
  eq(v.days.map(d => d.label), DAYLABEL, "dagrader i veckoordning mån→sön");
  eq(shortDate("2026-10-15"), "15 okt", "datumetikett kort och svensk");
  ok(v.days[2].sessions[0].slot === "Kväll", "planens fönsterförslag följer med som metadata på passet");
  eq(v.week.type, "normal", "veckotypen följer med (styr uttryck i vyn)"); }

/* ---------- Pass hamnar rätt, pass-par staplas ---------- */
{ const v = weekView(plan, {}, 42, B);
  eq(ids(v, 3), ["sk-w42-run-thr"], "passet ligger i sin dag");
  eq(ids(v, 1), ["sk-w42-swim-css"], "tisdagens pass ligger på tisdagen");
  const { overlay } = manualAdjust(plan, {}, "sk-w42-swim-ow", "place", { day: 5 }, NOW);
  eq(ids(weekView(plan, overlay, 42, B), 5), ["sk-w42-bike-long", "sk-w42-swim-ow"],
     "S4-rev: pass-par staplas i dagen — fönstrat pass före fönsterlöst"); }

/* ---------- Oplacerade pass blir meny (menymodellen) ---------- */
{ const v = weekView(plan, {}, 42, B);
  ok(v.unplaced.some(s => s.id === "sk-w42-swim-ow"), "oplacerat pass hamnar i menyn, inte i en dag");
  ok(!v.days.flatMap(d => d.sessions).some(s => s.id === "sk-w42-swim-ow"),
     "oplacerat pass renderas aldrig som placerat");
  eq(v.summary.unplaced, v.unplaced.length, "sammanfattningen räknar menyn"); }

/* ---------- Överlagring styr vyn, aldrig källan (F1) ---------- */
{ const { overlay } = manualAdjust(plan, {}, "sk-w42-swim-ow", "place", { day: 4 }, NOW);
  const v = weekView(plan, overlay, 42, B);
  eq(ids(v, 4), ["sk-w42-swim-ow"], "placering på dag räcker — inget fönster krävs (beslut A)");
  eq(v.unplaced.length, 0, "placerat pass lämnar menyn");
  eq(plan.sessions.find(s => s.id === "sk-w42-swim-ow").day, undefined, "F1: källplanen är orörd");
  ok(overlay.placed["sk-w42-swim-ow"], "menypass lagras som placed (planformat §5)"); }
{ const { overlay } = manualAdjust(plan, {}, "sk-w42-run-thr", "move", { day: 4 }, NOW);
  const v = weekView(plan, overlay, 42, B);
  eq(ids(v, 4), ["sk-w42-run-thr"], "flyttat pass syns på nya platsen");
  eq(ids(v, 3).length, 0, "flyttat pass lämnar gamla platsen");
  eq(v.days[4].sessions[0].slot, undefined,
     "beslut A: användarens flytt nollställer planens fönsterförslag");
  ok(overlay.sessions["sk-w42-run-thr"].moved, "placerat pass som flyttas lagras som moved"); }
{ const { overlay } = manualAdjust(plan, {}, "sk-w42-run-thr", "move", { day: 4, slot: "Morgon" }, NOW);
  eq(weekView(plan, overlay, 42, B).days[4].sessions.find(s => s.id === "sk-w42-run-thr").slot, "Morgon",
     "fönster kan fortfarande sättas uttryckligen — det är metadata, inte tvång"); }

/* ---------- Alla dagar är likvärdiga mål (beslut A) ---------- */
{ const { overlay } = manualAdjust(plan, {}, "sk-w42-swim-ow", "place", { day: 0 }, NOW);
  eq(ids(weekView(plan, overlay, 42, B), 0), ["sk-w42-swim-ow"],
     "placering på valfri dag — livsschemat framhäver, det spärrar aldrig"); }

/* ---------- Manuell justering: hela §5d-listan ---------- */
{ const r = manualAdjust(plan, {}, "sk-w42-swim-css", "strike", {}, NOW);
  const v = weekView(plan, r.overlay, 42, B);
  const s = v.days.flatMap(d => d.sessions).find(x => x.id === "sk-w42-swim-css");
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
  ok(manualAdjust(plan, {}, "sk-w42-run-thr", "move", { day: 9 }, NOW).error,
     "ogiltig dag avvisas");
  ok(manualAdjust(plan, {}, "sk-w42-run-thr", "move", { day: 2, slot: "Natt" }, NOW).error,
     "okänt fönster avvisas — metadata valideras ändå"); }

/* ---------- Handen vinner: manuell justering överlever lägesavaktivering ---------- */
{ const ov0 = { modes: { active: [ mode("mode-vacation", "2026-10-12", "2026-10-18") ] } };
  const ov1 = applyActions(ov0, applyRules(plan, ov0, B, [], NOW).actions);
  const ov2 = manualAdjust(plan, ov1, "sk-w42-run-thr", "move", { day: 4 }, "2026-10-14T10:00").overlay;
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
  ok(v.days.flatMap(d => d.sessions).some(x => x.id === "sk-w42-swim-css" && !x.status),
     "användaren kan häva motorns strykning — handen vinner");
  eq(ov2.sessions["sk-w42-swim-css"].events.map(e => e.rule), ["missed-B", "manual-restore"],
     "P3: motorns och handens poster ligger sida vid sida"); }

/* ================================================================
   DRAGMASKINEN — geometri och tillstånd (v29: aldrig DOM-tur)
   ================================================================ */
import { hitTest, nearestZone, dragReduce, dragIdle, edgeScroll, DRAG } from "./core.js";

const Z = [ { id:"d2", x:0, y:100, w:360, h:80 },
            { id:"d2-Morgon", x:20, y:110, w:320, h:22 },
            { id:"d2-Lunch",  x:20, y:134, w:320, h:22 },
            { id:"d2-Kväll",  x:20, y:158, w:320, h:22 } ];

/* ---------- Geometri ---------- */
{ eq(hitTest(Z, 100, 120), "d2-Morgon", "träfftest: pekaren i morgonfönstret");
  eq(hitTest(Z, 100, 165), "d2-Kväll", "träfftest: pekaren i kvällsfönstret");
  eq(hitTest(Z, 5, 120), "d2", "träfftest: dagen träffas utanför fönsterremsan");
  eq(hitTest(Z, 100, 400), null, "träfftest: utanför allt ger null, inte en gissning");
  eq(hitTest([], 1, 1), null, "träfftest: tomma zoner kraschar inte");
  eq(hitTest(Z, 20, 110), "d2-Morgon", "träfftest: övre vänstra hörnet ingår");
  eq(hitTest(Z, 340, 110), "d2", "träfftest: högerkanten är exklusiv"); }
{ eq(nearestZone(Z.slice(1), 100, 145), "d2-Lunch", "närmaste zon: släpp mellan fönster landar rätt");
  eq(nearestZone(Z.slice(1), 100, 300), "d2-Kväll", "närmaste zon: släpp under dagen tar sista fönstret");
  eq(nearestZone([], 1, 1), null, "närmaste zon: inga kandidater ger null"); }
{ eq(edgeScroll(40, 800), -DRAG.edgeStep, "autoskroll uppåt nära övre kanten");
  eq(edgeScroll(770, 800), DRAG.edgeStep, "autoskroll nedåt nära nedre kanten");
  eq(edgeScroll(400, 800), 0, "ingen autoskroll mitt på skärmen"); }

/* ---------- Tillståndsmaskinen ---------- */
const seq = (...evs) => evs.reduce((st, e) => dragReduce(st, e), dragIdle);

{ const s = seq({ type:"down", id:"p1", x:10, y:10, t:0, week:42 });
  eq(s.phase, "armed", "nedtryck armerar, drar inte direkt");
  eq(dragReduce(s, { type:"hold" }).phase, "drag", "långtryck startar draget"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10 }, { type:"move", x:10, y:60 });
  eq(s.phase, "slop", "stor rörelse före långtryck lutar åt skroll — draget startar aldrig");
  eq(dragReduce(s, { type:"hold" }).phase, "slop", "långtryckstimern kan inte kapa en skroll");
  ok(!dragReduce(s, { type:"up", t: 100 }).tap, "lång glidning ger varken drag eller tryck"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10, t: 0 }, { type:"move", x:22, y:22 },
                { type:"up", t: 120 });
  eq(s.tap, "p1", "snabbt tryck med fingerglid är ett tryck — inte ett svalt klick (0.4.0-buggen)"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10, t: 0 }, { type:"move", x:22, y:22 },
                { type:"up", t: 900 });
  ok(!s.tap, "långsam glidning utanför tryckfönstret är ingenting"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10, grip:true }, { type:"move", x:10, y:60 });
  eq(s.phase, "drag", "från greppet startar draget direkt, utan väntan"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10 }, { type:"up" });
  eq(s.tap, "p1", "kort tryck utan rörelse är ett tryck, inte ett drag");
  eq(s.phase, "idle", "trycket lämnar maskinen i vila"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10, week:42 }, { type:"hold" },
                { type:"move", x:10, y:300 }, { type:"over", day:3, slot:"Kväll" }, { type:"up" });
  eq(s.drop, { id:"p1", week:42, day:3, slot:"Kväll" }, "släpp på ett fönster ger en flytt");
  ok(!s.cancelled, "lyckat släpp är inte ett avbrott"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10, week:42 }, { type:"hold" },
                { type:"move", x:10, y:300 }, { type:"over", day:3, slot:null }, { type:"up" });
  eq(s.drop, { id:"p1", week:42, day:3, slot:null }, "beslut A: släpp på en dag räcker — fönster behövs inte"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10 }, { type:"hold" },
                { type:"move", x:10, y:300 }, { type:"over", day:null, slot:null }, { type:"up" });
  ok(s.cancelled && !s.drop, "släpp utanför alla dagar flyttar ingenting — hellre avbrott än gissning"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10, week:42 }, { type:"hold" },
                { type:"move", x:10, y:400 },
                { type:"over", day:1, slot:"Lunch" }, { type:"week", week:43 },
                { type:"over", day:5, slot:"Morgon" }, { type:"up" });
  eq(s.drop, { id:"p1", week:43, day:5, slot:"Morgon" }, "draget överlever veckobyte ⇒ flytt mellan veckor");
  }
{ const s = seq({ type:"down", id:"p1", x:10, y:10 }, { type:"hold" },
                { type:"move", x:10, y:300 }, { type:"over", day:2, slot:"Kväll" }, { type:"cancel" });
  ok(s.cancelled && !s.drop, "avbrott (Esc/pekare borta) släpper draget utan att ändra något"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10 }, { type:"hold" }, { type:"move", x:44, y:300 });
  eq([s.x, s.y], [44, 300], "draget följer pekaren"); }
{ eq(dragReduce(dragIdle, { type:"over", day:1, slot:"Kväll" }).day, null,
     "hovring utan pågående drag ändrar ingenting");
  eq(dragReduce(dragIdle, { type:"fnord" }).phase, "idle", "okänd händelse lämnar tillståndet orört"); }

{ const s = seq({ type:"down", id:"p1", x:10, y:10, week:42, t:0 }, { type:"hold" },
                { type:"over", day:2 }, { type:"up", t: 1500 });
  eq(s.tap, "p1", "0.5.0-buggen: långt stillastående tryck är ett tryck, aldrig en tom flytt");
  ok(!s.drop, "stillastående tryck skriver ingen flytt"); }
{ const s = seq({ type:"down", id:"p1", x:10, y:10, week:42 }, { type:"hold" },
                { type:"move", x:16, y:18 }, { type:"over", day:2 }, { type:"up" });
  eq(s.tap, "p1", "litet fingerglid under draget är fortfarande ett tryck"); }

/* ---------- Droppen ger en giltig justering (kopplingen till §5d) ---------- */
{ const s = seq({ type:"down", id:"sk-w42-run-thr", x:1, y:1, week:42 }, { type:"hold" },
                { type:"move", x:1, y:400 }, { type:"over", day:5 }, { type:"up" });
  const r = manualAdjust(plan, {}, s.drop.id, "move", s.drop, NOW);
  ok(!r.error, "droppens nyttolast går rakt in i manuell justering");
  eq(weekView(plan, r.overlay, 42, B).days[5].sessions.map(x => x.id),
     ["sk-w42-bike-long", "sk-w42-run-thr"], "passet ligger där det släpptes, sida vid sida med dagens övriga"); }
{ const s = seq({ type:"down", id:"sk-w42-run-thr", x:1, y:1, week:42 }, { type:"hold" },
                { type:"move", x:1, y:400 }, { type:"over", week:43, day:1 }, { type:"up" });
  const r = manualAdjust(plan, {}, s.drop.id, "move", s.drop, NOW);
  eq(weekView(plan, r.overlay, 43, B).days[1].sessions[0].id,
     "sk-w42-run-thr", "pass går att dra till en annan vecka — over bär veckan i den löpande listan");
  eq(weekView(plan, r.overlay, 42, B).days[3].sessions.length, 0,
     "passet lämnar sin gamla vecka helt"); }

/* ================================================================
   UTFALL OCH MATCHNING — härledd status (matchningsspec §10)
   ================================================================ */
import { readActivityCache, deriveMatches, applyMatchLinks, dismissMatch,
         actZoneMinutes } from "./core.js";

const act = (id, iso, sport, min, extra = {}) => ({
  id, type: { run:"Run", bike:"Ride", swim:"Swim", strength:"WeightTraining" }[sport],
  name: extra.name ?? "", start_date_local: iso, moving_time: min * 60,
  distance: extra.km != null ? extra.km * 1000 : (sport === "run" ? min * 200 : sport === "bike" ? min * 500 : 0),
  ...extra });

/* ---------- Cacheläsaren: tolerant, read-only, trimmad ---------- */
{ const raw = JSON.stringify({ data: { activities: [
    { ...act(1, "2026-10-15T18:05", "run", 52), secretField: "x".repeat(500), device_name:"FR965" } ], athlete: {} } });
  const r = readActivityCache(raw);
  eq(r.activities.length, 1, "cacheläsaren hittar aktivitetslistan under data.activities");
  eq(r.path, "data.activities", "läsaren redovisar var den hittade listan");
  ok(r.activities[0].secretField === undefined && r.activities[0].device_name === undefined,
     "F5: okända fält når aldrig Next — trimmad projektion");
  eq(r.activities[0].moving_time, 52 * 60, "matchningens fält följer med"); }
{ eq(readActivityCache(JSON.stringify({ activities: [act(1, "2026-10-15T18:05", "run", 52)] })).activities.length, 1,
     "cacheläsaren klarar listan på toppnivå också");
  ok(readActivityCache("{ trasig").error, "trasig cache förklaras, kraschar inte");
  ok(readActivityCache(JSON.stringify({ data: { athlete: {} } })).error?.includes("struktur okänd"),
     "cache utan aktivitetslista säger det rakt ut — ingen gissning"); }
{ const src = { activities: [act(1, "2026-10-15T18:05", "run", 52)] };
  const json = JSON.stringify(src);
  readActivityCache(json);
  eq(JSON.stringify(src), json, "läsningen muterar aldrig källan — v32:s cache är read-only"); }

/* ---------- Fixtur 1: exakt match ⇒ tyst länk ---------- */
{ const acts = [act(10, "2026-10-15T18:05", "run", 52, { name: "Löpintervaller tröskel" })];
  const r = deriveMatches(plan, {}, acts);
  eq(r.links.map(l => [l.sessionId, l.activityId]), [["sk-w42-run-thr", 10]],
     "fixtur 1: samma dag, gren, duration ⇒ auto-länk");
  ok(r.links[0].score >= 70, "auto-länken ligger över tröskeln");
  eq(r.unplanned.length, 0, "länkad aktivitet är inte utanför plan"); }

/* ---------- Fixtur 2: flyttat pass matchar sitt överlagrade läge ---------- */
{ const { overlay } = manualAdjust(plan, {}, "sk-w42-run-thr", "move", { day: 4 }, NOW);
  const r = deriveMatches(plan, overlay, [act(11, "2026-10-16T17:30", "run", 50)]);
  eq(r.links[0]?.sessionId, "sk-w42-run-thr",
     "fixtur 2: matchningen läser källa + överlagring — aktivitet på nya dagen träffar"); }

/* ---------- Fixtur 2b: manuellt kortat pass matchar mot nya dosen ---------- */
{ const { overlay } = manualAdjust(plan, {}, "sk-w42-bike-long", "shorten", { durationMin: 90 }, NOW);
  const r = deriveMatches(plan, overlay, [act(12, "2026-10-17T07:10", "bike", 92)]);
  ok(r.links.some(l => l.sessionId === "sk-w42-bike-long" && l.score >= 70),
     "fixtur 2b: kortat pass 150→90 matchar en 92-minutersaktivitet fullt ut"); }

/* ---------- Fixtur 5: aktivitet på struket pass ⇒ utanför plan, strykning orörd ---------- */
{ const ov = manualAdjust(plan, {}, "sk-w42-swim-css", "strike", {}, NOW).overlay;
  const r = deriveMatches(plan, ov, [act(13, "2026-10-13T12:10", "swim", 41)]);
  ok(!r.links.length && !r.questions.length, "fixtur 5: struket pass matchas aldrig (M3)");
  eq(r.unplanned, [13], "aktiviteten blir utanför plan i stället");
  const after = applyMatchLinks(ov, [{ sessionId: "sk-w42-swim-css", activityId: 13, score: 99 }], "auto", NOW);
  eq(after.sessions["sk-w42-swim-css"].status, "struck",
     "M3: inte ens en direkt länkskrivning rör en manuell strykning"); }

/* ---------- Härledd ersätter manuell — aldrig tvärtom ---------- */
{ const ov = { sessions: { "sk-w42-run-thr": { status: "done" } } };
  const after = applyMatchLinks(ov, [{ sessionId: "sk-w42-run-thr", activityId: 10, score: 90 }], "auto", NOW);
  ok(after.sessions["sk-w42-run-thr"].match && after.sessions["sk-w42-run-thr"].status === undefined,
     "§5c: länken ersätter manuell utfört-markering — en sanning");
  const v = weekView(plan, after, 42, B);
  eq(v.days[3].sessions[0].status, "done", "weekView härleder utfört ur länken");
  eq(v.summary.done, 1, "sammanfattningen räknar utförda");
  const struck = { sessions: { "sk-w42-run-thr": { status: "struck", match: { activityId: 10 } } } };
  eq(weekView(plan, struck, 42, B).days[3].sessions[0].status, "struck",
     "strykning vinner över länk även i vyn (M3)"); }

/* ---------- Redan länkat deltar inte igen ---------- */
{ const ov = applyMatchLinks({}, [{ sessionId: "sk-w42-run-thr", activityId: 10, score: 94 }], "auto", NOW);
  const r = deriveMatches(plan, ov, [act(10, "2026-10-15T18:05", "run", 52), act(14, "2026-10-15T19:40", "run", 48)]);
  ok(!r.links.some(l => l.sessionId === "sk-w42-run-thr"), "länkat pass reserveras inte om");
  eq(r.unplanned, [14], "andra aktiviteten samma kväll blir utanför plan — inte dubbellänkad"); }

/* ---------- Frågezonen + avvisning ---------- */
{ const acts = [act(15, "2026-10-14T18:00", "bike", 35)];   /* ons 35 min mot lör 150 ⇒ mittzon? */
  const r = deriveMatches(plan, {}, acts);
  ok(!r.links.length, "svag kandidat auto-länkas aldrig");
  const r2 = deriveMatches(plan, dismissMatch({}, "sk-w42-bike-long", 15, NOW), acts);
  ok(!r2.questions.some(q => q.activityId === 15), "avvisat par föreslås aldrig igen");
  ok(r2.unplanned.includes(15) || r.unplanned.includes(15) || r.questions.length,
     "aktiviteten hamnar någonstans — aldrig i limbo"); }

/* ---------- P3 + utfallsremsans data ---------- */
{ const ov = applyMatchLinks({}, [{ sessionId: "sk-w42-run-thr", activityId: 10, score: 94 }], "auto", NOW);
  const e = ov.sessions["sk-w42-run-thr"].events.at(-1);
  ok(e.rule === "match-auto" && e.why.includes("94") && e.t, "P3: länken lämnar läsbar post med poäng");
  eq(actZoneMinutes({ icu_hr_zone_times: [600, 1200, 300, 480, 120] }), [10, 20, 5, 8, 2],
     "utfallsremsan: sekunder per zon → minuter, samma zoneDist-format som plansidan (M2)");
  eq(actZoneMinutes({ icu_hr_zone_times: [] }), null, "tom zondata ⇒ ingen remsa, ingen låtsasremsa");
  eq(actZoneMinutes({}), null, "saknad zondata ⇒ null"); }

/* ================================================================
   STÄDSESSION 0.6.1 — kvotrapport + säkerhetskopia (P5)
   ================================================================ */
import { backupExport, backupImport } from "./core.js";

/* ---------- Kvotrapporten ser allt — även legacy ---------- */
{ const st = makeStore(fakeStorage(1e6, {
    "trizone.overlay.v1": JSON.stringify(emptyOverlay("x")),
    "holmsjo.cfg": "y".repeat(4096) }));
  const r = st.report();
  ok(r.keys.some(k => k.key === "holmsjo.cfg" && k.foreign), "legacy-nycklar räknas och märks");
  ok(r.total > 4096, "totalsiffran inkluderar legacy — kvoten gör det");
  eq(r.foreignBytes, 4096, "legacy-andelen särredovisas"); }
{ const st = makeStore(fakeStorage(4600, { "holmsjo.cfg": "y".repeat(4096) }));
  const big = emptyOverlay("v1");
  for (let i = 0; i < 30; i++) big.sessions["s" + i] = { status: "done" };
  const r = st.saveOverlay(big);
  ok(!r.ok && r.error.includes("holmsjo.cfg") && r.error.includes("legacy"),
     "kvotmeddelandet pekar ut legacy-nyckeln som tar plats — inte osynlig längre"); }

/* ---------- Säkerhetskopia: rundtur ---------- */
{ const ov = manualAdjust(plan, {}, "sk-w42-run-thr", "move", { day: 4 }, NOW).overlay;
  const b = backupExport(ov, plan.planVersion, NOW);
  eq(b.kind, "trizone-next-backup", "kopian bär sin sort");
  const r = backupImport(JSON.stringify(b), plan, NOW);
  eq(r.errors, [], "giltig kopia importeras utan invändning");
  eq(effectiveSession(plan.sessions[2], r.overlay.sessions["sk-w42-run-thr"]).day, 4,
     "P5: placeringshistoriken överlever export → import");
  ok(!Object.is(b.overlay, ov), "exporten är en kopia — aldrig en referens"); }

/* ---------- Säkerhetskopia: vakter ---------- */
{ ok(backupImport("{ trasig", plan, NOW).errors[0].includes("går inte att läsa"),
     "trasig kopia förklaras, importeras aldrig");
  ok(backupImport(JSON.stringify({ kind: "nagot-annat" }), plan, NOW).errors[0].includes("inte en TRIZONE"),
     "främmande JSON avvisas på sort, inte på symptom");
  ok(backupImport(JSON.stringify({ kind: "trizone-next-backup", formatVersion: 99,
      overlay: emptyOverlay() }), plan, NOW).errors[0].includes("formatversion"),
     "okänd formatversion avvisas");
  ok(backupImport(JSON.stringify({ kind: "trizone-next-backup", formatVersion: 1,
      overlay: { sessions: { a: { status: "hittepå" } } } }), plan, NOW).errors.length > 0,
     "kopia med trasig overlay avvisas med rotorsak"); }
{ const b = backupExport({ ...emptyOverlay("gammal"), sessions: { "finns-ej": { status: "done" } } }, "gammal", NOW);
  const r = backupImport(JSON.stringify(b), plan, NOW);
  eq(r.orphans.map(o => o.id), ["finns-ej"],
     "kopia från äldre plan: okända pass blir föräldralösa — raderas aldrig tyst"); }

/* ================================================================
   STÄDSESSION 0.6.1 — kvotrapporten ser allt (legacy-hålet)
   ================================================================ */
/* ---------- Legacy-nycklar räknas (holmsjo-hålet) ---------- */
{ const st = makeStore(fakeStorage(1e6, {
    "trizone.overlay.v1": JSON.stringify(emptyOverlay("x")),
    "holmsjo.cache": "z".repeat(4000) }));
  const r = st.report();
  eq(r.keys.length, 2, "kvotrapporten räknar alla nycklar — även legacy");
  ok(r.keys.find(k => k.key === "holmsjo.cache").foreign, "främmande nycklar märks");
  eq(r.foreignBytes, 4000, "legacy-kvoten redovisas separat"); }
{ const st = makeStore(fakeStorage(4300, { "holmsjo.cache": "z".repeat(4000) }));
  const big = emptyOverlay("v1");
  for (let i = 0; i < 20; i++) big.sessions["s" + i] = { status: "done" };
  const r = st.saveOverlay(big);
  ok(!r.ok && r.error.includes("holmsjo.cache (legacy)"),
     "kvotmeddelandet pekar ut legacy-nyckeln som äter platsen — inte längre osynlig"); }


/* ================================================================
   0.7.0 — BINDNINGAR (D7): cfg-nyckel, validering, backup bär cfg
   ================================================================ */
import { DEFAULT_CFG, validateCfg } from "./core.js";

{ const st = makeStore(fakeStorage(1e6));
  const l0 = st.loadCfg();
  eq(l0.cfg.schedule[1], ["Lunch","Kväll"], "utan sparad cfg gäller default-livsschemat");
  ok(!l0.stored && !l0.error, "saknad cfg är inget fel — den är bara inte satt");
  const mine = { schedule: { ...DEFAULT_CFG.schedule, 2: ["Morgon","Kväll"] } };
  ok(st.saveCfg(mine).ok, "giltig cfg sparas");
  const l1 = st.loadCfg();
  eq(l1.cfg.schedule[2], ["Morgon","Kväll"], "cfg-rundtur: livsschemat överlever omladdning");
  ok(l1.stored, "sparad cfg redovisas som lagrad"); }
{ const st = makeStore(fakeStorage(1e6));
  ok(!st.saveCfg({ schedule: { 2: ["Natt"] } }).ok, "okänt fönster avvisas — cfg skrivs aldrig trasig");
  ok(!st.saveCfg({ schedule: { 9: ["Kväll"] } }).ok, "dag utanför 0–6 avvisas");
  ok(!validateCfg("sträng").ok, "cfg som inte är objekt avvisas"); }
{ const st = makeStore(fakeStorage(1e6, { "trizone.next.cfg.v1": "{ trasig" }));
  const l = st.loadCfg();
  eq(l.cfg.schedule[0], ["Kväll"], "trasig cfg blockerar aldrig — default gäller");
  ok(l.error?.includes("går inte att läsa"), "…men felet redovisas, tystas inte"); }

/* ---------- Backup bär bindningarna (D7) ---------- */
{ const cfg = { schedule: { ...DEFAULT_CFG.schedule, 5: ["Morgon"] } };
  const b = backupExport(emptyOverlay("v"), "v", NOW, cfg);
  const r = backupImport(JSON.stringify(b), plan, NOW);
  eq(r.errors, [], "backup med cfg importeras felfritt");
  eq(r.cfg.schedule[5], ["Morgon"], "livsschemat följer med kopian mellan enheter");
  const r0 = backupImport(JSON.stringify(backupExport(emptyOverlay("v"), "v", NOW)), plan, NOW);
  eq([r0.errors.length, r0.cfg], [0, null], "äldre kopia utan cfg accepteras — cfg är valfri");
  const bad = backupExport(emptyOverlay("v"), "v", NOW, { schedule: { 3: ["Natt"] } });
  ok(backupImport(JSON.stringify(bad), plan, NOW).errors[0].includes("cfg"),
     "trasig cfg i kopian avvisas med rotorsak"); }

/* ================================================================
   0.8.0 — IDAG-VYN: tillståndslogik, RPE-företräde, manuell loggning
   ================================================================ */
import { todayView, planDayOf, nextSession, effectiveRpe, logResult, unlogResult,
         FEEL_LABEL } from "./core.js";

/* Referensplanen: v42 mån 2026-10-12 … sön 2026-10-18. run-thr = tors (day 3). */
{ eq(planDayOf(plan, "2026-10-15"), { week: 42, day: 3 }, "datum → planvecka och dag");
  eq(planDayOf(plan, "2026-09-01"), null, "datum utanför planen → null"); }

{ const t = todayView(plan, {}, "2026-10-15");
  eq(t.state, "pass", "dag med oavklarat pass ⇒ hjälten är ett passkort");
  eq(t.hero.id, "sk-w42-run-thr", "hjälten är dagens pass"); }
{ const two = structuredClone(plan);
  two.sessions.push({ ...two.sessions.find(x => x.id === "sk-w42-run-thr"),
    id: "extra-b", prio: "B", title: "Extra" });
  const t = todayView(two, {}, "2026-10-15");
  eq([t.hero.prio, t.also.map(x => x.prio)], ["A", ["B"]],
     "flera pass samma dag ⇒ A-prio tar hjälteplatsen, resten listas"); }
{ const ov = applyMatchLinks({}, [{ sessionId: "sk-w42-run-thr", activityId: 9, score: 90 }], "auto", NOW);
  eq(todayView(plan, ov, "2026-10-15").state, "done",
     "alla dagens pass utförda ⇒ Klart för idag");
  const struck = manualAdjust(plan, {}, "sk-w42-run-thr", "strike", {}, NOW).overlay;
  eq(todayView(plan, struck, "2026-10-15").state, "rest",
     "enda passet struket ⇒ dagen är vila, inte skuld"); }
{ eq(todayView(plan, {}, "2026-10-12").state, "rest", "planlagd dag utan pass ⇒ vila");
  eq(todayView(plan, {}, "2026-08-03").state, "off", "datum utanför planen ⇒ off");
  const n = nextSession(plan, {}, "2026-10-12");
  ok(n && n.date === "2026-10-13", "vilodagen vet vilket pass som kommer härnäst"); }

/* ---------- RPE: klockan vinner, manuellt är fallback ---------- */
{ eq(effectiveRpe({ rpe: 7 }, { icu_rpe: 3 }), { value: 3, source: "klockan" },
     "härledd RPE från aktiviteten vinner över manuell");
  eq(effectiveRpe({ rpe: 7 }, {}), { value: 7, source: "manuell" },
     "utan klockdata gäller den manuella");
  eq(effectiveRpe({}, { icu_rpe: 14 }), null, "orimlig RPE förkastas — ingen låtsassiffra");
  eq(FEEL_LABEL[4], "stark", "känsloskalan 1–5 har svenska etiketter"); }
{ const r = readActivityCache(JSON.stringify({ activities: [
    { id: 1, type: "Run", start_date_local: "2026-10-15T18:00", moving_time: 1800, icu_rpe: 6, feel: 2, secret: "x" }] }));
  eq([r.activities[0].icu_rpe, r.activities[0].feel, r.activities[0].secret],
     [6, 2, undefined], "RPE och känsla överlever trimningen — okända fält gör det inte"); }

/* ---------- Manuell loggning ---------- */
{ const r = logResult(plan, {}, "sk-w42-str-core", { rpe: 6, userNote: "tungt men fint" }, NOW);
  const so = r.overlay.sessions["sk-w42-str-core"];
  eq([so.status, so.rpe, so.userNote], ["done", 6, "tungt men fint"],
     "loggning sätter utfört + RPE + notering");
  ok(so.events.at(-1).rule === "manual-log", "P3: loggningen lämnar post");
  eq(todayView(plan, r.overlay, sessionDate(plan, plan.sessions.find(s=>s.id==="sk-w42-str-core"))).state,
     "done", "manuellt loggat pass ger Klart för idag");
  const u = unlogResult(r.overlay, "sk-w42-str-core", NOW);
  eq([u.overlay.sessions["sk-w42-str-core"].status, u.overlay.sessions["sk-w42-str-core"].rpe],
     [undefined, undefined], "ångra återställer exakt");
  const v = validateOverlay(r.overlay);
  ok(v.ok, "loggad overlay passerar valideringen (rpe/userNote är schemafält)"); }
{ ok(logResult(plan, {}, "sk-w42-str-core", { rpe: 11 }, NOW).error?.includes("1–10"),
     "RPE utanför skalan avvisas");
  const struck = manualAdjust(plan, {}, "sk-w42-run-thr", "strike", {}, NOW).overlay;
  ok(logResult(plan, struck, "sk-w42-run-thr", {}, NOW).error?.includes("struket"),
     "struket pass loggas inte — strykningen äger (M3-mönstret)");
  const linked = applyMatchLinks({}, [{ sessionId: "sk-w42-run-thr", activityId: 9, score: 90 }], "auto", NOW);
  ok(unlogResult(linked, "sk-w42-run-thr", NOW).error?.includes("matchningen"),
     "länkad status kan inte ångras manuellt — en sanning per fakta"); }

/* ---------- Zonkonfig-paritet (matchning §7) ---------- */
import { zoneParity, ZONE_COUNT } from "./core.js";
{ const five = [{ id:1, icu_hr_zone_times:[600,900,300,240,60] }, { id:2, icu_hr_zone_times:[300,1200,0,0,0] }];
  const r = zoneParity(five);
  ok(r.ok && r.checked === 2, "femzonsdata ⇒ paritet");
  eq(zoneParity([]).ok, true, "utan aktiviteter finns inget att varna om");
  eq(zoneParity([{ id:3 }]).checked, 0, "aktiviteter utan zondata granskas inte"); }
{ const mixed = [{ id:1, icu_hr_zone_times:[600,900,300,240,60] },
                 { id:2, icu_hr_zone_times:[100,200,300,400,500,600,700] }];
  const r = zoneParity(mixed);
  ok(!r.ok, "avvikande zonantal ⇒ paritetsbrott");
  ok(r.why.includes("7 zoner") && r.why.includes(String(ZONE_COUNT)),
     "varningen säger vad som skiljer — rotorsak, inte symptom");
  ok(r.why.includes("intervals.icu"), "varningen pekar på var felet rättas");
  eq(r.mismatches.map(m => m.id), [2], "avvikarna pekas ut individuellt"); }

/* ================================================================
   0.9.0 — PROFILEN ÄGER UPPSÄTTNINGEN (P2), ATLETVAKT (D-M2)
   ================================================================ */
import { ENGINE_FIELDS, athleteGuard, activateMode, LIFE_MODES } from "./core.js";

/* ---------- Motorvärden är data, inte kod ---------- */
{ const st = makeStore(fakeStorage(1e6));
  ok(st.saveCfg({ engine: { lowShareTarget: 0.70, volumeCapPct: 130 } }).ok,
     "egna motorvärden sparas — 80/20 är en default, inte en sanning");
  eq(st.loadCfg().cfg.engine.lowShareTarget, 0.70, "värdet överlever omladdning");
  ok(!st.saveCfg({ engine: { lowShareTarget: 0.20 } }).ok, "orimligt lågt mål avvisas");
  ok(!st.saveCfg({ engine: { hittepå: 5 } }).ok, "okänt motorvärde avvisas — vitlista, inte fritt");
  ok(!st.saveCfg({ engine: { comebackCount: 99 } }).ok, "värde utanför gräns avvisas");
  ok(ENGINE_FIELDS.lowShareTarget.min === 50, "gränserna är deklarerade, inte gömda"); }

/* ---------- Meddelandet ljuger aldrig om sin egen tröskel (0.9.0-defekten)
   + blocks[].lowShare (beslut A): block > profil, tiger på test/race ---------- */
{ const flags = [{ id: "polarization", week: 42 }, { id: "duration-drift", week: 42 }];
  const std = applyRules(plan, {}, {}, flags, NOW);
  ok(std.actions.some(a => a.rule === "polarization" && a.why.includes("75 %")),
     "blockets fasmål 0.75 ⇒ texten säger 75 %");
  ok(std.actions.some(a => a.rule === "polarization" && a.why.includes("Skelettblock")),
     "texten namnger fasen som målet kommer ur");
  const mine = applyRules(plan, {}, { engine: { lowShareTarget: 0.70, driftPct: 140 } }, flags, NOW);
  ok(mine.actions.some(a => a.rule === "polarization" && a.why.includes("75 %")),
     "block vinner över profil: 70 % i profilen ändrar inte fasens 75 %");
  ok(mine.actions.some(a => a.why.includes("140 %")),
     "duration-drift följer fortsatt profilen — driftPct har inget fasvärde");
  ok(mine.actions.filter(a => a.level === 3 && a.why.includes("%")).length === 1,
     "flaggmerge (§10): polarization × duration-drift blir EN post, båda siffrorna med");

  /* profil-fallback när blocket saknar värde */
  const bare = structuredClone(plan); delete bare.blocks[0].lowShare;
  const fb = applyRules(bare, {}, { engine: { lowShareTarget: 0.70 } },
    [{ id: "polarization", week: 42 }], NOW);
  ok(fb.actions.some(a => a.rule === "polarization" && a.why.includes("70 %")),
     "utan blockvärde: profilens tröskel talar (0.9.0-regeln lever)");
  ok(!fb.actions.some(a => a.rule === "polarization" && a.why.includes("Skelettblock")),
     "profilkälla ⇒ ingen fasetikett — texten ljuger inte om varifrån målet kom");

  /* tystnad på test- och race-veckor (beslut A): veckan ÄR planerat hård */
  const race = structuredClone(plan);
  race.weeks.find(w => w.week === 42).type = "race";
  const rq = applyRules(race, {}, {}, flags, NOW);
  ok(!rq.actions.some(a => a.rule === "polarization"),
     "race-vecka: polarization tiger — en tävlingsvecka bedöms inte mot 80/20");
  ok(rq.actions.some(a => a.rule === "duration-drift"),
     "endast polarization tiger — duration-drift lever på race-veckan (beslutets omfång)");
  const tv = applyRules(plan, {}, {},
    [{ id: "polarization", week: 44 }], NOW);   /* v.44 är test i plan_ref */
  ok(!tv.actions.some(a => a.rule === "polarization"),
     "test-vecka: polarization tiger — testveckan är avsiktligt ovanligt hård");
  const missing = applyRules(plan, {}, {},
    [{ id: "polarization", week: 99 }], NOW);
  ok(missing.actions.some(a => a.rule === "polarization"),
     "vecka utanför planen: flaggan lever på profilmålet — tystnad kräver explicit test/race, aldrig saknad data"); }
{ const q = applyRules(plan, {}, { engine: { volumeCapPct: 130 } },
    [{ id: "volume-cap", sessionId: "sk-w42-run-thr", source: "derived" }], NOW);
  ok(q.questions.some(x => x.ask.includes("130 %")), "frågan citerar profilens tak, inte kodens"); }

/* ---------- Atletvakt ---------- */
{ eq(athleteGuard(plan, { athlete: "niklas" }).ok, true, "rätt atlet ⇒ planen laddas");
  const adopt = athleteGuard(plan, { athlete: null });
  ok(adopt.ok && adopt.adopt === "niklas", "tom profil adopterar planens atlet vid första läsning");
  const wrong = athleteGuard(plan, { athlete: "david" });
  ok(!wrong.ok && wrong.why.includes("niklas") && wrong.why.includes("david"),
     "fel atlet ⇒ planen laddas inte, och felet namnger båda");
  eq(athleteGuard({ sessions: [] }, { athlete: "niklas" }).ok, true,
     "plan utan atletfält ⇒ vakten vilar, bryter inte äldre planer"); }

/* ---------- Livslägen: aktivering, ögonblicksbild, handen vinner ---------- */
{ const a = activateMode({}, "mode-vacation", { from: "2026-10-12", to: "2026-10-18" }, NOW);
  eq(a.key, "mode-vacation@2026-10-12", "lägesnyckeln är regel@startdatum");
  ok(a.overlay.modes.active.length === 1, "läget är aktivt");
  ok(a.overlay.modes.log.at(-1).why.includes("Semester"), "P3: aktiveringen loggas läsbart");
  ok(activateMode(a.overlay, "mode-vacation", { from: "2026-10-12" }, NOW).error,
     "samma läge aktiveras inte två gånger");
  ok(activateMode({}, "hittepå", { from: "2026-10-12" }, NOW).error, "okänt läge avvisas");
  ok(activateMode({}, "mode-vacation", {}, NOW).error, "läge utan startdatum avvisas");
  eq(LIFE_MODES["illness-stop"].label, "Sjuk", "lägena har svenska etiketter"); }
{ /* Full rundtur: aktivera → motorn stryker → avaktivera → exakt återställt */
  const a = activateMode({}, "mode-vacation", { from: "2026-10-12", to: "2026-10-18" }, NOW);
  const r = applyRules(plan, a.overlay, {}, [], NOW);
  const after = applyActions(a.overlay, r.actions);
  const struck = Object.entries(after.sessions).filter(([, v]) => v.status === "struck").map(([k]) => k);
  ok(struck.length > 0, "semesterläget stryker B-pass");
  ok(!after.sessions["sk-w42-str-core"] || after.sessions["sk-w42-str-core"].status !== "struck",
     "skyddat pass överlever semesterläget (spec 1 §8)");
  const off = deactivateMode(after, a.key, NOW);
  ok(struck.every(id => off.sessions[id].status !== "struck"),
     "avaktivering återställer exakt föregående tillstånd (P5)"); }

/* ---------- Regression 0.9.0 (två lärdomar): öppna lägen ---------- */
{ /* torsdag 15/10 som "idag" — run-thr-dagen i referensplanen */
  const T = "2026-10-15T08:00:00";
  const a = activateMode({}, "illness-stop", { from: "2026-10-15" }, T);
  const r = applyRules(plan, a.overlay, {}, [], T);
  const struck = r.actions.filter(x => x.action === "strike").map(x => x.session);
  ok(struck.includes("sk-w42-run-thr"), "öppet sjukläge stryker dagens pass");
  ok(!struck.includes("sk-w42-bike-long") && !struck.includes("sk-w43-run-thr"),
     "…men ALDRIG framtiden — öppna spann verkar dag för dag (0.9.0-buggen: 21 pass ströks)");
  const bounded = activateMode({}, "illness-stop", { from: "2026-10-15", to: "2026-10-18" }, T);
  const rb = applyRules(plan, bounded.overlay, {}, [], T);
  ok(rb.actions.some(x => x.action === "strike" && x.session === "sk-w42-bike-long"),
     "uttryckligt slutdatum täcker sitt spann — lördagen stryks"); }
{ /* på → av → på samma dygn: läget måste leva igen (H4 gäller inte modeKey) */
  const T = "2026-10-15T08:00:00";
  const a1 = activateMode({}, "mode-vacation", { from: "2026-10-15" }, T);
  const r1 = applyRules(plan, a1.overlay, {}, [], T);
  let ov = applyActions(a1.overlay, r1.actions.filter(x => x.session && x.action !== "warn"));
  ov = deactivateMode(ov, "mode-vacation@2026-10-15", T);
  const a2 = activateMode(ov, "mode-vacation", { from: "2026-10-15" }, T);
  const r2 = applyRules(plan, a2.overlay, {}, [], T);
  ok(r2.actions.filter(x => x.session && x.action !== "warn").length > 0,
     "omaktiverat läge ingriper igen — H4 spärrar automatik, aldrig din hand (0.9.0-buggen)"); }
{ const r = applyRules(plan, {}, {}, [], NOW);
  const hl = r.actions.find(a => a.rule === "heavy-legs");
  ok(hl && !hl.why.includes("sk-w42") && hl.why.includes("("),
     "nivå 3-texter talar titlar och dagnamn — aldrig pass-id"); }
{ const r = zoneParity([{ id: 1, type: "Swim", icu_hr_zone_times: [1,2,3,4,5,6,7] },
                        { id: 2, type: "Run", icu_hr_zone_times: [1,2,3,4,5] }]);
  ok(r.why.includes("swim 1"), "paritetsvarningen pekar ut grenen — man vet var man ska leta");
  ok(r.why.includes("PULS"), "…och att det är pulszoner som avses, inte pace"); }

/* ================================================================
   0.9.2 — HEAVY-LEGS ENKELRIKTAD · MÅNADSVYN
   ================================================================ */
import { monthView, planMonths, MONTHNAMES } from "./core.js";

/* ---------- Riktningen (spec 1 §6 rev 2026-08-04) ---------- */
{ const r = applyRules(plan, {}, {}, [], NOW);
  const hl = r.actions.filter(a => a.rule === "heavy-legs");
  ok(hl.length === 1 && hl[0].pair.includes("sk-w42-str-core") && hl[0].pair.includes("sk-w42-run-thr"),
     "styrka (ons) före kvalitet (tors) ⇒ varning — kvalitetspasset skyddas");
  ok(hl[0].why.includes("före"), "texten säger riktningen");
  /* kvalitet FÖRE styrka: flytta styrkan till dagen efter tröskeln — ingen varning */
  const moved = manualAdjust(plan, {}, "sk-w42-str-core", "move", { day: 4 }, NOW).overlay;
  const r2 = applyRules(plan, moved, {}, [], NOW);
  ok(!r2.actions.some(a => a.rule === "heavy-legs"),
     "styrka dagen EFTER kvalitet ⇒ tyst — sund sekvensering, inte ett fynd (produktägarbeslut)"); }

/* ---------- Månadsvyn ---------- */
{ eq(planMonths(plan), ["2026-10", "2026-11"], "planens månader — v44 når in i november");
  const m = monthView(plan, {}, "2026-10");
  eq(m.label, "Oktober 2026", "månadsetiketten");
  const w42 = m.rows.find(r => r.week === 42);
  ok(w42, "veckonummerkolumnen bär planveckorna");
  const thu = w42.days.find(d => d.date === "2026-10-15");
  ok(thu.inMonth && thu.at.day === 3, "cellen vet sin plandag");
  eq(thu.dots.map(d => d.sport), ["run"], "grenprick för torsdagens pass");
  const ov = applyMatchLinks({}, [{ sessionId: "sk-w42-run-thr", activityId: 7, score: 90 }], "auto", NOW);
  ok(monthView(plan, ov, "2026-10").rows.find(r => r.week === 42)
       .days.find(d => d.date === "2026-10-15").dots[0].done,
     "utförd prick är fylld — samma härledning som veckostrippen");
  const out = m.rows[0].days.find(d => !d.at);
  ok(out && out.dots.length === 0, "dag utanför planen bär inga prickar");
  const struck = manualAdjust(plan, {}, "sk-w42-run-thr", "strike", {}, NOW).overlay;
  eq(monthView(plan, struck, "2026-10").rows.find(r => r.week === 42)
       .days.find(d => d.date === "2026-10-15").dots.length, 0,
     "struket pass syns inte i månaden");
  eq(MONTHNAMES.length, 12, "tolv månader, svenska"); }

/* ---------- Gardinen (0.9.3): curtainReduce ---------- */
import { curtainReduce, curtainIdle, CURTAIN } from "./core.js";
const cseq = (...evs) => evs.reduce(curtainReduce, curtainIdle);

{ eq(cseq({ type:"down", y:100, t:0, open:false }, { type:"up", y:103, t:120 }).commit, "open",
     "kort tryck på handtaget togglar — gesten är aldrig enda vägen (§9)");
  eq(cseq({ type:"down", y:100, t:0, open:true }, { type:"up", y:101, t:100 }).commit, "close",
     "tryck när öppen ⇒ stänger"); }
{ const c = cseq({ type:"down", y:100, t:0, open:false }, { type:"move", y:250, t:400 });
  ok(Math.abs(c.progress - 150/CURTAIN.range) < 1e-9, "progress följer fingret linjärt");
  eq(cseq({ type:"down", y:100, t:0, open:false }, { type:"move", y:900, t:400 }).progress, 1,
     "progress klipps vid 1 — gardinen överdras aldrig"); }
{ eq(cseq({ type:"down", y:100, t:0, open:false }, { type:"move", y:220, t:500 },
          { type:"up", y:220, t:500 }).commit, "open",
     "släpp över tröskeln (0,4) ⇒ öppnas");
  eq(cseq({ type:"down", y:100, t:0, open:false }, { type:"move", y:150, t:500 },
          { type:"up", y:150, t:500 }).commit, "close",
     "släpp under tröskeln ⇒ faller tillbaka — aldrig ett mellanläge"); }
{ eq(cseq({ type:"down", y:100, t:0, open:false }, { type:"move", y:180, t:80 },
          { type:"up", y:180, t:80 }).commit, "open",
     "snabb flick öppnar trots kort sträcka");
  eq(cseq({ type:"down", y:400, t:0, open:true }, { type:"move", y:330, t:80 },
          { type:"up", y:330, t:80 }).commit, "close",
     "flick uppåt stänger den öppna gardinen"); }
{ const c = cseq({ type:"down", y:400, t:0, open:true }, { type:"move", y:340, t:300 });
  ok(Math.abs(c.progress - (1 - 60/CURTAIN.range)) < 1e-9, "öppen gardin: drag uppåt minskar progress");
  eq(cseq({ type:"down", y:400, t:0, open:true }, { type:"move", y:340, t:300 },
          { type:"cancel" }).commit, "open",
     "avbrott återgår till utgångsläget — gardinen tappas aldrig halvvägs"); }

/* ================================================================
   FAS B — egen datapipeline mot intervals.icu (0.10.0)
   ================================================================ */
import { ICU, validateConn, connReady, icuRequest, proxyAllowed, icuError,
         CACHE_VERSION, emptyCache, trimCache, projectActivities, projectWellness,
         projectAthlete, benchmarksOf, pickActivitySource, zoneParityFull,
         recovery, wellnessFlags, RECOV, V32_CACHE_KEY } from "./core.js";

/* ---------- Anslutning: validering ---------- */
{ ok(validateConn({ apiKey: "", athleteId: "" }).ok,
     "conn: tomt är inte fel — anslutningen är bara inte konfigurerad än");
  ok(validateConn({ apiKey: "abcdefghijkl", athleteId: "i123456" }).ok, "conn: giltig anslutning passerar");
  ok(validateConn({ apiKey: "abcdefghijkl", athleteId: "123456" }).ok, "conn: rena siffror accepteras som athlete-ID");
  const bad = validateConn({ apiKey: "abcdefghijkl", athleteId: "niklas" });
  ok(!bad.ok && bad.errors[0].why.includes("i123456"),
     "conn: felaktigt athlete-ID pekar på väntat format, inte bara 'ogiltigt'");
  const shortKey = validateConn({ apiKey: "abc", athleteId: "i123456" });
  ok(!shortKey.ok && shortKey.errors[0].why.includes("Developer"),
     "conn: för kort nyckel säger VAR den hämtas");
  ok(!validateConn({ apiKey: "abcdefghijkl", athleteId: "i123456", historyDays: 9999 }).ok,
     "conn: historikfönster utanför gränserna avvisas");
  ok(!validateConn(null).ok, "conn: null avvisas");
  eq(ICU.defHistory, 370, "historikfönstret: 370 dagar — hela säsongen jämförbar (produktägarbeslut)"); }

/* ---------- Anslutning: beredskap ---------- */
{ eq(connReady({ apiKey: "", athleteId: "" }).ready, false, "connReady: tom anslutning är inte klar");
  ok(connReady({ apiKey: "", athleteId: "i123456" }).why.includes("API-nyckel"),
     "connReady: halvifylld säger vilken halva som saknas");
  ok(connReady({ apiKey: "abcdefghijkl", athleteId: "" }).why.includes("athlete-ID"),
     "connReady: saknat ID namnges");
  ok(connReady({ apiKey: "abcdefghijkl", athleteId: "i123456" }).ready, "connReady: komplett anslutning är klar"); }

/* ---------- Anslutning: URL och headers (rena, testbara utan nät) ---------- */
{ const c = { apiKey: "abcdefghijkl", athleteId: "i123456", historyDays: 370 };
  const a = icuRequest(c, "activities", "2026-08-05");
  ok(a.url.startsWith("https://intervals.icu/api/v1/athlete/i123456/activities"), "icuRequest: aktivitets-URL");
  ok(a.url.includes("oldest=2025-07-31"), "icuRequest: oldest räknas 370 dagar bakåt");
  ok(a.url.includes("newest=2026-08-06"), "icuRequest: newest tar med morgondagen (tidszonsmarginal)");
  eq(a.headers.Authorization, "Basic " + Buffer.from("API_KEY:abcdefghijkl").toString("base64"),
     "icuRequest: Basic-auth med API_KEY som användarnamn (v32:s verifierade form)");
  const w = icuRequest(c, "wellness", "2026-08-05");
  ok(w.url.includes("/wellness?oldest=2025-07-31&newest=2026-08-05"), "icuRequest: wellness slutar idag, inte imorgon");
  eq(icuRequest(c, "athlete", "2026-08-05").url, "https://intervals.icu/api/v1/athlete/i123456",
     "icuRequest: atletprofilen är bas-URL:en utan spann");
  ok(icuRequest({ apiKey: "", athleteId: "" }, "activities", "2026-08-05").error,
     "icuRequest: okonfigurerad anslutning ger fel, aldrig ett halvt anrop");
  ok(icuRequest(c, "gissning", "2026-08-05").error.includes("gissning"),
     "icuRequest: okänd hämtningstyp namnges");
  const c30 = { ...c, historyDays: 30 };
  ok(icuRequest(c30, "activities", "2026-08-05").url.includes("oldest=2026-07-06"),
     "icuRequest: kortare historikfönster respekteras"); }

/* ---------- Nyckeln lämnar aldrig webbläsaren (v32:s säkerhetsregel, ärvd) ---------- */
{ const r = icuRequest({ apiKey: "hemlignyckel1", athleteId: "i123456" }, "activities", "2026-08-05");
  eq(proxyAllowed(r.headers), false,
     "SÄKERHET: anrop med Authorization får ALDRIG proxas — annars får proxyägaren nyckeln");
  eq(proxyAllowed({}), true, "proxyAllowed: anrop utan auth får proxas (publika CSV-länkar)");
  eq(proxyAllowed(null), true, "proxyAllowed: headerlöst anrop får proxas");
  ok(!r.url.includes("hemlignyckel1"), "SÄKERHET: nyckeln hamnar aldrig i URL:en"); }

/* ---------- Felmeddelanden pekar på rotorsak (F4) ---------- */
{ ok(icuError(401, "aktiviteter").includes("nyckeln avvisades"), "401 → fel nyckel, inte 'något gick fel'");
  ok(icuError(403, "aktiviteter").includes("athlete-ID"), "403 → fel athlete-ID namnges");
  ok(icuError(404, "wellness").includes("i123456"), "404 → väntat ID-format visas");
  ok(icuError(429, "aktiviteter").includes("Vänta"), "429 → åtgärden är att vänta");
  ok(icuError(503, "wellness").includes("Cachen gäller"), "5xx → cachen gäller, appen dör inte"); }

/* ---------- Egen cache: nyckel, form, trimning ---------- */
{ eq(KEYS.cache, "trizone.next.cache.v1", "cache: egen nyckel, beslutad i fas B");
  eq(V32_CACHE_KEY, "trizone.cache.v1", "v32-nyckeln är känd men skrivs aldrig");
  const e = emptyCache();
  eq(e.v, CACHE_VERSION, "tom cache bär formatversion");
  eq([e.activities.length, e.wellness.length, e.athlete], [0, 0, null], "tom cache är tom");
  const c = { ...emptyCache(),
    activities: [{ id: 1, start_date_local: "2024-01-01T08:00:00" },
                 { id: 2, start_date_local: "2026-08-01T08:00:00" }],
    wellness: [{ id: "2024-01-01" }, { id: "2026-08-01" }] };
  const t = trimCache(c, "2026-08-05", 370);
  eq(t.activities.map(a => a.id), [2], "trimCache: aktiviteter utanför fönstret faller bort");
  eq(t.wellness.map(w => w.id), ["2026-08-01"], "trimCache: wellness trimmas mot samma fönster"); }

/* ---------- Egen cache: lagring, patch-semantik, degradering ---------- */
{ const st = makeStore(fakeStorage(1e6));
  eq(st.loadCache().cache.activities.length, 0, "loadCache: saknad cache ger tom cache, inget fel");
  const r1 = st.saveCache(emptyCache(), { activities: [{ id: 1, start_date_local: "2026-08-01T08:00:00" }] }, "2026-08-05");
  ok(r1.ok, "saveCache: skrivning lyckas");
  eq(r1.cache.fetched.activities, "2026-08-05", "saveCache: hämtningstidpunkt stämplas per sektion");
  eq(r1.cache.fetched.wellness, null, "saveCache: orörd sektion får ingen falsk stämpel");
  const r2 = st.saveCache(r1.cache, { wellness: [{ id: "2026-08-04", restingHR: 48 }] }, "2026-08-05");
  eq(r2.cache.activities.length, 1, "saveCache: patch rör aldrig facken den inte fick värden för");
  eq(r2.cache.wellness.length, 1, "saveCache: nytt fack skrivs");
  eq(st.loadCache().cache.wellness[0].restingHR, 48, "loadCache: läser tillbaka det som skrevs"); }

{ const st = makeStore(fakeStorage(1e6, { "trizone.next.cache.v1": "{trasig" }));
  const l = st.loadCache();
  eq(l.cache.activities.length, 0, "loadCache: trasig cache blockerar aldrig appen");
  ok(l.error, "loadCache: trasig cache redovisas"); }

{ const st = makeStore(fakeStorage(1e6, { "trizone.next.cache.v1": JSON.stringify({ v: 99, activities: [] }) }));
  const l = st.loadCache();
  ok(l.error.includes("hämta om"), "loadCache: okänd formatversion ger tom cache och besked, aldrig feltolkning"); }

{ /* Kvotfel: hellre halv historik med besked än ingen cache alls (F5) */
  const many = Array.from({ length: 200 }, (_, i) =>
    ({ id: i, type: "Run", start_date_local: "2026-08-01T08:00:00", name: "x".repeat(60) }));
  const st = makeStore(fakeStorage(14000));
  const r = st.saveCache(emptyCache(), { activities: many }, "2026-08-05");
  ok(r.ok && r.degraded, "saveCache: kvotfel ⇒ degraderad skrivning i stället för allt-eller-inget");
  ok(r.cache.activities.length < 200 && r.cache.activities.length >= 30, "saveCache: historiken halveras, inte nollas");
  ok(r.error.includes("Inställningar"), "saveCache: degradering säger vad användaren kan göra");
  eq(r.cache.activities[r.cache.activities.length - 1].id, 199, "saveCache: NYASTE historiken behålls"); }

{ const st = makeStore(fakeStorage(1e6));
  st.saveCache(emptyCache(), { activities: [{ id: 1, start_date_local: "2026-08-01T08:00:00" }] }, "2026-08-05");
  ok(st.clearCache().ok, "clearCache: cachen går att rensa");
  eq(st.loadCache().cache.activities.length, 0, "clearCache: efter rensning är cachen tom"); }

/* ---------- Projektioner: Next bestämmer fälten (F5) ---------- */
{ const raw = [{ id: 9, type: "Run", start_date_local: "2026-08-03T18:00:00", moving_time: 3120,
                 icu_rpe: 7, feel: 4, kudos_count: 12, description: "x".repeat(4000), athlete: { id: "i1" } },
               { id: 10, type: "Ride", start_date: "2026-08-04T06:00:00", moving_time: 3600 },
               { nonsens: true }];
  const p = projectActivities(raw);
  eq(p.activities.length, 2, "projectActivities: skräpposter faller bort");
  eq(p.dropped, 1, "projectActivities: bortfallet redovisas");
  ok(!("kudos_count" in p.activities[0]) && !("description" in p.activities[0]),
     "projectActivities: okända fält når aldrig lagringen");
  eq(p.activities[0].icu_rpe, 7, "projectActivities: icu_rpe följer med — fältet v32 inte bar");
  /* REGRESSION 2026-08-05 del 2: vitlistan strippade device_watts, så wattfixen i
     effTrend var verkningslös mot cachad data — fältet nådde aldrig fram. */
  { const pw = projectActivities([{ id: 77, type: "Ride", start_date_local: "2026-08-01T18:00:00",
      moving_time: 3600, average_watts: 180, device_watts: true }]);
    eq(pw.activities[0].device_watts, true,
       "REGRESSION: device_watts överlever projektionen — annars är wattfixen verkningslös"); }
  eq(p.activities[0].feel, 4, "projectActivities: feel följer med");
  eq(p.activities[1].start_date_local, "2026-08-04T06:00:00",
     "projectActivities: start_date faller tillbaka till start_date_local");
  eq(p.activities.map(a => a.id), [9, 10], "projectActivities: sorterad i tidsordning");
  ok(projectActivities("nej").error, "projectActivities: icke-lista ger fel, aldrig tyst tom"); }

{ const raw = [{ id: "2026-08-04", restingHR: 47, hrv: 62, sleepSecs: 21600, junk: "x".repeat(3000) },
               { id: "2026-08-03", resting_hr: 49 },
               { id: "inte-ett-datum", restingHR: 50 }];
  const p = projectWellness(raw);
  eq(p.wellness.length, 2, "projectWellness: rader utan datum-id faller bort");
  eq(p.wellness[0].id, "2026-08-03", "projectWellness: sorterad i datumordning");
  eq(p.wellness[0].restingHR, 49, "projectWellness: resting_hr normaliseras till restingHR — en stavning lagras");
  ok(!("resting_hr" in p.wellness[0]), "projectWellness: dubbelstavningen städas bort (en sanning per fakta)");
  ok(!("junk" in p.wellness[1]), "projectWellness: okända fält vitlistas bort"); }

/* ---------- Atletprofil och benchmarks ---------- */
const ATH = { id: "i123456", name: "Niklas", icu_ftp: 262, sportSettings: [
  { types: ["Ride", "VirtualRide"], hr_zones: [120, 140, 155, 168, 185], lthr: 168, ftp: 262 },
  { types: ["Run"], hr_zones: [128, 148, 162, 173, 190], lthr: 173, threshold_pace: 2.967 },
  { types: ["Swim"], threshold_pace: 0.8065 },
  { types: ["Yoga"], hr_zones: [100, 120, 130, 140, 150] } ] };
{ const p = projectAthlete(ATH);
  eq(p.sportCount, 3, "projectAthlete: bara kända grenar plockas — Yoga ignoreras");
  eq(p.athlete.sports.bike.zones.length, 5, "projectAthlete: cykelns zoner läses");
  eq(p.athlete.sports.run.lthr, 173, "projectAthlete: LTHR per gren läses");
  ok(projectAthlete({ sportSettings: [{ types: ["Run"], hr_zones: [1, 2, 3] }] }).athlete.sports.run.zones === null,
     "projectAthlete: orimliga pulsvärden förkastas hellre än renderas");
  ok(projectAthlete(null).error, "projectAthlete: tomt svar ger fel, aldrig påhittad profil");
  const b = benchmarksOf(p.athlete);
  eq(b.ftp, 262, "benchmarks: FTP ur cykelns sportSettings");
  eq(b.runLthr, 173, "benchmarks: löp-LTHR");
  eq(b.runThreshold, "5:37/km", "benchmarks: tröskeltempo avkodat ur m/s (v32:s verifierade kodning)");
  eq(b.css, "2:04/100 m", "benchmarks: CSS avkodat ur simmens threshold_pace");
  eq(benchmarksOf(null).ftp, null, "benchmarks: saknad profil ger null, aldrig gissning");
  eq(benchmarksOf({ sports: { run: {} } }).css, null, "benchmarks: saknat fält blir null — ingen falsk precision"); }

/* ---------- Fallback under parallellkörning (§5.5) ---------- */
{ const v32 = JSON.stringify({ data: { activities: [
    { id: 1, type: "Run", start_date_local: "2026-08-01T18:00:00", moving_time: 3000 }] } });
  const own = { ...emptyCache(), activities: [
    { id: 2, type: "Ride", start_date_local: "2026-08-02T18:00:00" },
    { id: 3, type: "Run", start_date_local: "2026-08-03T18:00:00" }],
    fetched: { activities: "2026-08-05", wellness: null, athlete: null } };
  const a = pickActivitySource(own, v32);
  eq(a.source, "next", "fallback: egen cache vinner alltid");
  eq(a.activities.length, 2, "fallback: v32 blandas ALDRIG in när egen finns (en sanning per fakta)");
  ok(a.why.includes("2026-08-05"), "fallback: källan redovisar hämtningstidpunkt");
  const b = pickActivitySource(emptyCache(), v32);
  eq(b.source, "v32", "fallback: tom egen cache ⇒ v32 läses read-only");
  eq(b.activities.length, 1, "fallback: v32:s aktiviteter kommer fram");
  ok(b.why.includes("Inställningar"), "fallback: v32-läget pekar på vägen till egen hämtning");
  const c = pickActivitySource(emptyCache(), null);
  eq(c.source, "none", "fallback: ingen källa alls redovisas som ingen källa");
  eq(c.activities.length, 0, "fallback: utan data blir listan tom, aldrig påhittad"); }

/* ---------- Full zonparitet (§5.4) ---------- */
{ const ath = projectAthlete(ATH).athlete;
  const acts5 = [{ id: 1, type: "Run", icu_hr_zone_times: [600, 900, 300, 120, 60] }];
  const good = zoneParityFull(ath, acts5);
  ok(good.ok && good.profile, "zonparitet: profil med 5 zoner och 5-vektorer = paritet");
  ok(good.why.includes("LTHR 173"), "zonparitet: LTHR redovisas granskningsbart i Inställningar");
  const ath7 = projectAthlete({ sportSettings: [
    { types: ["Run"], hr_zones: [120, 135, 148, 158, 168, 178, 190], lthr: 173 } ] }).athlete;
  const bad7 = zoneParityFull(ath7, acts5);
  ok(!bad7.ok && bad7.mismatches.some(m => m.includes("7 zoner")),
     "zonparitet: 7 zoner i profilen fångas — det dagens längdvakt missar");
  const noZones = projectAthlete({ sportSettings: [{ types: ["Ride"], ftp: 262 }] }).athlete;
  ok(!zoneParityFull(noZones, []).ok, "zonparitet: cykel utan pulszoner flaggas");
  /* Simundantaget (matchningsspec §7) — buggfixtur 2026-08-05: första versionen
     krävde pulszoner även för sim, vilket hade gett ett permanent falskt larm
     eftersom optisk handledspuls i vatten är ogiltig by design. */
  const swimOnly = projectAthlete({ sportSettings: [{ types: ["Swim"], threshold_pace: 0.8 }] }).athlete;
  ok(zoneParityFull(swimOnly, []).ok,
     "zonparitet: sim utan pulszoner är KORREKT läge, inte ett fel (simundantaget)");
  const swimActs = [{ id: 5, type: "Swim", icu_hr_zone_times: [100, 200, 50] }];
  ok(zoneParityFull(projectAthlete(ATH).athlete, swimActs).ok,
     "zonparitet: simaktiviteters zonvektor granskas aldrig — remsan renderas ändå inte");
  const rising = projectAthlete({ sportSettings: [
    { types: ["Run"], hr_zones: [150, 140, 160, 170, 180] } ] }).athlete;
  ok(zoneParityFull(rising, []).mismatches.some(m => m.includes("stiger inte")),
     "zonparitet: zongränser som inte stiger är ett fel, inte en kuriositet");
  const noProfile = zoneParityFull(null, acts5);
  eq(noProfile.profile, false, "zonparitet: utan profil faller vi tillbaka på längdvakten");
  ok(noProfile.why.includes("inte hämtad"), "zonparitet: avsaknaden av profil redovisas ärligt");

  /* swimHrValid (matchningsspec §3): undantaget är en INSTÄLLNING, inte en lag.
     Med simdugligt bröstband (HRM-Pro/Swim/Tri) slås det av och sim granskas
     som alla andra grenar. Spec-skuld inhägnad 2026-08-05. */
  ok(!zoneParityFull(swimOnly, [], { swimHrValid: true }).ok,
     "swimHrValid på: sim UTAN pulszoner blir nu ett riktigt paritetsfel");
  ok(zoneParityFull(swimOnly, [], { swimHrValid: true }).mismatches.some(m => m.includes("swim")),
     "swimHrValid på: felet namnger simmen");
  ok(!zoneParityFull(projectAthlete(ATH).athlete, swimActs, { swimHrValid: true }).ok,
     "swimHrValid på: 3-zonsvektorn på simpasset fångas mot profilens 5");
  eq(zoneParityFull(swimOnly, []).swimHrValid, false,
     "zonparitet redovisar vilket läge den granskade i");
  eq(zoneParityFull(swimOnly, [], { swimHrValid: true }).swimHrValid, true,
     "flaggan följer med i resultatet");
  ok(zoneParityFull(projectAthlete(ATH).athlete, []).why.includes("utan pulsremsa"),
     "zonparitet: undantagna grenar redovisas som undantagna, aldrig tyst utelämnade"); }

/* ---------- swimHrValid som profilinställning (D7) ---------- */
{ eq(DEFAULT_CFG.swimHrValid, false,
     "swimHrValid: default AV — optisk handledspuls är inte mätdata (ingen falsk precision)");
  ok(validateCfg({ ...DEFAULT_CFG, swimHrValid: true }).ok, "cfg: flaggan går att slå på");
  ok(!validateCfg({ ...DEFAULT_CFG, swimHrValid: "ja" }).ok, "cfg: flaggan måste vara boolesk");
  const st = makeStore(fakeStorage(1e6));
  ok(st.saveCfg({ ...DEFAULT_CFG, swimHrValid: true }).ok,
     "flaggan bor i profilen, inte i planen (D7)");
  const b = backupExport(emptyOverlay("p1"), "p1", "2026-08-05", { ...DEFAULT_CFG, swimHrValid: true });
  eq(b.cfg.swimHrValid, true,
     "flaggan följer med säkerhetskopian — den är en inställning, inte en hemlighet"); }

/* ---------- Återhämtning: dagssignal mot EGEN baslinje ---------- */
const wSeries = (n, fn) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 6, 1)); d.setUTCDate(d.getUTCDate() + i);
  return { id: d.toISOString().slice(0, 10), ...fn(i) };
});
{ /* 35 dagar normal vilopuls 48, sista morgonen 55 */
  const w = wSeries(35, i => ({ restingHR: i === 34 ? 55 : 48, sleepSecs: 6.5 * 3600 }));
  const r = recovery(w, "2026-08-04");
  ok(r.has, "recovery: data finns");
  eq(r.day.rhr, 55, "dagssignal: morgonens vilopuls läses");
  eq(r.day.rhrBase, 48, "dagssignal: baslinjen är DIN median, inte ett absolut tal");
  ok(r.day.flags.rhr, "dagssignal: +7 över egen normal fyrar");
  ok(r.day.why[0].includes("55") && r.day.why[0].includes("48"),
     "dagssignal: motiveringen visar både mätning och normal"); }

{ const w = wSeries(35, () => ({ restingHR: 48, sleepSecs: 6.5 * 3600 }));
  const r = recovery(w, "2026-08-04");
  ok(!r.day.flags.rhr, "dagssignal: normal morgon fyrar inte");
  ok(!r.day.flags.sleep, "dagssignal: normal natt fyrar inte"); }

{ /* SMÅBARNSFALLET: 5,5 h är hans normal — absolut 6,2 h-tröskel hade fyrat varje dag */
  const w = wSeries(35, () => ({ restingHR: 48, sleepSecs: 5.5 * 3600 }));
  const r = recovery(w, "2026-08-04");
  ok(!r.day.flags.sleep,
     "dagssignal: kort men NORMAL sömn fyrar aldrig — en regel man lär sig klicka bort är värdelös");
  eq(r.day.sleepBase, 5.5, "dagssignal: baslinjen är den han faktiskt har"); }

{ /* Samma man, en verkligt dålig natt: 3,5 h mot normalen 5,5 h */
  const w = wSeries(35, i => ({ restingHR: 48, sleepSecs: (i === 34 ? 3.5 : 5.5) * 3600 }));
  const r = recovery(w, "2026-08-04");
  ok(r.day.flags.sleep, "dagssignal: 2 h under EGEN normal fyrar");
  ok(r.day.why.some(s => s.includes("3.5")), "dagssignal: nattens faktiska timmar visas"); }

{ /* För tunt underlag ⇒ signalen tiger hellre än gissar */
  const w = wSeries(6, i => ({ restingHR: i === 5 ? 60 : 48 }));
  const r = recovery(w, "2026-07-06");
  ok(!r.day.flags.rhr, "dagssignal: under 14 baslinjedagar tiger signalen (ingen falsk precision)");
  eq(r.coverage.rhrDays, 6, "recovery: täckningen redovisas så bristen syns"); }

{ /* Gammal mätning är inte "i natt" */
  const w = wSeries(30, i => ({ restingHR: i === 29 ? 58 : 48 }));
  const r = recovery(w, "2026-08-10");
  ok(!r.day.flags.rhr, "dagssignal: mätning äldre än ett dygn räknas inte som i morse"); }

/* ---------- Återhämtning: trendsignal (v32:s modell, oförändrad) ---------- */
{ /* 29 dagar på 48, sista veckan på 55. Fönstret är inklusivt i båda ändar
     (v32:s form, oförändrad) — därför räknas 8 dagar, inte 7. */
  const w = wSeries(37, i => ({ restingHR: i >= 29 ? 55 : 48, hrv: 60 }));
  const r = recovery(w, "2026-08-06");
  ok(r.trend.flags.rhr, "trendsignal: 7-dagarssnittet över 30-dagarsbasen fyrar");
  eq(r.trend.rhr7, 55, "trendsignal: veckosnittet räknas");
  ok(r.trend.why[0].includes("normal"), "trendsignal: motiveringen namnger baslinjen"); }

{ const w = wSeries(37, i => ({ restingHR: 48, hrv: i === 36 ? 40 : 65 }));
  const r = recovery(w, "2026-08-06");
  ok(r.trend.flags.hrv, "trendsignal: HRV under 90 % av baslinjen fyrar");
  ok(!r.trend.flags.rhr, "trendsignal: stabil vilopuls fyrar inte samtidigt"); }

{ const w = wSeries(37, () => ({ restingHR: 48, hrv: 65 }));
  const r = recovery(w, "2026-08-06");
  ok(!r.trend.flags.rhr && !r.trend.flags.hrv, "trendsignal: stabil kropp ger tyst app"); }

eq(recovery([], "2026-08-05").has, false, "recovery: tom wellness ger inget påstående alls");
eq(recovery(null, "2026-08-05").day.flags.rhr, undefined, "recovery: null kraschar inte");

/* ---------- Alternativ C: två signaler, två roller ---------- */
{ const w = wSeries(35, i => ({ restingHR: i === 34 ? 56 : 48, sleepSecs: 6.5 * 3600 }));
  const f = wellnessFlags(w, "2026-08-04");
  const sg = f.find(x => x.id === "sleep-guard");
  ok(sg, "alt C: dagssignalen blir sleep-guard");
  eq(sg.source, "derived", "alt C: sleep-guard är DERIVED ⇒ motorn frågar, du svarar (D2)");
  eq(sg.date, "2026-08-04", "alt C: flaggan bär dagen den gäller");
  ok(sg.why.includes("56"), "alt C: frågan bär sin egen motivering"); }

{ const w = wSeries(37, i => ({ restingHR: i >= 30 ? 55 : 48 }));
  const f = wellnessFlags(w, "2026-08-06");
  ok(f.some(x => x.id === "recovery-watch"), "alt C: trendsignalen blir recovery-watch");
  eq(f.find(x => x.id === "recovery-watch").why.includes("slag över"), true,
     "alt C: trendvarningen förklarar sig"); }

eq(wellnessFlags([], "2026-08-05").length, 0, "alt C: utan data inga flaggor — appen hittar aldrig på");

/* ---------- Flaggorna genom motorn ---------- */
{ const r = applyRules(plan, {}, B, [{ id: "sleep-guard", source: "derived", date: "2026-10-15",
                                       why: "Vilopulsen i morse 56 mot din normal 48" }], NOW);
  const q = r.questions.find(x => x.rule === "sleep-guard");
  ok(q && q.ask.includes("56"), "motorn: sleep-guards fråga bär den härledda orsaken");
  ok(q.ask.includes("Sov du dåligt"), "motorn: frågan är fortfarande en fråga, inte ett påstående");
  ok(!r.actions.some(a => a.rule === "sleep-guard"), "motorn: derived dagssignal ändrar ingenting själv"); }

{ const r = applyRules(plan, {}, B, [{ id: "recovery-watch", source: "derived",
                                       why: "HRV 42 ms mot din baslinje 61 ms" }], NOW);
  const w = r.actions.filter(a => a.rule === "recovery-watch");
  eq(w.length, 1, "motorn: recovery-watch ger exakt en post");
  eq(w[0].level, 3, "motorn: recovery-watch är NIVÅ 3 — den varnar, den ändrar aldrig");
  eq(w[0].action, "warn", "motorn: åtgärden är warn (H1)");
  ok(w[0].why.includes("42 ms"), "motorn: varningen bär mätvärdena");
  ok(w[0].why.includes("Volym går bra"), "motorn: varningen säger vad man KAN göra, inte bara vad som är fel"); }

/* ---------- API-nyckeln lämnar aldrig backupen ---------- */
{ const cfg = { ...DEFAULT_CFG, conn: { apiKey: "hemlignyckel1234", athleteId: "i123456", historyDays: 370 } };
  const b = backupExport(emptyOverlay("p1"), "p1", "2026-08-05T10:00:00Z", cfg);
  eq(b.cfg.conn.apiKey, "", "SÄKERHET: API-nyckeln följer ALDRIG med säkerhetskopian");
  eq(b.cfg.conn.athleteId, "i123456", "backup: athlete-ID är inte hemligt och följer med");
  eq(b.cfg.conn.historyDays, 370, "backup: historikfönstret följer med");
  ok(!JSON.stringify(b).includes("hemlignyckel"), "SÄKERHET: nyckeln finns inte någonstans i kopian");
  eq(cfg.conn.apiKey, "hemlignyckel1234", "backup: exporten muterar inte den levande konfigurationen"); }

/* ---------- cfg bär anslutningen (D7: bindningar i profilen) ---------- */
{ ok(validateCfg({ ...DEFAULT_CFG, conn: { apiKey: "abcdefghijkl", athleteId: "i123456" } }).ok,
     "cfg: giltig anslutning passerar");
  eq(validateCfg({ ...DEFAULT_CFG, conn: { apiKey: "abcdefghijkl", athleteId: "gurka" } }).ok, false,
     "cfg: ogiltig anslutning gör hela cfg ogiltig — halvsparad anslutning finns inte");
  eq(DEFAULT_CFG.conn.historyDays, ICU.defHistory, "cfg: standardhistoriken är ett år");
  const st = makeStore(fakeStorage(1e6));
  ok(st.saveCfg({ ...DEFAULT_CFG, conn: { apiKey: "abcdefghijkl", athleteId: "i123456", historyDays: 370 } }).ok,
     "cfg: anslutningen sparas via samma kvotvaktade väg som allt annat");
  ok(!st.saveCfg({ ...DEFAULT_CFG, conn: { apiKey: "kort", athleteId: "i123456" } }).ok,
     "cfg: trasig anslutning skrivs aldrig"); }

/* ================================================================
   STATUSGRID (0.11.0) — Analys-vyns dimensioner
   ================================================================ */
import { statusGrid, loadStatus, intensityStatus, formStatus, injuryStatus,
         weeklyLoad } from "./core.js";

const ACT = (id, type, date, min, zt) => ({ id, type, name: "x",
  start_date_local: `${date}T18:00:00`, moving_time: min * 60,
  ...(zt ? { icu_hr_zone_times: zt } : {}) });

/* ---------- weeklyLoad: veckor, inte glidande fönster ---------- */
{ const acts = [ACT(1, "Run", "2026-10-15", 50), ACT(2, "Run", "2026-10-13", 40),
                ACT(3, "Ride", "2026-10-08", 90), ACT(4, "Run", "2025-01-01", 60)];
  const w = weeklyLoad(acts, "2026-10-15", 8);
  eq(w.length, 8, "weeklyLoad: åtta veckor tillbaka");
  eq(w[7].minutes, 90, "weeklyLoad: innevarande vecka summerar mån–sön");
  eq(w[6].minutes, 90, "weeklyLoad: föregående vecka räknas för sig");
  eq(w[7].hours, 1.5, "weeklyLoad: timmar avrundas till en decimal");
  eq(weeklyLoad(acts, "2026-10-15", 8, "run")[7].minutes, 90,
     "weeklyLoad: grenfilter räknar bara den grenen");
  eq(weeklyLoad(acts, "2026-10-15", 8, "bike")[6].minutes, 90, "weeklyLoad: cykel för sig");
  eq(weeklyLoad([], "2026-10-15").length, 8, "weeklyLoad: tom lista ger ändå veckoraster");
  eq(weeklyLoad(acts, "trasigt").length, 0, "weeklyLoad: ogiltigt datum ger inget påstående"); }

/* ---------- Belastning mot volymtaket ---------- */
{ const steady = [ACT(1, "Run", "2026-09-24", 60), ACT(2, "Run", "2026-10-01", 60),
                  ACT(3, "Run", "2026-10-08", 60), ACT(4, "Run", "2026-10-15", 60)];
  const r = loadStatus(steady, "2026-10-15", {});
  eq(r.state, "ok", "belastning: jämn volym är i nivå");
  eq(r.pct, 100, "belastning: 100 % av 3-veckorssnittet");
  ok(r.why.includes("Under volymtaket"), "belastning: motiveringen namnger taket");
  ok(r.why.includes("1:00 h"), "belastning: timmarna redovisas, inte bara procenten"); }

{ const spike = [ACT(1, "Run", "2026-09-24", 60), ACT(2, "Run", "2026-10-01", 60),
                 ACT(3, "Run", "2026-10-08", 60), ACT(4, "Run", "2026-10-15", 120)];
  const r = loadStatus(spike, "2026-10-15", {});
  eq(r.state, "warn", "belastning: dubbel volym passerar taket");
  eq(r.pct, 200, "belastning: procenten är exakt, inte ungefärlig");
  ok(r.why.includes("ÖVER volymtaket"), "belastning: överskridandet sägs rakt ut");
  eq(loadStatus(spike, "2026-10-15", { volumeCapPct: 250 }).state, "ok",
     "belastning: taket är profildata — höjt tak flyttar gränsen (P2)"); }

{ const r = loadStatus([], "2026-10-15", {});
  eq(r.state, "idle", "belastning: utan data görs ingen bedömning");
  eq(r.has, false, "belastning: tomt läge markeras som utan innehåll"); }

/* ---------- Intensitet ur utfall (M-U: verkligheten räknas) ---------- */
{ const acts = [ACT(1, "Run", "2026-10-14", 60, [1800, 1200, 300, 300, 0]),
                ACT(2, "Ride", "2026-10-12", 60, [2400, 1200, 0, 0, 0])];
  const r = intensityStatus(acts, "2026-10-15", {});
  eq(r.window, 28, "intensitet: fönstret är 28 dagar");
  ok(r.why.includes("28 dagar"), "V28-REGELN: ingen procentsiffra utan sitt tidsfönster");
  eq(r.value, "92 % lågintensivt", "intensitet: Z1+Z2 mot totalen");
  eq(r.state, "ok", "intensitet: över målet är ok");
  eq(intensityStatus(acts, "2026-10-15", { lowShareTarget: 0.95 }).state, "warn",
     "intensitet: målet är profildata");

  /* blocks[].lowShare i Analys (beslut A): fasens mål visas med sin källa */
  const phPlan = { blocks: [{ id: "bas", label: "Bas", start: "2026-10-12", weeks: 3, lowShare: 0.95 }],
                   weeks: [{ week: 42, block: "bas", type: "normal" }], sessions: [] };
  const ph = intensityStatus(acts, "2026-10-15", { lowShareTarget: 0.78 }, 28, phPlan);
  eq(ph.state, "warn", "fasmål 95 %: blocket vinner över profilens 78 % även i Analys");
  ok(ph.why.includes("Fasens mål 95 %") && ph.why.includes("Bas"),
     "Analys: 'Fasens mål: X % (fas)' — målet bär sin källa");
  const noPh = intensityStatus(acts, "2026-10-15", { lowShareTarget: 0.78 }, 28,
    { blocks: [{ id: "bas", start: "2026-10-12", weeks: 3 }], weeks: [], sessions: [] });
  ok(noPh.why.includes("Mål 78 % (profil)"), "utan blockvärde: målet märks som profilens");
  eq(intensityStatus(acts, "2026-10-15", { lowShareTarget: 0.78 }, 28, null).why.includes("(profil)"), true,
     "utan plan alls: samma ärliga märkning, ingen krasch"); }

{ /* Simmens ogiltiga puls får aldrig blandas in i en mätt siffra */
  const acts = [ACT(1, "Run", "2026-10-14", 60, [1800, 1200, 300, 300, 0]),
                ACT(2, "Swim", "2026-10-13", 45, [0, 0, 2700, 0, 0])];
  const off = intensityStatus(acts, "2026-10-15", {});
  ok(off.why.includes("1 simpass utanför"), "intensitet: uteslutet simpass REDOVISAS, aldrig tyst");
  ok(off.why.includes("inte mätdata"), "intensitet: skälet till uteslutningen förklaras");
  const on = intensityStatus(acts, "2026-10-15", { swimHrValid: true });
  ok(!on.why.includes("simpass utanför"), "intensitet: med giltigt simband räknas simmen");
  ok(on.share < off.share, "intensitet: simmens Z3 sänker lågandelen när den räknas");
  eq(intensityStatus([], "2026-10-15", {}).state, "idle",
     "intensitet: utan zondata görs ingen bedömning"); }

{ const old = [ACT(1, "Run", "2026-08-01", 60, [3600, 0, 0, 0, 0])];
  eq(intensityStatus(old, "2026-10-15", {}).has, false,
     "intensitet: aktiviteter utanför fönstret räknas inte"); }

/* ---------- Dagsform ur recovery() ---------- */
{ const calm = { has: true, day: { rhr: 53, rhrBase: 52.5, sleepH: 8, sleepBase: 7.4, flags: {} },
                 trend: { hrv: 45, hrvBase: 48, flags: {} } };
  const r = formStatus(calm);
  eq(r.value, "Normal", "dagsform: allt inom baslinjen är normalt");
  eq(r.state, "ok", "dagsform: normal ger ok");
  ok(r.why.includes("53") && r.why.includes("52.5"), "dagsform: mätvärde OCH baslinje visas");
  ok(r.why.includes("din egen baslinje") || r.why.includes("Allt inom"),
     "dagsform: det sägs att måttet är relativt"); }

{ const off = { has: true, day: { rhr: 60, rhrBase: 52, sleepH: 5, sleepBase: 7.4,
                                  flags: { rhr: true } }, trend: { flags: {} } };
  const r = formStatus(off);
  eq(r.value, "Avvikande", "dagsform: dagssignal ger avvikande");
  eq(r.state, "warn", "dagsform: avvikelse varnar");
  ok(r.why.includes("du bestämmer"), "dagsform: förslag, aldrig beslut (D2)"); }

{ const tr = { has: true, day: { rhr: 53, rhrBase: 52, flags: {} },
               trend: { hrv: 40, hrvBase: 50, flags: { hrv: true } } };
  const r = formStatus(tr);
  eq(r.value, "Trend att bevaka", "dagsform: trendsignal skiljs från dagssignal");
  ok(r.why.includes("volym går bra"), "dagsform: trenden säger vad man KAN göra"); }

eq(formStatus(null).state, "idle", "dagsform: utan wellness görs ingen bedömning");
eq(formStatus({ has: false }).has, false, "dagsform: tomt läge markeras");

/* ---------- Skaderisk: platshållare UTAN påstående ---------- */
{ const r = injuryStatus();
  eq(r.state, "idle", "skaderisk: platshållaren bär INGEN statusfärg");
  eq(r.has, false, "skaderisk: kortet markeras som utan bedömning");
  ok(!/ingen aktiv flagga/i.test(r.value + r.why),
     "skaderisk: appen påstår ALDRIG att risken är låg när den inte mätt något");
  ok(r.why.includes("ingen bedömning"), "skaderisk: frånvaron av bedömning sägs rakt ut"); }

/* ---------- Griden som helhet ---------- */
{ const g = statusGrid([ACT(1, "Run", "2026-10-14", 60, [1800, 1200, 300, 300, 0])],
                       { has: true, day: { rhr: 53, rhrBase: 52.5, flags: {} }, trend: { flags: {} } },
                       "2026-10-15", {});
  eq(g.length, 4, "statusgrid: fyra dimensioner");
  eq(g.map(d => d.key), ["load", "intensity", "form", "injury"],
     "statusgrid: ordningen är fast — belastning, intensitet, dagsform, skaderisk");
  eq(g.filter(d => d.has).length, 3, "statusgrid: tre av fyra bär bedömning i 0.11.0");
  ok(g.every(d => d.label && d.value && d.why),
     "statusgrid: varje kort har etikett, värde OCH varför — aldrig en siffra utan förklaring");
  const gp = statusGrid([ACT(1, "Run", "2026-10-14", 60, [1800, 1200, 300, 300, 0])],
                        { has: false }, "2026-10-15", {},
                        { blocks: [{ id: "bas", label: "Bas", start: "2026-10-12", weeks: 3, lowShare: 0.95 }],
                          weeks: [], sessions: [] });
  ok(gp.find(d => d.key === "intensity").why.includes("Fasens mål 95 %"),
     "statusgrid: planen når intensitetsdimensionen — fasmålet syns i griden"); }

/* ================================================================
   PMC + EFFEKTIVITET (0.12.0)
   ================================================================ */
import { pmcSeries, pmcStatus, zoneBand, effTrend, EFF, TSB_BANDS } from "./core.js";

const ATH2 = projectAthlete({ sportSettings: [
  { types: ["Run"], hr_zones: [128, 148, 162, 173, 190], lthr: 173 },
  { types: ["Ride"], hr_zones: [110, 130, 145, 158, 175], lthr: 166 } ] }).athlete;

/* ---------- PMC: CTL/ATL kommer färdiga, TSB är enda härledningen ---------- */
{ const w = [{ id: "2026-10-01", ctl: 60, atl: 55 }, { id: "2026-10-08", ctl: 62, atl: 70 },
             { id: "2026-10-15", ctl: 64, atl: 72 }, { id: "2026-10-16", ctl: 64 },
             { id: "2026-06-01", ctl: 40, atl: 40 }];
  const s = pmcSeries(w, "2026-10-15", 84);
  eq(s.length, 3, "pmc: rader utan både ctl och atl faller bort, gamla utanför fönstret också");
  eq(s[2].tsb, -8, "pmc: TSB = CTL − ATL, enda härledningen");
  eq(s[0].date, "2026-10-01", "pmc: sorterad i datumordning");
  const p = pmcStatus(w, "2026-10-15", 84);
  eq(p.tsb, -8, "pmc: senaste dagens form");
  eq(p.label, "I bygge", "pmc: TSB −8 tolkas som bygge");
  ok(p.why.includes("räknar dem aldrig om"),
     "pmc: det sägs uttryckligen att appen inte räknar om intervals.icu:s siffror (M2)");
  eq(pmcStatus([], "2026-10-15").has, false, "pmc: utan data görs inget påstående");
  ok(pmcStatus([], "2026-10-15").why.includes("intervals.icu"), "pmc: tomt läge pekar på källan"); }

{ const band = t => TSB_BANDS.find(b => t <= b.max).key;
  eq(band(-35), "deep", "TSB −35 = djup belastning");
  eq(band(-15), "build", "TSB −15 = i bygge");
  eq(band(0), "neutral", "TSB 0 = neutral");
  eq(band(15), "fresh", "TSB +15 = frisk");
  eq(band(40), "detrain", "TSB +40 = otränad risk"); }

/* ---------- Pulsfönster HÄRLEDS ur profilen (produktägarbeslut) ---------- */
{ eq(zoneBand(ATH2, "run", 2), { lo: 129, hi: 148, zone: 2 },
     "zonfönster: Z2 löp härleds ur intervals.icu, inte ur en tumregel");
  eq(zoneBand(ATH2, "run", 3), { lo: 149, hi: 162, zone: 3 },
     "zonfönster: Z3 löp — racepace-jämförelsen");
  eq(zoneBand(ATH2, "bike", 2), { lo: 111, hi: 130, zone: 2 },
     "zonfönster: cykeln har egna gränser, aldrig löpningens");
  eq(zoneBand(ATH2, "run", 1).lo, 0, "zonfönster: Z1 börjar på noll");
  eq(zoneBand(ATH2, "swim", 2), null, "zonfönster: gren utan zoner ger null, aldrig en gissning");
  eq(zoneBand(null, "run", 2), null, "zonfönster: utan profil inget fönster");
  eq(zoneBand(ATH2, "run", 9), null, "zonfönster: zon utanför profilen avvisas"); }

/* ---------- Effektivitet: löpning ---------- */
const runSet = (n, paceStart, paceStep, hr = 140) => Array.from({ length: n }, (_, i) => ({
  id: 100 + i, type: "Run", start_date_local: `2026-0${i < 5 ? 6 : 7}-${String((i % 5) * 5 + 1).padStart(2, "0")}T18:00:00`,
  moving_time: Math.round((paceStart + i * paceStep) * 7), distance: 7000, average_heartrate: hr }));

{ const t = effTrend(runSet(10, 350, -4), ATH2, "run", 2);
  ok(t.has, "effektivitet: tio pass räcker för en trend");
  eq(t.n, 10, "effektivitet: alla pass i fönstret räknas");
  ok(t.better, "effektivitet: sjunkande tempo vid samma puls = progression");
  ok(t.lowerBetter, "effektivitet: för tempo är lägre bättre");
  ok(t.why.includes("129–148"), "effektivitet: fönstret redovisas i klartext");
  ok(t.why.includes("Z2 ur intervals.icu"), "effektivitet: fönstrets ursprung namnges");
  ok(t.why.includes("/km"), "effektivitet: tempo visas som tempo, inte som sekunder"); }

{ /* Puls utanför fönstret ⇒ passet hör inte hemma i jämförelsen */
  const t = effTrend(runSet(10, 350, -4, 170), ATH2, "run", 2);
  eq(t.has, false, "effektivitet: pass utanför pulsfönstret utesluts");
  eq(t.skipped.band, 10, "effektivitet: uteslutningen räknas");
  ok(effTrend(runSet(10, 350, -4, 155), ATH2, "run", 3).has,
     "effektivitet: samma pass hamnar i Z3-fönstret när man växlar zon"); }

{ /* Löpband blandas ALDRIG med utomhus (matchning §3) */
  const acts = runSet(10, 350, -4).map((a, i) => i < 5 ? { ...a, trainer: true } : a);
  const t = effTrend(acts, ATH2, "run", 2);
  eq(t.skipped.trainer, 5, "effektivitet: löpbandspass utesluts");
  ok(t.why.includes("estimatdistans blandas aldrig med GPS"),
     "effektivitet: skälet till uteslutningen förklaras, aldrig tyst"); }

{ const short = runSet(10, 350, -4).map(a => ({ ...a, moving_time: 600, distance: 1500 }));
  eq(effTrend(short, ATH2, "run", 2).has, false, "effektivitet: pass under 30 min räknas inte"); }

/* ---------- Effektivitet: cykel — watt utan mätare är aldrig mätdata ---------- */
const bikeSet = (n, w0, step, dev) => Array.from({ length: n }, (_, i) => ({
  id: 200 + i, type: "Ride", start_date_local: `2026-07-${String(i + 1).padStart(2, "0")}T18:00:00`,
  moving_time: 3600, distance: 30000, average_heartrate: 125,
  average_watts: w0 + i * step, has_device_watts: dev }));

{ const t = effTrend(bikeSet(8, 170, 3, true), ATH2, "bike", 2);
  ok(t.has, "effektivitet: cykel med wattmätare ger trend");
  ok(!t.lowerBetter, "effektivitet: för watt är HÖGRE bättre");
  ok(t.better, "effektivitet: stigande watt vid samma puls = progression");
  ok(t.why.includes("W"), "effektivitet: watt visas som watt"); }

{ const t = effTrend(bikeSet(8, 170, 3, false), ATH2, "bike", 2);
  eq(t.has, false, "effektivitet: utan wattmätare finns ingen cykeltrend");
  eq(t.skipped.est, 8, "effektivitet: estimatpassen räknas som uteslutna");
  ok(t.why.includes("estimat är inte mätvärden"),
     "ÄRVD REGEL: Stravas estimerade watt presenteras ALDRIG som mätvärde"); }

{ const mixed = [...bikeSet(6, 170, 3, true), ...bikeSet(6, 250, 3, false).map(a => ({ ...a, id: a.id + 50 }))];
  const t = effTrend(mixed, ATH2, "bike", 2);
  eq(t.n, 6, "effektivitet: bara mätarpassen kommer in i kurvan");
  eq(t.skipped.est, 6, "effektivitet: estimatpassen redovisas som bortvalda"); }

/* ---------- Effektivitet: sim väljs på distans, aldrig på puls ---------- */
const swimSet = (n, secStart, step, meters = 1500) => Array.from({ length: n }, (_, i) => ({
  id: 300 + i, type: "Swim", start_date_local: `2026-07-${String(i + 1).padStart(2, "0")}T07:00:00`,
  moving_time: secStart + i * step, distance: meters }));

{ const t = effTrend(swimSet(8, 2400, -20), ATH2, "swim", 2);
  ok(t.has, "effektivitet: sim ger trend trots att profilen saknar simzoner");
  eq(t.band, null, "effektivitet: simmen har INGET pulsfönster — urvalet är distansbaserat");
  ok(t.why.includes("600 m"), "effektivitet: simmens urvalskriterium redovisas");
  ok(t.why.includes("/100 m"), "effektivitet: simtempo visas per 100 m");
  ok(t.better, "effektivitet: sjunkande simtempo = progression");
  eq(effTrend(swimSet(8, 2400, -20, 300), ATH2, "swim", 2).has, false,
     "effektivitet: korta simpass under 600 m räknas inte"); }

/* ---------- Tomma och trasiga lägen ---------- */
{ eq(effTrend([], ATH2, "run", 2).has, false, "effektivitet: utan pass ingen trend");
  ok(effTrend([], ATH2, "run", 2).why.includes("minst"), "effektivitet: minimikravet sägs ut");
  const noAth = effTrend(runSet(10, 350, -4), null, "run", 2);
  eq(noAth.has, false, "effektivitet: utan atletprofil kan fönstret inte härledas");
  ok(noAth.why.includes("intervals.icu"), "effektivitet: användaren får veta var fönstret ska sättas");
  eq(effTrend(runSet(3, 350, -4), ATH2, "run", 2).has, false,
     `effektivitet: färre än ${EFF.minPoints} pass ger ingen trendlinje (ingen falsk precision)`); }

/* ================================================================
   0.13.0 — wattfältbuggen, tidsfönster, sömn 3 nätter, dagliga laster
   ================================================================ */
import { dailyLoads, dayShift } from "./core.js";

/* ---------- REGRESSION (fältverifierad 2026-08-05): device_watts ---------- */
{ /* 34 spinningpass försvann: API:et skriver device_watts, koden läste bara
     specens begreppsnamn has_device_watts. Fixturen låser båda vägarna. */
  const dw = Array.from({ length: 8 }, (_, i) => ({
    id: 400 + i, type: "Ride", start_date_local: `2026-07-${String(i + 1).padStart(2, "0")}T18:00:00`,
    moving_time: 3600, distance: 30000, average_heartrate: 125,
    average_watts: 170 + i * 3, device_watts: true }));
  const t = effTrend(dw, ATH2, "bike", 2);
  ok(t.has, "REGRESSION device_watts: API:ets faktiska fältnamn accepteras");
  eq(t.skipped.est, 0, "REGRESSION device_watts: inget mätarpass utesluts längre");
  ok(t.better, "REGRESSION device_watts: trenden räknas på riktiga watt");
  const none = dw.map(a => { const { device_watts, ...rest } = a; return rest; });
  eq(effTrend(none, ATH2, "bike", 2).skipped.est, 8,
     "device_watts: utan någon av flaggorna utesluts passet fortsatt — estimat är inte mätvärden"); }

/* ---------- effTrend: tidsfönster ---------- */
{ const t = effTrend(runSet(10, 350, -4), ATH2, "run", 2, { from: "2026-07-01" });
  ok(t.has && t.n === 5, "tidsfönster: bara pass efter from-datumet räknas");
  eq(t.skipped.window, 5, "tidsfönster: bortfiltrerade pass redovisas");
  eq(effTrend(runSet(10, 350, -4), ATH2, "run", 2, { from: "2026-08-01" }).has, false,
     "tidsfönster: för smalt fönster ger ingen trend, aldrig en gissning"); }

/* ---------- Sömn 3 nätter (v32:s inforuta) ---------- */
{ const w = wSeries(35, i => ({ restingHR: 48, sleepSecs: (i >= 32 ? [6, 7, 8][i - 32] : 7) * 3600 }));
  const r = recovery(w, "2026-08-04");
  eq(r.day.sleep3, 7, "sömn 3 nätter: medel av de tre senaste nätterna");
  eq(recovery(wSeries(35, () => ({ restingHR: 48 })), "2026-08-04").day.sleep3, undefined,
     "sömn 3 nätter: utan sömndata inget påhittat värde"); }

/* ---------- dailyLoads ---------- */
{ const acts = [
    { id: 1, type: "Run",  start_date_local: "2026-10-14T18:00:00", moving_time: 3000, icu_training_load: 55 },
    { id: 2, type: "Swim", start_date_local: "2026-10-14T06:30:00", moving_time: 1800, icu_training_load: 25 },
    { id: 3, type: "Ride", start_date_local: "2026-10-12T18:00:00", moving_time: 3600, icu_training_load: 60 },
    { id: 4, type: "Run",  start_date_local: "2026-01-01T18:00:00", moving_time: 3000, icu_training_load: 99 }];
  const L = dailyLoads(acts, "2026-10-15", 7);
  eq(L.length, 8, "dailyLoads: en rad per dag i fönstret, inklusive tomma");
  const d14 = L.find(l => l.date === "2026-10-14");
  eq([d14.run, d14.swim, d14.total], [55, 25, 80], "dailyLoads: två pass samma dag summeras per gren");
  eq(L.find(l => l.date === "2026-10-13").total, 0, "dailyLoads: vilodag är noll, inte hål");
  ok(!L.some(l => l.total === 99), "dailyLoads: pass utanför fönstret räknas aldrig");
  eq(dailyLoads(acts, "trasigt", 7).length, 0, "dailyLoads: ogiltigt datum ger inget påstående");
  eq(dayShift("2026-10-15", -7), "2026-10-08", "dayShift: exporterad och korrekt"); }

/* ================================================================
   0.17.0 — trimPlan-regression · fasbriefing (B1) · beställningsexport (B6)
   ================================================================ */
import { orderExport } from "./core.js";

/* ---------- REGRESSION 2026-08-10: trimPlan strök blocks[].lowShare ----------
   plan.json är network-first; offline laddas den trimmade projektionen ur
   trizone.plan.v1 — och fasmålet från beslut A försvann tyst ur den. Polarization
   föll tillbaka på profilvärdet utan spår. Vitlistan måste bära beslut A:s data,
   liksom fasbriefingen (B1) som annars hade mött samma öde. */
{ const src = structuredClone(plan);
  src.blocks[0].text = { brief: "Fasens uppgift i fem meningar.", hemligt: "läcker ej" };
  src.blocks[0].skrap = "bort";
  const t = trimPlan(src);
  eq(t.blocks[0].lowShare, 0.75, "REGRESSION 0.17.0: trimPlan behåller blocks[].lowShare");
  eq(t.blocks[0].text, { brief: "Fasens uppgift i fem meningar." },
     "trimPlan: fasbriefingen överlever trimning, okända textfält gör det inte");
  ok(t.blocks[0].skrap === undefined, "trimPlan: okända blockfält trimmas fortfarande");
  const bare = structuredClone(plan);
  delete bare.blocks[0].lowShare;
  delete bare.blocks[0].text;
  const tb = trimPlan(bare);
  ok(tb.blocks[0].lowShare === undefined, "trimPlan: frånvarande lowShare hittas inte på");
  ok(tb.blocks[0].text === undefined, "trimPlan: block utan text får inget tomt text-objekt"); }

/* ---------- Fasbriefing: validering (B1/B3 — typ och rimlig längd) ---------- */
{ const mk = (text) => ({ formatVersion: 1, planVersion: "2026-08-10.1",
    blocks: [{ id: "b", label: "B", start: "2026-09-07", weeks: 2,
               ...(text !== undefined ? { text } : {}) }],
    weeks: [{ week: 37, iso: "2026-W37", block: "b", type: "normal" }],
    sessions: [{ id: "bw1-run-e", week: 37, sport: "run", prio: "B", title: "Lugn löpning",
                 durationMin: 40, profile: [[1, 40]] }] });
  ok(validatePlan(mk(undefined)).ok, "fasbriefing: block utan text är giltigt");
  ok(validatePlan(mk({ brief: "Fasens uppgift." })).ok, "fasbriefing: giltig brief passerar");
  ok(validatePlan(mk({})).ok, "fasbriefing: text utan brief är giltigt");
  ok(!validatePlan(mk("hej")).ok, "fasbriefing: text som sträng avvisas — objekt väntat");
  ok(!validatePlan(mk({ brief: 7 })).ok, "fasbriefing: brief som tal avvisas");
  ok(!validatePlan(mk({ brief: "   " })).ok, "fasbriefing: tom brief avvisas");
  ok(!validatePlan(mk({ brief: "x".repeat(1201) })).ok, "fasbriefing: över 1200 tecken avvisas");
  ok(validatePlan(mk({ brief: "x".repeat(1200) })).ok, "fasbriefing: exakt 1200 tecken är taket");
  const e = validatePlan(mk({ brief: "x".repeat(1201) })).errors[0];
  ok(/1201/.test(e.msg) && /1200/.test(e.msg), "fasbriefing: felet pekar på längden och taket (rotorsak)"); }

/* ---------- B6: beställningsexport — reason läcker ALDRIG ----------
   Vitlista, inte svartlista: endast rule/sport/substitute.{quality,easy}
   passerar. Okända fält kan bära hälsodata och släpps aldrig igenom.
   Komponeras på begäran, lagras aldrig (verifieras i UI-röken). */
{ const cfg = { athlete: "niklas",
    engine: { lowShareTarget: 0.80, volumeCapPct: 120 },
    rules: [
      { rule: "tissue-freeze", sport: ["run"],
        substitute: { quality: "bike", easy: "swim", reason: "nästlad läcka" },
        reason: "stressfrakturhistorik vänster fot",
        anteckning: "okänt fält med hälsodata" },
      { rule: "sleep-guard" },
      { sport: ["swim"], reason: "utan rule — exporteras inte alls" } ] };
  const athlete = { sports: { bike: { ftp: 262, lthr: 166 },
                              run:  { lthr: 173, thresholdPace: 2.965 } } };
  const o = orderExport({ cfg, plan, athlete, now: "2026-08-10T12:00:00" });
  eq(o.kind, "trizone-next-bestallning", "B6: eget kind-fält skiljer den från backupen");
  eq(o.exported, "2026-08-10T12:00:00", "B6: deterministisk — tiden kommer utifrån");
  const json = JSON.stringify(o);
  ok(!json.includes("stressfraktur") && !json.includes("nästlad") && !json.includes("hälsodata")
     && !json.includes("reason"),
     "B6-FIXTUR: reason läcker aldrig — varken på rotnivå, nästlat eller i okända fält");
  eq(o.bindings, [{ rule: "tissue-freeze", sport: ["run"],
                    substitute: { quality: "bike", easy: "swim" } },
                  { rule: "sleep-guard" }],
     "B6: rule/sport/substitute passerar; bindning utan rule utgår");
  eq(o.protected, [{ id: "sk-w42-str-core", title: "Styrka: höft och bål",
                     sport: "strength", prio: "B" }],
     "B6: protected-listan hämtas ur planen (hälsoneutrala titlar, F2)");
  eq(o.engine.lowShareTarget, 0.80, "B6 motorvärden: cfg-överstyrning vinner");
  eq(o.engine.volumeCapPct, 120, "B6 motorvärden: andra överstyrningen också");
  eq(o.engine.comebackCount, 2, "B6 motorvärden: ENGINE-default fyller resten");
  ok(!("driftPct" in o.engine) && !("slotHour" in o.engine),
     "B6: endast redigerbara motorvärden (ENGINE_FIELDS) — kodkonstanter är kod, inte profil");
  eq(o.benchmarks, { ftp: 262, bikeLthr: 166, runLthr: 173, runThreshold: "5:37/km" },
     "B6 benchmarks: null-fält utelämnas (ingen CSS satt här)");
  const tomt = orderExport({ now: "t" });
  eq([tomt.bindings, tomt.protected, tomt.benchmarks], [[], [], {}],
     "B6: tom indata ger välformad tom export, kraschar aldrig");
  eq(tomt.engine.lowShareTarget, 0.78, "B6: tom cfg ger ENGINE-defaults");
  ok(o.athlete === "niklas", "B6: atletreferens följer med (inga persondata)"); }

/* ================================================================
   0.17.1 — Planposition (U5): passerade veckor hopfällda
   ================================================================ */
import { pastSummary } from "./core.js";

/* En vecka är passerad först när dess sista dag ligger BAKOM idag —
   söndagen hör fortfarande till innevarande vecka. Compliance räknas
   som i veckohuvudet: struket utanför båda, C utanför nämnaren OCH
   täljaren (ett utfört C-pass förskönar aldrig kvoten). Läser källa +
   överlagring (F1): pass flyttade in i en passerad vecka räknas där. */
{ ok(pastSummary(plan, {}, "2026-10-15") === null, "U5: mitt i första veckan — inget är passerat");
  ok(pastSummary(plan, {}, "2026-10-18") === null, "U5: söndag är veckans sista dag, inte första passerade");
  eq(pastSummary(plan, {}, "2026-10-19"), { weeks: [42], done: 0, total: 4 },
     "U5: måndag efter v.42 — en passerad vecka, 4 i nämnaren (2×C räknas inte)");
  const ov = { sessions: {
    "sk-w42-swim-css": { match: { activityId: 905 } },       /* härledd utförd */
    "sk-w42-str-core": { status: "struck" },                  /* struken: utanför båda */
    "sk-w42-run-easy": { status: "done" } } };                /* C utförd: ändrar inget */
  eq(pastSummary(plan, ov, "2026-10-19"), { weeks: [42], done: 1, total: 3 },
     "U5: struket krymper nämnaren, utfört C förskönar aldrig kvoten");
  eq(pastSummary(plan, ov, "2026-10-26"), { weeks: [42, 43], done: 1, total: 4 },
     "U5: två passerade veckor aggregeras");
  const mv = { sessions: { "sk-w43-run-thr": { moved: { week: 42, day: 4 } } } };
  eq(pastSummary(plan, mv, "2026-10-19"), { weeks: [42], done: 0, total: 5 },
     "U5: pass flyttat IN i passerad vecka räknas där (F1 — källa + överlagring)");
  ok(pastSummary(null, {}, "2026-10-19") === null, "U5: utan plan inget påstående, ingen krasch");
  ok(pastSummary({ weeks: [], sessions: [] }, {}, "2026-10-19") === null,
     "U5: tom plan ger null, inte en tom sammanfattning"); }

/* ---------- buildPosition (0.18, planhero) ----------
   "% av bygget" och "vecka X av Y" är aritmetik på block.start + weeks —
   aldrig gissning, aldrig krasch. Referensblocket: start 2026-10-12, 3 veckor. */
import { buildPosition } from "./core.js";
{ ok(buildPosition(plan, "2026-10-12")?.state === "in", "bp: blockets första dag är inne");
  eq(buildPosition(plan, "2026-10-12").pct, 0, "bp: dag 1 = 0 % — inget avklarat före idag");
  eq([buildPosition(plan, "2026-10-12").weekInBlock, buildPosition(plan, "2026-10-12").buildWeek],
     [1, 1], "bp: dag 1 ⇒ vecka 1 av blocket och av bygget");
  const mid = buildPosition(plan, "2026-10-26");             /* mån vecka 3 */
  eq([mid.weekInBlock, mid.pct], [3, Math.round(14/21*100)], "bp: v3 dag 1 ⇒ 14 av 21 dagar avklarade");
  const sun = buildPosition(plan, "2026-11-01");             /* sista söndagen */
  eq([sun.state, sun.pct], ["in", Math.round(20/21*100)], "bp: sista dagen är fortfarande inne, inte klar");
  eq(buildPosition(plan, "2026-11-02").state, "after", "bp: dagen efter blockslut ⇒ after");
  eq(buildPosition(plan, "2026-11-02").pct, 100, "bp: efter slutet är bygget 100 %");
  eq(buildPosition(plan, "2026-10-11").state, "before", "bp: dagen före start ⇒ before");
  eq(buildPosition(plan, "2026-10-11").pct, 0, "bp: före start 0 % — pinnen står vid noll");
  ok(buildPosition(plan, "2026-10-15").bands[0].state === "cur", "bp: bandet vet vilket block som är nu");
  ok(buildPosition({ blocks: [] }, "2026-10-15") === null, "bp: utan block inget påstående, ingen krasch");
  ok(buildPosition(plan, "trasigt") === null, "bp: trasigt datum ⇒ null, aldrig NaN");
  ok(buildPosition(plan, "2026-10-15").totalWeeks === 3, "bp: byggets veckotal summeras ur blocken"); }
{ /* flera block + glapp: passerade räknas, glappet påstår inget block */
  const two = { blocks: [
    { id: "a", label: "Bas", start: "2026-10-12", weeks: 2 },
    { id: "b", label: "Build", start: "2026-11-02", weeks: 2 } ] };   /* glapp v.44 */
  const inB = buildPosition(two, "2026-11-09");              /* mån vecka 2 i b */
  eq([inB.block.id, inB.weekInBlock, inB.buildWeek], ["b", 2, 4],
     "bp: byggveckan ackumulerar över blockgränsen");
  eq(inB.pct, Math.round(21/28*100), "bp: procent räknar bara blockdagar — glappet är inte bygge");
  const gap = buildPosition(two, "2026-10-28");
  eq([gap.state, gap.block, gap.weekInBlock], ["gap", null, null],
     "bp: i glappet påstås inget block och ingen vecka");
  eq(gap.pct, 50, "bp: glappet bär de passerade blockens procent");
  eq(gap.bands.map(x => x.state), ["past", "future"], "bp: banden vet var vi står runt glappet"); }

/* ================================================================
   0.19.0 — DYGNSFLAGGOR (B19-1): datumstämplade i overlayen,
   auto-expiry vid dygnsskifte, exakt återställning via snapshot,
   handen vinner. LIFE_MODES rörs inte — skilda livscykler.
   ================================================================ */
import { DAY_FLAGS, setDayFlag, clearDayFlag, dayFlagActive,
         dayFlagEngineFlags } from "./core.js";
const thrSess = plan.sessions.find(s => s.id === "sk-w42-run-thr");

{ /* B19-1: strukturerna blandas inte */
  ok(DAY_FLAGS.sleep && !DAY_FLAGS["tissue-freeze"] && !LIFE_MODES.sleep,
     "B19-1: dygnsflaggor och periodlägen är skilda kataloger");
  eq(DAY_FLAGS.sleep.rule, "sleep-guard", "B19-1: sleep-flaggan pekar på sleep-guard"); }

{ /* set → motorflagga → downgrade med snapshot → clear → exakt återställning */
  const r0 = setDayFlag({}, "sleep", "2026-10-15", "2026-10-15T06:10:00");
  ok(!r0.error && r0.key === "dayflag:sleep@2026-10-15", "dayflag: sätts med nyckel");
  ok(dayFlagActive(r0.overlay, "sleep", "2026-10-15"), "dayflag: aktiv på sin dag");
  ok(!dayFlagActive(r0.overlay, "sleep", "2026-10-16"), "dayflag: inaktiv annan dag");
  const f = dayFlagEngineFlags(r0.overlay, "2026-10-15");
  eq(f, [{ id: "sleep-guard", source: "manual", date: "2026-10-15",
           modeKey: "dayflag:sleep@2026-10-15" }],
     "dayflag: motorflaggan är manual och bär modeKey");
  const r = applyRules(plan, r0.overlay, B, f, "2026-10-15T06:11:00");
  eq(A(r, "sleep-guard", "downgrade", "sk-w42-run-thr").length, 1,
     "dayflag: dagens kvalitetspass växlas ned");
  const ov1 = applyActions(r0.overlay, r.actions);
  ok(ov1.modes.snapshots?.["dayflag:sleep@2026-10-15"]?.["sk-w42-run-thr"] !== undefined,
     "dayflag: ögonblicksbild tagen före första beröring");
  const ov2 = clearDayFlag(ov1, "sleep", "2026-10-15", "2026-10-15T08:00:00");
  ok(!dayFlagActive(ov2, "sleep", "2026-10-15"), "dayflag: släppt");
  const eff = effectiveSession(thrSess, ov2.sessions["sk-w42-run-thr"]);
  ok(zoneDist(eff.profile)[3] > 0, "dayflag: släpp återställer profilen exakt — Z4 tillbaka");
  ok(ov2.sessions["sk-w42-run-thr"].events.some(e => String(e.rule).startsWith("undo:dayflag")),
     "dayflag: ångringen loggas, historiken skrivs aldrig om");
  ok(!ov2.modes.snapshots?.["dayflag:sleep@2026-10-15"], "dayflag: snapshoten städas vid släpp"); }

{ /* PERMANENT REGRESSIONSVAKT (0.18.1-läxan i flaggform): tidsskifte utan omstart.
     En flagga satt på kvällen får ALDRIG växla ned nästa dags pass. */
  const r0 = setDayFlag({}, "sleep", "2026-10-15", "2026-10-15T22:40:00");
  eq(dayFlagEngineFlags(r0.overlay, "2026-10-15").length, 1, "expiry: flaggan lever sin dag");
  eq(dayFlagEngineFlags(r0.overlay, "2026-10-16").length, 0,
     "expiry: samma overlay, nästa dag ⇒ ingen motorflagga — PWA öppen över midnatt");
  const r = applyRules(plan, r0.overlay, B,
                       dayFlagEngineFlags(r0.overlay, "2026-10-16"), "2026-10-16T06:00:00");
  ok(!r.actions.some(a => a.rule === "sleep-guard"),
     "expiry: sleep-guard fyrar inte dagen efter — utvärdering per körning, aldrig boot") ; }

{ /* handen vinner: manuell ändring under flaggans gång behålls vid släpp */
  const r0 = setDayFlag({}, "sleep", "2026-10-15", "2026-10-15T06:10:00");
  const r = applyRules(plan, r0.overlay, B, dayFlagEngineFlags(r0.overlay, "2026-10-15"),
                       "2026-10-15T06:11:00");
  const ov = applyActions(r0.overlay, r.actions);
  const so = ov.sessions["sk-w42-run-thr"];
  so.adjust = { ...so.adjust, durationMin: 30 };
  so.events.push({ rule: "manual-adjust", session: "sk-w42-run-thr", action: "shorten",
                   why: "kortat av användaren", t: "2026-10-15T07:00:00" });
  const ov2 = clearDayFlag(ov, "sleep", "2026-10-15", "2026-10-15T08:00:00");
  eq(ov2.sessions["sk-w42-run-thr"].adjust.durationMin, 30,
     "handen vinner: användarens version behålls när flaggan släpps");
  ok(ov2.sessions["sk-w42-run-thr"].events.some(e => e.action === "keep"),
     "handen vinner: keep-beslutet loggas"); }

{ /* på/av/på samma dag (0.9.0-läxan): modeKey passerar H4 */
  const r0 = setDayFlag({}, "sleep", "2026-10-15", "2026-10-15T06:10:00");
  const r1 = applyRules(plan, r0.overlay, B, dayFlagEngineFlags(r0.overlay, "2026-10-15"),
                        "2026-10-15T06:11:00");
  const ovOn  = applyActions(r0.overlay, r1.actions);
  const ovOff = clearDayFlag(ovOn, "sleep", "2026-10-15", "2026-10-15T06:30:00");
  const r2 = setDayFlag(ovOff, "sleep", "2026-10-15", "2026-10-15T06:45:00");
  ok(!r2.error, "på/av/på: flaggan kan sättas om samma dag");
  const r3 = applyRules(plan, r2.overlay, B, dayFlagEngineFlags(r2.overlay, "2026-10-15"),
                        "2026-10-15T06:46:00");
  eq(A(r3, "sleep-guard", "downgrade", "sk-w42-run-thr").length, 1,
     "på/av/på: nedväxlingen tillämpas igen — H4 spärrar aldrig ett bekräftat läge"); }

{ /* sleep-guard rör aldrig ett UTFÖRT pass: flaggan sätts efter träningen ⇒
     planprofilen lämnas orörd, annars korrumperas utfall-mot-plan (0.19.0-fynd) */
  const ov = { sessions: { "sk-w42-run-thr": { status: "done" } } };
  const r = applyRules(plan, ov, B,
                       [{ id: "sleep-guard", source: "manual", date: "2026-10-15" }],
                       "2026-10-15T20:00:00");
  ok(!r.actions.some(a => a.rule === "sleep-guard"),
     "sleep-guard: utfört pass växlas aldrig ned i efterhand") ; }

{ /* vakter: okänd flagga, trasigt datum, dubblett */
  ok(setDayFlag({}, "kaffe", "2026-10-15").error, "dayflag: okänd flagga avvisas");
  ok(setDayFlag({}, "sleep", "igår").error, "dayflag: trasigt datum avvisas");
  const a = setDayFlag({}, "sleep", "2026-10-15", "t").overlay;
  ok(setDayFlag(a, "sleep", "2026-10-15").error, "dayflag: dubblett avvisas");
  eq(clearDayFlag({}, "sleep", "2026-10-15", "t"), { sessions: {}, modes: {} },
     "dayflag: släpp av osatt flagga är ofarligt"); }

{ /* städning: gårdagens flagga + snapshot prunas när ny dags flagga sätts */
  const a = setDayFlag({}, "sleep", "2026-10-14", "2026-10-14T06:00:00").overlay;
  a.modes.snapshots = { "dayflag:sleep@2026-10-14": { "sk-w42-run-thr": {} } };
  const b = setDayFlag(a, "sleep", "2026-10-15", "2026-10-15T06:00:00").overlay;
  eq(b.modes.dayflags.map(x => x.date), ["2026-10-15"],
     "städning: gårdagens flagga följer inte med in i ny dag");
  ok(!b.modes.snapshots["dayflag:sleep@2026-10-14"],
     "städning: gårdagens snapshot prunas — dagen hände med flaggan, inget återställs"); }

/* ================================================================
   0.19.1 — B19-3: motorn riktar ALDRIG en åtgärd mot ett utfört pass.
   Utförda pass är historia; ändring korrumperar utfall-mot-plan och
   varningar om det redan skedda är brus. Undantag: utfallsflaggor
   (rpe-watch) — de bär information om återhämtning, inte en uppmaning
   att ändra passet.
   ================================================================ */
{ const done = { sessions: { "sk-w42-run-thr": { status: "done" } } };
  const ovTf = { ...done, modes: { active: [mode("tissue-freeze", "2026-10-12", "2026-10-18")] } };
  ok(!applyRules(plan, ovTf, B, [], NOW).actions.some(a => a.session === "sk-w42-run-thr"),
     "B19-3: tissue-freeze byter aldrig gren på ett utfört pass");
  const ovIll = { ...done, modes: { active: [mode("illness-stop", "2026-10-12", "2026-10-18")] } };
  const rIll = applyRules(plan, ovIll, B, [], NOW);
  ok(!rIll.actions.some(a => a.session === "sk-w42-run-thr"),
     "B19-3: illness-stop stryker aldrig ett utfört pass — det hann hända");
  ok(A(rIll, "illness-stop", "strike").length >= 1,
     "B19-3: övriga planerade pass i spannet stryks fortfarande");
  const ovVac = { ...done, modes: { active: [mode("mode-vacation", "2026-10-12", "2026-10-18")] } };
  ok(!applyRules(plan, ovVac, B, [], NOW).actions.some(a => a.session === "sk-w42-run-thr"),
     "B19-3: semester rör aldrig ett utfört A-pass");
  const rMiss = applyRules(plan, done, B, [{ id: "missed", sessionId: "sk-w42-run-thr" }], NOW);
  ok(!rMiss.actions.some(a => a.session === "sk-w42-run-thr"),
     "B19-3: ett utfört pass kan inte missas — flaggan är inert"); }

{ /* B19-3: strukturvarningar tystas när målet är utfört — quality-spacing
     om ett redan genomfört pass är brus, inte vägledning */
  const done = { sessions: { "sk-w42-run-thr": { status: "done" } } };
  const r = applyRules(plan, done, B, [], NOW);
  ok(!r.actions.some(a => a.action === "warn" && a.session === "sk-w42-run-thr"
                          && (a.rule === "quality-spacing" || a.rule === "heavy-legs")),
     "B19-3: strukturvarning riktas aldrig mot utfört pass");
  const rRpe = applyRules(plan, done, B, [{ id: "rpe-watch", sessionId: "sk-w42-run-thr" }], NOW);
  ok(A(rRpe, "rpe-watch", "warn").length === 1,
     "B19-3: rpe-watch är UNDANTAGEN — utfallsflaggan talar om återhämtning, inte om passet"); }

/* ================================================================
   0.19.1 — B19-4: lägen och dagsform rör ALDRIG pass i race-veckor.
   Racets upplägg ägs av atlet + coach i separat dialog. Sjukdom över
   tävling ⇒ uppmaning till coachdialog, aldrig tyst strykning.
   ================================================================ */
const racePlan = structuredClone(plan);
racePlan.weeks.find(w => w.week === 43).type = "race";   /* sk-w43-run-thr blir race-pass */

{ const ovTf = { modes: { active: [mode("tissue-freeze", "2026-10-19", "2026-10-25")] } };
  ok(!applyRules(racePlan, ovTf, B, [], "2026-10-19T07:00:00").actions
       .some(a => a.session === "sk-w43-run-thr" && a.action !== "warn"),
     "B19-4: känning byter aldrig gren på race-veckans pass");
  const ovVac = { modes: { active: [mode("mode-vacation", "2026-10-19", "2026-10-25")] } };
  ok(!applyRules(racePlan, ovVac, B, [], "2026-10-19T07:00:00").actions
       .some(a => a.session === "sk-w43-run-thr" && a.action !== "warn"),
     "B19-4: semester kortar aldrig race-veckans A-pass");
  const rSleep = applyRules(racePlan, {}, B,
    [{ id: "sleep-guard", source: "manual", date: "2026-10-21" }], "2026-10-21T06:00:00");
  ok(!rSleep.actions.some(a => a.rule === "sleep-guard"),
     "B19-4: dålig natt växlar aldrig ned ett race-pass — race-morgonen är din och coachens");
  const rMiss = applyRules(racePlan, {}, B,
    [{ id: "missed", sessionId: "sk-w43-run-thr" }], "2026-10-21T06:00:00");
  ok(!rMiss.actions.some(a => a.session === "sk-w43-run-thr" && a.action !== "warn"),
     "B19-4: race-pass flyttas/stryks aldrig av missed");
  ok(rMiss.actions.some(a => a.session === "sk-w43-run-thr" && a.action === "warn"
                             && a.why.includes("coach")),
     "B19-4: missed på race-pass svarar med coachdialog-uppmaning"); }

{ /* sjukdom över tävling: race-passet står kvar, uppmaningen syns */
  const ov = { modes: { active: [mode("illness-stop", "2026-10-19", "2026-10-25")] } };
  const r = applyRules(racePlan, ov, B, [], "2026-10-19T07:00:00");
  ok(!r.actions.some(a => a.session === "sk-w43-run-thr" && a.action === "strike"),
     "B19-4: sjukdom stryker aldrig race-passet tyst");
  ok(r.actions.some(a => a.session === "sk-w43-run-thr" && a.action === "warn"
                         && a.why.includes("coach")),
     "B19-4: sjukdom över tävling ⇒ uppmaning till coachdialog");
  /* comeback-grind + race: kvalitet i race-vecka hålls INTE nere av rampback */
  const ovCb = { modes: { comeback: { need: 2, z2done: 0, passed: false, after: "2026-10-18" } } };
  ok(!applyRules(racePlan, ovCb, B, [], "2026-10-19T07:00:00").actions
       .some(a => a.rule === "illness-rampback" && a.session === "sk-w43-run-thr"),
     "B19-4: comeback-grinden växlar aldrig ned race-passet — det beslutet är coachens"); }

/* ---------- Svitvakt (regression 2026-08-02) ----------
   En kvarglömd avslutning mitt i filen lät sviten sluta tyst efter 102 tester
   och rapportera grönt. En svit som ljuger uppåt är värre än en röd svit. */
const EXPECTED_MIN = 759;
if (pass + fail < EXPECTED_MIN) {
  console.error(`  ✗ SVITEN AVBRÖTS: ${pass+fail} tester kördes, minst ${EXPECTED_MIN} väntade`);
  fail++;
}

/* ---------- Sammanfattning ---------- */
console.log(`\n${pass}/${pass+fail} tester gröna` + (fail? ` — ${fail} RÖDA`:""));
process.exit(fail?1:0);
