# Architecture: Approval State Machine & Location Personalization

This document explains, at the database level, the two subsystems that are new or most significantly reworked relative to `psa` (the MSP ticketing app this project was forked from — see `plan.md` for the full fork rationale and model-by-model mapping). Both started schema-only; the Approval State Machine's UI and orchestration are now built (see section A's "Orchestration" for how notifications/reminders/escalation actually work).

## A. Multi-Stage Approval State Machine

### Template vs. instance

Two layers, deliberately kept separate:

- **Definition** (`ApprovalWorkflowTemplate` → `ApprovalStageTemplate`): an admin-authored, reusable chain — e.g. "Purchase > $10,000" with three ordered stages (Direct Manager → Department VP → Finance Manager). Each stage template declares *how* to find its approver(s) via `approverSourceType`: a specific `User`, a `Role`, a `PermissionGroup`, the requester's manager chain (`REQUESTER_MANAGER` + `managerLevelsUp`), their `Department.manager`, or the `LOCATION_ADMIN` for their `Location`.
- **Instance** (`ApprovalRequest` → `ApprovalStageInstance` → `StageApprover`): created when an employee submits a request. Creating it **materializes** a copy of every stage's structure up front — `order`, `name`, `mode`, `requiredApprovals` are copied onto an `ApprovalStageInstance` row for *every* stage — but each stage's approver source is only *resolved to concrete `User` rows* (written as `StageApprover`) lazily, the moment that specific stage transitions to `IN_PROGRESS`, not all at once at creation. This is what makes delegation (below) correct: a delegate registered after submission but before a later stage is reached is still honored, since that stage's `StageApprover` rows don't exist until it's actually entered.

This split matters because workflow templates are living documents (finance changes the approval threshold, HR adds a stage) but a request already halfway through its chain must not have its remaining stages silently rewritten. Once materialized, an instance is self-contained and immune to later template edits.

### Dynamic approver resolution + delegation

Resolving `REQUESTER_MANAGER` walks `User.managerId` up `managerLevelsUp` hops from the requester; `DEPARTMENT_MANAGER` reads the requester's `Department.managerId`; `LOCATION_ADMIN` looks up a `LOCATION_ADMIN`-role user scoped to the requester's `Location` via `LocationMember`; `PERMISSION_GROUP`/`ROLE` fan out to every matching `User`. At the same moment, each resolved approver is checked against `ApprovalDelegate` (`delegatorId`, active date range, optional `workflowTemplateId` scope) — if they have an active delegate, `StageApprover.delegatedToId` is set so decisions are expected from the delegate instead, while `userId` still records the approver of record for audit purposes.

### Progression

`ApprovalRequest.currentStageOrder` is the single pointer into the chain. A stage instance is "done" when its `StageApprover` rows satisfy its `mode`:

- `ALL` — every row must be `APPROVED`.
- `ANY` — the first decision (in either direction) settles the stage.
- `N_OF_M` — `requiredApprovals` `APPROVED` decisions, regardless of headcount on the stage.

Reaching that condition either advances `currentStageOrder` to the next `ApprovalStageInstance` (notifying its approvers) or, on a qualifying `REJECTED`, immediately sets `ApprovalRequest.status = REJECTED` — approval chains short-circuit rather than re-routing on rejection, matching the spec's "chain" framing rather than building a more general rules engine.

"Who still needs to act" is always `SELECT * FROM "StageApprover" WHERE "decision" IS NULL` for the current stage instance — no separate status flag to keep in sync.

### One-click / magic-link approval

Every `StageApprover` carries its own `magicLinkToken` (an unguessable `cuid`, generated at materialization time). An emailed approval link embeds this token; visiting it resolves directly to that row and is only actionable while `decision IS NULL` — the same "unguessable id *is* the auth" trust model `psa` already uses for its CSAT survey links (`/csat/[id]`), reused here instead of inventing a second auth mechanism.

### Audit trail

`StageApprover` is **current state** (mutable — one row per approver per stage, decision/comment/decidedAt overwritten once). `ApprovalAuditLog` is **history** (append-only — one row per event: `STAGE_APPROVED`, `REQUEST_REJECTED`, `DELEGATED`, `ESCALATED`, `REMINDER_SENT`, each with actor, timestamp, and comment). This mirrors `psa`'s `TicketAuditLog` pattern exactly, and keeping state and history in two tables rather than folding them into one avoids ever needing to mutate a row that's supposed to be a permanent record.

### Orchestration

