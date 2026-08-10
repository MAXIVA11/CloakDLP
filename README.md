<p align="center">
  <img src="docs/assets/logo.png" alt="CloakDLP logo" width="140">
</p>

<h1 align="center">CloakDLP</h1>

<p align="center">
  <b>Know every time you enter your credit card, and everywhere it went.</b>
</p>

<p align="center">
  <a href="https://github.com/MAXIVA11/CloakDLP/releases/latest"><img src="https://img.shields.io/badge/download-latest%20MSI-35b8ac?style=flat-square" alt="Download latest MSI"></a>
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square&logo=windows" alt="Platform: Windows">
  <img src="https://img.shields.io/badge/license-MIT-informational?style=flat-square" alt="License: MIT">
  <img src="https://img.shields.io/badge/setup-zero--config-1f9a57?style=flat-square" alt="Setup: zero-config">
  <img src="https://img.shields.io/badge/agent-C%23%20%2F%20.NET-512bd4?style=flat-square" alt="Agent: C#/.NET">
  <img src="https://img.shields.io/badge/backend-FastAPI-009688?style=flat-square&logo=fastapi" alt="Backend: FastAPI">
  <img src="https://img.shields.io/badge/console-Next.js-000000?style=flat-square&logo=nextdotjs" alt="Console: Next.js">
</p>

You know the moment: a bank statement lands, and there's a charge you don't recognize. Was it
fraud, or did you forget about some checkout from three months ago? By the time you're asking,
the useful window already closed. CloakDLP catches the moment that actually matters, the second
you type your card number in, and logs it with a risk read on wherever it just went, so you have
a real answer before your bank ever needs to send you one.

Install it, open the console, done. It watches for card entry across your clipboard, your files,
and (through a small browser extension) the checkout forms you actually type into, Luhn-validates
what it finds so it isn't just flagging any 16-digit number, and never sends the real card number
anywhere, not to the console, not over the network, not to disk. Only a redacted last-4 and the
domain it went to ever leave your machine.

## What's actually here

Not a pitch deck. This is what's built, working, and tested end to end right now.

- **Zero-config, genuinely.** Run the installer, open the console, you're signed in already, no
  password to set. The agent pairs itself with the console on first run. A "Credit Card Entry"
  policy exists before you've touched anything. That's the whole setup.
- **Catches typed entry, not just copy-paste.** A browser extension reads the card number
  straight out of the form field before your browser ever encrypts it, no need to intercept your
  HTTPS traffic to see it. Luhn-validated and redacted to last-4 client-side, so the full number
  never exists outside your browser.
- **A risk score for where it went.** Every network-channel match gets checked against a live
  malware/phishing blocklist and a domain-age lookup, both free, no API key required, and shown
  right next to the entry. A ten-year-old, well-known domain reads very differently from one
  registered four days ago.
- **A notification when it happens**, not just a row you'd have to go looking for. A small tray
  app watches the live incident feed and pops a notice the moment a card gets entered.
- **Detection that shows its work.** Every match carries the exact rule and confidence that
  fired it, so "why did this flag" is never a mystery. Under the hood there's also SSN
  detection, secret-token patterns, salted exact-data-match, and a document fingerprinter built
  from scratch, the same general-purpose DLP engine this project started as, still there if you
  need it.
- **One MSI, done properly.** `CloakDLP Console` and `CloakDLP Agent` install and run as real
  Windows services; a tray notifier starts at logon. No Node.js or Python runtime needed on the
  install target, just self-contained executables doing their jobs. Nothing gets silently
  installed into your browser without a click, that line matters and is explained in
  [ARCHITECTURE.md](ARCHITECTURE.md#browser-extension-what-was-tried-and-why-it-isnt-a-tls-intercepting-proxy).

## Get it running

**Just want it running?** Grab the installer from
[the latest release](https://github.com/MAXIVA11/CloakDLP/releases/latest) and run it. See
[`installer/README.md`](installer/README.md) for exactly what it sets up, and
[`browser-extension/README.md`](browser-extension/README.md) for the browser piece.

**Want to hack on it instead?**

```bash
# console-backend
cd console-backend && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --port 8123

# console-frontend (separate terminal)
cd console-frontend && npm install && npm run dev

# agent (separate terminal) — self-registers with the console automatically
cd agent\CloakDlp.Agent && dotnet run -- monitor

# browser extension: chrome://extensions -> Developer mode -> Load unpacked -> browser-extension/
```

## How it's put together

```
CloakDLP/
  agent/
    CloakDlp.Agent/     C#/.NET endpoint agent (clipboard, file, print, network channels)
    CloakDlp.Tray/       per-user notification tray app
  browser-extension/    card-entry detection without touching TLS
  console-backend/       FastAPI policy/incident API, SQLite by default, Postgres-ready
  console-frontend/      Next.js console UI, Tailwind, shadcn/ui, full dark mode
  installer/             WiX-built MSI: services, tray startup, extension packaged for reference
  docs/                  design notes, detection rule specs
  ARCHITECTURE.md         the real design doc, read this for the why behind every choice
```

The full design rationale, hook-mechanism tradeoffs, the EDM hashing scheme, the CTPH spec, why
the browser extension isn't a TLS-intercepting proxy, and every "we tried X, it got blocked,
here's why we switched to Y" along the way, lives in [ARCHITECTURE.md](ARCHITECTURE.md). It's
written to be read, not skimmed.

## Roadmap

| Phase | What | Status |
|---|---|---|
| 1 | Pipe MVP: auth, policy CRUD, one detector, end to end | **Done** |
| 2 | Clipboard + print + network channels, SSN/secrets detection | **Done** |
| 3 | Exact Data Match (salted hashing) | **Done** |
| 4 | Document fingerprinting (CTPH fuzzy hashing) | **Done** |
| pivot | Personal card-entry tracking: zero-config pairing, browser extension, risk scoring, tray notifier | **Done** |
| bonus | Single-MSI installer for all of the above | **Done** |
| next | Cross-channel correlation: one incident, not three | Next |
| future | Kernel-level enforcement (minifilter + WFP) | Scope TBD |

## License

MIT. See [LICENSE](LICENSE).
