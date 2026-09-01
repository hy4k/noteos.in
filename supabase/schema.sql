-- ============================================================
--  NoteOS / Threshold — Supabase schema
--  Project: https://ijodwhogkafoeofacslq.supabase.co
--
--  Run this once in: Supabase Dashboard → SQL Editor → New query
--  It is idempotent (safe to re-run).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- TASKS ----------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text not null,
  priority   text not null default 'P2' check (priority in ('P1','P2','P3')),
  done       boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tasks_user_idx on public.tasks(user_id, position);

-- ---------- HABITS ----------
create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists habits_user_idx on public.habits(user_id, position);

-- one row per day a habit is completed
create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  log_date   date not null default current_date,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);
create index if not exists habit_logs_user_idx on public.habit_logs(user_id, habit_id, log_date);

-- ---------- FOCUS SESSIONS ----------
create table if not exists public.focus_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  task_label   text,
  minutes      int not null,
  completed_at timestamptz not null default now()
);
create index if not exists focus_user_idx on public.focus_sessions(user_id, completed_at);

-- ---------- HEALTH (water + workout, one row per day) ----------
create table if not exists public.health_logs (
  user_id       uuid not null references auth.users(id) on delete cascade,
  log_date      date not null default current_date,
  water_glasses int not null default 0,
  workout_done  boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (user_id, log_date)
);

-- ============================================================
--  Row-Level Security — every user sees only their own rows
-- ============================================================
alter table public.tasks          enable row level security;
alter table public.habits         enable row level security;
alter table public.habit_logs     enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.health_logs    enable row level security;

-- tasks
drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- habits
drop policy if exists "own habits" on public.habits;
create policy "own habits" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- habit_logs
drop policy if exists "own habit_logs" on public.habit_logs;
create policy "own habit_logs" on public.habit_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- focus_sessions
drop policy if exists "own focus" on public.focus_sessions;
create policy "own focus" on public.focus_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- health_logs
drop policy if exists "own health" on public.health_logs;
create policy "own health" on public.health_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
