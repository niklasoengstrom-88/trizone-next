# BESLUT 0.11.0 — Analys: statusgriden

**Datum:** 2026-08-05 · **Från:** 0.10.1 · **Tester:** 565 kärna · 232 rök

---

## Beslut

| # | Fråga | Beslut |
|---|---|---|
| **C1** | Analys-vyn nu eller i fas 7 | **Nu.** Datan finns efter fas B och låg på fel plats (Inställningar). Verklig friktion, inte skrivbordsidé. |
| **C2** | Tre eller fyra dimensioner | **Tre funktionella + Skaderisk som platshållare.** Produktägarbeslut; utvecklarens röst var att vänta tills alla fyra kan fyllas. Överkörd — layoutens 2×2 väger tyngre än tomrummet. |

## Hur platshållaren gjordes ärlig

Invändningen mot ett tomt kort var att det inbjuder till falsk precision. Den är löst i designen i stället för i beslutet:

- Skaderisk bär **ingen statusfärg** — markören är en tom ring i dämpad ton, inte en grön prick. Statusfärg reserveras för dimensioner där en bedömning faktiskt gjorts.
- Värdet är *"Inte kopplad än"*, aldrig *"Ingen aktiv flagga"*. Demons formulering hade varit ett påstående appen inte kan stå för.
- Kortet ligger på lägre ytnivå (`--surface-lo`) och dämpat värde, så det läses som vilande.
- Två fixturer förbjuder regressionen: en söker efter `/ingen aktiv flagga/i` i både värde och varför, en låser att `state === "idle"`.

Funktionen adderas i fas 4 när regelmotorn får sitt gränssnitt.

## Dimensionerna

**Belastning** — innevarande veckas löpvolym mot rullande 3-veckorssnitt, mot profilens `volumeCapPct` (110 %). Samma tak som `volume-cap`-regeln läser; ingen andra sanning. Graf: åtta veckor, alla grenar, linjär höjd utan normaliseringsgolv (v29-lärdomen: ett koordinatsystem per axel).

**Intensitet** — Z1+Z2 mot totala zonminuter ur **utfall** de senaste 28 dagarna, inklusive oplanerade pass (matchning M-U: verkligheten räknas). Fönstret står i klartext på varje siffra (v28-regeln). Simpass hålls utanför när `swimHrValid` är av, och **antalet uteslutna redovisas** — en mätt siffra får aldrig tyst blandas med ogiltig data.

**Dagsform** — `recovery()`-signalerna tolkade. Skiljer dagssignal ("Avvikande", motorn föreslår nedväxling) från trendsignal ("Trend att bevaka", volym går bra). Kurvan visar 14 dagars vilopuls mot din egen normal.

**Skaderisk** — platshållare, se ovan.

## Arkitektur

Allt räknas i rena funktioner i `core.js`: `weeklyLoad`, `loadStatus`, `intensityStatus`, `formStatus`, `injuryStatus`, `statusGrid`. Vyn renderar, den räknar aldrig. L3 gäller: kortet visar tolkningen, ett tryck fäller ut varför, grafen ligger under.

## Öppet — kräver produktägarens beslut

**`blocks[].lowShare` (fasberoende intensitetsmål).** `lowShareTarget` är i dag en fast profilsiffra; målet varierar per fas. Enligt D7 hör det till planen, inte profilen. Kräver revision av planformat §3 nivå 1. **Följdfråga:** ska återhämtningsveckor bära eget värde (`weeks[].lowShare`) eller räcker blocknivå i v1?

**`recovery-watch` sätter regelkatalogen på 15** mot regelverk §6:s "under 15". Fortfarande ostämplat.

**Sim-LTHR ärver löpningens.** Innan `swimHrValid` slås på behöver intervals.icu en egen sim-tröskel, annars läses simpuls mot löpzoner. Erbjuden vakt: vägra rendera simremsan när sim-LTHR är identisk med annan grens. Ej byggd.
