# DocChain Project Context for LLMs

Use this file as shared context when asking an LLM to help with DocChain. It is intentionally written as a project briefing: paste it into the LLM's system, developer, or long-context prompt before asking detailed questions.

## Project Identity

DocChain is a modular monolith for a closed university correspondence and administrative workflow system. It manages university structure, users, position assignments, documents, routing rules, signature rules, official serial numbers, transmissions, archiving, notifications, comments, OCR text, verification tokens, API clients, and audit logs.

The product model is authority-driven. A person can have one or more active assignments. Each assignment links a person to a unit and a position. Most document permissions and workflow actions depend on the active assignment, the current holder unit, role membership, position authority, and configured routing/signature rules.

Core workflow idea:

1. Admin configures organizations, unit types, units, positions, people, users, assignments, document types, routing rules, signature rules, serial rules, visibility rules, retention policies, and access rules.
2. A logged-in user selects an active assignment.
3. The user creates or works on documents owned by units and typed by document type, confidentiality, and priority.
4. Workflow actions move a document through statuses and holder units according to active routing rules.
5. Signature slots are generated from active signature rules. Users sign slots with a PIN-backed signature profile.
6. Final required signatures can finalize the document and trigger official serial assignment.
7. Documents can be transmitted internally or externally, rendered with signature visibility policies, archived, commented on, searched, and audited.

## Stack

Backend:

- Express 5 with TypeScript.
- MySQL via `mysql2/promise`, designed for local XAMPP MySQL on `127.0.0.1:3306`.
- Session authentication with `express-session` and `express-mysql-session`.
- Password and PIN hashing with `argon2`.
- Validation with `zod`.
- Security middleware: `helmet`, CORS with credentials, session cookies, custom CSRF guard.
- Logging with `pino` and `pino-http`.

Frontend:

- Vite React app with TypeScript.
- React 19, React Router 7.
- Tailwind CSS v4 through `@tailwindcss/vite`.
- Custom admin UI components in `client/src/components/ui` and `client/src/components/admin`.
- Client-side i18n for English, Dari (`fa-AF`), and Pashto (`ps-AF`), including RTL direction support.

Project shape:

- Single root `package.json`.
- Server source: `server/src`.
- Client source: `client/src`.
- SQL migrations: `server/migrations/sql`.
- Database scripts: `server/scripts`.
- Built output: `dist/server` and `client/dist`. Treat build outputs as generated.
- Ignore `node_modules`, `dist`, and `client/dist` unless debugging generated artifacts.

## Local Commands

Important npm scripts:

```bash
npm run dev
npm run dev:server
npm run dev:client
npm run build
npm run build:server
npm run build:client
npm run typecheck
npm run test
npm run db:create
npm run db:migrate
npm run db:rollback
npm run db:seed
npm run db:reset
```

Local startup path:

1. Copy `.env.example` to `.env` if overrides are needed.
2. Ensure MySQL is running on port `3306`.
3. Run `npm run db:create`.
4. Run `npm run db:migrate`.
5. Run `npm run db:seed`.
6. Run `npm run dev`.

Default app URLs:

- API: `http://localhost:4000`.
- Client: `http://localhost:5173`.
- Vite proxies `/api` to `http://localhost:4000`.

Default seeded admin values come from environment variables:

- `SEED_ADMIN_EMAIL`, default `admin@docchain.local`.
- `SEED_ADMIN_USERNAME`, default `admin`.
- `SEED_ADMIN_PASSWORD`, default `Admin@12345`.

## Environment

Important variables from `.env.example` and `server/src/config/env.ts`:

```bash
NODE_ENV=development
PORT=4000
APP_ORIGIN=http://localhost:5173

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=docchain_express

SESSION_SECRET=change-this-local-session-secret
SESSION_COOKIE_NAME=docchain.sid

SIGNATURE_STORAGE_DIR=storage/signatures
SIGNATURE_ENCRYPTION_KEY=change-this-local-signature-encryption-key
```

`server/src/config/env.ts` validates env with Zod and provides defaults. `DB_NAME` defaults to `docchain_express`.

## Backend Architecture

Main files:

