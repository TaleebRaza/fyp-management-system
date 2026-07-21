# Current Milestone

Last updated: 2026-07-21 (Asia/Karachi)

## Status

- Current milestone: Milestone 7 — Split client features incrementally.
- State: Milestone 6 is complete. Milestone 7.1 is complete; 7.2 has begun with the typed project-domain selector. Milestone 8 has only its independently safe cleanup/timeline/upload slices completed and must not be marked complete until Milestone 7 is finished.
- Current branch: `Portal-Overhaul`.
- Safety-net status: the test infrastructure and tests needed for this route are complete. The broader Milestone 1 authorization and transaction suites remain prerequisites before their corresponding protected workflows are changed.
- Application runtime source changes made in the current session: bounded route-local security changes, one shared academic-reset call, shared supervisor-capacity query/reservation, centralized team/stage/program constants, and explicit R2 cleanup/reconciliation behavior; the NextAuth work is type-only.
- Documentation is intentionally ignored through `docs/` in `.gitignore` as requested.

The complete findings and roadmap are in [Refactor Milestones](./Refactor%20Milestones.md).

## What was inspected

- All files under `app`, `components`, `lib`, `models`, and `config`.
- All API route handlers and the root route matcher.
- Authentication/session flow, student/supervisor/admin dashboard flows, registration/reset, team join/migration, project stage changes, reporting, templates, email, upload/download, voice, R2 cleanup, and storage accounting.
- Package scripts/configuration, source line counts, imports, dead references, broad types, error paths, test files, lint, and typecheck.
- Official current Next.js documentation for Proxy, route authorization, testing, and configuration defaults.

## Baseline evidence

- Stack: Next.js 16.1.6, React 19.2.3, TypeScript 5, Mongoose 9.2.4, NextAuth 4.24.13, Tailwind CSS 4.
- Maintained source lines across `app`, `components`, `lib`, `models`, and `config`: 13,327.
- Source files over 1,000 lines: Student dashboard (2,037), Admin dashboard (1,790), Supervisor dashboard (1,234).
- Source files over 500 lines: `app/page.tsx` (997), `SharedUI.tsx` (991), student dashboard route (887), `globals.css` (520), plus the three files above.
- Relative-import cycle scan: no cycles detected.
- Tests: one Vitest file with 11 pure-helper characterization tests; `npm test` passes.
- Broad typing: 176 textual `any` uses; ESLint reports 173 `no-explicit-any` errors.
- Typecheck: `npx tsc --noEmit --incremental false` passed.
- Lint: `npm run lint` failed with 224 problems (183 errors, 41 warnings): 173 explicit-any, 34 unused-vars, 10 set-state-in-effect, 4 exhaustive-deps, and 3 no-img-element findings.
- Production build: `npm run build` passed outside the restricted sandbox. Compilation, TypeScript, page-data collection, and all 20 static pages completed. The build reports the expected Next.js 16 `middleware.ts` deprecation warning.
- Working tree at session start already contained a user-owned `.gitignore` modification. It was preserved; only the `docs/` entry was appended.

## Highest-priority risks

1. MongoDB transactions and R2 mutations use inconsistent ordering/failure behavior; the global byte ledger can drift.
2. Voice GET has destructive hidden side effects.
3. There are still no route or transaction tests around most destructive and cross-system operations.
4. `User` and `Project` duplicate project state and can disagree.
5. Three dashboard components exceed 1,000 lines and mix UI with network/business/file behavior.

Resolved in the current slices: public `/api/supervisors` no longer returns whole supervisor documents; file and voice routes verify resource ownership; voice presigning is role/context bound; Supervisor dashboard GET no longer trusts a caller-supplied supervisor ID; all non-public API handlers now perform a route-local authorization check.

## Decisions and guardrails for the next session

- Continue Milestone 5 one storage workflow at a time; do not start dashboard splitting.
- Do not modify application behavior until characterization tests exist for the target workflow.
- React Testing Library, user-event, and jsdom are installed as direct development dependencies for the first concrete component/keyboard tests. The Vite React plugin and E2E tooling remain deferred.
- E2E tooling remains deferred until a critical browser flow requires it.
- Do not add a generic repository/service/manager layer. Add only small helpers with multiple real callers or cohesive use-case functions extracted from existing handlers.
- Keep existing API paths during initial logic extraction.
- Do not touch production data or remove legacy fallbacks without explicit approval.
- Type boundaries as they are touched; do not attempt a mass `any` cleanup.
- Preserve or improve authorization, validation, accessibility, error handling, and storage safety in every step.

## Exact next-session starting point

