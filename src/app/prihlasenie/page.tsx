import { redirect } from "next/navigation";
import { getSession, prihlas } from "@/lib/auth";
import { Vstup, Tlacidlo, Chyba, Pole } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Prihlasenie({
  searchParams,
}: {
  searchParams: Promise<{ chyba?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const { chyba } = await searchParams;

  async function odosli(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const heslo = String(formData.get("heslo") ?? "");

    try {
      await prihlas(email, heslo);
    } catch (e) {
      const sprava = e instanceof Error ? e.message : "Prihlásenie zlyhalo.";
      redirect(`/prihlasenie?chyba=${encodeURIComponent(sprava)}`);
    }
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-antracit-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-1 w-12 rounded bg-zlata-500" />
          <h1 className="text-xl font-bold text-white">Doklady</h1>
          <p className="mt-1 text-sm text-antracit-400">Stavby-Dlhoš, s.r.o.</p>
        </div>

        <form action={odosli} className="space-y-4 rounded-lg bg-white p-6 shadow-lg">
          {chyba && <Chyba>{chyba}</Chyba>}

          <Pole popis="E-mail">
            <Vstup
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              placeholder="meno@stavbydlhos.sk"
            />
          </Pole>

          <Pole popis="Heslo">
            <Vstup name="heslo" type="password" autoComplete="current-password" required minLength={6} />
          </Pole>

          <Tlacidlo type="submit" className="w-full">
            Prihlásiť sa
          </Tlacidlo>
        </form>

        <p className="mt-6 text-center text-xs text-antracit-500">
          Prístup len pre poverené osoby. Všetky akcie sa zaznamenávajú.
        </p>
      </div>
    </main>
  );
}
