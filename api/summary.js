// GET /api/summary
// Read-only roll-up for the Command Centre: counts by outcome and action, what is due soon,
// and the next deadline. It returns no descriptions, notes, assessments or workspace content;
// the only opportunity text is the title of the single next deadline.
// Protected by its own key (OPPORTUNITY_SUMMARY_KEY), separate from the sync key, so the
// Command Centre can read the summary without being able to change any records.
import { summarise } from './_summary.js';

export const config = { runtime: 'edge' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

async function sameKey(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default async function handler(req) {
  if (req.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);

  const expectedKey = process.env.OPPORTUNITY_SUMMARY_KEY;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expectedKey || !url || !serviceKey) {
    return json({ error: 'OPPORTUNITY_SUMMARY_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel.' }, 500);
  }
  if (!(await sameKey(req.headers.get('x-summary-key'), expectedKey))) {
    return json({ error: 'Invalid summary key.' }, 401);
  }

  let upstream;
  try {
    upstream = await fetch(`${url.replace(/\/$/, '')}/rest/v1/opportunity_log_sync?id=eq.primary&select=records`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    });
  } catch (e) {
    return json({ error: 'Could not reach Supabase.' }, 502);
  }
  if (!upstream.ok) return json({ error: `Supabase read failed (HTTP ${upstream.status}).` }, 502);

  const rows = await upstream.json();
  const records = Array.isArray(rows) && rows.length ? rows[0].records : [];
  return json(summarise(records));
}
