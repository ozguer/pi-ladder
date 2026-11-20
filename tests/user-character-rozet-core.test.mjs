import assert from "node:assert/strict";
import test from "node:test";
import { RANKS, parseScore, rankIndex, rutbeIndex, nextRank, doorsText, sonrakiKapilar, decideGate, renderRozet, historyDelta, riskFor, puanDurum, yeniTur, compactTranscript, tamponFor, bolgeFor, rutbeAktif, sonTurlarTemiz, kapsamOlustur, kapsamGecerli, varsayilanKapsam, kapsamSecenekleri, onaySatiri, kapsamAdi, boardPuanSenkron, SURE_MS, kapiBasligi, KAPSAM } from "../extensions/user-character-rozet-core.mjs";

const board = `# Skorboard
## Durum
| Ölçü | Değer |
|---|---|
| Toplam ceza | 14 |
| Toplam ödül | 2 |
| Puan | -12 |
| Rozet | — (sonraki: bronz 5) |
## Ceza
| # | Tarih | Grup | Derece | Kural | İhlal | Kanıt | Puan |
|---|---|---|---|---|---|---|---|
| 1 | 2026-11-19 | A | 5 | x | y | z | 5 |
| 2 | 2026-11-19 | C | 3 | x | y | z | 3 |
| 3 | 2026-11-19 | C | 2 | x | y | z | 2 |
| 4 | 2026-11-19 | C | 2 | x | y | z | 2 |
| 5 | 2026-11-19 | C | 1 | x | y | z | 1 |
| 6 | 2026-11-19 | C | 1 | x | y | z | 1 |
## Ödül
| # | Tarih | Grup | Derece | Ne işe yaradı | Kanıt | Puan |
|---|---|---|---|---|---|---|
| 1 | 2026-11-19 | A | 2 | doğru | kanıt | 2 |
`;

test("puan defterden hesaplanır: ödül − ceza", () => {
  assert.deepEqual(parseScore(board), { ceza: 14, odul: 2, puan: -12 });
});

test("boş defter sıfır puan verir", () => {
  assert.deepEqual(parseScore(""), { ceza: 0, odul: 0, puan: 0 });
});

test("rütbe eşikleri: puan ve kıdem birlikte", () => {
  assert.equal(RANKS.length, 8);
  assert.deepEqual(RANKS.map((r) => r.puan), [0, 3, 8, 15, 22, 30, 40, 50]);
  assert.deepEqual(RANKS.map((r) => r.tur), [3, 8, 20, 40, 60, 80, 100, 120]);

  assert.equal(rankIndex(0), 0);
  assert.equal(rankIndex(3), 1);
  assert.equal(rankIndex(8), 2);
  assert.equal(rankIndex(50), 7);

  assert.equal(rutbeIndex(0, 0), -1);
  assert.equal(rutbeIndex(0, 3), 0);
  assert.equal(rutbeIndex(15, 10), 1, "puan elmas 1 ama kıdem gümüş");
  assert.equal(rutbeIndex(8, 35), 2, "puan altın, kıdem yeterli");
  assert.equal(rutbeIndex(24, 74), 4, "mevcut durum elmas 2");
});

test("sıradaki eşik: kalan puan ve kalan tur", () => {
  assert.deepEqual(nextRank(0, 0), { name: "bronz", puan: 0, tur: 3, kalan: 0, kalanTur: 3 });
  assert.deepEqual(nextRank(24, 74), { name: "elmas 3", puan: 30, tur: 80, kalan: 6, kalanTur: 6 });
  assert.equal(nextRank(50, 120), null);
});

