import assert from "node:assert/strict";
import test from "node:test";

import {
  KAPI_METINLERI,
  POLITIKA,
  aracPolitikasi,
  kabukParcala,
  kapiKarari,
  korumaliYol,
  yazmaHedefleri,
} from "../extensions/kapi-politika.mjs";

const cwd = "C:/proj";
const simdi = 1_000_000;

const karar = (command, { toolName = "bash", rank = 0, yol = cwd, grant, now = simdi } = {}) =>
  kapiKarari({ toolName, input: { command }, rank, cwd: yol, grant, now });

test("ls; python zararli.py rank 0 -> confirm", () => {
  const sonuc = karar("ls; python zararli.py", { rank: 0 });
  assert.equal(sonuc.action, "confirm");
});

test("cp korumalı Windows hedefi rank 2 -> deny (duvar)", () => {
  const sonuc = karar("cp a.js C:/Windows/x.js", { rank: 2 });
  assert.equal(sonuc.action, "deny");
  assert.ok(sonuc.wall);
  assert.equal(sonuc.via, "wall");
});

test("mkdir C:/Windows/yeni rank 2 -> deny", () => {
  const sonuc = karar("mkdir C:/Windows/yeni", { rank: 2 });
  assert.equal(sonuc.action, "deny");
  assert.ok(sonuc.wall);
});

test("npm run format rank 2 -> allow (format tek başına duvar değil)", () => {
  const sonuc = karar("npm run format", { rank: 2 });
  assert.equal(sonuc.action, "allow");
});

test("git status # rm -rf / rank 0 -> allow (yorum duvar sayılmaz)", () => {
  const sonuc = karar("git status # rm -rf /", { rank: 0 });
  assert.equal(sonuc.action, "allow");
});

test("find . -delete rank 0 -> deny", () => {
  const sonuc = karar("find . -delete", { rank: 0 });
  assert.equal(sonuc.action, "deny");
  assert.equal(sonuc.wall, "find-yikici");
});

test("cat > ../x rank 1 -> confirm (cwd dışı yazma)", () => {
  const sonuc = karar("cat > ../x", { rank: 1 });
  assert.equal(sonuc.action, "confirm");
});

test("Set-Content SKILL.md -> deny (korumalı)", () => {
  const sonuc = kapiKarari({
    toolName: "powershell",
    input: { command: "Set-Content SKILL.md -Value x" },
    rank: 2,
    cwd: "C:/skills/test",
    now: simdi,
  });
  assert.equal(sonuc.action, "deny");
  assert.ok(sonuc.wall);
});

test("edit + cwd yok -> confirm", () => {
  const sonuc = kapiKarari({
    toolName: "edit",
    input: { path: "src/a.js" },
    rank: 1,
    cwd: undefined,
    now: simdi,
  });
  assert.equal(sonuc.action, "confirm");
});

test("Remove-Item C:/Windows/x (powershell) -> deny", () => {
  const sonuc = kapiKarari({
    toolName: "powershell",
    input: { command: "Remove-Item C:/Windows/x" },
    rank: 2,
    cwd,
    now: simdi,
  });
  assert.equal(sonuc.action, "deny");
  assert.equal(sonuc.wall, "remove-item");
});

test("browser_click rank 2 -> allow", () => {
  const sonuc = kapiKarari({ toolName: "browser_click", input: {}, rank: 2, cwd, now: simdi });
  assert.equal(sonuc.action, "allow");
});

test("powershell rank 2 duvar dışı -> allow (bash ile aynı kademe)", () => {
  const sonuc = kapiKarari({
    toolName: "powershell",
    input: { command: "Write-Output merhaba" },
    rank: 2,
    cwd,
    now: simdi,
  });
  assert.equal(sonuc.action, "allow");
  assert.equal(sonuc.via, "rank");
});

test("bash rank 2 duvar dışı -> allow", () => {
  const sonuc = karar("echo merhaba", { rank: 2 });
  assert.equal(sonuc.action, "allow");
  assert.equal(sonuc.via, "rank");
});

test("kabukParcala tırnak farkındalığı ve sıra", () => {
  assert.deepEqual(kabukParcala('a "b;c" ; d && e'), ['a "b;c"', "d", "e"]);
});

test("kabukParcala tek tırnak, kaçış ve yeni satır", () => {
  assert.deepEqual(kabukParcala("a 'b;c' | d\n e"), ["a 'b;c'", "d", "e"]);
  assert.deepEqual(kabukParcala("a \\; b"), ["a \\; b"]);
});

test("korumaliYol Windows alt dizini korur, sıradan kaynak korumaz", () => {
  assert.equal(korumaliYol("C:/Windows/system32/x.dll"), true);
  assert.equal(korumaliYol("src/a.js"), false);
});

test("korumaliYol dosya adı ve dizin eşleşmesi", () => {
  assert.equal(korumaliYol("C:/proj/SKILL.md"), true);
  assert.equal(korumaliYol("/etc/hosts"), true);
  assert.equal(korumaliYol("/usr/local/bin/x"), true);
  assert.equal(korumaliYol("C:/WindowsX/a"), false);
});

test("KAPI_METINLERI tek kaynak: eşik sayısı kadar ve tur kelimesi yok", () => {
  assert.equal(KAPI_METINLERI.length, POLITIKA.esikler.length);
  assert.deepEqual(POLITIKA.esikler, [0, 5, 15, 30, 50, 75, 105, 140]);
  for (const metin of KAPI_METINLERI) assert.doesNotMatch(metin, /tur/i);
});

test("duvar geçerli grant'ı EZER: korumalı yazma", () => {
  const sonuc = kapiKarari({
    toolName: "write",
    input: { path: "SKILL.md" },
    rank: 5,
    cwd,
    grant: { until: simdi + 60_000, kapsam: "yazma" },
    now: simdi,
  });
  assert.equal(sonuc.action, "deny");
  assert.equal(sonuc.via, "wall");
});

