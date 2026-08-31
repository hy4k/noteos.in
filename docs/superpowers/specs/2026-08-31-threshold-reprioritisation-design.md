# Threshold — Reprioritisation & Wiring

**Date:** 2026-08-31
**Repo:** github.com/hy4k/noteos.in — branch `implement-threshold`
**Deploy:** `/opt/apps/noteos` on VPS 72.61.171.192, container `noteos-app-1`, routed by Traefik on `Host(noteos.in)`
**Supabase:** project `noteosnewsos` (`ijodwhogkafoeofacslq`), ap-northeast-2, ACTIVE_HEALTHY

## Purpose

Threshold is a single-user personal operating system for one person — their work
(FETS), their side projects, and their personal life. It is not multi-tenant and
will never be. Success means the owner opens it on their phone every morning,
sees what matters, and can capture and update anything in seconds.

## Current state

The app is half-built in a specific way: the database is ambitious and the front
end is not.

- **17 tables, all RLS-enabled, all empty.** One row in `auth.users`.
- **5 tables the shipped app uses:** `tasks`, `habits`, `habit_logs`,
  `focus_sessions`, `health_logs`.
- **12 tables nothing touches:** `north_stars`, `priorities`, `agenda_items`,
  `ventures`, `goals`, `todos`, `journal_entries`, `daily_reflections`,
  `reminders`, `family_notes`, `credentials`, `profiles`.
- **10 UI sections, 5 of them empty shells** — Projects, FETS, Finance, Learn and
  Journal render a heading and a subtitle and nothing else.
- **CSS for the unbuilt sections already exists** — `.venture-row`, `.today-hero`,
  `.today-ns`, `.today-grid`, `.statval` and others are defined but unused. The
  app was styled for its full scope and never wired.
- **Auth is bypassed** by an uncommitted edit to `index.html`, so with RLS keyed
  to `auth.uid()` nothing can read or write. The live site is a UI shell.
- **The live build is not any commit** — it is the working tree at
  `/opt/apps/noteos` as of 2026-08-29 04:06 UTC.

The work is therefore mostly wiring, not invention.

## Decisions

| Decision | Choice |
|---|---|
| Home screen | Today — north star, ranked priorities, agenda, due soon |
| Sections | Six: Today, Work, Tasks, Personal, Finance, Journal |
| Dropped | Learn (removed), Vault (deferred, table retained) |
| Merged | FETS + Projects → Work; Habits + Health → Personal; Focus → Today |
| Auth | Email + password, persistent session, no gate on open |
| Tasks ↔ Work | `tasks.venture_id`, nullable |
| Finance | Bills and renewals only; full finance is a separate project |
| Offline | Quick-capture queued to localStorage; everything else online-only |
| Front end | Native ES modules, no build step |
| Theme | Unchanged |

## Non-goals

- No change to the palette, fonts, or any of the 50 existing class definitions.
  Stays `--accent: #F5C518` on `#0B0B0C`, with Oswald / Hanken Grotesk /
  JetBrains Mono. New markup reuses existing classes wherever one fits. Where no
  existing class fits, a new rule may be added to the `<style>` block, but only
  built from the existing tokens — no new colours, no new fonts — and each such
  addition is called out at the time rather than slipped in.
- The nav shrinks from ten items to six. This is the requested consolidation, and
  it is the one visible change to the interface.
- No credentials vault. `credentials` and `profiles.vault_phrase_hash` stay in the
  schema, unused.
- No full personal-finance module. That gets its own spec.
- No full offline sync.
- No framework, bundler, or build step.
- No multi-user support.
- `todos` stays unused — it overlaps `tasks`, and wiring both would confuse them.

## Architecture

Static files, served by nginx inside the container, deployed by copying the repo.

```
index.html          markup + CSS untouched; inline script replaced by one module import
app/data.js         Supabase client, auth, queries, pure helpers — the only DB caller
app/today.js        home screen composition
app/work.js         ventures, goals, quiet detection
app/tasks.js        task list and capture
app/personal.js     habits, health, reminders, family notes
app/journal.js      entries and daily reflection
app/finance.js      bills and renewals
supabase/           schema.sql plus new migrations
```

`app/data.js` is the single boundary to Supabase. Section modules receive plain
data and render; they never construct queries. Each section module is
independently readable and changeable.

## Data model changes

Three additive migrations. Nothing is dropped or renamed.

1. `alter table tasks add column venture_id uuid references ventures(id) on delete set null`
   — plus an index on `(user_id, venture_id)`.
