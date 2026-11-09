export const config = { runtime: 'edge' };

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: { message: 'Method not allowed' } }, 405);
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
      'Access-Control-Allow-Origin': '*',
    },
  });
}
