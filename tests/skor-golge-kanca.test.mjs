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

test("work:false risk:0 -> no work event written (written:0)", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  const sonuc = golgeIsle(taban({ work: false, verdict: { ceza: [], odul: [] } }));
  assert.equal(sonuc.hata, undefined);
  assert.equal(sonuc.yazilan, 0);
  assert.equal(sonuc.tekrar, 0);
  assert.equal(olaylar().filter((olay) => olay.tip === "istek").length, 0);
  assert.ok(sonuc.karsilastirma && typeof sonuc.karsilastirma === "object");
});

test("work:true risk:0 -> work event written, comparison populated", async () => {
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

test("same input twice -> duplicate:1 on the second call (30-day window)", async () => {
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

test("risk:3 -> no work or penalty event written (penalties are not forwarded to the shadow this turn)", async () => {
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

test("subagent (PI_SUBAGENT_CHILD=1) -> nothing is written", async () => {
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

test("if getEntries throws, error is populated and nothing is thrown", async () => {
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

test("verdict.odul ne:'keşif: playwright' -> merit event with source:'kesif' is written", async () => {
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

test("the golgeLogla line is appended to skor-golge.log", async () => {
  temizle();
  const { golgeIsle } = await yukle();
  golgeIsle(taban({ work: false }));
  const birinci = readFileSync(LOG_YOLU, "utf8").trim().split("\n").length;
  golgeIsle(taban({ work: false, simdi: 2_000_001 }));
  const ikinci = readFileSync(LOG_YOLU, "utf8").trim().split("\n").length;
  assert.equal(birinci, 1);
  assert.equal(ikinci, 2);
  assert.match(readFileSync(LOG_YOLU, "utf8"), /\| shadow \|/);
});

test("smoke: user-character-skorcu.ts can be imported dynamically, no syntax error", () => {
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

test("yargicKarsilastir: recovered error -> D penalty, incompatible with eskiRisk 2", async () => {
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

test("yargicKarsilastir: empty messages -> risk 0, work false, no throw", async () => {
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

test("yargicKarsilastir: old and new agree -> compatible true", async () => {
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

test("golgeIsle + messages: no work event when E exists (new judge)", async () => {
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

test("golgeIsle + messages: judge populated, '| judge |' line in log", async () => {
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
  assert.match(log, /\| judge \|/);
  assert.match(log, /old\(D0\/true\) → new\(D0\/true\)/);
  assert.match(log, /match=true/);
});

test("golgeIsle without messages: old behavior same, judge null", async () => {
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
  assert.equal(readFileSync(LOG_YOLU, "utf8").includes("| judge |"), false);
});

test("ctx.sessionManager.getEntries throws -> no error, judge null, old parameters", async () => {
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

test("subagent (PI_SUBAGENT_CHILD=1) writes nothing even with messages", async () => {
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

test("without messages, events are derived from ctx.getEntries and written by the new judge", async () => {
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
