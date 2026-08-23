import { NextResponse } from "next/server";
import { zmazSession } from "@/lib/auth";

export async function POST(request: Request) {
  await zmazSession();
  return NextResponse.redirect(new URL("/prihlasenie", request.url), { status: 303 });
}
