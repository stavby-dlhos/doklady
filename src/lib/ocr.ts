import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Vyťaženie údajov z fotky bločku alebo PDF faktúry.
 *
 * Model dostane obrázok a musí vrátiť JSON presne v danom tvare (vynútené cez
 * tool use). Ak si niečím nie je istý, vráti null – radšej prázdne pole než
 * vymyslené číslo, ktoré by sa dostalo do účtovníctva.
 */

const MODEL = process.env.OCR_MODEL ?? "claude-sonnet-4-5";

export const OcrVysledokSchema = z.object({
  typDokladu: z.enum(["BLOCEK", "FAKTURA_PRIJATA", "POKLADNICNY_VYDAJ", "INY"]).nullable(),
  dodavatelNazov: z.string().nullable(),
  dodavatelIco: z.string().nullable(),
  dodavatelIcDph: z.string().nullable(),
  cisloDokladu: z.string().nullable(),
  datumVystavenia: z.string().nullable(),
  datumSplatnosti: z.string().nullable(),
  variabilnySymbol: z.string().nullable(),
  sumaCelkom: z.number().nullable(),
  zakladDph: z.number().nullable(),
  sumaDph: z.number().nullable(),
  sadzbaDph: z.number().nullable(),
  mena: z.string().nullable(),
  prenosDph: z.boolean().nullable(),
  kategoria: z
    .enum(["MATERIAL", "PALIVO", "NARADIE", "SUBDODAVKA", "SLUZBY", "REZIA", "DOPRAVA", "INE"])
    .nullable(),
  popis: z.string().nullable(),
  istota: z.number().min(0).max(1),
  poznamkaKKontrole: z.string().nullable(),
});

export type OcrVysledok = z.infer<typeof OcrVysledokSchema>;

const NASTROJ = {
  name: "zapis_dokladu",
  description: "Zapíše údaje vyťažené z dokladu.",
  input_schema: {
    type: "object" as const,
    properties: {
      typDokladu: {
        type: ["string", "null"],
        enum: ["BLOCEK", "FAKTURA_PRIJATA", "POKLADNICNY_VYDAJ", "INY", null],
        description: "BLOCEK = pokladničný doklad z registračnej pokladne, FAKTURA_PRIJATA = faktúra.",
      },
      dodavatelNazov: { type: ["string", "null"], description: "Obchodný názov predajcu/dodávateľa." },
      dodavatelIco: { type: ["string", "null"], description: "IČO – 8 číslic, bez medzier." },
      dodavatelIcDph: { type: ["string", "null"], description: "IČ DPH, napr. SK2023456789." },
      cisloDokladu: { type: ["string", "null"], description: "Číslo faktúry alebo bločku." },
      datumVystavenia: { type: ["string", "null"], description: "Formát RRRR-MM-DD." },
      datumSplatnosti: { type: ["string", "null"], description: "Formát RRRR-MM-DD, len pri faktúrach." },
      variabilnySymbol: { type: ["string", "null"], description: "Variabilný symbol, len číslice." },
      sumaCelkom: { type: ["number", "null"], description: "Celková suma na úhradu vrátane DPH." },
      zakladDph: { type: ["number", "null"], description: "Základ dane, teda suma bez DPH." },
      sumaDph: { type: ["number", "null"], description: "Suma DPH." },
      sadzbaDph: { type: ["number", "null"], description: "Sadzba DPH v percentách: 23, 19, 5 alebo 0." },
      mena: { type: ["string", "null"], description: "Kód meny, napr. EUR." },
      prenosDph: {
        type: ["boolean", "null"],
        description: "true, ak je na doklade uvedené prenesenie daňovej povinnosti.",
      },
      kategoria: {
        type: ["string", "null"],
        enum: ["MATERIAL", "PALIVO", "NARADIE", "SUBDODAVKA", "SLUZBY", "REZIA", "DOPRAVA", "INE", null],
        description:
          "Odhad nákladovej kategórie pre stavebnú firmu. Stavebniny, drevo, betón = MATERIAL. Čerpacia stanica = PALIVO.",
      },
      popis: { type: ["string", "null"], description: "Stručný popis nákupu, max 80 znakov." },
      istota: {
        type: "number",
        description: "0 až 1 – nakoľko si si istý celkovou sumou a dátumom. Pri zlej čitateľnosti daj nízku hodnotu.",
      },
      poznamkaKKontrole: {
        type: ["string", "null"],
        description: "Čo si nedokázal prečítať alebo čo treba overiť ručne. Null ak je všetko jasné.",
      },
    },
    required: ["istota"],
  },
};

