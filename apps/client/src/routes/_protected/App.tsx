import { SideBar } from '#/components/app/Sidebar'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query';
import { sessionQueryOptions } from '#/lib/session-query';

export const Route = createFileRoute('/_protected/App')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data: session, isPending, error } = useQuery(
    sessionQueryOptions,
  );

  return (
    <main className='flex min-h-screen'>
      {isPending ? (
        <SideBar imageUrl="" name="" email="" isLoading />
      ) : (
        <SideBar
          imageUrl={session?.user.image || ""}
          name={session?.user.name || "Guest"}
          email={session?.user.email || "guest@opendiagram.ink"}
        />
      )}
    </main>
  )
}