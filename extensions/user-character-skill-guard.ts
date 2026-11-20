// @ts-nocheck
// Extra approval gate only for the character skill file (SKILL.md).
// It does not touch other Pi tools, files, or flow.

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
    // In a headless session (subagent / no UI) approval cannot be requested: the write is blocked and the hook does not crash.
    const uiVar = Boolean(ctx?.hasUI) && typeof ctx?.ui?.confirm === "function";
    try {
      if (uiVar) {
        approved = await ctx.ui.confirm(
          "Character skill file",
          `Pi wants to change "${SKILL_MD}". Approve?`,
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
        // if the marker cannot be written, just block
      }
      try {
        pi.events.emit("user-character:skill-write-blocked", { at: Date.now(), path: SKILL_MD });
      } catch {
        // if there is no event path, the penalty is still written by the scorer
      }
      return {
        block: true,
        reason: "No user approval: the character skill file cannot be changed.",
      };
    }

    try {
      pi.events.emit("user-character:skill-write-approved", { path: SKILL_MD, at: Date.now() });
    } catch {
      // even if the notification fails, the write is approved
    }
  });
}

function samePath(a, b) {
  const norm = (value) => String(value).replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
  return norm(a) === norm(b);
}
