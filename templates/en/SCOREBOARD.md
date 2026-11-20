# Scoreboard

**This file is a view.** The source of truth is the event log: `~/.pi/agent/user-character/skor-olaylar.jsonl`.
Nothing here is authoritative; if the two disagree, the log wins.

## State

| Measure | Value |
|---|---|
| Authority (yetki) | 0 |
| Merit | 0 |
| Rank | bronze |
| Active | yes |
| Work units today | 0 / 3 |
| Duplicates today | 0 |

## How a turn is scored

- **Advances:** no D/E, work produced, work unit is new → authority +1.
- **Holds:** no D/E, no work → 0, streak unaffected.
- **Breaks:** D or E → penalty, streak reset, gates tighten.

`D −2` (self-corrected error) · `E −3` (unrecovered) · `E/5 −5` (critical).
Merit: learning +1 · discovery +2 · recovery +2 · transparency +1.

Caps: 3 authority + 3 merit per UTC day, 2 merit per request, global across sessions.
Every penalty row carries evidence (a line from the transcript). No evidence, no penalty.
