import assert from "node:assert/strict";
import test, { after } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ev = mkdtempSync(join(tmpdir(), "not-golge-ev-"));
const oncekiHome = process.env.HOME;
const oncekiProfil = process.env.USERPROFILE;
process.env.HOME = ev;
process.env.USERPROFILE = ev;

after(() => {
  if (oncekiHome === undefined) delete process.env.HOME;
  else process.env.HOME = oncekiHome;
  if (oncekiProfil === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = oncekiProfil;
  rmSync(ev, { recursive: true, force: true });
});

const { notGirdisi, notGolge } = await import("../extensions/not-golge.mjs");
const { notMetni } = await import("../extensions/skor-politika.mjs");

const durum = {
  yetki: 7,
  merit: 12,
  rank: 2,
  aktif: false,
  gunluk: { isBirimi: 1, tavan: 3, tekrar: 2 },
};

test("notGirdisi: durum alanlarını doğru eşler", () => {
  const girdi = notGirdisi({ durum, izin: "hep", son: "+1" });
  assert.equal(girdi.yetki, 7);
  assert.equal(girdi.merit, 12);
  assert.equal(girdi.rank, 2);
  assert.equal(girdi.aktif, false);
  assert.equal(girdi.izin, "hep");
  assert.equal(girdi.son, "+1");
  assert.deepEqual(girdi.gunluk, { isBirimi: 1, tavan: 3, tekrar: 2 });
});

test("notGirdisi: durum yoksa varsayılanlar (0/0/0/true)", () => {
  const girdi = notGirdisi({});
  assert.equal(girdi.yetki, 0);
  assert.equal(girdi.merit, 0);
  assert.equal(girdi.rank, 0);
  assert.equal(girdi.aktif, true);
  assert.deepEqual(girdi.gunluk, { isBirimi: 0, tavan: 3, tekrar: 0 });
});

test("notGirdisi: gunluk argümanı durum.gunluk'u geçersiz kılar", () => {
  const ozel = { isBirimi: 2, tavan: 3, tekrar: 5 };
  const girdi = notGirdisi({ durum, gunluk: ozel });
  assert.deepEqual(girdi.gunluk, ozel);
});

test("notGolge: çıktı notMetni ile birebir aynı", () => {
  const ng = notGolge({ durum, izin: "hep", son: "+1" });
  const beklenen = notMetni(notGirdisi({ durum, izin: "hep", son: "+1" }));
  assert.equal(ng.metin, beklenen);
  assert.equal(ng.uzunluk, beklenen.length);
});

test("notGolge: normal durumda uzunluk <= 1200 ve uygun true", () => {
  const ng = notGolge({ durum, izin: "yok" });
  assert.ok(ng.uzunluk > 0);
  assert.ok(ng.uzunluk <= 1200);
  assert.equal(ng.uygun, true);
  assert.equal(ng.loglandi, false);
});

test("notGolge: uzun izin metni sınırı aşınca uygun false", () => {
  const ng = notGolge({ durum, izin: "x".repeat(1500) });
  assert.ok(ng.uzunluk > 1200);
  assert.equal(ng.uygun, false);
});

test("notGolge: logYolu verilince '| not |' satırı eklenir", () => {
  const logYolu = join(ev, "skor-golge.log");
  const ng = notGolge({ durum, eskiMetin: "abc", logYolu, simdi: 0 });
  assert.equal(ng.loglandi, true);
  assert.ok(existsSync(logYolu));
  const satirlar = readFileSync(logYolu, "utf8").trimEnd().split("\n");
  assert.equal(satirlar.length, 1);
  assert.match(satirlar[0], /\| not \|/);
  assert.match(
    satirlar[0],
    new RegExp(`^1970-01-01T00:00:00\\.000Z \\| not \\| uzunluk=${ng.uzunluk} uygun=true eski=3 fark=${ng.uzunluk - 3}$`),
  );
});

test("notGolge: logYolu yazılamazsa loglandi false, throw yok", () => {
  const blok = join(ev, "blok-dosya");
  writeFileSync(blok, "x");
  const logYolu = join(blok, "skor-golge.log");
  let ng;
  assert.doesNotThrow(() => {
    ng = notGolge({ durum, eskiMetin: "", logYolu });
  });
  assert.equal(ng.loglandi, false);
  assert.ok(ng.metin.length > 0);
  assert.equal(ng.uygun, true);
});

test("notGolge: bozuk durum (undefined/null) throw etmez, metin üretir", () => {
  for (const bozuk of [undefined, null]) {
    let ng;
    assert.doesNotThrow(() => {
      ng = notGolge({ durum: bozuk });
    });
    assert.ok(ng.metin.length > 0);
    assert.ok(ng.uzunluk > 0);
    assert.equal(ng.uygun, true);
  }
});

test("duman: user-character.ts sözdizimi geçerli ve import edilebilir", async () => {
  const mod = await import("../extensions/user-character.ts");
  assert.equal(typeof mod.default, "function");
});
