import assert from "node:assert/strict";
import test from "node:test";

import { durumOzeti, rozetMetni, skorbordMetni } from "../extensions/skor-gorun.mjs";

const TARIH = "2026-11-20";
const durum = (ek = {}) => ({
  yetki: 15,
  merit: 0,
  rank: 2,
  aktif: true,
  risk: 0,
  gunluk: { isBirimi: 0, tavan: 3, tekrar: 0 },
  ...ek,
});

test("skorbordMetni: durum satirlari Yetki 15, Merit 0, Rutbe altin, Bugun 0/3", () => {
  const metin = skorbordMetni({ durum: durum(), satirlar: {}, tarih: TARIH });

  assert.match(metin, /Authority 15/);
  assert.match(metin, /Merit 0/);
  assert.match(metin, /Rank gold/);
  assert.match(metin, /Today 0\/3 work units/);
  assert.match(metin, /## State/);
});

test("skorbordMetni: satirlar bos olsa da tablo basliklari var, throw yok", () => {
  for (const satirlar of [undefined, null, {}, [], { ceza: [], odul: [] }]) {
    assert.doesNotThrow(() => skorbordMetni({ durum: durum(), satirlar, tarih: TARIH }));
    const metin = skorbordMetni({ durum: durum(), satirlar, tarih: TARIH });
    assert.match(metin, /\| # \| Date \| Group \| Degree \| Rule \| Violation \| Evidence \| Correction \| Points \|/);
    assert.match(metin, /\| # \| Date \| What it was for \| Evidence \| Points \|/);
  }
});

test("skorbordMetni: defter gorunumu oldugunu ve kaynagin olay gunlugu oldugunu soyler", () => {
  const metin = skorbordMetni({ durum: durum(), satirlar: {}, tarih: TARIH });

  assert.match(metin, /This is a view; the source is the event log\./);
  assert.equal(metin.trimEnd().endsWith("This is a view; the source is the event log."), true);
});

test("rozetMetni: merit 0 -> rozet yok, siradaki Kivilcim (10), kalan 10", () => {
  const metin = rozetMetni({ durum: durum({ merit: 0 }), gecmis: [], tarih: TARIH });

  assert.match(metin, /badge none/);
  assert.match(metin, /Spark \(10\)/);
  assert.match(metin, /remaining 10/);
});

test("rozetMetni: merit 25 -> Iz, siradaki Pusula; gecmis en fazla 20 satir", () => {
  const gecmis = Array.from({ length: 25 }, (_, i) => ({
    tarih: TARIH,
    olay: `olay-${i + 1}`,
    rozet: "bronz",
    sebep: "test",
  }));
  const metin = rozetMetni({ durum: durum({ merit: 25 }), gecmis, tarih: TARIH });

  assert.match(metin, /badge Trace/);
  assert.match(metin, /next Compass \(45\)/);
  assert.match(metin, /olay-25/);
  assert.match(metin, /olay-6/);
  assert.equal(metin.includes("olay-5"), false);

  const satirlar = metin.split("\n").filter((satir) => satir.startsWith("| ") && !satir.startsWith("| Date") && !satir.includes("---"));
  assert.equal(satirlar.length, 20);
});

test("durumOzeti: goc delta 15 + ceza -> yetki 15, merit 0, tek sonCeza, aktif dogru", () => {
  const ts = Date.UTC(2026, 0, 15);
  const olaylar = [
    { tip: "goc", delta: 15, ts },
    { tip: "ceza", grup: "D", derece: 1, delta: 0, kanit: "deneme kaniti", ts: ts + 1000 },
  ];

  const ozet = durumOzeti(olaylar, { simdi: ts + 1000 });

  assert.equal(ozet.yetki, 15);
  assert.equal(ozet.merit, 0);
  assert.equal(ozet.sonCezalar.length, 1);
  assert.deepEqual(ozet.sonCezalar[0], {
    tarih: "2026-01-15",
    grup: "D",
    derece: 1,
    kanit: "deneme kaniti",
  });
  assert.equal(ozet.aktif, false);
});

test("durumOzeti: bos olay listesi -> yetki 0, rank 0, sonCezalar []", () => {
  const ozet = durumOzeti([], { simdi: Date.UTC(2026, 0, 15) });

  assert.equal(ozet.yetki, 0);
  assert.equal(ozet.merit, 0);
  assert.equal(ozet.rank, 0);
  assert.deepEqual(ozet.sonCezalar, []);
});

test("durumOzeti: son 5 ceza olayi, en yeni ustte", () => {
  const ts = Date.UTC(2026, 0, 15);
  const olaylar = Array.from({ length: 7 }, (_, i) => ({
    tip: "ceza",
    grup: "D",
    derece: 1,
    kanit: `kanit-${i + 1}`,
    ts: ts + i * 1000,
  }));

  const ozet = durumOzeti(olaylar, { simdi: ts });

  assert.equal(ozet.sonCezalar.length, 5);
  assert.equal(ozet.sonCezalar[0].kanit, "kanit-7");
  assert.equal(ozet.sonCezalar[4].kanit, "kanit-3");
});

test("eksik tarih -> — ile gosterilir, throw yok", () => {
  const b = skorbordMetni({
    durum: durum(),
    satirlar: { ceza: [{ grup: "D", derece: 1, kanit: "x" }], odul: [{ ne: "öğrenme" }] },
  });
  const r = rozetMetni({ durum: durum({ merit: 5 }), gecmis: [{ olay: "x", rozet: "bronz" }] });

  assert.match(b, /\| — \|/);
  assert.doesNotThrow(() => skorbordMetni({}));
  assert.doesNotThrow(() => rozetMetni({}));
  assert.match(r, /\| — \|/);
});

test("bozuk olaylar (null) -> throw yok, sifir durum", () => {
  for (const olaylar of [null, undefined, "bozuk", 42, { tip: "ceza" }]) {
    let ozet;
    assert.doesNotThrow(() => {
      ozet = durumOzeti(olaylar, { simdi: Date.UTC(2026, 0, 15) });
    });
    assert.equal(ozet.yetki, 0);
    assert.equal(ozet.rank, 0);
    assert.deepEqual(ozet.sonCezalar, []);
  }
});

test("skorbordMetni: ceza ve odul satirlari alanlariyla yazilir", () => {
  const metin = skorbordMetni({
    durum: durum(),
    satirlar: {
      ceza: [{ tarih: TARIH, grup: "E", derece: 3, kural: "K1", ihlal: "ihlal", kanit: "kanit", duzeltme: "yok", puan: -3 }],
      odul: [{ tarih: TARIH, ne: "keşif", kanit: "yeni yol", puan: 2 }],
    },
    tarih: TARIH,
  });

  assert.match(metin, /\| 1 \| 2026-11-20 \| E \| 3 \| K1 \| ihlal \| kanit \| yok \| -3 \|/);
  assert.match(metin, /\| 1 \| 2026-11-20 \| keşif \| yeni yol \| 2 \|/);
});

test("skorbordMetni/rozetMetni: durum eksik -> — ile gosterilir, throw yok", () => {
  const b = skorbordMetni({ durum: null, satirlar: null, tarih: null });
  const r = rozetMetni({ durum: null, gecmis: "bozuk", tarih: null });

  assert.match(b, /Authority —/);
  assert.match(b, /Rank —/);
  assert.match(r, /badge —/);
  assert.match(r, /next —/);
});
