# TRIZONE Next — Överlämning från fas B-tråden (0.9.4 → 0.15.0)

**Datum:** 2026-08-06 · **Från:** datapipeline- och analystråden · **Till:** nästa byggsession
**Deployat och fältverifierat läge:** **0.15.0** — hela pipelinen mot intervals.icu i drift, Analys-vyn komplett med statusgrid, PMC och effektivitet.

---

## 1. Vad denna tråd levererade

| Version | Innehåll |
|---|---|
| **0.10.0/0.10.1** | Fas B komplett: anslutning i Inställningar (`validateConn`/`connReady`/`icuRequest`/`proxyAllowed`/`icuError`), egen cachenyckel `trizone.next.cache.v1` (en nyckel, tre sektioner, degraderande skrivning), projektioner (`projectActivities` inkl. `icu_rpe`/`feel`, `projectWellness`, `projectAthlete`, `benchmarksOf`), fallback `pickActivitySource` (egen cache vinner, v32 read-only när egen är tom), full zonparitet `zoneParityFull`, wellness → motorn (**alternativ C**: dagssignal → `sleep-guard` nivå 1 frågar · trendsignal → `recovery-watch` nivå 3 varnar, allt mot egen 30-dagarsbaslinje), API-nyckeln strippas ur backup. 0.10.1: leveransvakt efter stämpelincident. |
| **0.11.0** | Analys-vyn: statusgrid 4 dimensioner (Belastning/Intensitet/Dagsform + Skaderisk som ärlig platshållare utan statusfärg — fylls i fas 4). `weeklyLoad`, `loadStatus`, `intensityStatus`, `formStatus`. |
| **0.12.0** | PMC (`pmcSeries`/`pmcStatus` — CTL/ATL färdiga från intervals.icu, **räknas aldrig om**, TSB enda härledningen) + aerob effektivitet (`effTrend`, `zoneBand` — pulsfönster **härledda ur atletprofilens zongränser**, Z2/Z3-växling). |
| **0.13.0** | Fältverifierad **dubbelbugg** fixad: API-fältet heter `device_watts` (inte `has_device_watts`) OCH vitlistan strippade fältet — 34 spinningpass försvann. Tidsintervallväljare, TSS-staplar i grenfärg, tryckbara grafer, v32:s inforuta (Sömn 3 nätter · Vilopuls · HRV mot baslinje). |
| **0.14.0** | Grafernas premiumpass; vilopulskurvan borttagen (ersatt av inforutan). |
| **0.15.0** | Geometrin gjord rätt: **ett koordinatsystem** (dagcellens mitt) för linjer/staplar/guide/tryckytor — v29-buggen hade återfötts och är nu utrotad med den insikten. **Pixeltrogna viewBoxar** (demons modell) — cirklar är cirklar. Staplar integrerade i kurvornas rum, kurvmarkörer vid vald dag. |

**Testläge:** `core_test.mjs` **634** · `ui_smoke.mjs` **259** · båda med svitvakt (`EXPECTED_MIN`). Varje verklig bugg har permanent fixtur, inklusive device_watts-kedjan i **båda** lagren (effTrend + projektion).

## 2. Kanoniska sanningar (oförändrade + ett tillägg)

1. **Repot är master.** Varje session börjar med uppladdad zip från repot, verifieras med stämpelparitet + `node --check` + hela sviterna **innan** något ändras.
2. **Varje zip får eget patchnummer** — även enradsfixar. En stämpel är förbrukad när den lämnat verkstaden (0.10.0-incidenten: två leveranser, samma stämpel, sw:n serverade blandad kod).
3. **G1 (nytt, produktägarbeslut):** specarna styr **arkitektur och kontrakt**; **demo v13 styr uttryck och interaktion**. Vid konflikt om uttryck vinner demon, om inte spec 3 uttryckligen låst punkten (t.ex. T2). **Allt UI-arbete börjar med att läsa demons motsvarande yta.** Demon ligger i projektkunskapen.
4. **Byt aldrig modell mitt i en byggsession.** Tre kontamineringsincidenter i denna tråd hade samma rotorsak: modellbyte/omgenerering kör en parallell instans i samma arbetskatalog; dess filändringar ligger kvar, dess svar syns inte i aktiv gren. Har byte/omgenerering skett: säg det, ceremonin körs om före allt annat.
5. **En release per tråd** är målbilden. Denna tråd tog åtta — det var för många.

