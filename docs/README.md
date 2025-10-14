# MCP Agent Documentation

This directory contains the documentation site for MCP Agent, built with [Nextra 4](https://nextra.site/) on Next.js App Router.

## Prerequisites

- Node.js 18+ (recommended: use the version in `.nvmrc` if present)
- pnpm (install via `npm install -g pnpm`)

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run the dev server:

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The site auto-reloads on file changes.

## Project Structure

```
docs/
├── app/
│   ├── _meta.jsx          # Top-level navigation (Docs, Blog, Community)
│   ├── layout.jsx         # Site layout and theme configuration
│   └── docs/
│       ├── _meta.jsx      # Docs section ordering
│       ├── page.mdx       # Introduction page
│       ├── getting-started/
│       ├── concepts/
│       ├── guides/
│       └── reference/
├── public/                # Static assets (images, etc.)
├── next.config.mjs        # Next.js + Nextra configuration
└── package.json
```

## Adding Content

### Create a New Page

Add a `page.mdx` file in the appropriate folder:

```bash
docs/app/docs/guides/my-new-guide/page.mdx
```

Include front matter:

```mdx
---
description: A short description for SEO and navigation.
---

# My New Guide

Your content here...
```

### Update Sidebar Navigation

Edit the `_meta.jsx` file in the parent directory to control ordering and labels:

```js
// docs/app/docs/guides/_meta.jsx
export default {
  index: "Guides",
  "my-new-guide": "My New Guide",
  // ...
};
```

## Building for Production

```bash
pnpm run build
```

Output is in `.next/`. Serve locally:

```bash
pnpm run start
```

## Deployment

The site can be deployed to any platform supporting Next.js (Vercel, Netlify, etc.). Configure as needed in your CI/CD pipeline.

## Contributing

- Keep pages concise and focused
- Use code blocks with language tags for syntax highlighting
- Link to other pages using relative paths: `/docs/concepts/architecture`
- Add images to `public/images/` and reference as `/images/your-image.png`

## Troubleshooting

- If styles or navigation aren't updating, clear `.next/` and restart dev server
- Check `pnpm-lock.yaml` is committed for reproducible builds
- Ensure `.next/` is in `.gitignore`

## Learn More

- [Nextra Documentation](https://nextra.site/)
- [Next.js App Router](https://nextjs.org/docs/app)
