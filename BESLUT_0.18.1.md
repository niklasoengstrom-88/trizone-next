# BESLUT 0.18.1 — Överblicken stramas åt

**Datum:** 2026-08-10 · **Stämpel:** `next-0.18.1 · 2026-08-10` · sw-cache `trizone-next-0.18.1`
**Testläge:** core **718** (svitvakt 718) · smoke **305** (svitvakt 305) · plan_broken felar med exakt 5 rotorsaker
**Grund:** S25-testning av 0.18.0 samma kväll (produktägarens feedback, bild 1–3).

## Beslut

**B18-6 — Överblicken visar BARA innevarande vecka** (demo bild 2). Kommande
veckor bor i Omplanera. Rubriken är "Denna vecka · v.X (datum)" i eyebrow-stil,
inte h1. Textväg "Omplanera pass …" under veckan, utöver kalendersymbolen.
Öppnad pastfold visar passerade veckor i samma kompakta form.

**B18-7 — Kompakt Omplanera:** slimmad veckorubrik på en rad (vecka · datum ·
pass · timmar), dragbara kompaktrader (`rearrRow`: prick + titel + duration +
fönster + prio/badges, inget zonband — här flyttar man dos, läser inte prosa),
alla dagrader lika höga, tomma som fyllda (min-height 40px). Slimmade
HIT-mål. Interaktionen (tryck = sheet, långtryck = drag) orörd.

**B18-8 — Livslägen & dagsform-kortet** (demo bild 3): eyebrow-rubrik,
förklarande ingress, gruppen **Period** med prickchips för de fyra lägen som
finns (Semester, Reducerad vecka, Sjuk, Känning) och cue-text byggd ur
LIFE_MODES.why. **Dagsform-gruppen (Dålig natt) skeppas INTE** — funktionen
kräver 0.19:s regelarbete och döda knappar skeppas aldrig. Demons placering
av Känning under Dagsform följs inte: här är tissue-freeze ett periodläge
(gäller tills det hävs) och redovisas ärligt som ett sådant.

## Regression fixad (0.18.0, upptäckt i teständring)

`S.week` sattes vid boot och användes av 0.18.0-överblicken för veckovalet —
veckoskifte med appen öppen (eller PWA:n vilande över en måndag) hade visat
förra veckan som "Denna vecka". Ny `currentWeek()` beräknas per rendering:
idag i planen ⇒ den veckan, annars nästa kommande, annars sista. Uppdaterar
S.week så Idag-fabben följer med. Permanent röktest: tidsskifte utan omstart
ska flytta "Denna vecka".

## Kvarstående från S25-rundan

- Haptik i Omplanera rapporterad död efter 0.18.0-deploy — trolig sw-cache;
  verifieras efter 0.18.1-deployen innan felsökning.
- Fasbriefingen syns inte i skarp drift: korrekt — `kal`-blocket saknar
  `text.brief`. Läggs i Bas-beställningen om önskad.
