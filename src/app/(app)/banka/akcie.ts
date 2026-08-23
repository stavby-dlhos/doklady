"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankPohyby, bankUcty } from "@/db/schema";
import { vyzadujPrihlasenie } from "@/lib/auth";
import { parsujVypis } from "@/lib/vypis";
import { sparujPohyby, sparujRucne } from "@/lib/parovanie";
import { centsToDb } from "@/lib/money";
import { createId } from "@/lib/id";

export interface VysledokImportu {
  ok: boolean;
  chyba?: string;
  nacitanych?: number;
  novych?: number;
  duplicit?: number;
  sparovanychFaktur?: number;
  sparovanychDokladov?: number;
  varovania?: string[];
  detaily?: string[];
}

export async function importujVypis(formData: FormData): Promise<VysledokImportu> {
  await vyzadujPrihlasenie();

  const subor = formData.get("subor");
  const ucetId = String(formData.get("ucetId") ?? "");

  if (!(subor instanceof File) || subor.size === 0) {
    return { ok: false, chyba: "Nevybral si žiadny súbor." };
  }
  if (!ucetId) {
    return { ok: false, chyba: "Vyber bankový účet, ku ktorému výpis patrí." };
  }
  if (subor.size > 15 * 1024 * 1024) {
    return { ok: false, chyba: "Súbor je príliš veľký (max 15 MB)." };
  }

  const [ucet] = await db.select().from(bankUcty).where(eq(bankUcty.id, ucetId)).limit(1);
  if (!ucet) return { ok: false, chyba: "Bankový účet sa nenašiel." };

  let vysledok;
  try {
    const obsah = await precitajText(subor);
    vysledok = parsujVypis(obsah, subor.name);
  } catch (e) {
    return { ok: false, chyba: e instanceof Error ? e.message : "Súbor sa nepodarilo prečítať." };
  }

  if (vysledok.pohyby.length === 0) {
    return { ok: false, chyba: "Vo výpise nie sú žiadne pohyby.", varovania: vysledok.varovania };
  }

  // Ak výpis nesie IBAN, overíme, že sedí s vybraným účtom – ochrana pred zámenou účtov.
  if (vysledok.iban && ucet.iban.replace(/\s/g, "") !== vysledok.iban.replace(/\s/g, "")) {
    return {
      ok: false,
      chyba: `Výpis patrí k účtu ${vysledok.iban}, ale vybral si ${ucet.iban}. Skontroluj, ktorý účet importuješ.`,
    };
  }

  const importId = createId();
  let novych = 0;
  let duplicit = 0;
  const noveId: string[] = [];

  for (const p of vysledok.pohyby) {
    const vlozene = await db
      .insert(bankPohyby)
      .values({
        ucetId,
        datum: p.datum,
        suma: centsToDb(p.suma),
        mena: p.mena,
        smer: p.smer,
        protiucetIban: p.protiucetIban ?? null,
        protiucetNazov: p.protiucetNazov ?? null,
        variabilnySymbol: p.variabilnySymbol ?? null,
        konstantnySymbol: p.konstantnySymbol ?? null,
        specifickySymbol: p.specifickySymbol ?? null,
        popis: p.popis ?? null,
        bankRef: p.bankRef,
        importId,
      })
      .onConflictDoNothing({ target: bankPohyby.bankRef })
      .returning({ id: bankPohyby.id });

    if (vlozene.length) {
      novych++;
      noveId.push(vlozene[0].id);
    } else {
      duplicit++;
    }
  }

  const parovanie = noveId.length
    ? await sparujPohyby(noveId)
    : { sparovaneFaktury: 0, sparovaneDoklady: 0, nesparovane: 0, detaily: [] };

  revalidatePath("/banka");
  revalidatePath("/faktury");
  revalidatePath("/");

  return {
    ok: true,
    nacitanych: vysledok.pohyby.length,
    novych,
    duplicit,
    sparovanychFaktur: parovanie.sparovaneFaktury,
    sparovanychDokladov: parovanie.sparovaneDoklady,
    varovania: vysledok.varovania,
    detaily: parovanie.detaily,
  };
}

export async function sparujZnova() {
  await vyzadujPrihlasenie();
  const v = await sparujPohyby();
  revalidatePath("/banka");
  revalidatePath("/faktury");
  revalidatePath("/");
  return v;
}

export async function priradPohyb(pohybId: string, fakturaId: string) {
  await vyzadujPrihlasenie();
  await sparujRucne(pohybId, fakturaId);
  revalidatePath("/banka");
  revalidatePath("/faktury");
}

export async function oznacAkoVyriesene(pohybId: string) {
  await vyzadujPrihlasenie();
  await db.update(bankPohyby).set({ sparovane: true }).where(eq(bankPohyby.id, pohybId));
  revalidatePath("/banka");
}

export async function pridajUcet(formData: FormData) {
  await vyzadujPrihlasenie();

  const iban = String(formData.get("iban") ?? "").replace(/\s/g, "").toUpperCase();
  const nazov = String(formData.get("nazov") ?? "").trim();

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) throw new Error("Zadaj platný IBAN.");
  if (!nazov) throw new Error("Zadaj názov účtu.");

  const existujuce = await db.select().from(bankUcty);

  await db.insert(bankUcty).values({
    nazov,
    iban,
    bic: String(formData.get("bic") ?? "").replace(/\s/g, "").toUpperCase() || null,
    vychodzi: existujuce.length === 0,
  });

  revalidatePath("/banka");
  revalidatePath("/nastavenia");
}

/** Bankové výpisy zo slovenských bánk chodia často vo Windows-1250. */
async function precitajText(subor: File): Promise<string> {
  const buffer = Buffer.from(await subor.arrayBuffer());
  const utf8 = buffer.toString("utf8");

  // Znak U+FFFD znamená, že to nebolo platné UTF-8 – skúsime stredoeurópske kódovanie.
  if (utf8.includes("�")) {
    try {
      return new TextDecoder("windows-1250").decode(buffer);
    } catch {
      return utf8;
    }
  }
  return utf8;
}
