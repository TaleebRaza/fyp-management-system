# Code-Cleanup Milestone 4 — Admin Dashboard

## Goal

Turn `AdminDashboard.tsx` into a focused composition component without changing the current admin UI, routes, request bodies, response handling, or database behavior.

## Installed structure

```text
components/admin/
├── api/
│   └── adminDashboardApi.ts
├── hooks/
│   ├── index.ts
│   ├── useAdminEmailUpdate.ts
│   ├── useAdminHeadline.ts
│   ├── useAdminProjectReviewPrefetch.ts
│   ├── useAdminReports.ts
│   ├── useAdminStudents.ts
│   └── useAdminSupervisors.ts
└── selectors/
    └── adminDashboardSelectors.ts
```

## Responsibility boundaries

### Dashboard composition

`components/dashboards/AdminDashboard.tsx` now owns only:

- Active top-level tab state.
- Sidebar navigation composition.
- Existing admin section composition.
- Session-derived administrator identity.
- Logout rendering.
- Coordination between focused admin hooks.

### API module

`adminDashboardApi.ts` owns one function per existing admin request:

- Headline read and publish.
- Supervisor list, creation, deletion, notification settings, and slot allowance.
- Student list, program reset, batch reset, batch promotion, and active status.
- Shared email updates.
- Reports loading.
- Project-review prefetch.

### Hooks

- `useAdminHeadline` owns announcement input, current announcement, publication, clearing, and refresh.
- `useAdminStudents` owns server-side student search, debounce, filters, pagination, loading, academic reset actions, batch promotion, and account status.
- `useAdminSupervisors` owns the create form, supervisor search, deletion, notification settings, and slot editor.
- `useAdminEmailUpdate` owns the shared prompt and optimistic student/supervisor email update.
- `useAdminReports` owns report dialog state, report data, selection, browser preview, and downloads.
- `useAdminProjectReviewPrefetch` owns delayed code/data preloading for the review tab.

### Pure selectors

`adminDashboardSelectors.ts` owns deterministic calculations that can be tested without React:

- Supervisor search.
- Overview statistics.
- Batch option generation.
- Extra-slot clamping.
- Existing migration-code formatting.

## Preserved contract

This milestone intentionally preserves:

- Every existing API path.
- Existing POST JSON property names.
- Existing student query parameter names.
- The 20-student page size.
- The 300 ms search debounce.
- Program, batch, status, and search filters.
- Current prompt and confirmation wording.
- Academic reset warnings.
- Current supervisor migration-code format.
- Current report HTML/CSV behavior.
- Project-review prefetch timing and pagination.
- Existing section and dialog component props.

## Deliberately not changed

This structural milestone does not move migration-code generation to the server and does not change its randomness source. That is a separate security task because changing it requires coordinated backend validation and migration-code tests.

## Verification

Run:

```bash
npm run lint
npm run test:unit
npm run build
```

The added tests verify:

- Student query construction.
- Exact admin API endpoints.
- Exact JSON request bodies.
- Supervisor search and statistics.
- Batch and slot calculations.
- Dashboard module boundaries.
- Absence of direct networking inside `AdminDashboard.tsx`.

## Manual smoke checks

1. Admin dashboard loads headline, supervisors, and the first student page.
2. Student search still waits briefly before querying.
3. Program, status, and batch filters still reset to page 1.
4. Student pagination loads only the selected page.
5. Program and batch changes show the reset confirmation and refresh the list.
6. Student deactivate/restore works.
7. Supervisor creation, deletion, email editing, notifications, and extra slots work.
8. Reports open, refresh, preview in a new tab, and download HTML/CSV files.
9. Project Reviews, Registration, and Fines tabs still load.
10. Logout still ends the admin session without a full redirect request.
