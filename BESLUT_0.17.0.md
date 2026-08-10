# BESLUT 0.17.0 — Beställningsexport (B6) + fasbriefing (B1) + trimPlan-regression

**Datum:** 2026-08-10 · **Föregås av:** 0.16.0 · **Styrdokument:** FARDPLAN_rev3 §0.17.0, PLANLEVERANS v2.1 (B1/B3/B6), planformat v0.4-delta
**Testläge:** core 665 → **692** · smoke 263 → **272** · svitvakter bumpade

---

## 1. REGRESSION (hittad i ceremoniläsningen): trimPlan ströp blocks[].lowShare

Vitlistan i `trimPlan` var `["id","label","start","weeks"]` — fasmålet från beslut A
(0.16.0) överlevde inte trimning. plan.json är network-first, så online märktes
inget; **offline** laddades den trimmade projektionen ur `trizone.plan.v1` och
`phaseLowShare` föll tyst tillbaka på profilvärdet. Exakt den tysta degradering
F5 ska omöjliggöra, och skälet till att 0.16.0:s svit var grön trots buggen.

**Fix:** blockvitlistan bär nu `lowShare` och `text.brief`. Fem permanenta
fixturer, inklusive att frånvarande fält inte hittas på och att okända textfält
fortfarande trimmas.

**Lärdom (husregelkandidat):** när en release adderar ett planfält ska trimPlan-
fixturen uppdateras i samma release — vitlistan är en andra valideringspunkt.

## 2. B6 — Beställningsexport

`orderExport({ cfg, plan, athlete, now })` i core.js — ren funktion, komponeras
på begäran, **lagras aldrig** (smoke-fixtur bevisar noll spår i localStorage).

Innehåll: `kind: "trizone-next-bestallning"` · atletreferens · aktiva bindningar ·
protected-lista ur planen (id/titel/gren/prio — hälsoneutralt per F2) · motorvärden
(de fem redigerbara `ENGINE_FIELDS`, cfg-överstyrning vinner, ENGINE-default fyller) ·
benchmarks (null-fält utelämnas).

**Implementationsval — vitlista, inte svartlista:** specen säger "reason filtreras
bort i koden"; implementationen släpper endast `rule` / `sport` /
`substitute.{quality,easy}` igenom. Okända fält kan bära hälsodata och passerar
aldrig, oavsett namn. Fixturen bevisar att reason inte läcker på rotnivå, nästlat
i substitute eller i okända fält. Bindning utan `rule` exporteras inte alls.

**UI:** egen sektion i Inställningar ("Beställning till coachen"), JSON till
urklipp. Kodkonstanter (driftPct, slotHour m.fl.) exporteras inte — kod är kod,
inte profil.

Övergångsregeln i PLANLEVERANS §2 kan strykas när denna version är deployad.

## 3. B1 — Fasbriefing

- **Validering:** `blocks[].text` måste vara objekt; `brief` icke-tom sträng,
  **tak 1200 tecken** (~5 meningar per B3, med marginal). Rotorsaksfel anger
  faktisk längd och tak.
- **trimPlan** bär fältet (se §1).
- **Rendering:** ramlös `.phasebrief`-sektion överst i Plan (L1), eyebrow
  "Fas · {label}", brief i serif (textkanalen, S3). Innevarande block via
  `blockForDate(plan, today())` — kvarliggande hela fasen. Den expanderbara
  placeringen under fasbandet (U1) hör till 0.18:s planhero.
- plan_ref.json har fått referens-brief; smoke verifierar rendering.

## 4. Utanför denna release

0.17.1 planposition (U5) — nästa ceremonicykel. Allt i 0.18+ orört.

## 5. Att verifiera vid deploy

1. Stämpel `next-0.17.0 · 2026-08-10` i Inställningar → Bygge, alla rader gröna
2. Plan-vyn: ingen fasbriefing syns (skarpa plan.json saknar `text.brief` — väntat;
   den kommer med Bas-leveransen)
3. Inställningar: "Kopiera beställningsexport" → klistra in någonstans och
   ögna: bindningar/protected/motorvärden/benchmarks finns, **ingen** reason-text
4. Flygplansläge + omladdning: appen ska visa cachad plan med fasmål intakt
   (regressionens verkliga testfall)
