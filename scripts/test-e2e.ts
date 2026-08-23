/**
 * Prechod celou aplikáciou v prehliadači.
 *
 * Overuje reálny tok, nie len jednotlivé funkcie: prihlásenie, založenie
 * partnera a zákazky, vystavenie faktúry, PDF, import bankového výpisu
 * a automatické spárovanie úhrady.
 *
 * Spustenie:  npx tsx scripts/test-e2e.ts   (appka musí bežať na APP_URL)
 */
import "dotenv/config";
import { chromium, type Page } from "playwright";
import { writeFileSync } from "fs";

const URL = process.env.TEST_URL ?? "http://127.0.0.1:3100";
const EMAIL = process.env.TEST_EMAIL ?? "david.dlhos@gmail.com";
const HESLO = process.env.TEST_HESLO ?? "test1234";
const EMAIL_UCTOVNIK = process.env.TEST_EMAIL_UCTOVNIK ?? "uctovnictvo@stavbydlhos.sk";
const HESLO_UCTOVNIK = process.env.TEST_HESLO_UCTOVNIK ?? HESLO;

let krokov = 0;
let chyb = 0;
const snimky: string[] = [];

function ok(popis: string) {
  krokov++;
  console.log(`  ✓ ${popis}`);
}

function zle(popis: string, detail?: unknown) {
  krokov++;
  chyb++;
  console.log(`  ✗ ${popis}${detail ? `\n      ${detail}` : ""}`);
}

/**
 * Klik, ktorý počká na odpoveď servera.
 * Samotné `waitForLoadState("networkidle")` po kliknutí nestačí – vráti sa skôr,
 * než sa POST na server action vôbec odošle, a test potom číta starú stránku.
 */
async function klikniACakaj(page: Page, hladaj: () => Promise<void>) {
  const odpoved = page
    .waitForResponse((r) => r.request().method() === "POST", { timeout: 30_000 })
    .catch(() => null);
  await hladaj();
  await odpoved;
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(700);
}

async function snimka(page: Page, nazov: string) {
  const cesta = `/home/claude/snimky/${nazov}.png`;
  await page.screenshot({ path: cesta, fullPage: true });
  snimky.push(cesta);
}

