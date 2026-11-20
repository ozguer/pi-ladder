import { POLITIKA } from "./skor-politika.mjs";

export { POLITIKA };

export const KAPI_METINLERI = [
  "bronze · reads allowed",
  "silver · project commands (npm, node, python, git) allowed",
  "gold · every command outside walls allowed",
  "diamond 1 · walls can be opened with approval",
  "diamond 2 · subagents without approval",
  "diamond 3 · default approval 15 minutes",
  "diamond 4 · new skill/extension draft (install approved)",
  "diamond 5 · every non-destructive operation without approval",
];

export const KORUMALI_VARSAYILAN = [
  "SKILL.md",
  "APPEND_SYSTEM.md",
  "settings.json",
  "mcp.json",
  "C:/Windows",
  "/etc",
  "/usr",
];

const SHELL_ARACLARI = new Set(["bash", "powershell", "sh", "cmd"]);
const OKUMA_ARACLARI = new Set(["read", "grep", "find", "ls", "glob"]);
const YAZMA_ARACLARI = new Set(["edit", "write", "patch", "apply_patch"]);
const IZINLI_KOMUTLAR = new Set(["npm", "node", "python", "git", "ls", "cat", "grep", "find", "pytest", "npx"]);
const OKUMA_KOMUTLARI = new Set([
  "ls",
  "dir",
  "cat",
  "type",
  "grep",
  "rg",
  "find",
  "head",
  "tail",
  "wc",
  "pwd",
  "where",
  "which",
  "get-childitem",
  "get-content",
  "select-string",
]);

const YAZMA_ILK_ARGUMAN = new Set([
  "mkdir",
  "tee",
  "new-item",
  "set-content",
  "out-file",
  "add-content",
]);
const YAZMA_SON_ARGUMAN = new Set(["cp", "mv", "robocopy", "xcopy", "copy-item", "move-item"]);
const YAZMA_TUM_ARGUMAN = new Set(["remove-item"]);
const YAZMA_KOMUTLARI = new Set([...YAZMA_ILK_ARGUMAN, ...YAZMA_SON_ARGUMAN, ...YAZMA_TUM_ARGUMAN]);
const DEGER_BAYRAKLARI = new Set(["-o", "--output", "-outfile", "-path", "-literalpath", "-destination", "-target"]);

export function kabukParcala(command) {
  const metin = typeof command === "string" ? command : "";
  const parcalar = [];
  let mevcut = "";
  let tirnak = null;
  let kacis = false;

  const bitir = () => {
    const parca = mevcut.trim();
    if (parca) parcalar.push(parca);
    mevcut = "";
  };

  for (let i = 0; i < metin.length; i += 1) {
    const ch = metin[i];

    if (kacis) {
      mevcut += ch;
      kacis = false;
      continue;
    }

    if (tirnak) {
      mevcut += ch;
      if (tirnak === '"' && ch === "\\") kacis = true;
      else if (ch === tirnak) tirnak = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      tirnak = ch;
      mevcut += ch;
      continue;
    }

    if (ch === "\\") {
      mevcut += ch;
      kacis = true;
      continue;
    }

    if (ch === ";" || ch === "\n" || ch === "\r") {
      bitir();
      if (ch === "\r" && metin[i + 1] === "\n") i += 1;
      continue;
    }

    if ((ch === "&" && metin[i + 1] === "&") || (ch === "|" && metin[i + 1] === "|")) {
      bitir();
      i += 1;
      continue;
    }

    if (ch === "|") {
      bitir();
      continue;
    }

    mevcut += ch;
  }

  bitir();
  return parcalar;
}

function yorumKes(metin) {
  let sonuc = "";
  let tirnak = null;
  let kacis = false;
  let yorumda = false;

  for (let i = 0; i < metin.length; i += 1) {
    const ch = metin[i];

    if (ch === "\n") {
      yorumda = false;
      sonuc += ch;
      kacis = false;
      continue;
    }

    if (yorumda) continue;

    if (kacis) {
      sonuc += ch;
      kacis = false;
      continue;
    }

    if (tirnak) {
      sonuc += ch;
      if (tirnak === '"' && ch === "\\") kacis = true;
      else if (ch === tirnak) tirnak = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      tirnak = ch;
      sonuc += ch;
      continue;
    }

    if (ch === "\\") {
      sonuc += ch;
      kacis = true;
      continue;
    }

    if (ch === "#" && (i === 0 || /[\s;&|(){}]/.test(metin[i - 1]))) {
      yorumda = true;
      continue;
    }

    sonuc += ch;
  }

  return sonuc;
}

