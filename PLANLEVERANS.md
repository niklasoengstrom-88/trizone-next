# PLANLEVERANS — kontrakt för coachdialogen

**Gäller:** TRIZONE Next ≥ 0.6.1 · planformat-spec v0.3 + beslut A (2026-08-02)
**Läses av:** coachprojektet när Bas-blockets `plan.json` genereras (aug 2026), och varje blockleverans därefter.
**Regel:** planen genereras i coachdialogen, appen konsumerar den. Detta dokument är appens krav — avsteg valideras bort.

## Leveransflöde (obligatoriskt, planformat §4)

1. Generera komplett `plan.json` (hela filen, aldrig ett fragment — gamla block ligger kvar i filen).
2. Kör `node validate_plan.mjs plan.json` — **grönt före commit, inga undantag.**
3. Ny `planVersion` per leverans: `"ÅÅÅÅ-MM-DD.n"` (datum + löpnummer). Historiken i `changelog` skrivs aldrig om — ny rad läggs till.
4. Niklas deployar enligt husets ceremoni. Appen hämtar network-first och stämmer av överlagringar; pass-id som försvunnit blir föräldralösa poster som Niklas beslutar om i appen.

## Schema (formatVersion 1)

```json
{
  "formatVersion": 1,
  "planVersion": "2026-08-31.1",
  "generated": "2026-08-31",
  "athlete": "niklas",
  "anchor": { "raceId": "jonkoping-703-2027" },
  "blocks":  [ { "id": "bas", "label": "Bas", "start": "2026-09-07", "weeks": 14, "lowShare": 0.80 } ],
  "weeks":   [ { "week": 37, "iso": "2026-W37", "block": "bas", "type": "normal",
                 "focus": "…" } ],
  "sessions": [ … se nedan … ],
  "changelog": [ { "planVersion": "2026-08-31.1", "note": "Bas v.37–40" } ]
}
```

- `weeks.type`: `normal | recovery | test | race`. Återhämtningsvecka är plan, inte hål — leverera den.
- Blockstart är måndagsdatum; `weeks.iso` måste stämma med kalenderveckan.
- **`blocks[].lowShare` (v0.4, beslut P7):** fasens 80/20-mål som andel 0.5–0.95 (t.ex. Bas `0.80`, Build `0.75`). Valfritt — frånvaro betyder att Niklas profilvärde gäller — men **leverera det per block när fasen har ett medvetet mål**: blockvärdet vinner över profilen och är coachens kanal för fasstyrning. `polarization` tiger automatiskt på `test`/`race`-veckor; leverera aldrig ett sänkt lowShare som ersättning för rätt veckotyp.

## Pass

```json
{ "id": "basw3-run-thr",
  "week": 39, "day": 3, "slot": "Kväll",
  "sport": "run", "prio": "A", "protected": false,
  "title": "Löpintervaller 4×6 min tröskel",
  "durationMin": 50,
  "profile": [[1,12],[4,6],[1,2],[4,6],[1,2],[4,6],[1,2],[4,6],[1,8]],
  "text": { "brief": "…", "exec": "…", "place": "…", "goal": "…" } }
```

**Hårda krav (valideras):**
- `id`: `{block}w{veckonr-i-block}-{gren}-{typkod}`, unikt, stabilt över planversioner. Byter passet gren eller typ ⇒ **nytt id** (gamla överlagringar blir föräldralösa med avsikt). Ändras bara duration/profil ⇒ id behålls.
- `sport`: `run | bike | swim | strength` · `prio`: `A | B | C` · `day`: 0=mån … 6=sön eller uteslutet · `slot`: `Morgon | Lunch | Kväll` eller uteslutet.
- `profile`: segment `[zon 1–5, minuter > 0]`, summan = `durationMin` ± 2.
- `title` krävs i praktiken (vyn bygger på den) — kort, ingen punkt.

**Beslut A (viktigt, nytt sedan spec v0.3):** `slot` är **metadata, inte kontrakt**. Appens placering sker per dag; fönstret visas som upplysning i passdetaljen och nollställs när Niklas flyttar passet. Leverera `slot` när det finns ett genuint fysiologiskt motiv (t.ex. kvalitet ej morgon efter styrkekväll), annars uteslut det. `day` är och förblir ett förslag.

**Menyleverans:** pass får levereras utan `day` — de hamnar i veckans "Att placera" och Niklas placerar själv. Detta är normalläget snarare än undantaget: veckan omplaneras 1–3 ggr/vecka i praktiken.

**Prioriteter:** `A` skyddas och flyttas av regelmotorn · `B` stryks vid behov, jagas aldrig · `C` är bonus — flaggas aldrig, räknas inte i följsamhet. Prehab/rehab markeras `protected: true` oavsett prioklass (funktion före klass).

## Texter

- Förgenererade vid planläggning, aldrig runtime. Renderas i textkanalen (serif).
- **Hälsoneutrala — repot är publikt.** "Skyddspasset" är tillåtet; diagnoser, skadehistorik och bindningsorsaker är det inte (de bor i profilen, spec 1 §5b).
- `place` är ursprungsmotivet för placeringen; appen visar det som upplysning.

## Vad coachdialogen INTE gör

- Skriver aldrig `bindings` (trösklar, ersättningsgrenar, orsakstexter) — de bor i atletprofilen i appen.
- Levererar aldrig veckovolymmål som egna siffror — volym är summan av passen (en sanning).
- Ändrar aldrig historiska `changelog`-rader eller återanvänder `planVersion`.
- Innehållsändring av en enskild vecka utan blockleverans = **veckopatch** (planformat §5b), via urklipp — inte en ny plan.json-deploy.
