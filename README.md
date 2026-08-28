# Doklady — Stavby-Dlhoš, s.r.o.

Interný systém na evidenciu dokladov, fakturáciu, banku a náklady po zákazkách.
Funkčne pokrýva to isté čo Doklado, navyše viaže každý doklad na konkrétnu stavbu.

---

## Čo systém robí

**Prijaté doklady.** Odfotíš bloček mobilom alebo nahráš PDF, Claude z neho vyťaží
dodávateľa, sumu, DPH, dátum a variabilný symbol. Ty už len skontroluješ a schválíš.

**Elektronická podateľňa.** Na adresu `doklady@stavbydlhos.sk` prepošleš faktúru od
dodávateľa — systém si ju sám stiahne, vyťaží a založí ako doklad na kontrolu.

**Vystavovanie faktúr.** Číselné rady bez dier, položky so skupinami (Hrubá stavba,
Strecha), PDF v antracitovo-zlatej schéme, QR platba PAY by square, odoslanie mailom
priamo z detailu faktúry.

**Banka.** Nahráš výpis z internet bankingu (camt.053 XML alebo CSV) a systém spáruje
úhrady s faktúrami podľa variabilného symbolu a sumy. Rovnaký súbor môžeš nahrať
viackrát, pohyby sa nezduplikujú.

**Zákazky.** Ku každej stavbe vidíš skutočné náklady, vyfakturované sumy, rozdiel
a čerpanie rozpočtu — rozpísané po kategóriách (materiál, palivo, subdodávky…).

**Export.** ZIP pre účtovníčku: prijaté doklady, vystavené faktúry, položky faktúr,
rekapitulácia DPH a skeny originálov.

---

## Slovenské špecifiká

| Vec | Ako to systém rieši |
|---|---|
| **Prenos daňovej povinnosti** | Pri fakturácii platiteľovi DPH v tuzemsku sa ponúkne jedným klikom. Faktúra ide bez DPH a PDF automaticky dostane poznámku podľa § 69 ods. 12 písm. j) zákona č. 222/2004 Z. z. |
| **Sadzby DPH** | 23 %, 19 %, 5 % a 0 %. DPH sa počíta zo súčtu základov v danej sadzbe, nie po položkách — inak by pri veľa položkách vznikol rozdiel oproti kontrolnému výkazu. |
| **Neplatiteľ DPH** | Ak vo firemných nastaveniach nie je zaškrtnuté „Sme platiteľ DPH", faktúry idú bez dane a na PDF pribudne poznámka o neplatiteľovi. |
| **Číslovanie faktúr** | Počítadlo sa zvyšuje atómicky priamo v databáze, takže dvaja ľudia nikdy nedostanú rovnaké číslo. Počítadlo sa nedá znížiť a číslované faktúry sa nedajú zmazať — v rade nesmie vzniknúť diera. |
| **e-Faktúra od 1. 1. 2027** | Zákon č. 385/2025 Z. z. zavádza povinné elektronické faktúry cez sieť Peppol. Dátový model už obsahuje všetky povinné náležitosti, takže export do Peppol UBL sa dá doplniť bez prepisovania databázy. |

---

## Nasadenie na Railway

### 1. Repozitár

```bash
cd doklady
git init
git add .
git commit -m "Doklady - prvá verzia"
git remote add origin <adresa-tvojho-repa>
git push -u origin main
```

### 2. Projekt na Railway

1. **New Project → Deploy from GitHub repo** a vyber repozitár.
2. **New → Database → PostgreSQL** v tom istom projekte.
   Premenná `DATABASE_URL` sa doplní sama.
3. V nastaveniach služby zvoľ región **europe-west4 (Amsterdam)** — dáta ostanú v EÚ.
4. **Settings → Networking → Generate Domain**, alebo pridaj vlastnú:
   `doklady.stavbydlhos.sk` (na Websupporte pridaj CNAME záznam, ktorý Railway ukáže).

### 3. Premenné prostredia

V **Variables** nastav aspoň tieto:

