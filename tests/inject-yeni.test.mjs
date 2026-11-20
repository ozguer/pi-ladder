import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ev = mkdtempSync(join(tmpdir(), "inject-yeni-ev-"));
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

const { DATA_DIR } = await import("../extensions/paths.mjs");
const { izinYaz, izinYolu } = await import("../extensions/oturum.mjs");
const { MARKER } = await import("../extensions/user-character-inject.mjs");
const { default: userCharacter } = await import("../extensions/user-character.ts");

const OTURUM = "inject-yeni-oturum";
const olayYolu = join(DATA_DIR, "skor-olaylar.jsonl");

const handlerlar = {};
userCharacter({
  on: (ad, fn) => {
    (handlerlar[ad] ??= []).push(fn);
  },
  events: { emit() {} },
});

const ctx = {
  sessionId: OTURUM,
  sessionManager: { getSessionId: () => OTURUM },
};

const mesaj = (text) => ({
  role: "user",
  content: [{ type: "text", text }],
  timestamp: Date.now(),
});

const metinler = (mesaj) => {
  const content = mesaj?.content;
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text);
};

const calistir = (messages) => handlerlar.context[0]({ messages }, ctx);

const enjekteMetni = (sonuc) => {
  assert.ok(sonuc?.messages, "kanca mesaj döndürmedi");
  const bulunan = sonuc.messages.find((m) => metinler(m).some((t) => t.includes(MARKER)));
  assert.ok(bulunan, "MARKER taşıyan enjekte mesaj yok");
  return metinler(bulunan).join("\n");
};

const temizle = () => {
  rmSync(olayYolu, { force: true });
  rmSync(`${olayYolu}.kilit`, { recursive: true, force: true });
  rmSync(izinYolu(OTURUM), { force: true });
  rmSync(join(DATA_DIR, "rozet-durum.json"), { force: true });
};

beforeEach(temizle);

test("boş günlük: metin MARKER ile başlar ve Yetki 0 (bronz) içerir", async () => {
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.ok(text.startsWith(`${MARKER}\n`), "metin MARKER ile başlamıyor");
  assert.match(text, /Yetki 0 \(bronz\)/);
});

test("enjekte metin 1200 karakterden kısa", async () => {
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.ok(text.length < 1200, `uzunluk ${text.length}`);
});

test("goc olayı (delta 15, merit 0) Yetki 15 (altın) üretir", async () => {
  writeFileSync(
    olayYolu,
    `${JSON.stringify({ tip: "goc", delta: 15, merit: 0, ts: Date.now() })}\n`,
    "utf8",
  );
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.match(text, /Yetki 15 \(altın\)/);
});

test("süresi dolmuş oturum izni İzin: yok gösterir", async () => {
  izinYaz(OTURUM, "sure", { bitis: Date.now() - 60_000 });
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.match(text, /İzin: yok/);
});

test("geçerli oturum izni İzin satırında kapsamı gösterir", async () => {
  izinYaz(OTURUM, "oturum");
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.match(text, /İzin: Oturum/);
});

test("enjekte metin skorbord tablosu içermez", async () => {
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.doesNotMatch(text, /\| # \| Tarih \|/);
  assert.doesNotMatch(text, /## Skor/);
});

test("MARKER taşıyan mesaj varsa ikinci kez eklenmez", async () => {
  const messages = [mesaj(`${MARKER}\neski not`)];
  const sonuc = await calistir(messages);
  assert.equal(sonuc, undefined);
  assert.equal(messages.length, 1);
  assert.equal(messages.filter((m) => metinler(m).some((t) => t.includes(MARKER))).length, 1);
});
