const YAZMA_ARACLARI = new Set(["edit", "write", "patch", "apply_patch"]);
// Hata deseni: düz "Error" ile başlayan satırlar YETMİYOR — gerçek transcript'te
// "SyntaxError: missing ) after argument list", "TypeError", "ENOENT" gibi biçimler geliyor.
const HATA_DESENI =
  /(^|\n)\s*(\w*Error|error:|Hata|hata:|Traceback)|exit code [1-9]|\bE(NOENT|ACCES|PERM|EXIST|NOTDIR|ISDIR|TIMEDOUT|CONNREFUSED|BUSY|NOSPC)\b|[Cc]ommand not found|[Kk]omut bulunamadı/;
const BLOK_TIPLERI = {
  toolCall: "cagri",
  tool_call: "cagri",
  tool_use: "cagri",
  toolResult: "sonuc",
  tool_result: "sonuc",
};

const bosSonuc = () => ({ risk: 0, work: false, dE: [], odul: [], gerekce: "kanıt yok" });

const sayi = (deger) => {
  const n = Number(deger);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const kirp = (metin, sinir) => (metin.length > sinir ? metin.slice(0, sinir) : metin);

function metin(deger) {
  if (typeof deger === "string") return deger;
  if (deger === null || deger === undefined) return "";
  if (typeof deger === "number" || typeof deger === "boolean") return String(deger);
  if (Array.isArray(deger)) return deger.map(metin).filter(Boolean).join("\n");
  if (typeof deger === "object") {
    if (typeof deger.text === "string") return deger.text;
    if (typeof deger.content === "string") return deger.content;
    if (Array.isArray(deger.content)) return metin(deger.content);
    try {
      return JSON.stringify(deger);
    } catch {
      return "";
    }
  }
  return "";
}

const aracAdi = (blok) =>
  metin(blok?.name ?? blok?.toolName ?? blok?.tool ?? blok?.function?.name).trim();

const argumanlar = (blok) => {
  const args = blok?.args ?? blok?.input ?? blok?.arguments ?? blok?.function?.arguments;
  return args && typeof args === "object" && !Array.isArray(args) ? args : {};
};

const yolAl = (args) => {
  for (const alan of ["path", "file_path", "file"]) {
    const deger = args?.[alan];
    if (typeof deger === "string" && deger.trim()) return deger;
  }
  return null;
};

const kimlik = (blok) => {
  const id = blok?.toolCallId ?? blok?.tool_call_id ?? blok?.tool_use_id ?? blok?.id;
  return id === undefined || id === null ? null : String(id);
};

function olayEkle(olaylar, tur, blok, rol) {
  const ad = aracAdi(blok);
  if (tur === "cagri") {
    if (!ad) return;
    olaylar.push({ tur, ad, yol: yolAl(argumanlar(blok)), id: kimlik(blok) });
    return;
  }
  const govde = metin(blok?.content ?? blok?.result ?? blok?.output ?? blok?.text);
  const hatali =
    blok?.isError === true || blok?.is_error === true || HATA_DESENI.test(govde);
  olaylar.push({ tur, ad, id: kimlik(blok), hatali, metin: govde, yol: null, rol });
}

function metinBlogu(blok) {
  const tip = typeof blok?.type === "string" ? blok.type : null;
  if (tip === null || tip === "text" || tip === "input_text" || tip === "output_text") {
    return metin(blok?.text ?? blok?.content);
  }
  return "";
}

function mesajCoz(mesaj, olaylar) {
  if (!mesaj || typeof mesaj !== "object") return;
  const rol = typeof mesaj.role === "string" ? mesaj.role : null;
  const tip = typeof mesaj.type === "string" ? mesaj.type : null;

  if (tip && BLOK_TIPLERI[tip]) {
    olayEkle(olaylar, BLOK_TIPLERI[tip], mesaj, rol);
    return;
  }

  const icerik = mesaj.content;
  if (typeof icerik === "string") {
    olaylar.push({ tur: "metin", rol, metin: icerik });
    return;
  }
  if (!Array.isArray(icerik)) return;

  let biriken = [];
  const bosalt = () => {
    if (biriken.length === 0) return;
    const govde = biriken.join("\n");
    biriken = [];
    if (govde.trim()) olaylar.push({ tur: "metin", rol, metin: govde });
  };

  for (const blok of icerik) {
    if (typeof blok === "string") {
      biriken.push(blok);
      continue;
    }
    if (!blok || typeof blok !== "object") continue;
    const blokTipi = typeof blok.type === "string" ? blok.type : null;
    if (blokTipi && BLOK_TIPLERI[blokTipi]) {
      bosalt();
      olayEkle(olaylar, BLOK_TIPLERI[blokTipi], blok, rol);
      continue;
    }
    const parca = metinBlogu(blok);
    if (parca) biriken.push(parca);
  }
  bosalt();
}

function olaylariCoz(messages) {
  const olaylar = [];
  if (!Array.isArray(messages)) return olaylar;
  for (const mesaj of messages) {
    try {
      mesajCoz(mesaj, olaylar);
    } catch {
      // Tanınmayan mesaj atlanır; transcript okuma hiçbir koşulda durmaz.
    }
  }

  const bekleyen = [];
  for (const olay of olaylar) {
    if (olay.tur === "cagri") {
      bekleyen.push(olay);
      continue;
    }
    if (olay.tur !== "sonuc") continue;
    let index = -1;
    if (olay.id !== null) {
      index = bekleyen.findIndex((cagri) => cagri.id !== null && cagri.id === olay.id);
    }
    if (index < 0 && olay.ad) {
      index = bekleyen.findIndex((cagri) => cagri.ad === olay.ad);
    }
    if (index < 0) continue;
    const [cagri] = bekleyen.splice(index, 1);
    cagri.sonuc = olay;
    olay.cagri = cagri;
    if (olay.yol === null) olay.yol = cagri.yol;
  }

  return olaylar;
}

export function transcriptCikar(messages) {
  const cikarim = {
    istekler: [],
    dosyalar: [],
    araclar: [],
    yazma: 0,
    yazilanDosyalar: [],
    hatalar: [],
    duzeltmeler: [],
  };

  let olaylar;
  try {
    olaylar = olaylariCoz(messages);
  } catch {
    return cikarim;
  }

  const gorulenDosya = new Set();
  const hataliYollar = new Set();
  let adim = 0;

  for (const olay of olaylar) {
    if (olay.tur === "metin") {
      if (olay.rol === "user") {
        const istek = metin(olay.metin).trim();
        if (istek) cikarim.istekler.push(istek);
      }
      continue;
    }

    if (olay.tur === "cagri") {
      const yol = olay.yol;
      if (yol && !gorulenDosya.has(yol)) {
        gorulenDosya.add(yol);
        cikarim.dosyalar.push(yol);
      }
      const basarili = !(olay.sonuc && olay.sonuc.hatali === true);
      cikarim.araclar.push({ ad: olay.ad, yol: yol ?? null, basarili });
      const yazmaMi = YAZMA_ARACLARI.has(String(olay.ad).toLowerCase());
      if (yazmaMi && basarili) {
        cikarim.yazma += 1;
        if (yol) cikarim.yazilanDosyalar.push(yol);
        if (yol && hataliYollar.has(yol)) {
          hataliYollar.delete(yol);
          cikarim.duzeltmeler.push({
            dosya: yol,
            kanit: `${olay.ad} ${yol}, hata sonrası düzeltme`,
            sira: adim++,
          });
        }
      }
      continue;
    }

    if (olay.tur === "sonuc") {
      if (!olay.cagri) {
        cikarim.araclar.push({
          ad: olay.ad || "?",
          yol: null,
          basarili: olay.hatali !== true,
        });
      }
      if (olay.hatali) {
        cikarim.hatalar.push({
          kaynak: olay.ad || "?",
          kanit: kirp(olay.metin, 120),
          yol: olay.yol ?? null,
          sira: adim++,
        });
        if (olay.yol) hataliYollar.add(olay.yol);
      }
    }
  }

  return cikarim;
}

export function yargiCikar(cikarim, secenekler) {
  try {
    if (!cikarim || typeof cikarim !== "object" || Array.isArray(cikarim)) {
      return bosSonuc();
    }
    const testGecti = secenekler?.testGecti === true;
    const yazma = sayi(cikarim.yazma);
    const istekler = Array.isArray(cikarim.istekler)
      ? cikarim.istekler.filter((istek) => typeof istek === "string" && istek.trim())
      : [];
    const hatalar = Array.isArray(cikarim.hatalar) ? cikarim.hatalar : [];
    const duzeltmeler = Array.isArray(cikarim.duzeltmeler) ? cikarim.duzeltmeler : [];

    const duzeltmeKayitlari = [];
    for (const duzeltme of duzeltmeler) {
      const kanit = typeof duzeltme?.kanit === "string" ? duzeltme.kanit.trim() : "";
      if (!kanit) continue;
      const dosya = typeof duzeltme?.dosya === "string" ? duzeltme.dosya.trim() : "";
      const sira = Number(duzeltme?.sira);
      duzeltmeKayitlari.push({
        dosya,
        sira: Number.isFinite(sira) ? sira : null,
      });
    }

    const hataKayitlari = [];
    for (const hata of hatalar) {
      const kanit = typeof hata?.kanit === "string" ? hata.kanit.trim() : "";
      if (!kanit) continue;
      const yol = typeof hata?.yol === "string" && hata.yol.trim() ? hata.yol.trim() : null;
      const sira = Number(hata?.sira);
      hataKayitlari.push({
        kanit,
        yol,
        sira: Number.isFinite(sira) ? sira : null,
        bagli: false,
      });
    }

    const dE = [];
    for (const duzeltme of duzeltmeKayitlari) {
      let derece = 0;
      if (duzeltme.dosya) {
        for (const hata of hataKayitlari) {
          if (hata.bagli || hata.yol !== duzeltme.dosya) continue;
          if (
            hata.sira !== null &&
            duzeltme.sira !== null &&
            hata.sira >= duzeltme.sira
          ) {
            continue;
          }
          hata.bagli = true;
          derece += 1;
        }
      }
      if (derece === 0) derece = 1;
      dE.push({
        grup: "D",
        derece: Math.min(5, derece),
        kanit: `${duzeltme.dosya || "?"}: ${derece} hata sonrası düzeltme`,
      });
    }

    const eKayitlari = new Map();
    for (const hata of hataKayitlari) {
      if (hata.bagli) continue;
      const anahtar = hata.kanit.slice(0, 60);
      const mevcut = eKayitlari.get(anahtar);
      if (mevcut) {
        mevcut.derece = Math.min(5, mevcut.derece + 1);
        continue;
      }
      const kayit = { grup: "E", derece: 1, kanit: hata.kanit };
      eKayitlari.set(anahtar, kayit);
      dE.push(kayit);
    }

    const risk = dE.length;
    const eVar = dE.some((kayit) => kayit.grup === "E");
    const work = yazma >= 1 || testGecti;

    const odul = [];
    if (yazma >= 1 && !eVar) {
      odul.push({ ne: "is: uretildi", kanit: `${yazma} yazma` });
    }
    if (testGecti) {
      odul.push({ ne: "dogrulama: test gecti", kanit: "testGecti" });
    }
    if (istekler.length > 0 && !eVar) {
      odul.push({ ne: "seffaflik: istek kaydi", kanit: `${istekler.length} istek` });
    }
    // Öğrenme ödülü (merit ekseni): OGRENME/ altına yazılan dosya kanıttır.
    // E varsa verilmez (K49: toparlanmamış hata ödülü keser).
    const ogrenmeDosyalari = (cikarim?.yazilanDosyalar ?? []).filter((yol) =>
      /(^|[\\/])OGRENME[\\/]/i.test(String(yol ?? "")),
    );
    if (ogrenmeDosyalari.length > 0 && !eVar) {
      for (const yol of ogrenmeDosyalari.slice(0, 2)) {
        odul.push({ ne: `ogrenme: ${yol}`, kanit: String(yol), kaynak: "ogrenme" });
      }
    }

    if (dE.length === 0 && odul.length === 0 && yazma === 0) {
      return bosSonuc();
    }

    const dSayi = dE.filter((kayit) => kayit.grup === "D").length;
    const eSayi = dE.filter((kayit) => kayit.grup === "E").length;
    const testMetni = testGecti ? "test geçti" : "test yok";
    const gerekce = `${yazma} yazma, ${dSayi} D, ${eSayi} E, ${testMetni}`;

    return { risk, work, dE, odul, gerekce };
  } catch {
    return bosSonuc();
  }
}

export function ozetKes(messages, secenekler) {
  try {
    const hamSinir = Number(secenekler?.maxChars);
    const sinir = Number.isFinite(hamSinir) && hamSinir > 0 ? Math.floor(hamSinir) : 1200;
    const olaylar = olaylariCoz(messages);
    const satirlar = [];

    for (const olay of olaylar) {
      if (olay.tur === "metin") {
        const govde = kirp(metin(olay.metin).trim(), 300);
        if (!govde) continue;
        satirlar.push({
          tip: olay.rol === "user" ? "kullanici" : "asistan",
          on: olay.rol === "user" ? "K: " : "P: ",
          govde,
        });
        continue;
      }
      if (olay.tur === "cagri") {
        const yol = olay.yol ? ` ${olay.yol}` : "";
        satirlar.push({
          tip: "arac",
          on: "",
          govde: `[tool: ${olay.ad}${yol}]`,
          koru: true,
        });
        continue;
      }
      if (olay.tur === "sonuc") {
        const ad = olay.ad || "?";
        const yol = olay.yol ? ` ${olay.yol}` : "";
        satirlar.push({
          tip: "sonuc",
          on: `[tool: ${ad}${yol}] ← `,
          govde: kirp(metin(olay.metin).replace(/\r?\n/g, " "), 200),
        });
      }
    }

    const uzunluk = () =>
      satirlar.reduce((toplam, satir) => toplam + satir.on.length + satir.govde.length + 1, 0);

    let kesildi = false;
    if (uzunluk() > sinir) {
      const hedef = Math.max(0, sinir - 11);
      let fazla = uzunluk() - hedef;
      for (const satir of satirlar) {
        if (fazla <= 0) break;
        if (satir.koru || satir.tip !== "kullanici") continue;
        const alinacak = Math.min(fazla, satir.govde.length);
        satir.govde = satir.govde.slice(0, satir.govde.length - alinacak);
        fazla -= alinacak;
        kesildi = true;
      }
      for (const satir of satirlar) {
        if (fazla <= 0) break;
        if (satir.koru || satir.tip === "kullanici") continue;
        const alinacak = Math.min(fazla, satir.govde.length);
        satir.govde = satir.govde.slice(0, satir.govde.length - alinacak);
        fazla -= alinacak;
        kesildi = true;
      }
    }

    const govdeler = satirlar
      .filter((satir) => satir.koru || satir.govde.length > 0)
      .map((satir) => `${satir.on}${satir.govde}`);
    const cikti = kesildi ? ["[kesildi]", ...govdeler].join("\n") : govdeler.join("\n");
    return cikti;
  } catch {
    return "";
  }
}
