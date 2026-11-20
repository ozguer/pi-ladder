import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const geciciEv = (t) => {
  const ev = mkdtempSync(join(tmpdir(), "goc-"));
  const oncekiHome = process.env.HOME;
  const oncekiProfil = process.env.USERPROFILE;

  process.env.HOME = ev;
  process.env.USERPROFILE = ev;

  t.after(() => {
    if (oncekiHome === undefined) delete process.env.HOME;
    else process.env.HOME = oncekiHome;
    if (oncekiProfil === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oncekiProfil;
    rmSync(ev, { recursive: true, force: true });
  });

  return ev;
};

const satirlariOku = (yol) => {
  const metin = readFileSync(yol, "utf8");
  return metin === "" ? [] : metin.trim().split("\n").map((satir) => JSON.parse(satir));
};

const sessizMain = async (main, argv) => {
  const cikti = [];
  const eskiLog = console.log;
  const eskiHata = console.error;
  console.log = (...parcalar) => cikti.push(parcalar.join(" "));
  console.error = () => {};
  try {
    const kod = await main(argv);
    return { kod, cikti: cikti.join("\n") };
  } finally {
    console.log = eskiLog;
    console.error = eskiHata;
  }
};

test("eskiDurumOku: puan=107 → K50 tavanı yetki=15 (altın), ham puan saklanır", async (t) => {
  const ev = geciciEv(t);
  const puanDosyasi = join(ev, "puan-durum.json");
  writeFileSync(puanDosyasi, JSON.stringify({ puan: 107, risk: 0 }));
  const { eskiDurumOku } = await import("../tools/goc.mjs");

  const durum = eskiDurumOku({ puanDosyasi, scoreboardDosyasi: join(ev, "SCOREBOARD.md") });

  assert.equal(durum.yetki, 15);
  assert.equal(durum.eskiPuan, 107);
  assert.equal(durum.merit, 0);
  assert.equal(durum.kaynaklar.puanDosyasi, "read");
});

test("eskiDurumOku: birikim=50 → tavan 15, risk düşülmez", async (t) => {
  const ev = geciciEv(t);
  const puanDosyasi = join(ev, "puan-durum.json");
  writeFileSync(puanDosyasi, JSON.stringify({ birikim: 50, risk: 20 }));
  const { eskiDurumOku } = await import("../tools/goc.mjs");

  const durum = eskiDurumOku({ puanDosyasi, scoreboardDosyasi: join(ev, "SCOREBOARD.md") });

  assert.equal(durum.yetki, 15);
  assert.equal(durum.eskiPuan, 50);
  assert.equal(durum.merit, 0);
});

test("eskiDurumOku: dosya yok → yetki=0, kaynak yok, throw yok", async (t) => {
  const ev = geciciEv(t);
  const { eskiDurumOku } = await import("../tools/goc.mjs");

  let durum;
  assert.doesNotThrow(() => {
    durum = eskiDurumOku({
      puanDosyasi: join(ev, "olmayan.json"),
      scoreboardDosyasi: join(ev, "olmayan.md"),
    });
  });

  assert.equal(durum.yetki, 0);
  assert.equal(durum.merit, 0);
  assert.equal(durum.kaynaklar.puanDosyasi, "missing");
  assert.equal(durum.kaynaklar.scoreboardDosyasi, "missing");
});

test("eskiDurumOku: bozuk JSON → yetki=0, kaynak bozuk", async (t) => {
  const ev = geciciEv(t);
  const puanDosyasi = join(ev, "puan-durum.json");
  writeFileSync(puanDosyasi, "{bu bozuk");
  const { eskiDurumOku } = await import("../tools/goc.mjs");

  const durum = eskiDurumOku({ puanDosyasi, scoreboardDosyasi: join(ev, "SCOREBOARD.md") });

  assert.equal(durum.yetki, 0);
  assert.equal(durum.kaynaklar.puanDosyasi, "corrupt");
});

test("gocOlayi: anahtar goc: + 16 hex, aynı girdi aynı anahtar", async (t) => {
  geciciEv(t);
  const { gocOlayi } = await import("../tools/goc.mjs");

  const ilk = gocOlayi({ onceki: { yetki: 107, merit: 0 }, simdi: 1_000 });
  const ikinci = gocOlayi({ onceki: { yetki: 107, merit: 0 }, simdi: 2_000 });

  assert.equal(ilk.tip, "goc");
  assert.equal(ilk.kaynak, "goc");
  assert.equal(ilk.delta, 107);
  assert.equal(ilk.merit, 0);
  assert.equal(ilk.ts, 1_000);
  assert.ok(ilk.anahtar.startsWith("goc:"));
  assert.equal(ilk.anahtar.length, 20);
  assert.match(ilk.anahtar, /^goc:[0-9a-f]{16}$/);
  assert.equal(ilk.anahtar, ikinci.anahtar);
});

test("gocYaz: kuru çalışma dosya oluşturmaz", async (t) => {
  const ev = geciciEv(t);
  const olayYolu = join(ev, "olaylar.jsonl");
  const { gocYaz } = await import("../tools/goc.mjs");

  const sonuc = gocYaz({
    olayYolu,
    onceki: { yetki: 107, merit: 0 },
    simdi: 1_000,
    kuruCalisma: true,
  });

  assert.equal(sonuc.yazildi, false);
  assert.equal(sonuc.rapor, "dry");
  assert.equal(existsSync(olayYolu), false);
});

test("gocYaz: yazar, ikinci aynı anahtar tekrar sayılır ve satır artmaz", async (t) => {
  const ev = geciciEv(t);
  const olayYolu = join(ev, "olaylar.jsonl");
  const { gocYaz } = await import("../tools/goc.mjs");

  const ilk = gocYaz({
    olayYolu,
    onceki: { yetki: 107, merit: 0 },
    simdi: 1_000,
    kuruCalisma: false,
  });
  assert.equal(ilk.yazildi, true);
  assert.equal(ilk.tekrar, false);
  assert.equal(ilk.rapor, "written");
  assert.equal(satirlariOku(olayYolu).length, 1);

  const ikinci = gocYaz({
    olayYolu,
    onceki: { yetki: 107, merit: 0 },
    simdi: 9_999,
    kuruCalisma: false,
  });
  assert.equal(ikinci.yazildi, false);
  assert.equal(ikinci.tekrar, true);
  assert.equal(ikinci.rapor, "duplicate");
  assert.equal(satirlariOku(olayYolu).length, 1);
});

test("günlükteki göç olayı durumHesapla ile beklenen yetkiyi verir", async (t) => {
  const ev = geciciEv(t);
  const olayYolu = join(ev, "olaylar.jsonl");
  const { gocYaz } = await import("../tools/goc.mjs");
  const { durumHesapla } = await import("../extensions/skor-model.mjs");

  gocYaz({
    olayYolu,
    onceki: { yetki: 107, merit: 0 },
    simdi: 1_000,
    kuruCalisma: false,
  });

  const durum = durumHesapla(satirlariOku(olayYolu), { simdi: 2_000 });

  assert.equal(durum.yetki, 107);
  assert.equal(durum.merit, 0);
});

test("main: --yaz yokken 0 döner ve olay dosyasına dokunmaz", async (t) => {
  const ev = geciciEv(t);
  const olayYolu = join(ev, "olaylar.jsonl");
  const { main } = await import("../tools/goc.mjs");

  const { kod, cikti } = await sessizMain(main, ["--olay", olayYolu]);

  assert.equal(kod, 0);
  assert.equal(existsSync(olayYolu), false);
  assert.match(cikti, /migration: authority=\d+ merit=0 source=score\((read|missing|corrupt)\) -> dry/);
});

test("main: --yaz ile yazar, ikinci çalıştırma tekrar bildirir", async (t) => {
  const ev = geciciEv(t);
  const puanDosyasi = join(ev, "puan-durum.json");
  const olayYolu = join(ev, "olaylar.jsonl");
  const scoreboardDosyasi = join(ev, "SCOREBOARD.md");
  writeFileSync(puanDosyasi, JSON.stringify({ puan: 107 }));
  writeFileSync(scoreboardDosyasi, "# Skor\n");
  const { main } = await import("../tools/goc.mjs");

  const ilk = await sessizMain(main, [
    "--olay",
    olayYolu,
    "--puan",
    puanDosyasi,
    "--scoreboard",
    scoreboardDosyasi,
    "--yaz",
  ]);
  assert.equal(ilk.kod, 0);
  assert.match(ilk.cikti, /migration: authority=15 merit=0 source=score\(read\) -> written/);
  assert.equal(satirlariOku(olayYolu).length, 1);

  const ikinci = await sessizMain(main, [
    "--olay",
    olayYolu,
    "--puan",
    puanDosyasi,
    "--scoreboard",
    scoreboardDosyasi,
    "--yaz",
  ]);
  assert.equal(ikinci.kod, 0);
  assert.match(ikinci.cikti, /-> duplicate/);
  assert.equal(satirlariOku(olayYolu).length, 1);
});

test("eskiDurumOku: scoreboard varsa okundu, yoksa yok", async (t) => {
  const ev = geciciEv(t);
  const puanDosyasi = join(ev, "puan-durum.json");
  const scoreboardDosyasi = join(ev, "SCOREBOARD.md");
  writeFileSync(puanDosyasi, JSON.stringify({ puan: 3 }));
  writeFileSync(scoreboardDosyasi, "# Skor\n");
  const { eskiDurumOku } = await import("../tools/goc.mjs");

  const varOlan = eskiDurumOku({ puanDosyasi, scoreboardDosyasi });
  const olmayan = eskiDurumOku({ puanDosyasi, scoreboardDosyasi: join(ev, "yok.md") });

  assert.equal(varOlan.kaynaklar.scoreboardDosyasi, "read");
  assert.equal(olmayan.kaynaklar.scoreboardDosyasi, "missing");
});
