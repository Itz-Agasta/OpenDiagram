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

async function readScene(key: string): Promise<unknown> {
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

// JSON compresses about 7x, so 64 KiB of gzip holds far more than any excerpt
// we cut. Bounds the bytes read to this however large the scene grows.
const EXCERPT_GZIP_BYTES = 64 * 1024;

/**
 * The first maxChars of a scene's JSON, from a ranged read of the gzipped
 * object streamed through gunzip. The stream stops once enough text is out,
 * so a 2 MB scene costs the same as a small one.
 */
export async function readSceneExcerpt(key: string, maxChars: number): Promise<string> {
  const reader = store
    .file(key)
    .slice(0, EXCERPT_GZIP_BYTES)
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let text = "";
  try {
    while (text.length < maxChars) {
      const { done, value } = await reader.read();
      if (done) break;
      text += value;
    }
  } finally {
    // The range usually ends mid-stream; cancel instead of reading to the
    // truncated end, which gunzip would report as corrupt.
    await reader.cancel().catch(() => {});
  }
  return text.slice(0, maxChars);
}

// Long enough for the loader to use it at once, short enough that a leaked URL
// soon stops working. Signing is local, so a fresh URL per request costs nothing.
const SCENE_URL_TTL_SECONDS = 300;

/** Presigned GET the browser downloads the scene from. No network call. */
export function sceneUrl(key: string): string {
  return store.presign(key, { expiresIn: SCENE_URL_TTL_SECONDS });
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
 * The object is gone. Expected when a save retires the object a reader picked
 * up from the row a moment earlier: the row has already moved on.
 */
export function isMissingObject(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "NoSuchKey";
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
