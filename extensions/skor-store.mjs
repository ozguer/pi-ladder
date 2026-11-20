import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { durumHesapla } from "./skor-model.mjs";

const bekle = (ms) => {
  const sure = Math.max(0, Number(ms) || 0);
  if (sure <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sure);
};

const klasoruHazirla = (yol) => {
  const klasor = dirname(yol);
  if (klasor && klasor !== ".") mkdirSync(klasor, { recursive: true });
};

const kilitDiziniSil = (yol) => {
  try {
    rmdirSync(yol, { recursive: true });
    return;
  } catch {
    // Node 26 removed the recursive option of rmdirSync; fall back to rmSync.
  }
  try {
    rmSync(yol, { recursive: true, force: true });
  } catch {
    // if the lock is already gone or someone else took it over, pass silently
  }
};

export function kilitAl(yol, { staleMs = 5000, deneme = 5, aralikMs = 50 } = {}) {
  klasoruHazirla(yol);
  const esik = Math.max(0, Number(staleMs) || 0);
  const denemeSayisi = Math.max(0, Math.trunc(Number(deneme) || 0));
  const aralik = Math.max(0, Number(aralikMs) || 0);

  for (let i = 0; i <= denemeSayisi; i += 1) {
    try {
      mkdirSync(yol, { recursive: false });
      let birakildi = false;
      return () => {
        if (birakildi) return;
        birakildi = true;
        kilitDiziniSil(yol);
      };
    } catch (hata) {
      if (hata?.code !== "EEXIST") throw hata;
    }

    try {
      const durum = statSync(yol);
      if (Date.now() - durum.mtimeMs >= esik) {
        kilitDiziniSil(yol);
        continue;
      }
    } catch {
      // if the lock was released in the meantime, retry immediately
      continue;
    }

    if (i < denemeSayisi) bekle(aralik);
  }

  throw new Error(`could not acquire lock: ${yol}`);
}

const satirSonu = (metin) => metin.endsWith("\n");

export function olaylariOku(yol) {
  let metin;
  try {
    metin = readFileSync(yol, "utf8");
  } catch (hata) {
    if (hata?.code === "ENOENT") return { olaylar: [], bozuk: 0 };
    throw hata;
  }

  if (metin === "") return { olaylar: [], bozuk: 0 };

  const parcalar = metin.split("\n");
  const tamSon = satirSonu(metin);
  if (tamSon) parcalar.pop();

  const olaylar = [];
  let bozuk = 0;
  for (let i = 0; i < parcalar.length; i += 1) {
    const parca = parcalar[i];
    try {
      olaylar.push(JSON.parse(parca));
    } catch {
      const yarimSon = i === parcalar.length - 1 && !tamSon;
      if (!yarimSon) bozuk += 1;
    }
  }

  return { olaylar, bozuk };
}

export function olayYaz(yol, olay, { kilit, pencereMs } = {}) {
  klasoruHazirla(yol);
  const kendiKilidi = typeof kilit !== "function";
  const birak = kendiKilidi ? kilitAl(`${yol}.kilit`) : kilit;
  try {
    const anahtar = olay?.anahtar === undefined || olay?.anahtar === null ? "" : String(olay.anahtar);
    if (anahtar !== "") {
      const { olaylar } = olaylariOku(yol);
      const yeniTs = Number.isFinite(Number(olay.ts)) ? Number(olay.ts) : 0;
      // K48: if no window is given, no deduplication is done; every event is written.
      const pencere = Number.isFinite(Number(pencereMs)) ? Number(pencereMs) : 0;
      for (const eski of olaylar) {
        if (!eski || String(eski.anahtar ?? "") !== anahtar) continue;
        const eskiTs = Number.isFinite(Number(eski.ts)) ? Number(eski.ts) : 0;
        if (Math.abs(yeniTs - eskiTs) < pencere) {
          return { yazildi: false, tekrar: true, mevcut: eski.ts };
        }
      }
    }

    const fd = openSync(yol, "a");
    try {
      writeSync(fd, `${JSON.stringify(olay)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return { yazildi: true, tekrar: false };
  } finally {
    if (kendiKilidi) birak();
  }
}

const geciciAd = (yol) => `${yol}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

const atomikYaz = (yol, metin) => {
  klasoruHazirla(yol);
  const gecici = geciciAd(yol);
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
      // if the temporary file is already removed, pass
    }
    throw hata;
  }
};

export function onbellekYaz(yol, veri) {
  atomikYaz(yol, JSON.stringify(veri));
}

export function onbellekOku(yol) {
  try {
    return JSON.parse(readFileSync(yol, "utf8"));
  } catch {
    return null;
  }
}

export function onbellekOnar(yol, olayYolu) {
  const { olaylar } = olaylariOku(olayYolu);
  const durum = durumHesapla(olaylar, { simdi: Date.now() });
  onbellekYaz(yol, durum);
  return durum;
}

export function gorunumYaz(yol, satirlar) {
  const liste = Array.isArray(satirlar) ? satirlar : [];
  atomikYaz(yol, liste.join("\n"));
}