1. Re-read this file and `Refactor Milestones.md`.
2. Continue Milestone 7.2 by extracting the student templates panel behind typed props and a component/keyboard test, without changing its fetch path or page URL.
3. Complete 7.2, 7.3, 7.4, and 7.5 before treating Milestone 7 as complete; do not begin additional Milestone 8 work first.
4. Keep API paths, user-visible messages, email content, and existing security checks unchanged.
5. Do not add a generic service layer, dependency, queue, production-data migration, or E2E suite.
6. Run tests, typecheck, touched-file lint, full lint baseline comparison, and production build; record results here.

## Milestone 1 progress

Completed in the current session:

- Added `npm run typecheck` using `tsc --noEmit --incremental false`.
- Added non-watch `npm test` using `vitest run`.
- Added Vitest as the only direct development dependency.
- Added 11 characterization tests in one file for late-registration timezone/fine boundaries, identity normalization and validation, roll-number normalization and regex escaping, canonical/legacy project domains, and supervisor slot clamping.
- Kept all application runtime files unchanged.

Deferred deliberately:

- React Testing Library/jsdom until the first component test.
- Stage-progress and R2-key tests until their duplicated production logic is extracted in a concrete milestone.
- Authorization and transaction characterization tests for routes not yet changed remain required before their corresponding refactors.

Validation for this slice:

- `npm test`: passed, 1 file and 11 tests.
- `npm run typecheck`: passed.
- `npx eslint tests/pure-helpers.test.ts`: passed.
- `npm run lint`: unchanged baseline failure, 224 problems (183 errors, 41 warnings); no new findings from the test file.
- `npm run build`: passed; the existing `middleware.ts` deprecation warning remains.
- `npm install` reported 6 dependency audit findings (4 moderate, 2 high). No automatic or breaking dependency fix was run because upgrades are outside this bounded refactoring slice.

## Milestone 5 progress

Latest completed sub-step (2026-07-20, `Portal-Overhaul`):

- Completed 5.1–5.5. `lib/r2Cleanup.ts` now owns the existing URL/bare-key normalization, deletion-target construction, and maximum-size deduplication. Reset, student supervisor-change, stage-advance, broadcast, and cron cleanup callers reuse it; no generic utility layer or dependency was added.
- Added the admin-only, read-only `GET /api/admin/storage-reconciliation` report. It paginates R2, compares its objects with project PDFs, voice notes, audio broadcasts, and the `usedBytes` ledger, and reports drift, missing references, unreferenced objects, size mismatches, and duplicate references. It performs no database or R2 mutation.
- `GET /api/voice` now only authorizes and reads notes. The secured cron route owns cleanup of played notes after ten minutes and stale notes after 24 hours, so a read request has no destructive side effects.
- Cleanup now normalizes/deduplicates, retries each R2 deletion once, and only then changes metadata and debits the clamped ledger. Failed retry exhaustion leaves the related metadata and ledger intact for the next secured cleanup/reconciliation attempt. This is still not cross-system atomic: an R2 deletion can succeed before a later MongoDB failure, but repeating the deletion is idempotent and reconciliation exposes the remaining inconsistency.
- Added focused R2 parsing/reconciliation/deletion, cron, broadcast, and academic-reset failure tests. `npm test` passed (24 files, 130 tests); `npm run typecheck` passed; focused lint for all new helpers, route, and tests passed; `git diff --check` passed; and `npm run build` passed outside the sandbox with the existing Next.js `middleware.ts` deprecation warning. Full lint remains a pre-existing baseline failure at 193 problems (156 errors, 37 warnings), improved from the recorded 198-problem baseline; touched legacy handlers retain their existing explicit-`any` debt and the new files are clean.
- Decision: no abandoned-presigned-upload cleanup was added because the new reconciliation report must first show that those objects are material. No production report was run and no production data was changed. The next concrete action is Milestone 6.1, beginning with a single characterized student dashboard action.

## Milestone 6 progress

Completed (2026-07-21, `Portal-Overhaul`):

- Completed 6.1–6.4. `POST /api/dashboard/student` now only connects, parses, dispatches, and responds. Its program/batch, assignment, supervisor-change, and project-submission actions live in `lib/studentDashboardActions.ts`; `POST /api/dashboard/supervisor` similarly delegates its status, migration, and removal actions to `lib/supervisorDashboardActions.ts` after unchanged route-local authorization.
- Added `tests/student-change-supervisor-route.test.ts` for spoofing, capacity rejection, successful cleanup, and cleanup failure. Expanded supervisor route coverage for removal and migration-code validation. Existing action response status/message/payload contracts, transactions, capacity reservations, and R2-before-metadata cleanup order were retained.
- `lib/dashboardEmailTemplates.ts` owns the two existing dashboard email bodies and has direct tests. Typed action request shapes now replace action-local broad inputs; no API error response was changed to a new public code format because preserving clients takes priority.
- Validation: `npm test` passed (34 files, 149 tests); `npm run typecheck` passed; focused lint for all new/changed helpers and tests passed; full `npm run lint` retains a pre-existing baseline of 158 problems (124 errors, 34 warnings), with no new findings in the new modules/tests; `git diff --check` passed; and the production build passed outside the sandbox after the sandbox build stalled. The existing Next.js `middleware.ts` deprecation warning remains. No production dependency, API path, payload, schema, or data migration was added.