test("açık kapı yalnız o rütbeyi gösterir, sonraki rütbe ayrı yazılır", () => {
  assert.equal(doorsText(-1).length, 1);
  assert.match(doorsText(-1)[0], /kapı yok/);
  assert.equal(doorsText(0).length, 1);
  assert.equal(doorsText(2).length, 1);
  assert.match(doorsText(2)[0], /duvar dışı her komut/);
  assert.doesNotMatch(doorsText(2)[0], /proje komutları/);
  assert.match(sonrakiKapilar(2)[0], /elmas 1/);
  assert.equal(sonrakiKapilar(2).length, 2);
  assert.equal(sonrakiKapilar(7).length, 0);
});

test("yıkıcı ve global işlem her rütbede onay ister", () => {
  for (const rank of [-1, 0, 2, 7]) {
    assert.equal(decideGate({ toolName: "bash", input: { command: "rm -rf build" }, rank, editsThisTurn: 0 }).action, "confirm");
    assert.equal(decideGate({ toolName: "bash", input: { command: "npm i -g foo" }, rank, editsThisTurn: 0 }).action, "confirm");
    assert.equal(decideGate({ toolName: "bash", input: { command: "pip install x" }, rank, editsThisTurn: 0 }).action, "confirm");
  }
});

test("okuma komutu bronzdan itibaren serbest, rütbe yokken değil", () => {
  const input = { command: "git status" };
  assert.equal(decideGate({ toolName: "bash", input, rank: -1, editsThisTurn: 0 }).action, "confirm");
  assert.equal(decideGate({ toolName: "bash", input, rank: 0, editsThisTurn: 0 }).action, "allow");
  assert.equal(decideGate({ toolName: "bash", input, rank: 1, editsThisTurn: 0 }).action, "allow");
  assert.equal(decideGate({ toolName: "bash", input: { command: "node --test x.mjs" }, rank: 1, editsThisTurn: 0 }).action, "allow");
});

test("dosya düzenleme turda rütbe sınırına bağlı", () => {
  const input = { path: "a.txt", content: "x" };
  assert.equal(decideGate({ toolName: "edit", input, rank: -1, editsThisTurn: 0 }).action, "confirm");
  assert.equal(decideGate({ toolName: "edit", input, rank: 0, editsThisTurn: 0 }).action, "allow");
  assert.equal(decideGate({ toolName: "edit", input, rank: 0, editsThisTurn: 1 }).action, "confirm");
  assert.equal(decideGate({ toolName: "write", input, rank: 1, editsThisTurn: 1 }).action, "allow");
  assert.equal(decideGate({ toolName: "write", input, rank: 1, editsThisTurn: 2 }).action, "confirm");
  assert.equal(decideGate({ toolName: "write", input, rank: 2, editsThisTurn: 2 }).action, "allow");
  assert.equal(decideGate({ toolName: "write", input, rank: 2, editsThisTurn: 3 }).action, "confirm");
  assert.equal(decideGate({ toolName: "write", input, rank: 3, editsThisTurn: 4 }).action, "allow");
  assert.equal(decideGate({ toolName: "write", input, rank: 3, editsThisTurn: 5 }).action, "confirm");
  assert.equal(decideGate({ toolName: "write", input, rank: 5, editsThisTurn: 40 }).action, "allow");
});

test("git commit gümüşte, proje içi kurulum altında açılır", () => {
  const commit = { command: "git commit -m x" };
  assert.equal(decideGate({ toolName: "bash", input: commit, rank: 0, editsThisTurn: 0 }).action, "confirm");
  assert.equal(decideGate({ toolName: "bash", input: commit, rank: 1, editsThisTurn: 0 }).action, "allow");

  const install = { command: "npm install lodash" };
  assert.equal(decideGate({ toolName: "bash", input: install, rank: 1, editsThisTurn: 0 }).action, "confirm");
  assert.equal(decideGate({ toolName: "bash", input: install, rank: 2, editsThisTurn: 0 }).action, "allow");
});

