import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  kilitAl,
  olayYaz,
  olaylariOku,
  onbellekYaz,
  onbellekOku,
  onbellekOnar,
  gorunumYaz,
} from "../extensions/skor-store.mjs";

const GUN = 24 * 60 * 60 * 1000;
const PENCERE_MS = 30 * GUN;
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PARALEL_ARAC = join(TEST_DIR, "..", "tools", "parallel-append.mjs");

const geciciDizin = (t) => {
  const dizin = mkdtempSync(join(tmpdir(), "skor-store-"));
  t.after(() => rmSync(dizin, { recursive: true, force: true }));
  return dizin;
};

const satir = (olay) => `${JSON.stringify(olay)}\n`;

test("olaylariOku: 500 tam satır + yarım son satır → 500 olay, 0 bozuk", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "olaylar.jsonl");
  const tam = Array.from({ length: 500 }, (_, i) =>
    satir({ tip: "istek", delta: 1, anahtar: `is:${i}`, ts: 1_000 + i }),
  ).join("");
  writeFileSync(yol, `${tam}{"tip":"istek","anahtar":"yarim`);
  const { olaylar, bozuk } = olaylariOku(yol);
  assert.equal(olaylar.length, 500);
  assert.equal(bozuk, 0);
});

test("olaylariOku: ortadaki bozuk satır bozuk sayılır ve atlanır", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "olaylar.jsonl");
  writeFileSync(
    yol,
    satir({ tip: "istek", delta: 1, anahtar: "is:a", ts: 1 }) +
      "{bozuk satir\n" +
      satir({ tip: "istek", delta: 1, anahtar: "is:b", ts: 2 }),
  );
  const { olaylar, bozuk } = olaylariOku(yol);
  assert.equal(olaylar.length, 2);
  assert.equal(bozuk, 1);
});

test("kilitAl: aynı kilit bayat devralmadan önce ikinci kez alınamaz", (t) => {
  const dizin = geciciDizin(t);
  const kilit = join(dizin, "depo.kilit");
  const birak = kilitAl(kilit, { staleMs: 60_000, deneme: 0, aralikMs: 1 });
  assert.throws(() => kilitAl(kilit, { staleMs: 60_000, deneme: 0, aralikMs: 1 }));
  birak();
  birak();
  assert.equal(existsSync(kilit), false);
  const tekrar = kilitAl(kilit, { staleMs: 60_000, deneme: 0, aralikMs: 1 });
  tekrar();
});

test("kilitAl: mtime'ı eski bayat kilit devralınır", (t) => {
  const dizin = geciciDizin(t);
  const kilit = join(dizin, "depo.kilit");
  mkdirSync(kilit);
  const eski = new Date(Date.now() - 10_000);
  utimesSync(kilit, eski, eski);
  const birak = kilitAl(kilit, { staleMs: 1_000, deneme: 1, aralikMs: 1 });
  assert.equal(existsSync(kilit), true);
  birak();
  assert.equal(existsSync(kilit), false);
});

test("olayYaz: aynı anahtar pencere içinde ikinci kez yazılmaz", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "olaylar.jsonl");
  const t0 = 1_000_000;
  assert.deepEqual(olayYaz(yol, { tip: "istek", anahtar: "is:a", ts: t0 }, { pencereMs: PENCERE_MS }), {
    yazildi: true,
    tekrar: false,
  });
  assert.deepEqual(
    olayYaz(yol, { tip: "istek", anahtar: "is:a", ts: t0 + 1_000 }, { pencereMs: PENCERE_MS }),
    { yazildi: false, tekrar: true, mevcut: t0 },
  );
  assert.equal(olaylariOku(yol).olaylar.length, 1);
});

test("olayYaz: pencere dışındaki aynı anahtar yeni olay olarak yazılır", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "olaylar.jsonl");
  const t0 = 1_000_000;
  olayYaz(yol, { tip: "istek", anahtar: "is:a", ts: t0 }, { pencereMs: PENCERE_MS });
  const sonuc = olayYaz(
    yol,
    { tip: "istek", anahtar: "is:a", ts: t0 + PENCERE_MS },
    { pencereMs: PENCERE_MS },
  );
  assert.deepEqual(sonuc, { yazildi: true, tekrar: false });
  assert.equal(olaylariOku(yol).olaylar.length, 2);
});

