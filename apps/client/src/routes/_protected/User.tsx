import { Account } from "#/components/app/Account";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_protected/User")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <Account />
    </div>
  );
}