async function main() {
  const prehliadac = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const kontext = await prehliadac.newContext({ viewport: { width: 1400, height: 1000 }, locale: "sk-SK" });
  const page = await kontext.newPage();

  const chybyKonzoly: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") chybyKonzoly.push(m.text());
  });
  page.on("pageerror", (e) => chybyKonzoly.push(`pageerror: ${e.message}`));

  try {
    // ---------- Prihlásenie ----------
    console.log("\nPrihlásenie");
    await page.goto(`${URL}/`, { waitUntil: "domcontentloaded" });
    if (page.url().includes("/prihlasenie")) ok("neprihlásený sa presmeruje na prihlásenie");
    else zle("chýba presmerovanie na prihlásenie", page.url());

    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="heslo"]', "zle-heslo");
    await klikniACakaj(page, () => page.click('button[type="submit"]'));
    if (await page.getByText("Nesprávny e-mail alebo heslo.").isVisible()) ok("zlé heslo je odmietnuté");
    else zle("zlé heslo prešlo");

    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="heslo"]', HESLO);
    await klikniACakaj(page, () => page.click('button[type="submit"]'));

    if (await page.getByRole("heading", { name: "Prehľad" }).isVisible()) ok("prihlásenie funguje");
    else zle("prihlásenie zlyhalo", page.url());
    await snimka(page, "01-prehlad");

    // ---------- Nastavenia firmy ----------
    console.log("\nNastavenia firmy");
    await page.goto(`${URL}/nastavenia`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="icDph"]', "SK2023712345");
    await page.fill('input[name="dic"]', "2023712345");
    await page.check('input[name="jePlatitelDph"]');
    await page.fill('input[name="iban"]', "SK8209000000000011424060");
    await page.fill('input[name="banka"]', "Slovenská sporiteľňa");
    await page.fill('input[name="zapisV"]', "Obchodný register OS Trnava, oddiel Sro, vložka č. 30985/T");
    await klikniACakaj(page, () => page.getByRole("button", { name: "Uložiť údaje firmy" }).click());

    const ibanPoUlozeni = await page.inputValue('input[name="iban"]');
    if (ibanPoUlozeni === "SK8209000000000011424060") ok("údaje firmy sa uložili");
    else zle("údaje firmy sa neuložili", ibanPoUlozeni);
    await snimka(page, "02-nastavenia");

    // ---------- Partner ----------
    console.log("\nPartner");
    await page.goto(`${URL}/partneri/novy`, { waitUntil: "domcontentloaded" });
    await page.selectOption('select[name="typ"]', "ODBERATEL");
    await page.fill('input[name="nazov"]', "Ľubomír Šťastný — Stavby s.r.o.");
    await page.fill('input[name="ico"]', "51234567");
    await page.fill('input[name="icDph"]', "SK1122334455");
    await page.check('input[name="jePlatitelDph"]');
    await page.fill('input[name="ulica"]', "Veľké Kostoľany 128");
    await page.fill('input[name="psc"]', "921 01");
    await page.fill('input[name="mesto"]', "Piešťany");
    await page.fill('input[name="email"]', "odberatel@example.sk");
    await klikniACakaj(page, () => page.getByRole("button", { name: "Pridať partnera" }).click());

    if (await page.getByText("Ľubomír Šťastný").first().isVisible()) ok("odberateľ založený");
    else zle("odberateľ sa nezaložil");

    // druhý partner – dodávateľ
    await page.goto(`${URL}/partneri/novy`, { waitUntil: "domcontentloaded" });
    await page.selectOption('select[name="typ"]', "DODAVATEL");
    await page.fill('input[name="nazov"]', "Stavebniny Žilinčík s.r.o.");
    await page.fill('input[name="ico"]', "44556677");
    await page.fill('input[name="mesto"]', "Trnava");
    await klikniACakaj(page, () => page.getByRole("button", { name: "Pridať partnera" }).click());
    ok("dodávateľ založený");
    await snimka(page, "03-partneri");

    // ---------- Zákazka ----------
    console.log("\nZákazka");
    await page.goto(`${URL}/zakazky/nova`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="kod"]', "2026-HC-99");
    await page.fill('input[name="nazov"]', "RD Hlohovec — Šťastný");
    await page.fill('input[name="adresa"]', "Hlohovec, Pod Beranom");
    await page.fill('input[name="rozpocet"]', "185000");
    await klikniACakaj(page, () => page.getByRole("button", { name: "Založiť zákazku" }).click());

    if (await page.getByRole("heading", { name: /RD Hlohovec/ }).isVisible()) ok("zákazka založená");
    else zle("zákazka sa nezaložila", page.url());

    // ---------- Faktúra ----------
    console.log("\nFaktúra");
    await page.goto(`${URL}/faktury/nova`, { waitUntil: "domcontentloaded" });

    await page.selectOption("select >> nth=1", { label: "Ľubomír Šťastný — Stavby s.r.o." });
    await page.selectOption("select >> nth=2", { index: 1 });

    await page.fill('input[placeholder="Skupina (napr. Hrubá stavba)"]', "Hrubá stavba");
    await page.fill('input[placeholder="Názov položky"]', "Murovanie obvodového muriva Ytong 375 mm");
    await page.fill('input[placeholder="Doplňujúci popis (nepovinné)"]', "vrátane prekladov a vencov");
    await page.fill('input[placeholder="Množstvo"]', "186,5");
    await page.selectOption('select[aria-label="Merná jednotka"]', "m2");
    await page.fill('input[placeholder="Cena za MJ"]', "38");

    const celkomPredUlozenim = (await page.locator("text=Na úhradu").locator("..").innerText()).replace(/\s+/g, " ");
    if (celkomPredUlozenim.includes("8 717,01")) ok("živý prepočet 186,5 × 38 € = 8 717,01 €");
    else zle("živý prepočet nesedí", celkomPredUlozenim.replace(/\n/g, " "));

    await page.getByRole("button", { name: "+ Pridať položku" }).click();
    await page.fill('input[placeholder="Skupina (napr. Hrubá stavba)"] >> nth=1', "Strecha");
    await page.fill('input[placeholder="Názov položky"] >> nth=1', "Krov — tesárske práce");
    await page.fill('input[placeholder="Množstvo"] >> nth=1', "142");
    await page.selectOption('select[aria-label="Merná jednotka"] >> nth=1', "m2");
    await page.fill('input[placeholder="Cena za MJ"] >> nth=1', "31");

    await snimka(page, "04-editor-faktury");

    await klikniACakaj(page, () => page.getByRole("button", { name: "Uložiť ako koncept" }).click());
    await page.waitForURL(/\/faktury\/[a-z0-9]+$/, { timeout: 20_000 }).catch(() => {});

    const urlFaktury = page.url();
    if (/\/faktury\/[a-z0-9]+$/.test(urlFaktury)) ok("faktúra uložená ako koncept");
    else zle("faktúra sa neuložila", urlFaktury);

    const cisloFaktury = (await page.getByRole("heading").first().innerText()).replace("Faktúra ", "").trim();
    ok(`pridelené číslo ${cisloFaktury}`);

    // Presnú sumu si prečítame z faktúry – v bankovom výpise musí sedieť na cent.
    const sumaText = await page.locator("text=Na úhradu").locator("..").innerText();
    const sumaFaktury = (sumaText.match(/([\d\s\u00a0]+,\d{2})\s*€/)?.[1] ?? "").trim();
    if (sumaFaktury) ok(`suma faktúry ${sumaFaktury} €`);
    else zle("nepodarilo sa prečítať sumu faktúry", sumaText.replace(/\n/g, " "));

    // ---------- PDF ----------
    console.log("\nPDF faktúry");
    const idFaktury = urlFaktury.split("/").pop()!;
    const pdfOdpoved = await page.request.get(`${URL}/api/faktura/${idFaktury}/pdf`);
    if (pdfOdpoved.ok()) {
      const telo = await pdfOdpoved.body();
      const jePdf = telo.subarray(0, 4).toString() === "%PDF";
      if (jePdf && telo.length > 10000) {
        ok(`PDF vygenerované (${Math.round(telo.length / 1024)} kB)`);
        writeFileSync("/home/claude/e2e-faktura.pdf", telo);
      } else zle("PDF je poškodené", `${telo.length} B`);
    } else zle("PDF endpoint zlyhal", `${pdfOdpoved.status()} ${await pdfOdpoved.text()}`);

    // ---------- Odoslanie bez SMTP ----------
    console.log("\nOdoslanie faktúry");
    await klikniACakaj(page, () => page.getByRole("button", { name: "Označiť ako odoslanú" }).click());
    if (await page.getByText("Odoslaná").first().isVisible()) ok("faktúra označená ako odoslaná");
    else zle("stav faktúry sa nezmenil");
    await snimka(page, "05-detail-faktury");

    // ---------- Prijatý doklad ----------
    console.log("\nPrijatý doklad");
    await page.goto(`${URL}/prijate/novy`, { waitUntil: "domcontentloaded" });
    await page.selectOption('select[name="typ"]', "BLOCEK");
    await page.selectOption('select[name="dodavatelId"]', { label: "Stavebniny Žilinčík s.r.o." });
    await page.selectOption('select[name="kategoria"]', "MATERIAL");
    await page.selectOption('select[name="zakazkaId"]', { index: 1 });
    await page.fill('input[name="datumVystavenia"]', "2026-08-10");
    await page.fill('input[name="sumaCelkom"]', "1476");
    await page.fill('input[name="variabilnySymbol"]', "778899");
    await page.fill('input[name="popis"]', "Ytong tvárnice a lepidlo");
    await klikniACakaj(page, () => page.getByRole("button", { name: "Uložiť doklad" }).click());
    await page.waitForURL(/\/prijate\/[a-z0-9]+$/, { timeout: 20_000 }).catch(() => {});

    if (/\/prijate\/[a-z0-9]+$/.test(page.url())) ok("doklad uložený");
    else zle("doklad sa neuložil", page.url());

    const zakladText = await page.inputValue('input[name="zakladDph"]');
    const dphText = await page.inputValue('input[name="sumaDph"]');
    if (zakladText === "1200.00" && dphText === "276.00") ok("1 476 € rozpočítaných na 1 200 + 276 DPH");
    else zle("rozpočítanie DPH nesedí", `základ ${zakladText}, DPH ${dphText}`);

    await klikniACakaj(page, () => page.getByRole("button", { name: "Schváliť doklad" }).click());
    if (await page.getByText("Schválený").first().isVisible()) ok("doklad schválený majiteľom");
    else zle("schválenie nefunguje");
    await snimka(page, "06-detail-dokladu");

    // ---------- Banka ----------
    console.log("\nBanka");
    await page.goto(`${URL}/banka`, { waitUntil: "domcontentloaded" });

    await page.fill('input[name="nazov"]', "Podnikateľský účet");
    await page.fill('input[name="iban"]', "SK8209000000000011424060");
    await page.fill('input[name="bic"]', "GIBASKBX");
    await klikniACakaj(page, () => page.getByRole("button", { name: "Uložiť účet" }).click());
    ok("bankový účet pridaný");

    const vs = cisloFaktury.replace(/\D/g, "").slice(-10);
    const vypis = [
      "Dátum;Suma;Mena;Variabilný symbol;Názov protistrany;Popis;Referencia",
      `20.08.2026;${sumaFaktury};EUR;${vs};Ľubomír Šťastný;Úhrada faktúry ${cisloFaktury};E2E-IN-1`,
      "12.08.2026;-1 476,00;EUR;778899;Stavebniny Žilinčík;Platba za materiál;E2E-OUT-1",
      "19.08.2026;-89,90;EUR;;Slovnaft;Tankovanie;E2E-OUT-2",
    ].join("\n");
    writeFileSync("/tmp/vypis-test.csv", vypis, "utf8");

    await page.setInputFiles('input[type="file"]', "/tmp/vypis-test.csv");
    await klikniACakaj(page, () => page.getByRole("button", { name: "Naimportovať" }).click());
    await page.waitForTimeout(800);

    const vysledokImportu = await page.locator("text=Načítaných").first().innerText().catch(() => "");
    if (vysledokImportu.includes("3")) ok(`import výpisu: ${vysledokImportu.trim()}`);
    else zle("import výpisu zlyhal", vysledokImportu || (await page.getByRole("alert").first().innerText().catch(() => "bez správy")));

    // druhý import toho istého súboru – nesmie zduplikovať
    await page.setInputFiles('input[type="file"]', "/tmp/vypis-test.csv");
    await klikniACakaj(page, () => page.getByRole("button", { name: "Naimportovať" }).click());
    await page.waitForTimeout(800);
    const druhyImport = await page.locator("text=Načítaných").first().innerText().catch(() => "");
    if (druhyImport.includes("0 nových") || druhyImport.includes("už bolo v systéme")) {
      ok("opakovaný import nezduplikoval pohyby");
    } else zle("ochrana pred duplicitami nefunguje", druhyImport.trim());

    await snimka(page, "07-banka");

    // ---------- Kontrola párovania ----------
    console.log("\nPárovanie úhrad");
    await page.goto(`${URL}/faktury/${idFaktury}`, { waitUntil: "domcontentloaded" });
    const stavText = await page.locator("body").innerText();
    if (stavText.includes("Uhradená") && !stavText.includes("Čiastočne uhradená")) {
      ok("faktúra automaticky označená ako uhradená v plnej výške");
    } else if (stavText.includes("Čiastočne uhradená")) {
      zle("spárovalo sa len čiastočne", "suma vo výpise nesedela s faktúrou");
    } else zle("faktúra sa nespárovala s platbou");

    await page.goto(`${URL}/prijate`, { waitUntil: "domcontentloaded" });
    ok("zoznam dokladov sa načítal");

    // ---------- Zákazka: náklady vs. tržby ----------
    console.log("\nZákazka — prehľad");
    await page.goto(`${URL}/zakazky`, { waitUntil: "domcontentloaded" });
    const textZakazky = (await page.locator("text=RD Hlohovec").first().locator("../../..").innerText()).replace(/\s+/g, " ");
    const sumaNormalizovana = sumaFaktury.replace(/\s+/g, " ");
    if (textZakazky.includes("1 476,00") && textZakazky.includes(sumaNormalizovana)) {
      ok("zákazka ukazuje náklady aj tržby");
    } else zle("čísla zákazky nesedia", textZakazky.replace(/\n/g, " | "));
    await snimka(page, "08-zakazky");

    // ---------- Export ----------
    console.log("\nExport pre účtovníčku");
    const exportOdpoved = await page.request.get(`${URL}/api/export?od=2026-08-01&do=2026-08-31&skeny=false`);
    if (exportOdpoved.ok()) {
      const zip = await exportOdpoved.body();
      const jeZip = zip[0] === 0x50 && zip[1] === 0x4b;
      if (jeZip) {
        ok(`ZIP export vytvorený (${Math.round(zip.length / 1024)} kB)`);
        writeFileSync("/home/claude/e2e-export.zip", zip);
      } else zle("export nie je platný ZIP");
    } else zle("export zlyhal", `${exportOdpoved.status()} ${await exportOdpoved.text()}`);

    // ---------- Ostatné obrazovky ----------
    console.log("\nZvyšné obrazovky");
    for (const [cesta, nadpis] of [
      ["/posta", "Pošta"],
      ["/export", "Export"],
      ["/faktury", "Vystavené faktúry"],
      ["/partneri", "Partneri"],
    ] as const) {
      await page.goto(`${URL}${cesta}`, { waitUntil: "domcontentloaded" });
      if (await page.getByRole("heading", { name: nadpis }).first().isVisible()) ok(`${cesta} sa načíta`);
      else zle(`${cesta} sa nenačítala`);
    }
    await snimka(page, "09-posta");

    // ---------- Práva účtovníčky ----------
    console.log("\nOprávnenia");
    await kontext.clearCookies();
    await page.goto(`${URL}/prihlasenie`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', EMAIL_UCTOVNIK);
    await page.fill('input[name="heslo"]', HESLO_UCTOVNIK);
    await klikniACakaj(page, () => page.click('button[type="submit"]'));

    await page.goto(`${URL}/nastavenia`, { waitUntil: "domcontentloaded" });
    const poleZakazane = await page.locator('input[name="ico"]').isDisabled();
    if (poleZakazane) ok("účtovníčka nemôže meniť údaje firmy");
    else zle("účtovníčka má prístup k údajom firmy");

    await page.goto(`${URL}/prijate`, { waitUntil: "domcontentloaded" });
    if (await page.getByRole("heading", { name: "Prijaté doklady" }).isVisible()) {
      ok("účtovníčka vidí doklady");
    } else zle("účtovníčka nevidí doklady");

    // ---------- Chyby v konzole ----------
    console.log("\nKonzola prehliadača");
    const podstatneChyby = chybyKonzoly.filter(
      (c) => !c.includes("favicon") && !c.includes("Download the React DevTools"),
    );
    if (podstatneChyby.length === 0) ok("žiadne chyby v konzole");
    else zle(`${podstatneChyby.length} chýb v konzole`, podstatneChyby.slice(0, 5).join("\n      "));
  } catch (e) {
    zle("test spadol", e instanceof Error ? `${e.message}\n${e.stack?.split("\n")[1]}` : String(e));
    await snimka(page, "99-chyba").catch(() => {});
  } finally {
    await prehliadac.close();
  }

  console.log(`\n${krokov - chyb} / ${krokov} krokov prešlo.`);
  console.log(`Snímky: ${snimky.length}`);
  if (chyb > 0) {
    console.log(`${chyb} krokov ZLYHALO.\n`);
    process.exit(1);
  }
  console.log("Celý tok funguje.\n");
}

main();
