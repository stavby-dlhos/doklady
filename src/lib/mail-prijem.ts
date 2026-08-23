import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment } from "mailparser";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { prijateDoklady, prijateMaily, partneri } from "@/db/schema";
import { ulozSubor } from "./storage";
import { vytazDoklad } from "./ocr";
import { centsToDb, toCents } from "./money";
import { rozpocitajZCelkovej } from "./dph";

/**
 * Elektronická podateľňa.
 *
 * Na adresu (napr. doklady@stavbydlhos.sk) prepošleš faktúru od dodávateľa
 * alebo odfotíš bloček z mobilu. Systém si mailbox raz za čas prezrie, prílohy
 * uloží, prežene cez OCR a založí doklad v stave NOVY na kontrolu.
 *
 * Mail sa nikdy nemaže – len sa označí ako prečítaný. Originál tak ostáva
 * v schránke ako záloha.
 */

const POVOLENE_TYPY = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
];

const MAX_VELKOST = 20 * 1024 * 1024; // 20 MB

export interface VysledokPrijmu {
  spracovanychMailov: number;
  vytvorenychDokladov: number;
  preskocenych: number;
  chyby: string[];
}

export function jeSchrankaNakonfigurovana(): boolean {
  return Boolean(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASSWORD);
}

export async function stiahniNoveDoklady(vytvorilId: string): Promise<VysledokPrijmu> {
  if (!jeSchrankaNakonfigurovana()) {
    throw new Error("IMAP nie je nakonfigurovaný – chýba IMAP_HOST, IMAP_USER alebo IMAP_PASSWORD.");
  }

  const vysledok: VysledokPrijmu = {
    spracovanychMailov: 0,
    vytvorenychDokladov: 0,
    preskocenych: 0,
    chyby: [],
  };

  const klient = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASSWORD! },
    logger: false,
    socketTimeout: 60_000,
  });

  await klient.connect();
  const zamok = await klient.getMailboxLock(process.env.IMAP_MAILBOX ?? "INBOX");

  try {
    const neprecitane = await klient.search({ seen: false }, { uid: true });
    const uids = (neprecitane || []).slice(0, 50);

    for (const uid of uids) {
      try {
        const sprava = await klient.fetchOne(String(uid), { source: true }, { uid: true });
        if (!sprava || !sprava.source) continue;

        const parsed = await simpleParser(sprava.source);
        const messageId = parsed.messageId ?? `uid-${uid}-${parsed.date?.toISOString() ?? ""}`;

        // Už spracované? Preskoč – ochrana pred duplicitami.
        const [existujuci] = await db
          .select({ id: prijateMaily.id })
          .from(prijateMaily)
          .where(eq(prijateMaily.messageId, messageId))
          .limit(1);

        if (existujuci) {
          await klient.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          vysledok.preskocenych++;
          continue;
        }

        const odosielatel = parsed.from?.value?.[0]?.address ?? "neznámy";
        const prilohy = (parsed.attachments ?? []).filter(jePouzitelna);

        const [zaznam] = await db
          .insert(prijateMaily)
          .values({
            messageId,
            odosielatel,
            predmet: parsed.subject?.slice(0, 500) ?? null,
            datum: parsed.date ?? new Date(),
            telo: (parsed.text ?? "").slice(0, 5000) || null,
            pocetPriloh: prilohy.length,
            stav: prilohy.length ? "NOVY" : "IGNOROVANY",
          })
          .returning();

        vysledok.spracovanychMailov++;

        if (!prilohy.length) {
          await klient.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          continue;
        }

        const vytvorene: string[] = [];
        for (const p of prilohy) {
          try {
            const id = await zalozDokladZPrilohy(p, odosielatel, vytvorilId);
            vytvorene.push(id);
            vysledok.vytvorenychDokladov++;
          } catch (e) {
            vysledok.chyby.push(
              `Príloha „${p.filename ?? "bez názvu"}" od ${odosielatel}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        await db
          .update(prijateMaily)
          .set({
            stav: vytvorene.length ? "SPRACOVANY" : "CHYBA",
            vytvoreneDoklady: vytvorene,
            chyba: vytvorene.length ? null : "Z príloh sa nepodarilo založiť žiadny doklad.",
          })
          .where(eq(prijateMaily.id, zaznam.id));

        await klient.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      } catch (e) {
        vysledok.chyby.push(`Správa ${uid}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    zamok.release();
    await klient.logout().catch(() => {});
  }

  return vysledok;
}

function jePouzitelna(p: Attachment): boolean {
  const typ = (p.contentType ?? "").toLowerCase();
  if (!POVOLENE_TYPY.includes(typ)) return false;
  if (!p.content || p.content.length === 0) return false;
  if (p.content.length > MAX_VELKOST) return false;
  // Podpisy v pätičkách e-mailov sú spravidla malé obrázky – tie nechceme.
  if (typ.startsWith("image/") && p.content.length < 8_000) return false;
  return true;
}

async function zalozDokladZPrilohy(
  priloha: Attachment,
  odosielatel: string,
  vytvorilId: string,
): Promise<string> {
  const nazov = priloha.filename ?? `priloha-${Date.now()}`;
  const ulozeny = await ulozSubor(priloha.content as Buffer, nazov, "doklady");

  let ocr: Awaited<ReturnType<typeof vytazDoklad>> | null = null;
  let ocrChyba: string | null = null;

  try {
    ocr = await vytazDoklad({ data: priloha.content as Buffer, mimeType: priloha.contentType });
  } catch (e) {
    ocrChyba = e instanceof Error ? e.message : String(e);
  }

  const sumaCelkom = toCents(ocr?.sumaCelkom ?? 0);
  const sadzba = ocr?.sadzbaDph ?? 23;

  // Ak OCR našlo základ aj DPH, použijeme ich. Inak sumu rozpočítame.
  let zaklad = toCents(ocr?.zakladDph ?? 0);
  let dph = toCents(ocr?.sumaDph ?? 0);
  if (sumaCelkom > 0 && (zaklad === 0 || zaklad + dph !== sumaCelkom)) {
    const r = rozpocitajZCelkovej(sumaCelkom, ocr?.prenosDph ? 0 : sadzba);
    zaklad = r.zaklad;
    dph = r.dph;
  }

  const dodavatelId = ocr?.dodavatelIco ? await najdiAleboZalozPartnera(ocr.dodavatelIco, ocr.dodavatelNazov) : null;

  const [doklad] = await db
    .insert(prijateDoklady)
    .values({
      typ: ocr?.typDokladu ?? "INY",
      cisloDokladu: ocr?.cisloDokladu ?? null,
      dodavatelId,
      kategoria: ocr?.kategoria ?? "MATERIAL",
      zdroj: "EMAIL",
      datumVystavenia: parsujDatum(ocr?.datumVystavenia) ?? new Date(),
      datumSplatnosti: parsujDatum(ocr?.datumSplatnosti),
      variabilnySymbol: ocr?.variabilnySymbol ?? null,
      zakladDph: centsToDb(zaklad),
      sadzbaDph: ocr?.prenosDph ? 0 : sadzba,
      sumaDph: centsToDb(dph),
      sumaCelkom: centsToDb(sumaCelkom),
      mena: ocr?.mena ?? "EUR",
      prenosDph: ocr?.prenosDph ?? false,
      stav: "NOVY",
      popis: ocr?.popis ?? null,
      poznamka: [
        `Prijaté e-mailom od ${odosielatel}.`,
        ocr?.poznamkaKKontrole ? `OCR upozorňuje: ${ocr.poznamkaKKontrole}` : null,
        ocrChyba ? `OCR zlyhalo: ${ocrChyba} – údaje treba vyplniť ručne.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      suborUrl: ulozeny.kluc,
      suborNazov: ulozeny.nazov,
      suborTyp: priloha.contentType,
      ocrData: ocr ?? null,
      ocrConfidence: ocr?.istota ?? null,
      ocrSpustene: true,
      vytvorilId,
    })
    .returning();

  return doklad.id;
}

async function najdiAleboZalozPartnera(ico: string, nazov: string | null): Promise<string | null> {
  const cisteIco = ico.replace(/\D/g, "").padStart(8, "0");
  if (cisteIco.length !== 8) return null;

  const [existujuci] = await db.select().from(partneri).where(eq(partneri.ico, cisteIco)).limit(1);
  if (existujuci) return existujuci.id;

  if (!nazov) return null;

  const [novy] = await db
    .insert(partneri)
    .values({ typ: "DODAVATEL", nazov, ico: cisteIco, poznamka: "Založené automaticky z e-mailu." })
    .returning();

  return novy.id;
}

function parsujDatum(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Počet mailov čakajúcich na spracovanie – pre odznak v menu. */
export async function pocetNovychMailov(): Promise<number> {
  const [r] = await db
    .select({ pocet: sql<number>`count(*)::int` })
    .from(prijateMaily)
    .where(eq(prijateMaily.stav, "NOVY"));
  return r?.pocet ?? 0;
}
