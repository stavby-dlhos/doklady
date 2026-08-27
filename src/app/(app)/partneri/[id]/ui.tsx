"use client";

import { useTransition } from "react";
import { archivujPartnera } from "../akcie";
import { Tlacidlo } from "@/components/ui";
import { vysledok } from "@/lib/chyby";

export function TlacidloArchivu({ id, archivovany }: { id: string; archivovany: boolean }) {
  const [bezi, start] = useTransition();

  return (
    <Tlacidlo
      variant="sekundar"
      disabled={bezi}
      onClick={() => start(async () => { await vysledok(archivujPartnera(id, !archivovany)); })}
    >
      {archivovany ? "Vrátiť z archívu" : "Archivovať"}
    </Tlacidlo>
  );
}
