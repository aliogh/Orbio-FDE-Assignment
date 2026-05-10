.PHONY: dev backend frontend test lint

dev:
	@(cd backend && uv run uvicorn main:app --reload --port 8000) & \
	(cd frontend && pnpm dev) & \
	wait

backend:
	cd backend && uv run uvicorn main:app --reload --port 8000

frontend:
	cd frontend && pnpm dev

test:
	cd backend && uv run pytest -v

lint:
	cd backend && uv run ruff check .
	cd frontend && pnpm lint
