# Grupo Sazón Screening Agent

AI-powered candidate screening agent built for the Orbio FDE take-home.

> **Live demo:** *<paste Vercel URL after first deploy>*
> **Demo video:** *<paste link to recorded walkthrough>*

The agent screens delivery driver candidates for the fictional restaurant chain
"Grupo Sazón" via two surfaces (chat + browser voice) and surfaces the results
to recruiters via a dashboard. Multilingual ES/EN with code-switching support.

## What's in here

- `backend/` — Python + FastAPI agent core. Tool-calling architecture against
  OpenAI `gpt-5-mini` (chat) and `gpt-realtime-mini` (voice). Deployed to GCP
  Cloud Run.
- `frontend/` — Next.js app with three surfaces: `/chat`, `/voice`,
  `/recruiter`. Deployed to Vercel.
- `docs/process-design.md` — Phase 1 deliverable (conversation flow, edge
  cases, tone).
- `docs/ats-integration.md` — REST API spec for connecting to an ATS (bonus,
  design only).
- `docs/sample-conversations/` — Real eval-run transcripts.
- `docs/superpowers/specs/2026-05-10-orbio-screening-agent-design.md` — Full
  technical spec.
- `docs/superpowers/plans/2026-05-10-orbio-screening-agent.md` — The
  implementation plan that built this.

## Architecture in one diagram

```
       Frontend (Next.js / Vercel)
       ┌───────┬───────┬─────────────┐
       │ /chat │/voice │ /recruiter  │
       └───┬───┴───┬───┴──────┬──────┘
           │       │          │
           │ HTTPS │ WebRTC   │ Supabase JS (RLS-gated)
           ▼       ▼          ▼
       ┌────────────────┐    ┌─────────────────┐
       │ FastAPI agent  │    │ Supabase Postgres│
       │ (Cloud Run)    │◀──▶│ conversations,   │
       └─────┬──────────┘    │ turns            │
             │                └─────────────────┘
             ▼
        OpenAI API
        ├ gpt-5-mini       (chat)
        └ gpt-realtime-mini (voice — browser-direct)
```

## Setup