- `server/src/server.ts`: starts the Express app and handles graceful shutdown.
- `server/src/app.ts`: creates middleware stack, session store, routes, health endpoint, static client serving in production, and error handling.
- `server/src/db/mysql.ts`: shared MySQL pool.
- `server/src/config/env.ts`: environment validation.
- `server/src/middleware/auth.ts`: `requireAuth`, role loading, `requireAnyRole`.
- `server/src/middleware/csrf.ts`: session CSRF token for unsafe methods. `/api/auth/login` is exempt.
- `server/src/shared/document-access.ts`: active assignment lookup, admin role checks, document access checks.
- `server/src/shared/route-utils.ts`: shared Zod helpers and allowlisted generic list route helper.
- `server/src/shared/audit.ts`: audit writing helper.
- `server/src/shared/errors.ts` and `server/src/middleware/error-handler.ts`: API error pattern.

All JSON success responses use the shape:

```json
{ "data": ... }
```

Errors use an `error` object with code/message/details where available.

## Backend Modules and Routes

Routes are mounted from `server/src/app.ts`.

Authentication and assignment:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/assignments/my`
- `POST /api/assignments/select-active`

Documents and workflow:

- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/:documentId`
- `PATCH /api/documents/:documentId`
- `GET /api/documents/:documentId/workflow-actions`
- `POST /api/documents/:documentId/workflow-actions`
- `POST /api/documents/:documentId/events`
- `POST /api/documents/:documentId/relations`
- `POST /api/documents/:documentId/attachments`
- `POST /api/documents/:documentId/tasks`
- `PATCH /api/documents/:documentId/tasks/:taskId/complete`

Signatures and serials:

- `GET /api/signatures/profile`
- `POST /api/signatures/profile`
- `GET /api/signatures/documents/:documentId/slots`
- `POST /api/signatures/documents/:documentId/slots/generate`
- `POST /api/signatures/documents/:documentId/slots/:slotId/sign`
- `GET /api/admin/signature-rules`
- `POST /api/admin/signature-rules`
- `PATCH /api/admin/signature-rules/:signatureRuleId/status`
- `GET /api/admin/serial-rules`
- `POST /api/admin/serial-rules`
- `PATCH /api/admin/serial-rules/:serialRuleId/status`

Admin master data:

- `GET /api/admin/audit-logs`
- `GET/POST /api/admin/persons`
- `GET/POST /api/admin/users`
- `GET /api/admin/roles`
- `GET/POST/PATCH /api/admin/organizations`
- `GET/POST/PATCH /api/admin/unit-types`
- `GET/POST/PATCH /api/admin/units`
- `GET/POST/PATCH /api/admin/positions`
- `GET/POST/PATCH /api/admin/assignments`
- `GET/POST/PATCH /api/admin/document-types`
- `GET/POST/PATCH /api/admin/confidentiality-levels`
- `GET/POST/PATCH /api/admin/priority-levels`
- `GET/POST/PATCH /api/admin/routing-rules`
- `PATCH /api/admin/routing-rules/:routingRuleId/status`

Phase 4/admin extensions:

- `GET/POST /api/admin/external-organizations`
- `GET/POST /api/admin/external-recipients`
- `GET/POST /api/admin/visibility-rules`
- `GET/POST /api/admin/retention-policies`
- `GET/POST /api/admin/confidentiality-access-rules`
- `GET/POST /api/admin/delegations`
- `GET/POST /api/admin/api-clients`

Collaboration, search, notifications, verification, OCR, transmissions:

- `GET/POST /api/documents/:documentId/comments`
- `GET/POST /api/saved-searches`
- `GET /api/notifications`
- `PATCH /api/notifications/:notificationId/read`
- `GET/POST /api/notification-preferences`
- `POST /api/documents/:documentId/verification-token`
- `GET/POST /api/documents/:documentId/ocr-text`
- `GET/POST /api/documents/:documentId/transmissions`
- `PATCH /api/transmission-recipients/:recipientId/status`
- `POST /api/documents/:documentId/renders`
- `POST /api/documents/:documentId/archive`

## Auth and Security Model

The app uses cookie-backed sessions. On login:

- Credentials are checked by email or username.
- Argon2 verifies password hashes.
- Failed logins increment `failed_login_attempts`; after 5 failures the account is locked for 15 minutes.
- Session is regenerated.
- `request.session.userId` is set.
- A CSRF token is created and returned to the client.
- The primary active assignment is selected automatically when available.
- `auth.login` is written to audit logs.

