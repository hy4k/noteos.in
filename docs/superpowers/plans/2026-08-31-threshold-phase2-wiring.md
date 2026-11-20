# Threshold Phase 2 Implementation Plan — Wiring the Sections

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the twelve unused Supabase tables into the six sections, so Threshold holds real data instead of empty mount points.

**Architecture:** Each section gets its own ES module under `app/`, importing shared DOM helpers from `app/ui.js` and pure logic from `app/lib.js`. `app/data.js` keeps the Supabase client and the already-wired tasks/habits/focus/health code; new section modules import `sb` and `user` from it. No build step, no framework, no new CSS — every new element reuses an existing class or copies an existing inline style string verbatim.

**Tech Stack:** Vanilla JS, native ES modules, `supabase-js` v2 from CDN, `node --test` (bare, not `node --test test/`).

**Working directory:** `/opt/apps/noteos` on `72.61.171.192`. Branch `implement-threshold`.

**Line endings:** `index.html` is CRLF. `app/*.js` are LF. Match per file.

---

## Preconditions

- Phase 1 is deployed and the owner can sign in. **Do not start until sign-in works** — every task here needs an authenticated session to verify against, since RLS blocks all reads without one.
- Migrations from Phase 1 are already applied: `tasks.venture_id` and the `bills` table exist.

---

## Shared groundwork

`app/data.js` currently keeps `sb` and `user` module-private. Section modules need both.

- [ ] **Step 1: Export the client and the current user accessor**

In `app/data.js`, add near the Supabase block:

```javascript
export function client() { return sb; }
export function currentUser() { return user; }
```

`user` is assigned inside `initData()`, so section modules must not read it at import time — only inside functions called after `initData()` runs.

- [ ] **Step 2: Add a section-init hook**

In `app/data.js`, inside `initData()`, after the existing `try { await initTasks(); ... }` block, add:

```javascript
  for (const fn of SECTION_INITS) {
    try { await fn(); } catch (e) { console.error('section init', e); }
  }
```

and above it:

```javascript
const SECTION_INITS = [];
export function onInit(fn) { SECTION_INITS.push(fn); }
```

Each section module calls `onInit(initX)` at import time. One failing section must not stop the others — hence the per-section try/catch.

- [ ] **Step 3: Commit**

```bash
cd /opt/apps/noteos && git add app/data.js
git -c user.name='Claude' -c user.email='noreply@anthropic.com' commit -m "feat: expose supabase client and add section init hook"
```

---

### Task 1: Today — north star, priorities, agenda

**Files:** Create `app/today.js`; modify `index.html` (`sec-TODAY`), `app/main.js`

Tables: `north_stars` (content, date), `priorities` (rank, content, done, date), `agenda_items` (title, time, date).

- [ ] **Step 1: Add markup**

In `index.html`, make the north-star paragraph editable by replacing the empty `<p id="today-ns-text">` with an input carrying the SAME visual styling:

```html
        <input id="today-ns-text" placeholder="What matters today…" spellcheck="false"
          style="font-size:21px;line-height:1.5;color:#C9C5BC;margin:18px 0 0;font-weight:400;background:transparent;border:none;outline:none;width:100%">
```

Immediately after the `today-grid` div's "Open Loops" column heading, leave `#today-loops` as is. Add a priorities block directly beneath the north-star div:

```html
      <div class="today-pri" style="margin-top:34px;max-width:620px">
        <div class="mono-cap" style="font-size:11px;letter-spacing:3px;">Top Three</div>
        <div id="today-priorities" style="margin-top:16px;display:flex;flex-direction:column;gap:11px"></div>
      </div>
```

- [ ] **Step 2: Write `app/today.js`**

