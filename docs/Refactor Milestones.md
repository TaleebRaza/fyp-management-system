# Refactor Milestones

Last audited: 2026-07-19 (Asia/Karachi)

## Scope and guardrails

This is a behavior-preserving refactoring plan for the existing Next.js 16, React 19, TypeScript, Mongoose, MongoDB, NextAuth, and Cloudflare R2 application. It does not propose a framework change or combine refactoring with new features.

- Add characterization tests before changing business behavior.
- Refactor one route, workflow, or UI concern at a time.
- Keep HTTP contracts stable unless a separately tested naming correction is explicitly approved.
- Do not migrate or rewrite production data without explicit approval, a backup, a dry run, and reconciliation checks.
- Do not remove legacy login or data fallbacks until usage is measured and a migration is approved.
- Prefer deletion and reuse over new layers. A small function is preferable to a manager, repository, service class, or generic framework.
- Run typecheck, lint, relevant tests, and the production build at every milestone gate.

## Repository baseline

### Runtime flow

1. `app/page.tsx` owns login, password reset, registration, theme/intro state, global dialogs, session routing, and lazy loading of all three dashboards.
2. Each role dashboard is a large client component that owns UI, local state, validation, fetch calls, uploads/downloads, filtering, and mutation orchestration.
3. App Router route handlers connect directly to Mongoose models and often also perform authorization, business rules, MongoDB transactions, R2 operations, email, and response formatting.
4. `User` and `Project` both store parts of the same project state. Route handlers manually synchronize them.
5. `SystemConfig.usedBytes` is a global storage ledger updated separately from R2 operations in several workflows.

No relative-import cycles were detected across `app`, `components`, `lib`, `models`, and `config`. The confusing dependencies are runtime and data dependencies rather than static import cycles.

### Files over 1,000 lines

| File | Lines | Assessment |
| --- | ---: | --- |
| `components/dashboards/StudentDashboard.tsx` | 2,037 | High-priority split after tests; one component owns most student workflows. |
| `components/dashboards/AdminDashboard.tsx` | 1,790 | High-priority split after tests; combines CRUD, filters, reporting, downloads, and UI. |
| `components/dashboards/SupervisorDashboard.tsx` | 1,234 | High-priority split after tests; combines project queries, reviews, migration, export, and UI. |

Generated/non-source files over 1,000 lines: `package-lock.json` (10,519). `public/logo.png` is binary and its `wc` result is not a meaningful line count.

### Files over 500 and at most 1,000 lines

| File | Lines | Assessment |
| --- | ---: | --- |
| `app/page.tsx` | 997 | Login, registration, reset, session routing, dialog infrastructure, theme, and intro are mixed. |
| `components/ui/SharedUI.tsx` | 991 | UI primitives, dashboard layout, dialog behavior, link parsing, and tables share one module. |
| `app/api/dashboard/student/route.ts` | 887 | Multiple commands, transactions, storage cleanup, capacity rules, email, and response shaping share one route. |
| `app/globals.css` | 520 | Large but mostly cohesive; clean unused selectors first and split only if ownership becomes clearer. |

Other tracked files over 500 lines: `README.md` (529, documentation).

## Detailed findings

### F-01 — There is no automated test safety net

- Relevant files: `package.json`; all application and route files. No `*.test.*`, `*.spec.*`, or `__tests__` files were found.
- Why it is a problem: transactions, role authorization, storage accounting, project stage transitions, and duplicated records can regress silently. Refactoring large components without behavior tests would rely on manual inspection.
- Risk level: Critical.
- Recommended improvement: add the smallest supported unit/component test setup first. Vitest plus React Testing Library follows the current Next.js guidance. Start with pure business rules and route authorization; add browser E2E coverage only for the few critical cross-system flows that unit tests cannot protect.
- Tests needed before changing it: the test harness itself should prove one pure function test, one client component interaction, and one route-handler test can run in CI. Add scripts for `typecheck`, `test`, and a non-watch test run.

### F-02 — Authorization and response boundaries are inconsistent

