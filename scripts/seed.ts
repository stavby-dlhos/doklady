/**
 * Naplnenie databázy počiatočnými dátami.
 *
 * Spúšťa sa raz po prvom nasadení: `npm run db:seed`
 * Je bezpečné spustiť ho aj opakovane – existujúce záznamy neprepíše.
 *
 * Heslá pre prvých používateľov sa načítajú z premenných SEED_MAJITEL_HESLO
 * a SEED_UCTOVNIK_HESLO. Ak nie sú nastavené, vygeneruje sa náhodné heslo
 * a vypíše sa do konzoly – hneď si ho ulož, druhýkrát sa nezobrazí.
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const { pouzivatelia, firma, ciselneRady, bankUcty, zakazky, partneri } = schema;

function nahodneHeslo(): string {
  return randomBytes(9).toString("base64url");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Chýba DATABASE_URL.");

  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql, { schema });

  const rok = new Date().getFullYear();
  const vypis: string[] = [];

  // ---- Používatelia ----
  const majitelEmail = process.env.SEED_MAJITEL_EMAIL ?? "david.dlhos@gmail.com";
  const uctovnikEmail = process.env.SEED_UCTOVNIK_EMAIL ?? "uctovnictvo@stavbydlhos.sk";

  let majitelId: string;
  const [existujuciMajitel] = await db.select().from(pouzivatelia).where(eq(pouzivatelia.email, majitelEmail));

  if (existujuciMajitel) {
    majitelId = existujuciMajitel.id;
    console.log(`Používateľ ${majitelEmail} už existuje – preskakujem.`);
  } else {
    const heslo = process.env.SEED_MAJITEL_HESLO ?? nahodneHeslo();
    const [u] = await db
      .insert(pouzivatelia)
      .values({ email: majitelEmail, meno: "David Dlhoš", heslo: await bcrypt.hash(heslo, 12), rola: "MAJITEL" })
      .returning();
    majitelId = u.id;
    if (!process.env.SEED_MAJITEL_HESLO) vypis.push(`  ${majitelEmail}  →  ${heslo}`);
  }

  const [existujuciUctovnik] = await db.select().from(pouzivatelia).where(eq(pouzivatelia.email, uctovnikEmail));
  if (!existujuciUctovnik) {
    const heslo = process.env.SEED_UCTOVNIK_HESLO ?? nahodneHeslo();
    await db
      .insert(pouzivatelia)
      .values({ email: uctovnikEmail, meno: "Účtovníčka", heslo: await bcrypt.hash(heslo, 12), rola: "UCTOVNIK" })
      .returning();
    if (!process.env.SEED_UCTOVNIK_HESLO) vypis.push(`  ${uctovnikEmail}  →  ${heslo}`);
  }

  // ---- Firma ----
  const [existujucaFirma] = await db.select().from(firma).where(eq(firma.id, "firma"));
  if (!existujucaFirma) {
    await db.insert(firma).values({
      id: "firma",
      nazov: "Stavby-Dlhoš, s.r.o.",
      ico: "47022906",
      jePlatitelDph: false,
      ulica: "Nitrianska 3450/105",
      mesto: "Hlohovec",
      psc: "920 01",
      krajina: "Slovensko",
      email: "info@stavbydlhos.sk",
      web: "stavbydlhos.sk",
      splatnostDni: 14,
      patickaText: "Stavby-Dlhoš, s.r.o. · stavbydlhos.sk",
    });
    console.log("Založené údaje firmy – doplň si IČ DPH, IBAN a zápis v OR v Nastaveniach.");
  }

  // ---- Číselné rady ----
  const rady = [
    { kod: "FA", nazov: "Faktúry", prefix: "", typ: "BEZNA" as const },
    { kod: "ZAL", nazov: "Zálohové faktúry", prefix: "Z", typ: "ZALOHOVA" as const },
    { kod: "DOB", nazov: "Dobropisy", prefix: "D", typ: "DOBROPIS" as const },
  ];

  for (const r of rady) {
    const [ex] = await db.select().from(ciselneRady).where(eq(ciselneRady.kod, r.kod));
    if (!ex) {
      await db.insert(ciselneRady).values({ ...r, rok, posledneCislo: 0, pocetCislic: 4 });
    }
  }

  // ---- Bankový účet ----
  const pocetUctov = await db.select().from(bankUcty);
  if (pocetUctov.length === 0) {
    console.log("Bankový účet nie je založený – pridaj ho v Nastaveniach pred prvým importom výpisu.");
  }

  // ---- Ukážkové dáta len na výslovné želanie ----
  if (process.env.SEED_UKAZKOVE_DATA === "true") {
    const [ex] = await db.select().from(zakazky).where(eq(zakazky.kod, `${rok}-HC-01`));
    if (!ex) {
      await db.insert(zakazky).values({
        kod: `${rok}-HC-01`,
        nazov: "RD Hlohovec – ukážka",
        adresa: "Hlohovec",
        stav: "AKTIVNA",
        rozpocet: "185000.00",
      });
      await db.insert(partneri).values([
        { typ: "DODAVATEL", nazov: "Stavebniny ukážka s.r.o.", ico: "12345678" },
        { typ: "ODBERATEL", nazov: "Ukážkový investor", mesto: "Piešťany" },
      ]);
      console.log("Vložené ukážkové dáta.");
    }
  }

  await sql.end();

  if (vypis.length) {
    console.log("\n" + "=".repeat(64));
    console.log("VYGENEROVANÉ HESLÁ – ulož si ich teraz, znovu sa nezobrazia:");
    console.log(vypis.join("\n"));
    console.log("=".repeat(64) + "\n");
  }

  console.log("Hotovo.");
}

main().catch((e) => {
  console.error("Seed zlyhal:", e);
  process.exit(1);
});
