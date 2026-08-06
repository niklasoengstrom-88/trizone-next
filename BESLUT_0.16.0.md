# BESLUT 0.16.0 — blocks[].lowShare (beslut A, planformat P7)

**Datum:** 2026-08-06 · **Stämpel:** next-0.16.0 · 2026-08-06 · **Tester:** core 665 (var 634) · smoke 263 (var 259)

## Vad

Fasens 80/20-mål bor nu i planen: `blocks[].lowShare` (andel 0.5–0.95, valfritt).

1. **Hierarki block > profil > motorstandard.** `phaseLowShare(plan, {week|date}, cfg)` är enda upplösningsvägen — en sanning. Blockvärdet är coachens fasleverans; oenighet är planrevision, inte inställning. Nya rena funktioner: `blockForWeek`, `blockForDate`, `phaseLowShare`.
2. **`polarization` tiger på `test`/`race`-veckor** (via `weeks[].type`). Endast explicit veckotyp tystar — saknad vecka tystar aldrig. `recovery` behåller flaggan. `duration-drift` opåverkad (beslutets omfång).
3. **Måltexten bär sin källa** överallt: motorn säger *"(fasens mål, Skelettblock)"* vid blockkälla, inget suffix vid profilkälla; Analys-intensiteten säger *"Fasens mål 75 % (Skelettblock)"* eller *"Mål 78 % (profil)"*.
4. **Validering:** `validatePlan` avvisar lowShare utanför [0.5, 0.95] eller fel typ, med gränserna i felet. Ceremonikvittot i `validate_plan.mjs` redovisar fasmål per block (`fasmål: skelett 75 %` / `kal profil`).
5. **Spec- och kontraktsrevision:** planformat v0.3 → v0.4 (delta-dokument, P7 i beslutsloggen) + PLANLEVERANS.md kräver fasmål per block när fasen har ett medvetet mål. **Skarpa plan.json rörs inte** — fasvärdet för Bas levereras av coachdialogen i nästa blockleverans; appen skapar aldrig plandata.

## Verklig bugg funnen och fixad (permanent fixtur)

`renderAnalys` skickade `S.cfg` rakt in i `statusGrid`, men core-funktionerna läser `lowShareTarget`/`volumeCapPct` **platt** — de bor under `cfg.engine`. Profilens motorvärden nådde alltså aldrig Analys-griden; den jämförde alltid mot 78/110 %. (`swimHrValid` råkade fungera — toppnivå.) Fix: utplattning vid anropet. Regressionsfixtur i smoken: volymtak 180 % sparas i profilen → Belastnings-varför citerar "(180 %)". Röksvitens aktivitetsstub fick tre tysta historiklöpningar (utan zoner/distans/puls — rör aldrig intensitet, effektivitet eller matchning) så att 3-veckorssnittet finns att jämföra mot.

## Fixturer (31 core + 4 smoke)

- validatePlan: 0.75 ok · frånvarande ok · 1.4/0.3/sträng avvisas · gränser i felet · broken-planen 4 → 5 fel
- blockForWeek/Date: träff, okänd vecka, dag före start, dag efter slut
- phaseLowShare: block vinner över profil · fallback profil · ENGINE-default · datumväg = veckoväg · null-plan kraschar aldrig
- applyRules: blockets 75 % i texten + fasetikett · profil-fallback utan fasetikett (0.9.0-regeln lever) · race tiger · test tiger (v.44) · drift lever på race · vecka utanför planen tystar aldrig · flaggmerge intakt
- intensityStatus/statusGrid: fasmål med källa · profilmärkning · planen når griden
- Smoke: "Fasens mål 75 %" + "Skelettblock" i Analys · engine-utplattningen · aktivitetsantal 5 → 8

## Fixturplaner

`plan_ref.json`: skelett-blocket bär `lowShare: 0.75` (end-to-end-täckning i båda sviterna). `plan_broken.json`: `lowShare: 1.4` som femte fel. De två gamla "78 %/70 %"-fixturerna omskrivna att dokumentera nya hierarkin; profil-fallback har egen fixtur.

## Niklas verifierar efter deploy

1. Paritetskortet: next-0.16.0 i alla fem + `caches.keys()` = `trizone-next-0.16.0`
2. Analys → Intensitet utfälld: "Mål 78 % (profil)" (skarpa planen bär inget fasvärde än)
3. Analys → Belastning utfälld: volymtaket citerar **ditt** profilvärde, inte 110, om du satt eget
4. Inställningar → sätt Mål lågintensivt till t.ex. 70 → Analys-intensiteten följer (buggen som fixades)

## Öppet vidare

- Bas-leveransen (fas 3) ska bära `lowShare` per block — PLANLEVERANS uppdaterad, coachchattens bord.
- recovery-watch/katalogtaket (öppet beslut 2) — orört denna release.