- Relevant files: `middleware.ts`; `app/api/supervisors/route.ts`; `app/api/dashboard/supervisor/route.ts`; `app/api/project/join/route.ts`; `app/api/voice/route.ts`; `app/api/read-pdf/route.ts`; `app/api/add-supervisor/route.ts`; `app/api/delete-supervisor/route.ts`; `app/api/admin/*`; `models/User.ts`.
- Why it is a problem: several handlers rely only on the route matcher instead of checking authorization near the data mutation. Supervisor dashboard handlers trust requested IDs and do not consistently prove ownership of the target project/student. The join handler trusts `studentId` from the body. Voice GET/POST/PATCH has no token check. `read-pdf` accepts any storage key from any authenticated user. Most importantly, the public supervisors endpoint spreads whole `User` documents without a projection, which can expose fields such as password hashes, reset fields, migration codes, and internal metadata.
- Risk level: Critical.
- Recommended improvement: add one small server-only `requireRole`/session helper and explicit resource-ownership checks in every protected handler. Keep the network proxy as an optimistic first check, not the only check. Return explicit safe projections/DTO-shaped objects; create a public supervisor-list response containing only registration fields.
- Tests needed before changing it: an authorization matrix for anonymous/student/supervisor/admin; attempts to act on another user's IDs; public supervisor response field allowlist; PDF/audio ownership; voice note project membership; 401 versus 403 behavior; valid admin and supervisor workflows.

### F-03 — Role dashboards have too many responsibilities

- Relevant files: `components/dashboards/StudentDashboard.tsx`; `components/dashboards/AdminDashboard.tsx`; `components/dashboards/SupervisorDashboard.tsx`; `app/page.tsx`.
- Why it is a problem: each component combines rendering, many independent state machines, fetch orchestration, validation, business-derived calculations, dialogs, file operations, filtering, and error presentation. A change in one workflow requires understanding thousands of unrelated lines and makes debugging state transitions difficult.
- Risk level: High.
- Recommended improvement: keep each dashboard as a thin role-level orchestrator and extract one cohesive visible feature at a time. Prefer concrete child components and pure functions. Do not introduce generic managers or a one-hook-per-function architecture. Extract Admin reporting transforms/download generation first because they are already a distinct pure concern; then split Student project submission/templates/academic settings and Supervisor queue/review/migration.
- Tests needed before changing it: role dashboard loading/error/empty states; tab navigation; filters; submit/disable behavior; dialog confirmation paths; upload/download calls; report row/CSV/HTML output; selected project state after mutations.

### F-04 — Dashboard API handlers are command dispatchers with mixed infrastructure

- Relevant files: `app/api/dashboard/student/route.ts`; `app/api/dashboard/supervisor/route.ts`.
- Why it is a problem: the student POST handler dispatches program/batch reset, supervisor change, assignment, and project submission. The supervisor POST handler dispatches status changes, migrations, and removal. They also own authorization, validation, transactions, R2 cleanup, ledger changes, emails, and HTTP responses. A catch block often loses which sub-operation failed.
- Risk level: High.
- Recommended improvement: keep `route.ts` as a small HTTP adapter and move each existing action into a concrete use-case function with typed input/output. Preserve the existing endpoint initially to avoid coupling route changes to logic extraction. Consider dedicated nested routes only in a later, separately tested naming milestone.
- Tests needed before changing it: one route contract test per action, unknown action, invalid JSON/input, authentication/ownership, transaction commit/abort, duplicate invite/capacity errors, email failure, and R2 failure.

### F-05 — Academic reset logic is duplicated and already diverges

- Relevant files: `lib/academicReset.ts`; `app/api/dashboard/student/route.ts`; `app/api/admin/update-program/route.ts`; `app/api/admin/update-batch/route.ts`.
- Why it is a problem: the long `updateProgramBatch` branch repeats most of `resetStudentAcademicInfo`. The shared implementation is already used by admin routes but does not reset every field exactly as the student branch does (notably canonical `student.domains`). Any policy or storage fix must be made twice and can produce actor-dependent stale data.
- Risk level: Critical.
- Recommended improvement: write parity tests, make `resetStudentAcademicInfo` the only implementation, explicitly resolve the `domains` difference as a verified bug, and replace the duplicate student branch with a thin call and error mapping.
- Tests needed before changing it: admin versus student actor messages; program-only, batch-only, and both-field changes; unchanged and invalid values; cooldown; solo versus team project; PDF and voice cleanup; storage refund and nonnegative ledger; all project fields including `domains` cleared; transaction rollback.

### F-06 — Supervisor capacity and team-transfer rules are repeated

- Relevant files: `app/api/register/route.ts`; `app/api/dashboard/student/route.ts`; `app/api/dashboard/supervisor/route.ts`; `app/api/project/join/route.ts`; `app/api/supervisors/route.ts`; `lib/supervisorSlots.ts`; `config/appSettings.ts`.
- Why it is a problem: STUDENT-versus-PROJECT counting, extra slots, full-capacity messages, team inheritance, and migration behavior are implemented in several places. The comments imply transactions provide a capacity lock, but a count followed by a write needs a tested concurrency invariant rather than an assumption.
- Risk level: High.
- Recommended improvement: centralize the concrete capacity calculation and supervisor eligibility rule in a small shared module used by existing transactions. Keep registration, join, assign, change, and migrate as separate use cases. Document and test whether a team join consumes a slot in each mode.
- Tests needed before changing it: both slot modes; base and extra capacity; exact boundary; missing supervisor; concurrent assignments/joins; same-program/batch team rule; two-member cap; migration preserves timeline; failed transaction leaves no ghost membership.

