// @ts-nocheck
// Rozet/rütbe kancası: puanı defterden okur, rütbeyi hesaplar, ROZET.md'ye yazar,
// tool_call kapılarını rütbeye göre uygular.
// Rozet skor tablosuna yazılmaz; kayıt ROZET.md'deki olay geçmişindedir.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SCOREBOARD, ROZET_MD, SKILL_MD, ROZET_STATE, PUAN_STATE, DATA_DIR, ensureData } from "./paths.mjs";
import { RANKS, parseScore, rankIndex, rutbeIndex, renderRozet, historyDelta, puanDurum, tamponFor, bolgeFor, rutbeAktif, KAPSAM, kapsamOlustur, kapsamSecenekleri, boardPuanSenkron, kapiBasligi, onaySatiri } from "./user-character-rozet-core.mjs";
import { kapiKarari, aracPolitikasi } from "./kapi-politika.mjs";
import { durumHesapla } from "./skor-model.mjs";
import { olaylariOku } from "./skor-store.mjs";

const TUR_DOSYA = [1, 2, 3, 5, 8, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];

const IZIN_STATE = join(DATA_DIR, "izin-durum.json");
const KAPI_LOG = join(DATA_DIR, "skorcu.log");
const EN_FAZLA_GECMIS = 200;

export default function userCharacterRozet(pi) {
  ensureData();
  let editsThisTurn = 0;
  let turnId = 0;
  let grant = null;

  function yazIzin(deger) {
    try {
      writeFileSync(
        IZIN_STATE,
        JSON.stringify(deger ? { kapsam: deger.scope, bitis: deger.expiresAt } : { kapsam: "yok" }, null, 2),
        "utf8",
      );
    } catch {
      // izin dosyası yazılamazsa not eski durumu gösterir
    }
  }

  function kapiLogla(tool, karar, kapsam) {
    try {
      appendFileSync(KAPI_LOG, `${onaySatiri({ tool, karar, kapsam })}\n`, "utf8");
    } catch {
      // log yazılamazsa akış durmaz
    }
  }

  function readBoard(): string | null {
    try {
      return readFileSync(SCOREBOARD, "utf8");
    } catch {
      return null;
    }
  }

  // Puan = max(0, birikim − 2 × son 10 turun riski).
  function readPuan(): number | null {
    try {
      const parsed = JSON.parse(readFileSync(PUAN_STATE, "utf8"));
      if (parsed && (typeof parsed.birikim === "number" || Array.isArray(parsed.turlar))) {
        return puanDurum(parsed);
      }
    } catch {
      // tek doğru kaynak okunamıyorsa puan hesaplanmaz
    }
    return null;
  }

  function readState() {
    try {
      const parsed = JSON.parse(readFileSync(ROZET_STATE, "utf8"));
      return {
        rank: Number.isInteger(parsed.rank) ? parsed.rank : null,
        aktif: typeof parsed.aktif === "boolean" ? parsed.aktif : null,
        gecmis: Array.isArray(parsed.gecmis) ? parsed.gecmis : [],
      };
    } catch {
      return { rank: null, aktif: null, gecmis: [] };
    }
  }

  function readTemizTur(): number {
    try {
      const parsed = JSON.parse(readFileSync(PUAN_STATE, "utf8"));
      return Number(parsed.temizTur) || 0;
    } catch {
      return 0;
    }
  }

  function readTurlar() {
    try {
      const parsed = JSON.parse(readFileSync(PUAN_STATE, "utf8"));
      return Array.isArray(parsed.turlar) ? parsed.turlar : [];
    } catch {
      return [];
    }
  }

  function writeState(state) {
    try {
      writeFileSync(ROZET_STATE, JSON.stringify(state, null, 2), "utf8");
    } catch {
      // durum yazılamazsa geçmiş bir sonraki senkronda yeniden denenir
    }
  }

  function sync() {
    const board = readBoard();
    const puan = readPuan();
    if (board === null || puan === null) return;
    const temizTur = readTemizTur();
    const rank = rutbeIndex(puan, temizTur);
    const state = readState();
    const tarih = new Date().toISOString().slice(0, 10);
    const aktif = rank >= 0 ? rutbeAktif(puan, readTurlar(), rank) : false;
    const gecmis = historyDelta({ oncekiRank: state.rank, rank, puan, tarih, gecmis: state.gecmis });

    if (rank >= 0 && typeof state.aktif === "boolean" && state.aktif !== aktif) {
      gecmis.push({
        tarih,
        olay: aktif ? "geri açıldı" : "askıya alındı",
        rozet: RANKS[rank].name,
        puan,
        sebep: aktif ? "3 temiz tur" : "son 3 turda D/E ihlali",
      });
    }

    const kirpik = gecmis.slice(-EN_FAZLA_GECMIS);
    const tampon = tamponFor(puan, rank);
    const bolge = bolgeFor(tampon);

    // Rütbe değişimi: ajana bir kez gösterilecek bildirim (tebrik veya kayıp).
    if (Number.isInteger(state.rank) && rank >= 0 && rank !== state.rank) {
      try {
        writeFileSync(
          join(DATA_DIR, "rozet-bildirim.json"),
          JSON.stringify({ tip: rank > state.rank ? "kazandi" : "kaybetti", rozet: RANKS[rank].name, puan, tarih }, null, 2),
          "utf8",
        );
      } catch {
        // bildirim yazılamazsa istem notu eski olayı göstermeye devam eder
      }
    }

    try {
      writeFileSync(ROZET_MD, renderRozet({ puan, rank, gecmis: kirpik, tarih, tampon, bolge, aktif, temizTur }), "utf8");
    } catch {
      // rozet dosyası yazılamazsa akış durmaz
    }
    // Defterdeki Puan satırı tek kaynaktan yazılır; ajan iki farklı sayı görmesin.
    try {
      if (board.trim()) writeFileSync(SCOREBOARD, boardPuanSenkron(board, puan), "utf8");
    } catch {
      // defter yazılamazsa rozet ve bülten yine doğru sayıyı taşır
    }
    writeState({ rank, puan, aktif, gecmis: kirpik });
  }

  function kritik(sebep) {
    const board = readBoard();
    const puan = readPuan();
    if (puan === null) return;
    const state = readState();
    const gecmis = [
      ...state.gecmis,
      { tarih: new Date().toISOString().slice(0, 10), olay: "kritik", rozet: "—", puan, sebep },
    ].slice(-EN_FAZLA_GECMIS);
    writeState({ rank: state.rank, puan, gecmis });
    sync();
  }

  pi.on("before_agent_start", () => {
    yazIzin(grant);
    sync();
  });
  pi.on("agent_settled", () => sync());
  pi.on("turn_start", () => {
    editsThisTurn = 0;
    turnId += 1;
    if (grant?.scope === "tur") {
      grant = null;
      yazIzin(null);
    }
  });

  try {
    pi.events.on("user-character:score-written", () => sync());
  } catch {
    // olay yolu yoksa tur sonu senkronu yeter
  }
  try {
    pi.events.on("user-character:skill-write-blocked", () => kritik("onaysız SKILL.md yazma denemesi"));
  } catch {
    // olay yolu yoksa kritik satır yazılmaz
  }

  pi.on("tool_call", async (event, ctx) => {
    if (process.env.PI_SUBAGENT_CHILD === "1") return;
    const toolName = event?.toolName;
    if (!toolName) return;

    const input = event?.input ?? {};
    const duzenleme = toolName === "edit" || toolName === "write";
    if (duzenleme) {
      const raw = typeof input.path === "string" ? input.path : "";
      if (raw.trim() && ayniYol(resolve(ctx.cwd, raw), SKILL_MD)) return; // kendi kapısı var
    }

    const durum = durumHesapla(olaylariOku(join(DATA_DIR, "skor-olaylar.jsonl")).olaylar, { simdi: Date.now() });
    const rank = durum.aktif ? durum.rank : -1;
    const puan = durum.yetki;
    const yazmaSinifi = aracPolitikasi({ toolName }).sinif === "yazma";
    const turSiniri = TUR_DOSYA[Math.max(0, rank)];
    const karar =
      yazmaSinifi && editsThisTurn >= turSiniri
        ? { action: "confirm", reason: "tur başına dosya sınırı" }
        : kapiKarari({ toolName, input, rank, cwd: ctx.cwd, grant, now: Date.now() });
    if (duzenleme) editsThisTurn += 1;

    // Skorcu onay bilgisini görsün: onaylı iş ceza değildir.
    const bildir = (kararTuru, ek = {}) => {
      try {
        pi.events.emit("user-character:gate", { tool: toolName, karar: kararTuru, ...ek, at: Date.now() });
      } catch {
        // olay yolu yoksa skorcu kapı bilgisini alamaz
      }
    };

    if (karar.action === "allow") {
      if (karar.via === "toplu") bildir("onaylandı", { kapsam: karar.kapsam, toplu: true });
      else bildir("serbest");
      return;
    }

    if (karar.action === "deny") {
      bildir("engellendi");
      const duvarEki = karar.wall ? `duvar: ${karar.wall} — ` : "";
      return { block: true, reason: `${duvarEki}${karar.reason}` };
    }

    const rutbeAdi = rank >= 0 ? RANKS[rank].name : "yok";
    const mesaj = `Rütbe: ${rutbeAdi} (puan ${puan})\n${karar.reason}${karar.wall ? "\nDuvarlar tek tek sorulur." : ""}\n\nOnay kapsamı?`;

    if (!ctx.hasUI) {
      // Soracak kimse yok: rütbe kapısı işi durdurmaz, yalnız duvarlar durdurur.
      if (karar.wall) {
        bildir("engellendi");
        return { block: true, reason: `${karar.reason} — onay penceresi yok (rütbe: ${rutbeAdi})` };
      }
      bildir("serbest");
      return;
    }

    let secim = null;
    const secenekler = kapsamSecenekleri(rank, { wall: !!karar.wall });
    const baslik = kapiBasligi({ rutbeAdi, puan, reason: karar.reason });
    try {
      if (typeof ctx.ui.select !== "function" || secenekler.length < 2) {
        const uyari = karar.wall ? `${mesaj}\nDuvarlar varsayılan olarak tek tek sorulur.` : mesaj;
        const onay = await ctx.ui.confirm("Rütbe kapısı", uyari);
        secim = onay ? "tek" : null;
      } else {
        const cevap = await ctx.ui.select(
          karar.wall ? `${baslik} · YIKICI · kapsam seç` : baslik,
          secenekler,
        );
        secim = cevap ? KAPSAM.find((kapsam) => kapsam.ad === cevap)?.id ?? null : null;
        if (cevap && !secim) {
          // Beklenmeyen cevap: kapsam yerine tek adımlık onay sor, sessizce reddetme.
          const onay = await ctx.ui.confirm(baslik, "Seçim okunamadı. Yalnız bu adım için izin veriyor musun?");
          secim = onay ? "tek" : null;
        }
      }
    } catch {
      secim = null;
    }
    if (!secim) {
      kapiLogla(toolName, "reddedildi", "-");
      bildir("reddedildi");
      return { block: true, reason: `Kullanıcı onayı yok — ${karar.reason}` };
    }
    // Yeni kapsam yalnız gerçek bir izin seçildiğinde yazılır; "Bir kez" mevcut izni silmez.
    const yeniIzin = kapsamOlustur(secim, { turnId });
    if (yeniIzin) {
      grant = yeniIzin;
      yazIzin(grant);
    }
    kapiLogla(toolName, karar.wall ? "onaylandı-duvar" : "onaylandı", secim);
    bildir("onaylandı", { kapsam: secim });
  });
}

function ayniYol(a, b) {
  const norm = (value) => String(value).replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
  return norm(a) === norm(b);
}
