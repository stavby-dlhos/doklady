import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq, ne, sql, and, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { zakazky, prijateDoklady, faktury, partneri } from "@/db/schema";
import { formatEur, toCents } from "@/lib/money";
import { Nadpis, Karta, Odkaz, Odznak, Statistika, Tabulka, Prazdne } from "@/components/ui";
import { STAV_ZAKAZKY, STAV_FAKTURY, KATEGORIA, formatDatum } from "@/lib/stavy";
import { FormularZakazky } from "../formular";

export const dynamic = "force-dynamic";

export default async function DetailZakazky({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upravit?: string }>;
}) {
  const { id } = await params;
  const { upravit } = await searchParams;

  const [z] = await db.select().from(zakazky).where(eq(zakazky.id, id)).limit(1);
  if (!z) notFound();

  const [doklady, vystavene, podlaKategorii] = await Promise.all([
    db
      .select({ d: prijateDoklady, dodavatel: partneri })
      .from(prijateDoklady)
      .leftJoin(partneri, eq(prijateDoklady.dodavatelId, partneri.id))
      .where(and(eq(prijateDoklady.zakazkaId, id), ne(prijateDoklady.stav, "ZAMIETNUTY")))
      .orderBy(desc(prijateDoklady.datumVystavenia)),

    db
      .select({ f: faktury, odberatel: partneri })
      .from(faktury)
      .leftJoin(partneri, eq(faktury.odberatelId, partneri.id))
      .where(and(eq(faktury.zakazkaId, id), notInArray(faktury.stav, ["KONCEPT", "STORNO"])))
      .orderBy(desc(faktury.datumVystavenia)),

    db
      .select({
        kategoria: prijateDoklady.kategoria,
        suma: sql<string>`sum(${prijateDoklady.sumaCelkom})::text`,
      })
      .from(prijateDoklady)
      .where(and(eq(prijateDoklady.zakazkaId, id), ne(prijateDoklady.stav, "ZAMIETNUTY")))
      .groupBy(prijateDoklady.kategoria),
  ]);

  const naklady = doklady.reduce((s, x) => s + toCents(x.d.sumaCelkom), 0);
  const trzby = vystavene.reduce((s, x) => s + toCents(x.f.sumaCelkom), 0);
  const marza = trzby - naklady;
  const rozpocet = z.rozpocet ? toCents(z.rozpocet) : 0;
  const maxKategoria = Math.max(...podlaKategorii.map((k) => toCents(k.suma)), 1);

  if (upravit) {
    return (
      <>
        <div className="mb-5 flex items-start justify-between gap-3">
          <Nadpis popis={z.kod}>Upraviť zákazku</Nadpis>
          <Odkaz href={`/zakazky/${id}`} variant="tichy">
            ← Späť
          </Odkaz>
        </div>
        <FormularZakazky hodnoty={z} />
      </>
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Nadpis popis={[z.kod, z.adresa, z.investor].filter(Boolean).join(" · ")}>{z.nazov}</Nadpis>
        <div className="flex items-center gap-2">
          <Odznak farba={STAV_ZAKAZKY[z.stav].farba}>{STAV_ZAKAZKY[z.stav].popis}</Odznak>
          <Odkaz href={`/zakazky/${id}?upravit=1`} variant="sekundar">
            Upraviť
          </Odkaz>
          <Odkaz href="/zakazky" variant="tichy">
            ← Späť
          </Odkaz>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Statistika popis="Náklady" hodnota={formatEur(naklady)} detail={`${doklady.length} dokladov`} />
        <Statistika popis="Vyfakturované" hodnota={formatEur(trzby)} detail={`${vystavene.length} faktúr`} />
        <Statistika popis="Rozdiel" hodnota={formatEur(marza)} farba={marza >= 0 ? "zelena" : "cervena"} />
        <Statistika
          popis="Rozpočet"
          hodnota={rozpocet ? formatEur(rozpocet) : "—"}
          detail={rozpocet ? `vyčerpané ${Math.round((naklady / rozpocet) * 100)} %` : "nezadaný"}
          farba={rozpocet && naklady > rozpocet ? "cervena" : "sedy"}
        />
      </div>

      {podlaKategorii.length > 0 && (
        <Karta className="mt-6">
          <h2 className="mb-4 font-semibold text-antracit-900">Náklady po kategóriách</h2>
          <ul className="space-y-2.5">
            {podlaKategorii
              .sort((a, b) => toCents(b.suma) - toCents(a.suma))
              .map((k) => {
                const suma = toCents(k.suma);
                return (
                  <li key={k.kategoria}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-antracit-700">{KATEGORIA[k.kategoria]}</span>
                      <span className="font-medium tabular-nums text-antracit-900">{formatEur(suma)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-antracit-100">
                      <div
                        className="h-full rounded-full bg-zlata-500"
                        style={{ width: `${Math.round((suma / maxKategoria) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
        </Karta>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-semibold text-antracit-900">Faktúry zákazky</h2>
        {vystavene.length === 0 ? (
          <Prazdne nadpis="Zatiaľ žiadne faktúry" />
        ) : (
          <Tabulka hlavicka={["Číslo", "Odberateľ", "Vystavená", "Suma", "Stav"]}>
            {vystavene.map(({ f, odberatel }) => (
              <tr key={f.id} className="hover:bg-antracit-50">
                <td className="px-4 py-2.5">
                  <Link href={`/faktury/${f.id}`} className="font-medium text-antracit-900 hover:underline">
                    {f.cislo}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-antracit-700">{odberatel?.nazov ?? "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-antracit-600">{formatDatum(f.datumVystavenia)}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {formatEur(toCents(f.sumaCelkom))}
                </td>
                <td className="px-4 py-2.5">
                  <Odznak farba={STAV_FAKTURY[f.stav].farba}>{STAV_FAKTURY[f.stav].popis}</Odznak>
                </td>
              </tr>
            ))}
          </Tabulka>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold text-antracit-900">Náklady zákazky</h2>
        {doklady.length === 0 ? (
          <Prazdne
            nadpis="Zatiaľ žiadne doklady"
            popis="Pri zakladaní dokladu vyber túto zákazku a náklad sa sem načíta."
          />
        ) : (
          <Tabulka hlavicka={["Dátum", "Dodávateľ", "Kategória", "Popis", "Suma"]}>
            {doklady.map(({ d, dodavatel }) => (
              <tr key={d.id} className="hover:bg-antracit-50">
                <td className="px-4 py-2.5 whitespace-nowrap text-antracit-600">
                  {formatDatum(d.datumVystavenia)}
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/prijate/${d.id}`} className="text-antracit-900 hover:underline">
                    {dodavatel?.nazov ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-antracit-600">{KATEGORIA[d.kategoria]}</td>
                <td className="max-w-[16rem] truncate px-4 py-2.5 text-antracit-500">{d.popis ?? "—"}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {formatEur(toCents(d.sumaCelkom))}
                </td>
              </tr>
            ))}
          </Tabulka>
        )}
      </section>
    </>
  );
}
