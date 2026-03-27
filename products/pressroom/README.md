# pressroom

Type-safe content collections for Next.js.

Like Astro content collections, but for Next.js -- define schemas, drop in Markdown/MDX/JSON/YAML files, and query them with full TypeScript inference.

## Install

```bash
npm install pressroom
```

## Quick Start

### 1. Define your collections

```ts
// lib/pressroom.ts
import { createPressroom } from "pressroom";

export const pressroom = createPressroom({
  posts: {
    schema: {
      title: "string",
      date: "date",
      draft: { type: "boolean", required: false, default: false },
      tags: "array",
    },
    directory: "./content/posts",
    format: "md",
  },
  authors: {
    schema: {
      name: { type: "string", required: true },
      avatar: "image",
      bio: "string",
    },
    directory: "./content/authors",
    format: "json",
  },
});
```

### 2. Create content files

```md
<!-- content/posts/hello-world.md -->
---
title: Hello World
date: 2026-01-15
tags:
  - intro
  - blog
---

Welcome to my blog. This is the first post.
```

### 3. Query in your pages

```tsx
// app/blog/page.tsx
import { pressroom } from "@/lib/pressroom";

export default async function BlogIndex() {
  const posts = await pressroom
    .collection("posts")
    .query()
    .where("draft", "eq", false)
    .sort("date", "desc")
    .exec();

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.slug}>
          <a href={`/blog/${post.slug}`}>{post.data.title}</a>
        </li>
      ))}
    </ul>
  );
}
```

## Collection Schemas

Each field in a schema can be a shorthand type string or a full definition:

```ts
const schema = {
  // Shorthand
  title: "string",
  count: "number",
  published: "boolean",
  createdAt: "date",
  tags: "array",
  metadata: "object",
  cover: "image",
  urlSlug: "slug",

  // Full definition with validation
  email: {
    type: "string",
    required: true,
    validate: (v) => String(v).includes("@") || "Must be a valid email",
  },

  // With defaults
  draft: {
    type: "boolean",
    required: false,
    default: false,
  },
};
```

### Field Types

| Type      | TypeScript | Description                    |
| --------- | ---------- | ------------------------------ |
| `string`  | `string`   | Text value                     |
| `number`  | `number`   | Numeric value (auto-coerced)   |
| `boolean` | `boolean`  | True/false (auto-coerced)      |
| `date`    | `Date`     | Date object (auto-coerced)     |
| `array`   | `unknown[]`| Array of values                |
| `object`  | `Record`   | Nested object                  |
| `image`   | `string`   | Image path/URL                 |
| `slug`    | `string`   | URL-safe identifier            |

## Content Formats

Set `format` in your collection config:

- **`"md"`** (default) -- Markdown with YAML frontmatter
- **`"mdx"`** -- MDX with YAML frontmatter
- **`"json"`** -- JSON files (entire file is data, no body content)
- **`"yaml"`** -- YAML files (entire file is data, no body content)

## Querying

### Basic Methods

```ts
const collection = pressroom.collection("posts");

// Get all entries
const all = await collection.getAll();

// Get by slug (filename without extension)
const post = await collection.getBySlug("hello-world");

// With options
const recent = await collection.getAll({
  sort: { field: "date", order: "desc" },
  limit: 10,
});
```

### Fluent Query Builder

```ts
const results = await pressroom
  .collection("posts")
  .query()
  .where("draft", "eq", false)
  .where("tags", "contains", "tutorial")
  .sort("date", "desc")
  .limit(5)
  .offset(10)
  .exec();
```

### Filter Operators

| Operator   | Description              |
| ---------- | ------------------------ |
| `eq`       | Equal                    |
| `neq`      | Not equal                |
| `gt`       | Greater than             |
| `gte`      | Greater than or equal    |
| `lt`       | Less than                |
| `lte`      | Less than or equal       |
| `in`       | Value is in array        |
| `contains` | String/array contains    |

## React Components

```tsx
import { Markdown, ContentList, PressroomProvider, usePressroom } from "pressroom/react";
```

### Markdown Renderer

Renders a markdown string to React elements. Supports headings, paragraphs, bold, italic, inline code, links, images, code blocks, and lists.

```tsx
<Markdown content={post.content} className="prose" />
```

### ContentList

```tsx
<ContentList
  entries={posts}
  renderItem={(post) => (
    <article key={post.slug}>
      <h2>{post.data.title}</h2>
    </article>
  )}
/>
```

### Context Provider

```tsx
// In a client layout
<PressroomProvider pressroom={pressroom}>
  <App />
</PressroomProvider>

// In a child component
function PostList() {
  const pr = usePressroom();
  // ...
}
```

## Next.js Integration

```ts
import { generateStaticParams, getStaticContent, createContentHandler } from "pressroom/next";
```

### Static Params (for `[slug]` routes)

```ts
// app/blog/[slug]/page.tsx
import { pressroom } from "@/lib/pressroom";
import { generateStaticParams as genParams } from "pressroom/next";

export async function generateStaticParams() {
  return genParams(pressroom, "posts");
}
```

### Server Component Helper

```ts
import { getStaticContent } from "pressroom/next";

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await getStaticContent(pressroom, "posts", params.slug);
  if (!post) return <div>Not found</div>;
  return <article>{post.data.title}</article>;
}
```

### API Route Handler

```ts
// app/api/content/[collection]/route.ts
import { createContentHandler } from "pressroom/next";
import { pressroom } from "@/lib/pressroom";

export const GET = createContentHandler(pressroom);
```

Query via URL params:

```
GET /api/content/posts?sort=date&order=desc&limit=10
GET /api/content/posts?slug=hello-world
GET /api/content/posts?where.draft.eq=false
```

## Directory Structure

```
your-project/
├── content/
│   ├── posts/
│   │   ├── hello-world.md
│   │   └── second-post.md
│   └── authors/
│       ├── alice.json
│       └── bob.json
├── lib/
│   └── pressroom.ts          # createPressroom config
├── app/
│   ├── blog/
│   │   ├── page.tsx           # List page
│   │   └── [slug]/
│   │       └── page.tsx       # Detail page
│   └── api/
│       └── content/
│           └── [collection]/
│               └── route.ts   # Optional API
└── package.json
```

## License

MIT