test("duvar geçerli grant'ı EZER: Windows hedefi", () => {
  const sonuc = karar("cp a.js C:/Windows/x.js", {
    rank: 5,
    grant: { until: simdi + 60_000, kapsam: "shell" },
  });
  assert.equal(sonuc.action, "deny");
  assert.equal(sonuc.via, "wall");
});

test("duvar geçerli grant'ı EZER: find -delete", () => {
  const sonuc = karar("find . -delete", {
    rank: 5,
    grant: { until: simdi + 60_000, kapsam: "shell" },
  });
  assert.equal(sonuc.action, "deny");
  assert.equal(sonuc.via, "wall");
});

test("grant geçerli -> allow via grant", () => {
  const sonuc = karar("python zararli.py", {
    rank: 0,
    grant: { until: simdi + 60_000, kapsam: "shell" },
  });
  assert.equal(sonuc.action, "allow");
  assert.equal(sonuc.via, "grant");
});

test("süresi geçmiş grant yok sayılır", () => {
  const sonuc = karar("python zararli.py", {
    rank: 0,
    grant: { until: simdi - 1, kapsam: "shell" },
  });
  assert.equal(sonuc.action, "confirm");
});

test("grant kapsamı aracı veya sınıfı kapsamıyorsa yok sayılır", () => {
  const sonuc = karar("python zararli.py", {
    rank: 0,
    grant: { until: simdi + 60_000, kapsam: "yazma" },
  });
  assert.equal(sonuc.action, "confirm");
});

test("yazmaHedefleri göreli yolu cwd'ye çözer ve .. normalize eder", () => {
  assert.deepEqual(yazmaHedefleri("cat > a/../b.txt", cwd), ["C:/proj/b.txt"]);
});

test("yazmaHedefleri cwd yoksa göreli hedefte null döner", () => {
  assert.equal(yazmaHedefleri("cat > b.txt", null), null);
});

test("yazmaHedefleri -o ve --output değerini alır", () => {
  assert.deepEqual(yazmaHedefleri("tool -o out.txt", cwd), ["C:/proj/out.txt"]);
  assert.deepEqual(yazmaHedefleri("tool --output=rapor.txt", cwd), ["C:/proj/rapor.txt"]);
});

test("aracPolitikasi sınıfları ve bash/powershell eşitliği", () => {
  assert.deepEqual(aracPolitikasi({ toolName: "bash" }), { sinif: "shell", kabuk: "bash" });
  assert.deepEqual(aracPolitikasi({ toolName: "powershell" }), {
    sinif: "shell",
    kabuk: "powershell",
  });
  assert.deepEqual(aracPolitikasi({ toolName: "read" }), { sinif: "okuma" });
  assert.deepEqual(aracPolitikasi({ toolName: "write" }), { sinif: "yazma" });
  assert.deepEqual(aracPolitikasi({ toolName: "browser_click" }), { sinif: "diger" });
});

test("okuma her rütbede allow", () => {
  const sonuc = kapiKarari({ toolName: "read", input: { path: "a.js" }, rank: 0, cwd, now: simdi });
  assert.equal(sonuc.action, "allow");
});

test("diger araç rank 0 confirm, rank 1 allow", () => {
  const alt = kapiKarari({ toolName: "browser_click", input: {}, rank: 0, cwd, now: simdi });
  const ust = kapiKarari({ toolName: "browser_click", input: {}, rank: 1, cwd, now: simdi });
  assert.equal(alt.action, "confirm");
  assert.equal(ust.action, "allow");
});

test("yazma rank 1 cwd içinde allow, rank 0 confirm", () => {
  const altin = kapiKarari({ toolName: "write", input: { path: "src/a.js" }, rank: 1, cwd, now: simdi });
  const bronz = kapiKarari({ toolName: "write", input: { path: "src/a.js" }, rank: 0, cwd, now: simdi });
  assert.equal(altin.action, "allow");
  assert.equal(bronz.action, "confirm");
});

test("yazma cwd dışına rank 2 olsa da confirm", () => {
  const sonuc = kapiKarari({
    toolName: "write",
    input: { path: "../disarida.js" },
    rank: 2,
    cwd,
    now: simdi,
  });
  assert.equal(sonuc.action, "confirm");
});

test("duvarlar: format C:, mkfs, dd of=, fork bombası", () => {
  assert.equal(karar("format C:", { rank: 2 }).action, "deny");
  assert.equal(karar("mkfs.ext4 /dev/sda1", { rank: 2 }).action, "deny");
  assert.equal(karar("dd if=/dev/zero of=/dev/sda", { rank: 2 }).action, "deny");
  assert.equal(karar(":(){ :|:& };:", { rank: 2 }).action, "deny");
});

test("duvar rank ne olursa olsun geçerlidir", () => {
  assert.equal(karar("rm -rf /", { rank: 0 }).action, "deny");
  assert.equal(karar("rm -rf /", { rank: 7 }).action, "deny");
});

test("pasif (rank -1): yazma sebebi 'pasif', 'bronz' değil", () => {
  const sonuc = kapiKarari({ toolName: "write", input: { path: "a.js" }, rank: -1, cwd, now: simdi });
  assert.equal(sonuc.action, "confirm");
  assert.match(sonuc.reason, /pasif/);
  assert.doesNotMatch(sonuc.reason, /bronz/);
});

test("pasif (rank -1): shell sebebi 'pasif'", () => {
  const sonuc = karar("python zararli.py", { rank: -1 });
  assert.equal(sonuc.action, "confirm");
  assert.match(sonuc.reason, /pasif/);
});
