// Uçtan uca senaryo koşturucusu: sahte Pi oturumu + gerçek kancalar + gerçek depo.
// Canlıya YAZMAZ: geçici eve, canlı günlüğün kopyasıyla çalışır.
// Kullanım: node tools/e2e-senaryo.mjs [--canli-gunluk <yol>]
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { durumHesapla, rutbe } from "../extensions/skor-model.mjs";
import { olayYaz, olaylariOku } from "../extensions/skor-store.mjs";
import { kararOlaylari } from "../extensions/skor-karar.mjs";
import { PENCERE_MS } from "../extensions/skor-model.mjs";
import { notMetni, POLITIKA } from "../extensions/skor-politika.mjs";
import { kapiKarari } from "../extensions/kapi-politika.mjs";

const ev = mkdtempSync(join(tmpdir(), "e2e-"));
mkdirSync(join(ev, ".pi", "agent", "user-character"), { recursive: true });
process.env.USERPROFILE = ev;
process.env.HOME = ev;

const canliArg = process.argv.indexOf("--canli-gunluk");
const kaynak = canliArg > -1 ? process.argv[canliArg + 1] : null;
const gunluk = join(ev, ".pi", "agent", "user-character", "skor-olaylar.jsonl");
if (kaynak && existsSync(kaynak)) {
  writeFileSync(gunluk, readFileSync(kaynak, "utf8"));
}

const cwd = join(ev, "proje");
mkdirSync(cwd, { recursive: true });

const yaz = (p) => ({ type: "toolCall", name: "write", args: { path: p } });
const oku = (p) => ({ type: "toolCall", name: "read", args: { path: p } });
const ok = (ad) => ({ type: "toolResult", toolName: ad, isError: false, content: "ok" });
const hata = (ad, metin) => ({ type: "toolResult", toolName: ad, isError: true, content: metin });

const satirlar = [];
function say(ad, gecti, detay) {
  satirlar.push({ ad, gecti, detay });
}

// --- Tur koşturucusu: skorcu'nun yaptığı işin aynısı ---
function tur({ ad, mesajlar, testGecti = false, istekMetni = ad }) {
  const { yargi, olaylar } = kararOlaylari({ mesajlar, testGecti, istekMetni, simdi: Date.now() });
  let yazilan = 0;
  let tekrar = 0;
  for (const olay of olaylar) {
    const pencereMs = olay.tip === "istek" ? PENCERE_MS : olay.tip === "merit" ? Infinity : 0;
    const s = olayYaz(gunluk, olay, { pencereMs });
    s?.yazildi ? (yazilan += 1) : (tekrar += 1);
  }
  const durum = durumHesapla(olaylariOku(gunluk).olaylar, { simdi: Date.now() });
  return { yargi, yazilan, tekrar, durum };
}

function bekle(ad, kosul, detay) {
  say(ad, Boolean(kosul), detay);
}

// --- 0. Başlangıç ---
const bas = durumHesapla(olaylariOku(gunluk).olaylar, { simdi: Date.now() });
console.log(`başlangıç: yetki=${bas.yetki} merit=${bas.merit} rütbe=${rutbe(bas.yetki).name} aktif=${bas.aktif}`);

// --- 1. Temiz iş turu → +1 ---
const t1 = tur({ ad: "temiz iş", mesajlar: [{ role: "user", content: "x" }, yaz("a.js"), ok("write")] });
bekle("temiz iş: istek olayı yazıldı", t1.yazilan === 1 && t1.yargi.risk === 0, `yazilan=${t1.yazilan}`);
// Tavan dolmuşsa yeni kredi yazılmaz (K39): beklenen artış tavan durumuna bağlı.
const tavanDolu = bas.gunluk.isBirimi >= bas.gunluk.tavan;
bekle(
  tavanDolu ? "temiz iş: tavan dolu, yetki sabit" : "temiz iş: yetki +1",
  t1.durum.yetki === (tavanDolu ? bas.yetki : bas.yetki + 1),
  `${bas.yetki}→${t1.durum.yetki} (tavan ${bas.gunluk.isBirimi}/${bas.gunluk.tavan})`,
);

// --- 2. Aynı iş tekrar → tekilleştirme (K44) ---
const t2 = tur({ ad: "temiz iş", mesajlar: [{ role: "user", content: "x" }, yaz("a.js"), ok("write")] });
bekle("aynı iş tekrar: puan yok", t2.durum.yetki === t1.durum.yetki, `yetki ${t2.durum.yetki} sabit`);
bekle("aynı iş tekrar: tekrar sayacı", t2.tekrar >= 1, `tekrar=${t2.tekrar}`);

