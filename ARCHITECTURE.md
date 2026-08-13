# CloakDLP Architecture

Content-aware Data Loss Prevention policy orchestrator. Enforces policy based on what data
**is** (via content inspection), not what device it's moving through; the opposite framing
from device-control tools.

The flagship use case is personal, not enterprise: catch every time a credit card number gets
entered somewhere, on any channel, and show a running log with a risk score for where it went -
the "wait, when did I give my card to *that* site" problem, solved before the bank statement
surprise instead of after. See [Personal card-entry tracking](#personal-card-entry-tracking)
below. The general policy/detection engine underneath (EDM, fingerprinting, arbitrary channels
and data types) still works exactly as described in the rest of this doc; the pivot changed
what's on by default and how zero-effort setup is, not the underlying capability.

## Components

### Agent (endpoint-side, Windows-first)

- **Stack**: C#/.NET (usermode service). No kernel driver in v1; see [Hook approach](#hook-approach-decided).
- Hooks file I/O, clipboard, print spooler, and network egress (browser upload / email
  attachment level; not full packet inspection in v1).
- Runs local content inspection **before** anything leaves the endpoint. Only match metadata
  (rule ID, confidence, redacted snippet, timestamp, channel) is sent to the console; raw
  sensitive content never leaves the box.
- Reports events and heartbeats to the console over an authenticated REST API.
- Per-policy **simulate** mode (log only, no block) vs **enforce** mode.

#### Hook approach (decided, implemented in Phase 2)

Usermode-only for v1, deliberately deferring kernel work:

| Channel | Mechanism | Scope note |
|---|---|---|
| File I/O | Direct read for content scan (`scan` command) | On-demand in Phase 2; a filesystem watcher for continuous monitoring is a follow-up |
| Clipboard | `AddClipboardFormatListener` (Win32), message-only window | Text only; dedupes identical consecutive content |
| Print | `FindFirstPrinterChangeNotification` + `EnumJobs` (winspool) | Scans the job's **document title only**; reading actual spool file content needs elevated access to `%SystemRoot%\System32\spool\PRINTERS`, deliberately out of scope here |
| Network egress | Raw-socket HTTP forward proxy (`CloakDlp.Agent monitor`, point a browser's proxy settings at it) | **HTTP only.** HTTPS interception needs a local CA installed into the OS/browser trust store to MITM TLS; a much larger, more invasive follow-up. `CONNECT` requests (how browsers tunnel HTTPS) are rejected with 501 rather than silently ignored |

Note: an early network-proxy implementation used `HttpListener`, which resolves
`Request.Url` against its own registered prefix rather than the client's requested
absolute-URI; for a real forward-proxy request this silently loops the request back on
itself instead of forwarding it. Rewritten on raw `TcpListener` with a minimal HTTP/1.1
parser instead.

Trade-off accepted knowingly: usermode hooks are detect/log-grade, not tamper-proof. A
motivated user can bypass blocking. Real enforcement (deny at the source, resist tampering)
would need a minifilter (file) and WFP callout (network), mirroring DeviceWarden's jump from
userspace to kernel; deferred to a later phase (see [Phasing](#phasing)) once the detection
engine is proven and we know what specifically needs hardening.

### Console backend

- **Stack**: Python + FastAPI, SQLite by default (Postgres via `DATABASE_URL` for prod).
- Policy CRUD: rules by data type, detection method, channel, mode (log only/block), and
  target scope (user/group/device).
- Incident ingestion API (agent → console), auth'd.
- **WebSocket** push for the live incident feed (chosen over polling for true real-time UX).
- Policy preview: check a policy's channels against already-logged history before enforcing it.

### Console frontend

- **Stack**: React (Next.js) + Tailwind + shadcn/ui; real component system, not hand-rolled CSS.
- Sidebar nav: Overview, Policies, Incidents, Fingerprints, Agents, Reports.
- Dense, readable data tables; live incident feed with severity/action badges
  (Blocked / Log only).
- Metric cards: blocked today, active policies, agents online, false-positive rate.
- Per-channel detection breakdown (clipboard / file / print / network).
- Policy editor with a simple two-state Mode (Log Only / Block) as the flagship flow.
- Full dark mode. Flat, restrained, no gradients/skeuomorphism.

## Detection engine (phased; see below)

1. Regex/pattern detection: PII (SSN, credit card w/ Luhn validation) and secrets (API key
   formats, private keys).
2. Exact Data Match (EDM): reference dataset ingested once, each row/field salted-hashed
   locally, never stores raw values. Detects exact matches of that data in monitored content.
3. Document fingerprinting: fuzzy hashing (ssdeep/TLSH) for partial copies, reformatted docs,
   OCR'd screenshots.
4. Cross-channel correlation: same content across clipboard → rename → upload within a short
   window surfaces as one correlated incident, not three.

### EDM implementation notes (Phase 3)

Single-field datasets only (a flat list of values; emails or numbers), not the full
multi-column "customer record" EDM some commercial tools support. The console hashes each
normalized value with a per-dataset random salt (`SHA-256(salt + normalized_value)`) at
ingestion and discards the raw values immediately; only the salt and hash set are ever
persisted. Agents pull the salt + hash set for datasets tied to their configured policies,
extract same-shaped candidate tokens locally (regex for emails / digit runs for numbers),
normalize and hash them the same way, and check set membership; so a match is detected and
reported without either the console or the wire ever seeing the raw candidate value or the raw
reference data at the same time.

### Document fingerprinting implementation notes (Phase 4)

Uses a from-scratch Context-Triggered Piecewise Hash (CTPH); algorithmically in the spirit of
ssdeep/TLSH (rolling-hash trigger points chunk the input; a piece hash between triggers becomes
one signature character; two block sizes are hashed per document so differently-sized-but-
related documents still have common ground to compare on) but not binary-compatible with either.
Implemented twice; `console-backend/app/ctph.py` (hashes a document once at upload, then
discards it; only the hash is stored) and `agent/CloakDlp.Agent/Detection/Ctph.cs` (hashes
locally scanned files/uploads and compares similarity, 0-100 via normalized edit distance
between signatures). **The two implementations must stay in lockstep**; CTPH isn't a
standardized format the way SHA-256 is; a hash from one implementation is only meaningful
compared against another hash from the *same* spec. Verified byte-identical output for
identical input across both languages before relying on it.

Comparison happens agent-side, same posture as EDM: the agent fetches the reference hash (a
non-reversible fuzzy digest, safe to distribute) once at startup, hashes local content, and
only reports on a match; raw document bytes never cross the wire in either direction.

## Personal card-entry tracking

The pivot from "generic enterprise DLP console" to "track my own card entries" changed three
things: how setup works (must be zero-effort; download, run, open console, done), where
detection happens (a browser extension, not just the desktop agent), and what a match means to
the person reading it (a domain + risk score, not a compliance incident).

### Zero-config pairing

Nothing to register or type in by hand. The trust boundary is "this request came from
127.0.0.1"; reasonable for a genuinely single-user local tool, since the console only binds to
loopback by default anyway:

- **Console login**: `POST /api/auth/local-login` (loopback-only, see `app/deps.py`'s
  `require_loopback`) gets or creates a single local admin account and returns a session token
  with no password involved. The frontend tries this automatically before ever showing a login
  form (`lib/auth-context.tsx`); opening the console from the Start Menu shortcut just... logs
  you in.
- **Agent pairing**: `POST /api/agents/self-register` (also loopback-only) is idempotent by
  hostname; the .NET agent, and the browser extension, both call it on first run and persist
  whatever credentials come back (`%ProgramData%\CloakDLP\agent_credentials.json` for the
  agent; `chrome.storage.local` for the extension).
- **Default policy**: the console auto-creates a "Credit Card Entry" policy (`app/bootstrap.py`)
  on first startup if none exists, Mode = Log Only - starts as an awareness tool, not an
  enforcement one, since blocking someone's own checkout out of the box would be actively
  harmful. Switching it to Block makes it a real enforcement policy; see "Blocking" below.
- **Pairing responses include the right policy id** (`default_credit_card_policy_id` on both
  register endpoints) so a fresh agent or extension install doesn't need a second round-trip or
  any console-side lookup to know what to report against.

### Domain risk scoring

When a network-channel incident's `source_identifier` is a URL, a background task (`app/
routers/incidents.py`, offloaded via `asyncio.to_thread` so a slow WHOIS lookup never blocks
incident creation or the request the agent/extension is mid-handling) scores the domain and
merges the result into `Incident.extra`, then broadcasts an `incident.updated` event so the
already-visible row fills in live:

1. Check the domain against the free [URLhaus](https://urlhaus.abuse.ch/) hostname blocklist
   (no API key, cached in memory with a TTL); a hit scores 100/"high".
2. Otherwise, a raw WHOIS domain-age lookup (`python-whois`, no API key); newer domains score
   higher, an established domain scores low, a failed/unsupported lookup scores 50/"unknown"
   rather than erroring.

Both sources were chosen specifically because they need no account, no API key, no paid tier -
consistent with everything else in this project that's been kept to "works out of the box."

### Blocking

`Policy.action` has always had a `block` value and the policy editor has always let you pick it,
but for a long time nothing actually enforced it - every channel just detected, redacted, and
reported, then let the content through regardless. The channels only ever carry a `policy_id`,
not the policy's own `action`, and trusting a client-reported "yes I blocked this" would mean
the client decides what happened, which is both meaningless (every channel just hardcodes a
fixed `action_taken` value) and the wrong place to decide it - policy config can change at any
moment, with nothing telling an already-running channel its cached copy is stale.

So the decision is made once, server-side, on every incident: `routers/incidents.py::
_effective_action` looks up the policy fresh and computes the real `action_taken` - a policy is
either Log Only or Block, full stop, so this is a straight pass-through of the policy's own
mode (modulated only by risk_threshold, see below). `Incident.blocked` is just
`action_taken == block`, exposed on `IncidentOut` so the channel that reported the match gets a
synchronous, authoritative answer back in the same response, and can act immediately:

| Channel | What "blocked" does | Where |
|---|---|---|
| Clipboard | `EmptyClipboard()` right after reporting | `CloakDlp.Tray`'s `ClipboardMonitor.OnClipboardChanged` |
| Print | `SetJob(..., JOB_CONTROL_CANCEL)` on the job | `PrintMonitor.ScanNewJobsAsync` |
| Network proxy | Returns `403` instead of calling `ForwardAsync` | `NetworkProxyMonitor.HandleConnectionAsync` |
| Browser extension | `preventDefault()` + `stopImmediatePropagation()` on the form's `submit` event, only resubmitted (via `form.submit()`, which - unlike `requestSubmit()` - doesn't redispatch `submit` and can't loop back into the same listener) if the answer comes back not-blocked | `content.js`'s submit listener |

Every enforcement point fails open, not closed: a console that's unreachable, a network error, or
any other failure along the way is treated as not-blocked, matching the "best-effort, no local
queue/retry" posture everywhere else in this project. A DLP tool that occasionally misses a
report is a much smaller problem than one that silently starts eating a real form submission,
print job, or clipboard paste because its own backend happened to be down.

The browser extension's blocking is real but scoped to actual `<form>` submissions with a native
`submit` event - a checkout flow that reads field values and calls `fetch()`/`XHR` directly, with
no form or submit event involved at all, has nothing here to intercept (the typing-time listener
still reports it; nothing can stop it). Full coverage of that would mean patching
`window.fetch`/`XMLHttpRequest` globally, a much larger and riskier change than what's here.

### Browser extension: what was tried, and why it isn't a TLS-intercepting proxy

Almost every real checkout page is HTTPS, so the desktop agent's plain-HTTP network-egress
proxy can't see a card number typed into a payment form. Two "fully silent" approaches to that
problem were attempted and deliberately abandoned, for reasons worth recording:

1. **A local root CA + TLS-terminating proxy** (agent generates a CA, installs it into the
   Windows trust store, terminates and re-establishes TLS per connection to inspect decrypted
   bodies; the same technique mitmproxy/Fiddler/Charles use for debugging). Certificate
   generation and per-user (`CurrentUser`) trust-store writes turned out to be fine; the actual
   TLS-terminating proxy code and machine-wide (`LocalMachine`) trust-store writes were both
   refused by this project's own tooling permission system. Read charitably, that's a reasonable
   line to draw; "silently decrypt someone's HTTPS traffic" and "silently modify what a machine
   trusts system-wide" are exactly the moves a malicious tool would make too, and a security
   product shouldn't need either to do its job.
2. **Force-installing a browser extension via `ExtensionInstallForcelist`** (a real, standard
   Chrome/Edge enterprise policy; just not one a *vendor's own consumer installer* should be
   silently writing to `HKLM` on a stranger's machine). Also refused, and on reflection this one
   is correct architecture, not just a tooling limitation: that policy exists for a customer's
   *own* IT department to deploy to a fleet *they* administer, not for us to invoke unprompted.
   Every comparable real product (password managers, enterprise DLP/CASB vendors) draws this
   same line; publish to the store, let IT push it via their own Group Policy/Intune if they
   want silence, and get a normal one-click "Add to Chrome" for everyone else.

What shipped instead, in `browser-extension/`: a content script reads form field values
directly (the same technique every password manager uses), Luhn-validates and redacts to
last-4 entirely client-side, and reports through the same self-register + incident API the
desktop agent uses; no network interception needed at all, since the content script sees the
value before the browser ever encrypts it. It is **not** auto-installed. The console's Overview
page shows a normal "Install extension" prompt (`components/extension-install-banner.tsx`,
gated on a new `Agent.kind` field distinguishing `browser_extension` agents from `native` ones)
linking to the real store listing once published; see `browser-extension/README.md` for the
publishing steps and how a customer's own IT can still deploy it silently via their own policy.

### Tray notifier and Session 0

A Windows Service runs in Session 0, isolated from the interactive desktop; it cannot show a
notification no matter how it's written, and - less obviously, discovered only by testing it
directly against a real installed service - it can't receive clipboard-change notifications from
the interactive session either (`AddClipboardFormatListener`/`WM_CLIPBOARDUPDATE` simply never
fire there). `agent/CloakDlp.Tray/` is a small per-user app that runs in the logged-in user's own
session instead, and does both jobs: it signs in via the same loopback `local-login` flow and
subscribes to the console's existing incident WebSocket feed to show a `NotifyIcon.ShowBalloonTip`
notification per match, and it runs the clipboard channel itself (via a `ProjectReference` to
`CloakDlp.Agent`, reusing the exact same `ClipboardMonitor`/detector/reporting code, and the
desktop agent's own paired identity from `agent_credentials.json` rather than self-registering a
second one). The `CloakDLP Agent` Windows Service only runs the print and network channels now
(`AgentRuntime.RunChannelsAsync(..., includeClipboard: false)`); clipboard stays available in the
agent's own interactive `monitor` command for dev/testing, where Session 0 doesn't apply. The
tray app launches both immediately when setup finishes (an `Execute="immediate"` install-time
CustomAction, needed because a `deferred` one would run as SYSTEM in Session 0 too - useless for
the same reason the service itself can't do this job) and via a Startup-folder shortcut for every
later logon (visible and removable from Settings → Apps → Startup, unlike a hidden registry Run
key) rather than as a service, specifically so it *can* show UI and see the clipboard.

## Phasing

- **Phase 1; Pipe MVP** *(done)*: console skeleton (auth, policy CRUD, empty-state dashboards)
  + minimal agent doing regex+Luhn credit card detection on a test file, end-to-end through the
  API into the incident feed. Log-only, single channel, single pattern. Prove the pipe.
- **Phase 2; Channel & pattern coverage** *(done)*: clipboard, print, network-egress hooks.
  SSN + secrets detection. Policy engine grows to per-channel/per-scope rules and
  simulate-vs-enforce.
- **Phase 3; Exact Data Match** *(done)*: reference dataset ingestion, local salted hashing,
  EDM detection.
- **Phase 4; Document fingerprinting** *(done)*: fuzzy hashing, CTPH (see below).
- **Phase 5; Cross-channel correlation**: linked-event incidents.
- **Phase 6; Enforcement hardening (deferred, scope TBD)**: kernel-level components
  (minifilter for file block, WFP callout for network block) if usermode enforcement proves
  insufficient or too easily bypassed.

## Packaging: single-MSI installer

`installer/` builds one MSI (WiX Toolset v5) that installs both components as Windows
services and shows up in Add/Remove Programs; see [installer/README.md](installer/README.md)
for the full breakdown. The two packaging decisions worth knowing about:

- **The console frontend is a Next.js static export** (`output: "export"`), served directly by
  the backend exe via FastAPI `StaticFiles` on the same port as the API. This means the
  installed system needs **no Node.js runtime at all**; only the two self-contained exes
  (backend via PyInstaller, agent via `dotnet publish --self-contained`).
- **The backend service is wrapped with [WinSW](https://github.com/winsw/winsw)** rather than
  implemented as a native Python Windows Service. A plain console exe (even one built with
  PyInstaller) doesn't speak the Service Control Manager protocol on its own; WinSW is a
  purpose-built, widely-used (Jenkins, Elasticsearch, etc.) wrapper for exactly this. The agent,
  by contrast, *is* a native Windows Service (`Microsoft.Extensions.Hosting.WindowsServices`)
  since that's straightforward in .NET; both services are still registered, started, stopped,
  and removed the same way, through the MSI's own `ServiceInstall`/`ServiceControl` tables, no
  custom install scripts either way.

## Repo layout

```
CloakDLP/
  agent/
    CloakDlp.Agent/     C#/.NET usermode agent (runs as a Windows Service)
    CloakDlp.Tray/       per-user notification tray app (see Session 0 note above)
  browser-extension/    card-entry detection without TLS interception (see above)
  console-backend/       FastAPI, SQLite/Postgres
  console-frontend/      Next.js + Tailwind + shadcn/ui
  installer/             WiX MSI: services + tray startup shortcut + extension zip
  docs/                  design notes, detection rule specs, etc.
  ARCHITECTURE.md
```
