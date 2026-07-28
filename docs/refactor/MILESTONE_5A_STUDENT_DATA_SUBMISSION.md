# Milestone 5A — Student Data and Submission Boundary

Base commit: `262d94da3414584b497b6416e1c3b53edd3be18d`

## Goal

Move the student dashboard's read-only loading, template loading, secure PDF upload,
and project-submission HTTP contracts into one focused API module without changing
routes, request bodies, validation limits, dialogs, or rendered UI.

## Added

- `components/student/api/studentDashboardApi.ts`
- API contract regression tests
- Student dashboard structure tests

## Preserved

- `/api/headline`
- `/api/dashboard/student?id=...`
- `/api/supervisors`
- `/api/templates?stage=...`
- `/api/upload` token request and direct PUT upload
- `/api/dashboard/student` project-submission body
- PDF-only validation and the 4 MB size limit
- Browser draft behavior
- Fine restrictions
- Team, supervisor-change, and academic-update workflows

## Next

Milestone 5B should extract project draft state and persistence into a dedicated
hook. Team, supervisor-change, fine, and academic account workflows remain for the
following student-dashboard pass.
