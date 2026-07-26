# Refactoring Progress

## Current state

- Date: 2026-07-26
- Branch: `fyp-v2`
- Status: Milestones 0–5 complete; Milestone 6 ready
- Roadmap progress: 60% (6 of 10 milestones complete)
- Current milestone: Milestone 6 — split the admin dashboard
- Current sub-step: characterize the report formatting and download presentation boundary before extraction
- Working tree: contains only the planned Milestones 3–5 refactor and documentation changes

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
| 3. Shared project timeline | Complete | One behavior-equivalent timeline serves both dashboards. |
| 4. Landing and authentication page | Complete | Extracted dialog and authentication screens by responsibility. |
| 5. Student dashboard | Complete | Extracted six presentational boundaries; parent retains workflow state and side effects. |
| 6. Admin dashboard | Next | Extract reports and management views incrementally. |
| 7. Supervisor dashboard | Pending | Extract project list/card/detail views incrementally. |
| 8. UI type boundaries | Pending | Replace touched `any` boundaries without runtime changes. |
| 9. Final product-quality pass | Pending | Validate the complete refactor and remove leftovers. |

## Completed work

### 2026-07-26 — Milestone 5: student dashboard split

- Files changed: `components/dashboards/StudentDashboard.tsx`; added `components/student/ProjectDomainSelector.tsx`, `StudentOverviewSection.tsx`, `StudentProjectSubmissionSection.tsx`, `StudentTeamSection.tsx`, `StudentResourcesSection.tsx`, `StudentDashboardDialogs.tsx`, and `studentDashboardTypes.ts`.
- Extraction order: moved the project-domain selector, overview, project submission, team, resources/templates, then the supervisor-change, academic-update, and template-preview dialogs. TypeScript was checked after the first boundaries and after the complete extraction.
- Parent responsibility: `StudentDashboard.tsx` remains the single owner of fetching, mutations, draft and file persistence, uploads, secure URL construction, fine restrictions, template clipboard work, top-level state, and tab orchestration. It is now 1,116 lines instead of 2,223.
- Behavior protected: fetch URLs/methods/bodies/response handling, draft keys and timing, PDF type/size validation and upload, secure media links, fine locks, supervisor/team rules, academic reset warnings, template copying, field wording, disabled states, markup classes, responsive layout, and dialog actions remain unchanged.
- Boundary typing: added narrow student summary, supervisor, member, announcement, template, academic-form, and supervisor-option types beside the feature; no server, API, database, storage, authentication, or production configuration file changed.
- Changed-file lint: the new overview, project, team, resources, dialog, and type files are clean. The project-domain selector retains the existing `react-hooks/set-state-in-effect` finding that moved with its close-when-disabled behavior. The parent retains 14 existing errors and 3 existing warnings; no new lint finding was introduced.
- Type checking: `npx tsc --noEmit` passed with no output.
- Production build: `npm run build` passed outside the restricted sandbox; Next.js compiled successfully and completed its TypeScript phase.
- Read-only smoke check: the built landing page returned HTTP 200 from local port 3100; the server was then stopped. Authenticated student actions were not submitted.
- Repository lint comparison: `npm run lint` reports 205 findings (172 errors and 33 warnings), improving the post-Milestone-4 result of 213 findings (179 errors and 34 warnings).
- Tests: no tracked automated test suite exists, so no test file was added; type checking, production build, focused lint, repository lint, diff checks, and the read-only HTTP smoke check were used.
- New failures: none.
- Decisions and known risk: side-effect handlers intentionally stayed in the parent so extracting markup could not alter persistence, permissions, uploads, or destructive reset behavior. Authenticated visual and keyboard checks still require staging credentials.
- Ponytail review: reused `SharedUI`, `Timeline`, `VoiceChat`, project-domain configuration, and existing handlers; removed no safety logic; introduced only feature-named presentation components and one cohesive type file; added no hook, store, service, reducer, generic helper, or dependency. This is the smallest safe coherent split, and no new component should be removed or merged.
- Next action: begin Milestone 6 by characterizing the admin dashboard's pure report formatting and download presentation, leaving authorization, requests, and mutations in the parent.

### 2026-07-26 — Milestone 4: landing and authentication page split

