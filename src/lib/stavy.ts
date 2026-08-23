/** Preklad stavov a číselníkov do slovenčiny + farby odznakov. */

export const STAV_DOKLADU: Record<string, { popis: string; farba: "sedy" | "zlta" | "zelena" | "cervena" | "modra" }> = {
  NOVY: { popis: "Nový", farba: "modra" },
  NA_SCHVALENIE: { popis: "Na schválenie", farba: "zlta" },
  SCHVALENY: { popis: "Schválený", farba: "zelena" },
  ZAMIETNUTY: { popis: "Zamietnutý", farba: "cervena" },
  ZAUCTOVANY: { popis: "Zaúčtovaný", farba: "sedy" },
};

export const STAV_FAKTURY: Record<string, { popis: string; farba: "sedy" | "zlta" | "zelena" | "cervena" | "modra" }> = {
  KONCEPT: { popis: "Koncept", farba: "sedy" },
  ODOSLANA: { popis: "Odoslaná", farba: "modra" },
  CIASTOCNE_UHRADENA: { popis: "Čiastočne uhradená", farba: "zlta" },
  UHRADENA: { popis: "Uhradená", farba: "zelena" },
  PO_SPLATNOSTI: { popis: "Po splatnosti", farba: "cervena" },
  STORNO: { popis: "Storno", farba: "sedy" },
};

export const TYP_DOKLADU: Record<string, string> = {
  BLOCEK: "Bloček",
  FAKTURA_PRIJATA: "Prijatá faktúra",
  POKLADNICNY_VYDAJ: "Pokladničný výdaj",
  INY: "Iný doklad",
};

export const KATEGORIA: Record<string, string> = {
  MATERIAL: "Materiál",
  PALIVO: "Palivo",
  NARADIE: "Náradie",
  SUBDODAVKA: "Subdodávka",
  SLUZBY: "Služby",
  REZIA: "Réžia",
  DOPRAVA: "Doprava",
  INE: "Iné",
};

export const ZDROJ: Record<string, string> = {
  RUCNE: "Ručne",
  EMAIL: "E-mail",
  MOBIL: "Mobil",
  API: "API",
};

export const TYP_FAKTURY: Record<string, string> = {
  BEZNA: "Faktúra",
  ZALOHOVA: "Zálohová faktúra",
  DOBROPIS: "Dobropis",
};

export const FORMA_UHRADY: Record<string, string> = {
  PREVOD: "Prevodom",
  HOTOVOST: "V hotovosti",
  KARTA: "Kartou",
  DOBIERKA: "Dobierkou",
};

export const STAV_ZAKAZKY: Record<string, { popis: string; farba: "sedy" | "zlta" | "zelena" | "cervena" | "modra" }> = {
  PRIPRAVA: { popis: "V príprave", farba: "sedy" },
  AKTIVNA: { popis: "Aktívna", farba: "zelena" },
  UKONCENA: { popis: "Ukončená", farba: "modra" },
  ZRUSENA: { popis: "Zrušená", farba: "cervena" },
};

export const MERNE_JEDNOTKY = ["ks", "m", "bm", "m2", "m3", "kg", "t", "hod", "deň", "kpl", "bal", "l"];

export function formatDatum(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "numeric", year: "numeric" }).format(date);
}

export function formatDatumCas(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Dátum pre <input type="date"> – vždy v lokálnom čase, nie UTC. */
export function naInputDatum(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const rok = date.getFullYear();
  const mesiac = String(date.getMonth() + 1).padStart(2, "0");
  const den = String(date.getDate()).padStart(2, "0");
  return `${rok}-${mesiac}-${den}`;
}

/** Reťazec z <input type="date"> na Date o 12:00 – aby posun časovej zóny neposunul deň. */
export function zInputDatumu(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dniDo(datum: Date | string): number {
  const d = typeof datum === "string" ? new Date(datum) : datum;
  const dnes = new Date();
  dnes.setHours(0, 0, 0, 0);
  const cielovy = new Date(d);
  cielovy.setHours(0, 0, 0, 0);
  return Math.round((cielovy.getTime() - dnes.getTime()) / 86_400_000);
}
