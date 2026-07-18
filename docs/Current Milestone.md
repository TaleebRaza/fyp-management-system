# Current Milestone

Last updated: 2026-07-18 (Asia/Karachi)

## Status

- Current milestone: Milestone 2 — Secure route-local boundaries.
- State: in progress; steps 2.1 and 2.3 plus the `GET /api/read-pdf` portion of step 2.4 are complete.
- Current branch: `Portal-Overhaul`.
- Safety-net status: the test infrastructure and tests needed for this route are complete. The broader Milestone 1 authorization and transaction suites remain prerequisites before their corresponding protected workflows are changed.
- Application runtime source changes made in the current session: bounded changes to `app/api/supervisors/route.ts` and `app/api/read-pdf/route.ts`; the NextAuth work is type-only.
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

Resolved in the current slice: public `/api/supervisors` no longer returns whole supervisor documents, and `/api/read-pdf` now verifies ownership before signing an R2 URL.

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
2. Continue Milestone 2.4 with `GET /api/voice`: trace the existing cleanup transaction and add anonymous, wrong-role, correct-role, and cross-project tests before adding an authorization check.
3. Keep the current `GET /api/voice` cleanup behavior unchanged during its authorization slice; move its read-side mutation separately in Milestone 5.
4. Add a shared role/session assertion only when the selected work produces a second concrete caller; until then, keep the route-local check direct.
5. Do not split dashboard components or add React component tooling during this security milestone.
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

## Milestone 2 progress

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

Known limits and risk:

- The route still serves both public and role-specific shapes at the same URL to avoid breaking three existing dashboards. The response branches are explicit and tested, but a future contract split may be worthwhile only when its clients are changed together.
- JWT roles are trusted in the same way as the current application middleware. Typed claims and route-local authorization for protected routes remain Milestone 2 work.
- Dashboard components still accept `session` through broad `any` props. Replacing those component props is deliberately deferred to their own bounded typing/refactoring work; this declaration makes the correct type available when that work begins.
- `read-pdf` can only sign keys represented by a Project, VoiceNote, recorded legacy student PDF, or active supervisor broadcast. Orphaned uploads are intentionally denied and remain a storage-reconciliation concern for Milestone 5.
- R2 URLs remain valid for five minutes after authorization. Revocation within that window would require a different delivery architecture and is out of scope.
- No live database or browser role smoke test was run; the test suite uses mocked route dependencies and the production build validates compilation.

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
