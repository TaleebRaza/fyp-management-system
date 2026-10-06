# Local viva mixed-traffic test — October 6, 2026

The requested workload completed without unexpected HTTP responses, timeouts, or detected data inconsistencies. Responsiveness degraded substantially: student dashboard p95 was 7.02 seconds, login p95 was 6.79 seconds, and grade-save p95 was 5.73 seconds. This demonstrates local correctness under this workload, not comfortable response times or production capacity.

The separate PDF restriction probe found a functional gap: closing submissions does not disable every upload. Resetting a never-submitted project increases its version to 1, after which the upload API issues a signed URL despite submissions remaining closed. No PDF was transferred in any test.

## Environment and method

- Current application source: commit `bf5bb66`; only test tooling, the package test command, and this report were changed. A fresh `next build --webpack` succeeded. Next.js ran in production mode on loopback port 3102.
- Node 24.18.0, Next.js 16.3.5, Mongoose 9.10.2, NextAuth 4.24.15; local MongoDB 7.0.41, single-node replica set `rs0`.
- Intel Core i5-8250U, 8 logical CPUs, 7.61 GiB RAM. The app, database, test client, and resource sampler shared this machine.
- Synthetic fixture: 5,501 users and 2,500 projects initially. Exactly 4,900 students had project memberships; the two login-only fixture accounts did not have projects.
- The admin API created a round, saved 75 two-examiner panels, scheduled 75 distinct teams, and confirmed the round. The admin submissions switch was closed before starting the vivas.
- Fifty start requests were sent concurrently; all succeeded. Fifty sessions stayed active while the remaining 25 stayed scheduled.
- Fifty unrelated students each changed their name and batch once, respecting the one-change-per-day policies, then repeatedly joined a paired student's team, reset that project, and left it.
- Independent loops issued 40/50-user successful login bursts, 50 grade saves, and 50 student plus 50 viva dashboard reads. The admin viva dashboard was also read. Login waves waited 15 seconds after completing; writer cycles waited 2 seconds, dashboard cycles 5 seconds, and grade cycles 10 seconds.
- The load window was 600 seconds; in-flight operations and loop waits drained in 606.17 seconds. The full run, including setup and final checks, lasted from 19:20:47 to 19:31:20 PKT.
- Requests had a 30-second timeout. Authentication, origin checks, access restrictions, password hashing, transaction handling, and the application's pool size of 10 remained enabled. Sentry tracing was set to zero, outbound sockets were restricted to loopback, and real email credentials were disabled.

## Results

The mixed phase served **26,450 real HTTP requests**, approximately **43.6 requests/second** across the drained window. The synthetic CSRF-plus-callback timing row is excluded from that count because it measures two existing requests rather than issuing another request.

| Operation | Successful requests | Median | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Concurrent viva starts | 50 | 1.17 s | 1.27 s | 1.27 s |
| Login, CSRF + callback | 1,350 | 3.10 s | 6.79 s | 9.00 s |
| Student dashboard | 3,050 | 4.11 s | 7.02 s | 8.90 s |
| Viva dashboard | 3,050 | 1.48 s | 4.17 s | 5.53 s |
| Admin viva dashboard | 61 | 4.54 s | 6.91 s | 7.79 s |
| Grade save | 2,250 | 2.26 s | 5.73 s | 7.30 s |
| Name change | 50 | 8.24 s | 9.10 s | 9.13 s |
| Batch change | 50 | 1.44 s | 3.18 s | 3.24 s |
| Join team | 4,628 | 1.67 s | 5.48 s | 10.09 s |
| Reset project | 4,628 | 0.75 s | 2.57 s | 9.31 s |
| Leave team | 4,628 | 0.96 s | 3.20 s | 9.99 s |
| Complete viva after load | 50 | 0.41 s | 0.68 s | 0.69 s |

p95 means 95% of the measured operations completed within that time. There were **30 login waves and 1,350/1,350 successful logins** during active vivas. A separate pre-viva 50-login wave had p95 3.89 seconds; this single-run comparison is context, not a controlled optimization experiment. Name and batch statistics describe one initial synchronized burst each, not continuous repeated changes.

Correctness checks passed: all 50 vivas completed; 25 remained unstarted; all participant locks were released; accepted grade saves had exactly 2,250 matching audit events; stale grades could not overwrite valid grades; all 4,900 project-member students retained exactly one team; teams were nonempty and within capacity; supervisor occupied-slot counters matched actual projects; student names and batches matched their accepted updates; and storage used/reserved bytes and upload reservation counts remained zero throughout the main test.

