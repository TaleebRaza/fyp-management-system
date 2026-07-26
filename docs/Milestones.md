# Refactoring Milestones

## Goal

Turn the existing portal into a cleaner, product-quality codebase while preserving the production application exactly as users depend on it today.

This roadmap favors deletion, reuse, and small responsibility-based frontend modules. File size alone is not a reason to split code; each extraction must create a clear ownership boundary and reduce the amount of context needed to make a safe change.

## Permanent scope boundary

### Allowed

- Delete files and exports proven to have no callers.
- Remove tracked local or generated artifacts.
- Consolidate duplicate frontend presentation logic.
- Extract existing frontend markup into named feature components.
- Move existing frontend types alongside the feature that owns them.
- Replace `any` at touched UI boundaries with behavior-neutral types.
- Improve names and remove stale comments when behavior is unchanged.
- Add small characterization checks using tools already available in the repository.

### Forbidden

- Database schema, model, index, migration, query, transaction, or persistence changes.
- Any script or test that writes to the production database.
- Storage upload, download, key, deletion, cleanup, or accounting changes.
- Any script or test that writes to production storage.
- API path, method, payload, response, status-code, or caching changes.
- Authentication, authorization, ownership, rate-limit, or security reductions.
- Dependency additions, removals, or upgrades without separate approval.
- Feature work, redesigns, copy changes, or workflow changes mixed into refactoring.
- Production configuration changes without a separate approved milestone.

If a proposed cleanup crosses a forbidden boundary, stop and record it as deferred. Do not disguise behavior work as refactoring.

## Required workflow for every sub-step

Before editing:

1. State the current milestone and exact sub-step.
2. Describe current behavior and every caller in scope.
3. Confirm the change does not touch database, storage, API contracts, or production configuration.
4. Assign a risk level.
5. State the smallest coherent change.
6. State what must remain unchanged.
7. List checks that will prove it.

After editing:

1. Run changed-file linting.
2. Run type checking.
3. Run the production build.
4. Run the relevant read-only or staging smoke checks.
5. Compare results with the recorded baseline.
6. Review the diff for behavior, accessibility, security, and interface regressions.
7. Update `docs/Progress.md` before starting another sub-step.

Do not claim success when a check fails. Separate existing baseline failures from failures introduced by the current change.

## Completion standard

A sub-step is complete only when:

- Observable behavior is unchanged.
- No forbidden database or storage code changed.
- Public component and API interfaces remain stable unless all internal callers were updated in the same step.
- Relevant checks were run and recorded exactly.
- Changed files introduce no new lint or type failures.
- The production build succeeds at least as well as the baseline.
- No unrelated edits remain.
- The diff is the smallest safe coherent change.
- `docs/Progress.md` identifies the next bounded action.

## Milestone 0 — Establish the protected baseline

Status: Complete

Purpose: make later cleanup measurable and prevent existing failures from being mistaken for regressions.

### Steps

- Record the current branch, commit, and Git status.
- Run the lockfile-based dependency install command.
- Run and record:
  - repository lint
  - TypeScript type checking
  - production build
- Record exact existing failures without changing application code.
- Confirm whether build commands modify generated tracked files; restore those generated changes after recording the result.
- Create a read-only staging smoke checklist covering:
  - anonymous landing, sign-in, registration, and password-reset screens
  - admin dashboard navigation and read views
  - supervisor dashboard navigation and project read views
  - student dashboard navigation and project read views
  - light and dark modes
  - keyboard focus, dialog close behavior, and mobile overflow
- Do not submit forms that mutate production data.

### Exit criteria

- Exact lint, type-check, and build baselines are in `docs/Progress.md`.
- The smoke checklist is concrete and contains no production writes.
- Milestone 1 is confirmed as the next action.

## Milestone 1 — Repository hygiene

Status: Complete

Risk: Low

Purpose: remove files that are not part of the product.

### Steps

