import { queryOptions } from "@tanstack/react-query";
import { authClient } from "./auth-client";

export const sessionQueryOptions = queryOptions({
  queryKey: ["auth", "session"],
  queryFn: async () => {
    const { data, error } = await authClient.getSession();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },
  staleTime: 30_000,
});