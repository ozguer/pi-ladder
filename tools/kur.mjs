// Install tool: places the pi-user-character package into a Pi installation.
// The default is a DRY RUN; pass --yaz to write.
//
//   node tools/kur.mjs                       # show what would happen
//   node tools/kur.mjs --yaz                 # install into ~/.pi/agent
//   node tools/kur.mjs --yaz --hedef <dir>   # install into another Pi installation
//   node tools/kur.mjs --yaz --dil tr        # with Turkish templates (default: en)
//
// What it does: take a backup → copy hooks → prepare data/skill directories
// → write a migration event if an old score exists (K40/K50) → summary.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gocYaz, eskiDurumOku } from "./goc.mjs";
import { POLITIKA } from "../extensions/skor-politika.mjs";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SURUM = JSON.parse(readFileSync(join(KOK, "package.json"), "utf8")).version;

const arg = (ad, varsayilan = null) => {
  const i = process.argv.indexOf(ad);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : varsayilan;
};

const yaz = process.argv.includes("--yaz");
const hedefKok = resolve(arg("--hedef", join(homedir(), ".pi", "agent")));
const damga = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const yedekDizin = join(hedefKok, `backup-install-${damga}`);

const satirlar = [];
const ekle = (s) => satirlar.push(s);

ekle(`pi-user-character ${SURUM}`);
ekle(`source : ${KOK}`);
ekle(`target : ${hedefKok}`);
ekle(`mode   : ${yaz ? "WRITE (real install)" : "dry run (no writes)"}`);
ekle("");

// 1. Hooks
const kaynakExt = join(KOK, "extensions");
const hedefExt = join(hedefKok, "extensions");
const extDosyalar = readdirSync(kaynakExt).filter((ad) => ad.endsWith(".ts") || ad.endsWith(".mjs"));
ekle(`hooks/modules: ${extDosyalar.length} files -> ${hedefExt}`);

// 2. Templates (written only if missing: does not overwrite files the agent learned)
const dil = String(arg("--dil", "en")).toLowerCase() === "tr" ? "tr" : "en";
const kaynakTpl = existsSync(join(KOK, "templates", dil)) ? join(KOK, "templates", dil) : join(KOK, "templates");
const hedefSkill = join(hedefKok, "skills", "user-character");
const tplDosyalar = existsSync(kaynakTpl) ? readdirSync(kaynakTpl).filter((ad) => ad.endsWith(".md")) : [];
ekle(`templates    : ${tplDosyalar.length} files (${dil}) -> ${hedefSkill} (missing only)`);

// 3. Data directory
const hedefVeri = join(hedefKok, "user-character");
ekle(`data         : ${hedefVeri}`);
ekle(`baseline     : authority 0 · merit 0 · daily cap ${POLITIKA.tavan.yetkiGun}`);

// 4. Migration
const puanDosyasi = join(hedefKok, "puan-durum.json");
const eski = eskiDurumOku({ puanDosyasi, scoreboardDosyasi: join(hedefSkill, "SCOREBOARD.md") });
ekle(`migration    : ${existsSync(puanDosyasi) ? `old score ${eski.eskiPuan} -> authority ${eski.yetki} (cap ${POLITIKA.esikler[2]})` : "no old score -> authority 0"}`);
ekle("");

if (!yaz) {
  ekle("To write: node tools/kur.mjs --yaz");
  console.log(satirlar.join("\n"));
  process.exit(0);
}

// --- Real install ---
mkdirSync(hedefExt, { recursive: true });
mkdirSync(hedefSkill, { recursive: true });
mkdirSync(hedefVeri, { recursive: true });

// Backup: files we will touch
if (existsSync(hedefExt)) {
  mkdirSync(yedekDizin, { recursive: true });
  for (const ad of readdirSync(hedefExt)) {
    const kaynak = join(hedefExt, ad);
    if (statSync(kaynak).isFile()) copyFileSync(kaynak, join(yedekDizin, ad));
  }
}

let kopyalanan = 0;
for (const ad of extDosyalar) {
  copyFileSync(join(kaynakExt, ad), join(hedefExt, ad));
  kopyalanan += 1;
}

let tplYazilan = 0;
for (const ad of tplDosyalar) {
  const hedef = join(hedefSkill, ad);
  if (!existsSync(hedef)) {
    copyFileSync(join(kaynakTpl, ad), hedef);
    tplYazilan += 1;
  }
}

// Migration event (idempotent: the same migration is not written twice)
const olayYolu = join(hedefVeri, "skor-olaylar.jsonl");
const goc = gocYaz({ olayYolu, onceki: eski, simdi: Date.now(), kuruCalisma: false });

// Backup manifest
writeFileSync(
  join(yedekDizin, "MANIFEST.txt"),
  [
    `pi-user-character ${SURUM} install`,
    `date: ${new Date().toISOString()}`,
    `target: ${hedefKok}`,
    `backed up: ${existsSync(yedekDizin) ? readdirSync(yedekDizin).length : 0} files`,
    "",
  ].join("\n"),
  "utf8",
);

ekle(`copied       : ${kopyalanan} hooks · ${tplYazilan} new templates`);
ekle(`backup       : ${yedekDizin}`);
ekle(`migration event: ${goc.yazildi ? "written" : goc.tekrar ? "already existed (duplicate)" : "not written"} -> ${olayYolu}`);
ekle("");
ekle("Next: restart Pi once. Then send one request and check:");
ekle("  ~/.pi/agent/user-character/skorcu.log   -> ran: ... authority=...");
ekle("  ~/.pi/agent/user-character/SCOREBOARD.md -> state table");
console.log(satirlar.join("\n"));