function tokenle(parca) {
  const tokenler = [];
  let mevcut = "";
  let tirnak = null;
  let basladi = false;

  const bitir = () => {
    if (basladi) tokenler.push(mevcut);
    mevcut = "";
    basladi = false;
  };

  for (const ch of String(parca ?? "")) {
    if (tirnak) {
      if (ch === tirnak) tirnak = null;
      else mevcut += ch;
      basladi = true;
      continue;
    }

    if (ch === '"' || ch === "'") {
      tirnak = ch;
      basladi = true;
      continue;
    }

    if (/\s/.test(ch)) {
      bitir();
      continue;
    }

    mevcut += ch;
    basladi = true;
  }

  bitir();
  return tokenler;
}

function norm(yol) {
  let metin = String(yol ?? "").trim().replace(/\\/g, "/");
  metin = metin.replace(/^["'`]+/, "").replace(/["'`,]+$/, "");
  if (!metin) return "";

  const drive = (metin.match(/^[A-Za-z]:/) || [""])[0];
  const unc = metin.startsWith("//");
  const rest = drive ? metin.slice(2) : metin;
  const yigin = [];

  for (const parca of rest.split("/")) {
    if (!parca || parca === ".") continue;
    if (parca === "..") {
      if (yigin.length && yigin[yigin.length - 1] !== "..") yigin.pop();
      else if (!drive && !unc && !metin.startsWith("/")) yigin.push("..");
      continue;
    }
    yigin.push(parca);
  }

  if (unc) return `//${yigin.join("/")}`;
  if (metin.startsWith("/") && !drive) return `/${yigin.join("/")}`;
  return `${drive ? `${drive}/` : ""}${yigin.join("/")}`;
}

function mutlakYol(yol) {
  const metin = String(yol ?? "").trim().replace(/\\/g, "/");
  return /^[A-Za-z]:\//.test(metin) || metin.startsWith("/") || metin.startsWith("//");
}

function coz(yol, cwd) {
  const metin = String(yol ?? "").trim();
  if (mutlakYol(metin)) return norm(metin);
  if (!cwd) return norm(metin);
  return norm(`${String(cwd).replace(/\\/g, "/").replace(/\/+$/, "")}/${metin}`);
}

function cwdIcinde(cwd, yol) {
  const kok = norm(cwd).toLowerCase().replace(/\/+$/, "");
  const hedef = norm(yol).toLowerCase();
  if (!kok) return hedef.startsWith("/");
  return hedef === kok || hedef.startsWith(`${kok}/`);
}

export function korumaliYol(yol, korumali = KORUMALI_VARSAYILAN) {
  const liste = Array.isArray(korumali) ? korumali : KORUMALI_VARSAYILAN;
  const hedef = norm(yol).toLowerCase().replace(/\/+$/, "");
  if (!hedef) return false;

  const taban = hedef.split("/").pop();

  for (const kayit of liste) {
    const korumaliYolNorm = norm(kayit).toLowerCase().replace(/\/+$/, "");
    if (!korumaliYolNorm) continue;
    if (!korumaliYolNorm.includes("/")) {
      if (taban === korumaliYolNorm) return true;
      continue;
    }
    if (hedef === korumaliYolNorm || hedef.startsWith(`${korumaliYolNorm}/`)) return true;
  }

  return false;
}

export function aracPolitikasi({ toolName } = {}) {
  const ad = String(toolName ?? "").toLowerCase();
  if (SHELL_ARACLARI.has(ad)) return { sinif: "shell", kabuk: toolName };
  if (OKUMA_ARACLARI.has(ad)) return { sinif: "okuma" };
  if (YAZMA_ARACLARI.has(ad)) return { sinif: "yazma" };
  return { sinif: "diger" };
}

function komutAdi(token) {
  const parca = String(token ?? "").replace(/\\/g, "/").split("/").pop() || "";
  return parca.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
}

function yazmaHedefleriCikar(parca) {
  const tokenler = tokenle(parca);
  const hedefler = [];
  const ekle = (deger) => {
    const metin = String(deger ?? "").trim();
    if (!metin) return;
    if (/^&?\d+$/.test(metin)) return;
    if (metin === "-" || metin === "&") return;
    hedefler.push(metin);
  };

  for (let i = 0; i < tokenler.length; i += 1) {
    const token = tokenler[i];

    const yonlendirme = token.match(/^(?:\d+|\*)?(>>?)(.*)$/);
    if (yonlendirme) {
      let hedef = yonlendirme[2];
      if (!hedef && i + 1 < tokenler.length) {
        hedef = tokenler[i + 1];
        i += 1;
      }
      ekle(hedef);
      continue;
    }

    const kucuk = token.toLowerCase();
    if (DEGER_BAYRAKLARI.has(kucuk)) {
      const deger = tokenler[i + 1];
      if (deger && !deger.startsWith("-")) {
        ekle(deger);
        i += 1;
      }
      continue;
    }

    const esitBayrak = token.match(/^(?:--output|-outfile|-path|-literalpath|-destination|-target)[:=](.+)$/i);
    if (esitBayrak) ekle(esitBayrak[1]);
  }

  if (tokenler.length) {
    let ilk = 0;
    while (ilk < tokenler.length && komutAdi(tokenler[ilk]) === "sudo") ilk += 1;
    const ad = komutAdi(tokenler[ilk]);

    if (YAZMA_KOMUTLARI.has(ad)) {
      const argumanlar = [];
      for (let i = ilk + 1; i < tokenler.length; i += 1) {
        const token = tokenler[i];
        if (!token || token.startsWith("-")) continue;
        if (/^[|&;<>]+$/.test(token)) continue;
        argumanlar.push(token);
      }

      if (YAZMA_TUM_ARGUMAN.has(ad)) {
        for (const arguman of argumanlar) ekle(arguman);
      } else if (YAZMA_ILK_ARGUMAN.has(ad)) {
        if (argumanlar.length) ekle(argumanlar[0]);
      } else if (argumanlar.length) {
        ekle(argumanlar[argumanlar.length - 1]);
      }
    }
  }

  return [...new Set(hedefler)];
}

export function yazmaHedefleri(parca, cwd) {
  const ham = yazmaHedefleriCikar(parca);
  if (!ham.length) return [];
  if (!cwd && ham.some((hedef) => !mutlakYol(hedef))) return null;
  return ham.map((hedef) => coz(hedef, cwd));
}

function komutMetinleri(args) {
  const metinler = [];
  const ekle = (deger) => {
    if (typeof deger === "string" && deger.trim()) metinler.push(deger);
  };

  ekle(args.command);
  ekle(args.script);
  ekle(args.cmd);

  if (Array.isArray(args.args)) ekle(args.args.join(" "));
  else ekle(args.args);

  return metinler;
}

function yazmaAracHedefleri(args) {
  const hedefler = [];
  const ekle = (deger) => {
    if (typeof deger === "string" && deger.trim()) hedefler.push(deger.trim());
  };

  ekle(args.path);
  ekle(args.file_path);
  ekle(args.filePath);
  ekle(args.file);
  ekle(args.target);
  ekle(args.destination);

  if (Array.isArray(args.paths)) for (const yol of args.paths) ekle(yol);
  if (Array.isArray(args.files)) {
    for (const dosya of args.files) {
      if (typeof dosya === "string") ekle(dosya);
      else ekle(dosya?.path);
    }
  }

  return [...new Set(hedefler)];
}

function kokSilme(parca) {
  const tokenler = tokenle(parca);
  let i = 0;
  while (i < tokenler.length && komutAdi(tokenler[i]) === "sudo") i += 1;
  if (komutAdi(tokenler[i]) !== "rm") return false;

  const argumanlar = tokenler.slice(i + 1);
  const bayraklar = argumanlar.filter((arguman) => arguman.startsWith("-")).join("");
  const kok = argumanlar.some((arguman) => ["/", "/*", "/.", "//"].includes(arguman));
  return kok && /[rRf]/.test(bayraklar);
}

function findYikici(parca) {
  const tokenler = tokenle(parca);
  let i = 0;
  while (i < tokenler.length && komutAdi(tokenler[i]) === "sudo") i += 1;
  if (komutAdi(tokenler[i]) !== "find") return false;
  return tokenler.slice(i + 1).some((arguman) => /^-(delete|exec|ok)$/i.test(arguman));
}

function forkBombasi(metin) {
  return /(?:\w+|:)\s*\(\s*\)\s*\{[^}]*\|[^}]*&[^}]*\}/.test(metin);
}

