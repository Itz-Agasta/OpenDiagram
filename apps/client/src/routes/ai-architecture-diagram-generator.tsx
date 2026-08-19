import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ai-architecture-diagram-generator")({
  beforeLoad: () => {
    throw redirect({
      to: "/ai-diagram-generator",
      statusCode: 301,
    });
  },
});
