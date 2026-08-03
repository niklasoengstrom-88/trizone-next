# TRIZONE Next — färdplan rev 2

**Datum:** 2026-08-03 · **Ersätter:** Del 2 i INVENTERING_demo13_och_fardplan.md (Del 1, demoinventeringen, gäller oförändrad)
**Ändring mot rev 1:** egen datapipeline flyttad från fas 6 till fas 5 (närmast efter regelmotorn) · multi-user upphöjt från antagande till uttryckligt beslutsärende (D-M1…D-M3)

---

## Varför ändringen

Rev 1 lät Next läsa v32:s aktivitetscache genom hela bygget och byta källa först i näst sista fasen. Det var fel av tre skäl som alla blivit tydligare i drift:

1. **Färskhet.** Next visar bara vad v32 senast hämtade. När Next blir den dagliga appen blir v32 en syssla — att öppna den gamla appen för att den nya ska bli uppdaterad är en absurditet som växer för varje vecka.
2. **Ärvd trimning.** RPE-frågan är beviset: fältet finns i intervals.icu, men når bara Next om v32:s projektion råkar bära det. Vi ärver någon annans fältval utan insyn.
3. **Flaskhalsen.** v32 kan inte pensioneras förrän detta är löst. Allt annat arbete kan bli klart utan att målet nås.

Kostnaden att flytta fram är låg: `readActivityCache` läser redan *en aktivitetslista*, inte v32:s struktur. Byts källan byts bara påfyllningen — matchning, härledd status och dubbelremsa är oberoende.

---

## Faser

| Fas | Version | Innehåll | Beroende |
|---|---|---|---|
| **A. Regelmotorn i UI** | 0.9.0 | Dagsform-chips, livslägen med ögonblicksbild/ångra, beslutskortet S2 som hjälte vid avvikelse, varningstrappan (§7), flyttvarningar vid släpp, missed-A/B-flöden, "Föreslå plats", comeback-grinden. 312 tester möter verkligheten. | Ingen — kan börja nu |
| **B. Egen datapipeline** | 0.10 | **Anslutning** i Inställningar (API-nyckel + athlete-ID i cfg). Hämtning av aktiviteter, wellness och atletprofil direkt från intervals.icu. Egen cachenyckel `trizone.next.cache.v1`. Full zonparitet mot atletprofilens zoner (stänger §7-begränsningen). RPE/känsla från källan. v32-läsningen blir fallback, sedan avvecklad. **Förutsättningen för pension.** | Fas A |
| **C. Kalibrering** | löpande | M-T-trösklarna mot veckor där både plan och utfall finns. Underlaget växer sedan 3 aug — Kalmar 12/8 ger dessutom testfallet sammanslagen multisportaktivitet. | Kräver veckor, inte kod |
| **D. Bas-planen** | — | Coachen levererar Bas-blocket via PLANLEVERANS. Ingen kod — generalrepetition av planbytesflödet. | Slutet av augusti |
| **E. Planöverblick + Sheet** | 0.11 | Fasband/planhero, compliance-rad, lopp-lista med Sheet-läsning, `buildPlace` i runtime (stänger spec-skulden), ev. egeninlagda pass (beslut). | Fas B |
| **F. Form/Analys** | 0.12 | Formpelaren, PMC (CTL/ATL/TSB), statusgrid, effektivitetstrender — minsta mängd som ersätter v32:s NU/FORM-värde. | Fas B (wellness) |
| **G. Designpasset** | 0.13 | Premiumfinish per vy: rörelse (View Transitions), ikonografi, tomma tillstånd, typografisk skärpa. Extern granskningsrunda. | E, F |
| **H. Ersättning** | 1.0 | Paritetsgenomgång mot v32:s funktionslista, parallellkörning en månad, v32 arkiveras läsbar. Prognosmodulen byggs **efter** 1.0. | Allt ovan |

---

## Fas B i detalj — vad som faktiskt ska byggas

**Hämtning.** v32 har bevisat att intervals.icu:s API går att anropa direkt från GitHub Pages utan proxy. Nyckel och athlete-ID bor i `trizone.next.cfg.v1` bredvid livsschemat — samma nyckel, samma validering, samma backup. Nyckeln är användarens egen och lämnar aldrig webbläsaren.

