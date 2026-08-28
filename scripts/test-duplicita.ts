/**
 * Ochrana pred tým istým dokladom zadaným druhýkrát.
 *
 * Doklad sa do systému dostane tromi cestami — odfotením, prepošlením mailom
 * a ručne. Zaplatiť jednu faktúru dvakrát je drahšie než jeden klik navyše.
 *
 * Spustenie proti bežiacej appke: npx tsx scripts/test-duplicita.ts
 */
import "dotenv/config";
import { chromium, type Page } from "playwright";

const ADRESA = process.env.TEST_URL ?? "http://127.0.0.1:3100";
const EMAIL = process.env.TEST_EMAIL ?? "david.dlhos@gmail.com";
const HESLO = process.env.TEST_HESLO ?? "test1234";

const CISLO = `DUP-${Date.now()}`;
const SUMA = "246";

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

async function text(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

async function vyplnDoklad(page: Page) {
  await page.goto(`${ADRESA}/prijate/novy`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  const dodavatel = await page.evaluate(() => {
    const stitok = Array.from(document.querySelectorAll("label")).find((l) =>
      l.textContent?.trim().startsWith("Dodávateľ"),
    );
    const vyber = stitok?.querySelector("select") as HTMLSelectElement | null;
    const moznost = vyber ? Array.from(vyber.options).find((o) => o.value.length > 10) : null;
    return moznost?.value ?? null;
  });
  if (!dodavatel) throw new Error("V systéme nie je dodávateľ.");

  await page.selectOption('label:has-text("Dodávateľ") select', dodavatel);
  await page.fill('input[name="cisloDokladu"]', CISLO);
  await page.fill('input[name="sumaCelkom"]', SUMA);
  await page.fill('input[name="datumVystavenia"]', "2026-08-20");
}

async function main() {
  const prehliadac = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await (await prehliadac.newContext({ locale: "sk-SK" })).newPage();

  try {
    await page.goto(`${ADRESA}/prihlasenie`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="heslo"]', HESLO);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes("prihlasenie"), { timeout: 20_000 }),
      page.getByRole("button", { name: /Prihlásiť/ }).click(),
    ]);

    // Test si dodávateľa založí sám, aby nezávisel na poradí spúšťania.
    await page.goto(`${ADRESA}/partneri/novy`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await page.selectOption('select[name="typ"]', "DODAVATEL");
    await page.fill('input[name="nazov"]', `Stavebniny Test ${Date.now()}`);
    await page.getByRole("button", { name: /Pridať partnera/ }).click();
    await page.waitForTimeout(1500);

    console.log("\nPrvé uloženie");

    await vyplnDoklad(page);
    await page.getByRole("button", { name: /Uložiť doklad/ }).click();
    await page.waitForURL(/\/prijate\/[0-9a-zA-Z-]+$/, { timeout: 20_000 }).catch(() => {});
    if (/\/prijate\/[^/]+$/.test(page.url().replace(ADRESA, ""))) ok("doklad sa uložil");
    else zle("prvé uloženie neprešlo", page.url());

    console.log("\nTen istý doklad druhýkrát");

    await vyplnDoklad(page);
    await page.getByRole("button", { name: /Uložiť doklad/ }).click();
    await page.waitForTimeout(1800);

    const t = await text(page);
    if (/Application error|client-side exception/i.test(t)) zle("stránka spadla", t.slice(0, 200));
    else if (t.includes("už v systéme je")) ok("systém dvojníka zachytil a povedal to zrozumiteľne");
    else zle("dvojník prešiel bez upozornenia", t.slice(0, 300));

    if (await page.locator('input[name="potvrdenyDvojnik"]').isVisible().catch(() => false)) {
      ok("ponúklo sa potvrdenie pre prípad, že ide naozaj o iný doklad");
    } else zle("potvrdzovacie políčko sa nezobrazilo");

    console.log("\nPotvrdené ako iný doklad");

    await page.check('input[name="potvrdenyDvojnik"]');
    await page.getByRole("button", { name: /Uložiť doklad/ }).click();
    await page.waitForURL(/\/prijate\/[0-9a-zA-Z-]+$/, { timeout: 20_000 }).catch(() => {});
    if (/\/prijate\/[^/]+$/.test(page.url().replace(ADRESA, ""))) ok("po potvrdení sa doklad uloží");
    else zle("potvrdenie nepomohlo", (await text(page)).slice(0, 300));

    console.log("\nManifest pre telefón");

    const manifest = await page.evaluate(async (u) => {
      const r = await fetch(`${u}/manifest.webmanifest`);
      return { stav: r.status, telo: await r.json() };
    }, ADRESA);
    if (manifest.stav === 200 && manifest.telo.display === "standalone" && manifest.telo.icons?.length >= 2) {
      ok("appka sa dá pridať na plochu telefónu");
    } else zle("manifest nesedí", JSON.stringify(manifest).slice(0, 200));

    const ikona = await page.evaluate(async (u) => (await fetch(`${u}/ikona-512.png`)).status, ADRESA);
    if (ikona === 200) ok("ikona sa načíta");
    else zle("ikona chýba", ikona);
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
  console.log("Ochrana pred duplicitou a mobilná appka fungujú.\n");
}

main();
