import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/_protected')({
  beforeLoad: async ({ location }) => {
    const session = await authClient.getSession();

    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }

    return { user: session.data?.user };
  },
  component: () => <Outlet />,
})