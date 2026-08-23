"use client";

import { useState, useTransition } from "react";
import { zalozSystem } from "./akcie";
import { Karta, Pole, Vstup, Tlacidlo, Chyba } from "@/components/ui";

/**
 * Polia sú riadené cez stav, nie ponechané na prehliadači.
 *
 * Keď server akcia vráti chybu, React formulár prekreslí — a neriadené polia by
 * sa pritom vyprázdnili. Používateľ by po preklepe v hesle musel znova písať
 * meno aj adresu. Takto ostane vyplnené všetko, čo už zadal.
 */

interface Hodnoty {
  meno: string;
  email: string;
  heslo: string;
  hesloZnova: string;
  nazov: string;
  ico: string;
  ulica: string;
  psc: string;
  mesto: string;
  jePlatitelDph: boolean;
}

const VYCHODZIE: Hodnoty = {
  meno: "",
  email: "",
  heslo: "",
  hesloZnova: "",
  nazov: "Stavby-Dlhoš, s.r.o.",
  ico: "47022906",
  ulica: "Nitrianska 3450/105",
  psc: "920 01",
  mesto: "Hlohovec",
  jePlatitelDph: false,
};

export function FormularZalozenia() {
  const [h, setH] = useState<Hodnoty>(VYCHODZIE);
  const [chyba, setChyba] = useState<string | null>(null);
  const [bezi, start] = useTransition();

  const zmen =
    (kluc: keyof Hodnoty) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setH((s) => ({ ...s, [kluc]: e.target.value }));

  function odosli(fd: FormData) {
    start(async () => {
      setChyba(null);
      try {
        const v = await zalozSystem(fd);
        if (v && !v.ok) setChyba(v.chyba ?? "Založenie zlyhalo.");
      } catch (e) {
        // redirect() po úspechu vyhadzuje vlastnú výnimku – tú necháme prejsť
        if (e && typeof e === "object" && "digest" in e && String(e.digest).startsWith("NEXT_")) throw e;
        setChyba(e instanceof Error ? e.message : "Založenie zlyhalo.");
      }
    });
  }

  return (
    <form action={odosli} className="space-y-5">
      {chyba && <Chyba>{chyba}</Chyba>}

      <Karta>
        <h2 className="mb-1 font-semibold text-antracit-900">Tvoj účet</h2>
        <p className="mb-4 text-sm text-antracit-500">Budeš majiteľ — plný prístup vrátane schvaľovania.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Pole popis="Meno a priezvisko">
            <Vstup
              name="meno"
              required
              autoComplete="name"
              placeholder="David Dlhoš"
              value={h.meno}
              onChange={zmen("meno")}
            />
          </Pole>
          <Pole popis="E-mail">
            <Vstup
              type="email"
              name="email"
              required
              autoComplete="username"
              placeholder="meno@stavbydlhos.sk"
              value={h.email}
              onChange={zmen("email")}
            />
          </Pole>
          <Pole popis="Heslo" napoveda="Aspoň 10 znakov.">
            <Vstup
              type="password"
              name="heslo"
              required
              minLength={10}
              autoComplete="new-password"
              value={h.heslo}
              onChange={zmen("heslo")}
            />
          </Pole>
          <Pole popis="Heslo znova">
            <Vstup
              type="password"
              name="hesloZnova"
              required
              minLength={10}
              autoComplete="new-password"
              value={h.hesloZnova}
              onChange={zmen("hesloZnova")}
            />
          </Pole>
        </div>
      </Karta>

      <Karta>
        <h2 className="mb-1 font-semibold text-antracit-900">Firma</h2>
        <p className="mb-4 text-sm text-antracit-500">
          Základ na rozbehnutie. IČ DPH, IBAN a zápis v obchodnom registri doplníš hneď potom v Nastaveniach.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Pole popis="Obchodné meno">
              <Vstup name="nazov" required value={h.nazov} onChange={zmen("nazov")} />
            </Pole>
          </div>
          <Pole popis="IČO">
            <Vstup name="ico" required inputMode="numeric" value={h.ico} onChange={zmen("ico")} />
          </Pole>
          <Pole popis="Ulica a číslo">
            <Vstup name="ulica" required value={h.ulica} onChange={zmen("ulica")} />
          </Pole>
          <Pole popis="PSČ">
            <Vstup name="psc" required value={h.psc} onChange={zmen("psc")} />
          </Pole>
          <Pole popis="Mesto">
            <Vstup name="mesto" required value={h.mesto} onChange={zmen("mesto")} />
          </Pole>
        </div>

        <label className="mt-4 flex items-start gap-2.5">
          <input
            type="checkbox"
            name="jePlatitelDph"
            checked={h.jePlatitelDph}
            onChange={(e) => setH((s) => ({ ...s, jePlatitelDph: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-antracit-300 text-antracit-900 focus:ring-antracit-500"
          />
          <span className="text-sm">
            <span className="font-medium text-antracit-800">Sme platiteľ DPH</span>
            <span className="block text-xs text-antracit-500">
              Rozhoduje o tom, či sa faktúry vystavujú s daňou. Dá sa zmeniť v Nastaveniach.
            </span>
          </span>
        </label>
      </Karta>

      {/* zlatá, nie antracitová – stránka má tmavé pozadie a primárne tlačidlo by na ňom zaniklo */}
      <Tlacidlo type="submit" variant="zlaty" className="w-full py-2.5 text-base" disabled={bezi}>
        {bezi ? "Zakladám…" : "Založiť a prihlásiť sa"}
      </Tlacidlo>
    </form>
  );
}
