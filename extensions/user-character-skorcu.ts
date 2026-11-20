// @ts-nocheck
// user-character scorer hook.
// When the turn ends (agent_settled) it calls the model with a separate message list and writes the verdict to the event log.
// SCOREBOARD.md and ROZET.md are views regenerated from the event log.
// No subagent/delegation. Runs in the main session, not in a subagent session.

import { readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import {
  SCOREBOARD,
  ROZET_MD,
  ROZET_STATE,
  SKILL_MD,
  CORE_MD,
  SKORCU_LOG,
  BLOCKED_MARKER,
  RUBRIC,
  LEGACY_RUBRIC,
  LEARNING_MD,
  LEARNING_DIR,
  DATA_DIR,
  ensureData,
} from "./paths.mjs";
import { compactTranscript } from "./user-character-rozet-core.mjs";
import { kararOlaylari, duvarCezasi, itirazCikar, itirazUygula } from "./skor-karar.mjs";
import { olayYaz, olaylariOku } from "./skor-store.mjs";
import { PENCERE_MS, cezaDeltasi } from "./skor-model.mjs";
import { POLITIKA } from "./skor-politika.mjs";
import { durumOzeti, skorbordMetni, rozetMetni } from "./skor-gorun.mjs";
import { join } from "node:path";

const PKG_RUBRIC = RUBRIC;
const OLD_RUBRIC = LEGACY_RUBRIC;

export default function userCharacterSkorcu(pi) {
  if (process.env.PI_SUBAGENT_CHILD === "1") return;

  let busy = false;
  let lastReviewedId = null;
  let lastLearningState = null;
  let approvedSkillWrite = false;
  let gateOlaylari = [];

  try {
    pi.events.on("user-character:skill-write-approved", () => {
      approvedSkillWrite = true;
    });
  } catch {
    // if there is no event path, approval information counts as NO
  }

  try {
    pi.events.on("user-character:gate", (data) => {
      if (!data || typeof data !== "object") return;
      gateOlaylari.push({ tool: String(data.tool || "?"), karar: String(data.karar || "?"), kapsam: data.toplu ? String(data.kapsam || "toplu") : "" });
    });
  } catch {
    // if there is no event path, gate information counts as "none"
  }

  function gateOzeti() {
    if (!gateOlaylari.length) return "none (gate never consulted)";
    const sayac = new Map();
    for (const olay of gateOlaylari) {
      const key = `${olay.karar}${olay.kapsam ? `(${olay.kapsam})` : ""}: ${olay.tool}`;
      sayac.set(key, (sayac.get(key) || 0) + 1);
    }
    return [...sayac.entries()].map(([key, n]) => (n > 1 ? `${key} x${n}` : key)).join(", ");
  }

  pi.on("agent_settled", async (_event, ctx) => {
    if (busy) return;
    busy = true;
    try {
      ensureData();
      if (!ctx.model || !ctx.modelRegistry?.complete) {
        logLine("model-registry-missing");
        return;
      }

      const blocked = takeBlocked();
      const { text, lastId, mesajlar } = newTranscript(ctx, lastReviewedId);
      if (!text.trim()) return;

      const rubric = stripFrontmatter(readOptional(PKG_RUBRIC) || readOptional(OLD_RUBRIC));
      const core = stripBookkeeping(readOptional(CORE_MD));
      const addendum = stripFrontmatter(readOptional(SKILL_MD));

      const learningState = snapshotLearning();
      const wroteLearning = lastLearningState === null ? "UNKNOWN" : learningState !== lastLearningState ? "YES" : "NO";
      lastLearningState = learningState;

      const istek = {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: `${rubric}\n\n---\n\n## Rules in effect (core)\n\n${core}\n\n## Additional clauses\n\n${addendum}\n\n---\n\nWas learning written: ${wroteLearning}\nSKILL.md write approval: ${approvedSkillWrite ? "YES" : "NO"}\nSKILL.md write blocked by the hook: ${blocked ? "YES" : "NO"}\nRank gate this turn: ${gateOzeti()}\nThe hook already wrote the penalty for a blocked attempt; do not write a penalty for the same attempt.\nApproved or released work is not a penalty.\n\nScore the following turn.\n\n\`\`\`turn\n${text}\n\`\`\`` }],
          },
        ],
      };

      let out = await ctx.modelRegistry.complete(ctx.model, istek, {});
      let answer = textOf(out?.content);
      if (!answer) {
        // Empty answer: retry once, then move on silently.
        await new Promise((resolve) => setTimeout(resolve, 500));
        out = await ctx.modelRegistry.complete(ctx.model, istek, {});
        answer = textOf(out?.content);
      }
      lastReviewedId = lastId;

      if (!answer) {
        const kinds = Array.isArray(out?.content)
          ? out.content.map((part) => part?.type ?? "?").join(",")
          : typeof out?.content;
        logLine(`empty-answer: content=[${kinds}]`);
        return;
      }

      const parsed = parseVerdict(answer);
      if (!parsed) logLine(`format-error: ${answer.replace(/\s+/g, " ").slice(0, 300)}`);
      const verdict = parsed ?? { ceza: [], odul: [], rozet: [] };
      verdict.rozet = [];

      const simdi = Date.now();
      const istekMetni = sonIstekSatiri(text);
      const testGecti = bashTestGecti(mesajlar);
      let olaylar = [];
      let ozet = null;

      try {
        const temel = kararOlaylari({ mesajlar, testGecti, istekMetni, simdi });
        const itirazlar = itirazCikar({ cevapMetni: { ceza: verdict.ceza } });
        const uygulanan = itirazUygula({ yargi: temel.yargi, itirazlar, mesajlar });
        for (const red of uygulanan.red) logLine(`objection-rejected: ${red.sebep}`);

        olaylar = [...temel.olaylar];

        // Wall insistence: 3 blocked attempts on the same day → one E per day.
        try {
          const gun = new Date(simdi).toISOString().slice(0, 10);
          const log = readFileSync(SKORCU_LOG, "utf8");
          const duvar = duvarCezasi({ logMetni: log, tarih: gun, ts: simdi });
          if (duvar) {
            olaylar.push(duvar);
            logLine(`wall-penalty: ${duvar.kanit}`);
          }
        } catch {
          // if the log cannot be read, no penalty is written (fail-safe)
        }
        for (const kabul of uygulanan.kabul) {
          const varMi = olaylar.some(
            (olay) =>
              olay.tip === "ceza" &&
              String(olay.grup || "").toUpperCase() === kabul.grup &&
              String(olay.kanit || "").trim() === kabul.kanit,
          );
          if (varMi) continue;
          olaylar.push({
            tip: "ceza",
            delta: cezaDeltasi({ grup: kabul.grup, derece: kabul.derece }),
            grup: kabul.grup,
            derece: kabul.derece,
            kanit: kabul.kanit,
            ts: simdi,
          });
        }

        if (blocked) {
          olaylar.unshift({
            tip: "ceza",
            delta: cezaDeltasi({ grup: "E", derece: 5 }),
            grup: "E",
            derece: 5,
            kanit: "hook blocked",
            ts: simdi,
          });
          logLine("hook: SKILL.md write blocked, penalty written");
        }

        if (wroteLearning === "YES") {
          olaylar.push({ tip: "merit", kaynak: "ogrenme", kanit: "LEARNING changed", ts: simdi });
          logLine("hook: learning reward written (+1)");
        }

        const olayYolu = join(DATA_DIR, "skor-olaylar.jsonl");
        for (const olay of olaylar) {
          const pencereMs = olay.tip === "istek" ? PENCERE_MS : olay.tip === "merit" ? Infinity : 0;
          const sonuc = olayYaz(olayYolu, olay, { pencereMs });
          logLine(
            `event: ${olay.tip}${olay.grup ? `/${olay.grup}` : ""} ${sonuc?.yazildi ? "written" : "duplicate"} key=${String(olay.anahtar ?? "-").slice(0, 20)}`,
          );
        }

        const hepsi = olaylariOku(olayYolu).olaylar;
        ozet = durumOzeti(hepsi, { simdi });
        const tarih = new Date(simdi).toISOString().slice(0, 10);
        const odulSatirlari = hepsi
          .filter((olay) => olay?.tip === "merit")
          .slice(-50)
          .reverse()
          .map((olay) => ({
            tarih: olay.ts,
            ne: olay.kaynak,
            kanit: olay.kanit,
            puan: POLITIKA.odul[String(olay.kaynak || "").toLowerCase()] ?? olay.delta,
          }));
        const board = skorbordMetni({ durum: ozet, satirlar: { ceza: ozet.sonCezalar, odul: odulSatirlari }, tarih });
        const rozet = rozetMetni({ durum: ozet, gecmis: rozetGecmisi(), tarih });
        writeFileSync(SCOREBOARD, board, "utf8");
        writeFileSync(ROZET_MD, rozet, "utf8");
      } catch (hata) {
        logLine(`verdict-error: ${hata instanceof Error ? hata.message : String(hata)}`);
      }

      // If a discovery reward was written, show the agent a one-time congratulation.
      const kesif = verdict.odul.find((row) => /^keşif\s*:/i.test(String(row?.ne || "").trim()));
      if (kesif) {
        try {
          writeFileSync(
            join(DATA_DIR, "kesif-bildirim.json"),
            JSON.stringify(
              {
                tip: "kesif",
                arac: String(kesif.ne).replace(/^keşif\s*:\s*/i, "").slice(0, 120),
                puan: Number(kesif.puan) || 2,
                tarih: new Date().toISOString().slice(0, 10),
              },
              null,
              2,
            ),
            "utf8",
          );
        } catch {
          // if the notification cannot be written, the reward stays in the ledger and the congratulation is not shown
        }
      }
      const cezaSayi = olaylar.filter((olay) => olay.tip === "ceza").length;
      const meritSayi = olaylar.filter((olay) => olay.tip === "merit").length;
      try {
        pi.events.emit("user-character:score-written", { ceza: cezaSayi, odul: meritSayi, risk: cezaSayi });
      } catch {
        // if there is no event path, the badge hook syncs at the end of the turn
      }
      if (!olaylar.length) {
        logLine(`ran: NONE text=${text.length}b authority=${ozet?.yetki ?? "?"}`);
      } else {
        logLine(`ran: events=${olaylar.length} penalties=${cezaSayi} merit=${meritSayi} authority=${ozet?.yetki ?? "?"}`);
      }
    } catch (error) {
      logLine(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      busy = false;
      approvedSkillWrite = false;
      gateOlaylari = [];
    }
  });
}

