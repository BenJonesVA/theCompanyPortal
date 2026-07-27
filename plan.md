# Enterprise Employee & Operational Portal — Roadmap

## Guiding principle

This is a **company portal**, not a ticketing system that happens to have other features bolted on. Ticketing (boards, tickets, SLA, KB, assets, dispatch) was ported wholesale from `psa` because it's solid, generic, reusable infrastructure — but it is not the product identity. The product identity is: employees land somewhere that feels like *their company's home page* — local news, their location, upcoming events, quick links — with ticketing as one tool available from there, not the center of gravity. Every phase below is sequenced with that in mind: portal-identity modules (location personalization, news, calendar) come before further ticketing investment or the (already fully-designed) approval engine's UI.

Ticketing is considered **feature-complete for now** — maintained as-is, no dedicated phases scheduled — unless a real gap surfaces while building something else.

See `ARCHITECTURE.md` for the durable design of the Approval State Machine and the Location Personalization resolver — this file is the sequencing plan, not a re-explanation of that design.

## Phase 1 — Foundation ✅ done

Forked `psa`, replaced `prisma/schema.prisma` with the Phase 1 domain (Users/org hierarchy, Locations, Departments, LocationPageConfig, Tickets, the Approval workflow engine schema), validated with a real migration, then brought `app/`/`lib/`/`components/`/`prisma/seed.ts` back into sync with it (renames, MSP-billing removal, single-actor-type auth). Verified end-to-end: real login flow, seeded data, every major route rendering. Full design rationale in `ARCHITECTURE.md`.

## Phase 2 — File storage abstraction: local disk + S3 ✅ done

