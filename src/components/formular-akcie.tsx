"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Chyba, Uspech } from "./ui";
import { vysledok } from "@/lib/chyby";

/**
 * Formulár, ktorý vie ukázať, čo sa pokazilo.
 *
 * Obyčajné `<form action={serverovaAkcia}>` nemá kam vypísať chybu – keď
 * akcia zlyhá, Next zobrazí celostránkovú hlášku o chybe aplikácie a
 * vyplnené polia sú preč. Tento obal akciu zavolá sám, chybu vypíše nad
 * formulárom a po úspechu ukáže potvrdenie.
 */
export function FormularAkcie({
  akcia,
  children,
  className,
  poUlozeni = "Uložené.",
}: {
  akcia: (formData: FormData) => Promise<unknown>;
  children: ReactNode;
  className?: string;
  /** Hláška po úspechu. Ak akcia presmeruje, neukáže sa – to je v poriadku. */
  poUlozeni?: string;
}) {
  const [chyba, setChyba] = useState<string | null>(null);
  const [hotovo, setHotovo] = useState(false);
  const [, start] = useTransition();

  return (
    <form
      className={className}
      action={(formData) =>
        start(async () => {
          setChyba(null);
          setHotovo(false);
          try {
            await vysledok(akcia(formData));
            setHotovo(true);
          } catch (e) {
            // presmerovanie po úspechu vyhadzuje vlastnú výnimku – nechaj ju prejsť
            if (e && typeof e === "object" && "digest" in e && String(e.digest).startsWith("NEXT_")) throw e;
            setChyba(e instanceof Error ? e.message : "Uloženie zlyhalo.");
          }
        })
      }
    >
      {chyba && (
        <div className="mb-4">
          <Chyba>{chyba}</Chyba>
        </div>
      )}
      {hotovo && (
        <div className="mb-4">
          <Uspech>{poUlozeni}</Uspech>
        </div>
      )}
      {children}
    </form>
  );
}
