/**
 * Overenie, že chyby vo formulároch vidí používateľ doslova.
 *
 * Musí bežať proti produkčnému buildu (`npm run build && npm run start`) —
 * práve v produkcii Next zahadzuje text výnimiek zo server akcií a práve
 * tam sa chyba prejavila ako celostránková hláška o chybe aplikácie.
 *
 * Spustenie: npx tsx scripts/test-chyby.ts
 */
import "dotenv/config";
import { chromium, type Page } from "playwright";

const URL = process.env.TEST_URL ?? "http://127.0.0.1:3100";
const EMAIL = process.env.TEST_EMAIL ?? "david.dlhos@gmail.com";
const HESLO = process.env.TEST_HESLO ?? "test1234";

let krokov = 0;
let chyb = 0;

function ok(popis: string) {
  krokov++;
  console.log(`  ✓ ${popis}`);
}
function zle(popis: string, detail?: unknown) {
  krokov++;
  chyb++;
  console.log(`  ✗ ${popis}${detail ? `\n      ${detail}` : ""}`);
}

async function textStranky(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/ /g, " ");
}

function jeHavaria(text: string): boolean {
  return /Application error|client-side exception|Internal Server Error|Digest:/i.test(text);
}

/** Vyberie prvého odberateľa – select je vnútri <label> s popisom „Odberateľ". */
async function vyberOdberatela(page: Page) {
  const vybrane = await page.evaluate(() => {
    const stitky = Array.from(document.querySelectorAll("label"));
    const stitok = stitky.find((l) => l.textContent?.trim().startsWith("Odberateľ"));
    const vyber = stitok?.querySelector("select") as HTMLSelectElement | null;
    if (!vyber) return null;
    const moznost = Array.from(vyber.options).find((o) => o.value.length > 10);
    return moznost ? moznost.value : null;
  });
  if (!vybrane) throw new Error("Zoznam odberateľov je prázdny – spusti najprv db:seed a e2e.");
  await page.selectOption('label:has-text("Odberateľ") select', vybrane);
  await page.waitForTimeout(300);
}

async function prihlas(page: Page) {
  await page.goto(`${URL}/prihlasenie`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="heslo"]', HESLO);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("prihlasenie"), { timeout: 20_000 }),
    page.getByRole("button", { name: /Prihlásiť/ }).click(),
  ]);
}

async function main() {
  const prehliadac = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const kontext = await prehliadac.newContext({ viewport: { width: 1400, height: 1100 }, locale: "sk-SK" });
  const page = await kontext.newPage();

  try {
    await prihlas(page);

    console.log("\nFaktúra — položka bez názvu");

    await page.goto(`${URL}/faktury/nova`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await vyberOdberatela(page);

    // cena vyplnená, názov nie – to je naozaj chyba a má sa vypísať
    const ceny = page.locator('input[inputmode="decimal"]');
    await ceny.nth(1).fill("100");
    await page.getByRole("button", { name: /Uložiť ako koncept|Uložiť zmeny/ }).click();
    await page.waitForTimeout(1500);

    const t1 = await textStranky(page);
    if (jeHavaria(t1)) zle("stránka spadla namiesto hlášky", t1.slice(0, 200));
    else if (t1.includes("nemá názov")) ok("chybu vidí používateľ doslova, stránka drží");
    else zle("hláška o chýbajúcom názve sa nezobrazila", t1.slice(0, 300));

    if ((await page.locator('input[name="ico"], input[inputmode="decimal"]').count()) > 0) {
      ok("vyplnené polia ostali na mieste");
    } else zle("formulár sa stratil");

    console.log("\nFaktúra — prázdny riadok navyše");

    await page.goto(`${URL}/faktury/nova`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await vyberOdberatela(page);
    await page.getByRole("button", { name: /Uložiť ako koncept|Uložiť zmeny/ }).click();
    await page.waitForTimeout(1500);

    const t2 = await textStranky(page);
    if (jeHavaria(t2)) zle("prázdny formulár zhodil stránku", t2.slice(0, 200));
    else if (t2.includes("aspoň jednu položku")) ok("prázdna faktúra pýta položku, nehavaruje");
    else zle("nečakaná odpoveď na prázdnu faktúru", t2.replace(/\s+/g, " ").slice(0, 400));

    console.log("\nPartner bez názvu");

    await page.goto(`${URL}/partneri/novy`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await page.fill('input[name="ico"]', "123");
    await page.getByRole("button", { name: /Pridať partnera/ }).click();
    await page.waitForTimeout(1500);
    const t3 = await textStranky(page);
    if (jeHavaria(t3)) zle("partner: stránka spadla", t3.slice(0, 200));
    else ok("partner: stránka drží");

    console.log("\nZákazka bez kódu");

    await page.goto(`${URL}/zakazky/nova`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      document.querySelectorAll("input[required]").forEach((i) => i.removeAttribute("required"));
    });
    await page.getByRole("button", { name: /Založiť zákazku/ }).click();
    await page.waitForTimeout(1500);
    const t4 = await textStranky(page);
    if (jeHavaria(t4)) zle("zákazka: stránka spadla", t4.slice(0, 200));
    else if (/Kód|názov|Vyplň/i.test(t4)) ok("zákazka: chybu vidno vo formulári");
    else zle("zákazka: nečakaná odpoveď", t4.slice(0, 200));

    console.log("\nNastavenia — potvrdenie uloženia");

    await page.goto(`${URL}/nastavenia`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /Uložiť údaje firmy/ }).click();
    await page.waitForTimeout(1500);
    const t5 = await textStranky(page);
    if (jeHavaria(t5)) zle("nastavenia: stránka spadla", t5.slice(0, 200));
    else if (t5.includes("Údaje firmy uložené")) ok("uloženie firmy sa potvrdí hláškou");
    else zle("potvrdenie o uložení chýba", t5.slice(0, 200));
  } catch (e) {
    zle("test spadol", e instanceof Error ? e.message : String(e));
  } finally {
    await prehliadac.close();
  }

  console.log(`\n${krokov - chyb} / ${krokov} krokov prešlo.`);
  if (chyb > 0) {
    console.log(`${chyb} krokov ZLYHALO.\n`);
    process.exit(1);
  }
  console.log("Chyby formulárov sa zobrazujú správne.\n");
}

main();
