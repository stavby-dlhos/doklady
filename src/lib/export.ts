import archiver from "archiver";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { PassThrough } from "stream";
import { db } from "@/db";
import { faktury, fakturaPolozky, prijateDoklady, partneri, zakazky } from "@/db/schema";
import { nacitajSubor } from "./storage";
import { formatSuma, toCents } from "./money";

/**
 * Export podkladov pre účtovníčku.
 *
 * Vytvorí ZIP, v ktorom je:
 *   – prijate-doklady.csv      – zoznam nákladov
 *   – vystavene-faktury.csv    – zoznam tržieb
 *   – rekapitulacia-dph.csv    – podklad pre daňové priznanie a kontrolný výkaz
 *   – skeny/                   – originálne súbory dokladov
 *
 * CSV je v kódovaní UTF-8 s BOM a s bodkočiarkou ako oddeľovačom, aby sa
 * slovenský Excel otvoril správne aj s diakritikou.
 */

const BOM = "\ufeff";

function csv(riadky: (string | number | null | undefined)[][]): string {
  return (
    BOM +
    riadky
      .map((r) =>
        r
          .map((b) => {
            const s = b === null || b === undefined ? "" : String(b);
            return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(";"),
      )
      .join("\r\n")
  );
}

function d(date: Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("sk-SK", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** Suma pre Excel – čiarka ako desatinný oddeľovač, bez oddeľovača tisícov. */
function sumaExcel(hodnota: string | null | undefined): string {
  return (hodnota ?? "0").replace(".", ",");
}

export interface ExportVstup {
  od: Date;
  do: Date;
  zahrnutSkeny: boolean;
  lenSchvalene: boolean;
}

export interface ExportVysledok {
  zip: Buffer;
  pocetDokladov: number;
  pocetFaktur: number;
  nazovSuboru: string;
}

export async function pripravExport(v: ExportVstup): Promise<ExportVysledok> {
  const stavy = v.lenSchvalene
    ? (["SCHVALENY", "ZAUCTOVANY"] as const)
    : (["NOVY", "NA_SCHVALENIE", "SCHVALENY", "ZAUCTOVANY"] as const);

  const doklady = await db
    .select({
      d: prijateDoklady,
      dodavatel: partneri,
      zakazka: zakazky,
    })
    .from(prijateDoklady)
    .leftJoin(partneri, eq(prijateDoklady.dodavatelId, partneri.id))
    .leftJoin(zakazky, eq(prijateDoklady.zakazkaId, zakazky.id))
    .where(
      and(
        gte(prijateDoklady.datumVystavenia, v.od),
        lte(prijateDoklady.datumVystavenia, v.do),
        inArray(prijateDoklady.stav, [...stavy]),
      ),
    )
    .orderBy(prijateDoklady.datumVystavenia);

  const vystavene = await db
    .select({ f: faktury, odberatel: partneri, zakazka: zakazky })
    .from(faktury)
    .leftJoin(partneri, eq(faktury.odberatelId, partneri.id))
    .leftJoin(zakazky, eq(faktury.zakazkaId, zakazky.id))
    .where(
      and(
        gte(faktury.datumVystavenia, v.od),
        lte(faktury.datumVystavenia, v.do),
        inArray(faktury.stav, ["ODOSLANA", "CIASTOCNE_UHRADENA", "UHRADENA", "PO_SPLATNOSTI"]),
      ),
    )
    .orderBy(faktury.cislo);

  const idFaktur = vystavene.map((x) => x.f.id);
  const polozky = idFaktur.length
    ? await db.select().from(fakturaPolozky).where(inArray(fakturaPolozky.fakturaId, idFaktur))
    : [];

  // ---- CSV: prijaté doklady ----
  const csvDoklady = csv([
    [
      "Dátum vystavenia",
      "Typ",
      "Číslo dokladu",
      "Dodávateľ",
      "IČO",
      "IČ DPH",
      "Kategória",
      "Zákazka",
      "Základ dane",
      "Sadzba DPH",
      "DPH",
      "Celkom",
      "Mena",
      "Prenos DPH",
      "VS",
      "Splatnosť",
      "Uhradené dňa",
      "Stav",
      "Popis",
      "Súbor",
    ],
    ...doklady.map((x) => [
      d(x.d.datumVystavenia),
      x.d.typ,
      x.d.cisloDokladu,
      x.dodavatel?.nazov,
      x.dodavatel?.ico,
      x.dodavatel?.icDph,
      x.d.kategoria,
      x.zakazka ? `${x.zakazka.kod} ${x.zakazka.nazov}` : "",
      sumaExcel(x.d.zakladDph),
      x.d.prenosDph ? "PDP" : `${x.d.sadzbaDph} %`,
      sumaExcel(x.d.sumaDph),
      sumaExcel(x.d.sumaCelkom),
      x.d.mena,
      x.d.prenosDph ? "áno" : "nie",
      x.d.variabilnySymbol,
      d(x.d.datumSplatnosti),
      d(x.d.uhradenyDna),
      x.d.stav,
      x.d.popis,
      x.d.suborNazov,
    ]),
  ]);

  // ---- CSV: vystavené faktúry ----
  const csvFaktury = csv([
    [
      "Číslo faktúry",
      "Dátum vystavenia",
      "Dátum dodania",
      "Splatnosť",
      "Odberateľ",
      "IČO",
      "IČ DPH",
      "Zákazka",
      "Základ 23 %",
      "DPH 23 %",
      "Základ 19 %",
      "DPH 19 %",
      "Základ 5 %",
      "DPH 5 %",
      "Základ 0 %",
      "Základ spolu",
      "DPH spolu",
      "Celkom",
      "Mena",
      "Prenos DPH",
      "VS",
      "Stav",
      "Uhradené",
      "Uhradená dňa",
    ],
    ...vystavene.map((x) => [
      x.f.cislo,
      d(x.f.datumVystavenia),
      d(x.f.datumDodania),
      d(x.f.datumSplatnosti),
      x.odberatel?.nazov,
      x.odberatel?.ico,
      x.odberatel?.icDph,
      x.zakazka ? `${x.zakazka.kod} ${x.zakazka.nazov}` : "",
      sumaExcel(x.f.zaklad23),
      sumaExcel(x.f.dph23),
      sumaExcel(x.f.zaklad19),
      sumaExcel(x.f.dph19),
      sumaExcel(x.f.zaklad5),
      sumaExcel(x.f.dph5),
      sumaExcel(x.f.zaklad0),
      sumaExcel(x.f.sumaBezDph),
      sumaExcel(x.f.dphSpolu),
      sumaExcel(x.f.sumaCelkom),
      x.f.mena,
      x.f.prenosDph ? "áno" : "nie",
      x.f.variabilnySymbol,
      x.f.stav,
      sumaExcel(x.f.uhradene),
      d(x.f.uhradenaDna),
    ]),
  ]);

  // ---- CSV: položky faktúr ----
  const mapaFaktur = new Map(vystavene.map((x) => [x.f.id, x.f.cislo]));
  const csvPolozky = csv([
    ["Číslo faktúry", "Skupina", "Položka", "Popis", "Množstvo", "MJ", "Cena/MJ", "Sadzba DPH", "Základ", "DPH", "Spolu"],
    ...polozky
      .sort((a, b) => (mapaFaktur.get(a.fakturaId) ?? "").localeCompare(mapaFaktur.get(b.fakturaId) ?? "") || a.poradie - b.poradie)
      .map((p) => [
        mapaFaktur.get(p.fakturaId),
        p.skupina,
        p.nazov,
        p.popis,
        sumaExcel(p.mnozstvo),
        p.mj,
        sumaExcel(p.cenaZaMj),
        `${p.sadzbaDph} %`,
        sumaExcel(p.zaklad),
        sumaExcel(p.dph),
        sumaExcel(p.spolu),
      ]),
  ]);

  // ---- CSV: rekapitulácia DPH ----
  const naVystupe = {
    zaklad23: vystavene.reduce((s, x) => s + toCents(x.f.zaklad23), 0),
    dph23: vystavene.reduce((s, x) => s + toCents(x.f.dph23), 0),
    zaklad19: vystavene.reduce((s, x) => s + toCents(x.f.zaklad19), 0),
    dph19: vystavene.reduce((s, x) => s + toCents(x.f.dph19), 0),
    zaklad5: vystavene.reduce((s, x) => s + toCents(x.f.zaklad5), 0),
    dph5: vystavene.reduce((s, x) => s + toCents(x.f.dph5), 0),
    zaklad0: vystavene.reduce((s, x) => s + toCents(x.f.zaklad0), 0),
  };

  const naVstupe = doklady.reduce(
    (acc, x) => {
      acc.zaklad += toCents(x.d.zakladDph);
      acc.dph += toCents(x.d.sumaDph);
      return acc;
    },
    { zaklad: 0, dph: 0 },
  );

  const dphNaVystupe = naVystupe.dph23 + naVystupe.dph19 + naVystupe.dph5;

  const csvRekapitulacia = csv([
    ["Rekapitulácia DPH", `${d(v.od)} – ${d(v.do)}`],
    [],
    ["DAŇ NA VÝSTUPE (vystavené faktúry)"],
    ["Sadzba", "Základ dane", "DPH"],
    ["23 %", sumaExcel(String(naVystupe.zaklad23 / 100)), sumaExcel(String(naVystupe.dph23 / 100))],
    ["19 %", sumaExcel(String(naVystupe.zaklad19 / 100)), sumaExcel(String(naVystupe.dph19 / 100))],
    ["5 %", sumaExcel(String(naVystupe.zaklad5 / 100)), sumaExcel(String(naVystupe.dph5 / 100))],
    ["0 % / prenos DPH", sumaExcel(String(naVystupe.zaklad0 / 100)), "0,00"],
    ["Spolu", "", sumaExcel(String(dphNaVystupe / 100))],
    [],
    ["DAŇ NA VSTUPE (prijaté doklady)"],
    ["Základ dane", sumaExcel(String(naVstupe.zaklad / 100))],
    ["DPH", sumaExcel(String(naVstupe.dph / 100))],
    [],
    ["VLASTNÁ DAŇOVÁ POVINNOSŤ / NADMERNÝ ODPOČET"],
    ["Rozdiel", sumaExcel(String((dphNaVystupe - naVstupe.dph) / 100))],
    [],
    ["Poznámka", "Podklad pre účtovníčku. Nenahrádza daňové priznanie ani kontrolný výkaz."],
  ]);

  // ---- ZIP ----
  const archiv = archiver("zip", { zlib: { level: 6 } });
  const vystup = new PassThrough();
  const casti: Buffer[] = [];
  vystup.on("data", (c: Buffer) => casti.push(c));
  const hotovo = new Promise<void>((res, rej) => {
    vystup.on("end", res);
    vystup.on("error", rej);
    archiv.on("error", rej);
  });
  archiv.pipe(vystup);

  archiv.append(csvDoklady, { name: "prijate-doklady.csv" });
  archiv.append(csvFaktury, { name: "vystavene-faktury.csv" });
  archiv.append(csvPolozky, { name: "polozky-faktur.csv" });
  archiv.append(csvRekapitulacia, { name: "rekapitulacia-dph.csv" });

  if (v.zahrnutSkeny) {
    for (const x of doklady) {
      if (!x.d.suborUrl) continue;
      try {
        const data = await nacitajSubor(x.d.suborUrl);
        const nazov = `${d(x.d.datumVystavenia).replace(/\./g, "-")}_${x.d.cisloDokladu ?? x.d.id}_${x.d.suborNazov ?? "doklad"}`;
        archiv.append(data, { name: `skeny/${nazov}` });
      } catch {
        // chýbajúci sken nemá zastaviť celý export
      }
    }
  }

  await archiv.finalize();
  await hotovo;

  const nazovSuboru = `doklady-export-${v.od.toISOString().slice(0, 10)}_${v.do.toISOString().slice(0, 10)}.zip`;

  return {
    zip: Buffer.concat(casti),
    pocetDokladov: doklady.length,
    pocetFaktur: vystavene.length,
    nazovSuboru,
  };
}

/** Krátky textový súhrn pre obrazovku. */
export function popisExportu(pocetDokladov: number, pocetFaktur: number, sumaNakladov: number): string {
  return `${pocetDokladov} prijatých dokladov, ${pocetFaktur} vystavených faktúr, náklady ${formatSuma(sumaNakladov)} €`;
}
