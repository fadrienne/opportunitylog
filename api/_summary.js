// Pure logic for /api/summary. The leading underscore keeps Vercel from routing this file.
// It mirrors the Opportunity Log's own rules (index.html): an opportunity is "active" when it is
// not archived, not deleted and its status is Pending; deadlines are read from the category's
// deadline field and parsed the same way the app parses them.

const DEADLINE_KEY = { Conferences: 'abstract_deadline' };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function calendar(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { y, m, d, day: Math.floor(t.getTime() / 86400000) };
}

function monthNumber(name) {
  const n = String(name).toLowerCase();
  const i = MONTHS.findIndex((m) => m.startsWith(n.slice(0, 3)));
  return i + 1; // 0 when not found
}

export function parseDeadline(str) {
  if (!str) return null;
  const value = String(str).replace(/^~/, '').split('(')[0].trim();
  let m = value.match(/(?:^|\D)(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
  if (m) return calendar(+m[1], +m[2], +m[3]);
  m = value.match(/(?:^|\D)(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\D|$)/);
  if (m) {
    const first = +m[1], second = +m[2], year = +m[3];
    if (first > 12) return calendar(year, second, first);
    if (second > 12) return calendar(year, first, second);
    return calendar(year, second, first);
  }
  m = value.match(/(?:^|\D)(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\D|$)/);
  if (m) {
    const month = monthNumber(m[2]);
    if (month) return calendar(+m[3], month, +m[1]);
  }
  m = value.match(/(?:^|\D)([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\D|$)/);
  if (m) {
    const month = monthNumber(m[1]);
    if (month) return calendar(+m[3], month, +m[2]);
  }
  return null;
}

function seychellesToday(now) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Indian/Mahe', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).forEach((x) => { p[x.type] = x.value; });
  return calendar(+p.year, +p.month, +p.day);
}

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (c) => `${c.y}-${pad(c.m)}-${pad(c.d)}`;
const text = (v) => (v == null ? '' : String(v).trim());

export function summarise(records, now = new Date()) {
  const today = seychellesToday(now);
  const counts = {
    active: 0, apply: 0, park: 0, pass: 0, notEligible: 0, notAssessed: 0,
    notStarted: 0, drafting: 0, submitted: 0, awaitingClarification: 0,
    awaitingDecision: 0, dueIn7: 0, dueIn14: 0, pastDeadline: 0
  };
  const cats = new Map();
  let next = null; // soonest upcoming deadline among actionable Apply items
  let nextAny = null; // fallback: soonest upcoming deadline among any active item

  for (const rec of Array.isArray(records) ? records : []) {
    if (!rec || typeof rec !== 'object' || rec.deleted || rec.archived) continue;
    const f = rec.fields && typeof rec.fields === 'object' ? rec.fields : {};
    if (text(f.status).toLowerCase() !== 'pending') continue;

    counts.active++;
    const outcome = text(f.outcome);
    const action = text(f.action);
    const outcomeLc = outcome.toLowerCase();
    const actionLc = action.toLowerCase();

    if (outcomeLc === 'apply') counts.apply++;
    else if (outcomeLc === 'park') counts.park++;
    else if (outcomeLc === 'pass (not eligible)') counts.notEligible++;
    else if (outcomeLc === 'pass') counts.pass++;
    else counts.notAssessed++;

    if (actionLc === 'not started') counts.notStarted++;
    else if (actionLc === 'drafting') counts.drafting++;
    else if (actionLc === 'submitted') counts.submitted++;
    else if (actionLc === 'awaiting clarification') counts.awaitingClarification++;
    if (actionLc === 'submitted') counts.awaitingDecision++;

    const key = DEADLINE_KEY[rec.category] || 'deadline';
    const raw = text(f[key]);
    const dl = raw.toLowerCase().includes('rolling') ? null : parseDeadline(raw);
    const days = dl ? dl.day - today.day : null;

    const done = actionLc === 'submitted' || actionLc.startsWith('declined') || actionLc.startsWith('deferred');
    const actionable = outcomeLc === 'apply' && !done;

    const cat = cats.get(rec.category) || { name: rec.category || 'Other', open: 0, nextDay: null, nextDate: null };
    cat.open++;
    if (dl && days >= 0 && (cat.nextDay === null || dl.day < cat.nextDay)) { cat.nextDay = dl.day; cat.nextDate = isoDate(dl); }
    cats.set(rec.category, cat);

    if (dl && days !== null) {
      if (actionable && days < 0) counts.pastDeadline++;
      if (actionable && days >= 0 && days <= 14) counts.dueIn14++;
      if (actionable && days >= 0 && days <= 7) counts.dueIn7++;
      if (days >= 0) {
        const cand = { day: dl.day, label: text(f.title) || 'Untitled opportunity', date: isoDate(dl) };
        if (actionable && (!next || cand.day < next.day)) next = cand;
        if (!nextAny || cand.day < nextAny.day) nextAny = cand;
      }
    }
  }

  const pick = next || nextAny;
  return {
    component: 'opportunities',
    title: 'Opportunity Log',
    needsYouToday: counts.dueIn7,
    next: pick ? { label: pick.label, date: pick.date } : null,
    counts,
    categories: Array.from(cats.values())
      .sort((a, b) => b.open - a.open || String(a.name).localeCompare(String(b.name)))
      .map((c) => ({ name: c.name, open: c.open, nextDate: c.nextDate })),
    generatedAt: now.toISOString()
  };
}