test("kapı başlığı tek satır ve kısa", () => {
  const baslik = kapiBasligi({ rutbeAdi: "altın", puan: 42, reason: "komut bu rütbede serbest değil" });
  assert.ok(!baslik.includes("\n"));
  assert.match(baslik, /altın/);
  assert.match(baslik, /serbest değil/);
  const uzun = kapiBasligi({ rutbeAdi: "gümüş", puan: 20, reason: "x".repeat(300) });
  assert.ok(uzun.length <= 111);
  assert.ok(!uzun.includes("\n"));
  assert.equal(KAPSAM.map((k) => k.ad).join("|"), "Bir kez|Bu tur|15 dakika|Bu oturum|Bu oturum + duvarlar");
});

test("proje komutları gümüşten itibaren serbest, duvarlar değil", () => {
  assert.equal(decideGate({ toolName: "bash", input: { command: "python x.py" }, rank: 0, editsThisTurn: 0 }).action, "confirm");
  assert.equal(decideGate({ toolName: "bash", input: { command: "python x.py" }, rank: 1, editsThisTurn: 0 }).action, "allow");
  assert.equal(decideGate({ toolName: "bash", input: { command: "ego-browser nodejs -e 1" }, rank: 1, editsThisTurn: 0 }).action, "allow");
  assert.equal(decideGate({ toolName: "bash", input: { command: "rm -rf build" }, rank: 5, editsThisTurn: 0 }).wall, true);
  assert.equal(decideGate({ toolName: "bash", input: { command: "git push origin main" }, rank: 1, editsThisTurn: 0 }).action, "confirm");
  assert.equal(decideGate({ toolName: "bash", input: { command: "git push origin main" }, rank: 2, editsThisTurn: 0 }).action, "allow");
  assert.equal(decideGate({ toolName: "bash", input: { command: "npm i -g foo" }, rank: 7, editsThisTurn: 0 }).action, "confirm");
});

test("diğer araçlar kapıya takılmaz", () => {
  assert.equal(decideGate({ toolName: "read", input: { path: "a" }, rank: -1, editsThisTurn: 0 }).action, "allow");
  assert.equal(decideGate({ toolName: "grep", input: { pattern: "x" }, rank: -1, editsThisTurn: 0 }).action, "allow");
});

test("okuma dışı araçlar onay ister, toplu onay serbest bırakır", () => {
  assert.equal(decideGate({ toolName: "webfetch", input: { url: "https://x" }, rank: 2, editsThisTurn: 0 }).action, "allow");
  const tarayici = decideGate({ toolName: "browser_click", input: { ref: "e1" }, rank: 2, editsThisTurn: 0 });
  assert.equal(tarayici.action, "confirm");
  assert.match(tarayici.reason, /browser_click/);
  const grant = kapsamOlustur("tur", { turnId: 3 });
  assert.equal(
    decideGate({ toolName: "browser_click", input: { ref: "e1" }, rank: 2, editsThisTurn: 0, grant, turnId: 3 }).action,
    "allow",
  );
  assert.equal(
    decideGate({ toolName: "browser_click", input: { ref: "e1" }, rank: 2, editsThisTurn: 0, grant, turnId: 4 }).action,
    "confirm",
  );
});

test("geçmiş: yükselme ve düşme satırları eklenir, ilk kurulumda geçmiş uydurulmaz", () => {
  const bos = [];
  assert.deepEqual(historyDelta({ oncekiRank: null, rank: 0, puan: 5, tarih: "2026-11-19", gecmis: bos }), []);

  const cikis = historyDelta({ oncekiRank: 0, rank: 2, puan: 30, tarih: "2026-11-19", gecmis: bos });
  assert.deepEqual(cikis.map((r) => `${r.olay}:${r.rozet}`), ["kazandı:gümüş", "kazandı:altın"]);

  const inis = historyDelta({ oncekiRank: 2, rank: 0, puan: 10, tarih: "2026-11-19", gecmis: cikis });
  assert.deepEqual(inis.slice(-2).map((r) => `${r.olay}:${r.rozet}`), ["kaybetti:altın", "kaybetti:gümüş"]);
  assert.equal(inis.length, 4);
});

