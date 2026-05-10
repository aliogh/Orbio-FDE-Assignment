# Design Spec — Grupo Sazón Candidate Screening Agent

**Status:** Approved for implementation
**Author:** Alí Ghanbari Dolatshahi
**Date:** 2026-05-10
**Assignment:** Orbio FDE take-home

---

## 1. Goal

Build an AI-powered screening agent that interviews delivery driver candidates for "Grupo Sazón" (a fictional restaurant chain operating across Spain and Mexico), extracts seven structured fields per candidate, and surfaces the results to recruiters.

The system has three surfaces — a chat client, a browser voice client, and a recruiter dashboard — backed by a single Python agent core. Multilingual (ES/EN) including mid-conversation code-switching.

This spec is the source of truth for the implementation plan that follows.

## 2. Scope

**In scope:**
- Phase 1 process-design document (delivered as `docs/process-design.md`)
- Chat agent (text input, structured extraction, validation loop, summary)
- Voice agent (browser, OpenAI Realtime API over WebRTC)
- Recruiter dashboard (read-only candidate list + per-candidate detail view)
- Multi-language ES/EN with native code-switching at the model level
- Soft-disqualification policy (collect what we can, never abruptly end)
- Guardrails (off-topic, inappropriate input, PII leak prevention)
- Tests: unit (pytest) + integration + 5–8 conversation evals
- ATS integration spec (REST API design doc, not implemented)
- Deployment via GitHub Actions to GCP Cloud Run + Vercel

**Out of scope (explicitly excluded for this iteration):**
- RAG over an FAQ corpus (no corpus available; not part of the rubric weight)
- Sentiment analysis as a separate feature (basic frustration detection lives inside guardrails)
- Re-engagement / async follow-up logic (not demoable in a 15-min live demo)
- Production-grade auth (recruiter dashboard uses a shared-password cookie gate)
- Multi-tenant support (single tenant — Grupo Sazón — in this implementation)

## 3. Architecture

### 3.1 System overview

One agent core, three surfaces, one database.

```
┌──────────────────────────────────────────────────────────────────────┐
│                  Frontend (Next.js 15 / Vercel)                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────────────┐  │
│  │  /chat   │    │  /voice  │    │ /recruiter, /recruiter/[id]  │  │
│  │  (text)  │    │ (WebRTC) │    │  (dashboard, read-only)      │  │
│  └────┬─────┘    └────┬─────┘    └──────────────┬───────────────┘  │
└───────┼───────────────┼─────────────────────────┼──────────────────┘
        │               │                         │
        │ HTTPS         │ WebRTC (ephemeral key)  │ Supabase JS (anon, RLS-gated)
        ▼               ▼                         ▼
┌────────────────────────────────────┐    ┌──────────────────────┐
│   Backend (FastAPI / Cloud Run)    │    │  Supabase Postgres   │
│  agent_core/  transports/  persistence/ │◀──▶│  conversations / turns │
└──────────────┬─────────────────────┘    └──────────────────────┘
               │
               ▼
        OpenAI API
        ├ gpt-5-mini          (chat turns)
        └ gpt-realtime-mini   (voice — browser ↔ OpenAI directly)
```

### 3.2 Why this shape

