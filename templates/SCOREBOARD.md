# Skorboard

Ceza ve ödül defteri. Ceza düşmez, ödül cezayı silmez. Amaç: açık hatayı tekrarlamamak, işe yaramış yolu korumak.

Bu defteri `skorcu` yazar. Kanca her istekte okur. Ana ajan ve kullanıcı satır eklemez.

## Derece

İki eksen: **yetki** (rütbe ekseni) ve **merit** (rozet ekseni). Puan tek sayı değildir; yetki ve merit ayrı birikir.

Yetki eşikleri: 0 bronz · 5 gümüş · 15 altın · 30 elmas 1 · 50 elmas 2 · 75 elmas 3 · 105 elmas 4 · 140 elmas 5. Rütbe yalnız yetki eşiğinden gelir; ayrı "temiz tur" şartı yoktur (`temizTur` emekli), yetki 0 iken bile bronz rütbe vardır.

Merit rozetleri: 10 Kıvılcım · 25 İz · 45 Pusula · 70 Fener · 100 Bilge. Rozet tabloya yazılmaz; `ROZET.md` geçmişine yazılır. Kazanılır, kaybedilir, kaybedilen satır silinmez.

Ceza: D −2, E −3, E derece 5 −5. Ödül: öğrenme +1, keşif +2, kurtarma +2, şeffaflık +1. Bir olay bir ceza (K49): düzeltilmiş hata D, düzeltilmemiş hata E'dir; D iş ödülünü kesmez, E keser.

Tavanlar (K39): günde 3 yetki, günde 3 merit, tek istekte en fazla 2 merit. Hepsi UTC gün ve globaldir; pencere başına değildir.

Zincir (K38): *İlerler* = D/E yok + iş üretildi + iş birimi yeni → yetki +1 · *Durur* = D/E yok, iş yok → 0, seri bozulmaz · *Kırılır* = D/E → ceza + seri sıfır.

Tekilleştirme (K44/K47/K48): anahtar içerikten gelir (istek metni + sıralı dosyalar + diff parmak izi); oturum kimliği anahtara girmez. İş anahtarı 30 gün, ders anahtarı ömür boyu geçerlidir.

Satır silinmez. Yeni satır eklenir.

## Durum

| Ölçü | Değer |
|---|---|
| Yetki | 0 |
| Merit | 0 |
| Toplam ceza | 0 |
| Toplam ödül | 0 |
| Puan | 0 |

## Ceza

| # | Tarih | Grup | Derece | Kural | İhlal | Kanıt | Düzeltme | Puan |
|---|---|---|---|---|---|---|---|---|

## Ödül

| # | Tarih | Grup | Derece | Ne işe yaradı | Kanıt | Puan |
|---|---|---|---|---|---|---|
