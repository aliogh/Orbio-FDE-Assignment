# ATS Integration Spec

**Status:** Design only — bonus deliverable, not implemented.

## Goal
Enable Grupo Sazón's ATS (e.g. Greenhouse, Workable, Bullhorn) to receive
qualified candidates from the screening agent automatically, with their
extracted fields, transcript, and summary.

## Approach: outbound webhooks + REST pull

We push to the ATS on screening completion; the ATS can also pull on demand if
they prefer reconciliation over realtime.

## REST API (push from us)

`POST {ats_webhook_url}` — fired on `complete_screening` for qualified candidates.

```json
{
  "event": "candidate.qualified",
  "fired_at": "2026-05-10T15:32:00Z",
  "screening_id": "uuid",
  "candidate": {
    "full_name": "Ana Pérez",
    "city": "Madrid",
    "country_code": "ES",
    "language": "es",
    "has_driver_license": true,
    "availability": "full_time",
    "preferred_schedule": "morning",
    "prior_experience": { "years": 2.0, "platforms": ["Glovo"] },
    "start_date": "2026-06-01"
  },
  "screening": {
    "channel": "voice",
    "started_at": "2026-05-10T15:25:00Z",
    "ended_at": "2026-05-10T15:32:00Z",
    "duration_seconds": 420,
    "summary": "Experienced rider, full-time, available June 1.",
    "transcript_url": "https://api.gruposazon.example/screenings/{id}/transcript"
  },
  "signature": "hmac-sha256(payload, ats_shared_secret)"
}
```

Disqualified candidates get the same payload shape with `event: "candidate.disqualified"` and an additional `disqualification_reason` field.

## REST API (pull from us)

```
GET /api/v1/screenings?since=ISO8601&status=qualified|disqualified|incomplete
GET /api/v1/screenings/{id}
GET /api/v1/screenings/{id}/transcript
```

Auth: bearer token issued per ATS integration.

## Auth & security

- Each ATS integration gets a unique shared secret. We sign every webhook with
  HMAC-SHA256 (header `X-Sazon-Signature`); ATS verifies before processing.
- Bearer tokens for the pull API. Rotate per integration.
- TLS only. No PII in URL params.

## Reliability

- Webhooks retry with exponential backoff (1m, 5m, 30m, 2h, 12h) up to 24h.
- After 24h with no 2xx, the event lands in a dead-letter queue (Cloud Pub/Sub
  in our deployment) for manual replay.
- Each event is idempotent by `screening_id` + `event` so duplicate deliveries
  are safe to process.

## Schema versioning

The payload includes a `schema_version` (initially `"1.0"`). Breaking changes
bump the major version and run side-by-side until ATSes opt in.

## Open questions for the integration partner

- Do they want one webhook per event or batched? (We'll support both.)
- Field mapping — is `availability` already a field in their candidate object?
- Should we store the transcript on our side (privacy concerns) or push it?
  Default: stay on our side, expose via signed URL on demand.