- **Tool-calling agent** instead of an FSM or LangGraph: the screening flow is mostly linear field-collection with two short-circuit branches (no driver's license, city out of area). Tool calls model that without ceremony, and the four tools become the **single shared contract** between the chat and voice transports.
- **Voice goes browser-direct to OpenAI** via WebRTC + ephemeral key minted by the backend. Audio never touches our server — lower latency, lower cost, simpler infra. This is the canonical OpenAI Realtime pattern.
- **One LLM vendor** (OpenAI) for both surfaces because the same tool definitions register identically, the same schema validates both, and the architecture story stays simple. Trade-off explicitly considered: Gemini Live is cheaper and GCP-native, but ES↔EN code-switching reputation favors OpenAI for this Spain/Mexico use case.
- **Frontend on Vercel, backend on Cloud Run, DB on Supabase** — three independently scaled services, each best-in-class at its job. Defended in the README and presentation as "split LLM vendor from compute provider, split managed Postgres from compute, because each has its own scaling shape."

### 3.3 Component boundaries

Each component below has one purpose, a typed interface, and can be tested independently.

| Component | Purpose | Depends on |
|---|---|---|
| `agent_core/tools.py` | Defines the 4 tools (record/flag/disqualify/complete) and their handlers | `schemas.py`, `service_areas.py` |
| `agent_core/prompts.py` | System prompt + tone/language directives | none |
| `agent_core/schemas.py` | Pydantic models for the 7 screening fields + tool args | none |
| `agent_core/runner.py` | Chat turn loop: history → LLM → tool dispatch → persist → reply | `tools`, `prompts`, `persistence` |
| `agent_core/service_areas.py` | Fuzzy-matches candidate-supplied city against `service_areas.json` | none |
| `agent_core/guardrails.py` | Pre/post checks for off-topic, inappropriate input, PII leakage | none |
| `transports/chat_api.py` | `POST /api/chat` — REST turn endpoint | `runner` |
| `transports/realtime_session.py` | `POST /api/voice/session` — mints OpenAI ephemeral key, registers tools | `tools` |
| `persistence/conversations.py` | CRUD for `conversations` and `turns` tables | `db.py` |
| `persistence/recruiter_query.py` | Read-only helpers for the recruiter dashboard (lists, filters, stats) | `db.py` |

## 4. The four tools (the contract)

```python
# Pydantic-validated tool args; same definitions used by both transports

class RecordFieldArgs(BaseModel):
    field: Literal[
        "full_name", "has_driver_license", "city", "availability",
        "preferred_schedule", "prior_experience", "start_date"
    ]
    value: str            # canonical string; structured fields parsed server-side
    confidence: float     # 0.0–1.0, model's self-reported confidence

class FlagInvalidArgs(BaseModel):
    field: str
    user_value: str
    reason: str           # short explanation, e.g. "city not in service areas"

class DisqualifyArgs(BaseModel):
    reason: Literal["no_license", "out_of_service_area", "other"]
    detail: str

class CompleteScreeningArgs(BaseModel):
    summary: str          # 2–3 sentence summary for the recruiter
```

**Server-side validation rules (run inside each tool handler):**
- `record_field("has_driver_license", value)` → normalize to bool; if false, also call `disqualify("no_license")` defensively
- `record_field("city", value)` → fuzzy-match against `service_areas.json`; if no match within threshold (RapidFuzz score ≥ 85), return `{ok: false, validation_error: "..."}` so the agent re-asks
- `record_field("start_date", value)` → parse to ISO date; reject dates in the past
- All other fields → store as-is, agent handles re-asking on its own

The runner persists every tool call (with args + result) into the `turns` table for full auditability.

## 5. Conversation flow (Phase 1 design)

### 5.1 Stages

The flow is *emergent from the tool contracts*, not hardcoded as a state machine. The system prompt encourages this order:

1. **Greeting + language anchor** — Friendly intro defaulting to ES (Spain/Mexico market). Single sentence, invites EN if preferred.
2. **Hard-gate fields first** — `has_driver_license` → `city`. These can short-circuit to disqualification, saving everyone's time.
3. **Soft fields** — `full_name`, `availability`, `preferred_schedule`, `prior_experience`, `start_date`.
4. **Wrap** — Echo back a confirmation summary, set expectations for next steps, call `complete_screening`.

### 5.2 Branching

| Trigger | Path |
|---|---|
| `has_driver_license = false` | Tool: `disqualify("no_license")` → polite outcome message → save partial record → end |
| City fuzzy-match fails | One retry with explicit examples → if still no match, `disqualify("out_of_service_area")` |
| Ambiguous answer (low confidence) | Tool: `flag_invalid` → re-ask once with concrete options → accept best-effort if still unclear |
| Drop-off — chat: no user message for >5 min; voice: WebRTC session closed before `complete_screening` fired | Conversation marked `status = "abandoned"`; partial record preserved |
| Inappropriate input | Guardrail rejects, agent redirects politely; 3rd offense → end conversation |

### 5.3 Edge cases

- **Language switch mid-flow:** The model handles this natively because the system prompt instructs it to mirror the candidate's language at each turn. No detection layer.
- **Hostile or frustrated candidate:** `guardrails.py` runs a lightweight keyword/tone heuristic; if triggered, the runner injects a "soften tone, acknowledge frustration" directive into the next system message.
- **PII leakage:** Output guardrail strips obvious PII patterns (other phone numbers, IDs, emails not from the candidate) from agent replies before sending.
- **OpenAI API outage:** Retry with exponential backoff (3 attempts, 1s/2s/4s); on final failure, surface a friendly error to the user, mark turn `status = "error"`, and resume from the last persisted state on retry.

### 5.4 Tone guidelines (encoded in system prompt)

- Short messages — at most 3 sentences, **one question at a time**
- Friendly, never corporate; emoji used sparingly (👋 on greeting, ✅ on field confirmation)
- Use the candidate's first name once they share it
- Confirm critical fields back to them before moving on (*"So, **Madrid**, weekends. ¿Correcto?"*)
- Never say "I am an AI" unless directly asked; never claim to be human if asked
- Never make promises about hiring outcomes

## 6. Data model

### 6.1 Tables (Supabase Postgres)

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('chat','voice')),
  language text,                                -- 'es' | 'en' (latest detected)
  candidate_name text,
  qualified boolean,                            -- null until complete_screening fires
  disqualification_reason text,                 -- null if qualified or in-progress
  extracted_fields jsonb default '{}'::jsonb,   -- canonical store of the 7 fields
  summary text,
  started_at timestamptz default now(),
  ended_at timestamptz,
  status text default 'in_progress'             -- 'in_progress'|'completed'|'abandoned'
);

