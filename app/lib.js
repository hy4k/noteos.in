// Pure helpers. No DOM, no network, no Supabase — so this file is unit-testable.

export function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return iso(new Date());
}

// Consecutive days ending today, or ending yesterday if today is not logged yet.
export function streakFrom(logSet, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!logSet.has(iso(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (logSet.has(iso(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export const QUIET_DAYS = 14;

// A venture with no task activity for QUIET_DAYS is quiet. Never active = quiet.
export function isQuiet(lastActivityIso, today = new Date()) {
  if (!lastActivityIso) return true;
  const last = new Date(lastActivityIso + 'T00:00:00');
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.floor((now - last) / 86400000);
  return days > QUIET_DAYS;
}

export const DUE_WINDOW_DAYS = 7;
export const DUE_URGENT_DAYS = 2;

// Items due within DUE_WINDOW_DAYS (overdue included), soonest first,
// each flagged urgent when due within DUE_URGENT_DAYS.
export function dueSoon(rows, today = new Date()) {
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return rows
    .map((r) => {
      const due = new Date(r.due_date + 'T00:00:00');
      const days = Math.floor((due - now) / 86400000);
      return { ...r, days, urgent: days <= DUE_URGENT_DAYS };
    })
    .filter((r) => r.days <= DUE_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);
}

export const QUEUE_KEY = 'threshold.queue.tasks';

// Append an item, keeping the queue bounded and free of exact duplicates.
export function enqueue(list, item, max = 200) {
  const next = list.filter(function (x) { return x.label !== item.label; });
  next.push(item);
  return next.slice(-max);
}

// Items old enough to be worth retrying are all of them; kept as a seam
// so retry policy can change without touching storage code.
export function drainable(list) {
  return list.filter(function (x) { return x && typeof x.label === 'string' && x.label.length > 0; });
}
