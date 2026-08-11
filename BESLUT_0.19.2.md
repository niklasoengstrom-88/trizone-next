# BESLUT 0.19.2 — Stående varningar och aggregerad trappa

**Datum:** 2026-08-11 · **Stämpel:** `next-0.19.2 · 2026-08-11`
**Testläge:** core 770 (svitvakt 770) · smoke 334 (svitvakt 334)
**Fältfynd:** S25, 2026-08-11 (race-vecka Kalmar) — coachvarningen vid Sjuk
över tävlingsvecka syntes inte i trappan.

---

## B19-5 — Stående varningar

**Fyndet:** B19-4:s coachvarningar sändes via `push()` och föll under H4
(max en gång per pass och dygn). En uppmaning som ackompanjerar ett
TILLSTÅND (sjukdom över race-vecka) blinkade en gång och dog — nästa
motorkörning byggde om varningslistan utan den.

**Beslut:** varningar som följer ett tillstånd märks `standing: true`:

1. **H4 passeras** — de återutvärderas vid varje motorkörning, samma
   princip som dygnsflaggorna: tillståndet är sanningen, inte en loggpost.
2. **Loggas aldrig som händelse** — `applyActions` hoppar över stående
   varningar; annars spammas passets historik vid varje körning.
   Lägesaktiveringen är redan spårad i modes.log (P3 intakt).
3. **Missed på race-pass** svarar med coachtexten VARJE gång — även andra
   trycket samma dag får ett ärligt svar, aldrig tystnad.

Stående i 0.19.2: illness-stop-över-race och missed-på-race (B19-4:s båda
uppmaningar). Vanliga varningar (rpe-watch, quality-spacing, heavy-legs,
recovery-watch) är orörda.

**Klargörande ur felsökningen (fixturlåst):** nivå 3-varningar går via
lvl3-arrayen och har ALDRIG passerat H4 — de är flaggdrivna och återutsänds
så länge flaggan står. `runEngine` tillämpar aldrig varningar
(`action !== "warn"`-filtret). Min ursprungliga fixtur antog fel om detta;
den rättades mot verkligt beteende, inte tvärtom.

## Trappans presentation

- **Aggregering:** identiska (regel, varför) faller ihop till EN rad med
  passräkning — "Sjukdom över tävling … · 5 pass" i stället för fem
  identiska rader. Ren funktion `groupWarns` i core, fixturlåst.
- **Sett-nollställning:** kvitterade varningar för ett läge glöms när
  läget slås AV — en omaktivering ska tala igen, inte ärva gammal tystnad.
  (Trolig orsak till fältfyndet: "Sett" tryckt under testandets av/på-
  cykler överlevde inom appsessionen.)
- **Hint-texten** ändrad "Nivå 3 ändrar aldrig planen" → "Varningar ändrar
  aldrig planen" — trappan bär nu även nivå 1-stående uppmaningar och
  invarianten gäller alla.

## Deploy

Byggd under deployfrys (Kalmar 2026-08-12). **Deployas efter racet.**
Nuvarande fältversion (0.19.1) är säker: race-veckan är skyddad —
endast varningens synlighet är degraderad.

## Kvarvarande 0.19-kö

- **(b)** S2-hjälten + resterande varningstrappa + per-pass-händelser
- **(c)** §5d-verben i sheeten + Föreslå plats + comeback-grinden
- **(d)** cfg.rules-UI (avblockerar PLANLEVERANS §2)