`lib/storage.ts` today is hardcoded to local disk (`saveAttachmentFile`/`readAttachmentFile`/`deleteAttachmentFile`/`saveLogoFile`/`readLogoFile`, all keyed by cuid, backing ticket `Attachment`s and the branding logo) — its own comment already flags this as "your call over S3/R2 for this deployment." Add an S3-compatible backend as a second driver, selected by env var (e.g. `STORAGE_DRIVER=local|s3`, plus `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/optional `S3_ENDPOINT` for R2/MinIO compatibility), behind the *same* function signatures so every existing call site (ticket attachments, branding logo) works unmodified regardless of driver. Keep the existing proxy-read pattern (`app/api/attachments/[id]/route.ts` streams bytes through the app rather than redirecting to a public URL) so the internal-only/permission gating already enforced there keeps working identically on S3 — don't switch to presigned-URL redirects unless a real need for that shows up later.

**Done when:** `STORAGE_DRIVER=local` (default) behaves exactly as today, and switching to `STORAGE_DRIVER=s3` against a real bucket (or local MinIO for dev testing) round-trips an upload/download/delete through the identical code paths with no call-site changes.

## Phase 3 — Location Page Config admin UI + resolver ✅ done

`LocationPageConfig` and the `Location` parent-chain hierarchy exist in the schema with zero UI today. Build:
- Admin CRUD for `LocationPageConfig` (banner image/text, floor plan link, widget-config JSON) scoped per `Location` — banner image upload goes through Phase 2's storage abstraction.
- `lib/locations.ts`: the fallback-chain resolver (`Location` → parent → ... → `CORPORATE_HQ` → `Setting.globalWidgetDefaults`), written as a batched resolver mirroring `lib/sla.ts`'s `loadSlaPolicyResolver()` shape (per `ARCHITECTURE.md` section B) so rendering a dashboard with several widgets doesn't N+1.

**Done when:** an admin can set a Branch's banner/widgets, an employee at that Branch resolves to it, and an employee at a Branch with no config resolves up to its Regional Hub/Corporate HQ/global default correctly.

## Phase 4 — Portal-first dashboard redesign ✅ done

Redesign `app/portal/page.tsx` (the `EMPLOYEE` home) to foreground: the resolved location banner (Phase 3), a "Company News" card in an empty state (until Phase 5/6 lands), an "Upcoming Events" card in an empty state (until Phase 7/8 lands), and quick links — with the existing "My open tickets" list demoted to a smaller card rather than the dominant content. Reorder `components/nav-shell.tsx`'s employee nav accordingly.

*Assumption carried in from planning:* this phase only touches `/portal` — `/` (the elevated-role console) keeps its ticket-ops-stats layout as-is. Flag if that's wrong before this phase starts.

**Done when:** logging in as an `EMPLOYEE` shows a portal-shaped home with real location content and clearly-labeled placeholders for news/events, not a ticket list first.

## Phase 5 — News/Communications: schema + admin CMS ✅ done

New models: a `NewsPost` (title, rich body, author, published/draft state, publish date) with audience targeting (by `Department`, `Location`, `Role` — reuse the same targeting shape `Board`/`Ticket` already use, not a new pattern). Admin authoring UI: list/create/edit/publish, WYSIWYG or markdown editor (`components/ui/markdown-editor.tsx` already exists from KB articles — reuse it rather than adding a new rich-text dependency unless it can't support what's needed). Any post image goes through Phase 2's storage abstraction.

**Done when:** an admin can author and target a news post, and it's queryable by "what's visible to this user" (department/location/role match).

## Phase 6 — News feed on the dashboard ✅ done

Wire Phase 5's targeted news query into Phase 4's "Company News" placeholder on `/portal` (and optionally a smaller feed on `/`). Replaces the empty state with real, permission/targeting-filtered content.

**Done when:** an employee's portal home shows news actually targeted to their department/location/role, and content targeted elsewhere doesn't leak through.

## Phase 7 — Calendar/Events: schema + admin UI ✅ done

New models: `CalendarEvent` (title, description, start/end, location/department/global scope, category — holiday/dept event/office event/maintenance window) and `EventRsvp` (per-user attendance). Admin authoring UI mirroring Phase 5's pattern. iCal export deferred to this phase's tail end only if time allows — otherwise its own follow-up.

**Done when:** an admin can create a scoped event and an employee can RSVP to it.

## Phase 8 — Calendar on the dashboard + aggregated views ✅ done

Wire upcoming/targeted events into Phase 4's "Upcoming Events" placeholder, plus a full aggregated calendar view (filterable: global/dept/location/maintenance) reusing Phase 3's resolver logic for scope-fallback the same way news does.

**Done when:** the portal home shows real upcoming events for that employee, and a full calendar page can filter across all scopes.

## Phase 9 — Approval Workflow Engine: usable via web UI

The schema (`ApprovalWorkflowTemplate`/`ApprovalStageTemplate`/`ApprovalRequest`/`ApprovalStageInstance`/`StageApprover`/`ApprovalAuditLog`/`ApprovalDelegate`) is fully designed already (`ARCHITECTURE.md` section A) — build the admin template builder, the request-submission form, and the approve/reject UI (including delegate management). **No automated notifications/reminders/escalation yet** — an approver finds their pending approvals by visiting the app, decisions are recorded, stages advance, audit logs write correctly. This phase proves the state machine works end-to-end through the UI alone.

**Done when:** a multi-stage request can be submitted, routed through manager-chain/role/permission-group resolution, approved/rejected stage-by-stage, and shows a correct audit trail — entirely via clicking through the web app.

## Phase 10 — Approval orchestration (Inngest)

Layer in the automation Phase 9 deliberately deferred: magic-link one-click email approval (`StageApprover.magicLinkToken`), notification on stage advance, and scheduled reminder/escalation for stale approvals — as Inngest functions/events, per the design in `ARCHITECTURE.md` section A ("Orchestration"). This is an additive automation layer on top of Phase 9's already-correct state machine, not a redesign of it.

**Done when:** an approver gets a real email with a working one-click link, and a stale pending approval past its age threshold triggers a reminder/escalation automatically.

## Phase 11 — Analytics, Delegation polish, SSO prep

Lowest priority, last: SLA/ticket reporting depth, cross-cutting reporting on approvals/news/events engagement, delegate-mode polish beyond Phase 10's baseline, and SSO integration hooks (SAML/Azure AD/Okta) on top of the existing NextAuth Credentials setup — matches the original spec's Phase 5.

---

*Each phase above is scoped to be startable fresh: re-explore/re-plan the specific phase's implementation details when work on it begins, rather than over-specifying every phase's technical design today.*
