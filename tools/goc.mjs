// Migrates the old single-axis state (puan-durum.json + SCOREBOARD.md) once into the two-axis
// log. The default is a dry run; writes to the event path given by the caller
// only with an explicit --yaz.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { olayYaz, olaylariOku } from "../extensions/skor-store.mjs";
import { POLITIKA } from "../extensions/skor-politika.mjs";

// K50: migration cap = GOLD threshold (authority 15). Single source: POLITIKA.esikler.
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
  const kaynaklar = { puanDosyasi: "missing", scoreboardDosyasi: "missing" };
  let ham = null;

  if (puanDosyasi) {
    try {
      const metin = readFileSync(puanDosyasi, "utf8");
      try {
        ham = JSON.parse(metin);
        kaynaklar.puanDosyasi = "read";
      } catch {
        kaynaklar.puanDosyasi = "corrupt";
      }
    } catch (hata) {
      kaynaklar.puanDosyasi = hata?.code === "ENOENT" ? "missing" : "corrupt";
    }
  }

  if (scoreboardDosyasi) {
    try {
      if (existsSync(scoreboardDosyasi)) kaynaklar.scoreboardDosyasi = "read";
    } catch {
      kaynaklar.scoreboardDosyasi = "missing";
    }
  }

  const veri = ham && typeof ham === "object" && !Array.isArray(ham) ? ham : {};
  const puan = veri.puan ?? veri.birikim;
  const eskiPuan = Math.max(0, sayi(puan));
  // K50: migration cap is GOLD (authority 15). The old score was not measured; seniority is recognized but
  // rank rises with evidence. The raw score is kept for the record.
  const yetki = Math.min(eskiPuan, GOC_TAVAN);

  return { yetki, merit: 0, eskiPuan, kaynaklar };
}

export function gocOlayi({ onceki, simdi } = {}) {
  const yetki = Math.max(0, sayi(onceki?.yetki));
  const merit = Math.max(0, sayi(onceki?.merit));
  const eskiPuan = Math.max(0, sayi(onceki?.eskiPuan ?? onceki?.yetki));
  // Key from the RAW old score: even if the migration cap changes, the same migration is not written twice.
  const govde = `${eskiPuan}|${merit}`;
  const ozet = createHash("sha256").update(govde, "utf8").digest("hex").slice(0, 16);

  return {
    tip: "goc",
    delta: yetki,
    merit,
    kaynak: "goc",
    anahtar: `goc:${ozet}`,
    ts: simdi,
    not: `old score ${eskiPuan}, authority cap ${GOC_TAVAN}`,
  };
}

export function gocYaz({ olayYolu, onceki, simdi, kuruCalisma } = {}) {
  const olay = gocOlayi({ onceki, simdi });

  if (kuruCalisma) {
    return { yazildi: false, tekrar: false, olay, rapor: "dry" };
  }

  const { olaylar } = olaylariOku(olayYolu);
  const varMi = olaylar.some((eski) => eski && String(eski.anahtar ?? "") === olay.anahtar);
  if (varMi) {
    return { yazildi: false, tekrar: true, olay, rapor: "duplicate" };
  }

  const sonuc = olayYaz(olayYolu, olay, { pencereMs: 0 });
  return {
    yazildi: sonuc.yazildi,
    tekrar: sonuc.tekrar,
    olay,
    rapor: sonuc.yazildi ? "written" : "duplicate",
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
    if (deger === undefined) throw new Error(`no value for ${ad}`);
    secenek[anahtar] = String(deger);
    i += 1;
  }

  return secenek;
};

export async function main(argv) {
  try {
    const secenek = argumanlariCoz(argv);
    if (!secenek.olay) {
      console.error("migration: --olay <path> is required");
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
      `migration: authority=${onceki.yetki} merit=${onceki.merit} source=score(${onceki.kaynaklar.puanDosyasi}) -> ${sonuc.rapor}`,
    );
    return 0;
  } catch (hata) {
    console.error(`migration: error: ${hata?.message ?? hata}`);
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
