// Session-based permission and notification helpers.
// Read/delete errors are swallowed silently so the hook flow does not stop.

import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA_DIR } from "./paths.mjs";

const BILINMEYEN = "unknown";

const temizle = (deger) => String(deger ?? "")
  .replace(/[^A-Za-z0-9_-]/g, "_")
  .slice(0, 64);

export function oturumId(ctx) {
  const adaylar = [];

  try {
    adaylar.push(ctx?.sessionManager?.getSessionId?.());
  } catch {
    // if getSessionId throws, fall back to the next source
  }
  adaylar.push(ctx?.sessionId, process.env.PI_SESSION_ID);

  for (const aday of adaylar) {
    const ham = aday === undefined || aday === null ? "" : String(aday);
    if (ham.trim() === "") continue;
    const id = temizle(ham);
    if (id !== "") return id;
  }

  return BILINMEYEN;
}

export function izinYolu(id) {
  return join(DATA_DIR, `izin-${temizle(id) || BILINMEYEN}.json`);
}

export function bildirimYolu(id) {
  return join(DATA_DIR, `bildirim-${temizle(id) || BILINMEYEN}.json`);
}

const atomikYaz = (yol, metin) => {
  mkdirSync(dirname(yol), { recursive: true });
  const gecici = `${yol}.tmp`;
  const fd = openSync(gecici, "w");
  try {
    writeSync(fd, metin);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(gecici, yol);
  } catch (hata) {
    try {
      unlinkSync(gecici);
    } catch {
      // if the temporary file does not exist, pass
    }
    throw hata;
  }
};

export function izinOku(id, { now } = {}) {
  let veri;
  try {
    veri = JSON.parse(readFileSync(izinYolu(id), "utf8"));
  } catch {
    return null;
  }

  if (!veri || typeof veri !== "object") return null;
  if (veri.kapsam === "yok") return null;

  const bitis = veri.bitis ?? null;
  if (veri.kapsam === "sure") {
    const simdi = now === undefined ? Date.now() : Number(now);
    const son = Number(bitis);
    if (Number.isFinite(son) && son <= simdi) return null;
  }

  return { kapsam: veri.kapsam, bitis };
}

export function izinYaz(id, kapsam, { bitis } = {}) {
  atomikYaz(izinYolu(id), JSON.stringify({ kapsam, bitis: bitis ?? null }));
}

export function izinSil(id) {
  try {
    unlinkSync(izinYolu(id));
  } catch {
    // if the file does not exist or cannot be deleted, pass silently
  }
}

export function bildirimYaz(id, veri) {
  atomikYaz(bildirimYolu(id), JSON.stringify(veri));
}

export function bildirimOku(id) {
  try {
    return JSON.parse(readFileSync(bildirimYolu(id), "utf8"));
  } catch {
    return null;
  }
}

export function bildirimTemizle(id) {
  try {
    unlinkSync(bildirimYolu(id));
  } catch {
    // if the file does not exist or cannot be deleted, pass silently
  }
}

export function altAjanMi(env = process.env) {
  return env?.PI_SUBAGENT_CHILD === "1";
}
