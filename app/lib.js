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

// ════════════ FINANCE ════════════

export const EXPENSE_CATEGORIES = ['Rent','Food','Transport','Utilities','Subscriptions','Health','Education','Family','Shopping','Travel','Tax','Other'];
export const INCOME_CATEGORIES  = ['Business','Freelance','Salary','Interest','Other'];

// 'YYYY-MM' for a Date, in local time.
export function monthKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Totals for one month. mk is 'YYYY-MM'.
export function summarise(txns, mk) {
  let income = 0, expense = 0, count = 0;
  txns.forEach(function (t) {
    if (!t.txn_date || t.txn_date.slice(0, 7) !== mk) return;
    count++;
    const a = Number(t.amount) || 0;
    if (t.kind === 'income') income += a; else expense += a;
  });
  return { income: income, expense: expense, net: income - expense, count: count };
}

// Category totals for one month and kind, largest first, with percentage of that kind's total.
export function byCategory(txns, mk, kind) {
  const totals = {};
  let sum = 0;
  txns.forEach(function (t) {
    if (!t.txn_date || t.txn_date.slice(0, 7) !== mk || t.kind !== kind) return;
    const a = Number(t.amount) || 0;
    const c = t.category || 'Other';
    totals[c] = (totals[c] || 0) + a;
    sum += a;
  });
  return Object.keys(totals)
    .map(function (c) { return { category: c, total: totals[c], pct: sum ? Math.round(totals[c] / sum * 100) : 0 }; })
    .sort(function (a, b) { return b.total - a.total; });
}

// Last n months ending with the month containing `today`, oldest first.
export function monthlyTotals(txns, n, today = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const mk = monthKey(d);
    const s = summarise(txns, mk);
    out.push({ key: mk, income: s.income, expense: s.expense, net: s.net });
  }
  return out;
}

// Months of cover. null when it cannot be computed.
export function runwayMonths(cashOnHand, avgMonthlyExpense) {
  if (cashOnHand == null || !avgMonthlyExpense || avgMonthlyExpense <= 0) return null;
  return cashOnHand / avgMonthlyExpense;
}

// Ordered observations. Each: { level: 'alert'|'warn'|'info', text }.
export function financeInsights(opts) {
  const txns = opts.txns || [];
  const bills = opts.bills || [];
  const settings = opts.settings || {};
  const today = opts.today || new Date();
  const mk = monthKey(today);
  const cur = summarise(txns, mk);
  const out = [];

  // 1. Runway — the number that matters most on irregular income
  const recent = monthlyTotals(txns, 4, today).slice(0, 3);   // three COMPLETE prior months
  const withData = recent.filter(function (m) { return m.expense > 0; });
  const avgExp = withData.length
    ? withData.reduce(function (a, m) { return a + m.expense; }, 0) / withData.length
    : 0;
  const runway = runwayMonths(settings.cash_on_hand, avgExp);
  if (runway != null) {
    out.push({
      level: runway < 3 ? 'alert' : (runway < 6 ? 'warn' : 'info'),
      text: runway.toFixed(1) + ' months of cover at your recent burn'
    });
  }

  // 2. Savings rate
  if (cur.income > 0) {
    const rate = Math.round(cur.net / cur.income * 100);
    out.push({
      level: rate < 0 ? 'alert' : (rate < 10 ? 'warn' : 'info'),
      text: rate < 0
        ? 'Spending exceeds income this month by ' + Math.abs(rate) + '%'
        : 'Keeping ' + rate + '% of income this month'
    });
  }

  // 3. Categories running hot versus their own 3-month average
  const prior = monthlyTotals(txns, 4, today).slice(0, 3).map(function (m) { return m.key; });
  byCategory(txns, mk, 'expense').forEach(function (c) {
    let sum = 0, seen = 0;
    prior.forEach(function (pk) {
      const rows = byCategory(txns, pk, 'expense').find(function (x) { return x.category === c.category; });
      if (rows) { sum += rows.total; seen++; }
    });
    if (seen < 2) return;                       // not enough history to judge
    const avg = sum / seen;
    if (avg > 0 && c.total > avg * 1.5 && c.total - avg >= 1000) {
      out.push({
        level: 'warn',
        text: c.category + ' is ' + Math.round((c.total / avg - 1) * 100) + '% above its recent average'
      });
    }
  });

  // 4. Bills landing this week
  const soon = bills.filter(function (b) {
    if (b.paid || !b.due_date) return false;
    const days = Math.floor((new Date(b.due_date + 'T00:00:00') - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    return days <= 7;
  });
  if (soon.length) {
    const total = soon.reduce(function (a, b) { return a + (Number(b.amount) || 0); }, 0);
    out.push({ level: 'warn', text: soon.length + ' bill' + (soon.length > 1 ? 's' : '') + ' due within a week' + (total ? ', ₹' + Math.round(total).toLocaleString('en-IN') : '') });
  }

  // 5. Tax set-aside on this month's income
  if (settings.tax_rate > 0 && cur.income > 0) {
    out.push({ level: 'info', text: 'Set aside ₹' + Math.round(cur.income * settings.tax_rate / 100).toLocaleString('en-IN') + ' for tax from this month' });
  }

  // 6. Capture has lapsed — the failure mode that kills finance apps
  if (txns.length) {
    const latest = txns.map(function (t) { return t.txn_date; }).filter(Boolean).sort().pop();
    const gap = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(latest + 'T00:00:00')) / 86400000);
    if (gap >= 5) out.push({ level: 'warn', text: 'Nothing logged for ' + gap + ' days' });
  }

  return out;
}
