"use client";

import { useRef, useState, useTransition } from "react";
import { importujVypis, sparujZnova, priradPohyb, oznacAkoVyriesene, pridajUcet, type VysledokImportu } from "./akcie";
import { Karta, Tlacidlo, Vstup, Vyber, Pole, Chyba, Uspech, Info } from "@/components/ui";
import { vysledok as rozbal } from "@/lib/chyby";

export function PanelImportu({ ucty }: { ucty: { id: string; nazov: string; iban: string }[] }) {
  const [bezi, start] = useTransition();
  const [vysledok, setVysledok] = useState<VysledokImportu | null>(null);
  const [vybranyUcet, setVybranyUcet] = useState("");
  // Účet sa pridáva v tom istom formulári, takže zoznam môže dorásť až po
  // prvom vykreslení – preto sa vždy vraciame k prvému existujúcemu účtu.
  const ucetId = ucty.some((u) => u.id === vybranyUcet) ? vybranyUcet : (ucty[0]?.id ?? "");
  const [pridavamUcet, setPridavamUcet] = useState(ucty.length === 0);
  const [chybaUctu, setChybaUctu] = useState<string | null>(null);
  const suborRef = useRef<HTMLInputElement>(null);

  function odosli(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("ucetId", ucetId);
    setVysledok(null);
    start(async () => {
      try {
        const v = await rozbal(importujVypis(fd));
        setVysledok(v);
        if (v.ok && suborRef.current) suborRef.current.value = "";
      } catch (e) {
        setVysledok({
          ok: false,
          chyba: e instanceof Error ? e.message : "Import zlyhal.",
          nacitanych: 0,
          novych: 0,
          duplicit: 0,
          sparovanychFaktur: 0,
          sparovanychDokladov: 0,
          detaily: [],
        });
      }
    });
  }

  return (
    <Karta>
      <h2 className="mb-4 font-semibold text-antracit-900">Import výpisu</h2>

      {ucty.length > 0 && !pridavamUcet && (
        <form onSubmit={odosli} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Pole popis="Účet">
            <Vyber value={ucetId} onChange={(e) => setVybranyUcet(e.target.value)}>
              {ucty.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nazov} — {u.iban}
                </option>
              ))}
            </Vyber>
          </Pole>

          <Pole popis="Súbor výpisu" napoveda="camt.053 XML alebo CSV z internet bankingu.">
            <Vstup ref={suborRef} type="file" name="subor" accept=".xml,.csv,.txt" required />
          </Pole>

          <div className="flex items-end">
            <Tlacidlo type="submit" disabled={bezi}>
              {bezi ? "Spracúvam…" : "Naimportovať"}
            </Tlacidlo>
          </div>
        </form>
      )}

      {vysledok && (
        <div className="mt-4 space-y-2">
          {!vysledok.ok && <Chyba>{vysledok.chyba}</Chyba>}
          {vysledok.ok && (
            <Uspech>
              Načítaných {vysledok.nacitanych} pohybov · {vysledok.novych} nových
              {vysledok.duplicit ? `, ${vysledok.duplicit} už bolo v systéme` : ""}. Spárovaných{" "}
              {vysledok.sparovanychFaktur} faktúr a {vysledok.sparovanychDokladov} prijatých dokladov.
            </Uspech>
          )}
          {vysledok.detaily && vysledok.detaily.length > 0 && (
            <details className="rounded-md border border-antracit-200 bg-antracit-50 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-antracit-700">Podrobnosti párovania</summary>
              <ul className="mt-2 space-y-1 text-xs text-antracit-600">
                {vysledok.detaily.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </details>
          )}
          {vysledok.varovania && vysledok.varovania.length > 0 && (
            <details className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-amber-800">
                {vysledok.varovania.length} upozornení pri čítaní súboru
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-amber-800">
                {vysledok.varovania.slice(0, 20).map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {pridavamUcet ? (
        <form
          action={async (fd) => {
            setChybaUctu(null);
            try {
              await rozbal(pridajUcet(fd));
              setPridavamUcet(false);
            } catch (e) {
              setChybaUctu(e instanceof Error ? e.message : "Účet sa nepodarilo uložiť.");
            }
          }}
          className="mt-4 space-y-3 rounded-md border border-antracit-200 bg-antracit-50 p-4"
        >
          <h3 className="font-medium text-antracit-900">Nový bankový účet</h3>
          {chybaUctu && <Chyba>{chybaUctu}</Chyba>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Pole popis="Názov">
              <Vstup name="nazov" placeholder="Podnikateľský účet" required />
            </Pole>
            <Pole popis="IBAN">
              <Vstup name="iban" placeholder="SK00 0000 0000 0000 0000 0000" required />
            </Pole>
            <Pole popis="BIC / SWIFT">
              <Vstup name="bic" placeholder="TATRSKBX" />
            </Pole>
          </div>
          <div className="flex gap-2">
            <Tlacidlo type="submit">Uložiť účet</Tlacidlo>
            {ucty.length > 0 && (
              <Tlacidlo variant="tichy" onClick={() => setPridavamUcet(false)}>
                Zrušiť
              </Tlacidlo>
            )}
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Tlacidlo variant="tichy" onClick={() => setPridavamUcet(true)}>
            + Pridať účet
          </Tlacidlo>
          <Tlacidlo
            variant="tichy"
            disabled={bezi}
            onClick={() =>
              start(async () => {
                const v = await rozbal(sparujZnova());
                setVysledok({
                  ok: true,
                  nacitanych: 0,
                  novych: 0,
                  duplicit: 0,
                  sparovanychFaktur: v.sparovaneFaktury,
                  sparovanychDokladov: v.sparovaneDoklady,
                  detaily: v.detaily,
                });
              })
            }
          >
            Skúsiť spárovať znova
          </Tlacidlo>
        </div>
      )}

      {ucty.length > 0 && (
        <div className="mt-4">
          <Info>
            Výpis nahraj raz týždenne. Rovnaký súbor môžeš nahrať aj viackrát — pohyby sa nezduplikujú.
          </Info>
        </div>
      )}
    </Karta>
  );
}

export function PriradenieUhrady({
  pohybId,
  jePrichod,
  faktury,
}: {
  pohybId: string;
  jePrichod: boolean;
  faktury: { id: string; popis: string }[];
}) {
  const [bezi, start] = useTransition();
  const [otvorene, setOtvorene] = useState(false);
  const [vybrana, setVybrana] = useState("");
  const [chyba, setChyba] = useState<string | null>(null);

  if (!otvorene) {
    return (
      <button
        type="button"
        onClick={() => setOtvorene(true)}
        className="text-sm text-antracit-600 underline-offset-2 hover:text-antracit-900 hover:underline"
      >
        Priradiť
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {chyba && <p className="text-xs text-red-600">{chyba}</p>}

      {jePrichod && faktury.length > 0 && (
        <>
          <Vyber value={vybrana} onChange={(e) => setVybrana(e.target.value)} className="min-w-[16rem] text-xs">
            <option value="">— vyber faktúru —</option>
            {faktury.map((f) => (
              <option key={f.id} value={f.id}>
                {f.popis}
              </option>
            ))}
          </Vyber>
          <Tlacidlo
            variant="sekundar"
            disabled={bezi || !vybrana}
            onClick={() => {
              setChyba(null);
              start(async () => {
                try {
                  await rozbal(priradPohyb(pohybId, vybrana));
                } catch (e) {
                  setChyba(e instanceof Error ? e.message : "Priradenie zlyhalo.");
                }
              });
            }}
          >
            Priradiť
          </Tlacidlo>
        </>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={bezi}
          onClick={() => start(async () => { await rozbal(oznacAkoVyriesene(pohybId)); })}
          className="text-xs text-antracit-500 underline-offset-2 hover:underline"
        >
          Nepatrí k dokladu
        </button>
        <button
          type="button"
          onClick={() => setOtvorene(false)}
          className="text-xs text-antracit-400 underline-offset-2 hover:underline"
        >
          Zavrieť
        </button>
      </div>
    </div>
  );
}