```javascript
import { $, el } from './ui.js';
import { todayStr } from './lib.js';
import { client, currentUser, onInit } from './data.js';

var nsRow = null, priCache = [];

async function loadNorthStar() {
  const sb = client();
  const res = await sb.from('north_stars').select('*').eq('date', todayStr()).maybeSingle();
  nsRow = res.data || null;
  $('today-ns-text').value = nsRow ? nsRow.content : '';
}

async function saveNorthStar() {
  const sb = client(), u = currentUser();
  const content = $('today-ns-text').value.trim();
  if (!content) return;
  const payload = { user_id: u.id, content: content, date: todayStr() };
  if (nsRow) payload.id = nsRow.id;            // never send an undefined id
  const res = await sb.from('north_stars').upsert(payload).select().single();
  if (res.data) nsRow = res.data;
}

async function loadPriorities() {
  const sb = client();
  const res = await sb.from('priorities').select('*').eq('date', todayStr()).order('rank');
  priCache = res.data || [];
  renderPriorities();
}

function renderPriorities() {
  const host = $('today-priorities');
  host.innerHTML = '';
  for (let rank = 1; rank <= 3; rank++) {
    const row = priCache.find(function (p) { return p.rank === rank; }) || null;
    const d = el('div', { style: 'display:flex;gap:13px;align-items:center' });
    d.innerHTML =
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--accent);min-width:18px">' + rank + '</div>' +
      '<div style="width:13px;height:13px;flex:none;border:1.5px solid ' + (row && row.done ? 'var(--accent)' : 'rgba(244,241,234,.28)') + ';background:' + (row && row.done ? 'var(--accent)' : 'transparent') + ';cursor:pointer" class="pri-check"></div>' +
      '<input class="pri-input" placeholder="—" spellcheck="false" style="flex:1;background:transparent;border:none;outline:none;font-size:15px;color:' + (row && row.done ? '#5A5752' : '#C9C5BC') + ';text-decoration:' + (row && row.done ? 'line-through' : 'none') + '">';
    const input = d.querySelector('.pri-input');
    input.value = row ? row.content : '';
    input.addEventListener('blur', function () { savePriority(rank, input.value.trim(), row); });
    d.querySelector('.pri-check').addEventListener('click', function () {
      if (row) togglePriority(row);
    });
    host.appendChild(d);
  }
}

async function savePriority(rank, content, existing) {
  if (!content) return;
  if (existing && existing.content === content) return;
  const sb = client(), u = currentUser();
  const payload = { user_id: u.id, rank: rank, content: content, date: todayStr(), done: existing ? existing.done : false };
  if (existing) payload.id = existing.id;      // never send an undefined id
  const res = await sb.from('priorities').upsert(payload).select().single();
  if (res.data) { await loadPriorities(); }
}

async function togglePriority(row) {
  const sb = client();
  await sb.from('priorities').update({ done: !row.done }).eq('id', row.id);
  await loadPriorities();
}

async function loadAgenda() {
  const sb = client();
  const res = await sb.from('agenda_items').select('*').eq('date', todayStr()).order('time');
  const rows = res.data || [];
  const host = $('today-blocks');
  host.innerHTML = '';
  rows.forEach(function (a) {
    const d = el('div', { style: 'display:flex;gap:16px;align-items:baseline' });
    d.innerHTML =
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:13px;color:var(--accent);min-width:46px"></div>' +
      '<div style="font-size:14px;color:#C9C5BC"></div>';
    d.children[0].textContent = a.time || '';
    d.children[1].textContent = a.title;
    host.appendChild(d);
  });
}

async function initToday() {
  $('today-ns-text').addEventListener('blur', saveNorthStar);
  await loadNorthStar();
  await loadPriorities();
  await loadAgenda();
}

onInit(initToday);
```

- [ ] **Step 3: Import it** — add `import './today.js';` to `app/main.js`, before `boot()`.

- [ ] **Step 4: Verify**

```bash
cd /opt/apps/noteos && node --check app/today.js && node --test
```
Then in the browser: type a north star, blur, reload — it persists. Type priority 1, blur, reload — it persists. Tick it — it strikes through and survives reload.

- [ ] **Step 5: Commit**

```bash
git add app/today.js app/main.js index.html
git -c user.name='Claude' -c user.email='noreply@anthropic.com' commit -m "feat: wire Today to north_stars, priorities and agenda_items"
```

---

### Task 2: Work — ventures, next actions, quiet detection

**Files:** Create `app/work.js`; modify `index.html` (`sec-WORK`), `app/main.js`

Tables: `ventures` (name, stage, next_milestone, note, sort_order), `goals`, plus `tasks.venture_id`.

Reuse the `.venture-row` class, which is already styled and currently unused.

- [ ] **Step 1: Add an input** to `sec-WORK`, above `#projects-list`, copying the Tasks input styling verbatim:

```html
      <div style="margin-top:26px;max-width:760px;display:flex;gap:10px">
        <input id="venture-input" placeholder="Add a project or venture…" spellcheck="false"
          style="flex:1;background:#0E0E10;border:1px solid rgba(244,241,234,.14);color:#F4F1EA;font-family:'JetBrains Mono',monospace;padding:14px 16px;outline:none;border-radius:10px">
        <button id="venture-add" class="btn">Add</button>
      </div>
```

- [ ] **Step 2: Write `app/work.js`**

