export const config = { runtime: 'edge' };

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
  });
}

function syncVersion(record) {
  const parsed = Date.parse(record && record._syncUpdatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeRecords(current, incoming) {
  const merged = new Map((current || []).filter(record => record && record.id).map(record => [record.id, record]));
  for (const record of incoming) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string') continue;
    const existing = merged.get(record.id);
    if (!existing || syncVersion(record) >= syncVersion(existing)) merged.set(record.id, record);
  }
  return Array.from(merged.values());
}

async function supabaseRequest(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase environment variables are not configured in Vercel.');
  return fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

async function readCloudRecords() {
  const response = await supabaseRequest('opportunity_log_sync?id=eq.primary&select=records');
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Supabase read failed (HTTP ${response.status}): ${detail}`);
  }
  const rows = await response.json();
  return rows.length ? rows[0].records : null;
}

async function writeCloudRecords(records) {
  const response = await supabaseRequest('opportunity_log_sync', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: 'primary',
      records,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Supabase write failed (HTTP ${response.status}): ${detail}`);
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });
  if (!['GET', 'POST'].includes(req.method)) {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const expectedKey = process.env.OPPORTUNITY_SYNC_KEY;
  if (!expectedKey) return jsonResponse({ error: 'OPPORTUNITY_SYNC_KEY is not configured in Vercel.' }, 500);
  if (req.headers.get('x-sync-key') !== expectedKey) {
    return jsonResponse({ error: 'Invalid sync key.' }, 401);
  }

  try {
    if (req.method === 'GET') {
      return jsonResponse({ records: await readCloudRecords() || [] });
    }

    let payload;
    try {
      payload = await req.json();
    } catch (e) {
      return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
    }
    if (!payload || !Array.isArray(payload.records)) {
      return jsonResponse({ error: 'Request body must contain a records array.' }, 400);
    }
    if (payload.records.length > 5000) {
      return jsonResponse({ error: 'The records list exceeds the supported size.' }, 413);
    }

    const existing = await readCloudRecords();
    const records = mergeRecords(existing, payload.records);
    await writeCloudRecords(records);
    return jsonResponse({ records });
  } catch (error) {
    console.error('Opportunity sync failed:', error);
    return jsonResponse({ error: error.message || 'Opportunity sync failed.' }, 502);
  }
}
