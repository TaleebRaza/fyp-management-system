# Portal testing after implementation — 13 October 2026

**Expanded result: the implementations substantially improved upload/submission performance and corrected the reproduced supervisor-selection, registration, cleanup, and save/refresh defects in these local tests. The portal still has multi-second waits under mixed load; this is not a claim that all slowdown or production capacity is resolved.**

This update adds the previously deferred checks to the initial two repeats. The initial results remain below for reference; their untested areas and historical-baseline conclusion describe only that earlier experiment. The paired comparisons and targeted checks here supply stronger evidence.

## Expanded test setup

- Old revision: **`b9c3937`**, immediately before the implementation. Current revision: **`eec7c49`**. Built the old revision afresh; reused the verified current production build. Both used the installed dependency versions, Next.js 16.3.5 Webpack, the same offline font omission, and disabled Sentry DSNs. Both production builds and their TypeScript checks passed. No backend source was changed in either copy for these tests.
- Old copy: `/tmp/fyp-portal-load-v2-old`, a symlink to the ignored old-source/build directory on the project disk. Current copy: `/tmp/fyp-portal-load-v2-KaAphe`. This avoids building another copy on the nearly full system disk. Both ran at `127.0.0.1:3191`.
- MongoDB 7.0.41, local `rs0`, database **`fyp_portal_stress_test`**; temporary MinIO at `127.0.0.1:9002`, bucket **`fyp-portal-stress-test`**; SMTP capture at `127.0.0.1:1025`. Only dedicated synthetic test data was reset or changed. External services were blocked. No production database, index migration, hosting account, deployment, or external email was touched.
- Same i5-8250U host, eight logical CPUs, approximately 7.61 GiB RAM, Node.js 24.18.0. The app, generator, database, and storage shared the host. Tests ran sequentially so the different workloads did not interfere with one another.
- Old runs explicitly used **four** password workers; current runs used the implemented **eight**. This compares the source/configuration bundle, not code with identical worker counts. A separate four/eight-worker password experiment below measures that setting independently.
- Reset/reseed before every load/probe/browser run. Ordinary fixture: 1,000 students, 500 supervisors/projects, 100 panels and distinct sessions. Headroom fixture: 1,500 students, 750 supervisors/projects, 150 panels and distinct sessions. Headroom increased main action groups from 50 to 75, dashboard reads from 75 to 113, login attempts from 50 to 76, and cancellation from 100 to 150. Both used the original 69-byte PDF-like upload fixture.
- Alternating ordinary load order: **old → current → current → old**. Then separate instrumented old/current baseline runs, followed by current/old headroom runs. Every run launched a fresh server. Instrumented timing is kept separate from ordinary timing.
- Reused the existing load runner, corrected audit observer, and existing headroom runner. Temporary scripts and assertions are in ignored artifacts; no application dependency, abstraction, or permanent benchmark framework was added.

## Paired ordinary-load results

All four ordinary runs passed: **3,600 measured requests**, no dropped requests or unexpected responses. Each matched the original 900-request workload, including 25 expected active-Viva login denials, 50 completed password-reset flows, 50 submissions, 100 starts/cancellations, 50 grade audit records, and 550 final projects.

Times are milliseconds. The median columns are **the median of two run-level p95 values**, not a pooled request percentile. Raw reports retain each run’s p50/p95/p99/max and statuses. Negative change means faster.

| Operation | Old median p95 | Current median p95 | Change |
| --- | ---: | ---: | ---: |
| Login, CSRF + callback | 2,506 | 2,235 | -10.8% |
| Initial Viva start | 978 | 993 | +1.5% |
| Viva dashboard reads | 4,238 | 4,423 | +4.4% |
| Student dashboard reads | 4,841 | 4,918 | +1.6% |
| Project reset | 8,396 | 8,455 | +0.7% |
| Password-reset request | 3,737 | 3,993 | +6.9% |
| Password-reset OTP verification | 2,212 | 1,879 | -15.0% |
| Password change completion | 3,623 | 2,787 | -23.1% |
| Project upload reservation API | 16,245 | 10,045 | -38.2% |
| Direct upload to local storage | 11 | 11 | +2.1% |
| Project submission after upload | 10,366 | 1,875 | -81.9% |
| Supervisor change | 7,770 | 7,380 | -5.0% |
| Team change | 8,406 | 8,291 | -1.4% |
| Grade save | 6,160 | 5,266 | -14.5% |
| Second Viva start wave | 7,926 | 8,007 | +1.0% |
| Session cancellation | 1,322 | 1,193 | -9.8% |

