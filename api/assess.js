export const config = { runtime: 'edge' };

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
}

async function sameKey(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = await sha256(given);
  const b = await sha256(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Only these models may be requested, and no request may ask for more than MAX_TOKENS.
const ALLOWED_MODELS = (process.env.ASSESS_ALLOWED_MODELS || 'claude-sonnet-4-6').split(',').map((m) => m.trim()).filter(Boolean);
const MAX_TOKENS = 4000;
const MAX_SEARCHES = 2;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return jsonResponse({ error: { message: 'Method not allowed' } }, 405);
  }

  // No CORS headers on purpose: the page calls this from its own origin. A browser that sends an
  // Origin must send this site's own.
  const origin = req.headers.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) { host = ''; }
    if (host !== req.headers.get('host')) return jsonResponse({ error: { message: 'Origin not allowed.' } }, 403);
  }

  // Fail closed: uses the same key as cloud sync (OPPORTUNITY_SYNC_KEY), which the page already stores.
  const syncKey = process.env.OPPORTUNITY_SYNC_KEY;
  if (!syncKey) {
    return jsonResponse({ error: { message: 'OPPORTUNITY_SYNC_KEY is not set in Vercel, so assessments are switched off.' } }, 503);
  }
  if (!(await sameKey(req.headers.get('x-sync-key'), syncKey))) {
    return jsonResponse({ error: { message: 'Access key missing or wrong. Enter the sync key in the sync settings first.' } }, 401);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse({
      error: { message: 'ANTHROPIC_API_KEY environment variable is not set in Vercel.' },
    }, 500);
  }

  let requestBody;
  try {
    requestBody = JSON.parse(await req.text());
  } catch (e) {
    return jsonResponse({ error: { message: 'Request body must be valid JSON.' } }, 400);
  }
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    return jsonResponse({ error: { message: 'Request body must be a JSON object.' } }, 400);
  }
  if (!ALLOWED_MODELS.includes(requestBody.model)) {
    return jsonResponse({ error: { message: 'That model is not allowed here.' } }, 400);
  }
  const tokens = Number(requestBody.max_tokens);
  if (!Number.isFinite(tokens) || tokens < 1 || tokens > MAX_TOKENS) {
    return jsonResponse({ error: { message: 'max_tokens must be between 1 and ' + MAX_TOKENS + '.' } }, 400);
  }
  if (requestBody.tools !== undefined) {
    const ok = Array.isArray(requestBody.tools) && requestBody.tools.length <= 1 &&
      requestBody.tools.every((t) => t && t.name === 'web_search' && String(t.type).startsWith('web_search_') && (t.max_uses || 1) <= MAX_SEARCHES);
    if (!ok) return jsonResponse({ error: { message: 'Only one web_search tool is allowed.' } }, 400);
  }
  requestBody.stream = true;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });

  if (!upstream.ok) {
    const data = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(data);
    } catch (e) {
      payload = {
        error: {
          message: `Anthropic returned a non-JSON response (HTTP ${upstream.status}): ${data.trim().slice(0, 240) || 'Empty response.'}`,
        },
      };
    }
    return jsonResponse(payload, upstream.status);
  }

  if (!upstream.body) {
    return jsonResponse({ error: { message: 'Anthropic returned an empty streaming response.' } }, 502);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
