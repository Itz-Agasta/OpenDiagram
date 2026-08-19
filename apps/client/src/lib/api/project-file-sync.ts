import { updateProjectFile } from "./project";
import type { ProjectFile, UpdateProjectFileInput } from "../types";

type PendingWrite = {
  projectId: string;
  patch: UpdateProjectFileInput;
  fields: "full" | "meta";
  resolve: (file: ProjectFile) => void;
  reject: (error: unknown) => void;
  promise: Promise<ProjectFile>;
};

const inFlight = new Set<string>();
const pending = new Map<string, PendingWrite>();

function createPending(projectId: string, fields: "full" | "meta"): PendingWrite {
  let resolve!: (file: ProjectFile) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<ProjectFile>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { projectId, patch: {}, fields, resolve, reject, promise };
}

export function queueProjectFilePatch(
  projectId: string,
  fileId: string,
  patch: UpdateProjectFileInput,
  fields: "full" | "meta" = "meta",
): Promise<ProjectFile> {
  const existing = pending.get(fileId);
  const entry = existing ?? createPending(projectId, fields);
  if (!existing) pending.set(fileId, entry);

  Object.assign(entry.patch, patch);
  if (fields === "full") entry.fields = "full";

  if (!inFlight.has(fileId)) void drain(fileId);
  return entry.promise;
}

export function cancelProjectFilePatch(fileId: string): void {
  const entry = pending.get(fileId);
  if (entry) {
    pending.delete(fileId);
    entry.reject(new Error("Cancelled"));
  }
}

async function drain(fileId: string): Promise<void> {
  if (inFlight.has(fileId)) return;
  inFlight.add(fileId);
  try {
    for (;;) {
      const entry = pending.get(fileId);
      if (!entry) return;
      pending.delete(fileId);

      try {
        const file = await updateProjectFile(entry.projectId, fileId, entry.patch, entry.fields);
        entry.resolve(file);
      } catch (error) {
        entry.reject(error);
      }
    }
  } finally {
    inFlight.delete(fileId);
  }
}
