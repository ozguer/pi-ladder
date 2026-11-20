import assert from "node:assert/strict";
import test from "node:test";

import { transcriptCikar, yargiCikar, ozetKes } from "../extensions/skor-yargic.mjs";

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

const hataMesaji = (metin = "Error: ayni hata") => ({
  type: "toolResult",
  toolName: "bash",
  isError: true,
  content: metin,
});

test("boş transcript: risk 0, work false, kanıt yok", () => {
  const yargi = yargiCikar(transcriptCikar([]));
  assert.deepEqual(yargi, {
    risk: 0,
    work: false,
    dE: [],
    odul: [],
    gerekce: "kanıt yok",
  });
  assert.deepEqual(yargiCikar(transcriptCikar(null)), yargi);
});

test("tek başarılı write: work true ve is: uretildi ödülü", () => {
  const cikarim = transcriptCikar([
    { role: "user", content: "a.txt yaz" },
    cagri("write", "a.txt", "c1"),
    sonuc("write", "yazildi", { id: "c1" }),
  ]);
  assert.equal(cikarim.yazma, 1);
  const yargi = yargiCikar(cikarim);
  assert.equal(yargi.work, true);
  assert.equal(yargi.risk, 0);
  const odul = yargi.odul.find((kayit) => kayit.ne === "is: uretildi");
  assert.deepEqual(odul, { ne: "is: uretildi", kanit: "1 yazma" });
});

test("isError true sonuç: 1 E kaydı ve dolu kanıt", () => {
  const cikarim = transcriptCikar([hataMesaji("Error: patladi")]);
  assert.equal(cikarim.hatalar.length, 1);
  const yargi = yargiCikar(cikarim);
  assert.equal(yargi.risk, 1);
  assert.equal(yargi.dE.length, 1);
  assert.equal(yargi.dE[0].grup, "E");
  assert.equal(yargi.dE[0].derece, 1);
  assert.ok(yargi.dE[0].kanit.includes("Error: patladi"));
});

test("aynı hata iki kez: tek E kaydı derece 2", () => {
  const yargi = yargiCikar(transcriptCikar([hataMesaji(), hataMesaji()]));
  assert.equal(yargi.dE.length, 1);
  assert.equal(yargi.dE[0].grup, "E");
  assert.equal(yargi.dE[0].derece, 2);
  assert.equal(yargi.risk, 1);
});

test("aynı hata beş kez: derece 5 tavanı", () => {
  const mesajlar = Array.from({ length: 5 }, () => hataMesaji());
  const yargi = yargiCikar(transcriptCikar(mesajlar));
  assert.equal(yargi.dE.length, 1);
  assert.equal(yargi.dE[0].derece, 5);
});

test("K49: hata sonrası aynı dosyaya düzeltme yalnız D üretir, risk 1", () => {
  const cikarim = transcriptCikar([
    cagri("edit", "a.js", "e1"),
    sonuc("edit", "Error: bozuk", { hatali: true, id: "e1" }),
    cagri("write", "a.js", "w1"),
    sonuc("write", "ok", { id: "w1" }),
  ]);
  assert.equal(cikarim.duzeltmeler.length, 1);
  assert.equal(cikarim.duzeltmeler[0].dosya, "a.js");
  assert.equal(cikarim.duzeltmeler[0].kanit, "write a.js, hata sonrası düzeltme");
  const yargi = yargiCikar(cikarim);
  assert.equal(yargi.dE.length, 1);
  assert.equal(yargi.dE[0].grup, "D");
  assert.equal(yargi.dE[0].derece, 1);
  assert.equal(yargi.dE[0].kanit, "a.js: 1 hata sonrası düzeltme");
  assert.equal(yargi.risk, 1);
});

