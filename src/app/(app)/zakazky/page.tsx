import Link from "next/link";
import { sql, desc, ne, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { zakazky, prijateDoklady, faktury } from "@/db/schema";
import { formatEur, toCents } from "@/lib/money";
import { Nadpis, Odkaz, Odznak, Prazdne, Karta } from "@/components/ui";
import { STAV_ZAKAZKY, formatDatum } from "@/lib/stavy";

export const dynamic = "force-dynamic";

export default async function Zakazky() {
  // Súčty načítavame samostatne a spájame v kóde – je to čitateľnejšie
  // a spoľahlivejšie než korelované poddotazy vnorené do jedného SELECTu.
  const [zoznam, naklady, trzby] = await Promise.all([
    db.select().from(zakazky).orderBy(desc(zakazky.stav), zakazky.kod),

    db
      .select({
        zakazkaId: prijateDoklady.zakazkaId,
        suma: sql<string>`coalesce(sum(${prijateDoklady.sumaCelkom}), 0)::text`,
      })
      .from(prijateDoklady)
      .where(ne(prijateDoklady.stav, "ZAMIETNUTY"))
      .groupBy(prijateDoklady.zakazkaId),

    db
      .select({
        zakazkaId: faktury.zakazkaId,
        suma: sql<string>`coalesce(sum(${faktury.sumaCelkom}), 0)::text`,
      })
      .from(faktury)
      .where(notInArray(faktury.stav, ["KONCEPT", "STORNO"]))
      .groupBy(faktury.zakazkaId),
  ]);

  const mapaNakladov = new Map(naklady.map((n) => [n.zakazkaId, toCents(n.suma)]));
  const mapaTrzieb = new Map(trzby.map((t) => [t.zakazkaId, toCents(t.suma)]));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Nadpis popis="Koľko stavba zatiaľ stála a koľko z nej prišlo.">Zákazky</Nadpis>
        <Odkaz href="/zakazky/nova" variant="primar">
          + Nová zákazka
        </Odkaz>
      </div>

      {zoznam.length === 0 ? (
        <Prazdne
          nadpis="Žiadne zákazky"
          popis="Založ zákazku a priraďuj k nej doklady — uvidíš skutočné náklady každej stavby."
          akcia={<Odkaz href="/zakazky/nova">Nová zákazka</Odkaz>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {zoznam.map((z) => {
            const n = mapaNakladov.get(z.id) ?? 0;
            const t = mapaTrzieb.get(z.id) ?? 0;
            const rozpocet = z.rozpocet ? toCents(z.rozpocet) : 0;
            const marza = t - n;
            const cerpanie = rozpocet > 0 ? Math.min(100, Math.round((n / rozpocet) * 100)) : null;

            return (
              <Link key={z.id} href={`/zakazky/${z.id}`}>
                <Karta className="h-full transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium tracking-wide text-antracit-500">{z.kod}</p>
                      <h2 className="truncate font-semibold text-antracit-900">{z.nazov}</h2>
                      {z.adresa && <p className="truncate text-sm text-antracit-500">{z.adresa}</p>}
                    </div>
                    <Odznak farba={STAV_ZAKAZKY[z.stav].farba}>{STAV_ZAKAZKY[z.stav].popis}</Odznak>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-antracit-500">Náklady</p>
                      <p className="font-semibold tabular-nums text-antracit-900">{formatEur(n)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-antracit-500">Vyfakturované</p>
                      <p className="font-semibold tabular-nums text-antracit-900">{formatEur(t)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-antracit-500">Rozdiel</p>
                      <p
                        className={`font-semibold tabular-nums ${marza >= 0 ? "text-emerald-700" : "text-red-600"}`}
                      >
                        {formatEur(marza)}
                      </p>
                    </div>
                  </div>

                  {cerpanie !== null && (
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-antracit-500">
                        <span>Čerpanie rozpočtu</span>
                        <span className="tabular-nums">
                          {cerpanie} % z {formatEur(rozpocet)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-antracit-100">
                        <div
                          className={`h-full rounded-full ${cerpanie >= 100 ? "bg-red-500" : cerpanie >= 85 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${cerpanie}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {z.datumStart && (
                    <p className="mt-3 text-xs text-antracit-400">
                      Od {formatDatum(z.datumStart)}
                      {z.datumKoniec ? ` do ${formatDatum(z.datumKoniec)}` : ""}
                    </p>
                  )}
                </Karta>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
