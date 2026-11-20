import assert from "node:assert/strict";
import test from "node:test";

import { kararOlaylari, itirazUygula, itirazCikar } from "../extensions/skor-karar.mjs";

const SIMDI = 1700000000000;

const cagri = (ad, yol, id) => ({
  type: "toolCall",
  name: ad,
  args: yol ? { path: yol } : {},
  toolCallId: id,
});

const sonuc = (ad, icerik, { hatali = false, id } = {}) => ({
  type: "toolResult",
  toolName: ad,
  toolCallId: id,
  isError: hatali,
  content: icerik,
});

const hata = (metin = "Error: ayni hata") => ({
  type: "toolResult",
  toolName: "bash",
  isError: true,
  content: metin,
});

const istek = (metin) => ({ role: "user", content: metin });

const duzeltilmisTur = () => [
  istek("a.js dosyasini duzelt"),
  cagri("edit", "a.js", "e1"),
  sonuc("edit", "Error: bozuk", { hatali: true, id: "e1" }),
  cagri("write", "a.js", "w1"),
  sonuc("write", "ok", { id: "w1" }),
];

test("hata yok + bir yazma + test gecti: yalniz 1 is olayi, risk 0", () => {
  const mesajlar = [istek("a.txt dosyasini yaz"), cagri("write", "a.txt", "w1"), sonuc("write", "yazildi", { id: "w1" })];
  const { yargi, olaylar } = kararOlaylari({
    mesajlar,
    testGecti: true,
    istekMetni: "a.txt dosyasini yaz",
    dosyalar: ["a.txt"],
    diffHash: "d1",
    simdi: SIMDI,
  });

  assert.equal(yargi.risk, 0);
  assert.equal(yargi.work, true);
  assert.equal(olaylar.length, 1);
  assert.equal(olaylar[0].tip, "istek");
  assert.equal(olaylar[0].delta, 1);
  assert.equal(olaylar[0].ts, SIMDI);
  assert.match(olaylar[0].anahtar, /^is:/);
});

test("toparlanmis hata: 1 D cezasi (-2), is olayi YOK (tur Durur — K38)", () => {
  const { yargi, olaylar } = kararOlaylari({
    mesajlar: duzeltilmisTur(),
    istekMetni: "a.js dosyasini duzelt",
    diffHash: "d2",
    simdi: SIMDI,
  });

  const cezalar = olaylar.filter((olay) => olay.tip === "ceza");
  assert.equal(cezalar.length, 1);
  assert.equal(cezalar[0].grup, "D");
  assert.equal(cezalar[0].delta, -2);
  assert.ok(cezalar[0].kanit && cezalar[0].kanit.length > 0);
  assert.equal(yargi.risk, 1);
  // K38: "İlerler" için D/E olmamalı; toparlanmış olsa da bu tur "Durur".
  assert.equal(olaylar.filter((olay) => olay.tip === "istek").length, 0);
});

test("toparlanmamis hata: 1 E cezasi (-3), is olayi yok", () => {
  const { yargi, olaylar } = kararOlaylari({
    mesajlar: [
      istek("a.js dosyasini yaz"),
      cagri("write", "a.js", "w1"),
      sonuc("write", "ok", { id: "w1" }),
      hata("Error: cozulmedi"),
    ],
    istekMetni: "a.js dosyasini yaz",
    diffHash: "d3",
    simdi: SIMDI,
  });

  assert.equal(yargi.work, true);
  assert.equal(olaylar.length, 1);
  assert.equal(olaylar[0].tip, "ceza");
  assert.equal(olaylar[0].grup, "E");
  assert.equal(olaylar[0].delta, -3);
  assert.equal(olaylar.some((olay) => olay.tip === "istek"), false);
});

test("E derece 5: delta -5", () => {
  const mesajlar = Array.from({ length: 5 }, () => hata("Error: ayni hata"));
  const { yargi, olaylar } = kararOlaylari({ mesajlar, simdi: SIMDI });

  assert.equal(yargi.dE[0].grup, "E");
  assert.equal(yargi.dE[0].derece, 5);
  assert.equal(olaylar.length, 1);
  assert.equal(olaylar[0].tip, "ceza");
  assert.equal(olaylar[0].delta, -5);
});

