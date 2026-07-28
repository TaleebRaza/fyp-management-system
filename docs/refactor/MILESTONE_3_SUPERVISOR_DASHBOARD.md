# Code-Cleanup Milestone 3 — Supervisor Dashboard

## Goal

Turn `SupervisorDashboard.tsx` into a small composition component while preserving the current supervisor experience and backend contract.

## Installed structure

```text
components/supervisor/
├── api/
│   └── supervisorDashboardApi.ts
├── hooks/
│   ├── index.ts
│   ├── useSupervisorExport.ts
│   ├── useSupervisorFeedback.ts
│   ├── useSupervisorProjectActions.ts
│   ├── useSupervisorProjectFilters.ts
│   └── useSupervisorProjects.ts
└── utils/
    ├── supervisorDownload.ts
    └── supervisorErrors.ts
```

## Responsibility boundaries

### Dashboard composition

`components/dashboards/SupervisorDashboard.tsx` now owns only:

- Active top-level tab state.
- Sidebar item composition.
- Existing section and dialog composition.
- Session-derived supervisor identity.
- Logout rendering.

### API module

`supervisorDashboardApi.ts` owns:

- Supervisor dashboard loading.
- Project status updates.
- Student migration.
- Team-capacity expansion.
- Team removal.
- Excel export retrieval.

### Hooks

- `useSupervisorProjects` owns loading, projects, migration code, and refresh.
- `useSupervisorProjectFilters` owns search, filters, queue selection, statistics, and derived labels.
- `useSupervisorProjectActions` owns selected-project state and all project mutations.
- `useSupervisorFeedback` owns portal-dialog and browser fallback behavior.
- `useSupervisorExport` owns export progress and download orchestration.

## Preserved contract

This milestone intentionally preserves:

- `/api/dashboard/supervisor` GET requests.
- `/api/dashboard/supervisor` POST requests.
- Existing action names and JSON request bodies.
- `/api/export-pdf` query parameters.
- Project review status labels and remarks defaults.
- Migration-code normalization.
- Team expansion and removal confirmation text.
- Existing overview, project list, and dialog component props.
- Existing search, program, batch, and queue behavior.

## Verification

Run:

```bash
npm run lint
npm run test:unit
npm run build
```

The added tests verify the supervisor API request contract and confirm that the dashboard no longer performs direct network calls.

## Manual smoke checks

After installing, verify:

1. Supervisor dashboard loads assigned projects and migration code.
2. Overview statistics still open the correct project queue.
3. Search, batch, program, submitted, and review filters work.
4. Approve, reject, and request-changes actions refresh the list.
5. A single selected student can be migrated with a valid target code.
6. Team expansion and team removal confirmations still work.
7. Excel export downloads a non-empty `.xlsx` file.
8. Broadcast and voice-note controls still render and work.