Upload reservation p95 improved in both comparisons: old **16,007/16,484 ms**, current **10,115/9,975 ms**. Submission also improved consistently: old **11,027/9,705 ms**, current **1,928/1,822 ms**. These are approximately **38% and 82% improvements** in the median run-level p95.

Ordinary endpoints did not all improve. Dashboard reads, reset, team changes, and Viva starts remain comparable or slightly slower in some comparisons. Login/password completion and grade-save medians improved. With only two trials per version on a shared host, small percentage differences should not be treated as established regressions or gains.

Whole runner duration, including startup/authentication/verification but excluding build and seeding, fell from **48.835/48.709 seconds** to **37.849/36.921 seconds**. This is a shorter workload completion observation, not a requests-per-second capacity estimate.

## Transaction and connection-wait evidence

Both instrumented baseline runs passed another **1,800 requests**. The observer captures the caller before driver `ConnectionPool.checkOut()` and merges overlapping waits within each request. It also counts native transaction callbacks and server write-conflict responses. Monitoring changes timing; these rows explain mechanisms rather than replace the ordinary measurements.

| Baseline group, 50 requests | Old transaction attempts | Current attempts | Old write conflicts | Current conflicts |
| --- | ---: | ---: | --- | --- |
| Reservation | 790 | 50 | systemconfigs: 740 | 0 |
| Submission | 1,189 | 50 | registrationpolicies: 1,087, systemconfigs: 52 | 0 |

The shared-write paths completed once per request in the current single-process test, eliminating observed callback replay on those paths. This supports the implemented local admission mechanism; it does not establish zero contention across multiple application instances.

The next table shows **cumulative caller-scoped checkout wait p95**, with overlap within a request counted once. It excludes local admission-queue waiting, password work, and other processing. Percentiles from different columns are not additive.

| Group | Old checkout wait p95 | Current checkout wait p95 |
| --- | ---: | ---: |
| Reservation | 10,397 | 4,076 |
| Submission | 5,094 | 1 |
| Student dashboard | 3,478 | 3,753 |
| Viva dashboard | 2,950 | 3,111 |
| Grade save | 3,934 | 3,239 |
| Supervisor change | 6,121 | 5,445 |
| Team change | 6,662 | 6,417 |

Connection waiting remains substantial for ordinary endpoints. The five-second setting is a **per-checkout deadline**, not a total request deadline or a cumulative-wait ceiling. No checkout-timeout response was observed in the completed load runs. Driver retry and timeout semantics were checked against MongoDB’s [transaction guide](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/) and [pool options](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/).

The baseline traces found overlapping transactional reads in **100/100 old Viva starts**, versus **0/100 current starts**; headroom found **150/150 old**, versus **0/150 current**. Independent reads outside transactions were excluded. This uses command-start offsets and durations, with a 0.05 ms tolerance for boundary noise. It verifies the exercised start paths; it does not claim every administrative transaction was traced. MongoDB explicitly disallows parallel operations within one transaction in its transaction guide.

## Fifty-percent headroom

Both instrumented headroom runs passed: **1,353 requests each**, zero drops/unexpected statuses, 38 correctly denied active-Viva logins, all 75 main actions per group, 75 grade saves, and 150 total starts/cancellations. Final project count was 825. This is one headroom run per version, not a sustained-capacity guarantee.

| Operation | Old headroom p95 | Current headroom p95 | Change |
| --- | ---: | ---: | ---: |
| Login, CSRF + callback | 4,191 | 3,525 | -15.9% |
| Initial Viva start | 1,868 | 1,470 | -21.3% |
| Viva dashboard reads | 8,070 | 6,855 | -15.1% |
| Student dashboard reads | 9,059 | 7,573 | -16.4% |
| Project reset | 14,280 | 13,411 | -6.1% |
| Password-reset request | 6,880 | 5,900 | -14.2% |
| Password-reset OTP verification | 3,979 | 3,065 | -23.0% |
| Password change completion | 4,898 | 4,697 | -4.1% |
| Project upload reservation API | 28,498 | 16,101 | -43.5% |
| Direct upload to local storage | 9 | 10 | +4.4% |
| Project submission after upload | 20,673 | 3,187 | -84.6% |
| Supervisor change | 13,247 | 11,741 | -11.4% |
| Team change | 13,954 | 13,212 | -5.3% |
| Grade save | 9,707 | 8,005 | -17.5% |
| Second Viva start wave | 13,369 | 12,756 | -4.6% |
| Session cancellation | 1,648 | 2,128 | +29.1% |

