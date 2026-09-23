# Login Performance Improvement and Verification Plan

Date: 2026-09-23
Status: Targeted validation, Viva integration suites, and focused/staged HTTP stress checks passed on 2026-09-23. The five-minute mixed-traffic run reached its traffic interval but was stopped during cleanup to respect the repository command limit, so it has no completed report.

## Objective

Reduce login latency during concurrent Viva activity while preserving authentication, access restrictions, monthly login counts, activity records, and dashboard behavior. Keep changes small, explicit, and easy to maintain using existing NextAuth, Node, Mongoose, and test tooling.

Keep an optimization only when correctness checks pass and controlled measurements justify it. Do not reduce password strength or promise hosted latency from local results.

This replaces the broader Viva stress plan with focused login work. Upload/R2 integration, password-reset email delivery, general restart recovery, and the 20–30 minute soak remain separate, unverified follow-ups.

## Current evidence

- The credential route awaits status/database initialization, rate-limit reads, user lookup, password verification, Viva restriction lookup, and successful-login writes.
- Scrypt uses N=32768, r=8, p=1. Legacy bcrypt accounts additionally generate and save a scrypt hash on successful login.
- Existing uncommitted changes already parallelize limit checks and successful-login writes and make monthly counter updates atomic. Preserve these changes and benchmark the current working tree, not an older commit.
- README records a prior thread-pool experiment: callback p95 fell from 1.774s to 1.174s with eight workers. Reproduce it before relying on it.
- The supplied 2.44s p95 and 3.97s maximum combine different login outcomes. The traffic runner includes 100 simultaneous restricted-student attempts and 50 restricted-panel-member attempts, and performs login setup before its timed dashboard loop.
- Callback timing excludes CSRF acquisition and browser/session/dashboard work. Scrypt queuing is a leading hypothesis, not a measured phase breakdown.
- Relevant indexes are declared in the schemas. Verify actual indexes and query plans in the disposable database before proposing new ones.

Relevant files: `app/api/auth/[...nextauth]/route.ts`, `lib/security/password.ts`, `lib/rateLimit.ts`, `lib/portalActivityLog.ts`, `lib/portalPause.ts`, `lib/vivaAccessRestriction.ts`, `lib/mongodb.ts`, and `tests/support/viva-http-stress-runner.mjs`.

## Compatibility requirements

1. Preserve password parameters, supported hash formats, full-password verification, bcrypt migration, and password-reset/session invalidation. Do not cache credentials or verification results.
2. Preserve JWT fields, cookies, CSRF handling, session duration, endpoints, roles, and existing error precedence.
3. Check throttling before hashing. Preserve account/IP thresholds, expiry policy, trusted-IP behavior, failure increments, and successful account clearing. Success must not clear the shared-IP failure bucket.
4. Preserve paused-portal administrator access, inactive-account rejection, active-Viva restrictions, panel-administrator access, and unrelated-user access.
5. Preserve atomic monthly counts and rollover, activity actor/time attribution, feed retention/order, and admin presentation. Never defer transactional Viva audit or grade writes.
6. Preserve existing user changes. No unrelated cleanup, new dependencies, authentication replacement, dashboard rewrite, or schema migration in the initial patch.
7. Avoid Redis, queues, worker services, generic authentication abstractions, and permanent diagnostic endpoints. Defer an optimization if preserving behavior requires disproportionate infrastructure.

## Step 1: build a reliable baseline

Extend the existing HTTP stress runner with a focused login mode. Reuse its real cookie authentication, fixtures, loopback checks, and dedicated test database. Extract shared helpers only where both modes need them.

- Bind outcome/timing metadata to the individual returned request. Replace shared `metrics.rows.at(-1)` classification so concurrent requests cannot label another request's outcome.
- Label scenario, role, concurrency, warm/cold state, hash format, and expected outcome. Assert the actual expected session/error, not merely one of several accepted HTTP statuses.
- Use fresh cookie jars for fresh-login scenarios. Denied requests must not receive an authenticated session.
- Measure callback, CSRF-plus-callback, session retrieval, and dashboard readiness separately. Do not add endpoint p95 values to invent an end-to-end percentile.
- Add narrowly scoped, opt-in server phase timings for status/connection, limits, user lookup, password verification, restriction check, and successful-login writes. Password timing includes worker queuing; do not call it pure CPU time.
- Keep diagnostics disabled by default. Reports contain no passwords, hashes, account identifiers, cookies, tokens, or full connection strings. Avoid a new tracing framework.
- Record Node/package versions, source identity including dirty-file hashes, CPU allocation, worker count, database/index configuration, fixtures, and scenario sample counts.
- Preserve a reproducible baseline snapshot without secrets. Use isolated copies if needed; do not reset/stash the user's worktree.
- Run baseline correctness and performance checks before changing authentication. Use identical instrumentation for baseline and candidate.

