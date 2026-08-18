import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BlogAuthor } from "#/components/blog/blog-author";
import { BlogMarkdown } from "#/components/blog/blog-markdown";
import { MarketingPage } from "#/components/marketing/marketing-page";
import type { BlogPost, BlogAuthor as BlogAuthorType } from "#/lib/types/blog";
import { SITE_NAME, SITE_URL } from "#/lib/utils/site";
import blogData from "#/lib/blog-data.json";

const BLOG_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

export const Route = createFileRoute("/blog/$year/$month/$day/$slug")({
  loader: ({ params }) => {
    const { year, month, day, slug } = params;
    const post = (blogData.posts as BlogPost[]).find(
      (p) => p.year === year && p.month === month && p.day === day && p.slug === slug,
    );
    if (!post) {
      throw notFound();
    }
    return { post };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.post) return {};
    const { post } = loaderData;
    return {
      meta: [
        { title: `${post.title} | OpenDiagram` },
        { name: "description", content: post.description },
        {
          name: "author",
          content: post.authors.map((author: BlogAuthorType) => author.name).join(", "),
        },
        { property: "og:type", content: "article" },
        {
          property: "og:url",
          content: `${SITE_URL.href}blog/${post.year}/${post.month}/${post.day}/${post.slug}`,
        },
        { property: "og:title", content: post.title },
        { property: "og:description", content: post.description },
        { property: "og:image", content: new URL(post.coverImage.src, SITE_URL).href },
        { property: "twitter:card", content: "summary_large_image" },
        { property: "twitter:title", content: post.title },
        { property: "twitter:description", content: post.description },
        { property: "twitter:image", content: new URL(post.coverImage.src, SITE_URL).href },
      ],
    };
  },
  component: BlogPostRoute,
});

function BlogPostRoute() {
  const { post } = Route.useLoaderData();

  const articleStructuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    mainEntityOfPage: new URL(post.href, SITE_URL).href,
    image: new URL(post.coverImage.src, SITE_URL).href,
    author: post.authors.map((author: BlogAuthorType) => ({
      "@type": "Person",
      name: author.name,
      ...(author.url ? { url: author.url } : {}),
    })),
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL.href,
    },
  };

  return (
    <MarketingPage>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleStructuredData).replace(/</g, "\\u003c"),
        }}
      />

      <article className="px-6 pb-24 pt-16 md:px-12 md:pb-32 md:pt-24 lg:px-[120px]">
        <div className="mx-auto max-w-[920px]">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm font-semibold text-black/55 transition-colors hover:text-[#ff4a2c]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to blog
          </Link>

          <header className="mt-12">
            <time
              dateTime={post.date}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff4a2c]"
            >
              {BLOG_DATE_FORMATTER.format(new Date(`${post.date}T00:00:00Z`))}
            </time>
            <h1 className="mt-5 text-balance text-[44px] font-medium leading-[0.98] tracking-[-0.04em] text-[#1a1a1a] md:text-[68px]">
              {post.title}
            </h1>
            <p className="mt-6 max-w-[760px] text-lg leading-[1.7] text-black/60 md:text-xl">
              {post.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-black/[0.08] pt-6">
              {post.authors.map((author: BlogAuthorType) => (
                <BlogAuthor key={author.id} author={author} />
              ))}
            </div>
          </header>

          <div className="mt-12 overflow-hidden rounded-[24px] bg-black/[0.04]">
            <img
              src={post.coverImage.src}
              alt={post.coverImage.alt}
              width={post.coverImage.width}
              height={post.coverImage.height}
              className="h-auto w-full"
            />
          </div>

          <div className="blog-markdown mx-auto mt-14 max-w-[760px] text-[17px] leading-[1.8] text-black/72">
            <BlogMarkdown text={post.content} />
          </div>
        </div>
      </article>
    </MarketingPage>
  );
}
