# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status — read this first

`tb` is an **Enterprise Employee & Operational Portal** (single-company, multi-location internal portal: ticketing + org hierarchy + multi-stage approvals + location-aware dashboards), forked from `D:\Projects\psa` (an MSP ticketing/PSA app) to reuse its generic ticketing/RBAC/SLA/automation machinery instead of rebuilding it.

**The fork is only half-done.** `prisma/schema.prisma` has already been rewritten for this project (see below), but `app/`, `lib/`, and `components/` are still the literal files copied from `psa` and reference model names that no longer exist:

- `Client` / `Contact` / `ClientMember` → now `Location` / merged into `User` / `LocationMember`
- `OrgMode` / `Setting.orgMode` / `orgLabels` relabeling → removed entirely (this app *is* the enterprise mode now, permanently)
- `Contract` / `ContractRate` / `Invoice` / `InvoiceLineItem` / `Expense` / `ApiKey` → removed
- `UserRole` (`ADMIN`/`MANAGER`/`TECHNICIAN`) → now `Role` (`SUPER_ADMIN`/`LOCATION_ADMIN`/`DEPARTMENT_MANAGER`/`EMPLOYEE`)
- `TicketStatus.WAITING_ON_CLIENT` → `WAITING_ON_REQUESTER`; `Ticket.clientId`/`contactId` → `locationId`/`requesterId`

**Consequence: `npm run build` and `npx tsc` will not currently pass.** This is expected drift, not a regression you introduced — do not "fix" it piecemeal by reverting the schema. The next real task on this project is the rename/strip pass across `app/`/`lib/`/`components/` (dropping `app/billing`, `app/invoices`, collapsing `auth.ts`'s dual staff/portal-contact session model into one, etc.) to bring the application code back in sync with the schema. Until that happens, treat `lib/*.ts` and `app/**` as **reference implementations of patterns to port**, not working code.

See `plan.md` (fork rationale, full model-by-model mapping of what was kept/renamed/dropped) and `ARCHITECTURE.md` (how the Multi-Stage Approval State Machine and the Location-Aware Personalization Engine work at the DB level) for the design record. The approval engine and location personalization are schema-only right now — no UI or orchestration (Inngest) wired up yet.

## Commands

```bash
npm install                          # install deps
npm run dev                          # dev server w/ hot reload, http://localhost:3131
npm run build                        # production build (currently fails — see drift note above)
npm run lint                         # next lint

npm run prisma:generate              # regenerate Prisma client after schema.prisma changes
npm run prisma:migrate               # create + apply a migration (interactive; wraps `prisma migrate dev`)
npm run prisma:studio                # Prisma Studio DB browser
npm run prisma:seed                  # tsx prisma/seed.ts (currently references removed models — needs rewriting alongside the app-code pass)
```

There is no test suite/framework configured in this repo (no Jest/Vitest, no `test` script) — don't assume one exists.

### Local database (Docker)

```bash
docker compose up -d postgres        # just Postgres, for host-based `npm run dev` + prisma CLI
docker compose up -d                 # full stack: postgres -> migrate (runs `prisma migrate deploy`) -> app
```

This project's compose files were copied from `psa` and re-namespaced so both can run side by side without port/volume collisions:

| | psa | tb |
|---|---|---|
| Postgres host port | 5432 | **5433** |
| App host port | 3131 | **3232** |
| Adminer | 8080 | **8081** |
| DB user/password/name | `psa` | `tb` |
| Compose volumes | `psa_postgres_data`, `psa_uploads_data` | `tb_postgres_data`, `tb_uploads_data` |

`docker-compose.yml` alone is what a production host runs (no ports published). `docker-compose.override.yml` is auto-loaded by `docker compose up` whenever no explicit `-f` flags are passed, and is what restores host port access + Adminer for local dev. A real deploy passes explicit `-f` flags with `docker-compose.prod.yml` instead (adds Nginx Proxy Manager in front) — see the (currently psa-branded, not yet rewritten) `README.md` for the full deploy walkthrough; the mechanics are unchanged by the fork.

`.env` (git-ignored) holds real config; `.env.example` documents every variable. `AUTH_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`/`EMAIL_FROM`, `INBOUND_EMAIL_SECRET`/`INBOUND_EMAIL_DOMAIN` are all still wired the same way as in `psa`.

## Architecture

### Data model (`prisma/schema.prisma`)

The schema is organized (with section-comment headers in the file) as: RBAC (`Permission`/`PermissionGroup`), Users & Org Hierarchy (`User` with self-relation `managerId`, `Department`), Locations (`Location` self-relation hierarchy tiered by `LocationType`, `LocationMember`, `LocationPageConfig`), Boards/ticket taxonomy, core Tickets + comments/attachments/time-logs, Assets (mini-CMDB), Dispatch/Scheduling, SLA Engine, Settings, Automation Engine, ticketing backlog models (audit log, saved filters, watchers, links), Notifications, and — the one wholly new subsystem — the **Approval Workflow Engine** (`ApprovalWorkflowTemplate`/`ApprovalStageTemplate` as reusable definitions; `ApprovalRequest`/`ApprovalStageInstance`/`StageApprover` as materialized per-request instances; `ApprovalAuditLog` as append-only history; `ApprovalDelegate` for out-of-office delegation). Read `ARCHITECTURE.md` before touching any of the approval or location-personalization models — the design has specific reasoning behind the template/instance split and the resolver fallback chain that isn't obvious from the field list alone.

### RBAC pattern (ported from psa, generic — not MSP-specific)

`Permission` is **additive** on top of `Role`: it grants a capability a role wouldn't otherwise have, never revokes one from `SUPER_ADMIN`/`DEPARTMENT_MANAGER`. Enforcement is expected to live in a `lib/rbac.ts`-style helper (`requireRole()`, `requirePermission()`) called at the top of every Server Component/Server Action — middleware only does coarse routing, not fine-grained checks. `BoardMember` + `LocationMember` are two independent, composable scoping axes (which board/queue an employee can work, which location's tickets they can see) — "zero memberships configured on a dimension" must mean unrestricted on that dimension, not an empty result set (this is how `psa` avoided a footgun and should be preserved).