## Milestone 7 and 8 progress

Current bounded slices (2026-07-21, `Portal-Overhaul`):

- Completed 7.1: `lib/adminReports.ts` now owns typed report-row conversion, CSV generation, and escaped printable HTML. `components/dashboards/admin/ReportsDialog.tsx` owns the reports UI behind typed props. Pure and rendered-contract tests cover report contents and disabled exports.
- Began 7.2: moved the project-submission domain picker into `components/dashboards/student/ProjectDomainSelector.tsx` with typed props. A jsdom keyboard test opens it with Space and selects a checkbox; the submitted domain payload is unchanged. Student templates, supervisor selection/change, academic settings, the supervisor feature splits, and `app/page.tsx` remain for Milestone 7.
- Completed safe parts of 8.1, 8.3, 8.4, and 8.5: deleted verified unused timeline/mailer backup/starter SVGs and unused SharedUI exports; one shared `ProjectTimeline` replaces the student/supervisor duplicates; `uploadAudioBlob` deduplicates the presigned audio-upload handshake; and seven reference-checked global CSS selectors were deleted. `SharedUI` is not yet split into cohesive modules and recorder/timer state is not yet shared, so Milestone 8 remains incomplete.
- Added React Testing Library, user-event, and jsdom as development-only dependencies when component keyboard coverage became concrete. `tests/dashboard-shell-interaction.test.tsx` verifies Escape closes the mobile menu and restores scroll state.
- Known risk: the larger dashboard/page feature files still contain their existing broad types and mixed responsibilities. No visual light/dark/mobile manual smoke was run in this terminal-only environment.

## Milestone 4 progress

Latest completed sub-step (2026-07-20, `Portal-Overhaul`):

- Completed Milestone 4.3–4.4. The shared count query alone allowed write skew: concurrent transactions could each observe one open slot while mutating different student/project records. Added the internal `User.capacityVersion` field and `reserveSupervisorCapacity`, which checks capacity and writes that shared supervisor document in the same transaction. A conflicting writer is retried through the existing `withTransactionRetry` helper and re-counts before it can write.
- Registration, student assignment/change, supervisor migration, and student-mode team joins now use that reservation. Their transactions now all use the existing retry wrapper; the supervisor-list route deliberately retains its equivalent bulk aggregation rather than introducing N+1 capacity queries.
- Added both STUDENT- and PROJECT-mode conflict characterizations: the losing transaction re-runs, sees the limit reached, and never acquires a second reservation. Added registration route coverage showing the reservation happens before student/project creation and a full supervisor creates neither record.
- Centralized `MAX_TEAM_MEMBERS`, project stage IDs/default, and program keys/default in `config/appSettings.ts`. Project/User schemas, templates, capacity UI, joins, registration, resets, and stage progression now consume those values while retaining existing labels, values, and program option order.
- Files changed: `lib/supervisorCapacity.ts`, `models/User.ts`, `app/api/register/route.ts`, `app/api/project/join/route.ts`, `app/api/dashboard/student/route.ts`, `app/api/dashboard/supervisor/route.ts`, `config/appSettings.ts`, `models/Project.ts`, `app/api/templates/route.ts`, `lib/academicReset.ts`, the three stage/team UI files, `tests/supervisor-slots-count.test.ts`, `tests/register-capacity-route.test.ts`, `tests/pure-helpers.test.ts`, and both milestone documents. No dependency, API path, payload, valid response, or production-data migration was added.
- Validation: `npm test` passed (19 files, 116 tests); `npm run typecheck` passed; capacity, registration, configuration, and focused route suites passed; new helper/config/model/test files are lint-clean. The touched legacy routes/components retain their recorded lint debt; `npm run lint` remains at 198 problems (161 errors, 37 warnings) with no new findings; `git diff --check` passed; and `npm run build` passed outside the sandbox with only the existing Next.js `middleware.ts` deprecation warning.
- Decisions: used a single persisted version counter instead of a new lock service, queue, dependency, or migration. The counter is created lazily by `$inc` for existing supervisors and is not exposed by route projections. The concurrency tests simulate MongoDB write conflicts through the transaction retry boundary; a live replica-set race test remains a future hardening option, not a reason to change the verified transaction semantics now.
- Known risk: a reservation's internal version increment is transactional and rolls back with any later workflow failure. Capacity still relies on the existing MongoDB transaction availability and does not solve cross-system R2/ledger failures, which are Milestone 5 work.

## Milestone 2 progress

Latest completed sub-step (2026-07-20, `Portal-Overhaul`):

