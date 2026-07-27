import "server-only";

import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import * as yaml from "js-yaml";

const BLOG_DIRECTORY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/;
const COVER_IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)\s*/;
const TRUNCATE_TAG = "<!-- truncate -->";
const BLOG_CONTENT_DIRECTORY = path.join(process.cwd(), "../fumadocs/content/blog");
const COVER_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "2026-07-27-diagramgpt-alternative": { width: 1751, height: 937 },
  "2026-07-27-what-is-an-ai-diagram": { width: 2322, height: 1022 },
};

type YamlRecord = Record<string, unknown>;

export type BlogAuthor = {
  id: string;
  name: string;
  title: string;
  imageUrl: string;
  url?: string;
  socials: Record<string, string>;
};

export type BlogTag = {
  id: string;
  label: string;
  permalink: string;
  description: string;
};

export type BlogImage = {
  alt: string;
  height: number;
  src: string;
  width: number;
};

export type BlogPostSummary = {
  authors: BlogAuthor[];
  coverImage: BlogImage;
  date: string;
  description: string;
  excerpt: string;
  href: string;
  slug: string;
  tags: BlogTag[];
  title: string;
  year: string;
  month: string;
  day: string;
};

export type BlogPost = BlogPostSummary & {
  content: string;
  directoryName: string;
};

function readYaml<T>(fileName: "authors.yml" | "tags.yml"): T {
  const filePath = path.join(BLOG_CONTENT_DIRECTORY, fileName);
  return yaml.load(fs.readFileSync(filePath, "utf8")) as T;
}

function asRecord(value: unknown): YamlRecord {
  return typeof value === "object" && value !== null ? (value as YamlRecord) : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function readAuthors(): Record<string, BlogAuthor> {
  const source = readYaml<Record<string, unknown>>("authors.yml") ?? {};

  return Object.fromEntries(
    Object.entries(source).map(([id, rawAuthor]) => {
      const author = asRecord(rawAuthor);
      return [
        id,
        {
          id,
          name: asString(author.name, id),
          title: asString(author.title),
          imageUrl: asString(author.image_url),
          url: asString(author.url) || undefined,
          socials: (author.socials as Record<string, string>) ?? {},
        },
      ];
    }),
  );
}

function readTags(): Record<string, BlogTag> {
  const source = readYaml<Record<string, unknown>>("tags.yml") ?? {};

  return Object.fromEntries(
    Object.entries(source).map(([id, rawTag]) => {
      const tag = asRecord(rawTag);
      return [
        id,
        {
          id,
          label: asString(tag.label, id),
          permalink: asString(tag.permalink, `/${id}`),
          description: asString(tag.description),
        },
      ];
    }),
  );
}

function localImageUrl(
  post: Pick<BlogPostSummary, "year" | "month" | "day" | "slug">,
  source: string,
) {
  return `/blog/${post.year}/${post.month}/${post.day}/${post.slug}/media/${source.replace(/^\.\//, "")}`;
}

function rewriteLocalImages(content: string, post: BlogPostSummary) {
  return content.replace(/(!\[[^\]]*]\()([^)]+)(\))/g, (match, opening, destination, closing) => {
    const [source, ...titleParts] = String(destination).trim().split(/\s+/);
    if (!source || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(source) || source.includes("..")) {
      return match;
    }

    return `${opening}${[localImageUrl(post, source), ...titleParts].join(" ")}${closing}`;
  });
}

