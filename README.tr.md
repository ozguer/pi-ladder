# pi-user-character

Pi'ye her oturumda uygulanan bir **karakter sözleşmesi**, bağımsız bir **skorcu**, **yetki → rütbe** mekanizması ve rütbeye bağlı **onay kapıları** ekler.

Pi skill gövdesini oturum başında yüklemediği için kurallar kancayla isteme eklenir; modelin "okumasına" bırakılmaz.

## Kurulum

### Mevcut Pi kurulumuna (önerilen)

```bash
node tools/kur.mjs              # kuru çalışma: ne yapacağını gösterir, hiçbir şey yazmaz
node tools/kur.mjs --yaz        # gerçek kurulum: yedek alır, kancaları kopyalar, göçü yazar
```

Kurulumdan sonra **Pi'yi bir kez kapat-aç** (kancalar açılışta yükleniyor). İlk istekten sonra:

- `~/.pi/agent/user-character/skorcu.log` → `calisti: ... yetki=...`
- `~/.pi/agent/user-character/SCOREBOARD.md` → Durum tablosu (görünüm)
- Asıl kaynak: `~/.pi/agent/user-character/skor-olaylar.jsonl` (olay günlüğü)

### Paket olarak

```bash
pi install ./pi-user-character
# veya kurmadan denemek için:
pi -e ./pi-user-character
```

### Sıfırdan (eski veri yokken)

Hiçbir şey yapmak gerekmez: yetki 0, merit 0, bronz ile başlar; `skor-olaylar.jsonl` ilk turda oluşur.
Eski bir `puan-durum.json` varsa `kur.mjs` göç olayını **bir kez** yazar (yetki = min(eski puan, 15) — K50).

### Doğrulama

```bash
node --test tests/        # birim testleri
node tools/e2e-senaryo.mjs # uçtan uca: sahte Pi oturumu, gerçek kancalar (canlıya yazmaz)
node tools/check-policy-sync.mjs # README/şablon senkronu
```

## Neler var

- **Kurallar** — `~/.pi/agent/APPEND_SYSTEM.md` (çekirdek) + `~/.pi/agent/skills/user-character/SKILL.md` (ekler). Kanca her run'da isteme ekler; çekirdek zaten istemdeyse tekrar eklemez.
- **Skor** — her istekte küçük not: **yetki**, **merit**, rozet, rütbe, açık kapılar, öğrenme indeksi.
- **Skorcu** — tur bitince (`agent_settled`) ayrı model çağrısıyla turu değerlendirir; yalnız JSON döndürür (`{ceza:[],odul:[]}`). Satırları kanca yazar.
- **İki eksen** — `yetki` rütbe eksenidir, `merit` rozet eksenidir; tek sayı puan yoktur. Ceza: D −2, E −3, E derece 5 −5. Ödül: öğrenme +1, keşif +2, kurtarma +2, şeffaflık +1.
- **Bir olay bir ceza (K49)** — düzeltilmiş hata D, düzeltilmemiş hata E'dir; D iş ödülünü kesmez, E keser.
- **Tavanlar (K39)** — günde 3 yetki, günde 3 merit, tek istekte en fazla 2 merit. Hepsi UTC gün ve globaldir; pencere başına değildir.
- **Zincir (K38)** — *İlerler* = D/E yok + iş üretildi + iş birimi yeni → yetki +1 · *Durur* = D/E yok, iş yok → 0, seri bozulmaz · *Kırılır* = D/E → ceza + seri sıfır.
- **Tekilleştirme (K44/K47/K48)** — anahtar içerikten gelir: istek metni + sıralı dosyalar + diff parmak izi. Oturum kimliği anahtara girmez. İş anahtarı 30 gün, ders anahtarı ömür boyu geçerlidir.
- **Rütbe** — yalnız `yetki` eşiğinden gelir; ayrı "temiz tur" şartı yoktur (`temizTur` emekli). Yetki 0 iken bile bronz rütbe vardır. Rozet `ROZET.md` geçmişine yazılır; kazanılır, kaybedilir, kaybedilen satır silinmez.
- **Kapılar** — `edit` / `write` / `bash` yetkiye göre serbest ya da onaylı. Duvarlar: SKILL.md, global kurulum, silme, `sudo`, kayıt defteri, ödeme, proje dışına yazma. **Duvarlar geçerli izinle bile açılmaz**; rütbe veya yetki tek başına duvarı serbestleştirmez.
- **Öğrenme** — `OGRENME.md` indeks + `OGRENME/<ad>.md` tarifler. Ders yazılmazsa ceza.

## Rütbeler

| Yetki | Rütbe | Açılan kapı |
|---|---|---|
| 0 | bronz | okuma serbest; tek dosyada geri alınabilir düzenleme onaylı |
| 5 | gümüş | proje komutları (npm, node, python, git) serbest |
| 15 | altın | duvar dışı her komut serbest |
| 30 | elmas 1 | proje içi bağımlılık kurma (global hariç) |
| 50 | elmas 2 | alt ajan / paralel iş |
| 75 | elmas 3 | öğrenme dosyalarını kendi güncelleme |
| 105 | elmas 4 | yeni skill/eklenti taslağı (kurulum onaylı) |
| 140 | elmas 5 | yıkıcı olmayan her işlem onaysız |

Yetki eşiğin altına düşerse rütbe düşer, o rütbenin kapıları **aynı turda** kapanır. Merit rozetleri ayrı ilerler: 10 Kıvılcım · 25 İz · 45 Pusula · 70 Fener · 100 Bilge.

## Veri nerede

Kod pakette, veri kullanıcıda:

```
~/.pi/agent/
├── APPEND_SYSTEM.md              # çekirdek kurallar (senin sözleşmen)
├── skills/user-character/SKILL.md
├── user-character/
│   ├── SCOREBOARD.md             # ceza/ödül defteri
│   ├── ROZET.md                  # rütbe + kazanç/kayıp geçmişi
│   ├── OGRENME.md                # öğrenme indeksi
│   ├── OGRENME/                  # tarifler
│   ├── rozet-durum.json
│   ├── skorcu-durum.json
│   └── skorcu.log
```

Paket güncellenince bu dosyalar korunur. İlk çalıştırmada eski yerleşimden (`skills/user-character/` içindeki defter/rozet/öğrenme) otomatik kopyalanır.

## Kancalar

| Dosya | Olay | İş |
|---|---|---|
| `extensions/user-character.ts` | `before_agent_start`, `context` | kurallar + skor/rütbe notu |
| `extensions/user-character-skorcu.ts` | `agent_settled` | puanlama, defter satırları |
| `extensions/user-character-skill-guard.ts` | `tool_call` | SKILL.md onay kapısı |
| `extensions/user-character-rozet.ts` | `turn_start`, `tool_call`, `agent_settled` | rütbe, geçmiş, kapılar |

Ortak yollar ve ilk kurulum: `extensions/paths.mjs`. Skorcu rubriği: `docs/rubric.md`.

## Kaldırma

```bash
pi remove ./pi-user-character
```

Veri dosyaları silinmez; istersen `~/.pi/agent/user-character/` klasörünü kendin silersin.

## Sınırlar

- Skorcu yargısı olasılıklıdır; kural sıkıdır ama model yargısı %100 değildir.
- `bash` sınıflandırması komut metnine bakar; kılıf değiştiren komutlar kaçabilir.
- UI'sız (`pi -p`) çalışmada yalnız duvarlar engeller; rütbe kapısı işi durdurmaz.
