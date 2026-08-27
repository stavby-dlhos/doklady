"use client";

import { useState, useTransition, useRef } from "react";
import { nahrajASkusOcr, ulozDoklad } from "./akcie";
import { Karta, Pole, Vstup, Vyber, TextovePole, Tlacidlo, Chyba, Info, Uspech } from "@/components/ui";
import { vysledok } from "@/lib/chyby";
import { TYP_DOKLADU, KATEGORIA, naInputDatum } from "@/lib/stavy";
import { SADZBY_DPH } from "@/lib/dph";

export interface Ciselnik {
  id: string;
  nazov: string;
}

interface Predvyplnene {
  id?: string;
  typ?: string;
  cisloDokladu?: string | null;
  dodavatelId?: string | null;
  zakazkaId?: string | null;
  kategoria?: string;
  datumVystavenia?: string;
  datumSplatnosti?: string | null;
  variabilnySymbol?: string | null;
  zakladDph?: string;
  sadzbaDph?: number;
  sumaDph?: string;
  sumaCelkom?: string;
  prenosDph?: boolean;
  popis?: string | null;
  poznamka?: string | null;
}

export function FormularDokladu({
  dodavatelia,
  zakazkyZoznam,
  hodnoty,
  jeNovy,
}: {
  dodavatelia: Ciselnik[];
  zakazkyZoznam: Ciselnik[];
  hodnoty?: Predvyplnene;
  jeNovy: boolean;
}) {
  const [stav, setStav] = useState<Predvyplnene>(hodnoty ?? { datumVystavenia: naInputDatum(new Date()) });
  const [subor, setSubor] = useState<{ kluc: string; nazov: string; typ: string } | null>(null);
  const [ocrData, setOcrData] = useState<unknown>(null);
  const [ocrIstota, setOcrIstota] = useState<number | null>(null);
  const [sprava, setSprava] = useState<{ typ: "chyba" | "info" | "uspech"; text: string } | null>(null);
  const [nahrava, startNahravanie] = useTransition();
  const [uklada, startUkladanie] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function vyberSuboru(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    setSprava({ typ: "info", text: "Nahrávam a čítam doklad…" });

    const fd = new FormData();
    fd.append("subor", f);

    startNahravanie(async () => {
      let v;
      try {
        v = await vysledok(nahrajASkusOcr(fd));
      } catch (e) {
        setSprava({ typ: "chyba", text: e instanceof Error ? e.message : "Nahranie zlyhalo." });
        return;
      }

      if (!v.ok) {
        setSprava({ typ: "chyba", text: v.chyba });
        return;
      }

      setSubor(v.subor);

      if (v.ocr) {
        setOcrData(v.ocr);
        setOcrIstota(v.ocr.istota);
        setStav((s) => ({
          ...s,
          typ: v.ocr!.typDokladu ?? s.typ ?? "BLOCEK",
          cisloDokladu: v.ocr!.cisloDokladu ?? s.cisloDokladu,
          dodavatelId: v.dodavatelId ?? s.dodavatelId,
          kategoria: v.ocr!.kategoria ?? s.kategoria ?? "MATERIAL",
          datumVystavenia: v.ocr!.datumVystavenia ?? s.datumVystavenia,
          datumSplatnosti: v.ocr!.datumSplatnosti ?? s.datumSplatnosti,
          variabilnySymbol: v.ocr!.variabilnySymbol ?? s.variabilnySymbol,
          sumaCelkom: v.ocr!.sumaCelkom != null ? String(v.ocr!.sumaCelkom) : s.sumaCelkom,
          zakladDph: v.ocr!.zakladDph != null ? String(v.ocr!.zakladDph) : s.zakladDph,
          sumaDph: v.ocr!.sumaDph != null ? String(v.ocr!.sumaDph) : s.sumaDph,
          sadzbaDph: v.ocr!.sadzbaDph ?? s.sadzbaDph ?? 23,
          prenosDph: v.ocr!.prenosDph ?? s.prenosDph ?? false,
          popis: v.ocr!.popis ?? s.popis,
        }));

        const vyzva = v.ocr.poznamkaKKontrole;
        setSprava({
          typ: v.ocr.istota >= 0.8 && !vyzva ? "uspech" : "info",
          text:
            v.ocr.istota >= 0.8 && !vyzva
              ? "Údaje som prečítal. Prejdi ich očami a ulož."
              : `Prečítal som, čo sa dalo${vyzva ? `: ${vyzva}` : ""}. Skontroluj sumu a dátum.`,
        });
      } else {
        setSprava({ typ: "info", text: v.ocrChyba ?? "Súbor je nahraný, údaje vyplň ručne." });
      }
    });
  }

  const nastav = (kluc: keyof Predvyplnene) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setStav((s) => ({ ...s, [kluc]: e.target.value }));

  return (
    <form
      action={(fd) => startUkladanie(async () => {
        try {
          await vysledok(ulozDoklad(fd));
        } catch (e) {
          // redirect() vyhadzuje výnimku – tú preskočíme
          if (e && typeof e === "object" && "digest" in e && String(e.digest).startsWith("NEXT_")) throw e;
          setSprava({ typ: "chyba", text: e instanceof Error ? e.message : "Uloženie zlyhalo." });
        }
      })}
      className="space-y-5"
    >
      {stav.id && <input type="hidden" name="id" value={stav.id} />}
      {subor && (
        <>
          <input type="hidden" name="suborKluc" value={subor.kluc} />
          <input type="hidden" name="suborNazov" value={subor.nazov} />
          <input type="hidden" name="suborTyp" value={subor.typ} />
        </>
      )}
      {ocrData ? <input type="hidden" name="ocrData" value={JSON.stringify(ocrData)} /> : null}
      {ocrIstota !== null && <input type="hidden" name="ocrConfidence" value={String(ocrIstota)} />}

      {jeNovy && (
        <Karta>
          <h2 className="mb-3 font-semibold text-antracit-900">Doklad</h2>

          <div
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-lg border-2 border-dashed border-antracit-300 bg-antracit-50 px-6 py-8 text-center transition-colors hover:border-zlata-400 hover:bg-zlata-50"
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={vyberSuboru}
              className="hidden"
            />
            {subor ? (
              <>
                <p className="text-sm font-medium text-antracit-900">{subor.nazov}</p>
                <p className="mt-1 text-xs text-antracit-500">Klikni pre výmenu súboru</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-antracit-800">
                  {nahrava ? "Spracúvam…" : "Odfoť bloček alebo vyber PDF"}
                </p>
                <p className="mt-1 text-xs text-antracit-500">
                  Z mobilu sa otvorí fotoaparát. Údaje sa vyplnia automaticky.
                </p>
              </>
            )}
          </div>

          {sprava && (
            <div className="mt-3">
              {sprava.typ === "chyba" && <Chyba>{sprava.text}</Chyba>}
              {sprava.typ === "info" && <Info>{sprava.text}</Info>}
              {sprava.typ === "uspech" && <Uspech>{sprava.text}</Uspech>}
            </div>
          )}
        </Karta>
      )}

      {!jeNovy && sprava?.typ === "chyba" && <Chyba>{sprava.text}</Chyba>}

      <Karta>
        <h2 className="mb-4 font-semibold text-antracit-900">Údaje dokladu</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Pole popis="Typ dokladu">
            <Vyber name="typ" value={stav.typ ?? "BLOCEK"} onChange={nastav("typ")}>
              {Object.entries(TYP_DOKLADU).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Vyber>
          </Pole>

          <Pole popis="Dodávateľ">
            <Vyber name="dodavatelId" value={stav.dodavatelId ?? ""} onChange={nastav("dodavatelId")}>
              <option value="">— nezadaný —</option>
              {dodavatelia.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nazov}
                </option>
              ))}
            </Vyber>
          </Pole>

          <Pole popis="Číslo dokladu">
            <Vstup name="cisloDokladu" value={stav.cisloDokladu ?? ""} onChange={nastav("cisloDokladu")} />
          </Pole>

          <Pole popis="Variabilný symbol">
            <Vstup
              name="variabilnySymbol"
              inputMode="numeric"
              value={stav.variabilnySymbol ?? ""}
              onChange={nastav("variabilnySymbol")}
            />
          </Pole>

          <Pole popis="Dátum vystavenia">
            <Vstup
              type="date"
              name="datumVystavenia"
              required
              value={stav.datumVystavenia ?? ""}
              onChange={nastav("datumVystavenia")}
            />
          </Pole>

          <Pole popis="Splatnosť" napoveda="Vyplň pri faktúrach, pri bločkoch netreba.">
            <Vstup
              type="date"
              name="datumSplatnosti"
              value={stav.datumSplatnosti ?? ""}
              onChange={nastav("datumSplatnosti")}
            />
          </Pole>

          <Pole popis="Kategória nákladu">
            <Vyber name="kategoria" value={stav.kategoria ?? "MATERIAL"} onChange={nastav("kategoria")}>
              {Object.entries(KATEGORIA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Vyber>
          </Pole>

          <Pole popis="Zákazka" napoveda="Podľa toho sa počítajú náklady stavby.">
            <Vyber name="zakazkaId" value={stav.zakazkaId ?? ""} onChange={nastav("zakazkaId")}>
              <option value="">— bez zákazky (réžia) —</option>
              {zakazkyZoznam.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nazov}
                </option>
              ))}
            </Vyber>
          </Pole>
        </div>
      </Karta>

      <Karta>
        <h2 className="mb-4 font-semibold text-antracit-900">Suma</h2>

        <div className="grid gap-4 sm:grid-cols-4">
          <Pole popis="Celkom s DPH" napoveda="Suma, ktorá je na doklade.">
            <Vstup
              name="sumaCelkom"
              inputMode="decimal"
              required
              placeholder="0,00"
              value={stav.sumaCelkom ?? ""}
              onChange={nastav("sumaCelkom")}
            />
          </Pole>

          <Pole popis="Sadzba DPH">
            <Vyber
              name="sadzbaDph"
              value={String(stav.sadzbaDph ?? 23)}
              onChange={nastav("sadzbaDph")}
              disabled={stav.prenosDph}
            >
              {SADZBY_DPH.map((s) => (
                <option key={s} value={s}>
                  {s} %
                </option>
              ))}
            </Vyber>
          </Pole>

          <Pole popis="Základ dane" napoveda="Nechaj prázdne — dopočíta sa.">
            <Vstup
              name="zakladDph"
              inputMode="decimal"
              value={stav.zakladDph ?? ""}
              onChange={nastav("zakladDph")}
            />
          </Pole>

          <Pole popis="DPH">
            <Vstup name="sumaDph" inputMode="decimal" value={stav.sumaDph ?? ""} onChange={nastav("sumaDph")} />
          </Pole>
        </div>

        <label className="mt-4 flex items-start gap-2.5">
          <input
            type="checkbox"
            name="prenosDph"
            checked={stav.prenosDph ?? false}
            onChange={(e) => setStav((s) => ({ ...s, prenosDph: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-antracit-300 text-antracit-900 focus:ring-antracit-500"
          />
          <span className="text-sm">
            <span className="font-medium text-antracit-800">Prenesenie daňovej povinnosti</span>
            <span className="block text-xs text-antracit-500">
              Doklad je bez DPH podľa § 69 ods. 12 písm. j) – typicky stavebné práce od subdodávateľa.
            </span>
          </span>
        </label>
      </Karta>

      <Karta>
        <div className="grid gap-4">
          <Pole popis="Popis" napoveda="Za čo to bolo — krátko.">
            <Vstup name="popis" value={stav.popis ?? ""} onChange={nastav("popis")} maxLength={200} />
          </Pole>
          <Pole popis="Poznámka">
            <TextovePole name="poznamka" rows={2} value={stav.poznamka ?? ""} onChange={nastav("poznamka")} />
          </Pole>
        </div>
      </Karta>

      <div className="flex gap-3">
        <Tlacidlo type="submit" disabled={uklada || nahrava}>
          {uklada ? "Ukladám…" : jeNovy ? "Uložiť doklad" : "Uložiť zmeny"}
        </Tlacidlo>
      </div>
    </form>
  );
}