1. Verify `temp` has no callers and is a one-off data export, then delete it.
2. Verify `tsconfig.tsbuildinfo` is generated, untrack it, and add `*.tsbuildinfo` to `.gitignore`.
3. Verify `lib/mailer-resend-backup.ts` has no callers and contains only commented backup code, then delete it.
4. Keep dependency, build, IDE, environment, and local-tool ignore rules narrow enough that legitimate source and product documents remain visible.

### Must remain unchanged

- Application and build behavior.
- Active mail delivery implementation.
- Dependencies and lockfile.

### Exit criteria

- Only confirmed artifacts and dead backup code are removed.
- No tracked source file is accidentally ignored.
- Baseline validation results do not regress.

## Milestone 2 — Remove dead frontend surface

Status: Complete

Risk: Low

Purpose: reduce the shared UI API before reorganizing it.

### Candidate exports

Re-verify zero callers immediately before deletion:

- `Input`
- `TableShell`
- `DetailRow`
- `TagList`
- `MobileSafeTable`
- `TableHeadCell`
- `TableCell`

Delete candidates one coherent group at a time. Do not delete an export solely because static search missed a dynamic or barrel-file reference.

### Must remain unchanged

- Rendered markup and styling of every active component.
- Active `SharedUI` exports and their prop contracts.
- Accessibility behavior.

### Exit criteria

- Every removed export has caller evidence recorded.
- Active UI behavior and the production build match the baseline.

## Milestone 3 — Consolidate the project timeline

Status: Complete

Risk: Medium

Purpose: replace the near-identical student and supervisor timeline implementations with one frontend component.

### Steps

1. Characterize both current timelines:
   - stage order and labels
   - progress calculation
   - completed, active, and future-state styling
   - responsive overflow behavior
   - surrounding title and description text
2. Replace the unused implementation in `components/ui/Timeline.tsx` with the shared current behavior; do not delete and later recreate the module.
3. Keep the shared stage definition and progress calculation in that specifically named timeline module.
4. Make textual differences explicit props; do not introduce a theme framework or generic workflow engine.
5. Replace one dashboard caller first and validate it.
6. Replace the second caller only after the first is stable.
7. Remove the duplicated functions and constants.

### Must remain unchanged

- Stage values and progress percentages.
- Existing DOM semantics, icons, colors, spacing, and responsive behavior.
- Student and supervisor wording.

### Exit criteria

- One timeline implementation serves both existing callers.
- No speculative configuration or dependency is introduced.

## Milestone 4 — Split the landing and authentication page

Status: Complete

Risk: Medium

Target: `app/page.tsx`

Purpose: separate existing screen responsibilities while keeping session and navigation orchestration obvious.

### Extraction order

1. Extract the existing dialog presentation into a page-owned component without changing its state contract.
2. Extract the sign-in view.
3. Extract the registration view.
4. Extract the password-reset flow as one cohesive feature component.
5. Keep session selection, dashboard loading, top-level navigation, and view switching in `app/page.tsx` until a later extraction is clearly smaller.

### Rules

- Preserve dynamic dashboard imports.
- Preserve form field names, validation timing, messages, fetch calls, and dialog behavior.
- Keep feature-specific types beside the extracted feature; do not create a generic `utils` or `common` module.
- Do not redesign the page while moving it.

### Exit criteria

- `app/page.tsx` reads as page orchestration rather than several complete screens.
- Each new file owns a real screen or flow.
- No API or authentication behavior changes.

## Milestone 5 — Split the student dashboard

Status: Complete

Risk: Medium

Target: `components/dashboards/StudentDashboard.tsx`

Purpose: reduce the largest frontend file through presentational boundaries only.

### Extraction order

1. Project-domain selector.
2. Overview section.
3. Project submission section.
4. Team section.
5. Resources/templates section.
6. Academic-update, supervisor-change, and template dialogs.

Keep data fetching, mutation handlers, draft persistence, and top-level state in the parent until a child has a narrow, stable prop contract. Do not move server behavior or storage logic.

### Must remain unchanged

- Existing fetch URLs, methods, bodies, and response handling.
- Draft keys and browser persistence behavior.
- Upload flow and secure media URLs.
- Fine restrictions and disabled states.
- Accessibility and responsive layout.

### Exit criteria

