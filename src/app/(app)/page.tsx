import Link from "next/link";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { faktury, prijateDoklady, partneri, zakazky, bankPohyby, prijateMaily } from "@/db/schema";
import { oznacPoSplatnosti } from "@/lib/parovanie";
import { formatEur, toCents } from "@/lib/money";
import { Karta, Nadpis, Odznak, Statistika, Odkaz, Prazdne, Tabulka } from "@/components/ui";
import { STAV_DOKLADU, STAV_FAKTURY, formatDatum, dniDo } from "@/lib/stavy";

export const dynamic = "force-dynamic";

export default async function Prehlad() {
  await oznacPoSplatnosti();

  const teraz = new Date();
  const zaciatokMesiaca = new Date(teraz.getFullYear(), teraz.getMonth(), 1);
  const koniecMesiaca = new Date(teraz.getFullYear(), teraz.getMonth() + 1, 0, 23, 59, 59);

  const [
    nakladyMesiac,
    trzbyMesiac,
    neuhradene,
    poSplatnosti,
    caka,
    noveMaily,
    poslednejDoklady,
    otvoreneFaktury,
    nesparovane,
  ] = await Promise.all([
    db
      .select({ s: sql<string>`coalesce(sum(${prijateDoklady.sumaCelkom}), 0)::text` })
      .from(prijateDoklady)
      .where(
        and(
          gte(prijateDoklady.datumVystavenia, zaciatokMesiaca),
          lte(prijateDoklady.datumVystavenia, koniecMesiaca),
          inArray(prijateDoklady.stav, ["NOVY", "NA_SCHVALENIE", "SCHVALENY", "ZAUCTOVANY"]),
        ),
      )
      .then((r) => toCents(r[0]?.s ?? "0")),

    db
      .select({ s: sql<string>`coalesce(sum(${faktury.sumaCelkom}), 0)::text` })
      .from(faktury)
      .where(
        and(
          gte(faktury.datumVystavenia, zaciatokMesiaca),
          lte(faktury.datumVystavenia, koniecMesiaca),
          inArray(faktury.stav, ["ODOSLANA", "CIASTOCNE_UHRADENA", "UHRADENA", "PO_SPLATNOSTI"]),
        ),
      )
      .then((r) => toCents(r[0]?.s ?? "0")),

    db
      .select({ s: sql<string>`coalesce(sum(${faktury.sumaCelkom} - ${faktury.uhradene}), 0)::text` })
      .from(faktury)
      .where(inArray(faktury.stav, ["ODOSLANA", "CIASTOCNE_UHRADENA", "PO_SPLATNOSTI"]))
      .then((r) => toCents(r[0]?.s ?? "0")),

    db
      .select({ s: sql<string>`coalesce(sum(${faktury.sumaCelkom} - ${faktury.uhradene}), 0)::text`, p: sql<number>`count(*)::int` })
      .from(faktury)
      .where(eq(faktury.stav, "PO_SPLATNOSTI"))
      .then((r) => ({ suma: toCents(r[0]?.s ?? "0"), pocet: r[0]?.p ?? 0 })),

    db
      .select({ p: sql<number>`count(*)::int` })
      .from(prijateDoklady)
      .where(inArray(prijateDoklady.stav, ["NOVY", "NA_SCHVALENIE"]))
      .then((r) => r[0]?.p ?? 0),

    db
      .select({ p: sql<number>`count(*)::int` })
      .from(prijateMaily)
      .where(eq(prijateMaily.stav, "NOVY"))
      .then((r) => r[0]?.p ?? 0),

    db
      .select({ d: prijateDoklady, dodavatel: partneri, zakazka: zakazky })
      .from(prijateDoklady)
      .leftJoin(partneri, eq(prijateDoklady.dodavatelId, partneri.id))
      .leftJoin(zakazky, eq(prijateDoklady.zakazkaId, zakazky.id))
      .orderBy(desc(prijateDoklady.createdAt))
      .limit(6),

    db
      .select({ f: faktury, odberatel: partneri })
      .from(faktury)
      .leftJoin(partneri, eq(faktury.odberatelId, partneri.id))
      .where(inArray(faktury.stav, ["ODOSLANA", "CIASTOCNE_UHRADENA", "PO_SPLATNOSTI"]))
      .orderBy(faktury.datumSplatnosti)
      .limit(6),

    db
      .select({ p: sql<number>`count(*)::int` })
      .from(bankPohyby)
      .where(eq(bankPohyby.sparovane, false))
      .then((r) => r[0]?.p ?? 0),
  ]);

  const vysledokMesiaca = trzbyMesiac - nakladyMesiac;

  return (
    <>
      <Nadpis popis={`Stav k ${formatDatum(teraz)}`}>Prehľad</Nadpis>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Statistika
          popis="Neuhradené faktúry"
          hodnota={formatEur(neuhradene)}
          detail={poSplatnosti.pocet ? `z toho ${formatEur(poSplatnosti.suma)} po splatnosti` : "všetko v lehote"}
          farba={poSplatnosti.pocet ? "cervena" : "zelena"}
        />
        <Statistika popis="Náklady tento mesiac" hodnota={formatEur(nakladyMesiac)} />
        <Statistika popis="Tržby tento mesiac" hodnota={formatEur(trzbyMesiac)} />
        <Statistika
          popis="Rozdiel"
          hodnota={formatEur(vysledokMesiaca)}
          farba={vysledokMesiaca >= 0 ? "zelena" : "cervena"}
        />
      </div>

      {(caka > 0 || noveMaily > 0 || nesparovane > 0) && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {caka > 0 && (
            <Link
              href="/prijate?stav=NA_SCHVALENIE"
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100"
            >
              <p className="text-lg font-bold text-amber-900">{caka}</p>
              <p className="text-sm text-amber-800">
                {caka === 1 ? "doklad čaká" : caka < 5 ? "doklady čakajú" : "dokladov čaká"} na spracovanie
              </p>
            </Link>
          )}
          {noveMaily > 0 && (
            <Link
              href="/posta"
              className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 transition-colors hover:bg-sky-100"
            >
              <p className="text-lg font-bold text-sky-900">{noveMaily}</p>
              <p className="text-sm text-sky-800">
                {noveMaily === 1 ? "nový e-mail" : "nových e-mailov"} v podateľni
              </p>
            </Link>
          )}
          {nesparovane > 0 && (
            <Link
              href="/banka"
              className="rounded-lg border border-antracit-200 bg-white px-4 py-3 transition-colors hover:bg-antracit-50"
            >
              <p className="text-lg font-bold text-antracit-900">{nesparovane}</p>
              <p className="text-sm text-antracit-600">nespárovaných bankových pohybov</p>
            </Link>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-antracit-900">Posledné doklady</h2>
            <Odkaz href="/prijate" variant="tichy" className="text-sm">
              Všetky →
            </Odkaz>
          </div>

          {poslednejDoklady.length === 0 ? (
            <Prazdne
              nadpis="Zatiaľ žiadne doklady"
              popis="Nahraj prvý bloček alebo prepošli faktúru do podateľne."
              akcia={<Odkaz href="/prijate/novy">Pridať doklad</Odkaz>}
            />
          ) : (
            <Karta padding={false}>
              <ul className="divide-y divide-antracit-100">
                {poslednejDoklady.map(({ d, dodavatel, zakazka }) => (
                  <li key={d.id}>
                    <Link
                      href={`/prijate/${d.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-antracit-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-antracit-900">
                          {dodavatel?.nazov ?? d.popis ?? "Bez dodávateľa"}
                        </p>
                        <p className="truncate text-xs text-antracit-500">
                          {formatDatum(d.datumVystavenia)}
                          {zakazka ? ` · ${zakazka.kod}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatEur(toCents(d.sumaCelkom))}
                        </span>
                        <Odznak farba={STAV_DOKLADU[d.stav].farba}>{STAV_DOKLADU[d.stav].popis}</Odznak>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Karta>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-antracit-900">Čaká na úhradu</h2>
            <Odkaz href="/faktury" variant="tichy" className="text-sm">
              Všetky →
            </Odkaz>
          </div>

          {otvoreneFaktury.length === 0 ? (
            <Prazdne nadpis="Všetko uhradené" popis="Žiadna faktúra nečaká na platbu." />
          ) : (
            <Tabulka hlavicka={["Faktúra", "Odberateľ", "Splatnosť", "Zostáva"]}>
              {otvoreneFaktury.map(({ f, odberatel }) => {
                const dni = dniDo(f.datumSplatnosti);
                const zostava = toCents(f.sumaCelkom) - toCents(f.uhradene);
                return (
                  <tr key={f.id} className="hover:bg-antracit-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/faktury/${f.id}`} className="font-medium text-antracit-900 hover:underline">
                        {f.cislo}
                      </Link>
                      <div className="mt-0.5">
                        <Odznak farba={STAV_FAKTURY[f.stav].farba}>{STAV_FAKTURY[f.stav].popis}</Odznak>
                      </div>
                    </td>
                    <td className="max-w-[10rem] truncate px-4 py-2.5 text-antracit-700">
                      {odberatel?.nazov ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={dni < 0 ? "font-medium text-red-600" : "text-antracit-700"}>
                        {formatDatum(f.datumSplatnosti)}
                      </span>
                      <span className="block text-xs text-antracit-500">
                        {dni < 0 ? `${Math.abs(dni)} dní po` : dni === 0 ? "dnes" : `o ${dni} dní`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatEur(zostava)}
                    </td>
                  </tr>
                );
              })}
            </Tabulka>
          )}
        </section>
      </div>
    </>
  );
}
