"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { zakazky } from "@/db/schema";
import { vyzadujPrihlasenie } from "@/lib/auth";
import { centsToDb, toCents } from "@/lib/money";
import { zInputDatumu } from "@/lib/stavy";

export async function ulozZakazku(formData: FormData) {
  await vyzadujPrihlasenie();

  const id = String(formData.get("id") ?? "");
  const kod = String(formData.get("kod") ?? "").trim().toUpperCase();
  const nazov = String(formData.get("nazov") ?? "").trim();

  if (!kod) throw new Error("Zadaj kód zákazky, napr. 2026-HC-01.");
  if (!nazov) throw new Error("Zadaj názov zákazky.");

  const rozpocetVstup = String(formData.get("rozpocet") ?? "").trim();

  const hodnoty = {
    kod,
    nazov,
    adresa: str(formData.get("adresa")),
    investor: str(formData.get("investor")),
    stav: String(formData.get("stav") ?? "AKTIVNA") as "AKTIVNA",
    datumStart: zInputDatumu(String(formData.get("datumStart") ?? "")),
    datumKoniec: zInputDatumu(String(formData.get("datumKoniec") ?? "")),
    rozpocet: rozpocetVstup ? centsToDb(toCents(rozpocetVstup)) : null,
    poznamka: str(formData.get("poznamka")),
  };

  try {
    if (id) {
      await db.update(zakazky).set(hodnoty).where(eq(zakazky.id, id));
      revalidatePath(`/zakazky/${id}`);
      revalidatePath("/zakazky");
      redirect(`/zakazky/${id}`);
    }

    const [nova] = await db.insert(zakazky).values(hodnoty).returning();
    revalidatePath("/zakazky");
    redirect(`/zakazky/${nova.id}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String(e.digest).startsWith("NEXT_")) throw e;
    if (e instanceof Error && e.message.includes("zakazky_kod_unique")) {
      throw new Error(`Zákazka s kódom ${kod} už existuje.`);
    }
    throw e;
  }
}

function str(v: FormDataEntryValue | null): string | null {
  const s = v === null ? "" : String(v).trim();
  return s.length ? s : null;
}
