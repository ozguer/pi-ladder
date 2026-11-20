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
  assert.ok(sonuc?.messages, "hook returned no message");
  const bulunan = sonuc.messages.find((m) => metinler(m).some((t) => t.includes(MARKER)));
  assert.ok(bulunan, "no injected message carries MARKER");
  return metinler(bulunan).join("\n");
};

const temizle = () => {
  rmSync(olayYolu, { force: true });
  rmSync(`${olayYolu}.kilit`, { recursive: true, force: true });
  rmSync(izinYolu(OTURUM), { force: true });
  rmSync(join(DATA_DIR, "rozet-durum.json"), { force: true });
};

beforeEach(temizle);

test("empty log: text starts with MARKER and contains Authority 0 (bronze)", async () => {
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.ok(text.startsWith(`${MARKER}\n`), "text does not start with MARKER");
  assert.match(text, /Authority 0 \(bronze\)/);
});

test("injected text is shorter than 1200 characters", async () => {
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.ok(text.length < 1200, `uzunluk ${text.length}`);
});

test("goc event (delta 15, merit 0) yields Authority 15 (gold)", async () => {
  writeFileSync(
    olayYolu,
    `${JSON.stringify({ tip: "goc", delta: 15, merit: 0, ts: Date.now() })}\n`,
    "utf8",
  );
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.match(text, /Authority 15 \(gold\)/);
});

test("an expired session grant shows Grant: none", async () => {
  izinYaz(OTURUM, "sure", { bitis: Date.now() - 60_000 });
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.match(text, /Grant: none/);
});

test("a valid session grant shows its scope on the Grant line", async () => {
  izinYaz(OTURUM, "oturum");
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.match(text, /Grant: This session/);
});

test("injected text contains no scoreboard table", async () => {
  const text = enjekteMetni(await calistir([mesaj("selam")]));
  assert.doesNotMatch(text, /\| # \| Date \|/);
  assert.doesNotMatch(text, /## Score/);
});

test("if a message carries MARKER, it is not added again", async () => {
  const messages = [mesaj(`${MARKER}\neski not`)];
  const sonuc = await calistir(messages);
  assert.equal(sonuc, undefined);
  assert.equal(messages.length, 1);
  assert.equal(messages.filter((m) => metinler(m).some((t) => t.includes(MARKER))).length, 1);
});
