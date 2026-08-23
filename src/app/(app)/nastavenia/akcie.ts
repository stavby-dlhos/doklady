"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { firma, ciselneRady, pouzivatelia } from "@/db/schema";
import { vyzadujMajitela, vyzadujPrihlasenie, overHeslo } from "@/lib/auth";

export async function ulozFirmu(formData: FormData) {
  await vyzadujMajitela();

  const nazov = String(formData.get("nazov") ?? "").trim();
  const ico = String(formData.get("ico") ?? "").replace(/\D/g, "");

  if (!nazov) throw new Error("Zadaj názov firmy.");
  if (ico.length !== 8) throw new Error("IČO musí mať 8 číslic.");

  const iban = String(formData.get("iban") ?? "").replace(/\s/g, "").toUpperCase();
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    throw new Error("IBAN nemá platný tvar.");
  }

  const hodnoty = {
    nazov,
    ico,
    dic: str(formData.get("dic")),
    icDph: str(formData.get("icDph"))?.toUpperCase() ?? null,
    jePlatitelDph: formData.get("jePlatitelDph") === "on",
    ulica: String(formData.get("ulica") ?? "").trim(),
    mesto: String(formData.get("mesto") ?? "").trim(),
    psc: String(formData.get("psc") ?? "").trim(),
    email: str(formData.get("email")),
    telefon: str(formData.get("telefon")),
    web: str(formData.get("web")),
    iban: iban || null,
    bic: str(formData.get("bic"))?.toUpperCase() ?? null,
    banka: str(formData.get("banka")),
    zapisV: str(formData.get("zapisV")),
    patickaText: str(formData.get("patickaText")),
    splatnostDni: Math.max(0, Math.min(365, Number(formData.get("splatnostDni") ?? 14))),
    updatedAt: new Date(),
  };

  const [existujuca] = await db.select().from(firma).where(eq(firma.id, "firma")).limit(1);

  if (existujuca) {
    await db.update(firma).set(hodnoty).where(eq(firma.id, "firma"));
  } else {
    await db.insert(firma).values({ id: "firma", ...hodnoty });
  }

  revalidatePath("/nastavenia");
  revalidatePath("/faktury");
}

export async function ulozRadu(formData: FormData) {
  await vyzadujMajitela();

  const id = String(formData.get("id") ?? "");
  const prefix = String(formData.get("prefix") ?? "").trim().toUpperCase();
  const pocetCislic = Math.max(1, Math.min(8, Number(formData.get("pocetCislic") ?? 4)));
  const posledneCislo = Math.max(0, Number(formData.get("posledneCislo") ?? 0));

  const [rada] = await db.select().from(ciselneRady).where(eq(ciselneRady.id, id)).limit(1);
  if (!rada) throw new Error("Číselná rada sa nenašla.");

  // Posunúť počítadlo dozadu by znamenalo duplicitné čísla faktúr.
  if (posledneCislo < rada.posledneCislo) {
    throw new Error(
      `Počítadlo sa nedá znížiť pod ${rada.posledneCislo} — vznikli by dve faktúry s rovnakým číslom.`,
    );
  }

  await db
    .update(ciselneRady)
    .set({ prefix, pocetCislic, posledneCislo })
    .where(eq(ciselneRady.id, id));

  revalidatePath("/nastavenia");
}

export async function zmenHeslo(formData: FormData) {
  const session = await vyzadujPrihlasenie();

  const stare = String(formData.get("stareHeslo") ?? "");
  const nove = String(formData.get("noveHeslo") ?? "");
  const znova = String(formData.get("noveHesloZnova") ?? "");

  if (nove.length < 10) throw new Error("Nové heslo musí mať aspoň 10 znakov.");
  if (nove !== znova) throw new Error("Nové heslá sa nezhodujú.");

  const [u] = await db.select().from(pouzivatelia).where(eq(pouzivatelia.id, session.id)).limit(1);
  if (!u) throw new Error("Používateľ sa nenašiel.");

  if (!(await overHeslo(stare, u.heslo))) throw new Error("Súčasné heslo nie je správne.");

  await db
    .update(pouzivatelia)
    .set({ heslo: await bcrypt.hash(nove, 12) })
    .where(eq(pouzivatelia.id, session.id));

  revalidatePath("/nastavenia");
}

export async function pridajPouzivatela(formData: FormData) {
  await vyzadujMajitela();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const meno = String(formData.get("meno") ?? "").trim();
  const heslo = String(formData.get("heslo") ?? "");
  const rola = String(formData.get("rola") ?? "UCTOVNIK") as "MAJITEL" | "UCTOVNIK";

  if (!email.includes("@")) throw new Error("Zadaj platný e-mail.");
  if (!meno) throw new Error("Zadaj meno.");
  if (heslo.length < 10) throw new Error("Heslo musí mať aspoň 10 znakov.");

  const [existujuci] = await db.select().from(pouzivatelia).where(eq(pouzivatelia.email, email)).limit(1);
  if (existujuci) throw new Error("Používateľ s týmto e-mailom už existuje.");

  await db.insert(pouzivatelia).values({ email, meno, heslo: await bcrypt.hash(heslo, 12), rola });
  revalidatePath("/nastavenia");
}

export async function prepniPouzivatela(id: string, aktivny: boolean) {
  const session = await vyzadujMajitela();
  if (id === session.id) throw new Error("Vlastný účet nemôžeš deaktivovať.");

  await db.update(pouzivatelia).set({ aktivny }).where(eq(pouzivatelia.id, id));
  revalidatePath("/nastavenia");
}

function str(v: FormDataEntryValue | null): string | null {
  const s = v === null ? "" : String(v).trim();
  return s.length ? s : null;
}
