# Refactoring Progress

## Current state

- Date: 2026-07-26
- Branch: `fyp-v2`
- Status: Milestones 0–9 complete; post-roadmap repository lint cleanup complete
- Roadmap progress: 100% (10 of 10 milestones complete)
- Current milestone: post-roadmap lint cleanup — complete
- Current sub-step: all 140 fresh lint findings resolved and validated
- Working tree: contains only the post-roadmap lint cleanup and its documentation updates

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
| 6. Admin dashboard | Complete | Extracted report, overview, supervisor, student, slot-editor, and headline presentation. |
| 7. Supervisor dashboard | Complete | Extracted typed project card, list/filter, overview, and detail-dialog presentation. |
| 8. UI type boundaries | Complete | Added narrow feature-owned types across the refactored frontend surface. |
| 9. Final product-quality pass | Complete | Audited residue and completed the final automated validation baseline. |

## Completed work

### 2026-07-26 — Post-roadmap repository lint cleanup

- Fresh baseline: `npm run lint` reported 140 findings (110 errors and 30 warnings) across 42 files.
- Result: `npm run lint` passes with zero errors and zero warnings; no lint rule or TypeScript strictness was disabled.
- Fixes: replaced explicit `any` at API, Mongoose-result, session, component-prop, and browser-timer boundaries; removed unused bindings; corrected hook dependencies and effect/state patterns; replaced three logo `<img>` elements with `next/image`; added the feature-specific NextAuth session/JWT augmentation in `types/next-auth.d.ts`.
- Behavior protected: API routes, methods, payloads, responses, status codes, database and storage operations, authentication/authorization/ownership checks, transaction handling, dialog defaults, browser drafts, theme/intro behavior, dashboard refreshes, microphone/broadcast flows, wording, and accessibility remain unchanged.
- Validation: `npm run lint` passed with no findings; `npx tsc --noEmit` passed with no output; the production build passed with a non-production localhost MongoDB placeholder and generated all 21 static pages; a local production request to `/` returned HTTP 200; `git diff --check` passed.
- Environment evidence: the sandboxed build retained the known Turbopack internal-port failure. An outside-sandbox build without `MONGODB_URI` compiled and passed TypeScript before route-data collection stopped; supplying only a localhost placeholder allowed full build validation. Missing R2 credential notices and the middleware deprecation notice are pre-existing environment/framework warnings.
- Tests: no tracked automated test suite exists; no production database or storage write was performed.
- New failures: none.
- Ponytail review: reused existing feature types, `ShowDialog`, `FineRestrictionSummary`, React state primitives, and installed Next/React capabilities. Added no dependency, service, generic helper module, state library, or lint suppression. The only new abstraction is the NextAuth module augmentation needed to type the existing session contract once. Security checks, validation, transactional cleanup, storage accounting, and error responses remain intact.
- Next action: review and commit this lint-cleanup diff, then run the authenticated staging checklist when admin, supervisor, and student staging credentials are available.

### 2026-07-26 — Milestone 9: final product-quality pass

