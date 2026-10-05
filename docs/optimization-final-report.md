# Portal Backend Optimization: Final Evidence Report

**Status:** Incomplete verification; release gate not met.  
**Prepared:** 2026-10-05  
**Final source revision:** `68e03498907d6bb1cf8488e7f5003d9eff7e1b44` (working tree contains the cleanup fix and this report; `.aws` is a pre-existing deletion).  
**Baseline revision:** `4031e3d997a5ef045702a15e32c1f1c2fab43f93`.

## 1. Executive summary

M14 verified many authenticated API paths and real MinIO storage lifecycles. A Mongoose 9 update-pipeline option was required for storage deletion outbox cleanup; after the fix, cleanup drained and storage integrity reconciled. M14 remains incomplete because project create/join/leave follow-ups and visual UI review were not completed. M15 seeded the canonical dataset but did not yield a successful stress workload or comparable endpoint measurements. M16 therefore reports evidence and gaps without asserting the 50% target.

## 2. Scope and constraints

Testing followed `plan.md` milestones M14, M15, then M16. No UI redesign, password-reset changes, production data, production object storage, or real email were used. User-owned browser/visual checks are outside this plan’s release gate. The M15 benchmark comparison requires same-mode, same-dataset baseline artifacts; those were unavailable.

## 3. Test machine and software versions

The recorded machine is Zorin OS 18 (noble), Linux kernel 7.0.0-34-generic, Intel Core i5-8250U (4 cores / 8 threads), 7.6 GiB RAM, 3.8 GiB swap. Recorded versions: Node v24.18.0, npm 11.16.0, Next.js 16.3.5, React 19.2.3, TypeScript 5, Mongoose 9.2.4. See `.local-bench/baseline/source-context.txt`.

## 4. Local MongoDB replica-set setup

Tests used an explicitly loopback-only MongoDB replica set (`rs0`). Functional and performance portal seed data was in `fyp_local`; Viva HTTP stress uses a separate `fyp_viva_http_stress_test` database. The stress runner is guarded to loopback and drops only its named dedicated database. No production URI was used.

## 5. Local MinIO storage setup

Portal lifecycle tests used the loopback S3-compatible endpoint on port 9000 and bucket `fyp-local`, with local-only credentials supplied through explicit environment overrides. No cloud object store was targeted.

## 6. Dataset sizes and seed method

The M14 functional fixture contained 22 users, 9 projects, 1 round, 1 panel, 3 sessions, and 1 PDF. After the functional checks, a fixture-only team membership adjustment freed one slot. The M15 canonical performance seeder then replaced the local fixture with 5,501 users, 2,500 projects, 1 round, 250 panels, 500 sessions, and 1,000 PDFs. Command: `node scripts/seed-local.mjs performance` with explicit loopback MongoDB/MinIO environment values. The seeder itself rejects non-loopback targets.

## 7. Baseline commit and final commit

Baseline: `4031e3d997a5ef045702a15e32c1f1c2fab43f93`. Final source revision at report time: `68e03498907d6bb1cf8488e7f5003d9eff7e1b44`. The earlier baseline source and one-run metrics are described in `plan.md` and `.local-bench/baseline/source-context.txt`. No isolated baseline checkout run was available, so measurements from different historical samples are not treated as comparable.

## 8. Exact commands and workflows used

Validation included `npm run lint`, `npx tsc --noEmit`, `npm run build`, focused Node test files, password-reset hash checks, M14 authenticated API workflows, local storage reserve/upload/finalize/read/delete/cleanup paths, read-only audits, and `node scripts/seed-local.mjs performance`. The stress attempt used `npm run test:viva:stress:preflight` with `VIVA_STRESS_BASE_URL=http://127.0.0.1:3100`, a loopback `VIVA_STRESS_MONGODB_URI`, and a `/tmp` artifact directory. Its report is `/tmp/fyp-final-artifacts/stress/viva-http-stress-2026-10-05T13-53-30-237Z.json` and `.md`.

## 9. Security findings fixed

The tested storage access matrix allowed owner, assigned supervisor, and administrator reads while rejecting an unrelated student. Protected proposal, student-message, and supervisor-broadcast paths were exercised against local MinIO. The full password-reset flow was not changed. This evidence is scoped to the tested paths and is not a whole-application security certification.

## 10. Request-count changes

Admin initial UI request counts and post-mutation browser request counts were not measured in this M15 session. The plan records lazy loading of heavy Reports and Project Reviews as M4 behavior, but no new comparable before/after request count is claimed here.

