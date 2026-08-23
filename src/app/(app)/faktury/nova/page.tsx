import { asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { ciselneRady, partneri, zakazky, firma } from "@/db/schema";
import { nahladDalsiehoCisla } from "@/lib/cisla";
import { Nadpis, Odkaz, Info } from "@/components/ui";
import { EditorFaktury } from "../editor";

export const dynamic = "force-dynamic";

export default async function NovaFaktura() {
  const [rady, odberatelia, aktivneZakazky, nastavenia] = await Promise.all([
    db.select().from(ciselneRady).orderBy(asc(ciselneRady.typ)),
    db
      .select({
        id: partneri.id,
        nazov: partneri.nazov,
        jePlatitelDph: partneri.jePlatitelDph,
        krajina: partneri.krajina,
        email: partneri.email,
      })
      .from(partneri)
      .where(or(eq(partneri.typ, "ODBERATEL"), eq(partneri.typ, "OBOJE")))
      .orderBy(asc(partneri.nazov)),
    db
      .select({ id: zakazky.id, kod: zakazky.kod, nazov: zakazky.nazov })
      .from(zakazky)
      .where(inArray(zakazky.stav, ["AKTIVNA", "PRIPRAVA"]))
      .orderBy(asc(zakazky.kod)),
    db.select().from(firma).where(eq(firma.id, "firma")).limit(1).then((r) => r[0]),
  ]);

  const radySNahladom = await Promise.all(
    rady.map(async (r) => ({ id: r.id, nazov: r.nazov, nasledujuce: await nahladDalsiehoCisla(r.id) })),
  );

  if (odberatelia.length === 0) {
    return (
      <>
        <Nadpis>Nová faktúra</Nadpis>
        <Info>
          Najprv si založ odberateľa v sekcii Partneri — bez neho sa faktúra nedá vystaviť.{" "}
          <Odkaz href="/partneri/novy" variant="tichy" className="underline">
            Pridať partnera
          </Odkaz>
        </Info>
      </>
    );
  }

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <Nadpis popis="Číslo sa pridelí až pri uložení, aby v rade nevznikli diery.">Nová faktúra</Nadpis>
        <Odkaz href="/faktury" variant="tichy">
          ← Späť
        </Odkaz>
      </div>

      <EditorFaktury
        rady={radySNahladom}
        odberatelia={odberatelia}
        zakazkyZoznam={aktivneZakazky.map((z) => ({ id: z.id, nazov: `${z.kod} — ${z.nazov}` }))}
        firmaPlatitelDph={nastavenia?.jePlatitelDph ?? false}
        splatnostDni={nastavenia?.splatnostDni ?? 14}
      />
    </>
  );
}
