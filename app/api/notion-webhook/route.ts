import { createHmac, timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const notionVersion = '2026-03-11';
const publishStatuses = new Set(['published', 'done', 'complete']);

type NotionPage = {
  parent?: {
    type?: string;
    data_source_id?: string;
    database_id?: string;
  };
  properties?: Record<string, NotionProperty>;
};

type NotionProperty = {
  type: string;
  status?: {
    name?: string;
  };
  select?: {
    name?: string;
  };
};

type NotionWebhookEvent = {
  verification_token?: string;
  type?: string;
  entity?: {
    id?: string;
    type?: string;
  };
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function timingSafeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hasValidNotionSignature(body: string, signature: string | null) {
  const verificationToken = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;

  if (!verificationToken) return true;
  if (!signature?.startsWith('sha256=')) return false;

  const expected = `sha256=${createHmac('sha256', verificationToken).update(body).digest('hex')}`;

  return timingSafeCompare(signature, expected);
}

async function notionRequest(url: string) {
  const apiKey = process.env.NOTION_API_KEY;

  if (!apiKey) {
    throw new Error('Missing NOTION_API_KEY');
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': notionVersion,
    },
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.message ?? `Notion request failed with ${response.status}`);
  }

  return json;
}

function pageBelongsToConfiguredDataSource(page: NotionPage) {
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID;

  if (!dataSourceId) {
    throw new Error('Missing NOTION_DATA_SOURCE_ID');
  }

  return page.parent?.data_source_id === dataSourceId || page.parent?.database_id === dataSourceId;
}

function pageStatus(page: NotionPage) {
  const property = page.properties?.Status;

  if (!property) return undefined;

  if (property.type === 'status') {
    return property.status?.name;
  }

  if (property.type === 'select') {
    return property.select?.name;
  }

  return undefined;
}

async function triggerVercelDeploy() {
  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;

  if (!deployHookUrl) {
    throw new Error('Missing VERCEL_DEPLOY_HOOK_URL');
  }

  const response = await fetch(deployHookUrl, {
    method: 'POST',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vercel deploy hook failed with ${response.status}: ${body}`);
  }
}

export async function POST(request: Request) {
  const body = await request.text();

  if (!hasValidNotionSignature(body, request.headers.get('x-notion-signature'))) {
    return jsonResponse({ ok: false, error: 'Invalid Notion signature' }, 401);
  }

  let event: NotionWebhookEvent;

  try {
    event = JSON.parse(body);
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON payload' }, 400);
  }

  if (event.verification_token) {
    console.info(`Notion webhook verification token: ${event.verification_token}`);

    return jsonResponse({ ok: true, verification: 'logged' });
  }

  if (event.type !== 'page.properties_updated' || event.entity?.type !== 'page' || !event.entity.id) {
    return jsonResponse({ ok: true, ignored: true });
  }

  const page = (await notionRequest(`https://api.notion.com/v1/pages/${event.entity.id}`)) as NotionPage;

  if (!pageBelongsToConfiguredDataSource(page)) {
    return jsonResponse({ ok: true, ignored: true, reason: 'different_data_source' });
  }

  const status = pageStatus(page);

  if (!status || !publishStatuses.has(status.toLowerCase())) {
    return jsonResponse({ ok: true, ignored: true, status });
  }

  await triggerVercelDeploy();

  return jsonResponse({ ok: true, deployed: true, status });
}
