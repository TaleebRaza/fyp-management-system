# Current Milestone

Last updated: 2026-07-19 (Asia/Karachi)

## Status

- Current milestone: Milestone 2 — Secure route-local boundaries.
- State: in progress; steps 2.1 and 2.3 plus file reads, all `/api/voice` handlers, voice upload presigning, Supervisor dashboard GET/POST, and project-join actor binding are complete in step 2.4. Step 2.5 has begun with local checks for supervisor creation and deletion.
- Current branch: `Portal-Overhaul`.
- Safety-net status: the test infrastructure and tests needed for this route are complete. The broader Milestone 1 authorization and transaction suites remain prerequisites before their corresponding protected workflows are changed.
- Application runtime source changes made in the current session: bounded route-local security changes, one shared academic-reset call, one shared supervisor-capacity query, and a small server-only role assertion; the NextAuth work is type-only.
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

1. Route authorization often depends on the root matcher; object-level ownership is missing or inconsistent in supervisor, join, and voice flows.
2. There are still no route or transaction tests around most destructive and cross-system operations.
3. Student academic reset duplicates the shared reset logic and has already diverged around canonical domains.
4. `User` and `Project` duplicate project state and can disagree.
5. MongoDB transactions and R2 mutations use inconsistent ordering/failure behavior; the global byte ledger can drift.
6. Voice GET has destructive hidden side effects.
7. Three dashboard components exceed 1,000 lines and mix UI with network/business/file behavior.

Resolved in the current slices: public `/api/supervisors` no longer returns whole supervisor documents; file and voice routes verify resource ownership; voice presigning is role/context bound; Supervisor dashboard GET no longer trusts a caller-supplied supervisor ID.

## Decisions and guardrails for the next session

- Continue Milestone 2 one tested route boundary at a time; do not start dashboard splitting.
- Do not modify application behavior until characterization tests exist for the target workflow.
- Vitest is installed as the only new direct development dependency. React Testing Library, jsdom, and the Vite React plugin remain deferred until the first concrete component test needs them.
- E2E tooling remains deferred until a critical browser flow requires it.
- Do not add a generic repository/service/manager layer. Add only small helpers with multiple real callers or cohesive use-case functions extracted from existing handlers.
- Keep existing API paths during initial logic extraction.
- Do not touch production data or remove legacy fallbacks without explicit approval.
- Type boundaries as they are touched; do not attempt a mass `any` cleanup.
- Preserve or improve authorization, validation, accessibility, error handling, and storage safety in every step.

## Exact next-session starting point

1. Re-read this file and `Refactor Milestones.md`.
2. Continue Milestone 2.5 with one protected-only handler at a time, starting with `POST /api/supervisors/toggle-notifications`; characterize anonymous, wrong-role, valid-admin, cross-supervisor, and valid-target behavior before adding its local admin assertion.
3. Keep the current `GET /api/voice` cleanup behavior unchanged; move its read-side mutation separately in Milestone 5.
4. Milestone 3 is complete. Do not reopen it without a specific reset behavior regression.
5. Milestone 4.2/4.3 remains explicitly deferred: its concurrency boundary tests are not a small improvement. Do not replace the supervisor-list bulk aggregation with per-supervisor queries.
6. Do not split dashboard components or add React component tooling during this security milestone.
7. Run tests, typecheck, touched-file lint, full lint baseline comparison, and production build; record results here.

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

## Milestone 2 progress

Latest completed sub-step (2026-07-19, `Portal-Overhaul`):

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
