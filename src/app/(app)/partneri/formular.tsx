"use client";

import { useState, useTransition } from "react";
import { ulozPartnera, najdiPodlaIco } from "./akcie";
import { Karta, Pole, Vstup, Vyber, TextovePole, Tlacidlo, Chyba, Uspech } from "@/components/ui";
import { vysledok } from "@/lib/chyby";

export interface HodnotyPartnera {
  id?: string;
  typ?: string;
  nazov?: string;
  ico?: string | null;
  dic?: string | null;
  icDph?: string | null;
  jePlatitelDph?: boolean;
  ulica?: string | null;
  mesto?: string | null;
  psc?: string | null;
  krajina?: string;
  iban?: string | null;
  email?: string | null;
  telefon?: string | null;
  poznamka?: string | null;
}

export function FormularPartnera({ hodnoty }: { hodnoty?: HodnotyPartnera }) {
  const [p, setP] = useState<HodnotyPartnera>(hodnoty ?? { typ: "OBOJE", krajina: "SK" });
  const [hlada, start] = useTransition();
  const [sprava, setSprava] = useState<{ typ: "chyba" | "uspech"; text: string } | null>(null);
  const [chybaUlozenia, setChybaUlozenia] = useState<string | null>(null);

  function dohladaj() {
    if (!p.ico) {
      setSprava({ typ: "chyba", text: "Najprv zadaj IČO." });
      return;
    }
    setSprava(null);
    start(async () => {
      let v;
      try {
        v = await vysledok(najdiPodlaIco(p.ico!));
      } catch (e) {
        setSprava({ typ: "chyba", text: e instanceof Error ? e.message : "Vyhľadanie zlyhalo." });
        return;
      }
      if (!v.ok) {
        setSprava({ typ: "chyba", text: v.chyba ?? "Nenašlo sa." });
        return;
      }
      setP((s) => ({
        ...s,
        nazov: v.data!.nazov || s.nazov,
        ulica: v.data!.ulica || s.ulica,
        mesto: v.data!.mesto || s.mesto,
        psc: v.data!.psc || s.psc,
      }));
      setSprava({ typ: "uspech", text: "Údaje doplnené z registra. Skontroluj ich a doplň IČ DPH." });
    });
  }

  const nastav = (kluc: keyof HodnotyPartnera) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setP((s) => ({ ...s, [kluc]: e.target.value }));

  return (
    <form
      action={async (fd) => {
        setChybaUlozenia(null);
        try {
          await vysledok(ulozPartnera(fd));
        } catch (e) {
          if (e && typeof e === "object" && "digest" in e && String(e.digest).startsWith("NEXT_")) throw e;
          setChybaUlozenia(e instanceof Error ? e.message : "Uloženie zlyhalo.");
        }
      }}
      className="space-y-5"
    >
      {p.id && <input type="hidden" name="id" value={p.id} />}
      {chybaUlozenia && <Chyba>{chybaUlozenia}</Chyba>}

      <Karta>
        <h2 className="mb-4 font-semibold text-antracit-900">Identifikácia</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Pole popis="Typ partnera">
            <Vyber name="typ" value={p.typ ?? "OBOJE"} onChange={nastav("typ")}>
              <option value="OBOJE">Odberateľ aj dodávateľ</option>
              <option value="ODBERATEL">Len odberateľ</option>
              <option value="DODAVATEL">Len dodávateľ</option>
            </Vyber>
          </Pole>

          <Pole popis="IČO" napoveda="Po zadaní klikni na Dohľadať — údaje sa doplnia z registra.">
            <div className="flex gap-2">
              <Vstup name="ico" inputMode="numeric" value={p.ico ?? ""} onChange={nastav("ico")} placeholder="12345678" />
              <Tlacidlo variant="sekundar" onClick={dohladaj} disabled={hlada}>
                {hlada ? "Hľadám…" : "Dohľadať"}
              </Tlacidlo>
            </div>
          </Pole>
        </div>

        {sprava && (
          <div className="mt-3">
            {sprava.typ === "chyba" ? <Chyba>{sprava.text}</Chyba> : <Uspech>{sprava.text}</Uspech>}
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Pole popis="Názov / meno">
              <Vstup name="nazov" required value={p.nazov ?? ""} onChange={nastav("nazov")} />
            </Pole>
          </div>

          <Pole popis="DIČ">
            <Vstup name="dic" value={p.dic ?? ""} onChange={nastav("dic")} />
          </Pole>

          <Pole popis="IČ DPH">
            <Vstup name="icDph" value={p.icDph ?? ""} onChange={nastav("icDph")} placeholder="SK2023456789" />
          </Pole>
        </div>

        <label className="mt-4 flex items-start gap-2.5">
          <input
            type="checkbox"
            name="jePlatitelDph"
            checked={p.jePlatitelDph ?? false}
            onChange={(e) => setP((s) => ({ ...s, jePlatitelDph: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-antracit-300 text-antracit-900 focus:ring-antracit-500"
          />
          <span className="text-sm">
            <span className="font-medium text-antracit-800">Platiteľ DPH</span>
            <span className="block text-xs text-antracit-500">
              Rozhoduje o tom, či sa pri fakturácii stavebných prác ponúkne prenesenie daňovej povinnosti.
            </span>
          </span>
        </label>
      </Karta>

      <Karta>
        <h2 className="mb-4 font-semibold text-antracit-900">Adresa a kontakt</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Pole popis="Ulica a číslo">
              <Vstup name="ulica" value={p.ulica ?? ""} onChange={nastav("ulica")} />
            </Pole>
          </div>
          <Pole popis="PSČ">
            <Vstup name="psc" value={p.psc ?? ""} onChange={nastav("psc")} />
          </Pole>
          <Pole popis="Mesto">
            <Vstup name="mesto" value={p.mesto ?? ""} onChange={nastav("mesto")} />
          </Pole>
          <Pole popis="Krajina">
            <Vyber name="krajina" value={p.krajina ?? "SK"} onChange={nastav("krajina")}>
              <option value="SK">Slovensko</option>
              <option value="CZ">Česko</option>
              <option value="AT">Rakúsko</option>
              <option value="HU">Maďarsko</option>
              <option value="PL">Poľsko</option>
              <option value="DE">Nemecko</option>
            </Vyber>
          </Pole>
          <Pole popis="IBAN">
            <Vstup name="iban" value={p.iban ?? ""} onChange={nastav("iban")} />
          </Pole>
          <Pole popis="E-mail" napoveda="Sem sa budú posielať faktúry.">
            <Vstup type="email" name="email" value={p.email ?? ""} onChange={nastav("email")} />
          </Pole>
          <Pole popis="Telefón">
            <Vstup name="telefon" value={p.telefon ?? ""} onChange={nastav("telefon")} />
          </Pole>
        </div>

        <div className="mt-4">
          <Pole popis="Poznámka">
            <TextovePole name="poznamka" rows={2} value={p.poznamka ?? ""} onChange={nastav("poznamka")} />
          </Pole>
        </div>
      </Karta>

      <Tlacidlo type="submit">{p.id ? "Uložiť zmeny" : "Pridať partnera"}</Tlacidlo>
    </form>
  );
}