### Prerequisites
- Python 3.12 + [uv](https://github.com/astral-sh/uv)
- Node 20 + pnpm
- A Supabase project (free tier)
- An OpenAI API key with Realtime access

### One-time

1. Clone the repo, copy env files:
   ```bash
   cp .env.example .env
   cp frontend/.env.example frontend/.env.local
   ```
   Fill in `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_ANON_KEY`. The frontend `.env.local` only needs the
   `NEXT_PUBLIC_*` and recruiter-auth ones.

2. Apply database migrations to your Supabase project:
   ```bash
   # In Supabase SQL editor (web UI), run in order:
   #   backend/migrations/0001_initial.sql
   #   backend/migrations/0002_rls.sql
   ```

3. Install deps:
   ```bash
   (cd backend && uv sync)
   (cd frontend && pnpm install)
   ```

### Deploying (one-time GCP setup)

The `deploy-backend.yml` workflow uses keyless auth — no service-account JSON key in the repo. Setup:

1. Enable Cloud Run, Artifact Registry, and Secret Manager on your GCP project.
2. Create an Artifact Registry Docker repository named `orbio` in your chosen region.
3. Create a Secret Manager secret for each: `openai-api-key`, `supabase-url`, `supabase-service-role-key`.
4. Create a deployer service account with roles: `roles/run.admin`, `roles/iam.serviceAccountUser`, `roles/artifactregistry.writer`, `roles/secretmanager.secretAccessor`.
5. Configure GitHub OIDC → Workload Identity Federation per the [`google-github-actions/auth` setup guide](https://github.com/google-github-actions/auth#setting-up-workload-identity-federation).
6. Add five GitHub repo secrets: `GCP_PROJECT`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`, `ALLOWED_ORIGINS`.

After that, every push to `main` that touches `backend/` deploys automatically.

For Vercel: import the repo in the Vercel dashboard, set the root directory to `frontend/`, and add the env vars from `frontend/.env.example`.

### Running locally

```bash
make dev
# Backend on :8000, frontend on :3000.
```

Then visit:
- `http://localhost:3000/chat` — chat surface
- `http://localhost:3000/voice` — voice surface (Chrome/Safari, allow mic)
- `http://localhost:3000/recruiter/login` — recruiter dashboard (use `RECRUITER_PASSWORD`)

### Tests

```bash
cd backend
uv run pytest tests/unit -v          # ~50 unit tests, no external calls
uv run pytest -m integration -v      # needs Supabase
uv run pytest -m eval -v             # 8 conversation evals, hits real OpenAI (~$0.20)
```

## Key design decisions

| Decision | Rationale |
|---|---|
| Tool-calling agent (no FSM) | The screening flow is mostly linear with two short-circuit branches. Tool calls model that without ceremony, and the same tool definitions register identically with chat and voice transports. |
| Single LLM vendor (OpenAI) | One SDK, one API key, one set of tool definitions across both surfaces. Trade-off considered: Gemini Live is cheaper and GCP-native, but OpenAI's reputation for ES↔EN code-switching matters more for the Spain/Mexico market. |
| Voice goes browser-direct to OpenAI | Standard secure pattern: backend mints an ephemeral key, browser opens WebRTC. Audio never touches our server — lower latency, lower cost, simpler infra. |
| Soft disqualification | Even when a candidate fails (no license, out-of-area), we collect what we can and flag the record. Recruiters use this data to spot patterns, not just to filter. |
| Recruiter auth = shared password | This is a take-home. In production it'd be Supabase Auth + RLS scoped to a `recruiters` table; the README and presentation will note this explicitly. |
| Frontend on Vercel, backend on Cloud Run, DB on Supabase | Three independently scaled services, each best-in-class at its job. The trade-off is three providers to manage; for a take-home the dev velocity gain is worth it. |

## Bonuses delivered

- ✅ **Voice agent** — browser-based via OpenAI Realtime over WebRTC
- ✅ **Multi-language** — native ES↔EN with code-switching
- ✅ **Guardrails** — input filter for inappropriate / off-topic / prompt-injection;
  output filter for accidental phone-number leaks
- ✅ **Analytics** — recruiter dashboard with totals, qualified rate, avg
  duration, abandoned count
- ✅ **ATS integration spec** — `docs/ats-integration.md` (design only)
- ✅ **Tests** — pytest unit (~50) + integration + 8 conversation evals
- ✅ **Deployment** — GitHub Actions OIDC → Cloud Run; Vercel for frontend

## What I'd improve with more time

- **Real auth** for recruiters (Supabase Auth + RLS, multi-tenant `tenant_id`).
- **Re-engagement** — abandoned-conversation follow-up (Cloud Tasks / pub-sub
  scheduled message at +24h, +72h).
- **Realtime tool persistence** — voice currently relies on the post-call
  reconciliation; production should stream tool calls back to a server-side
  webhook so persistence is symmetric with chat.
- **Smarter language tracking** — heuristic per-turn detection, log per-message
  language to power richer analytics ("which CTAs work better in ES vs EN").
- **Conversation eval scoring** — add LLM-as-judge for tone/empathy alongside
  the deterministic field-match assertions.
- **Service area config** in DB instead of JSON — let ops change coverage
  without a redeploy.

## How this scales to 10K candidates/week

- **Cloud Run autoscaling** handles bursty load — currently capped at 2
  instances; bump to 50 and we're at ~50K concurrent screenings ceiling.
- **Cost** at 10K/week: ~$60/week on OpenAI (chat) + ~$300/week on Realtime
  (voice). Add ~$20/month Supabase Pro and ~$0–$30/month Cloud Run. ~$1.6K/month
  all-in for an inference layer that replaces three full-time recruiters'
  screening workload.
- **Bottlenecks at scale:** Postgres write contention on `turns` (mitigation:
  partition by month or move append-only writes to BigQuery if analytics
  outgrow Postgres); OpenAI rate limits (mitigation: distribute keys across
  org, batch where possible).
- **Operational concerns:** add a moderation API call before persisting to
  remove residual liability around inappropriate content; run quarterly evals
  against a held-out dataset to catch model regressions.

## License

Private — Orbio FDE take-home submission.
