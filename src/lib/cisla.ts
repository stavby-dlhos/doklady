import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ciselneRady } from "@/db/schema";

/**
 * Pridelenie čísla faktúry.
 *
 * Číslo musí byť jedinečné a bez dier – to je zákonná požiadavka. Preto sa
 * počítadlo zvyšuje priamo v databáze jedným atomickým UPDATE ... RETURNING.
 * Dvaja používatelia, ktorí uložia faktúru v tej istej sekunde, tak nemôžu
 * dostať rovnaké číslo.
 *
 * Volaj vždy vnútri transakcie spolu s vložením faktúry.
 */

export interface PridelaneCislo {
  cislo: string;
  poradie: number;
  radaId: string;
}

type Transakcia = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function pridelCislo(tx: Transakcia | typeof db, radaId: string): Promise<PridelaneCislo> {
  const rok = new Date().getFullYear();

  const [rada] = await tx
    .update(ciselneRady)
    .set({
      // Pri prechode na nový rok sa počítadlo resetuje na 1.
      posledneCislo: sql`CASE WHEN ${ciselneRady.rok} = ${rok} THEN ${ciselneRady.posledneCislo} + 1 ELSE 1 END`,
      rok,
    })
    .where(eq(ciselneRady.id, radaId))
    .returning();

  if (!rada) throw new Error("Číselná rada sa nenašla.");

  const poradie = rada.posledneCislo;
  const cislo = `${rada.prefix}${rada.rok}${String(poradie).padStart(rada.pocetCislic, "0")}`;

  return { cislo, poradie, radaId: rada.id };
}

/**
 * Variabilný symbol z čísla faktúry – len číslice, max 10 znakov,
 * ako to vyžadujú slovenské banky.
 */
export function vsZCisla(cislo: string): string {
  const cisla = cislo.replace(/\D/g, "");
  return cisla.slice(-10) || "1";
}

/** Náhľad ďalšieho čísla bez toho, aby sa počítadlo posunulo. */
export async function nahladDalsiehoCisla(radaId: string): Promise<string> {
  const [rada] = await db.select().from(ciselneRady).where(eq(ciselneRady.id, radaId)).limit(1);
  if (!rada) return "";
  const rok = new Date().getFullYear();
  const dalsie = rada.rok === rok ? rada.posledneCislo + 1 : 1;
  return `${rada.prefix}${rok}${String(dalsie).padStart(rada.pocetCislic, "0")}`;
}