test("duvarlar işaretli, rütbe engeli duvar değil", () => {
  assert.equal(decideGate({ toolName: "bash", input: { command: "rm -rf build" }, rank: 7, editsThisTurn: 0 }).wall, true);
  assert.equal(decideGate({ toolName: "bash", input: { command: "git status" }, rank: 0, editsThisTurn: 0 }).wall, undefined);
  assert.equal(decideGate({ toolName: "edit", input: { path: "a" }, rank: -1, editsThisTurn: 0 }).wall, undefined);
});

test("tur ücreti yok: puan yalnız ödülden, tur kıdeme yazılır", () => {
  const bos = { birikim: 0, turlar: [], temizTur: 0 };
  const sade = yeniTur(bos, { risk: 0, odul: 0, work: true });
  assert.equal(sade.birikim, 0);
  assert.equal(sade.temizTur, 1);
  assert.equal(puanDurum(sade), 0);

  const odullu = yeniTur(sade, { risk: 0, odul: 2, work: true });
  assert.equal(odullu.birikim, 2);
  assert.equal(odullu.temizTur, 2);

  const sohbet = yeniTur(odullu, { risk: 0, odul: 0, work: false });
  assert.equal(sohbet.temizTur, 2, "araçsız tur kıdeme yazılmaz");

  const cezali = yeniTur(sohbet, { risk: 3, odul: 0, work: true });
  assert.equal(cezali.temizTur, 2, "riskli tur kıdeme yazılmaz");
  assert.equal(puanDurum(cezali), 0);
});

test("risk yalnız D ve E'den gelir, tur başına en fazla 3", () => {
  const rows = [
    { grup: "E", puan: 3 },
    { grup: "D", puan: 2 },
    { grup: "B", puan: 2 },
    { grup: "A", puan: 5 },
    { grup: "F", puan: 1 },
  ];
  assert.equal(riskFor(rows), 3);
  assert.equal(riskFor([{ grup: "B", puan: 1 }]), 0);
  assert.equal(riskFor([{ grup: "A", puan: 3 }]), 0);
  assert.equal(riskFor([{ grup: "D", puan: 2 }]), 2);
  assert.equal(riskFor([]), 0);
});

test("tampon ve bölge", () => {
  assert.equal(tamponFor(6, 1), 3);
  assert.equal(tamponFor(11, 1), 8);
  assert.equal(tamponFor(12, 2), 4);
  assert.equal(tamponFor(5, 0), 5);
  assert.equal(tamponFor(4, -1), null);
  assert.equal(bolgeFor(6), "guvenli");
  assert.equal(bolgeFor(5), "guvenli");
  assert.equal(bolgeFor(4), "sari");
  assert.equal(bolgeFor(0), "kirmizi");
});

test("rütbe aktif: eşik + son 3 tur temiz", () => {
  const temiz = [{ risk: 0 }, { risk: 0 }, { risk: 0 }];
  const kirli = [{ risk: 0 }, { risk: 3 }, { risk: 0 }];
  assert.equal(rutbeAktif(16, temiz, 1), true);
  assert.equal(rutbeAktif(16, kirli, 1), false);
  assert.equal(rutbeAktif(16, [], 1), true);
  assert.equal(rutbeAktif(4, temiz, -1), false);
  assert.equal(sonTurlarTemiz(kirli, 3), false);
});

