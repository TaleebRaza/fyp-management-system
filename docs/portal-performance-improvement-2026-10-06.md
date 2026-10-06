# Portal performance changes and local retest — 6 October 2026

The approved fixes are implemented without new dependencies. The tables below show the observed changes on this local machine, including regressions. These results do not establish production capacity.

## What changed

- `getOrCreateRegistrationPolicy` first uses the existing read helper. Only a missing policy triggers initialization. Existing policy reads no longer write `updatedAt`; changed restrictions remain immediately visible.
- Student dashboard requests reuse one executed project query. The scheduling fallback now checks that project's sessions through a new index before reading rounds or panels. Snapshot-based and legacy schedules remain supported, and unconfirmed schedules remain hidden.
- The admin operational endpoint returns teams and examiners already selected for rounds. The existing setup UI explicitly requests the full catalogue, preserving program quotas and bulk selection. Switching sections cancels stale effect requests.
- The new `projectId, scheduledAt, _id` session index is declared in the model and the existing index audit/apply catalogue. No production index or data was changed.
- The existing stress runner now supports 75 active sessions, student writers and login bursts for the headroom test. Generated benchmark artifacts are excluded from lint.

Password cost, four password workers, the ten-connection application pool, authentication, rate limits, transactions and audit logging remained enabled and unchanged in the measured runs.

## Matched ten-minute local comparison

Both runs used production-mode Next.js, the same loopback MongoDB replica set and MinIO settings, 5,501 initial users, 2,500 initial projects, 75 scheduled sessions, 50 simultaneous start requests, 50 student writers and alternating 40/50-user login bursts. Names and batches changed once; joining, resetting and leaving repeated. The submissions switch stayed closed and no PDF files were transferred.

This is one before/final-after pair on a shared i5-8250U machine with 7.61 GiB RAM. Builds, unit tests and browser checks were kept outside measured load windows. The new index was initialized before load. The earlier ten-minute report is a different run; use this fresh baseline for the comparison.

p95 means 95% of measurements completed within that time. Login timing combines CSRF and credential callback, excluding the separately measured session-identity request and browser rendering.

| Operation | Before p95 | Final after p95 | Observed change |
| --- | ---: | ---: | ---: |
| Concurrent viva start | 1.50 s | 1.29 s | 13.9% lower |
| Login (CSRF + callback) | 10.81 s | 9.26 s | 14.4% lower |
| Student dashboard | 11.43 s | 7.38 s | 35.4% lower |
| Supervisor viva dashboard | 9.19 s | 4.45 s | 51.6% lower |
| Admin operational viva dashboard | 12.83 s | 13.54 s | 5.5% higher |
| Grade save | 12.50 s | 11.33 s | 9.3% lower |
| Name change | 9.24 s | 7.57 s | 18.0% lower |
| Batch change | 9.01 s | 4.37 s | 51.6% lower |
| Join team | 9.66 s | 7.01 s | 27.4% lower |
| Reset project | 4.03 s | 3.16 s | 21.4% lower |
| Leave team | 3.97 s | 3.34 s | 15.8% lower |

| Operation | Before median | Final after median |
| --- | ---: | ---: |
| Login (CSRF + callback) | 3.34 s | 3.22 s |
| Student dashboard | 4.19 s | 2.61 s |
| Grade save | 2.88 s | 2.42 s |
| Join team | 2.31 s | 1.78 s |
| Leave team | 1.07 s | 0.97 s |

The baseline served **22,774 actual mixed-phase HTTP requests** over 616.36 seconds, approximately **36.95/s**. The final run served **21,215** over 628.93 seconds, approximately **33.73/s**: **8.7% lower throughput**. The combined CSRF/callback metric is excluded from request totals because it does not issue additional requests.

The workload waits for responses before repeating, so completed request counts change as response times change. Elapsed times include final loop waits and in-flight work after the planned 600-second window. These are observed averages, not a fixed-arrival-rate capacity ceiling.

