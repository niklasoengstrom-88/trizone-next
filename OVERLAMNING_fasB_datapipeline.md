# TRIZONE Next — överlämning till fas B: egen datapipeline

**Datum:** 2026-08-04 · **Från:** byggsession 0.2.0 → 0.9.4 · **Till:** ny session, fas B
**Uppdrag:** intervals.icu direkt in i Next. Förutsättningen för att pensionera v32.

---

## 1. Nuläge

**Deployat och verifierat: 0.9.4** på `niklasoengstrom-88.github.io/trizone-next/`.
366 kärntester + 139 röktester gröna. Skarp plan i drift (`plan.json`, planVersion
2026-08-03.1, 21 pass, v.32–35 2026). Första automatiska matchningen verifierad i drift
2026-08-03: måndagens löppass länkades tyst och märktes utfört utan handpåläggning.

**Vad appen gör idag:** läser plan från repot · placerar och justerar pass via drag and
drop · matchar mot aktiviteter och härleder utfört-status · visar dubbelremsa plan mot
utfall · kör regelmotorn med livslägen, frågor och varningar · loggar manuellt med RPE ·
Idag-vy med tillståndsberoende hjälte, veckostrip och månadsgardin.

**Vad den inte gör:** hämtar egen data. Aktiviteterna läses read-only ur v32:s
`trizone.cache.v1`. Det är fas B:s hela uppgift.

**Kalender:** 4:18:4 Kalmar onsdag 12 augusti (mål ~1:04:50). Sessioner nära loppet hålls
korta. Bas-blocket mot IM 70.3 Jönköping startar 7 september.

## 2. Kanoniska sanningar (oförhandlingsbara)

1. **Repot + byggstämpeln på enheten är enda sanningen.** Claudes arbetsfil är aldrig
   master, Claudes minne av koden är det aldrig heller. Sessionen börjar med uppladdade
   filer och verifierad ceremoni **innan** något ändras.
2. **Specarna styr.** Avsteg kräver produktägarens uttryckliga beslut och noteras i
   beslutslogg (BESLUT_*.md-mönstret).
3. **Varje verklig bugg blir permanent regressionsfixtur samma session.**
4. **Svitvakten `EXPECTED_MIN` rörs aldrig nedåt** utan dokumenterat skäl. Den finns för
   att fånga tyst avkortade sviter — det har hänt två gånger.
5. **Patchar mot exakta strängar med assert, aldrig regexmönster.** Regexkirurgi har ätit
   upp en händelsehanterare i den här sessionen.

## 3. Ceremoni per leverans

`node --check` på all JS · `node core_test.mjs` + `node ui_smoke.mjs` gröna ·
`node validate_plan.mjs plan.json` och `plan_ref.json` · stämpelbump i fem filer
(core.js, ui.js, index.html meta, sw.js BUILD + CACHE) · zip + kort sammanfattning av vad
som ändrats och vad produktägaren ska verifiera.

**`plan.json` i zippen är ALLTID den skarpa planen.** Testselen läser `plan_ref.json`.

## 4. Filer

| Fil | Innehåll |
|---|---|
| `core.js` | All logik, ren och testbar: validering, lagring (`makeStore`), veckovy, `manualAdjust`, dragmaskin, matchning, regelmotor (`applyRules`), Idag-logik, månadsvy, gardinreducer, cfg/bindningar, atletvakt |
| `ui.js` | DOM-koppling. Två vyer i naven (Idag · Plan) + Inställningar via personikon |
| `core_test.mjs` | 366 fixturer, egen mini-sele, `EXPECTED_MIN` |
| `ui_smoke.mjs` | 139 röktester, stubbad DOM + pekare + haptikinspelare + klippbord |
| `plan.json` | Skarpa planen · `plan_ref.json` testfixtur · `plan_broken.json` felfixtur |
| `validate_plan.mjs` | Ceremoni-CLI |
| `BESLUT_*.md` | 0.5.0 · 0.7.0 · 0.9.0 · 0.9.1 · 0.9.2 · 0.9.3 · 0.9.4 — beslut och incidenter |
| `FARDPLAN_rev2.md` | Faser A–H · multi-user D-M1…D-M3 |
| `INVENTERING_demo13_och_fardplan.md` | Demo v13 mot spec och byggd app |
| `PLANLEVERANS.md` | Kontrakt för coachdialogen |