test("olayYaz: pencereMs verilmezse tekilleştirme yapılmaz (K48)", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "olaylar.jsonl");
  const t0 = 1_000_000;
  assert.deepEqual(olayYaz(yol, { tip: "istek", anahtar: "is:a", ts: t0 }), {
    yazildi: true,
    tekrar: false,
  });
  assert.deepEqual(olayYaz(yol, { tip: "istek", anahtar: "is:a", ts: t0 }), {
    yazildi: true,
    tekrar: false,
  });
  assert.equal(olaylariOku(yol).olaylar.length, 2);
});

test("olayYaz: pencereMs=0 iken aynı anahtar yine yazılır (K48)", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "olaylar.jsonl");
  const t0 = 1_000_000;
  olayYaz(yol, { tip: "istek", anahtar: "is:a", ts: t0 }, { pencereMs: 0 });
  const sonuc = olayYaz(yol, { tip: "istek", anahtar: "is:a", ts: t0 }, { pencereMs: 0 });
  assert.deepEqual(sonuc, { yazildi: true, tekrar: false });
  assert.equal(olaylariOku(yol).olaylar.length, 2);
});

test("4 paralel süreç × 25 olay → 100 satır, kayıp yok", async (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "olaylar.jsonl");
  const calistir = () =>
    new Promise((resolve, reject) => {
      const cocuk = spawn(process.execPath, [PARALEL_ARAC, "--worker", yol, "25"], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let hata = "";
      cocuk.stderr.on("data", (parca) => {
        hata += parca;
      });
      cocuk.on("error", reject);
      cocuk.on("exit", (kod) => {
        if (kod === 0) resolve();
        else reject(new Error(`worker çıkış ${kod}: ${hata}`));
      });
    });
  await Promise.all(Array.from({ length: 4 }, calistir));
  const { olaylar, bozuk } = olaylariOku(yol);
  assert.equal(olaylar.length, 100);
  assert.equal(bozuk, 0);
});

test("onbellekYaz/onbellekOku aynı veriyi döner", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "durum.json");
  const veri = { yetki: 7, merit: 3, gunluk: { isBirimi: 2, tekrar: 1 }, liste: [1, 2, 3] };
  onbellekYaz(yol, veri);
  assert.deepEqual(onbellekOku(yol), veri);
});

test("bozuk önbellek null döner ve onbellekOnar günlükten düzeltir", (t) => {
  const dizin = geciciDizin(t);
  const onbellek = join(dizin, "durum.json");
  const olayYolu = join(dizin, "olaylar.jsonl");
  const ts = Date.now();
  writeFileSync(
    olayYolu,
    satir({ tip: "istek", delta: 1, anahtar: "is:a", ts }) +
      satir({ tip: "istek", delta: 1, anahtar: "is:b", ts: ts + 1 }) +
      satir({ tip: "merit", delta: 2, anahtar: "m:a", kaynak: "kesif", ts: ts + 2 }),
  );
  writeFileSync(onbellek, "{bu bozuk");
  assert.equal(onbellekOku(onbellek), null);
  const durum = onbellekOnar(onbellek, olayYolu);
  assert.equal(durum.yetki, 2);
  assert.equal(durum.merit, 2);
  assert.deepEqual(onbellekOku(onbellek), durum);
});

test("gorunumYaz atomik yazar ve .tmp bırakmaz", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "GORUNUM.md");
  const satirlar = ["# Başlık", "", "- bir", "- iki"];
  gorunumYaz(yol, satirlar);
  assert.equal(readFileSync(yol, "utf8"), satirlar.join("\n"));
  assert.deepEqual(
    readdirSync(dizin).filter((ad) => ad.endsWith(".tmp")),
    [],
  );
});