create table turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text,
  tool_calls jsonb,                             -- array of {name, args, result}
  created_at timestamptz default now()
);

create index turns_conv_time_idx on turns(conversation_id, created_at);
create index conversations_status_qual_idx on conversations(status, qualified, started_at desc);
```

### 6.2 RLS policies

- **Service role (backend):** full read/write on both tables
- **Anon role (recruiter frontend):** SELECT-only on both tables, gated by a `recruiter_session = 'true'` cookie (set by the password-gate middleware)
- **Anon role (candidate clients):** no direct DB access; everything goes through the backend

### 6.3 Persistence policy

Incremental writes, every turn. The runner writes:
1. The user's input → `turns` (role=user) on receipt
2. The model's tool calls → `turns` (role=tool) as they execute
3. The model's final reply → `turns` (role=assistant) on send
4. The conversation row's `extracted_fields`, `qualified`, `status`, `summary` are updated as tools fire

Drop-off survives because every turn is durable. No in-memory state lost on disconnect.

## 7. Frontend

### 7.1 Routes

```
frontend/app/
├── page.tsx                       Landing — "Try chat" / "Try voice" / "Recruiter login"
├── chat/page.tsx                  Candidate chat (Sazón-branded)
├── voice/page.tsx                 Candidate voice (WebRTC, OpenAI Realtime)
├── recruiter/login/page.tsx       Password gate
├── recruiter/page.tsx             Dashboard — stats strip + filterable candidates table
└── recruiter/[id]/page.tsx        Candidate detail — extracted fields + transcript
```

### 7.2 Recruiter dashboard

**Stats strip (top of `/recruiter`):**
- Total screened (all time)
- Qualified count + %
- Average call/chat duration
- Most common drop-off stage (which field they were on when conversation went `abandoned`)

These compose into the "Analytics" bonus — the queries are 5–10 lines of SQL each, run via `recruiter_query.py`.

**Filters (URL-stateful):**
- Outcome: qualified | disqualified | incomplete
- Language: ES | EN
- Date range
- Source: chat | voice
- City / service area

**Table columns:** name, city, qualified badge, language, source, started_at, duration. Sortable by any column. Clicking a row navigates to `/recruiter/[id]`.

### 7.3 Candidate detail page

- **Header:** name, qualified badge, disqualification reason (if any), source surface, language, started/ended timestamps
- **Left panel:** extracted fields as a key/value card — the 7 screening fields, formatted human-readable
- **Right panel:** full conversation transcript with role + timestamp; tool calls rendered inline (subtle gray) so reviewers can see *how* the agent extracted each field
- **Footer:** agent-generated summary + **"Export to ATS (mock)"** button → downloads JSON shaped per the ATS integration spec in `docs/ats-integration.md`

### 7.4 Auth (recruiter)

- Shared password via `RECRUITER_PASSWORD` env var (Vercel project secret); cookie signed with `RECRUITER_COOKIE_SECRET` (also a Vercel project secret)
- `/recruiter/login` POSTs to a Next.js API route → on match, sets an HTTP-only signed cookie `recruiter_session=true`
- Middleware protects all `/recruiter/*` routes except `/recruiter/login`
- README + presentation explicitly note: *"production would use Supabase Auth with RLS scoped to a `recruiters` table"*

## 8. Multi-language strategy

- No language detection library, no separate prompts per language. The single system prompt (in English, for the developers) ends with: *"Always reply in the same language the candidate is using. If they switch languages, switch with them. Default to Spanish for the first turn."*
- `gpt-5-mini` and `gpt-realtime-mini` handle ES↔EN code-switching natively; this was the deciding factor for choosing OpenAI over Gemini.
- The `language` column on `conversations` is updated each turn with the latest detected language (a tiny heuristic: count recent assistant tokens flagged ES vs EN, or just use the language of the latest user turn). Used for analytics filters, not for runtime behavior.

## 9. Error handling

| Failure | Handling |
|---|---|
| OpenAI API error | Retry 3x with backoff; final failure → friendly error to user, log to GCP, conversation resumes from last persisted state on retry |
| DB write failure | Non-blocking — agent reply continues; failed write retries async; if all retries exhaust, log + return user-facing reply anyway (turn lives in-memory until reconnect) |
| Voice session expiry | Frontend detects WebRTC close, transparently re-mints ephemeral key |
| Tool validation failure (e.g. bad city) | Tool returns `{ok: false, validation_error: "..."}`; agent sees this in the next turn and re-asks. This is the validation loop the brief requires. |
| Guardrail rejection | Agent reply replaced with a polite redirect; offending input logged but not surfaced |
| Network drop mid-conversation | Resume by `conversation_id`: frontend reconnects, backend rehydrates history from `turns` |

## 10. Testing strategy

| Tier | Tool | What it covers | Approx count |
|---|---|---|---|
| Unit | pytest | tool handlers, schema validators, fuzzy-match, guardrail rules, language-tracking heuristic | ~40–50 |
| Integration | pytest + real Supabase test schema + mocked OpenAI | runner end-to-end, persistence ordering, RLS policies | ~10 |
| Conversation evals | pytest + scripted user transcripts | full screening scenarios, asserts on extracted fields and qualification verdict | 5–8 |

**Eval scenarios (these double as the "Sample conversations" deliverable):**
1. Happy path — ES, qualifies
2. Happy path — EN, qualifies
3. Code-switch ES↔EN mid-conversation, qualifies
4. No driver's license → soft disqualify
5. City not in service area → fuzzy-match retry → disqualify
6. Ambiguous answers across multiple fields → validation loop → completion
7. Inappropriate input → guardrail redirect → continues
8. Drop-off mid-flow → conversation marked `abandoned`, partial record persists

**CI:** GitHub Actions runs unit + integration on every PR. Conversation evals run nightly (they hit real OpenAI; cost ~$0.20/run).

## 11. Deployment

### 11.1 Backend (Cloud Run via GitHub Actions)

- `Dockerfile` in `backend/` — Python 3.12 slim base, FastAPI + uvicorn, no extra layers
- `.github/workflows/deploy-backend.yml` — on push to `main`:
  1. Build + push image to Artifact Registry
  2. `gcloud run deploy` with env vars from Secret Manager bindings
  3. Smoke test: hit `/health`, fail the deploy if not 200
- Authentication: GitHub OIDC → GCP Workload Identity Federation (no long-lived service account keys)
- Secrets in GCP Secret Manager: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### 11.2 Frontend (Vercel)

- Repo connected to Vercel; preview deploys per PR
- Env vars: `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RECRUITER_PASSWORD`, `RECRUITER_COOKIE_SECRET`

### 11.3 Database (Supabase)

- Migrations in `backend/migrations/` (SQL files), applied via Supabase CLI in CI
- One project, one schema, one tenant for this implementation

### 11.4 Local dev

- `make dev` brings up backend (uvicorn reload) and frontend (`next dev`) concurrently
- `.env.example` documents all required vars
- Supabase local stack via `supabase start` for offline dev

## 12. Repo layout

```
orbio-screening-agent/
├── backend/
│   ├── agent_core/          # tools, prompts, schemas, runner, service_areas, guardrails
│   ├── transports/          # chat_api, realtime_session
│   ├── persistence/         # db, conversations, recruiter_query
│   ├── data/                # service_areas.json
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── evals/
│   ├── migrations/          # SQL migrations
│   ├── main.py
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── app/                 # Next.js routes (see §7.1)
│   ├── components/          # ChatUI, VoiceUI, CandidatesTable, TranscriptView, ...
│   ├── lib/                 # supabase client, api client, auth middleware
│   └── package.json
├── docs/
│   ├── process-design.md          # Phase 1 deliverable
│   ├── ats-integration.md         # ATS REST API spec (bonus)
│   ├── sample-conversations/      # exported eval transcripts
│   └── superpowers/specs/         # this file lives here
├── .github/workflows/
│   ├── deploy-backend.yml
│   └── ci.yml
└── README.md
```

## 13. Deliverables map

| Brief deliverable | Where it lives |
|---|---|
| Phase 1 design doc | `docs/process-design.md` (1–2 pages, distilled from §5) |
| Source code | the repo |
| Demo video (5–10 min) | linked in README, recorded against deployed Vercel URL |
| README | setup + architecture overview + design decisions + improvements |
| Sample conversations | `docs/sample-conversations/` — exported from eval runs |
| ATS integration design (bonus) | `docs/ats-integration.md` |
| Deployment design (bonus) | README "Deployment" section + `.github/workflows/` files |
| Tests (bonus) | `backend/tests/` |
| Multi-language (bonus) | core requirement of this implementation, see §8 |
| Guardrails (bonus) | `agent_core/guardrails.py`, see §5.3 |
| Analytics (bonus) | `/recruiter` stats strip, see §7.2 |

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| OpenAI Realtime model is only days-old GA — quality regressions possible | Fallback: switch to `gpt-realtime-2` (full tier) if mini quality is poor in ES; ~$0.32/call still trivial |
| Live demo network failure during the 15-min demo block | Pre-recorded backup video; deployed URL warmed pre-demo |
| ES↔EN code-switching weaker than expected | Conversation eval #3 catches this in CI; if poor, add a small "language hint" to the system prompt referencing the candidate's location |
| WebRTC ephemeral key flow fails on certain browsers | Test on Chrome + Safari + Firefox before submission; document supported browsers in README |
| Service area list missing candidate's actual city | Soft re-prompt with examples; if still missing, disqualify with a friendly message that explains the area is currently outside coverage |

## 15. Open questions (resolved during brainstorming)

All deferred items have been resolved. None remain at this time.

## 16. Next step

Hand this spec to the `writing-plans` skill to produce a step-by-step implementation plan with file-level tasks, ordering, and dependencies.