### F-07 — Project data has multiple sources of truth

- Relevant files: `models/User.ts`; `models/Project.ts`; `app/api/dashboard/student/route.ts`; `app/api/dashboard/supervisor/route.ts`; `app/api/project/join/route.ts`; `lib/academicReset.ts`; reporting/export routes.
- Why it is a problem: supervisor, status, title, domains, PDF URL, and related project fields are stored on both users and projects. Handlers copy values to every member and use fallbacks when records disagree. This produces hidden coupling, ghost data, complex resets, and ambiguous reporting.
- Risk level: Critical and especially risky to refactor.
- Recommended improvement: after all higher-level tests exist, define `Project` as the canonical source for team-level state and `User` as identity/membership. Introduce typed dual-read reconciliation first, then a dry-run migration and dual-write transition. Remove duplicate fields only after production reconciliation and explicit approval.
- Tests needed before changing it: read behavior for matching, missing, and conflicting records; team-member consistency; reports and exports; join/migrate/reset; backfill dry run; idempotence; rollback; counts of unmatched/orphan records before and after migration.

### F-08 — Storage cleanup and accounting have inconsistent failure semantics

- Relevant files: `lib/academicReset.ts`; `app/api/dashboard/student/route.ts`; `app/api/dashboard/supervisor/route.ts`; `app/api/dashboard/supervisor/broadcast/route.ts`; `app/api/voice/route.ts`; `app/api/cron/voice-cleanup/route.ts`; `app/api/upload/route.ts`; `app/api/voice/upload/route.ts`; `lib/s3-client.ts`; `models/SystemConfig.ts`.
- Why it is a problem: R2 key parsing is duplicated, external deletions sometimes occur inside MongoDB transactions and sometimes after commit, and ledger updates may succeed when object deletion fails or vice versa. Presigned uploads are not counted until a later request, so abandoned uploads are invisible to the ledger. These workflows cannot be made atomic across MongoDB and R2, but the current code does not define a consistent retry/reconciliation policy.
- Risk level: Critical and especially risky to refactor.
- Recommended improvement: first extract and test one R2 key normalizer and deletion-target deduper. Then define an idempotent policy: commit authoritative database state, record cleanup work, perform external deletion, and reconcile/retry failures. At minimum add a reconciliation command/report before changing accounting. Do not add a queue dependency unless observed failures require it.
- Tests needed before changing it: full URL/bare key/encoded key parsing; duplicate target sizes; upload accepted but ledger write fails; R2 delete failure; MongoDB abort; retry/idempotence; ledger never negative; orphan detection; cron partial failure; concurrent uploads near the capacity limit.

### F-09 — Voice reads mutate state and voice client logic is duplicated

- Relevant files: `app/api/voice/route.ts`; `app/api/cron/voice-cleanup/route.ts`; `components/ui/VoiceChat.tsx`; `components/dashboards/BroadcastWidget.tsx`; `app/api/voice/upload/route.ts`.
- Why it is a problem: voice GET performs garbage collection, R2 deletion, database deletion, and ledger mutation, so a read has hidden destructive side effects and can be slow or fail because cleanup failed. Both client components independently implement MediaRecorder setup, a 60-second timer, track cleanup, and direct upload. Error checking is incomplete: final ledger/PATCH responses can be ignored, clear status is ignored, and object URLs are not consistently revoked.
- Risk level: High.
- Recommended improvement: make GET read-only and leave expiry cleanup to the secured cleanup workflow. Share the two-caller recording/upload behavior in one focused hook or utility, while keeping message and broadcast UI separate. Standardize response checks and resource cleanup.
- Tests needed before changing it: GET causes no writes/deletes; only project members can read/write/mark notes; expiry selection and idempotent cleanup; recording start/stop/60-second cutoff; media tracks stopped on all paths; failed presign/PUT/ledger/PATCH; optimistic message rollback; object URL revocation.

### F-10 — Stage, program, domain, and display rules are duplicated