```
AUTH_SECRET=<openssl rand -base64 48>
APP_URL=https://doklady.stavbydlhos.sk
ANTHROPIC_API_KEY=<kľúč z console.anthropic.com>
CRON_SECRET=<openssl rand -hex 32>
```

Zvyšok je v `.env.example` aj s vysvetlivkami.

### 4. Prvé spustenie

Migrácie bežia automaticky pri každom nasadení (`railway.json`). Nič v termináli
spúšťať netreba — otvor adresu aplikácie a ukáže sa úvodná obrazovka, kde si
založíš svoj účet a základné údaje firmy.

Len čo prvý účet existuje, úvodná obrazovka sa **navždy zamkne** a každý ďalší
návštevník ide rovno na prihlásenie. Účet pre účtovníčku pridáš v Nastaveniach.

Ak by si predsa len chcel systém naplniť z príkazového riadka (napríklad pri
obnove), slúži na to `npm run db:seed` — heslá vieš zadať cez premenné
`SEED_MAJITEL_HESLO` a `SEED_UCTOVNIK_HESLO`.

### 5. Úložisko skenov

Railway má efemérny disk — po každom nasadení sa vymaže. Bez S3 by si prišiel
o skeny dokladov. Nastav **Cloudflare R2** (pri tvojich objemoch zadarmo):

```
S3_BUCKET=doklady
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Kým to nie je nastavené, Nastavenia → Stav systému na to upozorňujú.

---

## Pošta

### Odosielanie faktúr (SMTP)

Websupport:

```
SMTP_HOST=smtp.m1.websupport.sk
SMTP_PORT=465
SMTP_USER=fakturacia@stavbydlhos.sk
SMTP_PASSWORD=<heslo k schránke>
SMTP_FROM="Stavby-Dlhoš, s.r.o. <fakturacia@stavbydlhos.sk>"
```

Funkčnosť si overíš v sekcii **Pošta → Otestovať odosielanie**.

### Podateľňa (IMAP)

Vo Websupporte si vytvor schránku `doklady@stavbydlhos.sk`:

```
IMAP_HOST=imap.m1.websupport.sk
IMAP_PORT=993
IMAP_USER=doklady@stavbydlhos.sk
IMAP_PASSWORD=<heslo k schránke>
```

Odteraz stačí faktúru od dodávateľa prepošliť na túto adresu. Maily sa nikdy
nemažú, len sa označia ako prečítané — originál ostáva v schránke ako záloha.

---

## Automatické úlohy

Jedna Railway služba spustí všetku údržbu naraz a skončí:

1. **New → GitHub Repo** (ten istý repozitár) → služba sa vytvorí
2. **Settings → Start Command:** `npm run uloha`
3. **Settings → Cron Schedule:** `*/30 * * * *`

Skript stiahne nové doklady z podateľne, označí faktúry po splatnosti, doskúša
spárovať bankové pohyby a znovu odošle maily, ktoré predtým zlyhali. Každá úloha
beží samostatne — keď jedna zlyhá, ostatné dobehnú. Nenastavené moduly preskočí.

Railway počíta rozvrhy v UTC a ďalšie spustenie preskočí, ak predchádzajúce ešte
beží. Preto skript vždy zatvorí spojenie s databázou a ukončí sa.

Ak by si radšej použil externý plánovač, tie isté úlohy sú aj na
`/api/cron/posta`, `/api/cron/splatnost`, `/api/cron/parovanie` a `/api/cron/maily`
— volajú sa s hlavičkou `Authorization: Bearer <CRON_SECRET>`.

## Zálohy

Druhá cron služba, rovnaký postup, iný príkaz a rozvrh:

- **Start Command:** `npm run backup`
- **Cron Schedule:** `0 1 * * *` (03:00 nášho času v lete)

Vytvorí kompletný SQL dump, skomprimuje ho a nahrá do S3/R2. Zálohu drž **mimo
Railway** — výpadok hostingu je otázka minút, strata dát je natrvalo.

**Obnova** na čistej databáze:

```bash
DATABASE_URL="<nová databáza>" npm run db:migrate
gunzip -c doklady-2026-08-21.sql.gz > zaloha.sql
psql "<nová databáza>" -f zaloha.sql
```

Tento postup je overený — záloha sa nahrala do prázdnej databázy a všetky dáta
vrátane faktúr, položiek a bankových pohybov sedeli.

## Vývoj

```bash
npm install
cp .env.example .env      # doplň DATABASE_URL a AUTH_SECRET
npm run db:push           # schéma do databázy
npm run db:seed           # počiatočné dáta
npm run dev               # http://localhost:3000
```

### Testy

```bash
npm run test:vypocty      # DPH, zaokrúhľovanie, parsovanie výpisov
npm run test:e2e          # celý tok v prehliadači (appka musí bežať)
npm run test:chyby        # chyby vo formulároch sa zobrazujú používateľovi
npm run test:duplicita    # ochrana pred dvakrát zadaným dokladom, manifest pre telefón
npm run test:prvystart    # úvodná obrazovka na prázdnej databáze
npm run typecheck
npm run uloha             # ručné spustenie údržby
npm run backup            # ručná záloha
```

Testy výpočtov spusti vždy, keď siahneš na niečo okolo peňazí alebo DPH.

---

## Ako je to poskladané

```
src/
  app/
    (app)/            – prihlásené obrazovky (prehľad, doklady, faktúry, banka…)
    api/              – PDF, súbory, export, cron, kontrola behu
  components/         – zdieľané prvky rozhrania
  db/schema.ts        – dátový model (Drizzle)
  lib/
    money.ts          – peňažná aritmetika v centoch
    dph.ts            – DPH, prenos daňovej povinnosti
    cisla.ts          – číselné rady
    ocr.ts            – vyťaženie dokladu cez Claude API
    pdf/faktura.tsx   – PDF faktúry
    paybysquare.ts    – QR platba
    vypis.ts          – parsovanie bankových výpisov
    parovanie.ts      – párovanie úhrad
    mail-*.ts         – odosielanie a príjem pošty
    export.ts         – balík pre účtovníčku
