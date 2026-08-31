# Threshold Foundation Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Threshold from a demo mockup with fabricated content into an honest, authenticated, modular app that is safe to put real data into.

**Architecture:** Strip the hardcoded demo data and the seeding that writes invented rows into Supabase. Restore the password gate that already exists in the code. Split the 373-line inline script into native ES modules with no build step, isolating pure logic into `app/lib.js` so it can be unit-tested under `node --test`. Consolidate the nav from ten sections to six. Section-by-section wiring to the twelve unused tables is Phase 2 and is NOT in this plan.

**Tech Stack:** Vanilla ES2017 JavaScript, native ES modules (no bundler), `supabase-js` v2 from CDN, nginx:alpine in Docker, Traefik, `node --test` for unit tests (dev-only, never shipped).

**Working directory:** `/opt/apps/noteos` on VPS `72.61.171.192`. Repo `github.com/hy4k/noteos.in`, branch `implement-threshold`.

**Database:** Migrations are already applied to Supabase project `noteosnewsos` (`ijodwhogkafoeofacslq`). `tasks.venture_id` exists, `bills` exists with RLS. No further DB work in this plan.

---

## Preconditions

**BLOCKING — do not start Task 3 until this is confirmed.** Exactly one user exists in `auth.users`. Once the auth bypass is removed, that password is the only way in. Confirm the password for `midhunnr@gmail.com` works, or reset it in the Supabase dashboard, before Task 3 is deployed.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Markup + `<style>` only. Inline `<script>` reduced to one module import. |
| `app/lib.js` | Pure functions. No DOM, no network, no Supabase. Unit-tested. |
| `app/data.js` | Supabase client, auth, all queries. The only file that talks to the database. |
| `app/ui.js` | Shared DOM helpers (`$`, `el`), nav, section switching, scroller, clock. |
| `app/main.js` | Entry point. Imports the others, boots the app. |
| `test/lib.test.js` | `node --test` unit tests for `app/lib.js`. |
| `.gitattributes` | `* text=auto` — stops the CRLF churn that makes diffs unreadable. |

Phase 2 adds `app/today.js`, `app/work.js`, `app/tasks.js`, `app/personal.js`, `app/journal.js`, `app/finance.js`.

---

### Task 1: Repo hygiene and a real baseline commit

The live build is the working tree, not any commit. Fix that before changing anything, so there is something to roll back to.

**Files:**
- Create: `.gitattributes`
- Commit: existing modified files

- [ ] **Step 1: Confirm what is uncommitted**

```bash
cd /opt/apps/noteos && git status --short && git diff --stat --ignore-cr-at-eol
```

Expected: `M README.md, M index.html, M manifest.json, M supabase-config.js, M sw.js`, plus untracked `Dockerfile` and `compose.yml`. The `--ignore-cr-at-eol` diff should show roughly 17 changed lines, all in `index.html`.

- [ ] **Step 2: Create `.gitattributes`**

```
* text=auto
*.png binary
*.jpg binary
```

- [ ] **Step 3: Commit the current live state**

This commit records reality, including the auth bypass. Task 3 removes it. Do not skip — this is the rollback point.

```bash
cd /opt/apps/noteos
git add .gitattributes Dockerfile compose.yml README.md index.html manifest.json supabase-config.js sw.js
git commit -m "chore: commit deployed state as baseline

The live build was an uncommitted working tree. This records it verbatim,
including the auth bypass, so there is a rollback point before changes."
```

- [ ] **Step 4: Verify the tree is clean**

```bash
cd /opt/apps/noteos && git status --short
```

Expected: no output.

---

### Task 2: Remove the fake seed data

`TASK_SEED` and `HABIT_SEED` write invented rows into the real database whenever a table returns empty. This must go before auth is restored, or the first real login pollutes Supabase.

**Files:**
- Modify: `index.html` — the `DATA LAYER` block

- [ ] **Step 1: Delete the seed constants**

