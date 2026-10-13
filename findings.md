# Portal performance findings — proved causes, 12 October 2026

What this repo does: The portal manages accounts, project teams, supervisor capacity, document review, messages, fines, and Viva scheduling and grades. Next.js routes use MongoDB through Mongoose. Browsers transfer files directly to S3-compatible storage.

**The main measured causes of slow requests are upload transaction retries against two shared records, waiting for database connections, broad file-reference reads, and password-processing capacity.** Successful requests can still take many seconds. Concentrated supervisor selection and registration also produce real errors.

This report uses current-source tracing, repeated HTTP load runs, driver observations, controlled helper comparisons, database integration tests, and Chromium checks. Recommendations are proposed changes; this audit has not applied application performance fixes.

## Evaluation of the original findings

The [original report is preserved locally](.local-bench/portal-audit-2026-10-12/findings-before.md). It was a useful code audit and generally distinguished source evidence from measurements. However, the latest baseline had endpoint timings and no transaction-attempt or connection-wait measurements, so it could not rank the actual causes precisely.

The new evidence changes that:

- Quota and submission-policy contention are now measured causes, rather than candidates.
- Pool waiting is now measured in the current build, rather than supported only by the 6 October experiment.
- Broad file-reference reads have repeated comparisons and query plans.
- Supervisor/registration conflicts are reproduced failures, rather than source-only risks.
- Cleanup is a demonstrated background-drain limit. It does not explain initial reservation latency.
- Viva preview is demonstrably wasteful, but its measured cost is much smaller than the main mixed-load delays.
- Missing indexes generally, real SMTP delay, activity-document contention, and browser CPU work are not established as dominant causes.

The original qualifications about the separate login wave and 69-byte upload fixture remain correct. One recommendation needs correction: `scripts/audit-storage-integrity.mjs --repair` repairs the storage ledger; it does **not** normalize legacy URL fields.

## Scope and test conditions

- Inventoried 414 non-secret source/document/asset files and parsed 379 code files and their call sites. Traced all 45 API routes' query/write paths, all 17 models, shared helpers, browser API/action hooks, scripts, and configuration. [File manifest](.local-bench/portal-audit-2026-10-12/file-manifest.json), [call inventory](.local-bench/portal-audit-2026-10-12/operation-inventory.json).
- Baseline: 1,000 students, 500 supervisors, 500 projects, 100 distinct Viva sessions, and 50 actions per main operation group. Headroom: 1,500 students, 750 supervisors, 750 projects, 150 distinct sessions, and 75 actions per group. Login/dashboard subgroup sizes round upward where needed.
- Main bursts launch approximately 425 initial requests at baseline and 638 at headroom across project/account flows, dashboards, grade saves, and second-wave starts. These are burst tests, not steady arrival-rate capacity estimates or simply “50 users.” Login finishes before those mixed actions; reset-completion password hashing overlaps them.
- Isolated local targets: application port 3194, database `fyp_portal_audit_test`, bucket `fyp-portal-audit-test`, and captured SMTP. The existing server on port 3191 and its stress database were not the load target.
- Node 24.18.0, Next.js 16.3.5, Mongoose 9.10.2, MongoDB driver 7.6.0, MongoDB server 7.0.41. Host: i5-8250U, eight logical CPUs, about 7.61 GiB RAM. Application, database, storage, and generator share the host. HTTP runs explicitly use four password workers.
- Reused the existing disposable production build after comparing its sources with the workspace. API/helper/model sources match. Its layout omits the Google font for offline building, and its config disables the TypeScript CLI build check; TypeScript was checked separately against the workspace.
- Initial setup encountered `XMinioStorageFull` on the existing storage service's nearly full disk. A separate temporary MinIO instance on the project's disk resolved setup. This was a test-host problem, not a portal bottleneck finding.

