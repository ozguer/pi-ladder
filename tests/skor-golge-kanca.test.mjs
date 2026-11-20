import assert from "node:assert/strict";
import test, { after } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KOK = mkdtempSync(join(tmpdir(), "skor-golge-kanca-"));
const oncekiHome = process.env.HOME;
const oncekiProfil = process.env.USERPROFILE;
process.env.HOME = KOK;
process.env.USERPROFILE = KOK;
delete process.env.PI_SUBAGENT_CHILD;

const DATA = join(KOK, ".pi", "agent", "user-character");
const OLAY_YOLU = join(DATA, "skor-olaylar.jsonl");
const LOG_YOLU = join(DATA, "skor-golge.log");

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

let modulSozu = null;
const yukle = () => {
  modulSozu ??= import("../extensions/skor-golge-kanca.mjs");
  return modulSozu;
};

const temizle = () => {
  rmSync(OLAY_YOLU, { force: true });
  rmSync(LOG_YOLU, { force: true });
  rmSync(`${OLAY_YOLU}.kilit`, { recursive: true, force: true });
};

const olaylar = () => {
  if (!existsSync(OLAY_YOLU)) return [];
  return readFileSync(OLAY_YOLU, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((satir) => JSON.parse(satir));
};

const ctxWithFiles = (dosyalar = ["b.ts", "a.ts"]) => ({
  sessionId: "oturum-a",
  sessionManager: {
    getEntries: () => [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", name: "edit", arguments: { path: dosyalar[0] } },
            { type: "toolCall", name: "read", arguments: { path: dosyalar[1] } },
          ],
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "edit", arguments: { path: dosyalar[0] } }],
        },
      },
    ],
  },
});

const taban = (ek = {}) => ({
  ctx: ctxWithFiles(),
  text: "K: ilk istek\nP: bakıyorum\nK: son istek",
  verdict: { ceza: [], odul: [] },
  risk: 0,
  work: true,
  oncekiPuan: 0,
  simdi: 2_000_000,
  mesajlar: null,
  ...ek,
});

after(() => {
  if (oncekiHome === undefined) delete process.env.HOME;
  else process.env.HOME = oncekiHome;
  if (oncekiProfil === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = oncekiProfil;
  rmSync(KOK, { recursive: true, force: true });
});

test("work:false risk:0 → iş olayı yazılmaz (yazilan:0)", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const sonuc = golgeIsle(taban({ work: false, verdict: { ceza: [], odul: [] } }));
  assert.equal(sonuc.hata, undefined);
  assert.equal(sonuc.yazilan, 0);
  assert.equal(sonuc.tekrar, 0);
  assert.equal(olaylar().filter((olay) => olay.tip === "istek").length, 0);
  assert.ok(sonuc.karsilastirma && typeof sonuc.karsilastirma === "object");
});

test("work:true risk:0 → iş olayı yazılır, karşılaştırma dolu", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const sonuc = golgeIsle(taban());
  assert.equal(sonuc.hata, undefined);
  assert.equal(sonuc.yazilan, 1);
  assert.equal(sonuc.tekrar, 0);
  assert.ok(sonuc.karsilastirma);
  assert.equal(sonuc.karsilastirma.eski, 0);
  assert.equal(sonuc.karsilastirma.yeni, 1);
  assert.equal(sonuc.karsilastirma.fark, 1);

  const istekler = olaylar().filter((olay) => olay.tip === "istek");
  assert.equal(istekler.length, 1);
  assert.match(istekler[0].anahtar, /^is:/);
  assert.equal(istekler[0].delta, 1);
});

test("aynı girdi iki kez → ikinci çağrıda tekrar:1 (30 gün penceresi)", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const birinci = golgeIsle(taban());
  const ikinci = golgeIsle(taban());
  assert.equal(birinci.yazilan, 1);
  assert.equal(birinci.tekrar, 0);
  assert.equal(ikinci.yazilan, 0);
  assert.equal(ikinci.tekrar, 1);
  assert.equal(olaylar().filter((olay) => olay.tip === "istek").length, 1);
});

test("risk:3 → iş olayı ve ceza olayı yazılmaz (cezalar bu turda gölgeye taşınmıyor)", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const sonuc = golgeIsle(
    taban({
      risk: 3,
      verdict: {
        ceza: [{ grup: "E", derece: 3, kural: "x", ihlal: "y", kanit: "z", puan: 3 }],
        odul: [],
      },
    }),
  );
  assert.equal(sonuc.hata, undefined);
  assert.equal(sonuc.yazilan, 0);
  assert.equal(sonuc.tekrar, 0);
  assert.equal(olaylar().filter((olay) => olay.tip === "istek").length, 0);
  assert.equal(olaylar().filter((olay) => olay.tip === "ceza").length, 0);
});