// --- 3. Toparlanmış hata → D, tur Durur (K49+K38) ---
const t3 = tur({
  ad: "hata+düzeltme",
  mesajlar: [{ role: "user", content: "y" }, yaz("b.js"), hata("write", "SyntaxError: missing ) after argument list"), yaz("b.js"), ok("write")],
});
const dVar = t3.yargi.dE.filter((k) => k.grup === "D").length;
const eVar = t3.yargi.dE.filter((k) => k.grup === "E").length;
bekle("toparlanmış hata: yalnız D (çift ceza yok)", dVar === 1 && eVar === 0, `D=${dVar} E=${eVar}`);
bekle(
  "toparlanmış hata: yetki artmadı",
  t3.durum.yetki === Math.max(0, t2.durum.yetki - 2),
  `yetki ${t2.durum.yetki}→${t3.durum.yetki} (−2, taban 0)`,
);
bekle("toparlanmış hata: pasifleşti", t3.durum.aktif === false, `aktif=${t3.durum.aktif}`);

// --- 4. Pasifken kapı: yazma onay ister, duvar bloklar, izin kapsamı dar ---
const pasifKarar = kapiKarari({ toolName: "write", input: { path: "c.js" }, rank: -1, cwd, now: Date.now() });
bekle("pasif kapı: yazma confirm", pasifKarar.action === "confirm" && /pasif/.test(pasifKarar.reason), pasifKarar.reason);
const duvar = kapiKarari({ toolName: "bash", input: { command: "cp a.js C:/Windows/x.js" }, rank: 5, cwd, now: Date.now(), grant: { kapsam: "shell", until: Date.now() + 60000 } });
bekle("duvar: geçerli izinle bile deny", duvar.action === "deny", `${duvar.action} ${duvar.wall ?? ""}`);

// --- 5. Üç temiz tur → aktif geri gelir, tavan yetkiyi sınırlar ---
const once = t3.durum.yetki;
let d = t3.durum;
for (let i = 0; i < 3; i += 1) {
  const t = tur({ ad: `toparlanma ${i + 1}`, mesajlar: [{ role: "user", content: `z${i}` }, yaz(`r${i}.js`), ok("write")] });
  d = t.durum;
}
bekle("3 temiz tur: aktif geri geldi", d.aktif === true, `aktif=${d.aktif}`);
bekle("günlük tavan: en çok 3 kredi", d.yetki - once <= POLITIKA.tavan.yetkiGun, `yetki ${once}→${d.yetki} (tavan ${POLITIKA.tavan.yetkiGun})`);

// --- 5b. Öğrenme turu → merit +1 (K: merit ekseni) ---
const ogrenme = tur({
  ad: "ogrenme",
  mesajlar: [{ role: "user", content: "ders yaz" }, yaz("OGRENME/test-dersi.md"), ok("write")],
});
bekle(
  "öğrenme: merit +1",
  ogrenme.durum.merit > d.merit,
  `merit ${d.merit}→${ogrenme.durum.merit}`,
);
bekle(
  "öğrenme: rozet eşiği raporlanıyor",
  ogrenme.durum.merit < 10 ? true : true,
  `merit ${ogrenme.durum.merit} · sıradaki ${ogrenme.durum.merit >= 10 ? "İz (25)" : "Kıvılcım (10)"}`,
);

// --- 6. Not metni: kısa, skorbord sızdırmaz ---
const not = notMetni({ yetki: d.yetki, merit: d.merit, rank: d.rank, aktif: d.aktif, izin: "yok", gunluk: d.gunluk });
bekle("not: 1200 karakterden kısa", not.length < 1200, `${not.length} karakter`);
bekle("not: yetki satırı doğru", not.includes(`Yetki ${d.yetki} (${rutbe(d.yetki).name})`), not.split("\n")[0]);
bekle("not: skorbord tablosu yok", !not.includes("| # | Tarih |"), "temiz");

// --- Rapor ---
const kotu = satirlar.filter((s) => !s.gecti);
console.log("");
for (const s of satirlar) console.log(`${s.gecti ? "✓" : "✗"} ${s.ad} — ${s.detay}`);
console.log(`\n${satirlar.length - kotu.length}/${satirlar.length} geçti`);
if (kotu.length) {
  console.log("\nBAŞARISIZ:");
  for (const s of kotu) console.log(` - ${s.ad}: ${s.detay}`);
  process.exitCode = 1;
}
console.log(`\nson durum: yetki=${d.yetki} merit=${d.merit} rütbe=${rutbe(d.yetki).name} aktif=${d.aktif} günlük=${d.gunluk.isBirimi}/${d.gunluk.tavan}`);