| Headroom group, 75 requests | Old attempts | Current attempts | Old write conflicts | Current conflicts |
| --- | ---: | ---: | --- | --- |
| Reservation | 1,598 | 75 | systemconfigs: 1,523 | 0 |
| Submission | 2,372 | 75 | registrationpolicies: 2,219, systemconfigs: 78 | 0 |

Headroom reservation/submission p95 improved about **44%/85%**, but reservation still took **16.1 seconds** at p95. Current reservation cumulative checkout-wait p95 was **6.3 seconds**; admission and other work also contribute. The implementation makes the burst finish faster but does not make every action feel immediate.

Across the eight added load runs, **8,106 measured requests completed without unexpected statuses or drops**. Expected authentication denials are included; setup authentication, targeted tests, and injected browser failures are separate.

## Concentrated failure and rollback probes

Capacity probes used valid signed synthetic sessions to isolate mutation contention from password hashing. Browser and load runs separately exercised real sign-in. Each probe used new accounts/projects and a fresh supervisor with 30 slots.

| Probe | Old result | Current result |
| --- | --- | --- |
| Three 25-student selection waves | Each: 1 accepted, 24 HTTP 500s; occupancy 1 | Each: all 25 accepted; occupancy 25 |
| Ten more selections after each current wave | Not exercised on old | Each: 5 accepted, 5 HTTP 409s; occupancy exactly 30 |
| Two 50-registration waves | 40/38 accepted; 10/12 HTTP 500s | Both: all 50 accepted |
| Twenty attempts for one registration identity | 1 created, 2 duplicate 409s, 2 HTTP 500s, 15 rate-limit 429s | 1 created, 4 duplicate 409s, 15 rate-limit 429s |
| Closed-registration attempt | HTTP 403, no account/counter change | HTTP 403, no account/counter change |

Verified supervisor occupancy equals assigned project count, no capacity overflow, one project and roll-number claim per accepted registration, exact accepted-counter increments, and no account created for the closed attempt.

The current selection probe still had **643 `users` write conflicts and 748 native callback attempts across 105 requests**, including the capacity-boundary requests. Native retries converted conflicts into correct success/business responses; this path is not contention-free. Current registration waves had **100 attempts and zero observed write conflicts across 100 registrations**, while old recorded 22 policy conflicts/500 responses. The tested failure modes are fixed; extremely concentrated selection can still repeat work.

A real unique-invite collision aborted the first attempt, then succeeded on the second whole-transaction attempt. Exhausted collisions stopped after five attempts. Counter writes before failed inserts rolled back; a business error was preserved unchanged. A separate live-session check confirmed all **three explicit sessions ended** after recovery, exhausted retries, and business rejection.

The first current duplicate-identity assertion incorrectly expected 19 HTTP 409s. The existing five-attempt identity rate limit correctly returned 15 HTTP 429s. That harness assertion failure is retained in `targets-new-initial`; corrected expectations were rerun on a fresh fixture, and **all current targeted checks passed**. No application change was made to obtain the pass.

## Cleanup through the real routes

Used actual local objects, MongoDB outboxes/reservations, authenticated cron requests, and SMTP capture. Old and current each received the same initial backlog; no helper stub supplied the outcome.

| One invocation | Old | Current |
| --- | --- | --- |
| Storage cleanup: 75 expired reservations + 75 initial deletion jobs | Expired 25; 50 reservations and 75 deletion jobs remained | Expired all 75; deleted all 150 jobs including expiry-created jobs; none remained |
| Voice cleanup: 125 expired notes + 75 emails | Purged 100 notes; 25 notes/75 deletion jobs remained; sent 25 emails | Purged/deleted all 125 notes; no jobs remained; all 75 emails sent/captured |

Current storage cleanup took approximately **6.7 seconds** and voice cleanup **6.2 seconds** in the canonical repeat. Exact used/reserved counters returned to their pre-test values after complete current processing; head-object checks confirmed all 150 storage-cleanup objects were absent. The routes performed more work than old, so their longer invocation time is expected rather than a latency regression.