Loads ventures and their tasks in two queries, computes each venture's open-task count and most recent task `created_at`, and marks it quiet using the already-tested `isQuiet` helper. Renders with `.venture-row`, reusing the exact inline styles the deleted `renderProjects` used:

```javascript
import { $, el } from './ui.js';
import { isQuiet, iso } from './lib.js';
import { client, currentUser, onInit } from './data.js';

const STAGE_COLOR = { BUILDING: 'var(--accent)', ACTIVE: '#C9C5BC', STEADY: '#8E8A82', PAUSED: '#5A5752' };

async function loadWork() {
  const sb = client();
  const vres = await sb.from('ventures').select('*').order('sort_order');
  const ventures = vres.data || [];
  const tres = await sb.from('tasks').select('id, venture_id, done, label, created_at');
  const tasks = tres.data || [];

  const host = $('projects-list');
  host.innerHTML = '';
  ventures.forEach(function (v, i) {
    const mine = tasks.filter(function (t) { return t.venture_id === v.id; });
    const open = mine.filter(function (t) { return !t.done; });
    const last = mine.reduce(function (acc, t) {
      const d = iso(new Date(t.created_at));
      return !acc || d > acc ? d : acc;
    }, null);
    const quiet = isQuiet(last);
    const stage = (v.stage || 'ACTIVE').toUpperCase();
    const idx = 'P-' + (i < 9 ? '0' : '') + (i + 1);

    const r = el('div', { class: 'venture-row', style: 'display:grid;grid-template-columns:54px 1fr auto;gap:18px;align-items:center;padding:24px 4px 24px 0;border-bottom:1px solid var(--line)' });
    r.innerHTML =
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:#5A5752">' + idx + '</div>' +
      '<div><div class="v-name" style="font-family:\'Oswald\',sans-serif;font-weight:600;font-size:26px;letter-spacing:.5px;text-transform:uppercase;color:#F4F1EA"></div>' +
      '<div class="v-next" style="font-size:14px;color:#8E8A82;margin-top:4px"></div></div>' +
      '<div style="text-align:right"><div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:' + (quiet ? '#E8705B' : (STAGE_COLOR[stage] || '#C9C5BC')) + '">' + (quiet ? 'QUIET' : stage) + '</div>' +
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#5A5752;margin-top:6px">' + open.length + ' open</div></div>';
    r.querySelector('.v-name').textContent = v.name;
    r.querySelector('.v-next').textContent = v.next_milestone || (open[0] ? open[0].label : 'No next action');
    host.appendChild(r);
  });
}

async function addVenture(name) {
  const sb = client(), u = currentUser();
  await sb.from('ventures').insert({ user_id: u.id, name: name, stage: 'ACTIVE', sort_order: Date.now() % 100000 });
  await loadWork();
}

async function initWork() {
  $('venture-add').addEventListener('click', function () {
    const inp = $('venture-input'), v = inp.value.trim();
    if (v) { addVenture(v); inp.value = ''; }
  });
  $('venture-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('venture-add').click(); });
  await loadWork();
}

onInit(initWork);
```

- [ ] **Step 3:** Add `import './work.js';` to `app/main.js`.

- [ ] **Step 4: Verify** — `node --check app/work.js && node --test`. In the browser: add a venture, reload, it persists; it shows "QUIET" until a task is attached to it.

- [ ] **Step 5: Commit.**

---

### Task 3: Attach tasks to ventures

**Files:** Modify `index.html` (`sec-TASKS`), `app/data.js`

- [ ] **Step 1:** Add a venture selector beside the task input:

```html
        <select id="task-venture" style="background:#0E0E10;border:1px solid rgba(244,241,234,.14);color:#C9C5BC;font-family:'JetBrains Mono',monospace;padding:14px 12px;outline:none;border-radius:10px">
          <option value="">Personal</option>
        </select>
```

- [ ] **Step 2:** In `app/data.js`, populate the selector inside `initData` (query `ventures`, append an `<option>` per row), and change `addTask` to include `venture_id: $('task-venture').value || null`.

- [ ] **Step 3:** In `renderTasks`, when a task has a `venture_id`, append the venture name as a muted suffix using the existing `#5A5752` colour.

- [ ] **Step 4: Verify** — add a task against a venture; Work shows it as that venture's next action and the venture stops being quiet.

- [ ] **Step 5: Commit.**

---

### Task 4: Personal — reminders and family notes

**Files:** Create `app/personal.js`; modify `index.html` (`sec-PERSONAL`), `app/main.js`