Both runs reported 0 and 0 unexpected HTTP responses respectively, and passed their data checks. The final run recorded 1,800 accepted grade saves with exactly matching audit events. Stale grades were rejected, competing joins had one winner, all 50 vivas completed, participant locks cleared, memberships remained unique, and supervisor capacity counters matched projects.

An intermediate ten-minute run reduced p95 for several operations but lowered aggregate throughput by 9.1%. It is retained as `after-first-pass`; it prompted the additional indexed scheduling shortcut. Variation between these runs reinforces that latency percentages are observations, not guaranteed gains.

## Fifty-percent headroom check

The final build ran **75 simultaneous viva starts**, **75 student writers** and **60/75-user login bursts**, with 5,551 initial users and 2,550 initial projects. The planned load window was 180 seconds and drained in 188.33 seconds. It served 9,452 actual mixed-phase HTTP requests, approximately 50.19/s.

Status: **passed**; unexpected HTTP responses: **0**. Accepted grade saves: 900. This short headroom check establishes only the observed local result, not ten-minute or full-day reliability at 75 sessions.

Its throughput should not be compared directly with the ten-minute runs: duration, login counts and workload mix differ.

| Operation | Headroom p95 | Headroom maximum |
| --- | ---: | ---: |
| Concurrent viva start | 1.63 s | 1.64 s |
| Login (CSRF + callback) | 5.76 s | 6.25 s |
| Student dashboard | 7.54 s | 8.88 s |
| Supervisor viva dashboard | 4.16 s | 6.27 s |
| Grade save | 7.86 s | 8.31 s |
| Join team | 8.43 s | 11.43 s |
| Reset project | 6.93 s | 8.09 s |
| Leave team | 5.21 s | 9.01 s |

## Verification and remaining limits

- Production webpack build and TypeScript checks passed; lint passed; all 74 unit-test files passed.
- Local integration checks passed: policy initialization, zero writes during concurrent reads of an existing policy, immediate restriction changes, full setup catalogue, reduced operational catalogue, legacy schedules, unconfirmed schedules, project reuse and empty-result short circuits.
- The new empty scheduling query used an index and examined zero unrelated documents in the regression fixture.
- Chromium verified setup → panels → schedule → setup with valid responses and no uncaught page errors. The retained fixture's full catalogue response was about 864 KB versus 82 KB operationally, approximately 90.5% fewer JSON bytes. This is uncompressed JSON size, not a browser-rendering benchmark.
- The previously reported PDF-closure bypass after a project reset remains a separate correctness issue. Closing the switch and sending no PDFs does not prove every upload path is blocked.
- Database tier limits, deployment network latency, cloud cold starts, PDF object deletion costs and full-day behavior remain outside this test. Settings should be tuned against deployment-matched staging measurements.

The source changes reduce unnecessary work, but response times in these tables remain the actual basis for judging responsiveness. Passing correctness checks alone does not mean the portal is comfortably fast under peak traffic.

The new session index is included in the existing `indexes:refactor:audit` and `indexes:refactor:apply` workflow. Review and build it during the normal deployment process before relying on the optimized lookup. No production deployment was performed.

## Artifacts and replay

Raw reports, comparison JSON, browser results/screenshots and source patch are in the gitignored `.local-bench/improvement-2026-10-06/` directory. The test server and dedicated synthetic database were cleaned up after verification.

With a production server configured for the same isolated local database and loopback authentication URL:

```bash
VIVA_STRESS_BASE_URL=http://localhost:3102 \
VIVA_STRESS_MONGODB_URI='mongodb://127.0.0.1:27017/fyp_viva_http_stress_test?replicaSet=rs0' \
VIVA_MIXED_SECONDS=600 \
VIVA_STRESS_ARTIFACT_DIR=.local-bench/replay-50 \
npm run test:viva:stress:mixed
```

For headroom, set `VIVA_MIXED_ACTIVE_SESSIONS=75` and `VIVA_MIXED_SECONDS=180`. The runner validates loopback and the dedicated database name, and drops only that synthetic database. Keep external telemetry and email blocked/disabled as in these runs.

Suggested commit message: `perf: reduce dashboard queries and viva admin payloads`
