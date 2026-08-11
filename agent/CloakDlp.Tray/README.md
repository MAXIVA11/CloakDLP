# CloakDLP Notifier

A small per-user tray app that shows a Windows notification when the console reports a new
credit-card-entry incident, and also runs clipboard-channel detection itself. Both exist here,
not in the CloakDLP Agent Windows Service, because Windows Services run in Session 0, isolated
from the interactive desktop; they can't show UI directly (so a service alone can't pop a
notification) and, less obviously, they can't even receive clipboard-change notifications from
the interactive session either (confirmed directly: an installed service logs "monitoring
started" and then nothing, ever, no matter what's copied). This runs in the logged-in user's own
session instead, where both of those actually work.

## How it works

1. Signs in the same zero-config way the console frontend does: `POST /api/auth/local-login`
   (loopback-trust; no password).
2. Connects to the console's existing live incident WebSocket (`/ws/incidents`); the same feed
   the Incidents page uses.
3. Shows a balloon notification via the tray icon (`NotifyIcon.ShowBalloonTip`) for each new
   incident. Reconnects with backoff if the console isn't reachable yet (e.g. at boot, before
   the console service has started).
4. Separately, runs a clipboard listener (`CloakDlp.Agent.Channels.ClipboardMonitor`, via a
   `ProjectReference` to `../CloakDlp.Agent`, the same code the agent's own interactive `monitor`
   command uses) and reports matches to the console. It reuses the desktop agent's own paired
   identity from `%ProgramData%\CloakDLP\agent_credentials.json` rather than self-registering a
   second one - self-register is idempotent per (hostname, kind), so a second "native"
   registration from here would silently reissue a fresh API key and invalidate the one the
   actual agent service is using. If that file isn't there yet (agent hasn't paired, or hasn't
   picked up a credit-card policy id yet), it waits and checks again every 15s rather than
   running a listener that can never report anything.

Logs to `%ProgramData%\CloakDLP\logs\tray.log` (no attached console to write to otherwise).

## Running

```bash
dotnet run
```

The MSI installs it to start automatically at logon via a Startup-folder shortcut; visible and
removable from Settings → Apps → Startup like any other startup app, not hidden.
