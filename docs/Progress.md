# Refactoring Progress

## Current state

- Date: 2026-07-26
- Branch: `fyp-v2`
- Status: first three milestones complete (0–2); Milestone 3 ready
- Roadmap progress: 30% (3 of 10 milestones complete)
- Current milestone: Milestone 3 — consolidate the project timeline
- Current sub-step: characterize both active timelines before changing either caller
- Working tree before this documentation step: clean

## Objective

Make the portal easier to maintain and present as a professional product without changing what production users observe.

The refactor may remove dead code, consolidate duplicate presentation logic, improve type boundaries, and split oversized frontend files by responsibility. It must not redesign working features or alter production data behavior.

## Non-negotiable protections

- Do not change database schemas, models, indexes, queries, transactions, migrations, or persisted values.
- Do not change storage keys, uploads, downloads, deletion behavior, cleanup jobs, or storage accounting.
- Do not run write-oriented validation against the production database or production storage.
- Do not change API routes, request bodies, response bodies, status codes, authentication, authorization, or ownership checks.
- Do not change visible behavior, wording, accessibility, navigation, or user workflows unless separately approved.
- Do not add or upgrade dependencies without explicit approval.
- Do not weaken validation, security, error handling, lint rules, or type checking.
- Do not combine refactoring with feature work.
- Every implementation step must remain independently buildable and reversible.

## Audit baseline

The 2026-07-26 read-only audit found:

- Approximately 16,533 tracked TypeScript, TSX, JavaScript, CSS, and configuration lines.
- The largest frontend files are:
  - `components/dashboards/StudentDashboard.tsx` — 2,223 lines
  - `components/dashboards/AdminDashboard.tsx` — 1,832 lines
  - `components/dashboards/SupervisorDashboard.tsx` — 1,261 lines
  - `app/page.tsx` — 1,081 lines
  - `components/ui/SharedUI.tsx` — 1,001 lines
- A tracked one-off `temp` data dump contains 1,095 lines.
- `tsconfig.tsbuildinfo` is a tracked generated build artifact.
- `lib/mailer-resend-backup.ts` is a fully commented backup implementation.
- `components/ui/Timeline.tsx` has no callers.
- Several exports in `components/ui/SharedUI.tsx` have no callers.
- Student and supervisor dashboards contain near-identical project timeline implementations.
- Several pure frontend display helpers are duplicated.
- All declared production dependencies have active callers; no dependency removal is currently justified.
- No tracked automated test files were found.
- The repository-wide lint baseline is not clean. Exact current counts must be recorded during Milestone 0 before editing application code.

Database- and storage-related duplication was observed during the audit but is explicitly out of scope under the current safety boundary.

## Milestone status

| Milestone | Status | Result |
|---|---|---|
| 0. Protected baseline | Complete | Baseline and read-only smoke checklist recorded. |
| 1. Repository hygiene | Complete | Removed verified artifacts and dead backup code. |
| 2. Dead frontend surface | Complete | Removed seven verified zero-caller UI exports. |
| 3. Shared project timeline | Next | Keep one behavior-equivalent frontend timeline. |
| 4. Landing and authentication page | Pending | Split `app/page.tsx` by existing UI responsibility. |
| 5. Student dashboard | Pending | Extract presentational sections incrementally. |
| 6. Admin dashboard | Pending | Extract reports and management views incrementally. |
| 7. Supervisor dashboard | Pending | Extract project list/card/detail views incrementally. |
| 8. UI type boundaries | Pending | Replace touched `any` boundaries without runtime changes. |
| 9. Final product-quality pass | Pending | Validate the complete refactor and remove leftovers. |

## Completed work

### 2026-07-26 — Milestone 2: dead frontend surface

- File changed: `components/ui/SharedUI.tsx`.
- Removed exports: `Input`, `TableShell`, `DetailRow`, `TagList`, `MobileSafeTable`, `TableHeadCell`, and `TableCell`; also removed the private `TableShellProps` type that became unused.
- Caller evidence: source searches immediately before and after deletion found no imported, dynamic, namespace, barrel-file, or property access to these exports. The active local `DetailRow` in `components/student/FinePaymentPanel.tsx` is separate and remains unchanged.
- Behavior protected: no active markup, styling, props, accessibility behavior, APIs, database/storage behavior, authentication, authorization, or production configuration changed.
- Changed-file lint: `npx eslint components/ui/SharedUI.tsx` passed with 0 errors and the same existing `@next/next/no-img-element` warning (now reported at line 622).
- Type checking: `npx tsc --noEmit` passed with no output.
- Production build: `npm run build` passed outside the restricted sandbox and generated all 21 static pages.
- Read-only smoke check: started the production build locally on port 3100 and `curl --fail --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3100/` returned HTTP 200; the server was then stopped. Authenticated role checks require staging credentials and remain in the checklist.
- Repository lint comparison: `npm run lint` still reports exactly 236 findings (194 errors and 42 warnings), matching the baseline.
- New failures: none.
- Decision: no replacement abstraction was added because these components had no callers.
- Ponytail review: reused the active `StyledInput` and local fine-payment `DetailRow` instead of replacing them; removed 1,262 tracked artifact/dead-code lines; introduced no abstraction or dependency; retained all security, validation, authorization, accessibility, and error-handling code; no further in-scope simplification is justified.
- Next action: characterize the student and supervisor timelines for Milestone 3 before editing either implementation.

