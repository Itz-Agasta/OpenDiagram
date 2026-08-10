import { queryOptions } from "@tanstack/react-query";
import { authClient } from "./auth-client";

export const sessionQueryOptions = queryOptions({
  queryKey: ["auth", "session"],
  queryFn: async () => {
    const res = await authClient.getSession();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  },
});
