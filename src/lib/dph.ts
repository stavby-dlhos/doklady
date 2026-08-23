/**
 * DPH podľa slovenského zákona č. 222/2004 Z. z. o dani z pridanej hodnoty.
 *
 * Sadzby platné od 1. 1. 2025:
 *   23 % – základná sadzba
 *   19 % – znížená sadzba
 *    5 % – znížená sadzba
 *    0 % – oslobodené / prenos daňovej povinnosti / neplatiteľ
 *
 * Prenos daňovej povinnosti (§ 69 ods. 12 písm. j) sa uplatňuje na stavebné práce
 * medzi dvomi platiteľmi DPH v tuzemsku. Faktúra sa vystaví bez DPH a musí
 * obsahovať slovnú informáciu „prenesenie daňovej povinnosti".
 */

import { type Cents, percentOf, toCents } from "./money";

export const SADZBY_DPH = [23, 19, 5, 0] as const;
export type SadzbaDph = (typeof SADZBY_DPH)[number];

export const POZNAMKA_PRENOS_DPH =
  "Prenesenie daňovej povinnosti podľa § 69 ods. 12 písm. j) zákona č. 222/2004 Z. z. o DPH. Daň je povinný priznať a odviesť príjemca plnenia.";

export const POZNAMKA_NEPLATITEL = "Dodávateľ nie je platiteľom DPH.";

export interface PolozkaVstup {
  mnozstvo: number;
  cenaZaMj: number; // v eurách, môže mať 4 desatinné miesta
  zlavaPct?: number;
  sadzbaDph: number;
}

export interface PolozkaVypocet {
  zaklad: Cents;
  dph: Cents;
  spolu: Cents;
  sadzbaDph: number;
}

/**
 * Výpočet jednej položky.
 * Základ = množstvo × jednotková cena − zľava. DPH sa počíta z tohto základu.
 */
export function vypocitajPolozku(p: PolozkaVstup, prenosDph: boolean): PolozkaVypocet {
  // Jednotková cena môže mať 4 desatinné miesta (napr. 33,3333 €/m²). Na centy
  // sa zaokrúhľuje až súčin s množstvom – inak by sa pri veľkých výmerách
  // nazbieral rozdiel niekoľkých centov oproti ručnému prepočtu.
  const bezZlavy = toCents(p.mnozstvo * p.cenaZaMj);
  const zlava = percentOf(bezZlavy, p.zlavaPct ?? 0);
  const zaklad = bezZlavy - zlava;

  const sadzba = prenosDph ? 0 : normalizujSadzbu(p.sadzbaDph);
  const dph = percentOf(zaklad, sadzba);

  return { zaklad, dph, spolu: zaklad + dph, sadzbaDph: sadzba };
}

export function normalizujSadzbu(sadzba: number): SadzbaDph {
  const s = Math.round(sadzba);
  return (SADZBY_DPH as readonly number[]).includes(s) ? (s as SadzbaDph) : 23;
}

export interface RekapitulaciaDph {
  zaklad23: Cents;
  zaklad19: Cents;
  zaklad5: Cents;
  zaklad0: Cents;
  dph23: Cents;
  dph19: Cents;
  dph5: Cents;
  dphSpolu: Cents;
  sumaBezDph: Cents;
  sumaCelkom: Cents;
}

/**
 * Rekapitulácia DPH po sadzbách.
 *
 * Dôležité: DPH sa počíta zo súčtu základov v danej sadzbe, nie ako súčet DPH
 * jednotlivých položiek. Pri veľa položkách by inak vznikol rozdiel niekoľkých
 * centov oproti kontrolnému výkazu.
 */
export function vypocitajRekapitulaciu(polozky: PolozkaVypocet[], prenosDph: boolean): RekapitulaciaDph {
  const zaklady = { 23: 0, 19: 0, 5: 0, 0: 0 } as Record<number, Cents>;

  for (const p of polozky) {
    const sadzba = prenosDph ? 0 : p.sadzbaDph;
    zaklady[sadzba] = (zaklady[sadzba] ?? 0) + p.zaklad;
  }

  const dph23 = percentOf(zaklady[23], 23);
  const dph19 = percentOf(zaklady[19], 19);
  const dph5 = percentOf(zaklady[5], 5);
  const dphSpolu = dph23 + dph19 + dph5;
  const sumaBezDph = zaklady[23] + zaklady[19] + zaklady[5] + zaklady[0];

  return {
    zaklad23: zaklady[23],
    zaklad19: zaklady[19],
    zaklad5: zaklady[5],
    zaklad0: zaklady[0],
    dph23,
    dph19,
    dph5,
    dphSpolu,
    sumaBezDph,
    sumaCelkom: sumaBezDph + dphSpolu,
  };
}

/**
 * Rozpočítanie sumy s DPH späť na základ a daň – pre bločky, kde poznáme
 * len celkovú zaplatenú sumu. Základ = suma / (1 + sadzba/100).
 */
export function rozpocitajZCelkovej(sumaCelkom: Cents, sadzba: number): { zaklad: Cents; dph: Cents } {
  const s = normalizujSadzbu(sadzba);
  if (s === 0) return { zaklad: sumaCelkom, dph: 0 };
  const zaklad = Math.round(sumaCelkom / (1 + s / 100));
  return { zaklad, dph: sumaCelkom - zaklad };
}

/**
 * Má sa na faktúru uplatniť prenos daňovej povinnosti?
 * Podmienky: obe strany sú platitelia DPH, ide o tuzemsko a o stavebné práce.
 */
export function moznyPrenosDph(opts: {
  dodavatelPlatitelDph: boolean;
  odberatelPlatitelDph: boolean;
  odberatelKrajina: string;
}): boolean {
  return (
    opts.dodavatelPlatitelDph &&
    opts.odberatelPlatitelDph &&
    opts.odberatelKrajina.toUpperCase() === "SK"
  );
}
