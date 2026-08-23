import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@/lib/id";

// ============ ENUMY ============

export const rolaEnum = pgEnum("rola", ["MAJITEL", "UCTOVNIK"]);
export const partnerTypEnum = pgEnum("partner_typ", ["ODBERATEL", "DODAVATEL", "OBOJE"]);
export const zakazkaStavEnum = pgEnum("zakazka_stav", ["PRIPRAVA", "AKTIVNA", "UKONCENA", "ZRUSENA"]);
export const dokladTypEnum = pgEnum("doklad_typ", ["BLOCEK", "FAKTURA_PRIJATA", "POKLADNICNY_VYDAJ", "INY"]);
export const dokladStavEnum = pgEnum("doklad_stav", [
  "NOVY",
  "NA_SCHVALENIE",
  "SCHVALENY",
  "ZAMIETNUTY",
  "ZAUCTOVANY",
]);
export const kategoriaEnum = pgEnum("kategoria", [
  "MATERIAL",
  "PALIVO",
  "NARADIE",
  "SUBDODAVKA",
  "SLUZBY",
  "REZIA",
  "DOPRAVA",
  "INE",
]);
export const zdrojEnum = pgEnum("zdroj_dokladu", ["RUCNE", "EMAIL", "MOBIL", "API"]);
export const fakturaTypEnum = pgEnum("faktura_typ", ["BEZNA", "ZALOHOVA", "DOBROPIS"]);
export const fakturaStavEnum = pgEnum("faktura_stav", [
  "KONCEPT",
  "ODOSLANA",
  "CIASTOCNE_UHRADENA",
  "UHRADENA",
  "PO_SPLATNOSTI",
  "STORNO",
]);
export const formaUhradyEnum = pgEnum("forma_uhrady", ["PREVOD", "HOTOVOST", "KARTA", "DOBIERKA"]);
export const smerEnum = pgEnum("smer", ["PRICHOD", "ODCHOD"]);
export const mailStavEnum = pgEnum("mail_stav", ["CAKA", "ODOSLANY", "CHYBA"]);
export const prijatyMailStavEnum = pgEnum("prijaty_mail_stav", ["NOVY", "SPRACOVANY", "IGNOROVANY", "CHYBA"]);

const id = () => text("id").primaryKey().$defaultFn(createId);
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

// ============ POUŽÍVATELIA ============

