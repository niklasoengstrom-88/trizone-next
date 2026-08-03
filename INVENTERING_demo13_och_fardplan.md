# Demo v13 — inventering mot spec och byggd app · färdplan till v32-ersättning

**Datum:** 2026-08-03 · **Underlag:** trizone-next-demo-v13-1.html (1 770 rader, läst i sin helhet), spec 1–4, byggd app 0.7.0
**Syfte:** (1) säkerställa att demofasens lösta problem inte tappas, (2) fastställa vägen tills Next ersätter v32 i vardagen.

---

## Del 1 — Inventering

Kategorier: ✅ byggt (ev. vidareutvecklat med beslut) · 📘 i spec, obyggt · 🕳 **endast i demon** — kräver beslut · ❌ medvetet passerat

### Idag-vyn (demons mest genomarbetade yta — obyggd i Next)

| Demolösning | Status | Not |
|---|---|---|
| Tillståndsberoende hjälte: passkort normal dag / beslutskort vid avvikelse / "Klart för idag" / "Vila" / bläddring | 📘 spec3 §6 (lag) | Demons cockpitlogik är referensimplementationen |
| "Om inte?"-chips med exakt uppsättning: *Sov dåligt? · Känning? · Hinner inte?* | 🕳 | Spec säger "chips" — demon definierar vilka. **Ärvs.** |
| Bläddring: vald dag tar hjältepositionen + "Tillbaka till idag" | 📘 §6 | |
| Veckostrip med grenprickar (fylld = utfört, kontur = planerat) | 📘 §7 | |
| Utfälld månadsvy med veckonummerkolumn, bläddringsbar | 📘 §7 | |
| Formpelaren med lägesberoende text + flaggbanner "Hantera i Plan ›" | 📘 §7 | Kräver wellnessdata — fas 6 |
| **Manuell loggning**: modal med tid/puls/RPE/kommentar, "Markera utfört", "Missade passet" | 🕳 delvis | Matchningsspec §6 kräver manuell väg för pass utan mätdata. Overlay-schemat bär redan `rpe`/`userNote`. **RPE saknas helt i Next idag.** |
| Utfört-hjälte med kv-rad Tid/Snittpuls/RPE/Källa | 🕳 | Next visar duration+distans+remsa; metrikraden ärvs |
| Dagsform-chips på Idag (sömn/känning som togglar) | 📘 | Motorregler finns (sleep-guard, tissue-freeze) — UI saknas |

### Plan-vyn

| Demolösning | Status | Not |
|---|---|---|
| Planhero: fasband Bas→Taper med nu-markör, "X % av bygget", dagar till A-lopp | 🕳 | Inte i spec. Stark överblicksyta. **Beslut: ta med?** |
| Compliance-rad "X av Y pass utförda" per vecka | 🕳 | Enkel, värdefull. C-pass utanför nämnaren (spec-regel) |
| Intensitetsmätare lo/hi mot mål | ✅ | Byggd som lowShare-procent; mätargrafik kan ärvas i designpasset |
| Lopp-lista A/B med dagar kvar | 📘 planformat P1 | Kräver Sheet-läsning i Next — fas 5 |
| Livslägen-chips (Semester/Sjuk/Vabb) med cue-text | 📘 | Motorlägen finns testade — UI i fas 4 |
| Prognos: benchmark-låst, "låses upp av CSS-test v.44", mål som deklaration, spann | 🕳 | Husets filosofi förkroppsligad. **Efter 1.0** — v32:s BETA täcker tills dess |
| **"Lägg till pass"** (egeninlagt, räknas i 80/20, vaktat) | 🕳 | Spänner mot "appen skapar aldrig träning" — men det är användarens hand, inte motorns. **Beslut krävs.** |
| Omplanera-vyn (tryck pass → tryck slot) | ❌ | Ersatt av drag and drop i listan (beslut A+B) — bättre löst |
| "Föreslå plats" med motiverat förslag + acceptdialog | 🕳 | Bra brygga till motorns flyttlogik. Fas 4 |
| **Flyttvarning direkt vid släpp** (nivå 3-regler live: quality-spacing, heavy-legs) | 📘 | "Motorn varnar men du bestämmer." Fas 4 — viktig |

### Passdetalj

| Demolösning | Status | Not |
|---|---|---|
| brief/exec/goal/place i sektioner | ✅ 0.6.3 | |
| Dubbelremsa plan mot utfall + legend | ✅ 0.6.0 | |
| Utfall-kv-rad med RPE och källa | 🕳 | Med manuell loggning i fas 2 |
| "Varför just här?" **omräknad efter flytt** + ursprungsmotiv som fotnot | 📘 planformat §3 (`buildPlace`) | **Spec-skuld i byggd app:** vi visar bara statiskt ursprung. Fas 5 |
| "Ingrepp på detta pass" — händelselista per pass | 📘 P3 ("posten följer passet") | Loggen finns; per-pass-listan fas 4 |
| §5d-verben shorten/downgrade/substitute i åtgärdsraden | 📘 | API:t byggt och testat sedan 0.3.0 — UI saknas. Fas 4 |
| coachEval — regelgenererad utvärderingstext efter pass | 🕳 | Förgenererade mallar, aldrig LLM. **Beslut: ta med i fas 4?** |
| Badges Nedväxlat/Ersättning/Flyttat på kort | 📘 | Med motorns UI, fas 4 |

