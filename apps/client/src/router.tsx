import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { devTelemetry } from "#/lib/dev-telemetry";

export function getRouter() {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        devTelemetry.logQueryError(error, query.queryKey);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        devTelemetry.logMutationError(error, mutation.options.mutationKey);
      },
    }),
  });
  const router = createRouter({
    routeTree,
    // optionally expose the QueryClient via router context
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    // optional:
    // handleRedirects: true,
    // wrapQueryClient: true,
  });

  // DEV-only: page load + client route timings (no-ops in production).
  if (import.meta.env.DEV) {
    devTelemetry.trackPageLoads();
    devTelemetry.trackRouter(router);
  }

  return router;
}