- Completed Milestone 2.5 and the Milestone 2 gate. `POST /api/admin/promote-batch` and `GET /api/admin/students` previously relied exclusively on the network matcher; anonymous and non-admin callers could promote a whole batch or read student records directly. Both now reuse the existing server-only `requireRole(req, ['admin'])` assertion before database access.
- The protected Excel export route also relied exclusively on the matcher and trusted its `id` query parameter. It now uses the same assertion for supervisors/admins and binds supervisors to their own ID; admins retain cross-supervisor export access. The PDF-upload signer now locally allows only students/admins, so a supervisor cannot obtain a proposal-upload URL by bypassing the matcher.
- Closed the remaining actor-binding hole in the default `POST /api/dashboard/student` project-submission action. It now requires a matching student JWT before its target student record is read; the existing three named student actions were already actor-bound.
- Added five focused route suites (18 tests total) covering anonymous/wrong-role rejection, cross-supervisor export denial, student-ID spoofing, validation, and each retained valid flow. Pre-change tests reproduced ten authorization failures: anonymous/non-admin batch promotion and student listing, anonymous/wrong-role/cross-supervisor export, supervisor upload signing, and anonymous/wrong-role/spoofed student submission.
- Files changed: `app/api/admin/promote-batch/route.ts`, `app/api/admin/students/route.ts`, `app/api/export-pdf/route.ts`, `app/api/upload/route.ts`, `app/api/dashboard/student/route.ts`, `tests/admin-promote-batch-route.test.ts`, `tests/admin-students-route.test.ts`, `tests/export-pdf-route.test.ts`, `tests/upload-route.test.ts`, `tests/student-project-submission-auth-route.test.ts`, and both milestone documents. No dependency, route-path, schema, client-payload, or valid success-contract change was made.
- Validation: `npm test` passed (18 files, 110 tests); `npm run typecheck` passed; the newly added routes/tests passed targeted ESLint with no findings; the touched student dashboard retains 19 pre-existing `no-explicit-any` errors and 2 warnings, with no new lint finding on the changed lines; `npm run lint` remains a pre-existing baseline failure at 198 problems (161 errors, 37 warnings), improved from the prior recorded 203 problems; `git diff --check` passed; and `npm run build` passed outside the sandbox, with only the existing Next.js `middleware.ts` deprecation warning.
- Decision: retained the existing `requireRole` helper rather than a new authorization layer. Routes with project/resource ownership retain their specialized checks after authentication. The export route uses one direct token-ID comparison because it has one concrete caller and no reusable ownership rule.
- Known risk: the student dashboard still opens a database connection before selecting its action, although the default submission now rejects before reading or mutating the supplied student record. Refactoring that command dispatcher belongs to Milestone 6 and must preserve its action-specific contracts.

Latest completed sub-step (2026-07-19, `Portal-Overhaul`):

- Completed the next two bounded Milestone 2.5 route protections: `POST /api/supervisors/toggle-notifications` and `POST /api/admin/toggle-student`. Both routes previously trusted only the network matcher, so anonymous or non-admin direct calls could update any supplied supervisor notification setting or student activation state.
- Reused the existing server-only `requireRole(req, ['admin'])` assertion before request parsing or database access. Anonymous calls now receive 401 and non-admin calls 403; existing admin request bodies, successful response shapes/statuses, target selection, database mutations, and not-found handling remain unchanged.
- Added notification-toggle cases to `tests/admin-supervisor-routes.test.ts` and added `tests/admin-toggle-student-route.test.ts`. Files changed: `app/api/supervisors/toggle-notifications/route.ts`, `app/api/admin/toggle-student/route.ts`, those two test files, and both milestone documents. No dependency, route-path, schema, client-payload, or valid-contract change was made.
- Characterization evidence: before the route change, the focused suite failed four authorization assertions because both handlers returned 200 to anonymous and non-admin calls. Afterward it passed (2 files, 8 tests), including the valid admin mutations.
- Validation: `npm test` passed (13 files, 92 tests); `npm run typecheck` passed; touched-file ESLint passed; `git diff --check` passed; and `npm run build` passed outside the restricted sandbox with only the existing Next.js `middleware.ts` deprecation warning. The sandboxed build is unable to bind Turbopack's worker port. Full lint remains a pre-existing baseline failure at 203 problems (165 errors, 38 warnings), two warnings fewer than the prior recorded 205-problem baseline; no new findings were introduced and the changed files are clean.
- Decision and next action: keep `requireRole` as the single concrete local assertion rather than duplicate JWT parsing. Continue with `POST /api/admin/promote-batch` only after its route characterization; do not start a later milestone while Milestone 2.5 remains incomplete.
- Retained risk: remaining routes covered only by the network matcher still need local authorization. This step intentionally does not add target-domain validation or change user-visible error messages, which require their own bounded characterization.

