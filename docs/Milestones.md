# Milestones

## 2026-07-26 — Knowledge-based password recovery

- Branch: `main`
- Milestone: Replace email password recovery with student academic-knowledge verification.
- Completed sub-step: Added roll number, supervisor, batch, program, and conditional teammate verification; successful verification now grants a 15-minute one-time reset token.
- Files changed: `components/auth/PasswordResetFlow.tsx`, `app/api/auth/forgot-password/route.ts`, `app/api/auth/reset-password/route.ts`, `lib/security/passwordResetKnowledge.ts`, `tests/password-reset-knowledge.test.mjs`, `docs/Milestones.md`, and `docs/Progress.md`.
- Test added: focused knowledge-factor matching coverage, including the solo/team teammate rule.
- Commands and results:
  - `node --test tests/password-reset-knowledge.test.mjs` — passed.
  - `npx tsc --noEmit` — passed.
  - changed-file `npx eslint ...` — passed.
  - `npm run lint` — passed repository-wide.
  - `npm run build` — Turbopack could not bind its worker port inside the sandbox.
  - authorized `npm run build` — compiled and type-checked, then exposed the existing missing `MONGODB_URI` configuration.
  - authorized `MONGODB_URI=mongodb://127.0.0.1:27017/fyp-portal-build npm run build` — passed; existing missing Cloudflare R2 credential warnings remained.
- Existing baseline failures: `.env.local` does not define `MONGODB_URI`; production build requires a supplied value. Missing Cloudflare R2 credentials produce warnings. The middleware convention is deprecated by Next.js.
- New failures: none.
- Decisions: recovery is student-only because the required knowledge fields are student records; mismatch responses do not identify the incorrect field; a token is single-use and atomically consumed; repeated verification replaces an abandoned token but remains rate-limited.
- Known risk: academic knowledge factors are inherently weaker than possession-based recovery, especially for students without teammates. The five-attempt hourly per-roll-number limit and password-change cooldown are retained.
- Exact next action: manually exercise recovery against representative solo and team student records in the configured development database.
- Explicitly deferred: renaming the legacy `forgot-password` route and `resetCode` schema fields, removing email dependencies used by unrelated notifications, and changing supervisor/admin recovery.
