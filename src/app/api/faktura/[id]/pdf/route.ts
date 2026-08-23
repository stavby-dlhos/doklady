import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { zostavPdf } from "@/app/(app)/faktury/akcie";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ chyba: "Neprihlásený." }, { status: 401 });

  const { id } = await params;

  try {
    const { pdf, nazov } = await zostavPdf(id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `inline; filename="${nazov}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { chyba: e instanceof Error ? e.message : "PDF sa nepodarilo vytvoriť." },
      { status: 400 },
    );
  }
}
