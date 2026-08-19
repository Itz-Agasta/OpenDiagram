import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/github-to-architecture-diagram")({
  beforeLoad: () => {
    throw redirect({
      to: "/github-to-architecture-diagram-generator",
      statusCode: 301,
    });
  },
});
