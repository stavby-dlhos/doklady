import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bankPohyby, bankUcty, faktury, partneri } from "@/db/schema";
import { formatEur, toCents } from "@/lib/money";
import { Nadpis, Karta, Tabulka, Prazdne, Odznak, Statistika, Info } from "@/components/ui";
import { formatDatum } from "@/lib/stavy";
import { PanelImportu, PriradenieUhrady } from "./ui";

export const dynamic = "force-dynamic";

export default async function Banka() {
  const [ucty, nesparovane, poslednePohyby, suhrn, otvoreneFaktury] = await Promise.all([
    db.select().from(bankUcty).orderBy(desc(bankUcty.vychodzi)),

    db
      .select({ p: bankPohyby, ucet: bankUcty })
      .from(bankPohyby)
      .leftJoin(bankUcty, eq(bankPohyby.ucetId, bankUcty.id))
      .where(eq(bankPohyby.sparovane, false))
      .orderBy(desc(bankPohyby.datum))
      .limit(100),

    db
      .select({ p: bankPohyby, ucet: bankUcty })
      .from(bankPohyby)
      .leftJoin(bankUcty, eq(bankPohyby.ucetId, bankUcty.id))
      .where(eq(bankPohyby.sparovane, true))
      .orderBy(desc(bankPohyby.datum))
      .limit(40),

    db
      .select({
        prichody: sql<string>`coalesce(sum(${bankPohyby.suma}) filter (where ${bankPohyby.smer} = 'PRICHOD'), 0)::text`,
        odchody: sql<string>`coalesce(sum(${bankPohyby.suma}) filter (where ${bankPohyby.smer} = 'ODCHOD'), 0)::text`,
        pocet: sql<number>`count(*)::int`,
      })
      .from(bankPohyby)
      .then((r) => r[0]),

    db
      .select({ id: faktury.id, cislo: faktury.cislo, suma: faktury.sumaCelkom, uhradene: faktury.uhradene, odberatel: partneri.nazov })
      .from(faktury)
      .leftJoin(partneri, eq(faktury.odberatelId, partneri.id))
      .where(inArray(faktury.stav, ["ODOSLANA", "CIASTOCNE_UHRADENA", "PO_SPLATNOSTI"]))
      .orderBy(faktury.datumSplatnosti),
  ]);

  return (
    <>
      <Nadpis popis="Nahraj výpis z internet bankingu — úhrady sa spárujú samé.">Banka</Nadpis>

      {ucty.length === 0 ? (
        <div className="mb-5">
          <Info>
            Ešte nemáš pridaný bankový účet. Pridaj ho nižšie — bez neho sa výpis nedá naimportovať.
          </Info>
        </div>
      ) : (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Statistika popis="Príchody spolu" hodnota={formatEur(toCents(suhrn.prichody))} farba="zelena" />
          <Statistika popis="Odchody spolu" hodnota={formatEur(toCents(suhrn.odchody))} />
          <Statistika
            popis="Nespárované"
            hodnota={String(nesparovane.length)}
            detail={`z ${suhrn.pocet} pohybov`}
            farba={nesparovane.length > 0 ? "zlta" : "zelena"}
          />
        </div>
      )}

      <div className="mb-6">
        <PanelImportu ucty={ucty.map((u) => ({ id: u.id, nazov: u.nazov, iban: u.iban }))} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold text-antracit-900">
          Nespárované pohyby {nesparovane.length > 0 && `(${nesparovane.length})`}
        </h2>

        {nesparovane.length === 0 ? (
          <Prazdne nadpis="Všetko spárované" popis="Každý pohyb má priradený doklad alebo faktúru." />
        ) : (
          <Tabulka hlavicka={["Dátum", "Protistrana", "VS", "Popis", "Suma", "Priradiť"]}>
            {nesparovane.map(({ p }) => (
              <tr key={p.id} className="hover:bg-antracit-50">
                <td className="px-4 py-2.5 whitespace-nowrap text-antracit-600">{formatDatum(p.datum)}</td>
                <td className="max-w-[12rem] truncate px-4 py-2.5 text-antracit-800">
                  {p.protiucetNazov ?? p.protiucetIban ?? "—"}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-antracit-600">{p.variabilnySymbol ?? "—"}</td>
                <td className="max-w-[16rem] truncate px-4 py-2.5 text-xs text-antracit-500">{p.popis ?? "—"}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <span
                    className={`font-semibold tabular-nums ${p.smer === "PRICHOD" ? "text-emerald-700" : "text-antracit-900"}`}
                  >
                    {p.smer === "PRICHOD" ? "+" : "−"}
                    {formatEur(toCents(p.suma))}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <PriradenieUhrady
                    pohybId={p.id}
                    jePrichod={p.smer === "PRICHOD"}
                    faktury={otvoreneFaktury.map((f) => ({
                      id: f.id,
                      popis: `${f.cislo} · ${f.odberatel ?? "—"} · zostáva ${formatEur(toCents(f.suma) - toCents(f.uhradene))}`,
                    }))}
                  />
                </td>
              </tr>
            ))}
          </Tabulka>
        )}
      </section>

      {poslednePohyby.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold text-antracit-900">Posledné spárované pohyby</h2>
          <Karta padding={false}>
            <ul className="divide-y divide-antracit-100">
              {poslednePohyby.map(({ p }) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="text-antracit-800">{p.protiucetNazov ?? p.popis ?? "—"}</span>
                    <span className="block text-xs text-antracit-500">
                      {formatDatum(p.datum)}
                      {p.variabilnySymbol ? ` · VS ${p.variabilnySymbol}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Odznak farba="zelena">spárované</Odznak>
                    <span
                      className={`font-semibold tabular-nums ${p.smer === "PRICHOD" ? "text-emerald-700" : "text-antracit-700"}`}
                    >
                      {p.smer === "PRICHOD" ? "+" : "−"}
                      {formatEur(toCents(p.suma))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Karta>
        </section>
      )}
    </>
  );
}
