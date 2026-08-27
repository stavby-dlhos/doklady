"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { faktury, fakturaPolozky, partneri, ciselneRady, firma, auditLog, uhrady } from "@/db/schema";
import { vyzadujPrihlasenie, vyzadujMajitela } from "@/lib/auth";
import { pridelCislo, vsZCisla } from "@/lib/cisla";
import { vypocitajPolozku, vypocitajRekapitulaciu, normalizujSadzbu, type PolozkaVypocet } from "@/lib/dph";
import { centsToDb, toCents, formatEur } from "@/lib/money";
import { zInputDatumu } from "@/lib/stavy";
import { qrPreFakturu } from "@/lib/paybysquare";
import { vygenerujFakturuPdf } from "@/lib/pdf/faktura";
import { posliMail } from "@/lib/mail-odoslanie";
import { ChybaVstupu, obal } from "@/lib/chyby";

export interface PolozkaFormular {
  skupina: string;
  nazov: string;
  popis: string;
  mnozstvo: string;
  mj: string;
  cenaZaMj: string;
  zlavaPct: string;
  sadzbaDph: number;
}

export interface FakturaFormular {
  id?: string;
  radaId: string;
  odberatelId: string;
  zakazkaId: string | null;
  datumVystavenia: string;
  datumDodania: string;
  datumSplatnosti: string;
  formaUhrady: "PREVOD" | "HOTOVOST" | "KARTA" | "DOBIERKA";
  prenosDph: boolean;
  textPredPolozkami: string;
  poznamka: string;
  polozky: PolozkaFormular[];
}

async function audit(entitaId: string, akcia: string, pouzivatelId: string, detail?: string) {
  await db.insert(auditLog).values({ entita: "faktura", entitaId, akcia, pouzivatelId, detail });
}

function spocitaj(vstup: FakturaFormular) {
  const vypocty: PolozkaVypocet[] = vstup.polozky.map((p) =>
    vypocitajPolozku(
      {
        mnozstvo: parseCislo(p.mnozstvo),
        cenaZaMj: parseCislo(p.cenaZaMj),
        zlavaPct: parseCislo(p.zlavaPct),
        sadzbaDph: normalizujSadzbu(p.sadzbaDph),
      },
      vstup.prenosDph,
    ),
  );
  return { vypocty, rekapitulacia: vypocitajRekapitulaciu(vypocty, vstup.prenosDph) };
}

/**
 * Riadok, do ktorého nikto nič nenapísal.
 *
 * Množstvo a merná jednotka sa nepočítajú – tie sú predvyplnené („1 ks")
 * a samy o sebe neznamenajú, že používateľ riadok naozaj chcel. Rozhoduje
 * názov, popis, skupina a cena.
 */
function jePrazdnyRiadok(p: PolozkaFormular): boolean {
  return !p.nazov.trim() && !p.popis.trim() && !p.skupina.trim() && parseCislo(p.cenaZaMj) === 0;
}

