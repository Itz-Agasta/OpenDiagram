import { env } from "@OpenDiagram/env/web";
import { CreationQuotaError, projectResponseError, readProjectResponse } from "./http";
import type { CreationQuota } from "./types";

export { CreationQuotaError };

export function creationQuotaColorClass(remaining: number) {
  if (remaining <= 0) return "bg-red-500";
  if (remaining <= 5) return "bg-amber-400";
  return "bg-od-ink";
}

export async function getCreationQuota(): Promise<CreationQuota> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/usage/creation-quota`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);
  if (!response.ok)
    throw projectResponseError(data, "Could not load creation quota.", response.status);
  return data.quota;
}
