import assert from "node:assert/strict";
import test from "node:test";
import {
  rutbe,
  cezaDeltasi,
  istekKredisi,
  meritKredisi,
  isBirimiAnahtari,
  durumHesapla,
} from "../extensions/skor-model.mjs";
import { POLITIKA } from "../extensions/skor-politika.mjs";

const GUN = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-11-20T00:00:00Z");

const istek = (anahtar, ts, delta = 1) => ({ tip: "istek", delta, anahtar, ts });
const ceza = (ts, delta = -3) => ({ tip: "ceza", delta, ts });

test("K47: aynı iş anahtarı 10 gün sonra tekrar sayılır", () => {
  const olaylar = [istek("is:a", T0), istek("is:a", T0 + 10 * GUN)];
  const r = durumHesapla(olaylar, { simdi: T0 + 10 * GUN });
  assert.equal(r.yetki, 1);
  assert.equal(r.gunluk.tekrar, 1);
});

test("K47: aynı iş anahtarı 31 gün sonra yeni iş sayılır", () => {
  const olaylar = [istek("is:a", T0), istek("is:a", T0 + 31 * GUN)];
  const r = durumHesapla(olaylar, { simdi: T0 + 31 * GUN });
  assert.equal(r.yetki, 2);
  assert.equal(r.gunluk.tekrar, 0);
});

test("K47: ders anahtarı 400 gün sonra hâlâ tekrar sayılır", () => {
  const olaylar = [
    { tip: "merit", delta: 2, anahtar: "m:a", kaynak: "kesif", ts: T0 },
    { tip: "merit", delta: 2, anahtar: "m:a", kaynak: "kesif", ts: T0 + 400 * GUN },
  ];
  const r = durumHesapla(olaylar, { simdi: T0 + 400 * GUN });
  assert.equal(r.merit, 2);
});

test("K47: istekKredisi Map ile pencereyi, Set ile ömür boyu tekilleştirir", () => {
  const gorulen = new Map([["is:a", T0]]);
  assert.equal(
    istekKredisi({ correctionFree: true, work: true, key: "is:a", gorulen, simdi: T0 + 10 * GUN })
      .sebep,
    "tekrar",
  );
  assert.deepEqual(
    istekKredisi({ correctionFree: true, work: true, key: "is:a", gorulen, simdi: T0 + 31 * GUN }),
    { kabul: true, delta: 1 },
  );
  assert.equal(
    istekKredisi({
      correctionFree: true,
      work: true,
      key: "is:a",
      gorulen: new Set(["is:a"]),
      simdi: T0 + 400 * GUN,
    }).sebep,
    "tekrar",
  );
});

test("K44: aynı iş anahtarı 4 kez yalnız 1 yetki verir", () => {
  const olaylar = [0, 1, 2, 3].map((i) => istek("is:a", T0 + i * 1000));
  const r = durumHesapla(olaylar, { simdi: T0 + 10_000 });
  assert.equal(r.yetki, 1);
  assert.equal(r.gunluk.isBirimi, 1);
  assert.equal(r.gunluk.tekrar, 3);
});

test("4 farklı istek anahtarı 4 yetki verir", () => {
  const olaylar = [0, 1, 2, 3].map((i) => istek(`is:${i}`, T0 + i * GUN));
  const r = durumHesapla(olaylar, { simdi: T0 + 3 * GUN });
  assert.equal(r.yetki, 4);
});

test("ceza katsayıları D -2, E -3, E/5 -5", () => {
  assert.equal(cezaDeltasi({ grup: "D", derece: 1 }), -2);
  assert.equal(cezaDeltasi({ grup: "E", derece: 3 }), -3);
  assert.equal(cezaDeltasi({ grup: "E", derece: 5 }), -5);
});

test("yetki 10 iken D cezası sonrası 8 olur", () => {
  const r = durumHesapla(
    [
      { tip: "goc", delta: 10, ts: T0 },
      { tip: "ceza", delta: cezaDeltasi({ grup: "D", derece: 1 }), ts: T0 + 1 },
    ],
    { simdi: T0 },
  );
  assert.equal(r.yetki, 8);
});

