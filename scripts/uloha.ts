/**
 * Pravidelná údržba — jedno spustenie urobí všetko a skončí.
 *
 * Na Railway sa nastaví ako samostatná služba s cron rozvrhom:
 *   Start Command:  npm run uloha
 *   Cron Schedule:  *\/30 * * * *
 *
 * Railway spúšťa štartovací príkaz podľa rozvrhu a čaká, kým proces skončí.
 * Preto skript na konci vždy zatvorí spojenie s databázou a ukončí sa —
 * inak by Railway ďalšie spustenie preskočil.
 *
 * Rovnaké úlohy sú dostupné aj cez /api/cron/<uloha>, ak by si radšej
 * použil externý plánovač. Tento skript ich volá priamo, bez HTTP.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, sql } from "../src/db";
import { pouzivatelia } from "../src/db/schema";
import { stiahniNoveDoklady, jeSchrankaNakonfigurovana } from "../src/lib/mail-prijem";
import { preposliZlyhane, jeMailNakonfigurovany } from "../src/lib/mail-odoslanie";
import { oznacPoSplatnosti, sparujPohyby } from "../src/lib/parovanie";

function cas(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function log(sprava: string): void {
  console.log(`[${cas()}] ${sprava}`);
}

/** Jedna úloha nesmie zhodiť ostatné – každá beží vo vlastnom try. */
async function skus(nazov: string, uloha: () => Promise<string>): Promise<boolean> {
  try {
    const vysledok = await uloha();
    log(`${nazov}: ${vysledok}`);
    return true;
  } catch (e) {
    log(`${nazov}: ZLYHALO — ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function main() {
  log("Spúšťam údržbu.");
  let zlyhani = 0;

  // 1. Doklady z elektronickej podateľne
  if (jeSchrankaNakonfigurovana()) {
    const ok = await skus("Podateľňa", async () => {
      const [majitel] = await db
        .select({ id: pouzivatelia.id })
        .from(pouzivatelia)
        .where(eq(pouzivatelia.rola, "MAJITEL"))
        .limit(1);

      if (!majitel) return "preskočené, v systéme nie je žiadny majiteľ";

      const v = await stiahniNoveDoklady(majitel.id);
      const chyby = v.chyby.length ? `, ${v.chyby.length} príloh sa nepodarilo spracovať` : "";
      return `${v.spracovanychMailov} správ, ${v.vytvorenychDokladov} nových dokladov${chyby}`;
    });
    if (!ok) zlyhani++;
  } else {
    log("Podateľňa: preskočené, IMAP nie je nastavený.");
  }

  // 2. Faktúry po splatnosti
  if (!(await skus("Splatnosť", async () => {
    const pocet = await oznacPoSplatnosti();
    return pocet === 0 ? "žiadna nová faktúra po splatnosti" : `${pocet} faktúr označených po splatnosti`;
  }))) zlyhani++;

  // 3. Dopárovanie bankových pohybov
  if (!(await skus("Párovanie", async () => {
    const v = await sparujPohyby();
    return `${v.sparovaneFaktury} faktúr a ${v.sparovaneDoklady} dokladov spárovaných, ${v.nesparovane} ostáva`;
  }))) zlyhani++;

  // 4. Opakované odoslanie mailov, ktoré predtým zlyhali
  if (jeMailNakonfigurovany()) {
    if (!(await skus("Neúspešné maily", async () => {
      const v = await preposliZlyhane();
      return v.pokusov === 0 ? "žiadne čakajúce" : `${v.uspesnych} z ${v.pokusov} odoslaných`;
    }))) zlyhani++;
  } else {
    log("Neúspešné maily: preskočené, SMTP nie je nastavené.");
  }

  // Spojenie treba zavrieť, inak by proces bežal ďalej a Railway by ďalšie
  // spustenie preskočil.
  await sql.end({ timeout: 5 });

  log(zlyhani === 0 ? "Údržba hotová." : `Údržba hotová, ${zlyhani} úloh zlyhalo.`);
  process.exit(zlyhani === 0 ? 0 : 1);
}

main().catch(async (e) => {
  log(`Údržba spadla: ${e instanceof Error ? e.message : String(e)}`);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
