"use client";

import { useState, useTransition } from "react";
import { odosliFakturu, oznacAkoOdoslanu, pridajUhradu, stornujFakturu, zmazKoncept } from "../akcie";
import { Tlacidlo, TextovePole, Vstup, Vyber, Chyba, Uspech, Pole } from "@/components/ui";
import { FORMA_UHRADY } from "@/lib/stavy";
import { vysledok } from "@/lib/chyby";

export function AkcieFaktury({
  id,
  cislo,
  stav,
  jeMajitel,
  emailOdberatela,
  nazovFirmy,
  sumaCelkom,
  zostava,
  datumSplatnosti,
  dnes,
}: {
  id: string;
  cislo: string;
  stav: string;
  jeMajitel: boolean;
  emailOdberatela: string;
  nazovFirmy: string;
  sumaCelkom: string;
  zostava: string;
  datumSplatnosti: string;
  dnes: string;
}) {
  const [bezi, start] = useTransition();
  const [panel, setPanel] = useState<"ziadny" | "mail" | "uhrada" | "storno">("ziadny");
  const [chyba, setChyba] = useState<string | null>(null);
  const [hotovo, setHotovo] = useState<string | null>(null);

  const [prijemca, setPrijemca] = useState(emailOdberatela);
  const [kopia, setKopia] = useState(true);
  const [sprava, setSprava] = useState(
    `Dobrý deň,\n\nv prílohe posielame faktúru ${cislo} na sumu ${sumaCelkom} so splatnosťou ${datumSplatnosti}.\n\nPlatbu je možné zrealizovať naskenovaním QR kódu na faktúre v mobilnej banke.\n\nS pozdravom\n${nazovFirmy}`,
  );

  const [sumaUhrady, setSumaUhrady] = useState(zostava.replace(/[^\d,.-]/g, "").replace(",", "."));
  const [datumUhrady, setDatumUhrady] = useState(dnes);
  const [sposob, setSposob] = useState("PREVOD");
  const [dovodStorna, setDovodStorna] = useState("");

  function spusti(akcia: () => Promise<unknown>, sprava?: string) {
    setChyba(null);
    setHotovo(null);
    start(async () => {
      try {
        await vysledok(akcia());
        setPanel("ziadny");
        if (sprava) setHotovo(sprava);
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String(e.digest).startsWith("NEXT_")) throw e;
        setChyba(e instanceof Error ? e.message : "Akcia zlyhala.");
      }
    });
  }

  const jeKoncept = stav === "KONCEPT";
  const jeOtvorena = ["ODOSLANA", "CIASTOCNE_UHRADENA", "PO_SPLATNOSTI"].includes(stav);
  const daSaStornovat = jeMajitel && jeOtvorena;

  return (
    <div className="space-y-3">
      {chyba && <Chyba>{chyba}</Chyba>}
      {hotovo && <Uspech>{hotovo}</Uspech>}

      {stav !== "STORNO" && (
        <Tlacidlo className="w-full" disabled={bezi} onClick={() => setPanel(panel === "mail" ? "ziadny" : "mail")}>
          Poslať e-mailom
        </Tlacidlo>
      )}

      {panel === "mail" && (
        <div className="space-y-3 rounded-md border border-antracit-200 bg-antracit-50 p-3">
          <Pole popis="Príjemca">
            <Vstup
              type="email"
              value={prijemca}
              onChange={(e) => setPrijemca(e.target.value)}
              placeholder="odberatel@firma.sk"
            />
          </Pole>
          <Pole popis="Správa">
            <TextovePole rows={8} value={sprava} onChange={(e) => setSprava(e.target.value)} />
          </Pole>
          <label className="flex items-center gap-2 text-sm text-antracit-700">
            <input
              type="checkbox"
              checked={kopia}
              onChange={(e) => setKopia(e.target.checked)}
              className="h-4 w-4 rounded border-antracit-300"
            />
            Poslať kópiu aj nám
          </label>
          <p className="text-xs text-antracit-500">Faktúra sa priloží ako PDF automaticky.</p>
          <div className="flex gap-2">
            <Tlacidlo
              disabled={bezi || !prijemca.includes("@")}
              onClick={() => spusti(() => odosliFakturu(id, prijemca, sprava, kopia), "Faktúra odoslaná.")}
            >
              {bezi ? "Odosielam…" : "Odoslať"}
            </Tlacidlo>
            <Tlacidlo variant="tichy" onClick={() => setPanel("ziadny")}>
              Zrušiť
            </Tlacidlo>
          </div>
        </div>
      )}

      {jeKoncept && (
        <Tlacidlo
          variant="sekundar"
          className="w-full"
          disabled={bezi}
          onClick={() => spusti(() => oznacAkoOdoslanu(id), "Faktúra označená ako odoslaná.")}
        >
          Označiť ako odoslanú
        </Tlacidlo>
      )}

      {jeOtvorena && (
        <>
          <Tlacidlo
            variant="sekundar"
            className="w-full"
            onClick={() => setPanel(panel === "uhrada" ? "ziadny" : "uhrada")}
          >
            Zaznamenať úhradu
          </Tlacidlo>

          {panel === "uhrada" && (
            <div className="space-y-3 rounded-md border border-antracit-200 bg-antracit-50 p-3">
              <Pole popis="Suma" napoveda={`Zostáva ${zostava}`}>
                <Vstup inputMode="decimal" value={sumaUhrady} onChange={(e) => setSumaUhrady(e.target.value)} />
              </Pole>
              <Pole popis="Dátum">
                <Vstup type="date" value={datumUhrady} onChange={(e) => setDatumUhrady(e.target.value)} />
              </Pole>
              <Pole popis="Spôsob">
                <Vyber value={sposob} onChange={(e) => setSposob(e.target.value)}>
                  {Object.entries(FORMA_UHRADY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Vyber>
              </Pole>
              <div className="flex gap-2">
                <Tlacidlo
                  disabled={bezi}
                  onClick={() => spusti(() => pridajUhradu(id, sumaUhrady, datumUhrady, sposob), "Úhrada zapísaná.")}
                >
                  Uložiť
                </Tlacidlo>
                <Tlacidlo variant="tichy" onClick={() => setPanel("ziadny")}>
                  Zrušiť
                </Tlacidlo>
              </div>
            </div>
          )}
        </>
      )}

      {daSaStornovat && (
        <>
          <Tlacidlo
            variant="nebezpecny"
            className="w-full"
            onClick={() => setPanel(panel === "storno" ? "ziadny" : "storno")}
          >
            Stornovať
          </Tlacidlo>

          {panel === "storno" && (
            <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
              <TextovePole
                rows={2}
                placeholder="Dôvod storna"
                value={dovodStorna}
                onChange={(e) => setDovodStorna(e.target.value)}
              />
              <div className="flex gap-2">
                <Tlacidlo
                  variant="nebezpecny"
                  disabled={bezi || !dovodStorna.trim()}
                  onClick={() => spusti(() => stornujFakturu(id, dovodStorna), "Faktúra stornovaná.")}
                >
                  Stornovať
                </Tlacidlo>
                <Tlacidlo variant="tichy" onClick={() => setPanel("ziadny")}>
                  Zrušiť
                </Tlacidlo>
              </div>
            </div>
          )}
        </>
      )}

      {jeKoncept && (
        <Tlacidlo
          variant="nebezpecny"
          className="w-full"
          disabled={bezi}
          onClick={() => {
            if (!confirm("Zmazať tento koncept?")) return;
            spusti(() => zmazKoncept(id));
          }}
        >
          Zmazať koncept
        </Tlacidlo>
      )}
    </div>
  );
}
