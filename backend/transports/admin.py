"""Admin endpoints for ops jobs. Currently just the drop-off janitor.

The scheduled run is handled by Supabase pg_cron (see migration 0004) —
this endpoint is the manual escape hatch for ad-hoc sweeps, ops debugging,
and integration testing. Authentication is a single shared secret in
`SWEEP_SECRET`, sent via the `X-Admin-Secret` header. That's deliberately
minimal: the endpoint doesn't read or return any candidate data, only flips
stale `in_progress` rows to `abandoned`.

Inspect or pause the scheduled job:

    select * from cron.job where jobname = 'sweep-stale-conversations';
    select cron.unschedule('sweep-stale-conversations');  -- pause
    -- (re-applying migration 0004 re-creates it)
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Header, HTTPException, Query

from persistence import conversations as persistence

router = APIRouter()
logger = logging.getLogger("transports.admin")


@router.post("/api/admin/sweep-stale")
def sweep_stale(
    minutes: int = Query(default=5, ge=1, le=1440),
    x_admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
) -> dict[str, int | str]:
    """Flip every `in_progress` conversation with no activity in the last
    `minutes` minutes to `abandoned`. Returns the count of rows swept."""
    expected = os.getenv("SWEEP_SECRET")
    if not expected:
        # Fail closed: if the secret isn't configured the endpoint is disabled.
        # An open sweep endpoint is low blast-radius (status flip only) but
        # there's no reason to leave it open.
        raise HTTPException(status_code=503, detail="sweep endpoint not configured")
    if x_admin_secret != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

    swept = persistence.sweep_stale(minutes=minutes)
    logger.info("sweep.done minutes=%d swept=%d", minutes, swept)
    return {"swept": swept, "threshold_minutes": str(minutes)}
