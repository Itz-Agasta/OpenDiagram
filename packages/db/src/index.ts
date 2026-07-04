import { env } from "@OpenDiagram/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export { and, desc, eq } from "drizzle-orm";

export function createDb() {
  return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();
