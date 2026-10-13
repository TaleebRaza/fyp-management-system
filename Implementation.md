# Portal slowdown implementation — 13 October 2026

Read [Findings.md](Findings.md) first, then [findings.md](findings.md). The newer report supplies the measured remaining causes; the older report's closing implementation sections already record fixes for its eleven findings. This work implements the remaining source/configuration changes without adding dependencies or redesigning the portal.

Baseline revision: `b9c3937`. The existing deletion of `repomix-output.xml` was left alone. No database, bucket, hosting account, or deployed service was changed.

## Proven causes and resulting changes

The timings below are **the reports' original measurements**, not measurements of this implementation. Source changes and focused checks establish what changed; they do not establish a production speedup.

| Issue from the newer report | Evidence and effect | Implemented solution | Why this is the smallest justified approach |
| --- | --- | --- | --- |
| 1. Upload reservations conflict on the shared quota record | Fifty reservations needed 733 transaction attempts, including 683 quota conflicts. | [storageProtocol.ts](lib/storageProtocol.ts) uses bounded shared-write admission, checks ledger readiness outside the retrying callback, and validates counters/capacity in the atomic update. The quota write precedes the audio pending-upload read. Reservation/idempotency handling remains transactional. | Reduces competing writes and repeated reads while preserving exact quota accounting. Removing the transaction or guards would change correctness; a new distributed queue is not justified before measuring the smaller change. |
| 2. Submissions conflict on the shared submission policy and quota records | Fifty submissions needed 947 attempts, with 839 policy and 58 storage conflicts. | Finalization enters the same admission queue and converts quota at the start of its transaction. The student submission gate uses `updateOne`/`matchedCount`, after required membership/stage checks and before duplicate-title reads. Any later failure rolls back quota, acceptance, project changes, and outbox writes together. | Keeps the authoritative closure gate, eliminates the unused returned policy document, and detects contention before more work is repeated. Cached permission or deleting the acceptance write would permit stale submissions. |
| 3. Requests wait for database connections | Corrected checkout p95 reached 3.4–7.1 seconds across ordinary requests. | [mongodb.ts](lib/mongodb.ts) sets a five-second checkout deadline, retaining the existing ten-connection ceiling. PDF preflight reuses fine fields from the authenticated account, existing project members, and the already-read policy. Submission also reuses its project-member read. | Removes up to three redundant reads from fined-team PDF preflight and one from submission. Reducing contention and demand is better supported than increasing the pool, which previously worsened tail latency. The deadline bounds overload waiting; it is not a speedup for successful requests. |
| 4. Supervisor selection and registration fail on conflicts | Each 25-student selection wave accepted one student and returned 24 HTTP 500s despite available slots; registration waves also failed. | [transaction.ts](lib/transaction.ts) supplies native transaction retries and session cleanup. Assignment/change, registration, migration/removal, and supervisor deletion use it. Registration shares admission with upload transactions. Invite-code collisions restart the entire transaction, up to five attempts, including academic reset and team-leave callers. Business errors keep their existing HTTP statuses; activity/cache effects run after commit. | Reuses MongoDB's retry machinery instead of maintaining custom transient-error retry logic in every route. Retrying an insert inside an already-aborted transaction cannot solve an invite collision. |
| 5. Checking one file loads unrelated references | Reference-check p95 grew from 858 ms at 500 projects to 5,295 ms at 5,000; the larger wave returned 238,550 records. | [storageReferenceSafety.ts](lib/storageReferenceSafety.ts) selects exact candidate keys plus possible legacy URL, encoded, slash-prefixed, or whitespace-wrapped references. Existing normalization, exclusions, all reference locations, and Viva snapshot checks remain. | Stops returning unrelated canonical references. Equality alone could miss a shared legacy URL and delete a live file. No speculative index or normalization migration was added. |
| 6. Password bursts exceed worker/CPU capacity | Fifty/75 checks had median p95 2,027/3,213 ms with four workers. Eight workers showed modest helper gains. | [package.json](package.json) starts development/production Node processes with an overridable default `UV_THREADPOOL_SIZE=8`. Native asynchronous scrypt and its strength remain unchanged. | Two startup lines reuse the documented runtime setting and the repository's existing eight-worker recommendation. A password dependency or weaker hash is unnecessary. CPU provisioning and the best worker count remain deployment-dependent. |
| 7. Cleanup drains only 25 jobs per daily invocation | One pass left 25 of 50 deletions and 25 of 50 expired reservations pending. | [drainBatches.ts](lib/drainBatches.ts) repeats existing batches within a 40-second run budget. Workers stop claiming jobs at their deadline; their leases, retries, deduplication, and dead-letter handling remain. Voice cleanup begins email draining alongside storage work. Both cleanup routes declare a 60-second hosting allowance. [vercel.json](vercel.json) also schedules storage cleanup daily at 00:30 UTC, after voice cleanup at 00:00 UTC. | Removes the fixed 25-job daily ceiling while retaining small batches. Another daily drain stays compatible with daily-only hosting schedules. A single larger batch would merely move the ceiling. |
| 8. Saved actions wait for refresh and can appear failed | An HTTP-200 reset waited another 5,344 ms for confirmation; an injected failed GET displayed “Project reset failed.” | Student submission, team, supervisor, academic, and name actions confirm immediately after the mutation response. [refreshAfterSave.ts](components/refreshAfterSave.ts) handles subsequent draft/refresh errors as “Change saved; refresh needed.” Student controls retain their existing busy state during refresh. Supervisor project actions refresh asynchronously, with refresh errors handled by their data hook; the existing project list remains visible. | Reorders existing work and adds one small shared error boundary. No client cache/store dependency or guessed local project state is needed. |
| 9. Three-item Viva preview builds the entire agenda | At 250 sessions the helper built 250 workspaces for three displayed entries; helper median reached 53.6 ms. | [vivaSessionDashboard.ts](lib/vivaSessionDashboard.ts) reads preview candidates in ordered batches of six, using date/ID pagination, validates through the existing live/snapshot paths, and stops constructing workspaces after three valid entries. Full Viva access still returns the full validated list. | A small loop reuses existing validation. A blind limit of three before validation could hide later valid sessions. |
| 10. Viva transactions issue unsupported parallel queries | A confirmed reliability defect; its independent contribution to latency was not demonstrated. | Transactional context reads and confirmation snapshot queries await sequentially. Independent reads outside transactions retain parallel execution. | Removes unsupported behavior with native `await`, without changing business rules or introducing locks. |

