import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { partneri, prijateDoklady, faktury } from "@/db/schema";
import { formatEur, toCents } from "@/lib/money";
import { Nadpis, Odkaz, Karta, Tabulka, Prazdne, Odznak } from "@/components/ui";
import { STAV_FAKTURY, formatDatum } from "@/lib/stavy";
import { FormularPartnera } from "../formular";
import { TlacidloArchivu } from "./ui";

export const dynamic = "force-dynamic";

export default async function DetailPartnera({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [p] = await db.select().from(partneri).where(eq(partneri.id, id)).limit(1);
  if (!p) notFound();

  const [doklady, vystavene] = await Promise.all([
    db
      .select()
      .from(prijateDoklady)
      .where(eq(prijateDoklady.dodavatelId, id))
      .orderBy(desc(prijateDoklady.datumVystavenia))
      .limit(20),
    db.select().from(faktury).where(eq(faktury.odberatelId, id)).orderBy(desc(faktury.datumVystavenia)).limit(20),
  ]);

  const nakupene = doklady.reduce((s, d) => s + toCents(d.sumaCelkom), 0);
  const fakturovane = vystavene
    .filter((f) => f.stav !== "KONCEPT" && f.stav !== "STORNO")
    .reduce((s, f) => s + toCents(f.sumaCelkom), 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Nadpis popis={[p.ico ? `IČO ${p.ico}` : null, p.mesto].filter(Boolean).join(" · ")}>{p.nazov}</Nadpis>
        <div className="flex items-center gap-2">
          {p.archivovany && <Odznak farba="sedy">Archivovaný</Odznak>}
          <TlacidloArchivu id={p.id} archivovany={p.archivovany} />
          <Odkaz href="/partneri" variant="tichy">
            ← Späť
          </Odkaz>
        </div>
      </div>

      {(doklady.length > 0 || vystavene.length > 0) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Karta>
            <p className="text-xs font-medium uppercase tracking-wide text-antracit-500">Nakúpené od partnera</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-antracit-900">{formatEur(nakupene)}</p>
            <p className="mt-1 text-xs text-antracit-500">{doklady.length} dokladov</p>
          </Karta>
          <Karta>
            <p className="text-xs font-medium uppercase tracking-wide text-antracit-500">Vyfakturované partnerovi</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-antracit-900">{formatEur(fakturovane)}</p>
            <p className="mt-1 text-xs text-antracit-500">{vystavene.length} faktúr</p>
          </Karta>
        </div>
      )}

      <FormularPartnera hodnoty={p} />

      {vystavene.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold text-antracit-900">Vystavené faktúry</h2>
          <Tabulka hlavicka={["Číslo", "Vystavená", "Suma", "Stav"]}>
            {vystavene.map((f) => (
              <tr key={f.id} className="hover:bg-antracit-50">
                <td className="px-4 py-2.5">
                  <Link href={`/faktury/${f.id}`} className="font-medium text-antracit-900 hover:underline">
                    {f.cislo}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-antracit-600">{formatDatum(f.datumVystavenia)}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {formatEur(toCents(f.sumaCelkom))}
                </td>
                <td className="px-4 py-2.5">
                  <Odznak farba={STAV_FAKTURY[f.stav].farba}>{STAV_FAKTURY[f.stav].popis}</Odznak>
                </td>
              </tr>
            ))}
          </Tabulka>
        </section>
      )}

      {doklady.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold text-antracit-900">Prijaté doklady</h2>
          <Tabulka hlavicka={["Dátum", "Číslo", "Popis", "Suma"]}>
            {doklady.map((d) => (
              <tr key={d.id} className="hover:bg-antracit-50">
                <td className="px-4 py-2.5 text-antracit-600">{formatDatum(d.datumVystavenia)}</td>
                <td className="px-4 py-2.5">
                  <Link href={`/prijate/${d.id}`} className="text-antracit-900 hover:underline">
                    {d.cisloDokladu ?? "—"}
                  </Link>
                </td>
                <td className="max-w-[18rem] truncate px-4 py-2.5 text-antracit-500">{d.popis ?? "—"}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {formatEur(toCents(d.sumaCelkom))}
                </td>
              </tr>
            ))}
          </Tabulka>
        </section>
      )}

      {doklady.length === 0 && vystavene.length === 0 && (
        <div className="mt-8">
          <Prazdne nadpis="Zatiaľ žiadne doklady ani faktúry" />
        </div>
      )}
    </>
  );
}