- Began Milestone 2.5 with `POST /api/add-supervisor` and `POST /api/delete-supervisor`. Both handlers previously trusted only middleware, so direct route calls could create or delete supervisor accounts. Added the small server-only `requireRole` assertion and run it before parsing or database access; anonymous callers now receive 401, non-admin callers 403, and valid admin creation/deletion contracts and transaction operations are unchanged.
- Completed the remaining Milestone 3 gate. The academic-reset suite now covers shared-team departure without file deletion or ledger refund, student cooldown rejection before project state changes, fresh-project creation failure with transaction abort, admin partial-update messaging, and the nonnegative-ledger clamp. Existing direct helper and route tests cover reset state, solo cleanup/refund, student validation, success response, and actor binding.
- Added `tests/admin-supervisor-routes.test.ts`; expanded `tests/academic-reset.test.ts`. Files changed: `lib/routeAuth.ts`, `app/api/add-supervisor/route.ts`, `app/api/delete-supervisor/route.ts`, the two test files, and both milestone documents. No dependencies, route paths, schemas, client payloads, or valid success/error contracts were changed.
- Validation: `npm test` passed (12 files, 88 tests); `npm run typecheck` passed; targeted lint passed; `git diff --check` passed; `npm run build` passed with only the existing Next.js `middleware.ts` deprecation warning. Full lint remains a pre-existing baseline failure at 205 problems (165 errors, 40 warnings), down from 207 because the touched routes no longer use explicit `any`; no new findings were introduced.
- Retained risks: the remaining protected-only handlers still need local authorization in Milestone 2.5. Academic reset still spans MongoDB and R2 without cross-system atomicity, which belongs to Milestone 5. Milestone 4 concurrency work was intentionally not started because it is not a small improvement.

- Completed Milestone 3.1–3.3: added direct shared-helper tests for the student reset state, canonical `domains` clearing, fresh-project data, single-member PDF/voice cleanup deduplication, storage-ledger refund, validation, and student response mapping. Replaced the 160-line `updateProgramBatch` branch with the existing `resetStudentAcademicInfo` call while preserving student-only identity checks, required program/batch validation, status codes, error text, success text, cooldown, transaction, cleanup, and ledger behavior.
- Corrected the verified shared-state discrepancy: `resetStudentAcademicInfo` now explicitly creates fresh projects with `domains: []` and clears `student.domains`, matching the former student route and canonical domain policy. Branch-local reset helpers were removed; the remaining local project/cleanup functions still serve the separate supervisor-change workflow and were intentionally retained.
- Completed Milestone 4.1 and the per-target portion of 4.2: added `lib/supervisorCapacity.ts` with the existing mode-dependent `User`/`Project` count, including session forwarding. Registration, student assignment/change, supervisor migration, and the student-mode join capacity firewall now reuse it. The supervisor list retains its bulk aggregation because replacing it would introduce N+1 queries.
- Avoided an import cycle during final review by keeping schema normalization in the pure `lib/supervisorSlots.ts` module and placing database queries in the focused `lib/supervisorCapacity.ts` module; `models/User.ts` continues to import only the pure normalizer.
- Files changed: `app/api/dashboard/student/route.ts`, `app/api/dashboard/supervisor/route.ts`, `app/api/project/join/route.ts`, `app/api/register/route.ts`, `lib/academicReset.ts`, `lib/supervisorCapacity.ts`, `tests/academic-reset.test.ts`, `tests/student-academic-reset-route.test.ts`, `tests/supervisor-slots-count.test.ts`, and both milestone documents. The uncommitted join actor-binding change and its test were preserved and validated.
- Validation: focused Vitest suites passed (4 files, 11 tests); `npm test` passed (11 files, 80 tests); `npm run typecheck` passed; `npm run build` passed with the existing Next.js `middleware.ts` deprecation warning; `git diff --check` passed. Touched-file lint shows only 41 pre-existing errors and 2 warnings in older production files; all new files are clean. Full lint remains a pre-existing baseline failure at 207 problems (167 errors, 40 warnings), down from the previous 211 with no new findings.
- Known risk and deferral: academic reset still calls R2 within a MongoDB transaction, so cross-system cleanup cannot be atomic; this remains Milestone 5 work. Capacity has no concurrency characterization yet, and the bulk supervisor-list count intentionally remains separate. No dependency, schema, route-path, or client-contract change was added.

- Began Milestones 3 and 4 at the user's request. Milestone 3 confirmed the only known reset-state difference: the duplicated student branch clears `student.domains`, while `resetStudentAcademicInfo` currently does not. The planned one-line shared-function correction is deferred until a parity test can cover its transaction, project, file/voice cleanup, and ledger effects.
- Milestone 4 traced every capacity caller. Registration, student assignment/change, supervisor migration, project join, and supervisor listing all reuse `getSupervisorMaxSlots`, but each repeats the same `SLOT_CALCULATION_MODE` choice between counting matching students and matching projects. The smallest future extraction is that existing mode-dependent count only; capacity enforcement and transactions remain at their current call sites.
- No runtime code was changed in this investigation slice. The generated `next-env.d.ts` build artifact was restored to its tracked development reference.

