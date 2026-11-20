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

test("session: permissions are per session; A's grant does not affect B", () => {
  izinYaz("A", "hep");
  const a = izinOku("A");
  assert.deepEqual(a, { kapsam: "hep", bitis: null });
  assert.equal(izinOku("B"), null);
});

test("session: 'sure' scope returns null after expiry", () => {
  izinYaz("S", "sure", { bitis: 1_000 });
  assert.deepEqual(izinOku("S", { now: 999 }), { kapsam: "sure", bitis: 1_000 });
  assert.equal(izinOku("S", { now: 1_000 }), null);
  assert.equal(izinOku("S", { now: 5_000 }), null);
});

test("session: 'yok' scope returns null", () => {
  izinYaz("Y", "yok");
  assert.equal(izinOku("Y"), null);
});

test("session: corrupt permission JSON returns null", () => {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(izinYolu("BOZUK"), "{bu bozuk");
  assert.equal(izinOku("BOZUK"), null);
  izinSil("BOZUK");
});

test("session: izinSil stays quiet on a missing file", () => {
  assert.doesNotThrow(() => izinSil("HIC_YOK"));
  assert.equal(izinOku("HIC_YOK"), null);
});

test("session: oturumId sanitizes path injection; izinYolu stays inside DATA_DIR", () => {
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

test("session: oturumId returns 'unknown' without ctx", () => {
  assert.equal(oturumId({}), "unknown");
  assert.equal(oturumId(null), "unknown");
});

test("session: oturumId uses sessionManager, sessionId, env in order", () => {
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

test("session: oturumId truncates to 64 characters", () => {
  const id = oturumId({ sessionId: "a".repeat(200) });
  assert.equal(id.length, 64);
  assert.match(id, /^[A-Za-z0-9_-]+$/);
});

test("session: notification round works; A's notification does not overwrite B's", () => {
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

test("session: bildirimYaz writes atomically and leaves no .tmp", () => {
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

test("session: altAjanMi checks the env flag", () => {
  assert.equal(altAjanMi({ PI_SUBAGENT_CHILD: "1" }), true);
  assert.equal(altAjanMi({}), false);
  assert.equal(altAjanMi({ PI_SUBAGENT_CHILD: "0" }), false);
});