test("günlük tavan: aynı gün 10 istekten yalnız 3'ü sayılır", () => {
  const olaylar = Array.from({ length: 10 }, (_, i) => istek(`is:${i}`, T0 + i * 1000));
  const r = durumHesapla(olaylar, { simdi: T0 + 20_000 });
  assert.equal(r.yetki, POLITIKA.tavan.yetkiGun);
  assert.equal(r.gunluk.isBirimi, POLITIKA.tavan.yetkiGun);
  assert.equal(r.gunluk.tavan, POLITIKA.tavan.yetkiGun);
  assert.equal(r.gunluk.tekrar, 0);
});

test("tavanı aşan istekler günlükte isBirimi'ne girmez", () => {
  const sayilan = Array.from({ length: 3 }, (_, i) => istek(`is:${i}`, T0 + i * 1000));
  const sayilmaz = Array.from({ length: 4 }, (_, i) => istek(`is:x${i}`, T0 + (i + 3) * 1000));
  const r = durumHesapla([...sayilan, ...sayilmaz], { simdi: T0 + 10_000 });
  assert.equal(r.yetki, 3);
  assert.equal(r.gunluk.isBirimi, 3);
});

test("merit tekrarı: aynı anahtar 2 kez yalnız 1 kez sayılır", () => {
  const olaylar = [
    { tip: "merit", delta: 2, anahtar: "m:a", kaynak: "kesif", ts: T0 },
    { tip: "merit", delta: 2, anahtar: "m:a", kaynak: "kesif", ts: T0 + 1 },
  ];
  const r = durumHesapla(olaylar, { simdi: T0 });
  assert.equal(r.merit, 2);
});

test("meritKredisi aynı anahtarı tekrar saymaz", () => {
  const gorulen = new Set(["m:a"]);
  assert.deepEqual(
    meritKredisi({ kaynak: "kesif", key: "m:a", puan: 99, gorulen, istekToplam: 0 }),
    { kabul: false, delta: 0, sebep: "tekrar" },
  );
});

test("merit istek tavanı: 1+2+2 toplamı 2'ye kırpılır", () => {
  const gorulen = new Set();
  const ogrenme = meritKredisi({ kaynak: "ogrenme", key: "m:1", puan: 99, gorulen, istekToplam: 0 });
  const kesif = meritKredisi({ kaynak: "kesif", key: "m:2", puan: 99, gorulen, istekToplam: ogrenme.delta });
  const kurtarma = meritKredisi({
    kaynak: "kurtarma",
    key: "m:3",
    puan: 99,
    gorulen,
    istekToplam: ogrenme.delta + kesif.delta,
  });
  assert.equal(ogrenme.delta, 1);
  assert.equal(kesif.delta, 1);
  assert.equal(kesif.sebep, "tavan");
  assert.equal(kurtarma.delta, 0);
  assert.equal(kurtarma.sebep, "tavan");
  assert.equal(ogrenme.delta + kesif.delta + kurtarma.delta, POLITIKA.tavan.istekMerit);
});

test("meritKredisi bilinmeyen kaynağı reddeder", () => {
  assert.deepEqual(
    meritKredisi({ kaynak: "bilinmez", key: "m:x", puan: 5, gorulen: new Set(), istekToplam: 0 }),
    { kabul: false, delta: 0, sebep: "bilinmeyen kaynak" },
  );
});

test("günlük merit tavanı aşılmaz", () => {
  const olaylar = Array.from({ length: 5 }, (_, i) => ({
    tip: "merit",
    delta: 1,
    anahtar: `m:${i}`,
    kaynak: "ogrenme",
    ts: T0 + i * 1000,
  }));
  const r = durumHesapla(olaylar, { simdi: T0 + 10_000 });
  assert.equal(r.merit, POLITIKA.tavan.meritGun);
});

test("legacy olayının delta'sı yetki ve merit'e katılmaz", () => {
  const r = durumHesapla([{ tip: "legacy", delta: 99, ts: T0 }], { simdi: T0 });
  assert.equal(r.yetki, 0);
  assert.equal(r.merit, 0);
  assert.equal(r.rank, 0);
});

test("goc olayı yetkiyi delta'dan, merit'i ayrı alandan alır", () => {
  const r = durumHesapla([{ tip: "goc", delta: 50, merit: 24, ts: T0 }], { simdi: T0 });
  assert.equal(r.yetki, 50);
  assert.equal(r.merit, 24);
  assert.equal(r.rank, 4);
});