- Began the next two roadmap milestones at the user's request: Milestone 2.4 now binds `POST /api/project/join` to the authenticated actor, and Milestone 3 investigation has traced the duplicate student academic-reset branch against `resetStudentAcademicInfo`.
- `app/api/project/join/route.ts` now verifies the local JWT before the database is contacted. Students may join only as themselves; admins retain the existing ability to act for a selected student; all other roles receive 403. The client request shape and valid join flow are unchanged.
- Added `tests/project-join-route.test.ts` with anonymous, wrong-role, and student-ID-spoofing cases. The pre-change test failed because all cases proceeded to the normal join path; it now passes.
- Milestone 3 finding: the student dashboard's `updateProgramBatch` branch duplicates validation, cooldown, transaction, project/voice/PDF cleanup, ledger update, and new-project creation from `lib/academicReset.ts`. The shared helper is already used by both admin routes, but parity tests—including canonical `domains` reset—must be added before deleting the branch.
- Checks: focused join tests passed (3 tests); `npm test` passed (8 files, 72 tests); `npm run typecheck` passed; the new test has no lint findings. The join route retains 7 pre-existing `no-explicit-any` errors; full lint remains the unchanged 211-problem baseline (171 errors, 40 warnings); `npm run build` compiled successfully outside the restricted sandbox, retaining the existing Next.js `middleware.ts` deprecation warning; `git diff --check` passed. Files changed in this slice: `app/api/project/join/route.ts`, `tests/project-join-route.test.ts`, and both milestone documents. No dependencies or schema changes were added.

- Secured the shared POST boundary in `app/api/dashboard/supervisor/route.ts` for its three existing student actions: `updateStatus`, `migrate`, and `removeStudent`.
- Added `tests/supervisor-dashboard-post-route.test.ts` with 9 characterisation tests. Before the route change, anonymous users, students, and a supervisor targeting another supervisor's student could reach the actions; after it, they receive 401 or 403 before the target student is read. The existing own-student and admin status-update paths remain successful.
- The route now reads the JWT locally, permits only supervisors and admins, and proves that a supervisor owns the target student. Admins retain their existing cross-supervisor authority. Migration repeats the ownership check inside its transaction to avoid authorising a stale assignment.
- Files changed: `app/api/dashboard/supervisor/route.ts`, `tests/supervisor-dashboard-post-route.test.ts`, `docs/Current Milestone.md`, and `docs/Refactor Milestones.md`. No dependency, route-path, schema, or client-contract change was added.
- Checks: focused Vitest suite passed (9 tests); `npm test` passed (7 files, 69 tests); `npm run typecheck` passed; `npx eslint app/api/dashboard/supervisor/route.ts tests/supervisor-dashboard-post-route.test.ts` reports 7 existing `no-explicit-any` errors in the route and none in the new test; `npm run lint` remains at the recorded baseline of 211 problems (171 errors, 40 warnings), with no new findings; `npm run build` compiled successfully outside the restricted sandbox and retained the existing Next.js `middleware.ts` deprecation warning; `git diff --check` passed.
- Risk retained: status advancement still combines database writes, R2 deletion, ledger changes, and notifications without cross-system atomicity. That behavior is intentionally unchanged and belongs to Milestone 5/6. The only deferred authorization work in this route is deeper workflow characterization, while the next concrete Milestone 2.4 target is `/api/project/join` actor binding.

Completed in the current session:

