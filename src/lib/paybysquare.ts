import QRCode from "qrcode";

/**
 * PAY by square – slovenský štandard QR platby, ktorý načíta každá slovenská
 * mobilná banka.
 *
 * Knižnica `bysquare` (a jej závislosť `lzma1`) je čisté ESM. Načítava sa preto
 * dynamickým importom – ten funguje aj vtedy, keď zvyšok aplikácie zbehne ako
 * CommonJS. Statický import by pri niektorých kombináciách buildu spadol na
 * ERR_PACKAGE_PATH_NOT_EXPORTED.
 *
 * Pozor: štandard neprijíma diakritiku ani ISO dátum – dátum musí byť RRRRMMDD
 * a texty bez mäkčeňov.
 */

export interface PlatbaVstup {
  iban: string;
  suma: number; // v eurách
  variabilnySymbol?: string | null;
  konstantnySymbol?: string | null;
  specifickySymbol?: string | null;
  datumSplatnosti?: Date | null;
  poznamka?: string | null;
  prijemca: string; // názov príjemcu – štandard ho vyžaduje
  bic?: string | null;
}

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

export async function vytvorPayBySquare(v: PlatbaVstup): Promise<string> {
  const { encode, CurrencyCode, PaymentOptions } = await import("bysquare/pay");

  const iban = v.iban.replace(/\s/g, "").toUpperCase();
  if (!IBAN_RE.test(iban)) throw new Error(`Neplatný IBAN: ${v.iban}`);
  if (!(v.suma > 0)) throw new Error("Suma pre QR platbu musí byť kladná.");

  const cisla = (s?: string | null) => {
    const c = (s ?? "").replace(/\D/g, "");
    return c.length ? c.slice(0, 10) : undefined;
  };
  const text = (s?: string | null, max = 70) => {
    if (!s) return undefined;
    const t = bezDiakritiky(s).trim().slice(0, max);
    return t.length ? t : undefined;
  };

  const prijemca = text(v.prijemca) ?? "Prijemca";

  return encode({
    invoiceId: cisla(v.variabilnySymbol),
    payments: [
      {
        type: PaymentOptions.PaymentOrder,
        amount: Number(v.suma.toFixed(2)),
        currencyCode: CurrencyCode.EUR,
        variableSymbol: cisla(v.variabilnySymbol),
        constantSymbol: cisla(v.konstantnySymbol),
        specificSymbol: cisla(v.specifickySymbol),
        paymentNote: text(v.poznamka, 140),
        paymentDueDate: v.datumSplatnosti ? formatDatum(v.datumSplatnosti) : undefined,
        beneficiary: { name: prijemca },
        bankAccounts: [{ iban, bic: v.bic?.replace(/\s/g, "").toUpperCase() || undefined }],
      },
    ],
  });
}

/** QR kód ako data URL (PNG) – vhodné do PDF aj do HTML. */
export async function qrDataUrl(payload: string, velkost = 240): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: velkost,
    color: { dark: "#1C1C1EFF", light: "#FFFFFFFF" },
  });
}

/**
 * Vytvorí QR kód pre faktúru. Ak sa čokoľvek pokazí (chýbajúci IBAN, nulová
 * suma), vráti null – faktúra sa vygeneruje bez QR namiesto toho, aby celé
 * generovanie PDF spadlo.
 */
export async function qrPreFakturu(v: PlatbaVstup): Promise<{ payload: string; dataUrl: string } | null> {
  try {
    const payload = await vytvorPayBySquare(v);
    const dataUrl = await qrDataUrl(payload, 300);
    return { payload, dataUrl };
  } catch {
    return null;
  }
}

/** Štandard PAY by square neprijíma diakritiku – prepíšeme ju na základné písmená. */
function bezDiakritiky(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** PAY by square vyžaduje RRRRMMDD, nie ISO. */
function formatDatum(d: Date): string {
  const rok = d.getFullYear();
  const mesiac = String(d.getMonth() + 1).padStart(2, "0");
  const den = String(d.getDate()).padStart(2, "0");
  return `${rok}${mesiac}${den}`;
}
