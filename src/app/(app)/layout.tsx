import { eq, and, inArray, sql } from "drizzle-orm";
import { vyzadujPrihlasenie } from "@/lib/auth";
import { db } from "@/db";
import { prijateDoklady, prijateMaily } from "@/db/schema";
import { Menu, type PolozkaMenu } from "@/components/menu";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await vyzadujPrihlasenie();

  const [naSchvalenie, noveMaily] = await Promise.all([
    db
      .select({ p: sql<number>`count(*)::int` })
      .from(prijateDoklady)
      .where(inArray(prijateDoklady.stav, ["NOVY", "NA_SCHVALENIE"]))
      .then((r) => r[0]?.p ?? 0),
    db
      .select({ p: sql<number>`count(*)::int` })
      .from(prijateMaily)
      .where(and(eq(prijateMaily.stav, "NOVY")))
      .then((r) => r[0]?.p ?? 0),
  ]);

  const polozky: PolozkaMenu[] = [
    { href: "/", popis: "Prehľad" },
    { href: "/prijate", popis: "Prijaté doklady", odznak: naSchvalenie },
    { href: "/faktury", popis: "Vystavené faktúry" },
    { href: "/banka", popis: "Banka" },
    { href: "/zakazky", popis: "Zákazky" },
    { href: "/partneri", popis: "Partneri" },
    { href: "/posta", popis: "Pošta", odznak: noveMaily },
    { href: "/export", popis: "Export" },
    { href: "/nastavenia", popis: "Nastavenia" },
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Menu polozky={polozky} meno={session.meno} rola={session.rola} />
      <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
