# BESLUT 0.10.0 — fas B: egen datapipeline mot intervals.icu

**Datum:** 2026-08-05 · **Från:** 0.9.4 · **Tester:** 517 kärna (från 366) + 208 rök (från 139)

---

## Produktägarbeslut fattade denna session

| # | Fråga | Beslut |
|---|---|---|
| **B1** | Cachestruktur | **En nyckel** `trizone.next.cache.v1` med tre sektioner (aktiviteter, wellness, atletprofil). De hämtas i samma svep, delar färskhet och hör ihop; tre nycklar hade gett tre kvotpunkter utan vinst. Skrivningen är **degraderande**: vid kvotfel trimmas historiken bakifrån och skrivningen görs om, hellre än allt-eller-inget. |
| **B2** | Historikfönster | **370 dagar**, som v32. Hela säsongen ska vara jämförbar. Justerbart 30–400 i Inställningar. |
| **B3** | API-nyckeln i backup | **Exkluderas.** En hemlighet är inte en inställning; kopior hamnar i mail och molnmappar. athlete-ID och historikfönster följer med — de är inte hemliga. Kostnaden är en inklistring per ny enhet. |
| **B4** | Zonsanningen | **intervals.icu-profilen ÄR zonsanningen.** Appen läser, redovisar granskningsbart i Inställningar och varnar vid avvikelse — men justerar aldrig. Ett eget zonregister vore den andra sanningskälla specarna förbjuder (F3). |
| **B5** | Wellness → motorn | **Alternativ C: två signaler, två roller.** Dagssignal (senaste mätning mot egen 30-dagarsmedian) matar `sleep-guard` som nivå 1 derived ⇒ motorn frågar. Trendsignal (v32:s modell oförändrad) matar `recovery-watch` som nivå 3 ⇒ varnar bara. |
| **B6** | Sömntröskel | **Relativ mot egen baslinje**, aldrig absolut. v32:s 6,2 h hade fyrat halva året för en småbarnsförälder, och en nivå 1-regel man lärt sig klicka bort är sämre än ingen regel. Tröskel: 1,5 h under egen median. |
| **B7** | Synk-kadens | Auto vid boot efter första ritningen, spärr 15 min · manuell "Uppdatera nu" · "Testa anslutningen". Offline ⇒ cachen gäller, med hämtningstidpunkt redovisad. |

| **B8** | Simpuls | **`swimHrValid` byggd** (matchningsspec §3, tidigare spec-skuld). Default av. Slås på i Inställningar när simdugligt bröstband finns; då renderas simremsan och zonpariteten granskar simmens pulszoner som alla andras. Simoffset byggs **inte** nu — beslutas när flaggan faktiskt slås på och verkliga simpulsvärden finns att jämföra. |

## Spec-avsteg som kräver stämpel

**A1 — regelkatalogens tak.** Regelverk §6: *"kärnkatalogen håller sig under 15 regler."* Med `recovery-watch` går katalogen från 14 till **15** — på taket, inte under. Alternativen var: revidera §6, slå ihop med `rpe-watch`, eller låta trendsignalen bara vara en rad i Data-sektionen utan att vara motorregel.

**Byggt enligt:** regeln behållen, §6 föreslås revideras till "högst 15". **Ej stämplat av produktägaren.** Rullas tillbaka på begäran — `recovery-watch` är isolerad till en `lvl3.push` i `applyRules` och en gren i `wellnessFlags`.

## Buggar hittade och permanent inhägnade

**1. Simundantaget saknades i zonpariteten.** Första versionen av `zoneParityFull` krävde pulszoner för alla grenar. Sim har per matchningsspec §7 ogiltig pulsdata (optisk handledspuls i vatten) — kravet hade gett ett permanent falskt larm som aldrig gick att åtgärda. Sim och styrka undantas nu. Två fixturer låser beteendet.

**2. Röksviten saknade svitvakt.** Kärnsviten fick `EXPECTED_MIN` efter incidenten 2026-08-02; röksviten fick den aldrig. Nu har båda.

**3. Simpulsflaggan var spec-skuld.** Matchningsspec §3 beslutade `swimHrValid` redan i v0.2; den var aldrig byggd, och undantaget låg hårdkodat i två filer. Nu är det en profilinställning, inhägnad av 9 kärnfixturer och 8 röktester.

**4. Stämpeltestet krävde handpåläggning.** Röktestet hårdkodade `next-0.9.4` och blev rött av bumpen. Det läser nu `UI_BUILD` ur koden och verifierar pariteten separat — testet fångar bruten paritet i stället för att vara en påminnelselapp.

## Nytt i core.js

`ICU` · `validateConn` · `connReady` · `icuRequest` · `proxyAllowed` · `icuError` · `CACHE_VERSION` · `emptyCache` · `trimCache` · `projectActivities` · `projectWellness` · `projectAthlete` · `benchmarksOf` · `pickActivitySource` · `zoneParityFull` · `RECOV` · `recovery` · `wellnessFlags` · `DEFAULT_CFG.swimHrValid` · `V32_CACHE_KEY` · `KEYS.cache` · `DEFAULT_CFG.conn` · `makeStore.{loadCache, saveCache, clearCache}`

**Ändrat:** `validateCfg` validerar `conn` · `backupExport` strippar `apiKey` · `applyRules` känner `recovery-watch` · `sleep-guard`-frågan bär sin härledda orsak.

**Orört:** `zoneDist`, `matchScore`, `assignMatches`, `applyRules` övriga regler, `weekView`, `dragReduce`, `manualAdjust`, `rollup`-ekvivalenterna.

## Säkerhet — verifierad i kod, inte i kommentar

- `proxyAllowed(headers)` returnerar `false` för allt som bär `Authorization`. `icuFetch` **stoppar anropet** om vakten inte håller. v32:s regel ärvd oavkortad.
- Nyckeln går i header, aldrig i URL — låst av fixtur.
- Nyckeln finns inte i säkerhetskopian — låst av fixtur som söker igenom hela JSON-strängen.
- Nyckeln skrivs i lösenordsfält.

## Kvarstående

- **Fältverifiering återstår.** Nätet är avstängt i byggmiljön; `icuRequest` är testad till sista tecknet men första riktiga anropet är produktägarens. Därför pekar felmeddelandena på rotorsak (401 nyckel · 403/404 athlete-ID · 429 väntan · 5xx cachen gäller).
- **M-T-kalibreringen** kan nu köras mot egen historik i stället för v32:s trimning.
- **v32-avvecklingen:** fallbacken är på plats. Nyckelstädning beslutas när v32 arkiveras, inte före.
- **Formpelaren/PMC** (fas F) har nu sin datakälla — `ctl`/`atl` följer med i wellnessprojektionen.
