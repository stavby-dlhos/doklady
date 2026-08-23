import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  faktury,
  fakturaPolozky,
  partneri,
  zakazky,
  uhrady,
  firma,
  ciselneRady,
  auditLog,
  pouzivatelia,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { formatEur, formatMnozstvo, toCents } from "@/lib/money";
import { Karta, Nadpis, Odznak, Odkaz, Info } from "@/components/ui";
import { STAV_FAKTURY, TYP_FAKTURY, FORMA_UHRADY, formatDatum, formatDatumCas, naInputDatum } from "@/lib/stavy";
import { POZNAMKA_PRENOS_DPH } from "@/lib/dph";
import { EditorFaktury } from "../editor";
import { AkcieFaktury } from "./akcie-ui";

export const dynamic = "force-dynamic";

export default async function DetailFaktury({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  const [zaznam] = await db
    .select({ f: faktury, odberatel: partneri, zakazka: zakazky })
    .from(faktury)
    .leftJoin(partneri, eq(faktury.odberatelId, partneri.id))
    .leftJoin(zakazky, eq(faktury.zakazkaId, zakazky.id))
    .where(eq(faktury.id, id))
    .limit(1);

  if (!zaznam) notFound();
  const { f, odberatel, zakazka } = zaznam;

  const [polozky, platby, nastavenia, historia] = await Promise.all([
    db.select().from(fakturaPolozky).where(eq(fakturaPolozky.fakturaId, id)).orderBy(fakturaPolozky.poradie),
    db.select().from(uhrady).where(eq(uhrady.fakturaId, id)).orderBy(uhrady.datum),
    db.select().from(firma).where(eq(firma.id, "firma")).limit(1).then((r) => r[0]),
    db
      .select({ a: auditLog, u: pouzivatelia })
      .from(auditLog)
      .leftJoin(pouzivatelia, eq(auditLog.pouzivatelId, pouzivatelia.id))
      .where(eq(auditLog.entitaId, id))
      .orderBy(auditLog.createdAt),
  ]);

  const jeKoncept = f.stav === "KONCEPT";
  const zostava = toCents(f.sumaCelkom) - toCents(f.uhradene);

  // Koncept sa dá priamo prepísať – načítame číselníky pre editor.
  if (jeKoncept) {
    const [rady, odberatelia, aktivneZakazky] = await Promise.all([
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
        .where(inArray(zakazky.stav, ["AKTIVNA", "PRIPRAVA", "UKONCENA"]))
        .orderBy(asc(zakazky.kod)),
    ]);

    return (
      <>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <Nadpis popis="Koncept — ešte sa dá ľubovoľne upraviť.">Faktúra {f.cislo}</Nadpis>
          <div className="flex items-center gap-2">
            <Odznak farba="sedy">Koncept</Odznak>
            <Odkaz href={`/api/faktura/${f.id}/pdf`} variant="sekundar">
              Náhľad PDF
            </Odkaz>
          </div>
        </div>

        <div className="mb-5">
          <AkcieFaktury
            id={f.id}
            cislo={f.cislo}
            stav={f.stav}
            jeMajitel={session?.rola === "MAJITEL"}
            emailOdberatela={odberatel?.email ?? ""}
            nazovFirmy={nastavenia?.nazov ?? "Stavby-Dlhoš, s.r.o."}
            sumaCelkom={formatEur(toCents(f.sumaCelkom))}
            zostava={formatEur(zostava)}
            datumSplatnosti={formatDatum(f.datumSplatnosti)}
            dnes={naInputDatum(new Date())}
          />
        </div>

        <EditorFaktury
          rady={rady.map((r) => ({ id: r.id, nazov: r.nazov, nasledujuce: f.cislo }))}
          odberatelia={odberatelia}
          zakazkyZoznam={aktivneZakazky.map((z) => ({ id: z.id, nazov: `${z.kod} — ${z.nazov}` }))}
          firmaPlatitelDph={nastavenia?.jePlatitelDph ?? false}
          splatnostDni={nastavenia?.splatnostDni ?? 14}
          hodnoty={{
            id: f.id,
            radaId: f.radaId,
            odberatelId: f.odberatelId,
            zakazkaId: f.zakazkaId,
            datumVystavenia: naInputDatum(f.datumVystavenia),
            datumDodania: naInputDatum(f.datumDodania),
            datumSplatnosti: naInputDatum(f.datumSplatnosti),
            formaUhrady: f.formaUhrady,
            prenosDph: f.prenosDph,
            textPredPolozkami: f.textPredPolozkami ?? "",
            poznamka: f.poznamka ?? "",
            polozky: polozky.map((p) => ({
              skupina: p.skupina ?? "",
              nazov: p.nazov,
              popis: p.popis ?? "",
              mnozstvo: p.mnozstvo,
              mj: p.mj,
              cenaZaMj: p.cenaZaMj,
              zlavaPct: p.zlavaPct,
              sadzbaDph: p.sadzbaDph,
            })),
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Nadpis popis={`${TYP_FAKTURY[f.typ]} · ${odberatel?.nazov ?? "—"}`}>Faktúra {f.cislo}</Nadpis>
        <div className="flex items-center gap-2">
          <Odznak farba={STAV_FAKTURY[f.stav].farba}>{STAV_FAKTURY[f.stav].popis}</Odznak>
          <Odkaz href={`/api/faktura/${f.id}/pdf`} variant="sekundar">
            PDF
          </Odkaz>
          <Odkaz href="/faktury" variant="tichy">
            ← Späť
          </Odkaz>
        </div>
      </div>

      {f.stav === "PO_SPLATNOSTI" && (
        <div className="mb-5">
          <Info>
            Faktúra je po splatnosti ({formatDatum(f.datumSplatnosti)}). Zostáva doplatiť {formatEur(zostava)}.
          </Info>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Karta>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Udaj popis="Vystavená" hodnota={formatDatum(f.datumVystavenia)} />
              <Udaj popis="Dodanie" hodnota={formatDatum(f.datumDodania)} />
              <Udaj popis="Splatnosť" hodnota={formatDatum(f.datumSplatnosti)} />
              <Udaj popis="Var. symbol" hodnota={f.variabilnySymbol} />
              <Udaj popis="Odberateľ" hodnota={odberatel?.nazov ?? "—"} />
              <Udaj popis="IČO" hodnota={odberatel?.ico ?? "—"} />
              <Udaj popis="Úhrada" hodnota={FORMA_UHRADY[f.formaUhrady]} />
              <Udaj
                popis="Zákazka"
                hodnota={
                  zakazka ? (
                    <Link href={`/zakazky/${zakazka.id}`} className="hover:underline">
                      {zakazka.kod}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
            </div>
          </Karta>

          <Karta padding={false}>
            <div className="border-b border-antracit-100 px-5 py-3">
              <h2 className="font-semibold text-antracit-900">Položky</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-antracit-50 text-xs uppercase tracking-wide text-antracit-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Položka</th>
                    <th className="px-4 py-2 text-right">Množstvo</th>
                    <th className="px-4 py-2 text-right">Cena/MJ</th>
                    <th className="px-4 py-2 text-right">DPH</th>
                    <th className="px-4 py-2 text-right">Spolu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-antracit-100">
                  {polozky.map((p, i) => {
                    const novaSkupina = p.skupina && p.skupina !== polozky[i - 1]?.skupina;
                    return (
                      <>
                        {novaSkupina && (
                          <tr key={`s-${p.id}`} className="bg-antracit-50/60">
                            <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-antracit-600">
                              {p.skupina}
                            </td>
                          </tr>
                        )}
                        <tr key={p.id}>
                          <td className="px-4 py-2.5">
                            <span className="text-antracit-900">{p.nazov}</span>
                            {p.popis && <span className="block text-xs text-antracit-500">{p.popis}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap text-antracit-600">
                            {formatMnozstvo(p.mnozstvo)} {p.mj}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-antracit-600">
                            {formatEur(toCents(p.cenaZaMj))}
                          </td>
                          <td className="px-4 py-2.5 text-right text-antracit-600">
                            {f.prenosDph ? "PDP" : `${p.sadzbaDph} %`}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                            {formatEur(toCents(f.prenosDph ? p.zaklad : p.spolu))}
                          </td>
                        </tr>
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-antracit-200 bg-antracit-50 px-5 py-4">
              <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between text-antracit-600">
                  <span>Základ dane</span>
                  <span className="tabular-nums">{formatEur(toCents(f.sumaBezDph))}</span>
                </div>
                {!f.prenosDph && (
                  <div className="flex justify-between text-antracit-600">
                    <span>DPH</span>
                    <span className="tabular-nums">{formatEur(toCents(f.dphSpolu))}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-antracit-200 pt-1.5 font-bold text-antracit-900">
                  <span>Celkom</span>
                  <span className="tabular-nums">{formatEur(toCents(f.sumaCelkom))}</span>
                </div>
                {toCents(f.uhradene) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Uhradené</span>
                    <span className="tabular-nums">−{formatEur(toCents(f.uhradene))}</span>
                  </div>
                )}
                {zostava > 0 && (
                  <div className="flex justify-between font-semibold text-antracit-900">
                    <span>Zostáva</span>
                    <span className="tabular-nums">{formatEur(zostava)}</span>
                  </div>
                )}
              </div>
            </div>
          </Karta>

          {f.prenosDph && (
            <div className="rounded-md border-l-2 border-zlata-500 bg-white px-4 py-3 text-sm text-antracit-600">
              {POZNAMKA_PRENOS_DPH}
            </div>
          )}

          {platby.length > 0 && (
            <Karta>
              <h2 className="mb-3 font-semibold text-antracit-900">Úhrady</h2>
              <ul className="divide-y divide-antracit-100 text-sm">
                {platby.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span className="text-antracit-600">
                      {formatDatum(p.datum)} · {FORMA_UHRADY[p.sposob]}
                      {p.automaticke && <span className="ml-2 text-xs text-antracit-400">spárované z banky</span>}
                    </span>
                    <span className="font-semibold tabular-nums">{formatEur(toCents(p.suma))}</span>
                  </li>
                ))}
              </ul>
            </Karta>
          )}

          {historia.length > 0 && (
            <Karta>
              <h2 className="mb-3 font-semibold text-antracit-900">História</h2>
              <ul className="space-y-2 text-sm">
                {historia.map(({ a, u }) => (
                  <li key={a.id} className="flex flex-wrap gap-x-2 text-antracit-600">
                    <span className="tabular-nums text-antracit-400">{formatDatumCas(a.createdAt)}</span>
                    <span className="font-medium text-antracit-800">{a.akcia}</span>
                    <span>· {u?.meno ?? "—"}</span>
                    {a.detail && <span className="text-antracit-500">— {a.detail}</span>}
                  </li>
                ))}
              </ul>
            </Karta>
          )}
        </div>

        <aside>
          <Karta>
            <AkcieFaktury
              id={f.id}
              cislo={f.cislo}
              stav={f.stav}
              jeMajitel={session?.rola === "MAJITEL"}
              emailOdberatela={odberatel?.email ?? ""}
              nazovFirmy={nastavenia?.nazov ?? "Stavby-Dlhoš, s.r.o."}
              sumaCelkom={formatEur(toCents(f.sumaCelkom))}
              zostava={formatEur(zostava)}
              datumSplatnosti={formatDatum(f.datumSplatnosti)}
              dnes={naInputDatum(new Date())}
            />
          </Karta>
        </aside>
      </div>
    </>
  );
}

function Udaj({ popis, hodnota }: { popis: string; hodnota: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-antracit-500">{popis}</p>
      <p className="mt-0.5 text-sm font-medium text-antracit-900">{hodnota}</p>
    </div>
  );
}