Tables: `reminders` (title, event_date, recurring, recurring_type, category), `family_notes` (type, content, event_date).

Add two blocks below the existing Health grid, each with an input styled exactly like the Tasks input and a list container (`#reminders-list`, `#family-list`). `app/personal.js` follows the same load/render/add shape as `app/work.js`. Reminders due within 7 days feed Today via the shared `dueSoon` helper.

- [ ] Steps mirror Task 2: markup, module, import, verify, commit.

---

### Task 5: Journal — entries and daily reflection

**Files:** Create `app/journal.js`; modify `index.html` (`sec-JOURNAL`), `app/main.js`

Tables: `journal_entries` (content, mood, entry_date), `daily_reflections` (one_line, tomorrow_star).

Add a textarea plus an "Add entry" button above `#journal-list`, and a reflection block with two single-line inputs ("One line on today", "Tomorrow's star"). Render entries with the exact grid the deleted `renderJournal` used: `grid-template-columns:104px 1fr;gap:22px;padding:26px 0;border-bottom:1px solid var(--line)`, date in `var(--accent)` mono, title in Oswald, body in `#9A968E`.

**`tomorrow_star` writes forward:** on save, upsert a `north_stars` row for tomorrow's date with that content. This closes the loop the design called for.

- [ ] Steps mirror Task 2.

---

### Task 6: Finance — bills and renewals

**Files:** Create `app/finance.js`; modify `index.html` (`sec-FINANCE`), `app/main.js`

Table: `bills` (name, amount, due_date, recurring, recurring_type, category, paid).

Add name / amount / date inputs and an Add button above `#finance-list`. Render with the grid the deleted `renderFinance` used: `grid-template-columns:74px 1fr auto`, date mono `#5A5752`, label `#C9C5BC`, amount mono — `var(--accent)` when unpaid and due within 2 days, `#8E8A82` otherwise. Amounts are INR; format with `toLocaleString('en-IN')`.

Feed Today's "due soon" from `dueSoon(bills.concat(reminders))`.

- [ ] Steps mirror Task 2.

---

### Task 7: Offline quick-capture queue

**Files:** Create `app/queue.js`; modify `app/data.js`, `app/main.js`; extend `test/lib.test.js`

The only write protected offline is task capture — the thing that hurts to lose.

- [ ] **Step 1: Write failing tests** for two pure functions in `app/lib.js`: `enqueue(list, item)` and `drainable(list)`. Keep the storage side effects out of the tested functions.

- [ ] **Step 2:** Implement, watch pass.

- [ ] **Step 3:** `app/queue.js` wraps `localStorage` under key `threshold.queue.tasks`, with try/catch on every read and write (private mode throws). On `addTask` failure, push to the queue and render the row optimistically with the muted `#5A5752` colour. On `window.addEventListener('online')` and at `initData`, flush.

- [ ] **Step 4:** Show an offline indicator using the existing `.mb-dot` element — colour it `#E8705B` when `!navigator.onLine`.

- [ ] **Step 5: Verify** — with devtools offline, add a task; it appears muted. Go online; it persists and un-mutes after reload.

- [ ] **Step 6: Commit.**

---

### Task 8: Deploy and verify

- [ ] **Step 1:** `cd /opt/apps/noteos && node --test` — all tests pass.
- [ ] **Step 2:** `docker compose up -d --build`
- [ ] **Step 3:** `curl -sI https://noteos.in` → 200; each new module returns 200.
- [ ] **Step 4: Manual checklist** — for each of the six sections: add a row, reload, confirm persistence; confirm Today reflects north star, priorities, agenda and due-soon; confirm the theme is unchanged.
- [ ] **Step 5:** Confirm row counts are non-zero only where you entered data:

```sql
select 'ventures' t, count(*) from ventures union all
select 'priorities', count(*) from priorities union all
select 'bills', count(*) from bills;
```

- [ ] **Step 6:** Push.

---

## Risks

| Risk | Mitigation |
|---|---|
| A section module throws and kills the others | Per-section try/catch in the init hook |
| `user` read before `initData` assigns it | Section modules only read `currentUser()` inside functions |
| New markup drifts from the theme | Every new element copies an existing inline style string; no new CSS rules |
| Upsert without a unique constraint duplicates rows | `north_stars` and `priorities` upserts pass an explicit `id` when a row already exists |
| `localStorage` throws in private mode | Every access wrapped in try/catch, app renders correctly with no stored value |

## Not in this plan

Full personal finance (income, expense analysis, suggestions) — its own project, with data capture as the deciding question. Play Store TWA — after the app is worth opening.