function logLine(message) {
  try {
    let previous = "";
    try {
      previous = readFileSync(SKORCU_LOG, "utf8");
    } catch {
      previous = "";
    }
    if (previous.length > 200000) previous = previous.slice(-100000);
    writeFileSync(SKORCU_LOG, `${previous}${previous && !previous.endsWith("\n") ? "\n" : ""}${new Date().toISOString()} ${message}\n`);
  } catch {
    // if the log cannot be written there is nothing else to do
  }
}

function takeBlocked() {
  try {
    readFileSync(BLOCKED_MARKER, "utf8");
    rmSync(BLOCKED_MARKER, { force: true });
    return true;
  } catch {
    return false;
  }
}

function newTranscript(ctx, afterId) {
  let entries = [];
  try {
    entries = ctx.sessionManager.getEntries();
  } catch {
    return { text: "", lastId: afterId, mesajlar: [] };
  }

  const messages = entries.filter((e) => e?.type === "message" && (e.message?.role === "user" || e.message?.role === "assistant" || e.message?.role === "toolResult"));

  let startIndex = 0;
  const lastUserIndex = () => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].message.role === "user") return i;
    }
    return 0;
  };
  if (afterId) {
    const idx = messages.findIndex((e) => e.id === afterId);
    startIndex = idx >= 0 ? idx + 1 : lastUserIndex();
  } else {
    startIndex = lastUserIndex();
  }

  const picked = messages.slice(startIndex);
  const items = [];
  for (const entry of picked) {
    const message = entry.message;
    const role = message.role;
    if (role === "user") {
      items.push({ role: "user", text: textOf(message.content) });
    } else if (role === "assistant") {
      items.push({ role: "assistant", text: textOf(message.content), calls: toolCalls(message.content) });
    } else if (role === "toolResult") {
      items.push({ role: "toolResult", text: textOf(message.content), isError: Boolean(message.isError) });
    }
  }
  const lastId = picked.length ? picked[picked.length - 1].id : afterId;
  return { text: compactTranscript(items), lastId, mesajlar: picked.map((entry) => entry.message) };
}

