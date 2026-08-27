"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prijateDoklady, partneri, auditLog } from "@/db/schema";
import { vyzadujPrihlasenie, vyzadujMajitela } from "@/lib/auth";
import { ulozSubor, zmazSubor } from "@/lib/storage";
import { vytazDoklad } from "@/lib/ocr";
import { centsToDb, toCents } from "@/lib/money";
import { rozpocitajZCelkovej, normalizujSadzbu } from "@/lib/dph";
import { zInputDatumu } from "@/lib/stavy";
import { ChybaVstupu, obal } from "@/lib/chyby";

const MAX_SUBOR = 20 * 1024 * 1024;

async function zapisAudit(
  entitaId: string,
  akcia: string,
  pouzivatelId: string,
  detail?: string,
): Promise<void> {
  await db.insert(auditLog).values({ entita: "prijaty_doklad", entitaId, akcia, pouzivatelId, detail });
}

/** Nahranie súboru + OCR. Vracia predvyplnené hodnoty pre formulár. */
async function nahrajASkusOcrTelo(formData: FormData) {
  const session = await vyzadujPrihlasenie();
  const subor = formData.get("subor");

  if (!(subor instanceof File) || subor.size === 0) {
    return { ok: false as const, chyba: "Nevybral si žiadny súbor." };
  }
  if (subor.size > MAX_SUBOR) {
    return { ok: false as const, chyba: "Súbor je väčší než 20 MB. Zmenši fotku a skús znova." };
  }

  const data = Buffer.from(await subor.arrayBuffer());
  const ulozeny = await ulozSubor(data, subor.name, "doklady");

  let ocr = null;
  let ocrChyba: string | null = null;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      ocr = await vytazDoklad({ data, mimeType: subor.type });
    } catch (e) {
      ocrChyba = e instanceof Error ? e.message : String(e);
    }
  } else {
    ocrChyba = "OCR nie je nakonfigurované (chýba ANTHROPIC_API_KEY) – vyplň údaje ručne.";
  }

  let dodavatelId: string | null = null;
  if (ocr?.dodavatelIco) {
    const ico = ocr.dodavatelIco.replace(/\D/g, "").padStart(8, "0");
    const [existujuci] = await db.select().from(partneri).where(eq(partneri.ico, ico)).limit(1);
    dodavatelId = existujuci?.id ?? null;
  }

  return {
    ok: true as const,
    subor: { kluc: ulozeny.kluc, nazov: ulozeny.nazov, typ: subor.type },
    ocr,
    ocrChyba,
    dodavatelId,
    pouzivatelId: session.id,
  };
}

async function ulozDokladTelo(formData: FormData) {
  const session = await vyzadujPrihlasenie();

  const id = String(formData.get("id") ?? "");
  const sumaCelkom = toCents(String(formData.get("sumaCelkom") ?? "0"));
  const prenosDph = formData.get("prenosDph") === "on";
  const sadzba = prenosDph ? 0 : normalizujSadzbu(Number(formData.get("sadzbaDph") ?? 23));

  if (sumaCelkom <= 0) {
    throw new ChybaVstupu("Celková suma musí byť väčšia než nula.");
  }

  const datumVystavenia = zInputDatumu(String(formData.get("datumVystavenia") ?? ""));
  if (!datumVystavenia) throw new ChybaVstupu("Dátum vystavenia je povinný.");

  // Ak používateľ zadal základ ručne a sedí, rešpektujeme ho. Inak rozpočítame.
  const zadanyZaklad = toCents(String(formData.get("zakladDph") ?? "0"));
  const zadanaDph = toCents(String(formData.get("sumaDph") ?? "0"));
  const sedi = zadanyZaklad > 0 && zadanyZaklad + zadanaDph === sumaCelkom;
  const { zaklad, dph } = sedi
    ? { zaklad: zadanyZaklad, dph: zadanaDph }
    : rozpocitajZCelkovej(sumaCelkom, sadzba);

  const hodnoty = {
    typ: String(formData.get("typ") ?? "BLOCEK") as "BLOCEK" | "FAKTURA_PRIJATA" | "POKLADNICNY_VYDAJ" | "INY",
    cisloDokladu: str(formData.get("cisloDokladu")),
    dodavatelId: str(formData.get("dodavatelId")),
    zakazkaId: str(formData.get("zakazkaId")),
    kategoria: String(formData.get("kategoria") ?? "MATERIAL") as "MATERIAL",
    datumVystavenia,
    datumSplatnosti: zInputDatumu(String(formData.get("datumSplatnosti") ?? "")),
    variabilnySymbol: str(formData.get("variabilnySymbol")),
    zakladDph: centsToDb(zaklad),
    sadzbaDph: sadzba,
    sumaDph: centsToDb(dph),
    sumaCelkom: centsToDb(sumaCelkom),
    prenosDph,
    popis: str(formData.get("popis")),
    poznamka: str(formData.get("poznamka")),
    updatedAt: new Date(),
  };

  if (id) {
    await db.update(prijateDoklady).set(hodnoty).where(eq(prijateDoklady.id, id));
    await zapisAudit(id, "ZMENA", session.id);
    revalidatePath(`/prijate/${id}`);
    revalidatePath("/prijate");
    redirect(`/prijate/${id}`);
  }

  const [novy] = await db
    .insert(prijateDoklady)
    .values({
      ...hodnoty,
      suborUrl: str(formData.get("suborKluc")),
      suborNazov: str(formData.get("suborNazov")),
      suborTyp: str(formData.get("suborTyp")),
      ocrData: formData.get("ocrData") ? JSON.parse(String(formData.get("ocrData"))) : null,
      ocrConfidence: formData.get("ocrConfidence") ? Number(formData.get("ocrConfidence")) : null,
      ocrSpustene: Boolean(formData.get("ocrData")),
      zdroj: "RUCNE",
      stav: "NA_SCHVALENIE",
      vytvorilId: session.id,
    })
    .returning();

  await zapisAudit(novy.id, "VYTVORENIE", session.id);
  revalidatePath("/prijate");
  revalidatePath("/");
  redirect(`/prijate/${novy.id}`);
}