test("K49: aynı dosyada 2 hata + 1 düzeltme: D.derece 2, E yok", () => {
  const yargi = yargiCikar(
    transcriptCikar([
      cagri("edit", "a.js", "e1"),
      sonuc("edit", "Error: bozuk", { hatali: true, id: "e1" }),
      cagri("edit", "a.js", "e2"),
      sonuc("edit", "Error: hâlâ bozuk", { hatali: true, id: "e2" }),
      cagri("write", "a.js", "w1"),
      sonuc("write", "ok", { id: "w1" }),
    ]),
  );
  const d = yargi.dE.filter((kayit) => kayit.grup === "D");
  const e = yargi.dE.filter((kayit) => kayit.grup === "E");
  assert.equal(d.length, 1);
  assert.equal(d[0].derece, 2);
  assert.equal(e.length, 0);
  assert.equal(yargi.risk, 1);
});

test("K49: hata var, düzeltme yok: yalnız E, is: uretildi yok", () => {
  const yargi = yargiCikar(
    transcriptCikar([
      cagri("write", "a.js", "w1"),
      sonuc("write", "ok", { id: "w1" }),
      cagri("edit", "a.js", "e1"),
      sonuc("edit", "Error: bozuk", { hatali: true, id: "e1" }),
    ]),
  );
  assert.equal(yargi.dE.length, 1);
  assert.equal(yargi.dE[0].grup, "E");
  assert.equal(yargi.odul.some((kayit) => kayit.ne === "is: uretildi"), false);
});

test("K49: hata a.js, düzeltme b.js: E kalır, D yok, is: uretildi yok", () => {
  const cikarim = transcriptCikar([
    cagri("edit", "a.js", "e1"),
    sonuc("edit", "Error: bozuk", { hatali: true, id: "e1" }),
    cagri("write", "b.js", "w1"),
    sonuc("write", "ok", { id: "w1" }),
  ]);
  assert.deepEqual(cikarim.duzeltmeler, []);
  const yargi = yargiCikar(cikarim);
  assert.equal(yargi.dE.filter((kayit) => kayit.grup === "D").length, 0);
  assert.equal(yargi.dE.filter((kayit) => kayit.grup === "E").length, 1);
  assert.equal(yargi.risk, 1);
  assert.equal(yargi.odul.some((kayit) => kayit.ne === "is: uretildi"), false);
});

test("K49: bash hatası (yol yok) hiçbir zaman birleştirilmez, E kalır", () => {
  const yargi = yargiCikar(
    transcriptCikar([
      hataMesaji("Error: bash patladi"),
      cagri("write", "a.js", "w1"),
      sonuc("write", "ok", { id: "w1" }),
      hataMesaji("Error: bash patladi"),
    ]),
  );
  assert.equal(yargi.dE.filter((kayit) => kayit.grup === "D").length, 0);
  assert.equal(yargi.dE.length, 1);
  assert.equal(yargi.dE[0].grup, "E");
  assert.equal(yargi.dE[0].derece, 2);
  assert.equal(yargi.odul.some((kayit) => kayit.ne === "is: uretildi"), false);
});

test("K49: D varken is: uretildi verilir", () => {
  const yargi = yargiCikar(
    transcriptCikar([
      cagri("edit", "a.js", "e1"),
      sonuc("edit", "Error: bozuk", { hatali: true, id: "e1" }),
      cagri("write", "a.js", "w1"),
      sonuc("write", "ok", { id: "w1" }),
    ]),
  );
  assert.equal(yargi.dE.every((kayit) => kayit.grup === "D"), true);
  assert.deepEqual(
    yargi.odul.find((kayit) => kayit.ne === "is: uretildi"),
    { ne: "is: uretildi", kanit: "1 yazma" },
  );
});

test("K49: E varken is: uretildi verilmez", () => {
  const yargi = yargiCikar(
    transcriptCikar([
      cagri("write", "a.js", "w1"),
      sonuc("write", "ok", { id: "w1" }),
      hataMesaji("Error: cozulmedi"),
    ]),
  );
  assert.equal(yargi.dE.some((kayit) => kayit.grup === "E"), true);
  assert.equal(yargi.odul.some((kayit) => kayit.ne === "is: uretildi"), false);
});

test("K49: testGecti true + E: dogrulama ödülü yine verilir", () => {
  const yargi = yargiCikar(transcriptCikar([hataMesaji("Error: cozulmedi")]), {
    testGecti: true,
  });
  assert.equal(yargi.dE.some((kayit) => kayit.grup === "E"), true);
  assert.deepEqual(
    yargi.odul.find((kayit) => kayit.ne === "dogrulama: test gecti"),
    { ne: "dogrulama: test gecti", kanit: "testGecti" },
  );
});

