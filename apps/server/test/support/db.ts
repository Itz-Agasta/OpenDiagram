import { PGlite } from "@electric-sql/pglite";
import * as schema from "@OpenDiagram/db/schema";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";

/**
 * Postgres compiled to WASM, in this process, built from the same migrations
 * production runs. Single connection: it cannot test locks or two sessions.
 * https://pglite.dev/docs/about
 */
export const testDb = drizzle(new PGlite(), { schema });

await migrate(testDb, {
  migrationsFolder: fileURLToPath(
    new URL("../../../../packages/db/src/migrations", import.meta.url),
  ),
});

/** Empties every table: call in beforeEach so no test sees another's rows. */
export async function resetDb(): Promise<void> {
  const { rows } = await testDb.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await testDb.execute(sql.raw(`truncate ${tables} restart identity cascade`));
}
