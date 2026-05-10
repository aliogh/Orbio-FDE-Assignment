.PHONY: dev backend frontend test lint

# pnpm is invoked via npx with a pinned version because some machines have a
# broken corepack shim ("Cannot find matching keyid"). If your `pnpm` is
# healthy you can replace `npx pnpm@9.15.4` with plain `pnpm`.
PNPM := npx pnpm@9.15.4

dev:
	@(cd backend && uv run uvicorn main:app --reload --port 8000) & \
	(cd frontend && $(PNPM) dev) & \
	wait

backend:
	cd backend && uv run uvicorn main:app --reload --port 8000

frontend:
	cd frontend && $(PNPM) dev

test:
	cd backend && uv run pytest -v

lint:
	cd backend && uv run ruff check .
	cd frontend && $(PNPM) lint
