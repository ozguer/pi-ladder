import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MARKER } from "./user-character-inject.mjs";
import { durumHesapla } from "./skor-model.mjs";
import { olaylariOku } from "./skor-store.mjs";
import { notMetni } from "./skor-politika.mjs";
import { izinOku, oturumId } from "./oturum.mjs";
import { CORE_MD, SKILL_MD, DATA_DIR, ensureData } from "./paths.mjs";

const CORE_MARKER = "user-character:core";

export default function userCharacter(pi: ExtensionAPI) {
  // Rules: in the system prompt, once per run. The hook reads them; reading is not left to the model.
  pi.on("before_agent_start", async (event) => {
    try {
      ensureData();
      const options = event.systemPromptOptions;
      if (!options) return;

      const current = typeof options.appendSystemPrompt === "string" ? options.appendSystemPrompt : "";
      const hasCore = String(event.systemPrompt ?? "").includes(CORE_MARKER);
      const core = hasCore ? "" : stripBookkeeping(readOptional(CORE_MD));
      const addendum = stripFrontmatter(readOptional(SKILL_MD));

      const parts = [current, core, addendum].filter((part) => part && part.trim());
      options.appendSystemPrompt = parts.join("\n\n");
    } catch {
      return;
    }
  });

  // Score: a small note on every request.
  pi.on("context", async (event, ctx) => {
    try {
      ensureData();
      if (event.messages.some((message) => containsMarker(message, MARKER))) return;

      const durum = durumHesapla(olaylariOku(join(DATA_DIR, "skor-olaylar.jsonl")).olaylar, {
        simdi: Date.now(),
      });
      const izin = izinOku(oturumId(ctx)) ?? "yok";
      const govde = notMetni({
        yetki: durum.yetki,
        merit: durum.merit,
        rank: durum.rank,
        aktif: durum.aktif,
        son: sonOlayMetni(),
        izin: izinEtiketi(izin),
        gunluk: durum.gunluk,
      });
      if (govde.length > 1200) console.warn(`user-character: not ${govde.length} > 1200`);

      const injected = {
        role: "user" as const,
        content: [{ type: "text" as const, text: `${MARKER}\n${govde}` }],
        timestamp: Date.now(),
      };
      const insertAt = firstNonCompactionSummaryIndex(event.messages);
      return {
        messages: [
          ...event.messages.slice(0, insertAt),
          injected,
          ...event.messages.slice(insertAt),
        ],
      };
    } catch (hata) {
      console.warn(`user-character-error: ${hata instanceof Error ? hata.message : String(hata)}`);
      return;
    }
  });
}

function stripBookkeeping(text: string): string {
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .filter((line) => !line.includes(CORE_MARKER))
    .filter((line) => !line.startsWith("> Ek maddeler:"))
    .join("\n")
    .replace(/^# Kullanıcı karakter kuralları \(çekirdek\)\s*/m, "# User character rules\n\n")
    .trim();
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

function readOptional(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function readSonOlay(): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(DATA_DIR, "rozet-durum.json"), "utf8"));
    const rows = Array.isArray(parsed?.gecmis) ? parsed.gecmis : [];
    const son = rows[rows.length - 1];
    if (!son) return undefined;
    const bugun = new Date().toISOString().slice(0, 10);
    if (son.tarih !== bugun) return undefined;
    return `${son.olay} ${son.rozet} (${son.puan} points)`;
  } catch {
    return undefined;
  }
}

function sonOlayMetni(): string {
  const son = readSonOlay();
  if (!son) return "—";
  const tekSatir = son.replace(/\s+/gu, " ").trim();
  return tekSatir || "—";
}

function izinEtiketi(izin: { kapsam?: string } | "yok"): string {
  if (izin === "yok") return "none";
  const kapsam = String(izin?.kapsam ?? "");
  if (kapsam === "tek") return "Once";
  if (kapsam === "tur") return "This turn";
  if (kapsam === "sure") return "15 minutes";
  if (kapsam === "oturum+duvar") return "This session + walls";
  return kapsam ? "This session" : "none";
}

function containsMarker(message: unknown, marker: string): boolean {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.includes(marker);
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    return (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string" &&
      (part as { text: string }).text.includes(marker)
    );
  });
}

function firstNonCompactionSummaryIndex(messages: readonly unknown[]): number {
  let index = 0;
  while ((messages[index] as { role?: unknown } | undefined)?.role === "compactionSummary") {
    index += 1;
  }
  return index;
}
