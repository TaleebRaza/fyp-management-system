# Production-Safe Refactoring Rules

## Scope

This refactoring program changes code structure only. It must preserve application behavior for the active production user base.

## Non-negotiable boundaries

- No MongoDB schema, collection, index, or stored-record changes.
- No migration or data-repair script.
- No Cloudflare R2 bucket, key, folder, URL, move, copy, or deletion change.
- No public API path removal or incompatible request/response change.
- No authentication session-shape change without backward compatibility.
- No business-rule, permission, report, fine, project-stage, or UI workflow change.
- No planned downtime.

## Branch and pull-request policy

- Long-lived branch: `refactor/code-cleanup`.
- Normal pull requests target one module or one workflow.
- Normal limit: 15 changed files and 400 non-generated changed lines.
- Exceeding the limit requires a written reason and a smaller-review strategy.
- Cleanup, bug fixes, and features use separate commits and separate pull requests.
- Every pull request includes behavior, database, storage, API, verification, and rollback notes.

## Package-manager policy

- npm is the project package manager.
- `package-lock.json` is committed and is the only dependency lockfile.
- CI uses `npm ci`.
- Dependency changes are not part of cleanup unless a milestone explicitly requires one.

## Runtime policy

- Local verification and CI use Node.js `24.18.0`.
- Production runtime changes require a separate deployment review.

## Generated files

Generated files are not manually edited. Reproducible generated artifacts, including `tsconfig.tsbuildinfo`, are ignored and not committed.

## Required verification

```bash
npm run check
npm test
npm run build:verify
```

Then run the relevant role-based smoke-test scenarios in `docs/testing/production-smoke-tests.md` against a preview deployment.

## Rollback

A cleanup change must be reversible with a normal Git revert. A rollback must not require database repair, storage repair, or manual record changes.
