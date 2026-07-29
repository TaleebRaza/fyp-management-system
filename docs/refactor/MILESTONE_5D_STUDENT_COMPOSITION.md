# Milestone 5D — Student Dashboard Composition

Target commit: `15cc8b33e3f65760ddaf0aa66892e6be83e3acf3`

This milestone completes the planned student-dashboard decomposition without changing API routes, request bodies, storage keys, validation text, fine restrictions, team behavior, or rendered section components.

## Extracted responsibilities

- `useStudentDashboardData.ts`: initial data loading and refresh operations.
- `useStudentProjectSubmission.ts`: project validation, secure PDF upload, submission, draft clearing, and refresh.
- `useStudentDashboardNavigation.tsx`: active-tab state and navigation items.
- `studentDashboardViewModel.ts`: pure derived display state and permissions.

## Safety notes

- Initial requests keep stale-response cleanup.
- Fine restrictions still override submission permission.
- Existing upload and project endpoints remain unchanged.
- `StudentDashboard.tsx` remains the composition root for its existing section components and dialogs.
