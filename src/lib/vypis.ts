import { XMLParser } from "fast-xml-parser";
import { toCents, type Cents } from "./money";

/**
 * Načítanie bankového výpisu.
 *
 * Podporované formáty:
 *   – SEPA camt.053 (XML) – vedia ho exportovať Tatra banka, SLSP, VÚB, ČSOB aj mBank
 *   – CSV – univerzálny parser, ktorý si sám nájde stĺpce podľa hlavičky
 *
 * Každý pohyb dostane stabilný `bankRef`. Ten je v databáze unikátny, takže
 * opakovaný import toho istého výpisu nevytvorí duplicity.
 */

export interface PohybVstup {
  datum: Date;
  suma: Cents; // vždy kladná, smer je v poli `smer`
  mena: string;
  smer: "PRICHOD" | "ODCHOD";
  protiucetIban?: string;
  protiucetNazov?: string;
  variabilnySymbol?: string;
  konstantnySymbol?: string;
  specifickySymbol?: string;
  popis?: string;
  bankRef: string;
}

export interface VysledokParsovania {
  pohyby: PohybVstup[];
  iban?: string;
  mena?: string;
  varovania: string[];
}

/** Uzol XML dokumentu – camt.053 sa parsuje dynamicky, bez generovaných typov. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyXml = any;

// ---------- camt.053 ----------

export function parsujCamt053(xml: string): VysledokParsovania {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    trimValues: true,
  });

  const doc: AnyXml = parser.parse(xml);
  const root: AnyXml = doc?.Document ?? doc;
  const stmtRaw = root?.BkToCstmrStmt?.Stmt;
  if (!stmtRaw) {
    throw new Error("Súbor nevyzerá ako výpis camt.053 – chýba element BkToCstmrStmt/Stmt.");
  }

  const vypisy = pole<AnyXml>(stmtRaw);
  const pohyby: PohybVstup[] = [];
  const varovania: string[] = [];
  let iban: string | undefined;
  let mena: string | undefined;

  for (const stmt of vypisy) {
    iban ??= stmt?.Acct?.Id?.IBAN;
    mena ??= stmt?.Acct?.Ccy;

    for (const ntry of pole<AnyXml>(stmt?.Ntry)) {
      // Nezaúčtované položky preskakujeme – ešte sa môžu zmeniť alebo zrušiť.
      const stav = typeof ntry?.Sts === "string" ? ntry.Sts : ntry?.Sts?.Cd;
      if (stav && stav !== "BOOK") continue;

      const suma = toCents(ntry?.Amt?.["#text"] ?? ntry?.Amt);
      const ccy = ntry?.Amt?.["@_Ccy"] ?? mena ?? "EUR";
      const smer: PohybVstup["smer"] = ntry?.CdtDbtInd === "CRDT" ? "PRICHOD" : "ODCHOD";
      const datumTxt = ntry?.BookgDt?.Dt ?? ntry?.BookgDt?.DtTm ?? ntry?.ValDt?.Dt ?? ntry?.ValDt?.DtTm;
      const datum = datumTxt ? new Date(datumTxt) : null;

      if (!datum || Number.isNaN(datum.getTime())) {
        varovania.push(`Preskočený pohyb bez použiteľného dátumu (suma ${suma / 100}).`);
        continue;
      }

      // XML príde bez typov – prechádzame ho ako voľnú štruktúru.
      const detaily = pole<AnyXml>(ntry?.NtryDtls).flatMap((d) => pole<AnyXml>(d?.TxDtls));
      const d0: AnyXml = detaily[0] ?? {};

      const strana = smer === "PRICHOD" ? d0?.RltdPties?.Dbtr : d0?.RltdPties?.Cdtr;
      const ucet = smer === "PRICHOD" ? d0?.RltdPties?.DbtrAcct : d0?.RltdPties?.CdtrAcct;

      const strukt: AnyXml = pole<AnyXml>(d0?.RmtInf?.Strd)[0];
      const referencia =
        strukt?.CdtrRefInf?.Ref ??
        d0?.Refs?.EndToEndId ??
        (Array.isArray(d0?.RmtInf?.Ustrd) ? d0.RmtInf.Ustrd.join(" ") : d0?.RmtInf?.Ustrd);

      const symboly = rozobrSymboly(String(referencia ?? ""));
      const popis =
        (Array.isArray(d0?.RmtInf?.Ustrd) ? d0.RmtInf.Ustrd.join(" ") : d0?.RmtInf?.Ustrd) ??
        ntry?.AddtlNtryInf ??
        undefined;

      const bankRef =
        ntry?.AcctSvcrRef ??
        d0?.Refs?.AcctSvcrRef ??
        d0?.Refs?.TxId ??
        `${datum.toISOString().slice(0, 10)}|${suma}|${smer}|${symboly.vs ?? ""}|${(popis ?? "").slice(0, 40)}`;

      pohyby.push({
        datum,
        suma: Math.abs(suma),
        mena: ccy,
        smer,
        protiucetIban: ucet?.Id?.IBAN,
        protiucetNazov: strana?.Nm ?? strana?.Pty?.Nm,
        variabilnySymbol: symboly.vs,
        konstantnySymbol: symboly.ks,
        specifickySymbol: symboly.ss,
        popis: popis ? String(popis).slice(0, 500) : undefined,
        bankRef: String(bankRef),
      });
    }
  }

  return { pohyby, iban, mena, varovania };
}

/**
 * Slovenské banky posielajú symboly zlepené v referencii, napr.
 * "/VS0012345678/SS0000000000/KS0308". Toto ich rozoberie.
 */
