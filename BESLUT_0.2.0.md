# TRIZONE Next 0.2.0 — preciseringar till regelverk-spec v0.2, beslutslogg

**Datum:** 2026-08-01 · **Kontext:** regelmotorbygget. Specen lämnade utrymme på sex punkter;
produktägaren delegerade besluten. Klistras in i spec 1 §12. Veto i efterhand = specrevision + fixturändring.

| # | Fråga | Beslut (implementerat, testat) |
|---|---|---|
| **K1** | Kvalitetspass-definition | Z4+Z5 ≥ 8 min **eller** ≥ 12 % av durationen — v26:s hårt-kriterium återanvänt. `ENGINE.qualityHardMin/qualityHardShare`. |
| **K2** | Underhållsdos (`mode-vacation`) | `shorten` till 60 % av planerad duration, avrundat till 5 min, golv 20 min. `ENGINE.maintFactor/shortenFloorMin`. Överstyrbar via `bindings.engine`. |
| **K3** | Kärndel (skyddade pass) | Golv = max(20 min, 50 % av duration). `ENGINE.protectedFloor`. |
| **K4** | Ledig slot / livsschema | `bindings.schedule = { "0":["Kväll"], … }` (dag 0=mån → fönster). Ledig = schemaslot utan icke-struket pass (alla prion upptar fysiskt, även C). `missed-A` söker framåt: samma dag senare fönster, sedan kommande dagar i egen vecka. |
| **K5** | Motorns gräns | Derived triggers och utfallsflaggor beräknas uppströms och kommer in som `flags` — motorn beräknar ingen fysiologi. Motorn skriver aldrig lagring: `applyRules` → åtgärder, `applyActions` → ny overlay (ren), kvotvakten bor i lagringswrappern (UI-session). |
| **K6** | Flaggmerge, överlevande nyckel | Bredare äter smalare: `quality-spacing` äter `heavy-legs` (samma dygn/par), `polarization` äter `duration-drift`. Uppäten nyckel redovisas i `merged`. |

**Följdpreciseringar ur bygget:**

- **C och nivå 1:** C-pass är luft för nivå 2-lägen och flaggor, **aldrig för säkerhetsregler** — frys och sjukstopp träffar även C (löpning på stressfraktur är löpning oavsett prioritetsetikett).
- **Missat skyddat B:** stryks inte (spec 1 §8); motorn lämnar endast redovisande `warn` — omplanering är användarens.
- **`volume-cap` bekräftad:** `warn` + `shorten` med faktor ur flaggan (`f.factor`, default 0,8). Derived-varianten frågar först (D2).
- **`missed-A` B-slot-fallback:** när schemat saknar ledig slot tar A ett oskyddat B-pass slot; B:t stryks (jagas inte ikapp).
- **D3-grinden:** flytt av kvalitetspass kräver ≥ 24 h till närmaste andra kvalitetspass, beräknat på nominella fönsterklockslag (Morgon 07 · Lunch 12 · Kväll 18, `ENGINE.slotHour`). Ingen kandidat ⇒ strykning med H2-förklaring.
- **Comeback-grinden (D5):** `illness-stop`-skrivning öppnar `overlay.modes.comeback = {need, z2done, passed, after}`. Motorn håller kvalitet på Z2 tills `passed`; frågar när `z2done ≥ need`. `z2done` uppdateras av matchning/UI (utanför motorn).

**Avvikelse noterad:** `plan_broken.json` saknades i uppladdningen och i överlämningens §3-filtabell trots att
`core_test.mjs` kräver den. Rekonstruerad ur testets assertions (exakt 4 fel), ingår i denna zip.
**Åtgärd:** diffa mot repots kopia; lägg filen i §3-tabellen och i framtida sessionszippar.
