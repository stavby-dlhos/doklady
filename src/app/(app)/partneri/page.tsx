import Link from "next/link";
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { partneri } from "@/db/schema";
import { Nadpis, Odkaz, Odznak, Prazdne, Tabulka, Karta, Vstup, Vyber, Tlacidlo } from "@/components/ui";

export const dynamic = "force-dynamic";

const TYPY: Record<string, string> = {
  ODBERATEL: "Odberateľ",
  DODAVATEL: "Dodávateľ",
  OBOJE: "Odberateľ aj dodávateľ",
};

export default async function Partneri({
  searchParams,
}: {
  searchParams: Promise<{ hladat?: string; typ?: string; archiv?: string }>;
}) {
  const f = await searchParams;

  const podmienky: SQL[] = [];
  if (!f.archiv) podmienky.push(eq(partneri.archivovany, false));
  if (f.typ) podmienky.push(eq(partneri.typ, f.typ as "OBOJE"));
  if (f.hladat) {
    const vzor = `%${f.hladat}%`;
    const h = or(ilike(partneri.nazov, vzor), ilike(partneri.ico, vzor), ilike(partneri.mesto, vzor));
    if (h) podmienky.push(h);
  }

  const zoznam = await db
    .select()
    .from(partneri)
    .where(podmienky.length ? and(...podmienky) : undefined)
    .orderBy(asc(partneri.nazov));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Nadpis popis={`${zoznam.length} partnerov`}>Partneri</Nadpis>
        <Odkaz href="/partneri/novy" variant="primar">
          + Nový partner
        </Odkaz>
      </div>

      <Karta className="mb-5">
        <form className="flex flex-wrap gap-3">
          <div className="min-w-[16rem] flex-1">
            <Vstup name="hladat" placeholder="Názov, IČO alebo mesto…" defaultValue={f.hladat ?? ""} />
          </div>
          <Vyber name="typ" defaultValue={f.typ ?? ""} className="w-auto">
            <option value="">Všetci</option>
            <option value="ODBERATEL">Odberatelia</option>
            <option value="DODAVATEL">Dodávatelia</option>
          </Vyber>
          <label className="flex items-center gap-2 text-sm text-antracit-700">
            <input
              type="checkbox"
              name="archiv"
              defaultChecked={Boolean(f.archiv)}
              className="h-4 w-4 rounded border-antracit-300"
            />
            Vrátane archívu
          </label>
          <Tlacidlo type="submit" variant="sekundar">
            Filtrovať
          </Tlacidlo>
        </form>
      </Karta>

      {zoznam.length === 0 ? (
        <Prazdne
          nadpis="Žiadni partneri"
          popis="Pridaj odberateľov, ktorým fakturuješ, a dodávateľov, od ktorých nakupuješ."
          akcia={<Odkaz href="/partneri/novy">Pridať partnera</Odkaz>}
        />
      ) : (
        <Tabulka hlavicka={["Názov", "IČO / IČ DPH", "Mesto", "Kontakt", "Typ", ""]}>
          {zoznam.map((p) => (
            <tr key={p.id} className={`hover:bg-antracit-50 ${p.archivovany ? "opacity-50" : ""}`}>
              <td className="px-4 py-2.5">
                <Link href={`/partneri/${p.id}`} className="font-medium text-antracit-900 hover:underline">
                  {p.nazov}
                </Link>
                {p.jePlatitelDph && <span className="ml-2 text-xs text-antracit-500">platiteľ DPH</span>}
              </td>
              <td className="px-4 py-2.5 text-antracit-600 tabular-nums">
                {p.ico ?? "—"}
                {p.icDph && <span className="block text-xs text-antracit-500">{p.icDph}</span>}
              </td>
              <td className="px-4 py-2.5 text-antracit-600">{p.mesto ?? "—"}</td>
              <td className="max-w-[14rem] truncate px-4 py-2.5 text-antracit-600">
                {p.email ?? p.telefon ?? "—"}
              </td>
              <td className="px-4 py-2.5">
                <Odznak farba={p.typ === "ODBERATEL" ? "modra" : p.typ === "DODAVATEL" ? "zlata" : "sedy"}>
                  {TYPY[p.typ]}
                </Odznak>
              </td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/partneri/${p.id}`} className="text-sm text-antracit-500 hover:text-antracit-900">
                  Upraviť
                </Link>
              </td>
            </tr>
          ))}
        </Tabulka>
      )}
    </>
  );
}
