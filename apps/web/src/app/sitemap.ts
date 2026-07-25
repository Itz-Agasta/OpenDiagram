import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

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
      url: new URL("/ai-diagram-generator", SITE_URL).href,
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
  ];
}