async function ulozFakturuTelo(vstupPrichodzi: FakturaFormular): Promise<{ id: string }> {
  const session = await vyzadujPrihlasenie();

  // Formulár vždy ponúka jeden prázdny riadok navyše. Nedopísaný riadok je
  // len nedotknutá ponuka, nie chyba – zahodíme ho a faktúru uložíme.
  const vstup: FakturaFormular = {
    ...vstupPrichodzi,
    polozky: vstupPrichodzi.polozky.filter((p) => !jePrazdnyRiadok(p)),
  };

  if (!vstup.odberatelId) throw new ChybaVstupu("Vyber odberateľa.");
  if (!vstup.polozky.length) throw new ChybaVstupu("Faktúra musí mať aspoň jednu položku s názvom a cenou.");

  const bezNazvu = vstup.polozky.findIndex((p) => !p.nazov.trim());
  if (bezNazvu >= 0) throw new ChybaVstupu(`Položka č. ${bezNazvu + 1} nemá názov — doplň ho alebo riadok zmaž.`);

  const datumVystavenia = zInputDatumu(vstup.datumVystavenia);
  const datumDodania = zInputDatumu(vstup.datumDodania);
  const datumSplatnosti = zInputDatumu(vstup.datumSplatnosti);
  if (!datumVystavenia || !datumDodania || !datumSplatnosti) throw new ChybaVstupu("Vyplň všetky tri dátumy.");
  if (datumSplatnosti < datumVystavenia) throw new ChybaVstupu("Splatnosť nemôže byť pred dátumom vystavenia.");

  const { vypocty, rekapitulacia: r } = spocitaj(vstup);
  if (r.sumaCelkom <= 0) throw new ChybaVstupu("Celková suma faktúry musí byť väčšia než nula.");

  const spolocne = {
    odberatelId: vstup.odberatelId,
    zakazkaId: vstup.zakazkaId || null,
    datumVystavenia,
    datumDodania,
    datumSplatnosti,
    formaUhrady: vstup.formaUhrady,
    prenosDph: vstup.prenosDph,
    zaklad23: centsToDb(r.zaklad23),
    zaklad19: centsToDb(r.zaklad19),
    zaklad5: centsToDb(r.zaklad5),
    zaklad0: centsToDb(r.zaklad0),
    dph23: centsToDb(r.dph23),
    dph19: centsToDb(r.dph19),
    dph5: centsToDb(r.dph5),
    dphSpolu: centsToDb(r.dphSpolu),
    sumaBezDph: centsToDb(r.sumaBezDph),
    sumaCelkom: centsToDb(r.sumaCelkom),
    textPredPolozkami: vstup.textPredPolozkami || null,
    poznamka: vstup.poznamka || null,
    updatedAt: new Date(),
  };

  const idFaktury = await db.transaction(async (tx) => {
    let fakturaId: string;

    if (vstup.id) {
      const [existujuca] = await tx.select().from(faktury).where(eq(faktury.id, vstup.id)).limit(1);
      if (!existujuca) throw new ChybaVstupu("Faktúra sa nenašla.");
      if (existujuca.stav !== "KONCEPT") {
        throw new ChybaVstupu("Upraviť sa dá len koncept. Odoslanú faktúru stornuj a vystav novú.");
      }

      await tx.update(faktury).set({ ...spolocne, pdfUrl: null }).where(eq(faktury.id, vstup.id));
      await tx.delete(fakturaPolozky).where(eq(fakturaPolozky.fakturaId, vstup.id));
      fakturaId = vstup.id;
    } else {
      const { cislo } = await pridelCislo(tx, vstup.radaId);
      const [rada] = await tx.select().from(ciselneRady).where(eq(ciselneRady.id, vstup.radaId)).limit(1);

      const [nova] = await tx
        .insert(faktury)
        .values({
          ...spolocne,
          cislo,
          radaId: vstup.radaId,
          typ: rada?.typ ?? "BEZNA",
          variabilnySymbol: vsZCisla(cislo),
          stav: "KONCEPT",
          vytvorilId: session.id,
        })
        .returning();

      fakturaId = nova.id;
    }

    await tx.insert(fakturaPolozky).values(
      vstup.polozky.map((p, i) => ({
        fakturaId,
        poradie: i,
        skupina: p.skupina.trim() || null,
        nazov: p.nazov.trim(),
        popis: p.popis.trim() || null,
        mnozstvo: String(parseCislo(p.mnozstvo)),
        mj: p.mj || "ks",
        cenaZaMj: String(parseCislo(p.cenaZaMj)),
        zlavaPct: String(parseCislo(p.zlavaPct)),
        sadzbaDph: vypocty[i].sadzbaDph,
        zaklad: centsToDb(vypocty[i].zaklad),
        dph: centsToDb(vypocty[i].dph),
        spolu: centsToDb(vypocty[i].spolu),
      })),
    );

    return fakturaId;
  });

  await audit(idFaktury, vstup.id ? "ZMENA" : "VYTVORENIE", session.id);
  revalidatePath("/faktury");
  revalidatePath(`/faktury/${idFaktury}`);
  revalidatePath("/");

  return { id: idFaktury };
}