The queue permits one shared-write transaction per server process and caps outstanding jobs at 256. Overload returns HTTP 503 on reservation, PDF submission, and registration paths. Storage verification/copy and password hashing occur outside admission/transactions. MongoDB transactions and retries remain responsible for correctness across server instances; the local queue is a contention mitigation, not a distributed lock.

Native transaction retries and the rule against transaction parallelism are documented by [MongoDB](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/) and [Mongoose](https://mongoosejs.com/docs/transactions.html). The guarded quota expression uses MongoDB's [numeric type check](https://www.mongodb.com/docs/manual/reference/operator/aggregation/isnumber/) and [conditional evaluation](https://www.mongodb.com/docs/manual/reference/operator/aggregation/cond/). Connection checkout deadlines use the [driver's pool options](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/).

## Earlier findings already implemented

These implementations were checked in source and retained. Their earlier runtime results and qualifications remain in [Findings.md](Findings.md); they were not rerun here.

| Older finding | Existing implementation retained |
| --- | --- |
| 1. Student sorting index | `{ role: 1, createdAt: -1, _id: -1 }` in the schema and guarded index deployment script. Applying it to the deployment database remains a release step. |
| 2. Student status join | Project-first candidate selection for assigned statuses, followed by canonical membership checks. |
| 3. Report joins | Scoped report queries skip unrelated joins/details. |
| 4. Unused admin lists | Management lists load when opened. |
| 5. Repeated student-page metadata | Later pages omit global metadata and retain existing filter options. |
| 6. Student Home supervisor catalogue | Assigned students load the catalogue when needed. |
| 7. Sequential student refreshes | Independent refreshes run together; this change additionally separates confirmation from refresh failures. |
| 8. Admin email refresh scope | Refreshes the affected people list. |
| 9. Viva catalogue/refetch work | Reuses the setup catalogue between operational tabs. |
| 10. Supervisor Viva preview | Existing small response retained; this change also bounds work before serialization. |
| 11. Payload/read trimming | Supervisor contact fields and separate broadcast payload; narrowed read-only projections. |

The newer report explicitly leaves SMTP delay, generic missing indexes/search joins, activity-record contention, browser CPU/drafts, admin history growth, PDF retry amplification, and panel insertion as unproved main causes. Their mere presence is not evidence for another redesign. This implementation does not introduce PDF upload retry behavior or claim those candidates have been resolved.

## Keeping the implementation lean

Added no dependencies, collections, cache framework, or generic repository layer. The existing routes, hooks, storage protocol, fine helper, and Viva validators remain the places responsible for their behavior.

Three shared runtime helpers total 77 lines: transaction/session handling and bounded admission (48), batch draining (18), and post-save refresh handling (11). Centralizing transaction cleanup replaces repeated manual start/commit/abort/end code. Invite creation performs one insert per transaction attempt. The two existing source-structure tests were updated for the centralized helpers; behavioral checks live in one focused test file.

Larger pool sizes, a framework/database rewrite, weaker passwords, unconditional exact-key matching, a new queue dependency, and blanket Viva limits have no stronger evidence or would compromise existing behavior. The chosen changes address the measured mechanisms with existing platform features. “Smallest justified” describes the implementation choice; it is not a claim that every possible implementation has been benchmarked.

## Focused validation only

- TypeScript: `tsc --noEmit --incremental false` passed.
- ESLint on changed code/test files passed; later changed files were rechecked.
- `git diff --check` passed.
- Nine distinct focused test files passed: performance fixes, project creation structure, storage workflow structure, storage validation, project storage cleanup, remaining dashboard findings, student dashboard API, student workflow API, and project submission policy.
- Seven new behavior checks cover whole-transaction invite retries/business errors/session cleanup, bounded serial admission and recovery, draining 75 jobs plus deadline handling, legacy reference/exclusion/snapshot safety, confirmation before a delayed failing refresh, member reuse with teammate fine checks, and preview pagination past invalid entries with tied dates.

Tests use isolated in-memory stubs and the existing TypeScript test tooling. They do not certify real database conflicts, MongoDB query plans, storage accounting under concurrent services, S3 transfers, or provider performance.

As requested, no complete portal suite, build, browser sweep, database integration run, load/soak benchmark, index migration, or deployment was performed. No new design was introduced.

## Deployment and remaining measurement

1. Deploy the source/configuration changes through the existing release process; run its index preflight before applying the already-defined student index. No index was applied by this task.
2. The npm launch scripts default to eight workers and honor an existing `UV_THREADPOOL_SIZE`. Hosting that starts Node directly must set that variable before startup. The setting is documented by [Node](https://nodejs.org/api/cli.html#uv_threadpool_sizesize). More workers consume CPU/memory and do not create CPU capacity; compare complete workloads on the actual host before retaining its production value.
3. Keep the ten-connection pool until deployment measurements justify another value. Five seconds is a per-checkout deadline, not a total request or transaction deadline; overloaded requests can fail. Admission bounds queued job count, not queue waiting time. Cross-instance shared-record contention can still cause native retries.
4. Cleanup stops starting work at its budget. An in-flight database/storage/mail operation can outlast that budget. Confirm the hosting allowance and that daily processing exceeds arrivals; larger backlogs or slow external services may require more frequent invocations on a supporting plan. Daily scheduling follows the existing deployment constraints and [Vercel's cron plan rules](https://vercel.com/docs/cron-jobs/usage-and-pricing).
5. Legacy fallback can still scan and return many noncanonical references. A later verified normalization migration can remove that fallback. The ledger repair script does not normalize legacy URL fields. No new index benefit is claimed without query-plan checks.
6. Before claiming the slowdown resolved, compare baseline and 50%-headroom bursts, transaction attempts, conflicts, caller-scoped checkout waiting, reference-query results, cleanup backlog, and complete-workload CPU/memory on the deployment. Those measurements are intentionally outside this implementation-only task.

Suggested commit message: `perf: reduce transaction contention and redundant portal work`
