# CloakDLP installer

Builds `CloakDLP-Setup.msi` — a single MSI that installs both CloakDLP services and shows up
in Add/Remove Programs (`appwiz.cpl`) as **CloakDLP**, cleanly uninstallable from there.

## What it installs

Under `C:\Program Files\CloakDLP\`:

| Service (Services.msc name) | What it is | Binary |
|---|---|---|
| **CloakDLP Console** | Policy orchestrator API + web console, on `http://127.0.0.1:8123` | `console\CloakDLP-Console.exe`, wrapped as a service by [WinSW](https://github.com/winsw/winsw) (`console\CloakDLPConsoleService.exe`) |
| **CloakDLP Agent** | Endpoint content-inspection agent (clipboard/print/network channels) | `agent\CloakDlp.Agent.exe service` — a native Windows Service via `Microsoft.Extensions.Hosting.WindowsServices` |

Both are set to start automatically and are registered/started/stopped/removed by the MSI
itself (WiX `ServiceInstall`/`ServiceControl` — no custom install scripts). A Start Menu
shortcut ("CloakDLP Console") opens the console in the default browser.

The console frontend is a Next.js **static export** (`console-frontend/out/`) served directly
by the backend exe via FastAPI's `StaticFiles` — see `console-backend/app/main.py` and
`console-frontend/next.config.ts`. This means **no Node.js is required on the install
target** — only the two bundled, self-contained exes.

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

(Pinned to WiX v5 deliberately — v7+ requires accepting a paid "Open Source Maintenance Fee"
EULA; v5 doesn't.)

Output: `installer\out\CloakDLP-Setup.msi`.

## Installing / uninstalling

Run the MSI (needs admin elevation, like any service-installing MSI) and it's done — both
services start automatically. Uninstall from **Settings → Apps** or `appwiz.cpl`, same as any
other Windows application; the MSI stops and removes both services and all installed files.

**After install**, the agent needs endpoint-specific configuration before it does anything —
register it from the console (Agents page) and fill in
`C:\Program Files\CloakDLP\agent\appsettings.json` with the issued `AgentId`/`ApiKey` and each
policy's id, same as the manual setup described in [`../agent/README.md`](../agent/README.md).
This is a deliberate manual step: an agent auto-registering itself with no operator involved
would be a much bigger trust decision than this project takes on by default.

Data (`cloakdlp.db`, the auto-generated JWT signing secret, service logs) lives under
`C:\ProgramData\CloakDLP\`.

## Verification status

Built and validated in this repo's dev environment: `wix msi validate` (full ICE ruleset)
passes clean, and the MSI's `ServiceInstall`/`ServiceControl`/`Property`/`File`/`Directory`
tables were inspected directly (via the Windows Installer COM API) and match what's authored
in `CloakDLP.wxs` — 89 files, 41 directories, both services present with the right start type,
error control, and arguments. Each *component* (the standalone backend exe, the self-contained
agent exe, the static frontend serving, the Windows Service mode) was independently run and
verified end-to-end earlier in this project's history.

**Not verified**: an actual `msiexec` install/uninstall run. That needs admin elevation this
build environment doesn't have. Before relying on this for real deployment, run the MSI once
on a real Windows machine and confirm: both services appear in `services.msc` as Automatic and
running, the console loads at `http://127.0.0.1:8123`, and uninstalling from Add/Remove
Programs cleanly stops both services and removes all files.
