import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/features')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/features"!</div>
}