Store JSON reports and a concise comparison under `/tmp`, outside source control.

## Step 2: make the small database changes

### Narrow the user projection

Fetch only authentication fields: _id, password, role, isActive, name, rollNo, and sessionVersion. Check the existing rehash/save path and Mongoose defaults before changing hydration. Keep hydrated documents if that is clearer; lean reads are optional.

Verify legacy rehash still works and preserves unrelated profile fields. Cover rehash racing with password reset/session-version changes. Preserve the normalized lookup and legacy regex fallback initially.

### Consolidate rate-limit reads

Use one small login-specific indexed query for the account and optional trusted-IP identifiers. Retrieve only needed fields and evaluate each dimension against its own threshold (5 account, 25 IP).

Keep shared registration/reset helpers compatible. Preserve failure increments and awaited successful account clearing. Do not skip clearing because an earlier query found no record: a concurrent failed attempt can create one while hashing runs.

Test missing IP, shared IP, threshold boundaries, expiry policy, and concurrent valid/invalid attempts. Do not silently redesign the limiter or claim it serializes all in-flight guesses.

Measure this patch independently before adding further optimizations.

## Step 3: evaluate conditional changes

### Overlap password verification and the Viva restriction query

Characterize login racing with start, completion, and cancellation first. An earlier query can observe an unrestricted account before a concurrent Viva start acquires its lock, enlarging the current stale-decision window.

Experiment only if the established restriction behavior can be preserved. Do not reveal Viva membership before a correct password, change error precedence, or leave unhandled asynchronous failures. Preserve authorization checks on subsequent requests.

Keep the post-verification lookup if overlap requires extra queries, caching, or synchronization to preserve behavior. Saving one round trip does not justify new concurrency machinery.

### Defer login bookkeeping only if its contract survives

Measure monthly-count and activity-feed writes separately. Currently a counter failure prevents login success, while an activity failure is logged and tolerated; both operations are awaited. Deferral changes completion visibility and possibly failure semantics.

Before experimenting with Next.js `after()`, verify installed-version support, official documentation, NextAuth route integration, and deployment lifecycle. Plain unawaited promises are unsuitable.

Keep rate-limit clearing, password rehash, and security checks awaited. Capture actor, timestamp, and month at authentication time. Test immediate admin reads, concurrent same-account logins, month rollover, write failure, and process termination during pending work.

Keep bookkeeping awaited if an accepted-login count or required record could disappear. Post-response execution is not a durable queue. Do not add queues/outboxes/retries solely to enable this optimization. Any intentional durability or visibility change requires a separate product decision.

### Defer larger changes unless measurements justify them

- Shared activity document: measure actual contention. Retain the bounded feed initially. Per-event documents require retention, ordering, admin-query, and migration work beyond the small patch.
- Legacy roll-number regex: audit normalization and collisions before proposing removal. Preserve compatibility until a separate migration is complete.
- MongoDB pool: keep connection caching and the current ceiling initially. Tune only if pool checkout waits demonstrate a bottleneck and the deployment connection budget is known.

These are conditional investigations, not mandatory rewrites.

## Step 4: isolate worker-pool effects

Compare startup worker counts 4 and 8 with unchanged password parameters on the same hardware. Set `UV_THREADPOOL_SIZE` before the server process starts, not inside request code.

Use a 2-by-2 comparison: baseline/4, candidate/4, baseline/8, candidate/8. This separates code improvements from configuration improvements.

Record CPU, process memory, event-loop delay where available, and dashboard latency. More workers consume more concurrent memory and can compete for limited CPU. Keep the default if eight workers fail the comparison or resource budget.

Document any retained setting for the tested runtime. Do not assume a local result applies to Vercel. Deployment configuration is not changed by this planning task.

## Step 5: regression tests

Prefer existing Node tests and real HTTP/MongoDB integration. Source-pattern checks cannot substitute for behavior assertions. Use controlled failure injection only at genuine external boundaries.

| Scenario | Required result |
| --- | --- |
| Valid student, supervisor, admin | Correct identity/role and dashboard access; no cross-user data |
| Wrong password, missing user, inactive account | Existing rejection; no new authenticated session or successful-login side effects |
| Paused portal | Existing administrator exception and non-admin restrictions |
| Account/IP limits | Correct thresholds, expiry policy, missing-IP and shared-IP behavior; checks precede hashing |
| Concurrent valid/invalid attempts | Existing reset/increment semantics; no new read-based clearing race |
| Legacy bcrypt | Valid upgrade to scrypt; wrong/truncated password rejected; profile preserved |
| Password reset/session invalidation | Old credentials/session rejected and new credentials work; no rehash regression |
| Monthly counts | Concurrent successes counted atomically, rollover correct, denied attempts excluded |
| Activity feed | Correct actor/action/time, latest-100 retention, existing order/pagination, no duplicate per accepted login |
| Active Viva | Students/non-admin panel members denied; authorized panel admin and unrelated users remain operational |
| Viva transitions | Start/complete/cancel races preserve established access rules; locks release afterward |
| Database failure | Required checks cannot yield partial authentication success; existing failure semantics preserved |

