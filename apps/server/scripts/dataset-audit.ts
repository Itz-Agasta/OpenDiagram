#!/usr/bin/env bun
import { listDatasets, deleteCogneeDataset } from "@OpenDiagram/cognee";
import { eq, db } from "@OpenDiagram/db";
import { project } from "@OpenDiagram/db/schema/project";
import { isNull, isNotNull } from "drizzle-orm";

type CogneeDataset = { id: string; name: string };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function main() {
  // 1. Get all datasets from Cognee
  const remote = (await listDatasets()) ?? [];
  console.log(`\nCognee datasets (${remote.length}):`);
  for (const ds of remote) {
    const dbRow = await db
      .select({ id: project.id, name: project.name, cogneeDatasetId: project.cogneeDatasetId })
      .from(project)
      .where(eq(project.cogneeDatasetId, ds.id))
      .then((rows: typeof project.$inferSelect[]) => rows[0]);
    console.log(`  ${ds.id}  ${ds.name}${dbRow ? `  ← project "${dbRow.name}"` : "  ⚠️ ORPHAN"}`);
  }

  // 2. Get all DB projects with cogneeDatasetId
  console.log(`\nDB projects with cognee IDs:`);
  const dbRows = await db
    .select({ id: project.id, name: project.name, cogneeDatasetId: project.cogneeDatasetId })
    .from(project)
    .where(isNotNull(project.cogneeDatasetId));
  for (const row of dbRows) {
    const exists = remote.some(ds => ds.id === row.cogneeDatasetId);
    console.log(`  ${row.id}  "${row.name}"  →  ${row.cogneeDatasetId}${exists ? "" : "  ⚠️ cogneeDatasetId NOT in Cognee"}`);
  }

  // 3. Identify orphans (remote datasets with name starting with 'opendiagram_' that have no DB match)
  const dbIds = new Set(dbRows.map(r => r.cogneeDatasetId ?? "_no_id_"));
  const orphans = remote.filter(
    ds => ds.name.startsWith("opendiagram") && !dbIds.has(ds.id),
  );
  console.log(`\nOrphaned Cognee datasets (${orphans.length}):`);
  for (const ds of orphans) {
    console.log(`  ${ds.id}  ${ds.name}`);
  }

  // 4. Identify DB stale UUIDs (rows whose cogneeDatasetId is a name, not UUID)
  const staleDb = dbRows.filter(r => r.cogneeDatasetId && !isUuid(r.cogneeDatasetId));
  if (staleDb.length > 0) {
    console.log(`\nDB rows with name-type cogneeDatasetId (not UUID):`);
    for (const r of staleDb) {
      console.log(`  ${r.id}  "${r.name}"  →  ${r.cogneeDatasetId}`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
