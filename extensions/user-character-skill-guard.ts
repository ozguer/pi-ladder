// @ts-nocheck
// Yalnız karakter skill dosyası (SKILL.md) için ek onay kapısı.
// Pi'nin diğer araçlarına, dosyalarına ve akışına dokunmaz.

import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { SKILL_MD, BLOCKED_MARKER, ensureData } from "./paths.mjs";

export default function userCharacterSkillGuard(pi) {
  pi.on("tool_call", async (event, ctx) => {
    const toolName = event?.toolName;
    if (toolName !== "edit" && toolName !== "write") return;

    const input = event?.input ?? {};
    const raw = typeof input.path === "string" ? input.path : "";
    if (!raw.trim()) return;

    const target = resolve(ctx.cwd, raw);
    if (!samePath(target, SKILL_MD)) return;

    let approved = false;
    // Başsız oturumda (alt ajan / UI yok) onay sorulamaz: yazma engellenir, kanca çökmez.
    const uiVar = Boolean(ctx?.hasUI) && typeof ctx?.ui?.confirm === "function";
    try {
      if (uiVar) {
        approved = await ctx.ui.confirm(
          "Karakter skill dosyası",
          `Pi "${SKILL_MD}" dosyasını değiştirmek istiyor. Onaylıyor musun?`,
        );
      }
    } catch {
      approved = false;
    }

    if (!approved) {
      ensureData();
      try {
        writeFileSync(BLOCKED_MARKER, JSON.stringify({ at: Date.now(), path: SKILL_MD }), "utf8");
      } catch {
        // işaret yazılamazsa yalnız engelle
      }
      try {
        pi.events.emit("user-character:skill-write-blocked", { at: Date.now(), path: SKILL_MD });
      } catch {
        // olay yolu yoksa ceza yine skorcu tarafından yazılır
      }
      return {
        block: true,
        reason: "Kullanıcı onayı yok: karakter skill dosyası değiştirilemez.",
      };
    }

    try {
      pi.events.emit("user-character:skill-write-approved", { path: SKILL_MD, at: Date.now() });
    } catch {
      // bildirim başarısız olsa da yazma onaylı
    }
  });
}

function samePath(a, b) {
  const norm = (value) => String(value).replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
  return norm(a) === norm(b);
}