2. `create table bills (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, amount numeric(12,2), due_date date not null, recurring_type text, category text, paid boolean not null default false, created_at timestamptz not null default now())`
   — amounts are INR; no currency column, as this is single-user and single-currency.
3. RLS on `bills`: enable, plus policy `own bills` using `auth.uid() = user_id`
   with the same check — matching the pattern on all 17 existing tables. Index on
   `(user_id, due_date)`.

All other tables are wired as they stand.

## Sections

### Today

| Element | Source | Behaviour |
|---|---|---|
| North star | `north_stars` | One line for the day |
| Priorities | `priorities` | Ranked 1–3, tap to complete |
| Agenda | `agenda_items` | Time-ordered commitments for today |
| Due soon | `bills`, `reminders` | Next 7 days; alert styling inside 2 |
| Daily strip | `habits`, `health_logs` | Habit pips, water count |
| Focus | `focus_sessions` | Start a session, writes `task_label` + `minutes` |
| Quick capture | `tasks` | Always reachable; queued offline |

Day rollover is by local date. Yesterday's incomplete priorities are not
auto-carried; they remain visible in Tasks.

### Work

`ventures` as `.venture-row` — name, stage, next milestone. Each row shows open
task count and next action via `venture_id`. A venture with no task activity for
14 days is marked quiet. `goals` (period, progress, target_date) list underneath.

### Tasks

`tasks` as `.task-row` — P1/P2/P3, ordered by `position`, filterable by venture.
Adding a task optionally attaches a venture.

### Personal

`habits` + `habit_logs` (streaks), `health_logs` (water, workout),
`reminders` (recurring), `family_notes`.

### Journal

`journal_entries` (content, mood, entry_date) and `daily_reflections`
(one_line, tomorrow_star). `tomorrow_star` writes forward into the next day's
north star.

### Finance

`bills` — what is due, when, paid or not. Feeds Today's due-soon list. Thin by
design pending its own spec.

## Auth

Restore Supabase email + password sign-in and delete the bypass. Session persists
via `supabase-js`; opening the app goes straight to Today.

**Precondition:** one user exists in `auth.users`. Confirm the password, or reset
it from the Supabase dashboard, *before* the bypass is removed — otherwise the
first deploy locks the owner out.

## Mobile and offline

The PWA is already correct and needs no work: `manifest.json` is complete and
installable (standalone, portrait, theme `#0B0B0C`, 192/512/maskable icons all
present), and `sw.js` is network-first for navigations, cache-first for assets,
and explicitly skips `supabase.co`.

**Required service-worker change.** Same-origin assets are cached cache-first.
Once code lives in `app/*.js`, deploys would serve stale modules. Fix: bump
`CACHE` to `threshold-v2` and add a network-first rule for `./app/`.

**Offline capture.** Quick-capture buffers to localStorage when the write fails
and flushes to `tasks` on reconnect. All other reads and writes are online-only,
with a visible offline indicator.

## Play Store

Deferred until the app is worth opening. Route is a TWA built with Bubblewrap,
loading noteos.in — no second codebase, web deploys update the app.

Needs `/.well-known/assetlinks.json` in the repo carrying the signing-key
fingerprint, and a Play Console account ($25 one-time). Publish to the **internal
testing track**, not production: personal developer accounts opened after late
2023 must run a 12-tester, 14-day closed test before production unlocks, and
internal testing carries no such requirement. Verify against current Play policy
at the time, as Google changes these terms.

## Testing

- **Pure logic in `app/data.js`** — day rollover, streak counting, quiet-venture
  detection, due-soon windows — tested with `node --test`. Dev-only; never
  shipped to the browser.
- **DOM wiring** — verified section by section against live Supabase with a
  written checklist. These are thin render functions where a test would largely
  restate the implementation.

## Deploy

```bash
cd /opt/apps/noteos && docker compose up -d --build
```

Housekeeping before implementation:

- The working tree carries the uncommitted auth bypass. It is deleted by this
  work, so it resolves itself; commit the remainder so the live build corresponds
  to a real commit.
- Add `.gitattributes` with `* text=auto`. Repo files are CRLF, which makes every
  diff unreadable without `--ignore-cr-at-eol`.

## Risks

| Risk | Mitigation |
|---|---|
| Lockout when the bypass is removed | Confirm or reset the password first |
| Stale modules after deploy | Service-worker cache bump + network-first on `./app/` |
| Empty app feels dead on first open | Seed each section with the owner's real data as part of rollout |
| Finance scope creep back into this project | Bills only; full finance is a separate spec |
| `tasks` / `todos` confusion | `todos` left unused and undocumented in the UI |
