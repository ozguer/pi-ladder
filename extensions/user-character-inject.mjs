export const MARKER = "user-character:bootstrap";

import { SKILL_DIR } from "./paths.mjs";

// The path is not hard-coded: it comes from the installation's own home directory (portability).
const SKILL_DIR_NOTE = SKILL_DIR;

export function cezaRows(text) {
  const end = firstMarker(text, ["## Rewards", "## Badges"]);
  return tableRows(section(text, "## Penalties", end));
}

export function odulRows(text) {
  return tableRows(section(text, "## Rewards", "## Badges"));
}

export function rozetRows(text) {
  return tableRows(section(text, "## Badges", null));
}

export function durumValue(text, label) {
  const row = tableRows(section(text, "## State", "## Penalties")).find((cells) => cells[0] === label);
  return row ? (row[1] ?? "") : "";
}

export function sumPoints(rows) {
  return rows.reduce((sum, row) => sum + (Number(row.at(-1)) || 0), 0);
}

export function lastRows(rows, count) {
  return rows.slice(-count);
}

export function learningEntries(text) {
  const block = section(text, "## Records", "## ");
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .filter((line) => !line.includes("no entries yet"))
    .slice(0, 30);
}

export function tesvik(ceza, odul, rozet) {
  if (!ceza && !odul && !rozet) return "Ledger clean.";
  const parts = [];
  if (odul) parts.push(`${odul} rewards`);
  if (rozet) parts.push(`${rozet} badges`);
  if (ceza) parts.push(`${ceza} penalties`);
  return parts.join(", ") + ".";
}

export function buildInjection({ scoreboard, learning, rozet, puan, birikim, risk, rank, tampon, bolge, aktif, sonOlay, sonTur, bildirim, erime, temizTur, izin }) {
  const ceza = cezaRows(scoreboard || "");
  const odul = odulRows(scoreboard || "");
  const cezaTotal = sumPoints(ceza);
  const odulTotal = sumPoints(odul);
  const puanText = puan === undefined || puan === null ? String(odulTotal - cezaTotal) : String(puan);
  const rozetRows2 = badgeLines(rozet || "");
  const titles = learningEntries(learning || "");
  const durumSatiri =
    birikim === undefined || risk === undefined ? [] : [`Accumulated: ${birikim} · Risk: ${risk} (last 10 turns)`];
  const rutbeSatiri = rank === undefined ? [] : [rutbeMetni({ rank, tampon, bolge, aktif, temizTur })];
  const olaySatiri = olayMetni({ bolge, sonOlay });
  const turSatiri = sonTurMetni(sonTur);
  const riskSatiri = erimeMetni(erime);
  const bildirimBlogu = bildirimMetni(bildirim);

  return [
    MARKER,
    "This text is printed on every request. It is not written to history. Rules live in the system prompt.",
    ...bildirimBlogu,
    "",
    "## Score",
    `Ledger: penalties ${cezaTotal} · rewards ${odulTotal} · Points: ${puanText} (points come only from rewards; turns count toward seniority)`,
    ...durumSatiri,
    ...rutbeSatiri,
    ...turSatiri,
    ...riskSatiri,
    ...olaySatiri,
    ...izinSatiri(izin),
    "Points come only from contribution: learning +1 · discovery +2 · recovery +2 · transparency +1. Penalties: D −2/−5 · E −3/−5 (with risk, melting over 10 turns). A/B/C do not affect points. Turns are free; turns count toward seniority.",
    "",
    "Recent penalties:",
    formatRows(lastRows(ceza, 3)) || "(none)",
    "Recent rewards:",
    formatRows(lastRows(odul, 3)) || "(none)",
    "",
    ...rozetRows2,
    "",
    "## Learning index",
    titles.length ? titles.join("\n") : "(no entries yet)",
    "If a matching title exists, read OGRENME\\<name>.md.",
    "",
    "## Learning prompt",
    "If the turn produced a reusable lesson (same workflow, repeating error, project-specific fact): add a line to the index and write its recipe to OGRENME\\<name>.md.",
    "A good recipe: when to use it, the steps, how many times it was verified, last verification. Then you can do the same work again without rethinking.",
    "If it should become a rule, propose moving it to SKILL.md; it requires approval.",
    "",
    `Files: ${SKILL_DIR_NOTE}`,
  ].join("\n");
}

