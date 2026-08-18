import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import * as yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BLOG_DIRECTORY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/;
const COVER_IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)\s*/;
const TRUNCATE_TAG = "<!-- truncate -->";

// Relative to apps/client/scripts/build-blog-data.ts
const BLOG_CONTENT_DIRECTORY = path.resolve(__dirname, "../../../apps/fumadocs/content/blog");
const PUBLIC_BLOG_DIRECTORY = path.resolve(__dirname, "../public/blog");
const OUTPUT_DATA_FILE = path.resolve(__dirname, "../src/lib/blog-data.json");

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

async function readYamlFile<T>(fileName: "authors.yml" | "tags.yml"): Promise<T> {
  const filePath = path.join(BLOG_CONTENT_DIRECTORY, fileName);
  const content = await fs.readFile(filePath, "utf8");
  return yaml.load(content) as T;
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

async function readAuthors(): Promise<Record<string, BlogAuthor>> {
  const source = (await readYamlFile<Record<string, unknown>>("authors.yml")) ?? {};

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

async function readTags(): Promise<Record<string, BlogTag>> {
  const source = (await readYamlFile<Record<string, unknown>>("tags.yml")) ?? {};

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

async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile() && entry.name !== "index.md" && !entry.name.startsWith(".")) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function parsePost(
  directoryName: string,
  authorMap: Record<string, BlogAuthor>,
  tagMap: Record<string, BlogTag>,
): Promise<BlogPost> {
  const [, year, month, day, slug] = BLOG_DIRECTORY_PATTERN.exec(directoryName) ?? [];
  const filePath = path.join(BLOG_CONTENT_DIRECTORY, directoryName, "index.md");
  const fileContent = await fs.readFile(filePath, "utf8");
  const { data: frontmatter, content: sourceContent } = matter(fileContent);
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

  // Copy local images/assets
  const postSrcDir = path.join(BLOG_CONTENT_DIRECTORY, directoryName);
  const postDestDir = path.join(PUBLIC_BLOG_DIRECTORY, year, month, day, slug, "media");

  // Only copy if the source directory has files other than index.md
  try {
    await copyDir(postSrcDir, postDestDir);
  } catch (err) {
    // Ignore if fails (e.g. no directory, but it's generated from readdir so should exist)
    console.error(`Failed to copy assets for ${directoryName}:`, err);
  }

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

async function main() {
  console.log("Compiling blog data...");

  try {
    const authorMap = await readAuthors();
    const tagMap = await readTags();

    const entries = await fs.readdir(BLOG_CONTENT_DIRECTORY, { withFileTypes: true });
    const postDirs = entries.filter(
      (entry) => entry.isDirectory() && BLOG_DIRECTORY_PATTERN.test(entry.name),
    );

    const posts: BlogPost[] = [];
    for (const dir of postDirs) {
      const post = await parsePost(dir.name, authorMap, tagMap);
      posts.push(post);
    }

    posts.sort((left, right) => right.date.localeCompare(left.date));

    const blogData = {
      posts,
      tags: Object.values(tagMap),
    };

    await fs.mkdir(path.dirname(OUTPUT_DATA_FILE), { recursive: true });
    await fs.writeFile(OUTPUT_DATA_FILE, JSON.stringify(blogData, null, 2), "utf8");

    console.log(`Successfully compiled ${posts.length} posts to ${OUTPUT_DATA_FILE}`);
  } catch (err) {
    console.error("Error compiling blog data:", err);
    process.exit(1);
  }
}

main();