Remove these two declarations entirely from the `DATA LAYER` section:

```javascript
  var TASK_SEED = [
    { label: 'Ship the FOCUS timer — NoteOS', priority: 'P1', position: 0 },
    { label: 'Evaluate FETS aptitude papers (24)', priority: 'P1', position: 1 },
    { label: 'Reply to two client emails', priority: 'P2', position: 2 },
    { label: 'Push FETS portal exam module to review', priority: 'P2', position: 3 },
    { label: 'Draft Salt & Static #58', priority: 'P3', position: 4 },
    { label: 'Renew noteos.in domain', priority: 'P3', position: 5 }
  ];
  var HABIT_SEED = ['Deep Work', 'Morning Walk', 'Read 30 min', 'Daily Commit', 'No Screens After 10'];
```

Keep `var pColor = { P1: 'var(--accent)', P2: '#8E8A82', P3: '#5A5752' };` — it is still used by `renderTasks`.

- [ ] **Step 2: Replace `initTasks` so it never writes**

Replace the whole `initTasks` function with:

```javascript
  async function initTasks() {
    var res = await sb.from('tasks').select('*').order('position', { ascending: true });
    tasksCache = res.data || [];
    renderTasks();
  }
```

- [ ] **Step 3: Replace `initHabits` so it never writes**

Replace the whole `initHabits` function with:

```javascript
  async function initHabits() {
    var res = await sb.from('habits').select('*').order('position', { ascending: true });
    habitsCache = res.data || [];
    var logs = (await sb.from('habit_logs').select('habit_id, log_date')).data || [];
    logsByHabit = {};
    logs.forEach(function (l) { (logsByHabit[l.habit_id] = logsByHabit[l.habit_id] || new Set()).add(l.log_date); });
    renderHabits();
  }
```

- [ ] **Step 4: Verify no seeding remains**

```bash
cd /opt/apps/noteos && grep -n "SEED" index.html
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd /opt/apps/noteos
git add index.html
git commit -m "fix: stop seeding invented tasks and habits into the database

initTasks and initHabits inserted hardcoded demo rows whenever the table
came back empty, which would write fabricated data into real Supabase on
first login."
```

---

### Task 3: Restore authentication

The sign-in code is complete and correct already. Only `boot()` was altered. Per the design, a returning session goes straight to Today with no hold-to-enter.

**Files:**
- Modify: `index.html` — the `BOOT` block

- [ ] **Step 1: Confirm the precondition**

The password for `midhunnr@gmail.com` must be known or reset in the Supabase dashboard for project `ijodwhogkafoeofacslq`. **Do not proceed otherwise.**

- [ ] **Step 2: Replace `boot()`**

Replace the entire current `boot()` function with:

```javascript
  async function boot() {
    if (!sb) {
      paneSignin.style.display = 'block'; showLock();
      liShow('Backend not configured. Add your Supabase anon key in supabase-config.js.', 'err');
      $('li-email').style.display = 'none'; $('li-pass').style.display = 'none'; $('li-go').style.display = 'none';
      return;
    }
    var s = await sb.auth.getSession();
    if (s.data.session) {
      hideLock();
      initData();
    } else {
      $('li-sub').textContent = 'Sign in to begin';
      paneSignin.style.display = 'block';
      showLock();
    }
    sb.auth.onAuthStateChange(function (evt) { if (evt === 'SIGNED_OUT') location.reload(); });
  }
  boot();
```

- [ ] **Step 3: Verify the bypass comment is gone**

```bash
cd /opt/apps/noteos && grep -n "Password protection is disabled" index.html
```

Expected: no output.

- [ ] **Step 4: Verify the hold-to-enter code is still present but unused**

```bash
cd /opt/apps/noteos && grep -c "holdbtn" index.html
```

Expected: a non-zero count. The hold UI stays in the file so it can be re-enabled later without rewriting it; `paneHold` is simply never shown.

- [ ] **Step 5: Commit**