The schema is deliberately orchestration-agnostic — all approval state lives in Postgres, so nothing here depends on a specific job runner. An earlier pass of this doc sketched an Inngest-driven design, but this repo has no Inngest (or any other job runner) anywhere in it — the only scheduled-job mechanism that actually exists is the bearer-authenticated `app/api/cron/*` route pattern (`lib/cron-auth.ts`), built for a self-hosted docker-compose/VM deploy rather than Vercel specifically. Orchestration was built on that existing pattern instead of introducing a new dependency:

- **Event-driven notifications fire synchronously**, not via a queued event. `lib/approval-notifications.ts`'s `syncApprovalNotifications(requestId)` is called directly from every Server Action that mutates approval state (`submitRequest`, `decide`, and the magic-link `decideViaToken`) right after the mutation commits — it notifies any `StageApprover` with `notifiedAt IS NULL` on the now-current stage (covers both "stage 1 just materialized" and "stage N+1 just advanced into"), and separately notifies the requester once the request reaches `APPROVED`/`REJECTED`.
- **The scheduled sweep** (`app/api/cron/approval-sweep/route.ts`, `runApprovalReminderSweep()`) handles what a synchronous call can't: reminders for `StageApprover` rows notified more than 24h ago and still `decision IS NULL`, and escalation for `ApprovalStageInstance`s `IN_PROGRESS` for more than 72h — writing an `ESCALATED` audit row (deduped by checking for one already written since `startedAt`) and notifying the requester plus `SUPER_ADMIN`/`DEPARTMENT_MANAGER` overseers. It does **not** add a fallback approver or otherwise mutate stage state — that would shift `N_OF_M` math (`total - rejections < required`) under a running stage; escalation here is notify-and-audit only.
- **One-click magic-link approval** (`app/approve/[token]/`) reuses `recordDecision` directly — same race guard, same "stage no longer active" check as the authenticated portal path — with the actor recorded as whoever the token was actually issued to (the delegate if one was substituted, else the original approver).

## B. Location-Aware Personalization Engine

### Hierarchy

`Location.parentId` is a self-relation, the same shape `psa` used for MSP client parent/child companies — reused here for the physical org tree instead. `LocationType` (`BRANCH | REGIONAL_HUB | CORPORATE_HQ`) makes each node's tier explicit rather than inferring it from tree depth, so a query never has to walk to the root to know what kind of node it's looking at.

### Resolution: the same shape as psa's SLA resolver

Rendering an employee's dashboard needs an answer to "what banner/widgets/floor-plan should this person see?" The resolution order is:

1. `User.locationId → LocationPageConfig` for that exact `Location`.
2. If that row is missing, or has null fields, walk `Location.parentId` up one level (Branch → Regional Hub) and check its `LocationPageConfig`.
3. Continue up to `CORPORATE_HQ`'s config.
4. Fall back to the global defaults on the `Setting` singleton (`globalWidgetDefaults`).

This is structurally identical to `psa`'s `resolveSlaPolicy()` / `loadSlaPolicyResolver()` (`lib/sla.ts`): check a specific-scope override row, then fall back to a broader-scope default, with a batched variant so rendering a dashboard with several widgets doesn't issue one query per widget per employee (N+1). The plan for `lib/locations.ts` is to port that batching shape directly rather than re-derive it.

`LocationPageConfig` deliberately holds only presentation config (`bannerImageUrl`, `bannerText`, `floorPlanUrl`, `widgetConfig` JSON) — not announcement or emergency-alert *content*. That content belongs to the News/CMS module (Phase 4), which will target locations using this same parent-chain resolver; modeling it here now would create two places to look for the same kind of data once News ships.

### Contextual scoping

`LocationMember` (staff scoped to a location's Facilities/HR queues) and `BoardMember` (staff scoped to specific service boards) are independent, composable axes — ported directly from `psa`'s `ClientMember`+`BoardMember`. An employee automatically sees their home location's local queues plus every company-wide board (e.g. IT Helpdesk) they're a member of, with the same "zero memberships configured on a dimension = unrestricted on that dimension" escape hatch `psa` uses, so an empty `LocationMember` table doesn't silently produce empty ticket lists for everyone.

### What this does *not* cover yet

News/announcement targeting and the Corporate Calendar (Phase 4) aren't modeled in this pass — they're out of scope for the Phase 1 schema this document describes — but both are expected to key off `Location`/`Department` the same way `Board`/`Ticket` do now, and to reuse this same fallback-chain resolver for "what's relevant to me" queries.
