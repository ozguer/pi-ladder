// Kurulum aracı: pi-user-character paketini bir Pi kurulumuna yerleştirir.
// Varsayılan KURU ÇALIŞMA'dır; yazmak için --yaz gerekir.
//
//   node tools/kur.mjs                       # ne yapılacağını gösterir
//   node tools/kur.mjs --yaz                 # ~/.pi/agent içine kurar
//   node tools/kur.mjs --yaz --hedef <dizin> # başka bir Pi kurulumuna
//   node tools/kur.mjs --yaz --dil tr        # Türkçe şablonlarla (varsayılan: en)
//
// Yaptıkları: yedek al → kancaları kopyala → veri/skill dizinlerini hazırla
// → eski puan varsa göç olayını yaz (K40/K50) → özet.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gocYaz, eskiDurumOku } from "./goc.mjs";
import { POLITIKA } from "../extensions/skor-politika.mjs";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SURUM = JSON.parse(readFileSync(join(KOK, "package.json"), "utf8")).version;

const arg = (ad, varsayilan = null) => {
  const i = process.argv.indexOf(ad);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : varsayilan;
};

const yaz = process.argv.includes("--yaz");
const hedefKok = resolve(arg("--hedef", join(homedir(), ".pi", "agent")));
const damga = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const yedekDizin = join(hedefKok, `yedek-kurulum-${damga}`);

const satirlar = [];
const ekle = (s) => satirlar.push(s);

ekle(`pi-user-character ${SURUM}`);
ekle(`kaynak : ${KOK}`);
ekle(`hedef  : ${hedefKok}`);
ekle(`kipsam : ${yaz ? "YAZ (gerçek kurulum)" : "kuru çalışma (yazmaz)"}`);
ekle("");

// 1. Kancalar
const kaynakExt = join(KOK, "extensions");
const hedefExt = join(hedefKok, "extensions");
const extDosyalar = readdirSync(kaynakExt).filter((ad) => ad.endsWith(".ts") || ad.endsWith(".mjs"));
ekle(`kanca/modül: ${extDosyalar.length} dosya → ${hedefExt}`);

// 2. Şablonlar (yalnız yoksa yazılır: ajanın öğrendiği dosyaları ezmez)
const dil = String(arg("--dil", "en")).toLowerCase() === "tr" ? "tr" : "en";
const kaynakTpl = existsSync(join(KOK, "templates", dil)) ? join(KOK, "templates", dil) : join(KOK, "templates");
const hedefSkill = join(hedefKok, "skills", "user-character");
const tplDosyalar = existsSync(kaynakTpl) ? readdirSync(kaynakTpl).filter((ad) => ad.endsWith(".md")) : [];
ekle(`şablon     : ${tplDosyalar.length} dosya (${dil}) → ${hedefSkill} (yalnız eksikse)`);

// 3. Veri dizini
const hedefVeri = join(hedefKok, "user-character");
ekle(`veri       : ${hedefVeri}`);
ekle(`taban değer: yetki 0 · merit 0 · günlük tavan ${POLITIKA.tavan.yetkiGun}`);

// 4. Göç
const puanDosyasi = join(hedefKok, "puan-durum.json");
const eski = eskiDurumOku({ puanDosyasi, scoreboardDosyasi: join(hedefSkill, "SCOREBOARD.md") });
ekle(`göç        : ${existsSync(puanDosyasi) ? `eski puan ${eski.eskiPuan} → yetki ${eski.yetki} (tavan ${POLITIKA.esikler[2]})` : "eski puan yok → yetki 0"}`);
ekle("");

if (!yaz) {
  ekle("Yazmak için: node tools/kur.mjs --yaz");
  console.log(satirlar.join("\n"));
  process.exit(0);
}

// --- Gerçek kurulum ---
mkdirSync(hedefExt, { recursive: true });
mkdirSync(hedefSkill, { recursive: true });
mkdirSync(hedefVeri, { recursive: true });

// Yedek: dokunacağımız dosyalar
if (existsSync(hedefExt)) {
  mkdirSync(yedekDizin, { recursive: true });
  for (const ad of readdirSync(hedefExt)) {
    const kaynak = join(hedefExt, ad);
    if (statSync(kaynak).isFile()) copyFileSync(kaynak, join(yedekDizin, ad));
  }
}

let kopyalanan = 0;
for (const ad of extDosyalar) {
  copyFileSync(join(kaynakExt, ad), join(hedefExt, ad));
  kopyalanan += 1;
}

let tplYazilan = 0;
for (const ad of tplDosyalar) {
  const hedef = join(hedefSkill, ad);
  if (!existsSync(hedef)) {
    copyFileSync(join(kaynakTpl, ad), hedef);
    tplYazilan += 1;
  }
}

// Göç olayı (idempotent: aynı göç ikinci kez yazılmaz)
const olayYolu = join(hedefVeri, "skor-olaylar.jsonl");
const goc = gocYaz({ olayYolu, onceki: eski, simdi: Date.now(), kuruCalisma: false });

// Yedek manifesti
writeFileSync(
  join(yedekDizin, "MANIFEST.txt"),
  [
    `pi-user-character ${SURUM} kurulumu`,
    `tarih: ${new Date().toISOString()}`,
    `hedef: ${hedefKok}`,
    `yedeklenen: ${existsSync(yedekDizin) ? readdirSync(yedekDizin).length : 0} dosya`,
    "",
  ].join("\n"),
  "utf8",
);

ekle(`kopyalandı : ${kopyalanan} kanca · ${tplYazilan} yeni şablon`);
ekle(`yedek      : ${yedekDizin}`);
ekle(`göç olayı  : ${goc.yazildi ? "yazıldı" : goc.tekrar ? "zaten vardı (tekrar)" : "yazılmadı"} → ${olayYolu}`);
ekle("");
ekle("Sırada: Pi'yi bir kez kapat-aç. Sonra tek istek ver ve şunları gör:");
ekle("  ~/.pi/agent/user-character/skorcu.log   → calisti: ... yetki=...");
ekle("  ~/.pi/agent/user-character/SCOREBOARD.md → Durum tablosu");
console.log(satirlar.join("\n"));
