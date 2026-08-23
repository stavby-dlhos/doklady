/**
 * Peňažná aritmetika v celých centoch.
 *
 * Desatinné čísla v JavaScripte nie sú presné (0.1 + 0.2 !== 0.3), takže každý
 * výpočet prebieha v centoch ako celé číslo a na eurá sa prevádza až na konci.
 * Toto je jediné miesto, kde sa v systéme zaokrúhľuje.
 */

export type Cents = number;

/** Zaokrúhlenie na najbližšie celé číslo, polovica vždy nahor (matematické). */
function roundHalfUp(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

/** "12.34" | 12.34 -> 1234 */
export function toCents(value: string | number | null | undefined): Cents {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "string" ? parseFloat(value.replace(",", ".")) : value;
  if (!Number.isFinite(n)) return 0;
  return roundHalfUp(n * 100);
}

/** 1234 -> 12.34 */
export function fromCents(cents: Cents): number {
  return roundHalfUp(cents) / 100;
}

/** 1234 -> "12.34" (formát pre databázu, bodka ako oddeľovač) */
export function centsToDb(cents: Cents): string {
  return (roundHalfUp(cents) / 100).toFixed(2);
}

/** 1234 -> "12,34 €" (formát pre používateľa) */
export function formatEur(cents: Cents, mena = "EUR"): string {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: mena,
    minimumFractionDigits: 2,
  }).format(fromCents(cents));
}

/** 1234 -> "12,34" bez meny */
export function formatSuma(cents: Cents): string {
  return new Intl.NumberFormat("sk-SK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromCents(cents));
}

export function formatMnozstvo(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("sk-SK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Násobenie centov množstvom (desatinné číslo), s korektným zaokrúhlením. */
export function multiplyCents(cents: Cents, factor: number): Cents {
  return roundHalfUp(cents * factor);
}

/** Percentuálna časť sumy. percent = 23 znamená 23 %. */
export function percentOf(cents: Cents, percent: number): Cents {
  return roundHalfUp((cents * percent) / 100);
}
