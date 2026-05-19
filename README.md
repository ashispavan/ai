# .

This is a Next.js application generated with
[Create Fumadocs](https://github.com/fuma-nama/fumadocs).

Run development server:

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

Open http://localhost:3000 with your browser to see the result.

## Notion content sync

This branch uses Notion as the editor and syncs published rows into Fumadocs MDX at build time.

Required environment variables:

- `NOTION_API_KEY`: token for the `AI Blog Sync` Notion connection
- `NOTION_DATA_SOURCE_ID`: data source ID for the `AI Blog Content` database
- `VERCEL_DEPLOY_HOOK_URL`: optional local helper URL for triggering the `notion-rebuild` Vercel
  deploy hook

Notion rows are included in the site only when `Status` is `Published`, `Done`, or `Complete`.
Rows with `Type` set to `Topic` or `Subtopic` become folders with an `index.mdx`; rows with `Type`
set to `Post` become regular MDX pages. Use the `Parent` relation to nest a subtopic or post under
another row.

Run a manual sync with:

```bash
pnpm notion:sync
```

Vercel runs the sync automatically during `pnpm build`, then generates the Fumadocs source and
builds the Next.js app.

## Explore

In the project, you can see:

- `lib/source.ts`: Code for content source adapter, [`loader()`](https://fumadocs.dev/docs/headless/source-api) provides the interface to access your content.
- `lib/layout.shared.tsx`: Shared options for layouts, optional but preferred to keep.

| Route                     | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `app/(home)`              | The route group for your landing page and other pages. |
| `app/docs`                | The documentation layout and pages.                    |
| `app/api/search/route.ts` | The Route Handler for search.                          |

### Fumadocs MDX

A `source.config.ts` config file has been included, you can customise different options like frontmatter schema.

Read the [Introduction](https://fumadocs.dev/docs/mdx) for further details.

## Learn More

To learn more about Next.js and Fumadocs, take a look at the following
resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js
  features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Fumadocs](https://fumadocs.dev) - learn about Fumadocs