- Added `types/next-auth.d.ts`, using NextAuth's built-in module augmentation convention for the existing `id`, `role`, and `rollNo` session/JWT claims.
- Removed the five claim-related `any` casts in the NextAuth JWT and session callbacks without changing their runtime values.
- Replaced four unsafe App Router wrapper casts with a local `NextRequest` and documented route-context type. The installed NextAuth version still declares its handler as `any`, so no wider workaround was added.
- The declaration is exercised by the real login callbacks and `npm run typecheck`; no runtime test was added because this slice changes types only.
- Traced all four `/api/supervisors` consumers and recorded the exact fields needed by anonymous registration, the Student dashboard, the Supervisor dashboard, and the Admin dashboard.
- Added five route tests for anonymous, student, admin, own-supervisor, cross-supervisor, and database-projection behavior.
- Reproduced the existing leak before changing runtime code: the public response contained password, reset-code, email, roll-number, migration-code, notification, and internal fields because it spread the full `User` document.
- Limited the MongoDB query to `_id`, `name`, `rollNo`, `email`, `migrationCode`, `notificationsEnabled`, and `extraSlots`; password and reset fields are no longer loaded for this response.
- Replaced the document spread with explicit response objects. Anonymous and student callers receive only `_id`, `name`, `filledSlots`, `isFull`, and `maxSlots`.
- Preserved the Admin dashboard fields for authenticated admins. Authenticated supervisors receive `rollNo` and `migrationCode` only on their own record, so the existing dashboard continues to work without exposing other supervisors' codes.
- Changed the touched catch block from explicit `any` to `unknown`; this removed one existing lint error.
- Added 11 `GET /api/read-pdf` authorization tests covering anonymous and missing-key requests, valid project member/supervisor/admin access, cross-project PDF and voice-note denial, legacy student PDF access, and supervisor-broadcast access.
- Files changed for this sub-step: `app/api/read-pdf/route.ts`, `tests/read-pdf-route.test.ts`, `docs/Current Milestone.md`, and `docs/Refactor Milestones.md`.
- Replaced the authenticated-only file read with database-backed ownership checks before an R2 URL is signed. Project members and supervisors can read their own project files and voice notes; students can read only their assigned supervisor's broadcast; admins retain access to recorded resources.
- Preserved legacy PDFs stored only on a student record, including team and supervisor access when a project record exists.
- Kept the existing signed-URL response, cache headers, API path, key format, and five-minute expiry unchanged for authorized callers.
- Added no dependency, framework change, route rename, schema change, or new feature.
- Added six `GET /api/voice` route tests covering anonymous access, admin/wrong-role access, valid project-member and assigned-supervisor access, and cross-project student/supervisor access.
- Reproduced the authorization defect before the runtime change: all four unauthorized and cross-project cases returned `200` and could start the cleanup transaction.
- Added a route-local JWT role and Project membership check before the existing cleanup transaction. Only project-member students and the assigned supervisor can fetch notes or trigger cleanup.
- Preserved the required `projectId`, cleanup timing/query/order, R2 deletion, database deletion, ledger adjustment, population/sort, and successful response shape.
- Files changed for this sub-step: `app/api/voice/route.ts`, `tests/voice-route.test.ts`, `docs/Current Milestone.md`, and `docs/Refactor Milestones.md`.
- Added six POST tests covering anonymous and wrong-role denial, sender spoofing, cross-project denial, and valid member/supervisor writes.
- Added seven PATCH tests covering anonymous and wrong-role denial, missing and unknown note IDs, cross-project denial, and valid member/supervisor updates.
- Reproduced both mutation vulnerabilities before implementation: all four unauthorized POST cases returned `201`, and unauthorized/cross-project PATCH cases returned `200`.
- Reused one concrete route-local project-access predicate across GET, POST, and PATCH. POST now derives the persisted sender from the authenticated actor after rejecting mismatches; PATCH resolves the note's project before starting its expiry timer.
- Preserved the POST creation/ledger update and PATCH played timestamp/status/response behavior for valid project members and assigned supervisors.

Validation for this slice:

- `npx vitest run tests/supervisors-route.test.ts`: passed, 1 file and 5 tests.
- `npx vitest run tests/read-pdf-route.test.ts`: passed, 1 file and 11 tests.
- `npm test`: passed, 2 files and 16 tests.
- `npm run typecheck`: passed.
- `npx eslint app/api/auth/[...nextauth]/route.ts types/next-auth.d.ts`: passed.
- `npx eslint app/api/supervisors/route.ts tests/supervisors-route.test.ts`: passed.
- `npx eslint app/api/read-pdf/route.ts tests/read-pdf-route.test.ts`: passed.
- `npm test`: passed, 3 files and 27 tests.
- `npm run lint`: expected baseline failure, now 213 problems (172 errors, 41 warnings), down from 214 because this slice removed one explicit `any` from the file-read route.
- `npm run build`: passed and produced a fresh production build artifact; the existing `middleware.ts` deprecation warning remains.
- `git diff --check`: passed.
- Pre-change `npx vitest run tests/voice-route.test.ts`: failed as expected, 8 authorization/not-found failures and 10 existing/valid-flow passes.
- Post-change `npx vitest run tests/voice-route.test.ts`: passed, 1 file and 19 tests.
- `npm test`: passed, 4 files and 46 tests.
- `npm run typecheck`: passed.
- `npx eslint app/api/voice/route.ts tests/voice-route.test.ts`: passed with no findings.
- `npm run lint`: expected unchanged baseline failure, 212 problems (172 errors, 40 warnings); no new findings and changed files are clean.
- `npm run build`: passed outside the restricted sandbox; compilation, TypeScript, page generation, and all 20 static pages completed. The existing `middleware.ts` deprecation warning remains.
- `git diff --check`: passed.
- Pre-change `npx vitest run tests/voice-route.test.ts`: failed as expected, 4 unauthorized/cross-project failures and 2 valid-access passes.
- Post-change `npx vitest run tests/voice-route.test.ts`: passed, 1 file and 6 tests.
- `npm test`: passed, 4 files and 33 tests.
- `npm run typecheck`: passed.
- `npx eslint app/api/voice/route.ts tests/voice-route.test.ts`: passed with no findings.
- `npm run lint`: expected baseline failure, 212 problems (172 errors, 40 warnings); no new findings, and the touched route's existing unused catch-variable warning was removed.
- `npm run build`: passed outside the restricted sandbox; compilation, TypeScript, page generation, and all 20 static pages completed. The existing `middleware.ts` deprecation warning remains. The sandboxed attempt failed because Turbopack could not bind a local port (`Operation not permitted`).
- `git diff --check`: passed.

