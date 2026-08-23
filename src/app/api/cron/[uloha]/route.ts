import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pouzivatelia } from "@/db/schema";
import { stiahniNoveDoklady, jeSchrankaNakonfigurovana } from "@/lib/mail-prijem";
import { preposliZlyhane } from "@/lib/mail-odoslanie";
import { oznacPoSplatnosti, sparujPohyby } from "@/lib/parovanie";

/**
 * Automatické úlohy volané plánovačom (Railway Cron alebo externá služba).
 *
 * Volanie:  GET /api/cron/<uloha>   s hlavičkou  Authorization: Bearer <CRON_SECRET>
 *
 * Úlohy:
 *   posta       – stiahne nové doklady z e-mailovej podateľne
 *   splatnost   – označí faktúry po splatnosti
 *   parovanie   – skúsi spárovať nespárované bankové pohyby
 *   maily       – znovu odošle maily, ktoré predtým zlyhali
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ULOHY = ["posta", "splatnost", "parovanie", "maily"] as const;
type Uloha = (typeof ULOHY)[number];

function jeAutorizovane(request: Request): boolean {
  const ocakavane = process.env.CRON_SECRET;
  if (!ocakavane) return false;

  const hlavicka = request.headers.get("authorization") ?? "";
  const token = hlavicka.startsWith("Bearer ") ? hlavicka.slice(7) : "";
  if (token.length !== ocakavane.length) return false;

  // Porovnanie v konštantnom čase – aby sa kľúč nedal uhádnuť po znakoch.
  return timingSafeEqual(Buffer.from(token), Buffer.from(ocakavane));
}

export async function GET(request: Request, { params }: { params: Promise<{ uloha: string }> }) {
  if (!jeAutorizovane(request)) {
    return NextResponse.json({ chyba: "Neautorizované." }, { status: 401 });
  }

  const { uloha } = await params;
  if (!ULOHY.includes(uloha as Uloha)) {
    return NextResponse.json({ chyba: `Neznáma úloha. Dostupné: ${ULOHY.join(", ")}` }, { status: 400 });
  }

  try {
    switch (uloha as Uloha) {
      case "posta": {
        if (!jeSchrankaNakonfigurovana()) {
          return NextResponse.json({ preskocene: "IMAP nie je nastavený." });
        }
        // Doklady z podateľne zakladá prvý majiteľ v poradí.
        const [majitel] = await db
          .select({ id: pouzivatelia.id })
          .from(pouzivatelia)
          .where(eq(pouzivatelia.rola, "MAJITEL"))
          .limit(1);

        if (!majitel) return NextResponse.json({ chyba: "Nenašiel sa žiadny majiteľ." }, { status: 500 });

        const v = await stiahniNoveDoklady(majitel.id);
        return NextResponse.json({ uloha, ...v });
      }

      case "splatnost": {
        const pocet = await oznacPoSplatnosti();
        return NextResponse.json({ uloha, oznacenych: pocet });
      }

      case "parovanie": {
        const v = await sparujPohyby();
        return NextResponse.json({ uloha, ...v });
      }

      case "maily": {
        const v = await preposliZlyhane();
        return NextResponse.json({ uloha, ...v });
      }
    }
  } catch (e) {
    return NextResponse.json(
      { uloha, chyba: e instanceof Error ? e.message : "Úloha zlyhala." },
      { status: 500 },
    );
  }
}