Ten students competed for one vacant team slot after the load phase: exactly one joined and nine received the expected 409 response. The name cooldown rejected repeat changes with 429, and a student with an active viva was correctly denied both a detail change and a fresh login. Expected rejections were counted separately from failures.

## Resource evidence and interpretation

Sixty approximately ten-second samples within the mixed phase recorded Next server RSS of **596–845 MiB**, MongoDB resident memory of **221–282 MiB**, and Next server CPU of **94–197%** (100% represents one logical CPU). MongoDB had 42–44 open connections, zero rejected connections, and zero sampled database lock queue. These snapshots do not measure the application's connection-pool wait queue and cannot exclude brief queues between samples.

Server-wide MongoDB insert/query/update/delete counter deltas averaged **272 operations/second**, ranging from 196 to 327 over sample intervals. Aggregation and other commands are excluded, so this is an approximate CRUD workload indicator rather than an exact Atlas billing/quota measure. The server-wide write-conflict counter increased by 672; no resulting API failures or final inconsistencies were detected. The fixture initialization and database cleanup were excluded from these resource ranges.

Five read-only query plans for login lookup, student project lookup, participant restrictions, examiner panels, and snapshot schedules used indexes and examined zero or one documents. Those five paths do not cover every query. Internal timing across the full run's 1,502 accepted setup/baseline/load logins recorded mean password verification of 718 ms out of 1,777 ms total authorization time. Password work and queued database round trips are plausible contributors; this test did not isolate a single root cause. The shared activity-feed document is another contention candidate, not a proven cause.

Local MongoDB has no Atlas Free throughput cap. Atlas Free currently permits 100 read/write operations per second and throttles excess traffic. The observed local workload is therefore a reason to expect substantially worse response times on that tier, not evidence that the same load will pass there. [MongoDB Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)

## PDF restriction finding

In a separate isolated fixture, the existing admin API closed submissions. A never-submitted project's upload request returned 403 with `PROJECT_SUBMISSIONS_CLOSED`. Calling the real `resetProject` endpoint then raised its version to 1. The identical upload request returned 200 with a signed URL pointing to local MinIO and reserved 100 bytes, even though submissions were still closed. No PUT or PDF transfer occurred; the separate fixture was dropped afterward.

`hasPreviousProjectSubmission()` treats any positive project version as a previous submission, while `resetProject` also increments that version. The existing switch cannot enforce a complete PDF freeze for this scenario. The main capacity test transferred no PDFs and had no upload reservations, but it must not be described as proof that every upload is blocked.

## Scope, validation, and replay

This was one local ten-minute closed-loop API run: each actor waits for its previous response, so arrival rate falls as responses slow. It does not establish a fixed-RPS breaking point, a full-day soak result, browser rendering performance, remote network latency, cloud cold-start behavior, actual PDF deletion costs, email-change delivery capacity, or 75 simultaneously active vivas. Projects contained no PDF objects. No application capacity changes were applied to improve the result.

The short mixed preflight passed after correcting an initial localhost/origin mismatch in the harness setup. The original stress runner's preflight also passed after the helper changes. Fresh production build, focused ESLint, JavaScript syntax checks, diff whitespace checks, and rejection of non-loopback/wrong-database targets passed. The dedicated `fyp_viva_http_stress_test` database was dropped after each run, and the test server and resource sampler were stopped.

The new runner reuses the existing HTTP client, password fixtures, model loader, metrics, and environment guards. It adds no dependencies. With a production server configured for the dedicated local database, replay it with:

```bash
VIVA_STRESS_BASE_URL=http://localhost:3102 \
VIVA_STRESS_MONGODB_URI='mongodb://127.0.0.1:27017/fyp_viva_http_stress_test?replicaSet=rs0' \
VIVA_STRESS_ARTIFACT_DIR=.local-bench/mixed-replay \
npm run test:viva:stress:mixed
```

`VIVA_MIXED_SECONDS` defaults to 600 and accepts 60–1800. `VIVA_MIXED_LARGE_FIXTURE=0` selects the smaller preflight fixture. The server must use the same local database and a matching local authentication URL/secret; the runner only drops the explicitly named test database. External telemetry and email must be disabled or blocked when replaying locally.

Raw evidence is retained in `.local-bench/mixed-2026-10-06/`: the full JSON report, short preflight reports, legacy preflight report, resource samples/summary, five query plans, internal login-phase summary, PDF restriction probe, and server/build/test logs. These generated artifacts are intentionally gitignored.

Recommended next work is a complete PDF-freeze fix and measured tuning of the existing login/database paths, followed by the same workload on deployment-matched staging. A rewrite or new dependency is not justified by this evidence.

Suggested commit message: `test: add strict mixed-traffic viva stress scenario`
