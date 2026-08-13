# CloakDLP installer

Builds `CloakDLP-Setup.msi`, a single MSI that installs CloakDLP and shows up in Add/Remove
Programs (`appwiz.cpl`) as **CloakDLP**, cleanly uninstallable from there.

## What it installs

Under `C:\Program Files\CloakDLP\`:

| Component | What it is | How it runs |
|---|---|---|
| **CloakDLP Console** (service) | Policy orchestrator API + web console, on `http://127.0.0.1:8123` | `console\CloakDLP-Console.exe`, wrapped as a Windows Service by [WinSW](https://github.com/winsw/winsw) (`console\CloakDLPConsoleService.exe`) |
| **CloakDLP Agent** (service) | Endpoint content-inspection agent (print/network channels) | `agent\CloakDlp.Agent.exe service`, a native Windows Service via `Microsoft.Extensions.Hosting.WindowsServices` |
| **CloakDLP Notifier** (per-user, launches immediately and at every logon) | Shows a notification when a card entry is detected, and runs the clipboard channel itself | `tray\CloakDlp.Tray.exe`, launched directly by the installer and via a shortcut in the current user's Startup folder, visible and removable from Settings → Apps → Startup like any other startup app |
| Browser extension source | Zipped for reference | `extension\CloakDLP-browser-extension.zip`, **not installed or registered with any browser**; see [`../browser-extension/README.md`](../browser-extension/README.md) for why and what to do with it |

The two services are registered/started/stopped/removed entirely by the MSI itself (WiX
`ServiceInstall`/`ServiceControl`, no custom install scripts). The console opens in the default
browser automatically when setup finishes, and again anytime from the Start Menu shortcut
("CloakDLP Console").

Clipboard detection runs from the Notifier, not the Agent service: Windows Services run in
Session 0, which can't observe the interactive desktop's clipboard at all, so the Agent service
only runs the print and network channels. See [`../agent/CloakDlp.Tray/README.md`](../agent/CloakDlp.Tray/README.md).

The console frontend is a Next.js **static export** (`console-frontend/out/`) served directly
by the backend exe via FastAPI's `StaticFiles`; see `console-backend/app/main.py` and
`console-frontend/next.config.ts`. This means **no Node.js is required on the install target**
- only self-contained executables.

## Zero-config after install

Nothing to configure by hand:

- **Console login**: opening the console from the Start Menu shortcut logs you in automatically
  (loopback-trust; see `POST /api/auth/local-login` in `console-backend/app/routers/auth.py`).
  No account to create, no password.
- **Agent pairing**: the agent service self-registers with the console on first startup and
  persists its credentials under `%ProgramData%\CloakDLP\`; no API key to copy anywhere. See
  `POST /api/agents/self-register`.
- **Default policy**: the console auto-creates a "Credit Card Entry" policy on first startup if
  none exists (Log Only, out of the box); detection works the moment both services are running.
  Switch it to Block in the console to actually clear the clipboard, cancel the print job,
  reject the network request, or block the form submission.
- **Browser extension**: not auto-installed (see above); the console's Overview page shows a
  one-click "Install extension" prompt once `EXTENSION_STORE_URL` is configured post-publish.

## Building

```powershell
.\installer\build.ps1
```

Requires (on the build machine, not the install target): Node/npm, a `console-backend\.venv`
with `pip install -r requirements.txt` already run, the .NET 10 SDK, and the WiX CLI:

```bash
dotnet tool install --global wix --version 5.0.2
wix extension add --global WixToolset.UI.wixext/5.0.2
wix extension add --global WixToolset.Util.wixext/5.0.2
```

(Pinned to WiX v5 deliberately; v7+ requires accepting a paid "Open Source Maintenance Fee"
EULA; v5 doesn't.)

Output: `installer\out\CloakDLP-Setup.msi`.

### Code signing

`build.ps1` signs each of the three exes it produces (console, agent, tray) and the final MSI
via [sign.ps1](sign.ps1), through [SignPath](https://signpath.io)'s free code-signing program
for open-source projects. This is a no-op - the build still runs and produces an unsigned MSI,
exactly as before - unless all five `SIGNPATH_*` environment variables sign.ps1 documents are
set. Nothing about a local dev build changes unless you deliberately export those.

## Installing / uninstalling

Run the MSI (needs admin elevation, like any service-installing MSI) and it's done; both
services start automatically, the tray notifier launches immediately (not just at next logon -
an `Execute="immediate"` CustomAction after `InstallFinalize` starts it in the installing user's
own session right away, in addition to registering the Startup-folder shortcut for future
logons), and the console opens in the default browser automatically. Uninstall from
**Settings → Apps** or `appwiz.cpl`; the MSI stops and removes both services, the startup
shortcut, and all installed files.

Data (`cloakdlp.db`, the auto-generated JWT signing secret, service/agent/tray logs) lives
under `C:\ProgramData\CloakDLP\`.

## Verification status

Built and validated in this repo's dev environment: `wix msi validate` (full ICE ruleset)
passes clean (one accepted, non-fatal ICE69 warning; see the comment above `TrayStartupShortcut`
in `CloakDLP.wxs` for why), and the MSI's `ServiceInstall`/`ServiceControl`/`Shortcut`/`File`/
`Directory` tables were inspected directly (via the Windows Installer COM API) and match what's
authored; 93 files, 44 directories, both services present with the right start type and
arguments, the tray shortcut correctly targeting the tray exe. Every component (zero-config
pairing, default policy provisioning, domain risk scoring, the browser extension's detection
and reporting, the tray notifier's live incident feed connection, the standalone backend/agent
exes, the Windows Service mode) was independently run and verified end-to-end earlier in this
project's history; see `ARCHITECTURE.md` for what exactly was tested.

**Not verified**: an actual `msiexec` install/uninstall run. That needs admin elevation this
build environment doesn't have. Before relying on this for real deployment, run the MSI once on
a real Windows machine and confirm: both services appear in `services.msc` as Automatic and
running, the console loads at `http://127.0.0.1:8123` already signed in, the tray icon appears
after a logon, and uninstalling from Add/Remove Programs cleanly stops everything and removes
all files.