test("alt ajan (PI_SUBAGENT_CHILD=1) → hiçbir şey yazılmaz", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  process.env.PI_SUBAGENT_CHILD = "1";
  try {
    const sonuc = golgeIsle(taban({ verdict: { ceza: [], odul: [{ ne: "keşif: playwright" }] } }));
    assert.deepEqual(sonuc, { yazilan: 0, tekrar: 0, karsilastirma: null });
    assert.equal(existsSync(OLAY_YOLU), false);
    assert.equal(existsSync(LOG_YOLU), false);
  } finally {
    delete process.env.PI_SUBAGENT_CHILD;
  }
});

test("getEntries throw ederse hata doludur, throw etmez", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const bozukCtx = {
    sessionManager: {
      getEntries: () => {
        throw new Error("entries patladı");
      },
    },
  };

  let sonuc;
  assert.doesNotThrow(() => {
    sonuc = golgeIsle(taban({ ctx: bozukCtx }));
  });
  assert.match(sonuc.hata, /entries patladı/);
});

test("verdict.odul ne:'keşif: playwright' → kaynak:'kesif' merit olayı yazılır", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const sonuc = golgeIsle(
    taban({
      work: false,
      verdict: { ceza: [], odul: [{ grup: "F", derece: 1, ne: "keşif: playwright", puan: 2 }] },
    }),
  );
  assert.equal(sonuc.hata, undefined);
  assert.equal(sonuc.yazilan, 1);

  const meritler = olaylar().filter((olay) => olay.tip === "merit");
  assert.equal(meritler.length, 1);
  assert.equal(meritler[0].kaynak, "kesif");
  assert.match(meritler[0].anahtar, /^ders:kesif:/);
});

test("golgeLogla satırı skor-golge.log dosyasına eklenir", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  golgeIsle(taban({ work: false }));
  const birinci = readFileSync(LOG_YOLU, "utf8").trim().split("\n").length;
  golgeIsle(taban({ work: false, simdi: 2_000_001 }));
  const ikinci = readFileSync(LOG_YOLU, "utf8").trim().split("\n").length;
  assert.equal(birinci, 1);
  assert.equal(ikinci, 2);
  assert.match(readFileSync(LOG_YOLU, "utf8"), /\| golge \|/);
});

test("duman: user-character-skorcu.ts dinamik import edilebilir, sözdizimi hatası yok", () => {
  const skorcuYolu = join(TEST_DIR, "..", "extensions", "user-character-skorcu.ts");
  const kod =
    `const m = await import(${JSON.stringify(pathToFileURL(skorcuYolu).href)}); ` +
    `if (typeof m.default !== "function") throw new Error("default export yok");`;
  const sonuc = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", kod],
    { encoding: "utf8" },
  );
  assert.equal(sonuc.status, 0, sonuc.stderr || sonuc.stdout);
});

const toparlanmisHata = () => [
  {
    role: "assistant",
    content: [
      { type: "toolCall", name: "edit", toolCallId: "1", arguments: { path: "src/a.ts" } },
    ],
  },
  { type: "toolResult", toolCallId: "1", content: "Error: patladı" },
  {
    role: "assistant",
    content: [
      { type: "toolCall", name: "edit", toolCallId: "2", arguments: { path: "src/a.ts" } },
    ],
  },
];

const cozulmeyenHata = () => [
  {
    role: "assistant",
    content: [
      { type: "toolCall", name: "edit", toolCallId: "e1", arguments: { path: "a.ts" } },
    ],
  },
  { type: "toolResult", toolCallId: "e1", content: "Error: bozuk" },
];

const temizYazma = () => [
  { role: "user", content: "K: yaz" },
  {
    role: "assistant",
    content: [{ type: "toolCall", name: "write", arguments: { path: "b.ts" } }],
  },
];

test("yargicKarsilastir: toparlanmış hata → D cezası, eskiRisk 2 ile uyumsuz", async () => {
  const { yargicKarsilastir } = await yukle();
  const sonuc = yargicKarsilastir({
    mesajlar: toparlanmisHata(),
    eskiRisk: 2,
    eskiWork: false,
  });
  assert.equal(sonuc.yeni.risk, 1);
  assert.equal(sonuc.yeni.dE[0].grup, "D");
  assert.equal(sonuc.uyumlu, false);
  assert.equal(sonuc.farkRisk, -1);
  assert.equal(sonuc.farkWork, true);
});

test("yargicKarsilastir: boş mesajlar → risk 0, work false, throw yok", async () => {
  const { yargicKarsilastir } = await yukle();
  let sonuc;
  assert.doesNotThrow(() => {
    sonuc = yargicKarsilastir({ mesajlar: [], eskiRisk: 0, eskiWork: false });
  });
  assert.equal(sonuc.yeni.risk, 0);
  assert.equal(sonuc.yeni.work, false);
  assert.equal(sonuc.uyumlu, true);
  assert.deepEqual(sonuc.yeni.dE, []);

  const bos = yargicKarsilastir({ eskiRisk: 3, eskiWork: true });
  assert.equal(bos.yeni.risk, 0);
  assert.equal(bos.yeni.work, false);
  assert.equal(bos.uyumlu, false);
  assert.equal(bos.farkRisk, -3);
  assert.equal(bos.farkWork, false);
});

