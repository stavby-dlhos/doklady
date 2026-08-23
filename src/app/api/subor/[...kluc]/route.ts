import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { nacitajSubor, typPodlaPripony } from "@/lib/storage";

/**
 * Servírovanie skenov dokladov.
 *
 * Súbory nikdy nie sú verejné – každé stiahnutie prejde kontrolou prihlásenia.
 * Kľúč sa kontroluje proti prechodu do nadradených priečinkov.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ kluc: string[] }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ chyba: "Neprihlásený." }, { status: 401 });
  }

  const { kluc } = await params;
  const cesta = kluc.map(decodeURIComponent).join("/");

  if (cesta.includes("..") || cesta.startsWith("/")) {
    return NextResponse.json({ chyba: "Neplatná cesta." }, { status: 400 });
  }

  try {
    const data = await nacitajSubor(cesta);
    const nazov = cesta.split("/").pop() ?? "subor";

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": typPodlaPripony(nazov),
        "Content-Length": String(data.length),
        "Content-Disposition": `inline; filename="${encodeURIComponent(nazov)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ chyba: "Súbor sa nenašiel." }, { status: 404 });
  }
}
