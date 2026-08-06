# TRIZONE Next — Planformat-spec: revision v0.3 → v0.4

**Status:** beslutad (alternativ A, produktägaren) · rev 2026-08-06 · implementerad i 0.16.0
**Form:** delta-dokument. Allt i v0.3 gäller oförändrat utom nedan. Vid nästa helrevision bakas detta in i huvuddokumentet.

---

## Ändring 1 — §3 Nivå 1 (Makro): nytt valfritt blockfält `lowShare`

```
"blocks": [
  { "id":"bas", "label":"Bas", "start":"2026-09-07", "weeks":14, "lowShare": 0.80 },
  { "id":"build1", "label":"Build 1", "start":"2026-12-14", "weeks":10, "lowShare": 0.75 }
]
```

**Semantik:**

- `lowShare` är **fasens polariseringsmål**: andelen Z1–Z2 av veckans zonminuter som blocket siktar på. Andel 0.50–0.95, aldrig procent.
- **Hierarki: block > profil > motorstandard (0.78).** Blockvärdet är coachens leverans per fas — oenighet med det är en planrevision, inte en inställning. Frånvarande fält betyder att profilens `lowShareTarget` gäller (och saknas även den: 0.78).
- Fältet läses av `polarization`-regeln (spec 1 §6) och av Analys-vyns intensitetsdimension. Måltexten bär alltid sin källa: *"Fasens mål 75 % (Build 1)"* respektive *"Mål 78 % (profil)"*.
- **Tystnadsregel:** `polarization` fyrar aldrig på veckor med `type: "test"` eller `type: "race"` — de är planerat hårda och bedöms inte mot 80/20. Tystnad kräver **explicit** veckotyp; en vecka som saknas i planen tystar aldrig flaggan (nivå 1-lärdomen från regelverk P2: trasig/saknad data får inte bli tyst frånvaro av vakt). `recovery`-veckor behåller flaggan — en återhämtningsvecka som blir hård är exakt det den ska se.

**Motiv (varför inte per vecka):** ett veckovärde vore en andra sanning bredvid veckotypen och passens profiler. Blocket är fasens naturliga hemvist — 80/20-målet ändras när träningsfasen ändras, inte vecka för vecka. (Samma resonemang som v1-beslutet att inte ha volymmål per vecka.)

## Ändring 2 — §8 Validering: ny rad

- Block: `lowShare`, om angivet, måste vara tal i [0.5, 0.95] — gränserna speglar profilens inställningsfönster (50–95 %). Fel pekar på blocket och gränserna.

## Beslutslogg — tillägg

| # | Fråga | Beslut |
|---|---|---|
| **P7** (2026-08-06) | Fasens 80/20-mål | **Alternativ A: blocknivå.** `blocks[].lowShare`, profilvärdet som fallback, block vinner över profil. `polarization` tiger på `test`/`race`-veckor via `weeks[].type`. Analys visar fasens mål med källa. Implementerad 0.16.0; PLANLEVERANS-kontraktet uppdaterat samma dag. |
