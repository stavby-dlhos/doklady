"use client";

import { useState, useTransition } from "react";
import { schvalDoklad, zamietniDoklad, zmazDoklad, preskenuj } from "../akcie";
import { Tlacidlo, TextovePole, Chyba } from "@/components/ui";
import { vysledok } from "@/lib/chyby";

export function AkcieDokladu({
  id,
  stav,
  jeMajitel,
  maSubor,
  maOcr,
}: {
  id: string;
  stav: string;
  jeMajitel: boolean;
  maSubor: boolean;
  maOcr: boolean;
}) {
  const [beziAkcia, start] = useTransition();
  const [zamietam, setZamietam] = useState(false);
  const [dovod, setDovod] = useState("");
  const [chyba, setChyba] = useState<string | null>(null);

  function spusti(akcia: () => Promise<unknown>) {
    setChyba(null);
    start(async () => {
      try {
        await vysledok(akcia());
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String(e.digest).startsWith("NEXT_")) throw e;
        setChyba(e instanceof Error ? e.message : "Akcia zlyhala.");
      }
    });
  }

  const daSaSchvalit = jeMajitel && (stav === "NOVY" || stav === "NA_SCHVALENIE" || stav === "ZAMIETNUTY");
  const daSaZamietnut = jeMajitel && (stav === "NOVY" || stav === "NA_SCHVALENIE");

  return (
    <div className="space-y-3">
      {chyba && <Chyba>{chyba}</Chyba>}

      {daSaSchvalit && (
        <Tlacidlo
          className="w-full"
          disabled={beziAkcia}
          onClick={() => spusti(() => schvalDoklad(id))}
        >
          {beziAkcia ? "Pracujem…" : "Schváliť doklad"}
        </Tlacidlo>
      )}

      {daSaZamietnut && !zamietam && (
        <Tlacidlo variant="sekundar" className="w-full" onClick={() => setZamietam(true)}>
          Zamietnuť
        </Tlacidlo>
      )}

      {zamietam && (
        <div className="space-y-2 rounded-md border border-antracit-200 bg-antracit-50 p-3">
          <TextovePole
            rows={2}
            placeholder="Prečo doklad zamietaš?"
            value={dovod}
            onChange={(e) => setDovod(e.target.value)}
          />
          <div className="flex gap-2">
            <Tlacidlo
              variant="nebezpecny"
              disabled={beziAkcia || !dovod.trim()}
              onClick={() => spusti(async () => {
                await zamietniDoklad(id, dovod);
                setZamietam(false);
              })}
            >
              Zamietnuť
            </Tlacidlo>
            <Tlacidlo variant="tichy" onClick={() => setZamietam(false)}>
              Zrušiť
            </Tlacidlo>
          </div>
        </div>
      )}

      {maSubor && maOcr && (
        <Tlacidlo
          variant="sekundar"
          className="w-full"
          disabled={beziAkcia}
          onClick={() => spusti(() => preskenuj(id))}
        >
          Prečítať doklad znova
        </Tlacidlo>
      )}

      {jeMajitel && stav !== "ZAUCTOVANY" && (
        <Tlacidlo
          variant="nebezpecny"
          className="w-full"
          disabled={beziAkcia}
          onClick={() => {
            if (!confirm("Naozaj zmazať tento doklad aj s nahraným súborom?")) return;
            spusti(() => zmazDoklad(id));
          }}
        >
          Zmazať doklad
        </Tlacidlo>
      )}

      {!jeMajitel && (
        <p className="text-xs text-antracit-500">Schvaľovanie a mazanie môže robiť len majiteľ.</p>
      )}
    </div>
  );
}
