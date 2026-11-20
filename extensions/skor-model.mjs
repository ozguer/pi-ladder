import { createHash } from "node:crypto";
import { POLITIKA, rutbeAdi } from "./skor-politika.mjs";

const sayi = (deger) => {
  const n = Number(deger);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const tam = (deger) => {
  const n = Number(deger);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const sayisal = (deger) =>
  deger !== undefined && deger !== null && deger !== "" && Number.isFinite(Number(deger));

const metin = (deger) => (deger === undefined || deger === null ? "" : String(deger));

const norm = (deger) => metin(deger).replace(/\s+/gu, " ").trim();

export function rutbe(yetki) {
  const y = sayi(yetki);
  let index = 0;
  for (let i = 0; i < POLITIKA.esikler.length; i += 1) {
    if (POLITIKA.esikler[i] <= y) index = i;
  }
  const name = rutbeAdi(index);
  if (index + 1 < POLITIKA.esikler.length) {
    return {
      index,
      name,
      next: {
        name: rutbeAdi(index + 1),
        kalan: Math.max(0, POLITIKA.esikler[index + 1] - y),
      },
    };
  }
  return { index, name, next: null };
}

export function cezaDeltasi({ grup, derece } = {}) {
  const g = metin(grup).trim().toUpperCase();
  if (g === "D") return -POLITIKA.ceza.D;
  if (g === "E") return Number(derece) === 5 ? -POLITIKA.ceza.E5 : -POLITIKA.ceza.E;
  if (g === "E5") return -POLITIKA.ceza.E5;
  return 0;
}

export const PENCERE_MS = 30 * 24 * 60 * 60 * 1000;

const gorulenKumesi = (gorulen) => {
  if (gorulen instanceof Set) return gorulen;
  return new Set(Array.isArray(gorulen) ? gorulen : []);
};

export function istekKredisi({ correctionFree, work, key, gorulen, simdi, pencereMs } = {}) {
  if (!correctionFree) return { kabul: false, delta: 0, sebep: "corrected" };
  if (!work) return { kabul: false, delta: 0, sebep: "no work" };

  if (gorulen instanceof Map) {
    const an = Number.isFinite(Number(simdi)) ? Number(simdi) : Date.now();
    const pencere = Number.isFinite(Number(pencereMs)) ? Number(pencereMs) : PENCERE_MS;
    if (gorulen.has(key) && an - zaman(gorulen.get(key)) < pencere) {
      return { kabul: false, delta: 0, sebep: "duplicate" };
    }
    gorulen.set(key, an);
    return { kabul: true, delta: 1 };
  }

  const gorulenler = gorulenKumesi(gorulen);
  if (gorulenler.has(key)) return { kabul: false, delta: 0, sebep: "duplicate" };
  return { kabul: true, delta: 1 };
}

export function meritKredisi({ kaynak, key, gorulen, istekToplam } = {}) {
  const gorulenler = gorulenKumesi(gorulen);
  if (gorulenler.has(key)) return { kabul: false, delta: 0, sebep: "duplicate" };
  if (!Object.prototype.hasOwnProperty.call(POLITIKA.odul, kaynak)) {
    return { kabul: false, delta: 0, sebep: "unknown source" };
  }
  const taban = POLITIKA.odul[kaynak];
  const onceki = sayi(istekToplam);
  const kalanLimit = Math.max(0, POLITIKA.tavan.istekMerit - onceki);
  const delta = Math.min(taban, kalanLimit);
  if (delta <= 0) return { kabul: false, delta: 0, sebep: "cap" };
  if (delta < taban) return { kabul: true, delta, sebep: "cap" };
  return { kabul: true, delta };
}

export function isBirimiAnahtari({ istekMetni, dosyalar, diffHash } = {}) {
  const liste = (Array.isArray(dosyalar) ? dosyalar : []).map((dosya) => String(dosya)).sort();
  const govde = `${norm(istekMetni)}|${liste.join(",")}|${diffHash || ""}`;
  return `is:${createHash("sha256").update(govde, "utf8").digest("hex")}`;
}

const zaman = (ts) => {
  const n = Number(ts);
  return Number.isFinite(n) ? n : 0;
};

const gunAnahtari = (ts) => {
  const n = Number(ts);
  if (!Number.isFinite(n)) return "1970-01-01";
  try {
    return new Date(n).toISOString().slice(0, 10);
  } catch {
    return "1970-01-01";
  }
};

const kanon = (deger) => {
  if (deger === null || deger === undefined) return "null";
  const tip = typeof deger;
  if (tip === "number") return Number.isFinite(deger) ? String(deger) : "null";
  if (tip === "string" || tip === "boolean") return JSON.stringify(deger);
  if (Array.isArray(deger)) return `[${deger.map(kanon).join(",")}]`;
  if (tip === "object") {
    return `{${Object.keys(deger)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${kanon(deger[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(deger));
};

const olaySirala = (a, b) => {
  const za = zaman(a.ts);
  const zb = zaman(b.ts);
  if (za !== zb) return za - zb;
  const ka = metin(a.anahtar);
  const kb = metin(b.anahtar);
  if (ka !== kb) return ka < kb ? -1 : 1;
  const ta = metin(a.tip);
  const tb = metin(b.tip);
  if (ta !== tb) return ta < tb ? -1 : 1;
  const ga = kanon(a);
  const gb = kanon(b);
  return ga < gb ? -1 : ga > gb ? 1 : 0;
};

export function durumHesapla(olaylar, { simdi } = {}) {
  const liste = Array.isArray(olaylar)
    ? olaylar.filter((olay) => olay && typeof olay === "object")
    : [];
  const sirali = [...liste].sort(olaySirala);
  const bugun = gunAnahtari(simdi);

  const istekGorulen = new Map();
  const meritGorulen = new Set();
  const gunler = new Map();
  const gunSayaci = (gun) => {
    let sayac = gunler.get(gun);
    if (!sayac) {
      sayac = { istek: 0, merit: 0 };
      gunler.set(gun, sayac);
    }
    return sayac;
  };

  let yetkiHam = 0;
  let meritHam = 0;
  let isBirimi = 0;
  let tekrar = 0;

  for (const olay of sirali) {
    if (olay.tip === "legacy") continue;

    if (olay.tip === "istek") {
      const gun = gunAnahtari(olay.ts);
      const anahtar = metin(olay.anahtar) || null;
      const ts = zaman(olay.ts);
      if (anahtar !== null && istekGorulen.has(anahtar)) {
        const oncekiTs = istekGorulen.get(anahtar);
        if (ts - oncekiTs < PENCERE_MS) {
          if (gun === bugun) tekrar += 1;
          continue;
        }
      }
      const sayac = gunSayaci(gun);
      if (sayac.istek >= POLITIKA.tavan.yetkiGun) continue;
      sayac.istek += 1;
      if (anahtar !== null) istekGorulen.set(anahtar, ts);
      yetkiHam += sayisal(olay.delta) ? tam(olay.delta) : 1;
      if (gun === bugun) isBirimi += 1;
      continue;
    }

    if (olay.tip === "ceza") {
      if (sayisal(olay.delta)) yetkiHam += tam(olay.delta);
      else if (olay.grup !== undefined) yetkiHam += cezaDeltasi(olay);
      continue;
    }

    if (olay.tip === "goc") {
      yetkiHam += sayisal(olay.delta) ? tam(olay.delta) : 0;
      if (sayisal(olay.merit)) meritHam += tam(olay.merit);
      continue;
    }

    if (olay.tip === "merit") {
      const anahtar = metin(olay.anahtar) || null;
      if (anahtar !== null && meritGorulen.has(anahtar)) continue;
      if (anahtar !== null) meritGorulen.add(anahtar);
      const sayac = gunSayaci(gunAnahtari(olay.ts));
      if (sayac.merit >= POLITIKA.tavan.meritGun) continue;
      sayac.merit += 1;
      if (sayisal(olay.delta)) meritHam += tam(olay.delta);
      else if (Object.prototype.hasOwnProperty.call(POLITIKA.odul, olay.kaynak)) {
        meritHam += POLITIKA.odul[olay.kaynak];
      }
    }
  }

  const yetki = Math.max(0, yetkiHam);
  const merit = Math.max(0, meritHam);
  const sonIlerleme = sirali
    .filter((olay) => olay.tip === "istek" || olay.tip === "ceza")
    .slice(-3);
  const aktif = !sonIlerleme.some((olay) => olay.tip === "ceza");
  const risk = sirali.slice(-3).filter((olay) => olay.tip === "ceza").length;

  return {
    yetki,
    merit,
    rank: rutbe(yetki).index,
    aktif,
    risk,
    gunluk: {
      isBirimi,
      tavan: POLITIKA.tavan.yetkiGun,
      tekrar,
    },
  };
}
