import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, streakFrom, isQuiet, dueSoon } from '../app/lib.js';

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
