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
  try {
    const text = await new Response(
      response.body.pipeThrough(new DecompressionStream("gzip")),
    ).text();
    return JSON.parse(text);
  } catch {
    // A 200 whose body is not gzipped JSON: report it like any other failed
    // load instead of surfacing a raw decoder error to the user.
    throw new StoredSceneError(response.status);
  }
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

// Each 404 means a save landed between issuing the URL and using it. Two
// refetches cover back-to-back saves; past that something else is wrong.
const MAX_ATTEMPTS = 3;

/**
 * The server copy of a diagram's scene and the revision it is at. A URL that
 * 404s was retired by a save after it was issued, so the file is fetched again
 * and its newer scene used instead.
 */
export async function downloadServerScene(
  projectId: string,
  file: SavedProjectFile,
): Promise<{ scene: unknown; sceneRev: number | null }> {
  let current = file;
  for (let attempt = 1; ; attempt++) {
    if (!current.sceneUrl) {
      return { scene: current.scene ?? null, sceneRev: current.sceneRev ?? null };
    }
    try {
      return {
        scene: await fetchStoredScene(current.sceneUrl),
        sceneRev: current.sceneRev ?? null,
      };
    } catch (error) {
      const retired = error instanceof StoredSceneError && error.status === 404;
      if (!retired || attempt === MAX_ATTEMPTS) throw error;
      current = await getProjectFile(projectId, file.id);
    }
  }
}
