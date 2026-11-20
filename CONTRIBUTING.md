# Contributing

Thanks for looking. This project is intentionally small, dependency-free and test-first.

## Ground rules

1. **No penalty without evidence.** Every scoring rule must be provable from the transcript. Add a test that shows the evidence string.
2. **One policy table.** All numbers (thresholds, rewards, caps, wall names) live in `extensions/skor-politika.mjs` and `extensions/kapi-politika.mjs`. Hard-code a threshold elsewhere and `node tools/check-policy-sync.mjs` will fail.
3. **The log is append-only.** Never rewrite history; add an event or write a migration.
4. **Fail-safe over fail-open.** On error, log and hold. Never write a half file, never reset a score.

## Workflow

```bash
git clone https://github.com/ozguer/pi-ladder.git
cd pi-ladder
node --test tests/          # 280 tests
node tools/e2e-senaryo.mjs  # 16 end-to-end scenarios
node tools/check-policy-sync.mjs
```

Write the failing test first. Keep public interfaces documented in `README.md`. If you change behaviour, add a CHANGELOG entry under `## [Unreleased]`.

## Reporting a bug

Include: what you ran, what you expected, what happened, and the last lines of
`~/.pi/agent/user-character/skorcu.log`. If the score is involved, attach the
relevant lines of `skor-olaylar.jsonl` (they contain no secrets — only file
paths, event types and evidence strings).

## Scope

This is a friction system for a cooperative agent, not a sandbox. Security-boundary
proposals (isolation, containers, network policy) are out of scope; gate-accuracy
proposals (missed walls, false penalties) are very much in scope.
