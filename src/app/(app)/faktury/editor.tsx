"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ulozFakturu, type FakturaFormular, type PolozkaFormular } from "./akcie";
import { Karta, Pole, Vstup, Vyber, TextovePole, Tlacidlo, Chyba, Info } from "@/components/ui";
import { MERNE_JEDNOTKY, FORMA_UHRADY, naInputDatum } from "@/lib/stavy";
import { SADZBY_DPH, POZNAMKA_PRENOS_DPH } from "@/lib/dph";
import { formatEur, toCents } from "@/lib/money";

interface Odberatel {
  id: string;
  nazov: string;
  jePlatitelDph: boolean;
  krajina: string;
  email: string | null;
}

function prazdnaPolozka(): PolozkaFormular {
  return { skupina: "", nazov: "", popis: "", mnozstvo: "1", mj: "ks", cenaZaMj: "", zlavaPct: "0", sadzbaDph: 23 };
}

export function EditorFaktury({
  rady,
  odberatelia,
  zakazkyZoznam,
  firmaPlatitelDph,
  splatnostDni,
  hodnoty,
}: {
  rady: { id: string; nazov: string; nasledujuce: string }[];
  odberatelia: Odberatel[];
  zakazkyZoznam: { id: string; nazov: string }[];
  firmaPlatitelDph: boolean;
  splatnostDni: number;
  hodnoty?: FakturaFormular;
}) {
  const router = useRouter();
  const dnes = naInputDatum(new Date());
  const splatnostVychodzia = naInputDatum(new Date(Date.now() + splatnostDni * 86_400_000));

  const [f, setF] = useState<FakturaFormular>(
    hodnoty ?? {
      radaId: rady[0]?.id ?? "",
      odberatelId: "",
      zakazkaId: null,
      datumVystavenia: dnes,
      datumDodania: dnes,
      datumSplatnosti: splatnostVychodzia,
      formaUhrady: "PREVOD",
      prenosDph: false,
      textPredPolozkami: "",
      poznamka: "",
      polozky: [prazdnaPolozka()],
    },
  );
  const [chyba, setChyba] = useState<string | null>(null);
  const [uklada, start] = useTransition();

  const odberatel = odberatelia.find((o) => o.id === f.odberatelId);
  const prenosMozny =
    firmaPlatitelDph && Boolean(odberatel?.jePlatitelDph) && odberatel?.krajina.toUpperCase() === "SK";

  const suhrn = useMemo(() => {
    const zaklady: Record<number, number> = { 23: 0, 19: 0, 5: 0, 0: 0 };

    for (const p of f.polozky) {
      // Rovnaké poradie operácií ako na serveri (lib/dph.ts), aby sa náhľad
      // a uložená faktúra nelíšili o cent.
      const bez = toCents(cislo(p.mnozstvo) * cislo(p.cenaZaMj));
      const zlava = Math.round((bez * cislo(p.zlavaPct)) / 100);
      const zaklad = bez - zlava;
      const sadzba = f.prenosDph || !firmaPlatitelDph ? 0 : p.sadzbaDph;
      zaklady[sadzba] = (zaklady[sadzba] ?? 0) + zaklad;
    }

    const dph =
      Math.round((zaklady[23] * 23) / 100) + Math.round((zaklady[19] * 19) / 100) + Math.round((zaklady[5] * 5) / 100);
    const bezDph = zaklady[23] + zaklady[19] + zaklady[5] + zaklady[0];

    return { zaklady, dph, bezDph, celkom: bezDph + dph };
  }, [f.polozky, f.prenosDph, firmaPlatitelDph]);

  function uprav(i: number, kluc: keyof PolozkaFormular, hodnota: string | number) {
    setF((s) => {
      const polozky = [...s.polozky];
      polozky[i] = { ...polozky[i], [kluc]: hodnota };
      return { ...s, polozky };
    });
  }

  function odosli() {
    setChyba(null);
    start(async () => {
      try {
        const { id } = await ulozFakturu(f);
        router.push(`/faktury/${id}`);
      } catch (e) {
        setChyba(e instanceof Error ? e.message : "Uloženie zlyhalo.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {chyba && <Chyba>{chyba}</Chyba>}

      <Karta>
        <h2 className="mb-4 font-semibold text-antracit-900">Základné údaje</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!f.id && (
            <Pole popis="Číselná rada" napoveda={`Ďalšie číslo: ${rady.find((r) => r.id === f.radaId)?.nasledujuce ?? "—"}`}>
              <Vyber value={f.radaId} onChange={(e) => setF({ ...f, radaId: e.target.value })}>
                {rady.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nazov}
                  </option>
                ))}
              </Vyber>
            </Pole>
          )}

          <Pole popis="Odberateľ">
            <Vyber
              value={f.odberatelId}
              onChange={(e) => {
                const novy = odberatelia.find((o) => o.id === e.target.value);
                const moznyPrenos =
                  firmaPlatitelDph && Boolean(novy?.jePlatitelDph) && novy?.krajina.toUpperCase() === "SK";
                setF({ ...f, odberatelId: e.target.value, prenosDph: moznyPrenos ? f.prenosDph : false });
              }}
            >
              <option value="">— vyber odberateľa —</option>
              {odberatelia.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nazov}
                </option>
              ))}
            </Vyber>
          </Pole>

          <Pole popis="Zákazka">
            <Vyber value={f.zakazkaId ?? ""} onChange={(e) => setF({ ...f, zakazkaId: e.target.value || null })}>
              <option value="">— bez zákazky —</option>
              {zakazkyZoznam.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nazov}
                </option>
              ))}
            </Vyber>
          </Pole>

          <Pole popis="Dátum vystavenia">
            <Vstup
              type="date"
              value={f.datumVystavenia}
              onChange={(e) => setF({ ...f, datumVystavenia: e.target.value })}
            />
          </Pole>

          <Pole popis="Dátum dodania" napoveda="Kedy boli práce odovzdané.">
            <Vstup type="date" value={f.datumDodania} onChange={(e) => setF({ ...f, datumDodania: e.target.value })} />
          </Pole>

          <Pole popis="Splatnosť">
            <Vstup
              type="date"
              value={f.datumSplatnosti}
              onChange={(e) => setF({ ...f, datumSplatnosti: e.target.value })}
            />
          </Pole>

          <Pole popis="Forma úhrady">
            <Vyber
              value={f.formaUhrady}
              onChange={(e) => setF({ ...f, formaUhrady: e.target.value as FakturaFormular["formaUhrady"] })}
            >
              {Object.entries(FORMA_UHRADY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Vyber>
          </Pole>
        </div>

        {prenosMozny && (
          <label className="mt-4 flex items-start gap-2.5 rounded-md border border-zlata-200 bg-zlata-50 p-3">
            <input
              type="checkbox"
              checked={f.prenosDph}
              onChange={(e) => setF({ ...f, prenosDph: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-antracit-300 text-antracit-900 focus:ring-antracit-500"
            />
            <span className="text-sm">
              <span className="font-medium text-antracit-900">Prenesenie daňovej povinnosti</span>
              <span className="block text-xs text-antracit-600">
                Stavebné práce pre platiteľa DPH v tuzemsku. Faktúra pôjde bez DPH, na PDF sa doplní zákonná
                poznámka.
              </span>
            </span>
          </label>
        )}

        {!firmaPlatitelDph && (
          <div className="mt-4">
            <Info>Firma je vedená ako neplatiteľ DPH — faktúry sa vystavujú bez dane.</Info>
          </div>
        )}
      </Karta>

      <Karta>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-antracit-900">Položky</h2>
          <Tlacidlo variant="sekundar" onClick={() => setF({ ...f, polozky: [...f.polozky, prazdnaPolozka()] })}>
            + Pridať položku
          </Tlacidlo>
        </div>

        <div className="space-y-4">
          {f.polozky.map((p, i) => (
            <div key={i} className="rounded-md border border-antracit-200 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <input
                  value={p.skupina}
                  onChange={(e) => uprav(i, "skupina", e.target.value)}
                  placeholder="Skupina (napr. Hrubá stavba)"
                  className="w-56 rounded border-0 bg-antracit-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-antracit-700 placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-antracit-400 focus:outline-none focus:ring-1 focus:ring-antracit-300"
                />
                {f.polozky.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setF({ ...f, polozky: f.polozky.filter((_, j) => j !== i) })}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Odstrániť
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-12">
                  <Vstup
                    value={p.nazov}
                    onChange={(e) => uprav(i, "nazov", e.target.value)}
                    placeholder="Názov položky"
                  />
                </div>
                <div className="sm:col-span-12">
                  <Vstup
                    value={p.popis}
                    onChange={(e) => uprav(i, "popis", e.target.value)}
                    placeholder="Doplňujúci popis (nepovinné)"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Vstup
                    value={p.mnozstvo}
                    inputMode="decimal"
                    onChange={(e) => uprav(i, "mnozstvo", e.target.value)}
                    aria-label="Množstvo"
                    placeholder="Množstvo"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Vyber value={p.mj} onChange={(e) => uprav(i, "mj", e.target.value)} aria-label="Merná jednotka">
                    {MERNE_JEDNOTKY.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Vyber>
                </div>
                <div className="sm:col-span-3">
                  <Vstup
                    value={p.cenaZaMj}
                    inputMode="decimal"
                    onChange={(e) => uprav(i, "cenaZaMj", e.target.value)}
                    aria-label="Cena za MJ"
                    placeholder="Cena za MJ"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Vstup
                    value={p.zlavaPct}
                    inputMode="decimal"
                    onChange={(e) => uprav(i, "zlavaPct", e.target.value)}
                    aria-label="Zľava v %"
                    placeholder="Zľava %"
                  />
                </div>
                <div className="sm:col-span-3">
                  <Vyber
                    value={String(p.sadzbaDph)}
                    onChange={(e) => uprav(i, "sadzbaDph", Number(e.target.value))}
                    disabled={f.prenosDph || !firmaPlatitelDph}
                    aria-label="Sadzba DPH"
                  >
                    {SADZBY_DPH.map((s) => (
                      <option key={s} value={s}>
                        DPH {s} %
                      </option>
                    ))}
                  </Vyber>
                </div>
              </div>

              <p className="mt-2 text-right text-sm text-antracit-600">
                Riadok:{" "}
                <span className="font-semibold text-antracit-900">
                  {formatEur(riadokSpolu(p, f.prenosDph || !firmaPlatitelDph))}
                </span>
              </p>
            </div>
          ))}
        </div>
      </Karta>

      <Karta>
        <div className="grid gap-4">
          <Pole popis="Text pred položkami" napoveda="Napríklad: Fakturujeme Vám práce podľa zmluvy o dielo č. …">
            <TextovePole
              rows={2}
              value={f.textPredPolozkami}
              onChange={(e) => setF({ ...f, textPredPolozkami: e.target.value })}
            />
          </Pole>
          <Pole popis="Poznámka pod položkami">
            <TextovePole rows={2} value={f.poznamka} onChange={(e) => setF({ ...f, poznamka: e.target.value })} />
          </Pole>
        </div>
      </Karta>

      <Karta className="bg-antracit-900 text-white" padding={false}>
        <div className="px-5 py-4">
          <div className="space-y-1.5 text-sm">
            {f.prenosDph ? (
              <div className="flex justify-between text-antracit-300">
                <span>Základ dane (prenos daňovej povinnosti)</span>
                <span className="tabular-nums">{formatEur(suhrn.bezDph)}</span>
              </div>
            ) : (
              <>
                {SADZBY_DPH.filter((s) => s > 0 && suhrn.zaklady[s]).map((s) => (
                  <div key={s} className="flex justify-between text-antracit-300">
                    <span>Základ {s} %</span>
                    <span className="tabular-nums">{formatEur(suhrn.zaklady[s])}</span>
                  </div>
                ))}
                <div className="flex justify-between text-antracit-300">
                  <span>DPH spolu</span>
                  <span className="tabular-nums">{formatEur(suhrn.dph)}</span>
                </div>
              </>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-antracit-700 pt-3">
            <span className="text-sm uppercase tracking-wide text-zlata-300">Na úhradu</span>
            <span className="text-xl font-bold tabular-nums">{formatEur(suhrn.celkom)}</span>
          </div>

          {f.prenosDph && <p className="mt-3 text-xs leading-relaxed text-antracit-400">{POZNAMKA_PRENOS_DPH}</p>}
        </div>
      </Karta>

      <div className="flex flex-wrap gap-3">
        <Tlacidlo onClick={odosli} disabled={uklada}>
          {uklada ? "Ukladám…" : f.id ? "Uložiť zmeny" : "Uložiť ako koncept"}
        </Tlacidlo>
        <Tlacidlo variant="tichy" onClick={() => router.back()}>
          Zrušiť
        </Tlacidlo>
      </div>
    </div>
  );
}

function cislo(s: string): number {
  const n = parseFloat(String(s).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function riadokSpolu(p: PolozkaFormular, bezDph: boolean): number {
  const bez = toCents(cislo(p.mnozstvo) * cislo(p.cenaZaMj));
  const zaklad = bez - Math.round((bez * cislo(p.zlavaPct)) / 100);
  return bezDph ? zaklad : zaklad + Math.round((zaklad * p.sadzbaDph) / 100);
}