test("yargicKarsilastir: eski ve yeni aynı → uyumlu true", async () => {
  const { yargicKarsilastir } = await yukle();
  const sonuc = yargicKarsilastir({
    mesajlar: temizYazma(),
    eskiRisk: 0,
    eskiWork: true,
  });
  assert.equal(sonuc.yeni.risk, 0);
  assert.equal(sonuc.yeni.work, true);
  assert.equal(sonuc.uyumlu, true);
  assert.equal(sonuc.farkRisk, 0);
  assert.equal(sonuc.farkWork, false);
});

test("golgeIsle + mesajlar: E varken iş olayı yazılmaz (yeni yargıç)", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const sonuc = golgeIsle(taban({ mesajlar: cozulmeyenHata(), risk: 0, work: true }));
  assert.equal(sonuc.hata, undefined);
  assert.equal(sonuc.yazilan, 0);
  assert.equal(sonuc.yargic.yeni.risk, 1);
  assert.equal(sonuc.yargic.yeni.work, false);
  assert.equal(sonuc.yargic.uyumlu, false);
  assert.equal(olaylar().filter((olay) => olay.tip === "istek").length, 0);
});

test("golgeIsle + mesajlar: yargic dolu, log'da '| yargic |' satırı var", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const sonuc = golgeIsle(taban({ mesajlar: temizYazma(), risk: 0, work: true }));
  assert.equal(sonuc.hata, undefined);
  assert.ok(sonuc.yargic);
  assert.equal(sonuc.yargic.yeni.risk, 0);
  assert.equal(sonuc.yargic.yeni.work, true);
  assert.equal(sonuc.yargic.uyumlu, true);
  assert.equal(sonuc.yazilan, 1);

  const log = readFileSync(LOG_YOLU, "utf8");
  assert.match(log, /\| yargic \|/);
  assert.match(log, /eski\(D0\/true\) → yeni\(D0\/true\)/);
  assert.match(log, /uyumlu=true/);
});

test("golgeIsle mesajlar olmadan: eski davranış aynı, yargic null", async () => {
  temizle();
  const { golgeIsle } = await yukle();

  const eskiGirdi = golgeIsle(taban());
  assert.equal(eskiGirdi.hata, undefined);
  assert.equal(eskiGirdi.yargic, null);
  assert.equal(eskiGirdi.yazilan, 1);

  temizle();
  const bosCtx = golgeIsle({
    ctx: {},
    text: "K: x",
    verdict: { ceza: [], odul: [] },
    risk: 0,
    work: true,
    oncekiPuan: 0,
    simdi: 2_000_000,
  });
  assert.equal(bosCtx.hata, undefined);
  assert.equal(bosCtx.yargic, null);
  assert.equal(bosCtx.yazilan, 1);
  assert.equal(readFileSync(LOG_YOLU, "utf8").includes("| yargic |"), false);
});

test("ctx.sessionManager.getEntries throw → hata yok, yargic null, eski parametreler", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const bozukCtx = {
    sessionManager: {
      getEntries: () => {
        throw new Error("entries patladı");
      },
    },
  };

  let sonuc;
  assert.doesNotThrow(() => {
    sonuc = golgeIsle({
      ctx: bozukCtx,
      text: "K: x",
      verdict: { ceza: [], odul: [] },
      risk: 0,
      work: false,
      oncekiPuan: 0,
      simdi: 2_000_000,
    });
  });
  assert.equal(sonuc.hata, undefined);
  assert.equal(sonuc.yargic, null);
  assert.equal(sonuc.yazilan, 0);
});

test("alt ajan (PI_SUBAGENT_CHILD=1) mesajlar verilse de yazmaz", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  process.env.PI_SUBAGENT_CHILD = "1";
  try {
    const sonuc = golgeIsle(taban({ mesajlar: temizYazma() }));
    assert.deepEqual(sonuc, { yazilan: 0, tekrar: 0, karsilastirma: null });
    assert.equal(existsSync(OLAY_YOLU), false);
    assert.equal(existsSync(LOG_YOLU), false);
  } finally {
    delete process.env.PI_SUBAGENT_CHILD;
  }
});

test("mesajlar yoksa ctx.getEntries'ten türetilir, olaylar yeni yargıçla yazılır", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const ctx = {
    sessionId: "oturum-b",
    sessionManager: {
      getEntries: () => [
        { type: "message", message: { role: "user", content: "K: yaz" } },
        {
          type: "message",
          message: {
            role: "assistant",
            content: [{ type: "toolCall", name: "write", arguments: { path: "c.ts" } }],
          },
        },
      ],
    },
  };

  const sonuc = golgeIsle({
    ctx,
    text: "K: yaz",
    verdict: { ceza: [], odul: [] },
    risk: 0,
    work: false,
    oncekiPuan: 0,
    simdi: 2_000_000,
  });
  assert.equal(sonuc.hata, undefined);
  assert.ok(sonuc.yargic);
  assert.equal(sonuc.yargic.yeni.work, true);
  assert.equal(sonuc.yazilan, 1);
  assert.equal(olaylar().filter((olay) => olay.tip === "istek").length, 1);
});