function rozobrSymboly(ref: string): { vs?: string; ks?: string; ss?: string } {
  const vycisti = (s?: string) => {
    const c = (s ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    return c.length ? c : undefined;
  };
  const vs = ref.match(/\/VS(\d+)/i)?.[1];
  const ks = ref.match(/\/KS(\d+)/i)?.[1];
  const ss = ref.match(/\/SS(\d+)/i)?.[1];

  if (vs || ks || ss) return { vs: vycisti(vs), ks: vycisti(ks), ss: vycisti(ss) };

  // Ak nie sú prefixy, referencia je pravdepodobne priamo variabilný symbol.
  const holy = ref.trim();
  if (/^\d{1,10}$/.test(holy)) return { vs: vycisti(holy) };
  return {};
}

// ---------- CSV ----------

const STLPCE: Record<string, string[]> = {
  datum: ["datum", "dátum", "datum zauctovania", "dátum zaúčtovania", "date", "booking date", "datum splatnosti"],
  suma: ["suma", "ciastka", "čiastka", "amount", "obrat", "suma v mene uctu", "suma v mene účtu"],
  mena: ["mena", "currency", "ccy"],
  vs: ["vs", "variabilny symbol", "variabilný symbol", "variable symbol"],
  ks: ["ks", "konstantny symbol", "konštantný symbol"],
  ss: ["ss", "specificky symbol", "špecifický symbol"],
  protiucet: ["protiucet", "protiúčet", "iban protistrany", "counterparty iban", "ucet protistrany"],
  nazov: ["nazov protistrany", "názov protistrany", "partner", "counterparty", "prijemca", "príjemca", "odosielatel"],
  popis: ["popis", "poznamka", "poznámka", "sprava pre prijemcu", "správa pre príjemcu", "description", "detail"],
  ref: ["referencia", "reference", "id transakcie", "transaction id"],
};

export function parsujCsv(text: string): VysledokParsovania {
  const cistyText = text.replace(/^\ufeff/, "");
  const oddelovac = zistiOddelovac(cistyText);
  const riadky = rozdelCsv(cistyText, oddelovac).filter((r) => r.some((b) => b.trim() !== ""));

  if (riadky.length < 2) throw new Error("CSV neobsahuje žiadne dátové riadky.");

  const hlavicka = riadky[0].map((h) => normalizuj(h));
  const index: Record<string, number> = {};
  for (const [kluc, varianty] of Object.entries(STLPCE)) {
    const i = hlavicka.findIndex((h) => varianty.includes(h));
    if (i >= 0) index[kluc] = i;
  }

  if (index.datum === undefined || index.suma === undefined) {
    throw new Error(
      `V CSV sa nepodarilo nájsť stĺpce s dátumom a sumou. Nájdené stĺpce: ${hlavicka.join(", ")}`,
    );
  }

  const pohyby: PohybVstup[] = [];
  const varovania: string[] = [];

  for (let i = 1; i < riadky.length; i++) {
    const r = riadky[i];
    const hodnota = (kluc: string) => (index[kluc] !== undefined ? (r[index[kluc]] ?? "").trim() : "");

    const datum = parsujDatum(hodnota("datum"));
    if (!datum) {
      varovania.push(`Riadok ${i + 1}: nečitateľný dátum „${hodnota("datum")}" – preskočené.`);
      continue;
    }

    const sumaCents = toCents(normalizujCislo(hodnota("suma")));
    if (sumaCents === 0) {
      varovania.push(`Riadok ${i + 1}: nulová alebo nečitateľná suma – preskočené.`);
      continue;
    }

    const cisla = (s: string) => {
      const c = s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
      return c.length ? c : undefined;
    };

    const bankRef =
      hodnota("ref") ||
      `${datum.toISOString().slice(0, 10)}|${sumaCents}|${hodnota("vs")}|${hodnota("popis").slice(0, 40)}`;

    pohyby.push({
      datum,
      suma: Math.abs(sumaCents),
      mena: hodnota("mena") || "EUR",
      smer: sumaCents >= 0 ? "PRICHOD" : "ODCHOD",
      protiucetIban: hodnota("protiucet").replace(/\s/g, "").toUpperCase() || undefined,
      protiucetNazov: hodnota("nazov") || undefined,
      variabilnySymbol: cisla(hodnota("vs")),
      konstantnySymbol: cisla(hodnota("ks")),
      specifickySymbol: cisla(hodnota("ss")),
      popis: hodnota("popis").slice(0, 500) || undefined,
      bankRef,
    });
  }

  return { pohyby, varovania };
}

function zistiOddelovac(text: string): string {
  const prvyRiadok = text.split(/\r?\n/)[0] ?? "";
  const kandidati = [";", ",", "\t", "|"];
  let najlepsi = ";";
  let max = 0;
  for (const k of kandidati) {
    const pocet = prvyRiadok.split(k).length - 1;
    if (pocet > max) {
      max = pocet;
      najlepsi = k;
    }
  }
  return najlepsi;
}

/** Vlastný CSV parser – zvláda úvodzovky aj zalomenia riadkov vnútri polí. */
function rozdelCsv(text: string, oddelovac: string): string[][] {
  const riadky: string[][] = [];
  let pole: string[] = [];
  let bunka = "";
  let vUvodzovkach = false;

  for (let i = 0; i < text.length; i++) {
    const z = text[i];

    if (vUvodzovkach) {
      if (z === '"') {
        if (text[i + 1] === '"') {
          bunka += '"';
          i++;
        } else {
          vUvodzovkach = false;
        }
      } else {
        bunka += z;
      }
      continue;
    }

    if (z === '"') {
      vUvodzovkach = true;
    } else if (z === oddelovac) {
      pole.push(bunka);
      bunka = "";
    } else if (z === "\n") {
      pole.push(bunka);
      riadky.push(pole);
      pole = [];
      bunka = "";
    } else if (z === "\r") {
      // ignorujeme, spracuje sa pri \n
    } else {
      bunka += z;
    }
  }

  if (bunka !== "" || pole.length) {
    pole.push(bunka);
    riadky.push(pole);
  }

  return riadky;
}

function normalizuj(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "1 234,56" | "-1,234.56" | "1234.56" -> "1234.56" */
export function normalizujCislo(s: string): string {
  let t = s.replace(/[\s\u00a0]/g, "").replace(/[^\d.,+-]/g, "");
  if (!t) return "0";

  const poslednaCiarka = t.lastIndexOf(",");
  const poslednaBodka = t.lastIndexOf(".");

  if (poslednaCiarka > poslednaBodka) {
    // slovenský formát: bodka = tisíce, čiarka = desatiny
    t = t.replace(/\./g, "").replace(",", ".");
  } else {
    // anglický formát: čiarka = tisíce
    t = t.replace(/,/g, "");
  }
  return t;
}

export function parsujDatum(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;

  // DD.MM.RRRR alebo D. M. RRRR
  const sk = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (sk) return bezpecnyDatum(Number(sk[3]), Number(sk[2]), Number(sk[1]));

  // RRRR-MM-DD
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return bezpecnyDatum(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // DD/MM/RRRR
  const lom = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (lom) return bezpecnyDatum(Number(lom[3]), Number(lom[2]), Number(lom[1]));

  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bezpecnyDatum(rok: number, mesiac: number, den: number): Date | null {
  if (mesiac < 1 || mesiac > 12 || den < 1 || den > 31) return null;
  const d = new Date(Date.UTC(rok, mesiac - 1, den, 12, 0, 0));
  return d.getUTCMonth() === mesiac - 1 && d.getUTCDate() === den ? d : null;
}

function pole<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

/** Rozpozná formát podľa obsahu a zavolá správny parser. */
export function parsujVypis(obsah: string, nazovSuboru: string): VysledokParsovania {
  const zaciatok = obsah.slice(0, 800);
  if (zaciatok.includes("<?xml") || zaciatok.includes("BkToCstmrStmt") || nazovSuboru.toLowerCase().endsWith(".xml")) {
    return parsujCamt053(obsah);
  }
  return parsujCsv(obsah);
}
