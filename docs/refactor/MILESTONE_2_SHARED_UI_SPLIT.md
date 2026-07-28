# Code-Cleanup Milestone 2 — Shared UI Split

## Goal

Replace the 800+ line `components/ui/SharedUI.tsx` implementation file with focused modules without changing the public component API or requiring dashboard import rewrites.

## Installed structure

```text
components/ui/
├── SharedUI.tsx              # compatibility barrel
├── index.ts                  # canonical UI barrel
├── shared/                   # shared types and class-name helper
├── primitives/               # Button, Card, inputs, Badge
├── feedback/                 # Dialog and EmptyState
├── dashboard/                # dashboard layout and summary components
└── content/                  # LinkifiedText
```

## Compatibility guarantee

All names previously exported from `SharedUI.tsx` remain available:

- `Card`
- `GlassCard`
- `StyledInput`
- `TextArea`
- `Select`
- `Button`
- `Badge`
- `SectionHeader`
- `StatCard`
- `EmptyState`
- `Dialog`
- `DashboardNavItem`
- `AvatarBadge`
- `DashboardShell`
- `DashboardGrid`
- `DashboardPanel`
- `LinkifiedText`

Existing imports such as the following do not need to change:

```ts
import { Button, Dialog } from "../ui/SharedUI";
```

New code may use the canonical barrel:

```ts
import { Button, Dialog } from "../ui";
```

Or a focused module:

```ts
import { Button } from "../ui/primitives";
```

## Verification

Run:

```bash
npm run lint
npm run test:unit
npm run build
```

The installer also runs a structural validation that confirms the compatibility barrel and every expected module are present.

## Scope restrictions

This milestone intentionally makes no changes to:

- Dashboard business logic.
- API routes or response formats.
- Database models or schemas.
- Authentication or authorization.
- Styling class names.
- Component runtime behavior.
