/**
 * Overenie úvodnej obrazovky na úplne prázdnej databáze — presne v stave,
 * v akom je systém hneď po nasadení.
 *
 * Spustenie: npx tsx scripts/test-prvystart.ts
 */
import "dotenv/config";
import { chromium, type Page } from "playwright";

const URL = process.env.TEST_URL ?? "http://127.0.0.1:3100";

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

async function klikniACakaj(page: Page, akcia: () => Promise<void>) {
  const odpoved = page
    .waitForResponse((r) => r.request().method() === "POST", { timeout: 30_000 })
    .catch(() => null);
  await akcia();
  await odpoved;
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(700);
}

async function main() {
  const prehliadac = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const kontext = await prehliadac.newContext({ viewport: { width: 1400, height: 1100 }, locale: "sk-SK" });
  const page = await kontext.newPage();

  try {
    console.log("\nPrázdny systém");

    await page.goto(`${URL}/`, { waitUntil: "domcontentloaded" });
    if (page.url().endsWith("/uvod")) ok("koreň appky presmeruje na úvodnú obrazovku");
    else zle("nepresmerovalo na /uvod", page.url());

    await page.goto(`${URL}/prihlasenie`, { waitUntil: "domcontentloaded" });
    if (page.url().endsWith("/uvod")) ok("prihlásenie tiež presmeruje na úvod");
    else zle("prihlásenie nepresmerovalo", page.url());

    await page.screenshot({ path: "/home/claude/snimky/10-uvod.png", fullPage: true });

    console.log("\nValidácia");

    await page.fill('input[name="meno"]', "David Dlhoš");
    await page.fill('input[name="email"]', "david.dlhos@gmail.com");
    await page.fill('input[name="heslo"]', "kratke123");
    await page.fill('input[name="hesloZnova"]', "kratke123");
    await klikniACakaj(page, () => page.getByRole("button", { name: /Založiť/ }).click());
    const kratke = await page.getByText("aspoň 10 znakov", { exact: false }).count();
    if (kratke > 0 || (await page.getByRole("alert").count()) > 0) ok("krátke heslo je odmietnuté");
    else zle("krátke heslo prešlo");

    await page.fill('input[name="heslo"]', "SilneHeslo2026!");
    await page.fill('input[name="hesloZnova"]', "IneHeslo2026!");
    await klikniACakaj(page, () => page.getByRole("button", { name: /Založiť/ }).click());
    if (await page.getByText("Heslá sa nezhodujú.").isVisible().catch(() => false)) {
      ok("nezhodné heslá sú odmietnuté");
    } else zle("nezhodné heslá prešli");

    console.log("\nZaloženie");

    await page.fill('input[name="heslo"]', "SilneHeslo2026!");
    await page.fill('input[name="hesloZnova"]', "SilneHeslo2026!");
    await page.check('input[name="jePlatitelDph"]');
    await klikniACakaj(page, () => page.getByRole("button", { name: /Založiť/ }).click());
    await page.waitForURL((u) => !u.pathname.startsWith("/uvod"), { timeout: 20_000 }).catch(() => {});

    if (await page.getByRole("heading", { name: "Prehľad" }).isVisible().catch(() => false)) {
      ok("po založení je používateľ rovno prihlásený");
    } else zle("po založení sa neprihlásil", page.url());

    await page.screenshot({ path: "/home/claude/snimky/11-po-zalozeni.png", fullPage: true });

    console.log("\nZamknutie úvodnej obrazovky");

    await page.goto(`${URL}/uvod`, { waitUntil: "domcontentloaded" });
    if (page.url().endsWith("/prihlasenie") || page.url().endsWith("/")) {
      ok("úvodná obrazovka sa po založení zamkla");
    } else zle("úvodná obrazovka je stále prístupná", page.url());

    // aj pre úplne cudzieho návštevníka
    const cudzi = await prehliadac.newContext();
    const cudziPage = await cudzi.newPage();
    await cudziPage.goto(`${URL}/uvod`, { waitUntil: "domcontentloaded" });
    if (cudziPage.url().endsWith("/prihlasenie")) ok("neprihlásený sa na úvod nedostane");
    else zle("neprihlásený sa dostal na úvod", cudziPage.url());
    await cudzi.close();

    console.log("\nČo sa založilo");

    await page.goto(`${URL}/nastavenia`, { waitUntil: "domcontentloaded" });
    const ico = await page.inputValue('input[name="ico"]').catch(() => "");
    if (ico === "47022906") ok("údaje firmy sú uložené");
    else zle("údaje firmy chýbajú", ico);

    const platitel = await page.isChecked('input[name="jePlatitelDph"]').catch(() => false);
    if (platitel) ok("príznak platiteľa DPH sa preniesol");
    else zle("príznak platiteľa DPH sa nepreniesol");

    const pocetRad = await page.locator('input[name="prefix"]').count();
    if (pocetRad === 3) ok("založené tri číselné rady");
    else zle("číselné rady nesedia", `${pocetRad} namiesto 3`);

    await page.goto(`${URL}/faktury/nova`, { waitUntil: "domcontentloaded" });
    const textStranky = await page.locator("body").innerText();
    if (textStranky.includes("Najprv si založ odberateľa")) {
      ok("fakturácia je pripravená a pýta si prvého odberateľa");
    } else zle("fakturácia sa nesprávala podľa očakávania");

    await page.screenshot({ path: "/home/claude/snimky/12-nastavenia-po-zalozeni.png", fullPage: true });
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
  console.log("Prvé spustenie funguje bez terminálu.\n");
}

main();
