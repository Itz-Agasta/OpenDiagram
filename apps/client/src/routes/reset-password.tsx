import { ResetPasswordForm } from "#/components/auth/resetPasswordForm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: (search.token as string) || undefined,
      error: (search.error as string) || undefined,
    };
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error } = Route.useSearch();
  return <ResetPasswordForm token={token} urlError={error} />;
}
