# OpenDiagram blog content

Posts use this structure:

```text
YYYY-MM-DD-post-title/
├── index.md
└── images/
```

Required frontmatter:

```yaml
---
title: Your Blog Post Title
description: A short description of the post.
authors:
  - author_id
tags:
  - architecture
---
```

The folder date becomes the publication date and the public URL:
`/blog/YYYY/MM/DD/post-title`.

After frontmatter, add a cover image, one or two introductory paragraphs, and
`<!-- truncate -->`. Store local images beside `index.md` or in its `images/`
directory and reference them with relative Markdown paths.

Authors and tags are looked up from the registries when available; unknown
entries are ignored so trusted internal posts can be published without a schema
validation step. Next.js generates canonical, Open Graph, Twitter, and article
metadata, so posts should not include a literal `<head>` block.
