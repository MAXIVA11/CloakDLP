# CloakDLP

A content-aware Data Loss Prevention policy orchestrator. Inspects content (files, clipboard,
print jobs, network egress) and enforces policy based on what the data *is*, not what device
it's moving through.

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions, component breakdown, and phasing.

## Layout

- `agent/` — Windows endpoint agent (C#/.NET, usermode)
- `console-backend/` — policy orchestrator API (Python/FastAPI, Postgres)
- `console-frontend/` — policy & incident console UI (Next.js, Tailwind, shadcn/ui)
- `docs/` — design notes, detection rule specs

## Status

Phase 1 (pipe MVP) in progress.