- Extracted modules are feature-named presentational components.
- No generic state-management layer, service layer, or custom hook is added merely to reduce line count.
- The parent still makes the complete student workflow easy to trace.

## Milestone 6 — Split the admin dashboard

Status: Not started

Risk: Medium

Target: `components/dashboards/AdminDashboard.tsx`

Purpose: separate reporting and management views without changing administrative behavior.

### Extraction order

1. Pure report formatting and download presentation.
2. Overview statistics view.
3. Supervisor-management view and slot editor dialog.
4. Student-management view and its dialogs.
5. Headline management view.

Keep existing request handlers and endpoint contracts unchanged. Similar program and batch update handlers may share a private frontend function only if both current confirmation flows and messages remain explicit and readable.

### Must remain unchanged

- Admin authorization assumptions.
- Report values, CSV/HTML output, and spreadsheet links.
- Confirmation prompts and destructive-action safeguards.
- Pagination and filters.

### Exit criteria

- Each extracted module corresponds to an existing admin responsibility.
- No API consolidation or route rename occurs.
- Report output remains byte-for-byte equivalent where practical.

## Milestone 7 — Split the supervisor dashboard

Status: Not started

Risk: Medium

Target: `components/dashboards/SupervisorDashboard.tsx`

Purpose: isolate existing project presentation from dashboard orchestration.

### Extraction order

1. Project card.
2. Project list and filters.
3. Selected-project detail dialog.
4. Overview statistics and recent-project list.

Keep action handlers, confirmation flows, fetching, and selected-project state in the parent until their ownership is unambiguous.

### Must remain unchanged

- Review actions, migration confirmation, team expansion, and removal behavior.
- Export request and downloaded file behavior.
- Broadcast and voice components.
- Filters, counts, status badges, and timeline display.

### Exit criteria

- Presentation modules have narrow props and no duplicate data fetching.
- No new state-management abstraction or dependency is introduced.

## Milestone 8 — Strengthen frontend type boundaries

Status: Not started

Risk: Medium

Purpose: make refactored modules safer to change without altering runtime behavior.

### Steps

- Type component props when each component is extracted.
- Define feature-specific response shapes only for fields the UI actually consumes.
- Replace touched event-handler `any` values with React or DOM types already available.
- Prefer narrow local types over a speculative global domain model.
- Do not change Mongoose models, database document typing, route payloads, or runtime validation in this milestone.
- Do not silence lint or TypeScript errors with broader casts or disabled rules.

### Exit criteria

- Changed frontend files introduce no new explicit `any` usage.
- Existing runtime behavior and API contracts remain unchanged.
- Type definitions are owned by the relevant feature.

## Milestone 9 — Final product-quality pass

Status: Not started

Risk: Low

Purpose: remove refactoring residue and prove the completed frontend cleanup is safe.

### Steps

- Search for zero-caller files, exports, compatibility aliases, stale comments, and duplicated pure frontend helpers.
- Remove only items proven unused or replaced.
- Confirm no new generic `helpers`, `common`, `misc`, or `utils` modules were introduced.
- Confirm no dependency or lockfile change occurred without approval.
- Confirm database, storage, API, authentication, and production configuration files are unchanged unless separately approved.
- Run the full validation baseline and role-based staging smoke checklist.
- Review final Git history and diffs milestone by milestone.

### Exit criteria

- The complete refactor validates at least as well as the baseline.
- No unexplained unrelated changes remain.
- Product workflows are unchanged.
- `docs/Progress.md` contains final evidence, remaining risks, and explicitly deferred server work.

## Explicitly deferred roadmap items

These audit findings are not milestones under the current authorization:

- Consolidating academic-reset server logic.
- Reusing or changing storage-key parsing.
- Refactoring database cleanup or storage-ledger behavior.
- Removing the alternate slot-counting mode.
- Consolidating or renaming API routes.
- Changing Next.js or Sentry production configuration.
- Removing or replacing active dependencies.
- Database migrations, schema cleanup, index changes, or data repair.

They may be reconsidered only as separately approved work with staging coverage and an explicit production-risk review.
