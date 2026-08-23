import { NextResponse } from "next/server";
import { sql } from "@/db";

/**
 * Kontrola behu aplikácie pre Railway a externý monitoring.
 * Nevracia nič citlivé – len či appka žije a či vidí databázu.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`SELECT 1`;
    return NextResponse.json({ stav: "ok", databaza: "ok", cas: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { stav: "chyba", databaza: "nedostupná", cas: new Date().toISOString() },
      { status: 503 },
    );
  }
}
