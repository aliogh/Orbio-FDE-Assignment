-- 0004_schedule_sweep_cron.sql — schedule the drop-off janitor via pg_cron.
--
-- Runs every 5 minutes, calling the sweep function from 0003. Skips the
-- network hop entirely (no FastAPI roundtrip), so this is the canonical
-- production scheduler. The /api/admin/sweep-stale endpoint stays around
-- for ad-hoc/manual sweeps and ops debugging.
--
-- pg_cron timestamps are UTC. `cron.schedule(name, schedule, command)` is
-- upsert-by-name, so re-running this migration is safe.

-- Unschedule any prior version with the same name first. `cron.unschedule`
-- by name throws if no such job exists, so guard it.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sweep-stale-conversations') then
    perform cron.unschedule('sweep-stale-conversations');
  end if;
end;
$$;

select cron.schedule(
  'sweep-stale-conversations',
  '*/5 * * * *',
  $job$ select public.sweep_stale_conversations(5); $job$
);