- Scope: audited all new files and exports for callers, active compatibility aliases, stale comments, duplicate pure helpers, generic module names, dependency changes, forbidden server/config changes, and the complete Milestones 6–9 diff.
- Caller evidence: every new admin and supervisor component has a direct caller. `GlassCard` remains required by all three authentication flows. `Timeline` remains shared by student and supervisor presentation. No empty or zero-caller new file was found.
- Residue removed: made four feature-internal types private instead of exporting them and replaced the stale future-milestone theme comment with its current compatibility purpose. No runtime code was deleted without caller proof.
- Duplication decision: small program-label helpers remain feature-local because the supervisor version has different normalization behavior and moving the other copies into configuration would expand the approved boundary. Two local error-message helpers remain local instead of creating a generic utility module.
- Boundary proof: `package.json` and `package-lock.json` are unchanged; no dependency was added, removed, or upgraded. No API, database, model, storage, authentication, middleware, or Next.js production configuration file changed.
- Focused validation: all newly added admin/supervisor files plus the changed student fine/type files pass ESLint with no output. `npx tsc --noEmit` passes with no output. `git diff --check` passes.
- Production build: the final `npm run build` passed outside the restricted sandbox; Next.js compiled successfully and completed its TypeScript phase.
- Read-only smoke check: the final production landing page returned HTTP 200 from local port 3100; the server was stopped. No form or authenticated mutation was submitted.
- Repository lint comparison: final `npm run lint` reports 140 existing findings (110 errors and 30 warnings), improving the original 236-finding baseline (194 errors and 42 warnings). Changed presentation modules introduce no new lint failures.
- Product review: fetch paths/methods/payloads, auth assumptions, confirmations, validation, uploads/downloads, draft keys, storage behavior, role navigation, status actions, and responsive/accessibility markup were retained. No unexplained unrelated change remains.
- Remaining risk: the authenticated admin, supervisor, and student visual/keyboard checklist requires staging role credentials and was not claimed as executed; the documented checklist remains the handoff for staging. The build and anonymous smoke check are read-only.
- Ponytail review: reused existing UI/configuration and handlers, removed duplicated inline presentation, added only responsibility-named components and narrow feature types, introduced no dependency or generic state layer, and retained all security, validation, confirmation, and error handling.
- Exact next action: review and commit the validated Milestones 6–9 diff, then run the documented authenticated staging checklist when role credentials are available.

### 2026-07-26 — Milestone 8: frontend type boundaries

- Files changed: `components/dashboards/StudentDashboard.tsx`, `components/student/FinePaymentPanel.tsx`, and `components/student/studentDashboardTypes.ts`; Milestones 6–7 already typed their new admin and supervisor boundaries.
- Scope: audited every frontend file created or changed by Milestones 3–7 and replaced the remaining explicit `any` in the student dashboard surface with narrow session, dashboard-data, project, supervisor, fine, broadcast, and error types.
- Behavior protected: values are still read from the same responses, session field, and parent state; request bodies, route paths, validation, fine locks, draft persistence, uploads, and fallback messages remain unchanged. No runtime schema or cast-based validation was added.
- Changed-file lint: `FinePaymentPanel.tsx` and the type module are clean. `StudentDashboard.tsx` retains two existing effect errors and three existing hook warnings; no explicit `any` remains anywhere in the refactored Milestones 3–7 frontend surface.
- Type checking: `npx tsc --noEmit` passed with no output.
- Production build: `npm run build` passed outside the restricted sandbox and compiled successfully.
- Read-only smoke check: the production landing page returned HTTP 200 from local port 3100; the server was stopped without submitting student actions.
- Repository lint comparison: `npm run lint` reports 140 findings (110 errors and 30 warnings), improving the post-Milestone-7 result of 153 findings (123 errors and 30 warnings).
- New failures: none.
- Ponytail review: types describe only fields consumed by each feature; no global domain model, runtime validator, dependency, lint suppression, model change, or API change was introduced.
- Next action: perform Milestone 9's zero-caller/residue audit, verify dependency and forbidden-file boundaries, then run the complete validation baseline and read-only smoke test.

### 2026-07-26 — Milestone 7: supervisor dashboard split