```bash
cd /opt/apps/noteos
git add index.html
git commit -m "feat: restore password authentication

Returning sessions go straight to Today; first run shows the sign-in pane.
RLS is keyed to auth.uid(), so without this nothing can read or write."
```

---

### Task 4: Extract pure logic into `app/lib.js`, with tests

This is the only genuinely testable logic in Phase 1. Extract it first so the module split has a tested foundation.

**Files:**
- Create: `app/lib.js`
- Create: `test/lib.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/lib.test.js`:

```javascript
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /opt/apps/noteos && node --test test/
```

Expected: FAIL — `Cannot find module '../app/lib.js'`.

- [ ] **Step 3: Write `app/lib.js`**

```javascript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /opt/apps/noteos && node --test test/
```

Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd /opt/apps/noteos
git add app/lib.js test/lib.test.js
git commit -m "feat: add pure helper module with unit tests

iso, streakFrom, isQuiet and dueSoon extracted as pure functions so the
date logic behind streaks, quiet ventures and due-soon can be tested
without a browser."
```

---

### Task 5: Fix the service worker before modules exist

Same-origin assets are cached cache-first. The moment code lives in `app/*.js`, deploys would serve stale modules. Fix this **before** the split, not after.

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Bump the cache name**

```javascript
const CACHE = 'threshold-v2';
```

- [ ] **Step 2: Add a network-first rule for `./app/`**

In the `fetch` listener, immediately after the `supabase.co` bypass and **before** the same-origin cache-first block, insert:

```javascript
  // App modules: network-first so a deploy is picked up immediately,
  // falling back to cache only when offline.
  if (url.origin === self.location.origin && url.pathname.includes('/app/')) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
```

- [ ] **Step 3: Verify both changes are present**

```bash
cd /opt/apps/noteos && grep -n "threshold-v2" sw.js && grep -n "includes('/app/')" sw.js
```

Expected: one match each.

- [ ] **Step 4: Commit**

```bash
cd /opt/apps/noteos
git add sw.js
git commit -m "fix: network-first caching for app modules

Cache-first would serve stale JS after every deploy once code moves out
of index.html. Cache name bumped to evict the v1 shell."
```

---

### Task 6: Split the inline script into modules

Move the 373-line inline script into `app/`, changing behaviour as little as possible. `index.html` markup and `<style>` are not touched.

**Files:**
- Create: `app/ui.js`, `app/data.js`, `app/main.js`
- Modify: `index.html` lines 543–916 (the `<script>` block)

- [ ] **Step 1: Create `app/ui.js`**

Holds DOM helpers, nav, section switching, scroller and clock — everything with no Supabase dependency. Move the corresponding code verbatim from `index.html`, converting to exports:

```javascript
import { iso } from './lib.js';

export const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
export const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
export const NAME = 'MITHUN';

export function $(id) { return document.getElementById(id); }

export function el(tag, attrs, html) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (html != null) n.innerHTML = html;
  return n;
}
```

Then move the following blocks **verbatim** out of the inline script, identified by
their banner comments so the instruction survives line drift. Behaviour must not
change — this is a move, not a rewrite:

| Source block in `index.html` | Goes to |
|---|---|
| `var SECTIONS = …` and `var FLEX_SECTIONS = …` | `app/ui.js` |
| `// ════════════ NAV ════════════` through the end of `closeSheet` wiring | `app/ui.js` |
| `// ════════════ SCROLL CONTROLS ════════════` block | `app/ui.js` |
| `// ════════════ CLOCK / GREETING / ORB ════════════` block | `app/ui.js` |
| `// ════════════ STATIC SECTIONS ════════════` — the four `render*` IIFEs | `app/ui.js` |

Drop the `var` declarations for `$`, `el`, `iso`, `todayStr` where they duplicate
the imports above. Export `goTo` and `updateScroller`. Replace the bare
`tick(); setInterval(tick, 30000);` with an exported wrapper:

```javascript
export function startClock() {
  tick();
  setInterval(tick, 30000);
}
```

- [ ] **Step 2: Create `app/data.js`**

Holds the Supabase client and every query. Move **verbatim**, by banner comment:

| Source block in `index.html` | Note |
|---|---|
| `// ── Supabase ──` — `SBURL`, `KEY`, `configured`, `sb`, `user`, `inited` | unchanged |
| `// ════════════ DATA LAYER ════════════` — `pColor`, `tasksCache`, `initTasks`, `renderTasks`, `toggleTask`, `addTask` and the two `task-add` / `task-input` listeners | `TASK_SEED` already deleted in Task 2 |
| `habitsCache`, `logsByHabit`, `initHabits`, `streakOf`, `renderHabits`, `toggleHabit` | `streakOf` is rewritten below |
| `// FOCUS` IIFE, including `window.__refreshFocus` | unchanged |
| `// HEALTH` — `health`, `initHealth`, `renderHealth`, `saveHealth` and its three listeners | unchanged |
| `initData` | unchanged |
| `// ════════════ LOCK / AUTH ════════════` through `boot();` | `boot` gains an `export` |

Three required changes while moving:

**1.** Add imports at the top:

```javascript
import { $, el } from './ui.js';
import { iso, todayStr, streakFrom } from './lib.js';
```

**2.** Replace the local `streakOf` with a call into the tested helper:

```javascript
  function streakOf(id) {
    return streakFrom(logsByHabit[id] || new Set());
  }
```

**3.** Export `boot`, and **delete the bare `boot();` invocation** that follows the
function — `app/main.js` calls it instead. Leaving both in place would boot twice.

```javascript
export async function boot() { /* … as restored in Task 3 … */ }
```

- [ ] **Step 3: Create `app/main.js`**

```javascript
import { startClock, updateScroller } from './ui.js';
import { boot } from './data.js';

