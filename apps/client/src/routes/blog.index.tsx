import { createFileRoute } from "@tanstack/react-router";
import { BlogPage } from "#/components/blog/blog-page";
import blogSummaryData from "#/lib/blog-summary-data.json";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Blog | OpenDiagram" },
      {
        name: "description",
        content:
          "Thoughts on automated software architecture design, interactive layout engineering, and the future of vibe diagramming.",
      },
    ],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  return <BlogPage posts={blogSummaryData.posts} tags={blogSummaryData.tags} />;
}