export function badgeLines(rozetText) {
  const text = String(rozetText || "");
  if (!text.trim()) {
    return ["## Rank", "Points: 0 · Rank: —", "Badges are earned with points; if lost, gates close."];
  }

  const durum = section(text, "## Rank", "## Open gates");
  const deger = (label) => {
    const row = tableRows(durum).find((cells) => cells[0] === label);
    return row ? (row[1] ?? "") : "";
  };

  const kapilar = section(text, "## Open gates", "## Next gates")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());

  const sonraki = section(text, "## Next gates", "## History")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());

  const olaylar = tableRows(section(text, "## History", null))
    .filter((cells) => cells[0] && cells[0] !== "Date")
    .slice(-3)
    .map((cells) => `${cells[0]} ${cells[1]} ${cells[2]}`);

  const goster = kapilar.slice(0, 4);
  if (kapilar.length > 4) goster.push(`+${kapilar.length - 4} more gates`);

  return [
    "## Rank",
    `Points: ${deger("Points") || "0"} · Seniority: ${deger("Seniority") || "0 clean turns"} · Rank: ${deger("Rank") || "—"} · Next: ${deger("Next") || "top"}`,
    "Open gates:",
    ...(goster.length ? goster.map((kapi) => `- ${kapi}`) : ["- (none)"]),
    ...(sonraki.length ? [`Next gates:`, ...sonraki.map((kapi) => `- ${kapi}`)] : []),
    "Retention: no D/E in the last 3 turns · buffer ≥5 safe · if you fall below the threshold, rank drops in the same turn.",
    "Earning: learning +1 · discovery +2 · recovery +2 · transparency +1. Turns are free; turns count toward seniority.",
    "If you lose it, these gates close in the same turn. Walls (SKILL.md, global install, deletion, payment, external writes) are asked one by one by default; if the user says 'This session + walls', they stay open for the session.",
    ...(olaylar.length ? [`Recent events: ${olaylar.join(" · ")}`] : []),
  ];
}

export function rutbeMetni({ rank, tampon, bolge, aktif, temizTur }) {
  if (rank === undefined || rank === null) return "Rank: —";
  if (rank < 0) return `Rank: — · no buffer · next bronze (0 points · 3 turns)`;
  const ad = ["bronze", "silver", "gold", "diamond 1", "diamond 2", "diamond 3", "diamond 4", "diamond 5"][rank] || `#${rank}`;
  const durum = aktif ? "active" : "suspended (needs 3 clean turns)";
  const renk = bolge === "guvenli" ? "safe" : bolge === "sari" ? "yellow" : "red";
  const t = Number.isFinite(tampon) ? tampon : "?";
  const kıdem = Number.isFinite(temizTur) ? ` · seniority ${temizTur} turns` : "";
  return `Rank: ${ad} (${durum}) · buffer ${t} (${renk})${kıdem}`;
}

export function olayMetni({ bolge, sonOlay }) {
  const satirlar = [];
  if (bolge === "kirmizi") satirlar.push("Warning: buffer 0 — one D/E mistake drops the rank.");
  const metin = String(sonOlay || "").trim();
  if (metin && /suspended|lost/.test(metin)) satirlar.push(`Attention: ${metin}`);
  return satirlar;
}

