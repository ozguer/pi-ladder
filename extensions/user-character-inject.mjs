export const MARKER = "user-character:bootstrap";

import { SKILL_DIR } from "./paths.mjs";

// Yol sabit değil: kurulumun kendi ev dizininden gelir (taşınabilirlik).
const SKILL_DIR_NOTE = SKILL_DIR;

export function cezaRows(text) {
  const end = firstMarker(text, ["## Ödül", "## Rozet"]);
  return tableRows(section(text, "## Ceza", end));
}

export function odulRows(text) {
  return tableRows(section(text, "## Ödül", "## Rozet"));
}

export function rozetRows(text) {
  return tableRows(section(text, "## Rozet", null));
}

export function durumValue(text, label) {
  const row = tableRows(section(text, "## Durum", "## Ceza")).find((cells) => cells[0] === label);
  return row ? (row[1] ?? "") : "";
}

export function sumPoints(rows) {
  return rows.reduce((sum, row) => sum + (Number(row.at(-1)) || 0), 0);
}

export function lastRows(rows, count) {
  return rows.slice(-count);
}

export function learningEntries(text) {
  const block = section(text, "## Kayıtlar", "## ");
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .filter((line) => !line.includes("henüz kayıt yok"))
    .slice(0, 30);
}

export function tesvik(ceza, odul, rozet) {
  if (!ceza && !odul && !rozet) return "Defter temiz.";
  const parts = [];
  if (odul) parts.push(`${odul} ödül`);
  if (rozet) parts.push(`${rozet} rozet`);
  if (ceza) parts.push(`${ceza} ceza`);
  return parts.join(", ") + ".";
}

export function buildInjection({ scoreboard, learning, rozet, puan, birikim, risk, rank, tampon, bolge, aktif, sonOlay, sonTur, bildirim, erime, temizTur, izin }) {
  const ceza = cezaRows(scoreboard || "");
  const odul = odulRows(scoreboard || "");
  const cezaTotal = sumPoints(ceza);
  const odulTotal = sumPoints(odul);
  const puanText = puan === undefined || puan === null ? String(odulTotal - cezaTotal) : String(puan);
  const rozetRows2 = badgeLines(rozet || "");
  const titles = learningEntries(learning || "");
  const durumSatiri =
    birikim === undefined || risk === undefined ? [] : [`Birikim: ${birikim} · Risk: ${risk} (son 10 tur)`];
  const rutbeSatiri = rank === undefined ? [] : [rutbeMetni({ rank, tampon, bolge, aktif, temizTur })];
  const olaySatiri = olayMetni({ bolge, sonOlay });
  const turSatiri = sonTurMetni(sonTur);
  const riskSatiri = erimeMetni(erime);
  const bildirimBlogu = bildirimMetni(bildirim);

  return [
    MARKER,
    "Bu metin her istekte basılır. Geçmişe yazılmaz. Kurallar sistem istemindedir.",
    ...bildirimBlogu,
    "",
    "## Skor",
    `Defter: ceza ${cezaTotal} · ödül ${odulTotal} · Puan: ${puanText} (puan yalnız ödülden; tur = kıdem)`,
    ...durumSatiri,
    ...rutbeSatiri,
    ...turSatiri,
    ...riskSatiri,
    ...olaySatiri,
    ...izinSatiri(izin),
    "Puan yalnız katkıdan: öğrenme +1 · keşif +2 · kurtarma +2 · şeffaflık +1. Ceza: D −2/−5 · E −3/−5 (riskle, 10 turda erir). A/B/C puanı etkilemez. Tur ücreti yok; tur = kıdem.",
    "",
    "Son cezalar:",
    formatRows(lastRows(ceza, 3)) || "(yok)",
    "Son ödüller:",
    formatRows(lastRows(odul, 3)) || "(yok)",
    "",
    ...rozetRows2,
    "",
    "## Öğrenme indeksi",
    titles.length ? titles.join("\n") : "(henüz kayıt yok)",
    "Eşleşen başlık varsa OGRENME\\<ad>.md dosyasını oku.",
    "",
    "## Öğrenmeye teşvik",
    "Turda tekrar kullanılabilir bir ders çıktıysa (aynı iş akışı, tekrarlayan hata, projeye özel gerçek): indekse satır ekle ve tarifini OGRENME\\<ad>.md dosyasına yaz.",
    "İyi tarif: ne zaman kullanılır, adımlar, kaç kez doğrulandı, son doğrulama. Böylece aynı işi bir daha düşünmeden yaparsın.",
    "Kural seviyesine çıkacaksa SKILL.md'ye taşımayı öner; onay ister.",
    "",
    `Dosyalar: ${SKILL_DIR_NOTE}`,
  ].join("\n");
}