test("ayni girdi iki kez: ayni is birimi anahtari", () => {
  const girdi = {
    mesajlar: [istek("a.txt dosyasini yaz"), cagri("write", "a.txt", "w1"), sonuc("write", "ok", { id: "w1" })],
    istekMetni: "a.txt dosyasini yaz",
    dosyalar: ["a.txt"],
    diffHash: "d5",
    simdi: SIMDI,
  };
  const birinci = kararOlaylari(girdi);
  const ikinci = kararOlaylari(girdi);
  const anahtar = (sonuc) => sonuc.olaylar.find((olay) => olay.tip === "istek").anahtar;

  assert.equal(anahtar(birinci), anahtar(ikinci));
  assert.match(anahtar(birinci), /^is:[0-9a-f]{64}$/);
});

test("itirazUygula: transkriptte gecen kanit kabul edilir, risk +1", () => {
  const mesajlar = duzeltilmisTur();
  const { yargi } = kararOlaylari({ mesajlar, istekMetni: "a.js dosyasini duzelt", simdi: SIMDI });
  const out = itirazUygula({
    yargi,
    itirazlar: [{ grup: "E", derece: 1, kanit: "Error: bozuk" }],
    mesajlar,
  });

  assert.equal(out.kabul.length, 1);
  assert.equal(out.red.length, 0);
  assert.equal(out.yargi.risk, yargi.risk + 1);
  assert.equal(out.yargi.dE.filter((kayit) => kayit.grup === "E").length, 1);
});

test("itirazUygula: transkriptte gecmeyen kanit reddedilir, yargi degismez", () => {
  const mesajlar = duzeltilmisTur();
  const { yargi } = kararOlaylari({ mesajlar, istekMetni: "a.js dosyasini duzelt", simdi: SIMDI });
  const out = itirazUygula({
    yargi,
    itirazlar: [{ grup: "E", derece: 3, kanit: "transkriptte olmayan bir kanit satiri" }],
    mesajlar,
  });

  assert.equal(out.kabul.length, 0);
  assert.equal(out.red.length, 1);
  assert.equal(out.red[0].sebep, "evidence not in transcript");
  assert.deepEqual(out.yargi, yargi);
});

test("itirazUygula: 10 karakterden kisa kanit reddedilir", () => {
  const mesajlar = [istek("kisa kanit denemesi burada")];
  const yargi = { risk: 0, work: false, dE: [], odul: [], gerekce: "kanıt yok" };
  const out = itirazUygula({
    yargi,
    itirazlar: [{ grup: "D", derece: 1, kanit: "kisa" }],
    mesajlar,
  });

  assert.equal(out.kabul.length, 0);
  assert.equal(out.red.length, 1);
  assert.equal(out.yargi.dE.length, 0);
});

test("itirazUygula: ayni itiraz iki kez dE'de tek kayit", () => {
  const mesajlar = [istek("kanit satiri burada geciyor")];
  const yargi = { risk: 0, work: false, dE: [], odul: [], gerekce: "kanıt yok" };
  const itiraz = { grup: "E", derece: 2, kanit: "kanit satiri burada" };
  const out = itirazUygula({ yargi, itirazlar: [itiraz, itiraz], mesajlar });

  assert.equal(out.yargi.dE.length, 1);
  assert.equal(out.yargi.risk, 1);
});

