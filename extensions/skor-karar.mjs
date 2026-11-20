import { transcriptCikar, yargiCikar } from "./skor-yargic.mjs";
import { cezaDeltasi, isBirimiAnahtari } from "./skor-model.mjs";
import { POLITIKA } from "./skor-politika.mjs";

const KANIT_ESIGI = 10;
const MERIT_KAYNAKLARI = new Set(["ogrenme", "kesif", "kurtarma", "öğrenme", "keşif"]);
const BOS_YARGI = { risk: 0, work: false, dE: [], odul: [], gerekce: "kanıt yok" };

const metin = (deger) => {
  if (typeof deger === "string") return deger;
  if (deger === null || deger === undefined) return "";
  if (typeof deger === "number" || typeof deger === "boolean") return String(deger);
  if (Array.isArray(deger)) return deger.map(metin).filter(Boolean).join("\n");
  if (typeof deger !== "object") return "";
  if (typeof deger.text === "string") return deger.text;
  if (typeof deger.content === "string") return deger.content;
  if (Array.isArray(deger.content)) return metin(deger.content);
  const ad =
    typeof deger.name === "string" ? deger.name : typeof deger.toolName === "string" ? deger.toolName : "";
  const args = deger.args ?? deger.arguments ?? deger.input;
  if (ad && args && typeof args === "object") {
    const degerler = Object.values(args)
      .filter((parca) => typeof parca === "string")
      .join(" ");
    try {
      return `${ad} ${degerler} ${JSON.stringify(args)}`;
    } catch {
      return `${ad} ${degerler}`;
    }
  }
  try {
    return JSON.stringify(deger);
  } catch {
    return "";
  }
};

const duz = (deger) => metin(deger).replace(/\s+/gu, " ").trim().toLowerCase();

function transkriptMetni(mesajlar) {
  if (!Array.isArray(mesajlar)) return "";
  const parcalar = [];
  for (const mesaj of mesajlar) {
    if (!mesaj || typeof mesaj !== "object") continue;
    const govde = mesaj.content ?? mesaj.text ?? mesaj;
    const parca = duz(govde);
    if (parca) parcalar.push(parca);
  }
  return parcalar.join(" ");
}

const kanitTemiz = (kanit) => (typeof kanit === "string" ? kanit.replace(/\s+/gu, " ").trim() : "");

const grupAl = (grup) => String(grup ?? "").trim().toUpperCase();

const dereceAl = (deger) => {
  const n = Number(deger);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
};

const kanitGecerli = (kanit, transkript) =>
  kanit.length >= KANIT_ESIGI && transkript.includes(kanit.toLowerCase());

const meritMi = (ne) =>
  !ne.startsWith("is:") && !ne.startsWith("dogrulama:") && !ne.startsWith("seffaflik:");

const odulSuz = (odul, eVar) =>
  eVar
    ? odul.filter((kayit) => !/^(is:|seffaflik)/u.test(String(kayit?.ne ?? "").trim()))
    : odul;

export function kararOlaylari({ mesajlar, testGecti, istekMetni, dosyalar, diffHash, simdi } = {}) {
  const cikarim = transcriptCikar(mesajlar);
  const yargi = yargiCikar(cikarim, { testGecti });
  const dE = Array.isArray(yargi.dE) ? yargi.dE : [];
  const odul = Array.isArray(yargi.odul) ? yargi.odul : [];
  const olaylar = [];

  for (const ceza of dE) {
    const olay = {
      tip: "ceza",
      delta: cezaDeltasi({ grup: ceza?.grup, derece: ceza?.derece }),
      grup: ceza?.grup,
      derece: ceza?.derece,
      ts: simdi,
    };
    if (typeof ceza?.kanit === "string") olay.kanit = ceza.kanit;
    olaylar.push(olay);
  }

  const istek =
    istekMetni === undefined || istekMetni === null
      ? Array.isArray(cikarim.istekler) && cikarim.istekler.length
        ? cikarim.istekler[0]
        : ""
      : istekMetni;
  const dosyaListesi = Array.isArray(dosyalar) ? dosyalar : cikarim.dosyalar;
  const eVar = dE.some((kayit) => kayit?.grup === "E");

  // K38 zinciri: "İlerler" için hiç D/E olmamalı. D (toparlanmış hata) ödülü
  // iki kez kesmez ama yetki +1 de vermez — tur "Durur" durumundadır.
  if (yargi.work === true && dE.length === 0) {
    olaylar.push({
      tip: "istek",
      delta: 1,
      anahtar: isBirimiAnahtari({ istekMetni: istek, dosyalar: dosyaListesi, diffHash }),
      ts: simdi,
    });
  }

  for (const kayit of odul) {
    const ne = String(kayit?.ne ?? "").trim();
    if (!ne || !meritMi(ne)) continue;
    const kaynak = String(kayit?.kaynak ?? "").trim().toLowerCase();
    if (!MERIT_KAYNAKLARI.has(kaynak)) continue;
    const olay = { tip: "merit", kaynak, delta: POLITIKA.odul[kaynak] ?? 0, ts: simdi };
    if (typeof kayit.kanit === "string") olay.kanit = kayit.kanit;
    olaylar.push(olay);
  }

  return { yargi, olaylar };
}

