import { getProjectFile, type SavedProjectFile } from "@/lib/projects-client";

/**
 * Downloads a stored scene from its presigned R2 URL.
 *
 * Objects are stored as application/gzip without a Content-Encoding header, so
 * fetch hands back the raw gzip and it is decompressed here rather than by the
 * browser's transparent decoding.
 */
async function fetchStoredScene(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new StoredSceneError(response.status);
  const text = await new Response(
    response.body.pipeThrough(new DecompressionStream("gzip")),
  ).text();
  return JSON.parse(text);
}

/**
 * A 404 means a save retired this object after the URL was issued; the caller
 * refetches the file to get the current one.
 */
class StoredSceneError extends Error {
  constructor(readonly status: number) {
    super(`Could not load scene (${status})`);
  }
}

/**
 * The server copy of a diagram's scene and the revision it is at. A URL that
 * 404s was retired by a save after it was issued, so the file is fetched again
 * once and its newer scene used instead.
 */
export async function downloadServerScene(
  projectId: string,
  file: SavedProjectFile,
): Promise<{ scene: unknown; sceneRev: number | null }> {
  if (!file.sceneUrl) return { scene: file.scene ?? null, sceneRev: file.sceneRev ?? null };
  try {
    return { scene: await fetchStoredScene(file.sceneUrl), sceneRev: file.sceneRev ?? null };
  } catch (error) {
    if (!(error instanceof StoredSceneError) || error.status !== 404) throw error;
    const fresh = await getProjectFile(projectId, file.id);
    return {
      scene: fresh.sceneUrl ? await fetchStoredScene(fresh.sceneUrl) : (fresh.scene ?? null),
      sceneRev: fresh.sceneRev ?? null,
    };
  }
}
