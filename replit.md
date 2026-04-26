# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Telegram Bot

Telegram bot ("Drip Reset System") runs inside `@workspace/api-server` via long polling.

- Library: `grammy` (externalized in esbuild because it loads platform-specific modules dynamically).
- Source: `artifacts/api-server/src/bot/`
  - `index.ts` — bot bootstrap, command + message handlers, auto-delete scheduling.
  - `messages.ts` — formatted message templates (start/help/status/admin broadcast).
  - `storage.ts` — in-memory user records, tier limits, daily reset, Bangladesh timezone helpers.
- Required secrets: `TELEGRAM_BOT_TOKEN`, `ADMIN_CHAT_ID`.
- Behavior:
  - `/start` shows the welcome panel with the user's Telegram ID.
  - `/status` shows account info, tier, daily usage, progress bar, and Bangladesh time.
  - `/help` shows the user guide.
  - Any non-command text message is forwarded to `ADMIN_CHAT_ID` and the user's daily counter is incremented.
  - Tiers: standard (2/day), basic (10/day), premium (unlimited). Default tier is `standard`. Counters reset at midnight Bangladesh time (Asia/Dhaka).
  - Bot replies are auto-deleted after 24 hours (best-effort via `setTimeout`).
  - Admin replies via inline keyboard buttons (Limit / Not Detected / Success) attached to each forwarded user message; only the configured `ADMIN_CHAT_ID` may use them. The Success button increments the user's daily usage and reports the round-trip speed.

User records (id, tier, daily usage, last reset date, profile) persist in PostgreSQL via the `bot_users` table in `@workspace/db`. Pending admin requests are kept in memory with a 24-hour TTL — pending requests are lost on server restart, but user data and counters survive restarts.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
