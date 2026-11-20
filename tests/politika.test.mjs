import assert from "node:assert/strict";
import test from "node:test";
import { POLITIKA, rutbeAdi, kazanilanRozet, sonrakiRozet, notMetni } from "../extensions/skor-politika.mjs";

test("yetki eşikleri tam olarak 0,5,15,30,50,75,105,140", () => {
  assert.deepEqual(POLITIKA.esikler, [0, 5, 15, 30, 50, 75, 105, 140]);
});

test("merit eşikleri ve rozet adları sabittir", () => {
  assert.deepEqual(POLITIKA.meritEsikleri, [
    { ad: "Kıvılcım", merit: 10 },
    { ad: "İz", merit: 25 },
    { ad: "Pusula", merit: 45 },
    { ad: "Fener", merit: 70 },
    { ad: "Bilge", merit: 100 },
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
  assert.equal(rutbeAdi(0), "bronz");
  assert.equal(rutbeAdi(2), "altın");
  assert.equal(rutbeAdi(7), "elmas 5");
  assert.equal(rutbeAdi(-1), "—");
});

test("kazanilanRozet merit'in hak ettiği rozeti verir", () => {
  assert.equal(kazanilanRozet(0), null);
  assert.equal(kazanilanRozet(9), null);
  assert.equal(kazanilanRozet(10), "Kıvılcım");
  assert.equal(kazanilanRozet(24), "Kıvılcım");
  assert.equal(kazanilanRozet(25), "İz");
  assert.equal(kazanilanRozet(100), "Bilge");
  assert.equal(kazanilanRozet(250), "Bilge");
});

test("sonrakiRozet merit'in üstündeki ilk rozeti verir", () => {
  assert.deepEqual(sonrakiRozet(9), { ad: "Kıvılcım", merit: 10 });
  assert.deepEqual(sonrakiRozet(10), { ad: "İz", merit: 25 });
  assert.deepEqual(sonrakiRozet(24), { ad: "İz", merit: 25 });
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
  assert.match(satirlar[0], /Yetki 32/);
  assert.match(satirlar[0], /sıradaki elmas 1: 0/);
  assert.match(satirlar[0], /bugün 2\/3 iş birimi/);
  assert.match(satirlar[1], /Merit 24/);
  assert.match(satirlar[1], /rozet Kıvılcım \(10\)/);
  assert.match(satirlar[1], /sıradaki İz \(25\): 1/);
  assert.doesNotMatch(text, /Puan:/);
  assert.equal(satirlar.length, 6);
});

test("notMetni en üst rütbe ve rozette sıradaki yoktur", () => {
  const text = notMetni({ yetki: 150, merit: 250 });
  const satirlar = text.trim().split("\n");
  assert.match(satirlar[0], /sıradaki —: 0/);
  assert.match(satirlar[1], /sıradaki —: 0/);
  assert.equal(text.match(/sıradaki —: 0/g).length, 2);
});

test("iki eksenin sayı kümeleri ayrık", () => {
  const yetki = new Set(POLITIKA.esikler);
  const merit = POLITIKA.meritEsikleri.map((x) => x.merit);
  const kesisim = merit.filter((m) => yetki.has(m));
  assert.deepEqual(kesisim, []);
});