// Duvar denemesi cezası: aynı gün 3 kez engellenen deneme → bir kez E.
// Kural: engellenen deneme tek başına ceza değil (zarar yok); ısrar cezadır.
export function duvarCezasi({ logMetni, tarih, ts } = {}) {
  const metinLog = String(logMetni ?? "");
  const gun = String(tarih ?? "");
  if (!metinLog || !gun) return null;
  const sayi = metinLog
    .split("\n")
    .filter((satir) => satir.startsWith(gun) && /\| engellendi\b/.test(satir)).length;
  if (sayi < 3) return null;
  return {
    tip: "ceza",
    delta: cezaDeltasi({ grup: "E", derece: 1 }),
    grup: "E",
    derece: 1,
    kanit: `ayni gun ${sayi} duvar denemesi`,
    anahtar: `duvar:${gun}`,
    ts,
  };
}

export function itirazUygula({ yargi, itirazlar, mesajlar } = {}) {
  const temel = yargi && typeof yargi === "object" ? yargi : BOS_YARGI;
  const dE = Array.isArray(temel.dE)
    ? temel.dE.filter((kayit) => kayit && typeof kayit === "object").map((kayit) => ({ ...kayit }))
    : [];
  const odul = Array.isArray(temel.odul)
    ? temel.odul.filter((kayit) => kayit && typeof kayit === "object").map((kayit) => ({ ...kayit }))
    : [];
  const transkript = transkriptMetni(mesajlar);
  const kabul = [];
  const red = [];

  for (const itiraz of Array.isArray(itirazlar) ? itirazlar : []) {
    if (!itiraz || typeof itiraz !== "object") continue;
    const grup = grupAl(itiraz.grup);
    if (grup !== "D" && grup !== "E") {
      red.push({ ...itiraz, sebep: "geçersiz grup" });
      continue;
    }
    const kanit = kanitTemiz(itiraz.kanit);
    if (!kanitGecerli(kanit, transkript)) {
      red.push({ ...itiraz, sebep: "kanıt transkriptte yok" });
      continue;
    }
    const derece = dereceAl(itiraz.derece);
    kabul.push({ ...itiraz, grup, derece, kanit });
    const varMi = dE.some((kayit) => grupAl(kayit.grup) === grup && kanitTemiz(kayit.kanit) === kanit);
    if (!varMi) dE.push({ grup, derece, kanit });
  }

  const eVar = dE.some((kayit) => grupAl(kayit.grup) === "E");

  return {
    yargi: { ...temel, risk: dE.length, dE, odul: odulSuz(odul, eVar) },
    kabul,
    red,
  };
}

export function itirazCikar({ cevapMetni } = {}) {
  let cevap = cevapMetni;
  if (typeof cevap === "string") {
    let ham = cevap.trim();
    const fence = ham.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) ham = fence[1].trim();
    const bas = ham.indexOf("{");
    const son = ham.lastIndexOf("}");
    if (bas < 0 || son <= bas) return [];
    try {
      cevap = JSON.parse(ham.slice(bas, son + 1));
    } catch {
      return [];
    }
  }
  if (!cevap || typeof cevap !== "object" || Array.isArray(cevap)) return [];

  const itirazlar = [];
  for (const satir of Array.isArray(cevap.ceza) ? cevap.ceza : []) {
    if (!satir || typeof satir !== "object") continue;
    const grup = grupAl(satir.grup);
    if (grup !== "D" && grup !== "E") continue;
    const kanit = kanitTemiz(satir.kanit);
    if (!kanit) continue;
    itirazlar.push({ grup, derece: dereceAl(satir.derece), kanit });
  }
  return itirazlar;
}
