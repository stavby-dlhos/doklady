"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface PolozkaMenu {
  href: string;
  popis: string;
  odznak?: number;
  lenMajitel?: boolean;
}

const IKONY: Record<string, React.ReactNode> = {
  "/": <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
  "/prijate": <path d="M4 4h11l5 5v11H4zM15 4v5h5M8 13h8M8 17h5" />,
  "/faktury": <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  "/banka": <path d="M3 10 12 4l9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 21h18" />,
  "/zakazky": <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />,
  "/partneri": <path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
  "/posta": <path d="M3 6h18v12H3zM3 6l9 7 9-7" />,
  "/export": <path d="M12 3v12M8 11l4 4 4-4M4 17v3h16v-3" />,
  "/nastavenia": (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
};

function Ikona({ href }: { href: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden="true"
    >
      {IKONY[href] ?? <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}

export function Menu({
  polozky,
  meno,
  rola,
}: {
  polozky: PolozkaMenu[];
  meno: string;
  rola: string;
}) {
  const cesta = usePathname();
  const [otvorene, setOtvorene] = useState(false);

  const jeAktivna = (href: string) => (href === "/" ? cesta === "/" : cesta.startsWith(href));

  const zoznam = (
    <nav className="space-y-0.5">
      {polozky.map((p) => {
        const aktivna = jeAktivna(p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            onClick={() => setOtvorene(false)}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              aktivna
                ? "bg-antracit-800 font-medium text-white"
                : "text-antracit-300 hover:bg-antracit-800/60 hover:text-white"
            }`}
          >
            <span className={aktivna ? "text-zlata-400" : "text-antracit-500"}>
              <Ikona href={p.href} />
            </span>
            <span className="flex-1">{p.popis}</span>
            {p.odznak ? (
              <span className="rounded-full bg-zlata-500 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
                {p.odznak > 99 ? "99+" : p.odznak}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobilná lišta */}
      <div className="flex items-center justify-between border-b border-antracit-800 bg-antracit-900 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded bg-zlata-500" />
          <span className="font-bold text-white">Doklady</span>
        </div>
        <button
          type="button"
          onClick={() => setOtvorene((o) => !o)}
          className="rounded-md p-2 text-antracit-300 hover:bg-antracit-800 hover:text-white"
          aria-label="Menu"
          aria-expanded={otvorene}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            {otvorene ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {otvorene && (
        <div className="border-b border-antracit-800 bg-antracit-900 px-3 py-3 lg:hidden">{zoznam}</div>
      )}

      {/* Bočný panel na väčších obrazovkách */}
      <aside className="hidden w-60 shrink-0 flex-col bg-antracit-900 lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="h-5 w-1 rounded bg-zlata-500" />
          <div>
            <p className="font-bold leading-tight text-white">Doklady</p>
            <p className="text-[11px] leading-tight text-antracit-500">Stavby-Dlhoš</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">{zoznam}</div>

        <div className="border-t border-antracit-800 px-4 py-3">
          <p className="truncate text-sm font-medium text-white">{meno}</p>
          <p className="text-xs text-antracit-500">{rola === "MAJITEL" ? "Majiteľ" : "Účtovníčka"}</p>
          <form action="/api/odhlasenie" method="post" className="mt-2">
            <button
              type="submit"
              className="text-xs text-antracit-400 underline-offset-2 hover:text-white hover:underline"
            >
              Odhlásiť sa
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
