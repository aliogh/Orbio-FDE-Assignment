"""FastAPI application entry point. Routes are registered in this module."""
from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env from the nearest ancestor (works whether you run from /backend or /).
load_dotenv()


def create_app() -> FastAPI:
    app = FastAPI(title="Grupo Sazón Screening Agent", version="0.1.0")

    origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
