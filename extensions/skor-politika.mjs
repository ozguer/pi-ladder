export const POLITIKA = {
  esikler: [0, 5, 15, 30, 50, 75, 105, 140],
  meritEsikleri: [
    { ad: "Kıvılcım", merit: 10 },
    { ad: "İz", merit: 25 },
    { ad: "Pusula", merit: 45 },
    { ad: "Fener", merit: 70 },
    { ad: "Bilge", merit: 100 },
  ],
  ceza: { D: 2, E: 3, E5: 5 },
  odul: { ogrenme: 1, kesif: 2, kurtarma: 2, seffaflik: 1 },
  tavan: { yetkiGun: 3, meritGun: 3, istekMerit: 2 },
};

const RUTBE_ADLARI = ["bronz", "gümüş", "altın", "elmas 1", "elmas 2", "elmas 3", "elmas 4", "elmas 5"];

const sayi = (deger) => {
  const n = Number(deger);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

export function rutbeAdi(i) {
  const n = Number(i);
  if (!Number.isInteger(n) || n < 0 || n >= RUTBE_ADLARI.length) return "—";
  return RUTBE_ADLARI[n];
}

export function kazanilanRozet(merit) {
  const m = Number(merit);
  if (!Number.isFinite(m)) return null;
  let ad = null;
  for (const rozet of POLITIKA.meritEsikleri) {
    if (rozet.merit > m) break;
    ad = rozet.ad;
  }
  return ad;
}

export function sonrakiRozet(merit) {
  const m = Number(merit);
  const taban = Number.isFinite(m) ? m : 0;
  for (const rozet of POLITIKA.meritEsikleri) {
    if (rozet.merit > taban) return { ad: rozet.ad, merit: rozet.merit };
  }
  return null;
}

function yetkiIndeksi(rank, yetki) {
  const r = Number(rank);
  if (Number.isInteger(r) && r >= 0 && r < POLITIKA.esikler.length) return r;
  let index = 0;
  for (let i = 0; i < POLITIKA.esikler.length; i += 1) {
    if (POLITIKA.esikler[i] <= yetki) index = i;
  }
  return index;
}

export function notMetni({ yetki = 0, merit = 0, rank, aktif = true, son, izin, gunluk } = {}) {
  const y = sayi(yetki);
  const m = sayi(merit);
  const gunlukVeri = gunluk || {};
  const isBirimi = sayi(gunlukVeri.isBirimi);
  const tavan = sayi(gunlukVeri.tavan ?? POLITIKA.tavan.yetkiGun);
  const tekrar = sayi(gunlukVeri.tekrar);

  const ri = yetkiIndeksi(rank, y);
  const sonrakiRutbeVar = ri + 1 < POLITIKA.esikler.length;
  const sonrakiRutbe = sonrakiRutbeVar ? rutbeAdi(ri + 1) : "—";
  const yetkiKalan = sonrakiRutbeVar ? Math.max(0, POLITIKA.esikler[ri + 1] - y) : 0;

  const kazanilan = kazanilanRozet(m);
  const rozet = kazanilan ?? "yok";
  const rozetEsigi = kazanilan ? POLITIKA.meritEsikleri.find((r) => r.ad === kazanilan).merit : 0;
  const sonraki = sonrakiRozet(m);
  const sonrakiRozetMetni = sonraki ? `${sonraki.ad} (${sonraki.merit})` : "—";
  const meritKalan = sonraki ? Math.max(0, sonraki.merit - m) : 0;

  const sonMetin = son === undefined || son === null || son === "" ? "—" : String(son);
  const duzeltmesiz = /^\+\d/.test(sonMetin.trim()) ? " (düzeltmesiz)" : "";
  const izinMetin = izin === undefined || izin === null || izin === "" ? "yok" : String(izin);

  return [
    `Yetki ${y} (${rutbeAdi(ri)}) · sıradaki ${sonrakiRutbe}: ${yetkiKalan} · bugün ${isBirimi}/${tavan} iş birimi`,
    `Merit ${m} · rozet ${rozet} (${rozetEsigi}) · sıradaki ${sonrakiRozetMetni}: ${meritKalan} · tekrar: ${tekrar}`,
    `Durum: ${aktif ? "aktif" : "pasif"} · son istek: ${sonMetin}${duzeltmesiz}`,
    `İzin: ${izinMetin}`,
    "Kaybedersen: kapılar aynı istekte kapanır; 3 temiz istekte geri gelir",
    "Kazanma: düzeltmesiz istek +1 yetki · öğrenme +1 · keşif +2 · kurtarma +2",
  ].join("\n");
}