### SLA / Location-personalization resolver shape

`lib/sla.ts`'s pattern — check a specific-scope override, fall back to a global default, with a batched variant to avoid N+1 on list/dashboard views — is the template for **two** resolvers in this project: per-priority SLA targets (`LocationSlaPolicy` → `SlaPolicy`) and location dashboard personalization (`LocationPageConfig` walking `Location.parentId` up to `CORPORATE_HQ`, then `Setting.globalWidgetDefaults`). See `ARCHITECTURE.md` section B for the full resolution order.

### Approval state machine shape

Template (editable) vs. instance (materialized, frozen at creation) is the core design decision — never let template edits retroactively affect an in-flight `ApprovalRequest`. `StageApprover.decision IS NULL` is the single source of truth for "who still needs to act." One-click email approval is meant to reuse the same "unguessable id is the auth" pattern `psa` uses for CSAT survey links (`/csat/[id]`), via `StageApprover.magicLinkToken`. Full detail in `ARCHITECTURE.md` section A.

### Auth (pre-rename state, in `auth.ts`/`auth.config.ts`/`middleware.ts`)

Still `psa`'s NextAuth v5 (JWT sessions) setup with a dual staff/portal-contact actor-type session shape (`session.user.actorType: "STAFF"|"CLIENT"`) — this needs collapsing to a single actor type as part of the pending rename pass, since every person in this app is now an internal employee (no external portal-contact concept). `auth.config.ts` stays Edge-safe (no Prisma/bcrypt) for `middleware.ts`; `auth.ts` is Node-only and does the real credential verification.