test("puan = birikim − 2 × risk, taban 0; risk 10 turda erir", () => {
  assert.equal(puanDurum({ birikim: 0, turlar: [] }), 0);
  assert.equal(puanDurum({ birikim: 10, turlar: [] }), 10);
  assert.equal(puanDurum({ birikim: 10, turlar: [{ risk: 2 }] }), 6);
  assert.equal(puanDurum({ birikim: 3, turlar: [{ risk: 5 }] }), 0);
  assert.equal(puanDurum({ birikim: 30, turlar: [{ risk: 5 }, { risk: 5 }] }), 10);

  const state = yeniTur({ birikim: 5, turlar: [], temizTur: 0 }, { risk: 1, odul: 2, work: true });
  assert.equal(state.birikim, 7);
  assert.deepEqual(state.turlar, [{ risk: 1, odul: 2, puan: 5 }]);
  assert.equal(state.temizTur, 0);
  assert.equal(yeniTur(state, { risk: 0, odul: 0, work: true }).turlar.length, 2);

  let rolling = { birikim: 0, turlar: [], temizTur: 0 };
  for (let i = 0; i < 12; i += 1) rolling = yeniTur(rolling, { risk: 1, odul: 0, work: true });
  assert.equal(rolling.turlar.length, 10);
  assert.equal(puanDurum(rolling), 0);
});

test("skorcu metni: bosluk kırpar, tekrarı toplar, boyutu sınırlar", () => {
  const items = [
    { role: "user", text: "  uzun   bosluk  " },
    { role: "assistant", text: "cevap", calls: ["read a.txt", "read a.txt"] },
    { role: "toolResult", text: "x".repeat(400) },
    { role: "toolResult", text: "hata", isError: true },
  ];
  const text = compactTranscript(items);
  assert.match(text, /^K: uzun bosluk/);
  assert.match(text, /→ read a\.txt ×2/);
  const sonuc = text.split("\n").find((line) => line.startsWith("← ok:"));
  assert.ok(sonuc.length <= 170);
  assert.match(text, /← HATA: hata/);
  assert.equal(compactTranscript(items, { maxChars: 40 }).length, 40);
});

