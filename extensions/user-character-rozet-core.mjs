// Rozet/rütbe çekirdek mantığı — saf fonksiyonlar, yan etki yok.
// Puan defterden gelir (ödül − ceza). Rütbe puanın karşılığıdır; rozet deftere yazılmaz.

export const RANKS = [
  { name: "bronz", puan: 0, tur: 3, kapi: "turda 1 dosya · okuma komutları serbest" },
  { name: "gümüş", puan: 3, tur: 8, kapi: "turda 2 dosya · proje komutları (python/node/ego-browser) serbest" },
  { name: "altın", puan: 8, tur: 20, kapi: "turda 3 dosya · duvar dışı her komut serbest" },
  { name: "elmas 1", puan: 15, tur: 40, kapi: "turda 5 dosya · duvarlar oturumluk açılabilir" },
  { name: "elmas 2", puan: 22, tur: 60, kapi: "turda 8 dosya · alt ajan onaysız" },
  { name: "elmas 3", puan: 30, tur: 80, kapi: "turda sınırsız dosya · varsayılan onay: 15 dakika" },
  { name: "elmas 4", puan: 40, tur: 100, kapi: "yeni skill/eklenti taslağı (kurulum onaylı)" },
  { name: "elmas 5", puan: 50, tur: 120, kapi: "yıkıcı olmayan her işlem onaysız" },
];

const TEHLIKELI = [
  /\b(rm|del|erase|rmdir|rd|format|mkfs|dd|sudo|winget|choco|shutdown|taskkill|Stop-Process)\b/i,
  /(rmtree|rmSync|unlink|rimraf|os\.remove|shutil\.)/i,
  /\bRemove-Item\b/i,
  /\bgit\s+clean\b/i,
  /\bnpm\s+(i|install|add)\s+(-g|--global)\b/i,
  /\bpip3?\s+install\b/i,
  /\b(reg\s+add|setx)\b/i,
  /\|\s*(bash|sh|iex|powershell)\b/i,
  /(curl|iwr|wget)[^\n]*&&[^\n]*(sh|bash|iex)\b/i,
];

// Proje komutları: kod ajanının günlük araçları (gümüşten itibaren serbest).
const PROJE_KOMUT = [
  /^\s*(python|python3|py|node|bun|deno|npx|ego-browser)\b/i,
  /^\s*(npm|pnpm|yarn)\s+run\b/i,
];

