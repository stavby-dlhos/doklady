import { inArray, or, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { partneri, zakazky } from "@/db/schema";
import { Nadpis, Odkaz } from "@/components/ui";
import { FormularDokladu } from "../formular";

export const dynamic = "force-dynamic";

export default async function NovyDoklad() {
  const [dodavatelia, aktivneZakazky] = await Promise.all([
    db
      .select({ id: partneri.id, nazov: partneri.nazov })
      .from(partneri)
      .where(or(eq(partneri.typ, "DODAVATEL"), eq(partneri.typ, "OBOJE")))
      .orderBy(asc(partneri.nazov)),
    db
      .select({ id: zakazky.id, kod: zakazky.kod, nazov: zakazky.nazov })
      .from(zakazky)
      .where(inArray(zakazky.stav, ["AKTIVNA", "PRIPRAVA"]))
      .orderBy(asc(zakazky.kod)),
  ]);

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <Nadpis popis="Odfoť bloček alebo nahraj PDF — údaje sa vyplnia samé.">Nový doklad</Nadpis>
        <Odkaz href="/prijate" variant="tichy">
          ← Späť
        </Odkaz>
      </div>

      <FormularDokladu
        jeNovy
        dodavatelia={dodavatelia}
        zakazkyZoznam={aktivneZakazky.map((z) => ({ id: z.id, nazov: `${z.kod} — ${z.nazov}` }))}
      />
    </>
  );
}
