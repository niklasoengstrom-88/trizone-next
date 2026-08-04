# TRIZONE Next 0.9.2 — regelrevision heavy-legs · månadsvyn (2026-08-04)

## Spec 1 §6 rev: heavy-legs är ENKELRIKTAD (produktägarbeslut 2026-08-04)
Regelns syfte är att skydda kvalitetspasset från trötta ben. Styrka dagen EFTER kvalitet
är sund sekvensering, inte ett fynd — "båda riktningar" i beslutsregistret utgår.
Varning endast när styrkan ligger före kvalitetspasset i tid. Fixturer åt båda håll.
**Parkerat med trigger:** muskelgruppsdifferentiering (ben ⇒ löp/cykel, överkropp ⇒ sim)
kräver passdata som planformatet inte bär — byggs när fältet finns, aldrig på titelgissning.

## Månadsvyn (designspråk §7)
Strippen bär en väg till månaden: pil eller svep nedåt. Månaden ERSÄTTER strippen —
bläddringsbar med månadsnamn i displaysnitt, veckonummerkolumn, grenprickar per dag
(fylld = utfört), dagceller öppnar bläddringsläget. Svep uppåt fäller ihop.
`monthView`/`planMonths` är rena kärnfunktioner med egna fixturer.

## Incident under bygget, redovisad
Arbetsfilerna innehöll riktningsfixen, månadskärnan och klickvägarna redan när sessionen
granskade dem — arbete vars tillkomst inte kan beläggas i sessionshistoriken. Samtidigt
hade svitvakten EXPECTED_MIN sänkts till 262 med 356 tester i sviten — exakt den felklass
vakten finns för. Vakten återställd till 356, all funktionalitet verifierad testad innan
stämpling. Husregeln står: filerna är master, minnet är det aldrig — och vakter röres
aldrig nedåt utan dokumenterat skäl.
