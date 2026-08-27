"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prijateMaily, odoslaneMaily } from "@/db/schema";
import { vyzadujPrihlasenie } from "@/lib/auth";
import { stiahniNoveDoklady, jeSchrankaNakonfigurovana } from "@/lib/mail-prijem";
import { overSmtp, jeMailNakonfigurovany, preposliZlyhane } from "@/lib/mail-odoslanie";
import { ChybaVstupu, obal } from "@/lib/chyby";

async function skontrolujSchrankuTelo() {
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

async function oznacMailIgnorovanyTelo(id: string) {
  await vyzadujPrihlasenie();
  await db.update(prijateMaily).set({ stav: "IGNOROVANY" }).where(eq(prijateMaily.id, id));
  revalidatePath("/posta");
}

async function otestujOdosielanieTelo() {
  await vyzadujPrihlasenie();
  if (!jeMailNakonfigurovany()) {
    return { ok: false as const, chyba: "SMTP nie je nastavené." };
  }
  return overSmtp();
}

async function skusZnovaOdoslatTelo() {
  await vyzadujPrihlasenie();
  const v = await preposliZlyhane();
  revalidatePath("/posta");
  return v;
}

async function zmazZaznamOdoslanehoTelo(id: string) {
  await vyzadujPrihlasenie();
  await db.delete(odoslaneMaily).where(eq(odoslaneMaily.id, id));
  revalidatePath("/posta");
}

/* Chyby vstupu sa vracajú, nevyhadzujú – pozri src/lib/chyby.ts. */

export async function skontrolujSchranku(...argumenty: Parameters<typeof skontrolujSchrankuTelo>) {
  return obal(() => skontrolujSchrankuTelo(...argumenty));
}

export async function oznacMailIgnorovany(...argumenty: Parameters<typeof oznacMailIgnorovanyTelo>) {
  return obal(() => oznacMailIgnorovanyTelo(...argumenty));
}

export async function otestujOdosielanie(...argumenty: Parameters<typeof otestujOdosielanieTelo>) {
  return obal(() => otestujOdosielanieTelo(...argumenty));
}

export async function skusZnovaOdoslat(...argumenty: Parameters<typeof skusZnovaOdoslatTelo>) {
  return obal(() => skusZnovaOdoslatTelo(...argumenty));
}

export async function zmazZaznamOdoslaneho(...argumenty: Parameters<typeof zmazZaznamOdoslanehoTelo>) {
  return obal(() => zmazZaznamOdoslanehoTelo(...argumenty));
}
