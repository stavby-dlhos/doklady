import { and, eq, inArray, isNull, or, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { bankPohyby, faktury, prijateDoklady, uhrady } from "@/db/schema";
import { toCents, centsToDb, type Cents } from "./money";

/**
 * Automatické párovanie bankových pohybov s faktúrami a prijatými dokladmi.
 *
 * Zámerne konzervatívne: spáruje sa len to, čo sedí jednoznačne. Všetko ostatné
 * ostane nesparované a používateľ to priradí ručne. Zle spárovaná úhrada narobí
 * v účtovníctve viac škody než nespárovaná.
 */

export interface VysledokParovania {
  sparovaneFaktury: number;
  sparovaneDoklady: number;
  nesparovane: number;
  detaily: string[];
}

const TOLERANCIA: Cents = 0; // presná zhoda sumy; rozdiel rieši čiastočná úhrada

export async function sparujPohyby(idPohybov?: string[]): Promise<VysledokParovania> {
  const podmienky = [eq(bankPohyby.sparovane, false)];
  if (idPohybov?.length) podmienky.push(inArray(bankPohyby.id, idPohybov));

  const pohyby = await db
    .select()
    .from(bankPohyby)
    .where(and(...podmienky));

  const detaily: string[] = [];
  let sparovaneFaktury = 0;
  let sparovaneDoklady = 0;

  for (const p of pohyby) {
    const suma = toCents(p.suma);

    if (p.smer === "PRICHOD") {
      const ok = await sparujPrichod(p.id, suma, p.variabilnySymbol, p.datum, detaily);
      if (ok) sparovaneFaktury++;
    } else {
      const ok = await sparujOdchod(p.id, suma, p.variabilnySymbol, p.datum, detaily);
      if (ok) sparovaneDoklady++;
    }
  }

  return {
    sparovaneFaktury,
    sparovaneDoklady,
    nesparovane: pohyby.length - sparovaneFaktury - sparovaneDoklady,
    detaily,
  };
}

/** Príchodzia platba = úhrada našej vystavenej faktúry. */
async function sparujPrichod(
  pohybId: string,
  suma: Cents,
  vs: string | null,
  datum: Date,
  detaily: string[],
): Promise<boolean> {
  if (!vs) return false;

  const kandidati = await db
    .select()
    .from(faktury)
    .where(
      and(
        eq(faktury.variabilnySymbol, vs),
        inArray(faktury.stav, ["ODOSLANA", "CIASTOCNE_UHRADENA", "PO_SPLATNOSTI"]),
      ),
    );

  if (kandidati.length !== 1) {
    if (kandidati.length > 1) {
      detaily.push(`VS ${vs}: našlo sa ${kandidati.length} faktúr – nechávam na ručné priradenie.`);
    }
    return false;
  }

  const f = kandidati[0];
  const uzUhradene = toCents(f.uhradene);
  const celkom = toCents(f.sumaCelkom);
  const noveUhradene = uzUhradene + suma;

  // Neplatíme viac než je faktúra – preplatok rieši človek.
  if (noveUhradene > celkom + TOLERANCIA) {
    detaily.push(
      `Faktúra ${f.cislo}: platba by spôsobila preplatok (${(noveUhradene - celkom) / 100} €) – neriešim automaticky.`,
    );
    return false;
  }

  const uhradenaCela = noveUhradene >= celkom - TOLERANCIA;

  await db.transaction(async (tx) => {
    await tx.insert(uhrady).values({
      fakturaId: f.id,
      bankPohybId: pohybId,
      datum,
      suma: centsToDb(suma),
      sposob: "PREVOD",
      automaticke: true,
    });

    await tx
      .update(faktury)
      .set({
        uhradene: centsToDb(noveUhradene),
        stav: uhradenaCela ? "UHRADENA" : "CIASTOCNE_UHRADENA",
        uhradenaDna: uhradenaCela ? datum : null,
        updatedAt: new Date(),
      })
      .where(eq(faktury.id, f.id));

    await tx.update(bankPohyby).set({ sparovane: true }).where(eq(bankPohyby.id, pohybId));
  });

  detaily.push(
    `Faktúra ${f.cislo} ${uhradenaCela ? "uhradená" : "čiastočne uhradená"} sumou ${suma / 100} €.`,
  );
  return true;
}

/** Odchádzajúca platba = úhrada prijatej faktúry. */
async function sparujOdchod(
  pohybId: string,
  suma: Cents,
  vs: string | null,
  datum: Date,
  detaily: string[],
): Promise<boolean> {
  const podmienky = [isNull(prijateDoklady.uhradenyDna), eq(prijateDoklady.sumaCelkom, centsToDb(suma))];

  if (vs) {
    podmienky.push(eq(prijateDoklady.variabilnySymbol, vs));
  } else {
    // Bez VS by sme párovali len podľa sumy – príliš riskantné.
    return false;
  }

  const kandidati = await db
    .select()
    .from(prijateDoklady)
    .where(and(...podmienky));

  if (kandidati.length !== 1) return false;

  const d = kandidati[0];

  await db.transaction(async (tx) => {
    await tx
      .update(prijateDoklady)
      .set({ uhradenyDna: datum, bankPohybId: pohybId, updatedAt: new Date() })
      .where(eq(prijateDoklady.id, d.id));
    await tx.update(bankPohyby).set({ sparovane: true }).where(eq(bankPohyby.id, pohybId));
  });

  detaily.push(`Prijatý doklad ${d.cisloDokladu ?? d.id} označený ako uhradený (${suma / 100} €).`);
  return true;
}

/** Ručné spárovanie pohybu s konkrétnou faktúrou. */
export async function sparujRucne(pohybId: string, fakturaId: string): Promise<void> {
  const [p] = await db.select().from(bankPohyby).where(eq(bankPohyby.id, pohybId)).limit(1);
  const [f] = await db.select().from(faktury).where(eq(faktury.id, fakturaId)).limit(1);
  if (!p) throw new Error("Bankový pohyb sa nenašiel.");
  if (!f) throw new Error("Faktúra sa nenašla.");
  if (p.sparovane) throw new Error("Tento pohyb je už spárovaný.");

  const suma = toCents(p.suma);
  const noveUhradene = toCents(f.uhradene) + suma;
  const celkom = toCents(f.sumaCelkom);
  const uhradenaCela = noveUhradene >= celkom;

  await db.transaction(async (tx) => {
    await tx.insert(uhrady).values({
      fakturaId: f.id,
      bankPohybId: p.id,
      datum: p.datum,
      suma: centsToDb(suma),
      sposob: "PREVOD",
      automaticke: false,
    });
    await tx
      .update(faktury)
      .set({
        uhradene: centsToDb(noveUhradene),
        stav: uhradenaCela ? "UHRADENA" : "CIASTOCNE_UHRADENA",
        uhradenaDna: uhradenaCela ? p.datum : null,
        updatedAt: new Date(),
      })
      .where(eq(faktury.id, f.id));
    await tx.update(bankPohyby).set({ sparovane: true }).where(eq(bankPohyby.id, p.id));
  });
}

/** Označí odoslané faktúry po splatnosti. Volá sa pri načítaní prehľadu. */
export async function oznacPoSplatnosti(): Promise<number> {
  const res = await db
    .update(faktury)
    .set({ stav: "PO_SPLATNOSTI" })
    .where(
      and(
        or(eq(faktury.stav, "ODOSLANA"), eq(faktury.stav, "CIASTOCNE_UHRADENA")),
        raw`${faktury.datumSplatnosti} < now()`,
      ),
    )
    .returning({ id: faktury.id });
  return res.length;
}
