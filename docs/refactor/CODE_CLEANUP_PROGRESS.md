# Code Cleanup Progress

## Current branch

`Code-Cleanup`

## Milestone 1 — Verification baseline

Status: Implemented by the Milestone 1 installer.

Completed work:

- Added a cross-platform focused unit-test runner.
- Added a TypeScript test loader that uses the repository's existing `typescript` dev dependency.
- Preserved and strengthened the password-reset knowledge test.
- Added regression tests for report selectors, CSV output, HTML escaping, supervisor filtering, review eligibility, and team capacity.
- Added a reusable pure supervisor-selector module for the upcoming dashboard cleanup.
- Added `npm run test:unit` and `npm run verify:refactor` scripts.
- Added a detailed manual smoke-test checklist.

## Next milestone

Split `components/ui/SharedUI.tsx` into focused primitive, feedback, and dashboard modules while retaining a compatibility barrel so existing imports continue to work.

## Refactor constraints

- Do not change API paths or response shapes during mechanical cleanup.
- Do not change database schemas during component extraction.
- Do not redesign the UI in structural commits.
- Do not alter authorization, fine restrictions, upload rules, or team-capacity rules without dedicated tests and a separate security or bug-fix commit.
- Run `npm run verify:refactor` before committing each cleanup batch.