test("rozet kaydı kaybedileni silmez, güncel rütbeyi ve sıradakini yazar", () => {
  const text = renderRozet({
    puan: 6,
    rank: 0,
    temizTur: 10,
    gecmis: [
      { tarih: "2026-11-19", olay: "kazandı", rozet: "bronz", puan: 5, sebep: "eşik" },
      { tarih: "2026-11-19", olay: "kaybetti", rozet: "gümüş", puan: 9, sebep: "ceza" },
    ],
  });
  assert.match(text, /\| Puan \| 6 \|/);
  assert.match(text, /\| Kıdem \| 10 temiz tur \|/);
  assert.match(text, /\| Rütbe \| bronz \|/);
  assert.match(text, /altın \(2 puan \+ 10 tur kaldı\)/);
  assert.match(text, /kaybetti/);
  assert.match(text, /duvarlar/i);
  assert.match(text, /\| Varsayılan onay \| Bir kez \|/);
  assert.match(text, /## Sıradaki kapılar/);
});

test("toplu onay kapsamları: tur, süre, oturum", () => {
  assert.equal(varsayilanKapsam(-1), "tek");
  assert.equal(varsayilanKapsam(1), "tek");
  assert.equal(varsayilanKapsam(2), "tur");
  assert.equal(varsayilanKapsam(4), "sure");
  assert.equal(varsayilanKapsam(7), "oturum");
  assert.equal(kapsamAdi("tur"), "Bu tur");

  const now = 1000;
  const tur = kapsamOlustur("tur", { turnId: 5 });
  assert.equal(kapsamGecerli(tur, { turnId: 5 }), true);
  assert.equal(kapsamGecerli(tur, { turnId: 6 }), false);

  const sure = kapsamOlustur("sure", { turnId: 5, now });
  assert.equal(kapsamGecerli(sure, { turnId: 6, now: now + SURE_MS - 1 }), true);
  assert.equal(kapsamGecerli(sure, { turnId: 6, now: now + SURE_MS }), false);

  const oturum = kapsamOlustur("oturum", { turnId: 5 });
  assert.equal(kapsamGecerli(oturum, { turnId: 99, now: now + 1e9 }), true);
  assert.equal(kapsamOlustur("tek", { turnId: 1 }), null);
  assert.equal(kapsamGecerli(null, {}), false);
});

test("toplu onay duvarı açmaz, tur dışına taşmaz", () => {
  const grant = kapsamOlustur("oturum", { turnId: 1 });
  const duvar = decideGate({ toolName: "bash", input: { command: "rm -rf build" }, rank: 2, editsThisTurn: 0, grant, turnId: 1 });
  assert.equal(duvar.action, "confirm");
  assert.equal(duvar.wall, true);

  const normal = decideGate({ toolName: "bash", input: { command: "curl https://ornek.test" }, rank: 1, editsThisTurn: 0, grant, turnId: 1 });
  assert.equal(normal.action, "allow");
  assert.equal(normal.via, "toplu");

  const sonrakiTur = decideGate({
    toolName: "bash",
    input: { command: "curl https://ornek.test" },
    rank: 1,
    editsThisTurn: 0,
    grant: kapsamOlustur("tur", { turnId: 1 }),
    turnId: 2,
  });
  assert.equal(sonrakiTur.action, "confirm");
});

test("defterdeki Puan satırı tek kaynaktan yazılır", () => {
  const text = ["# Skor", "", "| Ölçü | Değer |", "|---|---|", "| Toplam ceza | 3 |", "| Toplam ödül | 9 |", "| Puan | 10 |", ""].join("\n");
  const out = boardPuanSenkron(text, 33);
  assert.match(out, /\| Puan \| 33 \|/);
  assert.match(out, /\| Toplam ödül \| 9 \|/);
  assert.doesNotMatch(out, /\| Puan \| 10 \|/);
  assert.equal(boardPuanSenkron("| Puan | 10 |", 33), "| Puan | 33 |");
});


test("izin kapsamları: duvar yalnız oturum+duvar ile açılır", () => {
  const tur = kapsamOlustur("tur", { turnId: 5 });
  const oturum = kapsamOlustur("oturum", { turnId: 5 });
  const tam = kapsamOlustur("oturum+duvar", { turnId: 5 });

  assert.equal(kapsamGecerli(tur, { turnId: 5 }), true);
  assert.equal(kapsamGecerli(tur, { turnId: 6 }), false);
  assert.equal(kapsamGecerli(oturum, { turnId: 99 }), true);
  assert.equal(kapsamGecerli(oturum, { turnId: 99, wall: true }), false);
  assert.equal(kapsamGecerli(tam, { turnId: 99, wall: true }), true);
  assert.equal(kapsamGecerli(null, {}), false);
});

test("tek seçimi kayıt bırakmaz, oturum iznini silmez", () => {
  assert.equal(kapsamOlustur("tek", { turnId: 1 }), null);
  assert.equal(kapsamOlustur(undefined, {}), null);
});

test("kapı menüsünde duvar seçeneği yalnız altın ve üstünde", () => {
  assert.deepEqual(kapsamSecenekleri(2, { wall: true }).length, 5);
  assert.equal(kapsamSecenekleri(2, { wall: true }).includes("Bu oturum + duvarlar"), true);
  assert.equal(kapsamSecenekleri(1, { wall: true }).includes("Bu oturum + duvarlar"), false);
  assert.equal(kapsamSecenekleri(2, { wall: false }).length, 4);
});

test("duvar kararı oturum+duvar izniyle serbestleşir", () => {
  const tam = kapsamOlustur("oturum+duvar", { turnId: 1 });
  const normal = kapsamOlustur("oturum", { turnId: 1 });
  const rm = { toolName: "bash", input: { command: "rm -rf build" }, rank: 2, editsThisTurn: 0 };
  assert.equal(decideGate({ ...rm, grant: normal, turnId: 1 }).action, "confirm");
  assert.equal(decideGate({ ...rm, grant: tam, turnId: 1 }).action, "allow");
});

test("bash kademeleri: gümüşte proje komutları, altında her şey", () => {
  const python = { toolName: "bash", input: { command: "python x.py" }, editsThisTurn: 0 };
  assert.equal(decideGate({ ...python, rank: 0 }).action, "confirm");
  assert.equal(decideGate({ ...python, rank: 1 }).action, "allow");

  const ego = { toolName: "bash", input: { command: "ego-browser nodejs -e 1" }, editsThisTurn: 0 };
  assert.equal(decideGate({ ...ego, rank: 1 }).action, "allow");

  const push = { toolName: "bash", input: { command: "git push origin main" }, editsThisTurn: 0 };
  assert.equal(decideGate({ ...push, rank: 1 }).action, "confirm");
  assert.equal(decideGate({ ...push, rank: 2 }).action, "allow");
});

test("duvar listesi: yorumlayıcı silme, git clean, proje dışı yazma", () => {
  const duvar = (command, cwd) => decideGate({ toolName: "bash", input: { command }, rank: 7, editsThisTurn: 0, cwd }).wall;
  assert.equal(duvar("python -c \"import shutil; shutil.rmtree('x')\""), true);
  assert.equal(duvar("node -e \"fs.rmSync('x')\""), true);
  assert.equal(duvar("git clean -fdx"), true);
  assert.equal(duvar("Stop-Process -Id 12"), true);
  assert.equal(duvar("npm install lodash"), undefined);
  assert.equal(duvar("Set-Content C:\\Windows\\x.txt hi", "C:\\proj"), true);
  assert.equal(duvar("echo x > out.txt", "C:\\proj"), undefined);
});

test("onay log satırı tek satır ve alanlı", () => {
  const satir = onaySatiri({ tarih: "2026-11-20T10:00:00.000Z", tool: "bash", karar: "onaylandı", kapsam: "oturum" });
  assert.equal(satir, "2026-11-20T10:00:00.000Z | kapi | bash | onaylandı | oturum");
});


test("duvar: edit/write proje dışı yol", () => {
  const d = (yol, cwd) => decideGate({ toolName: "write", input: { path: yol }, rank: 2, editsThisTurn: 0, cwd }).wall;
  assert.equal(d("C:\\Windows\\x.txt", "C:\\proj"), true);
  assert.equal(d("C:\\proj\\a.txt", "C:\\proj"), undefined);
  assert.equal(d("C:\\proj-evil\\x.txt", "C:\\proj"), true);
  assert.equal(d("..\\..\\x.txt", "C:\\proj\\sub"), true);
});

test("duvar: bash ikinci redirect ve -o hedefi", () => {
  const d = (komut, cwd) => decideGate({ toolName: "bash", input: { command: komut }, rank: 2, editsThisTurn: 0, cwd }).wall;
  assert.equal(d("echo a > ok.txt && echo b > C:\\evil\\b.txt", "C:\\proj"), true);
  assert.equal(d("curl -o C:\\evil\\x https://ornek.test", "C:\\proj"), true);
  assert.equal(d("echo a > ok.txt", "C:\\proj"), undefined);
});

test("duvar: unlink ve os.remove yakalanır", () => {
  const d = (komut) => decideGate({ toolName: "bash", input: { command: komut }, rank: 2, editsThisTurn: 0 }).wall;
  assert.equal(d("node -e \"fs.unlink('x',()=>{})\""), true);
  assert.equal(d("python -c \"import os; os.remove('x')\""), true);
});

test("duvar: bash dışı araç da komut metniyle duvar olur", () => {
  const r = decideGate({ toolName: "powershell", input: { command: "Remove-Item -Recurse C:\\x" }, rank: 2, editsThisTurn: 0 });
  assert.equal(r.wall, true);
  assert.equal(decideGate({ toolName: "find", input: { pattern: "x" }, rank: 2, editsThisTurn: 0 }).action, "allow");
});
