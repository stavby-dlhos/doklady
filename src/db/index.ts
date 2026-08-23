import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Spojenie s databázou.
 *
 * Klient sa vytvára až pri prvom skutočnom dotaze, nie pri načítaní modulu.
 * Vďaka tomu prejde `next build` aj bez DATABASE_URL — build len prekladá kód
 * a nemá dôvod siahať na databázu. Chýbajúcu premennú tak ohlási až beh
 * aplikácie, a to zrozumiteľnou hláškou.
 *
 * V dev režime Next.js prekladá moduly opakovane, preto klienta držíme na
 * globálnom objekte — inak by sa pri každom hot reloade otvorilo nové spojenie.
 */

const globalForDb = globalThis as unknown as {
  __sql?: ReturnType<typeof postgres>;
  __db?: ReturnType<typeof drizzle<typeof schema>>;
};

function vytvorKlienta(): ReturnType<typeof postgres> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Chýba premenná DATABASE_URL. Na Railway ju doplní pridaná PostgreSQL databáza, " +
        "lokálne ju nastav v súbore .env.",
    );
  }

  return postgres(connectionString, {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  });
}

function klient(): ReturnType<typeof postgres> {
  if (!globalForDb.__sql) globalForDb.__sql = vytvorKlienta();
  return globalForDb.__sql;
}

function instancia(): ReturnType<typeof drizzle<typeof schema>> {
  if (!globalForDb.__db) globalForDb.__db = drizzle(klient(), { schema });
  return globalForDb.__db;
}

/**
 * `db` aj `sql` sa tvária ako bežné objekty, ale spojenie otvoria až pri prvom
 * použití. Preto tu je Proxy a nie priama hodnota.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_ciel, vlastnost, prijemca) {
    return Reflect.get(instancia(), vlastnost, prijemca);
  },
});

export const sql = new Proxy((() => {}) as unknown as ReturnType<typeof postgres>, {
  get(_ciel, vlastnost, prijemca) {
    return Reflect.get(klient(), vlastnost, prijemca);
  },
  apply(_ciel, _this, argumenty) {
    return (klient() as unknown as (...a: unknown[]) => unknown)(...argumenty);
  },
});

export { schema };
