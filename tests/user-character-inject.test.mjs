import assert from "node:assert/strict";
import test from "node:test";
import { buildInjection, sumPoints, cezaRows, badgeLines, tesvik, learningEntries, olayMetni, bildirimMetni, sonTurMetni, erimeMetni, izinSatiri } from "../extensions/user-character-inject.mjs";

const scoreboard = `# Skorboard
## Durum
| Ölçü | Değer |
|---|---|
| Toplam ceza | 14 |
| Toplam ödül | 2 |
## Ceza
| # | Tarih | Grup | Derece | Kural | İhlal | Kanıt | Puan |
|---|---|---|---|---|---|---|---|
| 1 | 2026-11-18 | C | 2 | Eski | ilk | eski kanıt bir | 2 |
| 2 | 2026-11-18 | C | 2 | Eski | iki | eski kanıt iki | 2 |
| 3 | 2026-11-18 | C | 3 | Eski | üç | eski kanıt üç | 3 |
| 4 | 2026-11-18 | C | 1 | Eski | dört | eski kanıt dört | 1 |
| 5 | 2026-11-18 | C | 1 | Eski | beş | eski kanıt beş | 1 |
| 6 | 2026-11-19 | A | 5 | Yeni | altı | yeni kanıt altı | 5 |
## Ödül
| # | Tarih | Grup | Derece | Ne işe yaradı | Kanıt | Puan |
|---|---|---|---|---|---|---|
| 1 | 2026-11-19 | A | 2 | doğru yol | ödül kanıtı | 2 |
`;

const learning = `# Öğrenme indeksi

## Kayıtlar

- kurulum-onayi — onay akışı adımları — OGRENME/kurulum-onayi.md
- rust-kapisi — Rust kalite kapısı — OGRENME/rust-kapisi.md

## Kayıt ekleme kuralı

- Bu satır indekse girmemeli.
`;

const rozet = `# Rozetler
## Rütbe

| Alan | Değer |
|---|---|
| Puan | 6 |
| Rütbe | bronz |
| Sıradaki | gümüş (9 puan kaldı) |

## Açık kapılar

- tek dosyada geri alınabilir düzenleme onaysız (turda 1)

Kaybedersen bu kapılar aynı turda kapanır.

## Geçmiş

| Tarih | Olay | Rozet | Puan | Sebep |
|---|---|---|---|---|
| 2026-11-19 | kazandı | bronz | 5 | eşik geçildi |
`;

test("ceza puanını satırlardan toplar, başlığa bakmaz", () => {
  assert.equal(sumPoints(cezaRows(scoreboard)), 14);
});

test("rozet geçmişi okunur", () => {
  const text = badgeLines(rozet);
  assert.match(text.join("\n"), /Rütbe: bronz/);
  assert.match(text.join("\n"), /tek dosyada/);
  assert.match(text.join("\n"), /kazandı bronz/);
});

test("özet skoru ve öğrenme indeksini taşır; en eskisini taşımaz", () => {
  const text = buildInjection({ scoreboard, learning, rozet });
  assert.match(text, /user-character:bootstrap/);
  assert.match(text, /Kurallar sistem istemdedir|Kurallar sistem istemindedir/);
  assert.match(text, /Defter: ceza 14 .* Puan: -12/);
  assert.match(text, /Rütbe: bronz/);
  assert.match(text, /Kaybedersen bu kapılar/);
  assert.match(text, /yeni kanıt altı/);
  assert.doesNotMatch(text, /eski kanıt bir/);
  assert.match(text, /kurulum-onayi/);
  assert.match(text, /rust-kapisi/);
  assert.doesNotMatch(text, /Bu satır indekse girmemeli/);
});

test("boş defter temiz der", () => {
  assert.equal(tesvik(0, 0, 0), "Defter temiz.");
});

test("eksik dosya fırlatmaz", () => {
  const text = buildInjection({ scoreboard: "", learning: "" });
  assert.match(text, /user-character:bootstrap/);
  assert.match(text, /henüz kayıt yok/);
});

test("öğrenme indeksi en fazla 30 satır", () => {
  const lines = Array.from({ length: 40 }, (_, i) => `- kayit-${i} — aciklama — OGRENME/kayit-${i}.md`);
  const text = `## Kayıtlar\n\n${lines.join("\n")}\n`;
  assert.equal(learningEntries(text).length, 30);
});

test("bölge uyarısı, askı notu ve rütbe bildirimi", () => {
  assert.match(olayMetni({ bolge: "kirmizi" }).join(" "), /Uyarı: tampon 0/);
  assert.deepEqual(olayMetni({ bolge: "sari", sonOlay: "kazandı bronz (5 puan)" }), []);
  assert.match(olayMetni({ bolge: "sari", sonOlay: "askıya alındı bronz (8 puan)" }).join(" "), /Dikkat: askıya alındı/);
  assert.deepEqual(olayMetni({ bolge: "guvenli" }), []);

  assert.match(bildirimMetni({ tip: "kazandi", rozet: "altın", puan: 33 }).join(" "), /Tebrik: altın kazandın/);
  assert.match(bildirimMetni({ tip: "kaybetti", rozet: "altın", puan: 27 }).join(" "), /Kayıp: altın düştü/);
  assert.match(bildirimMetni({ tip: "kesif", arac: "Playwright MCP", puan: 2 }).join(" "), /yeni yol keşfettin — Playwright MCP/);
  assert.deepEqual(bildirimMetni(undefined), []);
});

test("izin satırı kapsamı ve duvar durumunu yazar", () => {
  assert.match(izinSatiri(undefined).join(" "), /İzin: yok/);
  assert.match(izinSatiri({ kapsam: "oturum" }).join(" "), /Oturum — duvarlar hariç/);
  assert.match(izinSatiri({ kapsam: "oturum+duvar" }).join(" "), /duvarlar dahil/);
  assert.match(izinSatiri({ kapsam: "tur" }).join(" "), /Bu tur/);
  assert.match(izinSatiri({ kapsam: "sure", bitis: Date.now() - 1000 }).join(" "), /İzin: yok/);
});

test("son tur ve risk penceresi satırları", () => {
  assert.match(sonTurMetni({ credit: 1, ceza: 0, odul: 0, onceki: 32, puan: 33 }).join(" "), /puan 32 → 33/);
  assert.match(sonTurMetni({ ceza: 0, odul: 1, onceki: 20, puan: 21 }).join(" "), /\+1 ödül/);
  assert.match(sonTurMetni({ ceza: 2, odul: 0, onceki: 20, puan: 20 }).join(" "), /−2 ceza/);
  assert.deepEqual(sonTurMetni(undefined), []);

  assert.match(erimeMetni({ risk: 0 }).join(" "), /temiz/);
  assert.match(erimeMetni({ risk: 3, kalanTur: 4, geri: 6 }).join(" "), /4 tur sonra 6 puan/);
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