Known limits and risk:

- The route still serves both public and role-specific shapes at the same URL to avoid breaking three existing dashboards. The response branches are explicit and tested, but a future contract split may be worthwhile only when its clients are changed together.
- JWT roles are trusted in the same way as the current application middleware. Typed claims and route-local authorization for protected routes remain Milestone 2 work.
- Dashboard components still accept `session` through broad `any` props. Replacing those component props is deliberately deferred to their own bounded typing/refactoring work; this declaration makes the correct type available when that work begins.
- `read-pdf` can only sign keys represented by a Project, VoiceNote, recorded legacy student PDF, or active supervisor broadcast. Orphaned uploads are intentionally denied and remain a storage-reconciliation concern for Milestone 5.
- R2 URLs remain valid for five minutes after authorization. Revocation within that window would require a different delivery architecture and is out of scope.
- No live database or browser role smoke test was run; the test suite uses mocked route dependencies and the production build validates compilation.
- All handlers in `/api/voice` and its upload-presign route are protected; project-chat uploads are membership-bound while the existing supervisor broadcast flow remains supported.
- Added eight voice-upload route tests covering anonymous/wrong-role denial, required project and file-size validation, cross-project denial, valid member/assigned-supervisor access, and preserved supervisor broadcast uploads.
- Added six Supervisor dashboard GET tests covering anonymous/student denial, missing ID, own-supervisor access, cross-supervisor denial, and admin access.
- Reproduced six authorization defects before implementation: invalid-role/context upload requests and anonymous/student/cross-supervisor dashboard requests all returned `200`.
- Bound student voice presigning to Project membership and supervisor project-chat presigning to ownership; retained no-project supervisor presigning for the existing broadcast caller. `VoiceChat` now supplies its existing `projectId`.
- Added route-local JWT role and actor-ID checks to Supervisor dashboard GET before database access; supervisors can read only their own dashboard while admins retain explicit access.
- Files changed for these sub-steps: `app/api/voice/upload/route.ts`, `components/ui/VoiceChat.tsx`, `app/api/dashboard/supervisor/route.ts`, `tests/voice-upload-route.test.ts`, `tests/supervisor-dashboard-get-route.test.ts`, and both milestone documents.
- Pre-change focused tests: 6 authorization failures and 6 valid/existing-flow passes.
- Post-change focused tests: passed, 2 files and 14 tests.
- `npm test`: passed, 6 files and 60 tests.
- `npm run typecheck`: passed.
- `npx eslint app/api/voice/upload/route.ts tests/voice-upload-route.test.ts tests/supervisor-dashboard-get-route.test.ts`: passed.
- The changed lines in `app/api/dashboard/supervisor/route.ts` and `components/ui/VoiceChat.tsx` add no lint findings; those files retain 11 errors and 5 warnings from the recorded baseline.
- `npm run lint`: expected baseline failure, 211 problems (171 errors, 40 warnings), down by one error because the touched upload catch now uses `unknown`.
- `npm run build`: passed outside the restricted sandbox; compilation, TypeScript, page generation, and all 20 static pages completed. The existing `middleware.ts` deprecation warning remains.
- `git diff --check`: passed.

## Definition of done for Milestone 1

- A repeatable test command exists and runs non-interactively.
- Pure business-rule tests cover valid, invalid, and boundary cases.
- Protected route tests cover anonymous, wrong-role, correct-role, and cross-user access.
- Public supervisor JSON is characterized by a safe field allowlist before its implementation is changed.
- Typecheck and production build pass.
- Existing lint debt is recorded and the touched files introduce no new lint findings.
- This file is updated with completed steps, commands, decisions, and the next exact starting point.

## Commands already run

```text
npx tsc --noEmit --incremental false
npm run lint
npm run build
npm install --save-dev vitest
npm test
npm run typecheck
npx eslint tests/pure-helpers.test.ts
npx vitest run tests/supervisors-route.test.ts
npx vitest run tests/read-pdf-route.test.ts
npx eslint app/api/supervisors/route.ts tests/supervisors-route.test.ts
npx eslint app/api/read-pdf/route.ts tests/read-pdf-route.test.ts
npx eslint app/api/auth/[...nextauth]/route.ts types/next-auth.d.ts
git diff --check
```

Do not interpret the current passing typecheck as strong type safety: the lint baseline demonstrates that broad `any` bypasses much of strict TypeScript.
