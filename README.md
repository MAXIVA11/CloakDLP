<div align="center">

  <img src="docs/assets/logo.png" alt="CloakDLP logo" width="200">

  # 💳 CloakDLP

  **Know the moment your card number leaves the keyboard.**

  [![Download latest MSI](https://img.shields.io/badge/download-latest%20MSI-35b8ac?style=flat-square)](https://github.com/MAXIVA11/CloakDLP/releases/latest)
  ![Platform: Windows](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows)
  ![Setup: zero config](https://img.shields.io/badge/Setup-zero_config-1f9a57?style=flat-square)
  ![Agent: C#/.NET](https://img.shields.io/badge/Agent-C%23%20%2F%20.NET-512bd4?style=flat-square)
  ![Backend: FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)
  ![Console: Next.js](https://img.shields.io/badge/Console-Next.js-000000?style=flat-square&logo=nextdotjs)
  ![License: MIT](https://img.shields.io/badge/License-MIT-8790b3?style=flat-square)

  <sub>🖥️ Windows agent · 🧩 browser extension · 🔔 tray alerts · 🕵️ risk-scored domains</sub>

</div>

---

You know the feeling: a bank statement lands with a charge you don't recognize, and you're left
guessing whether it's fraud or something you forgot about months ago. CloakDLP watches the moment
that actually matters, the second you type a card number into a form, and tells you exactly where
it went and how sketchy that destination looks, before your bank ever has to.

<p align="center">
  <img src="docs/assets/screenshot-incidents.png" width="1000" alt="CloakDLP console incidents feed showing four flagged card-entry events with redacted card numbers, source domains, and risk badges: high risk, unscored, and low risk">
</p>

## 🔍 What's inside

- **Catches typed entry, not just copy-paste.** A browser extension reads the number straight out
  of the checkout form before your browser encrypts it, so this needs no TLS interception at all.
  Luhn-validated and redacted to last-4 client-side; the full number never leaves your browser.
- **A risk score for where it went.** Every network match gets checked against a live
  malware/phishing blocklist and a domain-age lookup, both free, shown right next to the entry.
- **A notification, not just a log row.** A small tray app watches the live incident feed and
  pops a Windows notification the moment a card gets entered.
- **Actually zero config.** Install the MSI, open the console, you're signed in already. The
  agent pairs itself with the console on first run and a "Credit Card Entry" policy exists before
  you've touched anything.
- **The general DLP engine is still under the hood.** SSN detection, secret/token patterns,
  salted exact-data-match, and a from-scratch document fingerprinter, watching clipboard, file,
  print, and network channels, in case card entry isn't the only thing you care about.

## 🚀 Get it running

**Just want it running?** Grab the installer from
[the latest release](https://github.com/MAXIVA11/CloakDLP/releases/latest) and run it (admin
elevation required). Two Windows services install and start automatically, plus a tray notifier.
Open the Start Menu shortcut and the console signs you in on its own.

**Want to hack on it instead?**

```bash
# console-backend
cd console-backend && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --port 8123

# console-frontend (separate terminal)
cd console-frontend && npm install && npm run dev

# agent (separate terminal), self-registers with the console automatically
cd agent\CloakDlp.Agent && dotnet run -- monitor

# browser extension: chrome://extensions, Developer mode, Load unpacked, browser-extension/
```

## 🧠 Curious how it works

Zero-config pairing, domain risk scoring, why the extension isn't a TLS-intercepting proxy, the
EDM hashing scheme, the CTPH fingerprint spec, every "we tried X, it got blocked, here's why we
switched to Y" along the way: it's all in [ARCHITECTURE.md](ARCHITECTURE.md), written to be read,
not skimmed.

```
CloakDLP/
  agent/CloakDlp.Agent/   C#/.NET endpoint agent (clipboard, file, print, network channels)
  agent/CloakDlp.Tray/    per-user notification tray app
  browser-extension/      card-entry detection without touching TLS
  console-backend/        FastAPI policy/incident API
  console-frontend/       Next.js console UI
  installer/              WiX-built MSI
  ARCHITECTURE.md          the real design doc
```

---

<div align="center"><sub>MIT License, built so your next surprise charge isn't a surprise</sub></div>
