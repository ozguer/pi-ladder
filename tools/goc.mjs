// Tek eksenli eski durumu (puan-durum.json + SCOREBOARD.md) iki eksenli
// günlüğe bir kez aktarır. Varsayılan davranış kuru çalışmadır; canlıya
// yalnız açık --yaz ile ve çağıranın verdiği olay yoluna yazar.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { olayYaz, olaylariOku } from "../extensions/skor-store.mjs";
import { POLITIKA } from "../extensions/skor-politika.mjs";

// K50: göç tavanı = ALTIN eşiği (yetki 15). Tek kaynak: POLITIKA.esikler.
const GOC_TAVAN = POLITIKA.esikler[2];

const sayi = (deger) => {
  const n = Number(deger);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const evDizini = () =>
  process.platform === "win32"
    ? process.env.USERPROFILE || process.env.HOME || homedir()
    : process.env.HOME || homedir();

const varsayilanYollar = () => {
  const veri = join(evDizini(), ".pi", "agent", "user-character");
  return {
    puanDosyasi: join(veri, "puan-durum.json"),
    scoreboardDosyasi: join(veri, "SCOREBOARD.md"),
  };
};

export function eskiDurumOku({ puanDosyasi, scoreboardDosyasi } = {}) {
  const kaynaklar = { puanDosyasi: "yok", scoreboardDosyasi: "yok" };
  let ham = null;

  if (puanDosyasi) {
    try {
      const metin = readFileSync(puanDosyasi, "utf8");
      try {
        ham = JSON.parse(metin);
        kaynaklar.puanDosyasi = "okundu";
      } catch {
        kaynaklar.puanDosyasi = "bozuk";
      }
    } catch (hata) {
      kaynaklar.puanDosyasi = hata?.code === "ENOENT" ? "yok" : "bozuk";
    }
  }

  if (scoreboardDosyasi) {
    try {
      if (existsSync(scoreboardDosyasi)) kaynaklar.scoreboardDosyasi = "okundu";
    } catch {
      kaynaklar.scoreboardDosyasi = "yok";
    }
  }

  const veri = ham && typeof ham === "object" && !Array.isArray(ham) ? ham : {};
  const puan = veri.puan ?? veri.birikim;
  const eskiPuan = Math.max(0, sayi(puan));
  // K50: göç tavanı ALTIN (yetki 15). Eski puan ölçülmemişti; kıdem tanınır ama
  // rütbe kanıtla yükselir. Ham puan kayıt için saklanır.
  const yetki = Math.min(eskiPuan, GOC_TAVAN);

  return { yetki, merit: 0, eskiPuan, kaynaklar };
}

export function gocOlayi({ onceki, simdi } = {}) {
  const yetki = Math.max(0, sayi(onceki?.yetki));
  const merit = Math.max(0, sayi(onceki?.merit));
  const eskiPuan = Math.max(0, sayi(onceki?.eskiPuan ?? onceki?.yetki));
  // Anahtar HAM eski puandan: göç tavanı değişse de aynı göç ikinci kez yazılmaz.
  const govde = `${eskiPuan}|${merit}`;
  const ozet = createHash("sha256").update(govde, "utf8").digest("hex").slice(0, 16);

  return {
    tip: "goc",
    delta: yetki,
    merit,
    kaynak: "goc",
    anahtar: `goc:${ozet}`,
    ts: simdi,
    not: `eski puan ${eskiPuan}, yetki tavanı ${GOC_TAVAN}`,
  };
}

export function gocYaz({ olayYolu, onceki, simdi, kuruCalisma } = {}) {
  const olay = gocOlayi({ onceki, simdi });

  if (kuruCalisma) {
    return { yazildi: false, tekrar: false, olay, rapor: "kuru" };
  }

  const { olaylar } = olaylariOku(olayYolu);
  const varMi = olaylar.some((eski) => eski && String(eski.anahtar ?? "") === olay.anahtar);
  if (varMi) {
    return { yazildi: false, tekrar: true, olay, rapor: "tekrar" };
  }

  const sonuc = olayYaz(olayYolu, olay, { pencereMs: 0 });
  return {
    yazildi: sonuc.yazildi,
    tekrar: sonuc.tekrar,
    olay,
    rapor: sonuc.yazildi ? "yazıldı" : "tekrar",
  };
}

const SECENEKLER = new Map([
  ["--olay", "olay"],
  ["--puan", "puan"],
  ["--scoreboard", "scoreboard"],
]);

const argumanlariCoz = (argv) => {
  const secenek = { yaz: false };
  const liste = Array.isArray(argv) ? argv : [];

  for (let i = 0; i < liste.length; i += 1) {
    const arg = String(liste[i]);
    if (arg === "--yaz") {
      secenek.yaz = true;
      continue;
    }

    const esit = arg.indexOf("=");
    const ad = esit === -1 ? arg : arg.slice(0, esit);
    const anahtar = SECENEKLER.get(ad);
    if (!anahtar) continue;

    if (esit !== -1) {
      secenek[anahtar] = arg.slice(esit + 1);
      continue;
    }

    const deger = liste[i + 1];
    if (deger === undefined) throw new Error(`${ad} için değer yok`);
    secenek[anahtar] = String(deger);
    i += 1;
  }

  return secenek;
};

export async function main(argv) {
  try {
    const secenek = argumanlariCoz(argv);
    if (!secenek.olay) {
      console.error("göç: --olay <yol> gerekli");
      return 1;
    }

    const varsayilan = varsayilanYollar();
    const onceki = eskiDurumOku({
      puanDosyasi: secenek.puan ?? varsayilan.puanDosyasi,
      scoreboardDosyasi: secenek.scoreboard ?? varsayilan.scoreboardDosyasi,
    });

    const sonuc = gocYaz({
      olayYolu: secenek.olay,
      onceki,
      simdi: Date.now(),
      kuruCalisma: !secenek.yaz,
    });

    console.log(
      `göç: yetki=${onceki.yetki} merit=${onceki.merit} kaynak=puan(${onceki.kaynaklar.puanDosyasi}) → ${sonuc.rapor}`,
    );
    return 0;
  } catch (hata) {
    console.error(`göç: hata: ${hata?.message ?? hata}`);
    return 1;
  }
}

const buDosya = resolve(fileURLToPath(import.meta.url));
const calisanDosya = process.argv[1] ? resolve(process.argv[1]) : "";
const dogrudanCalisti =
  process.platform === "win32"
    ? buDosya.toLowerCase() === calisanDosya.toLowerCase()
    : buDosya === calisanDosya;

if (dogrudanCalisti) {
  process.exitCode = await main(process.argv.slice(2));
}
