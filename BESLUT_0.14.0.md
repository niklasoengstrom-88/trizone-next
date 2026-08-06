# BESLUT 0.14.0 — grafernas premiumpass

**Datum:** 2026-08-06 · **Från:** 0.13.0 (deployad, fältverifierad) · **Tester:** 634 kärna · 259 rök

## Missen från 0.13.0, rättad

Vilopulskurvan skulle ersättas av inforutan men blev kvar — den låg i `renderAnalys`, inte i `pmcSection` som byggdes om. Nu borttagen, och röktestet asserterar dess **frånvaro** så den inte smyger tillbaka.

## Designbeslut (inom spec 3:s låsta språk — ingen ny identitet)

| # | Beslut |
|---|---|
| **F1** | **Ädelstenspunkter.** Varje mätvärde: halo (grenfärg 16 %) + kärna + 0,55 px lyftstroke i bakgrundsfärg. Punkterna får djup mot varm svärta utan skuggeffekter. Vald punkt: accentring + lodrät guide. |
| **F2** | **CTL som landskap.** Gradientfyllning under fitnesskurvan (info-blå 16 % → 0). Motiverat i ämnet: fitness är ackumulerad mark, trötthet är väder ovanpå — ATL flimrar över, CTL bär. Årets enda djärvhet i graferna; resten är disciplin. |
| **F3** | **Tre stödlinjer med tre axelvärden** (max/mitt/min) i stället för två — strukturen kodar verkliga värden, dekorerar inte. |
| **F4** | **Skärmfyllande höjder:** PMC 224 px, effektivitet 184 px. |
| **F5** | **En orkestrerad rörelse:** sektionen andas in (280 ms fade + 7 px lyft), `prefers-reduced-motion` respekteras. Inga utspridda effekter. |
| **F6** | Linjer med rundade fogar, ATL något nedtonad under CTL — hierarki i stroke, inte i färgbyte. |

## Kvar på bordet

`blocks[].lowShare` (beslutad A, obyggd) · `recovery-watch` mot §6-taket (ostämplat) · sim-LTHR i intervals.icu före simbandet · brick som pass-par i nästa planleverans · fördjupningsvyer per statusgrid-dimension.
