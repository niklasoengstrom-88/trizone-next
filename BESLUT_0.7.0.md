# TRIZONE Next 0.7.0 — beslut och specnoteringar (2026-08-03)

**Ny localStorage-nyckel: `trizone.next.cfg.v1`** (kräver beslut per DoD — härmed fattat).
Innehåll: atletens bindningar enligt D7, i nuläget livsschemat. Skrivs endast via `saveCfg`
med validering och kvotvakt. Trasig cfg blockerar aldrig appen — default gäller, felet redovisas.
Bindningarna följer med säkerhetskopian (D7: backup-exporten omfattar bindningar); äldre kopior
utan cfg accepteras oförändrat.

**Livsschemat flyttat ur koden (D7-skulden stängd):** hårdkodade `BINDINGS` i ui.js ersatta av
cfg med redigering i Inställningar. Schemat framhäver träningsdagar och matar motorns
flyttförslag — det spärrar aldrig en placering (beslut A består).

**Navigering:** tre flikar — Plan · Logg · Inställningar. Idag-fliken tillkommer i 0.8.0 och
byggs inte som död platshållare. Byggstämpel, wordmark, haptiktest och backup bor nu i
Inställningar (designspråk T2 uppfylld — appkromet är rent). Utanför plan och händelseloggen
bor i Loggen. Föräldralösa överlagringar fick sin beslutsvy (Arkivera/Radera per post,
`resolveOrphan`, alltid loggat).

**Testselen: `plan_ref.json`.** `plan.json` betyder från och med nu ALLTID den skarpa planen —
i repot, i zippen, överallt. Testerna läser den frysta referensfixturen `plan_ref.json`.
Zip-fällan från 0.6.3 (referensplan under skarpt filnamn) är avväpnad: leveranszippen
innehåller `plan.json` = Kalmar-planen.

**Felläge vid ogiltig plan:** appen landar i Inställningar (där pariteten bor) i stället för
en död yta.
