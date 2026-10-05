# Portal Backend Optimization: Final Evidence Report

**Status:** Incomplete verification; release gate not met.  
**Prepared:** 2026-10-05  
**Final source revision:** `afba4c46f8c2c77ff56fe25ee73d352452e6183b` (source tree was clean during tests; this report and `plan.md` were updated afterward).
**Baseline revision:** `4031e3d997a5ef045702a15e32c1f1c2fab43f93`.

## 1. Executive summary

M14 verified authenticated APIs and real MinIO file lifecycles. The latest session also passed a webpack production build, all 11 local Viva database suites, production login and 1/10/25/50-session workflows, a five-minute traffic run, and authenticated project join/leave against a throwaway local database. The moved reset button's structural test now matches its intentional home-screen placement. The earlier baseline built in a disposable copy using the system DejaVu font, and the same login, concurrency, and traffic workloads passed. Matched endpoint results are mixed, and resource measurements still lack a baseline, so there is no overall improvement percentage or 50% target claim.

## 2. Scope and constraints

Testing followed `plan.md` milestones M14, M15, then M16. No UI redesign, password-reset changes, production data, production object storage, or real email were used. User-owned browser/visual checks are outside this plan’s release gate. Baseline and final endpoint workloads used production builds, the same local machine, the same stress runner, and isolated loopback test databases. The baseline font was replaced only in its disposable copy with a system-installed DejaVu font to avoid network access; this does not affect the measured API paths.

## 3. Test machine and software versions

The earlier M2 context records Zorin OS 18, an Intel Core i5-8250U, and 7.6 GiB RAM. Latest production test versions: Node v24.18.0, npm 11.16.0, Next.js 16.3.5, React 19.2.3, TypeScript 5, Mongoose 9.10.2. The machine profile was not remeasured during this session; raw stress reports are under `.local-bench/final-2026-10-05/`.

## 4. Local MongoDB replica-set setup

Tests used an explicitly loopback-only MongoDB replica set (`rs0`). Functional and performance portal seed data was in `fyp_local`; Viva HTTP stress uses a separate `fyp_viva_http_stress_test` database. The stress runner is guarded to loopback and drops only its named dedicated database. No production URI was used.

## 5. Local MinIO storage setup

Portal lifecycle tests used the loopback S3-compatible endpoint on port 9000 and bucket `fyp-local`, with local-only credentials supplied through explicit environment overrides. No cloud object store was targeted.

## 6. Dataset sizes and seed method

The M14 functional fixture contained 22 users, 9 projects, 1 round, 1 panel, 3 sessions, and 1 PDF. After the functional checks, a fixture-only team membership adjustment freed one slot. The M15 canonical performance seeder then replaced the local fixture with 5,501 users, 2,500 projects, 1 round, 250 panels, 500 sessions, and 1,000 PDFs. Command: `node scripts/seed-local.mjs performance` with explicit loopback MongoDB/MinIO environment values. The seeder itself rejects non-loopback targets.

## 7. Baseline commit and final commit

Baseline: `4031e3d997a5ef045702a15e32c1f1c2fab43f93`. Final application source used for the current measurements: `afba4c46f8c2c77ff56fe25ee73d352452e6183b`; later working-tree changes only update the reset-button test and index-audit expectation. The baseline archive built successfully with Next.js 16.3.5, shared installed dependencies, Webpack, and the system DejaVu font. Both versions used the same stress runner from the final source tree; the runner files were verified identical.

## 8. Exact commands and workflows used

Latest validation included `npm run lint`, `npx tsc --noEmit`, the final and disposable-baseline Webpack production builds, focused reset/project tests, all 11 `tests/viva-*.integration.test.mjs` suites against guarded local databases, local MongoDB transaction abort, local MinIO PUT/HEAD/GET/DELETE, authenticated login/join/leave, and login, 1/10/25/50-session, and 300-second traffic stages on both builds. Final results are under `.local-bench/final-2026-10-05/`; baseline results are in its `baseline/` subfolder. All service targets used loopback; project-flow and stress databases were removed after the tests.

## 9. Security findings fixed

The tested storage access matrix allowed owner, assigned supervisor, and administrator reads while rejecting an unrelated student. Protected proposal, student-message, and supervisor-broadcast paths were exercised against local MinIO. The full password-reset flow was not changed. This evidence is scoped to the tested paths and is not a whole-application security certification.

## 10. Request-count changes

Admin initial UI request counts and post-mutation browser request counts were not measured in this M15 session. The plan records lazy loading of heavy Reports and Project Reviews as M4 behavior, but no new comparable before/after request count is claimed here.

## 11. Query-count and query-plan changes

The prior M2 run recorded a project-by-supervisor COLLSCAN of 2,500 documents and a report user aggregation examining 25,015,501 documents with profiling enabled. These remain historical baseline observations. The latest Viva database performance suite measured 50-session agenda reads at 202 MongoDB reads before and 5 after, with query plans examining 50 session documents and one panel/lock document. This is a targeted Viva result, not a whole-system comparison. The dedicated report-query benchmark fixture was still absent.

