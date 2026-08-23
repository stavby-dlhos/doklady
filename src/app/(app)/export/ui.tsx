"use client";

import { useState } from "react";
import { Karta, Pole, Vstup, Tlacidlo, Chyba } from "@/components/ui";

export function FormularExportu({ vychodziOd, vychodziDo }: { vychodziOd: string; vychodziDo: string }) {
  const [od, setOd] = useState(vychodziOd);
  const [doDatumu, setDo] = useState(vychodziDo);
  const [skeny, setSkeny] = useState(true);
  const [lenSchvalene, setLenSchvalene] = useState(true);
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  async function stiahni() {
    setChyba(null);
    setBezi(true);
    try {
      const url = `/api/export?od=${od}&do=${doDatumu}&skeny=${skeny}&lenSchvalene=${lenSchvalene}`;
      const odpoved = await fetch(url);

      if (!odpoved.ok) {
        const json = await odpoved.json().catch(() => ({ chyba: "Export zlyhal." }));
        throw new Error(json.chyba ?? "Export zlyhal.");
      }

      const blob = await odpoved.blob();
      const nazov =
        odpoved.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1] ?? `export-${od}_${doDatumu}.zip`;

      const odkaz = document.createElement("a");
      odkaz.href = URL.createObjectURL(blob);
      odkaz.download = nazov;
      document.body.appendChild(odkaz);
      odkaz.click();
      odkaz.remove();
      URL.revokeObjectURL(odkaz.href);
    } catch (e) {
      setChyba(e instanceof Error ? e.message : "Export zlyhal.");
    } finally {
      setBezi(false);
    }
  }

  function nastavMesiac(posun: number) {
    const teraz = new Date();
    const zaciatok = new Date(teraz.getFullYear(), teraz.getMonth() + posun, 1);
    const koniec = new Date(teraz.getFullYear(), teraz.getMonth() + posun + 1, 0);
    setOd(naDatum(zaciatok));
    setDo(naDatum(koniec));
  }

  function nastavKvartal(posun: number) {
    const teraz = new Date();
    const kvartal = Math.floor(teraz.getMonth() / 3) + posun;
    const zaciatok = new Date(teraz.getFullYear(), kvartal * 3, 1);
    const koniec = new Date(teraz.getFullYear(), kvartal * 3 + 3, 0);
    setOd(naDatum(zaciatok));
    setDo(naDatum(koniec));
  }

  return (
    <Karta>
      {chyba && (
        <div className="mb-4">
          <Chyba>{chyba}</Chyba>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Tlacidlo variant="tichy" onClick={() => nastavMesiac(-1)}>
          Minulý mesiac
        </Tlacidlo>
        <Tlacidlo variant="tichy" onClick={() => nastavMesiac(0)}>
          Tento mesiac
        </Tlacidlo>
        <Tlacidlo variant="tichy" onClick={() => nastavKvartal(-1)}>
          Minulý kvartál
        </Tlacidlo>
        <Tlacidlo variant="tichy" onClick={() => nastavKvartal(0)}>
          Tento kvartál
        </Tlacidlo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Pole popis="Od">
          <Vstup type="date" value={od} onChange={(e) => setOd(e.target.value)} />
        </Pole>
        <Pole popis="Do">
          <Vstup type="date" value={doDatumu} onChange={(e) => setDo(e.target.value)} />
        </Pole>
      </div>

      <div className="mt-4 space-y-2.5">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={skeny}
            onChange={(e) => setSkeny(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-antracit-300"
          />
          <span className="text-sm">
            <span className="font-medium text-antracit-800">Priložiť skeny dokladov</span>
            <span className="block text-xs text-antracit-500">
              Súbory sa pridajú do priečinka skeny/. Bez nich je ZIP oveľa menší.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={lenSchvalene}
            onChange={(e) => setLenSchvalene(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-antracit-300"
          />
          <span className="text-sm">
            <span className="font-medium text-antracit-800">Len schválené doklady</span>
            <span className="block text-xs text-antracit-500">
              Odporúčané — nespracované doklady by účtovníčku len miatli.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-5">
        <Tlacidlo onClick={stiahni} disabled={bezi || !od || !doDatumu}>
          {bezi ? "Pripravujem ZIP…" : "Stiahnuť export"}
        </Tlacidlo>
      </div>
    </Karta>
  );
}

function naDatum(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