function duvarBul({ toolName, args, metinler, cwd }) {
  const ad = String(toolName ?? "").toLowerCase();

  if (ad === "find") {
    const parcalar = [args.pattern, args.path, ...(Array.isArray(args.args) ? args.args : [])]
      .filter((deger) => typeof deger === "string")
      .join(" ");
    if (/(?:^|\s)-(delete|exec|ok)(?:\s|$)/i.test(parcalar)) {
      return { ad: "find-destructive", reason: "destructive operation via find" };
    }
  }

  for (const metin of metinler) {
    const temiz = yorumKes(metin);

    if (/\bFormat-Volume\b/i.test(temiz)) {
      return { ad: "format-volume", reason: "disk formatting wall" };
    }
    if (/\bformat\s+[A-Za-z]:/i.test(temiz)) {
      return { ad: "format-disk", reason: "disk formatting wall" };
    }
    if (/\bmkfs(?:\.\w+)?\b/i.test(temiz)) {
      return { ad: "mkfs", reason: "filesystem creation wall" };
    }
    if (/\bdd\b[^\n]*\bof=/i.test(temiz)) {
      return { ad: "dd-of", reason: "dd output target wall" };
    }
    if (forkBombasi(temiz)) {
      return { ad: "fork-bomb", reason: "fork bomb wall" };
    }

    for (const parca of kabukParcala(temiz)) {
      if (kokSilme(parca)) {
        return { ad: "root-delete", reason: "root directory delete wall" };
      }
      if (findYikici(parca)) {
        return { ad: "find-destructive", reason: "destructive operation via find" };
      }

      const hedefler = yazmaHedefleriCikar(parca);
      const korumaliHedef = hedefler.find((hedef) => korumaliYol(hedef) || korumaliYol(coz(hedef, cwd)));
      if (korumaliHedef !== undefined) {
        const removeItem = /\bRemove-Item\b/i.test(parca);
        return {
          ad: removeItem ? "remove-item" : "protected-write",
          reason: `write to protected target: ${korumaliHedef}`,
        };
      }
    }
  }

  for (const hedef of [...yazmaAracHedefleri(args), ...(typeof args.path === "string" ? [args.path] : [])]) {
    if (korumaliYol(hedef) || korumaliYol(coz(hedef, cwd))) {
      return { ad: "protected-write", reason: `write to protected target: ${hedef}` };
    }
  }

  return null;
}

