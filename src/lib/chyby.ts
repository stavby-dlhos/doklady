/**
 * Chyby, ktoré má vidieť používateľ.
 *
 * Next.js v produkcii zámerne zahodí text každej výnimky, ktorá vyletí zo
 * server akcie – klientovi pošle len anonymný `digest`. Je to správne pri
 * skutočných poruchách (nechceme vypísať útržok SQL do prehliadača), ale
 * zle vyplnený formulár nie je porucha. Používateľ potom namiesto
 * „Každá položka musí mať názov." videl hlášku o chybe aplikácie.
 *
 * Preto sa chyby vstupu nevyhadzujú cez hranicu server/klient, ale vracajú
 * ako obyčajná hodnota. Na klientovi ich `vysledok()` premení späť na
 * výnimku, takže `try/catch` vo formulároch ostáva presne taký, aký bol.
 *
 * Skutočné poruchy sa naďalej vyhadzujú a Next ich zamaskuje – tak to má byť.
 */

const ZNACKA = "__chybaVstupu" as const;

export type OznacenaChyba = { readonly [ZNACKA]: string };

/** Chyba, ktorú spôsobil používateľ – vypíše sa mu doslova. */
export class ChybaVstupu extends Error {
  constructor(sprava: string) {
    super(sprava);
    this.name = "ChybaVstupu";
  }
}

export function jeOznacenaChyba(hodnota: unknown): hodnota is OznacenaChyba {
  return typeof hodnota === "object" && hodnota !== null && ZNACKA in hodnota;
}

/**
 * Presmerovanie a `notFound()` fungujú v Next tak, že vyhodia výnimku.
 * Tú musíme pustiť ďalej, inak by sa presmerovanie nikdy nevykonalo.
 */
function jeRiadeniToku(chyba: unknown): boolean {
  return (
    typeof chyba === "object" &&
    chyba !== null &&
    "digest" in chyba &&
    typeof (chyba as { digest?: unknown }).digest === "string" &&
    (chyba as { digest: string }).digest.startsWith("NEXT_")
  );
}

/** Server: telo akcie; chybu vstupu vráti namiesto vyhodenia. */
export async function obal<T>(telo: () => Promise<T>): Promise<T | OznacenaChyba> {
  try {
    return await telo();
  } catch (e) {
    if (jeRiadeniToku(e)) throw e;
    if (e instanceof ChybaVstupu) return { [ZNACKA]: e.message };
    throw e;
  }
}

/** Klient: rozbalí odpoveď akcie – hodnotu vráti, chybu vstupu vyhodí. */
export async function vysledok<T>(volanie: Promise<T | OznacenaChyba>): Promise<T> {
  const odpoved = await volanie;
  if (jeOznacenaChyba(odpoved)) throw new ChybaVstupu(odpoved[ZNACKA]);
  return odpoved;
}
