import { desc } from "drizzle-orm";
import { db } from "@/db";
import { exporty } from "@/db/schema";
import { Nadpis, Karta, Prazdne, Info } from "@/components/ui";
import { formatDatum, formatDatumCas } from "@/lib/stavy";
import { FormularExportu } from "./ui";

export const dynamic = "force-dynamic";

export default async function Export() {
  const historia = await db.select().from(exporty).orderBy(desc(exporty.createdAt)).limit(12);

  const teraz = new Date();
  const minulyMesiacOd = new Date(teraz.getFullYear(), teraz.getMonth() - 1, 1);
  const minulyMesiacDo = new Date(teraz.getFullYear(), teraz.getMonth(), 0);

  return (
    <>
      <Nadpis popis="Balík podkladov pre účtovníčku — CSV zostavy aj skeny dokladov v jednom ZIP-e.">
        Export
      </Nadpis>

      <FormularExportu
        vychodziOd={naDatum(minulyMesiacOd)}
        vychodziDo={naDatum(minulyMesiacDo)}
      />

      <div className="mt-6">
        <Info>
          ZIP obsahuje štyri zostavy: prijaté doklady, vystavené faktúry, položky faktúr a rekapituláciu DPH.
          CSV je pripravené pre slovenský Excel — čiarka ako desatinný oddeľovač, bodkočiarka medzi stĺpcami.
        </Info>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold text-antracit-900">Predchádzajúce exporty</h2>

        {historia.length === 0 ? (
          <Prazdne nadpis="Zatiaľ žiadny export" />
        ) : (
          <Karta padding={false}>
            <ul className="divide-y divide-antracit-100">
              {historia.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-antracit-900">
                      {formatDatum(e.obdobieOd)} – {formatDatum(e.obdobieDo)}
                    </p>
                    <p className="text-xs text-antracit-500">
                      {e.pocetDokladov} dokladov · {e.pocetFaktur} faktúr · vytvorené {formatDatumCas(e.createdAt)}
                    </p>
                  </div>
                  <span className="text-xs text-antracit-400">{e.format}</span>
                </li>
              ))}
            </ul>
          </Karta>
        )}
      </section>
    </>
  );
}

function naDatum(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
