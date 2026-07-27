import type { MetadataRoute } from "next";
import { getBlogPostSummaries } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const blogPosts: MetadataRoute.Sitemap = getBlogPostSummaries().map((post) => ({
    url: new URL(post.href, SITE_URL).href,
    lastModified: new Date(`${post.date}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    {
      url: SITE_URL.href,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: new URL("/about", SITE_URL).href,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: new URL("/features", SITE_URL).href,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: new URL("/ai-architecture-diagram-generator", SITE_URL).href,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: new URL("/github-to-architecture-diagram-generator", SITE_URL).href,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: new URL("/blog", SITE_URL).href,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    ...blogPosts,
  ];
}
