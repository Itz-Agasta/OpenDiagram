import { env } from "@OpenDiagram/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export { and, desc, eq, exists, inArray, lt, ne, notInArray, or, sql } from "drizzle-orm";

export function createDb() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // `pg` defaults this to 0, which means queue forever: one PATCH sat 66s
    // against the Supavisor pooler before the socket died.
    connectionTimeoutMillis: 10_000,
  });

  // Drizzle attaches no 'error' listener of its own, and pg-pool re-emits an idle
  // client's error on the pool. Unheard, that is fatal in Node, so one connection
  // dropped by the pooler would take the server down instead of one request.
  pool.on("error", (error) => {
    console.error("[db] idle client error", error);
  });

  return drizzle(pool, { schema });
}

export const db = createDb();
