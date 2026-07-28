# Code Cleanup Progress

## Current branch

`Code-Cleanup`

## Remote baseline checked

Before Milestone 4 was prepared, the latest visible GitHub commit on `Code-Cleanup` was:

- `e419a6a3eb9876d08bd2a1dd02757f24b5d12d2a` — `Matched Origin Main file "BroadcastWidget"`

Milestone 4 expects Milestones 1–3 to already be installed in the local working tree even if those cleanup commits have not yet been pushed to GitHub.

## Milestone 1 — Verification baseline

Status: Complete.

Completed work:

- Added a cross-platform focused unit-test runner.
- Added a TypeScript test loader that uses the repository's existing `typescript` dependency.
- Added regression tests for report selectors, CSV output, HTML escaping, supervisor filtering, review eligibility, team capacity, and password-reset verification.
- Added `npm run test:unit` and `npm run verify:refactor`.
- Added a manual smoke-test checklist.

## Milestone 2 — Shared UI decomposition

Status: Complete.

Completed work:

- Replaced the 800+ line `components/ui/SharedUI.tsx` implementation with a compatibility barrel.
- Extracted UI primitives, feedback components, dashboard layout components, and text utilities.
- Preserved every existing `SharedUI` import and exported component name.
- Added structural regression coverage for the new module boundaries.

## Milestone 3 — Supervisor dashboard decomposition

Status: Complete.

Completed work:

- Reduced `SupervisorDashboard.tsx` from 568 lines to a focused composition component.
- Extracted supervisor API access, loading, filtering, feedback, mutations, and export behavior.
- Preserved existing endpoints, action names, JSON request bodies, filters, and UI component props.
- Added API-contract, download, and structure tests.

## Milestone 4 — Admin dashboard decomposition

Status: Complete after running the Milestone 4 installer.

Completed work:

- Reduced `AdminDashboard.tsx` from 931 lines to fewer than 340 lines.
- Removed all direct `fetch` calls from the dashboard composition component.
- Extracted all admin endpoint calls and request bodies into `adminDashboardApi.ts`.
- Extracted headline state and publication behavior into `useAdminHeadline`.
- Extracted student loading, search debounce, filters, pagination, resets, promotion, and account status into `useAdminStudents`.
- Extracted supervisor account creation, search, deletion, notification settings, and slot editing into `useAdminSupervisors`.
- Extracted shared student/supervisor email updates into `useAdminEmailUpdate`.
- Extracted reports loading, report selection, preview opening, and downloads into `useAdminReports`.
- Extracted project-review prefetch behavior into `useAdminProjectReviewPrefetch`.
- Added pure selectors for supervisor search, dashboard statistics, batch options, slot clamping, and migration-code formatting.
- Removed the no-op empty `isReportsModalOpen` block from student status updates.
- Added endpoint/body contract tests and structural regression tests.

## Next milestone

Refactor `StudentDashboard.tsx` in two controlled passes. Begin with dashboard data, project draft persistence, submission, and templates. Do not mix account/team workflows into the same commit.

## Refactor constraints

- Check the latest GitHub `Code-Cleanup` commits before every new milestone.
- Do not change API paths or response shapes during mechanical cleanup.
- Do not change database schemas during component extraction.
- Do not redesign the UI in structural commits.
- Do not alter authorization, fine restrictions, upload rules, or team-capacity rules without dedicated tests and a separate security or bug-fix commit.
- Keep dashboard hooks focused; do not replace one dashboard monolith with one large hook.
- Run `npm run verify:refactor` before committing each cleanup batch.
