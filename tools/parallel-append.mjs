import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { olayYaz, olaylariOku, kilitAl } from "../extensions/skor-store.mjs";

const KENDI = fileURLToPath(import.meta.url);

const calistirIsci = (dosya, adet) =>
  new Promise((resolve, reject) => {
    const cocuk = spawn(process.execPath, [KENDI, "--worker", dosya, String(adet)], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    cocuk.on("error", reject);
    cocuk.on("exit", (kod) => {
      if (kod === 0) resolve();
      else reject(new Error(`worker exit code ${kod}`));
    });
  });

const isci = (dosya, adet) => {
  const anahtarOnek = `is:${process.pid}`;
  const birak = kilitAl(`${dosya}.kilit`, { deneme: 200, aralikMs: 5 });
  try {
    for (let i = 0; i < adet; i += 1) {
      olayYaz(
        dosya,
        {
          tip: "istek",
          delta: 1,
          anahtar: `${anahtarOnek}:${i}`,
          ts: Date.now() + i,
        },
        { kilit: birak },
      );
    }
  } finally {
    birak();
  }
};

const ebeveyn = async () => {
  const isciSayisi = 4;
  const adet = 25;
  const dizin = mkdtempSync(join(tmpdir(), "skor-paralel-"));
  const dosya = join(dizin, "olaylar.jsonl");
  try {
    await Promise.all(Array.from({ length: isciSayisi }, () => calistirIsci(dosya, adet)));
    const { olaylar } = olaylariOku(dosya);
    const beklenen = isciSayisi * adet;
    const kayip = Math.max(0, beklenen - olaylar.length);
    console.log(`{written:${olaylar.length}, expected:${beklenen}, lost:${kayip}}`);
    if (kayip !== 0) process.exitCode = 1;
  } finally {
    rmSync(dizin, { recursive: true, force: true });
  }
};

const [, , komut, dosya, adetMetni] = process.argv;

if (komut === "--worker" && dosya) {
  isci(dosya, Math.max(0, Math.trunc(Number(adetMetni) || 0)));
} else {
  await ebeveyn();
}
