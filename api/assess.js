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

  const body = await req.text();

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body,
  });

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