// Yol proje kökünün içinde mi? Sınır duyarlı: C:\proj, C:\proj-evil'i kapsamaz.
export function yolProjeIcinde(cwd, yol) {
  if (!cwd || !yol) return true;
  const normalize = (value) => {
    const parcalar = String(value).replace(/\//g, "\\").split("\\");
    const yigin = [];
    for (const parca of parcalar) {
      if (!parca || parca === ".") continue;
      if (parca === "..") yigin.pop();
      else yigin.push(parca.toLowerCase());
    }
    return yigin.join("\\");
  };
  const kok = normalize(cwd);
  const hedef = normalize(yol.startsWith("\\") || /^[A-Za-z]:/.test(yol) ? yol : String(cwd) + "\\" + yol);
  return hedef === kok || hedef.startsWith(kok + "\\");
}

const YAZMA_HEDEFI = /(?:>>?|\bSet-Content\s+|\bOut-File\s+|\s-o\s+|\s--output\s+)\s*"?([A-Za-z]:[\\/][^"\s]+|\/[^\s"]+)/g;

// Komuttaki her yazma hedefi proje içinde olmalı.
function projeDisiYazma(command, cwd) {
  if (!cwd) return false;
  for (const match of String(command).matchAll(YAZMA_HEDEFI)) {
    if (!yolProjeIcinde(cwd, match[1])) return true;
  }
  return false;
}

const OKUMA = [
  /^\s*git\s+(status|diff|log|show|branch|ls-files|rev-parse)\b/i,
  /^\s*(ls|dir|cat|type|rg|grep|find|Get-ChildItem|Get-Content|Select-String)\b/i,
  /^\s*(node|bun)\s+--test\b/i,
  /^\s*(npm|pnpm|yarn)\s+(test|run\s+(test|build|lint))\b/i,
  /^\s*(npx\s+)?(tsc|eslint|prettier)\b/i,
];

const GIT_YAZMA = /^\s*git\s+(add|commit|switch|checkout\s+-b|branch)\b/i;
const KURULUM = /^\s*(npm|pnpm|yarn)\s+(i|install|add)\b/i;

// Kapıya hiç takılmayan araçlar: yalnız okuma ve soru. Geri kalan her araç onay ister
// (tarayıcı, alt ajan, MCP eylemleri dahil), toplu onay kapsamı bunları da serbest bırakır.
const SERBEST_ARACLAR = new Set(["read", "grep", "glob", "ls", "find", "list", "webfetch", "websearch", "todo", "skill", "question", "ask", "notify"]);

const TURDA_DOSYA = { "-1": 0, 0: 1, 1: 2, 2: 3, 3: 5, 4: 8, 5: 99, 6: 99, 7: 99 };

// Onay kapsamı: tek seferlik, bu tur, 15 dakika, oturum.
export const KAPSAM = [
  { id: "tek", ad: "Bir kez" },
  { id: "tur", ad: "Bu tur" },
  { id: "sure", ad: "15 dakika" },
  { id: "oturum", ad: "Bu oturum" },
  { id: "oturum+duvar", ad: "Bu oturum + duvarlar" },
];

export const SURE_MS = 15 * 60 * 1000;

// Rütbe yükseldikçe varsayılan onay kapsamı genişler: sürtünme erdemle azalır.
export function varsayilanKapsam(rank) {
  if (rank < 2) return "tek";
  if (rank < 4) return "tur";
  if (rank < 7) return "sure";
  return "oturum";
}

export function kapsamOlustur(scope, { turnId, now = Date.now() } = {}) {
  if (!scope || scope === "tek") return null;
  if (scope === "sure") return { scope, turnId, expiresAt: now + SURE_MS };
  return { scope, turnId, expiresAt: null };
}

export function kapsamGecerli(grant, { turnId, now = Date.now(), wall = false } = {}) {
  if (!grant || !grant.scope) return false;
  if (wall) return grant.scope === "oturum+duvar";
  if (grant.scope === "tur") return grant.turnId === turnId;
  if (grant.scope === "sure") return now < (Number(grant.expiresAt) || 0);
  if (grant.scope === "oturum" || grant.scope === "oturum+duvar") return true;
  return false;
}

// Menü seçenekleri: duvar onayı için beşinci kapsam yalnız altın ve üstünde.
export function kapsamSecenekleri(rank, { wall = false } = {}) {
  // Pasif (rütbe yok): tek onayla oturum/süre izni verilmez — kapı kapalı kalır.
  if (Number(rank) < 0) return ["Bir kez"];
  if (!wall) return KAPSAM.filter((k) => k.id !== "oturum+duvar").map((k) => k.ad);
  if (rank >= 2) return KAPSAM.map((k) => k.ad);
  return ["Bir kez"];
}

// Onay günlüğü: tek satır, alanlar | ile.
export function onaySatiri({ tarih, tool, karar, kapsam }) {
  const zaman = tarih || new Date().toISOString();
  return [zaman, "kapi", String(tool || "?"), String(karar || "?"), String(kapsam || "-")].join(" | ");
}

// Defterdeki Puan satırını tek doğru kaynaktan (puan-durum.json) yazar.
export function boardPuanSenkron(board, puan) {
  return String(board || "").replace(/(\| Puan \| )[^|]*(\|)/, `$1${Number(puan) || 0} $2`);
}

export const TUR_PENCERE = 10;
export const RISK_CARPAN = 2;

// Puan yalnız katkıdan gelir: ödül satırları. Tur ücreti yok; tur sayısı "kıdem" sayacıdır.
export function riskFor(cezaRows) {
  const toplam = (Array.isArray(cezaRows) ? cezaRows : [])
    .filter((row) => /^(D|E)$/i.test(String(row?.grup ?? "").trim()))
    .reduce((sum, row) => sum + (Number(row?.puan) || 0), 0);
  return Math.min(3, toplam);
}

// Tampon: puanın rütbe eşiğinin üstünde ne kadar olduğu.
export function tamponFor(puan, rank) {
  if (rank < 0) return null;
  return Number(puan) - RANKS[rank].puan;
}

export function bolgeFor(tampon) {
  if (tampon === null || tampon === undefined) return "rutbe-yok";
  if (tampon >= 5) return "guvenli";
  if (tampon >= 1) return "sari";
  return "kirmizi";
}

// Rütbe aktif mi: puan eşiği geçmiş ve son 3 turda risk yok.
export function rutbeAktif(puan, turlar, rank = rankIndex(puan)) {
  if (rank < 0) return false;
  return sonTurlarTemiz(turlar, 3);
}

export function sonTurlarTemiz(turlar, adet = 3) {
  const son = (Array.isArray(turlar) ? turlar : []).slice(-adet);
  if (!son.length) return true;
  return son.every((tur) => (Number(tur?.risk) || 0) === 0);
}

// Puan = max(0, birikim − 2 × son 10 turun riski). Birikim azalmaz; risk eskiyince düşer.
export function puanDurum({ birikim, turlar }) {
  const risk = (Array.isArray(turlar) ? turlar : []).reduce((sum, tur) => sum + (Number(tur?.risk) || 0), 0);
  return Math.max(0, (Number(birikim) || 0) - RISK_CARPAN * risk);
}

export function yeniTur(state, { risk = 0, odul = 0, work = false } = {}) {
  const riskDeger = Number(risk) || 0;
  const odulDeger = Math.max(0, Number(odul) || 0);
  const turlar = [...(Array.isArray(state?.turlar) ? state.turlar : []), { risk: riskDeger, odul: odulDeger }].slice(-TUR_PENCERE);
  const birikim = (Number(state?.birikim) || 0) + odulDeger;
  const temizTur = (Number(state?.temizTur) || 0) + (work && riskDeger === 0 ? 1 : 0);
  const son = turlar[turlar.length - 1];
  son.puan = puanDurum({ birikim, turlar });
  return { birikim, turlar, temizTur };
}

// Risk penceresi: toplam risk, en son riskli turun pencereden çıkmasına kaç tur kaldığı ve o turun geri getireceği puan.
export function erimeBilgisi(turlar) {
  const pencere = Array.isArray(turlar) ? turlar : [];
  const toplam = pencere.reduce((sum, tur) => sum + (Number(tur?.risk) || 0), 0);
  if (!toplam) return { risk: 0, kalanTur: 0, geri: 0 };
  let sonIdx = -1;
  let sonRisk = 0;
  pencere.forEach((tur, i) => {
    const risk = Number(tur?.risk) || 0;
    if (risk > 0) {
      sonIdx = i;
      sonRisk = risk;
    }
  });
  const gecen = pencere.length - 1 - sonIdx;
  return { risk: toplam, kalanTur: Math.max(0, TUR_PENCERE - gecen), geri: RISK_CARPAN * sonRisk };
}

// Skorcuya giden tur metni: gürültüyü kırpar, tekrarları toplar, toplam boyutu sınırlar.
export function compactTranscript(items, options = {}) {
  const maxChars = Number(options.maxChars) || 6000;
  const lines = [];
  let sonSatir = "";
  let tekrar = 0;

  const ekle = (line) => {
    if (!line) return;
    if (line === sonSatir) {
      tekrar += 1;
      lines[lines.length - 1] = `${line} ×${tekrar}`;
      return;
    }
    sonSatir = line;
    tekrar = 1;
    lines.push(line);
  };

  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    if (item.role === "user") {
      const text = clipText(item.text, 1200);
      if (text) ekle(`K: ${text}`);
    } else if (item.role === "assistant") {
      const text = clipText(item.text, 600);
      if (text) ekle(`P: ${text}`);
      for (const call of item.calls || []) {
        const satir = clipText(call, 120);
        if (satir) ekle(`→ ${satir}`);
      }
    } else if (item.role === "toolResult") {
      const body = clipText(item.text, 160);
      ekle(`← ${item.isError ? "HATA" : "ok"}: ${body}`);
    }
  }

  const text = lines.join("\n");
  return text.length > maxChars ? text.slice(-maxChars) : text;
}

