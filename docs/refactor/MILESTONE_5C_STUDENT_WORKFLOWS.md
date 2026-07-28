# Milestone 5C — Student Membership and Academic Workflows

Base commit: `0428d382a21e33907dad78b85e19ffa2ad1db8b0`

## Goal

Move student team, supervisor, fine-refresh, and academic-update workflows out of
`StudentDashboard.tsx` without changing endpoints, JSON field names, validation,
dialog wording, reset behavior, or visible UI contracts.

## Extracted responsibilities

- `studentWorkflowApi.ts`: supervisor assignment/change, team join/leave, and
  program/batch update request contracts.
- `useStudentSupervisorActions.ts`: supervisor selection, assignment, change
  warning, project reset, and refresh orchestration.
- `useStudentTeamActions.ts`: invite normalization, joining, leave confirmation,
  project reset, and invite-code copy.
- `useStudentAcademicUpdate.ts`: editor state, batch choices, warning step,
  update request, and post-update reset.
- `studentFineRestriction.ts`: pure current-student/team-fine derivation and
  messages.
- `useStudentFineRefresh.ts`: visibility-based fine recheck subscription.

## Unchanged contracts

- `POST /api/dashboard/student` with `assignSupervisor`, `changeSupervisor`, and
  `updateProgramBatch` actions.
- `POST /api/project/join` with `{ inviteCode }`.
- `POST /api/project/leave` without a request body.
- Existing dialogs, reset order, project draft storage, template cache, and UI
  component props.

## Verification

Run:

```bash
npm run test:unit
npm run lint
npm run build
```
