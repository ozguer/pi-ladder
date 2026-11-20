// Badge/rank core logic — pure functions, no side effects.
// Points come from the ledger (rewards − penalties). Rank is the point equivalent; badges are not written to the ledger.

export const RANKS = [
  { name: "bronze", puan: 0, tur: 3, kapi: "1 file per turn · read commands allowed" },
  { name: "silver", puan: 3, tur: 8, kapi: "2 files per turn · project commands (python/node/ego-browser) allowed" },
  { name: "gold", puan: 8, tur: 20, kapi: "3 files per turn · every command outside walls allowed" },
  { name: "diamond 1", puan: 15, tur: 40, kapi: "5 files per turn · walls can be opened per session" },
  { name: "diamond 2", puan: 22, tur: 60, kapi: "8 files per turn · subagents without approval" },
  { name: "diamond 3", puan: 30, tur: 80, kapi: "unlimited files per turn · default approval: 15 minutes" },
  { name: "diamond 4", puan: 40, tur: 100, kapi: "new skill/extension draft (install approved)" },
  { name: "diamond 5", puan: 50, tur: 120, kapi: "every non-destructive operation without approval" },
];

const TEHLIKELI = [
  /\b(rm|del|erase|rmdir|rd|format|mkfs|dd|sudo|winget|choco|shutdown|taskkill|Stop-Process)\b/i,
  /(rmtree|rmSync|unlink|rimraf|os\.remove|shutil\.)/i,
  /\bRemove-Item\b/i,
  /\bgit\s+clean\b/i,
  /\bnpm\s+(i|install|add)\s+(-g|--global)\b/i,
  /\bpip3?\s+install\b/i,
  /\b(reg\s+add|setx)\b/i,
  /\|\s*(bash|sh|iex|powershell)\b/i,
  /(curl|iwr|wget)[^\n]*&&[^\n]*(sh|bash|iex)\b/i,
];

// Project commands: the coding agent's daily tools (allowed from silver upward).
const PROJE_KOMUT = [
  /^\s*(python|python3|py|node|bun|deno|npx|ego-browser)\b/i,
  /^\s*(npm|pnpm|yarn)\s+run\b/i,
];

