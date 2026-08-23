import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { faktury, partneri, zakazky } from "@/db/schema";
import { oznacPoSplatnosti } from "@/lib/parovanie";
import { formatEur, toCents } from "@/lib/money";
import { Nadpis, Odkaz, Odznak, Prazdne, Tabulka, Vstup, Vyber, Tlacidlo, Karta, Statistika } from "@/components/ui";
import { STAV_FAKTURY, TYP_FAKTURY, formatDatum, dniDo } from "@/lib/stavy";

export const dynamic = "force-dynamic";

export default async function ZoznamFaktur({
  searchParams,
}: {
  searchParams: Promise<{ stav?: string; hladat?: string }>;
}) {
  await oznacPoSplatnosti();
  const f = await searchParams;

  const podmienky: SQL[] = [];
  if (f.stav) podmienky.push(eq(faktury.stav, f.stav as "KONCEPT"));
  if (f.hladat) {
    const vzor = `%${f.hladat}%`;
    const h = or(ilike(faktury.cislo, vzor), ilike(faktury.variabilnySymbol, vzor), ilike(partneri.nazov, vzor));
    if (h) podmienky.push(h);
  }
  const kde = podmienky.length ? and(...podmienky) : undefined;

  const [riadky, suhrn] = await Promise.all([
    db
      .select({ f: faktury, odberatel: partneri, zakazka: zakazky })
      .from(faktury)
      .leftJoin(partneri, eq(faktury.odberatelId, partneri.id))
      .leftJoin(zakazky, eq(faktury.zakazkaId, zakazky.id))
      .where(kde)
      .orderBy(desc(faktury.datumVystavenia), desc(faktury.cislo))
      .limit(300),

    db
      .select({
        pocet: sql<number>`count(*)::int`,
        fakturovane: sql<string>`coalesce(sum(${faktury.sumaCelkom}) filter (where ${faktury.stav} <> 'STORNO' and ${faktury.stav} <> 'KONCEPT'), 0)::text`,
        neuhradene: sql<string>`coalesce(sum(${faktury.sumaCelkom} - ${faktury.uhradene}) filter (where ${faktury.stav} in ('ODOSLANA','CIASTOCNE_UHRADENA','PO_SPLATNOSTI')), 0)::text`,
        poSplatnosti: sql<string>`coalesce(sum(${faktury.sumaCelkom} - ${faktury.uhradene}) filter (where ${faktury.stav} = 'PO_SPLATNOSTI'), 0)::text`,
      })
      .from(faktury)
      .leftJoin(partneri, eq(faktury.odberatelId, partneri.id))
      .where(kde)
      .then((r) => r[0]),
  ]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Nadpis popis={`${suhrn.pocet} faktúr`}>Vystavené faktúry</Nadpis>
        <Odkaz href="/faktury/nova" variant="primar">
          + Nová faktúra
        </Odkaz>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Statistika popis="Vyfakturované" hodnota={formatEur(toCents(suhrn.fakturovane))} />
        <Statistika popis="Čaká na úhradu" hodnota={formatEur(toCents(suhrn.neuhradene))} farba="zlta" />
        <Statistika
          popis="Po splatnosti"
          hodnota={formatEur(toCents(suhrn.poSplatnosti))}
          farba={toCents(suhrn.poSplatnosti) > 0 ? "cervena" : "zelena"}
        />
      </div>

      <Karta className="mb-5">
        <form className="flex flex-wrap gap-3">
          <div className="min-w-[16rem] flex-1">
            <Vstup name="hladat" placeholder="Číslo faktúry, VS alebo odberateľ…" defaultValue={f.hladat ?? ""} />
          </div>
          <Vyber name="stav" defaultValue={f.stav ?? ""} className="w-auto">
            <option value="">Všetky stavy</option>
            {Object.entries(STAV_FAKTURY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.popis}
              </option>
            ))}
          </Vyber>
          <Tlacidlo type="submit" variant="sekundar">
            Filtrovať
          </Tlacidlo>
        </form>
      </Karta>

      {riadky.length === 0 ? (
        <Prazdne
          nadpis="Žiadne faktúry"
          popis="Vystav prvú faktúru — číslo sa pridelí automaticky."
          akcia={<Odkaz href="/faktury/nova">Nová faktúra</Odkaz>}
        />
      ) : (
        <Tabulka hlavicka={["Číslo", "Odberateľ", "Vystavená", "Splatnosť", "Suma", "Stav", ""]}>
          {riadky.map(({ f: fa, odberatel, zakazka }) => {
            const dni = dniDo(fa.datumSplatnosti);
            const otvorena = ["ODOSLANA", "CIASTOCNE_UHRADENA", "PO_SPLATNOSTI"].includes(fa.stav);
            return (
              <tr key={fa.id} className="hover:bg-antracit-50">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <Link href={`/faktury/${fa.id}`} className="font-medium text-antracit-900 hover:underline">
                    {fa.cislo}
                  </Link>
                  {fa.typ !== "BEZNA" && (
                    <span className="block text-xs text-antracit-500">{TYP_FAKTURY[fa.typ]}</span>
                  )}
                </td>
                <td className="max-w-[14rem] px-4 py-2.5">
                  <span className="block truncate text-antracit-800">{odberatel?.nazov ?? "—"}</span>
                  {zakazka && <span className="block text-xs text-antracit-500">{zakazka.kod}</span>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-antracit-600">
                  {formatDatum(fa.datumVystavenia)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className={otvorena && dni < 0 ? "font-medium text-red-600" : "text-antracit-600"}>
                    {formatDatum(fa.datumSplatnosti)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <span className="font-semibold tabular-nums">{formatEur(toCents(fa.sumaCelkom))}</span>
                  {toCents(fa.uhradene) > 0 && toCents(fa.uhradene) < toCents(fa.sumaCelkom) && (
                    <span className="block text-xs text-antracit-500">
                      uhradené {formatEur(toCents(fa.uhradene))}
                    </span>
                  )}
                  {fa.prenosDph && <span className="block text-xs text-antracit-400">PDP</span>}
                </td>
                <td className="px-4 py-2.5">
                  <Odznak farba={STAV_FAKTURY[fa.stav].farba}>{STAV_FAKTURY[fa.stav].popis}</Odznak>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <Link
                    href={`/api/faktura/${fa.id}/pdf`}
                    target="_blank"
                    className="text-sm text-antracit-500 hover:text-antracit-900"
                  >
                    PDF
                  </Link>
                </td>
              </tr>
            );
          })}
        </Tabulka>
      )}
    </>
  );
}
