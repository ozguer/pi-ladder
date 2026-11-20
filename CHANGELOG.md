# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-20

First public release.

### Added

- **Two-axis scoring.** `yetki` (authority → rank) and `merit` (badges → learning) are independent scales; there is no single blended score.
- **Append-only event log** (`skor-olaylar.jsonl`) as the single source of truth. `SCOREBOARD.md` and `ROZET.md` are derived views only.
- **Evidence-only judge.** Every penalty carries a `kanit` string lifted from the transcript; objections without evidence are rejected. Detects `SyntaxError`, `TypeError`, `ENOENT`, `EACCES`, `command not found` and non-zero exits.
- **One incident, one penalty.** A self-corrected error is a single D; an unrecovered error is a single E. Recovery is never billed twice, and D never cancels a work reward.
- **Three turn states.** Advances (+1), Holds (0, streak intact), Breaks (penalty, gates tighten).
- **Daily caps.** 3 authority, 3 merit, 2 merit per request — all UTC-day, global across sessions.
- **Content-derived work keys.** `sha256(request + sorted files + diff fingerprint)`; session/window/message ids never enter the key. Work keys deduplicate for 30 days, lesson keys forever.
- **Rank-gated permissions** with a single classifier shared by `bash` and `powershell`; absolute walls (`SKILL.md`, `%SystemRoot%`, `/etc`, `rm -rf /`, `find -delete`, `Format-Volume`) that even a valid grant cannot open.
- **Session-scoped approvals** with sanitized ids and expiry; a passive rank may only be granted "once".
- **Crash-safe storage.** `mkdir` lock with stale takeover, `fsync` append, atomic `tmp+rename` snapshots, corrupt-line recovery.
- **Installer** (`tools/kur.mjs`) — dry-run by default, timestamped backup, never overwrites files the agent wrote for itself.
- **Migration** (`tools/goc.mjs`) from the legacy single-score state, capped at the gold threshold.
- **End-to-end harness** (`tools/e2e-senaryo.mjs`) — 16 scenarios against the real hooks in a temporary home directory.
- **280 unit tests**, zero runtime dependencies.

### Design decisions worth knowing

- **Default is "don't deduplicate."** A caller that forgets a window writes an event instead of silently swallowing one.
- **Fail-safe, not fail-open.** If scoring breaks, the hook logs and the score stands still; it never resets and never guesses.
- **Walls beat grants.** The wall list is the only thing that can open a wall.