function kapsamKapsar(kapsam, { toolName, sinif }) {
  const arananlar = [String(toolName ?? "").toLowerCase(), String(sinif ?? "").toLowerCase()];

  const kontrol = (deger) => {
    if (deger === undefined || deger === null) return false;
    if (Array.isArray(deger)) return deger.some(kontrol);
    if (deger instanceof Set) return [...deger].some(kontrol);
    const metin = String(deger).trim().toLowerCase();
    if (!metin) return false;
    if (["*", "all", "any", "everything"].includes(metin)) return true;
    return arananlar.includes(metin);
  };

  return kontrol(kapsam);
}

function grantGecerli(grant, { toolName, sinif, now }) {
  if (!grant || typeof grant !== "object") return false;
  const bitis = Number(grant.until);
  if (!(bitis > Number(now))) return false;
  return kapsamKapsar(grant.kapsam, { toolName, sinif });
}

function okumaKomutu(parca) {
  const tokenler = tokenle(parca);
  let i = 0;
  while (i < tokenler.length && komutAdi(tokenler[i]) === "sudo") i += 1;
  const ad = komutAdi(tokenler[i]);

  if (ad === "git") {
    const alt = tokenler.slice(i + 1).find((token) => !token.startsWith("-"));
    return ["status", "diff", "log", "show", "branch", "rev-parse", "ls-files", "blame"].includes(
      String(alt ?? "").toLowerCase(),
    );
  }

  return OKUMA_KOMUTLARI.has(ad);
}

