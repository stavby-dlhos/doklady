/**
 * Kontrola výpočtov. Spustenie: npx tsx scripts/test-vypocty.ts
 *
 * Testujú sa miesta, kde by chyba znamenala nesprávne čísla v účtovníctve:
 * zaokrúhľovanie, DPH, rekapitulácia po sadzbách a parsovanie výpisov.
 */
import "dotenv/config";
import { toCents, centsToDb, fromCents, formatSuma } from "../src/lib/money";
import { vypocitajPolozku, vypocitajRekapitulaciu, rozpocitajZCelkovej, normalizujSadzbu } from "../src/lib/dph";
import { parsujCsv, parsujCamt053, normalizujCislo, parsujDatum } from "../src/lib/vypis";
import { vsZCisla } from "../src/lib/cisla";

let prebehlo = 0;
let zlyhalo = 0;

function ok(popis: string, skutocnost: unknown, ocakavanie: unknown) {
  prebehlo++;
  const a = JSON.stringify(skutocnost);
  const b = JSON.stringify(ocakavanie);
  if (a === b) {
    console.log(`  ✓ ${popis}`);
  } else {
    zlyhalo++;
    console.log(`  ✗ ${popis}\n      očakávané: ${b}\n      skutočné:  ${a}`);
  }
}

console.log("\nPeňažná aritmetika");
ok("0.1 + 0.2 v centoch", toCents(0.1) + toCents(0.2), 30);
ok("desatinná čiarka", toCents("12,34"), 1234);
ok("desatinná bodka", toCents("12.34"), 1234);
ok("zaokrúhlenie nahor", toCents(12.345), 1235);
ok("zaokrúhlenie nadol", toCents(12.344), 1234);
ok("záporná suma", toCents(-12.35), -1235);
ok("prázdny vstup", toCents(""), 0);
ok("null", toCents(null), 0);
ok("nezmysel", toCents("abc"), 0);
ok("do formátu DB", centsToDb(1234), "1234.00".slice(0, 4) + ".00" === "1234.00" ? "12.34" : "12.34");
ok("späť na eurá", fromCents(1234), 12.34);
ok("veľká suma", toCents("1234567.89"), 123456789);

console.log("\nDPH – jedna položka");
{
  const p = vypocitajPolozku({ mnozstvo: 1, cenaZaMj: 100, sadzbaDph: 23 }, false);
  ok("100 € pri 23 %", [p.zaklad, p.dph, p.spolu], [10000, 2300, 12300]);
}
{
  const p = vypocitajPolozku({ mnozstvo: 186.5, cenaZaMj: 38, sadzbaDph: 23 }, false);
  ok("186,5 m² × 38 €", [p.zaklad, p.dph, p.spolu], [708700, 163001, 871701]);
}
{
  const p = vypocitajPolozku({ mnozstvo: 3, cenaZaMj: 33.333, sadzbaDph: 23 }, false);
  ok("cena so 4 desatinnými", [p.zaklad, p.dph], [10000, 2300]);
}
{
  const p = vypocitajPolozku({ mnozstvo: 1, cenaZaMj: 100, zlavaPct: 10, sadzbaDph: 23 }, false);
  ok("zľava 10 %", [p.zaklad, p.dph, p.spolu], [9000, 2070, 11070]);
}
{
  const p = vypocitajPolozku({ mnozstvo: 1, cenaZaMj: 100, sadzbaDph: 23 }, true);
  ok("prenos daňovej povinnosti", [p.zaklad, p.dph, p.sadzbaDph], [10000, 0, 0]);
}
{
  const p = vypocitajPolozku({ mnozstvo: 1, cenaZaMj: 100, sadzbaDph: 5 }, false);
  ok("znížená sadzba 5 %", [p.zaklad, p.dph], [10000, 500]);
}

console.log("\nDPH – rekapitulácia");
{
  // Tri položky po 0,10 € pri 23 %: DPH z každej je 0,023 → zaokrúhlene 0,02.
  // Súčet po položkách by dal 0,06, ale správne je DPH zo súčtu 0,30 = 0,07.
  const polozky = [1, 2, 3].map(() => vypocitajPolozku({ mnozstvo: 1, cenaZaMj: 0.1, sadzbaDph: 23 }, false));
  const r = vypocitajRekapitulaciu(polozky, false);
  ok("DPH sa počíta zo súčtu základov", [r.zaklad23, r.dph23, r.sumaCelkom], [30, 7, 37]);
}
{
  const polozky = [
    vypocitajPolozku({ mnozstvo: 1, cenaZaMj: 100, sadzbaDph: 23 }, false),
    vypocitajPolozku({ mnozstvo: 1, cenaZaMj: 200, sadzbaDph: 5 }, false),
  ];
  const r = vypocitajRekapitulaciu(polozky, false);
  ok("dve sadzby vedľa seba", [r.zaklad23, r.dph23, r.zaklad5, r.dph5, r.sumaCelkom], [10000, 2300, 20000, 1000, 33300]);
}
{
  const polozky = [vypocitajPolozku({ mnozstvo: 1, cenaZaMj: 1000, sadzbaDph: 23 }, true)];
  const r = vypocitajRekapitulaciu(polozky, true);
  ok("PDP: celá suma v základe 0 %", [r.zaklad0, r.dphSpolu, r.sumaCelkom], [100000, 0, 100000]);
}

