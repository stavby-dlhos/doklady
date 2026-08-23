import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { exporty } from "@/db/schema";
import { pripravExport } from "@/lib/export";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ chyba: "Neprihlásený." }, { status: 401 });

  const url = new URL(request.url);
  const od = url.searchParams.get("od");
  const doDatumu = url.searchParams.get("do");

  if (!od || !doDatumu) {
    return NextResponse.json({ chyba: "Zadaj obdobie od–do." }, { status: 400 });
  }

  const odDate = new Date(`${od}T00:00:00`);
  const doDate = new Date(`${doDatumu}T23:59:59`);

  if (Number.isNaN(odDate.getTime()) || Number.isNaN(doDate.getTime())) {
    return NextResponse.json({ chyba: "Neplatné dátumy." }, { status: 400 });
  }
  if (odDate > doDate) {
    return NextResponse.json({ chyba: "Dátum „od“ musí byť skôr než „do“." }, { status: 400 });
  }

  try {
    const vysledok = await pripravExport({
      od: odDate,
      do: doDate,
      zahrnutSkeny: url.searchParams.get("skeny") !== "false",
      lenSchvalene: url.searchParams.get("lenSchvalene") !== "false",
    });

    if (vysledok.pocetDokladov === 0 && vysledok.pocetFaktur === 0) {
      return NextResponse.json(
        { chyba: "V zadanom období nie sú žiadne doklady ani faktúry." },
        { status: 404 },
      );
    }

    await db.insert(exporty).values({
      obdobieOd: odDate,
      obdobieDo: doDate,
      format: "ZIP (CSV + skeny)",
      pocetDokladov: vysledok.pocetDokladov,
      pocetFaktur: vysledok.pocetFaktur,
      vytvorilId: session.id,
    });

    return new NextResponse(new Uint8Array(vysledok.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(vysledok.zip.length),
        "Content-Disposition": `attachment; filename="${vysledok.nazovSuboru}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { chyba: e instanceof Error ? e.message : "Export zlyhal." },
      { status: 500 },
    );
  }
}
