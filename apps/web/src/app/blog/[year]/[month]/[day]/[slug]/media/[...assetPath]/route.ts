import fs from "node:fs/promises";
import path from "node:path";
import { getBlogAssetParams, getBlogAssetPath, getBlogPost } from "@/lib/blog";

type BlogAssetRouteContext = {
  params: Promise<{
    year: string;
    month: string;
    day: string;
    slug: string;
    assetPath: string[];
  }>;
};

const CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getBlogAssetParams();
}

export async function GET(_request: Request, { params }: BlogAssetRouteContext) {
  const { year, month, day, slug, assetPath: segments } = await params;
  const post = getBlogPost(year, month, day, slug);
  if (!post) return new Response("Not found", { status: 404 });

  const assetPath = getBlogAssetPath(post, segments);
  const contentType = assetPath ? CONTENT_TYPES[path.extname(assetPath).toLowerCase()] : undefined;
  if (!assetPath || !contentType) return new Response("Not found", { status: 404 });

  const body = await fs.readFile(assetPath);
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": contentType,
    },
  });
}
