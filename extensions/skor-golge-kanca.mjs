// Gölge skor köprüsü: skorcu kancasından gelen tur verisini gölge hattına aktarır.
// Görünen skoru değiştirmez; yalnız skor-olaylar.jsonl ve skor-golge.log dosyalarına yazar.

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA_DIR } from "./paths.mjs";
import { altAjanMi } from "./oturum.mjs";
import { durumHesapla, isBirimiAnahtari } from "./skor-model.mjs";
import {
  GOLGE_PENCERE_MS,
  golgeKaydet,
  golgeKarsilastir,
  golgeLogla,
} from "./skor-golge.mjs";
import { olaylariOku } from "./skor-store.mjs";
import { transcriptCikar, yargiCikar } from "./skor-yargic.mjs";

const GUNLUK_YOL = join(DATA_DIR, "skor-olaylar.jsonl");
const GUNLUK_LOG_YOL = join(DATA_DIR, "skor-golge.log");

const sha256 = (metin) =>
  createHash("sha256").update(String(metin ?? ""), "utf8").digest("hex");

const sonIstekMetni = (text) => {
  const satirlar = String(text ?? "").split(/\r?\n/);
  for (let i = satirlar.length - 1; i >= 0; i -= 1) {
    if (satirlar[i].startsWith("K: ")) return satirlar[i].slice(3).trim();
  }
  return "";
};

const dosyalariCikar = (ctx) => {
  const entries = ctx?.sessionManager?.getEntries?.() ?? [];
  const kume = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const icerik = entry?.message?.content;
    if (!Array.isArray(icerik)) continue;
    for (const parca of icerik) {
      if (!parca || typeof parca !== "object") continue;
      if (parca.type !== "toolCall") continue;
      const yol = parca.arguments?.path;
      if (typeof yol === "string" && yol.trim()) kume.add(yol);
    }
  }
  return [...kume].sort();
};

const meritKaynagi = (ne) => {
  const metin = String(ne ?? "").toLocaleLowerCase("tr-TR").trim();
  if (!metin) return null;
  if (metin.includes("keşif") || metin.includes("kesif")) return "kesif";
  if (metin.includes("öğrenme") || metin.includes("ogrenme")) return "ogrenme";
  if (metin.includes("kurtarma")) return "kurtarma";
  if (metin.includes("şeffaflık") || metin.includes("seffaflik")) return "seffaflik";
  return null;
};

const meritAnahtari = (kaynak, ne) => `ders:${kaynak}:${sha256(ne).slice(0, 12)}`;

const hataMetni = (hata) => (hata instanceof Error ? hata.message : String(hata));

const bosYargi = () => ({
  risk: 0,
  work: false,
  dE: [],
  odul: [],
  gerekce: "kanıt yok",
});

const guvenliYargi = (deger) => ({
  risk: Number(deger?.risk) || 0,
  work: deger?.work === true,
  dE: Array.isArray(deger?.dE) ? deger.dE : [],
  odul: Array.isArray(deger?.odul) ? deger.odul : [],
  gerekce: typeof deger?.gerekce === "string" ? deger.gerekce : "kanıt yok",
});

export function yargicKarsilastir({ mesajlar, eskiRisk, eskiWork, testGecti } = {}) {
  const eskiR = Number.isFinite(Number(eskiRisk)) ? Number(eskiRisk) : 0;
  const eskiW = eskiWork === true;

  if (!Array.isArray(mesajlar) || mesajlar.length === 0) {
    return {
      yeni: bosYargi(),
      uyumlu: eskiR === 0 && eskiW === false,
      farkRisk: -eskiR,
      farkWork: false,
    };
  }

  let yeni;
  try {
    yeni = guvenliYargi(yargiCikar(transcriptCikar(mesajlar), { testGecti }));
  } catch {
    yeni = bosYargi();
  }

  return {
    yeni,
    uyumlu: yeni.risk === eskiR && yeni.work === eskiW,
    farkRisk: yeni.risk - eskiR,
    farkWork: yeni.work !== eskiW,
  };
}

const mesajlaraCevir = (entries) => {
  if (!Array.isArray(entries)) return null;
  return entries.map((entry) =>
    entry && typeof entry === "object" && entry.type === "message" && entry.message
      ? entry.message
      : entry,
  );
};

