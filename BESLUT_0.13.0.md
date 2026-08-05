# BESLUT 0.13.0 — grafklass, wattbuggen, inforutan

**Datum:** 2026-08-05 · **Från:** 0.12.0 (deployad, fältverifierad) · **Tester:** 634 kärna · 259 rök

## Fältverifierad dubbelbugg: cykelwatten

0.12.0 uteslöt samtliga 34 spinningpass. Rotorsak i två lager:
1. **Fel fältnamn.** API:et skriver `device_watts` (v32:s fälttestade läsning, rad 2028). Koden läste `has_device_watts` — specens *begreppsnamn*, inte fältnamnet.
2. **Vitlistan strippade fältet.** `ACT_FIELDS` saknade `device_watts`, så även en korrekt läsning hade fått null ur cachen.

Båda lagren fixade, båda inhägnade: en fixtur låser att `effTrend` accepterar `device_watts`, en att projektionen bär fältet vidare. Utan den andra hade den första varit verkningslös — lärdomen är att en regressionsfixtur ska träffa **hela kedjan**, inte bara funktionen där symptomet syntes.

## Beslut

| # | Beslut |
|---|---|
| **E1** | **Inforutan ersätter vilopulskurvan** i Analys: Sömn 3 nätter · Vilopuls (baslinje) · HRV (baslinje) — v32:s modell, produktägarens uttryckliga preferens. |
| **E2** | **Tidsintervallväljare**: PMC 1M/3M/6M/Säsong · Effektivitet 3M/6M/Säsong. Fönstret filtreras i `effTrend` (ren funktion, `opts.from`), aldrig i vyn. |
| **E3** | **TSS-staplar per dag i grenfärg** under PMC-kurvorna (`dailyLoads`, ren funktion ur `icu_training_load`). |
| **E4** | **Tryckbara grafer**: dag i PMC och punkt i effektiviteten fäller ut detaljrad (datum · värden · TSS per gren resp. tempo/watt @ puls). Andra trycket fäller in. |
| **E5** | **Brick/race-taggen: ingen kodändring.** Matchningsspec §6 modellerar brick som pass-par — två pass, samma fönster. Race-veckans plan.json levererar brick som ETT cykelpass; kortet visar därför korrekt passets gren. Åtgärden ligger i nästa planleverans: brick = cykelpass A + löppass A. Då får löpdelen egen matchning och egen zonremsa gratis. |

## Grafanatomi (v29-lagen gäller)

Axeletiketter (min/max i grenens enhet), datumaxel (från/till), hårlinjer, trendlinje, punktdetalj med accentrygg. Ett koordinatsystem per axel; y-axeln vänds för tempo så uppåt alltid = bättre.

## Processincidenter — rotorsak identifierad

Arbetskatalogen muterades av främmande arbete tre gånger under dagen. Trolig rotorsak: **modellbyte/omgenerering mitt i tråden** — en parallell instans arbetar i samma katalog, dess turer syns inte i aktiv gren. Ceremonin (GitHub som master + verifiering från uppladdad zip) fångade samtliga fall. Processregler föreslagna i leveransmeddelandet.