Expired-deadline checks against real workers claimed **zero** reservation, deletion, and email jobs. An active deletion check used 20 real jobs, a 100 ms budget, and a 30 ms injected delete delay: **2 completed, 18 remained**; the next pass finished 18, with no processing leases left and exact ledger restoration. The first call lasted **138 ms** because in-flight work may finish after the deadline. This confirms that the budget stops further claims, not interrupts external calls. It does not certify a deployed 60-second allowance with slow remote services.

## Reference safety, scaling, and preview work

Reference timing used 50 simultaneous resolver calls, three repetitions per size/version, with full cursor batches counted. Canonical fixtures had no remaining shared reference after excluding the source project; the expected answer was checked before/after growth. No new index was added.

| Project count | Old median run p95 | Current median run p95 | Old returned documents per wave | Current returned documents |
| --- | ---: | ---: | ---: | ---: |
| 500 | 574 | 247 | 9,950 | 0 |
| 5,000 | 6,026 | 526 | 234,950 | 0 |

Both versions passed **25 real-database legacy/exclusion cases**: canonical keys, signed URLs, slash/whitespace wrappers, twice-encoded paths, and uppercase URL schemes across project PDFs, voice notes, broadcasts, student audio messages, and Viva snapshots. Each reference was detected, each appropriate exclusion removed it, and empty candidate input returned an empty set. These were shared-key resolver checks, not a migration or proof that every deletion caller is safe in every ordering. The legacy fallback can still scan; reduced returned rows are not an index/query-plan claim.

Preview measurement used one dedicated examiner panel, three repetitions at each agenda size, and separately verified full access still returns the entire validated list.

| Scheduled sessions | Old median helper time | Current median helper time | Old workspaces | Current workspaces | Old/current returned DB documents |
| --- | ---: | ---: | ---: | ---: | --- |
| 3 | 9.8 ms | 8.5 ms | 3 | 3 | 18/18 |
| 50 | 18.5 ms | 7.4 ms | 50 | 3 | 249/33 |
| 250 | 43.4 ms | 7.8 ms | 250 | 3 | 1184/33 |

Current preview also paginated past seven leading invalid entries with tied dates, returned the correct first three valid IDs, included a valid running snapshot, excluded a completed session from preview, and retained **252 valid sessions** through full access after adding running/completed snapshots.

Three direct quota repetitions at both 50 and 75 simultaneous reservations checked exact byte accounting, without HTTP/password/S3 contention:

| Reservations | Old median batch duration | Current median batch duration | Old median attempts | Current attempts | Current conflicts |
| --- | ---: | ---: | ---: | ---: | ---: |
| 50 | 2,216 ms | 816 ms | 494 | 50 | 0 |
| 75 | 2,980 ms | 967 ms | 843 | 75 | 0 |

Used bytes stayed unchanged; reserved bytes increased by exactly `count × 69`. Each probe’s test reservations were then removed and the baseline ledger restored. The current serial admission made the entire batch finish faster; it did not merely hide another user’s waiting time.

## Browser save/refresh behavior

Real Chromium sign-in and reset dialogs were exercised against both production builds. Both mutations returned HTTP 200 and the reset’s proposal stage/empty PDF link persisted in MongoDB.

| Injected condition | Old behavior | Current behavior |
| --- | --- | --- |
| Follow-up GET delayed five seconds | Success appeared about 5,359 ms after save, after refresh | Success appeared about 26 ms after save, before refresh |
| Follow-up GET returns HTTP 500 | Displayed “Project reset failed” despite saved mutation | Displayed “Change saved; refresh needed” |

No uncaught page errors were recorded. Home screenshots at 1440/390 pixels showed no horizontal overflow; current desktop confirmation and mobile screenshots were visually inspected. This verifies the representative reset flow, not every submission/name/team/supervisor dialog or a complete browser sweep. Injected GET failures are intentional and excluded from service-failure counts.

## Password workers and resource cost

Using the unchanged native password helper, the same synthetic hash, and three 50/75-check repetitions per worker setting:

| Concurrent checks | Four-worker median p95 | Eight-worker median p95 | Four/eight median CPU time | Four/eight max sampled RSS |
| --- | ---: | ---: | --- | --- |
| 50 | 2,005 | 1,523 | 8.21/10.91 CPU s | 248/375 MiB |
| 75 | 3,170 | 2,246 | 12.89/16.24 CPU s | 249/377 MiB |

Eight workers were faster here, but used more CPU time and memory. CPU time sums processing across threads, so it can exceed elapsed time. Three trials on this host do not determine the best production setting. Password strength/helper behavior was unchanged.

