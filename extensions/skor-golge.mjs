// Gölge skor çekirdeği.
// Görünen skoru değiştirmeden yeni skor hattını yan yana çalıştırır.
// Kancalara bağlanmak bu modülün sorumluluğunda değildir.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { isBirimiAnahtari } from "./skor-model.mjs";
import { oturumId } from "./oturum.mjs";
import { olayYaz } from "./skor-store.mjs";

export const GOLGE_PENCERE_MS = 30 * 24 * 60 * 60 * 1000;

const sayi = (deger) => {
  const n = Number(deger);
  return Number.isFinite(n) ? n : 0;
};

export function isBirimi({ ctx, istekMetni, dosyalar, diffHash } = {}) {
  return {
    key: isBirimiAnahtari({ istekMetni, dosyalar, diffHash }),
    oturum: oturumId(ctx),
  };
}

export function golgeKaydet({
  yol,
  tip,
  key,
  anahtarPenceresi,
  delta,
  kaynak,
  ctx,
  simdi,
} = {}) {
  const olay = {
    tip,
    anahtar: key,
    ts: simdi ?? Date.now(),
    oturum: oturumId(ctx),
  };
  if (tip !== "legacy" && delta !== undefined) olay.delta = delta;
  if (kaynak !== undefined) olay.kaynak = kaynak;

  const pencere = anahtarPenceresi === undefined ? GOLGE_PENCERE_MS : anahtarPenceresi;
  return olayYaz(yol, olay, { pencereMs: pencere });
}

export function golgeKarsilastir({ eskiPuan, durum } = {}) {
  const eski = sayi(eskiPuan);
  const yeni = sayi(durum?.yetki);
  const fark = yeni - eski;
  const yuzde = eski > 0 ? Math.round((fark / eski) * 1000) / 10 : null;
  return { ayni: fark === 0, eski, yeni, fark, yuzde };
}

const kisaKey = (key) => `${String(key ?? "").slice(0, 12)}…`;

const yuzdeMetni = (yuzde) => {
  if (yuzde === null || yuzde === undefined) return "";
  const n = sayi(yuzde);
  return ` ${n >= 0 ? "+" : ""}${n}%`;
};

export function golgeLogla({ logYolu, kayit } = {}) {
  const k = kayit && typeof kayit === "object" ? kayit : {};
  const iso = new Date().toISOString();
  const satir =
    `${iso} | ${String(k.tip ?? "")} | ${kisaKey(k.key)} | ` +
    `${sayi(k.eski)} → ${sayi(k.yeni)} | ${sayi(k.fark)}${yuzdeMetni(k.yuzde)}`;

  try {
    mkdirSync(dirname(logYolu), { recursive: true });
    appendFileSync(logYolu, `${satir}\n`, "utf8");
  } catch {
    // Gölge hattı görünen akışı durdurmaz; yazma hatası yutulur.
  }

  return satir;
}
