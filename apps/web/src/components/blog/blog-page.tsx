"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  BookOpen,
  Cpu,
  Settings,
  MessageSquare,
  Terminal,
} from "lucide-react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import type { BlogPostSummary, BlogTag } from "@/lib/blog";
import { GITHUB_URL } from "@/lib/site";
import { useWaitlistJoin } from "@/lib/use-waitlist-join";
import { BlogAuthor } from "@/components/blog/blog-author";

const CATEGORY_ICONS = {
  architecture: Cpu,
  "ai-layout": Settings,
  engineering: Terminal,
  news: MessageSquare,
} as const;

const EMPTY_STATES: Record<string, { title: string; description: string; label: string }> = {
  all: {
    label: "Under construction",
    title: "The canvas is currently empty",
    description:
      "We are drafting our first deep dives on AI-driven system design, diagram rendering engines, and real-time collaborative workspace architectures.",
  },
  architecture: {
    label: "Case studies",
    title: "No architecture studies yet",
    description:
      "We are compiling real-world architectural blueprints, domain boundaries analysis, and system migration case studies.",
  },
  "ai-layout": {
    label: "Research & algorithms",
    title: "No layout research published",
    description:
      "Deep dives on auto-routing layout engines, semantic node alignments, and canvas styling algorithms are in the pipeline.",
  },
  engineering: {
    label: "Tech logs",
    title: "No engineering posts yet",
    description:
      "Behind-the-scenes engineering logs on scaling diagram generation, handling heavy canvas loads, and rendering performance are coming soon.",
  },
  news: {
    label: "Changelog",
    title: "No news updates yet",
    description:
      "Milestone announcements, roadmap updates, and community highlights will be posted here as the workspace grows.",
  },
};

type BlogPageProps = {
  posts: BlogPostSummary[];
  tags: BlogTag[];
};

