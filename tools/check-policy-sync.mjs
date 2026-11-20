import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = dirname(dirname(fileURLToPath(import.meta.url)));

const ESKI_IZLER = [
  "elmas 5 = 150",
  "5 bronz",
  "10 turda erir",
  "puan katlan\u0131r",
  "k\u0131dem",
  "istek tavan\u0131 +3",
  "cezas\u0131z i\u015f turu",
];

// Phrases that the new model must have in the README (per language).
const ZORUNLU_README = {
  "README.md": ["authority", "merit", "POLITIKA", "wall"],
  "README.tr.md": ["yetki", "merit", "tavan", "bir olay bir ceza"],
};

// Phrases that must not appear in the README (extra guard on top of the ESKI_IZLER scan).
const YASAK_README = ["cezas\u0131z i\u015f turu", "elmas 5 = 150"];

// CHANGELOG.md is intentionally not scanned: it is a history file and may carry traces of the old model.
// The sync check covers only current documents.
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
    bulguEkle("README.md", 1, "README.md not found");
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
        bulguEkle(dosyaAdi, 1, `required phrase missing: ${ifade}`);
      }
    }
  }

  for (const ifade of YASAK_README) {
    if (!kucuk.includes(ifade.toLocaleLowerCase("tr-TR"))) continue;
    const zatenVar = bulgular.some(
      (b) => b.dosya === "README.md" && b.iz === ifade,
    );
    if (!zatenVar) bulguEkle("README.md", 1, `forbidden phrase: ${ifade}`);
  }
}

taraEskiIzler();
taraReadmeModeli();

if (bulgular.length === 0) {
  console.log("Sync: clean");
  process.exitCode = 0;
} else {
  console.log(`Sync: dirty (${bulgular.length} findings)`);
  for (const { dosya, satir, iz } of bulgular) {
    console.log(`${dosya}:${satir} — "${iz}"`);
  }
  process.exitCode = 1;
}
