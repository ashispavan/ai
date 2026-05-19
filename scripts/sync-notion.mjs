import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const notionVersion = '2026-03-11';
const outputDir = path.join(process.cwd(), 'content', 'docs');
const apiKey = process.env.NOTION_API_KEY;
const dataSourceId = process.env.NOTION_DATA_SOURCE_ID;
const publishStatuses = new Set(['published', 'done', 'complete']);

if (!apiKey) {
  throw new Error('Missing NOTION_API_KEY');
}

if (!dataSourceId) {
  throw new Error('Missing NOTION_DATA_SOURCE_ID');
}

const notionHeaders = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'Notion-Version': notionVersion,
};

function plainText(items = []) {
  return items.map((item) => item.plain_text ?? '').join('');
}

function propertyValue(properties, name) {
  return properties[name];
}

function readProperty(properties, name) {
  const property = propertyValue(properties, name);

  if (!property) return undefined;

  switch (property.type) {
    case 'title':
      return plainText(property.title);
    case 'rich_text':
      return plainText(property.rich_text);
    case 'status':
      return property.status?.name;
    case 'select':
      return property.select?.name;
    case 'multi_select':
      return property.multi_select.map((option) => option.name);
    case 'number':
      return property.number;
    case 'date':
      return property.date?.start;
    case 'relation':
      return property.relation.map((relation) => relation.id);
    default:
      return undefined;
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''));
}

function normalizeMarkdown(markdown) {
  return markdown
    .replace(/^---$/gm, '\\---')
    .replace(/<col(?!group\b)([^>/]*?)>/g, '<col$1 />')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function notionRequest(url, options = {}) {
  const headers = {
    ...notionHeaders,
    ...options.headers,
  };

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      delete headers[key];
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.message ?? `Notion request failed with ${response.status}`);
  }

  return json;
}

async function queryAllPages() {
  const pages = [];
  let startCursor;

  do {
    const body = {
      page_size: 100,
      sorts: [
        {
          property: 'Order',
          direction: 'ascending',
        },
      ],
    };

    if (startCursor) {
      body.start_cursor = startCursor;
    }

    const response = await notionRequest(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );

    pages.push(...response.results);
    startCursor = response.has_more ? response.next_cursor : undefined;
  } while (startCursor);

  return pages;
}

async function getPageMarkdown(pageId) {
  const response = await notionRequest(`https://api.notion.com/v1/pages/${pageId}/markdown`, {
    method: 'GET',
    headers: {
      'Content-Type': undefined,
    },
  });

  if (response.truncated || response.unknown_block_ids?.length) {
    console.warn(`Page ${pageId} returned truncated or unknown markdown blocks`);
  }

  return normalizeMarkdown(response.markdown ?? '');
}

function makeItem(page) {
  const title = readProperty(page.properties, 'Name') || 'Untitled';
  const slug = readProperty(page.properties, 'Slug') || slugify(title);
  const type = readProperty(page.properties, 'Type') || 'Post';

  return {
    id: page.id,
    title,
    slug: slugify(slug),
    description: readProperty(page.properties, 'Description') || '',
    status: readProperty(page.properties, 'Status') || 'Draft',
    type,
    order: readProperty(page.properties, 'Order') ?? 9999,
    publishedAt: readProperty(page.properties, 'Published At'),
    tags: readProperty(page.properties, 'Tags') || [],
    parentIds: readProperty(page.properties, 'Parent') || [],
  };
}

function compareItems(left, right) {
  return left.order - right.order || left.title.localeCompare(right.title);
}

function itemLevel(item) {
  switch (item.type.toLowerCase()) {
    case 'topic':
      return 0;
    case 'subtopic':
      return 1;
    default:
      return 2;
  }
}

function parentForItem(item, itemsById) {
  const itemRank = itemLevel(item);
  const parents = item.parentIds
    .map((id) => itemsById.get(id))
    .filter((candidate) => candidate && itemLevel(candidate) < itemRank)
    .sort(compareItems);

  return parents[0];
}

function buildPathSegments(item, itemsById, stack = new Set()) {
  if (stack.has(item.id)) {
    throw new Error(`Circular Notion parent relation detected at "${item.title}"`);
  }

  const parent = parentForItem(item, itemsById);

  if (!parent) {
    return [item.slug];
  }

  stack.add(item.id);
  const segments = [...buildPathSegments(parent, itemsById, stack), item.slug];
  stack.delete(item.id);

  return segments;
}

function frontmatter(item) {
  const lines = [
    '---',
    `title: ${yamlString(item.title)}`,
    `description: ${yamlString(item.description)}`,
  ];

  if (item.publishedAt) {
    lines.push(`date: ${yamlString(item.publishedAt)}`);
  }

  if (item.tags.length > 0) {
    lines.push('tags:');
    for (const tag of item.tags) {
      lines.push(`  - ${yamlString(tag)}`);
    }
  }

  lines.push('---');

  return `${lines.join('\n')}\n\n`;
}

async function writeMetaFiles(items, itemsById, pathById) {
  const childrenByParentPath = new Map();

  for (const item of items) {
    const parent = parentForItem(item, itemsById);
    const parentPath = parent ? pathById.get(parent.id).join('/') : '';
    const children = childrenByParentPath.get(parentPath) ?? [];
    children.push(item);
    childrenByParentPath.set(parentPath, children);
  }

  for (const [parentPath, children] of childrenByParentPath.entries()) {
    children.sort(compareItems);
    const metaPath = path.join(outputDir, parentPath, 'meta.json');
    const meta = {
      title: parentPath
        ? items.find((item) => pathById.get(item.id).join('/') === parentPath)?.title
        : 'AI Engineering Notes',
      pages: children.map((item) => item.slug),
    };

    await mkdir(path.dirname(metaPath), { recursive: true });
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  }
}

async function main() {
  const pages = await queryAllPages();
  const publishedItems = pages
    .map(makeItem)
    .filter((item) => publishStatuses.has(item.status.toLowerCase()) && item.slug);
  const itemsById = new Map(publishedItems.map((item) => [item.id, item]));
  const pathById = new Map();

  for (const item of publishedItems) {
    pathById.set(item.id, buildPathSegments(item, itemsById));
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  for (const item of publishedItems.sort(compareItems)) {
    const segments = pathById.get(item.id);
    const hasChildren = publishedItems.some((candidate) => parentForItem(candidate, itemsById)?.id === item.id);
    const isSection = ['topic', 'subtopic'].includes(item.type.toLowerCase()) || hasChildren;
    const filePath = isSection
      ? path.join(outputDir, ...segments, 'index.mdx')
      : path.join(outputDir, ...segments.slice(0, -1), `${segments.at(-1)}.mdx`);
    const markdown = await getPageMarkdown(item.id);
    const fallbackBody = item.description ? item.description : `# ${item.title}`;

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${frontmatter(item)}${markdown || fallbackBody}\n`);
  }

  await writeMetaFiles(publishedItems, itemsById, pathById);

  if (publishedItems.length === 0) {
    await writeFile(path.join(outputDir, '.gitkeep'), '');
  }

  console.log(`Synced ${publishedItems.length} published Notion page(s) to content/docs`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
