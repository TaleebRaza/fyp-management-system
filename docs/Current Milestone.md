# Current Milestone

Last updated: 2026-07-18 (Asia/Karachi)

## Status

- Current milestone: Milestone 0 — Audit and working context.
- State: complete after final build validation is recorded below.
- Next milestone: Milestone 1 — Establish the safety net.
- Application source changes made in this session: none.
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
- Tests: none found; `package.json` has no test script.
- Broad typing: 176 textual `any` uses; ESLint reports 173 `no-explicit-any` errors.
- Typecheck: `npx tsc --noEmit --incremental false` passed.
- Lint: `npm run lint` failed with 224 problems (183 errors, 41 warnings): 173 explicit-any, 34 unused-vars, 10 set-state-in-effect, 4 exhaustive-deps, and 3 no-img-element findings.
- Production build: `npm run build` passed outside the restricted sandbox. Compilation, TypeScript, page-data collection, and all 20 static pages completed. The build reports the expected Next.js 16 `middleware.ts` deprecation warning.
- Working tree at session start already contained a user-owned `.gitignore` modification. It was preserved; only the `docs/` entry was appended.

## Highest-priority risks

1. Public `/api/supervisors` returns whole supervisor documents without a safe field projection.
2. Route authorization often depends on the root matcher; object-level ownership is missing or inconsistent in supervisor, join, voice, and file-read flows.
3. There are no tests around destructive and cross-system operations.
4. Student academic reset duplicates the shared reset logic and has already diverged around canonical domains.
5. `User` and `Project` duplicate project state and can disagree.
6. MongoDB transactions and R2 mutations use inconsistent ordering/failure behavior; the global byte ledger can drift.
7. Voice GET has destructive hidden side effects.
8. Three dashboard components exceed 1,000 lines and mix UI with network/business/file behavior.

## Decisions and guardrails for the next session

- Start with Milestone 1, not dashboard splitting.
- Do not modify application behavior until characterization tests exist for the target workflow.
- Use the smallest current Next.js-supported test setup. Start with Vitest/React Testing Library; defer E2E tooling until a critical browser flow requires it.
- Do not add a generic repository/service/manager layer. Add only small helpers with multiple real callers or cohesive use-case functions extracted from existing handlers.
- Keep existing API paths during initial logic extraction.
- Do not touch production data or remove legacy fallbacks without explicit approval.
- Type boundaries as they are touched; do not attempt a mass `any` cleanup.
- Preserve or improve authorization, validation, accessibility, error handling, and storage safety in every step.

## Exact next-session starting point

1. Re-read this file and `Refactor Milestones.md`.
2. Confirm the worktree diff so the user's existing `.gitignore` changes remain isolated.
3. Add `typecheck` and non-watch `test` scripts.
4. Add the minimal Vitest/React Testing Library configuration.
5. Add the first characterization tests for existing pure modules: late-registration fine, student identity, roll number normalization, project domains, and supervisor slots.
6. Add authorization tests before changing `/api/supervisors` or any protected handler.
7. Run typecheck, lint, tests, and production build; record results here.

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
```

Do not interpret the current passing typecheck as strong type safety: the lint baseline demonstrates that broad `any` bypasses much of strict TypeScript.