### 2026-07-26 — Milestone 1: repository hygiene

- Files changed: `.gitignore`; deleted `temp`, `tsconfig.tsbuildinfo`, and `lib/mailer-resend-backup.ts`.
- Caller evidence: repository source search found no reference to the mailer backup or the one-off data export.
- Generation evidence: `tsconfig.tsbuildinfo` changed after both TypeScript and production build validation and is covered by the narrow `*.tsbuildinfo` ignore rule.
- Behavior protected: active mail delivery, dependencies, lockfile, application behavior, database/storage behavior, APIs, and production configuration remain unchanged.
- Checks: `npx tsc --noEmit` passed; `npm run build` passed outside the restricted sandbox and generated all 21 static pages.
- Changed-file lint: not applicable because this milestone changed only an ignore rule and removed non-executing files.
- Existing baseline failure: repository lint remains 194 errors and 42 warnings; no lint rule or failing source was touched.
- New failures: none.
- Decision: no broader ignore rules were added, so legitimate source and product documentation remain visible.
- Next action: remove only the seven re-verified zero-caller exports from `components/ui/SharedUI.tsx`.

### 2026-07-26 — Milestone 0: protected baseline

- Branch and commit: `fyp-v2` at `443dc1572fa90a66a4f40ca3f9f3dbeb7fbe86d6`.
- Starting Git state: application tree clean; `docs/` was untracked documentation supplied for this refactor.
- Locked install: `npm ci` succeeded and installed 639 packages; dependency deprecation and blocked install-script warnings were reported, with no lockfile change.
- Repository lint baseline: `npm run lint` failed with 236 findings (194 errors and 42 warnings); 1 warning was reported as potentially fixable.
- TypeScript baseline: `npx tsc --noEmit` passed with no output.
- Production build baseline: the sandboxed run failed because Turbopack could not bind an internal port (`Operation not permitted`); the same `npm run build` command passed outside the restricted sandbox with all 21 static pages generated.
- Build side effects: `next-env.d.ts` and `tsconfig.tsbuildinfo` were regenerated. The `next-env.d.ts` change was restored; `tsconfig.tsbuildinfo` is the generated artifact targeted by Milestone 1.
- No application code, database/storage behavior, API contract, dependency, or production configuration changed.

#### Read-only staging smoke checklist

- Anonymous: open landing, sign-in, registration, forgot-password, and reset-password screens; verify navigation, validation display, and dialog close behavior without submitting any form.
- Admin: sign in with a staging admin account; open dashboard overview, supervisors, students, registration, fines, and report read views; do not add, edit, delete, toggle, promote, download, or submit.
- Supervisor: sign in with a staging supervisor account; open overview, project list, filters, project details, broadcasts, and voice history; do not approve, reject, migrate, remove, broadcast, upload, or submit.
- Student: sign in with a staging student account; open overview, project, team, resources, templates, fine, and supervisor details; do not join, register, upload, pay, request changes, or submit.
- Appearance and access: repeat representative screens in light and dark modes, keyboard through visible controls, close dialogs with their existing controls, and check narrow mobile widths for unintended horizontal page overflow.
- Data safety: use staging-only accounts and read views; do not run this checklist against production and do not trigger any write-oriented action.

### 2026-07-26 — roadmap initialization

- Created `docs/Progress.md`.
- Created `docs/Milestones.md`.
- Recorded the audit evidence and production safety boundary.
- Changed no application code, dependencies, database behavior, or storage behavior.

## Validation log

### Documentation initialization

- Git branch checked: `fyp-v2`.
- Initial Git status: clean.
- Documentation reviewed for forbidden database, storage, API, dependency, and production behavior changes.
- Application validation not required because this step changes Markdown only.

## Known risks and constraints

- The large server route files include database and storage responsibilities. They remain untouched even where duplication exists.
- Frontend extraction can still cause rendering, state, focus, or accessibility regressions. Extract one responsibility at a time and preserve markup and props.
- There is no tracked automated test suite. Until one exists, production build, type checking, changed-file linting, and a role-based staging smoke test are required safeguards.
- `AGENTS.md` currently names `docs/Current Milestone.md` and `docs/Refactor Milestones.md`, while the requested roadmap files are `Progress.md` and `Milestones.md`. Reconcile those names before relying on automated session-start instructions.

## Exact next action

Begin Milestone 3 only: characterize stage values, progress calculations, styling, responsive overflow, and wording in both active timeline implementations and in `components/ui/Timeline.tsx` before replacing the first caller.

## Explicitly deferred

- Database models, indexes, query behavior, and transaction refactors.
- Storage clients, object-key parsing, cleanup, uploads, downloads, and ledger refactors.
- Academic-reset and project-lifecycle server refactors.
- API consolidation or route renaming.
- Slot-counting policy changes.
- Next.js, Sentry, authentication, or dependency upgrades.
- New features or visual redesign.

## Update template

After each completed sub-step, append:

- Date and branch
- Milestone and exact sub-step
- Files changed
- Behavior protected
- Checks run and exact results
- Existing baseline failures
- New failures introduced, if any
- Decisions and known risks
- Exact next action
- Explicitly deferred work
