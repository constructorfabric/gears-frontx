# @gears-frontx/docs

HAI3 Documentation Site - AI-driven product lifecycle and framework documentation.

## Overview

This package contains the VitePress-based documentation site for HAI3, covering:

- **AI Product Lifecycle**: Strategic, Organizational, Tactical, and Technical layers
- **HAI3 Framework**: Architecture, concepts, guides, and API reference
- **Case Studies**: Real-world examples including portal microfrontend architecture
- **Terminology**: Core concepts and extensibility guide

## Local Development

### Prerequisites

- Node.js >= 25.1.0
- npm >= 11.6.0

### Setup

From the repository root:

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run docs:dev
```

The documentation site will be available at `http://localhost:5173`.

### Building

```bash
# Build static site
npm run docs:build

# Preview production build
npm run docs:preview
```

The built site will be in `packages/docs/dist/`.

## Structure

```
packages/docs/
├── .vitepress/           # VitePress configuration
│   ├── config.ts         # Site config, navigation, theme
│   └── theme/            # Custom theme
│       ├── index.ts
│       └── custom.css    # HAI3 branding
├── src/                  # Documentation content (Markdown)
│   ├── index.md          # Homepage
│   ├── getting-started.md
│   ├── TERMINOLOGY.md
│   ├── lifecycle/        # AI product lifecycle docs
│   ├── hai3/             # HAI3 framework docs
│   └── case-studies/     # Case studies
├── public/               # Static assets (images, diagrams)
└── dist/                 # Build output (gitignored)
```

## Writing Documentation

### Creating a New Page

1. Create a Markdown file in the appropriate `src/` subdirectory
2. Add frontmatter with title and description:

```markdown
---
title: Page Title
description: Page description for SEO
---

# Page Title

Content here...
```

3. Add the page to the sidebar in `.vitepress/config.ts`

### Using VitePress Features

VitePress supports:
- **Markdown extensions**: Tables, code blocks with syntax highlighting, emojis
- **Custom containers**: Info, tip, warning, danger blocks
- **Code groups**: Tabbed code examples
- **Mermaid diagrams**: For architecture and flow diagrams
- **Vue components**: For interactive examples

See [VitePress documentation](https://vitepress.dev/guide/markdown) for details.

### Style Guide

- Use clear, concise language
- Include code examples where applicable
- Cross-reference related sections with links
- Add diagrams for complex concepts
- Keep navigation structure shallow (max 3 levels)

## Navigation

The site navigation is configured in `.vitepress/config.ts`:

- **Top nav**: Main sections (Lifecycle, HAI3, Case Studies)
- **Sidebar**: Hierarchical navigation within each section
- **Search**: Local search powered by VitePress

## Deployment

The documentation site is a static site that can be deployed to:

- GitHub Pages
- Netlify
- Vercel
- Any static hosting service

Build with `npm run docs:build` and deploy the `dist/` directory.

### GitHub Pages Setup

```yaml
# .github/workflows/docs-deploy.yml
name: Deploy Documentation

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '25.1.0'
      - run: npm ci
      - run: npm run docs:build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./packages/docs/dist
```

## Contributing

### Adding Content

1. Follow the structure outlined in the implementation plan
2. Ensure consistency with existing documentation style
3. Test locally before committing
4. Update navigation in `.vitepress/config.ts` if needed

### Editing Existing Pages

1. Make changes to the Markdown files
2. Preview changes with `npm run docs:dev`
3. Verify all links work correctly
4. Check for broken references in build output

### Reporting Issues

If you find errors, broken links, or unclear documentation:

1. Check if an issue already exists
2. Create a new issue with details and page reference
3. Submit a PR with fixes if possible

## License

Apache-2.0 - See LICENSE file in repository root.
