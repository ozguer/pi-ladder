// Gölge kapı çekirdeği.
// Görünen kapı kararını değiştirmeden yeni kararı yan yana üretir ve isteğe bağlı loglar.
// Hiçbir koşulda throw etmez; kanca akışını durdurmaz.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { kapiKarari } from "./kapi-politika.mjs";
import { altAjanMi } from "./oturum.mjs";

const nesne = (deger) => (deger && typeof deger === "object" ? deger : null);

const eylem = (karar) => (karar && typeof karar === "object" ? karar.action : undefined);

const metin = (deger) => (deger === undefined || deger === null ? "-" : String(deger));

export function kapiGolge({ ctx, toolName, input, rank, cwd, eskiKarar, grant, now, logYolu, durum } = {}) {
  try {
    if (altAjanMi()) return { yeni: null, uyumlu: null, loglandi: false };

    const d = nesne(durum);
    let yeniRank;
    if (d) {
      const ham = Number(d.rank);
      yeniRank = d.rank === undefined || d.rank === null || !Number.isFinite(ham) ? -1 : ham;
    } else {
      yeniRank = rank;
    }

    const yeni = kapiKarari({ toolName, input, rank: yeniRank, cwd, grant, now });
    const eskiEylem = eylem(eskiKarar);
    const uyumlu = eskiEylem === undefined ? null : eylem(yeni) === eskiEylem;

    let loglandi = false;
    if (logYolu !== undefined && logYolu !== null && logYolu !== "") {
      try {
        const ham = now === undefined || now === null ? Date.now() : Number(now);
        const iso = new Date(Number.isFinite(ham) ? ham : Date.now()).toISOString();
        mkdirSync(dirname(logYolu), { recursive: true });
        appendFileSync(
          logYolu,
          `${iso} | kapi | ${metin(toolName)} eski=${metin(eskiEylem)} → yeni=${metin(eylem(yeni))} via=${metin(yeni?.via)} uyumlu=${uyumlu} duvar=${metin(yeni?.wall)}\n`,
          "utf8",
        );
        loglandi = true;
      } catch {
        loglandi = false;
      }
    }

    return { yeni, uyumlu, loglandi };
  } catch (hata) {
    return {
      yeni: null,
      uyumlu: null,
      loglandi: false,
      hata: hata instanceof Error ? hata.message : String(hata),
    };
  }
}
