# NoteOS — Threshold

A personal command suite for daily life, dev work, and running **FETS**
(testing & educational services). Single-page app: a vertical rail of ten
sections — Today, Focus, Projects, FETS, Tasks, Habits, Health, Learn,
Finance, Journal — with a Supabase backend syncing the interactive bits
across devices.

```
.
├── index.html            # the whole front-end (vanilla JS, no build step)
├── supabase-config.js    # SUPABASE_URL + anon key (anon key is public-safe)
├── supabase/schema.sql   # tables + Row-Level Security — run once
├── deploy/               # Hostinger VPS deploy script + nginx config
├── chats/                # original Claude Design transcript (handoff history)
└── project/              # original design prototype (handoff history)
```

## What syncs to Supabase
| Section | Persisted |
|---------|-----------|
| **Focus** | completed deep-work sessions (count + minutes per day) |
| **Tasks** | your tasks, priority, done state, add new |
| **Habits** | per-day completion; streaks computed from history |
| **Health** | water glasses + workout toggle, per day |

Projects / FETS / Learn / Finance / Journal are presentation content for now,
ready to be wired to their own tables later.

## Setup

### 1. Database
Open **Supabase Dashboard → SQL Editor**, paste `supabase/schema.sql`, run it.
This creates the tables and Row-Level Security so each signed-in user only
sees their own data.

In **Authentication → Providers → Email**, enable email sign-in. For a smooth
single-user experience you may turn **off** "Confirm email" (Authentication →
Settings) so you can sign in immediately after creating your account.

### 2. Front-end key
In `supabase-config.js`, replace `PASTE_YOUR_SUPABASE_ANON_KEY_HERE` with your
project's **anon public** key (Project Settings → API). The anon key is safe to
ship in a static site — RLS is what protects the data. Never put the
`service_role` key here.

Open `index.html` locally (or serve it) — you'll get a sign-in screen, create
an account, and the app seeds default tasks/habits on first login.

### 3. Deploy to the Hostinger VPS
```bash
cp deploy/.env.example deploy/.env     # fill in VPS host/user/key/path
./deploy/deploy.sh --setup-nginx       # one time: install nginx server block
./deploy/deploy.sh                     # deploy / redeploy the static files
```
For HTTPS, the setup step prints the `certbot` command to run on the server.

## Theme
One accent colour drives everything — change `--accent` in the `:root` block of
`index.html` to re-skin the whole suite.
