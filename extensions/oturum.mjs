// Oturum bazlı izin ve bildirim yardımcıları.
// Kanca akışını durdurmamak için okuma/silme hataları sessizce yutulur.

import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA_DIR } from "./paths.mjs";

const BILINMEYEN = "bilinmeyen";

const temizle = (deger) => String(deger ?? "")
  .replace(/[^A-Za-z0-9_-]/g, "_")
  .slice(0, 64);

export function oturumId(ctx) {
  const adaylar = [];

  try {
    adaylar.push(ctx?.sessionManager?.getSessionId?.());
  } catch {
    // getSessionId hata verirse sonraki kaynağa düş
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
      // geçici dosya zaten yoksa geç
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
    // dosya yoksa veya silinemezse sessiz geç
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
    // dosya yoksa veya silinemezse sessiz geç
  }
}

export function altAjanMi(env = process.env) {
  return env?.PI_SUBAGENT_CHILD === "1";
}
