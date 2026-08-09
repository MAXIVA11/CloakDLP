<p align="center">
  <img src="../docs/assets/logo.png" alt="CloakDLP logo" width="120">
</p>

# CloakDLP Console Frontend

Policy & incident console UI — Next.js (App Router), Tailwind v4, shadcn/ui (Nova preset:
Geist + Lucide). Dark-mode-first, full light mode too.

See [../ARCHITECTURE.md](../ARCHITECTURE.md) for the overall design.

## Running locally

```bash
npm install
cp .env.local.example .env.local   # point NEXT_PUBLIC_API_URL at the console backend
npm run dev
```

Opens on [http://localhost:3000](http://localhost:3000). Requires the `console-backend` API
running (see its README) — sign in with a user created via `POST /api/auth/register`.

## Structure

- `src/app/(console)/` — authenticated app shell: Overview, Policies, Incidents, Fingerprints,
  Agents, Reports
- `src/app/login/` — sign-in page
- `src/components/` — shared UI: sidebar, badges, metric cards, the policy editor's
  simulate-before-enforce flow
- `src/lib/` — API client, auth context, incident websocket hook
