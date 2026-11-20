import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GOLGE_PENCERE_MS,
  isBirimi,
  golgeKaydet,
  golgeKarsilastir,
  golgeLogla,
} from "../extensions/skor-golge.mjs";
import { olaylariOku } from "../extensions/skor-store.mjs";

const geciciDizin = (t) => {
  const dizin = mkdtempSync(join(tmpdir(), "skor-golge-"));
  const oncekiHome = process.env.HOME;
  const oncekiProfil = process.env.USERPROFILE;
  process.env.HOME = dizin;
  process.env.USERPROFILE = dizin;
  t.after(() => {
    if (oncekiHome === undefined) delete process.env.HOME;
    else process.env.HOME = oncekiHome;
    if (oncekiProfil === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oncekiProfil;
    rmSync(dizin, { recursive: true, force: true });
  });
  return dizin;
};

const istek = {
  istekMetni: "bir şeyler düzelt",
  dosyalar: ["a.ts", "b.ts"],
  diffHash: "abc123",
};

test("isBirimi: different sessions produce the same key; the session field differs", () => {
  const bir = isBirimi({ ...istek, ctx: { sessionId: "oturum-a" } });
  const iki = isBirimi({ ...istek, ctx: { sessionId: "oturum-b" } });
  assert.equal(bir.key, iki.key);
  assert.notEqual(bir.oturum, iki.oturum);
  assert.ok(bir.key.startsWith("is:"));
  assert.ok(!bir.key.includes("oturum-a"));
});

test("isBirimi: file order does not change the key; a different file set does", () => {
  const ctx = { sessionId: "oturum-a" };
  const duz = isBirimi({ ...istek, ctx });
  const ters = isBirimi({ ...istek, dosyalar: ["b.ts", "a.ts"], ctx });
  const farkli = isBirimi({ ...istek, dosyalar: ["a.ts", "c.ts"], ctx });
  assert.equal(duz.key, ters.key);
  assert.notEqual(duz.key, farkli.key);
});

test("golgeKaydet: the same key is not written twice within the window", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "golge.jsonl");
  const taban = { yol, tip: "istek", key: "is:tekrar", delta: 1, ctx: { sessionId: "s" } };
  assert.deepEqual(golgeKaydet({ ...taban, simdi: 1_000_000 }), {
    yazildi: true,
    tekrar: false,
  });
  assert.deepEqual(golgeKaydet({ ...taban, simdi: 1_001_000 }), {
    yazildi: false,
    tekrar: true,
    mevcut: 1_000_000,
  });
  assert.equal(olaylariOku(yol).olaylar.length, 1);
});

test("golgeKaydet: the same key is written twice when anahtarPenceresi is 0 (K48)", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "golge.jsonl");
  const taban = {
    yol,
    tip: "istek",
    key: "is:tekrar",
    delta: 1,
    anahtarPenceresi: 0,
    ctx: { sessionId: "s" },
    simdi: 1_000_000,
  };
  assert.equal(golgeKaydet(taban).yazildi, true);
  assert.equal(golgeKaydet(taban).yazildi, true);
  assert.equal(olaylariOku(yol).olaylar.length, 2);
});

test("golgeKaydet: the event is written with ts and session fields", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "golge.jsonl");
  golgeKaydet({
    yol,
    tip: "merit",
    key: "m:kesif",
    delta: 2,
    kaynak: "kesif",
    ctx: { sessionId: "oturum-x" },
    simdi: 1_234_567,
  });
  const { olaylar, bozuk } = olaylariOku(yol);
  assert.equal(bozuk, 0);
  assert.equal(olaylar.length, 1);
  assert.equal(olaylar[0].tip, "merit");
  assert.equal(olaylar[0].anahtar, "m:kesif");
  assert.equal(olaylar[0].delta, 2);
  assert.equal(olaylar[0].kaynak, "kesif");
  assert.equal(olaylar[0].ts, 1_234_567);
  assert.equal(olaylar[0].oturum, "oturum-x");
});

test("golgeKaydet: no delta is written for a legacy event", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "golge.jsonl");
  golgeKaydet({
    yol,
    tip: "legacy",
    key: "eski",
    delta: 99,
    ctx: { sessionId: "s" },
    simdi: 5,
  });
  const [olay] = olaylariOku(yol).olaylar;
  assert.equal(olay.tip, "legacy");
  assert.equal(Object.prototype.hasOwnProperty.call(olay, "delta"), false);
});