**Observer correction:** the first observer assigned pool checkout events to the current asynchronous context. The driver can emit them while a different request returns a connection. Those per-request pool figures are discarded. The pool figures below capture the caller before `ConnectionPool.checkOut()` and time that call through completion. Earlier transaction-attempt, command, and conflict counts remain usable.

Checkout intervals are merged within each request so parallel queries are not counted twice. They include acquisition and caller resumption. Command monitoring measures a different interval after dispatch, including communication/scheduling overhead. Percentiles from separate columns are not additive; an unexplained remainder must not be assigned to a particular CPU function or query.

## Results that establish actual slowness

Eight successful load runs issued **7,056 timed HTTP requests**, with zero network drops and zero unexpected statuses in those runs. Expected active-Viva login denials are included. Setup authentication, browser checks, and separate collision probes are excluded from that count.

| Run | Requests | Reservation p95 | Submission p95 | Purpose |
| --- | ---: | ---: | ---: | --- |
| Mixed baseline without observers | 900 | 15,025 ms | 11,315 ms | Slowness persists without instrumentation |
| Mixed baseline, corrected observer | 900 | 15,326 ms | 9,530 ms | Current transaction/pool evidence; server timings |
| Headroom, corrected observer | 1,353 | 22,974 ms | 17,447 ms | Same mechanisms at 75 actions/group; server timings |
| Upload-only, 69-byte fixture | 375 | 9,238 ms | 12,640 ms | Upload contention without competing mixed actions; HTTP timings |
| Upload-only, valid 2 MiB PDF | 375 | 9,282 ms | 11,757 ms | File-size check; HTTP timings |

The other three successful runs are two earlier instrumented baselines and the first successful headroom run. Timings vary; mechanisms repeat. These observations do not assert zero observer overhead or predict deployment latency.

The valid PDF was **2,098,938 bytes**, generated with the existing `pdf-lib` dependency and parsed successfully as a one-page PDF. Direct local PUT p95 was **49 ms**, while reservation/submission still took seconds. Transfer was not the multi-second cause in that local comparison; production network/R2 performance remains unmeasured.

## Must fix

### 1. Reservations repeatedly restart against one storage quota record

- **What this is:** [reserveUpload](lib/storageProtocol.ts), lines 159–223, reads ledger/reservation state and updates the singleton `SystemConfig` record with `configKey: 'storage'` inside a transaction. Audio, finalization, and deletion also use this ledger.
- **Problem:** Fifty reservations in the corrected mixed run needed **733 transaction attempts**, with **683 quota write conflicts**, and issued **3,432 commands**: 700 successful-path commands plus four extra commands per failed attempt. At headroom, 75 reservations needed **1,528 attempts** and **1,453 quota conflicts**. Distinct owners/files compete for the same record.
- **Fix:** Shorten the existing transaction while preserving quota/reservation atomicity. Benchmark folding validity checks into the guarded update and putting the shared write before unnecessary transactional reads. Test bounded admission to this critical path; a per-process queue alone does not coordinate multiple server instances.
- **If we skip it:** Concurrent uploads generate extra work and delay unrelated requests using the same database pool.

A controlled comparison used the **unchanged helper**, the same ten-connection pool, no HTTP/S3/password work, and three repetitions:

| 50 reservations | Median time to finish the entire batch | Median transaction attempts |
| --- | ---: | ---: |
| One at a time | 509 ms | 50 |
| Ten at a time | 896 ms | 193 |
| All fifty together | 1,875 ms | 477 |

Simultaneous runs recorded 423–455 quota conflicts. Batch completion includes the serial queue's total duration: this does not compare an unqueued service time with another user's queued latency. More concurrency made the same work finish more slowly.