/** Zostaví PDF faktúry. Volá sa z API route aj pri odosielaní mailom. */
export async function zostavPdf(id: string): Promise<{ pdf: Buffer; nazov: string; cislo: string }> {
  await vyzadujPrihlasenie();

  const [zaznam] = await db
    .select({ f: faktury, odberatel: partneri })
    .from(faktury)
    .leftJoin(partneri, eq(faktury.odberatelId, partneri.id))
    .where(eq(faktury.id, id))
    .limit(1);

  if (!zaznam?.odberatel) throw new ChybaVstupu("Faktúra alebo odberateľ sa nenašli.");

  const [nastavenia] = await db.select().from(firma).where(eq(firma.id, "firma")).limit(1);
  if (!nastavenia) throw new ChybaVstupu("Nie sú vyplnené údaje firmy. Doplň ich v Nastaveniach.");

  const polozky = await db
    .select()
    .from(fakturaPolozky)
    .where(eq(fakturaPolozky.fakturaId, id))
    .orderBy(fakturaPolozky.poradie);

  const qr = nastavenia.iban
    ? await qrPreFakturu({
        iban: nastavenia.iban,
        suma: toCents(zaznam.f.sumaCelkom) / 100,
        variabilnySymbol: zaznam.f.variabilnySymbol,
        konstantnySymbol: zaznam.f.konstantnySymbol,
        datumSplatnosti: zaznam.f.datumSplatnosti,
        prijemca: nastavenia.nazov,
        poznamka: `Faktura ${zaznam.f.cislo}`,
        bic: nastavenia.bic,
      })
    : null;

  const pdf = await vygenerujFakturuPdf({
    firma: nastavenia,
    odberatel: zaznam.odberatel,
    faktura: zaznam.f,
    polozky,
    qrDataUrl: qr?.dataUrl ?? null,
  });

  if (qr && qr.payload !== zaznam.f.qrPayload) {
    await db.update(faktury).set({ qrPayload: qr.payload }).where(eq(faktury.id, id));
  }

  return { pdf, nazov: `faktura-${zaznam.f.cislo}.pdf`, cislo: zaznam.f.cislo };
}

async function odosliFakturuTelo(id: string, prijemca: string, sprava: string, kopiaMne: boolean) {
  const session = await vyzadujPrihlasenie();

  const [zaznam] = await db
    .select({ f: faktury, odberatel: partneri })
    .from(faktury)
    .leftJoin(partneri, eq(faktury.odberatelId, partneri.id))
    .where(eq(faktury.id, id))
    .limit(1);

  if (!zaznam) throw new ChybaVstupu("Faktúra sa nenašla.");
  if (zaznam.f.stav === "STORNO") throw new ChybaVstupu("Stornovanú faktúru nemožno odoslať.");
  if (!prijemca.includes("@")) throw new ChybaVstupu("Zadaj platnú e-mailovú adresu.");

  const [nastavenia] = await db.select().from(firma).where(eq(firma.id, "firma")).limit(1);
  const { pdf, nazov } = await zostavPdf(id);

  const vysledok = await posliMail({
    fakturaId: id,
    prijemca,
    kopia: kopiaMne ? (nastavenia?.email ?? undefined) : undefined,
    predmet: `Faktúra ${zaznam.f.cislo} — ${nastavenia?.nazov ?? "Stavby-Dlhoš, s.r.o."}`,
    telo: sprava,
    prilohy: [{ nazov, obsah: pdf, typ: "application/pdf" }],
  });

  if (!vysledok.odoslany) {
    throw new ChybaVstupu(`Mail sa nepodarilo odoslať: ${vysledok.chyba}`);
  }

  // Koncept sa odoslaním stáva ostrou faktúrou.
  if (zaznam.f.stav === "KONCEPT") {
    await db
      .update(faktury)
      .set({ stav: "ODOSLANA", odoslanaDna: new Date(), odoslanaNa: prijemca })
      .where(eq(faktury.id, id));
  } else {
    await db.update(faktury).set({ odoslanaDna: new Date(), odoslanaNa: prijemca }).where(eq(faktury.id, id));
  }

  await audit(id, "ODOSLANIE", session.id, prijemca);
  revalidatePath(`/faktury/${id}`);
  revalidatePath("/faktury");
  revalidatePath("/");
}

/** Označí faktúru ako odoslanú bez posielania mailu (napr. odovzdaná osobne). */
async function oznacAkoOdoslanuTelo(id: string) {
  const session = await vyzadujPrihlasenie();
  const [f] = await db.select().from(faktury).where(eq(faktury.id, id)).limit(1);
  if (!f) throw new ChybaVstupu("Faktúra sa nenašla.");
  if (f.stav !== "KONCEPT") throw new ChybaVstupu("Len koncept sa dá označiť ako odoslaný.");

  await db.update(faktury).set({ stav: "ODOSLANA", odoslanaDna: new Date() }).where(eq(faktury.id, id));
  await audit(id, "ODOSLANIE", session.id, "ručne bez mailu");
  revalidatePath(`/faktury/${id}`);
  revalidatePath("/faktury");
}

