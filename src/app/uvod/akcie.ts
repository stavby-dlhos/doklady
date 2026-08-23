"use server";

import { redirect } from "next/navigation";
import { sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { pouzivatelia, firma, ciselneRady, auditLog } from "@/db/schema";
import { hashHesla, vytvorSession } from "@/lib/auth";

/**
 * Založenie systému pri prvom spustení.
 *
 * Beží celé v jednej transakcii a vnútri nej si ešte raz overí, že v databáze
 * naozaj nie je žiadny používateľ. Keby dvaja ľudia otvorili úvodnú obrazovku
 * naraz, prejde len jeden — druhý dostane hlášku, že systém je už nastavený.
 */

export interface VysledokZalozenia {
  ok: boolean;
  chyba?: string;
}

export async function zalozSystem(formData: FormData): Promise<VysledokZalozenia> {
  const meno = String(formData.get("meno") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const heslo = String(formData.get("heslo") ?? "");
  const hesloZnova = String(formData.get("hesloZnova") ?? "");

  const nazov = String(formData.get("nazov") ?? "").trim();
  const ico = String(formData.get("ico") ?? "").replace(/\D/g, "");
  const ulica = String(formData.get("ulica") ?? "").trim();
  const psc = String(formData.get("psc") ?? "").trim();
  const mesto = String(formData.get("mesto") ?? "").trim();

  if (!meno) return { ok: false, chyba: "Zadaj svoje meno." };
  if (!email.includes("@")) return { ok: false, chyba: "Zadaj platnú e-mailovú adresu." };
  if (heslo.length < 10) return { ok: false, chyba: "Heslo musí mať aspoň 10 znakov." };
  if (heslo !== hesloZnova) return { ok: false, chyba: "Heslá sa nezhodujú." };
  if (!nazov) return { ok: false, chyba: "Zadaj obchodné meno firmy." };
  if (ico.length !== 8) return { ok: false, chyba: "IČO musí mať 8 číslic." };
  if (!ulica || !psc || !mesto) return { ok: false, chyba: "Vyplň celú adresu firmy." };

  const hash = await hashHesla(heslo);
  const rok = new Date().getFullYear();

  let novyPouzivatel: { id: string; email: string; meno: string } | null = null;

  try {
    await db.transaction(async (tx) => {
      const [stav] = await tx
        .select({ pocet: raw<number>`count(*)::int` })
        .from(pouzivatelia);

      if ((stav?.pocet ?? 0) > 0) {
        throw new Error("SYSTEM_UZ_NASTAVENY");
      }

      const [u] = await tx
        .insert(pouzivatelia)
        .values({ email, meno, heslo: hash, rola: "MAJITEL" })
        .returning();

      novyPouzivatel = { id: u.id, email: u.email, meno: u.meno };

      await tx.insert(firma).values({
        id: "firma",
        nazov,
        ico,
        jePlatitelDph: formData.get("jePlatitelDph") === "on",
        ulica,
        psc,
        mesto,
        krajina: "Slovensko",
        email: email,
        splatnostDni: 14,
        patickaText: nazov,
      });

      await tx.insert(ciselneRady).values([
        { kod: "FA", nazov: "Faktúry", prefix: "", rok, posledneCislo: 0, pocetCislic: 4, typ: "BEZNA" },
        { kod: "ZAL", nazov: "Zálohové faktúry", prefix: "Z", rok, posledneCislo: 0, pocetCislic: 4, typ: "ZALOHOVA" },
        { kod: "DOB", nazov: "Dobropisy", prefix: "D", rok, posledneCislo: 0, pocetCislic: 4, typ: "DOBROPIS" },
      ]);

      await tx.insert(auditLog).values({
        entita: "system",
        entitaId: "firma",
        akcia: "ZALOZENIE",
        pouzivatelId: u.id,
        detail: `Systém založený pre ${nazov}.`,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SYSTEM_UZ_NASTAVENY") {
      return { ok: false, chyba: "Systém je už nastavený. Prihlás sa svojím účtom." };
    }
    if (e instanceof Error && e.message.includes("pouzivatelia_email_unique")) {
      return { ok: false, chyba: "Používateľ s týmto e-mailom už existuje." };
    }
    return { ok: false, chyba: e instanceof Error ? e.message : "Založenie zlyhalo." };
  }

  if (!novyPouzivatel) return { ok: false, chyba: "Účet sa nepodarilo vytvoriť." };

  const u = novyPouzivatel as { id: string; email: string; meno: string };
  await vytvorSession({ id: u.id, email: u.email, meno: u.meno, rola: "MAJITEL" });

  redirect("/");
}