Complete-workload instrumented runs also sampled Node CPU/RSS every two seconds and host load/free memory. The inherited observer records both app and generator without per-sample PIDs: the RSS column below is the maximum for **any sampled Node process**, not total application/database/storage memory. CPU covers sampled intervals and omits partial edges; it is not a complete host CPU integral.

| Instrumented run | Max sampled Node RSS | Sampled app + generator CPU | Max host 1-minute load | Minimum host free memory |
| --- | ---: | ---: | ---: | ---: |
| observed-old | 685 MiB | 123.2 CPU s | 4.94 | 3.70 GiB |
| observed-new | 801 MiB | 130.4 CPU s | 5.52 | 3.50 GiB |
| headroom-old | 744 MiB | 176.7 CPU s | 6.32 | 3.27 GiB |
| headroom-new | 779 MiB | 191.1 CPU s | 6.22 | 3.51 GiB |

The sampling does not justify a CPU-provisioning guarantee or attributing all remaining latency to one function. Full remote-provider and deployment profiling remain necessary.

## What is established, and what remains

The local evidence now establishes improved reservation/submission bursts, removal of observed shared-record replay on those paths, corrected tested supervisor/registration HTTP 500 failures, backlog draining beyond fixed batches, bounded preview work, legacy-compatible candidate reference filtering, and correct reset confirmation despite a delayed/failed refresh. Live rollback/session/accounting checks passed.

The remaining limitation is **capacity and residual latency**, rather than absence of any verified fix. Current headroom reservations still reach 16 seconds at p95; ordinary operations still wait seconds for database connections; concentrated selection still retries heavily. Per-process admission does not coordinate multiple instances or bound queue waiting time. Eight workers consume more resources. Legacy references can still require scans, and cleanup calls can outlast their claim budget.

Not performed: deployed/remote-service latency or capacity tests, sustained fixed-arrival/soak testing, multi-instance contention tests, production index changes, comprehensive app/database/storage host profiling, every administrative transaction/mutation/error branch, or every browser action. Passing these targeted workloads does not certify the entire portal or eliminate the need for deployment measurement.

## Evidence, reproduction, and change scope

Expanded artifacts are local and Git-ignored at [`.local-bench/portal-validation-v2-2026-10-13`](.local-bench/portal-validation-v2-2026-10-13/). Preserve them when sharing this report.

- [Load suite and order](.local-bench/portal-validation-v2-2026-10-13/suite.mjs), [load results](.local-bench/portal-validation-v2-2026-10-13/suite-results.json), [old build log](.local-bench/portal-validation-v2-2026-10-13/old-build.log). Each named run directory has its report, synthetic environment manifest, seed/run logs, host resource samples, and—when instrumented—trace/summary/resource summary.
- Paired reports: [old 1](.local-bench/portal-validation-v2-2026-10-13/paired-old-1/report.json), [old 2](.local-bench/portal-validation-v2-2026-10-13/paired-old-2/report.json), [current 1](.local-bench/portal-validation-v2-2026-10-13/paired-new-1/report.json), [current 2](.local-bench/portal-validation-v2-2026-10-13/paired-new-2/report.json).
- Instrumented baseline: [old summary](.local-bench/portal-validation-v2-2026-10-13/observed-old/summary.json), [current summary](.local-bench/portal-validation-v2-2026-10-13/observed-new/summary.json). Headroom: [old report](.local-bench/portal-validation-v2-2026-10-13/headroom-old/report.json), [current report](.local-bench/portal-validation-v2-2026-10-13/headroom-new/report.json).
- Targeted checks: [old](.local-bench/portal-validation-v2-2026-10-13/targets-old/report.json), [corrected current](.local-bench/portal-validation-v2-2026-10-13/targets-new/report.json), [initial rate-limit expectation failure](.local-bench/portal-validation-v2-2026-10-13/targets-new-initial/report.json), [suite results including correction](.local-bench/portal-validation-v2-2026-10-13/target-suite-results.json).
- Resolver/preview/quota/rollback: [old](.local-bench/portal-validation-v2-2026-10-13/helpers-old.json), [current](.local-bench/portal-validation-v2-2026-10-13/helpers-new.json). [Active deadline check](.local-bench/portal-validation-v2-2026-10-13/deadline.json), [live session cleanup](.local-bench/portal-validation-v2-2026-10-13/sessions.json).
- Browser: [old](.local-bench/portal-validation-v2-2026-10-13/browser-old/report.json), [current](.local-bench/portal-validation-v2-2026-10-13/browser-new/report.json), with screenshots/server logs in the same folders. Passwords: [four workers](.local-bench/portal-validation-v2-2026-10-13/password-4.json), [eight workers](.local-bench/portal-validation-v2-2026-10-13/password-8.json).