export const pouzivatelia = pgTable("pouzivatelia", {
  id: id(),
  email: text("email").notNull().unique(),
  meno: text("meno").notNull(),
  heslo: text("heslo").notNull(),
  rola: rolaEnum("rola").notNull().default("UCTOVNIK"),
  aktivny: boolean("aktivny").notNull().default(true),
  poslednyLogin: timestamp("posledny_login", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============ FIRMA ============

export const firma = pgTable("firma", {
  id: text("id").primaryKey().default("firma"),
  nazov: text("nazov").notNull(),
  ico: text("ico").notNull(),
  dic: text("dic"),
  icDph: text("ic_dph"),
  jePlatitelDph: boolean("je_platitel_dph").notNull().default(false),
  ulica: text("ulica").notNull(),
  mesto: text("mesto").notNull(),
  psc: text("psc").notNull(),
  krajina: text("krajina").notNull().default("Slovensko"),
  email: text("email"),
  telefon: text("telefon"),
  web: text("web"),
  iban: text("iban"),
  bic: text("bic"),
  banka: text("banka"),
  logoUrl: text("logo_url"),
  zapisV: text("zapis_v"),
  patickaText: text("paticka_text"),
  splatnostDni: integer("splatnost_dni").notNull().default(14),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============ PARTNERI ============

export const partneri = pgTable(
  "partneri",
  {
    id: id(),
    typ: partnerTypEnum("typ").notNull().default("OBOJE"),
    nazov: text("nazov").notNull(),
    ico: text("ico"),
    dic: text("dic"),
    icDph: text("ic_dph"),
    jePlatitelDph: boolean("je_platitel_dph").notNull().default(false),
    ulica: text("ulica"),
    mesto: text("mesto"),
    psc: text("psc"),
    krajina: text("krajina").notNull().default("SK"),
    iban: text("iban"),
    email: text("email"),
    telefon: text("telefon"),
    poznamka: text("poznamka"),
    archivovany: boolean("archivovany").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("partneri_ico_idx").on(t.ico), index("partneri_nazov_idx").on(t.nazov)],
);

// ============ ZÁKAZKY ============

export const zakazky = pgTable("zakazky", {
  id: id(),
  kod: text("kod").notNull().unique(),
  nazov: text("nazov").notNull(),
  adresa: text("adresa"),
  investor: text("investor"),
  stav: zakazkaStavEnum("stav").notNull().default("AKTIVNA"),
  datumStart: timestamp("datum_start", { withTimezone: true }),
  datumKoniec: timestamp("datum_koniec", { withTimezone: true }),
  rozpocet: money("rozpocet"),
  poznamka: text("poznamka"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============ BANKA ============

export const bankUcty = pgTable("bank_ucty", {
  id: id(),
  nazov: text("nazov").notNull(),
  iban: text("iban").notNull().unique(),
  bic: text("bic"),
  mena: text("mena").notNull().default("EUR"),
  vychodzi: boolean("vychodzi").notNull().default(false),
});

export const bankPohyby = pgTable(
  "bank_pohyby",
  {
    id: id(),
    ucetId: text("ucet_id")
      .notNull()
      .references(() => bankUcty.id),
    datum: timestamp("datum", { withTimezone: true }).notNull(),
    suma: money("suma").notNull(),
    mena: text("mena").notNull().default("EUR"),
    smer: smerEnum("smer").notNull(),
    protiucetIban: text("protiucet_iban"),
    protiucetNazov: text("protiucet_nazov"),
    variabilnySymbol: text("variabilny_symbol"),
    konstantnySymbol: text("konstantny_symbol"),
    specifickySymbol: text("specificky_symbol"),
    popis: text("popis"),
    bankRef: text("bank_ref").notNull().unique(),
    sparovane: boolean("sparovane").notNull().default(false),
    importId: text("import_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bank_pohyby_datum_idx").on(t.datum),
    index("bank_pohyby_sparovane_idx").on(t.sparovane),
    index("bank_pohyby_vs_idx").on(t.variabilnySymbol),
  ],
);

// ============ PRIJATÉ DOKLADY ============

export const prijateDoklady = pgTable(
  "prijate_doklady",
  {
    id: id(),
    typ: dokladTypEnum("typ").notNull().default("BLOCEK"),
    cisloDokladu: text("cislo_dokladu"),
    dodavatelId: text("dodavatel_id").references(() => partneri.id),
    zakazkaId: text("zakazka_id").references(() => zakazky.id),
    kategoria: kategoriaEnum("kategoria").notNull().default("MATERIAL"),
    zdroj: zdrojEnum("zdroj").notNull().default("RUCNE"),

    datumVystavenia: timestamp("datum_vystavenia", { withTimezone: true }).notNull(),
    datumDodania: timestamp("datum_dodania", { withTimezone: true }),
    datumSplatnosti: timestamp("datum_splatnosti", { withTimezone: true }),
    variabilnySymbol: text("variabilny_symbol"),

    zakladDph: money("zaklad_dph").notNull().default("0"),
    sadzbaDph: integer("sadzba_dph").notNull().default(23),
    sumaDph: money("suma_dph").notNull().default("0"),
    sumaCelkom: money("suma_celkom").notNull().default("0"),
    mena: text("mena").notNull().default("EUR"),
    prenosDph: boolean("prenos_dph").notNull().default(false),

    stav: dokladStavEnum("stav").notNull().default("NOVY"),
    popis: text("popis"),
    poznamka: text("poznamka"),
    zamietnutieDovod: text("zamietnutie_dovod"),

    suborUrl: text("subor_url"),
    suborNazov: text("subor_nazov"),
    suborTyp: text("subor_typ"),
    ocrData: jsonb("ocr_data"),
    ocrConfidence: real("ocr_confidence"),
    ocrSpustene: boolean("ocr_spustene").notNull().default(false),

    uhradenyDna: timestamp("uhradeny_dna", { withTimezone: true }),
    bankPohybId: text("bank_pohyb_id").references(() => bankPohyby.id),

    vytvorilId: text("vytvoril_id")
      .notNull()
      .references(() => pouzivatelia.id),
    schvalilId: text("schvalil_id").references(() => pouzivatelia.id),
    schvalenyDna: timestamp("schvaleny_dna", { withTimezone: true }),
    exportovanyDna: timestamp("exportovany_dna", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("doklady_datum_idx").on(t.datumVystavenia),
    index("doklady_zakazka_idx").on(t.zakazkaId),
    index("doklady_stav_idx").on(t.stav),
    index("doklady_dodavatel_idx").on(t.dodavatelId),
    uniqueIndex("doklady_bank_pohyb_idx").on(t.bankPohybId),
  ],
);

// ============ ČÍSELNÉ RADY ============

export const ciselneRady = pgTable("ciselne_rady", {
  id: id(),
  kod: text("kod").notNull().unique(),
  nazov: text("nazov").notNull(),
  prefix: text("prefix").notNull().default(""),
  rok: integer("rok").notNull(),
  posledneCislo: integer("posledne_cislo").notNull().default(0),
  pocetCislic: integer("pocet_cislic").notNull().default(4),
  typ: fakturaTypEnum("typ").notNull().default("BEZNA"),
});

// ============ VYSTAVENÉ FAKTÚRY ============

export const faktury = pgTable(
  "faktury",
  {
    id: id(),
    cislo: text("cislo").notNull().unique(),
    radaId: text("rada_id")
      .notNull()
      .references(() => ciselneRady.id),
    typ: fakturaTypEnum("typ").notNull().default("BEZNA"),
    odberatelId: text("odberatel_id")
      .notNull()
      .references(() => partneri.id),
    zakazkaId: text("zakazka_id").references(() => zakazky.id),

    datumVystavenia: timestamp("datum_vystavenia", { withTimezone: true }).notNull().defaultNow(),
    datumDodania: timestamp("datum_dodania", { withTimezone: true }).notNull(),
    datumSplatnosti: timestamp("datum_splatnosti", { withTimezone: true }).notNull(),
    variabilnySymbol: text("variabilny_symbol").notNull().unique(),
    konstantnySymbol: text("konstantny_symbol"),
    specifickySymbol: text("specificky_symbol"),
    formaUhrady: formaUhradyEnum("forma_uhrady").notNull().default("PREVOD"),

    prenosDph: boolean("prenos_dph").notNull().default(false),
    zaklad23: money("zaklad_23").notNull().default("0"),
    zaklad19: money("zaklad_19").notNull().default("0"),
    zaklad5: money("zaklad_5").notNull().default("0"),
    zaklad0: money("zaklad_0").notNull().default("0"),
    dph23: money("dph_23").notNull().default("0"),
    dph19: money("dph_19").notNull().default("0"),
    dph5: money("dph_5").notNull().default("0"),
    dphSpolu: money("dph_spolu").notNull().default("0"),
    sumaBezDph: money("suma_bez_dph").notNull().default("0"),
    sumaCelkom: money("suma_celkom").notNull().default("0"),
    uhradene: money("uhradene").notNull().default("0"),
    mena: text("mena").notNull().default("EUR"),

    stav: fakturaStavEnum("stav").notNull().default("KONCEPT"),
    textPredPolozkami: text("text_pred_polozkami"),
    poznamka: text("poznamka"),
    pdfUrl: text("pdf_url"),
    qrPayload: text("qr_payload"),

    odoslanaDna: timestamp("odoslana_dna", { withTimezone: true }),
    odoslanaNa: text("odoslana_na"),
    uhradenaDna: timestamp("uhradena_dna", { withTimezone: true }),
    stornovanaDna: timestamp("stornovana_dna", { withTimezone: true }),

    vytvorilId: text("vytvoril_id")
      .notNull()
      .references(() => pouzivatelia.id),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("faktury_stav_idx").on(t.stav),
    index("faktury_splatnost_idx").on(t.datumSplatnosti),
    index("faktury_odberatel_idx").on(t.odberatelId),
  ],
);

export const fakturaPolozky = pgTable(
  "faktura_polozky",
  {
    id: id(),
    fakturaId: text("faktura_id")
      .notNull()
      .references(() => faktury.id, { onDelete: "cascade" }),
    poradie: integer("poradie").notNull().default(0),
    skupina: text("skupina"),
    nazov: text("nazov").notNull(),
    popis: text("popis"),
    mnozstvo: numeric("mnozstvo", { precision: 12, scale: 3 }).notNull().default("1"),
    mj: text("mj").notNull().default("ks"),
    cenaZaMj: numeric("cena_za_mj", { precision: 12, scale: 4 }).notNull().default("0"),
    zlavaPct: numeric("zlava_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    sadzbaDph: integer("sadzba_dph").notNull().default(23),
    zaklad: money("zaklad").notNull().default("0"),
    dph: money("dph").notNull().default("0"),
    spolu: money("spolu").notNull().default("0"),
  },
  (t) => [index("polozky_faktura_idx").on(t.fakturaId)],
);

export const uhrady = pgTable(
  "uhrady",
  {
    id: id(),
    fakturaId: text("faktura_id")
      .notNull()
      .references(() => faktury.id, { onDelete: "cascade" }),
    bankPohybId: text("bank_pohyb_id").references(() => bankPohyby.id),
    datum: timestamp("datum", { withTimezone: true }).notNull(),
    suma: money("suma").notNull(),
    sposob: formaUhradyEnum("sposob").notNull().default("PREVOD"),
    automaticke: boolean("automaticke").notNull().default(false),
    poznamka: text("poznamka"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uhrady_faktura_idx").on(t.fakturaId)],
);

// ============ ELEKTRONICKÁ POŠTA ============

export const odoslaneMaily = pgTable(
  "odoslane_maily",
  {
    id: id(),
    fakturaId: text("faktura_id").references(() => faktury.id),
    prijemca: text("prijemca").notNull(),
    kopia: text("kopia"),
    predmet: text("predmet").notNull(),
    telo: text("telo").notNull(),
    prilohy: jsonb("prilohy"),
    stav: mailStavEnum("stav").notNull().default("CAKA"),
    chyba: text("chyba"),
    pokusy: integer("pokusy").notNull().default(0),
    odoslanyDna: timestamp("odoslany_dna", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("odoslane_maily_stav_idx").on(t.stav)],
);

export const prijateMaily = pgTable(
  "prijate_maily",
  {
    id: id(),
    messageId: text("message_id").notNull().unique(),
    odosielatel: text("odosielatel").notNull(),
    predmet: text("predmet"),
    datum: timestamp("datum", { withTimezone: true }).notNull(),
    telo: text("telo"),
    pocetPriloh: integer("pocet_priloh").notNull().default(0),
    stav: prijatyMailStavEnum("stav").notNull().default("NOVY"),
    chyba: text("chyba"),
    vytvoreneDoklady: jsonb("vytvorene_doklady"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prijate_maily_stav_idx").on(t.stav), index("prijate_maily_datum_idx").on(t.datum)],
);

// ============ EXPORT + AUDIT ============

export const exporty = pgTable("exporty", {
  id: id(),
  obdobieOd: timestamp("obdobie_od", { withTimezone: true }).notNull(),
  obdobieDo: timestamp("obdobie_do", { withTimezone: true }).notNull(),
  format: text("format").notNull(),
  pocetDokladov: integer("pocet_dokladov").notNull().default(0),
  pocetFaktur: integer("pocet_faktur").notNull().default(0),
  suborUrl: text("subor_url"),
  vytvorilId: text("vytvoril_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    entita: text("entita").notNull(),
    entitaId: text("entita_id").notNull(),
    akcia: text("akcia").notNull(),
    pouzivatelId: text("pouzivatel_id").notNull(),
    detail: text("detail"),
    pred: jsonb("pred"),
    po: jsonb("po"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entita_idx").on(t.entita, t.entitaId), index("audit_created_idx").on(t.createdAt)],
);

// ============ RELÁCIE ============

export const partneriRelations = relations(partneri, ({ many }) => ({
  doklady: many(prijateDoklady),
  faktury: many(faktury),
}));

export const zakazkyRelations = relations(zakazky, ({ many }) => ({
  doklady: many(prijateDoklady),
  faktury: many(faktury),
}));

export const prijateDokladyRelations = relations(prijateDoklady, ({ one }) => ({
  dodavatel: one(partneri, { fields: [prijateDoklady.dodavatelId], references: [partneri.id] }),
  zakazka: one(zakazky, { fields: [prijateDoklady.zakazkaId], references: [zakazky.id] }),
  vytvoril: one(pouzivatelia, { fields: [prijateDoklady.vytvorilId], references: [pouzivatelia.id] }),
  schvalil: one(pouzivatelia, { fields: [prijateDoklady.schvalilId], references: [pouzivatelia.id] }),
  bankPohyb: one(bankPohyby, { fields: [prijateDoklady.bankPohybId], references: [bankPohyby.id] }),
}));

export const fakturyRelations = relations(faktury, ({ one, many }) => ({
  odberatel: one(partneri, { fields: [faktury.odberatelId], references: [partneri.id] }),
  zakazka: one(zakazky, { fields: [faktury.zakazkaId], references: [zakazky.id] }),
  rada: one(ciselneRady, { fields: [faktury.radaId], references: [ciselneRady.id] }),
  vytvoril: one(pouzivatelia, { fields: [faktury.vytvorilId], references: [pouzivatelia.id] }),
  polozky: many(fakturaPolozky),
  uhrady: many(uhrady),
}));

export const fakturaPolozkyRelations = relations(fakturaPolozky, ({ one }) => ({
  faktura: one(faktury, { fields: [fakturaPolozky.fakturaId], references: [faktury.id] }),
}));

export const uhradyRelations = relations(uhrady, ({ one }) => ({
  faktura: one(faktury, { fields: [uhrady.fakturaId], references: [faktury.id] }),
  bankPohyb: one(bankPohyby, { fields: [uhrady.bankPohybId], references: [bankPohyby.id] }),
}));

export const bankPohybyRelations = relations(bankPohyby, ({ one, many }) => ({
  ucet: one(bankUcty, { fields: [bankPohyby.ucetId], references: [bankUcty.id] }),
  uhrady: many(uhrady),
}));

export type Pouzivatel = typeof pouzivatelia.$inferSelect;
export type Partner = typeof partneri.$inferSelect;
export type Zakazka = typeof zakazky.$inferSelect;
export type PrijatyDoklad = typeof prijateDoklady.$inferSelect;
export type Faktura = typeof faktury.$inferSelect;
export type FakturaPolozka = typeof fakturaPolozky.$inferSelect;
export type BankPohyb = typeof bankPohyby.$inferSelect;
export type Firma = typeof firma.$inferSelect;
