/** Creates the shared typed Postgres client and re-exports common query operators. */
import { env } from "@OpenDiagram/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";

export function createDb() {
  return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();
