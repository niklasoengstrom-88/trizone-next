# TRIZONE Next 0.9.4 — navigationsrevision (2026-08-04, produktägarbeslut)

- **Inställningar utgår ur bottennaven.** Personikonen (Idag + Planen) är vägen. Naven
  bär två flikar: Idag · Plan. Inställningsvyn själv är oförändrad och alltid nåbar.
- **Genvägsikonerna följer med i bläddringsläget** (bugg: bläddringens huvud saknade dem).
- **Planen får ett huvud** med titel och personikon — och är den yta som i fas E växer
  till överblicksvyn (faser, mål, lopp) enligt demon och färdplanen.
- **Månadssvep:** horisontellt svep i månadsytan bläddrar månad, med sloppkrav mot
  vertikal skroll och haptisk kvittens. Dagcellernas tryck opåverkade.
- Incident under bygget: regexbaserad patch åt upp evlog-hanteraren — fångad av röktest,
  återställd. Regeln skärps: patchar mot exakta strängar, aldrig mönster.
