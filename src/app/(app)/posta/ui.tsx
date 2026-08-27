"use client";

import { useState, useTransition } from "react";
import { skontrolujSchranku, otestujOdosielanie, skusZnovaOdoslat } from "./akcie";
import { Karta, Tlacidlo, Chyba, Uspech, Info } from "@/components/ui";
import { vysledok } from "@/lib/chyby";

export function PanelPodatelne({
  adresa,
  imapNastavene,
  smtpNastavene,
}: {
  adresa: string | null;
  imapNastavene: boolean;
  smtpNastavene: boolean;
}) {
  const [bezi, start] = useTransition();
  const [sprava, setSprava] = useState<{ typ: "chyba" | "uspech" | "info"; text: string } | null>(null);

  return (
    <Karta>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-antracit-900">Elektronická podateľňa</h2>
          {adresa ? (
            <p className="mt-1 text-sm text-antracit-600">
              Prepošli faktúru alebo odfoť bloček na{" "}
              <span className="font-medium text-antracit-900">{adresa}</span> a systém ju sám vyťaží a založí
              ako doklad na kontrolu.
            </p>
          ) : (
            <p className="mt-1 text-sm text-antracit-500">Schránka zatiaľ nie je nastavená.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Tlacidlo
            disabled={bezi || !imapNastavene}
            onClick={() => {
              setSprava(null);
              start(async () => {
                let v;
                try {
                  v = await vysledok(skontrolujSchranku());
                } catch (e) {
                  setSprava({ typ: "chyba", text: e instanceof Error ? e.message : "Kontrola schránky zlyhala." });
                  return;
                }
                if (!v.ok) {
                  setSprava({ typ: "chyba", text: v.chyba });
                  return;
                }
                setSprava({
                  typ: v.vytvorenychDokladov > 0 ? "uspech" : "info",
                  text:
                    v.spracovanychMailov === 0
                      ? "V schránke nie sú nové správy."
                      : `Spracovaných ${v.spracovanychMailov} správ, založených ${v.vytvorenychDokladov} dokladov.` +
                        (v.chyby.length ? ` ${v.chyby.length} príloh sa nepodarilo spracovať.` : ""),
                });
              });
            }}
          >
            {bezi ? "Kontrolujem…" : "Skontrolovať schránku"}
          </Tlacidlo>

          <Tlacidlo
            variant="sekundar"
            disabled={bezi || !smtpNastavene}
            onClick={() => {
              setSprava(null);
              start(async () => {
                let v;
                try {
                  v = await vysledok(otestujOdosielanie());
                } catch (e) {
                  setSprava({ typ: "chyba", text: e instanceof Error ? e.message : "Test odosielania zlyhal." });
                  return;
                }
                setSprava(
                  v.ok
                    ? { typ: "uspech", text: "Spojenie s odosielacím serverom funguje." }
                    : { typ: "chyba", text: `Odosielanie nefunguje: ${v.chyba}` },
                );
              });
            }}
          >
            Otestovať odosielanie
          </Tlacidlo>

          <Tlacidlo
            variant="tichy"
            disabled={bezi}
            onClick={() => {
              setSprava(null);
              start(async () => {
                let v;
                try {
                  v = await vysledok(skusZnovaOdoslat());
                } catch (e) {
                  setSprava({ typ: "chyba", text: e instanceof Error ? e.message : "Odoslanie zlyhalo." });
                  return;
                }
                setSprava({
                  typ: "info",
                  text: v.pokusov === 0 ? "Žiadne neúspešné maily na opätovné odoslanie." : `Znovu odoslaných ${v.uspesnych} z ${v.pokusov}.`,
                });
              });
            }}
          >
            Poslať znova neúspešné
          </Tlacidlo>
        </div>
      </div>

      {sprava && (
        <div className="mt-4">
          {sprava.typ === "chyba" && <Chyba>{sprava.text}</Chyba>}
          {sprava.typ === "uspech" && <Uspech>{sprava.text}</Uspech>}
          {sprava.typ === "info" && <Info>{sprava.text}</Info>}
        </div>
      )}
    </Karta>
  );
}