- Relevant files: `components/dashboards/StudentDashboard.tsx`; `components/dashboards/SupervisorDashboard.tsx`; `components/ui/Timeline.tsx`; `app/api/templates/route.ts`; `models/Project.ts`; `models/User.ts`; `config/appSettings.ts`; `config/projectDomains.ts`.
- Why it is a problem: stage arrays, labels, progress calculations, and timelines exist in multiple files. Program keys exist in both configuration and a schema enum. Updates can compile while one UI, validator, or model remains stale. Domain normalization is comparatively centralized but callers still implement legacy fallback choices.
- Risk level: Medium.
- Recommended improvement: export typed project stages and program keys from existing configuration and derive schema enums/labels from them. Reuse one current timeline component and delete the unused legacy timeline. Keep domain normalization in its existing module and move fallback policy there only where multiple callers prove it is shared.
- Tests needed before changing it: every configured stage/program is accepted and displayed; invalid values rejected; known and unknown stage progress; stage-to-template map; legacy and canonical domain input; timeline accessibility and mobile layout.

### F-11 — UI infrastructure is both oversized and duplicated

- Relevant files: `components/ui/SharedUI.tsx`; `app/page.tsx`; all three dashboards; `components/dashboards/BroadcastWidget.tsx`; `components/ui/Timeline.tsx`.
- Why it is a problem: `SharedUI.tsx` contains primitives, composite dashboard layout, dialog side effects, URL parsing, and table helpers. Meanwhile `app/page.tsx` and `BroadcastWidget.tsx` implement separate dialogs, and `app/page.tsx` has a separate custom select. Several exported SharedUI components appear unused (`Input`, `TableShell`, `DetailRow`, `TagList`, `MobileSafeTable`, `TableHeadCell`, `TableCell`).
- Risk level: Medium.
- Recommended improvement: delete unused exports after reference verification. Split the remaining module into a few cohesive groups rather than one file per atom: form/display primitives, Dialog, DashboardShell, and text/table helpers. Reuse the existing Dialog where requirements match; do not force incompatible login prompting into a generic abstraction.
- Tests needed before changing it: keyboard focus/Escape/backdrop behavior; ARIA name and dialog associations; mobile menu body-scroll cleanup; select keyboard/mouse behavior; safe link protocols; table overflow; visual comparison in light/dark and mobile/desktop layouts.

### F-12 — Error handling and network behavior are inconsistent

- Relevant files: all dashboard components; `components/ui/VoiceChat.tsx`; `components/dashboards/BroadcastWidget.tsx`; all API routes; `lib/mailer.ts`.
- Why it is a problem: callers vary between checking `response.ok`, assuming JSON, fire-and-forget fetches, alerts, console-only failures, and silent fallback. Several server catches return a generic 500 without logging context, while other paths log free-form messages or emoji. Email returns `false`, but some notification callers do not surface or record delivery failure. This makes incidents difficult to correlate and can leave optimistic UI stale.
- Risk level: High.
- Recommended improvement: define a small shared JSON request/error parser only after cataloging current response shapes. Standardize route error codes/statuses and structured server context without exposing secrets. Treat notification failures as a recorded secondary outcome rather than silently changing the main transaction result.
- Tests needed before changing it: JSON and non-JSON error responses; network rejection; 400/401/403/404/409/429/500 display; timeout/double-submit; optimistic rollback; email unavailable; logs omit password, reset code, signed URL, and credentials.

### F-13 — Strict TypeScript is undermined by broad `any`

- Relevant files: especially the three dashboards, `app/page.tsx`, both dashboard routes, NextAuth callbacks, models, and `lib/supervisorSlots.ts`.
- Why it is a problem: 176 textual `any` uses were found; ESLint reports 173 `no-explicit-any` errors. Session claims, API responses, Mongoose records, dialog payloads, and component props can drift without compiler feedback even though `strict` is enabled.
- Risk level: High.
- Recommended improvement: type boundaries as they are touched: NextAuth module augmentation, Mongoose document/lean shapes, action request unions, response DTOs, and component props. Parse unknown input rather than asserting it. Do not perform a repository-wide type-only rewrite detached from behavioral milestones.
- Tests needed before changing it: typecheck fixtures for action unions/role claims; runtime tests for malformed request bodies because TypeScript does not validate network input; existing behavior tests for each typed component or handler.

### F-14 — Dead code and redundant configuration add noise

