# BESLUT 0.12.0 — PMC, TSB och aerob effektivitet

**Datum:** 2026-08-05 · **Från:** 0.11.0 · **Tester:** 618 kärna · 247 rök

---

## Beslut

| # | Fråga | Beslut |
|---|---|---|
| **D1** | Pulsfönster för effektivitetsurval | **Härleds ur atletprofilens zongränser i intervals.icu.** Inte v32:s fasta tal. Atletagnostiskt (fungerar för David), följer automatiskt med när trösklarna testas om, och ger Z2/Z3-växling gratis. D6 gäller: historiken läses alltid med dagens fönster. |
| **D2** | CTL/ATL | **Hämtas färdigräknade ur wellness.** Appen räknar dem aldrig om — en andra beräkning av samma sak divergerar garanterat (M2 / effSeries-principen). TSB är den enda härledningen. |
| **D3** | `blocks[].lowShare` | **Alternativ A: blocknivå.** `polarization` ska dessutom tiga på test- och race-veckor, eftersom `weeks[].type` redan bär skälet. Ej byggt ännu — kräver revision av planformat §3. |
| **D4** | Sheet kontra plan.json | **Oförändrat enligt planformat P1.** `plan.json` bär block/veckor/pass; Sheet behåller lopp och delmål. Veckoändringar sker via veckopatch (§5b) utan deploy. |

## PMC

`pmcSeries` filtrerar wellness på fönstret och kräver både `ctl` och `atl` — halva rader faller bort hellre än att bilda en halv kurva. `pmcStatus` ger senaste dagens värden, fitnessförändring över en vecka och tolkningsband.

`TSB_BANDS` följer demons intervall (Build −5 till −20). Bandet renderas alltid **tillsammans med siffran**, och texten säger uttryckligen att riktvärdena är litteraturens, inte atletens — läs siffran mot hur benen känns, inte tvärtom.

## Aerob effektivitet

`zoneBand(athlete, sport, zone)` härleder fönstret ur profilens `hr_zones`. Knappen visar fönstret i klartext (`Z2 · 129–148`) så att urvalet aldrig är dolt.

Per gren:

- **Löpning** — tempo vid snittpuls i fönstret, ≥ 30 min. **Löpband utesluts** och antalet redovisas: estimatdistans blandas aldrig med GPS-distans i samma kurva (matchning §3).
- **Cykel** — snittwatt vid snittpuls i fönstret. **Endast `has_device_watts === true`.** Estimerade watt utesluts och antalet redovisas. Ärvd regel, oförhandlingsbar.
- **Simning** — tempo per 100 m, urval på **distans ≥ 600 m, aldrig på puls**. Simmen har inget pulsfönster eftersom optisk handledspuls i vatten inte är mätdata.

Trendlinjen är minsta kvadrat, egen ren funktion. Y-axeln vänds för tempo så att **uppåt alltid betyder bättre**, oavsett gren — ett koordinatsystem per axel (v29-lärdomen), och samma tolkningsriktning överallt.

Under `EFF.minPoints` (4 pass) ritas ingen trendlinje. En regressionslinje genom tre punkter är falsk precision.

## Kvar

- `blocks[].lowShare` enligt D3 — planformatsrevision, ej byggd
- Fördjupningsvyer per dimension (demons bild 1–3) och tidsintervallväljare per graf
- `recovery-watch` sätter katalogen på 15 mot regelverk §6 — fortfarande ostämplat
- Sim-LTHR ärver löpningens i intervals.icu — sätt eget värde innan `swimHrValid` slås på