test("itirazUygula: E eklenince is: uretildi ve seffaflik odulleri suzulur", () => {
  const mesajlar = [
    istek("a.txt dosyasini yaz"),
    cagri("write", "a.txt", "w1"),
    sonuc("write", "ok", { id: "w1" }),
  ];
  const { yargi } = kararOlaylari({
    mesajlar,
    istekMetni: "a.txt dosyasini yaz",
    diffHash: "d10",
    simdi: SIMDI,
  });
  assert.equal(yargi.odul.some((kayit) => kayit.ne === "is: produced"), true);
  assert.equal(yargi.odul.some((kayit) => kayit.ne.startsWith("seffaflik:")), true);

  const out = itirazUygula({
    yargi,
    itirazlar: [{ grup: "E", derece: 1, kanit: "a.txt dosyasini yaz" }],
    mesajlar,
  });

  assert.equal(out.kabul.length, 1);
  assert.equal(out.yargi.risk, 1);
  assert.equal(out.yargi.odul.some((kayit) => kayit.ne.startsWith("is:")), false);
  assert.equal(out.yargi.odul.some((kayit) => kayit.ne.startsWith("seffaflik:")), false);
});

test("itirazCikar: ceza satirlari itiraza cevrilir, kanitsiz satir atlanir, bozuk JSON bos", () => {
  const cevap = JSON.stringify({
    ceza: [
      { grup: "D", derece: 2, kanit: "a.js: 1 hata sonrasi duzeltme" },
      { grup: "E", derece: 1 },
      { grup: "Z", derece: 4, kanit: "bilinmeyen grup" },
    ],
    odul: [],
  });
  const liste = itirazCikar({ cevapMetni: cevap });

  assert.equal(liste.length, 1);
  assert.deepEqual(liste[0], { grup: "D", derece: 2, kanit: "a.js: 1 hata sonrasi duzeltme" });
  assert.equal(itirazCikar({ cevapMetni: JSON.stringify({ ceza: [{ grup: "D", derece: 1 }] }) }).length, 0);
  assert.deepEqual(itirazCikar({ cevapMetni: "{ bozuk json" }), []);
  assert.deepEqual(itirazCikar({ cevapMetni: "" }), []);
});

test("itirazCikar: kod bloklu JSON ve derece kirpma", () => {
  const cevap = ["```json", JSON.stringify({ ceza: [{ grup: "e", derece: 9, kanit: "kanit metni" }] }), "```"].join("\n");
  const liste = itirazCikar({ cevapMetni: cevap });

  assert.deepEqual(liste, [{ grup: "E", derece: 1, kanit: "kanit metni" }]);
});

test("kararOlaylari: bozuk girdi throw etmez, olay uretmez", () => {
  const { yargi, olaylar } = kararOlaylari({ mesajlar: [null, 42, { type: "bilinmeyen" }], simdi: SIMDI });

  assert.equal(yargi.risk, 0);
  assert.equal(yargi.work, false);
  assert.deepEqual(olaylar, []);
  assert.doesNotThrow(() => kararOlaylari());
});

test("duvarCezasi: aynı gün 3 engellenen deneme → bir E", async () => {
  const { duvarCezasi } = await import("../extensions/skor-karar.mjs");
  const gun = "2026-11-20";
  const log = [
    `${gun}T10:00:00Z | gate | bash | blocked | duvar: protected-write`,
    `${gun}T10:01:00Z | gate | write | blocked | duvar: protected-write`,
    `${gun}T10:02:00Z | gate | edit | blocked | duvar: protected-write`,
  ].join("\n");
  const ceza = duvarCezasi({ logMetni: log, tarih: gun, ts: 1 });
  assert.ok(ceza, "3 denemede ceza yok");
  assert.equal(ceza.grup, "E");
  assert.equal(ceza.delta, -3);
  assert.equal(ceza.anahtar, `duvar:${gun}`);
});

test("duvarCezasi: 2 deneme ceza değil, başka gün sayılmaz", async () => {
  const { duvarCezasi } = await import("../extensions/skor-karar.mjs");
  const gun = "2026-11-20";
  const log = [
    `${gun}T10:00:00Z | gate | bash | blocked | duvar: x`,
    `${gun}T10:01:00Z | gate | bash | blocked | duvar: x`,
    `2026-11-19T10:02:00Z | gate | bash | blocked | duvar: x`,
  ].join("\n");
  assert.equal(duvarCezasi({ logMetni: log, tarih: gun, ts: 1 }), null);
});
