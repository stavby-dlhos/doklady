import { ulozZakazku } from "./akcie";
import { Karta, Pole, Vstup, Vyber, TextovePole, Tlacidlo } from "@/components/ui";
import { STAV_ZAKAZKY, naInputDatum } from "@/lib/stavy";

export interface HodnotyZakazky {
  id?: string;
  kod?: string;
  nazov?: string;
  adresa?: string | null;
  investor?: string | null;
  stav?: string;
  datumStart?: Date | null;
  datumKoniec?: Date | null;
  rozpocet?: string | null;
  poznamka?: string | null;
}

export function FormularZakazky({ hodnoty }: { hodnoty?: HodnotyZakazky }) {
  const rok = new Date().getFullYear();

  return (
    <form action={ulozZakazku} className="space-y-5">
      {hodnoty?.id && <input type="hidden" name="id" value={hodnoty.id} />}

      <Karta>
        <div className="grid gap-4 sm:grid-cols-2">
          <Pole popis="Kód zákazky" napoveda={`Napríklad ${rok}-HC-01 — rok, mesto, poradie.`}>
            <Vstup name="kod" required defaultValue={hodnoty?.kod ?? ""} placeholder={`${rok}-HC-01`} />
          </Pole>

          <Pole popis="Názov">
            <Vstup name="nazov" required defaultValue={hodnoty?.nazov ?? ""} placeholder="RD Hlohovec – Novák" />
          </Pole>

          <Pole popis="Adresa stavby">
            <Vstup name="adresa" defaultValue={hodnoty?.adresa ?? ""} />
          </Pole>

          <Pole popis="Investor">
            <Vstup name="investor" defaultValue={hodnoty?.investor ?? ""} />
          </Pole>

          <Pole popis="Stav">
            <Vyber name="stav" defaultValue={hodnoty?.stav ?? "AKTIVNA"}>
              {Object.entries(STAV_ZAKAZKY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.popis}
                </option>
              ))}
            </Vyber>
          </Pole>

          <Pole popis="Rozpočet" napoveda="Nepovinné — slúži na sledovanie čerpania.">
            <Vstup name="rozpocet" inputMode="decimal" defaultValue={hodnoty?.rozpocet ?? ""} placeholder="0,00" />
          </Pole>

          <Pole popis="Začiatok">
            <Vstup type="date" name="datumStart" defaultValue={naInputDatum(hodnoty?.datumStart)} />
          </Pole>

          <Pole popis="Predpokladané ukončenie">
            <Vstup type="date" name="datumKoniec" defaultValue={naInputDatum(hodnoty?.datumKoniec)} />
          </Pole>
        </div>

        <div className="mt-4">
          <Pole popis="Poznámka">
            <TextovePole name="poznamka" rows={3} defaultValue={hodnoty?.poznamka ?? ""} />
          </Pole>
        </div>
      </Karta>

      <Tlacidlo type="submit">{hodnoty?.id ? "Uložiť zmeny" : "Založiť zákazku"}</Tlacidlo>
    </form>
  );
}