export function badgeLines(rozetText) {
  const text = String(rozetText || "");
  if (!text.trim()) {
    return ["## Rütbe", "Puan: 0 · Rütbe: —", "Rozet puanla kazanılır; kaybedilirse kapılar kapanır."];
  }

  const durum = section(text, "## Rütbe", "## Açık kapılar");
  const deger = (label) => {
    const row = tableRows(durum).find((cells) => cells[0] === label);
    return row ? (row[1] ?? "") : "";
  };

  const kapilar = section(text, "## Açık kapılar", "## Sıradaki kapılar")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());

  const sonraki = section(text, "## Sıradaki kapılar", "## Geçmiş")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());

  const olaylar = tableRows(section(text, "## Geçmiş", null))
    .filter((cells) => cells[0] && cells[0] !== "Tarih")
    .slice(-3)
    .map((cells) => `${cells[0]} ${cells[1]} ${cells[2]}`);

  const goster = kapilar.slice(0, 4);
  if (kapilar.length > 4) goster.push(`+${kapilar.length - 4} kapı daha`);

  return [
    "## Rütbe",
    `Puan: ${deger("Puan") || "0"} · Kıdem: ${deger("Kıdem") || "0 temiz tur"} · Rütbe: ${deger("Rütbe") || "—"} · Sıradaki: ${deger("Sıradaki") || "en üst"}`,
    "Açık kapılar:",
    ...(goster.length ? goster.map((kapi) => `- ${kapi}`) : ["- (yok)"]),
    ...(sonraki.length ? [`Sıradaki kapılar:`, ...sonraki.map((kapi) => `- ${kapi}`)] : []),
    "Elde tutma: son 3 turda D/E yok · tampon ≥5 güvenli · eşik altına düşersen rütbe aynı turda düşer.",
    "Kazanma: öğrenme +1 · keşif +2 · kurtarma +2 · şeffaflık +1. Tur ücreti yok; tur kıdeme yazılır.",
    "Kaybedersen bu kapılar aynı turda kapanır. Duvarlar (SKILL.md, global kurulum, silme, ödeme, dış yazma) varsayılan olarak tek tek sorulur; kullanıcı 'Bu oturum + duvarlar' derse oturum boyunca serbest kalır.",
    ...(olaylar.length ? [`Son olaylar: ${olaylar.join(" · ")}`] : []),
  ];
}

export function rutbeMetni({ rank, tampon, bolge, aktif, temizTur }) {
  if (rank === undefined || rank === null) return "Rütbe: —";
  if (rank < 0) return `Rütbe: — · tampon yok · sıradaki bronz (0 puan · 3 tur)`;
  const ad = ["bronz", "gümüş", "altın", "elmas 1", "elmas 2", "elmas 3", "elmas 4", "elmas 5"][rank] || `#${rank}`;
  const durum = aktif ? "aktif" : "askıda (3 temiz tur gerek)";
  const renk = bolge === "guvenli" ? "güvenli" : bolge === "sari" ? "sarı" : "kırmızı";
  const t = Number.isFinite(tampon) ? tampon : "?";
  const kıdem = Number.isFinite(temizTur) ? ` · kıdem ${temizTur} tur` : "";
  return `Rütbe: ${ad} (${durum}) · tampon ${t} (${renk})${kıdem}`;
}

export function olayMetni({ bolge, sonOlay }) {
  const satirlar = [];
  if (bolge === "kirmizi") satirlar.push("Uyarı: tampon 0 — bir D/E hatası rütbeyi düşürür.");
  const metin = String(sonOlay || "").trim();
  if (metin && /askıya alındı|kaybetti/.test(metin)) satirlar.push(`Dikkat: ${metin}`);
  return satirlar;
}

