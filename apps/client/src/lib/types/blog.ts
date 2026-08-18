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
