// Task 10a-2: tool_call kapısı skor olaylarından gelen rütbeyi doğrudan kullanır.
// Gölge kapı çağrılmaz; karar tek kaynaktan (durumHesapla + kapiKarari) üretilir.
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ev = mkdtempSync(join(tmpdir(), "kapi-gercek-ev-"));
const oncekiHome = process.env.HOME;
const oncekiProfil = process.env.USERPROFILE;
const oncekiAltAjan = process.env.PI_SUBAGENT_CHILD;
process.env.HOME = ev;
process.env.USERPROFILE = ev;
delete process.env.PI_SUBAGENT_CHILD;

after(() => {
  if (oncekiHome === undefined) delete process.env.HOME;
  else process.env.HOME = oncekiHome;
  if (oncekiProfil === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = oncekiProfil;
  if (oncekiAltAjan === undefined) delete process.env.PI_SUBAGENT_CHILD;
  else process.env.PI_SUBAGENT_CHILD = oncekiAltAjan;
  rmSync(ev, { recursive: true, force: true });
});

const { DATA_DIR } = await import("../extensions/paths.mjs");
const { default: userCharacter } = await import("../extensions/user-character-rozet.ts");

const olayYolu = join(DATA_DIR, "skor-olaylar.jsonl");
mkdirSync(DATA_DIR, { recursive: true });

function olaylariYaz(olaylar) {
  const govde = olaylar.map((olay) => JSON.stringify(olay)).join("\n");
  writeFileSync(olayYolu, olaylar.length ? `${govde}\n` : "", "utf8");
}

function kancaKur() {
  const handlerlar = {};
  const olaylar = [];
  const pi = {
    on: (ad, fn) => {
      (handlerlar[ad] ??= []).push(fn);
    },
    events: {
      emit: (...args) => olaylar.push(args),
      on: () => {},
    },
  };
  userCharacter(pi);
  return { handler: handlerlar.tool_call[0], olaylar };
}

function ctxOlustur({ hasUI = true, onay = true } = {}) {
  const sorulanlar = [];
  return {
    cwd: ev,
    sessionManager: { getSessionId: () => "kapi-gercek-oturum" },
    hasUI,
    ui: {
      confirm: async (baslik, mesaj) => {
        sorulanlar.push({ baslik, mesaj });
        return typeof onay === "function" ? onay(baslik, mesaj) : onay;
      },
    },
    sorulanlar,
  };
}

beforeEach(() => {
  rmSync(olayYolu, { force: true });
});

test("bronz (günlük boş, rank 0): proje içi edit onay ister", async () => {
  olaylariYaz([]);
  const { handler } = kancaKur();
  const ctx = ctxOlustur({ onay: true });

  const sonuc = await handler({ toolName: "edit", input: { path: join(ev, "a.js") } }, ctx);

  assert.equal(sonuc, undefined);
  assert.equal(ctx.sorulanlar.length, 1, "UI onayı istenmeli");
});

test("altın (goc delta 15): duvar dışı bash serbest", async () => {
  olaylariYaz([{ tip: "goc", delta: 15, merit: 0, ts: Date.now() }]);
  const { handler } = kancaKur();
  const ctx = ctxOlustur({ onay: true });

  const sonuc = await handler({ toolName: "bash", input: { command: "npm test" } }, ctx);

  assert.equal(sonuc, undefined);
  assert.equal(ctx.sorulanlar.length, 0, "altın rütbede duvar dışı komut sorulmaz");
});

test("duvar: korumalı hedefe cp engellenir ve reason duvar adını taşır", async () => {
  olaylariYaz([{ tip: "goc", delta: 75, merit: 0, ts: Date.now() }]);
  const { handler } = kancaKur();
  const ctx = ctxOlustur({ onay: true });

  const sonuc = await handler(
    { toolName: "bash", input: { command: "cp a.js C:/Windows/x.js" } },
    ctx,
  );

  assert.equal(sonuc?.block, true);
  assert.match(sonuc.reason, /korumali-yazma/);
  assert.equal(ctx.sorulanlar.length, 0, "duvar onayla açılmaz");
});

test("find . -delete rank 5: engellenir", async () => {
  olaylariYaz([{ tip: "goc", delta: 75, merit: 0, ts: Date.now() }]);
  const { handler } = kancaKur();
  const ctx = ctxOlustur({ onay: true });

  const sonuc = await handler({ toolName: "bash", input: { command: "find . -delete" } }, ctx);

  assert.equal(sonuc?.block, true);
  assert.match(sonuc.reason, /find-yikici/);
});

test("tur sınırı: rank 1 turda 2 dosya akar, üçüncüsü onaya takılır", async () => {
  olaylariYaz([{ tip: "goc", delta: 5, merit: 0, ts: Date.now() }]);
  const { handler } = kancaKur();
  const ctx = ctxOlustur({ onay: true });

  // TUR_DOSYA[1] === 2: ilk iki yazma sınırsız, üçüncü onaya düşer.
  const ilk = await handler({ toolName: "edit", input: { path: join(ev, "a.js") } }, ctx);
  assert.equal(ilk, undefined);
  assert.equal(ctx.sorulanlar.length, 0, "ilk dosya sınırsız akar");

  const ikinci = await handler({ toolName: "edit", input: { path: join(ev, "b.js") } }, ctx);
  assert.equal(ikinci, undefined);
  assert.equal(ctx.sorulanlar.length, 0, "ikinci dosya hâlâ sınır içinde");

  const ucuncu = await handler({ toolName: "edit", input: { path: join(ev, "c.js") } }, ctx);
  assert.equal(ctx.sorulanlar.length, 1);
  assert.match(ctx.sorulanlar[0].mesaj, /tur başına dosya sınırı/);
});

test("aktif değil (son olayda ceza): rank -1 gibi davranır, bash onay ister", async () => {
  const simdi = Date.now();
  olaylariYaz([
    { tip: "goc", delta: 75, merit: 0, ts: simdi - 2000 },
    { tip: "ceza", grup: "D", ts: simdi - 1000 },
  ]);
  const { handler } = kancaKur();
  const ctx = ctxOlustur({ onay: true });

  const sonuc = await handler({ toolName: "bash", input: { command: "python x.py" } }, ctx);

  assert.equal(sonuc, undefined);
  assert.equal(ctx.sorulanlar.length, 1, "pasif rütbede komut onay ister");
});

test("UI reddi: onay yoksa engellenir", async () => {
  olaylariYaz([]);
  const { handler } = kancaKur();
  const ctx = ctxOlustur({ onay: false });

  const sonuc = await handler({ toolName: "edit", input: { path: join(ev, "a.js") } }, ctx);

  assert.equal(sonuc?.block, true);
  assert.match(sonuc.reason, /Kullanıcı onayı yok/);
});

test("serbest iş: handler undefined döner ve event.messages değişmez", async () => {
  olaylariYaz([{ tip: "goc", delta: 15, merit: 0, ts: Date.now() }]);
  const { handler } = kancaKur();
  const ctx = ctxOlustur({ onay: true });
  const mesajlar = [{ role: "user", content: "selam" }];
  const event = { toolName: "bash", input: { command: "ls" }, messages: mesajlar };

  const sonuc = await handler(event, ctx);

  assert.equal(sonuc, undefined);
  assert.equal(event.messages, mesajlar);
  assert.equal(event.messages.length, 1);
  assert.equal(ctx.sorulanlar.length, 0);
});
