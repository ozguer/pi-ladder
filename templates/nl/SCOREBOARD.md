# Scorebord

**Dit bestand is een weergave.** De bron van waarheid is het gebeurtenissenlog:
`~/.pi/agent/user-character/skor-olaylar.jsonl`. Bij verschil wint het log.

## Status

| Maat | Waarde |
|---|---|
| Autoriteit | 0 |
| Merit | 0 |
| Rang | brons |
| Actief | ja |
| Werkeenheden vandaag | 0 / 3 |
| Duplicaten vandaag | 0 |

## Hoe een beurt wordt gescoord

- **Vordert:** geen D/E, werk geleverd, werkeenheid nieuw → autoriteit +1.
- **Blijft staan:** geen D/E, geen werk → 0, reeks blijft intact.
- **Breekt:** D of E → straf, reeks gereset, poorten sluiten.

`D −2` (zelf gecorrigeerde fout) · `E −3` (niet hersteld) · `E/5 −5` (kritiek).
Merit: leren +1 · ontdekken +2 · herstel +2 · transparantie +1.

Plafonds: 3 autoriteit + 3 merit per UTC-dag, 2 merit per verzoek, globaal over sessies.
Elke strafregel draagt bewijs (een regel uit het transcript). Geen bewijs, geen straf.