test("golgeKaydet: GOLGE_PENCERE_MS is used when anahtarPenceresi is omitted", (t) => {
  const dizin = geciciDizin(t);
  const yol = join(dizin, "golge.jsonl");
  const taban = { yol, tip: "istek", key: "is:pencere", delta: 1, ctx: { sessionId: "s" } };
  golgeKaydet({ ...taban, simdi: 1_000_000 });
  assert.equal(GOLGE_PENCERE_MS, 30 * 24 * 60 * 60 * 1000);
  const tekrar = golgeKaydet({ ...taban, simdi: 1_000_000 + GOLGE_PENCERE_MS - 1 });
  assert.equal(tekrar.yazildi, false);
  const sonra = golgeKaydet({ ...taban, simdi: 1_000_000 + GOLGE_PENCERE_MS });
  assert.equal(sonra.yazildi, true);
});

test("golgeKarsilastir: equal scores return identical", () => {
  assert.deepEqual(golgeKarsilastir({ eskiPuan: 24, durum: { yetki: 24 } }), {
    ayni: true,
    eski: 24,
    yeni: 24,
    fark: 0,
    yuzde: 0,
  });
});

test("golgeKarsilastir: 24 -> 50, difference 26, percent 108.3", () => {
  assert.deepEqual(golgeKarsilastir({ eskiPuan: 24, durum: { yetki: 50 } }), {
    ayni: false,
    eski: 24,
    yeni: 50,
    fark: 26,
    yuzde: 108.3,
  });
});

test("golgeKarsilastir: percent is null when eskiPuan is 0", () => {
  const sonuc = golgeKarsilastir({ eskiPuan: 0, durum: { yetki: 5 } });
  assert.equal(sonuc.yuzde, null);
  assert.equal(sonuc.fark, 5);
});

test("golgeKarsilastir: missing/broken input counts as 0, does not throw", () => {
  assert.deepEqual(golgeKarsilastir(undefined), {
    ayni: true,
    eski: 0,
    yeni: 0,
    fark: 0,
    yuzde: null,
  });
  assert.deepEqual(golgeKarsilastir({ eskiPuan: "bozuk", durum: undefined }), {
    ayni: true,
    eski: 0,
    yeni: 0,
    fark: 0,
    yuzde: null,
  });
  assert.equal(golgeKarsilastir({ eskiPuan: undefined, durum: { yetki: "50" } }).yeni, 50);
});

test("golgeLogla: produces a 5-part line and appends it to the file", (t) => {
  const dizin = geciciDizin(t);
  const logYolu = join(dizin, "alt", "golge.log");
  const satir = golgeLogla({
    logYolu,
    kayit: { tip: "istek", key: "is:0123456789abcdef", eski: 24, yeni: 50, fark: 26, yuzde: 108.3 },
  });
  const parcalar = satir.split(" | ");
  assert.equal(parcalar.length, 5);
  assert.match(parcalar[0], /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(parcalar[1], "istek");
  assert.equal(parcalar[2], "is:012345678…");
  assert.equal(parcalar[3], "24 → 50");
  assert.match(parcalar[4], /^26 \+108\.3%$/);
  assert.equal(existsSync(logYolu), true);
  assert.equal(readFileSync(logYolu, "utf8"), `${satir}\n`);
});

test("golgeLogla: only the difference is written when percent is null", (t) => {
  const dizin = geciciDizin(t);
  const logYolu = join(dizin, "golge.log");
  const satir = golgeLogla({
    logYolu,
    kayit: { tip: "ceza", key: "kisa", eski: 0, yeni: 0, fark: 0, yuzde: null },
  });
  assert.equal(satir.split(" | ")[4], "0");
});

test("golgeLogla: write errors are swallowed and the line is still returned", (t) => {
  const dizin = geciciDizin(t);
  const engel = join(dizin, "engel");
  writeFileSync(engel, "dosya");
  const satir = golgeLogla({
    logYolu: join(engel, "golge.log"),
    kayit: { tip: "x", key: "y", eski: 1, yeni: 2, fark: 1, yuzde: 100 },
  });
  assert.equal(typeof satir, "string");
  assert.ok(satir.includes("1 → 2"));
});
