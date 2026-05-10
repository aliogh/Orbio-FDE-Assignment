-- 0001_initial.sql — core tables for Grupo Sazón screening agent.

create extension if not exists "pgcrypto";

create table public.conversations (
  id                       uuid        primary key default gen_random_uuid(),
  source                   text        not null check (source in ('chat','voice')),
  language                 text,
  candidate_name           text,
  qualified                boolean,
  disqualification_reason  text,
  extracted_fields         jsonb       not null default '{}'::jsonb,
  summary                  text,
  started_at               timestamptz not null default now(),
  ended_at                 timestamptz,
  status                   text        not null default 'in_progress'
                                       check (status in ('in_progress','completed','abandoned'))
);

create table public.turns (
  id                uuid        primary key default gen_random_uuid(),
  conversation_id  uuid        not null references public.conversations(id) on delete cascade,
  role             text        not null check (role in ('user','assistant','tool')),
  content          text,
  tool_calls       jsonb,
  created_at       timestamptz not null default now()
);

create index turns_conv_time_idx
  on public.turns (conversation_id, created_at);

create index conversations_status_qual_idx
  on public.conversations (status, qualified, started_at desc);

create index conversations_language_idx
  on public.conversations (language);

create index conversations_started_at_idx
  on public.conversations (started_at desc);
