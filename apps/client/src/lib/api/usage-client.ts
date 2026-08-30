import { queryOptions } from "@tanstack/react-query";
import { getDevFetch } from "../dev-telemetry";
import type { CreationQuota } from "../types/errors";

const BASE_URL = import.meta.env.VITE_SERVER_URL || "";
const devFetch = getDevFetch();

export async function getCreationQuota(): Promise<CreationQuota | null> {
  const response = await devFetch(`${BASE_URL.replace(/\/$/, "")}/api/usage/creation-quota`, {
    credentials: "include",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { quota: CreationQuota | null };
  return data.quota;
}

export const creationQuotaQueryOptions = queryOptions({
  queryKey: ["usage", "creation-quota"],
  queryFn: getCreationQuota,
  staleTime: 10 * 1000, // 10 seconds
});
