// Pure logic for /api/summary. The leading underscore keeps Vercel from routing this file.
// It mirrors the Opportunity Log's own rules (index.html): an opportunity is "active" when it is
// not archived, not deleted and its status is Pending; deadlines are read from the category's
// deadline field and parsed the same way the app parses them.

const DEADLINE_KEY = { Conferences: 'abstract_deadline' };
// Where each category keeps its provider or place (Internship has none).
const PROVIDER_KEY = { 'Grants & Fellowships': 'implementor', 'Consultancies & Jobs': 'implementor', Scholarships: 'implementor', Masters: 'location', PhD: 'location', Trainings: 'location', Conferences: 'location' };
const LIST_LIMIT = 10;
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
    awaitingDecision: 0, dueIn7: 0, dueIn14: 0, pastDeadline: 0,
    // The Opportunity Log's own home-page numbers: upcoming is any active item with a dated
    // deadline in the next 60 days (whatever its outcome or action), ideas is any active item
    // with an idea, plan, task, or an action of Drafting, Not Started or Awaiting Clarification.
    upcoming: 0, ideas: 0
  };
  const cats = new Map();
  let next = null; // soonest upcoming deadline among actionable Apply items
  let nextAny = null; // fallback: soonest upcoming deadline among open items that are not Pass or Not Eligible
  const deadlines = []; // upcoming, still open, not passed on
  const upcoming = []; // the log's "Upcoming deadlines": active, dated, 0 to 60 days away
  const overdue = []; // actionable and past their deadline
  const waiting = []; // submitted and still pending

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

    const item = {
      id: text(rec.id),
      title: text(f.title) || 'Untitled opportunity',
      category: rec.category || 'Other',
      provider: text(f[PROVIDER_KEY[rec.category]]) || null,
      deadline: dl ? isoDate(dl) : null,
      outcome: outcome || null,
      action: action || null,
      day: dl ? dl.day : null
    };
    const ws = rec.workspace && typeof rec.workspace === 'object' ? rec.workspace : {};
    if (text(ws.idea) || text(ws.plan) || (Array.isArray(ws.tasks) && ws.tasks.length) ||
        ['Drafting', 'Not Started', 'Awaiting Clarification'].includes(f.action)) counts.ideas++;
    if (dl && days >= 0 && days <= 60) {
      counts.upcoming++;
      upcoming.push({ ...item, soon: actionable && days <= 7 });
    }
    if (actionLc === 'submitted') waiting.push(item);
    else if (dl && days >= 0 && !done && outcomeLc !== 'pass' && outcomeLc !== 'pass (not eligible)') deadlines.push(item);
    if (actionable && dl && days < 0) overdue.push(item);

    const cat = cats.get(rec.category) || { name: rec.category || 'Other', open: 0, nextDay: null, nextDate: null };
    cat.open++;
    if (dl && days >= 0 && (cat.nextDay === null || dl.day < cat.nextDay)) { cat.nextDay = dl.day; cat.nextDate = isoDate(dl); }
    cats.set(rec.category, cat);

    if (dl && days !== null) {
      if (actionable && days < 0) counts.pastDeadline++;
      if (actionable && days >= 0 && days <= 14) counts.dueIn14++;
      if (actionable && days >= 0 && days <= 7) counts.dueIn7++;
      if (days >= 0) {
        const cand = { day: dl.day, label: text(f.title) || 'Untitled opportunity', date: isoDate(dl), id: text(rec.id) };
        if (actionable && (!next || cand.day < next.day)) next = cand;
        const worthShowing = !done && outcomeLc !== 'pass' && outcomeLc !== 'pass (not eligible)';
        if (worthShowing && (!nextAny || cand.day < nextAny.day)) nextAny = cand;
      }
    }
  }

  const pick = next || nextAny;
  return {
    component: 'opportunities',
    title: 'Opportunity Log',
    needsYouToday: counts.dueIn7,
    next: pick ? { label: pick.label, date: pick.date, id: pick.id } : null,
    counts,
    categories: Array.from(cats.values())
      .sort((a, b) => b.open - a.open || String(a.name).localeCompare(String(b.name)))
      .map((c) => ({ name: c.name, open: c.open, nextDate: c.nextDate })),
    items: {
      upcoming: upcoming.sort(byDay).slice(0, LIST_LIMIT).map(clean),
      deadlines: deadlines.sort(byDay).slice(0, LIST_LIMIT).map(clean),
      overdue: overdue.sort(byDay).slice(0, LIST_LIMIT).map(clean),
      waiting: waiting.sort(byTitle).slice(0, LIST_LIMIT).map(clean)
    },
    generatedAt: now.toISOString()
  };
}

const byDay = (a, b) => a.day - b.day || a.title.localeCompare(b.title);
const byTitle = (a, b) => a.title.localeCompare(b.title);
const clean = ({ day, ...rest }) => rest;
