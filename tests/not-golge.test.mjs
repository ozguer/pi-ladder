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

test("notGirdisi: maps state fields correctly", () => {
  const girdi = notGirdisi({ durum, izin: "hep", son: "+1" });
  assert.equal(girdi.yetki, 7);
  assert.equal(girdi.merit, 12);
  assert.equal(girdi.rank, 2);
  assert.equal(girdi.aktif, false);
  assert.equal(girdi.izin, "hep");
  assert.equal(girdi.son, "+1");
  assert.deepEqual(girdi.gunluk, { isBirimi: 1, tavan: 3, tekrar: 2 });
});

test("notGirdisi: defaults when state is missing (0/0/0/true)", () => {
  const girdi = notGirdisi({});
  assert.equal(girdi.yetki, 0);
  assert.equal(girdi.merit, 0);
  assert.equal(girdi.rank, 0);
  assert.equal(girdi.aktif, true);
  assert.deepEqual(girdi.gunluk, { isBirimi: 0, tavan: 3, tekrar: 0 });
});

test("notGirdisi: the gunluk argument overrides durum.gunluk", () => {
  const ozel = { isBirimi: 2, tavan: 3, tekrar: 5 };
  const girdi = notGirdisi({ durum, gunluk: ozel });
  assert.deepEqual(girdi.gunluk, ozel);
});

test("notGolge: output is identical to notMetni", () => {
  const ng = notGolge({ durum, izin: "hep", son: "+1" });
  const beklenen = notMetni(notGirdisi({ durum, izin: "hep", son: "+1" }));
  assert.equal(ng.metin, beklenen);
  assert.equal(ng.uzunluk, beklenen.length);
});

test("notGolge: in a normal state length <= 1200 and fits true", () => {
  const ng = notGolge({ durum, izin: "yok" });
  assert.ok(ng.uzunluk > 0);
  assert.ok(ng.uzunluk <= 1200);
  assert.equal(ng.uygun, true);
  assert.equal(ng.loglandi, false);
});

test("notGolge: fits is false when long grant text exceeds the limit", () => {
  const ng = notGolge({ durum, izin: "x".repeat(1500) });
  assert.ok(ng.uzunluk > 1200);
  assert.equal(ng.uygun, false);
});

test("notGolge: passing logYolu adds a '| note |' line", () => {
  const logYolu = join(ev, "skor-golge.log");
  const ng = notGolge({ durum, eskiMetin: "abc", logYolu, simdi: 0 });
  assert.equal(ng.loglandi, true);
  assert.ok(existsSync(logYolu));
  const satirlar = readFileSync(logYolu, "utf8").trimEnd().split("\n");
  assert.equal(satirlar.length, 1);
  assert.match(satirlar[0], /\| note \|/);
  assert.match(
    satirlar[0],
    new RegExp(`^1970-01-01T00:00:00\\.000Z \\| note \\| length=${ng.uzunluk} fits=true previous=3 delta=${ng.uzunluk - 3}$`),
  );
});

test("notGolge: unwritable logYolu gives logged false, no throw", () => {
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

test("notGolge: broken state (undefined/null) does not throw, still produces text", () => {
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

test("smoke: user-character.ts syntax is valid and importable", async () => {
  const mod = await import("../extensions/user-character.ts");
  assert.equal(typeof mod.default, "function");
});