function clipText(value, limit) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function parseScore(board) {  const ceza = sectionSum(board, "## Ceza", "## Ödül");
  const odul = sectionSum(board, "## Ödül", null);
  return { ceza, odul, puan: odul - ceza };
}

function sectionSum(board, start, next) {
  const text = String(board || "");
  const from = text.indexOf(start);
  if (from < 0) return 0;
  const rest = text.slice(from + start.length);
  const end = next ? rest.indexOf(next) : firstHeaderAfter(rest);
  const block = end < 0 ? rest : rest.slice(0, end);
  let sum = 0;
  for (const line of block.split(/\r?\n/)) {
    if (!line.startsWith("|") || line.includes("---") || line.includes("| # |")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (!cells.some(Boolean)) continue;
    sum += Number(cells[cells.length - 1]) || 0;
  }
  return sum;
}

function firstHeaderAfter(rest) {
  const match = rest.match(/\n## /);
  return match ? match.index : -1;
}

export function rankIndex(puan) {
  // Fail-open yok: puan okunamıyorsa rütbe yok (-1), bronz'a düşmez.
  // Number(null) === 0 tuzağı: null/undefined/boş metin açıkça elenir.
  if (puan === null || puan === undefined || puan === "" || typeof puan === "boolean") return -1;
  const sayi = Number(puan);
  if (!Number.isFinite(sayi)) return -1;
  let index = -1;
  for (let i = 0; i < RANKS.length; i += 1) if (sayi >= RANKS[i].puan) index = i;
  return index;
}

function turIndex(temizTur) {
  const tur = Number(temizTur) || 0;
  let index = -1;
  for (let i = 0; i < RANKS.length; i += 1) if (tur >= RANKS[i].tur) index = i;
  return index;
}

// Rütbe iki şart ister: puan eşiği ve kıdem (temiz tur). İkisinin küçüğü geçerlidir.
export function rutbeIndex(puan, temizTur = 0) {
  return Math.min(rankIndex(puan), turIndex(temizTur));
}

export function nextRank(puan, temizTur = 0) {
  const need = RANKS.find((rank) => puan < rank.puan || (Number(temizTur) || 0) < rank.tur);
  if (!need) return null;
  return {
    name: need.name,
    puan: need.puan,
    tur: need.tur,
    kalan: Math.max(0, need.puan - puan),
    kalanTur: Math.max(0, need.tur - (Number(temizTur) || 0)),
  };
}

export function doorsText(index) {
  if (index < 0) return ["(kapı yok — önce bronz)"];
  return [RANKS[index].kapi];
}

export function sonrakiKapilar(index, adet = 2) {
  return RANKS.slice(index + 1, index + 1 + adet).map((rank) => `${rank.name} (${rank.puan} puan · ${rank.tur} tur): ${rank.kapi}`);
}

export function decideGate({ toolName, input, rank, editsThisTurn, grant, turnId, now, cwd }) {
  const karar = temelKarar({ toolName, input, rank, editsThisTurn, cwd });
  if (karar.action === "confirm" && kapsamGecerli(grant, { turnId, now, wall: !!karar.wall })) {
    return { action: "allow", via: "toplu", kapsam: grant.scope };
  }
  return karar;
}

function temelKarar({ toolName, input, rank, editsThisTurn, cwd }) {
  const args = input && typeof input === "object" ? input : {};

  if (toolName === "edit" || toolName === "write") {
    const limit = TURDA_DOSYA[String(Math.max(rank, -1))] ?? 99;
    const yol = typeof args.path === "string" ? args.path.trim() : "";
    if (yol && !yolProjeIcinde(cwd, yol)) {
      return { action: "confirm", wall: true, reason: "proje dışına yazma: her rütbede onay" };
    }
    if (rank < 0) return { action: "confirm", reason: "rütbe yok: dosya değişikliği onay ister" };
    if (limit !== 99 && editsThisTurn >= limit) {
      return { action: "confirm", reason: `turda dosya sınırı (${limit}) aşıldı` };
    }
    return { action: "allow" };
  }

  if (toolName !== "bash") {
    const metin = typeof args.command === "string" ? args.command : typeof args.script === "string" ? args.script : "";
    if (metin && TEHLIKELI.some((pattern) => pattern.test(metin))) {
      return { action: "confirm", wall: true, reason: "yıkıcı veya global işlem: her rütbede onay" };
    }
    if (SERBEST_ARACLAR.has(toolName)) return { action: "allow" };
    return { action: "confirm", reason: `${toolName} aracı bu rütbede onay ister` };
  }

  const command = typeof args.command === "string" ? args.command : "";
  if (!command.trim()) return { action: "confirm", reason: "boş/okunamayan komut" };

  if (TEHLIKELI.some((pattern) => pattern.test(command)) || projeDisiYazma(command, cwd)) {
    return { action: "confirm", wall: true, reason: "yıkıcı veya global işlem: her rütbede onay" };
  }

  if (rank < 0) return { action: "confirm", reason: "rütbe yok: komut onay ister" };
  if (rank >= 2) return { action: "allow" };
  if (rank >= 0 && OKUMA.some((pattern) => pattern.test(command))) return { action: "allow" };
  if (rank >= 1 && PROJE_KOMUT.some((pattern) => pattern.test(command))) return { action: "allow" };
  if (rank >= 1 && GIT_YAZMA.test(command)) return { action: "allow" };

  return { action: "confirm", reason: "komut bu rütbede serbest değil" };
}

export function historyDelta({ oncekiRank, rank, puan, tarih, gecmis }) {
  const rows = [...(gecmis || [])];
  if (oncekiRank === null || oncekiRank === undefined) return rows;
  if (rank > oncekiRank) {
    for (let i = oncekiRank + 1; i <= rank; i += 1) {
      rows.push({ tarih, olay: "kazandı", rozet: RANKS[i].name, puan, sebep: "eşik geçildi" });
    }
  } else if (rank < oncekiRank) {
    for (let i = oncekiRank; i > rank; i -= 1) {
      rows.push({ tarih, olay: "kaybetti", rozet: RANKS[i].name, puan, sebep: "puan eşiğin altına düştü" });
    }
  }
  return rows;
}

export function renderRozet({ puan, rank, gecmis, tarih, tampon, bolge, aktif, temizTur = 0 }) {
  const current = rank >= 0 ? RANKS[rank] : null;
  const next = nextRank(puan, temizTur);
  const tamponDeger = tampon === undefined ? null : tampon;
  const durum = current ? (aktif === false ? "askıda (3 temiz tur gerek)" : "aktif") : "—";
  const bolgeAdi = bolge === "guvenli" ? "güvenli" : bolge === "sari" ? "sarı" : bolge === "kirmizi" ? "kırmızı" : "—";
  const lines = [
    "# Rozetler",
    "",
    "Rozet skor tablosuna yazılmaz. Puanla kazanılır, puan düşünce kaybedilir; kayıt silinmez.",
    "",
    "## Rütbe",
    "",
    "| Alan | Değer |",
    "|---|---|",
    `| Puan | ${puan} |`,
    `| Kıdem | ${temizTur} temiz tur |`,
    `| Rütbe | ${current ? current.name : "—"} |`,
    `| Durum | ${durum} |`,
    `| Tampon | ${tamponDeger === null ? "—" : `${tamponDeger} (${bolgeAdi})`} |`,
    `| Sıradaki | ${next ? `${next.name} (${[
      next.kalan > 0 ? `${next.kalan} puan` : "",
      next.kalanTur > 0 ? `${next.kalanTur} tur` : "",
    ].filter(Boolean).join(" + ")} kaldı)` : "en üst"} |`,
    `| Varsayılan onay | ${kapsamAdi(varsayilanKapsam(rank))} |`,
    "",
    "## Açık kapılar",
    "",
    ...doorsText(rank).map((kapi) => `- ${kapi}`),
    "",
    ...(sonrakiKapilar(rank).length ? ["## Sıradaki kapılar", "", ...sonrakiKapilar(rank).map((kapi) => `- ${kapi}`), ""] : []),
    "Kapılar puanla açılır, puan düşünce aynı turda kapanır. Duvarlar (SKILL.md, global kurulum, silme, ödeme, dış yazma) varsayılan olarak tek tek sorulur; kullanıcı altın ve üstünde 'Bu oturum + duvarlar' derse oturum boyunca açılır.",
    "",
    "## Geçmiş",
    "",
    "| Tarih | Olay | Rozet | Puan | Sebep |",
    "|---|---|---|---|---|",
    ...(gecmis || []).map(
      (row) =>
        `| ${cell(row.tarih || tarih || "")} | ${cell(row.olay)} | ${cell(row.rozet)} | ${cell(row.puan)} | ${cell(row.sebep)} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

function cell(value) {
  return String(value ?? "").replace(/[\r\n|]+/g, " ").trim();
}

export function kapsamAdi(scope) {
  return (KAPSAM.find((k) => k.id === scope) || KAPSAM[0]).ad;
}

// Kapı başlığı: tek satır, kısa. Menü seçenekleri ayrı argümandır; başlığa asla liste karışmaz.
export function kapiBasligi({ rutbeAdi, puan, reason }) {
  const temiz = String(reason ?? "").replace(/\s+/g, " ").trim();
  const metin = `Rütbe kapısı: ${String(rutbeAdi ?? "yok")} (puan ${Number(puan) || 0}) · ${temiz}`;
  return metin.length > 110 ? `${metin.slice(0, 110)}…` : metin;
}
