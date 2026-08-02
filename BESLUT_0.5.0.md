# TRIZONE Next 0.5.0 — specrevisioner (beslut A + B, produktägaren 2026-08-02)

Bakgrund: fälttest av 0.4.x på Galaxy S25. Produktägarens observationer: fönster-släppzoner kräver
precision som gör draget skört; morgon/lunch/kväll är en för grov karta över verkliga träningstider;
veckobläddring bryter överblicken; jämförelse mot Runnas kalendermekanik (spec 3: "adopterad").

## Beslut A — dagen är målet, fönstret är metadata

**Designspråk v0.1 §1 S4 REVIDERAS** (signaturrevision, kräver detta beslut):
S4 "Fönsterraderna" → **"Dagraderna"**: veckan som dagrader; dagen är behållaren och enda placeringsmålet;
pass-par staplas i dagen; tidsfönster renderas som metadata-tagg på passet **när fönster finns**
(planens förslag eller uttryckligt satt). Fönster är aldrig ett tvång och aldrig en släppzon.

Följdändringar, implementerade och testade:

- **`effectiveSession` ÄNDRAD** (vaktad kärnfunktion — dokumenterat skäl: detta beslut):
  `moved`/`placed` med `slot: null` **nollställer** källpassets fönsterförslag. Användarens flytt
  är användarens tid; planens fönsterförslag följer inte med till en dag planeraren inte valt.
- **`manualAdjust` move/place:** dag räcker; `slot` valfri och valideras endast om satt.
- **`weekView`:** platt passlista per dag (sortering: fönstrade i SLOTORD först, fönsterlösa sist,
  därefter prio). `slots`/`scheduled`-strukturen utgår. `unplaced` = pass utan dag.
- **Regelverk K4 REVIDERAS (dagbaserad):** `missed-A` flyttar till nästa dag i livsschemat som klarar
  D3-grinden, med `slot: null`. **B-slot-fallbacken utgår** — dagar är inte exklusiva slots, så inget
  B-pass behöver strykas för att bereda plats. D3-grinden oförändrad (≥ 24 h till närmaste kvalitetspass).
- **Nominell tid för fönsterlösa pass: 12:00** (`slotClock`). Konsekvens: två kvalitetspass på
  grannliggande dagar utan fönster = 24 h = godkänt av D3 men fångas av `quality-spacing` (warn);
  samma dag = alltid inom 24 h ⇒ `heavy-legs`/`quality-spacing` varnar oavsett inbördes ordning
  (konservativt; båda riktningar gällde redan).
- **Matchningsspec:** ingen ändring krävs — pass utan fönster får neutral fönsterpoäng (§4:
  "Oplacerade menypass: alltid 5" tillämpas på fönsterlösa).
- **Livsschemat (`bindings.schedule`):** kvarstår som profildata men degraderas till framhävning
  (träningsdagar) och `missed-A`-kandidater. Spärrar ingenting.

## Beslut B — löpande veckolista

Veckobläddring och veckopilar utgår. Alla planveckor renderas i en skrollande lista med kompakta
veckorubriker (vecka, datumspann, fokus, summering, zonremsa). Flytt mellan veckor = dra genom
listan (autoskroll vid skärmkant). "Idag"-knapp skrollar till aktuell vecka.

- **Swipe-navigering (parkerad 0.4.1) STÄNGS** — löst av listan, byggs aldrig.
- **Veckopil-dwell under drag utgår** ur UI (reducerns `week`-händelse kvarstår som testad kapacitet).
- **Renderfönster parkerat med trigger:** hela listan renderas rakt av. Om verklig plan överstiger
  ~16 veckor och skroll/omrendering märkbart hackar på referensenheten byggs fönstring — inte före.

## Testläge

219 kärnfixturer + 21 röktester gröna. Reviderade fixturer: T3-1 (dagmål), K4-fallback ersatt av
"dagar är inte exklusiva"-fixtur, dragmaskinens släpp-på-dag, weekView-strukturen, beslut A-nollställning
av fönsterförslag vid användarflytt (+ uttryckligt fönster kvarstår möjligt som metadata).