test("durumHesapla sıra bağımsızdır", () => {
  const olaylar = [
    { tip: "goc", delta: 50, merit: 24, ts: T0 },
    istek("is:a", T0 + 1),
    istek("is:a", T0 + 2),
    ceza(T0 + 3, -3),
    { tip: "merit", delta: 2, anahtar: "m:a", kaynak: "kesif", ts: T0 + 4 },
    { tip: "legacy", delta: 99, ts: T0 + 5 },
    { tip: "merit", delta: 2, anahtar: "m:a", kaynak: "kesif", ts: T0 + 6 },
  ];
  const duz = durumHesapla(olaylar, { simdi: T0 + 4 });
  const ters = durumHesapla([...olaylar].reverse(), { simdi: T0 + 4 });
  assert.deepEqual(ters, duz);
});

test("aktif: son 3 istek/ceza olayında ceza varsa pasif", () => {
  const pasif = durumHesapla([istek("is:a", T0), istek("is:b", T0 + 1), ceza(T0 + 2, -2)], {
    simdi: T0,
  });
  assert.equal(pasif.aktif, false);
  assert.equal(pasif.risk, 1);
});

test("aktif: 4. eski ceza pencereden çıkınca etkilemez", () => {
  const r = durumHesapla(
    [ceza(T0, -3), istek("is:a", T0 + 1), istek("is:b", T0 + 2), istek("is:c", T0 + 3)],
    { simdi: T0 },
  );
  assert.equal(r.aktif, true);
  assert.equal(r.risk, 0);
});

test("rutbe eşik indeksini ve sıradaki rütbeyi verir", () => {
  assert.equal(rutbe(0).name, "bronz");
  assert.equal(rutbe(0).index, 0);
  assert.deepEqual(rutbe(0).next, { name: "gümüş", kalan: 5 });
  assert.equal(rutbe(4).index, 0);
  assert.deepEqual(rutbe(4).next, { name: "gümüş", kalan: 1 });
  assert.equal(rutbe(5).index, 1);
  assert.equal(rutbe(139).next.name, "elmas 5");
  assert.equal(rutbe(140).index, 7);
  assert.equal(rutbe(140).next, null);
  assert.equal(rutbe(-5).index, 0);
});

test("istekKredisi kabul ve ret sebeplerini verir", () => {
  assert.deepEqual(istekKredisi({ correctionFree: true, work: true, key: "is:a", gorulen: new Set() }), {
    kabul: true,
    delta: 1,
  });
  assert.equal(
    istekKredisi({ correctionFree: false, work: true, key: "is:a", gorulen: new Set() }).sebep,
    "duzeltildi",
  );
  assert.equal(
    istekKredisi({ correctionFree: true, work: false, key: "is:a", gorulen: new Set() }).sebep,
    "is yok",
  );
  assert.equal(
    istekKredisi({ correctionFree: true, work: true, key: "is:a", gorulen: new Set(["is:a"]) }).sebep,
    "tekrar",
  );
});

test("isBirimiAnahtari aynı girdide aynı, dosya sırasından bağımsız", () => {
  const a = isBirimiAnahtari({
    istekMetni: "  Düzelt   skoru \n",
    dosyalar: ["b.mjs", "a.mjs", "a.mjs"],
    diffHash: "abc",
  });
  const b = isBirimiAnahtari({
    istekMetni: "Düzelt skoru",
    dosyalar: ["a.mjs", "a.mjs", "b.mjs"],
    diffHash: "abc",
  });
  assert.equal(a, b);
});

test("isBirimiAnahtari is: öneki ve 64 hex taşır", () => {
  const anahtar = isBirimiAnahtari({ istekMetni: "x", dosyalar: [], diffHash: "" });
  assert.match(anahtar, /^is:[0-9a-f]{64}$/);
  assert.equal(anahtar.length, 67);
});

test("isBirimiAnahtari büyük/küçük harf ve diffHash'i korur", () => {
  const taban = isBirimiAnahtari({ istekMetni: "Fix", dosyalar: ["a.mjs"], diffHash: "h1" });
  assert.equal(taban, isBirimiAnahtari({ istekMetni: "Fix", dosyalar: ["a.mjs"], diffHash: "h1" }));
  assert.notEqual(taban, isBirimiAnahtari({ istekMetni: "fix", dosyalar: ["a.mjs"], diffHash: "h1" }));
  assert.notEqual(taban, isBirimiAnahtari({ istekMetni: "Fix", dosyalar: ["a.mjs"], diffHash: "h2" }));
});
