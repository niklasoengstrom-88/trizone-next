# TRIZONE Next 0.9.1 — fälttestets korrigeringar (2026-08-03, kväll)

## Buggar, reproducerade och rättade
1. **Omaktiverat läge var dött samma dygn.** H4 ("samma regel max en gång per pass och dygn")
   räknade även ångrade ingrepp: på→av→på gav ett aktivt läge som ingenting gjorde. H4 vaktar
   nu endast automatik — användarstyrda lägen (modeKey) passerar alltid. Fixtur.
2. **Sjuk utan slutdatum strök alla framtida pass** (21 st på ett tryck). Öppna spann verkar
   nu dag för dag: från startdatum till idag, aldrig in i framtiden. Sätts ett uttryckligt
   slutdatum gäller hela spannet. Fixturer åt båda håll + röktest på exakt scenariot.
3. **Varningsdubbletter** (4 renderade, rubrik sa 2): gick inte att reproducera utan enhetens
   tillstånd — motorn levererar bevisat 2 unika. Vakten: bannern dedupar på (regel|pass|text)
   och redovisar i konsolen om dubbletter filtrerats. Består beteendet efter 0.9.1 hämtas
   rotorsaken ur en säkerhetskopia.

## Produktbeslut (produktägaren 2026-08-03)
- **Livsschema-editorn utgår.** Beslut A gjorde dagen till målet; fönsterpreferenser per
  veckodag är fiktion när verkligheten varierar. `cfg.schedule` kvarstår som giltigt fält
  (motorns flyttkandidater), men UI:t och dimningen är borta.
- **Logg-fliken utgår.** Händelseloggen bor i Inställningar bakom en knapp; Utanför plan
  åter i Plan-vyn. Tre flikar: Idag · Plan · Inställningar.
- **"Ingrepp på detta pass" hopfälld** bakom Historik-knapp (L3: visa → förklara → fördjupa).

## Förbättringar
- Nivå 3-texter talar **titlar och dagnamn**, aldrig pass-id: "Tunga ben: styrkan Skyddspasset
  (ons) ligger inom ett dygn från Cykel 3×5 min tävlingsfart (tis)".
- Zonparitetsvarningen är **grenuppdelad** och preciserar att det gäller PULSzoner, inte pace.