async function schvalDokladTelo(id: string) {
  const session = await vyzadujMajitela();
  await db
    .update(prijateDoklady)
    .set({ stav: "SCHVALENY", schvalilId: session.id, schvalenyDna: new Date(), zamietnutieDovod: null })
    .where(eq(prijateDoklady.id, id));
  await zapisAudit(id, "SCHVALENIE", session.id);
  revalidatePath(`/prijate/${id}`);
  revalidatePath("/prijate");
  revalidatePath("/");
}

async function zamietniDokladTelo(id: string, dovod: string) {
  const session = await vyzadujMajitela();
  if (!dovod.trim()) throw new ChybaVstupu("Uveď dôvod zamietnutia.");
  await db
    .update(prijateDoklady)
    .set({ stav: "ZAMIETNUTY", schvalilId: session.id, schvalenyDna: new Date(), zamietnutieDovod: dovod })
    .where(eq(prijateDoklady.id, id));
  await zapisAudit(id, "ZAMIETNUTIE", session.id, dovod);
  revalidatePath(`/prijate/${id}`);
  revalidatePath("/prijate");
}

async function zmazDokladTelo(id: string) {
  const session = await vyzadujMajitela();
  const [d] = await db.select().from(prijateDoklady).where(eq(prijateDoklady.id, id)).limit(1);
  if (!d) throw new ChybaVstupu("Doklad sa nenašiel.");
  if (d.stav === "ZAUCTOVANY") throw new ChybaVstupu("Zaúčtovaný doklad sa nedá zmazať.");

  await db.delete(prijateDoklady).where(eq(prijateDoklady.id, id));
  if (d.suborUrl) await zmazSubor(d.suborUrl);
  await zapisAudit(id, "ZMAZANIE", session.id, d.cisloDokladu ?? undefined);

  revalidatePath("/prijate");
  redirect("/prijate");
}

/** Znovu spustí OCR nad už uloženým súborom. */
async function preskenujTelo(id: string) {
  const session = await vyzadujPrihlasenie();
  const [d] = await db.select().from(prijateDoklady).where(eq(prijateDoklady.id, id)).limit(1);
  if (!d?.suborUrl) throw new ChybaVstupu("Doklad nemá nahraný súbor.");

  const { nacitajSubor } = await import("@/lib/storage");
  const data = await nacitajSubor(d.suborUrl);
  const ocr = await vytazDoklad({ data, mimeType: d.suborTyp ?? "image/jpeg" });

  const sumaCelkom = toCents(ocr.sumaCelkom ?? 0);
  const sadzba = ocr.prenosDph ? 0 : normalizujSadzbu(ocr.sadzbaDph ?? 23);
  const { zaklad, dph } = rozpocitajZCelkovej(sumaCelkom, sadzba);

  await db
    .update(prijateDoklady)
    .set({
      cisloDokladu: ocr.cisloDokladu ?? d.cisloDokladu,
      variabilnySymbol: ocr.variabilnySymbol ?? d.variabilnySymbol,
      ...(sumaCelkom > 0
        ? {
            sumaCelkom: centsToDb(sumaCelkom),
            zakladDph: centsToDb(zaklad),
            sumaDph: centsToDb(dph),
            sadzbaDph: sadzba,
          }
        : {}),
      ocrData: ocr,
      ocrConfidence: ocr.istota,
      ocrSpustene: true,
      updatedAt: new Date(),
    })
    .where(eq(prijateDoklady.id, id));

  await zapisAudit(id, "OCR", session.id);
  revalidatePath(`/prijate/${id}`);
}

function str(v: FormDataEntryValue | null): string | null {
  const s = v === null ? "" : String(v).trim();
  return s.length ? s : null;
}

/* Chyby vstupu sa vracajú, nevyhadzujú – pozri src/lib/chyby.ts. */

export async function nahrajASkusOcr(...argumenty: Parameters<typeof nahrajASkusOcrTelo>) {
  return obal(() => nahrajASkusOcrTelo(...argumenty));
}

export async function ulozDoklad(...argumenty: Parameters<typeof ulozDokladTelo>) {
  return obal(() => ulozDokladTelo(...argumenty));
}

export async function schvalDoklad(...argumenty: Parameters<typeof schvalDokladTelo>) {
  return obal(() => schvalDokladTelo(...argumenty));
}

export async function zamietniDoklad(...argumenty: Parameters<typeof zamietniDokladTelo>) {
  return obal(() => zamietniDokladTelo(...argumenty));
}

export async function zmazDoklad(...argumenty: Parameters<typeof zmazDokladTelo>) {
  return obal(() => zmazDokladTelo(...argumenty));
}

export async function preskenuj(...argumenty: Parameters<typeof preskenujTelo>) {
  return obal(() => preskenujTelo(...argumenty));
}