### Analys / Logg / övrigt

| Demolösning | Status | Not |
|---|---|---|
| Statusgrid 4 dimensioner (Belastning/Intensitet/Dagsform/Skaderisk) med signal + varför | 🕳 | Nexts arvtagare till v32:s flaggpanel. Fas 6 |
| Insiktsfördjupningar: benchmarktrend mot mål, belastning per gren mot tak, PMC, effektivitet | 🕳/📘 | "Grafen ritas aldrig av skattningar." Fas 6–7 |
| Grafer med beräknad rubrik + källrad | 📘 §7 | |
| Logg: utförda pass per dag med metriker | 🕳 delvis | Nexts Logg har händelser + utanför plan; utförda-listan fas 4 |
| Regellogg | ✅ 0.7.0 | |
| Auto-synk-knapp | ✅ överträffad | Next matchar automatiskt vid start |
| Serifväljare, demo-reset | ❌ | Experimentverktyg |

### Design/premium — gapet mot demons finish

Byggd app har rätt tokens (färger, zonramp, typsnitt) men saknar demons: ikonburen bottennav med versal-etiketter, header med wordmark+meta *(obs: strider mot T2 — löses annorlunda)*, vybytesanimationer (translateY+fade 380–420 ms), kortradie 20, max-width 640 centrerad, chips-formspråk. Niklas mål: **betydligt bättre än demon.** Dedikerat designpass som egen fas, med genomgång per vy.

---

## Del 2 — Färdplan till v32-ersättning

Princip: värde i vardagen först, motorn när verklig träning finns, datapipeline sist (v32 sköter hämtningen tills Next kan själv). Kalmar 12/8: korta sessioner loppveckan.

| Fas | Version | Innehåll | När |
|---|---|---|---|
| **1. Idag-vyn v1** | 0.8.0 | Hjälten enligt §6 med demons cockpitlogik: passkort-hjälte, utfört-tillstånd, vila, bläddring + "Tillbaka till idag". Veckostrip med grenprickar. **Manuell loggning** (tid/puls/RPE/notering) + "Markera utfört"/"Missade passet". Inga motorlägen ännu. | Nu — i drift före Kalmar |
| **2. Kalibrering** | 0.8.x | M-T-trösklar mot 243 aktiviteter, zonkonfig-paritet (§7), Kalmar-loppets matchning som tävlingsfixtur. Månadsvyn. | Direkt efter 12/8 |
| **3. Bas-planen** | — | Coachen levererar Bas-blocket via PLANLEVERANS-kontraktet. Ingen kod — generalrepetition av planbytesflödet (föräldralösa m.m.). | Slutet av augusti |
| **4. Regelmotorn i UI** | 0.9.0 | Den stora: dagsform-chips, livslägen med ögonblicksbild/ångra, beslutskortet S2 som hjälte, varningstrappan (§7), flyttvarningar vid släpp, missed-A/B-flöden, §5d-verben i panelen, "Föreslå plats", comeback-grinden, badges, per-pass-händelser. Motorn har 222+ tester och noll produktionstimmar — här möter den verkligheten. | September, i takt med Bas |
| **5. Planöverblick + Sheet** | 0.10 | Fasband/planhero, compliance, lopp-lista med Sheet-läsning i Next (första v32-oberoende datakällan), `buildPlace` runtime (stänger spec-skulden), ev. egeninlagda pass (beslut). | Oktober |
| **6. Egen datapipeline** | 0.11 | intervals.icu-hämtning i Next: aktiviteter, wellness, atletprofil/benchmarks. Egen cachenyckel, nyckelmigrering enligt eget beslut, v32-cacheläsningen avvecklas. **Förutsättningen för pension.** | Nov–dec |
| **7. Form/Analys** | 0.12 | Formpelaren + PMC (CTL/ATL/TSB), statusgrid, effektivitet — minsta mängd som ersätter v32:s NU/FORM-värde. | Vintern |
| **8. Designpasset** | 0.13 | Premiumfinish per vy: rörelse (View Transitions), ikonografi, tomma tillstånd, typografisk skärpa. Extern granskningsrunda som i demofasen. | Före 1.0 |
| **9. Ersättning** | 1.0 | Paritetsgenomgång mot v32:s funktionslista, parallellkörning en månad, v32 arkiveras läsbar. Prognosmodulen (benchmark-låst enligt demons modell) byggs **efter** 1.0. | Kring årsskiftet |

### Beslut som behövs av produktägaren (inte nu — vid respektive fas)

1. **Egeninlagda pass** (fas 5): med eller inte? Spänner mot "appen genererar aldrig träning".
2. **Fasband/planhero** (fas 5): ta med trots att den saknas i spec? (Min röst: ja.)
3. **coachEval** — regelgenererad utvärderingstext (fas 4): med?
4. **RPE-loggning i fas 1**: bekräfta att manuell loggning hör hemma redan i 0.8.0. (Min röst: ja — utan den är "Klart för idag" halvblind för styrka/teknikpass.)
