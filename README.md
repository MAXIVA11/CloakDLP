<p align="center">
  <img src="docs/assets/logo.png" alt="CloakDLP logo" width="140">
</p>

# CloakDLP

A content-aware Data Loss Prevention policy orchestrator. Inspects content (files, clipboard,
print jobs, network egress) and enforces policy based on what the data *is*, not what device
it's moving through.

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions, component breakdown, and phasing.

## Layout

- `agent/` — Windows endpoint agent (C#/.NET, usermode)
- `console-backend/` — policy orchestrator API (Python/FastAPI)
- `console-frontend/` — policy & incident console UI (Next.js, Tailwind, shadcn/ui)
- `installer/` — builds a single MSI that installs both as Windows services (see
  [installer/README.md](installer/README.md))
- `docs/` — design notes, detection rule specs

## Status

Phases 1-4 done (pipe MVP, channel & pattern coverage, Exact Data Match, document
fingerprinting), plus a Windows installer packaging everything as two services. Phase 5
(cross-channel correlation) and Phase 6 (kernel-level enforcement) remain.

## Running from source

```bash
# console-backend
cd console-backend && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --port 8123

# console-frontend (separate terminal)
cd console-frontend && npm install && npm run dev

# agent (separate terminal, after registering it from the console)
cd agent\CloakDlp.Agent && dotnet run -- monitor
```

Or build `installer\CloakDLP-Setup.msi` (see [installer/README.md](installer/README.md)) to
run the whole thing as two Windows services from a single installer.
