# TRIZONE Next 0.9.0 — beslut och specnoteringar (2026-08-03)

## D-M1 (avgjord): en atlet, en plan.json
Ingen multi-user-rörmokeri byggs nu. Vägen mot fil-per-atlet i repot hålls öppen
genom atletvakten nedan — inga antaganden om enatletsdrift bakas in i datavägen.

## D-M2 (byggd): atletvakt
`athleteGuard(plan, cfg)` jämför planens `athlete` mot profilens. Fel atlet ⇒ planen
laddas INTE, och paritetskortet säger vilka två namn som krockar. Tom profil adopterar
planens atlet vid första läsningen. Plan utan `athlete`-fält ⇒ vakten vilar (äldre planer
bryts aldrig).

## P2 fullföljd: uppsättningen är data, inte kod
`cfg.engine` överstyr ENGINE-defaults, validerat mot vitlistan `ENGINE_FIELDS` med
deklarerade gränser. Redigerbart i Inställningar → Motorvärden. Fem värden öppna:
mål lågintensivt (default 78 %), löpvolymtak (110 %), Z2-pass före kvalitet efter
sjukdom (2), kortaste pass vid nedkortning (20 min), underhållsdos i semesterläge (60 %).
Okänt fält eller värde utanför gräns avvisas — konfigurationen kan aldrig skrivas trasig.

**Rättad defekt:** trösklarna 78/110/125 låg som literaler i meddelandetexterna. Ändrade
man tröskeln ändrades beteendet men inte texten — motorn ljög om sin egen gräns. Texterna
läser nu cfg. Permanent fixtur.

## Regressionsbugg funnen och fixad: öppna lägen
`sessionInSpan` jämförde mot `to`, och `to` är null när ett läge saknar slutdatum — det
normala fallet för Sjuk och Känning. Läget aktiverades, loggades, syntes i UI och gjorde
ingenting. Nu gäller läget till det hävs (OPEN_END-sentinel). Tre fixturer.

## Motorn i gränssnittet
- **Livslägen** som chips i Plan (Semester · Reducerad vecka · Sjuk · Känning). Aktivering
  tar ögonblicksbild; avaktivering återställer exakt — utom pass användaren själv ändrat
  under lägets gång, som behåller sin version (§9). Verifierat i röktest åt båda håll.
- **Motorn frågar** (D2): derived-triggers blir frågekort med Ja/Nej. Nej rör aldrig planen.
- **Varningstrappan** (§7): nivå 3-varningar som kvarstående banner med kvittens. Nivå 3
  ändrar aldrig planen.
- **Flyttvarning vid släpp:** motorn körs mot det tilltänkta läget före skrivning; träffar
  en nivå 3-regel visas den i kvittensen. Flytten genomförs ändå — du bestämmer.
- **Lägesrad på Idag** när något läge är aktivt.

## Medvetet utelämnat
Wellness-baserade flaggor (RHR, HRV, sömn) kräver egen datapipeline — inga låtsasflaggor
byggs på data appen inte har. `engineFlags()` härleder idag endast `rpe-watch` ur verklig
RPE. Dagsform-chips på Idag väntar därför till fas B, liksom "Föreslå plats".
