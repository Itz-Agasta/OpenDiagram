import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { authClient } from "#/lib/api";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async ({ location }) => {
    const { data } = await authClient.getSession();

    if (!data) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
