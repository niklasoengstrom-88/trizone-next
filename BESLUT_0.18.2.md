# BESLUT 0.18.2 — Skrollnollställning vid vyväxling

**Datum:** 2026-08-10 · **Stämpel:** `next-0.18.2 · 2026-08-10` · sw-cache `trizone-next-0.18.2`
**Testläge:** core **718** (svitvakt 718) · smoke **307** (svitvakt 307) · plan_broken felar med exakt 5

## Fix (S25-fyndet)

Vyväxling via flikar/ikoner (data-nav) nollställer skrollen — nedskrollat
läge i en vy följde tidigare med till nästa. `window.scrollTo(0,0)` efter
render i nav-handlern. Berör INTE dagbläddring i Idag (selday/backtoday)
eller Idag-fabbens hopp till aktuell vecka. Permanent röktest med skrollstub.

## Haptiken — öppen, diagnostik beställd

Fortsatt död på S25 efter ren 0.18.1-cache ⇒ inte sw-cachen. Ingen kodändring
utan data: appens självdiagnostik (Inställningar → haptikrad + "Testa
vibration") avgör om felet är i kodvägen eller i enheten (Samsung
Tryckåterkoppling-intensitet 0 tystar navigator.vibrate trots true-retur).
Produktägaren rapporterar haptikradens värden innan felsökning i kod.