function plainText(content: string) {
  return content
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePost(
  directoryName: string,
  authorMap: Record<string, BlogAuthor>,
  tagMap: Record<string, BlogTag>,
): BlogPost {
  const [, year, month, day, slug] = BLOG_DIRECTORY_PATTERN.exec(directoryName) ?? [];
  const filePath = path.join(BLOG_CONTENT_DIRECTORY, directoryName, "index.md");
  const { data: frontmatter, content: sourceContent } = matter(fs.readFileSync(filePath, "utf8"));
  const content = sourceContent.trim();
  const coverMatch = COVER_IMAGE_PATTERN.exec(content);
  const title = asString(frontmatter.title, slug);
  const coverSource = asString(frontmatter.cover_image, coverMatch?.[2] ?? "cover.jpg");
  const coverAlt = coverMatch?.[1] || `${title} cover`;
  const coverDimensions = COVER_DIMENSIONS[directoryName] ?? { width: 1200, height: 630 };
  const href = `/blog/${year}/${month}/${day}/${slug}`;
  const truncateIndex = content.indexOf(TRUNCATE_TAG);
  const introStart = coverMatch ? coverMatch[0].length : 0;
  const introEnd = truncateIndex === -1 ? content.length : truncateIndex;

  const summary: BlogPostSummary = {
    authors: asStringArray(frontmatter.authors)
      .map((id) => authorMap[id])
      .filter(Boolean),
    coverImage: { alt: coverAlt, ...coverDimensions, src: "" },
    date: `${year}-${month}-${day}`,
    description: asString(frontmatter.description),
    excerpt: plainText(content.slice(introStart, introEnd)),
    href,
    slug,
    tags: asStringArray(frontmatter.tags)
      .map((id) => tagMap[id])
      .filter(Boolean),
    title,
    year,
    month,
    day,
  };

  const body = content
    .slice(introStart)
    .replace(TRUNCATE_TAG, "")
    .replace(/<head>[\s\S]*?<\/head>/gi, "")
    .trim();

  return {
    ...summary,
    coverImage: {
      alt: coverAlt,
      ...coverDimensions,
      src: localImageUrl(summary, coverSource),
    },
    content: rewriteLocalImages(body, summary),
    directoryName,
  };
}

export const getBlogData = cache(() => {
  if (!fs.existsSync(BLOG_CONTENT_DIRECTORY)) {
    throw new Error(`Blog content directory not found: ${BLOG_CONTENT_DIRECTORY}`);
  }

  const authorMap = readAuthors();
  const tagMap = readTags();
  const posts = fs
    .readdirSync(BLOG_CONTENT_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BLOG_DIRECTORY_PATTERN.test(entry.name))
    .map((entry) => parsePost(entry.name, authorMap, tagMap))
    .sort((left, right) => right.date.localeCompare(left.date));

  return { posts, tags: Object.values(tagMap) };
});

export function getBlogPosts() {
  return getBlogData().posts;
}

export function getBlogPostSummaries() {
  return getBlogPosts().map(
    ({ content: _content, directoryName: _directoryName, ...summary }) => summary,
  );
}

export function getBlogTags() {
  return getBlogData().tags;
}

export function getBlogPost(year: string, month: string, day: string, slug: string) {
  return getBlogPosts().find(
    (post) => post.year === year && post.month === month && post.day === day && post.slug === slug,
  );
}

export function getBlogAssetPath(post: BlogPost, segments: string[]): string | undefined {
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return undefined;
  }

  const postDirectory = path.join(BLOG_CONTENT_DIRECTORY, post.directoryName);
  const assetPath = path.resolve(postDirectory, ...segments);
  const relativePath = path.relative(postDirectory, assetPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return undefined;

  return fs.existsSync(assetPath) && fs.statSync(assetPath).isFile() ? assetPath : undefined;
}

export function getBlogAssetParams() {
  return getBlogPosts().flatMap((post) => {
    const postDirectory = path.join(BLOG_CONTENT_DIRECTORY, post.directoryName);
    const assets: string[][] = [];

    function visit(directory: string, prefix: string[] = []) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const assetPath = [...prefix, entry.name];
        if (entry.isDirectory()) visit(path.join(directory, entry.name), assetPath);
        else if (entry.isFile() && entry.name !== "index.md" && !entry.name.startsWith(".")) {
          assets.push(assetPath);
        }
      }
    }

    visit(postDirectory);
    return assets.map((assetPath) => ({
      year: post.year,
      month: post.month,
      day: post.day,
      slug: post.slug,
      assetPath,
    }));
  });
}
