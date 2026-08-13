import SignUpPage from "#/components/auth/auth";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; error?: string } => {
    return {
      redirect: (search.redirect as string) || undefined,
      error: (search.error as string) || undefined,
    };
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect, error } = Route.useSearch();
  return <SignUpPage initialTab="signin" redirect={redirect} urlError={error} />;
}
