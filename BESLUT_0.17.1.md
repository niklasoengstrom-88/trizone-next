# BESLUT 0.17.1 — Planposition (U5): passerade veckor hopfällda

**Datum:** 2026-08-10 · **Föregås av:** 0.17.0 (deployad, stämpel verifierad på enheten)
**Styrdokument:** FARDPLAN_rev3 (0.17-kön punkt 3, U5)
**Testläge:** core 692 → **700** · smoke 272 → **283** · svitvakter bumpade
**Byte-diff core mot 0.17.0:** 2 hunkar — stämpeln + nya `pastSummary`. Inget annat rört.

---

## 1. Vad

Plan öppnar på innevarande vecka: alla passerade veckor fälls ihop till en rad
"✓ N avklarad(e) veckor · X/Y pass", expanderbar med ett tryck, hopfällbar igen.

## 2. Semantik (låst i fixturer)

- **Passerad** = veckans sista dag ligger *bakom* idag. Söndagen hör till
  innevarande vecka — den fälls inte förrän måndag morgon.
- **Compliance** med veckohuvudets formel: struket utanför både täljare och
  nämnare; **C utanför båda** — ett utfört C-pass förskönar aldrig kvoten.
- Läser via `weekView` ⇒ **källa + överlagring** (F1): pass flyttade in i en
  passerad vecka räknas där, pass flyttade ut räknas inte.
- Ingen passerad vecka ⇒ ingen rad alls — appen tiger när det inte finns
  något att säga.

## 3. Hur

- `pastSummary(plan, overlay, todayISO)` — ren funktion i core.js, 8 fixturer
  (mitt-i-vecka, söndagsgränsen, aggregat över två veckor, struket, utfört C,
  flyttat pass, null-plan, tom plan).
- Rendering: `.pastfold`-rad före veckolistan i Plan; `S.pastOpen` är rent
  vytillstånd (lagras inte — ingen ny nyckel). Zonlegenden "ljusare = hårdare"
  flyttad från index 0 till **första synliga veckan** — annars försvann den
  när v.1 fälldes ihop.
- Smoke skiftar `__TZ_TODAY` för att testa fällning/expansion/singularform och
  **återställer tiden** — sista testet bevisar att sviten lämnar rent efter sig.

## 4. Notering ur 0.17.0-deployen (beställningsexporten)

`bindings: []` i skarp export är korrekt: inget UI skriver `cfg.rules` ännu
(kommer med motor-UI 0.19, eller via backup-import). Konsekvens för
Bas-beställningen: exporten bär protected/motorvärden/benchmarks, men
**tissue-freeze-bindningen anges fortfarande manuellt** i beställningen.
PLANLEVERANS §2:s övergångsregel stryks alltså bara delvis tills 0.19.

## 5. Att verifiera vid deploy

1. Stämpel `next-0.17.1 · 2026-08-10`, alla paritetsrader gröna
2. Plan: Kalmar-planens passerade veckor ligger hopfällda med kvot; tryck
   expanderar, tryck igen fäller
3. Innevarande vecka står överst med zonlegend intakt
