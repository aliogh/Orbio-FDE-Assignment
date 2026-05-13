-- 0003_last_activity_sweep.sql — drop-off janitor.
--
-- Adds a `last_activity_at` column to conversations, an insert trigger on
-- `turns` that bumps it, an index for the sweep, and a SQL function that
-- flips stale `in_progress` rows to `abandoned`. A scheduled cron (Supabase
-- pg_cron, GCP Cloud Scheduler, or GitHub Actions) calls the FastAPI
-- `/api/admin/sweep-stale` endpoint, which calls `sweep_stale_conversations`.
--
-- The trigger only bumps rows that are still `in_progress` so a late-arriving
-- turn (e.g. a delayed voice tool call) can't resurrect a closed conversation.

alter table public.conversations
  add column if not exists last_activity_at timestamptz not null default now();

-- Backfill existing rows with the most accurate "last activity" we can derive
-- from history: the latest turn timestamp, falling back to ended_at, then
-- started_at. Without this, every pre-existing in_progress row would look
-- "fresh" to the very first sweep run.
update public.conversations c
set last_activity_at = coalesce(
  (select max(t.created_at) from public.turns t where t.conversation_id = c.id),
  c.ended_at,
  c.started_at
);

-- Partial index — the sweep only ever scans in_progress rows, and most rows
-- in the table will be terminal. Keeps the index small.
create index if not exists conversations_inprogress_last_activity_idx
  on public.conversations (last_activity_at)
  where status = 'in_progress';

-- Trigger: each new turn bumps the parent conversation's last_activity_at.
-- Guarded with `status = 'in_progress'` so an out-of-order tool call landing
-- after the conversation already moved to `completed`/`abandoned` doesn't
-- silently re-open it.
create or replace function public.bump_conversation_activity()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
    set last_activity_at = now()
    where id = new.conversation_id
      and status = 'in_progress';
  return new;
end;
$$;

drop trigger if exists turns_bump_activity on public.turns;
create trigger turns_bump_activity
  after insert on public.turns
  for each row execute function public.bump_conversation_activity();

-- The sweep itself. Returns the count of rows it just abandoned so the caller
-- can log it. `make_interval` keeps the threshold parametric — defaults to
-- 5 minutes; the FastAPI endpoint accepts an override for ops/testing.
create or replace function public.sweep_stale_conversations(p_minutes int default 5)
returns int
language plpgsql
as $$
declare
  swept int;
begin
  with updated as (
    update public.conversations
      set status = 'abandoned',
          ended_at = now()
      where status = 'in_progress'
        and last_activity_at < now() - make_interval(mins => p_minutes)
      returning id
  )
  select count(*) into swept from updated;
  return swept;
end;
$$;