Run on a disposable local replica set with synthetic accounts. Verify reset invalidation through existing isolated tests without claiming real email delivery was tested.

## Step 6: controlled performance comparison

### Protocol

1. Build baseline and candidate in production mode. Match Node, database, indexes, fixtures, CPU/memory allocation, instrumentation, topology, and background load.
2. Run one variant at a time. Reset fixture state between runs, including rate limits, counts, and activity feed. Warm up identically outside measured samples.
3. Run at least five paired measurements for 50 simultaneous successful logins, alternating baseline/candidate order. Compare the median of per-run p95 values and report each run's spread.
4. Use bounded diagnostic runs at concurrency 1, 10, 25, and 100. Report sample counts; sparse p99 values are diagnostic, not strong statistical evidence.
5. Separate successful, wrong-password, missing-user, and Viva-rejected samples. Separate legacy first-login rehash from steady-state scrypt and reset legacy fixtures between samples.
6. Measure fresh-process/cold observations separately. Do not mix them into warm results.
7. Repeat the controlled comparison for worker counts 4 and 8. Do not credit configuration gains to code changes.

### Workloads

| Workload | Purpose |
| --- | --- |
| Successful logins at 1/10/25/50 concurrency | Primary callback and full-authentication comparison |
| 100 restricted students and 50 restricted panel members in separate waves | Reproduce severe rejection bursts |
| Wrong password, unknown account, legacy roll number | Throttling and fallback compatibility |
| Shared IP and repeated same account | Campus-network behavior and counter correctness |
| Login waves during 50 active Viva sessions and dashboard/grade traffic | Verify that login improvements do not starve existing work |
| Browser sign-in for each role | Verify loading/errors, session refresh, and usable dashboard |

Extend the mixed-traffic mode so measured login waves actually overlap the read/grade loop. Match wave sizes, pacing, duration, and role counts between variants. Preserve grade isolation, stale-version rejection, completion, locks, and audit assertions.

Retain a five-minute mixed-traffic target, with setup and cleanup outside the measured interval. Respect the repository's five-minute command limit: use bounded start/status/stop orchestration with short polling commands and progress reporting, and stop/report any command exceeding that limit. Do not relabel a shorter run as a five-minute result.

### Acceptance criteria

- Zero unexpected HTTP/network failures, unauthorized successes, data-integrity failures, or missing counts/records required by the existing contract.
- All 50 Viva sessions complete; locks release and Viva audits match accepted operations.
- At the same worker count, median paired warm callback p95 for 50 successful logins improves by at least 15%, with improvement in at least four of five paired runs. This is a proposed gate, not a predicted outcome.
- CSRF-plus-callback latency also improves. Session/dashboard and browser timings remain separately reported.
- Investigate any p95 regression that exceeds both 10% and 50ms for single-user login, dashboards, or Viva actions. Reject a repeatable material regression. Repeat only to resolve measured variability.
- Report p50/p95/p99/max, samples, outcomes, throughput, CPU/memory, and available resource observations. Maximum latency from one run is not a guarantee.
- If only worker configuration improves performance, report that and omit ineffective complexity. If the improvement gate fails, mark improvement unproven and explain the measured bottleneck.
- State local versus hosted scope explicitly. Missing measurements are not passing evidence.

## Validation and handoff

- Load tests target only guarded loopback services and the dedicated `fyp_viva_http_stress_test` database. No Vercel Hobby load test, live data, real email, or production storage.
- Preserve fixture/user ceilings and use synthetic forwarding headers only locally. Never log secrets.
- Track and clean only processes/resources created by this task, including failure/interruption/timeout paths. Preserve sanitized reports. Do not stop unrelated services or delete shared databases.
- Run targeted behavior tests, then `npm run lint`, `npm run test:unit`, `npx tsc --noEmit --incremental false`, and `npm run build`. Use an isolated build workspace when needed to avoid generated churn.
- Run relevant existing Viva access, grading, cancellation, workflow, and performance integration suites against disposable databases. Run HTTP preflight/staged checks before mixed-traffic comparison.
- Verify official Node, Next.js, MongoDB, and hosting documentation before implementing runtime-dependent changes. Record the tested configuration and reproduction commands in README.
- Review final status/diffs. Report retained changes, before/after evidence, actual test results, skipped checks, deferred options, hosted uncertainty, and cleanup.
- Roll back unsuccessful experiments by discarding their isolated copy or removing only task-owned edits, preserving pre-existing work. Configuration rollback restores the previously measured startup value.
- Provide a suggested commit message; do not commit automatically.

Work is complete when measured login improvement is reproducible, the existing portal contract still holds, and the retained implementation remains small. A passing build alone does not demonstrate faster login.