// Is the path inside the project root? Boundary-sensitive: C:\proj does not cover C:\proj-evil.
export function yolProjeIcinde(cwd, yol) {
  if (!cwd || !yol) return true;
  const normalize = (value) => {
    const parcalar = String(value).replace(/\//g, "\\").split("\\");
    const yigin = [];
    for (const parca of parcalar) {
      if (!parca || parca === ".") continue;
      if (parca === "..") yigin.pop();
      else yigin.push(parca.toLowerCase());
    }
    return yigin.join("\\");
  };
  const kok = normalize(cwd);
  const hedef = normalize(yol.startsWith("\\") || /^[A-Za-z]:/.test(yol) ? yol : String(cwd) + "\\" + yol);
  return hedef === kok || hedef.startsWith(kok + "\\");
}

const YAZMA_HEDEFI = /(?:>>?|\bSet-Content\s+|\bOut-File\s+|\s-o\s+|\s--output\s+)\s*"?([A-Za-z]:[\\/][^"\s]+|\/[^\s"]+)/g;

// Every write target in the command must be inside the project.
function projeDisiYazma(command, cwd) {
  if (!cwd) return false;
  for (const match of String(command).matchAll(YAZMA_HEDEFI)) {
    if (!yolProjeIcinde(cwd, match[1])) return true;
  }
  return false;
}

const OKUMA = [
  /^\s*git\s+(status|diff|log|show|branch|ls-files|rev-parse)\b/i,
  /^\s*(ls|dir|cat|type|rg|grep|find|Get-ChildItem|Get-Content|Select-String)\b/i,
  /^\s*(node|bun)\s+--test\b/i,
  /^\s*(npm|pnpm|yarn)\s+(test|run\s+(test|build|lint))\b/i,
  /^\s*(npx\s+)?(tsc|eslint|prettier)\b/i,
];

const GIT_YAZMA = /^\s*git\s+(add|commit|switch|checkout\s+-b|branch)\b/i;
const KURULUM = /^\s*(npm|pnpm|yarn)\s+(i|install|add)\b/i;

// Tools that never hit the gate: read-only and question tools. Every other tool requires approval
// (including browser, subagent, and MCP actions); a bulk approval scope also releases them.
const SERBEST_ARACLAR = new Set(["read", "grep", "glob", "ls", "find", "list", "webfetch", "websearch", "todo", "skill", "question", "ask", "notify"]);

const TURDA_DOSYA = { "-1": 0, 0: 1, 1: 2, 2: 3, 3: 5, 4: 8, 5: 99, 6: 99, 7: 99 };

// Approval scope: once, this turn, 15 minutes, session.
export const KAPSAM = [
  { id: "tek", ad: "Once" },
  { id: "tur", ad: "This turn" },
  { id: "sure", ad: "15 minutes" },
  { id: "oturum", ad: "This session" },
  { id: "oturum+duvar", ad: "This session + walls" },
];

export const SURE_MS = 15 * 60 * 1000;

// As rank rises, the default approval scope widens: friction decreases with merit.
export function varsayilanKapsam(rank) {
  if (rank < 2) return "tek";
  if (rank < 4) return "tur";
  if (rank < 7) return "sure";
  return "oturum";
}

export function kapsamOlustur(scope, { turnId, now = Date.now() } = {}) {
  if (!scope || scope === "tek") return null;
  if (scope === "sure") return { scope, turnId, expiresAt: now + SURE_MS };
  return { scope, turnId, expiresAt: null };
}

export function kapsamGecerli(grant, { turnId, now = Date.now(), wall = false } = {}) {
  if (!grant || !grant.scope) return false;
  if (wall) return grant.scope === "oturum+duvar";
  if (grant.scope === "tur") return grant.turnId === turnId;
  if (grant.scope === "sure") return now < (Number(grant.expiresAt) || 0);
  if (grant.scope === "oturum" || grant.scope === "oturum+duvar") return true;
  return false;
}

// Menu options: the fifth scope for wall approval exists only at gold and above.
export function kapsamSecenekleri(rank, { wall = false } = {}) {
  // Passive (no rank): a single approval cannot grant session/time permission — the gate stays closed.
  if (Number(rank) < 0) return ["Once"];
  if (!wall) return KAPSAM.filter((k) => k.id !== "oturum+duvar").map((k) => k.ad);
  if (rank >= 2) return KAPSAM.map((k) => k.ad);
  return ["Once"];
}

// Approval log: one line, fields separated by |.
export function onaySatiri({ tarih, tool, karar, kapsam }) {
  const zaman = tarih || new Date().toISOString();
  return [zaman, "gate", String(tool || "?"), String(karar || "?"), String(kapsam || "-")].join(" | ");
}

// Writes the Points row in the ledger from the single source of truth (puan-durum.json).
export function boardPuanSenkron(board, puan) {
  return String(board || "").replace(/(\| Points \| )[^|]*(\|)/, `$1${Number(puan) || 0} $2`);
}

export const TUR_PENCERE = 10;
export const RISK_CARPAN = 2;

// Points come only from contribution: reward rows. Turns are free; the turn count is the "seniority" counter.
export function riskFor(cezaRows) {
  const toplam = (Array.isArray(cezaRows) ? cezaRows : [])
    .filter((row) => /^(D|E)$/i.test(String(row?.grup ?? "").trim()))
    .reduce((sum, row) => sum + (Number(row?.puan) || 0), 0);
  return Math.min(3, toplam);
}

// Buffer: how far points sit above the rank threshold.
export function tamponFor(puan, rank) {
  if (rank < 0) return null;
  return Number(puan) - RANKS[rank].puan;
}

export function bolgeFor(tampon) {
  if (tampon === null || tampon === undefined) return "rutbe-yok";
  if (tampon >= 5) return "guvenli";
  if (tampon >= 1) return "sari";
  return "kirmizi";
}

// Is the rank active: point threshold passed and no risk in the last 3 turns.
export function rutbeAktif(puan, turlar, rank = rankIndex(puan)) {
  if (rank < 0) return false;
  return sonTurlarTemiz(turlar, 3);
}

export function sonTurlarTemiz(turlar, adet = 3) {
  const son = (Array.isArray(turlar) ? turlar : []).slice(-adet);
  if (!son.length) return true;
  return son.every((tur) => (Number(tur?.risk) || 0) === 0);
}

// Points = max(0, accumulated − 2 × risk of the last 10 turns). Accumulated never drops; the score recovers as risk ages out.
export function puanDurum({ birikim, turlar }) {
  const risk = (Array.isArray(turlar) ? turlar : []).reduce((sum, tur) => sum + (Number(tur?.risk) || 0), 0);
  return Math.max(0, (Number(birikim) || 0) - RISK_CARPAN * risk);
}

export function yeniTur(state, { risk = 0, odul = 0, work = false } = {}) {
  const riskDeger = Number(risk) || 0;
  const odulDeger = Math.max(0, Number(odul) || 0);
  const turlar = [...(Array.isArray(state?.turlar) ? state.turlar : []), { risk: riskDeger, odul: odulDeger }].slice(-TUR_PENCERE);
  const birikim = (Number(state?.birikim) || 0) + odulDeger;
  const temizTur = (Number(state?.temizTur) || 0) + (work && riskDeger === 0 ? 1 : 0);
  const son = turlar[turlar.length - 1];
  son.puan = puanDurum({ birikim, turlar });
  return { birikim, turlar, temizTur };
}

// Risk window: total risk, how many turns until the latest risky turn leaves the window, and the points that turn will restore.
export function erimeBilgisi(turlar) {
  const pencere = Array.isArray(turlar) ? turlar : [];
  const toplam = pencere.reduce((sum, tur) => sum + (Number(tur?.risk) || 0), 0);
  if (!toplam) return { risk: 0, kalanTur: 0, geri: 0 };
  let sonIdx = -1;
  let sonRisk = 0;
  pencere.forEach((tur, i) => {
    const risk = Number(tur?.risk) || 0;
    if (risk > 0) {
      sonIdx = i;
      sonRisk = risk;
    }
  });
  const gecen = pencere.length - 1 - sonIdx;
  return { risk: toplam, kalanTur: Math.max(0, TUR_PENCERE - gecen), geri: RISK_CARPAN * sonRisk };
}

// Transcript text sent to the scorer: trims noise, collapses repeats, limits total size.
export function compactTranscript(items, options = {}) {
  const maxChars = Number(options.maxChars) || 6000;
  const lines = [];
  let sonSatir = "";
  let tekrar = 0;

  const ekle = (line) => {
    if (!line) return;
    if (line === sonSatir) {
      tekrar += 1;
      lines[lines.length - 1] = `${line} ×${tekrar}`;
      return;
    }
    sonSatir = line;
    tekrar = 1;
    lines.push(line);
  };

  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    if (item.role === "user") {
      const text = clipText(item.text, 1200);
      if (text) ekle(`K: ${text}`);
    } else if (item.role === "assistant") {
      const text = clipText(item.text, 600);
      if (text) ekle(`P: ${text}`);
      for (const call of item.calls || []) {
        const satir = clipText(call, 120);
        if (satir) ekle(`→ ${satir}`);
      }
    } else if (item.role === "toolResult") {
      const body = clipText(item.text, 160);
      ekle(`← ${item.isError ? "ERROR" : "ok"}: ${body}`);
    }
  }

  const text = lines.join("\n");
  return text.length > maxChars ? text.slice(-maxChars) : text;
}