async function pridajUhraduTelo(id: string, suma: string, datum: string, sposob: string) {
  const session = await vyzadujPrihlasenie();

  const [f] = await db.select().from(faktury).where(eq(faktury.id, id)).limit(1);
  if (!f) throw new ChybaVstupu("Faktúra sa nenašla.");

  const sumaCents = toCents(suma);
  if (sumaCents <= 0) throw new ChybaVstupu("Suma úhrady musí byť kladná.");

  const den = zInputDatumu(datum) ?? new Date();
  const nove = toCents(f.uhradene) + sumaCents;
  const celkom = toCents(f.sumaCelkom);

  if (nove > celkom) {
    throw new ChybaVstupu(
      `Úhrada by presiahla sumu faktúry. Zostáva doplatiť ${formatEur(celkom - toCents(f.uhradene))}.`,
    );
  }

  await db.transaction(async (tx) => {
    await tx.insert(uhrady).values({
      fakturaId: id,
      datum: den,
      suma: centsToDb(sumaCents),
      sposob: sposob as "PREVOD",
      automaticke: false,
    });
    await tx
      .update(faktury)
      .set({
        uhradene: centsToDb(nove),
        stav: nove >= celkom ? "UHRADENA" : "CIASTOCNE_UHRADENA",
        uhradenaDna: nove >= celkom ? den : null,
      })
      .where(eq(faktury.id, id));
  });

  await audit(id, "UHRADA", session.id, formatEur(sumaCents));
  revalidatePath(`/faktury/${id}`);
  revalidatePath("/faktury");
  revalidatePath("/");
}

async function stornujFakturuTelo(id: string, dovod: string) {
  const session = await vyzadujMajitela();
  const [f] = await db.select().from(faktury).where(eq(faktury.id, id)).limit(1);
  if (!f) throw new ChybaVstupu("Faktúra sa nenašla.");
  if (f.stav === "UHRADENA") throw new ChybaVstupu("Uhradenú faktúru stornuj dobropisom, nie stornom.");

  await db
    .update(faktury)
    .set({ stav: "STORNO", stornovanaDna: new Date(), poznamka: `STORNO: ${dovod}` })
    .where(eq(faktury.id, id));

  await audit(id, "STORNO", session.id, dovod);
  revalidatePath(`/faktury/${id}`);
  revalidatePath("/faktury");
}

async function zmazKonceptTelo(id: string) {
  const session = await vyzadujPrihlasenie();
  const [f] = await db.select().from(faktury).where(eq(faktury.id, id)).limit(1);
  if (!f) throw new ChybaVstupu("Faktúra sa nenašla.");
  if (f.stav !== "KONCEPT") {
    throw new ChybaVstupu("Zmazať sa dá len koncept — číslované faktúry sa nemažú, aby v rade nevznikla diera.");
  }

  await db.delete(faktury).where(eq(faktury.id, id));
  await audit(id, "ZMAZANIE", session.id, f.cislo);
  revalidatePath("/faktury");
  redirect("/faktury");
}

function parseCislo(s: string): number {
  const n = parseFloat(String(s).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* Chyby vstupu sa vracajú, nevyhadzujú – pozri src/lib/chyby.ts. */

export async function ulozFakturu(...argumenty: Parameters<typeof ulozFakturuTelo>) {
  return obal(() => ulozFakturuTelo(...argumenty));
}

export async function odosliFakturu(...argumenty: Parameters<typeof odosliFakturuTelo>) {
  return obal(() => odosliFakturuTelo(...argumenty));
}

export async function oznacAkoOdoslanu(...argumenty: Parameters<typeof oznacAkoOdoslanuTelo>) {
  return obal(() => oznacAkoOdoslanuTelo(...argumenty));
}

export async function pridajUhradu(...argumenty: Parameters<typeof pridajUhraduTelo>) {
  return obal(() => pridajUhraduTelo(...argumenty));
}

export async function stornujFakturu(...argumenty: Parameters<typeof stornujFakturuTelo>) {
  return obal(() => stornujFakturuTelo(...argumenty));
}

export async function zmazKoncept(...argumenty: Parameters<typeof zmazKonceptTelo>) {
  return obal(() => zmazKonceptTelo(...argumenty));
}
