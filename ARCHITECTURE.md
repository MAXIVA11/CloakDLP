# CloakDLP — Architecture

Content-aware Data Loss Prevention policy orchestrator. Enforces policy based on what data
**is** (via content inspection), not what device it's moving through — the opposite framing
from device-control tools.

## Components

### Agent (endpoint-side, Windows-first)

- **Stack**: C#/.NET (usermode service). No kernel driver in v1 — see [Hook approach](#hook-approach-decided).
- Hooks file I/O, clipboard, print spooler, and network egress (browser upload / email
  attachment level — not full packet inspection in v1).
- Runs local content inspection **before** anything leaves the endpoint. Only match metadata
  (rule ID, confidence, redacted snippet, timestamp, channel) is sent to the console — raw
  sensitive content never leaves the box.
- Reports events and heartbeats to the console over an authenticated REST API.
- Per-policy **simulate** mode (log only, no block) vs **enforce** mode.

#### Hook approach (decided, implemented in Phase 2)

Usermode-only for v1, deliberately deferring kernel work:

| Channel | Mechanism | Scope note |
|---|---|---|
| File I/O | Direct read for content scan (`scan` command) | On-demand in Phase 2; a filesystem watcher for continuous monitoring is a follow-up |
| Clipboard | `AddClipboardFormatListener` (Win32), message-only window | Text only; dedupes identical consecutive content |
| Print | `FindFirstPrinterChangeNotification` + `EnumJobs` (winspool) | Scans the job's **document title only** — reading actual spool file content needs elevated access to `%SystemRoot%\System32\spool\PRINTERS`, deliberately out of scope here |
| Network egress | Raw-socket HTTP forward proxy (`CloakDlp.Agent monitor`, point a browser's proxy settings at it) | **HTTP only.** HTTPS interception needs a local CA installed into the OS/browser trust store to MITM TLS — a much larger, more invasive follow-up. `CONNECT` requests (how browsers tunnel HTTPS) are rejected with 501 rather than silently ignored |

Note: an early network-proxy implementation used `HttpListener`, which resolves
`Request.Url` against its own registered prefix rather than the client's requested
absolute-URI — for a real forward-proxy request this silently loops the request back on
itself instead of forwarding it. Rewritten on raw `TcpListener` with a minimal HTTP/1.1
parser instead.

Trade-off accepted knowingly: usermode hooks are detect/log-grade, not tamper-proof. A
motivated user can bypass blocking. Real enforcement (deny at the source, resist tampering)
would need a minifilter (file) and WFP callout (network), mirroring DeviceWarden's jump from
userspace to kernel — deferred to a later phase (see [Phasing](#phasing)) once the detection
engine is proven and we know what specifically needs hardening.

### Console backend

- **Stack**: Python + FastAPI, Postgres for policies/incidents/agent state.
- Policy CRUD: rules by data type, detection method, channel, action (block/flag/log), and
  target scope (user/group/device).
- Incident ingestion API (agent → console), auth'd.
- **WebSocket** push for the live incident feed (chosen over polling for true real-time UX).
- Policy simulate mode: replay a policy against a historical window before enforcing it live.

### Console frontend

- **Stack**: React (Next.js) + Tailwind + shadcn/ui — real component system, not hand-rolled CSS.
- Sidebar nav: Overview, Policies, Incidents, Fingerprints, Agents, Reports.
- Dense, readable data tables; live incident feed with severity/action badges
  (Blocked / Flagged / Log only).
- Metric cards: blocked today, active policies, agents online, false-positive rate.
- Per-channel detection breakdown (clipboard / file / print / network).
- Policy editor with simulate-before-enforce as the flagship flow.
- Full dark mode. Flat, restrained, no gradients/skeuomorphism.

## Detection engine (phased — see below)

1. Regex/pattern detection: PII (SSN, credit card w/ Luhn validation) and secrets (API key
   formats, private keys).
2. Exact Data Match (EDM): reference dataset ingested once, each row/field salted-hashed
   locally, never stores raw values. Detects exact matches of that data in monitored content.
3. Document fingerprinting: fuzzy hashing (ssdeep/TLSH) for partial copies, reformatted docs,
   OCR'd screenshots.
4. Cross-channel correlation: same content across clipboard → rename → upload within a short
   window surfaces as one correlated incident, not three.

## Phasing

- **Phase 1 — Pipe MVP**: console skeleton (auth, policy CRUD, empty-state dashboards) +
  minimal agent doing regex+Luhn credit card detection on a test file, end-to-end through the
  API into the incident feed. Log-only, single channel, single pattern. Prove the pipe.
- **Phase 2 — Channel & pattern coverage**: clipboard, print, network-egress hooks. SSN +
  secrets detection. Policy engine grows to per-channel/per-scope rules and simulate-vs-enforce.
- **Phase 3 — Exact Data Match**: reference dataset ingestion, local salted hashing, EDM
  detection.
- **Phase 4 — Document fingerprinting**: fuzzy hashing (ssdeep/TLSH).
- **Phase 5 — Cross-channel correlation**: linked-event incidents.
- **Phase 6 — Enforcement hardening (deferred, scope TBD)**: kernel-level components
  (minifilter for file block, WFP callout for network block) if usermode enforcement proves
  insufficient or too easily bypassed.

## Repo layout

```
CloakDLP/
  agent/              C#/.NET usermode agent
  console-backend/     FastAPI + Postgres
  console-frontend/    Next.js + Tailwind + shadcn/ui
  docs/                design notes, detection rule specs, etc.
  ARCHITECTURE.md
```
