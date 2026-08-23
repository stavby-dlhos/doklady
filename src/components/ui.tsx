import Link from "next/link";
import { forwardRef, type ReactNode } from "react";

/** Zdieľané stavebné prvky rozhrania. */

export function Karta({
  children,
  className = "",
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-antracit-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${padding ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function Nadpis({ children, popis }: { children: ReactNode; popis?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight text-antracit-900">{children}</h1>
      {popis && <p className="mt-1 text-sm text-antracit-500">{popis}</p>}
    </div>
  );
}

const VARIANTY = {
  primar: "bg-antracit-900 text-white hover:bg-antracit-800 focus-visible:outline-antracit-900",
  sekundar: "bg-white text-antracit-800 border border-antracit-300 hover:bg-antracit-50",
  zlaty: "bg-zlata-500 text-white hover:bg-zlata-600 focus-visible:outline-zlata-600",
  nebezpecny: "bg-white text-red-700 border border-red-300 hover:bg-red-50",
  tichy: "text-antracit-600 hover:bg-antracit-100",
} as const;

type Variant = keyof typeof VARIANTY;

const ZAKLAD =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function Tlacidlo({
  children,
  variant = "primar",
  type = "button",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button type={type} className={`${ZAKLAD} ${VARIANTY[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Odkaz({
  children,
  href,
  variant = "sekundar",
  className = "",
}: {
  children: ReactNode;
  href: string;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link href={href} className={`${ZAKLAD} ${VARIANTY[variant]} ${className}`}>
      {children}
    </Link>
  );
}

const ODZNAKY: Record<string, string> = {
  sedy: "bg-antracit-100 text-antracit-700 ring-antracit-200",
  zelena: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  zlta: "bg-amber-50 text-amber-800 ring-amber-200",
  cervena: "bg-red-50 text-red-700 ring-red-200",
  modra: "bg-sky-50 text-sky-700 ring-sky-200",
  zlata: "bg-zlata-100 text-zlata-800 ring-zlata-200",
};

export function Odznak({ children, farba = "sedy" }: { children: ReactNode; farba?: keyof typeof ODZNAKY }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${ODZNAKY[farba]}`}
    >
      {children}
    </span>
  );
}

export function Pole({
  popis,
  chyba,
  napoveda,
  children,
}: {
  popis: string;
  chyba?: string;
  napoveda?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-antracit-700">{popis}</span>
      {children}
      {napoveda && !chyba && <span className="mt-1 block text-xs text-antracit-500">{napoveda}</span>}
      {chyba && <span className="mt-1 block text-xs text-red-600">{chyba}</span>}
    </label>
  );
}

export const vstupTriedy =
  "block w-full rounded-md border border-antracit-300 bg-white px-3 py-2 text-sm text-antracit-900 placeholder:text-antracit-400 focus:border-antracit-500 focus:outline-none focus:ring-2 focus:ring-antracit-200 disabled:bg-antracit-50";

export const Vstup = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Vstup(props, ref) {
    return <input ref={ref} {...props} className={`${vstupTriedy} ${props.className ?? ""}`} />;
  },
);

export function Vyber(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${vstupTriedy} ${props.className ?? ""}`} />;
}

export function TextovePole(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${vstupTriedy} ${props.className ?? ""}`} />;
}

export function Prazdne({ nadpis, popis, akcia }: { nadpis: string; popis?: string; akcia?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-antracit-300 bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-antracit-800">{nadpis}</p>
      {popis && <p className="mx-auto mt-1 max-w-md text-sm text-antracit-500">{popis}</p>}
      {akcia && <div className="mt-4 flex justify-center">{akcia}</div>}
    </div>
  );
}

export function Chyba({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      {children}
    </div>
  );
}

export function Uspech({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      {children}
    </div>
  );
}

export function Info({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{children}</div>
  );
}

export function Tabulka({ hlavicka, children }: { hlavicka: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-antracit-200 bg-white">
      <table className="min-w-full divide-y divide-antracit-200 text-sm">
        <thead className="bg-antracit-50">
          <tr>
            {hlavicka.map((h, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-antracit-500 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-antracit-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Statistika({
  popis,
  hodnota,
  detail,
  farba = "sedy",
}: {
  popis: string;
  hodnota: string;
  detail?: string;
  farba?: keyof typeof ODZNAKY;
}) {
  const akcent: Record<string, string> = {
    sedy: "text-antracit-900",
    zelena: "text-emerald-700",
    zlta: "text-amber-700",
    cervena: "text-red-700",
    modra: "text-sky-700",
    zlata: "text-zlata-600",
  };
  return (
    <Karta>
      <p className="text-xs font-medium uppercase tracking-wide text-antracit-500">{popis}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${akcent[farba]}`}>{hodnota}</p>
      {detail && <p className="mt-1 text-xs text-antracit-500">{detail}</p>}
    </Karta>
  );
}
