# BESLUT 0.19.1 — Utförda pass, race-vakt, toast-timeout

**Datum:** 2026-08-11 · **Stämpel:** `next-0.19.1 · 2026-08-11`
**Testläge:** core 759 (svitvakt 759) · smoke 334 (svitvakt 334)
**Produktägarbeslut:** Niklas 2026-08-11, efter enhetsverifiering av 0.19.0.

---

## B19-3 — Motorn riktar aldrig en åtgärd mot ett utfört pass

**Beslut (generaliserar B19-2 till hela motorn):** Livslägen, dagsform,
missed och volume-cap riktar endast åtgärder mot pass med status `planned`.
Utförda pass är historia — ändring korrumperar utfall-mot-plan.
Detta gäller även VARNINGAR: strukturvarningar (quality-spacing,
heavy-legs) riktas aldrig mot ett utfört pass — vägledning om det redan
skedda är brus.

**Undantag:** utfallsflaggor. `rpe-watch` fyrar per definition på ett
loggat (utfört) pass men talar om återhämtning inför NÄSTA kvalitetspass,
inte om att ändra det utförda. Den är uttryckligen undantagen och
fixturlåst.

**Nyans:** ett utfört pass är fortfarande DATA. quality-spacing använder
det som kontext (gårdagens genomförda tröskelpass räknas mot dagens
planerade), men varningen landar alltid på det planerade passet.

**Genomförande:** central `isPlanned`-vakt i applyRules, tillämpad i
illness-stop, tissue-freeze, mode-vacation, mode-reduced, illness-rampback,
missed, volume-cap samt nivå 3-strukturreglernas mål. sleep-guard fick
vakten redan i B19-2.

## B19-4 — Lägen och dagsform rör aldrig race-pass

**Beslut:** pass i veckor med `type: "race"` ägs av atlet + coach i separat
dialog. Motorn ändrar dem aldrig:

- **tissue-freeze, mode-vacation, mode-reduced, sleep-guard,
  illness-rampback, volume-cap:** tyst skip — ingen åtgärd, ingen ändring.
- **illness-stop:** race-passet stryks ALDRIG tyst. I stället varning
  (nivå 1, warn): *"Sjukdom över tävling: racets upplägg ändras bara i
  dialog med coach."* Övriga (icke-race) pass i sjukspannet stryks som
  vanligt.
- **missed:** race-pass flyttas/stryks aldrig; svarar med
  *"Tävlingspass hanteras i dialog med coach — motorn rör det inte."*

**Avgränsningsval — veckotyp, inte passmarkering:** race-pass identifieras
via `week.type === "race"`, samma nyckel som redan tystar polariserings-
regeln. Det skyddar även öppningspass/shakeout i race-veckan — medvetet:
race-veckans upplägg som helhet är coachterritorium. Alternativet
(session-fältet `race: true`) kräver planformatsrevision och coachleverans-
ändring; det tas först om ett race någonsin landar utanför en race-vecka.
Användarens HAND är orörd av vakten — manuell justering vinner alltid,
även i race-vecka.

**Redan i 0.19.0 verifierat i fält:** aktiva livslägen påverkade inte
racet i innevarande race-vecka — då delvis tur (polariseringstystnad +
grenbindning). Nu är det en garanterad invariant med fixturer.

## Toast-timeout (S25-fynd, bugg)

**Fyndet:** kvittens-toasten (`S.note`) saknade timeout helt — den nollades
först vid nästa tryck och låg annars kvar över kromet obegränsat.
(Rapporterad som "paritetskortet ligger kvar"; Bygge-kortet i Inställningar
är statiskt och kan inte ligga kvar — tolkningen är kvittensen. Bekräfta
om annat avsågs.)

**Beslut:** ok-toaster släcker sig själva efter 4,5 s. FELtoaster (bad)
ligger kvar tills nästa interaktion — ett fel ska inte kunna blinka förbi
oläst. Samma note-objekt startar aldrig om sin klocka vid omrendering.
Rökfixtur med tidsstyrning (`__TZ_TOAST_MS`).

## Kvarvarande 0.19-kö

- **(b)** S2-hjälten + varningstrappan + per-pass-händelser — nästa
- **(c)** §5d-verben i sheeten + Föreslå plats + comeback-grinden
- **(d)** cfg.rules-UI (avblockerar PLANLEVERANS §2)

## Öppna frågor på produktägarens bord

- Regelverksspecen §9: B19-3/B19-4-principerna bör skrivas in i spec 1 vid
  nästa revision (texten här är beslutslogg, specen är lagbok).
- Feltoasters livslängd: "ligger kvar tills interaktion" är mitt val —
  ändra om det skaver i fält.