const POKYNY = `Si asistent slovenskej stavebnej firmy. Z priloženého dokladu vyťaž údaje a zapíš ich cez nástroj zapis_dokladu.

Pravidlá:
- Sumy zapisuj ako čísla s bodkou, napr. 123.45. Nikdy nie ako text.
- Dátumy vždy vo formáte RRRR-MM-DD. Slovenský formát "15.3.2026" znamená 15. marec 2026.
- IČO má 8 číslic. Ak vidíš kratšie, doplň zľava nuly.
- Ak je na doklade viac sadzieb DPH, uveď tú s najvyšším základom a spomeň to v poznamkaKKontrole.
- Ak niektorý údaj nevieš prečítať, vráť null. NIKDY nehádaj a nedopĺňaj pravdepodobné hodnoty.
- Celková suma je tá, ktorá bola skutočne zaplatená alebo je na úhradu – hľadaj "SPOLU", "CELKOM", "K ÚHRADE".
- Pri istote buď prísny: pokrčený alebo vyblednutý bloček znamená istotu pod 0.7.`;

export interface OcrVstup {
  data: Buffer;
  mimeType: string;
}

export async function vytazDoklad(vstup: OcrVstup): Promise<OcrVysledok> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Chýba ANTHROPIC_API_KEY – OCR nie je nakonfigurované.");

  const client = new Anthropic({ apiKey, maxRetries: 3, timeout: 120_000 });

  const obsah: Anthropic.ContentBlockParam[] = [];

  if (vstup.mimeType === "application/pdf") {
    obsah.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: vstup.data.toString("base64") },
    });
  } else {
    const povolene = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!povolene.includes(vstup.mimeType)) {
      throw new Error(`Nepodporovaný formát pre OCR: ${vstup.mimeType}. Podporujeme JPG, PNG, WEBP, GIF a PDF.`);
    }
    obsah.push({
      type: "image",
      source: {
        type: "base64",
        media_type: vstup.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: vstup.data.toString("base64"),
      },
    });
  }

  obsah.push({ type: "text", text: "Vyťaž údaje z tohto dokladu." });

  const odpoved = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: POKYNY,
    tools: [NASTROJ],
    tool_choice: { type: "tool", name: "zapis_dokladu" },
    messages: [{ role: "user", content: obsah }],
  });

  const blok = odpoved.content.find((c) => c.type === "tool_use");
  if (!blok || blok.type !== "tool_use") {
    throw new Error("OCR nevrátilo štruktúrovaný výsledok.");
  }

  const surove = blok.input as Record<string, unknown>;
  const doplnene = {
    typDokladu: null,
    dodavatelNazov: null,
    dodavatelIco: null,
    dodavatelIcDph: null,
    cisloDokladu: null,
    datumVystavenia: null,
    datumSplatnosti: null,
    variabilnySymbol: null,
    sumaCelkom: null,
    zakladDph: null,
    sumaDph: null,
    sadzbaDph: null,
    mena: "EUR",
    prenosDph: null,
    kategoria: null,
    popis: null,
    poznamkaKKontrole: null,
    ...surove,
  };

  return OcrVysledokSchema.parse(doplnene);
}