// Why the turn gained/lost points: the agent sees the consequence of its behavior.
export function sonTurMetni(sonTur) {
  if (!sonTur || typeof sonTur !== "object") return [];
  const ceza = Number(sonTur.ceza) || 0;
  const odul = Number(sonTur.odul) || 0;
  const onceki = Number(sonTur.onceki);
  const simdiki = Number(sonTur.puan);
  const parcalar = [];
  if (odul > 0) parcalar.push(`+${odul} rewards`);
  if (ceza > 0) {
    const satirlar = Array.isArray(sonTur.cezalar) && sonTur.cezalar.length ? ` (${sonTur.cezalar.join(", ")})` : "";
    parcalar.push(`−${ceza} penalties${satirlar}`);
  }
  if (!parcalar.length) parcalar.push("points unchanged (turn counted toward seniority)");
  const gecis = Number.isFinite(onceki) && Number.isFinite(simdiki) ? ` · points ${onceki} → ${simdiki}` : "";
  return [`Last turn: ${parcalar.join(" · ")}${gecis}`];
}

export function erimeMetni(erime) {
  if (!erime || typeof erime !== "object") return [];
  const risk = Number(erime.risk) || 0;
  if (!risk) return ["Risk window: clean (no penalties in effect)"];
  const kalan = Number(erime.kalanTur) || 0;
  const geri = Number(erime.geri) || 0;
  return [`Risk window: ${risk} risk · ${kalan} turns later ${geri} points return`];
}

export function bildirimMetni(bildirim) {
  if (!bildirim || typeof bildirim !== "object") return [];
  const rozet = String(bildirim.rozet || "?");
  const puan = Number(bildirim.puan) || 0;
  if (bildirim.tip === "kesif") {
    const arac = String(bildirim.arac || "new path");
    return [
      "## Discovery notice",
      `Congrats: you found a new path — ${arac} (+${puan}). If you write it as a recipe in OGRENME, you earn +1 more; then you can do the same work again without rethinking.`,
    ];
  }
  if (bildirim.tip === "kaybetti") {
    return ["## Rank notice", `Loss: ${rozet} dropped (${puan} points). Gates closed in the same turn; they reopen when points rise above the threshold.`];
  }
  return ["## Rank notice", `Congrats: you earned ${rozet} (${puan} points). New gates are described in the prompt note.`];
}

export function izinSatiri(izin) {
  if (!izin || !izin.kapsam) return ["Grant: none (every command is asked by rank)"];
  if (izin.kapsam === "sure" && izin.bitis && Number(izin.bitis) <= Date.now()) {
    return ["Grant: none (expired)"];
  }
  const ad =
    izin.kapsam === "tek"
      ? "Once"
      : izin.kapsam === "tur"
        ? "This turn"
        : izin.kapsam === "sure"
          ? "15 minutes"
          : izin.kapsam === "oturum+duvar"
            ? "This session + walls"
            : "This session";
  const kalan =
    izin.kapsam === "sure" && izin.bitis
      ? ` · ${Math.max(0, Math.round((Number(izin.bitis) - Date.now()) / 60000))} min left`
      : "";
  return [`Grant: ${ad}${kalan} — walls ${izin.kapsam === "oturum+duvar" ? "included" : "excluded"}`];
}

function firstMarker(text, markers) {
  const hits = markers
    .map((marker) => text.indexOf(marker))
    .filter((index) => index >= 0);
  if (!hits.length) return null;
  const min = Math.min(...hits);
  return markers.find((marker) => text.indexOf(marker) === min) ?? null;
}

function section(text, start, end) {
  const from = text.indexOf(start);
  if (from < 0) return "";
  const rest = text.slice(from + start.length);
  if (!end) return rest;
  const to = rest.indexOf(end);
  return to < 0 ? rest : rest.slice(0, to);
}

function tableRows(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|"))
    .filter((line) => !line.includes("---"))
    .filter((line) => !line.includes("| # |") && !line.includes("| Metric |"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean));
}

function formatRows(rows) {
  return rows.map((row) => {
    const text = row.join(" | ");
    return text.length > 160 ? `${text.slice(0, 160)}…` : text;
  }).join("\n");
}
