// Task 1 regresyon koruması: B1 (resolve importu), B2 (rankIndex fail-open), B15 (hasUI).
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const kok = resolve(process.cwd());

// Modüller HOME'ı çağrı anında okur: geçici dizin ilk.
process.env.USERPROFILE = mkdtempSync(join(tmpdir(), "kanca-"));
process.env.HOME = process.env.USERPROFILE;

test("B1: user-character-rozet.ts node:path importunda resolve var", () => {
  const kaynak = readFileSync(join(kok, "extensions", "user-character-rozet.ts"), "utf8");
  const satir = kaynak.split("\n").find((l) => l.includes('from "node:path"'));
  assert.ok(satir, "node:path importu bulunamadı");
  assert.match(satir, /\bresolve\b/, "resolve importu eksik: SKILL.md kapısı ReferenceError verir");
});

test("B2: rankIndex(null) fail-open değil, -1 döner", async () => {
  const { rankIndex } = await import("./../extensions/user-character-rozet-core.mjs");
  assert.equal(rankIndex(null), -1);
  assert.equal(rankIndex(undefined), -1);
  assert.equal(rankIndex(NaN), -1);
  assert.equal(rankIndex("abc"), -1);
});

test("B2: rankIndex geçerli puanda eskisi gibi çalışır", async () => {
  const { rankIndex, RANKS } = await import("./../extensions/user-character-rozet-core.mjs");
  assert.equal(rankIndex(0), 0);
  const bes = RANKS.findIndex((r, i) => i > 0 && r.puan <= 5);
  assert.equal(rankIndex(5), bes >= 0 ? bes : 0);
  assert.equal(rankIndex(-5), -1, "negatif puan rütbe vermez");
});

test("B15: skill-guard UI yokken engeller (çökmez)", async () => {
  const { SKILL_MD } = await import("./../extensions/paths.mjs");
  const mod = await import("./../extensions/user-character-skill-guard.ts");
  const handlerlar = {};
  const pi = {
    on: (ad, fn) => {
      (handlerlar[ad] ??= []).push(fn);
    },
    events: { emit() {} },
  };
  mod.default(pi);
  const sonuc = await handlerlar.tool_call[0](
    { toolName: "write", input: { path: SKILL_MD } },
    { cwd: kok, hasUI: false },
  );
  assert.equal(sonuc?.block, true);
  assert.match(sonuc.reason, /onayı yok/i);
});

test("B15: skill-guard UI varsa ve onay verilirse engellemez", async () => {
  const { SKILL_MD } = await import("./../extensions/paths.mjs");
  const mod = await import("./../extensions/user-character-skill-guard.ts");
  const handlerlar = {};
  mod.default({
    on: (ad, fn) => {
      (handlerlar[ad] ??= []).push(fn);
    },
    events: { emit() {} },
  });
  const sonuc = await handlerlar.tool_call[0](
    { toolName: "write", input: { path: SKILL_MD } },
    { cwd: kok, hasUI: true, ui: { confirm: async () => true } },
  );
  assert.equal(sonuc, undefined);
});

test("B15: skill-guard UI varsa ve onay reddedilirse engeller", async () => {
  const { SKILL_MD } = await import("./../extensions/paths.mjs");
  const mod = await import("./../extensions/user-character-skill-guard.ts");
  const handlerlar = {};
  mod.default({
    on: (ad, fn) => {
      (handlerlar[ad] ??= []).push(fn);
    },
    events: { emit() {} },
  });
  const sonuc = await handlerlar.tool_call[0](
    { toolName: "write", input: { path: SKILL_MD } },
    { cwd: kok, hasUI: true, ui: { confirm: async () => false } },
  );
  assert.equal(sonuc?.block, true);
});

test("kapsamSecenekleri: pasif rütbede yalnız 'Bir kez' (oturum izni verilemez)", async () => {
  const { kapsamSecenekleri } = await import("./../extensions/user-character-rozet-core.mjs");
  assert.deepEqual(kapsamSecenekleri(-1), ["Bir kez"]);
  assert.ok(kapsamSecenekleri(0).includes("Bu oturum"), "bronz ve üstünde kapsam seçenekleri korunur");
});
