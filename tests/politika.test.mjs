import assert from "node:assert/strict";
import test from "node:test";
import { POLITIKA, rutbeAdi, kazanilanRozet, sonrakiRozet, notMetni } from "../extensions/skor-politika.mjs";

test("yetki eşikleri tam olarak 0,5,15,30,50,75,105,140", () => {
  assert.deepEqual(POLITIKA.esikler, [0, 5, 15, 30, 50, 75, 105, 140]);
});

test("merit eşikleri ve rozet adları sabittir", () => {
  assert.deepEqual(POLITIKA.meritEsikleri, [
    { ad: "Spark", merit: 10 },
    { ad: "Trace", merit: 25 },
    { ad: "Compass", merit: 45 },
    { ad: "Lantern", merit: 70 },
    { ad: "Sage", merit: 100 },
  ]);
});

test("ceza ve ödül katsayıları", () => {
  assert.deepEqual(POLITIKA.ceza, { D: 2, E: 3, E5: 5 });
  assert.deepEqual(POLITIKA.odul, { ogrenme: 1, kesif: 2, kurtarma: 2, seffaflik: 1 });
});

test("günlük tavanlar", () => {
  assert.deepEqual(POLITIKA.tavan, { yetkiGun: 3, meritGun: 3, istekMerit: 2 });
});

test("rutbeAdi indeksleri ve sınır dışını adlandırır", () => {
  assert.equal(rutbeAdi(0), "bronze");
  assert.equal(rutbeAdi(2), "gold");
  assert.equal(rutbeAdi(7), "diamond 5");
  assert.equal(rutbeAdi(-1), "—");
});

test("kazanilanRozet merit'in hak ettiği rozeti verir", () => {
  assert.equal(kazanilanRozet(0), null);
  assert.equal(kazanilanRozet(9), null);
  assert.equal(kazanilanRozet(10), "Spark");
  assert.equal(kazanilanRozet(24), "Spark");
  assert.equal(kazanilanRozet(25), "Trace");
  assert.equal(kazanilanRozet(100), "Sage");
  assert.equal(kazanilanRozet(250), "Sage");
});

test("sonrakiRozet merit'in üstündeki ilk rozeti verir", () => {
  assert.deepEqual(sonrakiRozet(9), { ad: "Spark", merit: 10 });
  assert.deepEqual(sonrakiRozet(10), { ad: "Trace", merit: 25 });
  assert.deepEqual(sonrakiRozet(24), { ad: "Trace", merit: 25 });
  assert.equal(sonrakiRozet(100), null);
});

test("notMetni altı satır, etiketli ve sınırlı", () => {
  const text = notMetni({
    yetki: 32,
    merit: 24,
    rank: 2,
    aktif: true,
    son: "+1",
    izin: "yok",
    gunluk: { isBirimi: 2, tavan: 3, tekrar: 0 },
  });
  const satirlar = text.trim().split("\n");
  assert.ok(text.length <= 1200, `not ${text.length} karakter`);
  assert.match(satirlar[0], /Authority 32/);
  assert.match(satirlar[0], /next diamond 1: 0/);
  assert.match(satirlar[0], /today 2\/3 work units/);
  assert.match(satirlar[1], /Merit 24/);
  assert.match(satirlar[1], /badge Spark \(10\)/);
  assert.match(satirlar[1], /next Trace \(25\): 1/);
  assert.doesNotMatch(text, /Points:/);
  assert.equal(satirlar.length, 6);
});

test("notMetni en üst rütbe ve rozette sıradaki yoktur", () => {
  const text = notMetni({ yetki: 150, merit: 250 });
  const satirlar = text.trim().split("\n");
  assert.match(satirlar[0], /next —: 0/);
  assert.match(satirlar[1], /next —: 0/);
  assert.equal(text.match(/next —: 0/g).length, 2);
});

test("iki eksenin sayı kümeleri ayrık", () => {
  const yetki = new Set(POLITIKA.esikler);
  const merit = POLITIKA.meritEsikleri.map((x) => x.merit);
  const kesisim = merit.filter((m) => yetki.has(m));
  assert.deepEqual(kesisim, []);
});
