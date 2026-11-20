// Ortak yollar ve ilk kurulum.
// Paket yalnız kod taşır; veri (kurallar, skor, öğrenme, rozet) kullanıcı dizininde kalır.

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = dirname(here);
export const AGENT_DIR = join(homedir(), ".pi", "agent");

// Kullanıcıya ait, paket güncellemesinde silinmeyen veri.
export const DATA_DIR = join(AGENT_DIR, "user-character");
export const SCOREBOARD = join(DATA_DIR, "SCOREBOARD.md");
export const ROZET_MD = join(DATA_DIR, "ROZET.md");
export const LEARNING_MD = join(DATA_DIR, "OGRENME.md");
export const LEARNING_DIR = join(DATA_DIR, "OGRENME");
export const SKORCU_LOG = join(DATA_DIR, "skorcu.log");
export const ROZET_STATE = join(DATA_DIR, "rozet-durum.json");
export const PUAN_STATE = join(DATA_DIR, "puan-durum.json");
export const BLOCKED_MARKER = join(DATA_DIR, "skill-write-blocked.json");

// Kurallar ve skill, Pi'nin kendi keşif yollarında kalır.
export const CORE_MD = join(AGENT_DIR, "APPEND_SYSTEM.md");
export const SKILL_DIR = join(AGENT_DIR, "skills", "user-character");
export const SKILL_MD = join(SKILL_DIR, "SKILL.md");
export const LEGACY_RUBRIC = join(AGENT_DIR, "agents", "skorcu.md");

// Paket içi kaynaklar.
export const RUBRIC = join(PACKAGE_ROOT, "docs", "rubric.md");
export const TEMPLATES = join(PACKAGE_ROOT, "templates");

// Eski yerleşimden (paket öncesi) veri taşıma.
const LEGACY = {
  [SCOREBOARD]: join(SKILL_DIR, "SCOREBOARD.md"),
  [ROZET_MD]: join(SKILL_DIR, "ROZET.md"),
  [LEARNING_MD]: join(SKILL_DIR, "OGRENME.md"),
};

export function ensureData() {
  try {
    mkdirSync(LEARNING_DIR, { recursive: true });
  } catch {
    // klasör oluşturulamazsa okuma tarafı boş kabul eder
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
        // kopyalanamazsa şablonla devam
      }
    }
    const template = join(TEMPLATES, name);
    if (!existsSync(template)) continue;
    try {
      copyFileSync(template, target);
    } catch {
      // yazılamazsa kanca boş defterle çalışır
    }
  }

  // Eski öğrenme tarifleri
  try {
    const legacyDir = join(SKILL_DIR, "OGRENME");
    if (existsSync(legacyDir)) {
      for (const name of readdirSync(legacyDir)) {
        const target = join(LEARNING_DIR, name);
        if (existsSync(target)) continue;
        try {
          copyFileSync(join(legacyDir, name), target);
        } catch {
          // tek dosya atlanır
        }
      }
    }
  } catch {
    // eski klasör yoksa geç
  }

  // SKILL.md yoksa paket şablonundan kur (kullanıcı sonra düzenler).
  if (!existsSync(SKILL_MD)) {
    const template = join(TEMPLATES, "SKILL.md");
    if (existsSync(template)) {
      try {
        mkdirSync(SKILL_DIR, { recursive: true });
        copyFileSync(template, SKILL_MD);
      } catch {
        // skill dosyası yoksa kanca yalnız çekirdeği ekler
      }
    }
  }
}
