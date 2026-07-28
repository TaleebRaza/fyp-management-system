# Milestone 4 Lint Follow-up

This follow-up fixes the three `react-hooks/set-state-in-effect` errors reported after the Admin Dashboard refactor.

## Changed hooks

- `useAdminHeadline.ts`
- `useAdminStudents.ts`
- `useAdminSupervisors.ts`

## Implementation

The initial data-loading effects now start the API request directly and update React state only from promise callbacks. Each effect also ignores stale responses after cleanup.

The student loading indicator is initialized as active and is restarted from search, filter, pagination, and explicit refresh event paths instead of synchronously inside the request effect.

No endpoint, request body, response contract, dashboard layout, or mutation workflow was changed.
