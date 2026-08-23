import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { prijateMaily, odoslaneMaily, faktury } from "@/db/schema";
import { Nadpis, Karta, Odznak, Prazdne, Tabulka, Info } from "@/components/ui";
import { formatDatumCas } from "@/lib/stavy";
import { PanelPodatelne } from "./ui";

export const dynamic = "force-dynamic";

const STAV_PRIJATEHO: Record<string, { popis: string; farba: "modra" | "zelena" | "sedy" | "cervena" }> = {
  NOVY: { popis: "Nový", farba: "modra" },
  SPRACOVANY: { popis: "Spracovaný", farba: "zelena" },
  IGNOROVANY: { popis: "Ignorovaný", farba: "sedy" },
  CHYBA: { popis: "Chyba", farba: "cervena" },
};

const STAV_ODOSLANEHO: Record<string, { popis: string; farba: "zlta" | "zelena" | "cervena" }> = {
  CAKA: { popis: "Čaká", farba: "zlta" },
  ODOSLANY: { popis: "Odoslaný", farba: "zelena" },
  CHYBA: { popis: "Zlyhal", farba: "cervena" },
};

export default async function Posta() {
  const [prijate, odoslane] = await Promise.all([
    db.select().from(prijateMaily).orderBy(desc(prijateMaily.datum)).limit(60),
    db
      .select({ m: odoslaneMaily, f: faktury })
      .from(odoslaneMaily)
      .leftJoin(faktury, eq(odoslaneMaily.fakturaId, faktury.id))
      .orderBy(desc(odoslaneMaily.createdAt))
      .limit(60),
  ]);

  const adresaPodatelne = process.env.IMAP_USER ?? null;
  const smtpNastavene = Boolean(process.env.SMTP_HOST);
  const imapNastavene = Boolean(process.env.IMAP_HOST);

  return (
    <>
      <Nadpis popis="Doklady, ktoré prišli mailom, a faktúry, ktoré od nás odišli.">Pošta</Nadpis>

      <div className="mb-6">
        <PanelPodatelne
          adresa={adresaPodatelne}
          imapNastavene={imapNastavene}
          smtpNastavene={smtpNastavene}
        />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold text-antracit-900">Prijaté do podateľne</h2>

        {prijate.length === 0 ? (
          <Prazdne
            nadpis="Zatiaľ nič neprišlo"
            popis={
              adresaPodatelne
                ? `Prepošli faktúru na ${adresaPodatelne} a klikni na Skontrolovať schránku.`
                : "Najprv nastav prihlasovacie údaje k schránke."
            }
          />
        ) : (
          <Tabulka hlavicka={["Prišiel", "Odosielateľ", "Predmet", "Prílohy", "Stav", ""]}>
            {prijate.map((m) => {
              const vytvorene = Array.isArray(m.vytvoreneDoklady) ? (m.vytvoreneDoklady as string[]) : [];
              return (
                <tr key={m.id} className="hover:bg-antracit-50">
                  <td className="px-4 py-2.5 whitespace-nowrap text-antracit-600">{formatDatumCas(m.datum)}</td>
                  <td className="max-w-[14rem] truncate px-4 py-2.5 text-antracit-800">{m.odosielatel}</td>
                  <td className="max-w-[18rem] truncate px-4 py-2.5 text-antracit-600">{m.predmet ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-antracit-600">{m.pocetPriloh}</td>
                  <td className="px-4 py-2.5">
                    <Odznak farba={STAV_PRIJATEHO[m.stav].farba}>{STAV_PRIJATEHO[m.stav].popis}</Odznak>
                    {m.chyba && <span className="mt-0.5 block max-w-[14rem] truncate text-xs text-red-600">{m.chyba}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {vytvorene.length > 0 ? (
                      <Link
                        href={`/prijate/${vytvorene[0]}`}
                        className="text-sm text-antracit-600 hover:text-antracit-900 hover:underline"
                      >
                        {vytvorene.length === 1 ? "Doklad →" : `${vytvorene.length} dokladov →`}
                      </Link>
                    ) : (
                      <span className="text-sm text-antracit-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Tabulka>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-antracit-900">Odoslané z Dokladov</h2>

        {odoslane.length === 0 ? (
          <Prazdne nadpis="Zatiaľ nič neodišlo" popis="Faktúry odosielaš z detailu faktúry." />
        ) : (
          <Karta padding={false}>
            <ul className="divide-y divide-antracit-100">
              {odoslane.map(({ m, f }) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-antracit-900">{m.predmet}</p>
                    <p className="truncate text-xs text-antracit-500">
                      {m.prijemca} · {formatDatumCas(m.odoslanyDna ?? m.createdAt)}
                      {f && (
                        <>
                          {" · "}
                          <Link href={`/faktury/${f.id}`} className="hover:underline">
                            {f.cislo}
                          </Link>
                        </>
                      )}
                    </p>
                    {m.chyba && <p className="mt-0.5 text-xs text-red-600">{m.chyba}</p>}
                  </div>
                  <Odznak farba={STAV_ODOSLANEHO[m.stav].farba}>{STAV_ODOSLANEHO[m.stav].popis}</Odznak>
                </li>
              ))}
            </ul>
          </Karta>
        )}
      </section>

      {!imapNastavene && !smtpNastavene && (
        <div className="mt-6">
          <Info>
            Pošta zatiaľ nie je nastavená. Doplň premenné SMTP_* a IMAP_* v prostredí aplikácie — návod je
            v súbore README.
          </Info>
        </div>
      )}
    </>
  );
}