function izinliKomut(parca) {
  const tokenler = tokenle(parca);
  let i = 0;
  while (i < tokenler.length && komutAdi(tokenler[i]) === "sudo") i += 1;
  return IZINLI_KOMUTLAR.has(komutAdi(tokenler[i]));
}

export function kapiKarari({ toolName, input, rank, cwd, grant, now } = {}) {
  const args = input && typeof input === "object" ? input : {};
  const politika = aracPolitikasi({ toolName, input: args });
  const rutbeSayi = Number(rank);
  const rutbe = Number.isFinite(rutbeSayi) ? rutbeSayi : -1;
  const metinler = komutMetinleri(args);
  const duvar = duvarBul({ toolName, args, metinler, cwd });

  if (duvar) {
    return { action: "deny", wall: duvar.ad, via: "wall", reason: duvar.reason };
  }

  if (grantGecerli(grant, { toolName, sinif: politika.sinif, now })) {
    return { action: "allow", via: "grant", reason: `valid grant: ${grant.kapsam}` };
  }

  if (politika.sinif === "shell") {
    const metin = metinler[0] ?? "";
    const parcalar = kabukParcala(yorumKes(metin));
    if (!parcalar.length) return { action: "confirm", reason: "empty or unreadable command" };

    const hedefler = [];
    for (const parca of parcalar) {
      for (const hedef of yazmaHedefleriCikar(parca)) {
        hedefler.push(coz(hedef, cwd));
      }
    }

    if (hedefler.length) {
      if (!cwd) return { action: "confirm", reason: "write target exists but cwd is missing" };
      const disarida = hedefler.filter((hedef) => !cwdIcinde(cwd, hedef));
      if (disarida.length) {
        return { action: "confirm", reason: `write outside project: ${disarida[0]}` };
      }
    }

    if (!hedefler.length && parcalar.every(okumaKomutu)) {
      return { action: "allow", reason: "read command allowed" };
    }

    if (rutbe >= 2) {
      return { action: "allow", via: "rank", reason: "gold and above: commands outside walls allowed" };
    }

    if (rutbe >= 1 && parcalar.every(izinliKomut)) {
      return { action: "allow", via: "rank", reason: "silver: allowed command permitted" };
    }

    return { action: "confirm", reason: rutbe < 0 ? "passive: command requires approval" : "command requires approval at this rank" };
  }

  if (politika.sinif === "yazma") {
    const hedefler = yazmaAracHedefleri(args);
    if (!hedefler.length) {
      return { action: "confirm", reason: "write target unreadable" };
    }

    if (!cwd) return { action: "confirm", reason: "cwd missing: write requires approval" };

    const cozulmus = hedefler.map((hedef) => coz(hedef, cwd));
    const disarida = cozulmus.filter((hedef) => !cwdIcinde(cwd, hedef));
    if (disarida.length) {
      return { action: "confirm", reason: `write outside project: ${disarida[0]}` };
    }

    if (rutbe >= 1) {
      return { action: "allow", via: "rank", reason: "project-internal write allowed" };
    }

    return { action: "confirm", reason: rutbe < 0 ? "passive: write requires approval" : "bronze: write requires approval" };
  }

  if (politika.sinif === "diger") {
    if (rutbe >= 1) {
      return { action: "allow", via: "rank", reason: "this tool is allowed by rank" };
    }
    return { action: "confirm", reason: rutbe < 0 ? "passive: this tool requires approval" : "this tool requires approval" };
  }

  return { action: "allow", reason: "read allowed" };
}
