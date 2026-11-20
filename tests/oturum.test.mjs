import assert from "node:assert/strict";
import test, { after } from "node:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const ev = mkdtempSync(join(tmpdir(), "oturum-ev-"));
process.env.HOME = ev;
process.env.USERPROFILE = ev;

after(() => rmSync(ev, { recursive: true, force: true }));

const { DATA_DIR } = await import("../extensions/paths.mjs");
const {
  altAjanMi,
  bildirimOku,
  bildirimTemizle,
  bildirimYaz,
  izinOku,
  izinSil,
  izinYaz,
  izinYolu,
  bildirimYolu,
  oturumId,
} = await import("../extensions/oturum.mjs");

test("oturum: izinler oturum bazlıdır, A izni B'yi etkilemez", () => {
  izinYaz("A", "hep");
  const a = izinOku("A");
  assert.deepEqual(a, { kapsam: "hep", bitis: null });
  assert.equal(izinOku("B"), null);
});

test("oturum: 'sure' kapsamı bitişten sonra null döner", () => {
  izinYaz("S", "sure", { bitis: 1_000 });
  assert.deepEqual(izinOku("S", { now: 999 }), { kapsam: "sure", bitis: 1_000 });
  assert.equal(izinOku("S", { now: 1_000 }), null);
  assert.equal(izinOku("S", { now: 5_000 }), null);
});

test("oturum: 'yok' kapsamı null döner", () => {
  izinYaz("Y", "yok");
  assert.equal(izinOku("Y"), null);
});

test("oturum: bozuk izin JSON'u null döner", () => {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(izinYolu("BOZUK"), "{bu bozuk");
  assert.equal(izinOku("BOZUK"), null);
  izinSil("BOZUK");
});

test("oturum: izinSil olmayan dosyada sessiz kalır", () => {
  assert.doesNotThrow(() => izinSil("HIC_YOK"));
  assert.equal(izinOku("HIC_YOK"), null);
});

test("oturum: oturumId yol enjeksiyonunu temizler, izinYolu DATA_DIR dışına çıkmaz", () => {
  const id = oturumId({ sessionId: "../kötü yol" });
  assert.match(id, /^[A-Za-z0-9_-]+$/);
  assert.ok(!id.includes(".."));
  assert.ok(id.length <= 64);

  for (const yol of [izinYolu(id), bildirimYolu(id)]) {
    assert.ok(yol.startsWith(DATA_DIR), `yol DATA_DIR altında olmalı: ${yol}`);
    const goreli = relative(DATA_DIR, yol);
    assert.ok(!goreli.startsWith(".."), `yol yukarı çıkmamalı: ${goreli}`);
  }
});

test("oturum: oturumId ctx yoksa 'bilinmeyen' döner", () => {
  assert.equal(oturumId({}), "bilinmeyen");
  assert.equal(oturumId(null), "bilinmeyen");
});

test("oturum: oturumId sırayla sessionManager, sessionId, env kullanır", () => {
  assert.equal(
    oturumId({
      sessionManager: { getSessionId: () => "sm-1" },
      sessionId: "ctx-1",
    }),
    "sm-1",
  );
  assert.equal(oturumId({ sessionId: "ctx-1" }), "ctx-1");

  const eski = process.env.PI_SESSION_ID;
  process.env.PI_SESSION_ID = "env-1";
  try {
    assert.equal(oturumId({}), "env-1");
  } finally {
    if (eski === undefined) delete process.env.PI_SESSION_ID;
    else process.env.PI_SESSION_ID = eski;
  }
});

test("oturum: oturumId 64 karaktere kırpar", () => {
  const id = oturumId({ sessionId: "a".repeat(200) });
  assert.equal(id.length, 64);
  assert.match(id, /^[A-Za-z0-9_-]+$/);
});

test("oturum: bildirim turu çalışır ve A bildirimi B'yi ezmez", () => {
  const veri = { sayfa: 3, not: "deneme" };
  bildirimYaz("A", veri);
  assert.deepEqual(bildirimOku("A"), veri);
  assert.equal(bildirimOku("B"), null);

  bildirimYaz("B", { sayfa: 7 });
  assert.deepEqual(bildirimOku("A"), veri);
  assert.deepEqual(bildirimOku("B"), { sayfa: 7 });

  bildirimTemizle("A");
  assert.equal(bildirimOku("A"), null);
  assert.deepEqual(bildirimOku("B"), { sayfa: 7 });
  bildirimTemizle("B");
});

test("oturum: bildirimYaz atomik yazar ve .tmp bırakmaz", () => {
  bildirimYaz("ATOMIK", { x: 1 });
  const ham = readFileSync(bildirimYolu("ATOMIK"), "utf8");
  assert.deepEqual(JSON.parse(ham), { x: 1 });
  assert.deepEqual(
    readdirSync(DATA_DIR).filter((ad) => ad.endsWith(".tmp")),
    [],
  );
  assert.doesNotThrow(() => bildirimTemizle("ATOMIK"));
  assert.equal(bildirimOku("ATOMIK"), null);
});

test("oturum: altAjanMi env bayrağına bakar", () => {
  assert.equal(altAjanMi({ PI_SUBAGENT_CHILD: "1" }), true);
  assert.equal(altAjanMi({}), false);
  assert.equal(altAjanMi({ PI_SUBAGENT_CHILD: "0" }), false);
});