Client requests use `credentials: "include"`. Unsafe methods include `x-csrf-token` after the session has one. The token is stored in memory by `client/src/lib/api.ts` and set by `authApi`.

Important roles:

- `system_admin`: unrestricted platform administrator except unreadable user PINs.
- `admin_staff`: can manage administrative master data.
- `user`: authenticated platform user.

Admin checks generally accept `system_admin` and `admin_staff`.

Document access:

- Admin roles bypass regular document access limits.
- Non-admin access is allowed when the active assignment/person is related to the document creator, origin unit, owner unit, or current holder unit.
- Workflow actions require an active assignment.
- Non-admin workflow actions require the actor's unit to be the document's current holder unit.

## Database Migrations

Migrations are plain SQL files in `server/migrations/sql`.

Phase 1 foundation:

- `persons`, `users`, activation/reset tokens, `sessions`.
- `roles`, `user_roles`.
- `organizations`, `unit_types`, `units`, `positions`, `assignments`, `assignment_status_history`.
- `document_types`, `confidentiality_levels`, `priority_levels`.
- `audit_logs`, `access_logs`, `admin_override_logs`.

Phase 2 documents and workflow:

- `file_assets`.
- `documents`, `document_versions`, `document_relations`, `document_attachments`.
- `routing_rules`, `workflow_rule_conditions`.
- `document_workflow_events`, `document_tasks`.

Phase 3 signatures and serials:

- `signature_profiles`, `signature_assets`, `pin_verification_events`.
- `signature_rules`, `signature_slots`, `signature_events`.
- `serial_rules`, `serial_sequences`, `serial_assignments`, `serial_repair_events`.

Phase 4 transmissions, archive, and extensions:

- `external_organizations`, `external_recipients`.
- `visibility_rules`, `retention_policies`, `confidentiality_access_rules`.
- `transmissions`, `transmission_recipients`.
- `document_renders`, `render_signature_visibility`.
- `archive_records`, `delegations`, `notifications`, `notification_preferences`.
- `document_comments`, `saved_searches`, `document_ocr_text`, `document_verification_tokens`, `api_clients`.

Phase 5 master-data status:

- Adds `status` to `unit_types`.

Phase 6 document templates:

- `document_templates`, `document_template_versions`, `document_template_bindings`, `document_layout_drafts`.
- Supports private user drafts, immutable submitted/approved versions, public published templates, default bindings by document type/locale/variant, and one-off document layout drafts.

Most business records use numeric auto-increment primary keys plus a public `uuid`. Soft-delete columns are common (`deleted_at`). Status strings are used heavily rather than enums.

## Seed Data

`server/scripts/seed-database.cjs` seeds the local development baseline.

Foundation seed:

- Roles: `system_admin`, `admin_staff`, `user`.
- Organization: `DOCCHAIN_UNIVERSITY`, "DocChain University".
- Unit types: `university`, `vice_chancellery`, `faculty`, `department`, `office`, `committee`.
- Root unit: `UNIVERSITY`.
- Positions: `system_admin`, `president`, `vice_chancellor`, `dean`, `department_head`, `committee_chair`, `executive_staff`, `committee_staff`, `authorized_recipient`.
- Document types include `official_letter`, `memo`, `internal_memo`, `confidential_memo`, `directive`, `inquiry`, `proposal`, `report`, `committee_report`, `meeting_resolution`, `reply`, `reply_letter`, `announcement`, `internal_note`, `review_form`, `acknowledgement_sheet`, `policy_approval_document`.
- Confidentiality: `normal`, `internal`, `confidential`, `restricted`.
- Priority: `low`, `normal`, `high`, `urgent`.
- Seeded admin person/user/assignment.

Routing seed examples:

- Department executive staff can submit official letters for review to department head.
- Department head can forward official letters to dean for signature when prior review/signature requirements pass.
- Dean can dispatch official letters externally when final signatory by rule.
- Draft dispatch is denied.
- Finalized multi-recipient dispatch can be allowed.
- Confidential memo direct external dispatch is denied.

Signature and serial seed:

- Active signature rules for official letters, committee reports, internal memos, review forms, acknowledgement sheets, and policy approval documents.
- Default serial rule: `default_yearly`, format `DOC-{YEAR}-{SEQUENCE}`, global scope, yearly reset, 6-digit sequence.

Phase 4 seed:

