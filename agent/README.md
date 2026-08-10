# CloakDLP Agent

Windows endpoint agent (C#/.NET, usermode). Detects credit cards (regex + Luhn), SSNs, API
keys/tokens, and PEM private keys across file, clipboard, print, and network channels, and
reports matches to the console API. See [../ARCHITECTURE.md](../ARCHITECTURE.md) for the
per-channel hook mechanisms and their scope limitations.

## Setup

**Zero-config (default)**: just run it. On first startup, if `appsettings.json` has no
`AgentId`/`ApiKey`, the agent self-registers with the console at `ConsoleUrl` (loopback-only
endpoint — see `POST /api/agents/self-register`) and persists the issued credentials to
`%ProgramData%\CloakDLP\agent_credentials.json`. It also picks up the console's
auto-provisioned "Credit Card Entry" policy automatically via `default_credit_card_policy_id`
in that same response — nothing to copy-paste. This is what the MSI-installed service does.

**Manual / advanced**: to point specific data types at specific policies yourself (useful if
you've created additional policies beyond the default), fill in `appsettings.json`:

```json
{
  "ConsoleUrl": "http://127.0.0.1:8123",
  "AgentId": "...",
  "ApiKey": "...",
  "ProxyPort": 8888,
  "PolicyIdsByDataType": {
    "credit_card": "...",
    "ssn": "...",
    "api_key": "...",
    "private_key": "..."
  },
  "EdmDatasets": [
    { "DatasetId": "...", "PolicyId": "..." }
  ],
  "FingerprintDatasets": [
    { "DatasetId": "...", "PolicyId": "..." }
  ],
  "FingerprintThreshold": 40
}
```

`AgentId`/`ApiKey` here can come from a manual registration (console Agents page → Register
agent) if you want a specific hostname/identity rather than self-registration's default. A data
type with no policy id configured is simply skipped (logged, not reported). Each EDM
dataset binding fetches that dataset's salt + hash set from the console once at startup and
checks locally extracted candidates against it — see ARCHITECTURE.md for how the salted
hashing keeps both the reference data and the scanned content private.

Each fingerprint dataset binding fetches that document's CTPH fuzzy hash once at startup;
matches (file scans and network-proxy request bodies) are reported when similarity to a
reference document is at or above `FingerprintThreshold` (0-100).

```bash
dotnet run -- hash <file-path>   # print a file's CTPH fingerprint without touching the console
```

## Running

```bash
dotnet run -- scan <file-path>   # one-shot file-channel scan
dotnet run -- monitor            # watch clipboard, print, and network (Ctrl+C to stop)
dotnet run -- service            # same channels, hosted as a Windows Service (what the MSI installs)
```

For desktop notifications when a match is detected, see `../CloakDlp.Tray/` — a separate
per-user tray app (Windows Services can't show UI directly; see its own comments for why) that
watches the console's live incident feed.

`monitor` starts three channels at once:
- **Clipboard** — reacts to `WM_CLIPBOARDUPDATE`, no polling.
- **Print** — watches the default printer's job queue; scans the job's document title only
  (see architecture doc for why raw spool content isn't read).
- **Network** — an HTTP forward proxy on `ProxyPort`. Point a browser's proxy settings at
  `127.0.0.1:<ProxyPort>`. HTTP only — HTTPS/`CONNECT` is rejected, not silently ignored.