## 12. p50/p95/p99 changes

Five-minute p95 comparison (baseline → final): Viva supervisor route 1,550 → 1,585 ms (2% slower); student dashboard 657 → 619 ms (6% faster); supervisor dashboard 299 → 311 ms (4% slower); Admin Viva 69 → 63 ms (9% faster); Viva access 29 → 31 ms (7% slower). Request counts were close but not identical (baseline/final: 6,950/7,150; 2,825/2,900; 2,260/2,320; 226/232; and 226/232); each run had zero unexpected failures. In separate 50-login waves, callback p95 was 1,836 → 2,318 ms (26% slower), and CSRF-plus-callback p95 was 2,330 → 2,965 ms (27% slower). These single-run, same-machine comparisons have run-to-run noise and do not show a consistent system-wide speedup.

## 13. CPU/RSS changes

Thirty-one roughly 10-second-interval samples spanning the final production traffic run recorded Next server RSS from 223 to 710 MiB, MongoDB from 224 to 391 MiB, and MinIO from 57 to 70 MiB. MongoDB CPU ranged from 2.38% to 133.75% across samples; MinIO peaked at 2.11%. No matching baseline resource samples were collected, so resource changes cannot be compared.

## 14. Browser data-ready changes

Not measured in this session. Browser/visual UI checks are assigned to the user by the plan’s current testing-ownership note.

## 15. Storage workflow results

Proposal PDF reserve/upload/finalize and protected reads passed for owner, assigned supervisor, and administrator; unrelated student read was rejected. Student-message and supervisor-broadcast audio reserve/upload/finalize/read/delete workflows passed the corresponding authorized/unauthorized checks. Cleanup initially exposed a Mongoose 9 update-array option error. Adding `{ updatePipeline: true }` alongside the transaction session fixed the cleanup worker; a fresh production build’s cleanup route deleted the remaining 4 queued objects with 0 retries. Final audit found 2 objects / 138 bytes, 2 active references, no missing/invalid/cross-kind/duplicate/orphan objects, zero outbox/dead-letter/expired reservations, and a matching ledger (138 used bytes, 0 reserved). In the latest session, a separate temporary object also passed MinIO PUT/HEAD/GET/DELETE and was absent afterward; bucket count returned to 1,000.

## 16. Viva stress results

Both baseline and final production builds passed login benchmarks, 1/10/25/50-session Viva workflows, and the 300-second traffic run with zero unexpected failures. The final traffic run completed 116 cycles; route counts and percentiles are listed above. Full artifacts are in `.local-bench/final-2026-10-05/`, including its `baseline/` subfolder. The 10-minute idle-dashboard check was not repeated in this session; its earlier passing evidence remains in `plan.md`.

## 17. Tests passed/failed/skipped, with explanations

Passed this session: lint, TypeScript, final and disposable-baseline Webpack production builds, all 11 isolated Viva MongoDB integration suites (serially), matched login/stress/traffic stages, transaction rollback, local MinIO upload/read/delete, and authenticated project join/leave. The reset-button test now matches its intentional home-screen placement; the full unit suite passes all 72 tests. The sandboxed default build attempt hit a local process restriction, while the user confirms manual `npm run build` succeeds and both Webpack builds passed here. Local deployment preflight passes: expected indexes are present, rate-limit TTL is 900 seconds, and all 5,501 passwords use scrypt. Project creation is the remaining student project API workflow not tested here. An initial parallel integration run caused MongoDB connection resets; all 11 suites passed when rerun serially.

## 18. Password-reset no-touch verification

All 11 frozen-file hashes matched `.local-bench/password-reset-before.sha256`. No password-reset source file changed.

## 19. Source/code-organization changes

The only code fix in this continuation is the Mongoose 9 update-pipeline option in `lib/storageProtocol.ts` for cleanup outbox updates. It is backed by an observed cleanup failure and successful cleanup after rebuilding. Other milestone changes predate this report and are listed in `plan.md` checkpoints.

## 20. Reverted experiments and why they were worthless

No experiment was reverted during this continuation. No unsupported optimization was deleted solely to imply a performance result. Earlier keep/revert decisions require review against their milestone evidence; the combined M15 performance contribution remains unverified.

## 21. Remaining bottlenecks

The recorded historical M2 bottleneck is the Admin Reports users aggregation examining 25,015,501 documents with profiler enabled. Its final query plan is still unavailable. Remaining gaps include the project creation API check, final per-change KEEP/REVERT decisions, and resource comparisons. The user's visual review remains theirs to perform.

## 22. Recommended next work only if measurement justifies it

Complete the project creation API check. Review the mixed latency results and make per-change KEEP/REVERT decisions; gather baseline resource samples if CPU/memory improvements are required. The user owns the visual review.

---

**Release gate:** NOT MET. Local preflight, production builds, join/leave, and matched endpoint tests pass, but project creation and the full unit-suite rerun remain open. Matched latency results are mixed and there is no baseline resource comparison, so the overall 50% target is neither met nor disproven. The local preflight does not certify a production database.