The temporary MinIO container was stopped after testing; test data and raw artifacts were retained. Existing MongoDB services were left running. The scripts require the documented dedicated local database/bucket and reset synthetic fixtures before each run. Old-source extraction/build and current build locations must exist to reproduce the paired suite; ports 3191/9002/1025 must be available. Use the included environment and local-network guard rather than production credentials.

Only `Testing_v2.md` was added/updated as a tracked deliverable. Reusing the existing runner and observer kept application code unchanged, avoided new dependencies, and preserved workload comparability. A different runner or speculative application rewrite would not answer the requested before/after test as directly.

Suggested commit message: `docs: validate portal performance fixes with paired and targeted tests`

---

## Initial historical-baseline comparison (retained)

Result: **both repeats passed; overall slowdown is not demonstrated resolved.** Project submission p95 improved in both runs. Most other operations were slower than the historical baseline, and upload reservation results varied.

Read alongside [Implementation.md](Implementation.md), [testing.md](testing.md), [Findings.md](Findings.md), and [findings.md](findings.md). This report contains new runtime measurements, rather than the implementation report’s earlier source/stub checks.

### Source, setup, and evidence

- Tested current revision `eec7c49` (`reduce transaction contention and redundant portal work`). The tracked working tree was clean before testing. No application source, dependency, deployment, or production service was changed by this task.
- Built a fresh disposable production copy at `/tmp/fyp-portal-load-v2-KaAphe` with the installed Next.js 16.3.5 Webpack builder. Compilation, the build’s TypeScript check, and production build passed. The build reported an existing Sentry import deprecation warning.
- The disposable copy omitted the Google font download and disabled Sentry DSNs. Backend business logic was unchanged. Local-only DNS guarding was enabled for seeding and runtime. These adjustments and synthetic local settings are recorded in the artifact manifest; historical baseline telemetry/build settings are not fully recorded in its report.
- Application: `127.0.0.1:3191`; MongoDB 7.0.41, local `rs0`; database **`fyp_portal_stress_test`**. Used the existing local MongoDB service, resetting only the dedicated stress database for each run.
- New temporary MinIO instance: `127.0.0.1:9002`, image `pgsty/silo:RELEASE.2026-09-03T13-18-01Z`; dedicated **`fyp-portal-stress-test`** bucket. SMTP capture: `127.0.0.1:1025`; no external email sent.
- Fixture reseeded before each repeat: 1,000 students, 500 supervisors, 500 projects, one Viva round, 100 panels, and 100 distinct sessions with separate projects/panels. Each completed run ended with 550 projects.
- Same host model as the baseline: Intel Core i5-8250U, eight logical CPUs, approximately 7.61 GiB RAM; Node.js 24.18.0. App, database, storage, and load generator shared the host.
- Explicitly set **`UV_THREADPOOL_SIZE=8`** before process startup to exercise the implemented worker configuration. The existing runner starts Node directly and bypasses the npm startup script. The historical baseline JSON does not record its worker setting; the later audit explicitly used four. This comparison measures the implementation/configuration bundle, not an isolated worker-count experiment. Node documents this startup setting in its [CLI reference](https://nodejs.org/api/cli.html#uv_threadpool_sizesize).
- Initial setup failed before load execution with MinIO HTTP 507 / `XMinioStorageFull` on the nearly full system disk. Restarted temporary MinIO with its data on the project disk (approximately 138 GiB available), then reseeded. This setup failure is not a portal request failure. Build was reused for the second repeat; each repeat launched a fresh production server.

Local, Git-ignored evidence:

- [Run 1 report](.local-bench/portal-load-v2-2026-10-13/run-1-report.json), [Run 2 report](.local-bench/portal-load-v2-2026-10-13/run-2-report.json), and [latest report](.local-bench/portal-load-v2-2026-10-13/report.json).
- [Baseline raw report](.local-bench/portal-load-2026-10-12/report.json).
- [Manifest](.local-bench/portal-load-v2-2026-10-13/manifest.json), [reproduction script](.local-bench/portal-load-v2-2026-10-13/run.mjs), [build/setup log](.local-bench/portal-load-v2-2026-10-13/run.log), [first successful run log](.local-bench/portal-load-v2-2026-10-13/retry.log), [second run log](.local-bench/portal-load-v2-2026-10-13/run-2.log).

Keep these artifacts with the report when sharing results; they are not committed.

### Workload and correctness

Reused `tests/support/portal-load-baseline-runner.mjs` without edits. The exact executed order matters: after actor authentication/setup and 50 initial Viva starts, the 50-login wave **finishes before** the other mixed work. Then project/account operations, 75 dashboard reads, 50 grade saves, and 50 second-wave starts overlap. Finally, 100 sessions are canceled concurrently. The wording in the original baseline report suggesting all login/mixed work and grade/start phases were sequentially arranged differently does not match the runner; both comparisons use the runner’s actual order.

The mixed work includes 50 project resets, 50 complete password-reset flows, 50 upload reservation/PUT/submission flows, 50 supervisor changes, and 50 team changes. Each account/project action uses a separate synthetic account. Upload bytes remain the original tiny PDF-like fixture (69 bytes), preserving the baseline rather than substituting a realistic document workload.

Each repeat verified:

- **900 measured HTTP requests**, zero dropped requests, zero unexpected statuses, and zero recorded unexpected errors.
- 25 non-Viva students authenticated; all 25 active-Viva students were correctly denied with HTTP 401. The remaining 875 measured requests succeeded. Direct storage PUT requests are included; setup authentication is excluded. The combined CSRF/callback latency row does not add another HTTP request.
- 50 reset messages captured locally and all 50 OTP/password-change flows completed.
- All 250 project/account operations, 75 dashboard reads, 50 grade saves, and 100 total Viva starts completed. Database checks found 50 accepted grade audit events and 100 canceled sessions.
- Student count remained 1,000; final project count was 550.

These are the existing runner’s assertions, not a comprehensive storage-ledger, supervisor-capacity, or every-field invariant audit.

### Latency comparison

All times are milliseconds; p95 means 95% of samples completed within that time. Counts and concurrency match the historical baseline. Percentages use unrounded raw values. Negative change means faster. Both new repeats are shown; neither is selected as the sole result.

| Operation | Requests/attempts | Baseline p95 | Run 1 p95 | Run 2 p95 | Run 1 change | Run 2 change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Login, CSRF + callback | 50 | 2,327 | 2,564 | 2,162 | +10.2% | -7.1% |
| Initial Viva start | 50 | 589 | 1,071 | 1,207 | +81.8% | +104.8% |
| Viva dashboard reads | 50 | 2,695 | 4,806 | 3,930 | +78.3% | +45.8% |
| Student dashboard reads | 25 | 3,092 | 5,361 | 4,421 | +73.4% | +43.0% |
| Project reset | 50 | 5,485 | 8,937 | 7,732 | +62.9% | +41.0% |
| Password-reset request | 50 | 2,440 | 4,391 | 3,578 | +79.9% | +46.6% |
| Password-reset OTP verification | 50 | 1,416 | 1,946 | 1,746 | +37.4% | +23.3% |
| Password change completion | 50 | 2,740 | 3,549 | 2,588 | +29.5% | -5.5% |
| Project upload reservation API | 50 | 11,033 | 11,243 | 9,208 | +1.9% | -16.5% |
| Direct upload to local storage | 50 | 7 | 16 | 13 | +141.3% | +95.5% |
| Project submission after upload | 50 | 6,918 | 2,560 | 2,014 | -63.0% | -70.9% |
| Supervisor change | 50 | 4,862 | 7,898 | 6,892 | +62.5% | +41.8% |
| Team change | 50 | 5,276 | 8,760 | 7,584 | +66.0% | +43.7% |
| Grade save | 50 | 3,366 | 5,699 | 4,742 | +69.3% | +40.9% |
| Second Viva start wave | 50 | 4,584 | 8,274 | 7,330 | +80.5% | +59.9% |
| Session cancellation | 100 | 910 | 1,135 | 1,530 | +24.7% | +68.2% |

New-run p50 and maximum values are included below; raw reports also contain p99 and per-operation statuses.

| Operation | Run 1 p50 | Run 1 max | Run 2 p50 | Run 2 max |
| --- | ---: | ---: | ---: | ---: |
| Login, CSRF + callback | 2,342 | 2,595 | 2,005 | 2,163 |
| Initial Viva start | 1,042 | 1,078 | 1,180 | 1,214 |
| Viva dashboard reads | 4,743 | 4,834 | 3,884 | 3,956 |
| Student dashboard reads | 5,335 | 5,368 | 4,393 | 4,427 |
| Project reset | 5,969 | 8,949 | 4,962 | 7,741 |
| Password-reset request | 4,231 | 4,477 | 3,419 | 3,637 |
| Password-reset OTP verification | 1,904 | 1,967 | 1,694 | 1,758 |
| Password change completion | 2,861 | 3,589 | 2,446 | 2,624 |
| Project upload reservation API | 10,455 | 11,302 | 8,546 | 9,261 |
| Direct upload to local storage | 8 | 27 | 6 | 18 |
| Project submission after upload | 1,983 | 3,299 | 1,763 | 2,105 |
| Supervisor change | 7,827 | 7,907 | 6,812 | 6,904 |
| Team change | 8,599 | 8,762 | 7,537 | 7,592 |
| Grade save | 5,668 | 5,704 | 4,701 | 4,745 |
| Second Viva start wave | 8,205 | 8,298 | 7,266 | 7,331 |
| Session cancellation | 979 | 1,141 | 1,310 | 1,537 |

### What improved, and what remains unresolved

**Submission latency improved consistently.** Its p95 fell from 6,918 ms to 2,560 ms and 2,014 ms: approximately 63% and 71% faster. All 50 submissions succeeded in each repeat. This is evidence of better request latency for this workload; without transaction observers it does not quantify how much came from fewer conflicts, fewer reads, or changed workload overlap.

**Reservation improvement was inconsistent.** Its p95 was 11,243 ms and 9,208 ms against 11,033 ms previously: approximately 2% slower and 17% faster. The reservation path still takes many seconds, so this test does not establish that its bottleneck is fixed. Faster submission can also change when later requests overlap.

**Most remaining endpoints were slower in both repeats.** Student/Viva dashboard reads, project reset, supervisor change, team change, grade save, both Viva start waves, OTP verification/request, and cancellation exceeded historical p95. Login and password completion improved only in the second repeat. These observations prevent an overall speedup claim. They do not by themselves prove the changes caused regressions: there was no same-session rebuild/retest of the old revision, no controlled host-load/thermal measurement, and only one historical baseline versus two new repetitions.

**Correctness held within this tested workflow.** Both new runs matched the baseline’s zero unexpected failures. This baseline never reproduced the concentrated shared-supervisor assignment/registration failures reported in `findings.md`, so passing it cannot demonstrate that those separate defects were fixed.

The five-second database checkout deadline produced no unexpected failures in these runs. Total request durations exceeding five seconds remain possible because that deadline applies to individual checkout waits, not the whole request.

### Limits and next measurement

This is a repeatable local burst comparison, not production capacity certification. It did not measure external SMTP, production object storage/network, deployed latency, steady arrival rates, sustained soak behavior, complete-workload CPU/memory, or multi-instance queue contention. No production database/index migration or deployment was performed.

The same runner does not directly measure transaction attempts/conflicts or caller-scoped checkout waits. It does not exercise registration, concentrated initial supervisor selection, cleanup cron draining, legacy-reference growth/safety, the three-entry Home preview pagination, browser confirmation/refresh failures, or a 50%-headroom workload. No browser sweep or UI redesign was performed.

The smallest useful follow-up is a paired old/current comparison under the same host conditions, followed by the existing targeted conflict/checkout probes and separate selection/registration, cleanup, reference, preview, and browser-refresh checks. Add the 75-action headroom burst before declaring capacity improved. Avoid another speculative rewrite or pool increase based on these latency rows alone.

### Reproduction and change scope

The ignored reproduction script creates the disposable build, uses only synthetic local configuration, seeds via `scripts/seed-local.mjs performance` with the baseline counts, and executes the existing stress runner. Start the documented local MongoDB replica set and temporary MinIO on port 9002 first. `PORTAL_V2_REUSE_APP=/tmp/fyp-portal-load-v2-KaAphe` skips rebuilding while still reseeding and restarting the server; omit it for a fresh build. Archive `report.json` before another repeat, since the runner overwrites it. The temporary MinIO container was stopped after testing; evidence and its local data directory were retained.

Only this tracked report was added. Existing code, runner, and baseline documentation were retained, and no dependency was added. Reusing the baseline was the leanest way to answer the requested comparison; rewriting it would introduce a new workload and weaken comparability.


