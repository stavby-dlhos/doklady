import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, Image, renderToBuffer } from "@react-pdf/renderer";
import path from "path";
import { formatSuma, toCents, type Cents } from "../money";
import { POZNAMKA_PRENOS_DPH, POZNAMKA_NEPLATITEL } from "../dph";

/**
 * PDF faktúry – antracitovo-zlatá schéma, rovnaká rodina ako cenové ponuky.
 *
 * Fonty sú súčasťou repozitára (Work Sans, licencia OFL). Zabudované PDF fonty
 * ako Helvetica nemajú slovenskú diakritiku – „č", „ť", „ľ" by sa nevykreslili.
 */

const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts");

let fontyRegistrovane = false;
function registrujFonty() {
  if (fontyRegistrovane) return;
  Font.register({
    family: "WorkSans",
    fonts: [
      { src: path.join(FONT_DIR, "WorkSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "WorkSans-Bold.ttf"), fontWeight: 700 },
      { src: path.join(FONT_DIR, "WorkSans-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
  Font.registerHyphenationCallback((slovo) => [slovo]);
  fontyRegistrovane = true;
}

const FARBY = {
  antracit: "#22252A",
  antracitSvetly: "#3A3F47",
  zlata: "#B08D46",
  zlataSvetla: "#D9C089",
  text: "#1C1C1E",
  textTlmeny: "#6B7280",
  linka: "#E3E5E8",
  pozadie: "#FAFAFA",
};

const s = StyleSheet.create({
  strana: {
    fontFamily: "WorkSans",
    fontSize: 9,
    color: FARBY.text,
    paddingTop: 0,
    paddingBottom: 52,
    paddingHorizontal: 0,
  },
  hlavicka: {
    backgroundColor: FARBY.antracit,
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  firmaNazov: { color: "#FFFFFF", fontSize: 16, fontWeight: 700, letterSpacing: 0.3 },
  firmaRiadok: { color: "#B9BEC6", fontSize: 8, marginTop: 2 },
  titulBlok: { alignItems: "flex-end" },
  titul: { color: FARBY.zlataSvetla, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
  cislo: { color: "#FFFFFF", fontSize: 20, fontWeight: 700, marginTop: 2 },
  zlatyPruh: { height: 3, backgroundColor: FARBY.zlata },

  telo: { paddingHorizontal: 40, paddingTop: 18 },

  strany: { flexDirection: "row", gap: 20, marginBottom: 14 },
  stranaBox: { flex: 1, borderWidth: 1, borderColor: FARBY.linka, borderRadius: 3, padding: 12 },
  stranaNadpis: {
    fontSize: 7,
    letterSpacing: 1.2,
    color: FARBY.textTlmeny,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  stranaNazov: { fontSize: 11, fontWeight: 700, marginBottom: 3 },
  stranaRiadok: { fontSize: 8.5, color: FARBY.antracitSvetly, lineHeight: 1.45 },

  udaje: {
    flexDirection: "row",
    backgroundColor: FARBY.pozadie,
    borderWidth: 1,
    borderColor: FARBY.linka,
    borderRadius: 3,
    padding: 12,
    marginBottom: 12,
  },
  udajStlpec: { flex: 1 },
  udajPopis: { fontSize: 7, letterSpacing: 0.8, color: FARBY.textTlmeny, textTransform: "uppercase" },
  udajHodnota: { fontSize: 10, fontWeight: 700, marginTop: 2 },

  uvodnyText: { fontSize: 9, color: FARBY.antracitSvetly, marginBottom: 11, lineHeight: 1.5 },

  tabHlavicka: {
    flexDirection: "row",
    backgroundColor: FARBY.antracit,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  tabHlavickaText: {
    color: "#FFFFFF",
    fontSize: 7.5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: 700,
  },
  skupina: {
    backgroundColor: "#F2F3F5",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: FARBY.linka,
  },
  skupinaText: { fontSize: 8, fontWeight: 700, letterSpacing: 0.8, color: FARBY.antracit, textTransform: "uppercase" },
  riadok: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: FARBY.linka,
  },
  bunka: { fontSize: 8.5 },
  bunkaPopis: { fontSize: 7.5, color: FARBY.textTlmeny, marginTop: 1.5, lineHeight: 1.4 },

  cNazov: { flex: 1 },
  cMnozstvo: { width: 58, textAlign: "right" },
  cMj: { width: 32, textAlign: "center" },
  cCena: { width: 62, textAlign: "right" },
  cDph: { width: 34, textAlign: "right" },
  cSpolu: { width: 68, textAlign: "right" },

  spodok: { flexDirection: "row", marginTop: 14, gap: 20 },
  qrBlok: { width: 150, alignItems: "center" },
  qrObrazok: { width: 108, height: 108 },
  qrPopis: { fontSize: 7, color: FARBY.textTlmeny, marginTop: 5, textAlign: "center", lineHeight: 1.4 },

  sumar: { flex: 1 },
  sumarRiadok: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3.5,
    paddingHorizontal: 10,
  },
  sumarPopis: { fontSize: 8.5, color: FARBY.antracitSvetly },
  sumarHodnota: { fontSize: 8.5, fontWeight: 700 },
  sumarCiara: { borderTopWidth: 1, borderTopColor: FARBY.linka, marginVertical: 3 },
  celkom: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: FARBY.antracit,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 4,
    borderRadius: 3,
  },
  celkomPopis: { color: FARBY.zlataSvetla, fontSize: 9, letterSpacing: 1, textTransform: "uppercase" },
  celkomHodnota: { color: "#FFFFFF", fontSize: 14, fontWeight: 700 },

  poznamkaBox: {
    marginTop: 10,
    borderLeftWidth: 2,
    borderLeftColor: FARBY.zlata,
    paddingLeft: 10,
    paddingVertical: 4,
  },
  poznamkaText: { fontSize: 8, color: FARBY.antracitSvetly, lineHeight: 1.5 },

  paticka: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: FARBY.linka,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  patickaText: { fontSize: 7, color: FARBY.textTlmeny },
});

export interface PdfFirma {
  nazov: string;
  ico: string;
  dic?: string | null;
  icDph?: string | null;
  jePlatitelDph: boolean;
  ulica: string;
  mesto: string;
  psc: string;
  email?: string | null;
  telefon?: string | null;
  web?: string | null;
  iban?: string | null;
  bic?: string | null;
  banka?: string | null;
  zapisV?: string | null;
  patickaText?: string | null;
}

export interface PdfPartner {
  nazov: string;
  ico?: string | null;
  dic?: string | null;
  icDph?: string | null;
  ulica?: string | null;
  mesto?: string | null;
  psc?: string | null;
}

export interface PdfPolozka {
  nazov: string;
  popis?: string | null;
  skupina?: string | null;
  mnozstvo: string;
  mj: string;
  cenaZaMj: string;
  sadzbaDph: number;
  zaklad: string;
  spolu: string;
}

export interface PdfFaktura {
  cislo: string;
  typ: "BEZNA" | "ZALOHOVA" | "DOBROPIS";
  datumVystavenia: Date;
  datumDodania: Date;
  datumSplatnosti: Date;
  variabilnySymbol: string;
  konstantnySymbol?: string | null;
  formaUhrady: string;
  prenosDph: boolean;
  zaklad23: string;
  zaklad19: string;
  zaklad5: string;
  zaklad0: string;
  dph23: string;
  dph19: string;
  dph5: string;
  dphSpolu: string;
  sumaBezDph: string;
  sumaCelkom: string;
  mena: string;
  textPredPolozkami?: string | null;
  poznamka?: string | null;
}

export interface PdfVstup {
  firma: PdfFirma;
  odberatel: PdfPartner;
  faktura: PdfFaktura;
  polozky: PdfPolozka[];
  qrDataUrl?: string | null;
  zakazka?: { kod: string; nazov: string } | null;
}

const NAZVY_TYPOV: Record<string, string> = {
  BEZNA: "Faktúra",
  ZALOHOVA: "Zálohová faktúra",
  DOBROPIS: "Dobropis",
};

const NAZVY_UHRADY: Record<string, string> = {
  PREVOD: "Prevodom",
  HOTOVOST: "V hotovosti",
  KARTA: "Kartou",
  DOBIERKA: "Dobierkou",
};

function datum(d: Date): string {
  return new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "numeric", year: "numeric" }).format(d);
}

function eur(hodnota: string | Cents, mena = "EUR"): string {
  const cents = typeof hodnota === "string" ? toCents(hodnota) : hodnota;
  return `${formatSuma(cents)} ${mena === "EUR" ? "€" : mena}`;
}

function Dokument({ firma, odberatel, faktura: f, polozky, qrDataUrl, zakazka }: PdfVstup) {
  const skupiny = zoskup(polozky);
  const maViacSadzieb =
    [f.zaklad23, f.zaklad19, f.zaklad5].filter((z) => toCents(z) !== 0).length > 1;

  return (
    <Document
      title={`${NAZVY_TYPOV[f.typ]} ${f.cislo}`}
      author={firma.nazov}
      subject={`${NAZVY_TYPOV[f.typ]} ${f.cislo}`}
      creator="Doklady"
    >
      <Page size="A4" style={s.strana}>
        <View style={s.hlavicka} fixed>
          <View>
            <Text style={s.firmaNazov}>{firma.nazov}</Text>
            <Text style={s.firmaRiadok}>
              {firma.ulica}, {firma.psc} {firma.mesto}
            </Text>
            <Text style={s.firmaRiadok}>
              IČO {firma.ico}
              {firma.dic ? ` · DIČ ${firma.dic}` : ""}
              {firma.icDph ? ` · IČ DPH ${firma.icDph}` : ""}
            </Text>
            {(firma.telefon || firma.email) && (
              <Text style={s.firmaRiadok}>
                {[firma.telefon, firma.email].filter(Boolean).join(" · ")}
              </Text>
            )}
          </View>
          <View style={s.titulBlok}>
            <Text style={s.titul}>{NAZVY_TYPOV[f.typ]}</Text>
            <Text style={s.cislo}>{f.cislo}</Text>
          </View>
        </View>
        <View style={s.zlatyPruh} fixed />

        <View style={s.telo}>
          <View style={s.strany}>
            <View style={s.stranaBox}>
              <Text style={s.stranaNadpis}>Dodávateľ</Text>
              <Text style={s.stranaNazov}>{firma.nazov}</Text>
              <Text style={s.stranaRiadok}>{firma.ulica}</Text>
              <Text style={s.stranaRiadok}>
                {firma.psc} {firma.mesto}
              </Text>
              <Text style={[s.stranaRiadok, { marginTop: 4 }]}>IČO: {firma.ico}</Text>
              {firma.dic && <Text style={s.stranaRiadok}>DIČ: {firma.dic}</Text>}
              <Text style={s.stranaRiadok}>
                IČ DPH: {firma.icDph ?? "neplatiteľ DPH"}
              </Text>
              {firma.zapisV && (
                <Text style={[s.stranaRiadok, { marginTop: 4, fontSize: 7.5 }]}>{firma.zapisV}</Text>
              )}
            </View>

            <View style={s.stranaBox}>
              <Text style={s.stranaNadpis}>Odberateľ</Text>
              <Text style={s.stranaNazov}>{odberatel.nazov}</Text>
              {odberatel.ulica && <Text style={s.stranaRiadok}>{odberatel.ulica}</Text>}
              {(odberatel.psc || odberatel.mesto) && (
                <Text style={s.stranaRiadok}>
                  {odberatel.psc} {odberatel.mesto}
                </Text>
              )}
              {odberatel.ico && <Text style={[s.stranaRiadok, { marginTop: 4 }]}>IČO: {odberatel.ico}</Text>}
              {odberatel.dic && <Text style={s.stranaRiadok}>DIČ: {odberatel.dic}</Text>}
              {odberatel.icDph && <Text style={s.stranaRiadok}>IČ DPH: {odberatel.icDph}</Text>}
            </View>
          </View>

          <View style={s.udaje}>
            <View style={s.udajStlpec}>
              <Text style={s.udajPopis}>Vystavená</Text>
              <Text style={s.udajHodnota}>{datum(f.datumVystavenia)}</Text>
            </View>
            <View style={s.udajStlpec}>
              <Text style={s.udajPopis}>Dodanie</Text>
              <Text style={s.udajHodnota}>{datum(f.datumDodania)}</Text>
            </View>
            <View style={s.udajStlpec}>
              <Text style={s.udajPopis}>Splatnosť</Text>
              <Text style={s.udajHodnota}>{datum(f.datumSplatnosti)}</Text>
            </View>
            <View style={s.udajStlpec}>
              <Text style={s.udajPopis}>Var. symbol</Text>
              <Text style={s.udajHodnota}>{f.variabilnySymbol}</Text>
            </View>
            <View style={s.udajStlpec}>
              <Text style={s.udajPopis}>Úhrada</Text>
              <Text style={s.udajHodnota}>{NAZVY_UHRADY[f.formaUhrady] ?? f.formaUhrady}</Text>
            </View>
          </View>

          {firma.iban && (
            <View style={[s.udaje, { marginTop: -8 }]}>
              <View style={{ flex: 2 }}>
                <Text style={s.udajPopis}>IBAN</Text>
                <Text style={s.udajHodnota}>{formatIban(firma.iban)}</Text>
              </View>
              {firma.banka && (
                <View style={s.udajStlpec}>
                  <Text style={s.udajPopis}>Banka</Text>
                  <Text style={s.udajHodnota}>{firma.banka}</Text>
                </View>
              )}
              {zakazka && (
                <View style={{ flex: 1.5 }}>
                  <Text style={s.udajPopis}>Zákazka</Text>
                  <Text style={s.udajHodnota}>{zakazka.kod}</Text>
                </View>
              )}
            </View>
          )}

          {f.textPredPolozkami && <Text style={s.uvodnyText}>{f.textPredPolozkami}</Text>}

          <View style={s.tabHlavicka} fixed>
            <Text style={[s.tabHlavickaText, s.cNazov]}>Položka</Text>
            <Text style={[s.tabHlavickaText, s.cMnozstvo]}>Množstvo</Text>
            <Text style={[s.tabHlavickaText, s.cMj]}>MJ</Text>
            <Text style={[s.tabHlavickaText, s.cCena]}>Cena/MJ</Text>
            <Text style={[s.tabHlavickaText, s.cDph]}>DPH</Text>
            <Text style={[s.tabHlavickaText, s.cSpolu]}>Spolu</Text>
          </View>

          {skupiny.map((sk, i) => (
            <View key={i}>
              {sk.nazov && (
                <View style={s.skupina} wrap={false}>
                  <Text style={s.skupinaText}>{sk.nazov}</Text>
                </View>
              )}
              {sk.polozky.map((p, j) => (
                <View key={j} style={s.riadok} wrap={false}>
                  <View style={s.cNazov}>
                    <Text style={s.bunka}>{p.nazov}</Text>
                    {p.popis && <Text style={s.bunkaPopis}>{p.popis}</Text>}
                  </View>
                  <Text style={[s.bunka, s.cMnozstvo]}>{formatMn(p.mnozstvo)}</Text>
                  <Text style={[s.bunka, s.cMj]}>{p.mj}</Text>
                  <Text style={[s.bunka, s.cCena]}>{formatSuma(toCents(p.cenaZaMj))}</Text>
                  <Text style={[s.bunka, s.cDph]}>{f.prenosDph ? "PDP" : `${p.sadzbaDph} %`}</Text>
                  <Text style={[s.bunka, s.cSpolu, { fontWeight: 700 }]}>
                    {formatSuma(toCents(f.prenosDph ? p.zaklad : p.spolu))}
                  </Text>
                </View>
              ))}
            </View>
          ))}

          <View style={s.spodok} wrap={false}>
            {qrDataUrl ? (
              <View style={s.qrBlok}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image style={s.qrObrazok} src={qrDataUrl} />
                <Text style={s.qrPopis}>PAY by square{"\n"}Naskenuj v mobilnej banke</Text>
              </View>
            ) : (
              <View style={s.qrBlok} />
            )}

            <View style={s.sumar}>
              {f.prenosDph ? (
                <View style={s.sumarRiadok}>
                  <Text style={s.sumarPopis}>Základ dane (prenesenie daňovej povinnosti)</Text>
                  <Text style={s.sumarHodnota}>{eur(f.sumaBezDph, f.mena)}</Text>
                </View>
              ) : (
                <>
                  {maViacSadzieb || toCents(f.zaklad23) !== 0 ? (
                    <RiadokSadzby popis="Základ 23 %" zaklad={f.zaklad23} dph={f.dph23} mena={f.mena} />
                  ) : null}
                  {toCents(f.zaklad19) !== 0 && (
                    <RiadokSadzby popis="Základ 19 %" zaklad={f.zaklad19} dph={f.dph19} mena={f.mena} />
                  )}
                  {toCents(f.zaklad5) !== 0 && (
                    <RiadokSadzby popis="Základ 5 %" zaklad={f.zaklad5} dph={f.dph5} mena={f.mena} />
                  )}
                  {toCents(f.zaklad0) !== 0 && (
                    <View style={s.sumarRiadok}>
                      <Text style={s.sumarPopis}>Oslobodené od DPH</Text>
                      <Text style={s.sumarHodnota}>{eur(f.zaklad0, f.mena)}</Text>
                    </View>
                  )}
                  <View style={s.sumarCiara} />
                  <View style={s.sumarRiadok}>
                    <Text style={s.sumarPopis}>Základ dane spolu</Text>
                    <Text style={s.sumarHodnota}>{eur(f.sumaBezDph, f.mena)}</Text>
                  </View>
                  <View style={s.sumarRiadok}>
                    <Text style={s.sumarPopis}>DPH spolu</Text>
                    <Text style={s.sumarHodnota}>{eur(f.dphSpolu, f.mena)}</Text>
                  </View>
                </>
              )}

              <View style={s.celkom}>
                <Text style={s.celkomPopis}>Na úhradu</Text>
                <Text style={s.celkomHodnota}>{eur(f.sumaCelkom, f.mena)}</Text>
              </View>
            </View>
          </View>

          {(f.prenosDph || !firma.jePlatitelDph || f.poznamka) && (
            <View style={s.poznamkaBox}>
              {f.prenosDph && <Text style={s.poznamkaText}>{POZNAMKA_PRENOS_DPH}</Text>}
              {!firma.jePlatitelDph && <Text style={s.poznamkaText}>{POZNAMKA_NEPLATITEL}</Text>}
              {f.poznamka && (
                <Text style={[s.poznamkaText, { marginTop: f.prenosDph ? 4 : 0 }]}>{f.poznamka}</Text>
              )}
            </View>
          )}
        </View>

        <View style={s.paticka} fixed>
          <Text style={s.patickaText}>
            {firma.patickaText ?? `${firma.nazov} · ${firma.web ?? ""} ${firma.email ?? ""}`.trim()}
          </Text>
          <Text
            style={s.patickaText}
            render={({ pageNumber, totalPages }) => `Strana ${pageNumber} z ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

function RiadokSadzby({
  popis,
  zaklad,
  dph,
  mena,
}: {
  popis: string;
  zaklad: string;
  dph: string;
  mena: string;
}) {
  return (
    <View style={s.sumarRiadok}>
      <Text style={s.sumarPopis}>
        {popis} · DPH {eur(dph, mena)}
      </Text>
      <Text style={s.sumarHodnota}>{eur(zaklad, mena)}</Text>
    </View>
  );
}

function zoskup(polozky: PdfPolozka[]): { nazov: string | null; polozky: PdfPolozka[] }[] {
  const vysledok: { nazov: string | null; polozky: PdfPolozka[] }[] = [];
  for (const p of polozky) {
    const kluc = p.skupina?.trim() || null;
    const posledna = vysledok[vysledok.length - 1];
    if (posledna && posledna.nazov === kluc) posledna.polozky.push(p);
    else vysledok.push({ nazov: kluc, polozky: [p] });
  }
  return vysledok;
}

function formatMn(v: string): string {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return v;
  return new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 3 }).format(n);
}

function formatIban(iban: string): string {
  return iban
    .replace(/\s/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export async function vygenerujFakturuPdf(vstup: PdfVstup): Promise<Buffer> {
  registrujFonty();
  return renderToBuffer(<Dokument {...vstup} />);
}
