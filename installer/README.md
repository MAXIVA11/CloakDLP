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

## Code signing (SmartScreen)

An unsigned MSI trips Microsoft Defender SmartScreen's "Windows protected your PC / Unknown
publisher" warning for anyone who downloads it — that's not a bug, it's what SmartScreen does
for any unsigned binary from an unrecognized publisher, and there's no metadata fix for it
short of a real code-signing certificate.

`.github/workflows/release.yml` is wired up for **free code signing via
[SignPath.io](https://signpath.io)** (they sign open-source project releases at no cost). It's
currently a no-op — pushing a `v*` tag builds and releases the **unsigned** MSI until this is
configured. To turn signing on:

1. Sign up at [signpath.io](https://signpath.io) and apply for the open-source plan.
2. Create a SignPath **project** (slug `cloakdlp` — matches `project-slug` in the workflow; if
   you pick a different slug, update the workflow to match).
3. Create a **signing policy** for Windows/Authenticode signing (slug `release-signing` —
   again, update the workflow if you name it differently).
4. Install the SignPath GitHub App on `MAXIVA11/CloakDLP` and link the repo as a trusted build
   system (SignPath's dashboard walks through this — it's their recommended "GitHub.com
   trusted build system" flow).
5. In the repo's **Settings → Secrets and variables → Actions**, add:
   - Secret `SIGNPATH_API_TOKEN` — a submitter-scoped API token from SignPath.
   - Secret `SIGNPATH_ORG_ID` — your SignPath organization ID.
   - Repository **variable** (not secret) `SIGNPATH_ENABLED` = `true` — this is the workflow's
     kill switch; the `sign` job is skipped entirely until it's set.
6. Push a `v*` tag. The `build` job publishes the release with the unsigned MSI first; the
   `sign` job then submits it to SignPath and replaces the release asset with the signed one a
   few minutes later.

I couldn't complete steps 1-5 myself — they require creating an account, accepting SignPath's
terms, and linking the actual GitHub App to the repo, all of which only the repo owner can do.
The workflow file also references `signpath/github-action-submit-signing-request@v1`; SignPath's
own "add to CI" snippet (shown once your project exists) is the source of truth if that's since
moved to a newer major version — worth a quick diff against what's in `release.yml`.

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
