"use client";

import { useTransition } from "react";
import { prepniPouzivatela } from "./akcie";
import { Karta, Odznak } from "@/components/ui";

export function PrepinacPouzivatela({ id, aktivny }: { id: string; aktivny: boolean }) {
  const [bezi, start] = useTransition();

  return (
    <button
      type="button"
      disabled={bezi}
      onClick={() => start(() => prepniPouzivatela(id, !aktivny))}
      className="text-sm text-antracit-500 underline-offset-2 hover:text-antracit-900 hover:underline disabled:opacity-50"
    >
      {aktivny ? "Deaktivovať" : "Aktivovať"}
    </button>
  );
}

export function StavPrepojeni({
  ocr,
  smtp,
  imap,
  uloziskoS3,
  adresaPodatelne,
  pocetUctov,
}: {
  ocr: boolean;
  smtp: boolean;
  imap: boolean;
  uloziskoS3: boolean;
  adresaPodatelne: string | null;
  pocetUctov: number;
}) {
  const polozky = [
    {
      nazov: "Čítanie dokladov (OCR)",
      ok: ocr,
      detail: ocr ? "Zapnuté" : "Chýba ANTHROPIC_API_KEY — údaje sa vypĺňajú ručne.",
    },
    {
      nazov: "Odosielanie faktúr",
      ok: smtp,
      detail: smtp ? "SMTP nastavené" : "Chýbajú premenné SMTP_HOST, SMTP_USER, SMTP_PASSWORD.",
    },
    {
      nazov: "Elektronická podateľňa",
      ok: imap,
      detail: imap ? (adresaPodatelne ?? "IMAP nastavené") : "Chýbajú premenné IMAP_HOST, IMAP_USER, IMAP_PASSWORD.",
    },
    {
      nazov: "Úložisko skenov",
      ok: uloziskoS3,
      detail: uloziskoS3
        ? "S3 / Cloudflare R2"
        : "Lokálny disk — na Railway sa po nasadení vymaže. Nastav S3_BUCKET.",
    },
    {
      nazov: "Bankové účty",
      ok: pocetUctov > 0,
      detail: pocetUctov > 0 ? `${pocetUctov} účtov` : "Pridaj účet v sekcii Banka.",
    },
  ];

  return (
    <Karta>
      <h2 className="mb-4 font-semibold text-antracit-900">Stav systému</h2>
      <ul className="divide-y divide-antracit-100">
        {polozky.map((p) => (
          <li key={p.nazov} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div>
              <p className="text-sm font-medium text-antracit-800">{p.nazov}</p>
              <p className="text-xs text-antracit-500">{p.detail}</p>
            </div>
            <Odznak farba={p.ok ? "zelena" : "zlta"}>{p.ok ? "funguje" : "nenastavené"}</Odznak>
          </li>
        ))}
      </ul>
    </Karta>
  );
}
