import { env } from "@OpenDiagram/env/web";
import { readProjectResponse } from "./http";
import type { WaitlistResult } from "./types";

export async function joinWaitlist(email?: string): Promise<WaitlistResult> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/waitlist/join`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(email ? { email } : {}),
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not join waitlist.");
  return data;
}
