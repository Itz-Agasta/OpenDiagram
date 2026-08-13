import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "#/lib/api";

export function Account() {
  const { data: session, isPending, error } = useQuery(sessionQueryOptions);

  if (isPending) return <div>Loading...</div>;
  if (error) return <div>Unable to load session</div>;
  if (!session) return <div>Signed out</div>;

  return <div>{session.user.email}</div>;
}