- Visibility policies such as `show_all`, `hide_child_signatures`, `show_parent_only`, `show_final_only`, and `custom_restricted`.
- Default archive retention policy: `default_archive_review`, review after 120 months.
- Confidentiality access rules for system admin/admin staff roles.

Template seed:

- Default published template: `Default Official A4 Letter`.
- Default active binding: all document types, all locales, `official` variant.

## Workflow Service Behavior

`server/src/modules/workflow/workflow.service.ts` contains the main workflow logic.

Default status mapping:

- `submit`, `submit_for_review` -> `submitted`
- `review` -> `under_review`
- `return_for_correction` -> `draft`
- `forward`, `refer` -> `under_action`
- `forward_for_signature` -> `pending_signatures`
- `forward_for_final_signature` -> `pending_final_signature`
- `dispatch`, `dispatch_reply`, `dispatch_multi` -> `dispatched`
- `receive` -> `received`
- `acknowledge` -> `under_action`
- `close` -> `closed`
- `archive` -> `archived`

Routing rule matching considers:

- Document type.
- Actor unit type and position.
- Target unit type and position.
- Action.
- Effective date range.
- Conditions from `workflow_rule_conditions`.
- Priority order, ascending.

Allowed values matter:

- `denied` throws forbidden.
- `emergency_only` requires admin.
- Active matching rules permit actions.

Prior requirements:

- `prior_review_required` needs a prior `review` workflow event.
- `prior_signature_required` needs at least one signature event and no pending required signature slots.

Executing a workflow action:

- Inserts `document_workflow_events`.
- Updates document status and current holder unit.
- Completes actor's open tasks on that document.
- Optionally creates target tasks.
- Writes an audit log.
- Refuses closed/archived documents.

## Frontend Architecture

Main files:

- `client/src/main.tsx`: React entry.
- `client/src/app/App.tsx`: route tree, auth guards, admin route guard, public shell.
- `client/src/app/AuthContext.tsx`: session state, roles, assignments, `isAdmin`, refresh/logout.
- `client/src/lib/api.ts`: fetch wrapper, CSRF token handling, locale header, API error class.
- `client/src/api/*`: typed API wrappers.
- `client/src/api/types.ts`: shared client-side API types.
- `client/src/i18n/*`: locale provider, keys, direction support.
- `client/src/styles/app.css`: Tailwind and global app styles.

Routes:

- `/login`: login page inside public shell.
- `/`: redirects authenticated users to `/admin/dashboard`.
- `/admin`: protected admin shell.
- `/admin/dashboard`
- `/admin/organizations`
- `/admin/units`
- `/admin/users`
- `/admin/positions`
- `/admin/assignments`
- `/admin/workflow-rules`
- `/admin/signature-rules`
- `/admin/serial-settings`
- `/admin/document-types`
- `/admin/templates`
- `/admin/audit-logs`
- `/admin/reports`
- Placeholder routes currently exist for templates and settings through `AdminPlaceholderPage`.

Admin navigation is defined in `client/src/components/admin/AdminSidebar.tsx`.

The admin UI pattern:

- Each admin page lives in `client/src/pages/admin`.
- Repeated page sections live under `client/src/components/admin/<module>`.
- Each admin module usually has `types.ts`, utility functions, stats, directory/table, inspector/detail panel, governance reminder, and queue/preview components.
- Shared UI primitives live under `client/src/components/ui`.
- API calls are made through `client/src/api` wrappers, not raw `fetch` inside pages unless there is a strong reason.

Example: `AdminAssignmentsPage.tsx` loads assignments, positions, units, and persons with `adminApi`; builds presentational rows with `buildAssignmentRows`; chooses an active/default assignment; and renders stats, directory, relationship preview, inspector, registry, governance reminders, and review queue.

## Frontend API Wrappers

Important client API modules:

- `authApi`: login/logout/me and CSRF token setup.
- `assignmentApi`: user assignment list and active assignment selection.
- `adminApi`: admin CRUD/list wrappers for master data and audit logs.
- `documentApi`: documents, relations, attachments, tasks.
- `workflowApi`: workflow actions and event creation.
- `signatureApi`: signature profiles, slots, signing, admin signature/serial rules.
- `transmissionApi`: transmissions, recipients, renders, archive.
- `collaborationApi`: comments.
- `notificationApi`: notifications and preferences.
- `savedSearchApi`: saved searches.
- `routingRulesApi`: admin routing-rule CRUD/status.

