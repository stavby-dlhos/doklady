import { sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { pouzivatelia } from "@/db/schema";

/**
 * Je systém ešte nenastavený?
 *
 * Hneď po nasadení je databáza prázdna — nie je v nej ani jeden používateľ.
 * V takom stave aplikácia namiesto prihlásenia ukáže úvodnú obrazovku, kde si
 * majiteľ založí prvý účet. Vďaka tomu netreba na prvé spustenie terminál.
 *
 * Len čo prvý účet existuje, úvodná obrazovka sa navždy zamkne.
 */
export async function jeSystemPrazdny(): Promise<boolean> {
  try {
    const [r] = await db
      .select({ pocet: raw<number>`count(*)::int` })
      .from(pouzivatelia);
    return (r?.pocet ?? 0) === 0;
  } catch {
    // Databáza ešte nebeží alebo neprebehli migrácie – vtedy sa tvárime,
    // že systém nastavený je, nech sa úvodná obrazovka neukáže omylom.
    return false;
  }
}
