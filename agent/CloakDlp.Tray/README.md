# CloakDLP Notifier

A small per-user tray app that shows a Windows notification when the console reports a new
credit-card-entry incident. Exists because Windows Services run in Session 0, isolated from the
interactive desktop; they can't show UI directly, so a service alone can't pop up a
notification no matter how it's written. This runs in the logged-in user's own session instead.

## How it works

1. Signs in the same zero-config way the console frontend does: `POST /api/auth/local-login`
   (loopback-trust; no password).
2. Connects to the console's existing live incident WebSocket (`/ws/incidents`); the same feed
   the Incidents page uses.
3. Shows a balloon notification via the tray icon (`NotifyIcon.ShowBalloonTip`) for each new
   incident. Reconnects with backoff if the console isn't reachable yet (e.g. at boot, before
   the console service has started).

Logs to `%ProgramData%\CloakDLP\logs\tray.log` (no attached console to write to otherwise).

## Running

```bash
dotnet run
```

The MSI installs it to start automatically at logon via a Startup-folder shortcut; visible and
removable from Settings → Apps → Startup like any other startup app, not hidden.