## 3. Nyckelinventarium (0.15.0)

- **localStorage:** `trizone.plan.v1` · `trizone.overlay.v1` · `trizone.next.cfg.v1` (inkl. `conn`, `swimHrValid`) · `trizone.next.cache.v1` (v1, tre sektioner + fetched-stämplar). v32:s `trizone.cache.v1` läses read-only endast som fallback, skrivs aldrig.
- **Anslutning:** Basic-auth `API_KEY:nyckel`, direktanrop (auth proxas ALDRIG — `proxyAllowed` vaktar i kod), historik 370 dgr, auto-synk vid boot med 15-min-spärr, nyckeln aldrig i backup.
- **Fältregler, oförhandlingsbara:** watt kräver `device_watts === true` (eller `has_device_watts`); löpband blandas aldrig med GPS; sim väljs på distans, aldrig puls; `swimHrValid` default av (sim-LTHR i intervals.icu ärver löpningens 173 — **sätt eget värde innan flaggan slås på**).
- **Verifierade benchmarks i drift:** FTP 262 · löptröskel 5:25/km (coachkorrigerad juli) · CSS 2:04/100 m · LTHR löp 173 / cykel 166 (166 är coachens uppskattning, riktigt värde efter 4:18:4).

## 4. Öppna beslut och skulder — nästa tråds bord

1. **`blocks[].lowShare`** — beslutad (alternativ A: blocknivå, profilvärdet fallback; `polarization` tiger på test-/race-veckor via `weeks[].type`). **Obyggd.** Kräver revision av planformat §3 + rad i `validate_plan.mjs` + Analys visar "Fasens mål: X % (fas)". Föreslaget första ärende.
2. **`recovery-watch`** sätter regelkatalogen på **15** mot regelverk §6:s "under 15". Byggd, grön, **ostämplad**. Alternativ: revidera §6 till "högst 15" (utvecklarens röst) · slå ihop med `rpe-watch` · degradera till Data-rad.
3. **Brick som pass-par:** race-veckans plan.json levererar brick som ETT cykelpass; matchningsspec §6 modellerar brick som TVÅ pass. Åtgärd i **nästa planleverans** från coachchatten, ingen kod.
4. **Fördjupningsvyer** per statusgrid-dimension (demons Belastning/Dagsform/Effektivitet-fördjupningar) — byggs från demon enligt G1.
5. **Fas 4 — regelmotorn i UI** (färdplanens stora post, september): beslutskortet S2, varningstrappan, dagsform-chips, livslägen med ångra, §5d-verben, "Föreslå plats", comeback-grinden. **Byggs direkt från demons cockpit**, inte från spec-prosa. Motorn har 634 tester och noll produktionstimmar i UI.
6. **Kalmar 12/8** = andra kalibreringspunkten för prognosmodellen (v32) + M-T-tröskelkalibrering mot egen historik + tävlingsfixtur för matchningen. Sessioner före loppet hålls korta.
7. Setup-guiden och coach-instruktionerna är fortsatt daterade (v32-skuld, ärvd).

## 5. Filer att bifoga vid sessionsstart

1. Denna överlämning
2. `trizone-next-0.15.0.zip` (nedladdad från **repot**, inte från chatten)
3. Vid behov: BESLUT_0.10.1 → 0.15.0 (ligger i zippen och bör in i projektkunskapen)

Specarna, demon (`trizone-next-demo-v13-1.html`), INVENTERING och v32-överlämningen finns i projektkunskapen.