**Egen projektion.** Next bestämmer själv vilka fält som sparas, inklusive `icu_rpe` och `feel`. Kvotvakt på varje skrivning som allt annat.

**Nyckelmigrering.** `trizone.next.cache.v1` är egen nyckel — v32:s rörs aldrig. Under parallellkörning finns båda; v32-läsningen blir fallback när egen cache är tom, och avvecklas vid 1.0. Beslut om städning av v32:s nycklar tas när v32 arkiveras, inte före.

**Zonparitet, full version.** Med atletprofilen läst direkt kan appen jämföra intervals.icu:s faktiska zongränser mot sina antaganden — inte bara zonvektorns längd som i 0.8.1. Det stänger den kända begränsningen i §7-vakten.

**Setup-guiden ärvs.** v32:s Hjälp & Setup är fälttestad på användare #2 och ska följa med, förbättrad — den är en del av multi-user-svaret.

---

## Multi-user — uttryckligt beslutsärende

Rev 1 antog att fler användare "följer på köpet" när pipelinen byggs. Det stämmer inte. Hämtningen är den lätta delen; **planleveransen är den svåra.**

### Problemet

`plan.json` är en fil i repot. Planformat-specens beslut **P1** slår fast att repovägen *är* synken — alla enheter läser samma källa — och förkastar uttryckligen importfilen eftersom den skapar per-enhet-planer. Det fungerar för en atlet. Med två blir frågan: var bor Davids plan?

### D-M1 — Plan per atlet

| Alternativ | Innebörd | Konsekvens |
|---|---|---|
| **(a) Fil per atlet i repot** | `plans/niklas.json`, `plans/david.json`; atlet väljs i Inställningar (planens `athlete`-fält finns redan) | Behåller P1 obrutet: repot är synken, valideringsceremonin gäller. Kostnad: Niklas deployar även Davids planer |
| **(b) Import via urklipp/fil** | Planen levereras som veckopatcharna | Bryter P1 — per-enhet-planer, ingen synk mellan Davids telefon och surfplatta. Kräver specrevision |
| **(c) Egen deploy per atlet** | David får eget repo/fork | Renast isolering, dyrast underhåll: varje kodleverans måste deployas två gånger |

**Min röst: (a).** Den respekterar ett fattat beslut, kräver minst ny mekanism och kostar bara att en fil till commitas. Ceremonin — `validate_plan.mjs` före commit — gäller då även Davids planer, vilket är en fördel, inte en börda.

### D-M2 — Vad som är per atlet i lagringen

Bindningar (livsschema, regelbindningar, skadehistorik) och overlay är redan per webbläsare, och två personer delar inte enhet. Ingen nyckelseparation behövs — **men** appen måste vägra läsa en plan vars `athlete` inte matchar profilens, annars kan fel plan tyst laddas efter ett atletbyte. Liten vakt, viktig.

### D-M3 — När

**Min röst: arkitekturberedskap i fas B, skarp multi-user efter 1.0.** Konkret: fas B bygger Anslutning så att vilken atlet som helst kan ansluta sin egen nyckel, och D-M1 avgörs innan pipelinen skrivs så att planvägen inte behöver rivas upp. David stannar på v32 tills Next är i paritet — att sätta en halvfärdig app i händerna på användare #2 kostar mer förtroende än det ger återkoppling.

---

## Beslut som väntar

| # | Fråga | Fas | Min röst |
|---|---|---|---|
| **D-M1** | Plan per atlet: repo-fil, import eller egen deploy | före B | (a) fil per atlet i repot |
| **D-M2** | Atletvakt vid planläsning | B | ja |
| **D-M3** | När multi-user blir skarpt | efter 1.0 | efter 1.0 |
| Egeninlagda pass | Spänner mot "appen genererar aldrig träning" | E | — |
| Fasband/planhero | Saknas i spec, stark yta i demon | E | ja |
| coachEval | Regelgenererad utvärderingstext | A | — |