- Files changed: `components/dashboards/SupervisorDashboard.tsx`; added `components/supervisor/SupervisorProjectCard.tsx`, `SupervisorProjectsSection.tsx`, `SupervisorOverviewSection.tsx`, `SupervisorProjectDialog.tsx`, and `supervisorDashboardTypes.ts`.
- Extraction order: moved the project card and its display helpers, list/filter presentation, overview/recent-project presentation, then the selected-project detail dialog.
- Parent responsibility: `SupervisorDashboard.tsx` retains fetching, filters, selected-project state, review actions, remarks/confirmations, migration, team expansion/removal, export, broadcast placement, and navigation. It is now 612 lines instead of 1,194.
- Behavior protected: review status payloads, optional remarks, migration validation and payloads, capacity/removal confirmations, spreadsheet export request/download, broadcast/voice components, filters/counts/badges, PDF links, timeline, wording, classes, and responsive layout remain unchanged.
- Boundary typing: added narrow project, member, dashboard, theme, queue, and stats types. Typed dialog callbacks now explicitly normalize the same string value the existing prompt component supplies.
- Changed-file lint: all five new supervisor files are clean. The parent retains one existing `react-hooks/set-state-in-effect` error and one existing dependency warning; it has no explicit `any` remaining.
- Type checking: `npx tsc --noEmit` passed with no output.
- Production build: `npm run build` passed outside the restricted sandbox and compiled successfully.
- Read-only smoke check: the production landing page returned HTTP 200 from local port 3100; the server was stopped without submitting supervisor actions.
- Repository lint comparison: `npm run lint` reports 153 findings (123 errors and 30 warnings), improving the post-Milestone-6 result of 179 findings (147 errors and 32 warnings).
- Tests: no tracked automated test suite exists; focused lint, TypeScript, production build, repository lint, diff checks, and read-only smoke validation were used.
- New failures: none.
- Ponytail review: reused `SharedUI`, `Timeline`, `VoiceChat`, `BroadcastWidget`, project-domain configuration, and all parent handlers. Added no dependency, service, hook, store, reducer, or generic workflow layer; retained confirmation, validation, authorization assumptions, and error handling.
- Next action: audit and replace explicit `any` only in frontend files touched by Milestones 3–7, using narrow feature-owned types without changing runtime behavior.

### 2026-07-26 — Milestone 6: admin dashboard split

- Files changed: `components/dashboards/AdminDashboard.tsx`; added `components/admin/AdminReports.tsx`, `AdminOverviewSection.tsx`, `AdminHeadlineSection.tsx`, `AdminSupervisorsSection.tsx`, `AdminStudentsSection.tsx`, and `adminDashboardTypes.ts`.
- Extraction order: moved browser-only report formatting/download presentation, overview statistics, supervisor management and slot editor, student management, then headline presentation.
- Parent responsibility: `AdminDashboard.tsx` retains every fetch, mutation, confirmation flow, pagination/filter state, report selection, and tab transition. It is now 964 lines instead of 1,832.
- Behavior protected: report rows, HTML/CSV text generation, Blob downloads, popup behavior, admin endpoints and payloads, destructive confirmations, supervisor slot limits, student pagination/filters, headline actions, wording, classes, and responsive layouts remain unchanged.
- Boundary typing: added narrow admin supervisor, student, reports, pagination, stats, and dashboard prop types. The typed dialog contract exposed three callbacks that could receive `undefined`; default empty strings preserve the dialog's existing runtime value and validation behavior.
- Changed-file lint: all six new admin files are clean. The parent retains two existing `react-hooks/set-state-in-effect` errors and nine existing warnings; it has no explicit `any` remaining.
- Type checking: `npx tsc --noEmit` passed with no output.
- Production build: `npm run build` passed outside the restricted sandbox and compiled successfully.
- Read-only smoke check: the production landing page returned HTTP 200 from local port 3100; the server was stopped without submitting admin actions.
- Repository lint comparison: `npm run lint` reports 179 findings (147 errors and 32 warnings), improving the post-Milestone-5 result of 205 findings (172 errors and 33 warnings).
- Tests: no tracked automated test suite exists; focused lint, TypeScript, production build, repository lint, diff checks, and the read-only smoke check were used.
- New failures: none.
- Ponytail review: reused `SharedUI`, existing configuration and handlers; added no dependency, hook, store, service, reducer, or generic utility. Report builders moved byte-for-byte apart from narrow input types. All authorization, validation, confirmation, and error-handling protections remain in place.
- Next action: begin Milestone 7 with the supervisor project-card presentation, leaving review/migration/removal handlers and selected-project state in the parent.

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

Review and commit the validated lint-cleanup and refactor diff, then run the documented authenticated staging checklist when admin, supervisor, and student staging credentials are available.

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