## 11. Query-count and query-plan changes

The prior M2 run recorded a project-by-supervisor COLLSCAN of 2,500 documents and a report user aggregation examining 25,015,501 documents with profiling enabled. These are historical baseline observations, not comparable final numbers. Final query plans and operation counts were not captured; the dedicated benchmark owner-marker fixture required by `scripts/capture-report-query-plans.mjs` was absent.

## 12. p50/p95/p99 changes

No comparable final endpoint p50/p95/p99 sample was collected. Historical M2 values are a single sample and cannot be paired with the failed stress preflight. No percentage improvement is claimed.

## 13. CPU/RSS changes

Node CPU/RSS and MongoDB CPU/memory under a fixed workload were not measured. No resource reduction claim is made.

## 14. Browser data-ready changes

Not measured in this session. Browser/visual UI checks are assigned to the user by the plan’s current testing-ownership note.

## 15. Storage workflow results

Proposal PDF reserve/upload/finalize and protected reads passed for owner, assigned supervisor, and administrator; unrelated student read was rejected. Student-message and supervisor-broadcast audio reserve/upload/finalize/read/delete workflows passed the corresponding authorized/unauthorized checks. Cleanup initially exposed a Mongoose 9 update-array option error. Adding `{ updatePipeline: true }` alongside the transaction session fixed the cleanup worker; a fresh production build’s cleanup route deleted the remaining 4 queued objects with 0 retries. Final audit found 2 objects / 138 bytes, 2 active references, no missing/invalid/cross-kind/duplicate/orphan objects, zero outbox/dead-letter/expired reservations, and a matching ledger (138 used bytes, 0 reserved).

## 16. Viva stress results

The stress preflight reached `/api/portal-status` (200) and CSRF (200), but the generated login callback returned 401. It failed before the staged workload, so no concurrency, traffic, throughput, or stress latency result exists. The raw JSON and Markdown report are linked in section 8. The planned 10-minute idle-dashboard measurement was not run.

## 17. Tests passed/failed/skipped, with explanations

Passed: lint, TypeScript check, production build, focused storage/login structure tests (8 passed), focused password-reset tests (8 passed), frozen-file hash checks (11 files), and 11 Viva integration suites including the 50-concurrent-session test. M14 role APIs and storage lifecycle checks passed as summarized above. Storage, capacity, key, and TTL audits passed. The unit suite retains its baseline failure in `tests/student-project-reset-structure.test.mjs` because `StudentTeamSection` does not contain the asserted “Reset project” text; the baseline already had this failure. Project drift and refactor-index audits retain previously recorded local seed/schema discrepancies. The stress preflight failed at login (401). Portal-pause fresh rerun was not completed because earlier local process approval attempts timed out. M14 create/join/leave remain untested after server restart.

## 18. Password-reset no-touch verification

All 11 frozen-file hashes matched `.local-bench/password-reset-before.sha256`. No password-reset source file changed.

## 19. Source/code-organization changes

The only code fix in this continuation is the Mongoose 9 update-pipeline option in `lib/storageProtocol.ts` for cleanup outbox updates. It is backed by an observed cleanup failure and successful cleanup after rebuilding. Other milestone changes predate this report and are listed in `plan.md` checkpoints.

## 20. Reverted experiments and why they were worthless

No experiment was reverted during this continuation. No unsupported optimization was deleted solely to imply a performance result. Earlier keep/revert decisions require review against their milestone evidence; the combined M15 performance contribution remains unverified.

## 21. Remaining bottlenecks

The recorded historical M2 bottleneck is the Admin Reports users aggregation examining 25,015,501 documents with profiler enabled. Final query plans are unavailable. Further known gaps are the unmatched historical baseline, failed stress login, incomplete M14 project flows, known unit assertion, audit discrepancies, and unmeasured CPU/RSS and idle behavior.

## 22. Recommended next work only if measurement justifies it

First complete M14 project create/join/leave API tests against the live local server, then investigate the stress fixture login mismatch and run the supported stress stages. Reconstruct a baseline-commit benchmark only if it can use the identical canonical data, production server mode, settings, and workload. Capture query plans using the guarded dedicated benchmark fixture. Then measure endpoint latency and resources; do not claim improvement until paired raw artifacts exist. Complete the user-owned visual review separately.

---

**Release gate:** NOT MET. M14 is incomplete and M15 has no successful comparable final performance run. The original 50% target is neither met nor disproven by the available evidence.
