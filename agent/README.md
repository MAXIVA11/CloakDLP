# CloakDLP Agent

Windows endpoint agent (C#/.NET, usermode). Detects credit cards (regex + Luhn), SSNs, API
keys/tokens, and PEM private keys across file, clipboard, print, and network channels, and
reports matches to the console API. See [../ARCHITECTURE.md](../ARCHITECTURE.md) for the
per-channel hook mechanisms and their scope limitations.

## Setup

1. Register the agent from the console (Agents page → Register agent) to get an `AgentId` and
   `ApiKey`.
2. Create a policy per data type you want detected (Policies page), and copy each policy's id.
3. Fill in `appsettings.json`:

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
  }
}
```

A data type with no policy id configured is simply skipped (logged, not reported).

## Running

```bash
dotnet run -- scan <file-path>   # one-shot file-channel scan
dotnet run -- monitor            # watch clipboard, print, and network (Ctrl+C to stop)
```

`monitor` starts three channels at once:
- **Clipboard** — reacts to `WM_CLIPBOARDUPDATE`, no polling.
- **Print** — watches the default printer's job queue; scans the job's document title only
  (see architecture doc for why raw spool content isn't read).
- **Network** — an HTTP forward proxy on `ProxyPort`. Point a browser's proxy settings at
  `127.0.0.1:<ProxyPort>`. HTTP only — HTTPS/`CONNECT` is rejected, not silently ignored.