scripts/              – migrácie, seed, údržba, zálohy, testy
```

**Peniaze sa počítajú v celých centoch.** `src/lib/money.ts` je jediné miesto,
kde sa zaokrúhľuje. Desatinné čísla v JavaScripte nie sú presné, takže s eurami
ako s `number` sa nikde nepracuje.

**Párovanie úhrad je zámerne opatrné.** Spáruje sa len to, čo sedí jednoznačne
(variabilný symbol aj suma). Zvyšok ostane nespárovaný na ručné priradenie —
zle spárovaná platba narobí v účtovníctve viac škody než nespárovaná.

**Chyby formulárov sa vracajú, nevyhadzujú.** Next.js v produkcii zahodí text
každej výnimky zo server akcie a klientovi pošle len anonymný `digest` —
používateľ by namiesto „Položka č. 1 nemá názov" videl hlášku o chybe aplikácie.
Preto chyby vstupu putujú cez `ChybaVstupu` a `src/lib/chyby.ts` ako obyčajná
hodnota a vo formulári sa vypíšu doslova. Skutočné poruchy sa naďalej vyhadzujú
a Next ich zamaskuje — tak to má byť. Overuje to `npm run test:chyby`.

**Všetko podstatné sa loguje.** Vytvorenie, zmena, schválenie, zamietnutie,
odoslanie a storno sú v tabuľke `audit_log` aj s tým, kto to urobil.

---

## Roly

| | Majiteľ | Účtovníčka |
|---|---|---|
| Zakladať doklady a faktúry | áno | áno |
| Schvaľovať a zamietať doklady | áno | nie |
| Mazať doklady | áno | nie |
| Stornovať faktúry | áno | nie |
| Meniť údaje firmy a číselné rady | áno | nie |
| Exportovať pre účtovníctvo | áno | áno |

---

## Licencie

Písmo Work Sans (`src/assets/fonts/`) je pod licenciou SIL Open Font License 1.1 —
plné znenie v `WorkSans-OFL.txt`. Používa sa preto, že zabudované PDF fonty nemajú
slovenskú diakritiku a „č", „ť", „ľ" by sa na faktúrach nevykreslili.