- Relevant files: `components/ui/Timeline.tsx`; `lib/mailer-resend-backup.ts`; `public/file.svg`; `public/globe.svg`; `public/next.svg`; `public/vercel.svg`; `public/window.svg`; unused SharedUI exports; `next.config.ts`; `app/globals.css`.
- Why it is a problem: the timeline is unused and duplicated by both dashboards; the mailer backup is entirely commented; starter SVGs are unreferenced. `next.config.ts` names absent `pdfkit`, redundantly enables default compression, and explicitly lists packages Next.js already optimizes by default (including an uninstalled `date-fns`). Unused CSS selectors and imports increase search noise and lint failures.
- Risk level: Low for verified dead files/config; Medium for CSS/UI cleanup.
- Recommended improvement: delete only after a second reference check and build. Remove redundant config instead of documenting it. Clean CSS selectors in small visual batches. Keep `README.md` marketing content separate from developer instructions rather than deleting it.
- Tests needed before changing it: production build; route/template smoke; asset 404 scan; light/dark/mobile visual smoke; verify email path still uses `lib/mailer.ts`; compare Next build output before/after config removal.

### F-15 — Naming and folder conventions obscure intent

- Relevant files: `middleware.ts`; `app/api/export-pdf/route.ts`; `components/dashboards/SupervisorDashboard.tsx`; API folders at both `/api/*` and `/api/admin/*`; mixed CRLF/LF source files.
- Why it is a problem: Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`. The `export-pdf` route and `handleExportPDF` return an XLSX workbook. Admin supervisor endpoints live at the API root while other admin endpoints live under `/api/admin`. Mixed route nouns/actions and line endings make discovery and diffs harder.
- Risk level: Medium.
- Recommended improvement: after route-local authorization is in place, rename `middleware.ts` to `proxy.ts` and verify NextAuth compatibility. Rename the export route to reflect XLSX in a separate contract-preserving change (temporary redirect or coordinated client update). Gradually place admin-only endpoints under `/api/admin` when each caller is covered. Normalize line endings through editor settings in a dedicated mechanical change.
- Tests needed before changing it: proxy matcher role matrix; build warning removed; every renamed route/client caller; download content type, filename, and workbook contents; no unrelated line-ending diff mixed with logic changes.

### F-16 — Global/module state and custom authentication behavior are hidden coupling points

- Relevant files: `lib/mongodb.ts`; `lib/s3-client.ts`; `models/*`; `app/api/auth/[...nextauth]/route.ts`; `app/page.tsx`; `components/ui/SharedUI.tsx`.
- Why it is a problem: the Mongoose connection is stored on an untyped global and initialized through module state. R2 clients and email transport are created at import time. Models use the global Mongoose model registry. The auth route rewrites Set-Cookie headers and supports legacy plaintext password comparison. Client components mutate session storage and `document.body.style.overflow`. These are legitimate mechanisms, but their implicit lifecycle makes isolated tests and debugging harder.
- Risk level: High for auth and connection changes; Medium for client lifecycle effects.
- Recommended improvement: type the existing Mongoose global rather than replace the caching pattern. Validate required environment configuration in a documented server-only boundary. Add tests around auth cookie rewriting and legacy password behavior before touching them. Ensure every DOM/global mutation has symmetric cleanup.
- Tests needed before changing it: cold/warm/concurrent database connection; failed connection retry; missing env behavior; Mongoose hot reload; bcrypt and legacy login; inactive user; JWT/session claims; Set-Cookie attributes; intro session behavior; mobile menu cleanup on unmount/Escape/resize.

### F-17 — Developer and operational documentation is inadequate

- Relevant files: `README.md`; missing `.env.example`; missing test/typecheck scripts; `vercel.json`; Sentry and storage configuration files.
- Why it is a problem: the 529-line README is primarily a product showcase and does not explain local setup, required environment keys, data model ownership, route authorization, test commands, storage reconciliation, or common failure diagnosis. New maintainers must reverse-engineer runtime assumptions.
- Risk level: Medium.
- Recommended improvement: retain the showcase README, but add a concise developer section or separate tracked developer guide after secrets are reviewed. Provide a redacted `.env.example`, command matrix, data-flow overview, and operational runbooks for failed email, R2 cleanup, storage ledger drift, and MongoDB transaction requirements.
- Tests needed before changing it: verify setup from a clean clone using only documented commands and placeholder values; validate every documented environment variable is referenced and no secret value is included.

## Areas with greatest maintenance benefit

1. Secure, typed route authorization plus safe response projections.
2. Characterization tests for academic reset, supervisor/team changes, stage transitions, and storage accounting.
3. Delete the duplicated student academic-reset implementation and reuse the existing shared implementation.
4. Centralize R2 key parsing and define one storage cleanup/reconciliation policy.
5. Split the three dashboards by visible feature after their workflows are tested.
6. Make project-level state canonical in `Project` only, but only as a late, explicitly approved data migration.

## Areas especially risky to refactor

- `User`/`Project` canonicalization because existing production rows may disagree.
- Any workflow spanning MongoDB transactions and R2 because there is no cross-system atomic transaction.
- NextAuth cookie rewriting and plaintext-password fallback.
- Supervisor capacity under concurrent registration, join, assignment, or migration.
- Academic resets and team changes because they may delete files, voice notes, project rows, and ledger bytes.
- Stage approval because it advances the timeline, deletes prior PDFs, updates team members, and sends email.

## Ponytail simplification candidates

- `delete:` commented Resend backup, unused legacy timeline, starter SVGs, unused SharedUI exports, unused imports/selectors. Replacement: nothing. [`lib/mailer-resend-backup.ts`, `components/ui/Timeline.tsx`, `public/*`, `components/ui/SharedUI.tsx`, `app/globals.css`]
- `shrink:` duplicated academic reset branch. Replacement: the existing tested `resetStudentAcademicInfo`. [`app/api/dashboard/student/route.ts`, `lib/academicReset.ts`]
- `shrink:` duplicate stage arrays/progress/timeline markup. Replacement: one typed constant and one current timeline. [student/supervisor dashboards, `config`, `models/Project.ts`]
- `shrink:` duplicate R2 key/deletion target parsing. Replacement: one tested utility used by current callers. [student/supervisor routes, `lib/academicReset.ts`, broadcast/cron routes]
- `shrink:` duplicate MediaRecorder/timer/upload handshake. Replacement: one two-caller hook/utility. [`VoiceChat.tsx`, `BroadcastWidget.tsx`]
- `native:` redundant `compress: true` and default package optimization entries. Replacement: Next.js defaults. [`next.config.ts`]
- `delete:` absent `pdfkit` externalization and uninstalled `date-fns` optimization entry. Replacement: nothing. [`next.config.ts`]

net: -400 to -650 maintained lines, -0 dependencies possible (estimate; behavior-preserving changes only).

## Prioritized iterative roadmap

Each step is intentionally small enough to review and revert independently. Do not start the next step until the current gate passes.

### Milestone 0 — Audit and working context

Status: complete.

1. Record repository baseline, risks, line counts, and runtime flow.
2. Record existing typecheck/lint/build/test status.
3. Add ignored session handoff notes.

Gate: documentation accurately reflects the repository; no application source changes.

### Milestone 1 — Establish the safety net

1.1 Add explicit `typecheck` and non-watch `test` scripts.

1.2 Add the minimal Next.js-supported Vitest/React Testing Library setup. Do not add E2E tooling yet.

1.3 Add pure characterization tests for late-registration fine, roll number/email normalization, domains, supervisor extra slots, stage progress, and R2 key parsing after extraction.

1.4 Add route authorization matrix tests for every protected route and a safe-field test for public supervisor listing.

1.5 Add transaction characterization tests for academic reset, join, assignment, migration, approval, and storage ledger changes using isolated test data.

Gate: new tests pass; typecheck passes; lint baseline is captured and cannot worsen; production build passes.

### Milestone 2 — Secure route-local boundaries

Status: complete. The route suites protect authentication, roles, actor identity, project membership, cross-supervisor access, and missing-resource boundaries. Anonymous/non-admin batch promotion and student listings, cross-supervisor exports, supervisor PDF-upload signing, and spoofed default project submissions are now rejected locally. Voice cleanup still occurs on authorized GET and remains scheduled for Milestone 5.

2.1 Add typed NextAuth session/JWT augmentation to remove repeated session assertions. Complete.

2.2 Add one small server-only role/session assertion function and use it first in the public-data and voice routes. Complete: `lib/routeAuth.ts` supplies the small `requireRole` assertion for routes whose role boundary does not require resource ownership; public-data and voice routes retain their specialized token/resource checks.

2.3 Project the public supervisor response to an explicit allowlist. Keep any admin-only response separate. Complete.

2.4 Bind supervisor GET/POST, project join, file reads, and voice operations to the authenticated actor and resource membership. Complete: file reads, voice operations/upload, Supervisor GET/POST, and project join actor binding now check the authenticated actor and applicable resource membership. `updateStatus`, `migrate`, and `removeStudent` require an authenticated supervisor who owns the target student, or an admin; migration rechecks ownership in its transaction. Project join requires a matching student JWT (admins retain their existing path).

2.5 Add route-local checks to handlers currently protected only by the network matcher. Complete: in addition to the earlier admin mutations, batch promotion and student listing now assert admin role locally; export binds a supervisor to their own ID (with retained admin access); upload locally rejects supervisors; and default project submission binds the request body to the student JWT. Ten pre-change authorization assertions failed and the 18 focused tests now pass, preserving valid workflows.

Gate: full auth matrix passes; no protected field appears in public JSON; valid role workflows remain unchanged.

### Milestone 3 — Remove the academic reset duplicate

Status: complete. Direct helper and route characterization cover the student/admin reset state, canonical domain clearing, solo cleanup/ledger refund, team departure, cooldown, rollback, validation, and response mapping. The dashboard branch reuses `resetStudentAcademicInfo`. The remaining helper functions in the student route serve supervisor change and are not reset duplicates.

3.1 Add parity tests for the student route branch and `resetStudentAcademicInfo`. Complete: student/admin reset state, canonical domains, solo and team cleanup, ledger refund/clamp, cooldown, rollback, validation, and response mapping are characterized.

3.2 Resolve the canonical `domains` reset discrepancy in the shared function. Complete.

3.3 Replace the student branch with one shared call and preserve status/error messages where clients depend on them. Complete.

3.4 Delete now-unused duplicate helpers from the student route. Complete for the program/batch branch; remaining local helpers are used by supervisor change.

Gate: passed. Reset, cleanup, cooldown, rollback, and route contract tests pass; the duplicated branch was removed materially.

### Milestone 4 — Consolidate capacity and team invariants

Status: complete. `lib/supervisorCapacity.ts` owns the tested mode-dependent count and the transactional supervisor reservation used by registration, student assignment/change, supervisor migration, and the student-mode join firewall. Supervisor listing deliberately retains its equivalent efficient bulk aggregation rather than adding N+1 queries.

4.1 Extract one typed capacity query/calculation used by the existing call sites. Complete.

4.2 Use it in registration, list, assignment, supervisor change, migration, and join without merging those workflows. Complete: the list keeps its equivalent bulk aggregation to preserve query efficiency.

4.3 Add concurrency tests and correct any verified race in a separate focused change. Complete: `capacityVersion` creates a shared write-conflict boundary; both slot modes simulate a losing transaction retrying, re-counting a full supervisor, and making no second reservation.

4.4 Centralize the team-size constant and project stage/program constants. Complete: typed team, stage/default, and program/default constants now drive schemas, server rules, templates, and dashboard display logic without changing labels or valid values.

Gate: passed. Both slot modes and simulated concurrent boundary tests pass; registration confirms a full supervisor creates no student/project records. Live replica-set concurrency remains a future hardening test, not a prerequisite for this bounded refactor.

### Milestone 5 — Make storage behavior explicit

Status: complete. One R2-specific helper now normalizes/deduplicates existing cleanup targets; a separate read-only admin reconciliation report compares database references, R2 objects, and the storage ledger. Voice GET is read-only, and cleanup retries R2 deletion before metadata/ledger mutation. Failure-injection tests cover retry exhaustion without metadata or ledger changes. A residual MongoDB/R2 split remains observable through reconciliation rather than hidden by a speculative queue.

5.1 Extract and test R2 key normalization and deletion-target deduplication. Complete.

5.2 Add a read-only storage reconciliation report/command; do not mutate production data. Complete.

5.3 Make voice GET read-only and rely on the secured cleanup path. Complete.

5.4 Standardize cleanup order, retry, and ledger adjustment one workflow at a time: voice, broadcast, stage approval, supervisor change, academic reset. Complete.

5.5 Address abandoned presigned uploads only if reconciliation shows they are material; avoid adding a queue preemptively. Complete: deferred because no production reconciliation has shown material abandoned uploads.

Gate: failure-injection and idempotence tests pass; reconciliation totals match expected fixtures; no GET performs a mutation.

### Milestone 6 — Thin the route handlers

Status: complete. Student and supervisor dashboard routes now authenticate/parse/dispatch/respond while action modules retain the unchanged contracts. Dashboard email bodies have direct builders/tests; action inputs are typed at the extracted boundaries without changing public error JSON.

6.1 Extract student actions one at a time behind the unchanged route contract. Complete: program/batch, assignment, supervisor change, and project submission.

6.2 Extract supervisor actions one at a time behind the unchanged route contract. Complete: status update, migration, and removal.

6.3 Move email composition out of transaction functions into tested template/build functions. Complete: dashboard submission/status emails have tested builders.

6.4 Standardize typed action inputs and structured error codes. Complete for internal action inputs; public error response shapes remain intentionally unchanged for client compatibility.

Gate: route contract tests are unchanged; each handler reads as authorization, parse, call, respond.

### Milestone 7 — Split client features incrementally

Status: in progress. 7.1 is complete and the first 7.2 project-submission component is extracted with keyboard coverage. The remaining named features and page split must be completed before Milestone 8 is treated as a completed milestone.

7.1 Extract Admin report transformations and file generation as pure functions, then its reports UI. Complete: typed report data/CSV/HTML functions and `ReportsDialog` have direct tests.

7.2 Extract Student templates, project submission, supervisor selection/change, and academic settings one feature per change. In progress: typed project-domain selector extracted; the rest remains.

7.3 Extract Supervisor queue/filter, review dialog, migration, and export one feature per change.

7.4 Split login, password reset, registration, and session routing in `app/page.tsx` without changing the page URL.

7.5 Type props and API responses as each feature moves; do not schedule a separate mass-typing rewrite.

Gate for every substep: relevant component tests, keyboard/accessibility checks, typecheck, lint non-regression, build.

### Milestone 8 — Consolidate UI and browser infrastructure

Status: in progress. Safe slices 8.1, 8.3, 8.4, and 8.5 are complete; 8.2 and shared recorder/timer state remain.

8.1 Delete verified unused SharedUI exports and dead files/assets. Complete: unused table/card aliases, Timeline, commented mailer backup, and starter SVGs were reference-checked and deleted.

8.2 Split SharedUI into a few cohesive modules, preserving import aliases temporarily if that keeps diffs small.

8.3 Reuse the current Dialog and timeline where behavior matches. Complete for timeline: both dashboards use the tested `ProjectTimeline`; existing Dialog remains the common dialog.

8.4 Share MediaRecorder/timer/upload logic between the two concrete callers and add cleanup/error tests. In progress: the presigned upload/PUT handshake is shared and failure-tested; recorder/timer state remains duplicated.

8.5 Remove unused CSS selectors in visual-smoke-sized batches; keep globals together unless ownership becomes clearly feature-specific. Complete for one verified batch: seven unreferenced selectors were deleted; manual visual smoke remains pending.

Gate: component/accessibility tests and manual light/dark/mobile smoke pass; no visual behavior intentionally changes.

### Milestone 9 — Align naming and Next.js conventions

9.1 Rename `middleware.ts` to `proxy.ts` only after route-local authorization exists; verify NextAuth behavior.

9.2 Rename XLSX export symbols/route in a coordinated, tested change.

9.3 Group admin-only routes consistently, one caller at a time.

9.4 Remove redundant Next.js configuration and normalize line endings in a mechanical-only change.

9.5 Add tracked developer setup, `.env.example`, debugging, and runbook documentation.

Gate: proxy/route tests, clean build without deprecation warning, clean-clone setup verification.

### Milestone 10 — Canonicalize project data (explicit approval required)

10.1 Write a read-only audit that categorizes matching, missing, conflicting, and orphaned `User`/`Project` state.

10.2 Agree on canonical field ownership and conflict-resolution rules using real audit counts.

10.3 Add dual-read reconciliation and idempotent dry-run migration tests.

10.4 Back up data and run the migration only with explicit production-data approval.

10.5 Observe dual-write consistency before removing duplicate fields and fallbacks.

Gate: zero unexplained conflicts/orphans, successful rollback rehearsal, reports/exports/dashboard E2E smoke, explicit approval for every production mutation.

### Milestone 11 — Final quality gate

1. Remove obsolete compatibility shims only when measured usage is zero and removal is approved.
2. Make lint clean; do not suppress rules to reach zero.
3. Run typecheck, full tests, production build, and targeted manual role smoke tests.
4. Re-run file-size, dead-code, duplicate-rule, auth, and import-cycle scans.
5. Update architecture and operational documentation to match the final code.

Gate: all commands pass, no unresolved Critical/High finding, and remaining Medium/Low debt is explicitly documented.

## Current technology references

- Next.js 16 renamed Middleware to Proxy and describes Proxy as an optimistic boundary rather than the only authorization layer: <https://nextjs.org/docs/app/getting-started/proxy>
- Next.js authentication guidance says Route Handlers should verify access and recommends authorization near the data source with explicit returned fields: <https://nextjs.org/docs/app/guides/authentication>
- Next.js unit/component testing guidance for Vitest and React Testing Library: <https://nextjs.org/docs/app/guides/testing/vitest>
- Next.js documents compression as enabled by default: <https://nextjs.org/docs/app/api-reference/config/next-config-js/compress>
- Next.js documents `lucide-react` and `date-fns` as optimized by default: <https://nextjs.org/docs/pages/api-reference/config/next-config-js/optimizePackageImports>
