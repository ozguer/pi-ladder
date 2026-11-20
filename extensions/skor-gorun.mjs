// Scoreboard view: pure text generation, no IO.
// The source is the event log; SCOREBOARD.md and ROZET.md are rewritten from it.

import { durumHesapla } from "./skor-model.mjs";
import { kazanilanRozet, sonrakiRozet, rutbeAdi } from "./skor-politika.mjs";

const TIRE = "—";

const metin = (deger) => {
  if (deger === undefined || deger === null || deger === "") return TIRE;
  return String(deger);
};

const hucre = (deger) => metin(deger).replace(/[\r\n|]+/g, " ").trim();

const tarihMetni = (deger) => {
  if (typeof deger === "string" && deger.trim()) return deger.trim();
  const n = Number(deger);
  if (Number.isFinite(n) && n > 0) {
    try {
      return new Date(n).toISOString().slice(0, 10);
    } catch {
      return TIRE;
    }
  }
  return TIRE;
};

const sayiAl = (deger) => {
  if (deger === undefined || deger === null || deger === "") return null;
  const n = Number(deger);
  return Number.isFinite(n) ? n : null;
};

const cezaSatiri = (satir, index) =>
  `| ${index + 1} | ${tarihMetni(satir.tarih)} | ${hucre(satir.grup)} | ${hucre(satir.derece)} | ${hucre(
    satir.kural,
  )} | ${hucre(satir.ihlal)} | ${hucre(satir.kanit)} | ${hucre(satir.duzeltme)} | ${hucre(satir.puan ?? satir.delta)} |`;

const odulSatiri = (satir, index) =>
  `| ${index + 1} | ${tarihMetni(satir.tarih)} | ${hucre(satir.ne ?? satir.kaynak ?? satir.grup)} | ${hucre(
    satir.kanit,
  )} | ${hucre(satir.puan ?? satir.delta)} |`;

export function skorbordMetni({ durum, satirlar, tarih } = {}) {
  try {
    const d = durum && typeof durum === "object" ? durum : {};
    const gunluk = d.gunluk && typeof d.gunluk === "object" ? d.gunluk : {};
    const rows = satirlar && typeof satirlar === "object" ? satirlar : {};
    const ceza = Array.isArray(rows.ceza) ? rows.ceza.filter((satir) => satir && typeof satir === "object") : [];
    const odul = Array.isArray(rows.odul) ? rows.odul.filter((satir) => satir && typeof satir === "object") : [];

    const tavan = sayiAl(gunluk.tavan);
    const isBirimi = sayiAl(gunluk.isBirimi);
    const tekrar = sayiAl(gunluk.tekrar);
    const rank = Number.isInteger(d.rank) ? rutbeAdi(d.rank) : TIRE;

    return [
      "# Scoreboard",
      "",
      "## State",
      "",
      `- Authority ${metin(d.yetki)}`,
      `- Merit ${metin(d.merit)}`,
      `- Rank ${rank}`,
      `- Active ${d.aktif === true ? "yes" : d.aktif === false ? "no" : TIRE}`,
      `- Today ${metin(isBirimi)}/${metin(tavan)} work units`,
      `- Duplicates ${metin(tekrar)}`,
      `- Date ${tarihMetni(tarih)}`,
      "",
      "## Penalties",
      "",
      "| # | Date | Group | Degree | Rule | Violation | Evidence | Correction | Points |",
      "|---|---|---|---|---|---|---|---|---|",
      ...ceza.map(cezaSatiri),
      "",
      "## Rewards",
      "",
      "| # | Date | What it was for | Evidence | Points |",
      "|---|---|---|---|---|",
      ...odul.map(odulSatiri),
      "",
      "This is a view; the source is the event log.",
      "",
    ].join("\n");
  } catch {
    return "# Scoreboard\n\nThis is a view; the source is the event log.\n";
  }
}

export function rozetMetni({ durum, gecmis, tarih } = {}) {
  try {
    const d = durum && typeof durum === "object" ? durum : {};
    const merit = sayiAl(d.merit);
    const kazanilan = merit === null ? null : kazanilanRozet(merit);
    const sonraki = merit === null ? null : sonrakiRozet(merit);
    const kalan = sonraki && merit !== null ? Math.max(0, sonraki.merit - merit) : null;
    const rozet = merit === null ? TIRE : kazanilan ?? "none";
    const rank = Number.isInteger(d.rank) ? rutbeAdi(d.rank) : TIRE;

    const liste = Array.isArray(gecmis) ? gecmis.filter((satir) => satir && typeof satir === "object") : [];
    const son = liste.slice(-20).reverse();

    return [
      "# Badges",
      "",
      "## State",
      "",
      `- Merit ${metin(merit)}`,
      `- Rank ${rank}`,
      `- Status: badge ${rozet} · next ${sonraki ? `${sonraki.ad} (${sonraki.merit})` : TIRE} · remaining ${metin(kalan)}`,
      `- Date ${tarihMetni(tarih)}`,
      "",
      "## History",
      "",
      "| Date | Event | Badge | Reason |",
      "|---|---|---|---|",
      ...son.map(
        (satir) =>
          `| ${tarihMetni(satir.tarih || tarih)} | ${hucre(satir.olay)} | ${hucre(satir.rozet)} | ${hucre(satir.sebep)} |`,
      ),
      "",
    ].join("\n");
  } catch {
    return "# Badges\n\n## State\n\n- Status: badge — · next — · remaining —\n";
  }
}

export function durumOzeti(olaylar, { simdi } = {}) {
  try {
    const durum = durumHesapla(olaylar, { simdi });
    const liste = Array.isArray(olaylar) ? olaylar.filter((olay) => olay && typeof olay === "object") : [];
    const cezalar = liste
      .filter((olay) => olay.tip === "ceza")
      .map((olay, sira) => ({ olay, sira }))
      .sort((a, b) => {
        const za = Number(a.olay.ts);
        const zb = Number(b.olay.ts);
        const fa = Number.isFinite(za) ? za : 0;
        const fb = Number.isFinite(zb) ? zb : 0;
        return fa === fb ? a.sira - b.sira : fa - fb;
      })
      .map((kayit) => kayit.olay);
    const sonCezalar = cezalar
      .slice(-5)
      .reverse()
      .map((olay) => ({
        tarih: tarihMetni(olay.ts),
        grup: olay.grup ?? TIRE,
        derece: olay.derece ?? TIRE,
        kanit: olay.kanit ?? TIRE,
      }));
    return { ...durum, sonCezalar };
  } catch {
    return {
      yetki: 0,
      merit: 0,
      rank: 0,
      aktif: true,
      risk: 0,
      gunluk: { isBirimi: 0, tavan: 3, tekrar: 0 },
      sonCezalar: [],
    };
  }
}
