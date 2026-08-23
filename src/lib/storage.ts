import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { createId } from "./id";

/**
 * Úložisko súborov (skeny dokladov, PDF faktúry, exporty).
 *
 * V produkcii na Railway je súborový systém efemérny – po každom nasadení sa
 * vymaže. Preto sa v produkcii používa S3-kompatibilné úložisko (Cloudflare R2).
 * Ak nie sú nastavené S3 premenné, spadne to na lokálny disk, čo stačí pre vývoj.
 */

const S3_BUCKET = process.env.S3_BUCKET;
const useS3 = Boolean(S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);

const LOCAL_DIR = process.env.LOCAL_STORAGE_DIR ?? path.join(process.cwd(), ".data", "subory");

let s3: S3Client | null = null;
function klient(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return s3;
}

export function jeS3Nakonfigurovane(): boolean {
  return useS3;
}

function bezpecnyNazov(nazov: string): string {
  return nazov
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

/** Uloží súbor a vráti jeho kľúč (nie URL – URL sa generuje cez /api/subor). */
export async function ulozSubor(
  data: Buffer | Uint8Array,
  originalnyNazov: string,
  priecinok = "doklady",
): Promise<{ kluc: string; nazov: string; velkost: number }> {
  const nazov = bezpecnyNazov(originalnyNazov);
  const kluc = `${priecinok}/${new Date().getFullYear()}/${createId()}-${nazov}`;
  const buf = Buffer.from(data);

  if (useS3) {
    await klient().send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: kluc,
        Body: buf,
        ContentType: typPodlaPripony(nazov),
      }),
    );
  } else {
    const cesta = path.join(LOCAL_DIR, kluc);
    await mkdir(path.dirname(cesta), { recursive: true });
    await writeFile(cesta, buf);
  }

  return { kluc, nazov, velkost: buf.length };
}

export async function nacitajSubor(kluc: string): Promise<Buffer> {
  if (useS3) {
    const res = await klient().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: kluc }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  return readFile(path.join(LOCAL_DIR, kluc));
}

export async function zmazSubor(kluc: string): Promise<void> {
  try {
    if (useS3) {
      await klient().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: kluc }));
    } else {
      await unlink(path.join(LOCAL_DIR, kluc));
    }
  } catch {
    // súbor už neexistuje – nič neriešime
  }
}

export function typPodlaPripony(nazov: string): string {
  const ext = nazov.toLowerCase().split(".").pop() ?? "";
  const mapa: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    heic: "image/heic",
    gif: "image/gif",
    xml: "application/xml",
    csv: "text/csv",
    zip: "application/zip",
    txt: "text/plain",
  };
  return mapa[ext] ?? "application/octet-stream";
}