This proves contention/replay, not that an untested reordering will fix it. Exact global quota requires coordination; removing guards or moving the write outside the transaction changes correctness. [Results](.local-bench/portal-audit-2026-10-12/quota.json), [MongoDB write-conflict behavior](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/#in-progress-transactions-and-write-conflicts).

### 2. Submission repeatedly restarts against a second shared record

- **What this is:** [student submission](app/api/dashboard/student/route.ts), lines 609–654, rereads student/project state, checks duplicate titles, and increments `projectSubmissionsAccepted` on the singleton registration policy. It then updates the project, queues mail, and converts reserved storage bytes.
- **Problem:** Fifty submissions needed **947 attempts**, with **839 policy conflicts** and **58 storage conflicts**, issuing **7,515 commands**. Headroom needed **2,212 attempts** for 75 submissions: **2,057 policy conflicts** and 80 storage conflicts. Retries repeat work before the shared gate.
- **Fix:** Keep the authoritative closure gate. Use `updateOne` plus `matchedCount` where only a match is needed, and minimize work around the shared writes. Benchmark earlier gate placement after necessary project checks. A cached policy read or deleted acceptance write is not an equivalent fix.
- **If we skip it:** Independent projects compete on two records and one successful submission can require dozens of attempts.

The upload-only valid-PDF run still recorded **955 policy conflicts** and 52 storage conflicts for 50 submissions. Contention persists without password resets, team changes, or grade saves. These counters deliberately coordinate with administrators closing registration/submission; the problem is measured contention and callback replay, not that all coordination can be removed.

### 3. Ordinary requests wait seconds to acquire database connections

- **What this is:** [connection configuration](lib/mongodb.ts), lines 27–37, supplies ten connections per application pool with no configured checkout-wait deadline.
- **Problem:** Caller-scoped measurements show long waits even for requests without transaction retries. Dependent database calls encounter the queue repeatedly. Upload replay and unnecessary reads increase demand on the shared resource.
- **Fix:** Reduce retries/avoidable operations first. Reuse account/project/policy fields on upload preflight through existing authorization projections and the team-fine helper. Then compare modest pool sizes, process counts, and a deliberate overload deadline on the actual deployment, budgeting connections across instances.
- **If we skip it:** Fast indexed operations wait behind other work, making dashboards and ordinary saves slow together.

Corrected baseline measurements, in milliseconds:

| Request | Server p95 | Checkout waiting p95 | Command-duration sum p95 | Median per-request fraction in checkout |
| --- | ---: | ---: | ---: | ---: |
| Grade save | 4,532 | 4,425 | 159 | 97% |
| Student dashboard | 5,583 | 4,182 | 221 | 75% |
| Running Viva dashboard | 4,775 | 3,417 | 192 | 70% |
| Supervisor change | 7,655 | 6,570 | 179 | 86% |
| Team change | 8,218 | 7,130 | 245 | 87% |

Grade saves/team changes each completed their callback once, without their own conflicts in that run. At headroom, grade-save checkout p95 was **4,966 ms** against server p95 5,055 ms; student-dashboard checkout p95 was **5,081 ms** against server p95 6,144 ms.

Waiting is proved, not that ten is universally the wrong pool size. The earlier pool-10/pool-40 experiment worsened important tail latencies. A larger pool alone is not a demonstrated fix. Socket/server-selection timeouts do not replace a checkout deadline. [Pool documentation](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/).

### 4. Supervisor selection and registration fail instead of retrying

- **What this is:** Student supervisor assignment/change, registration, supervisor migration/removal, and supervisor deletion include manually managed transactions. See [student routes](app/api/dashboard/student/route.ts), lines 271 and 405, and [registration](app/api/register/route.ts), lines 148–241.
- **Problem:** Six separate waves of 25 new students selected a fresh supervisor with 30 free slots. **Every wave accepted one and returned HTTP 500 for 24**. Occupancy/project counts remained one, so capacity was not full. The traced three waves recorded exactly **72 `users` write conflicts**. Two 50-registration waves accepted 34 and 29 accounts, returning 16 and 21 HTTP 500s; the traced wave recorded 21 policy conflicts.
- **Fix:** Reuse native `withTransaction`/the existing transaction-wrapper pattern, with cleanup in `finally`, business errors preserved, and external effects after commit. Restart an aborted transaction for an invite-code collision instead of inserting again in that same transaction in `lib/projectCreation.ts`.
- **If we skip it:** Popular-supervisor demand fails despite free slots; registration bursts also fail, prompting user retries.

This is a proved load-related **failure**, not the explanation for every successful mixed delay. The mixed fixture used different destination supervisors and omitted this collision. [Results](.local-bench/portal-audit-2026-10-12/collisions/report.json), [driver trace](.local-bench/portal-audit-2026-10-12/collisions-trace.jsonl).

## Should fix

### 5. Checking one file reads unrelated references from five collections

- **What this is:** [findSharedStorageKeys](lib/storageReferenceSafety.ts), lines 33–57, fetches all nonempty project PDFs, legacy voice-note URLs, audio broadcast/message references, and Viva snapshot PDFs, then compares normalized keys in JavaScript. Reset/replacement, project removal, audio replacement, and cron call it.
- **Problem:** Three paired tests of 50 concurrent checks gave median p95 **858 ms at 500 projects** and **5,295 ms at 5,000**. The larger wave retrieved **238,550 reference records**, about 25.23 MB when decoded batches are serialized as JSON. That is not measured wire traffic.
- **Fix:** Query exact candidate keys while retaining exclusions and Viva snapshot checks. Verify/normalize legacy references first, or preserve a compatible fallback; equality alone can miss a shared URL/encoded reference. Ledger repair does not perform that migration. Add only indexes justified by the final query plans.
- **If we skip it:** Small resets/replacements grow expensive and occupy connections that other requests need.

The diagnostic exact-key equivalent, on canonical synthetic references and **without new indexes**, had median p95 **303 / 356 ms** at 500 / 5,000 projects and returned 50 matching records across each wave. All five collections were still queried; shared-key outcomes matched. Full cursor batches, including `getMore`, were counted.

The original project query examined 499 / 4,999 documents through a broad `_id` index walk. An index in a plan does not prove little work. This comparison is not a shipped change or proof of legacy compatibility. The 5,000-project fixture demonstrates growth beyond the supplied baseline, not the present production dataset. [Results/plans](.local-bench/portal-audit-2026-10-12/query-work-complete-cursors.json), [explain documentation](https://www.mongodb.com/docs/manual/tutorial/analyze-query-plan/).

### 6. Password bursts are limited by workers and CPU

- **What this is:** [password verification](lib/security/password.ts), lines 9–24, uses native asynchronous scrypt, `N=32768, r=8, p=1`. Login, registration, reset completion, and email-change verification use it.
- **Problem:** Three repetitions without HTTP/database work gave median p95 **116 ms for one check**, **2,027 ms for 50**, and **3,213 ms for 75**, with four workers. In the corrected HTTP baseline, verification p95 was 1,738 ms against login-callback server p95 2,005 ms.
- **Fix:** Keep password strength/native async code. Choose startup worker settings and compute allocation from complete-workload measurements. More workers do not create more CPU capacity; a replacement password dependency is unnecessary.
- **If we skip it:** Login/reset/registration bursts remain expensive even after database work improves.

Eight workers gave median p95 **1,977 / 2,988 ms** for 50 / 75 checks: modest gains, not proof of better complete-portal performance. Login was a separate wave; reset-completion hashing overlapped mixed actions. [Four-worker results](.local-bench/portal-audit-2026-10-12/password-4.json), [eight-worker results](.local-bench/portal-audit-2026-10-12/password-8.json), [Node documentation](https://nodejs.org/api/cli.html#uv_threadpool_sizesize).

### 7. Configured cleanup drains only part of a normal burst

- **What this is:** [vercel.json](vercel.json) schedules one daily voice-cleanup call, invoking expiry/deletion/email workers with default limits of 25. The separate storage-cleanup route is not scheduled by this file.
- **Problem:** After 50 successful real-PDF finalizations, one default deletion pass deleted **25**, leaving **25**. With 50 expired synthetic reservations, one expiry pass canceled **25**, leaving **25 pending**. Without extra invocations outside this configuration, arrivals above 25/day outgrow each drain. Reserved bytes remain until deletion completes. Email's same limit is source-confirmed, not a measured provider throughput.
- **Fix:** Repeat existing bounded batches within an execution-time budget and schedule enough runs to exceed arrivals, within deployment limits. Preserve leases/retries/deduplication; keep mail from waiting behind long audio cleanup.
- **If we skip it:** Cleanup/notification lag grows across days and retained quota eventually blocks uploads.

This proves background capacity/lag, not the initial reservation delay. Changing 25 to 100 only moves the ceiling. [Worker results](.local-bench/portal-audit-2026-10-12/query-work.json).

### 8. Saved actions wait for refresh and can be labeled failed

- **What this is:** Student action/submission hooks and supervisor project actions await refresh before confirmation. See [submission](components/student/hooks/useStudentProjectSubmission.ts), lines 120–138, and [reset](components/student/hooks/useStudentTeamActions.ts), lines 114–134.
- **Problem:** In Chromium, reset returned HTTP 200, but an intentionally delayed five-second dashboard GET postponed confirmation by **5,344 ms after the save response**. When the next GET was deliberately failed, another HTTP-200 reset displayed **“Project reset failed.”** Actual mixed-load dashboard requests already take seconds.
- **Fix:** Confirm mutation separately from refresh, keep data visible, and handle refresh failure as a refresh problem. Reuse existing hooks/response data. Retain attempt/upload state when improving PDF retries.
- **If we skip it:** Users wait through another slow request and may repeat an action already saved.

The five-second delay was injected to prove the dependency, not claimed as normal browser latency. PDF retries using fresh UUIDs/repeated PUTs are source-confirmed but not isolated as a dominant cause. [Browser experiment](.local-bench/portal-audit-2026-10-12/refresh-browser/report.json).

### 9. Three-item Viva preview builds the entire matching agenda

- **What this is:** [getVivaPanelSessions](lib/vivaSessionDashboard.ts), lines 974–1042, assembles all scheduled workspaces; the [route](app/api/dashboard/supervisor/viva/route.ts), lines 35–43, slices afterward.
- **Problem:** With 3 / 50 / 250 scheduled sessions it built 3 / 50 / 250 workspaces, while each preview contained three entries, about 433 bytes. Median helper durations were **9.5 / 21.1 / 53.6 ms**; decoded database replies grew from **3.8 KB to 255.9 KB**. Wasted work is proved; its cost at these sizes is relatively small.
- **Fix:** Read ordered candidates in small batches and stop after three valid entries. Preserve validation; a blind limit before validation can hide later valid sessions. Avoid assembling unused full workspaces.
- **If we skip it:** Home preview work grows with the agenda while the display stays small.

The original mixed fixture had roughly one session/panel, so this does not explain its seconds-long running-Viva reads. [Results](.local-bench/portal-audit-2026-10-12/query-work-complete-cursors.json).

### 10. Some Viva transactions still use unsupported parallel queries

- **What this is:** `readCurrentContext` at [lib/vivaSessionDashboard.ts](lib/vivaSessionDashboard.ts), lines 526–530, and confirmation snapshots at [lib/vivaRoundAdmin.ts](lib/vivaRoundAdmin.ts), lines 202–211, run `Promise.all` with one transaction session.
- **Problem:** Mongoose documents transaction parallelism as unsupported. This is a reliability defect, not a demonstrated explanation for the successful load runs' latency. The initial unexplained workflow failure is not attributed to it.
- **Fix:** Await queries sequentially inside a transaction; keep independent non-transactional reads parallel.
- **If we skip it:** Start/confirmation relies on unsupported behavior under concurrency.

[Mongoose transaction parallelism rule](https://mongoosejs.com/docs/transactions.html#note-about-parallelism-in-transactions).

## Remaining original claims: candidates, not proved main causes

| Original finding | Assessment |
| --- | --- |
| 9 — repeated upload validation | Extra reads confirmed. A normal reservation uses 13 logical database operations before commit; finding 1's observed command formula matches this. Reuse existing projections/helpers, then measure the improvement. |
| 10 — PDF retries start over | Fresh UUID/no retained upload attempt confirmed in client code. Retry amplification is not isolated under actual failures. Save/refresh feedback is separately proved above. |
| 12 — admin Viva history | Confirmed: `catalogue=0` returned both rounds, 101 panels, and 300 valid schedule DTOs, including history, in about 36 ms in one fixture; all schedules were fetched before serialization. History-growth latency needs a separate test. |
| 13 — index definitions differ | Confirmed between schemas, seed `syncIndexes()`, and deployment scripts. Production index state was not tested. Missing indexes generally are not a proved baseline cause. |
| 14 — searches/exact totals | Regexes, joins, counts, and report aggregates can examine broad data. Individual shapes were not isolated under mixed load. Measure selectivity/plans before selecting an index or changing search. |
| 15 — fresh awaited SMTP | Source-confirmed: no SMTP pool, awaited recovery/email delivery, deliberate 750 ms padding for fast recovery paths. Captured local mail does not establish real provider delay. [SMTP pooling](https://nodemailer.com/smtp/pooled). |
| 16 — shared activity record | Shared awaited update confirmed, bounded to 100 entries. Its independent contribution is not isolated. Pool waiting alone does not justify redesigning its storage. |
| 17 — drafts/remount reads | Extra local work/read triggers confirmed. No browser CPU profile proves they dominate. |
| 18 — one save per panel | Ordered `create` confirmed. Direct workflow rerun saved 250 panels in about 447 ms. It is not the routine dashboard bottleneck; preserve validation before considering `insertMany`. |

## How requests and modifications connect to the causes

| Flow | Data/work path | Implication |
| --- | --- | --- |
| Login/recovery | Rate limits/account → password or OTP/mail → account/activity writes | Password capacity and pool queueing; external SMTP unmeasured |
| Protected API | JWT → active account/session version → Viva lock + cached maintenance | Necessary revocation/access work; do not trust an old JWT instead |
| Student Home | Auth → project, policy, results, schedules → supervisor/members → JSON | Multiple operations; project reuse and empty-schedule early returns already exist |
| Supervisor/admin | Batched projects/members; preview separately; admin lists/reports when opened | Batching/lazy loading exist; preview/history still grow |
| PDF/audio | Reservation → direct PUT → HEAD/prefix/copy → transactional business/quota/outboxes → activity | Shared writes replay; Next.js does not carry the file bytes |
| Reset/team/supervisor/academic | Membership/capacity → reference safety → guarded writes/new project → activity | Broad reads, repeated checkout, some missing retries |
| Review/progression | Stage/version guard → project update → per-recipient durable email enqueue | Inline notification SMTP is already removed |
| Viva execution | Context/snapshots → locks → guarded session update → audit → commit | Shared pool delays without per-session conflicts; starts do not increment a global round counter |
| File viewing | Auth/reference access → signed redirect → direct storage GET | Next.js does not stream PDF bytes |
| Cleanup | Bounded expiry/deletion/email batches; release quota after deletion | Configured drain loses ground to tested bursts |
| UI completion | Mutation → draft work/full refresh → confirmation | Another read delays feedback or mislabels the saved action |

The role dashboard is client-rendered after session discovery, rather than server-preloaded with its database data. There is no continuous five-second dashboard polling in the current UI. Focus, remounts, explicit refresh, and post-action refreshes issue reads; local recording/cooldown timers are not dashboard polling.

Already-present changes include native async scrypt, read-first policy retrieval, batched dashboard members, schedule project reuse/early returns, participant-lock authorization, snapshot-based running Viva reads, lazy admin loading, direct transfer, durable outboxes, and removal of the start-time shared round write. Do not propose them as missing.

## Verification and limits

| Check | Result |
| --- | --- |
| Unit command | 76 test files passed. Integration files without DB environment skip internally; they were exercised separately. |
| Eleven Viva suites plus portal-pause cache | Twelve passed on completed runs/reruns with local replica-set data. Initial workflow invocation failed and left its process open; it was stopped. Direct helper and bounded native TAP reruns passed. Original intermittent failure remains unexplained and is retained in evidence. |
| Lint | Zero errors; one existing unused-variable warning in the baseline runner. |
| TypeScript `--noEmit --incremental false` | Passed against workspace sources. |
| HTTP baseline/headroom | Eight successful runs, 7,056 timed requests. Separate concentrated selection/registration probes failed as documented. |
| Chromium | Three roles, main sections, all Viva views, admin reports; 43 successful API responses in final smoke run, no uncaught page errors. Home screenshots at 1440/390 pixels had no horizontal overflow. |
| Controlled comparisons | Quota concurrency, references/plans/full cursor counts, preview growth, password workers, cleanup, and save/refresh behavior measured above. |

Evidence and temporary diagnostic scripts: [`.local-bench/portal-audit-2026-10-12`](.local-bench/portal-audit-2026-10-12/).

- [Corrected baseline trace](.local-bench/portal-audit-2026-10-12/observed-r3/trace.jsonl) / [summary](.local-bench/portal-audit-2026-10-12/observed-r3/summary.json).
- [Corrected headroom trace](.local-bench/portal-audit-2026-10-12/observed-headroom-r3/trace.jsonl) / [summary](.local-bench/portal-audit-2026-10-12/observed-headroom-r3/summary.json).
- [Uninstrumented baseline](.local-bench/portal-audit-2026-10-12/plain/report.json), [upload-only run](.local-bench/portal-audit-2026-10-12/observed-isolated-r2/report.json), [valid-PDF run](.local-bench/portal-audit-2026-10-12/observed-isolated-realpdf/report.json).
- [Browser smoke results](.local-bench/portal-audit-2026-10-12/browser/report.json), [collision results](.local-bench/portal-audit-2026-10-12/collisions/report.json), [refresh experiment](.local-bench/portal-audit-2026-10-12/refresh-browser/report.json).
- [Initial integration results](.local-bench/portal-audit-2026-10-12/integration-summary.json), [native workflow rerun](.local-bench/portal-audit-2026-10-12/workflow-native-rerun.log), [unit output](.local-bench/portal-audit-2026-10-12/unit.log), [lint output](.local-bench/portal-audit-2026-10-12/lint.log).

Not checked: deployed latency/capacity, hosting/Atlas budgets/indexes, external SMTP/R2/network, sustained fixed-arrival/soak behavior, browser CPU stacks, every report/search combination, and every audio/admin mutation/error branch. Inventory and passing checks do not prove every branch/concurrent ordering safe. No specific CPU function is blamed for all residual latency.

## Smallest justified next steps

1. Shorten existing upload transactions and remove redundant preflight reads while preserving quota/closure correctness. Repeat baseline/headroom with conflict counts and caller-scoped checkout timing.
2. Add native retry handling to manual transactions; repeat concentrated selection/registration probes. Remove unsupported Viva transaction parallelism.
3. Replace broad references with a legacy-compatible candidate-key strategy. The canonical fixture comparison is a performance target, not permission to remove safety checks.
4. Separate save confirmation from refresh failure; make existing background workers drain their backlog in bounded runs.
5. Choose pool/worker/compute settings after reducing wasted work. A framework rewrite, new cache/queue dependency, or blind pool increase has no stronger evidence than these smaller changes.

Verdict: The portal completes the tested mixed bursts but is slow under load; concentrated capacity/registration bursts fail. Start performance work with shared-write replay and database demand. Password capacity and file-reference growth are separately proved. Existing helpers/platform features permit zero new dependencies; an exact line-saving estimate is not defensible before implementation.

Suggested commit message: `docs: replace portal performance suspects with measured bottlenecks`