test("K49: gerekce birleştirilmiş sayıları yansıtır", () => {
  const yargi = yargiCikar(
    transcriptCikar([
      cagri("write", "a.js", "w1"),
      sonuc("write", "ok", { id: "w1" }),
      cagri("edit", "a.js", "e1"),
      sonuc("edit", "Error: bozuk", { hatali: true, id: "e1" }),
      cagri("write", "a.js", "w2"),
      sonuc("write", "ok", { id: "w2" }),
    ]),
    { testGecti: true },
  );
  assert.equal(yargi.gerekce, "2 yazma, 1 D, 0 E, test geçti");
});

test("dosyalar sıralı ve tekil; tanınmayan blok throw etmez", () => {
  const cikarim = transcriptCikar([
    cagri("write", "b.js", "1"),
    sonuc("write", "ok", { id: "1" }),
    cagri("edit", "a.js", "2"),
    sonuc("edit", "ok", { id: "2" }),
    cagri("write", "b.js", "3"),
    sonuc("write", "ok", { id: "3" }),
    { type: "bilinmeyen", x: 1 },
    { role: "assistant", content: [{ type: "garip" }, null, 7] },
    null,
    42,
  ]);
  assert.deepEqual(cikarim.dosyalar, ["b.js", "a.js"]);
  assert.equal(cikarim.yazma, 3);

  assert.doesNotThrow(() =>
    yargiCikar(
      transcriptCikar([
        { role: "user", content: [{ type: "text", text: "merhaba" }] },
        { role: "assistant", content: [{ type: "tool_call", name: "read", args: { file: "x" } }] },
        { type: "tool_result", toolName: "read", content: "ic" },
      ]),
    ),
  );
});

test("testGecti true: work true ve dogrulama ödülü", () => {
  const yargi = yargiCikar(transcriptCikar([]), { testGecti: true });
  assert.equal(yargi.work, true);
  assert.deepEqual(
    yargi.odul.find((kayit) => kayit.ne === "dogrulama: test gecti"),
    { ne: "dogrulama: test gecti", kanit: "testGecti" },
  );
  assert.match(yargi.gerekce, /test geçti/);
});

test("risk varken is: uretildi ödülü verilmez", () => {
  const cikarim = transcriptCikar([
    { role: "user", content: "duzelt" },
    cagri("write", "a.js", "w1"),
    sonuc("write", "ok", { id: "w1" }),
    hataMesaji(),
  ]);
  assert.equal(cikarim.yazma, 1);
  const yargi = yargiCikar(cikarim);
  assert.ok(yargi.risk > 0);
  assert.equal(yargi.work, true);
  assert.equal(yargi.odul.some((kayit) => kayit.ne === "is: uretildi"), false);
});

test("kanıtsız hata ve düzeltme cezaya dönüşmez", () => {
  const yargi = yargiCikar({
    yazma: 0,
    istekler: [],
    hatalar: [{ kaynak: "bash" }, { kaynak: "bash", kanit: "   " }],
    duzeltmeler: [{ dosya: "a.js" }, { dosya: "a.js", kanit: null }],
  });
  assert.equal(yargi.risk, 0);
  assert.deepEqual(yargi.dE, []);
  assert.equal(yargi.work, false);
  assert.equal(yargi.gerekce, "kanıt yok");
});

test("bozuk cikarim throw etmez", () => {
  for (const girdi of [null, undefined, 42, "metin", [], { yazma: "bozuk" }]) {
    assert.doesNotThrow(() => yargiCikar(girdi));
    const yargi = yargiCikar(girdi, null);
    assert.equal(yargi.risk, 0);
    assert.equal(yargi.work, false);
  }
});

test("isError olmadan hata metni regex ile yakalanır", () => {
  const cikarim = transcriptCikar([
    { type: "toolResult", toolName: "bash", content: "calisti\nError: kod 2" },
    { type: "tool_result", toolName: "bash", content: "exit code 3" },
  ]);
  assert.equal(cikarim.hatalar.length, 2);
  assert.equal(yargiCikar(cikarim).risk, 2);
});

