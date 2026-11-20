import assert from "node:assert/strict";
import test from "node:test";
import { buildInjection, sumPoints, cezaRows, badgeLines, tesvik, learningEntries, olayMetni, bildirimMetni, sonTurMetni, erimeMetni, izinSatiri } from "../extensions/user-character-inject.mjs";

const scoreboard = `# Scoreboard
## State
| Metric | Value |
|---|---|
| Total penalties | 14 |
| Total rewards | 2 |
## Penalties
| # | Date | Group | Degree | Rule | Violation | Evidence | Points |
|---|---|---|---|---|---|---|---|
| 1 | 2026-11-18 | C | 2 | Eski | ilk | eski kanıt bir | 2 |
| 2 | 2026-11-18 | C | 2 | Eski | iki | eski kanıt iki | 2 |
| 3 | 2026-11-18 | C | 3 | Eski | üç | eski kanıt üç | 3 |
| 4 | 2026-11-18 | C | 1 | Eski | dört | eski kanıt dört | 1 |
| 5 | 2026-11-18 | C | 1 | Eski | beş | eski kanıt beş | 1 |
| 6 | 2026-11-19 | A | 5 | Yeni | altı | yeni kanıt altı | 5 |
## Rewards
| # | Date | Group | Degree | Reason | Evidence | Points |
|---|---|---|---|---|---|---|
| 1 | 2026-11-19 | A | 2 | doğru yol | ödül kanıtı | 2 |
`;

const learning = `# Learning index

## Records

- kurulum-onayi — onay akışı adımları — OGRENME/kurulum-onayi.md
- rust-kapisi — Rust kalite kapısı — OGRENME/rust-kapisi.md

## Add rule

- Bu satır indekse girmemeli.
`;

const rozet = `# Badges
## Rank

| Metric | Value |
|---|---|
| Points | 6 |
| Rank | bronze |
| Next | silver (9 points remaining) |

## Open gates

- tek dosyada geri alınabilir düzenleme onaysız (turda 1)

If you lose it, these gates close in the same turn.

## History

| Date | Event | Badge | Points | Reason |
|---|---|---|---|---|
| 2026-11-19 | kazandı | bronz | 5 | eşik geçildi |
`;

test("ceza puanını satırlardan toplar, başlığa bakmaz", () => {
  assert.equal(sumPoints(cezaRows(scoreboard)), 14);
});

test("rozet geçmişi okunur", () => {
  const text = badgeLines(rozet);
  assert.match(text.join("\n"), /Rank: bronze/);
  assert.match(text.join("\n"), /tek dosyada/);
  assert.match(text.join("\n"), /kazandı bronz/);
});

test("özet skoru ve öğrenme indeksini taşır; en eskisini taşımaz", () => {
  const text = buildInjection({ scoreboard, learning, rozet });
  assert.match(text, /user-character:bootstrap/);
  assert.match(text, /Rules live in the system prompt/);
  assert.match(text, /Ledger: penalties 14 .* Points: -12/);
  assert.match(text, /Rank: bronze/);
  assert.match(text, /If you lose it, these gates close/);
  assert.match(text, /yeni kanıt altı/);
  assert.doesNotMatch(text, /eski kanıt bir/);
  assert.match(text, /kurulum-onayi/);
  assert.match(text, /rust-kapisi/);
  assert.doesNotMatch(text, /Bu satır indekse girmemeli/);
});

test("boş defter temiz der", () => {
  assert.equal(tesvik(0, 0, 0), "Ledger clean.");
});

test("eksik dosya fırlatmaz", () => {
  const text = buildInjection({ scoreboard: "", learning: "" });
  assert.match(text, /user-character:bootstrap/);
  assert.match(text, /no entries yet/);
});

test("öğrenme indeksi en fazla 30 satır", () => {
  const lines = Array.from({ length: 40 }, (_, i) => `- kayit-${i} — aciklama — OGRENME/kayit-${i}.md`);
  const text = `## Records\n\n${lines.join("\n")}\n`;
  assert.equal(learningEntries(text).length, 30);
});

test("bölge uyarısı, askı notu ve rütbe bildirimi", () => {
  assert.match(olayMetni({ bolge: "kirmizi" }).join(" "), /Warning: buffer 0/);
  assert.deepEqual(olayMetni({ bolge: "sari", sonOlay: "kazandı bronz (5 puan)" }), []);
  assert.match(olayMetni({ bolge: "sari", sonOlay: "suspended bronze (8 points)" }).join(" "), /Attention: suspended/);
  assert.deepEqual(olayMetni({ bolge: "guvenli" }), []);

  assert.match(bildirimMetni({ tip: "kazandi", rozet: "altın", puan: 33 }).join(" "), /Congrats: you earned altın/);
  assert.match(bildirimMetni({ tip: "kaybetti", rozet: "altın", puan: 27 }).join(" "), /Loss: altın dropped/);
  assert.match(bildirimMetni({ tip: "kesif", arac: "Playwright MCP", puan: 2 }).join(" "), /you found a new path — Playwright MCP/);
  assert.deepEqual(bildirimMetni(undefined), []);
});

test("izin satırı kapsamı ve duvar durumunu yazar", () => {
  assert.match(izinSatiri(undefined).join(" "), /Grant: none/);
  assert.match(izinSatiri({ kapsam: "oturum" }).join(" "), /This session — walls excluded/);
  assert.match(izinSatiri({ kapsam: "oturum+duvar" }).join(" "), /walls included/);
  assert.match(izinSatiri({ kapsam: "tur" }).join(" "), /This turn/);
  assert.match(izinSatiri({ kapsam: "sure", bitis: Date.now() - 1000 }).join(" "), /Grant: none/);
});

test("son tur ve risk penceresi satırları", () => {
  assert.match(sonTurMetni({ credit: 1, ceza: 0, odul: 0, onceki: 32, puan: 33 }).join(" "), /points 32 → 33/);
  assert.match(sonTurMetni({ ceza: 0, odul: 1, onceki: 20, puan: 21 }).join(" "), /\+1 rewards/);
  assert.match(sonTurMetni({ ceza: 2, odul: 0, onceki: 20, puan: 20 }).join(" "), /−2 penalties/);
  assert.deepEqual(sonTurMetni(undefined), []);

  assert.match(erimeMetni({ risk: 0 }).join(" "), /clean/);
  assert.match(erimeMetni({ risk: 3, kalanTur: 4, geri: 6 }).join(" "), /4 turns later 6 points/);
  assert.deepEqual(erimeMetni(undefined), []);
});

test("not yeni modelle çelişmiyor", () => {
  const text = buildInjection({
    scoreboard: "",
    learning: "",
    rozet: "",
    puan: 24,
    birikim: 24,
    risk: 0,
    rank: 4,
    tampon: 2,
    bolge: "sari",
    aktif: true,
    temizTur: 74,
  });
  assert.doesNotMatch(text, /cezasız iş turu \+1/);
  assert.doesNotMatch(text, /her rütbede onaylı/);
  assert.doesNotMatch(text, /bronz 5 puan/);
  assert.deepEqual(erimeMetni(undefined), []);
});
