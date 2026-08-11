# CloakDLP browser extension

Watches text-like form fields as you type for a Luhn-valid credit card number and logs a
redacted (last-4) entry to your local CloakDLP console, along with the page's domain. The card
number itself never leaves your browser; see `content.js` for the detection logic (mirrors
`agent/CloakDlp.Agent/Detection/CreditCardDetector.cs`) and `background.js` for reporting.

## Why this exists

Almost every real checkout page is HTTPS, so the desktop agent's network-egress channel (which
only inspects plain HTTP) can't see card numbers typed into a payment form. A content script
reads the field directly before the browser ever encrypts it; no TLS interception, no local
CA, no system proxy changes needed.

## Pairing

On first run, the background service worker self-registers with the console running on
`127.0.0.1:8123` (the same loopback-trust flow the desktop agent uses; see
`app/routers/agents.py`'s `self-register` endpoint) and stores the issued credentials in
`chrome.storage.local`. No manual API key entry.

## Loading it locally (development)

`chrome://extensions` → enable Developer mode → "Load unpacked" → select this directory.

## Publishing (for production distribution)

This is **not** installed or registered with any browser automatically; deliberately.
Silently force-installing a browser extension via enterprise policy is appropriate for a
customer's *own* IT department deploying to a fleet they administer, not for a vendor's
installer to do on a stranger's machine unprompted; see `../ARCHITECTURE.md` for the fuller
reasoning. The correct production path:

1. Publish to the [Chrome Web Store](https://chrome.google.com/webstore/devconsole) and
   [Microsoft Edge Add-ons](https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview)
  ; needs a developer account and goes through each store's review.
2. Set `EXTENSION_STORE_URL` (console-backend env var / `.env`) to the published listing URL.
   The console's Overview page then shows a one-click "Install extension" prompt (see
   `console-frontend/src/components/extension-install-banner.tsx`) until an extension agent is
   detected as paired; same trusted "Add to Chrome" flow as any other consumer extension.
3. For customers who want it silently deployed fleet-wide, point their IT admin at
   `ExtensionInstallForcelist` (Chrome/Edge's standard managed-policy mechanism) referencing the
   published store ID; their policy, their fleet, their call.

`installer/build.ps1` zips this directory's source into the MSI (under `extension\` in the
install folder) purely for reference/submission convenience; it isn't loaded or run by
anything the installer does.
