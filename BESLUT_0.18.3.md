# BESLUT 0.18.3 — Toast över flikraden

**Datum:** 2026-08-11 · **Stämpel:** `next-0.18.3 · 2026-08-10` · sw-cache `trizone-next-0.18.3`
**Testläge:** core **718** (svitvakt 718) · smoke **309** (svitvakt 309) · plan_broken felar med exakt 5

## Fix (S25-fyndet)

Toasten renderades bakom flikraden (z-index 30 < 40) och delvis under den
(bottom 18px < flikradens ~70px) — varje kvittens, inklusive
vibrationstestets svar, klipptes. Nu bottom 76px + safe-area, z-index 45.
Regressionsvakt i röksviten läser styles.css som text (samma grepp som
sw-cachevakten): toastens z-index > flikradens och bottom-offset ≥ 72px.

## Haptiken — stängd som kodärende

Paritetsraden + testknappen bevisade kodvägen: API finns, anrop görs,
argument skickas (24 anrop, mönster 120-60-120). Enheten vibrerar ändå inte
⇒ OS-nivå. Åtgärd hos produktägaren: ljudläge (statusraden visar Ljud av,
som undertrycker webbvibration på Samsung), därefter Tryckåterkoppling-
intensiteten, därefter Chrome-webbplatsinställningar. Återöppnas i kod
endast om vibrationen uteblir med ljudläge på och intensitet > 0.
