"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prijateMaily, odoslaneMaily } from "@/db/schema";
import { vyzadujPrihlasenie } from "@/lib/auth";
import { stiahniNoveDoklady, jeSchrankaNakonfigurovana } from "@/lib/mail-prijem";
import { overSmtp, jeMailNakonfigurovany, preposliZlyhane } from "@/lib/mail-odoslanie";

export async function skontrolujSchranku() {
  const session = await vyzadujPrihlasenie();

  if (!jeSchrankaNakonfigurovana()) {
    return { ok: false as const, chyba: "Podateľňa nie je nastavená — chýbajú prihlasovacie údaje k IMAP schránke." };
  }

  try {
    const v = await stiahniNoveDoklady(session.id);
    revalidatePath("/posta");
    revalidatePath("/prijate");
    revalidatePath("/");
    return { ok: true as const, ...v };
  } catch (e) {
    return { ok: false as const, chyba: e instanceof Error ? e.message : "Schránku sa nepodarilo otvoriť." };
  }
}

export async function oznacMailIgnorovany(id: string) {
  await vyzadujPrihlasenie();
  await db.update(prijateMaily).set({ stav: "IGNOROVANY" }).where(eq(prijateMaily.id, id));
  revalidatePath("/posta");
}

export async function otestujOdosielanie() {
  await vyzadujPrihlasenie();
  if (!jeMailNakonfigurovany()) {
    return { ok: false as const, chyba: "SMTP nie je nastavené." };
  }
  return overSmtp();
}

export async function skusZnovaOdoslat() {
  await vyzadujPrihlasenie();
  const v = await preposliZlyhane();
  revalidatePath("/posta");
  return v;
}

export async function zmazZaznamOdoslaneho(id: string) {
  await vyzadujPrihlasenie();
  await db.delete(odoslaneMaily).where(eq(odoslaneMaily.id, id));
  revalidatePath("/posta");
}
