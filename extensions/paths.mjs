// Shared paths and initial setup.
// The package ships only code; data (rules, score, learning, badges) stays in the user's directory.

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = dirname(here);
export const AGENT_DIR = join(homedir(), ".pi", "agent");

// User-owned data that is not deleted on package upgrades.
export const DATA_DIR = join(AGENT_DIR, "user-character");
export const SCOREBOARD = join(DATA_DIR, "SCOREBOARD.md");
export const ROZET_MD = join(DATA_DIR, "ROZET.md");
export const LEARNING_MD = join(DATA_DIR, "OGRENME.md");
export const LEARNING_DIR = join(DATA_DIR, "OGRENME");
export const SKORCU_LOG = join(DATA_DIR, "skorcu.log");
export const ROZET_STATE = join(DATA_DIR, "rozet-durum.json");
export const PUAN_STATE = join(DATA_DIR, "puan-durum.json");
export const BLOCKED_MARKER = join(DATA_DIR, "skill-write-blocked.json");

// Rules and skill stay in Pi's own discovery paths.
export const CORE_MD = join(AGENT_DIR, "APPEND_SYSTEM.md");
export const SKILL_DIR = join(AGENT_DIR, "skills", "user-character");
export const SKILL_MD = join(SKILL_DIR, "SKILL.md");
export const LEGACY_RUBRIC = join(AGENT_DIR, "agents", "skorcu.md");

// Package-internal resources.
export const RUBRIC = join(PACKAGE_ROOT, "docs", "rubric.md");
export const TEMPLATES = join(PACKAGE_ROOT, "templates");

// Data migration from the old layout (pre-package).
const LEGACY = {
  [SCOREBOARD]: join(SKILL_DIR, "SCOREBOARD.md"),
  [ROZET_MD]: join(SKILL_DIR, "ROZET.md"),
  [LEARNING_MD]: join(SKILL_DIR, "OGRENME.md"),
};

export function ensureData() {
  try {
    mkdirSync(LEARNING_DIR, { recursive: true });
  } catch {
    // if the folder cannot be created, the read side treats it as empty
  }

  const seeds = [
    [SCOREBOARD, "SCOREBOARD.md"],
    [LEARNING_MD, "OGRENME.md"],
    [ROZET_MD, "ROZET.md"],
  ];

  for (const [target, name] of seeds) {
    if (existsSync(target)) continue;
    const legacy = LEGACY[target];
    if (legacy && existsSync(legacy)) {
      try {
        copyFileSync(legacy, target);
        continue;
      } catch {
        // if it cannot be copied, continue with the template
      }
    }
    const template = join(TEMPLATES, name);
    if (!existsSync(template)) continue;
    try {
      copyFileSync(template, target);
    } catch {
      // if it cannot be written, the hook runs with an empty ledger
    }
  }

  // Legacy learning recipes
  try {
    const legacyDir = join(SKILL_DIR, "OGRENME");
    if (existsSync(legacyDir)) {
      for (const name of readdirSync(legacyDir)) {
        const target = join(LEARNING_DIR, name);
        if (existsSync(target)) continue;
        try {
          copyFileSync(join(legacyDir, name), target);
        } catch {
          // a single file is skipped
        }
      }
    }
  } catch {
    // if the old folder does not exist, pass
  }

  // If SKILL.md does not exist, install it from the package template (the user edits it later).
  if (!existsSync(SKILL_MD)) {
    const template = join(TEMPLATES, "SKILL.md");
    if (existsSync(template)) {
      try {
        mkdirSync(SKILL_DIR, { recursive: true });
        copyFileSync(template, SKILL_MD);
      } catch {
        // if the skill file does not exist, the hook adds only the core
      }
    }
  }
}
