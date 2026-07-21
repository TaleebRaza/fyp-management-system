# Developer setup and runbook

## Start locally

1. Install Node.js 20.9 or newer.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local` and replace every placeholder with local credentials.
4. Run `npm run dev` and open `http://localhost:3000`.

`MONGODB_URI` and `NEXTAUTH_SECRET` are required to start the application. R2 variables are required for upload and file-read routes. Email variables are required only when a workflow sends email. `CRON_SECRET` protects `GET /api/cron/voice-cleanup`; call it with `Authorization: Bearer <CRON_SECRET>`.

Never commit `.env.local`, credentials, signed URLs, or production exports.

## Checks before a change is merged

Run these commands from the repository root:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Lint has a recorded repository baseline and may fail on existing findings. A change is acceptable only if it adds no lint findings in the files it touches. The production build requires the external services above when the affected routes load them.

## Quick debugging guide

| Symptom | First check |
| --- | --- |
| App cannot connect to MongoDB | `MONGODB_URI` in `.env.local`, network access, and MongoDB allowlist. |
| Login fails | `NEXTAUTH_SECRET`, the user roll number, and server logs. |
| Upload or PDF read fails | The four R2 variables, bucket permissions, and the requested file ownership. |
| Email is not delivered | `EMAIL_USER`, app password, and server logs; the main transaction may still have succeeded. |
| Voice cleanup returns 401 | The `Authorization` header must exactly match `Bearer <CRON_SECRET>`. |

## Safe operational actions

- Use the storage reconciliation admin report before manually investigating ledger or R2 differences.
- Do not delete R2 objects or edit the storage ledger directly; use the existing application cleanup workflows.
- Do not run a User/Project data migration without a backup, dry run, reconciliation counts, and explicit production-data approval.
- For an authorization issue, reproduce it with a route test before changing a protected route.