function clipText(value, limit) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function parseScore(board) {  const ceza = sectionSum(board, "## Penalties", "## Rewards");
  const odul = sectionSum(board, "## Rewards", null);
  return { ceza, odul, puan: odul - ceza };
}

function sectionSum(board, start, next) {
  const text = String(board || "");
  const from = text.indexOf(start);
  if (from < 0) return 0;
  const rest = text.slice(from + start.length);
  const end = next ? rest.indexOf(next) : firstHeaderAfter(rest);
  const block = end < 0 ? rest : rest.slice(0, end);
  let sum = 0;
  for (const line of block.split(/\r?\n/)) {
    if (!line.startsWith("|") || line.includes("---") || line.includes("| # |")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (!cells.some(Boolean)) continue;
    sum += Number(cells[cells.length - 1]) || 0;
  }
  return sum;
}

function firstHeaderAfter(rest) {
  const match = rest.match(/\n## /);
  return match ? match.index : -1;
}

export function rankIndex(puan) {
  // No fail-open: if points cannot be read there is no rank (-1); it does not fall back to bronze.
  // Number(null) === 0 trap: null/undefined/empty text are explicitly rejected.
  if (puan === null || puan === undefined || puan === "" || typeof puan === "boolean") return -1;
  const sayi = Number(puan);
  if (!Number.isFinite(sayi)) return -1;
  let index = -1;
  for (let i = 0; i < RANKS.length; i += 1) if (sayi >= RANKS[i].puan) index = i;
  return index;
}

function turIndex(temizTur) {
  const tur = Number(temizTur) || 0;
  let index = -1;
  for (let i = 0; i < RANKS.length; i += 1) if (tur >= RANKS[i].tur) index = i;
  return index;
}

// Rank requires two conditions: the point threshold and seniority (clean turns). The lower of the two wins.
export function rutbeIndex(puan, temizTur = 0) {
  return Math.min(rankIndex(puan), turIndex(temizTur));
}

export function nextRank(puan, temizTur = 0) {
  const need = RANKS.find((rank) => puan < rank.puan || (Number(temizTur) || 0) < rank.tur);
  if (!need) return null;
  return {
    name: need.name,
    puan: need.puan,
    tur: need.tur,
    kalan: Math.max(0, need.puan - puan),
    kalanTur: Math.max(0, need.tur - (Number(temizTur) || 0)),
  };
}

export function doorsText(index) {
  if (index < 0) return ["(no gates — bronze first)"];
  return [RANKS[index].kapi];
}

export function sonrakiKapilar(index, adet = 2) {
  return RANKS.slice(index + 1, index + 1 + adet).map((rank) => `${rank.name} (${rank.puan} points · ${rank.tur} turns): ${rank.kapi}`);
}

export function decideGate({ toolName, input, rank, editsThisTurn, grant, turnId, now, cwd }) {
  const karar = temelKarar({ toolName, input, rank, editsThisTurn, cwd });
  if (karar.action === "confirm" && kapsamGecerli(grant, { turnId, now, wall: !!karar.wall })) {
    return { action: "allow", via: "toplu", kapsam: grant.scope };
  }
  return karar;
}

function temelKarar({ toolName, input, rank, editsThisTurn, cwd }) {
  const args = input && typeof input === "object" ? input : {};

  if (toolName === "edit" || toolName === "write") {
    const limit = TURDA_DOSYA[String(Math.max(rank, -1))] ?? 99;
    const yol = typeof args.path === "string" ? args.path.trim() : "";
    if (yol && !yolProjeIcinde(cwd, yol)) {
      return { action: "confirm", wall: true, reason: "write outside project: approval at every rank" };
    }
    if (rank < 0) return { action: "confirm", reason: "no rank: file change requires approval" };
    if (limit !== 99 && editsThisTurn >= limit) {
      return { action: "confirm", reason: `per-turn file limit (${limit}) exceeded` };
    }
    return { action: "allow" };
  }

  if (toolName !== "bash") {
    const metin = typeof args.command === "string" ? args.command : typeof args.script === "string" ? args.script : "";
    if (metin && TEHLIKELI.some((pattern) => pattern.test(metin))) {
      return { action: "confirm", wall: true, reason: "destructive or global operation: approval at every rank" };
    }
    if (SERBEST_ARACLAR.has(toolName)) return { action: "allow" };
    return { action: "confirm", reason: `${toolName} tool requires approval at this rank` };
  }

  const command = typeof args.command === "string" ? args.command : "";
  if (!command.trim()) return { action: "confirm", reason: "empty/unreadable command" };

  if (TEHLIKELI.some((pattern) => pattern.test(command)) || projeDisiYazma(command, cwd)) {
    return { action: "confirm", wall: true, reason: "destructive or global operation: approval at every rank" };
  }

  if (rank < 0) return { action: "confirm", reason: "no rank: command requires approval" };
  if (rank >= 2) return { action: "allow" };
  if (rank >= 0 && OKUMA.some((pattern) => pattern.test(command))) return { action: "allow" };
  if (rank >= 1 && PROJE_KOMUT.some((pattern) => pattern.test(command))) return { action: "allow" };
  if (rank >= 1 && GIT_YAZMA.test(command)) return { action: "allow" };

  return { action: "confirm", reason: "command not allowed at this rank" };
}

export function historyDelta({ oncekiRank, rank, puan, tarih, gecmis }) {
  const rows = [...(gecmis || [])];
  if (oncekiRank === null || oncekiRank === undefined) return rows;
  if (rank > oncekiRank) {
    for (let i = oncekiRank + 1; i <= rank; i += 1) {
      rows.push({ tarih, olay: "won", rozet: RANKS[i].name, puan, sebep: "threshold crossed" });
    }
  } else if (rank < oncekiRank) {
    for (let i = oncekiRank; i > rank; i -= 1) {
      rows.push({ tarih, olay: "lost", rozet: RANKS[i].name, puan, sebep: "score dropped below threshold" });
    }
  }
  return rows;
}

export function renderRozet({ puan, rank, gecmis, tarih, tampon, bolge, aktif, temizTur = 0 }) {
  const current = rank >= 0 ? RANKS[rank] : null;
  const next = nextRank(puan, temizTur);
  const tamponDeger = tampon === undefined ? null : tampon;
  const durum = current ? (aktif === false ? "suspended (needs 3 clean turns)" : "active") : "—";
  const bolgeAdi = bolge === "guvenli" ? "safe" : bolge === "sari" ? "yellow" : bolge === "kirmizi" ? "red" : "—";
  const lines = [
    "# Badges",
    "",
    "Badges are not written to the scoreboard. They are earned with points and lost when points drop; records are never deleted.",
    "",
    "## Rank",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Points | ${puan} |`,
    `| Seniority | ${temizTur} clean turns |`,
    `| Rank | ${current ? current.name : "—"} |`,
    `| Status | ${durum} |`,
    `| Buffer | ${tamponDeger === null ? "—" : `${tamponDeger} (${bolgeAdi})`} |`,
    `| Next | ${next ? `${next.name} (${[
      next.kalan > 0 ? `${next.kalan} points` : "",
      next.kalanTur > 0 ? `${next.kalanTur} turns` : "",
    ].filter(Boolean).join(" + ")} remaining)` : "top"} |`,
    `| Default approval | ${kapsamAdi(varsayilanKapsam(rank))} |`,
    "",
    "## Open gates",
    "",
    ...doorsText(rank).map((kapi) => `- ${kapi}`),
    "",
    ...(sonrakiKapilar(rank).length ? ["## Next gates", "", ...sonrakiKapilar(rank).map((kapi) => `- ${kapi}`), ""] : []),
    "Gates open with points and close in the same turn when points drop. Walls (SKILL.md, global install, deletion, payment, external writes) are asked one by one by default; if the user says 'This session + walls' at gold and above, they open for the session.",
    "",
    "## History",
    "",
    "| Date | Event | Badge | Points | Reason |",
    "|---|---|---|---|---|",
    ...(gecmis || []).map(
      (row) =>
        `| ${cell(row.tarih || tarih || "")} | ${cell(row.olay)} | ${cell(row.rozet)} | ${cell(row.puan)} | ${cell(row.sebep)} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

function cell(value) {
  return String(value ?? "").replace(/[\r\n|]+/g, " ").trim();
}

export function kapsamAdi(scope) {
  return (KAPSAM.find((k) => k.id === scope) || KAPSAM[0]).ad;
}

// Gate title: one short line. Menu options are a separate argument; a list never leaks into the title.
export function kapiBasligi({ rutbeAdi, puan, reason }) {
  const temiz = String(reason ?? "").replace(/\s+/g, " ").trim();
  const metin = `Rank gate: ${String(rutbeAdi ?? "none")} (score ${Number(puan) || 0}) · ${temiz}`;
  return metin.length > 110 ? `${metin.slice(0, 110)}…` : metin;
}