## 5. Uppdraget: fas B

**Mål:** Next hämtar själv, v32-läsningen blir fallback och sedan avvecklad.

1. **Anslutning i Inställningar:** intervals.icu API-nyckel + athlete-ID, sparade i
   `trizone.next.cfg.v1` bredvid motorvärdena. Validering, kvotvakt, "Testa anslutningen".
   Nyckeln lämnar aldrig webbläsaren. v32 har bevisat att API:et går att anropa direkt
   från GitHub Pages utan proxy.
2. **Egen projektion** i egen nyckel `trizone.next.cache.v1` — Next bestämmer fälten,
   inklusive `icu_rpe` och `feel`. Kvotvakt på varje skrivning.
3. **Wellness + atletprofil:** vilopuls, HRV, sömn, zoner, benchmarks. Detta låser upp
   dagsform-chips, `sleep-guard`, formpelaren och full zonparitet.
4. **Full zonparitet (§7):** jämför intervals.icu:s faktiska zongränser mot appens
   antagande — inte bara zonvektorns längd som i dagens vakt.
5. **Fallback och avveckling:** v32-cachen läses bara när egen cache är tom. Nyckelstädning
   beslutas när v32 arkiveras, inte före.

**Utanför scope:** planöverblicken (fas E), designpasset (fas G), multi-user (efter 1.0).

## 6. Öppna poster

- **Månadsbläddring** begränsas till planens månader. Blir relevant med Bas-planen.
- **M-T-kalibreringen** (matchningströsklarna 70/45) väntar på veckor med både plan och
  utfall. Underlaget växer sedan 3 augusti.
- **Kalmar 12/8** ger testfallet sammanslagen multisportaktivitet mot ett pass — förväntas
  ge fråga, inte autolänk. Eventuell tävlingstyp beslutas efter observation.
- **Muskelgruppsdifferentiering** för `heavy-legs` parkerad: kräver passdata som
  planformatet inte bär.
- **Dubblettvarningar** rapporterade 2026-08-03, ej reproducerbara. Vakt + konsolvarning
  finns. Återkommer de: begär säkerhetskopia.
- **BESLUT-filerna** ska klistras in i specarnas beslutsloggar.

## 7. Startprompt

> Vi bygger fas B för TRIZONE Next: egen datapipeline mot intervals.icu. Bifogat:
> överlämningsdokumentet, produktionsfilerna (0.9.4) och beslutsdokumenten.
>
> Börja med ceremonin: verifiera stämpelparitet i de fem filerna, kör `node --check` på
> all JS, `node core_test.mjs`, `node ui_smoke.mjs` och `node validate_plan.mjs` på båda
> planfilerna — rapportera resultatet innan något ändras.
>
> Läs sedan överlämningens §5. Bygg i den ordningen: Anslutning i Inställningar med
> validering och test-knapp, egen cachenyckel med egen projektion, wellness och
> atletprofil, full zonparitet, fallback mot v32.
>
> Innan du skriver kod: sammanfatta kort din förståelse av (a) varför v32-läsningen ska
> avvecklas, (b) vad som ska ligga i cfg kontra cache, (c) hur fallbacken ska bete sig
> under parallellkörning, (d) vilka nya flaggor wellness låser upp — så att vi ser att
> kontexten sitter. Fråga där specen lämnar utrymme hellre än att anta.
>
> Leverans: alla tester gröna, stämpelbump i samtliga fem filer, zip. Jag deployar och
> verifierar paritetskortet.
