"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Created inside state rather than at module scope on purpose: a module-level
 * client is shared by every request when Next renders on the server, which
 * leaks one user's cached data into another's render.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The dashboard tree is not collaborative; a stale-for-30s read is
            // fine and stops tab switches from re-firing the request.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // A 401 is a real answer, not a blip -- retrying it just delays the
            // signed-out state the caller is waiting to render.
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