test("patch ve apply_patch başarılı yazma sayılır", () => {
  const cikarim = transcriptCikar([
    cagri("patch", "a.js", "p1"),
    sonuc("patch", "ok", { id: "p1" }),
    cagri("apply_patch", "b.js", "p2"),
    sonuc("apply_patch", "ok", { id: "p2" }),
    cagri("read", "c.js", "r1"),
    sonuc("read", "ok", { id: "r1" }),
  ]);
  assert.equal(cikarim.yazma, 2);
  assert.deepEqual(cikarim.dosyalar, ["a.js", "b.js", "c.js"]);
});

test("ozetKes: uzun transcript kırpılır, araç satırı korunur", () => {
  const mesajlar = [];
  for (let i = 0; i < 10; i += 1) {
    mesajlar.push({ role: "user", content: `istek-${i} ` + "A".repeat(800) });
  }
  mesajlar.push(cagri("write", "a.txt", "w1"));
  mesajlar.push(sonuc("write", "B".repeat(3000), { id: "w1" }));

  const cikti = ozetKes(mesajlar);
  assert.ok(cikti.length <= 1200 + 200, `uzunluk ${cikti.length}`);
  assert.ok(cikti.includes("[tool: write a.txt]"));
  assert.ok(cikti.includes("[kesildi]"));
  assert.ok(cikti.startsWith("[kesildi]"));
});

test("ozetKes: araç sonucu 200 karaktere kırpılır", () => {
  const cikti = ozetKes([
    cagri("bash", "/tmp/uzun", "b1"),
    sonuc("bash", "x".repeat(5000), { id: "b1" }),
  ]);
  assert.ok(cikti.includes("[tool: bash /tmp/uzun]"));
  assert.ok(cikti.includes("x".repeat(200)));
  assert.equal(cikti.includes("x".repeat(201)), false);
});

test("ozetKes: kullanıcı mesajı 300 karaktere kırpılır", () => {
  const cikti = ozetKes([{ role: "user", content: "u".repeat(1000) }]);
  assert.equal(cikti, `K: ${"u".repeat(300)}`);
});

test("ozetKes: boş veya bozuk girdi boş metin döner", () => {
  assert.equal(ozetKes([]), "");
  assert.equal(ozetKes(null), "");
  assert.equal(ozetKes([null, 42, { type: "bilinmeyen" }]), "");
});

test("transcriptCikar: kullanıcı istekleri ve araç kayıtları", () => {
  const cikarim = transcriptCikar([
    { role: "user", content: [{ type: "text", text: "birinci" }] },
    { role: "assistant", content: [{ type: "text", text: "yanıt" }] },
    { role: "user", content: "ikinci" },
  ]);
  assert.deepEqual(cikarim.istekler, ["birinci", "ikinci"]);
  assert.deepEqual(cikarim.araclar, []);
  assert.equal(cikarim.yazma, 0);
});

test("gerçek hata biçimleri E üretir: SyntaxError / TypeError / ENOENT / komut yok", () => {
  const biçimler = [
    "console.log(topla(2, 3);\n  ^\nSyntaxError: missing ) after argument list",
    "TypeError: top la is not a function",
    "Error: ENOENT: no such file or directory, open 'x.js'",
    "bash: python3: command not found",
    "Hata: dosya bulunamadı",
  ];
  for (const metin of biçimler) {
    const c = transcriptCikar([
      { type: "toolCall", name: "bash", args: { command: "node x.js" } },
      { type: "toolResult", toolName: "bash", isError: false, content: metin },
    ]);
    assert.equal(c.hatalar.length, 1, `hata yakalanmadı: ${metin.slice(0, 30)}`);
  }
});

test("başarılı çıktı yanlışlıkla E üretmez", () => {
  const c = transcriptCikar([
    { type: "toolCall", name: "bash", args: { command: "node x.js" } },
    { type: "toolResult", toolName: "bash", isError: false, content: "5\nDone in 1s\nexample output" },
  ]);
  assert.equal(c.hatalar.length, 0);
});
