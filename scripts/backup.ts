/**
 * Denná záloha databázy.
 *
 * Vytvorí kompletný SQL dump a nahrá ho do S3 / Cloudflare R2. Ak S3 nie je
 * nastavené, uloží zálohu na disk (užitočné pri lokálnom spustení).
 *
 * Prečo vlastný dump a nie pg_dump: v kontajneri s aplikáciou nemusí byť
 * nainštalovaný klient PostgreSQL v správnej verzii. Tento skript číta dáta
 * cez to isté spojenie, ktoré používa appka, takže funguje vždy.
 *
 * Spustenie:  npm run backup
 * Odporúčaný plán: raz denne v noci.
 */
import "dotenv/config";
import { gzipSync } from "zlib";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import postgres from "postgres";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Poradie rešpektuje cudzie kľúče – pri obnove sa dá prehrať zhora nadol.
const TABULKY = [
  "pouzivatelia",
  "firma",
  "partneri",
  "zakazky",
  "bank_ucty",
  "bank_pohyby",
  "prijate_doklady",
  "ciselne_rady",
  "faktury",
  "faktura_polozky",
  "uhrady",
  "odoslane_maily",
  "prijate_maily",
  "exporty",
  "audit_log",
];

function escapuj(hodnota: unknown): string {
  if (hodnota === null || hodnota === undefined) return "NULL";
  if (typeof hodnota === "number") return String(hodnota);
  if (typeof hodnota === "boolean") return hodnota ? "true" : "false";
  if (hodnota instanceof Date) return `'${hodnota.toISOString()}'`;
  if (typeof hodnota === "object") return `'${JSON.stringify(hodnota).replace(/'/g, "''")}'::jsonb`;
  return `'${String(hodnota).replace(/'/g, "''")}'`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Chýba DATABASE_URL.");

  const sql = postgres(url, { max: 1, prepare: false });
  const casovaPeciatka = new Date().toISOString().replace(/[:.]/g, "-");
  const riadky: string[] = [
    `-- Záloha databázy Doklady`,
    `-- Vytvorené: ${new Date().toISOString()}`,
    `-- Obnova: psql "$DATABASE_URL" -f zaloha.sql  (najprv spusti migrácie)`,
    ``,
    `BEGIN;`,
    ``,
  ];

  let celkomRiadkov = 0;

  for (const tabulka of TABULKY) {
    const data = await sql`SELECT * FROM ${sql(tabulka)}`;
    if (data.length === 0) {
      riadky.push(`-- ${tabulka}: prázdna`, ``);
      continue;
    }

    const stlpce = Object.keys(data[0]);
    riadky.push(`-- ${tabulka}: ${data.length} riadkov`);
    riadky.push(`DELETE FROM "${tabulka}";`);

    // Po dávkach, aby jeden INSERT nemal desaťtisíce riadkov.
    for (let i = 0; i < data.length; i += 500) {
      const davka = data.slice(i, i + 500);
      const hodnoty = davka
        .map((r) => `  (${stlpce.map((c) => escapuj((r as Record<string, unknown>)[c])).join(", ")})`)
        .join(",\n");
      riadky.push(`INSERT INTO "${tabulka}" (${stlpce.map((c) => `"${c}"`).join(", ")}) VALUES\n${hodnoty};`);
    }

    riadky.push(``);
    celkomRiadkov += data.length;
  }

  riadky.push(`COMMIT;`);
  await sql.end();

  const obsah = Buffer.from(riadky.join("\n"), "utf8");
  const stlacene = gzipSync(obsah, { level: 9 });
  const nazov = `doklady-${casovaPeciatka}.sql.gz`;

  const bucket = process.env.BACKUP_BUCKET ?? process.env.S3_BUCKET;

  if (bucket && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    const klient = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });

    const kluc = `${process.env.BACKUP_PREFIX ?? "zalohy/"}${nazov}`;
    await klient.send(
      new PutObjectCommand({ Bucket: bucket, Key: kluc, Body: stlacene, ContentType: "application/gzip" }),
    );

    console.log(`Záloha nahraná: ${bucket}/${kluc}`);
  } else {
    const priecinok = process.env.BACKUP_DIR ?? path.join(process.cwd(), ".zalohy");
    await mkdir(priecinok, { recursive: true });
    const cesta = path.join(priecinok, nazov);
    await writeFile(cesta, stlacene);
    console.log(`S3 nie je nastavené — záloha uložená lokálne: ${cesta}`);
  }

  console.log(
    `Zazálohovaných ${celkomRiadkov} riadkov z ${TABULKY.length} tabuliek, veľkosť ${(stlacene.length / 1024).toFixed(1)} kB.`,
  );
}

main().catch((e) => {
  console.error("Záloha zlyhala:", e);
  process.exit(1);
});
