import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { prijateDoklady, partneri, zakazky, pouzivatelia, auditLog } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { formatEur, toCents } from "@/lib/money";
import { Karta, Nadpis, Odznak, Odkaz, Info } from "@/components/ui";
import {
  STAV_DOKLADU,
  TYP_DOKLADU,
  KATEGORIA,
  ZDROJ,
  formatDatum,
  formatDatumCas,
  naInputDatum,
} from "@/lib/stavy";
import { FormularDokladu } from "../formular";
import { AkcieDokladu } from "./akcie-ui";

export const dynamic = "force-dynamic";

export default async function DetailDokladu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  const [zaznam] = await db
    .select({ d: prijateDoklady, dodavatel: partneri, zakazka: zakazky })
    .from(prijateDoklady)
    .leftJoin(partneri, eq(prijateDoklady.dodavatelId, partneri.id))
    .leftJoin(zakazky, eq(prijateDoklady.zakazkaId, zakazky.id))
    .where(eq(prijateDoklady.id, id))
    .limit(1);

  if (!zaznam) notFound();
  const { d, dodavatel, zakazka } = zaznam;

  const [dodavatelia, aktivneZakazky, historia, autori] = await Promise.all([
    db
      .select({ id: partneri.id, nazov: partneri.nazov })
      .from(partneri)
      .where(or(eq(partneri.typ, "DODAVATEL"), eq(partneri.typ, "OBOJE")))
      .orderBy(asc(partneri.nazov)),
    db
      .select({ id: zakazky.id, kod: zakazky.kod, nazov: zakazky.nazov })
      .from(zakazky)
      .where(inArray(zakazky.stav, ["AKTIVNA", "PRIPRAVA", "UKONCENA"]))
      .orderBy(asc(zakazky.kod)),
    db
      .select({ a: auditLog, u: pouzivatelia })
      .from(auditLog)
      .leftJoin(pouzivatelia, eq(auditLog.pouzivatelId, pouzivatelia.id))
      .where(eq(auditLog.entitaId, id))
      .orderBy(auditLog.createdAt),
    db.select({ id: pouzivatelia.id, meno: pouzivatelia.meno }).from(pouzivatelia),
  ]);

  const menoPouzivatela = (uid: string | null) => autori.find((a) => a.id === uid)?.meno ?? "—";
  const jeMajitel = session?.rola === "MAJITEL";
  const daSaUpravit = d.stav !== "ZAUCTOVANY";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Nadpis popis={`${TYP_DOKLADU[d.typ]}${d.cisloDokladu ? ` č. ${d.cisloDokladu}` : ""} · pridané ${ZDROJ[d.zdroj].toLowerCase()}`}>
          {dodavatel?.nazov ?? d.popis ?? "Doklad"}
        </Nadpis>
        <div className="flex items-center gap-2">
          <Odznak farba={STAV_DOKLADU[d.stav].farba}>{STAV_DOKLADU[d.stav].popis}</Odznak>
          <Odkaz href="/prijate" variant="tichy">
            ← Späť
          </Odkaz>
        </div>
      </div>

      {d.stav === "ZAMIETNUTY" && d.zamietnutieDovod && (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Zamietnuté:</strong> {d.zamietnutieDovod}
        </div>
      )}

      {d.ocrConfidence !== null && d.ocrConfidence < 0.7 && (
        <div className="mb-5">
          <Info>
            Automatické čítanie si nebolo isté (istota {Math.round(d.ocrConfidence * 100)} %). Over sumu a dátum
            oproti originálu.
          </Info>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          {daSaUpravit ? (
            <FormularDokladu
              jeNovy={false}
              dodavatelia={dodavatelia}
              zakazkyZoznam={aktivneZakazky.map((z) => ({ id: z.id, nazov: `${z.kod} — ${z.nazov}` }))}
              hodnoty={{
                id: d.id,
                typ: d.typ,
                cisloDokladu: d.cisloDokladu,
                dodavatelId: d.dodavatelId,
                zakazkaId: d.zakazkaId,
                kategoria: d.kategoria,
                datumVystavenia: naInputDatum(d.datumVystavenia),
                datumSplatnosti: naInputDatum(d.datumSplatnosti),
                variabilnySymbol: d.variabilnySymbol,
                zakladDph: d.zakladDph,
                sadzbaDph: d.sadzbaDph,
                sumaDph: d.sumaDph,
                sumaCelkom: d.sumaCelkom,
                prenosDph: d.prenosDph,
                popis: d.popis,
                poznamka: d.poznamka,
              }}
            />
          ) : (
            <Karta>
              <h2 className="mb-4 font-semibold">Údaje dokladu</h2>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Riadok popis="Dodávateľ" hodnota={dodavatel?.nazov ?? "—"} />
                <Riadok popis="Číslo dokladu" hodnota={d.cisloDokladu ?? "—"} />
                <Riadok popis="Dátum vystavenia" hodnota={formatDatum(d.datumVystavenia)} />
                <Riadok popis="Splatnosť" hodnota={formatDatum(d.datumSplatnosti)} />
                <Riadok popis="Kategória" hodnota={KATEGORIA[d.kategoria]} />
                <Riadok popis="Zákazka" hodnota={zakazka ? `${zakazka.kod} — ${zakazka.nazov}` : "—"} />
                <Riadok popis="Základ dane" hodnota={formatEur(toCents(d.zakladDph))} />
                <Riadok
                  popis="DPH"
                  hodnota={d.prenosDph ? "Prenos daňovej povinnosti" : `${formatEur(toCents(d.sumaDph))} (${d.sadzbaDph} %)`}
                />
                <Riadok popis="Celkom" hodnota={formatEur(toCents(d.sumaCelkom))} />
                <Riadok popis="Popis" hodnota={d.popis ?? "—"} />
              </dl>
            </Karta>
          )}

          {historia.length > 0 && (
            <Karta>
              <h2 className="mb-3 font-semibold text-antracit-900">História</h2>
              <ul className="space-y-2 text-sm">
                {historia.map(({ a, u }) => (
                  <li key={a.id} className="flex flex-wrap gap-x-2 text-antracit-600">
                    <span className="text-antracit-400 tabular-nums">{formatDatumCas(a.createdAt)}</span>
                    <span className="font-medium text-antracit-800">{popisAkcie(a.akcia)}</span>
                    <span>· {u?.meno ?? "—"}</span>
                    {a.detail && <span className="text-antracit-500">— {a.detail}</span>}
                  </li>
                ))}
              </ul>
            </Karta>
          )}
        </div>

        <aside className="space-y-5">
          <Karta>
            <h2 className="mb-3 font-semibold text-antracit-900">Sken dokladu</h2>
            {d.suborUrl ? (
              <>
                <Link
                  href={`/api/subor/${encodeURIComponent(d.suborUrl)}`}
                  target="_blank"
                  className="block overflow-hidden rounded-md border border-antracit-200 bg-antracit-50"
                >
                  {d.suborTyp?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/subor/${encodeURIComponent(d.suborUrl)}`}
                      alt="Sken dokladu"
                      className="max-h-80 w-full object-contain"
                    />
                  ) : (
                    <div className="px-4 py-10 text-center text-sm text-antracit-600">
                      {d.suborNazov ?? "Otvoriť PDF"}
                    </div>
                  )}
                </Link>
                <p className="mt-2 truncate text-xs text-antracit-500">{d.suborNazov}</p>
              </>
            ) : (
              <p className="text-sm text-antracit-500">Bez nahraného súboru.</p>
            )}
          </Karta>

          <Karta>
            <h2 className="mb-3 font-semibold text-antracit-900">Stav</h2>
            <dl className="space-y-2 text-sm">
              <Riadok popis="Vytvoril" hodnota={menoPouzivatela(d.vytvorilId)} maly />
              {d.schvalilId && (
                <Riadok
                  popis={d.stav === "ZAMIETNUTY" ? "Zamietol" : "Schválil"}
                  hodnota={`${menoPouzivatela(d.schvalilId)} · ${formatDatum(d.schvalenyDna)}`}
                  maly
                />
              )}
              <Riadok popis="Uhradené" hodnota={d.uhradenyDna ? formatDatum(d.uhradenyDna) : "Neuhradené"} maly />
            </dl>

            <div className="mt-4 border-t border-antracit-100 pt-4">
              <AkcieDokladu
                id={d.id}
                stav={d.stav}
                jeMajitel={jeMajitel}
                maSubor={Boolean(d.suborUrl)}
                maOcr={Boolean(process.env.ANTHROPIC_API_KEY)}
              />
            </div>
          </Karta>
        </aside>
      </div>
    </>
  );
}

function Riadok({ popis, hodnota, maly }: { popis: string; hodnota: string; maly?: boolean }) {
  return (
    <div className={maly ? "flex justify-between gap-2" : ""}>
      <dt className="text-xs font-medium uppercase tracking-wide text-antracit-500">{popis}</dt>
      <dd className={`text-antracit-900 ${maly ? "text-right text-sm" : "mt-0.5 text-sm"}`}>{hodnota}</dd>
    </div>
  );
}

function popisAkcie(akcia: string): string {
  const mapa: Record<string, string> = {
    VYTVORENIE: "Vytvorené",
    ZMENA: "Upravené",
    SCHVALENIE: "Schválené",
    ZAMIETNUTIE: "Zamietnuté",
    ZMAZANIE: "Zmazané",
    OCR: "Znovu prečítané",
    EXPORT: "Exportované",
  };
  return mapa[akcia] ?? akcia;
}
