# Current System Map

Generated from repository source at commit `443dc1572fa90a66a4f40ca3f9f3dbeb7fbe86d6` on 2026-07-25T15:58:30.945Z.

## Purpose

This is a behavior-preservation map. It documents the current module boundaries before structural refactoring. It does not authorize a database, storage, API, permission, or workflow change.

## Runtime and tooling

- Framework: 16.1.6 Next.js
- React: 19.2.3
- TypeScript: ^5
- Database ODM: ^9.2.4 Mongoose
- Authentication: ^4.24.13 NextAuth
- Storage SDK: ^3.1079.0 AWS S3 client for R2-compatible storage
- Monitoring: ^10.50.0 Sentry
- Package manager: npm with committed `package-lock.json`
- Development and CI runtime: Node.js 24.18.0

## Source inventory

| Area | Count | Responsibility |
|---|---:|---|
| `app/api/**/route.*` | 32 | HTTP route handlers and workflow orchestration |
| `components/**/*` | 12 | Role dashboards and shared UI |
| `lib/**/*` | 24 | Shared security, validation, email, storage, and domain helpers |
| `models/**/*` | 7 | Existing Mongoose models and persisted field contracts |

## Request flow

1. Next.js receives a page or API request.
2. Protected route handlers perform session or database-backed user checks.
3. Route handlers validate input and coordinate Mongoose, R2-compatible storage, email, or reporting work.
4. Route handlers return JSON, redirects, files, or signed storage URLs.
5. React components call the existing `/api/*` paths and render role-specific state.

## High-risk boundaries

- Authentication and role checks
- Registration transactions and policy snapshots
- Student team/project/submission workflow
- Fine and restriction calculations
- Supervisor review and communication workflow
- Admin reports and account-management writes
- R2 object ownership, key construction, upload, read, and cleanup
- Email and Sentry side effects

These boundaries require characterization tests before logic is extracted.

## Current contract sources

- API inventory: `docs/contracts/api-contracts.md`
- Data, environment, storage, stages, and browser storage: `docs/contracts/data-and-storage-contracts.md`
- Canonical implementation: the installed source files at commit `443dc1572fa90a66a4f40ca3f9f3dbeb7fbe86d6`
