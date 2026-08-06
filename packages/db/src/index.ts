import { env } from "@OpenDiagram/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export { and, desc, eq, exists, inArray, lt, ne, notInArray, or, sql } from "drizzle-orm";

export function createDb() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // Both default to off, so a request had no deadline of any kind.
    connectionTimeoutMillis: 10_000,
    // The one that bounds the 66s PATCH: that hang was a query on an already
    // checked-out client, which `connectionTimeoutMillis` does not cover. Client
    // side (`pg/lib/client.js` arms a plain timer), so unlike `statement_timeout`
    // it still fires when the pooler has dropped the socket and nothing replies.
    // Ceiling on hangs, not a target: the slowest real statement we have measured
    // is the 8.7s scene upsert.
    query_timeout: 30_000,
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
