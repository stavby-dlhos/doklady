"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { partneri } from "@/db/schema";
import { vyzadujPrihlasenie } from "@/lib/auth";

export async function ulozPartnera(formData: FormData) {
  await vyzadujPrihlasenie();

  const id = String(formData.get("id") ?? "");
  const nazov = String(formData.get("nazov") ?? "").trim();
  if (!nazov) throw new Error("Zadaj názov partnera.");

  const ico = String(formData.get("ico") ?? "").replace(/\D/g, "");

  const hodnoty = {
    typ: String(formData.get("typ") ?? "OBOJE") as "OBOJE",
    nazov,
    ico: ico ? ico.padStart(8, "0") : null,
    dic: str(formData.get("dic")),
    icDph: str(formData.get("icDph"))?.toUpperCase() ?? null,
    jePlatitelDph: formData.get("jePlatitelDph") === "on",
    ulica: str(formData.get("ulica")),
    mesto: str(formData.get("mesto")),
    psc: str(formData.get("psc")),
    krajina: String(formData.get("krajina") ?? "SK").toUpperCase(),
    iban: str(formData.get("iban"))?.replace(/\s/g, "").toUpperCase() ?? null,
    email: str(formData.get("email")),
    telefon: str(formData.get("telefon")),
    poznamka: str(formData.get("poznamka")),
    updatedAt: new Date(),
  };

  if (id) {
    await db.update(partneri).set(hodnoty).where(eq(partneri.id, id));
    revalidatePath("/partneri");
    redirect("/partneri");
  }

  await db.insert(partneri).values(hodnoty);
  revalidatePath("/partneri");
  redirect("/partneri");
}

export async function archivujPartnera(id: string, archivovat: boolean) {
  await vyzadujPrihlasenie();
  await db.update(partneri).set({ archivovany: archivovat }).where(eq(partneri.id, id));
  revalidatePath("/partneri");
}

/**
 * Doplnenie údajov firmy podľa IČO z Registra právnických osôb Štatistického
 * úradu SR. Ak register neodpovedá, formulár sa jednoducho vyplní ručne.
 */
export async function najdiPodlaIco(ico: string): Promise<{
  ok: boolean;
  chyba?: string;
  data?: { nazov: string; ulica: string; mesto: string; psc: string; dic?: string };
}> {
  await vyzadujPrihlasenie();

  const cisteIco = ico.replace(/\D/g, "").padStart(8, "0");
  if (cisteIco.length !== 8) return { ok: false, chyba: "IČO musí mať 8 číslic." };

  try {
    const odpoved = await fetch(`https://api.statistics.sk/rpo/v1/search?identifier=${cisteIco}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!odpoved.ok) return { ok: false, chyba: `Register odpovedal chybou ${odpoved.status}.` };

    const json = (await odpoved.json()) as {
      results?: Array<{
        fullNames?: Array<{ value?: string }>;
        addresses?: Array<{
          street?: string;
          buildingNumber?: string;
          municipality?: { value?: string };
          postalCodes?: string[];
        }>;
      }>;
    };

    const zaznam = json.results?.[0];
    if (!zaznam) return { ok: false, chyba: "Firma s týmto IČO sa v registri nenašla." };

    const adresa = zaznam.addresses?.[0];

    return {
      ok: true,
      data: {
        nazov: zaznam.fullNames?.[0]?.value ?? "",
        ulica: [adresa?.street, adresa?.buildingNumber].filter(Boolean).join(" "),
        mesto: adresa?.municipality?.value ?? "",
        psc: adresa?.postalCodes?.[0] ?? "",
      },
    };
  } catch (e) {
    return {
      ok: false,
      chyba: e instanceof Error && e.name === "TimeoutError"
        ? "Register neodpovedal včas — vyplň údaje ručne."
        : "Register je nedostupný — vyplň údaje ručne.",
    };
  }
}

function str(v: FormDataEntryValue | null): string | null {
  const s = v === null ? "" : String(v).trim();
  return s.length ? s : null;
}
