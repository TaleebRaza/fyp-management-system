# Code Cleanup Progress

## Current branch

`Code-Cleanup`

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

Status: Complete after running the Milestone 3 installer.

Completed work:

- Reduced `SupervisorDashboard.tsx` from 568 lines to a focused composition component of fewer than 280 lines.
- Extracted supervisor dashboard GET and POST requests into a dedicated API module.
- Extracted project loading and refresh state into `useSupervisorProjects`.
- Connected the existing pure project selectors through `useSupervisorProjectFilters`.
- Extracted status changes, migration, team expansion, and team removal into `useSupervisorProjectActions`.
- Extracted alert, confirmation, and remarks-dialog behavior into `useSupervisorFeedback`.
- Extracted export state and browser download behavior into focused modules.
- Preserved all current API paths, request bodies, response handling, filter behavior, and UI component props.
- Added request-contract and structure regression tests.

## Next milestone

Refactor `AdminDashboard.tsx` by domain. Create separate hooks for headline management, students, student actions, supervisors, supervisor slots, and reports. Do not create one large `useAdminDashboard` hook.

## Refactor constraints

- Do not change API paths or response shapes during mechanical cleanup.
- Do not change database schemas during component extraction.
- Do not redesign the UI in structural commits.
- Do not alter authorization, fine restrictions, upload rules, or team-capacity rules without dedicated tests and a separate security or bug-fix commit.
- Keep dashboard hooks focused; do not replace one dashboard monolith with one large hook.
- Run `npm run verify:refactor` before committing each cleanup batch.
