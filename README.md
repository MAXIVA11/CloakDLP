<p align="center">
  <img src="docs/assets/logo.png" alt="CloakDLP logo" width="140">
</p>

<h1 align="center">CloakDLP</h1>

<p align="center">
  <b>Data Loss Prevention that inspects what your data <i>is</i> — not which cable it's leaving through.</b>
</p>

<p align="center">
  <a href="https://github.com/MAXIVA11/CloakDLP/releases/latest"><img src="https://img.shields.io/badge/download-latest%20MSI-35b8ac?style=flat-square" alt="Download latest MSI"></a>
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square&logo=windows" alt="Platform: Windows">
  <img src="https://img.shields.io/badge/license-MIT-informational?style=flat-square" alt="License: MIT">
  <img src="https://img.shields.io/badge/phases%201--4-done-1f9a57?style=flat-square" alt="Phases 1-4: done">
  <img src="https://img.shields.io/badge/agent-C%23%20%2F%20.NET-512bd4?style=flat-square" alt="Agent: C#/.NET">
  <img src="https://img.shields.io/badge/backend-FastAPI-009688?style=flat-square&logo=fastapi" alt="Backend: FastAPI">
  <img src="https://img.shields.io/badge/console-Next.js-000000?style=flat-square&logo=nextdotjs" alt="Console: Next.js">
</p>

---

Most DLP tools ship as a black box: something fires, you get a redacted snippet and a shrug,
and figuring out *why* eats your afternoon. CloakDLP is the opposite bet — every detector is
plain code you can read in one sitting, every match carries the reasoning that triggered it,
and "why did this fire" is never a support ticket.

It watches four channels (files, clipboard, print, network egress), runs real detection —
Luhn-validated credit cards, range-checked SSNs, secret-token patterns, salted-hash exact data
match, and a from-scratch fuzzy-hash document fingerprinter — entirely **on the endpoint**, and
only ever sends the console a redacted snippet plus the reasoning. Raw sensitive content never
leaves the box it started on.

## What's actually here

Not a pitch deck — this is what's built, working, and tested end-to-end right now:

- **Four live channels.** Clipboard (event-driven, no polling), print (job-title inspection),
  network egress (a real HTTP forward proxy, built from raw sockets after the first attempt —
  `HttpListener` — turned out to silently loop requests back on itself), and on-demand file
  scanning.
- **Detection that shows its work.** Credit cards get Luhn-validated, not just regex-matched.
  SSNs get SSA range-checked. Every incident carries the rule ID and confidence that fired it.
- **Exact Data Match, done honestly.** Upload a list of emails or account numbers once; the
  console salts and SHA-256 hashes each value and *discards the raw data immediately*. The
  agent hashes local candidates the same way and checks set membership — nobody's customer list
  ever sits in plaintext on disk, in memory, or on the wire, on either end.
- **Document fingerprinting via a hand-rolled fuzzy hash.** A from-scratch Context-Triggered
  Piecewise Hash (ssdeep-flavored, not binary-compatible with it), implemented twice — once in
  Python, once in C# — and checked byte-identical before being trusted. A lightly edited copy
  of a protected doc still matches at 99% similarity; unrelated content scores 0.
- **A console that doesn't feel like an afterthought.** Live incident feed over WebSocket,
  policy editor with an actual working simulate-before-enforce preview, full dark mode.
- **One MSI, two real Windows services.** `CloakDLP Console` and `CloakDLP Agent` both install,
  auto-start, and uninstall cleanly from Add/Remove Programs — no Node.js or Python runtime
  required on the target machine, just two self-contained executables.

## Get it running

**Just want the console + agent as services?** Grab the installer from
[the latest release](https://github.com/MAXIVA11/CloakDLP/releases/latest) and run it —
see [`installer/README.md`](installer/README.md) for exactly what it installs.

**Hacking on it?**

```bash
# console-backend
cd console-backend && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --port 8123

# console-frontend (separate terminal)
cd console-frontend && npm install && npm run dev

# agent (separate terminal, after registering it from the console)
cd agent\CloakDlp.Agent && dotnet run -- monitor
```

## How it's put together

```
CloakDLP/
  agent/              C#/.NET endpoint agent — detection pipeline + 4 channel monitors
  console-backend/     FastAPI policy/incident API — SQLite by default, Postgres-ready
  console-frontend/    Next.js console UI — Tailwind, shadcn/ui, full dark mode
  installer/           WiX-built MSI — installs both as real Windows services
  docs/                design notes, detection rule specs
  ARCHITECTURE.md       the real design doc — read this for the *why* behind every choice
```

Full design rationale — the hook-mechanism tradeoffs, the EDM hashing scheme, the CTPH spec,
every "we tried X, it broke, here's why we switched to Y" — lives in
[ARCHITECTURE.md](ARCHITECTURE.md). It's written to be read, not skimmed.

## Roadmap

| Phase | What | Status |
|---|---|---|
| 1 | Pipe MVP — auth, policy CRUD, one detector, end-to-end | **Done** |
| 2 | Clipboard + print + network channels, SSN/secrets detection | **Done** |
| 3 | Exact Data Match (salted hashing) | **Done** |
| 4 | Document fingerprinting (CTPH fuzzy hashing) | **Done** |
| — | Single-MSI installer, both components as Windows services | **Done** |
| 5 | Cross-channel correlation — one incident, not three | Next |
| 6 | Kernel-level enforcement (minifilter + WFP) | Future, scope TBD |

## License

MIT — see [LICENSE](LICENSE).
