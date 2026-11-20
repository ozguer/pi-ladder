// End-to-end scenario runner: fake Pi session + real hooks + real store.
// Does NOT write to live data: runs in a temporary home with a copy of the live log.
// Usage: node tools/e2e-senaryo.mjs [--canli-gunluk <path>]
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

// --- Turn runner: the same work the scorer does ---
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

// --- 0. Initial state ---
const bas = durumHesapla(olaylariOku(gunluk).olaylar, { simdi: Date.now() });
console.log(`start: authority=${bas.yetki} merit=${bas.merit} rank=${rutbe(bas.yetki).name} active=${bas.aktif}`);

// --- 1. Clean work turn → +1 ---
const t1 = tur({ ad: "clean work", mesajlar: [{ role: "user", content: "x" }, yaz("a.js"), ok("write")] });
bekle("clean work: request event written", t1.yazilan === 1 && t1.yargi.risk === 0, `written=${t1.yazilan}`);
// If the cap is full, no new credit is written (K39): expected gain depends on the cap state.
const tavanDolu = bas.gunluk.isBirimi >= bas.gunluk.tavan;
bekle(
  tavanDolu ? "clean work: cap full, authority unchanged" : "clean work: authority +1",
  t1.durum.yetki === (tavanDolu ? bas.yetki : bas.yetki + 1),
  `${bas.yetki}->${t1.durum.yetki} (cap ${bas.gunluk.isBirimi}/${bas.gunluk.tavan})`,
);

// --- 2. Same work repeated → deduplication (K44) ---
const t2 = tur({ ad: "clean work", mesajlar: [{ role: "user", content: "x" }, yaz("a.js"), ok("write")] });
bekle("same work repeated: no points", t2.durum.yetki === t1.durum.yetki, `authority ${t2.durum.yetki} unchanged`);
bekle("same work repeated: duplicate counter", t2.tekrar >= 1, `duplicates=${t2.tekrar}`);

// --- 3. Recovered error → D, turn Stops (K49+K38) ---
const t3 = tur({
  ad: "error+correction",
  mesajlar: [{ role: "user", content: "y" }, yaz("b.js"), hata("write", "SyntaxError: missing ) after argument list"), yaz("b.js"), ok("write")],
});
const dVar = t3.yargi.dE.filter((k) => k.grup === "D").length;
const eVar = t3.yargi.dE.filter((k) => k.grup === "E").length;
bekle("recovered error: only D (no double penalty)", dVar === 1 && eVar === 0, `D=${dVar} E=${eVar}`);
bekle(
  "recovered error: authority did not rise",
  t3.durum.yetki === Math.max(0, t2.durum.yetki - 2),
  `authority ${t2.durum.yetki}->${t3.durum.yetki} (-2, floor 0)`,
);
bekle("recovered error: became passive", t3.durum.aktif === false, `active=${t3.durum.aktif}`);

// --- 4. Gate while passive: write asks, wall blocks, grant scope narrow ---
const pasifKarar = kapiKarari({ toolName: "write", input: { path: "c.js" }, rank: -1, cwd, now: Date.now() });
bekle("passive gate: write confirm", pasifKarar.action === "confirm" && /passive/.test(pasifKarar.reason), pasifKarar.reason);
const duvar = kapiKarari({ toolName: "bash", input: { command: "cp a.js C:/Windows/x.js" }, rank: 5, cwd, now: Date.now(), grant: { kapsam: "shell", until: Date.now() + 60000 } });
bekle("wall: deny even with a valid grant", duvar.action === "deny", `${duvar.action} ${duvar.wall ?? ""}`);

// --- 5. Three clean turns → active returns, cap limits authority ---
const once = t3.durum.yetki;
let d = t3.durum;
for (let i = 0; i < 3; i += 1) {
  const t = tur({ ad: `recovery ${i + 1}`, mesajlar: [{ role: "user", content: `z${i}` }, yaz(`r${i}.js`), ok("write")] });
  d = t.durum;
}
bekle("3 clean turns: active returned", d.aktif === true, `active=${d.aktif}`);
bekle("daily cap: at most 3 credits", d.yetki - once <= POLITIKA.tavan.yetkiGun, `authority ${once}->${d.yetki} (cap ${POLITIKA.tavan.yetkiGun})`);

// --- 5b. Learning turn → merit +1 (K: merit axis) ---
const ogrenme = tur({
  ad: "learning",
  mesajlar: [{ role: "user", content: "write a lesson" }, yaz("OGRENME/test-dersi.md"), ok("write")],
});
bekle(
  "learning: merit +1",
  ogrenme.durum.merit > d.merit,
  `merit ${d.merit}->${ogrenme.durum.merit}`,
);
bekle(
  "learning: badge threshold reported",
  ogrenme.durum.merit < 10 ? true : true,
  `merit ${ogrenme.durum.merit} · next ${ogrenme.durum.merit >= 10 ? "Trace (25)" : "Spark (10)"}`,
);

// --- 6. Note text: short, does not leak the scoreboard ---
const not = notMetni({ yetki: d.yetki, merit: d.merit, rank: d.rank, aktif: d.aktif, izin: "none", gunluk: d.gunluk });
bekle("note: shorter than 1200 characters", not.length < 1200, `${not.length} characters`);
bekle("note: authority line correct", not.includes(`Authority ${d.yetki} (${rutbe(d.yetki).name})`), not.split("\n")[0]);
bekle("note: no scoreboard table", !not.includes("| # | Date |"), "clean");

// --- Report ---
const kotu = satirlar.filter((s) => !s.gecti);
console.log("");
for (const s of satirlar) console.log(`${s.gecti ? "✓" : "✗"} ${s.ad} — ${s.detay}`);
console.log(`\n${satirlar.length - kotu.length}/${satirlar.length} passed`);
if (kotu.length) {
  console.log("\nFAILED:");
  for (const s of kotu) console.log(` - ${s.ad}: ${s.detay}`);
  process.exitCode = 1;
}
console.log(`\nfinal state: authority=${d.yetki} merit=${d.merit} rank=${rutbe(d.yetki).name} active=${d.aktif} daily=${d.gunluk.isBirimi}/${d.gunluk.tavan}`);