console.log("\nRozpočítanie sumy z bločku");
{
  const r = rozpocitajZCelkovej(12300, 23);
  ok("123 € s 23 % späť na základ", [r.zaklad, r.dph, r.zaklad + r.dph], [10000, 2300, 12300]);
}
{
  const r = rozpocitajZCelkovej(1999, 23);
  ok("19,99 € – súčet musí sedieť", r.zaklad + r.dph, 1999);
}
{
  const r = rozpocitajZCelkovej(5000, 0);
  ok("nulová sadzba", [r.zaklad, r.dph], [5000, 0]);
}
ok("neznáma sadzba spadne na 23", normalizujSadzbu(21), 23);
ok("platná sadzba ostane", normalizujSadzbu(5), 5);

console.log("\nVariabilný symbol");
ok("z čísla faktúry", vsZCisla("20260012"), "20260012");
ok("s predponou", vsZCisla("Z20260012"), "20260012");
ok("dlhé číslo sa oreže na 10", vsZCisla("12345678901234").length, 10);

console.log("\nParsovanie čísel a dátumov");
ok("slovenský formát", normalizujCislo("1 234,56"), "1234.56");
ok("anglický formát", normalizujCislo("1,234.56"), "1234.56");
ok("záporné", normalizujCislo("-1 234,56"), "-1234.56");
ok("s menou", normalizujCislo("1234,56 EUR"), "1234.56");
ok("dátum DD.MM.RRRR", parsujDatum("15.3.2026")?.toISOString().slice(0, 10), "2026-03-15");
ok("dátum s medzerami", parsujDatum("1. 12. 2026")?.toISOString().slice(0, 10), "2026-12-01");
ok("dátum ISO", parsujDatum("2026-03-15")?.toISOString().slice(0, 10), "2026-03-15");
ok("neplatný dátum", parsujDatum("32.13.2026"), null);
ok("prázdny dátum", parsujDatum(""), null);

console.log("\nBankový výpis – CSV");
{
  const csv = [
    "Dátum;Suma;Mena;Variabilný symbol;Názov protistrany;Popis",
    "15.03.2026;1 234,56;EUR;20260012;Novák s.r.o.;Úhrada faktúry",
    "16.03.2026;-450,00;EUR;778899;Stavebniny;Nákup materiálu",
  ].join("\n");
  const v = parsujCsv(csv);
  ok("počet pohybov", v.pohyby.length, 2);
  ok("príchod", [v.pohyby[0].smer, v.pohyby[0].suma, v.pohyby[0].variabilnySymbol], ["PRICHOD", 123456, "20260012"]);
  ok("odchod má kladnú sumu a smer ODCHOD", [v.pohyby[1].smer, v.pohyby[1].suma], ["ODCHOD", 45000]);
  ok("rôzne bankRef", v.pohyby[0].bankRef !== v.pohyby[1].bankRef, true);
}
{
  const csv = 'Datum,Amount,VS\n"15.03.2026","100.00","123"';
  const v = parsujCsv(csv);
  ok("čiarka ako oddeľovač a úvodzovky", [v.pohyby.length, v.pohyby[0].suma], [1, 10000]);
}

console.log("\nBankový výpis – camt.053");
{
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt><Stmt>
  <Acct><Id><IBAN>SK8209000000000011424060</IBAN></Id><Ccy>EUR</Ccy></Acct>
  <Ntry>
    <Amt Ccy="EUR">1234.56</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-03-15</Dt></BookgDt><AcctSvcrRef>TX0001</AcctSvcrRef>
    <NtryDtls><TxDtls>
      <RltdPties><Dbtr><Nm>Novák s.r.o.</Nm></Dbtr><DbtrAcct><Id><IBAN>SK1111111111111111111111</IBAN></Id></DbtrAcct></RltdPties>
      <RmtInf><Strd><CdtrRefInf><Ref>/VS0020260012/SS0000000000/KS0308</Ref></CdtrRefInf></Strd></RmtInf>
    </TxDtls></NtryDtls>
  </Ntry>
  <Ntry>
    <Amt Ccy="EUR">450.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-03-16</Dt></BookgDt><AcctSvcrRef>TX0002</AcctSvcrRef>
  </Ntry>
  <Ntry>
    <Amt Ccy="EUR">99.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>PDNG</Sts>
    <BookgDt><Dt>2026-03-17</Dt></BookgDt><AcctSvcrRef>TX0003</AcctSvcrRef>
  </Ntry>
 </Stmt></BkToCstmrStmt>
</Document>`;
  const v = parsujCamt053(xml);
  ok("nezaúčtovaný pohyb sa preskočí", v.pohyby.length, 2);
  ok("IBAN účtu", v.iban, "SK8209000000000011424060");
  ok("suma a smer", [v.pohyby[0].suma, v.pohyby[0].smer], [123456, "PRICHOD"]);
  ok("VS zo zlepenej referencie", v.pohyby[0].variabilnySymbol, "20260012");
  ok("KS zo zlepenej referencie", v.pohyby[0].konstantnySymbol, "308");
  ok("názov protistrany", v.pohyby[0].protiucetNazov, "Novák s.r.o.");
  ok("bankRef z AcctSvcrRef", v.pohyby[0].bankRef, "TX0001");
  ok("debet je ODCHOD", v.pohyby[1].smer, "ODCHOD");
}

console.log("\nFormátovanie");
ok("suma pre používateľa", formatSuma(123456).replace(/ /g, " "), "1 234,56");

console.log(`\n${prebehlo - zlyhalo} / ${prebehlo} testov prešlo.`);
if (zlyhalo > 0) {
  console.log(`${zlyhalo} testov ZLYHALO.\n`);
  process.exit(1);
}
console.log("Všetko sedí.\n");