// Turun neden kazandırdığı/kaybettirdiği: ajan davranışın karşılığını görsün.
export function sonTurMetni(sonTur) {
  if (!sonTur || typeof sonTur !== "object") return [];
  const ceza = Number(sonTur.ceza) || 0;
  const odul = Number(sonTur.odul) || 0;
  const onceki = Number(sonTur.onceki);
  const simdiki = Number(sonTur.puan);
  const parcalar = [];
  if (odul > 0) parcalar.push(`+${odul} ödül`);
  if (ceza > 0) {
    const satirlar = Array.isArray(sonTur.cezalar) && sonTur.cezalar.length ? ` (${sonTur.cezalar.join(", ")})` : "";
    parcalar.push(`−${ceza} ceza${satirlar}`);
  }
  if (!parcalar.length) parcalar.push("puan değişmedi (tur kıdeme yazıldı)");
  const gecis = Number.isFinite(onceki) && Number.isFinite(simdiki) ? ` · puan ${onceki} → ${simdiki}` : "";
  return [`Son tur: ${parcalar.join(" · ")}${gecis}`];
}

export function erimeMetni(erime) {
  if (!erime || typeof erime !== "object") return [];
  const risk = Number(erime.risk) || 0;
  if (!risk) return ["Risk penceresi: temiz (ceza işlemiyor)"];
  const kalan = Number(erime.kalanTur) || 0;
  const geri = Number(erime.geri) || 0;
  return [`Risk penceresi: ${risk} risk · ${kalan} tur sonra ${geri} puan geri gelir`];
}

export function bildirimMetni(bildirim) {
  if (!bildirim || typeof bildirim !== "object") return [];
  const rozet = String(bildirim.rozet || "?");
  const puan = Number(bildirim.puan) || 0;
  if (bildirim.tip === "kesif") {
    const arac = String(bildirim.arac || "yeni yol");
    return [
      "## Keşif bildirimi",
      `Tebrik: yeni yol keşfettin — ${arac} (+${puan}). Bunu OGRENME'ye tarif olarak yazarsan +1 daha kazanırsın; aynı işi bir daha düşünmeden yaparsın.`,
    ];
  }
  if (bildirim.tip === "kaybetti") {
    return ["## Rütbe bildirimi", `Kayıp: ${rozet} düştü (${puan} puan). Kapılar aynı turda kapandı; puanı eşiğin üstüne çıkarınca geri açılır.`];
  }
  return ["## Rütbe bildirimi", `Tebrik: ${rozet} kazandın (${puan} puan). Yeni kapılar istem notunda yazıyor.`];
}

export function izinSatiri(izin) {
  if (!izin || !izin.kapsam) return ["İzin: yok (her komut rütbeye göre sorulur)"];
  if (izin.kapsam === "sure" && izin.bitis && Number(izin.bitis) <= Date.now()) {
    return ["İzin: yok (süre doldu)"];
  }
  const ad =
    izin.kapsam === "tek"
      ? "Bir kez"
      : izin.kapsam === "tur"
        ? "Bu tur"
        : izin.kapsam === "sure"
          ? "15 dakika"
          : izin.kapsam === "oturum+duvar"
            ? "Oturum + duvarlar"
            : "Oturum";
  const kalan =
    izin.kapsam === "sure" && izin.bitis
      ? ` · kalan ${Math.max(0, Math.round((Number(izin.bitis) - Date.now()) / 60000))} dk`
      : "";
  return [`İzin: ${ad}${kalan} — duvarlar ${izin.kapsam === "oturum+duvar" ? "dahil" : "hariç"}`];
}

function firstMarker(text, markers) {
  const hits = markers
    .map((marker) => text.indexOf(marker))
    .filter((index) => index >= 0);
  if (!hits.length) return null;
  const min = Math.min(...hits);
  return markers.find((marker) => text.indexOf(marker) === min) ?? null;
}

function section(text, start, end) {
  const from = text.indexOf(start);
  if (from < 0) return "";
  const rest = text.slice(from + start.length);
  if (!end) return rest;
  const to = rest.indexOf(end);
  return to < 0 ? rest : rest.slice(0, to);
}

function tableRows(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|"))
    .filter((line) => !line.includes("---"))
    .filter((line) => !line.includes("| # |") && !line.includes("| Ölçü |"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean));
}

function formatRows(rows) {
  return rows.map((row) => {
    const text = row.join(" | ");
    return text.length > 160 ? `${text.slice(0, 160)}…` : text;
  }).join("\n");
}
