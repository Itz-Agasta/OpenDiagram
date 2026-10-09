import { store } from "./client";

/**
 * Canvas scenes in object storage, one gzipped JSON object per write.
 *
 * Keys sit under users/{userId}/projects/{projectId}/files/{fileId}/ so a file
 * or project delete is one prefix delete. Bodies are stored as application/gzip
 * and decompressed here, rather than relying on how R2 and fetch treat
 * Content-Encoding.
 */

type Owner = { userId: string; projectId: string };

export const projectPrefix = ({ userId, projectId }: Owner) =>
  `users/${userId}/projects/${projectId}/`;

export const filePrefix = (owner: Owner, fileId: string) =>
  `${projectPrefix(owner)}files/${fileId}/`;

/** Fresh for every write and never reused. See project_file_content.sceneKey. */
const sceneKey = (owner: Owner, fileId: string) =>
  `${filePrefix(owner, fileId)}scene/${crypto.randomUUID()}.json.gz`;

/** Uploads a scene and returns its gzipped size, for the wide event. */
async function putScene(key: string, scene: unknown): Promise<number> {
  const body = Bun.gzipSync(JSON.stringify(scene));
  await store.write(key, body, { type: "application/gzip" });
  return body.byteLength;
}

export async function readScene(key: string): Promise<unknown> {
  const gzipped = new Uint8Array(await store.file(key).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(Bun.gunzipSync(gzipped)));
}

/** Uploads under a fresh key. Always before the DB write, never inside a transaction. */
export async function uploadScene(owner: Owner, fileId: string, scene: unknown) {
  const key = sceneKey(owner, fileId);
  const started = performance.now();
  const gzBytes = await putScene(key, scene);
  return { key, gzBytes, putMs: Math.round(performance.now() - started) };
}

/**
 * After the row write: a committed write retires the object it replaced, a
 * failed or stale one retires the object it just uploaded. Either way exactly
 * one object stays live. Awaited by callers before responding, because Cloud
 * Run throttles CPU once the response is sent.
 */
export function settleScene(uploadedKey: string, committed: boolean, previousKey: string | null) {
  return deleteObject(committed ? previousKey : uploadedKey);
}

/**
 * A content row's scene: from object storage when it has a key, else the legacy
 * jsonb column. TODO: drop the fallback with the scene column, once the backfill
 * has run on every database.
 */
export function loadScene(row: { scene: unknown; sceneKey: string | null }): Promise<unknown> {
  return row.sceneKey ? readScene(row.sceneKey) : Promise.resolve(row.scene);
}

/**
 * Best effort: a leftover object costs storage, not correctness, so callers log
 * the returned error instead of failing a request that already committed.
 */
export async function deleteObject(key: string | null | undefined): Promise<unknown> {
  if (!key) return null;
  try {
    await store.delete(key);
    return null;
  } catch (error) {
    return error;
  }
}

/** Deletes every object under a prefix. Returns how many went. */
export async function deletePrefix(prefix: string): Promise<number> {
  let deleted = 0;
  let continuationToken: string | undefined;
  do {
    const page = await store.list({ prefix, continuationToken });
    const keys = (page.contents ?? []).map((object) => object.key);
    await Promise.all(keys.map((key) => store.delete(key)));
    deleted += keys.length;
    continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (continuationToken);
  return deleted;
}