export function BlogPage({ posts, tags }: BlogPageProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [email, setEmail] = useState("");
  const { status, errorMessage, join, reset } = useWaitlistJoin();
  const categories = [
    { id: "all", label: "All Articles", icon: BookOpen },
    ...tags.map((tag) => ({
      id: tag.id,
      label: tag.label,
      icon: CATEGORY_ICONS[tag.id as keyof typeof CATEGORY_ICONS] ?? BookOpen,
    })),
  ];
  const filteredPosts =
    activeTab === "all"
      ? posts
      : posts.filter((post) => post.tags.some((tag) => tag.id === activeTab));

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    await join(email.trim());
  }

  const currentEmptyState = EMPTY_STATES[activeTab] ?? {
    label: "Articles",
    title: "No articles in this category yet",
    description: "New articles for this topic will appear here.",
  };

  return (
    <MarketingPage>
      {/* Hero Section */}
      <section className="px-6 pb-12 pt-20 md:px-12 md:pb-16 md:pt-28 lg:px-[120px]">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff4a2c]">
            OpenDiagram Publications
          </p>
          <div className="mt-7 grid gap-10 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
            <div>
              <h1 className="max-w-[920px] text-balance text-[48px] font-medium leading-[0.94] tracking-[-0.04em] text-[#1a1a1a] md:text-[72px] lg:text-[88px]">
                Ideas, drafted.{" "}
                <span className="font-excali font-normal text-[#ff4a2c] block sm:inline">
                  Always editable.
                </span>
              </h1>
            </div>
            <p className="max-w-[470px] text-lg leading-[1.65] text-black/60 lg:justify-self-end">
              Thoughts on automated software design, interactive layout engineering, and building an
              open-source AI architecture canvas.
            </p>
          </div>
        </div>
      </section>

      {/* Tabs Filtering */}
      <section className="px-6 py-4 md:px-12 lg:px-[120px]">
        <div className="mx-auto w-full max-w-[1200px] border-b border-black/[0.08] pb-4">
          <nav aria-label="Blog categories" className="flex flex-wrap gap-1.5 sm:gap-2">
            {categories.map((category) => {
              const Icon = category.icon;
              const isActive = activeTab === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => {
                    setActiveTab(category.id);
                    if (status === "error") reset();
                  }}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 ${
                    isActive
                      ? "bg-[#1a1a1a] text-white shadow-sm"
                      : "bg-black/[0.04] text-black/60 hover:bg-black/[0.08] hover:text-[#1a1a1a]"
                  }`}
                  style={{ cursor: "pointer" }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {category.label}
                </button>
              );
            })}
          </nav>
        </div>
      </section>

      {filteredPosts.length > 0 ? (
        <section className="px-6 py-12 md:px-12 lg:px-[120px]">
          <div className="mx-auto grid w-full max-w-[1200px] gap-7 md:grid-cols-2">
            {filteredPosts.map((post) => (
              <article
                key={post.href}
                className="group overflow-hidden rounded-[24px] border border-black/[0.08] bg-white shadow-[0_12px_30px_rgba(0,0,0,0.025)] transition-all duration-300 hover:border-black/15 hover:shadow-[0_20px_40px_rgba(0,0,0,0.05)]"
              >
                <Link href={post.href} className="block">
                  <div className="overflow-hidden bg-black/[0.04]">
                    <img
                      src={post.coverImage.src}
                      alt={post.coverImage.alt}
                      width={post.coverImage.width}
                      height={post.coverImage.height}
                      loading="lazy"
                      className="h-auto w-full"
                    />
                  </div>
                  <div className="p-7 md:p-8">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.16em] text-black/42">
                      <time dateTime={post.date}>
                        {new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        }).format(new Date(`${post.date}T00:00:00Z`))}
                      </time>
                      {post.tags.slice(0, 2).map((tag) => (
                        <span key={tag.id} className="text-[#ff4a2c]">
                          {tag.label}
                        </span>
                      ))}
                    </div>
                    <h2 className="mt-4 text-[28px] font-medium leading-[1.08] tracking-[-0.03em] text-[#1a1a1a]">
                      {post.title}
                    </h2>
                    <p className="mt-4 line-clamp-3 text-sm leading-[1.7] text-black/58">
                      {post.excerpt || post.description}
                    </p>
                    <div className="mt-7 flex items-center justify-between gap-4">
                      <div className="flex -space-x-2">
                        {post.authors.map((author) => (
                          <BlogAuthor key={author.id} author={author} compact />
                        ))}
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#ff4a2c]">
                        Read article
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : (
        /* Empty State Section */
        <section className="px-6 py-12 md:px-12 lg:px-[120px]">
          <div className="mx-auto w-full max-w-[1200px]">
            <div className="relative overflow-hidden rounded-[24px] border border-dashed border-black/15 bg-white p-8 md:p-16 text-center shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-300 hover:border-black/30">
              {/* Grid Pattern Background to resemble drawing canvas */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage: `
                  linear-gradient(to right, #000 1px, transparent 1px),
                  linear-gradient(to bottom, #000 1px, transparent 1px)
                `,
                  backgroundSize: "24px 24px",
                }}
              />

              {/* Glowing Accent */}
              <div className="pointer-events-none absolute left-1/2 top-12 h-44 w-44 -translate-x-1/2 rounded-full bg-[#ff4a2c]/5 blur-[60px]" />

              <div className="relative z-10 flex flex-col items-center max-w-[620px] mx-auto">
                {/* Dynamic Interactive Diagram Sketch SVG */}
                <div className="relative mb-8 h-40 w-full max-w-[280px]">
                  <svg
                    width="280"
                    height="160"
                    viewBox="0 0 280 160"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full"
                  >
                    {/* Left Node */}
                    <g className="animate-[bounce_4s_infinite_ease-in-out]">
                      <rect
                        x="20"
                        y="50"
                        width="60"
                        height="60"
                        rx="8"
                        fill="white"
                        stroke="#ff4a2c"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        className="animate-[spin_40s_linear_infinite]"
                        style={{ transformOrigin: "50px 80px" }}
                      />
                      <circle cx="50" cy="80" r="16" fill="#ff4a2c" fillOpacity="0.1" />
                      <rect x="42" y="72" width="16" height="16" rx="3" fill="#ff4a2c" />
                      <path
                        d="M47 80H53M50 77V83"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </g>

                    {/* Connecting Line (Drawn dynamically) */}
                    <path
                      d="M80 80C110 80 120 100 150 100C170 100 180 80 200 80"
                      stroke="#1a1a1a"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="opacity-40"
                      style={{
                        strokeDasharray: "8",
                      }}
                    />
                    <path
                      d="M80 80C110 80 120 100 150 100C170 100 180 80 200 80"
                      stroke="#ff4a2c"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeDasharray="100"
                      strokeDashoffset="100"
                      className="animate-[draw-line_3s_infinite_ease-in-out]"
                    />

                    {/* Right Node */}
                    <g
                      className="animate-[bounce_4s_infinite_ease-in-out_1.5s]"
                      style={{ transformOrigin: "230px 80px" }}
                    >
                      <rect
                        x="200"
                        y="50"
                        width="60"
                        height="60"
                        rx="30"
                        fill="white"
                        stroke="#1a1a1a"
                        strokeWidth="2"
                        className="shadow-sm"
                      />
                      <circle cx="230" cy="80" r="18" fill="#1a1a1a" fillOpacity="0.05" />
                      <g transform="translate(222, 72) scale(0.9)">
                        <path
                          d="M9 1.5l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5 1.5-3.5z"
                          fill="#ff4a2c"
                          className="animate-pulse"
                        />
                      </g>
                    </g>

                    {/* Tiny floating particles */}
                    <circle
                      cx="110"
                      cy="50"
                      r="2.5"
                      fill="#ff4a2c"
                      className="animate-ping opacity-60"
                    />
                    <circle
                      cx="160"
                      cy="130"
                      r="3.5"
                      fill="#1a1a1a"
                      className="animate-pulse opacity-40"
                    />

                    <style>{`
                    @keyframes draw-line {
                      0%, 100% { stroke-dashoffset: 150; }
                      50% { stroke-dashoffset: 0; }
                    }
                  `}</style>
                  </svg>
                </div>

                {/* Tag/Category identifier */}
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#ff4a2c] bg-[#ff4a2c]/10 rounded-full px-3 py-1 mb-5">
                  {currentEmptyState.label}
                </p>

                {/* Title */}
                <h2 className="text-[28px] font-medium leading-tight tracking-[-0.03em] text-[#1a1a1a] md:text-[36px] transition-all duration-300">
                  {currentEmptyState.title}
                </h2>

                {/* Description */}
                <p className="mt-4 text-base leading-[1.65] text-black/60 md:text-lg transition-all duration-300">
                  {currentEmptyState.description}
                </p>

                {/* Inline Subscribe Box */}
                <div className="mt-10 w-full max-w-[460px]">
                  {status === "joined" ? (
                    <div className="rounded-2xl bg-black/5 p-6 border border-black/[0.05] animate-in fade-in zoom-in-95 duration-300">
                      <p aria-live="polite" className="text-sm font-semibold text-[#1a1a1a]">
                        Subscription active! We&apos;ll notify you of the first release.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2.5">
                      <label htmlFor="blog-waitlist-email" className="sr-only">
                        Email address
                      </label>
                      <input
                        id="blog-waitlist-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="Enter your email for updates"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (status === "error") reset();
                        }}
                        className="min-w-0 flex-1 rounded-full border border-black/15 bg-white px-5 py-3 text-sm text-[#1a1a1a] placeholder-black/40 outline-none transition duration-300 focus:border-[#ff4a2c] focus:ring-1 focus:ring-[#ff4a2c]"
                      />
                      <button
                        type="submit"
                        disabled={status === "joining"}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#ff4a2c] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#e03d21] disabled:opacity-50"
                        style={{ cursor: status === "joining" ? "wait" : "pointer" }}
                      >
                        {status === "joining" ? "Subscribing…" : "Notify Me"}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </form>
                  )}
                  {status === "error" && (
                    <p
                      aria-live="polite"
                      className="mt-2.5 text-center text-xs text-red-500 font-medium"
                    >
                      {errorMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Suggested next actions/Quick Links */}
      <section className="px-6 pb-24 pt-8 md:px-12 lg:px-[120px] lg:pb-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/42 mb-8">
            Explore OpenDiagram
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Action 1 */}
            <Link
              href="/dashboard"
              className="group flex flex-col justify-between rounded-2xl border border-black/[0.08] bg-white p-6 shadow-[0_12px_24px_rgba(0,0,0,0.02)] transition-all duration-300 hover:border-black/20 hover:shadow-[0_18px_36px_rgba(0,0,0,0.04)]"
              style={{ cursor: "pointer" }}
            >
              <div>
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#ff4a2c]/10 text-[#ff4a2c] mb-6">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-[#1a1a1a]">
                  Generate a Diagram
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-black/55">
                  Try the AI architecture generator to turn system requirements and design concepts
                  into editable drafts.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-1.5 text-sm font-semibold text-[#ff4a2c] transition-opacity group-hover:opacity-80">
                Go to Workspace{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>

            {/* Action 2 */}
            <Link
              href="/features"
              className="group flex flex-col justify-between rounded-2xl border border-black/[0.08] bg-white p-6 shadow-[0_12px_24px_rgba(0,0,0,0.02)] transition-all duration-300 hover:border-black/20 hover:shadow-[0_18px_36px_rgba(0,0,0,0.04)]"
              style={{ cursor: "pointer" }}
            >
              <div>
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-black/5 text-[#1a1a1a] mb-6">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-[#1a1a1a]">
                  Explore Features
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-black/55">
                  Learn about ERDs, custom model keys, process flows, and context-aware workspace
                  modifications.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-1.5 text-sm font-semibold text-[#1a1a1a] transition-opacity group-hover:opacity-80">
                See features{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>

            {/* Action 3 */}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col justify-between rounded-2xl border border-black/[0.08] bg-white p-6 shadow-[0_12px_24px_rgba(0,0,0,0.02)] transition-all duration-300 hover:border-black/20 hover:shadow-[0_18px_36px_rgba(0,0,0,0.04)]"
              style={{ cursor: "pointer" }}
            >
              <div>
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#24292e]/5 text-[#24292e] mb-6">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-[#1a1a1a]">
                  Open Source Code
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-black/55">
                  OpenDiagram is Apache 2.0 licensed. Review our code, self-host the repository, or
                  contribute updates.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-1.5 text-sm font-semibold text-[#1a1a1a] transition-opacity group-hover:opacity-80">
                View Repository{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </a>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
