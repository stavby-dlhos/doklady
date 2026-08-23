CREATE TYPE "public"."doklad_stav" AS ENUM('NOVY', 'NA_SCHVALENIE', 'SCHVALENY', 'ZAMIETNUTY', 'ZAUCTOVANY');--> statement-breakpoint
CREATE TYPE "public"."doklad_typ" AS ENUM('BLOCEK', 'FAKTURA_PRIJATA', 'POKLADNICNY_VYDAJ', 'INY');--> statement-breakpoint
CREATE TYPE "public"."faktura_stav" AS ENUM('KONCEPT', 'ODOSLANA', 'CIASTOCNE_UHRADENA', 'UHRADENA', 'PO_SPLATNOSTI', 'STORNO');--> statement-breakpoint
CREATE TYPE "public"."faktura_typ" AS ENUM('BEZNA', 'ZALOHOVA', 'DOBROPIS');--> statement-breakpoint
CREATE TYPE "public"."forma_uhrady" AS ENUM('PREVOD', 'HOTOVOST', 'KARTA', 'DOBIERKA');--> statement-breakpoint
CREATE TYPE "public"."kategoria" AS ENUM('MATERIAL', 'PALIVO', 'NARADIE', 'SUBDODAVKA', 'SLUZBY', 'REZIA', 'DOPRAVA', 'INE');--> statement-breakpoint
CREATE TYPE "public"."mail_stav" AS ENUM('CAKA', 'ODOSLANY', 'CHYBA');--> statement-breakpoint
CREATE TYPE "public"."partner_typ" AS ENUM('ODBERATEL', 'DODAVATEL', 'OBOJE');--> statement-breakpoint
CREATE TYPE "public"."prijaty_mail_stav" AS ENUM('NOVY', 'SPRACOVANY', 'IGNOROVANY', 'CHYBA');--> statement-breakpoint
CREATE TYPE "public"."rola" AS ENUM('MAJITEL', 'UCTOVNIK');--> statement-breakpoint
CREATE TYPE "public"."smer" AS ENUM('PRICHOD', 'ODCHOD');--> statement-breakpoint
CREATE TYPE "public"."zakazka_stav" AS ENUM('PRIPRAVA', 'AKTIVNA', 'UKONCENA', 'ZRUSENA');--> statement-breakpoint
CREATE TYPE "public"."zdroj_dokladu" AS ENUM('RUCNE', 'EMAIL', 'MOBIL', 'API');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"entita" text NOT NULL,
	"entita_id" text NOT NULL,
	"akcia" text NOT NULL,
	"pouzivatel_id" text NOT NULL,
	"detail" text,
	"pred" jsonb,
	"po" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_pohyby" (
	"id" text PRIMARY KEY NOT NULL,
	"ucet_id" text NOT NULL,
	"datum" timestamp with time zone NOT NULL,
	"suma" numeric(12, 2) NOT NULL,
	"mena" text DEFAULT 'EUR' NOT NULL,
	"smer" "smer" NOT NULL,
	"protiucet_iban" text,
	"protiucet_nazov" text,
	"variabilny_symbol" text,
	"konstantny_symbol" text,
	"specificky_symbol" text,
	"popis" text,
	"bank_ref" text NOT NULL,
	"sparovane" boolean DEFAULT false NOT NULL,
	"import_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_pohyby_bank_ref_unique" UNIQUE("bank_ref")
);
--> statement-breakpoint
CREATE TABLE "bank_ucty" (
	"id" text PRIMARY KEY NOT NULL,
	"nazov" text NOT NULL,
	"iban" text NOT NULL,
	"bic" text,
	"mena" text DEFAULT 'EUR' NOT NULL,
	"vychodzi" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bank_ucty_iban_unique" UNIQUE("iban")
);
--> statement-breakpoint
CREATE TABLE "ciselne_rady" (
	"id" text PRIMARY KEY NOT NULL,
	"kod" text NOT NULL,
	"nazov" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"rok" integer NOT NULL,
	"posledne_cislo" integer DEFAULT 0 NOT NULL,
	"pocet_cislic" integer DEFAULT 4 NOT NULL,
	"typ" "faktura_typ" DEFAULT 'BEZNA' NOT NULL,
	CONSTRAINT "ciselne_rady_kod_unique" UNIQUE("kod")
);
--> statement-breakpoint
CREATE TABLE "exporty" (
	"id" text PRIMARY KEY NOT NULL,
	"obdobie_od" timestamp with time zone NOT NULL,
	"obdobie_do" timestamp with time zone NOT NULL,
	"format" text NOT NULL,
	"pocet_dokladov" integer DEFAULT 0 NOT NULL,
	"pocet_faktur" integer DEFAULT 0 NOT NULL,
	"subor_url" text,
	"vytvoril_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faktura_polozky" (
	"id" text PRIMARY KEY NOT NULL,
	"faktura_id" text NOT NULL,
	"poradie" integer DEFAULT 0 NOT NULL,
	"skupina" text,
	"nazov" text NOT NULL,
	"popis" text,
	"mnozstvo" numeric(12, 3) DEFAULT '1' NOT NULL,
	"mj" text DEFAULT 'ks' NOT NULL,
	"cena_za_mj" numeric(12, 4) DEFAULT '0' NOT NULL,
	"zlava_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"sadzba_dph" integer DEFAULT 23 NOT NULL,
	"zaklad" numeric(12, 2) DEFAULT '0' NOT NULL,
	"dph" numeric(12, 2) DEFAULT '0' NOT NULL,
	"spolu" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faktury" (
	"id" text PRIMARY KEY NOT NULL,
	"cislo" text NOT NULL,
	"rada_id" text NOT NULL,
	"typ" "faktura_typ" DEFAULT 'BEZNA' NOT NULL,
	"odberatel_id" text NOT NULL,
	"zakazka_id" text,
	"datum_vystavenia" timestamp with time zone DEFAULT now() NOT NULL,
	"datum_dodania" timestamp with time zone NOT NULL,
	"datum_splatnosti" timestamp with time zone NOT NULL,
	"variabilny_symbol" text NOT NULL,
	"konstantny_symbol" text,
	"specificky_symbol" text,
	"forma_uhrady" "forma_uhrady" DEFAULT 'PREVOD' NOT NULL,
	"prenos_dph" boolean DEFAULT false NOT NULL,
	"zaklad_23" numeric(12, 2) DEFAULT '0' NOT NULL,
	"zaklad_19" numeric(12, 2) DEFAULT '0' NOT NULL,
	"zaklad_5" numeric(12, 2) DEFAULT '0' NOT NULL,
	"zaklad_0" numeric(12, 2) DEFAULT '0' NOT NULL,
	"dph_23" numeric(12, 2) DEFAULT '0' NOT NULL,
	"dph_19" numeric(12, 2) DEFAULT '0' NOT NULL,
	"dph_5" numeric(12, 2) DEFAULT '0' NOT NULL,
	"dph_spolu" numeric(12, 2) DEFAULT '0' NOT NULL,
	"suma_bez_dph" numeric(12, 2) DEFAULT '0' NOT NULL,
	"suma_celkom" numeric(12, 2) DEFAULT '0' NOT NULL,
	"uhradene" numeric(12, 2) DEFAULT '0' NOT NULL,
	"mena" text DEFAULT 'EUR' NOT NULL,
	"stav" "faktura_stav" DEFAULT 'KONCEPT' NOT NULL,
	"text_pred_polozkami" text,
	"poznamka" text,
	"pdf_url" text,
	"qr_payload" text,
	"odoslana_dna" timestamp with time zone,
	"odoslana_na" text,
	"uhradena_dna" timestamp with time zone,
	"stornovana_dna" timestamp with time zone,
	"vytvoril_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faktury_cislo_unique" UNIQUE("cislo"),
	CONSTRAINT "faktury_variabilny_symbol_unique" UNIQUE("variabilny_symbol")
);
--> statement-breakpoint
CREATE TABLE "firma" (
	"id" text PRIMARY KEY DEFAULT 'firma' NOT NULL,
	"nazov" text NOT NULL,
	"ico" text NOT NULL,
	"dic" text,
	"ic_dph" text,
	"je_platitel_dph" boolean DEFAULT false NOT NULL,
	"ulica" text NOT NULL,
	"mesto" text NOT NULL,
	"psc" text NOT NULL,
	"krajina" text DEFAULT 'Slovensko' NOT NULL,
	"email" text,
	"telefon" text,
	"web" text,
	"iban" text,
	"bic" text,
	"banka" text,
	"logo_url" text,
	"zapis_v" text,
	"paticka_text" text,
	"splatnost_dni" integer DEFAULT 14 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "odoslane_maily" (
	"id" text PRIMARY KEY NOT NULL,
	"faktura_id" text,
	"prijemca" text NOT NULL,
	"kopia" text,
	"predmet" text NOT NULL,
	"telo" text NOT NULL,
	"prilohy" jsonb,
	"stav" "mail_stav" DEFAULT 'CAKA' NOT NULL,
	"chyba" text,
	"pokusy" integer DEFAULT 0 NOT NULL,
	"odoslany_dna" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partneri" (
	"id" text PRIMARY KEY NOT NULL,
	"typ" "partner_typ" DEFAULT 'OBOJE' NOT NULL,
	"nazov" text NOT NULL,
	"ico" text,
	"dic" text,
	"ic_dph" text,
	"je_platitel_dph" boolean DEFAULT false NOT NULL,
	"ulica" text,
	"mesto" text,
	"psc" text,
	"krajina" text DEFAULT 'SK' NOT NULL,
	"iban" text,
	"email" text,
	"telefon" text,
	"poznamka" text,
	"archivovany" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pouzivatelia" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"meno" text NOT NULL,
	"heslo" text NOT NULL,
	"rola" "rola" DEFAULT 'UCTOVNIK' NOT NULL,
	"aktivny" boolean DEFAULT true NOT NULL,
	"posledny_login" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pouzivatelia_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "prijate_doklady" (
	"id" text PRIMARY KEY NOT NULL,
	"typ" "doklad_typ" DEFAULT 'BLOCEK' NOT NULL,
	"cislo_dokladu" text,
	"dodavatel_id" text,
	"zakazka_id" text,
	"kategoria" "kategoria" DEFAULT 'MATERIAL' NOT NULL,
	"zdroj" "zdroj_dokladu" DEFAULT 'RUCNE' NOT NULL,
	"datum_vystavenia" timestamp with time zone NOT NULL,
	"datum_dodania" timestamp with time zone,
	"datum_splatnosti" timestamp with time zone,
	"variabilny_symbol" text,
	"zaklad_dph" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sadzba_dph" integer DEFAULT 23 NOT NULL,
	"suma_dph" numeric(12, 2) DEFAULT '0' NOT NULL,
	"suma_celkom" numeric(12, 2) DEFAULT '0' NOT NULL,
	"mena" text DEFAULT 'EUR' NOT NULL,
	"prenos_dph" boolean DEFAULT false NOT NULL,
	"stav" "doklad_stav" DEFAULT 'NOVY' NOT NULL,
	"popis" text,
	"poznamka" text,
	"zamietnutie_dovod" text,
	"subor_url" text,
	"subor_nazov" text,
	"subor_typ" text,
	"ocr_data" jsonb,
	"ocr_confidence" real,
	"ocr_spustene" boolean DEFAULT false NOT NULL,
	"uhradeny_dna" timestamp with time zone,
	"bank_pohyb_id" text,
	"vytvoril_id" text NOT NULL,
	"schvalil_id" text,
	"schvaleny_dna" timestamp with time zone,
	"exportovany_dna" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prijate_maily" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"odosielatel" text NOT NULL,
	"predmet" text,
	"datum" timestamp with time zone NOT NULL,
	"telo" text,
	"pocet_priloh" integer DEFAULT 0 NOT NULL,
	"stav" "prijaty_mail_stav" DEFAULT 'NOVY' NOT NULL,
	"chyba" text,
	"vytvorene_doklady" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prijate_maily_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "uhrady" (
	"id" text PRIMARY KEY NOT NULL,
	"faktura_id" text NOT NULL,
	"bank_pohyb_id" text,
	"datum" timestamp with time zone NOT NULL,
	"suma" numeric(12, 2) NOT NULL,
	"sposob" "forma_uhrady" DEFAULT 'PREVOD' NOT NULL,
	"automaticke" boolean DEFAULT false NOT NULL,
	"poznamka" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zakazky" (
	"id" text PRIMARY KEY NOT NULL,
	"kod" text NOT NULL,
	"nazov" text NOT NULL,
	"adresa" text,
	"investor" text,
	"stav" "zakazka_stav" DEFAULT 'AKTIVNA' NOT NULL,
	"datum_start" timestamp with time zone,
	"datum_koniec" timestamp with time zone,
	"rozpocet" numeric(12, 2),
	"poznamka" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zakazky_kod_unique" UNIQUE("kod")
);
--> statement-breakpoint
ALTER TABLE "bank_pohyby" ADD CONSTRAINT "bank_pohyby_ucet_id_bank_ucty_id_fk" FOREIGN KEY ("ucet_id") REFERENCES "public"."bank_ucty"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faktura_polozky" ADD CONSTRAINT "faktura_polozky_faktura_id_faktury_id_fk" FOREIGN KEY ("faktura_id") REFERENCES "public"."faktury"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faktury" ADD CONSTRAINT "faktury_rada_id_ciselne_rady_id_fk" FOREIGN KEY ("rada_id") REFERENCES "public"."ciselne_rady"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faktury" ADD CONSTRAINT "faktury_odberatel_id_partneri_id_fk" FOREIGN KEY ("odberatel_id") REFERENCES "public"."partneri"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faktury" ADD CONSTRAINT "faktury_zakazka_id_zakazky_id_fk" FOREIGN KEY ("zakazka_id") REFERENCES "public"."zakazky"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faktury" ADD CONSTRAINT "faktury_vytvoril_id_pouzivatelia_id_fk" FOREIGN KEY ("vytvoril_id") REFERENCES "public"."pouzivatelia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odoslane_maily" ADD CONSTRAINT "odoslane_maily_faktura_id_faktury_id_fk" FOREIGN KEY ("faktura_id") REFERENCES "public"."faktury"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prijate_doklady" ADD CONSTRAINT "prijate_doklady_dodavatel_id_partneri_id_fk" FOREIGN KEY ("dodavatel_id") REFERENCES "public"."partneri"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prijate_doklady" ADD CONSTRAINT "prijate_doklady_zakazka_id_zakazky_id_fk" FOREIGN KEY ("zakazka_id") REFERENCES "public"."zakazky"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prijate_doklady" ADD CONSTRAINT "prijate_doklady_bank_pohyb_id_bank_pohyby_id_fk" FOREIGN KEY ("bank_pohyb_id") REFERENCES "public"."bank_pohyby"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prijate_doklady" ADD CONSTRAINT "prijate_doklady_vytvoril_id_pouzivatelia_id_fk" FOREIGN KEY ("vytvoril_id") REFERENCES "public"."pouzivatelia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prijate_doklady" ADD CONSTRAINT "prijate_doklady_schvalil_id_pouzivatelia_id_fk" FOREIGN KEY ("schvalil_id") REFERENCES "public"."pouzivatelia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uhrady" ADD CONSTRAINT "uhrady_faktura_id_faktury_id_fk" FOREIGN KEY ("faktura_id") REFERENCES "public"."faktury"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uhrady" ADD CONSTRAINT "uhrady_bank_pohyb_id_bank_pohyby_id_fk" FOREIGN KEY ("bank_pohyb_id") REFERENCES "public"."bank_pohyby"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entita_idx" ON "audit_log" USING btree ("entita","entita_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bank_pohyby_datum_idx" ON "bank_pohyby" USING btree ("datum");--> statement-breakpoint
CREATE INDEX "bank_pohyby_sparovane_idx" ON "bank_pohyby" USING btree ("sparovane");--> statement-breakpoint
CREATE INDEX "bank_pohyby_vs_idx" ON "bank_pohyby" USING btree ("variabilny_symbol");--> statement-breakpoint
CREATE INDEX "polozky_faktura_idx" ON "faktura_polozky" USING btree ("faktura_id");--> statement-breakpoint
CREATE INDEX "faktury_stav_idx" ON "faktury" USING btree ("stav");--> statement-breakpoint
CREATE INDEX "faktury_splatnost_idx" ON "faktury" USING btree ("datum_splatnosti");--> statement-breakpoint
CREATE INDEX "faktury_odberatel_idx" ON "faktury" USING btree ("odberatel_id");--> statement-breakpoint
CREATE INDEX "odoslane_maily_stav_idx" ON "odoslane_maily" USING btree ("stav");--> statement-breakpoint
CREATE INDEX "partneri_ico_idx" ON "partneri" USING btree ("ico");--> statement-breakpoint
CREATE INDEX "partneri_nazov_idx" ON "partneri" USING btree ("nazov");--> statement-breakpoint
CREATE INDEX "doklady_datum_idx" ON "prijate_doklady" USING btree ("datum_vystavenia");--> statement-breakpoint
CREATE INDEX "doklady_zakazka_idx" ON "prijate_doklady" USING btree ("zakazka_id");--> statement-breakpoint
CREATE INDEX "doklady_stav_idx" ON "prijate_doklady" USING btree ("stav");--> statement-breakpoint
CREATE INDEX "doklady_dodavatel_idx" ON "prijate_doklady" USING btree ("dodavatel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doklady_bank_pohyb_idx" ON "prijate_doklady" USING btree ("bank_pohyb_id");--> statement-breakpoint
CREATE INDEX "prijate_maily_stav_idx" ON "prijate_maily" USING btree ("stav");--> statement-breakpoint
CREATE INDEX "prijate_maily_datum_idx" ON "prijate_maily" USING btree ("datum");--> statement-breakpoint
CREATE INDEX "uhrady_faktura_idx" ON "uhrady" USING btree ("faktura_id");