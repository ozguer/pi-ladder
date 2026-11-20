import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = dirname(dirname(fileURLToPath(import.meta.url)));

const ESKI_IZLER = [
  "elmas 5 = 150",
  "5 bronz",
  "10 turda erir",
  "puan katlanır",
  "kıdem",
  "istek tavanı +3",
  "cezasız iş turu",
];

// Yeni modelin README'de bulunması zorunlu olan ifadeleri (dile göre).
const ZORUNLU_README = {
  "README.md": ["authority", "merit", "POLITIKA", "wall"],
  "README.tr.md": ["yetki", "merit", "tavan", "bir olay bir ceza"],
};

// README'de bulunmaması gereken ifadeler (ESKI_IZLER taramasına ek güvence).
const YASAK_README = ["cezasız iş turu", "elmas 5 = 150"];

// CHANGELOG.md bilinçli olarak taranmaz: tarihçe dosyasıdır, eski model izlerini
// taşıması normaldir. Senkron denetimi yalnız güncel belgeleri kapsar.
function mdDosyalari(dizin, onek = "") {
  const bulunan = [];
  if (!existsSync(dizin) || !statSync(dizin).isDirectory()) return bulunan;
  for (const ad of readdirSync(dizin).sort()) {
    const tam = join(dizin, ad);
    const goreli = onek ? join(onek, ad) : ad;
    if (statSync(tam).isDirectory()) bulunan.push(...mdDosyalari(tam, goreli));
    else if (ad.toLowerCase().endsWith(".md")) bulunan.push(goreli);
  }
  return bulunan;
}

function hedefDosyalar() {
  const dosyalar = ["README.md", "README.tr.md", join("docs", "rubric.md")];
  for (const goreli of mdDosyalari(join(KOK, "templates"), "templates")) dosyalar.push(goreli);
  return dosyalar.map((goreli) => join(KOK, goreli));
}

const bulgular = [];
const gorulen = new Set();

function bulguEkle(dosya, satir, iz) {
  const anahtar = `${dosya}:${satir}:${iz}`;
  if (gorulen.has(anahtar)) return;
  gorulen.add(anahtar);
  bulgular.push({ dosya, satir, iz });
}

function taraEskiIzler() {
  for (const dosya of hedefDosyalar()) {
    if (!existsSync(dosya) || !statSync(dosya).isFile()) continue;
    const goreli = relative(KOK, dosya).split(sep).join("/");
    const satirlar = readFileSync(dosya, "utf8").split(/\r?\n/);
    satirlar.forEach((satir, index) => {
      const kucuk = satir.toLocaleLowerCase("tr-TR");
      for (const iz of ESKI_IZLER) {
        if (kucuk.includes(iz.toLocaleLowerCase("tr-TR"))) {
          bulguEkle(goreli, index + 1, iz);
        }
      }
    });
  }
}

function taraReadmeModeli() {
  const dosya = join(KOK, "README.md");
  if (!existsSync(dosya) || !statSync(dosya).isFile()) {
    bulguEkle("README.md", 1, "README.md bulunamadı");
    return;
  }
  const metin = readFileSync(dosya, "utf8");
  const kucuk = metin.toLocaleLowerCase("tr-TR");

  for (const [dosyaAdi, ifadeler] of Object.entries(ZORUNLU_README)) {
    const hedef = join(KOK, dosyaAdi);
    if (!existsSync(hedef)) continue;
    const hedefKucuk = readFileSync(hedef, "utf8").toLocaleLowerCase("tr-TR");
    for (const ifade of ifadeler) {
      if (!hedefKucuk.includes(ifade.toLocaleLowerCase("tr-TR"))) {
        bulguEkle(dosyaAdi, 1, `zorunlu ifade yok: ${ifade}`);
      }
    }
  }

  for (const ifade of YASAK_README) {
    if (!kucuk.includes(ifade.toLocaleLowerCase("tr-TR"))) continue;
    const zatenVar = bulgular.some(
      (b) => b.dosya === "README.md" && b.iz === ifade,
    );
    if (!zatenVar) bulguEkle("README.md", 1, `yasak ifade: ${ifade}`);
  }
}

taraEskiIzler();
taraReadmeModeli();

if (bulgular.length === 0) {
  console.log("Senkron: temiz");
  process.exitCode = 0;
} else {
  console.log(`Senkron: kirli (${bulgular.length} bulgu)`);
  for (const { dosya, satir, iz } of bulgular) {
    console.log(`${dosya}:${satir} — "${iz}"`);
  }
  process.exitCode = 1;
}
