# Milestone 5D Build Fix

This patch restores the secure-media helper import removed during the student
composition extraction.

## Fixed

`StudentDashboard.tsx` now imports `getStudentSecureMediaUrl` from
`studentDashboardViewModel.ts` and aliases it as `getSecureMediaUrl`, preserving
the existing component prop and PDF-link call sites.

## Behavior

No API route, request body, permission, UI, storage key, or workflow behavior is
changed.
