# Grupo Sazón — Screening Conversation Design

**Author:** Alí Ghanbari Dolatshahi · 2026-05-10
**Length target:** 1–2 pages

## Goal
Screen ~200 candidates/week for delivery driver roles across Spain and Mexico,
collect 7 qualifying fields per candidate, filter unqualified ones automatically
so recruiters spend their time on the candidates worth talking to.

## Stages

| # | Stage | Purpose |
|---|---|---|
| 1 | **Greeting + language anchor** | Friendly intro in Spanish (default for ES/MX market). Mirror EN if the candidate replies in English. |
| 2 | **Hard-gate fields** | Driver's license, then city. These can short-circuit the rest of the screening — saves time for both sides. |
| 3 | **Soft fields** | Full name, availability, preferred schedule, prior experience, start date. Order is flexible based on conversational flow. |
| 4 | **Wrap** | Echo back a confirmation summary, set expectations on next steps. |

The ordering is encoded in the system prompt as guidance, not enforced as a state
machine — the agent uses tool calls to record fields as they emerge organically.
This handles candidates who volunteer info out of order (e.g. introducing
themselves with city + name in one breath).

## Data fields & validation

| Field | Required | Validation |
|---|---|---|
| `full_name` | Yes | Non-empty string |
| `has_driver_license` | Yes — disqualifier | Boolean (yes/no/sí/no normalization, with full-phrase tolerance). False → `disqualify("no_license")` |
| `city` | Yes — disqualifier | Fuzzy-matched (RapidFuzz WRatio ≥ 80, with NFKD accent-stripping) against `service_areas.json`. No match after one retry → `disqualify("out_of_service_area")` |
| `availability` | Yes | One of: `full_time`, `part_time`, `weekends` |
| `preferred_schedule` | Yes | One of: `morning`, `afternoon`, `evening`, `flexible` |
| `prior_experience` | Yes (incl. "none") | Years + platforms (free-form, stored as JSON sub-object) |
| `start_date` | Yes | ISO date or natural-language ("1 de junio de 2026" / "June 15th") via dateutil; today or future |

## Edge cases & policies

**Candidate stops responding mid-conversation**
Persistence is incremental — every turn is durable in Postgres. After 5 minutes
of inactivity (chat) or WebRTC close (voice), the conversation is marked
`status = "abandoned"` with the partial record preserved. Recruiters see these
in a separate filter so they can follow up if appropriate.

**Invalid or ambiguous answers**
The validation loop: tool returns `{ok: false, validation_error: "..."}` → agent
re-asks once with concrete options → if still ambiguous, accepts best-effort and
moves on (best-effort beats blocking on perfection). For city specifically, the
fuzzy matcher accepts typos (e.g. "Madird" → "Madrid"). Genuine non-matches
trigger one retry with examples before disqualifying.

**Language switching ES ↔ EN**
No detection layer. The system prompt instructs the model to mirror the
candidate's language at each turn. Both `gpt-5-mini` (chat) and
`gpt-realtime-mini` (voice) handle this natively, including mid-sentence
code-switching ("hola I'm John from Madrid").

## Qualified vs disqualified outcomes

**Qualified:** `complete_screening(summary)` fires → conversation marked
`qualified=true, status=completed`. Candidate gets a polite "we'll be in touch
within 48h" message. Recruiter sees them in the dashboard with a green badge
and a 2-3 sentence agent-generated summary.

**Disqualified:** `disqualify(reason, detail)` fires → conversation marked
`qualified=false`. Candidate gets a kind, specific explanation ("appreciate your
time, but a license is required for this role") and a soft door — *"if anything
changes, reach out"*. The partial record is preserved so recruiters can spot
patterns (e.g. high inbound from cities not in service area suggests expansion
opportunity).

**Incomplete:** Candidate dropped off. `qualified=null, status=abandoned`.
Filed under a third bucket so recruiters can choose to re-engage.

## Tone & length

- **Brief.** No more than 3 sentences per agent message. **One question at a
  time.** Messaging-style, not email-style.
- **Warm, not corporate.** First-person, candidate's first name once known.
- **Confirm before moving on** for critical fields ("Entonces, **Madrid**, fines
  de semana, ¿correcto?").
- **Emojis sparingly.** 👋 to open, ✅ on confirmation. Never elsewhere.
- **Honest if asked.** If the candidate asks "are you a person?" — admit it's
  an AI. Trying to deceive backfires hard.
- **No promises.** Never imply hiring outcomes. The agent's job is screening,
  not selling the role.

## Refusal & guardrails

- Inappropriate language or prompt injection → polite redirect; on third
  occurrence, end the conversation.
- Off-topic chatter → soft redirect ("vamos a continuar con el proceso").
- PII other than the 7 fields → don't ask, don't store; if the candidate
  volunteers something sensitive, ignore it (don't store in `extracted_fields`).
- Output sanitization strips phone-number-like patterns from agent replies as
  belt-and-braces.
