import { redirect } from "next/navigation";
import { jeSystemPrazdny } from "@/lib/prvyStart";
import { FormularZalozenia } from "./formular";

export const dynamic = "force-dynamic";

export default async function Uvod() {
  // Len čo existuje prvý účet, táto obrazovka sa navždy zamkne.
  if (!(await jeSystemPrazdny())) redirect("/prihlasenie");

  return (
    <main className="min-h-screen bg-antracit-900 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-1 w-12 rounded bg-zlata-500" />
          <h1 className="text-2xl font-bold text-white">Vitaj v Dokladoch</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-antracit-400">
            Systém je nasadený a databáza pripravená. Zostáva založiť tvoj účet a základné údaje firmy —
            zaberie to minútu a viac sa táto obrazovka nezobrazí.
          </p>
        </div>

        <FormularZalozenia />

        <p className="mt-6 text-center text-xs text-antracit-500">
          Účet pre účtovníčku pridáš neskôr v Nastaveniach.
        </p>
      </div>
    </main>
  );
}