const mesajlariAl = (kaynak, ctx) => {
  const ham = kaynak?.mesajlar;
  if (ham === null) return null;
  if (ham !== undefined) return Array.isArray(ham) ? ham : null;
  try {
    return mesajlaraCevir(ctx?.sessionManager?.getEntries?.());
  } catch {
    return null;
  }
};

const dEMetni = (dE) => {
  if (!Array.isArray(dE) || dE.length === 0) return "yok";
  return dE.map((kayit) => `${kayit?.grup ?? "?"}${kayit?.derece ?? "?"}`).join(",");
};

const yargicLogla = ({ eskiRisk, eskiWork, yargic }) => {
  const iso = new Date().toISOString();
  const yeni = yargic?.yeni ?? bosYargi();
  const satir =
    `${iso} | yargic | eski(D${eskiRisk}/${eskiWork}) → yeni(D${yeni.risk}/${yeni.work})` +
    ` | dE:${dEMetni(yeni.dE)} uyumlu=${yargic?.uyumlu === true}`;
  try {
    mkdirSync(dirname(GUNLUK_LOG_YOL), { recursive: true });
    appendFileSync(GUNLUK_LOG_YOL, `${satir}\n`, "utf8");
  } catch {
    // Gölge hattı görünen akışı durdurmaz; log yazma hatası yutulur.
  }
  return satir;
};

export function golgeIsle(girdi = {}) {
  let yazilan = 0;
  let tekrar = 0;
  let karsilastirma = null;
  let yargic = null;
  let sonAnahtar = "golge";

  try {
    const kaynak = girdi && typeof girdi === "object" ? girdi : {};
    const { ctx, text, verdict, risk, work, oncekiPuan, simdi, testGecti } = kaynak;

    if (altAjanMi()) return { yazilan: 0, tekrar: 0, karsilastirma: null };

    const an = Number.isFinite(Number(simdi)) ? Number(simdi) : Date.now();

    const mesajlar = mesajlariAl(kaynak, ctx);
    const mesajlarVar = mesajlar !== null;
    if (mesajlarVar) {
      yargic = yargicKarsilastir({ mesajlar, eskiRisk: risk, eskiWork: work, testGecti });
    }

    const etkinRisk = mesajlarVar ? yargic.yeni.risk : risk;
    const etkinWork = mesajlarVar ? yargic.yeni.work : work;

    if (etkinWork === true && etkinRisk === 0) {
      const istekMetni = sonIstekMetni(text);
      const dosyalar = dosyalariCikar(ctx);
      // Gerçek diff değil; gölge karşılaştırması için iş parmak izi proxy'si.
      const diffHash = sha256(dosyalar.join("|"));
      const key = isBirimiAnahtari({ istekMetni, dosyalar, diffHash });
      sonAnahtar = key;
      const sonuc = golgeKaydet({
        yol: GUNLUK_YOL,
        tip: "istek",
        key,
        anahtarPenceresi: GOLGE_PENCERE_MS,
        delta: 1,
        ctx,
        simdi: an,
      });
      if (sonuc.yazildi) yazilan += 1;
      else if (sonuc.tekrar) tekrar += 1;
    } else {
      // Cezalar bu turda gölge hattına taşınmıyor; yalnız iş ve merit olayları yazılır.
    }

    const oduller = Array.isArray(verdict?.odul) ? verdict.odul : [];
    for (const satir of oduller) {
      if (!satir || typeof satir !== "object") continue;
      const kaynak = meritKaynagi(satir.ne);
      if (!kaynak) continue;
      const key = meritAnahtari(kaynak, satir.ne);
      const sonuc = golgeKaydet({
        yol: GUNLUK_YOL,
        tip: "merit",
        key,
        anahtarPenceresi: Infinity,
        kaynak,
        ctx,
        simdi: an,
      });
      if (sonuc.yazildi) yazilan += 1;
      else if (sonuc.tekrar) tekrar += 1;
    }

    const durum = durumHesapla(olaylariOku(GUNLUK_YOL).olaylar, { simdi: an });
    karsilastirma = golgeKarsilastir({ eskiPuan: oncekiPuan, durum });
    golgeLogla({
      logYolu: GUNLUK_LOG_YOL,
      kayit: { tip: "golge", key: sonAnahtar, ...karsilastirma },
    });
    if (mesajlarVar) yargicLogla({ eskiRisk: risk, eskiWork: work, yargic });

    return { yazilan, tekrar, karsilastirma, yargic };
  } catch (hata) {
    return { yazilan, tekrar, karsilastirma, hata: hataMetni(hata), yargic };
  }
}
