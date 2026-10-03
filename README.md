# Root Cause Analysis — Passary

Batch-wise **composition deviation tracking** for production orders.

An order of e.g. 100 MT is made in many batches. This app compares every batch's actual raw-material mix with the approved
composition (`CN-###`) and with the previous batch, shows exactly what changed, auto-detects the likely root cause, and lets the
team record the confirmed root cause + corrective / preventive action.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 — log in with your Production-FMS user
```

`.env` needs `VITE_PRODUCTION_SUPABASE_URL/_ANON_KEY`, `VITE_ORDER_SUPABASE_URL/_ANON_KEY`,
`VITE_PURCHASE_SUPABASE_URL/_ANON_KEY`.

One-time: run [supabase/migrations/001_rca_reviews.sql](supabase/migrations/001_rca_reviews.sql) in the Production-FMS SQL
editor to enable saving root causes (the app is read-only until then).

## Docs (read in this order)

| File | What |
|---|---|
| [PRD.md](PRD.md) | Problem, users, scope, definitions (mix shift, pp, standard…) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Data flow, linking, formulas, findings, folder map |
| [RULES.md](RULES.md) | Must / must-not (read-only upstream, formulas only in `rca.js`, …) |
| [DESIGN.md](DESIGN.md) | Tokens, status colours, components, layout |
| [TASKS.md](TASKS.md) | Done / to-do / backlog + verify recipe |
| [MEMORY.md](MEMORY.md) | Data quirks and decisions |
| [Flow/](Flow/) | Upstream Order and Production-FMS flows |

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `preview` | Vite |
| `npm run lint` | oxlint |
| `npm run check` | Run the RCA engine against live data in Node (read-only) |
