import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pouzivatelia } from "@/db/schema";

const COOKIE = "doklady_session";
const DNI_PLATNOSTI = 7;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET musí byť nastavený a mať aspoň 32 znakov.");
  }
  return new TextEncoder().encode(s);
}

export interface Session {
  id: string;
  email: string;
  meno: string;
  rola: "MAJITEL" | "UCTOVNIK";
}

export async function hashHesla(heslo: string): Promise<string> {
  return bcrypt.hash(heslo, 12);
}

export async function overHeslo(heslo: string, hash: string): Promise<boolean> {
  return bcrypt.compare(heslo, hash);
}

/**
 * Cookie s príznakom Secure prehliadač po nešifrovanom spojení zahodí.
 * V produkcii je preto Secure zapnutý – vypne sa len vtedy, keď je aplikácia
 * vedome prevádzkovaná na http:// (napr. v internej sieti alebo pri testoch).
 */
function jeSecure(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  return !(process.env.APP_URL ?? "").startsWith("http://");
}

export async function vytvorSession(user: Session): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DNI_PLATNOSTI}d`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: jeSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: DNI_PLATNOSTI * 24 * 60 * 60,
  });
}

export async function zmazSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.id || !payload.email) return null;
    return {
      id: payload.id as string,
      email: payload.email as string,
      meno: payload.meno as string,
      rola: payload.rola as Session["rola"],
    };
  } catch {
    return null;
  }
}

/** Použi v každej chránenej stránke a server akcii. */
export async function vyzadujPrihlasenie(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/prihlasenie");
  return s;
}

/** Akcie, ktoré smie robiť len majiteľ (schvaľovanie, mazanie, nastavenia). */
export async function vyzadujMajitela(): Promise<Session> {
  const s = await vyzadujPrihlasenie();
  if (s.rola !== "MAJITEL") {
    throw new Error("Na túto akciu nemáš oprávnenie.");
  }
  return s;
}

export async function prihlas(email: string, heslo: string): Promise<Session> {
  const [user] = await db
    .select()
    .from(pouzivatelia)
    .where(eq(pouzivatelia.email, email.toLowerCase().trim()))
    .limit(1);

  // Rovnaká chybová hláška v oboch prípadoch, aby sa nedalo zisťovať existujúce e-maily.
  const chyba = new Error("Nesprávny e-mail alebo heslo.");
  if (!user || !user.aktivny) {
    await bcrypt.hash("dummy", 12); // vyrovnanie času odpovede
    throw chyba;
  }

  const ok = await overHeslo(heslo, user.heslo);
  if (!ok) throw chyba;

  await db
    .update(pouzivatelia)
    .set({ poslednyLogin: new Date() })
    .where(eq(pouzivatelia.id, user.id));

  const session: Session = { id: user.id, email: user.email, meno: user.meno, rola: user.rola };
  await vytvorSession(session);
  return session;
}
