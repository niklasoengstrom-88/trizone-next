# BESLUT 0.18.0 — Plan-ombyggnaden

**Datum:** 2026-08-10 · **Stämpel:** `next-0.18.0 · 2026-08-10` · sw-cache `trizone-next-0.18.0`
**Testläge:** core **718** (svitvakt 718) · smoke **297** (svitvakt 297) · plan_broken felar med exakt 5 rotorsaker

## Beslut

**B18-1 — Placering av Läget/frågekort/matchbekräftelser** (produktägare, 2026-08-10):
demon + teamförslag godkänt. Frågekort, matchbekräftelser och warnStep bor i
överblicken (de föder compliance — felet ska synas där det uppstår). Läget-
sektionen ligger kvar i överblicken, längst ner (demo v13, G1). Idag flaggar
aktivt läge som förut. Omplanera är ren flyttvy.

**B18-2 — Överblickens struktur:** hero → frågor/bekräftelser → pastfold →
veckolista → Läget → utanför plan → Idag-fab. Tomma dagar renderas inte i
överblicken — den visar träning, inte tomrum. Omplanera visar alla 21 dagrader.

**B18-3 — Kompaktradens innehåll:** prick + titel + fönster + prio/status,
PLUS motorbadges (Kortat/Nedväxlat/Ersättning/Flyttat). Avsteg från demons
minimala rad är avsiktligt: varje automatiskt ingrepp ska synas även i
överblicken (redovisningsprincipen). Saknas fönster visas duration i dess
ställe — raden lämnar aldrig ett hål.

**B18-4 — "Flytta" från överblickens sheet hoppar till Omplanera** där
dagmålen bor. tapMove överlever hoppet.

**B18-5 — Fasbriefingen (B1) flyttar in i planheron (U1)**, hopfälld bakom
"Om fasen"-expander. `S.briefOpen` är rent vytillstånd — ingen ny nyckel.
Semantiken (validering, trimPlan) orörd och fixturlåst sedan 0.17.0.

## Ny kärnlogik

`buildPosition(plan, todayISO)` — ren funktion: "vecka X av Y i blocket",
byggvecka, % av bygget (hela dagar avklarade FÖRE idag / blockens samlade
dagar), fasband med past/cur/future, pinPct. Hanterar before/in/gap/after.
Glapp mellan block räknar passerade block men påstår inget block. 18 fixturer.

## Känt interimbeteende

Långtryck + rörelse på en kompaktrad i överblicken armerar draget men hittar
inga dagmål (de finns bara i Omplanera) — släpp ger "Flytten avbröts".
Ofarligt men värt att känna på S25:an. Åtgärdas om det skaver i verklig
användning, inte innan.

## Utanför releasen (bekräftat)

Prognoskort (efter 1.0) · lopplista (fas 5) · dagsform/livslägen-chips (0.19) ·
kalenderikonens Idag-mappning (0.20, öppet beslut 2 står kvar).