function sonIstekSatiri(text) {
  const satirlar = String(text || "").split(/\r?\n/);
  for (let i = satirlar.length - 1; i >= 0; i -= 1) {
    if (satirlar[i].startsWith("K: ")) return satirlar[i].slice(3).trim();
  }
  return "";
}

function bashTestGecti(mesajlar) {
  for (const mesaj of Array.isArray(mesajlar) ? mesajlar : []) {
    if (!mesaj || mesaj.role !== "toolResult") continue;
    if (String(mesaj.toolName || "").toLowerCase() !== "bash") continue;
    if (mesaj.isError === true) continue;
    if (/\bpass\b|\bok\b/i.test(textOf(mesaj.content))) return true;
  }
  return false;
}

function rozetGecmisi() {
  try {
    const parsed = JSON.parse(readFileSync(ROZET_STATE, "utf8"));
    return Array.isArray(parsed.gecmis) ? parsed.gecmis : [];
  } catch {
    return [];
  }
}

function textOf(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join(" ")
    .trim();
}

function toolCalls(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const part of content) {
    if (!part || part.type !== "toolCall" || typeof part.name !== "string") continue;
    out.push(`${part.name} ${argOzeti(part.arguments)}`.trim());
  }
  return out;
}

// Only the distinguishing field of a tool call: path, command, pattern, query.
function argOzeti(args) {
  if (!args || typeof args !== "object") return "";
  for (const key of ["path", "command", "pattern", "query", "url", "name"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.replace(/\s+/g, " ").slice(0, 100);
  }
  try {
    return JSON.stringify(args).slice(0, 100);
  } catch {
    return "";
  }
}

function readOptional(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function snapshotLearning() {
  const parts = [readOptional(LEARNING_MD)];
  try {
    for (const name of readdirSync(LEARNING_DIR).sort()) {
      parts.push(name);
    }
  } catch {
    // if the folder does not exist, only the index
  }
  return parts.join("\n");
}

function stripFrontmatter(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return match ? match[1] : content;
}

function stripBookkeeping(text) {
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .filter((line) => !line.includes("user-character:core"))
    .filter((line) => !line.startsWith("> Ek maddeler:"))
    .join("\n")
    .replace(/^# Kullanıcı karakter kuralları \(çekirdek\)\s*/m, "# User character rules\n\n")
    .trim();
}

function parseVerdict(text) {
  let raw = String(text).trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  const list = (value) => (Array.isArray(value) ? value : []);
  return { ceza: list(parsed.ceza), odul: list(parsed.odul), rozet: list(parsed.rozet) };
}