startClock();
boot();
updateScroller();

if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
```

- [ ] **Step 4: Replace the inline script in `index.html`**

Delete everything between `<script>` on line 543 and `</script>` on line 916, and replace those lines with:

```html
<script type="module" src="app/main.js"></script>
```

Leave lines 21–22 (the supabase-js CDN tag and `supabase-config.js`) exactly as they are — `app/data.js` still reads `window.supabase` and `window.SUPABASE_URL`.

- [ ] **Step 5: Verify the split**

```bash
cd /opt/apps/noteos
grep -c "type=\"module\"" index.html
wc -l index.html app/*.js
node --test test/
```

Expected: one module tag; `index.html` around 545 lines; tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /opt/apps/noteos
git add index.html app/ui.js app/data.js app/main.js
git commit -m "refactor: split inline script into ES modules

index.html keeps all markup and CSS untouched; behaviour is unchanged.
Native modules, so no bundler and no build step — the Dockerfile still
just copies the repo."
```

---

### Task 7: Consolidate the nav to six sections

Ten sections become six: FETS+PROJECTS merge into WORK, HABITS+HEALTH into PERSONAL, FOCUS folds into TODAY, LEARN is removed.

**Files:**
- Modify: `app/ui.js` — `SECTIONS`
- Modify: `index.html` — section ids and headings

- [ ] **Step 1: Update the section list in `app/ui.js`**

```javascript
export const SECTIONS = ['TODAY','WORK','TASKS','PERSONAL','FINANCE','JOURNAL'];
```

- [ ] **Step 2: Rename sections in `index.html`**

- `id="sec-PROJECTS"` → `id="sec-WORK"`; heading `03 · Projects` → `02 · Work`, title `Projects` → `Work`
- `id="sec-HABITS"` → `id="sec-PERSONAL"`; heading → `04 · Personal`, title `Habits` → `Personal`
- Move the entire contents of `sec-HEALTH` inside `sec-PERSONAL`, below the habits list, then delete the now-empty `<section id="sec-HEALTH">`
- Move the entire contents of `sec-FOCUS` into `sec-TODAY`, appended after the `today-grid` div, then delete `<section id="sec-FOCUS">`
- Delete `<section id="sec-LEARN">` entirely
- Renumber remaining `sec-label` values to `01`–`06` in nav order

- [ ] **Step 3: Delete the dead renderers**

Remove `renderLearn` from `app/data.js` (or `app/ui.js`, wherever it landed in Task 6) — its container `#learn-list` no longer exists.

`renderProjects`, `renderFinance` and `renderJournal` stay for now with their hardcoded data; Phase 2 replaces them with real queries. They must keep working, so verify their containers `#projects-list`, `#finance-list` and `#journal-list` still exist after the renames. If `#projects-list` moved into `sec-WORK`, the id itself does not need to change.

- [ ] **Step 4: Verify no orphaned references**

```bash
cd /opt/apps/noteos
grep -nE "sec-(FOCUS|HABITS|HEALTH|LEARN|PROJECTS|FETS)" index.html app/*.js
grep -n "learn-list" index.html app/*.js
```

Expected: no output from either.

- [ ] **Step 5: Commit**

```bash
cd /opt/apps/noteos
git add index.html app/ui.js app/data.js
git commit -m "feat: consolidate navigation from ten sections to six

Today, Work, Tasks, Personal, Finance, Journal. Focus folds into Today,
Health into Personal, FETS and Projects into Work; Learn is removed."
```

---

### Task 8: Deploy and verify

**Files:** none — deployment only.

- [ ] **Step 1: Run the tests one final time**

```bash
cd /opt/apps/noteos && node --test test/
```

Expected: PASS.

- [ ] **Step 2: Rebuild and restart the container**

```bash
cd /opt/apps/noteos && docker compose up -d --build
```

- [ ] **Step 3: Confirm the site responds**

```bash
curl -sI https://noteos.in --max-time 20 | head -3
```

Expected: `HTTP/2 200`.

- [ ] **Step 4: Confirm the modules are served**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://noteos.in/app/main.js --max-time 20
```

Expected: `200`.

- [ ] **Step 5: Manual verification checklist**

In a browser at `https://noteos.in`, in a private window so the old service worker is not in play:

- Sign-in pane appears — the app no longer opens straight to the dashboard
- Signing in with the real password reaches Today
- Reloading goes straight to Today with no second sign-in
- The nav shows exactly six items
- Tasks is empty (no invented rows) and adding a task persists across reload
- Habits is empty, not five seeded habits
- Focus timer appears within Today and a completed session updates the Pulse figure
- Colours, fonts and layout are unchanged

- [ ] **Step 6: Confirm no fabricated rows reached the database**

Run via the Supabase MCP against `ijodwhogkafoeofacslq`:

```sql
select
  (select count(*) from public.tasks)  as tasks,
  (select count(*) from public.habits) as habits;
```

Expected: only rows added by hand during Step 5.

---

## Phase 2 (separate plan, not in scope here)

Wiring the twelve unused tables into the six sections: Today (`north_stars`, `priorities`, `agenda_items`), Work (`ventures`, `goals`, `venture_id` on tasks), Personal (`reminders`, `family_notes`), Journal (`journal_entries`, `daily_reflections`), Finance (`bills`). Also the offline quick-capture queue, and replacing the remaining hardcoded renderers. Written once Phase 1 is deployed and verified.

---

## Risks

| Risk | Mitigation |
|---|---|
| Lockout when the bypass is removed | Task 3 Step 1 blocks on confirming the password first |
| Stale modules after deploy | Task 5 runs before the split, not after |
| Module split changes behaviour silently | Task 6 moves code verbatim; Task 8 Step 5 checks each behaviour by hand |
| Nav rename leaves orphaned ids | Task 7 Step 4 greps for every old id |
| Fabricated rows already written | Task 8 Step 6 counts rows after first real login |
