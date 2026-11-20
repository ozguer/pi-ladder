// Gölge not çekirdeği.
// Görünen notu değiştirmeden yeni notu yan yana üretir ve isteğe bağlı loglar.
// Hiçbir koşulda throw etmez; kanca akışını durdurmaz.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { notMetni } from "./skor-politika.mjs";

const VARSAYILAN_GUNLUK = { isBirimi: 0, tavan: 3, tekrar: 0 };

const sayi = (deger) => {
  const n = Number(deger);
  return deger === undefined || deger === null || !Number.isFinite(n) ? 0 : n;
};

const nesne = (deger) => (deger && typeof deger === "object" ? deger : {});

export function notGirdisi({ ctx, durum, izin, son, gunluk } = {}) {
  const d = nesne(durum);
  const gunlukVeri = gunluk ?? d.gunluk ?? VARSAYILAN_GUNLUK;

  return {
    yetki: sayi(d.yetki),
    merit: sayi(d.merit),
    rank: sayi(d.rank),
    aktif: typeof d.aktif === "boolean" ? d.aktif : true,
    son,
    izin,
    gunluk: gunlukVeri ?? VARSAYILAN_GUNLUK,
  };
}

export function notGolge({ ctx, durum, izin, son, eskiMetin, logYolu, simdi } = {}) {
  try {
    const metin = notMetni(notGirdisi({ ctx, durum, izin, son }));
    const uzunluk = metin.length;
    const uygun = uzunluk <= 1200;
    const eski = String(eskiMetin ?? "").length;
    const fark = uzunluk - eski;

    let loglandi = false;
    if (logYolu !== undefined && logYolu !== null && logYolu !== "") {
      try {
        const ham = simdi === undefined || simdi === null ? Date.now() : Number(simdi);
        const iso = new Date(Number.isFinite(ham) ? ham : Date.now()).toISOString();
        mkdirSync(dirname(logYolu), { recursive: true });
        appendFileSync(
          logYolu,
          `${iso} | not | uzunluk=${uzunluk} uygun=${uygun} eski=${eski} fark=${fark}\n`,
          "utf8",
        );
        loglandi = true;
      } catch {
        loglandi = false;
      }
    }

    return { metin, uzunluk, uygun, loglandi };
  } catch {
    return { metin: "", uzunluk: 0, uygun: false, loglandi: false };
  }
}
