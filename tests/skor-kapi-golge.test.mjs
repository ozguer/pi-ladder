import assert from "node:assert/strict";
import test, { after } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ev = mkdtempSync(join(tmpdir(), "skor-kapi-golge-ev-"));
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

const { kapiGolge } = await import("../extensions/skor-kapi-golge.mjs");

const kabuk = (command) => ({ toolName: "bash", input: { command } });

test("old allow + new deny (wall): match false, new.wall populated", () => {
  const kg = kapiGolge({
    ...kabuk("rm -rf /"),
    rank: 2,
    cwd: ev,
    eskiKarar: { action: "allow" },
  });
  assert.equal(kg.uyumlu, false);
  assert.equal(kg.yeni.action, "deny");
  assert.ok(kg.yeni.wall);
  assert.equal(kg.loglandi, false);
});

test("old confirm + new allow (rank 2 shell): match false", () => {
  const kg = kapiGolge({
    ...kabuk("npm test"),
    rank: 2,
    cwd: ev,
    eskiKarar: { action: "confirm" },
  });
  assert.equal(kg.yeni.action, "allow");
  assert.equal(kg.uyumlu, false);
});

test("same decision: match true", () => {
  const kg = kapiGolge({
    toolName: "read",
    input: { path: "src/a.ts" },
    rank: 0,
    cwd: ev,
    eskiKarar: { action: "allow" },
  });
  assert.equal(kg.yeni.action, "allow");
  assert.equal(kg.uyumlu, true);
});

test("durum.rank comes before the parameter (rank 0 + durum.rank 2 -> allow)", () => {
  const parametre = kapiGolge({
    ...kabuk("npm test"),
    rank: 0,
    cwd: ev,
    eskiKarar: { action: "confirm" },
  });
  assert.equal(parametre.yeni.action, "confirm");

  const durumlu = kapiGolge({
    ...kabuk("npm test"),
    rank: 0,
    cwd: ev,
    eskiKarar: { action: "confirm" },
    durum: { rank: 2 },
  });
  assert.equal(durumlu.yeni.action, "allow");
  assert.equal(durumlu.uyumlu, false);
});

test("passing logYolu adds a '| gate |' line; the directory is created if missing", () => {
  const logYolu = join(ev, "alt", "skor-golge.log");
  assert.equal(existsSync(join(ev, "alt")), false);
  const kg = kapiGolge({
    ...kabuk("ls"),
    rank: 0,
    cwd: ev,
    eskiKarar: { action: "allow" },
    now: 0,
    logYolu,
  });
  assert.equal(kg.loglandi, true);
  assert.ok(existsSync(logYolu));
  const satirlar = readFileSync(logYolu, "utf8").trimEnd().split("\n");
  assert.equal(satirlar.length, 1);
  assert.equal(
    satirlar[0],
    "1970-01-01T00:00:00.000Z | gate | bash old=allow → new=allow via=- match=true wall=-",
  );
});

test("subagent (PI_SUBAGENT_CHILD=1): new null, logged false, no log written", () => {
  const logYolu = join(ev, "alt-ajan", "skor-golge.log");
  process.env.PI_SUBAGENT_CHILD = "1";
  try {
    const kg = kapiGolge({
      ...kabuk("ls"),
      rank: 2,
      cwd: ev,
      eskiKarar: { action: "allow" },
      logYolu,
    });
    assert.equal(kg.yeni, null);
    assert.equal(kg.uyumlu, null);
    assert.equal(kg.loglandi, false);
    assert.equal(existsSync(logYolu), false);
  } finally {
    delete process.env.PI_SUBAGENT_CHILD;
  }
});

test("broken input (input null, eskiKarar undefined): no throw, match null", () => {
  let kg;
  assert.doesNotThrow(() => {
    kg = kapiGolge({ toolName: undefined, input: null, eskiKarar: undefined });
  });
  assert.equal(kg.uyumlu, null);
  assert.equal(kg.loglandi, false);
  assert.equal(kg.hata, undefined);
  assert.ok(kg.yeni);
});

test("wall name appears in the log", () => {
  const logYolu = join(ev, "duvar", "skor-golge.log");
  const kg = kapiGolge({
    ...kabuk("rm -rf /"),
    rank: 2,
    cwd: ev,
    eskiKarar: { action: "allow" },
    logYolu,
  });
  assert.equal(kg.yeni.action, "deny");
  assert.ok(kg.yeni.wall);
  const satir = readFileSync(logYolu, "utf8").trimEnd();
  assert.match(satir, /\| gate \|/);
  assert.ok(satir.includes(`wall=${kg.yeni.wall}`));
  assert.ok(satir.includes("→ new=deny"));
});

test("if kapiKarari throws (invalid type), error is populated, nothing is thrown", () => {
  let kg;
  assert.doesNotThrow(() => {
    kg = kapiGolge({
      ...kabuk("ls"),
      rank: Symbol("bozuk"),
      cwd: ev,
      eskiKarar: { action: "allow" },
    });
  });
  assert.equal(kg.yeni, null);
  assert.equal(kg.uyumlu, null);
  assert.equal(kg.loglandi, false);
  assert.equal(typeof kg.hata, "string");
  assert.ok(kg.hata.length > 0);
});
