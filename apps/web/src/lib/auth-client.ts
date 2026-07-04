"use client";

import { createAuthClient } from "better-auth/react";

const baseURL = process.env.NEXT_PUBLIC_SERVER_URL;
if (!baseURL) {
  throw new Error(
    "NEXT_PUBLIC_SERVER_URL is required. This env var must be set at build time for auth requests to reach the server.",
  );
}

export const authClient = createAuthClient({ baseURL });
