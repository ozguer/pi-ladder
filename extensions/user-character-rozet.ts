// @ts-nocheck
// Badge/rank hook: reads points from the ledger, computes the rank, writes ROZET.md,
// and applies tool_call gates according to rank.
// Badge score is not written to the scoreboard; the record lives in the event history in ROZET.md.

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
      // if the permission file cannot be written, the note shows the old state
    }
  }

  function kapiLogla(tool, karar, kapsam) {
    try {
      appendFileSync(KAPI_LOG, `${onaySatiri({ tool, karar, kapsam })}\n`, "utf8");
    } catch {
      // if the log cannot be written, the flow does not stop
    }
  }

  function readBoard(): string | null {
    try {
      return readFileSync(SCOREBOARD, "utf8");
    } catch {
      return null;
    }
  }

  // Points = max(0, accumulated − 2 × risk of the last 10 turns).
  function readPuan(): number | null {
    try {
      const parsed = JSON.parse(readFileSync(PUAN_STATE, "utf8"));
      if (parsed && (typeof parsed.birikim === "number" || Array.isArray(parsed.turlar))) {
        return puanDurum(parsed);
      }
    } catch {
      // if the single source of truth cannot be read, points are not computed
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
      // if state cannot be written, history is retried on the next sync
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
        olay: aktif ? "reopened" : "suspended",
        rozet: RANKS[rank].name,
        puan,
        sebep: aktif ? "3 clean turns" : "D/E violation in the last 3 turns",
      });
    }

    const kirpik = gecmis.slice(-EN_FAZLA_GECMIS);
    const tampon = tamponFor(puan, rank);
    const bolge = bolgeFor(tampon);

    // Rank change: a notification shown to the agent once (congratulation or loss).
    if (Number.isInteger(state.rank) && rank >= 0 && rank !== state.rank) {
      try {
        writeFileSync(
          join(DATA_DIR, "rozet-bildirim.json"),
          JSON.stringify({ tip: rank > state.rank ? "kazandi" : "kaybetti", rozet: RANKS[rank].name, puan, tarih }, null, 2),
          "utf8",
        );
      } catch {
        // if the notification cannot be written, the client note keeps showing the old event
      }
    }

    try {
      writeFileSync(ROZET_MD, renderRozet({ puan, rank, gecmis: kirpik, tarih, tampon, bolge, aktif, temizTur }), "utf8");
    } catch {
      // if the badge file cannot be written, the flow does not stop
    }
    // The Points row in the ledger is written from a single source; the agent should not see two different numbers.
    try {
      if (board.trim()) writeFileSync(SCOREBOARD, boardPuanSenkron(board, puan), "utf8");
    } catch {
      // if the ledger cannot be written, the badge and bulletin still carry the correct number
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
      { tarih: new Date().toISOString().slice(0, 10), olay: "critical", rozet: "—", puan, sebep },
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
    // if there is no event path, the end-of-turn sync is enough
  }
  try {
    pi.events.on("user-character:skill-write-blocked", () => kritik("unapproved SKILL.md write attempt"));
  } catch {
    // if there is no event path, the critical row is not written
  }

  pi.on("tool_call", async (event, ctx) => {
    if (process.env.PI_SUBAGENT_CHILD === "1") return;
    const toolName = event?.toolName;
    if (!toolName) return;

    const input = event?.input ?? {};
    const duzenleme = toolName === "edit" || toolName === "write";
    if (duzenleme) {
      const raw = typeof input.path === "string" ? input.path : "";
      if (raw.trim() && ayniYol(resolve(ctx.cwd, raw), SKILL_MD)) return; // has its own gate
    }

    const durum = durumHesapla(olaylariOku(join(DATA_DIR, "skor-olaylar.jsonl")).olaylar, { simdi: Date.now() });
    const rank = durum.aktif ? durum.rank : -1;
    const puan = durum.yetki;
    const yazmaSinifi = aracPolitikasi({ toolName }).sinif === "yazma";
    const turSiniri = TUR_DOSYA[Math.max(0, rank)];
    const karar =
      yazmaSinifi && editsThisTurn >= turSiniri
        ? { action: "confirm", reason: "per-turn file limit" }
        : kapiKarari({ toolName, input, rank, cwd: ctx.cwd, grant, now: Date.now() });
    if (duzenleme) editsThisTurn += 1;

    // Let the scorer see approval information: approved work is not a penalty.
    const bildir = (kararTuru, ek = {}) => {
      try {
        pi.events.emit("user-character:gate", { tool: toolName, karar: kararTuru, ...ek, at: Date.now() });
      } catch {
        // if there is no event path, the scorer cannot receive gate information
      }
    };

    if (karar.action === "allow") {
      if (karar.via === "toplu") bildir("approved", { kapsam: karar.kapsam, toplu: true });
      else bildir("free");
      return;
    }

    if (karar.action === "deny") {
      bildir("blocked");
      const duvarEki = karar.wall ? `wall: ${karar.wall} — ` : "";
      return { block: true, reason: `${duvarEki}${karar.reason}` };
    }

    const rutbeAdi = rank >= 0 ? RANKS[rank].name : "none";
    const mesaj = `Rank: ${rutbeAdi} (score ${puan})\n${karar.reason}${karar.wall ? "\nWalls are asked one by one." : ""}\n\nApproval scope?`;

    if (!ctx.hasUI) {
      // Nobody to ask: the rank gate does not halt work; only walls do.
      if (karar.wall) {
        bildir("blocked");
        return { block: true, reason: `${karar.reason} — no approval window (rank: ${rutbeAdi})` };
      }
      bildir("free");
      return;
    }

    let secim = null;
    const secenekler = kapsamSecenekleri(rank, { wall: !!karar.wall });
    const baslik = kapiBasligi({ rutbeAdi, puan, reason: karar.reason });
    try {
      if (typeof ctx.ui.select !== "function" || secenekler.length < 2) {
        const uyari = karar.wall ? `${mesaj}\nWalls are asked one by one by default.` : mesaj;
        const onay = await ctx.ui.confirm("Rank gate", uyari);
        secim = onay ? "tek" : null;
      } else {
        const cevap = await ctx.ui.select(
          karar.wall ? `${baslik} · DESTRUCTIVE · choose scope` : baslik,
          secenekler,
        );
        secim = cevap ? KAPSAM.find((kapsam) => kapsam.ad === cevap)?.id ?? null : null;
        if (cevap && !secim) {
          // Unexpected answer: ask for a single-step approval instead of a scope; do not refuse silently.
          const onay = await ctx.ui.confirm(baslik, "Could not read the selection. Allow only this step?");
          secim = onay ? "tek" : null;
        }
      }
    } catch {
      secim = null;
    }
    if (!secim) {
      kapiLogla(toolName, "denied", "-");
      bildir("denied");
      return { block: true, reason: `No user approval — ${karar.reason}` };
    }
    // A new scope is written only when a real permission is selected; "Once" does not delete the existing grant.
    const yeniIzin = kapsamOlustur(secim, { turnId });
    if (yeniIzin) {
      grant = yeniIzin;
      yazIzin(grant);
    }
    kapiLogla(toolName, karar.wall ? "approved-wall" : "approved", secim);
    bildir("approved", { kapsam: secim });
  });
}

function ayniYol(a, b) {
  const norm = (value) => String(value).replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
  return norm(a) === norm(b);
}
