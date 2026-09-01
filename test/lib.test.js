import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, streakFrom, isQuiet, dueSoon, enqueue, drainable, monthKey, summarise, byCategory, monthlyTotals, runwayMonths, financeInsights } from '../app/lib.js';

test('iso formats a date as YYYY-MM-DD in local time', () => {
  assert.equal(iso(new Date(2026, 7, 31)), '2026-08-31');
  assert.equal(iso(new Date(2026, 0, 1)), '2026-01-01');
});

test('streakFrom counts consecutive days ending today', () => {
  const today = new Date(2026, 7, 31);
  const set = new Set(['2026-08-31', '2026-08-30', '2026-08-29']);
  assert.equal(streakFrom(set, today), 3);
});

test('streakFrom still counts when today is not yet logged', () => {
  const today = new Date(2026, 7, 31);
  const set = new Set(['2026-08-30', '2026-08-29']);
  assert.equal(streakFrom(set, today), 2);
});

test('streakFrom returns 0 when the chain is broken before yesterday', () => {
  const today = new Date(2026, 7, 31);
  const set = new Set(['2026-08-28']);
  assert.equal(streakFrom(set, today), 0);
});

test('streakFrom returns 0 for an empty set', () => {
  assert.equal(streakFrom(new Set(), new Date(2026, 7, 31)), 0);
});

test('isQuiet marks a venture quiet after 14 days of no activity', () => {
  const today = new Date(2026, 7, 31);
  assert.equal(isQuiet('2026-08-17', today), false); // 14 days — on the boundary, not yet quiet
  assert.equal(isQuiet('2026-08-16', today), true);  // 15 days — quiet
  assert.equal(isQuiet(null, today), true);          // never active
});

test('dueSoon selects items inside the window and flags the urgent ones', () => {
  const today = new Date(2026, 7, 31);
  const rows = [
    { name: 'domain', due_date: '2026-09-01' },
    { name: 'rent', due_date: '2026-09-06' },
    { name: 'insurance', due_date: '2026-09-30' },
    { name: 'overdue', due_date: '2026-08-29' }
  ];
  const out = dueSoon(rows, today);
  assert.deepEqual(out.map(r => r.name), ['overdue', 'domain', 'rent']);
  assert.equal(out[0].urgent, true);
  assert.equal(out[1].urgent, true);
  assert.equal(out[2].urgent, false);
});
test('enqueue appends and de-duplicates by label', () => {
  const a = enqueue([], { label: 'one' });
  assert.deepEqual(a.map(x => x.label), ['one']);
  const b = enqueue(a, { label: 'two' });
  assert.deepEqual(b.map(x => x.label), ['one', 'two']);
  const c = enqueue(b, { label: 'one' });
  assert.deepEqual(c.map(x => x.label), ['two', 'one']);
});

test('enqueue keeps the queue bounded', () => {
  let list = [];
  for (let i = 0; i < 10; i++) list = enqueue(list, { label: 'x' + i }, 5);
  assert.equal(list.length, 5);
  assert.equal(list[0].label, 'x5');
});

test('drainable skips malformed entries', () => {
  assert.deepEqual(
    drainable([{ label: 'ok' }, null, { label: '' }, { nope: 1 }]).map(x => x.label),
    ['ok']
  );
});

const T = (kind, amount, category, txn_date) => ({ kind, amount, category, txn_date });

test('monthKey formats year-month in local time', () => {
  assert.equal(monthKey(new Date(2026, 7, 31)), '2026-08');
  assert.equal(monthKey(new Date(2026, 0, 1)), '2026-01');
});

test('summarise totals one month and ignores other months', () => {
  const t = [T('income', 100, 'Business', '2026-08-02'), T('expense', 30, 'Food', '2026-08-03'), T('expense', 999, 'Food', '2026-07-30')];
  assert.deepEqual(summarise(t, '2026-08'), { income: 100, expense: 30, net: 70, count: 2 });
});

test('summarise returns zeroes for an empty month', () => {
  assert.deepEqual(summarise([], '2026-08'), { income: 0, expense: 0, net: 0, count: 0 });
});

test('byCategory ranks largest first with percentages', () => {
  const t = [T('expense', 60, 'Rent', '2026-08-01'), T('expense', 30, 'Food', '2026-08-02'), T('expense', 10, 'Food', '2026-08-03'), T('income', 500, 'Business', '2026-08-01')];
  const out = byCategory(t, '2026-08', 'expense');
  assert.deepEqual(out.map(x => x.category), ['Rent', 'Food']);
  assert.equal(out[0].total, 60);
  assert.equal(out[0].pct, 60);
  assert.equal(out[1].total, 40);
});

test('monthlyTotals returns n months oldest first', () => {
  const out = monthlyTotals([T('expense', 10, 'Food', '2026-07-05')], 3, new Date(2026, 7, 31));
  assert.deepEqual(out.map(m => m.key), ['2026-06', '2026-07', '2026-08']);
  assert.equal(out[1].expense, 10);
  assert.equal(out[2].expense, 0);
});

test('runwayMonths divides cash by burn, null when incomputable', () => {
  assert.equal(runwayMonths(60000, 20000), 3);
  assert.equal(runwayMonths(null, 20000), null);
  assert.equal(runwayMonths(60000, 0), null);
});

test('financeInsights flags a short runway as an alert', () => {
  const today = new Date(2026, 7, 31);
  const txns = [T('expense', 20000, 'Rent', '2026-06-05'), T('expense', 20000, 'Rent', '2026-07-05')];
  const out = financeInsights({ txns, settings: { cash_on_hand: 30000 }, today });
  const r = out.find(x => x.text.includes('months of cover'));
  assert.ok(r);
  assert.equal(r.level, 'alert');
  assert.equal(r.text.startsWith('1.5'), true);
});

test('financeInsights reports a negative savings rate', () => {
  const today = new Date(2026, 7, 31);
  const txns = [T('income', 100, 'Business', '2026-08-01'), T('expense', 150, 'Food', '2026-08-02')];
  const out = financeInsights({ txns, today });
  assert.ok(out.some(x => x.level === 'alert' && x.text.includes('exceeds income')));
});

test('financeInsights needs two months of history before calling a category hot', () => {
  const today = new Date(2026, 7, 31);
  const one = [T('expense', 1000, 'Food', '2026-07-01'), T('expense', 9000, 'Food', '2026-08-01')];
  assert.equal(financeInsights({ txns: one, today }).some(x => x.text.includes('above its recent average')), false);
  const two = one.concat([T('expense', 1000, 'Food', '2026-06-01')]);
  assert.ok(financeInsights({ txns: two, today }).some(x => x.text.includes('Food') && x.text.includes('above its recent average')));
});

test('financeInsights warns when capture has lapsed', () => {
  const today = new Date(2026, 7, 31);
  const out = financeInsights({ txns: [T('expense', 10, 'Food', '2026-08-20')], today });
  assert.ok(out.some(x => x.text === 'Nothing logged for 11 days'));
});
