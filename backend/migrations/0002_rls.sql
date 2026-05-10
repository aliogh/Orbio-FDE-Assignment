-- 0002_rls.sql — row-level security for the recruiter dashboard.
--
-- Strategy: backend uses the service-role key (bypasses RLS). The frontend
-- recruiter dashboard uses the anon key and must read with the recruiter
-- session header set to 'true'. We expose this header via Supabase's
-- request.header() helper.
--
-- The header is set client-side from the signed cookie. This is good enough
-- for a take-home; production would migrate to Supabase Auth.

alter table public.conversations enable row level security;
alter table public.turns         enable row level security;

create policy "recruiter can read conversations"
  on public.conversations
  for select
  to anon
  using (current_setting('request.headers', true)::jsonb ->> 'x-recruiter-session' = 'true');

create policy "recruiter can read turns"
  on public.turns
  for select
  to anon
  using (current_setting('request.headers', true)::jsonb ->> 'x-recruiter-session' = 'true');

-- (Backend service-role connections bypass RLS by design; no policy needed.)