- Files changed: `app/page.tsx`; added `app/_components/PortalDialog.tsx`, `components/auth/LoginView.tsx`, `components/auth/RegisterView.tsx`, and `components/auth/PasswordResetFlow.tsx`.
- Extraction order: moved the page-owned dialog first and validated TypeScript; then extracted sign-in, registration (with its private select), and password recovery as feature-owned components.
- Parent responsibility: `app/page.tsx` remains the single owner of session/role selection, dynamic dashboard loading, intro flow, theme state, registration-policy loading, supervisor loading, dialog state, navigation, and view switching. It is now 308 lines instead of 1,081.
- Behavior protected: dynamic imports, form field names, validation order and messages, `signIn` behavior, fetch paths/methods/headers/bodies, loading states, registration-policy refresh, dialog close/confirm behavior, markup/classes, and visible wording remain unchanged.
- Boundary typing: added narrow dialog, registration-supervisor, select-option, and component prop types beside their owning features; no new explicit `any` was introduced.
- Changed-file lint: the new login, registration, and password-reset files add no errors. The existing `<img>` warning moved with the login markup; the existing dialog reset effect and three page orchestration effects retain their known `react-hooks/set-state-in-effect` findings.
- Type checking: `npx tsc --noEmit` passed with no output.
- Production build: `npm run build` passed outside the restricted sandbox and generated all 21 static pages.
- Read-only smoke check: the built landing page returned HTTP 200 from local port 3100; the server was then stopped. Form submission and authenticated role checks remain staging-only.
- Repository lint comparison: `npm run lint` reports 213 findings (179 errors and 34 warnings), improving the post-Milestone-3 result of 234 by removing explicit `any` and unused-import findings from the extracted code.
- New failures: none.
- Ponytail review: reused existing `GlassCard`, `StyledInput`, registration-policy types, and page orchestration; added no service, hook, form library, dependency, or generic helper; the four extracted files each own one real UI responsibility.
- Next action: characterize and extract the student dashboard's presentational sections while retaining all data fetching, mutations, draft persistence, uploads, and top-level state in the parent.

### 2026-07-26 — Milestone 3: shared project timeline

- Files changed: `components/ui/Timeline.tsx`, `components/dashboards/StudentDashboard.tsx`, and `components/dashboards/SupervisorDashboard.tsx`.
- Characterized behavior: both dashboards use Proposal, Thesis Draft, and Final Deliverables; unknown stages fall back to Proposal; progress is 33%, 67%, or 100%; markup, icons, colors, spacing, and horizontal overflow were identical. Only the description wording differed.
- Reuse: replaced the unused timeline implementation in place with the active dashboard markup, stage definition, label helper, and progress calculation; both dashboard callers now use it.
- Behavior protected: stage values, fallback, percentages, DOM semantics, icons, styling, responsive overflow, student wording, and supervisor wording remain unchanged.
- Incremental validation: after replacing the student caller, `npx tsc --noEmit` passed and the new timeline module was lint-clean; the student dashboard retained only its existing findings. The supervisor caller was replaced only after that result.
- Changed-file lint: the shared timeline introduced no finding; the two dashboards retain their pre-existing `any`, hook, and unused-import findings.
- Type checking: `npx tsc --noEmit` passed with no output after both callers were migrated.
- Production build: `npm run build` passed outside the restricted sandbox and generated all 21 static pages.
- Read-only smoke check: the built landing page returned HTTP 200 from local port 3100; the server was then stopped. Authenticated timeline checks still require staging role credentials.
- Repository lint comparison: `npm run lint` reports 234 findings (193 errors and 41 warnings), improving the 236-finding baseline because the old unused timeline's explicit `any` and unused prop were removed.
- New failures: none.
- Ponytail review: removed both duplicate timeline components and constants, reused the existing `Timeline.tsx` boundary, added no dependency or generic workflow/theme abstraction, and retained all security, validation, accessibility, and error-handling code.
- Next action: extract the existing page-owned dialog presentation from `app/page.tsx`, preserving its state contract.

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

Begin Milestone 6 only: characterize the admin dashboard's pure report formatting and download presentation before editing, keeping authorization, requests, and mutations in the parent.

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
