import nodemailer, { type Transporter } from "nodemailer";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { odoslaneMaily } from "@/db/schema";

/**
 * Odosielanie e-mailov cez SMTP (Websupport, alebo ľubovoľný iný poskytovateľ).
 *
 * Každý mail sa najprv zapíše do databázy so stavom CAKA a až potom sa odošle.
 * Ak odoslanie zlyhá, záznam ostane a dá sa poslať znova – nič sa nestratí a
 * v systéme je vždy vidno, čo komu odišlo.
 */

const MAX_POKUSOV = 3;

let transporter: Transporter | null = null;

function klient(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error("SMTP nie je nakonfigurované – chýba SMTP_HOST, SMTP_USER alebo SMTP_PASSWORD.");
  }

  const port = Number(process.env.SMTP_PORT ?? 465);

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 2,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  return transporter;
}

export function jeMailNakonfigurovany(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function overSmtp(): Promise<{ ok: boolean; chyba?: string }> {
  try {
    await klient().verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, chyba: e instanceof Error ? e.message : String(e) };
  }
}

export interface Priloha {
  nazov: string;
  obsah: Buffer;
  typ: string;
}

export interface MailVstup {
  prijemca: string;
  kopia?: string;
  predmet: string;
  telo: string; // čistý text
  html?: string;
  prilohy?: Priloha[];
  fakturaId?: string;
}

/** Zaradí mail do fronty a hneď sa ho pokúsi odoslať. */
export async function posliMail(vstup: MailVstup): Promise<{ id: string; odoslany: boolean; chyba?: string }> {
  const [zaznam] = await db
    .insert(odoslaneMaily)
    .values({
      fakturaId: vstup.fakturaId ?? null,
      prijemca: vstup.prijemca,
      kopia: vstup.kopia ?? null,
      predmet: vstup.predmet,
      telo: vstup.telo,
      prilohy: vstup.prilohy?.map((p) => ({ nazov: p.nazov, velkost: p.obsah.length })) ?? null,
      stav: "CAKA",
    })
    .returning();

  const vysledok = await odosli(zaznam.id, vstup);
  return { id: zaznam.id, ...vysledok };
}

async function odosli(
  zaznamId: string,
  vstup: MailVstup,
): Promise<{ odoslany: boolean; chyba?: string }> {
  try {
    const odosielatel = process.env.SMTP_FROM ?? process.env.SMTP_USER!;

    await klient().sendMail({
      from: odosielatel,
      to: vstup.prijemca,
      cc: vstup.kopia || undefined,
      replyTo: process.env.SMTP_REPLY_TO || undefined,
      subject: vstup.predmet,
      text: vstup.telo,
      html: vstup.html ?? textNaHtml(vstup.telo),
      attachments: vstup.prilohy?.map((p) => ({
        filename: p.nazov,
        content: p.obsah,
        contentType: p.typ,
      })),
    });

    await db
      .update(odoslaneMaily)
      .set({ stav: "ODOSLANY", odoslanyDna: new Date(), chyba: null })
      .where(eq(odoslaneMaily.id, zaznamId));

    return { odoslany: true };
  } catch (e) {
    const chyba = e instanceof Error ? e.message : String(e);
    await db
      .update(odoslaneMaily)
      .set({ stav: "CHYBA", chyba, pokusy: (await pocetPokusov(zaznamId)) + 1 })
      .where(eq(odoslaneMaily.id, zaznamId));
    return { odoslany: false, chyba };
  }
}

async function pocetPokusov(id: string): Promise<number> {
  const [z] = await db.select({ p: odoslaneMaily.pokusy }).from(odoslaneMaily).where(eq(odoslaneMaily.id, id));
  return z?.p ?? 0;
}

/** Znovu odošle maily, ktoré predtým zlyhali. Volá sa z cronu. */
export async function preposliZlyhane(): Promise<{ pokusov: number; uspesnych: number }> {
  const cakajuce = await db
    .select()
    .from(odoslaneMaily)
    .where(and(eq(odoslaneMaily.stav, "CHYBA"), lt(odoslaneMaily.pokusy, MAX_POKUSOV)))
    .limit(20);

  let uspesnych = 0;
  for (const m of cakajuce) {
    // Prílohy sa neukladajú – pri opakovaní ide len text. Faktúru s PDF treba
    // poslať znovu z detailu faktúry.
    const v = await odosli(m.id, {
      prijemca: m.prijemca,
      kopia: m.kopia ?? undefined,
      predmet: m.predmet,
      telo: m.telo,
    });
    if (v.odoslany) uspesnych++;
  }

  return { pokusov: cakajuce.length, uspesnych };
}

function textNaHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1c1c1e;white-space:pre-wrap">${escaped}</div>`;
}