Client requests expect server responses shaped as `{ data: T }`.

## UI and Design Notes

DocChain is an administrative university workflow product. The UI should feel structured, dense enough for repeated admin work, and trustworthy. It should avoid marketing-page patterns.

Existing visual language:

- Dark blue admin sidebar with white text.
- White/near-white content surfaces.
- Compact admin headers, stat cards, tables/directories, inspectors, governance reminders, and queues.
- Icons from the local `Icon` component, not ad hoc inline SVG for normal UI buttons.
- Tailwind utility classes are used directly in TSX.
- Components should remain responsive and avoid text overflow.

Internationalization:

- All user-facing reusable app text should usually go through `useI18n().t(...)`.
- Supported locales are `en`, `fa-AF`, and `ps-AF`.
- Dari and Pashto are RTL.
- `client/src/lib/api.ts` sends `accept-language` based on the selected locale.

Assets:

- Brand assets are in `client/public/brand`.
- UI mockups exist in `UI-Mock-Up` for admin dashboard, organization, units, users, positions, assignments, workflow, and signature screens.

## Coding Conventions

General:

- TypeScript is strict in both client and server.
- Prefer existing patterns and local helpers before adding abstractions.
- Keep changes scoped to the module being worked on.
- Avoid changing build output by hand.
- Prefer status strings and existing field naming conventions over new enums unless the local module already uses enums.

Backend:

- Use `zod` schemas at route boundaries.
- Use parameterized MySQL queries.
- Use `pool.getConnection()` and transactions for multi-table writes.
- Write audit logs for significant state changes.
- Use `asyncHandler` for async Express handlers.
- Reuse `ok(response, data)` for success responses.
- Preserve session, active assignment, CSRF, and role checks.

Frontend:

- Use API wrappers from `client/src/api`.
- Use existing UI primitives from `client/src/components/ui`.
- Use admin module structure already present in `client/src/components/admin`.
- Use `useMemo` for derived rows and filters where the existing pages do.
- Use `safe(...)` fallback loading patterns where pages intentionally tolerate partially implemented endpoints.
- Keep labels in locale files rather than hardcoding major user-facing text.

Database:

- Add schema changes as paired `*.up.sql` and `*.down.sql` migrations.
- Keep UUID columns for public identifiers where existing tables use them.
- Include indexes for common status, foreign key, and date filters.
- Preserve foreign key behavior already used: `RESTRICT`, `CASCADE`, and `SET NULL` are chosen deliberately.

## Tests and Verification

Current test coverage is light. There is a Vitest test for UUID format in `server/src/shared/ids.test.ts`.

Useful verification commands:

```bash
npm run typecheck
npm run test
npm run build
```

For database-sensitive work, also run:

```bash
npm run db:reset
```

Only run database reset when it is acceptable to recreate local data.

## Known Implementation State

Implemented foundation includes:

- Session auth and CSRF.
- Admin shell and many admin pages.
- Full admin Templates module with A4 canvas designer, template CRUD, user draft submission, admin approval/rejection, default bindings, asset upload, and server-side PDF render integration.
- Master data CRUD/list routes for organizations, units, positions, assignments, document types, levels, rules, and related config.
- Document creation/update/detail/list.
- Workflow rule matching and workflow action execution.
- Signature profile enrollment, slot generation, signing, serial rule support.
- Transmission, render, archive, notification, comment, OCR, verification, saved search, delegation, external directory, policy, and API client route foundations.

Some admin UI actions are visually present before full create/edit modal flows are wired everywhere. For example, pages may show buttons like "New Assignment" or "Export" while the current implementation focuses on data loading, directories, inspectors, previews, and governance views.

The frontend currently emphasizes the admin panel. General non-admin document workflow screens are minimal compared with the admin modules.

## How an LLM Should Help With This Project

When answering questions or editing code:

- Read the relevant module before making assumptions.
- Keep server and client API shapes aligned.
- Preserve auth/session/CSRF behavior.
- Preserve active-assignment semantics.
- Prefer adding typed API wrappers over raw fetch calls.
- Prefer using existing admin page/component patterns for new admin features.
- Add or adjust SQL migrations when changing persisted data shape.
- Include focused tests when changing shared utilities or business logic.
- Run at least `npm run typecheck` after TypeScript changes when possible.
