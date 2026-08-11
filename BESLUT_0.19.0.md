# BESLUT 0.19.0 — Motor-UI, skikt a (dagsform + missed-flöden)

**Datum:** 2026-08-11 · **Stämpel:** `next-0.19.0 · 2026-08-11`
**Testläge:** core 744 (svitvakt 744) · smoke 332 (svitvakt 332)

---

## B19-1 — Dagsform-chipsens hemvist och semantik

**Beslut:** Dagsform implementeras som tre separata mekanismer efter respektive
regels scope — inte som utökning av LIFE_MODES.

1. **Sov dåligt?** — dygnsflagga, lagras datumstämplad i overlayen
   (`trizone.overlay.v1`, ingen ny nyckel): `{flag:"sleep", date:<todayISO>}`
   under `modes.dayflags`. Utvärderas mot aktuellt datum vid varje
   regelkörning/rendering — aldrig boot-tillstånd (arv från
   0.18.1-regressionen). Triggar `sleep-guard`. Släpper automatiskt vid
   dygnsskifte, inget städkrav på användaren.
2. **Känning?** — oförändrat periodläge under Period (bekräftar
   0.18.1-placeringen). Triggar `tissue-freeze` med snapshot/återställning
   enligt spec 1 §9. Ingen ändring i denna release.
3. **Hinner inte?** — tillståndslös action, ingång till missed-A/B-flödet.
   Renderas som actionchip (streckad kant, ingen prick, aldrig on-läge) —
   visuellt skild från tillståndschips. Samma visuella form för olika
   beteenden vore en lögn i gränssnittet.

**LIFE_MODES rörs inte.** Strukturen förblir ren periodsemantik (snapshot,
D4-stapling, manuell avstängning).

**Placering:** primäryta Idag ("Om inte?"-chips under dagens pass, endast i
pass-läge — Klart för idag/Vila visar inga chips, det finns inget kvar att
inte hinna); Dagsform-gruppen i Livslägen-kortet speglar samma tillstånd.
Chip-tryck ger omedelbar konsekvens + ångra genom nytt tryck; aktiv
dygnsflagga märks "gäller idag".

**Framtidssäkring:** en framtida derived-trigger (RHR ≥ +5 bpm, D2) ställer
frågan genom samma regel och samma flagga — chippet är den manuella vägen,
förslaget den härledda; ett beteende, två ingångar. Redan i denna release
routas derived-frågans "Ja" genom `setDayFlag` — samma tillstånd, samma
expiry, samma ångra som chippet.

**Genomförande:**
- `DAY_FLAGS`-katalog i core (en post: `sleep`), skild från LIFE_MODES.
- `setDayFlag` / `clearDayFlag` / `dayFlagActive` / `dayFlagEngineFlags` —
  rena funktioner. Passerade dagars flaggor och snapshots prunas vid ny
  dags sättning: dagen hände med flaggan, inget återställs i efterhand.
- Återställningen delar kodväg med periodlägena: `restoreSnapshot`-helper
  extraherad ur `deactivateMode` (beteendet oförändrat, fixturlåst).
  Handen vinner, ångring loggas, historik skrivs aldrig om.
- Motorflaggan bär `modeKey` (`dayflag:sleep@<datum>`) ⇒ snapshot tas i
  `applyActions` och H4 spärrar inte på/av/på samma dag (0.9.0-läxan).

**Fixturer (före kod):** set→downgrade→clear = exakt återställning ·
tidsskifte utan omstart ⇒ sleep-guard fyrar inte dagen efter (PERMANENT
regressionsvakt) · handen vinner · på/av/på samma dag · okänd
flagga/trasigt datum/dubblett avvisas · städning av passerade dagar ·
rök: chipsband, expiry i UI, missed-picker, Dagsform-gruppen.

## B19-2 — sleep-guard rör aldrig utförda pass (fynd under fixturskrivning)

**Fyndet:** sleep-guards målfilter uteslöt bara `struck`. En flagga satt på
kvällen — efter genomfört kvalitetspass — hade skrivit om det UTFÖRDA passets
planprofil till Z2 och därmed korrumperat utfall-mot-plan-jämförelsen.

**Beslut:** sleep-guard riktar endast pass med status `planned`. Utförda pass
växlas aldrig ned i efterhand. Permanent fixtur.

**Avgränsning:** periodlägenas målfilter (tissue-freeze, mode-vacation m.fl.)
har samma exponering men fälttestat beteende och egna fixturer — de rörs
INTE i denna release. Om samma korruption bedöms gälla dem är det en egen
specrevision av regelverket (produktägarbeslut), inte en tyst följdändring.

## Kvarvarande 0.19-kö (ordningsbeslut 2026-08-11)

- **(b)** S2-hjälten + varningstrappan + per-pass-händelser
- **(c)** §5d-verben i sheeten + Föreslå plats + comeback-grinden
- **(d)** cfg.rules-UI (avblockerar PLANLEVERANS §2)

Faller tiden före Bas kort är (a)+(b) det som inte får ryka.
