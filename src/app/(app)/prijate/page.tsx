import Link from "next/link";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { prijateDoklady, partneri, zakazky } from "@/db/schema";
import { formatEur, toCents } from "@/lib/money";
import { Nadpis, Odkaz, Odznak, Prazdne, Tabulka, Vstup, Vyber, Tlacidlo, Karta } from "@/components/ui";
import { STAV_DOKLADU, TYP_DOKLADU, KATEGORIA, ZDROJ, formatDatum } from "@/lib/stavy";

export const dynamic = "force-dynamic";

interface Filtre {
  stav?: string;
  zakazka?: string;
  kategoria?: string;
  od?: string;
  do?: string;
  hladat?: string;
}

export default async function ZoznamDokladov({ searchParams }: { searchParams: Promise<Filtre> }) {
  const f = await searchParams;

  const podmienky: SQL[] = [];
  if (f.stav) podmienky.push(eq(prijateDoklady.stav, f.stav as "NOVY"));
  if (f.zakazka) podmienky.push(eq(prijateDoklady.zakazkaId, f.zakazka));
  if (f.kategoria) podmienky.push(eq(prijateDoklady.kategoria, f.kategoria as "MATERIAL"));
  if (f.od) podmienky.push(gte(prijateDoklady.datumVystavenia, new Date(f.od)));
  if (f.do) podmienky.push(lte(prijateDoklady.datumVystavenia, new Date(`${f.do}T23:59:59`)));
  if (f.hladat) {
    const vzor = `%${f.hladat}%`;
    const vyhladavanie = or(
      ilike(prijateDoklady.cisloDokladu, vzor),
      ilike(prijateDoklady.popis, vzor),
      ilike(prijateDoklady.variabilnySymbol, vzor),
      ilike(partneri.nazov, vzor),
    );
    if (vyhladavanie) podmienky.push(vyhladavanie);
  }

  const kde = podmienky.length ? and(...podmienky) : undefined;

  const [riadky, suhrn, vsetkyZakazky] = await Promise.all([
    db
      .select({ d: prijateDoklady, dodavatel: partneri, zakazka: zakazky })
      .from(prijateDoklady)
      .leftJoin(partneri, eq(prijateDoklady.dodavatelId, partneri.id))
      .leftJoin(zakazky, eq(prijateDoklady.zakazkaId, zakazky.id))
      .where(kde)
      .orderBy(desc(prijateDoklady.datumVystavenia), desc(prijateDoklady.createdAt))
      .limit(300),

    db
      .select({
        pocet: sql<number>`count(*)::int`,
        suma: sql<string>`coalesce(sum(${prijateDoklady.sumaCelkom}), 0)::text`,
        dph: sql<string>`coalesce(sum(${prijateDoklady.sumaDph}), 0)::text`,
      })
      .from(prijateDoklady)
      .leftJoin(partneri, eq(prijateDoklady.dodavatelId, partneri.id))
      .where(kde)
      .then((r) => r[0]),

    db.select().from(zakazky).where(inArray(zakazky.stav, ["AKTIVNA", "PRIPRAVA"])).orderBy(zakazky.kod),
  ]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Nadpis popis={`${suhrn.pocet} dokladov · ${formatEur(toCents(suhrn.suma))} vrátane DPH ${formatEur(toCents(suhrn.dph))}`}>
          Prijaté doklady
        </Nadpis>
        <Odkaz href="/prijate/novy" variant="primar">
          + Nový doklad
        </Odkaz>
      </div>

      <Karta className="mb-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Vstup name="hladat" placeholder="Hľadať dodávateľa, číslo, VS…" defaultValue={f.hladat ?? ""} />
          </div>
          <Vyber name="stav" defaultValue={f.stav ?? ""}>
            <option value="">Všetky stavy</option>
            {Object.entries(STAV_DOKLADU).map(([k, v]) => (
              <option key={k} value={k}>
                {v.popis}
              </option>
            ))}
          </Vyber>
          <Vyber name="zakazka" defaultValue={f.zakazka ?? ""}>
            <option value="">Všetky zákazky</option>
            {vsetkyZakazky.map((z) => (
              <option key={z.id} value={z.id}>
                {z.kod} — {z.nazov}
              </option>
            ))}
          </Vyber>
          <Vstup type="date" name="od" defaultValue={f.od ?? ""} aria-label="Od dátumu" />
          <div className="flex gap-2">
            <Vstup type="date" name="do" defaultValue={f.do ?? ""} aria-label="Do dátumu" />
            <Tlacidlo type="submit" variant="sekundar">
              Filtrovať
            </Tlacidlo>
          </div>
        </form>
      </Karta>

      {riadky.length === 0 ? (
        <Prazdne
          nadpis="Žiadne doklady"
          popis="Buď tu ešte nič nie je, alebo filtre nič nenašli."
          akcia={<Odkaz href="/prijate/novy">Pridať doklad</Odkaz>}
        />
      ) : (
        <Tabulka hlavicka={["Dátum", "Dodávateľ", "Typ / kategória", "Zákazka", "Suma", "Stav", ""]}>
          {riadky.map(({ d, dodavatel, zakazka }) => (
            <tr key={d.id} className="hover:bg-antracit-50">
              <td className="px-4 py-2.5 whitespace-nowrap text-antracit-700">
                {formatDatum(d.datumVystavenia)}
                {d.zdroj !== "RUCNE" && (
                  <span className="ml-1.5 text-xs text-antracit-400">{ZDROJ[d.zdroj]}</span>
                )}
              </td>
              <td className="max-w-[14rem] px-4 py-2.5">
                <Link href={`/prijate/${d.id}`} className="font-medium text-antracit-900 hover:underline">
                  {dodavatel?.nazov ?? d.popis ?? "Bez dodávateľa"}
                </Link>
                {d.cisloDokladu && <div className="text-xs text-antracit-500">č. {d.cisloDokladu}</div>}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-antracit-600">
                {TYP_DOKLADU[d.typ]}
                <span className="block text-xs text-antracit-400">{KATEGORIA[d.kategoria]}</span>
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-antracit-600">
                {zakazka ? (
                  <Link href={`/zakazky/${zakazka.id}`} className="hover:underline">
                    {zakazka.kod}
                  </Link>
                ) : (
                  <span className="text-antracit-400">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                {formatEur(toCents(d.sumaCelkom))}
                {d.prenosDph && <span className="ml-1 text-xs font-normal text-antracit-400">PDP</span>}
              </td>
              <td className="px-4 py-2.5">
                <Odznak farba={STAV_DOKLADU[d.stav].farba}>{STAV_DOKLADU[d.stav].popis}</Odznak>
                {d.ocrConfidence !== null && d.ocrConfidence < 0.7 && (
                  <span className="ml-1" title="OCR si nebolo isté – skontroluj údaje">
                    <Odznak farba="zlta">?</Odznak>
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/prijate/${d.id}`} className="text-sm text-antracit-500 hover:text-antracit-900">
                  Detail →
                </Link>
              </td>
            </tr>
          ))}
        </Tabulka>
      )}

      {riadky.length === 300 && (
        <p className="mt-3 text-xs text-antracit-500">
          Zobrazených prvých 300 dokladov. Zúž filtre, ak hľadáš starší doklad.
        </p>
      )}
    </>
  );
}
