#!/usr/bin/env bun
import { env } from "@OpenDiagram/env/server";

const BASE_URL = env.COGNEE_CLOUD_BASE_URL ?? env.COGNEE_BASE_URL!;
const API_KEY = env.COGNEE_CLOUD_API_KEY ?? env.COGNEE_API_KEY!;

const api = (path: string, init?: RequestInit) =>
  fetch(new URL(path, BASE_URL), {
    ...init,
    headers: {
      "X-Api-Key": API_KEY,
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

const R = (r: Response, label: string) =>
  r.text().then((text) => {
    console.log(`\n## ${label} [${r.status} ${r.statusText}]`);
    try {
      const j = JSON.parse(text);
      console.log(JSON.stringify(j, null, 2).slice(0, 2000));
    } catch {
      console.log(text.slice(0, 1000));
    }
  });

async function main() {
  // 1. Create dataset
  const name = `smoke_${Date.now()}`;
  const dsResp = await api("/api/v1/datasets", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  const ds = await dsResp.json() as { id: string; name: string };
  console.log("Created dataset:", ds);

  // 2. Add a file (multipart)
  const form = new FormData();
  form.set("datasetId", ds.id);
  form.set("run_in_background", "false");
  form.append(
    "data",
    new File(
      [
        `OpenDiagram smoke test\nCognee is a knowledge graph platform for AI applications.\nArtificial intelligence transforms how we work and live.`,
      ],
      "smoke-test.txt",
      { type: "text/plain" },
    ),
  );

  const addResp = await api("/api/v1/add", {
    method: "POST",
    body: form,
  });
  await R(addResp, "ADD");

  // 3. Cognify
  const cogResp = await api("/api/v1/cognify", {
    method: "POST",
    body: JSON.stringify({ datasetIds: [ds.id], runInBackground: false }),
  });
  await R(cogResp, "COGNIFY");

  // 4. Search
  const searchResp = await api("/api/v1/search", {
    method: "POST",
    body: JSON.stringify({
      query: "What is AI?",
      searchType: "CHUNKS",
      datasetIds: [ds.id],
      topK: 3,
    }),
  });
  await R(searchResp, "SEARCH");

  // 5. Cleanup
  const delResp = await api(`/api/v1/datasets/${ds.id}`, { method: "DELETE" });
  await R(delResp, "DELETE");
}

main().catch(console.error);
