import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { firma, ciselneRady, pouzivatelia, bankUcty } from "@/db/schema";
import { vyzadujPrihlasenie } from "@/lib/auth";
import { Nadpis, Karta, Pole, Vstup, Vyber, TextovePole, Tlacidlo, Odznak, Info } from "@/components/ui";
import { formatDatumCas } from "@/lib/stavy";
import { ulozFirmu, ulozRadu, zmenHeslo, pridajPouzivatela } from "./akcie";
import { PrepinacPouzivatela, StavPrepojeni } from "./ui";

export const dynamic = "force-dynamic";

export default async function Nastavenia() {
  const session = await vyzadujPrihlasenie();
  const jeMajitel = session.rola === "MAJITEL";

  const [f, rady, ludia, ucty] = await Promise.all([
    db.select().from(firma).where(eq(firma.id, "firma")).limit(1).then((r) => r[0]),
    db.select().from(ciselneRady).orderBy(asc(ciselneRady.typ)),
    db.select().from(pouzivatelia).orderBy(asc(pouzivatelia.meno)),
    db.select().from(bankUcty),
  ]);

  return (
    <>
      <Nadpis popis="Údaje firmy, číselné rady, používatelia a prepojenia.">Nastavenia</Nadpis>

      <div className="space-y-6">
        <StavPrepojeni
          ocr={Boolean(process.env.ANTHROPIC_API_KEY)}
          smtp={Boolean(process.env.SMTP_HOST)}
          imap={Boolean(process.env.IMAP_HOST)}
          uloziskoS3={Boolean(process.env.S3_BUCKET)}
          adresaPodatelne={process.env.IMAP_USER ?? null}
          pocetUctov={ucty.length}
        />

        <Karta>
          <h2 className="mb-1 font-semibold text-antracit-900">Údaje firmy</h2>
          <p className="mb-4 text-sm text-antracit-500">Tieto údaje idú na každú faktúru.</p>

          {!jeMajitel && (
            <div className="mb-4">
              <Info>Údaje firmy môže meniť len majiteľ.</Info>
            </div>
          )}

          <form action={ulozFirmu} className="space-y-4">
            <fieldset disabled={!jeMajitel} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Pole popis="Obchodné meno">
                    <Vstup name="nazov" required defaultValue={f?.nazov ?? ""} />
                  </Pole>
                </div>
                <Pole popis="IČO">
                  <Vstup name="ico" required inputMode="numeric" defaultValue={f?.ico ?? ""} />
                </Pole>
                <Pole popis="DIČ">
                  <Vstup name="dic" defaultValue={f?.dic ?? ""} />
                </Pole>
                <Pole popis="IČ DPH">
                  <Vstup name="icDph" defaultValue={f?.icDph ?? ""} placeholder="SK2023456789" />
                </Pole>
                <Pole popis="Predvolená splatnosť (dni)">
                  <Vstup
                    name="splatnostDni"
                    type="number"
                    min={0}
                    max={365}
                    defaultValue={String(f?.splatnostDni ?? 14)}
                  />
                </Pole>
              </div>

              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  name="jePlatitelDph"
                  defaultChecked={f?.jePlatitelDph ?? false}
                  className="mt-0.5 h-4 w-4 rounded border-antracit-300"
                />
                <span className="text-sm">
                  <span className="font-medium text-antracit-800">Sme platiteľ DPH</span>
                  <span className="block text-xs text-antracit-500">
                    Ak nie sme, faktúry sa vystavujú bez dane a na PDF pribudne poznámka o neplatiteľovi.
                  </span>
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Pole popis="Ulica a číslo">
                    <Vstup name="ulica" required defaultValue={f?.ulica ?? ""} />
                  </Pole>
                </div>
                <Pole popis="PSČ">
                  <Vstup name="psc" required defaultValue={f?.psc ?? ""} />
                </Pole>
                <Pole popis="Mesto">
                  <Vstup name="mesto" required defaultValue={f?.mesto ?? ""} />
                </Pole>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Pole popis="E-mail">
                  <Vstup type="email" name="email" defaultValue={f?.email ?? ""} />
                </Pole>
                <Pole popis="Telefón">
                  <Vstup name="telefon" defaultValue={f?.telefon ?? ""} />
                </Pole>
                <Pole popis="Web">
                  <Vstup name="web" defaultValue={f?.web ?? ""} />
                </Pole>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Pole popis="IBAN" napoveda="Z neho sa generuje QR platba na faktúre.">
                  <Vstup name="iban" defaultValue={f?.iban ?? ""} />
                </Pole>
                <Pole popis="BIC / SWIFT">
                  <Vstup name="bic" defaultValue={f?.bic ?? ""} />
                </Pole>
                <Pole popis="Banka">
                  <Vstup name="banka" defaultValue={f?.banka ?? ""} />
                </Pole>
              </div>

              <Pole popis="Zápis v obchodnom registri" napoveda="Povinný údaj na faktúre pre s.r.o.">
                <Vstup
                  name="zapisV"
                  defaultValue={f?.zapisV ?? ""}
                  placeholder="Obchodný register OS Trnava, oddiel Sro, vložka č. …"
                />
              </Pole>

              <Pole popis="Text v pätičke faktúry">
                <TextovePole name="patickaText" rows={2} defaultValue={f?.patickaText ?? ""} />
              </Pole>

              <Tlacidlo type="submit">Uložiť údaje firmy</Tlacidlo>
            </fieldset>
          </form>
        </Karta>

        <Karta>
          <h2 className="mb-1 font-semibold text-antracit-900">Číselné rady</h2>
          <p className="mb-4 text-sm text-antracit-500">
            Číslo faktúry vzniká ako predpona + rok + poradie. Počítadlo sa každý rok resetuje.
          </p>

          <div className="space-y-4">
            {rady.map((r) => (
              <form key={r.id} action={ulozRadu} className="rounded-md border border-antracit-200 p-4">
                <input type="hidden" name="id" value={r.id} />
                <fieldset disabled={!jeMajitel}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium text-antracit-900">{r.nazov}</h3>
                    <span className="text-sm tabular-nums text-antracit-500">
                      Ďalšie: {r.prefix}
                      {new Date().getFullYear()}
                      {String((r.rok === new Date().getFullYear() ? r.posledneCislo : 0) + 1).padStart(r.pocetCislic, "0")}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <Pole popis="Predpona">
                      <Vstup name="prefix" defaultValue={r.prefix} maxLength={4} />
                    </Pole>
                    <Pole popis="Počet číslic">
                      <Vstup name="pocetCislic" type="number" min={1} max={8} defaultValue={String(r.pocetCislic)} />
                    </Pole>
                    <Pole popis="Posledné použité" napoveda="Znížiť sa nedá.">
                      <Vstup
                        name="posledneCislo"
                        type="number"
                        min={r.posledneCislo}
                        defaultValue={String(r.posledneCislo)}
                      />
                    </Pole>
                    <div className="flex items-end">
                      <Tlacidlo type="submit" variant="sekundar">
                        Uložiť
                      </Tlacidlo>
                    </div>
                  </div>
                </fieldset>
              </form>
            ))}
          </div>
        </Karta>

        <Karta>
          <h2 className="mb-4 font-semibold text-antracit-900">Zmena hesla</h2>
          <form action={zmenHeslo} className="grid max-w-md gap-4">
            <Pole popis="Súčasné heslo">
              <Vstup type="password" name="stareHeslo" required autoComplete="current-password" />
            </Pole>
            <Pole popis="Nové heslo" napoveda="Minimálne 10 znakov.">
              <Vstup type="password" name="noveHeslo" required minLength={10} autoComplete="new-password" />
            </Pole>
            <Pole popis="Nové heslo znova">
              <Vstup type="password" name="noveHesloZnova" required minLength={10} autoComplete="new-password" />
            </Pole>
            <Tlacidlo type="submit">Zmeniť heslo</Tlacidlo>
          </form>
        </Karta>

        {jeMajitel && (
          <Karta>
            <h2 className="mb-4 font-semibold text-antracit-900">Používatelia</h2>

            <ul className="mb-6 divide-y divide-antracit-100">
              {ludia.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-antracit-900">
                      {u.meno}
                      {u.id === session.id && <span className="ml-2 text-xs text-antracit-500">(ty)</span>}
                    </p>
                    <p className="text-xs text-antracit-500">
                      {u.email} · posledné prihlásenie {u.poslednyLogin ? formatDatumCas(u.poslednyLogin) : "nikdy"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Odznak farba={u.rola === "MAJITEL" ? "zlata" : "sedy"}>
                      {u.rola === "MAJITEL" ? "Majiteľ" : "Účtovníčka"}
                    </Odznak>
                    {!u.aktivny && <Odznak farba="cervena">Neaktívny</Odznak>}
                    {u.id !== session.id && <PrepinacPouzivatela id={u.id} aktivny={u.aktivny} />}
                  </div>
                </li>
              ))}
            </ul>

            <details className="rounded-md border border-antracit-200 bg-antracit-50 p-4">
              <summary className="cursor-pointer font-medium text-antracit-800">Pridať používateľa</summary>
              <form action={pridajPouzivatela} className="mt-4 grid gap-4 sm:grid-cols-2">
                <Pole popis="Meno">
                  <Vstup name="meno" required />
                </Pole>
                <Pole popis="E-mail">
                  <Vstup type="email" name="email" required />
                </Pole>
                <Pole popis="Heslo" napoveda="Minimálne 10 znakov. Odovzdaj ho osobne.">
                  <Vstup type="password" name="heslo" required minLength={10} />
                </Pole>
                <Pole popis="Rola">
                  <Vyber name="rola" defaultValue="UCTOVNIK">
                    <option value="UCTOVNIK">Účtovníčka — vidí a exportuje</option>
                    <option value="MAJITEL">Majiteľ — plný prístup</option>
                  </Vyber>
                </Pole>
                <div className="sm:col-span-2">
                  <Tlacidlo type="submit">Pridať</Tlacidlo>
                </div>
              </form>
            </details>
          </Karta>
        )}
      </div>
    </>
  );
}
