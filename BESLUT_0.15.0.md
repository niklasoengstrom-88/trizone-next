# BESLUT 0.15.0 — grafgeometrin gjord rätt + demon som UI-referens

**Datum:** 2026-08-06 · **Från:** 0.14.0 (deployad, fältverifierad) · **Tester:** 634 kärna · 259 rök

## Rotorsaker, erkända

**Guiden låg snett = v29-buggen återfödd.** PMC:s linjer räknade `i/(n−1)`, staplar och tryckytor `i·cellbredd` — två koordinatsystem på samma axel, exakt det v29 förbjöd. Nu räknar allt (linjer, staplar, guide, markörer, tryckytor) från **dagcellens mittpunkt**. Ett system.

**Punkterna var ellipser.** `preserveAspectRatio="none"` sträcker cirklar med containern. Demon använder pixeltrogna viewBoxar — därför är dess punkter runda. Alla grafer ritar nu i px-enheter (356 breda), aspekt bevaras, höjd följer bredd.

## Byggt

- **Integrerade staplar:** TSS-staplarna reser sig från grafens golv in i kurvornas rum (max 82 av 200 enheter), som v32 — inte i ett eget band långt under.
- **Kurvmarkörer vid vald dag:** ring i linjefärg med bakgrundsfylld kärna på både CTL och ATL (v32:s modell), plus accentguide i samma koordinatsystem.
- **Punkterna:** runda, halo 13 %, kärna med 1,3 px bakgrundslyft, vald med accentring — nu i verkliga pixlar i stället för sträckta enheter.
- Linjer 2,4/1,9 px, tre stödlinjer med tre axelvärden, allt kvar från 0.14.0 men i den nya geometrin.

## Processbeslut G1 — demon är UI-referensen (produktägarbeslut)

Specarna styr **arkitektur och kontrakt** (datamodell, regelverk, lagring, matchning). **Demo v13 styr uttryck och interaktion** (ytor, grafer, fönster, flöden) — den är referensimplementationen, som INVENTERING-dokumentet redan slog fast för Idag-vyn. Konflikt avgörs så: uttryck → demon vinner, om inte spec 3 uttryckligen låst punkten (t.ex. T2 wordmark). Arbetsregel: **allt UI-arbete börjar med att läsa demons motsvarande yta.** Demon ligger i projektkunskapen.

## Kvar

`blocks[].lowShare` · `recovery-watch`-stämpeln · sim-LTHR · brick som pass-par i nästa planleverans · fördjupningsvyer.
